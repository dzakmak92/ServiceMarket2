"""Invoices.

The database enforces the hard rules (gap-free numbering, immutability,
mandatory Leistungszeitpunkt). This layer enforces the ones that need
business context: which tax treatment applies, what a Schlussrechnung nets
off, and what a Storno mirrors.

Issuing runs inside a single transaction. That is not decoration — the
number is allocated by a trigger during the same statement, so if anything
later in the transaction fails, the counter rolls back with it and the
series stays gap-free. Splitting this across transactions is precisely the
defect the MongoDB build shipped.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional

from db import pg
from repositories import customers as customers_repo
from services import tax_rules

LINE_FIELDS = {
    "position", "kind", "description", "qty", "unit", "unit_price",
    "discount_pct", "tax_treatment", "vat_rate",
    "source_quote_line_id", "source_change_order_id",
}


def _d(v: Any) -> Decimal:
    return Decimal(str(v or 0))


async def _tax_context(pro_id: str, customer_id: Optional[str],
                       *, is_bauleistung: bool = False) -> tax_rules.TaxContext:
    pro = await pg.fetchrow(
        "select invoice_country, is_kleinunternehmer from pro_profiles where id = $1", pro_id)
    cust = None
    if customer_id:
        cust = await pg.fetchrow(
            "select country, type, vat_id, vat_id_validated_at, is_bauleister "
            "from customers where id = $1", customer_id)
    return tax_rules.TaxContext(
        supplier_country=(pro or {}).get("invoice_country") or "AT",
        customer_country=(cust or {}).get("country") or (pro or {}).get("invoice_country") or "AT",
        customer_is_business=((cust or {}).get("type") == "business"),
        customer_has_valid_vat_id=bool((cust or {}).get("vat_id_validated_at")),
        customer_is_bauleister=bool((cust or {}).get("is_bauleister")),
        supplier_is_kleinunternehmer=bool((pro or {}).get("is_kleinunternehmer")),
        is_bauleistung=is_bauleistung,
    )


async def create_draft(pro_id: str, *, job_id: Optional[str] = None,
                       customer_id: Optional[str] = None,
                       invoice_type: str = "standard",
                       lines: Optional[list[dict]] = None,
                       **fields) -> dict:
    """Create a draft and its lines. Drafts are freely editable; nothing is
    frozen and no number is consumed until issue()."""
    ctx = await _tax_context(pro_id, customer_id)
    allowed = {"service_date_start", "service_date_end", "due_date",
               "payment_terms_days", "note", "storno_of_id", "corrects_id"}
    payload: dict[str, Any] = {k: v for k, v in fields.items() if k in allowed and v is not None}
    payload.update({
        "pro_id": pro_id, "job_id": job_id, "customer_id": customer_id,
        "type": invoice_type, "status": "draft",
        "invoice_country": ctx.supplier_country,
        "is_kleinunternehmer": ctx.supplier_is_kleinunternehmer,
    })

    async with pg.transaction() as con:
        cols = list(payload)
        row = await con.fetchrow(
            f"insert into invoices ({', '.join(cols)}) "
            f"values ({pg.placeholders(len(cols))}) returning *",
            *payload.values(),
        )
        if lines:
            await _insert_lines(con, str(row["id"]), lines, ctx)
        return dict(row)


async def _insert_lines(con, invoice_id: str, lines: list[dict],
                        ctx: tax_rules.TaxContext) -> None:
    for i, raw in enumerate(lines, start=1):
        line = {k: v for k, v in raw.items() if k in LINE_FIELDS}
        line.setdefault("position", i)
        line.setdefault("kind", "labor")

        treatment = tax_rules.resolve_treatment(
            ctx, requested=line.get("tax_treatment"))
        line["tax_treatment"] = treatment
        # An explicit rate wins only when it is not a zero-rated treatment;
        # letting a caller put 20% on a §13b line would produce an illegal
        # invoice.
        if treatment in tax_rules.ZERO_RATED or "vat_rate" not in line:
            line["vat_rate"] = tax_rules.vat_rate(treatment, ctx.supplier_country)

        line["invoice_id"] = invoice_id
        cols = list(line)
        await con.execute(
            f"insert into invoice_lines ({', '.join(cols)}) "
            f"values ({pg.placeholders(len(cols))})",
            *line.values(),
        )


async def replace_lines(pro_id: str, invoice_id: str, lines: list[dict]) -> dict:
    inv = await get(pro_id, invoice_id)
    if not inv:
        raise LookupError("Invoice not found")
    if inv["status"] != "draft":
        raise PermissionError("Only a draft invoice can be edited. Issue a Storno instead.")
    ctx = await _tax_context(pro_id, str(inv["customer_id"]) if inv["customer_id"] else None)
    async with pg.transaction() as con:
        await con.execute("delete from invoice_lines where invoice_id = $1", invoice_id)
        await _insert_lines(con, invoice_id, lines, ctx)
    return await get(pro_id, invoice_id)


async def issue(pro_id: str, invoice_id: str, *,
                service_date_start=None, service_date_end=None,
                payment_terms_days: Optional[int] = None) -> dict:
    """Freeze and issue. One transaction, so the number is consumed only if
    the whole operation succeeds."""
    async with pg.transaction() as con:
        inv = await con.fetchrow(
            "select * from invoices where id = $1 and pro_id = $2 for update",
            invoice_id, pro_id)
        if not inv:
            raise LookupError("Invoice not found")
        if inv["status"] != "draft":
            raise PermissionError(f"Invoice {inv['invoice_number']} is already issued.")

        lines = await con.fetch(
            "select * from invoice_lines where invoice_id = $1 order by position", invoice_id)
        if not lines:
            raise ValueError("Cannot issue an invoice with no line items.")

        net = sum(_d(l["net_amount"]) for l in lines)
        vat = sum(_d(l["vat_amount"]) for l in lines)
        labor = sum(_d(l["net_amount"]) for l in lines if l["kind"] == "labor")
        material = sum(_d(l["net_amount"]) for l in lines if l["kind"] == "material")
        reverse_charge = any(l["tax_treatment"] == "reverse_charge_13b" for l in lines)

        # A Schlussrechnung nets off what was already invoiced and paid on
        # this job's Abschlagsrechnungen. Getting this wrong is the classic
        # manual error — the customer is billed twice for the same work.
        prior_net = prior_gross = Decimal(0)
        if inv["type"] == "schluss" and inv["job_id"]:
            prior = await con.fetchrow(
                """
                select coalesce(sum(net_total), 0) n, coalesce(sum(gross_total), 0) g
                  from invoices
                 where job_id = $1 and type = 'abschlag'
                   and status <> 'draft' and cancelled_at is null
                """,
                inv["job_id"])
            prior_net, prior_gross = _d(prior["n"]), _d(prior["g"])

        # Counterparty details frozen as they stand now.
        pro_snap = await con.fetchrow(
            "select p.*, u.name, u.email, u.phone from pro_profiles p "
            "join users u on u.id = p.user_id where p.id = $1", pro_id)
        cust_snap = None
        if inv["customer_id"]:
            cust_snap = await con.fetchrow(
                "select * from customers where id = $1", inv["customer_id"])

        import json
        def _j(rec):
            return json.dumps({k: str(v) if v is not None else None
                               for k, v in dict(rec).items()}) if rec else None

        terms = payment_terms_days or inv["payment_terms_days"] or 14
        issued = await con.fetchrow(
            """
            update invoices set
              status = 'issued',
              issue_date = current_date,
              service_date_start = coalesce($3, service_date_start, current_date),
              service_date_end   = coalesce($4, service_date_end),
              due_date = current_date + $5::int,
              payment_terms_days = $5::int,
              net_total = $6, vat_total = $7, gross_total = $8,
              labor_net = $9, material_net = $10,
              has_reverse_charge = $11,
              prior_payments_net = $12, prior_payments_gross = $13,
              pro_snapshot = $14::jsonb, customer_snapshot = $15::jsonb
            where id = $1 and pro_id = $2
            returning *
            """,
            invoice_id, pro_id, service_date_start, service_date_end, terms,
            net, vat, net + vat, labor, material, reverse_charge,
            prior_net, prior_gross, _j(pro_snap), _j(cust_snap),
        )

    if issued and issued["customer_id"]:
        await customers_repo.refresh_rollups(str(issued["customer_id"]))
    return dict(issued)


async def storno(pro_id: str, invoice_id: str, reason: str) -> dict:
    """Issue a credit note mirroring the original with negative amounts.

    An issued invoice is never edited or deleted; it is cancelled by a
    documented Storno that nets it out. Both remain in the series.
    """
    async with pg.transaction() as con:
        orig = await con.fetchrow(
            "select * from invoices where id = $1 and pro_id = $2 for update",
            invoice_id, pro_id)
        if not orig:
            raise LookupError("Invoice not found")
        if orig["status"] == "draft":
            raise ValueError("A draft has no legal effect — delete it instead of stornoing.")
        if orig["type"] == "storno":
            raise ValueError("Cannot storno a Storno.")
        if orig["cancelled_by_storno_id"]:
            raise ValueError("This invoice has already been cancelled by a Storno.")

        lines = await con.fetch(
            "select * from invoice_lines where invoice_id = $1 order by position", invoice_id)

        st = await con.fetchrow(
            """
            insert into invoices (pro_id, job_id, customer_id, type, status,
              issue_date, service_date_start, service_date_end,
              invoice_country, is_kleinunternehmer,
              net_total, vat_total, gross_total, labor_net, material_net,
              has_reverse_charge, storno_of_id, storno_reason,
              pro_snapshot, customer_snapshot, payment_terms_days, note)
            values ($1,$2,$3,'storno','issued',current_date,$4,$5,$6,$7,
                    $8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,0,$18)
            returning *
            """,
            pro_id, orig["job_id"], orig["customer_id"],
            orig["service_date_start"], orig["service_date_end"],
            orig["invoice_country"], orig["is_kleinunternehmer"],
            -_d(orig["net_total"]), -_d(orig["vat_total"]), -_d(orig["gross_total"]),
            -_d(orig["labor_net"]), -_d(orig["material_net"]),
            orig["has_reverse_charge"], orig["id"], (reason or "").strip()[:500],
            orig["pro_snapshot"], orig["customer_snapshot"],
            f"Stornorechnung zu {orig['invoice_number']}",
        )

        for l in lines:
            await con.execute(
                """
                insert into invoice_lines (invoice_id, position, kind, description,
                  qty, unit, unit_price, discount_pct, tax_treatment, vat_rate)
                values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                """,
                st["id"], l["position"], l["kind"], f"Storno: {l['description']}"[:300],
                l["qty"], l["unit"], -_d(l["unit_price"]), l["discount_pct"],
                l["tax_treatment"], l["vat_rate"],
            )

        # Permitted by the immutability trigger — these columns are in its
        # mutable set precisely so an invoice can be cancelled without editing.
        await con.execute(
            "update invoices set cancelled_by_storno_id = $2, cancelled_at = now(), "
            "status = 'cancelled', storno_reason = $3 where id = $1",
            invoice_id, st["id"], (reason or "").strip()[:500])

    return dict(st)


async def get(pro_id: str, invoice_id: str) -> Optional[dict]:
    inv = await pg.fetchrow(
        "select * from invoices where id = $1 and pro_id = $2", invoice_id, pro_id)
    if inv:
        inv["lines"] = await pg.fetch(
            "select * from invoice_lines where invoice_id = $1 order by position", invoice_id)
        inv["payments"] = await pg.fetch(
            "select * from invoice_payments where invoice_id = $1 order by paid_on", invoice_id)
        inv["legal_notes"] = sorted({
            n for n in (tax_rules.legal_note(l["tax_treatment"], inv["invoice_country"])
                        for l in inv["lines"]) if n})
    return inv


async def list_for_pro(pro_id: str, *, status: Optional[str] = None,
                       payment_state: Optional[str] = None,
                       job_id: Optional[str] = None, customer_id: Optional[str] = None,
                       limit: int = 50, offset: int = 0) -> dict:
    where = ["i.pro_id = $1"]
    args: list[Any] = [pro_id]
    for col, val, cast in (("status", status, "::invoice_status"),
                           ("payment_state", payment_state, "::payment_state"),
                           ("job_id", job_id, ""), ("customer_id", customer_id, "")):
        if val:
            args.append(val)
            where.append(f"i.{col} = ${len(args)}{cast}")
    clause = " and ".join(where)
    total = await pg.fetchval(f"select count(*) from invoices i where {clause}", *args)
    args.extend([limit, offset])
    rows = await pg.fetch(
        f"""
        select i.*, c.name as customer_name, j.job_number, j.title as job_title
          from invoices i
          left join customers c on c.id = i.customer_id
          left join jobs j on j.id = i.job_id
         where {clause}
         order by i.issue_date desc nulls first, i.created_at desc
         limit ${len(args)-1} offset ${len(args)}
        """, *args)
    return {"invoices": rows, "total": total}


async def record_payment(pro_id: str, invoice_id: str, data: dict) -> dict:
    inv = await pg.fetchrow(
        "select id, status from invoices where id = $1 and pro_id = $2", invoice_id, pro_id)
    if not inv:
        raise LookupError("Invoice not found")
    if inv["status"] == "draft":
        raise ValueError("Issue the invoice before recording a payment against it.")

    allowed = {"amount", "method", "paid_on", "reference", "note", "beleg_ref", "psp_session_id"}
    payload = {k: v for k, v in data.items() if k in allowed and v is not None}
    payload["invoice_id"] = invoice_id
    sql, args = pg.build_insert("invoice_payments", payload)
    pay = await pg.fetchrow(sql, *args)

    row = await pg.fetchrow("select customer_id from invoices where id = $1", invoice_id)
    if row and row["customer_id"]:
        await customers_repo.refresh_rollups(str(row["customer_id"]))
    return pay


async def delete_payment(pro_id: str, invoice_id: str, payment_id: str) -> bool:
    row = await pg.fetchrow(
        """
        delete from invoice_payments p
         using invoices i
         where p.id = $1 and p.invoice_id = $2 and i.id = p.invoice_id and i.pro_id = $3
        returning p.id
        """,
        payment_id, invoice_id, pro_id)
    return row is not None


async def overdue_for_pro(pro_id: str) -> list[dict]:
    """Feeds the dunning ladder (Phase 7). Needs no PSP: a reminder email
    with the existing EPC-QR PDF attached is already actionable."""
    return await pg.fetch(
        """
        select i.*, c.name as customer_name, c.email as customer_email,
               current_date - i.due_date as days_overdue
          from invoices i
          left join customers c on c.id = i.customer_id
         where i.pro_id = $1
           and i.status <> 'draft' and i.cancelled_at is null
           and i.payment_state in ('unpaid','partial','overdue')
           and i.due_date < current_date
         order by i.due_date
        """, pro_id)
