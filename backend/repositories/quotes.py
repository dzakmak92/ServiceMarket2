"""Quotes.

The wedge. The marketplace had a *bid* — one price, a message, no line items,
no document — so its "quote → invoice pre-fill" could only collapse an entire
quote into a single invoice line. The doc is blunt that this link is the
product: if the tradesperson retypes the invoice, you have shipped three
disconnected tools.

Here a quote is a line-itemed document that an invoice inherits position by
position, carrying `kind` (for the §35a split) and `tax_treatment` with it,
and recording `source_quote_line_id` so the trail back is never lost.

Tiering is sibling rows sharing `group_id`. Revisions create a new `version`
and supersede the old one rather than mutating it.
"""
from __future__ import annotations

import logging

from typing import Any, Optional

from db import pg
from repositories import customers as customers_repo
from repositories import rates as rates_repo
from services import tax_rules

logger = logging.getLogger(__name__)

LINE_FIELDS = {
    "position", "kind", "description", "detail", "qty", "unit", "unit_price",
    "waste_factor", "discount_pct", "tax_treatment", "vat_rate",
    "is_optional", "is_selected",
    # The join back to pro_rates. The estimator has always produced one per
    # position and this set silently dropped it, which cut the link at exactly
    # the point it became worth something — the accepted quote.
    "rate_key",
}
QUOTE_FIELDS = {
    "title", "intro", "assumptions", "valid_until", "discount_pct",
    "template_id", "ai_sources", "ai_confidence",
}
TIERS = ("basic", "standard", "premium")


async def _tax_context(pro_id: str, customer_id: Optional[str]) -> tax_rules.TaxContext:
    pro = await pg.fetchrow(
        "select invoice_country, is_kleinunternehmer from pro_profiles where id = $1", pro_id)
    cust = None
    if customer_id:
        cust = await pg.fetchrow(
            "select country, type, vat_id_validated_at, is_bauleister "
            "from customers where id = $1", customer_id)
    return tax_rules.TaxContext(
        supplier_country=(pro or {}).get("invoice_country") or "AT",
        customer_country=(cust or {}).get("country") or (pro or {}).get("invoice_country") or "AT",
        customer_is_business=((cust or {}).get("type") == "business"),
        customer_has_valid_vat_id=bool((cust or {}).get("vat_id_validated_at")),
        customer_is_bauleister=bool((cust or {}).get("is_bauleister")),
        supplier_is_kleinunternehmer=bool((pro or {}).get("is_kleinunternehmer")),
    )


async def _insert_lines(con, quote_id: str, lines: list[dict],
                        ctx: tax_rules.TaxContext) -> None:
    for i, raw in enumerate(lines, start=1):
        line = {k: v for k, v in raw.items() if k in LINE_FIELDS}
        line.setdefault("position", i)
        line.setdefault("kind", "labor")
        treatment = tax_rules.resolve_treatment(ctx, requested=line.get("tax_treatment"))
        line["tax_treatment"] = treatment
        if treatment in tax_rules.ZERO_RATED or "vat_rate" not in line:
            line["vat_rate"] = tax_rules.vat_rate(treatment, ctx.supplier_country)
        line["quote_id"] = quote_id
        cols = list(line)
        await con.execute(
            f"insert into quote_lines ({', '.join(cols)}) "
            f"values ({pg.placeholders(len(cols))})", *line.values())


async def create(pro_id: str, job_id: str, *, lines: Optional[list[dict]] = None,
                 tier: str = "standard", group_id: Optional[str] = None,
                 **fields) -> dict:
    job = await pg.fetchrow(
        "select id, customer_id from jobs where id = $1 and pro_id = $2 and deleted_at is null",
        job_id, pro_id)
    if not job:
        raise LookupError("Job not found")
    if tier not in TIERS:
        raise ValueError(f"tier must be one of {TIERS}")

    ctx = await _tax_context(pro_id, str(job["customer_id"]) if job["customer_id"] else None)
    payload: dict[str, Any] = {k: v for k, v in fields.items() if k in QUOTE_FIELDS and v is not None}
    payload.update({"pro_id": pro_id, "job_id": job_id,
                    "customer_id": job["customer_id"], "tier": tier})
    if group_id:
        payload["group_id"] = group_id

    async with pg.transaction() as con:
        cols = list(payload)
        q = await con.fetchrow(
            f"insert into quotes ({', '.join(cols)}) "
            f"values ({pg.placeholders(len(cols))}) returning *", *payload.values())
        if lines:
            await _insert_lines(con, str(q["id"]), lines, ctx)
    return await get(pro_id, str(q["id"]))


async def create_tiers(pro_id: str, job_id: str, tiers: dict[str, list[dict]],
                       **fields) -> list[dict]:
    """Produce Basic/Standard/Premium in one call.

    The doc's escape from pure price comparison: three options reframe the
    conversation from "who is cheapest" to "which of these do I want", which
    matters most for Maler where a single lead attracts eight quotes.
    """
    group_id = None
    out = []
    for tier in TIERS:
        if tier not in tiers:
            continue
        q = await create(pro_id, job_id, lines=tiers[tier], tier=tier,
                         group_id=group_id, **fields)
        group_id = group_id or str(q["group_id"])
        out.append(q)
    return out


async def get(pro_id: str, quote_id: str) -> Optional[dict]:
    q = await pg.fetchrow(
        "select * from quotes where id = $1 and pro_id = $2", quote_id, pro_id)
    if q:
        q["lines"] = await pg.fetch(
            "select * from quote_lines where quote_id = $1 order by position", quote_id)
    return q


async def get_by_share_token(token: str) -> Optional[dict]:
    """Customer-portal view. Token-scoped, not pro-scoped: returns the sent
    tiers for the job so the customer can compare and pick one."""
    job = await pg.fetchrow(
        "select id, pro_id, customer_id, title from jobs "
        "where share_token = $1 and deleted_at is null", token)
    if not job:
        return None
    quotes = await pg.fetch(
        "select * from quotes where job_id = $1 "
        "and status in ('sent','viewed','negotiating','accepted') "
        "order by case tier when 'basic' then 0 when 'standard' then 1 else 2 end",
        job["id"])
    for q in quotes:
        q["lines"] = await pg.fetch(
            "select * from quote_lines where quote_id = $1 order by position", q["id"])
    return {"job": job, "quotes": quotes}


async def replace_lines(pro_id: str, quote_id: str, lines: list[dict]) -> dict:
    q = await get(pro_id, quote_id)
    if not q:
        raise LookupError("Quote not found")
    if q["status"] not in ("draft", "sent", "viewed", "negotiating"):
        raise PermissionError(
            f"A {q['status']} quote cannot be edited. Create a revision instead.")
    ctx = await _tax_context(pro_id, str(q["customer_id"]) if q["customer_id"] else None)
    async with pg.transaction() as con:
        await con.execute("delete from quote_lines where quote_id = $1", quote_id)
        await _insert_lines(con, quote_id, lines, ctx)
    return await get(pro_id, quote_id)


async def revise(pro_id: str, quote_id: str, *, lines: Optional[list[dict]] = None,
                 **fields) -> dict:
    """Create version N+1 and supersede N.

    A customer asking for a change must not silently rewrite the document
    they were already sent — both versions stay, and which one they saw
    remains answerable.
    """
    old = await get(pro_id, quote_id)
    if not old:
        raise LookupError("Quote not found")
    if old["status"] == "accepted":
        raise PermissionError("An accepted quote cannot be revised — raise a Nachtrag instead.")

    ctx = await _tax_context(pro_id, str(old["customer_id"]) if old["customer_id"] else None)
    payload = {k: v for k, v in fields.items() if k in QUOTE_FIELDS and v is not None}
    for k in ("title", "intro", "assumptions", "valid_until", "discount_pct", "template_id"):
        payload.setdefault(k, old[k])
    payload.update({
        "pro_id": pro_id, "job_id": old["job_id"], "customer_id": old["customer_id"],
        "group_id": old["group_id"], "tier": old["tier"],
        "version": old["version"] + 1, "supersedes_id": old["id"],
    })
    payload = {k: v for k, v in payload.items() if v is not None}

    async with pg.transaction() as con:
        cols = list(payload)
        new = await con.fetchrow(
            f"insert into quotes ({', '.join(cols)}) "
            f"values ({pg.placeholders(len(cols))}) returning *", *payload.values())
        await _insert_lines(con, str(new["id"]), lines if lines is not None else old["lines"], ctx)
        await con.execute(
            "update quotes set status = 'superseded' where id = $1", quote_id)
    return await get(pro_id, str(new["id"]))


async def mark_sent(pro_id: str, quote_id: str) -> Optional[dict]:
    return await pg.fetchrow(
        "update quotes set status = 'sent', sent_at = coalesce(sent_at, now()) "
        "where id = $1 and pro_id = $2 and status in ('draft','sent') returning *",
        quote_id, pro_id)


async def mark_viewed(quote_id: str) -> None:
    """Called from the customer portal. Time-to-first-view is one of the
    metrics the doc wants instrumented from day one."""
    await pg.execute(
        "update quotes set status = case when status = 'sent' then 'viewed' else status end, "
        "first_viewed_at = coalesce(first_viewed_at, now()), "
        "viewed_count = viewed_count + 1 where id = $1", quote_id)


async def accept(quote_id: str, *, pro_id: Optional[str] = None) -> dict:
    """Accept a quote. Reachable from the pro side (verbal acceptance on site)
    and from the customer portal, hence the optional pro scope.

    Siblings in the group are superseded, and the job moves to `accepted` —
    the hinge the doc describes, where acceptance is what creates the job and
    later triggers the deposit request.
    """
    async with pg.transaction() as con:
        if pro_id:
            q = await con.fetchrow(
                "select * from quotes where id = $1 and pro_id = $2 for update", quote_id, pro_id)
        else:
            q = await con.fetchrow("select * from quotes where id = $1 for update", quote_id)
        if not q:
            raise LookupError("Quote not found")
        if q["status"] == "accepted":
            return dict(q)
        if q["status"] in ("expired", "superseded", "rejected"):
            raise ValueError(f"A {q['status']} quote cannot be accepted.")

        accepted = await con.fetchrow(
            "update quotes set status = 'accepted', decided_at = now() "
            "where id = $1 returning *", quote_id)
        # Losing tiers are superseded, not rejected: the customer chose, they
        # did not decline.
        await con.execute(
            "update quotes set status = 'superseded' "
            "where group_id = $1 and id <> $2 and status not in ('accepted','superseded')",
            q["group_id"], quote_id)
        await con.execute(
            "update jobs set status = 'accepted', contract_amount = $2 "
            "where id = $1 and status in ('lead','quoted')",
            q["job_id"], q["gross_total"])

        # Acceptance is the moment a price stops being an opinion. Inside the
        # transaction on purpose: a quote accepted without its rates learned
        # is a silent half-commit, and the next accept returns early because
        # the quote is already accepted, so the sample would be lost for good.
        try:
            await rates_repo.learn_from_quote(con, str(q["pro_id"]), quote_id)
        except Exception:  # noqa: BLE001
            # Never at the cost of the acceptance itself. A lost rate sample
            # costs a slightly worse estimate next month; a failed acceptance
            # costs the pro the job they just won on the doorstep.
            logger.exception("rate learning failed for quote %s", quote_id)

    if accepted["customer_id"]:
        await customers_repo.refresh_rollups(str(accepted["customer_id"]))
    return dict(accepted)


async def reject(quote_id: str, reason: str = "", *, pro_id: Optional[str] = None) -> dict:
    args = [quote_id, (reason or "").strip()[:500]]
    scope = ""
    if pro_id:
        args.append(pro_id)
        scope = " and pro_id = $3"
    row = await pg.fetchrow(
        f"update quotes set status = 'rejected', decided_at = now(), reject_reason = $2 "
        f"where id = $1{scope} and status in ('sent','viewed','negotiating','draft') returning *",
        *args)
    if not row:
        raise LookupError("Quote not found or not in a rejectable state")
    return row


async def expire_stale(pro_id: Optional[str] = None) -> int:
    """Flip past-validity quotes to expired. Feeds the follow-up nudge."""
    sql = ("update quotes set status = 'expired' "
           "where status in ('sent','viewed','negotiating') "
           "and valid_until is not null and valid_until < current_date")
    args: list[Any] = []
    if pro_id:
        args.append(pro_id)
        sql += " and pro_id = $1"
    res = await pg.execute(sql, *args)
    return int(res.split()[-1]) if res and res.split()[-1].isdigit() else 0


async def list_for_pro(pro_id: str, *, job_id: Optional[str] = None,
                       status: Optional[str] = None, limit: int = 50,
                       offset: int = 0) -> dict:
    where = ["q.pro_id = $1"]
    args: list[Any] = [pro_id]
    if job_id:
        args.append(job_id)
        where.append(f"q.job_id = ${len(args)}")
    if status:
        args.append(status)
        where.append(f"q.status = ${len(args)}::quote_status")
    clause = " and ".join(where)
    total = await pg.fetchval(f"select count(*) from quotes q where {clause}", *args)
    args.extend([limit, offset])
    rows = await pg.fetch(
        f"""
        select q.*, c.name as customer_name, j.job_number, j.title as job_title
          from quotes q
          left join customers c on c.id = q.customer_id
          left join jobs j on j.id = q.job_id
         where {clause}
         order by q.created_at desc
         limit ${len(args)-1} offset ${len(args)}
        """, *args)
    return {"quotes": rows, "total": total}


# ══════════════════════════════════════════════════════════════════════
# Quote → Invoice
# ══════════════════════════════════════════════════════════════════════

async def to_invoice_lines(pro_id: str, job_id: str) -> list[dict]:
    """Every line the invoice should inherit for this job.

    Two sources, both mandatory:
      1. the accepted quote's selected lines
      2. approved change orders not yet invoiced

    (2) is the doc's biggest silent margin leak — extras agreed verbally on
    site and never billed. Because the CO carries its own kind and rate, it
    lands on the invoice with the right §35a classification rather than as a
    lump "extras" line.
    """
    quote = await pg.fetchrow(
        "select * from quotes where job_id = $1 and pro_id = $2 and status = 'accepted'",
        job_id, pro_id)

    lines: list[dict] = []
    if quote:
        qlines = await pg.fetch(
            "select * from quote_lines where quote_id = $1 "
            "and (is_selected or not is_optional) order by position", quote["id"])
        for l in qlines:
            lines.append({
                "position": l["position"],
                "kind": l["kind"],
                "description": l["description"],
                # Verschnitt is folded into the billed quantity: the customer
                # is charged for material actually consumed, and the quote
                # already showed it.
                "qty": float(l["qty"]) * (1 + float(l["waste_factor"] or 0)),
                "unit": l["unit"],
                "unit_price": l["unit_price"],
                "discount_pct": l["discount_pct"],
                "tax_treatment": l["tax_treatment"],
                "vat_rate": l["vat_rate"],
                "source_quote_line_id": str(l["id"]),
            })

    # Joined to `jobs` on pro_id, not scoped by job_id alone. The accepted
    # quote above is already scoped, so an unscoped change-order query was the
    # one line through which any authenticated pro who knew a job UUID could
    # read another business's Nachtrag titles and amounts — via
    # /jobs/{id}/invoice-preview, which does not otherwise check ownership.
    cos = await pg.fetch(
        "select c.* from change_orders c join jobs j on j.id = c.job_id "
        "where c.job_id = $1 and j.pro_id = $2 and c.status = 'approved' "
        "order by c.created_at", job_id, pro_id)
    for i, co in enumerate(cos, start=len(lines) + 1):
        lines.append({
            "position": i,
            "kind": co["kind"],
            "description": f"Nachtrag: {co['title']}",
            "qty": 1,
            "unit": "pcs",
            "unit_price": co["net_amount"],
            "vat_rate": co["vat_rate"],
            "source_change_order_id": str(co["id"]),
        })
    return lines


async def draft_invoice_from_job(pro_id: str, job_id: str, *,
                                 invoice_type: str = "standard") -> dict:
    """Build a draft invoice pre-filled from the accepted quote + Nachträge.

    This is the link the doc calls the product. The marketplace build could
    only manage `{title} — {category}`, qty 1, unit_net = the whole total,
    because its quotes had no lines to inherit.
    """
    from repositories import invoices as invoices_repo

    job = await pg.fetchrow(
        "select * from jobs where id = $1 and pro_id = $2 and deleted_at is null",
        job_id, pro_id)
    if not job:
        raise LookupError("Job not found")

    lines = await to_invoice_lines(pro_id, job_id)
    if not lines:
        raise ValueError(
            "Nothing to invoice: this job has no accepted quote and no approved change orders.")

    inv = await invoices_repo.create_draft(
        pro_id, job_id=job_id, customer_id=str(job["customer_id"]) if job["customer_id"] else None,
        invoice_type=invoice_type, lines=lines,
        service_date_start=job.get("started_at") or job.get("created_at"),
        service_date_end=job.get("completed_at"),
    )

    # Mark the change orders invoiced so the next invoice cannot bill them
    # again. Same guard the Mongo build had, kept deliberately.
    co_ids = [l["source_change_order_id"] for l in lines if l.get("source_change_order_id")]
    if co_ids:
        await pg.execute(
            "update change_orders set status = 'invoiced' where id = any($1::uuid[])", co_ids)

    return await invoices_repo.get(pro_id, str(inv["id"]))
