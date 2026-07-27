"""Tax reporting: USt-VA, EÜR, DATEV export.

The Mongo build inferred the VAT breakdown from a single invoice-level rate.
With per-position `vat_rate` and `tax_treatment` the return is now computed
from the positions themselves, so a mixed invoice reports correctly and
§13b turnover lands in its own box instead of being folded into standard.

Storno invoices are included with their negative amounts and net themselves
out — that is the whole point of cancelling by credit note rather than by
deletion.
"""
from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal
from typing import Any, Optional

from db import pg

# The five categories a tradesperson's expenses actually fall into, plus a
# catch-all. Kept short on purpose: a long list means everything lands in
# "Sonstige".
EXPENSE_CATEGORIES = [
    "Material", "Werkzeug", "Fahrzeug", "Treibstoff", "Werbung",
    "Büro", "Telefon", "Versicherung", "Miete", "Fortbildung",
    "Bewirtung", "Anlagen", "Sonstige",
]


def _period(year: int, month: Optional[int] = None,
            quarter: Optional[int] = None) -> tuple[date, date]:
    if month:
        start = date(year, month, 1)
        end = date(year + (month // 12), (month % 12) + 1, 1)
    elif quarter:
        m = (quarter - 1) * 3 + 1
        start = date(year, m, 1)
        end = date(year + (1 if m + 3 > 12 else 0), ((m + 2) % 12) + 1, 1)
    else:
        start, end = date(year, 1, 1), date(year + 1, 1, 1)
    return start, end


async def ust_va(pro_id: str, year: int, *, month: Optional[int] = None,
                 quarter: Optional[int] = None) -> dict:
    """Umsatzsteuer-Voranmeldung for a period.

    Output turnover is grouped by rate from the invoice LINES. Input VAT
    comes from expenses flagged deductible — a Kassabon without a supplier
    UID above the small-amount threshold is not a valid basis for reclaim,
    which is why that flag exists rather than assuming every receipt counts.
    """
    start, end = _period(year, month, quarter)

    rows = await pg.fetch(
        """
        select l.vat_rate,
               l.tax_treatment::text as treatment,
               sum(l.net_amount) as net,
               sum(l.vat_amount) as vat
          from invoice_lines l
          join invoices i on i.id = l.invoice_id
         where i.pro_id = $1
           and i.status <> 'draft'
           and i.issue_date >= $2 and i.issue_date < $3
         group by l.vat_rate, l.tax_treatment
         order by l.vat_rate desc
        """,
        pro_id, start, end)

    out_net = sum(Decimal(str(r["net"])) for r in rows)
    out_vat = sum(Decimal(str(r["vat"])) for r in rows)

    inp = await pg.fetchrow(
        """
        select coalesce(sum(net_amount), 0) as net,
               coalesce(sum(vat_amount), 0) as vat
          from expenses
         where pro_id = $1 and vat_deductible
           and expense_date >= $2 and expense_date < $3
        """,
        pro_id, start, end)
    in_vat = Decimal(str(inp["vat"]))

    # §13b turnover is reported by the supplier but carries no VAT — it needs
    # its own line on the return, not silent inclusion in the standard band.
    reverse_charge_net = sum(
        Decimal(str(r["net"])) for r in rows if r["treatment"] == "reverse_charge_13b")
    zero_rated_net = sum(
        Decimal(str(r["net"])) for r in rows
        if r["treatment"] in ("intra_eu", "export"))

    return {
        "period": {"year": year, "month": month, "quarter": quarter,
                   "from": start.isoformat(), "to": end.isoformat()},
        "by_rate": [
            {"vat_rate": float(r["vat_rate"]), "treatment": r["treatment"],
             "net": float(r["net"]), "vat": float(r["vat"])}
            for r in rows
        ],
        "output_net": float(out_net),
        "output_vat": float(out_vat),
        "reverse_charge_net": float(reverse_charge_net),
        "zero_rated_net": float(zero_rated_net),
        "input_net": float(inp["net"]),
        "input_vat": float(in_vat),
        "payable": float(out_vat - in_vat),
    }


async def eur(pro_id: str, year: int) -> dict:
    """Einnahmen-Ausgaben-Rechnung (AT) / EÜR (DE) — cash-basis P&L.

    Income is what was actually PAID in the year, not what was invoiced.
    A tradesperson on cash-basis accounting who reports issued invoices
    overstates a year in which a December invoice is settled in January.
    """
    start, end = _period(year)

    income = await pg.fetchrow(
        """
        select coalesce(sum(p.amount), 0) as gross
          from invoice_payments p
          join invoices i on i.id = p.invoice_id
         where i.pro_id = $1 and p.paid_on >= $2 and p.paid_on < $3
        """, pro_id, start, end)

    # Net out the VAT collected on those payments, proportionally.
    ratio = await pg.fetchrow(
        """
        select coalesce(sum(net_total), 0) as net, coalesce(sum(gross_total), 0) as gross
          from invoices
         where pro_id = $1 and status <> 'draft'
           and issue_date >= $2 and issue_date < $3
        """, pro_id, start, end)
    g = Decimal(str(ratio["gross"] or 0))
    net_ratio = (Decimal(str(ratio["net"] or 0)) / g) if g else Decimal(1)
    income_net = Decimal(str(income["gross"])) * net_ratio

    expenses = await pg.fetch(
        """
        select category, coalesce(sum(net_amount), 0) as net,
               coalesce(sum(gross_amount), 0) as gross, count(*) as n
          from expenses
         where pro_id = $1 and expense_date >= $2 and expense_date < $3
         group by category order by 2 desc
        """, pro_id, start, end)

    exp_net = sum(Decimal(str(e["net"])) for e in expenses)
    return {
        "year": year,
        "income_gross": float(income["gross"]),
        "income_net": float(round(income_net, 2)),
        "expenses_net": float(exp_net),
        "profit": float(round(income_net - exp_net, 2)),
        "by_category": [
            {"category": e["category"], "net": float(e["net"]),
             "gross": float(e["gross"]), "count": int(e["n"])}
            for e in expenses
        ],
    }


async def datev_csv(pro_id: str, year: int) -> str:
    """DATEV-shaped export for the Steuerberater.

    Nearly every DACH tradesperson's accountant expects DATEV. The doc lists
    a clean export as a strong retention feature — the pro's accountant
    becomes an advocate for keeping the software.

    Column names are German because that is what the accountant's import
    mapping expects.
    """
    start, end = _period(year)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Umsatz", "Soll_Haben", "Belegdatum", "Belegfeld1",
                "Buchungstext", "Konto", "Gegenkonto", "USt_Prozent",
                "USt_Betrag", "Leistungsdatum", "Typ"])

    invoices = await pg.fetch(
        """
        select i.invoice_number, i.issue_date, i.service_date_start,
               i.gross_total, i.net_total, i.vat_total, i.type::text as t,
               coalesce(c.name, c.company_name, '') as customer
          from invoices i
          left join customers c on c.id = i.customer_id
         where i.pro_id = $1 and i.status <> 'draft'
           and i.issue_date >= $2 and i.issue_date < $3
         order by i.issue_date, i.invoice_number
        """, pro_id, start, end)
    for r in invoices:
        pct = (Decimal(str(r["vat_total"])) / Decimal(str(r["net_total"])) * 100
               ) if Decimal(str(r["net_total"] or 0)) else Decimal(0)
        w.writerow([
            f"{r['gross_total']:.2f}".replace(".", ","),
            "S", r["issue_date"].strftime("%d%m%Y") if r["issue_date"] else "",
            r["invoice_number"], f"{r['t']} {r['customer']}"[:60],
            "8400", "1200", f"{pct:.0f}",
            f"{r['vat_total']:.2f}".replace(".", ","),
            r["service_date_start"].strftime("%d%m%Y") if r["service_date_start"] else "",
            "Rechnung",
        ])

    expenses = await pg.fetch(
        """
        select expense_date, vendor, category, gross_amount, vat_amount, vat_rate
          from expenses
         where pro_id = $1 and expense_date >= $2 and expense_date < $3
         order by expense_date
        """, pro_id, start, end)
    for r in expenses:
        w.writerow([
            f"{r['gross_amount']:.2f}".replace(".", ","),
            "H", r["expense_date"].strftime("%d%m%Y"), "",
            f"{r['category']} {r['vendor'] or ''}"[:60],
            "4980", "1200", f"{r['vat_rate']:.0f}",
            f"{r['vat_amount']:.2f}".replace(".", ","),
            r["expense_date"].strftime("%d%m%Y"), "Beleg",
        ])
    return buf.getvalue()


# ── Expenses ───────────────────────────────────────────────────────────
EXPENSE_FIELDS = {
    "job_id", "expense_date", "vendor", "category", "description",
    "net_amount", "vat_rate", "vat_amount", "gross_amount", "payment_method",
    "vat_deductible", "storage_ref", "filename", "ocr_confidence", "ocr_raw",
    "needs_review",
}

# Below this the OCR parse is shown to the pro for confirmation rather than
# silently trusted. A confidently wrong receipt quietly corrupts the books.
OCR_REVIEW_THRESHOLD = 0.75


async def create_expense(pro_id: str, data: dict) -> dict:
    payload = {k: v for k, v in data.items() if k in EXPENSE_FIELDS and v is not None}
    payload["pro_id"] = pro_id

    # Derive whichever of net/vat/gross was not supplied.
    gross = Decimal(str(payload.get("gross_amount") or 0))
    net = Decimal(str(payload.get("net_amount") or 0))
    rate = Decimal(str(payload.get("vat_rate", 20)))
    if gross and not net:
        net = (gross / (1 + rate / 100)).quantize(Decimal("0.01"))
        payload["net_amount"] = net
    elif net and not gross:
        gross = (net * (1 + rate / 100)).quantize(Decimal("0.01"))
        payload["gross_amount"] = gross
    if "vat_amount" not in payload:
        payload["vat_amount"] = (gross - net).quantize(Decimal("0.01"))

    conf = payload.get("ocr_confidence")
    if conf is not None and float(conf) < OCR_REVIEW_THRESHOLD:
        payload["needs_review"] = True

    sql, args = pg.build_insert("expenses", payload)
    return await pg.fetchrow(sql, *args)


async def list_expenses(pro_id: str, *, year: Optional[int] = None,
                        category: Optional[str] = None, needs_review: Optional[bool] = None,
                        limit: int = 100, offset: int = 0) -> dict:
    where = ["pro_id = $1"]
    args: list[Any] = [pro_id]
    if year:
        args.extend([date(year, 1, 1), date(year + 1, 1, 1)])
        where.append(f"expense_date >= ${len(args)-1} and expense_date < ${len(args)}")
    if category:
        args.append(category)
        where.append(f"category = ${len(args)}")
    if needs_review is not None:
        where.append("needs_review" if needs_review else "not needs_review")
    clause = " and ".join(where)
    total = await pg.fetchval(f"select count(*) from expenses where {clause}", *args)
    args.extend([limit, offset])
    rows = await pg.fetch(
        f"select * from expenses where {clause} order by expense_date desc "
        f"limit ${len(args)-1} offset ${len(args)}", *args)
    return {"expenses": rows, "total": total}


async def update_expense(pro_id: str, expense_id: str, data: dict) -> Optional[dict]:
    payload = {k: v for k, v in data.items() if k in EXPENSE_FIELDS and v is not None}
    if not payload:
        return await pg.fetchrow(
            "select * from expenses where id = $1 and pro_id = $2", expense_id, pro_id)
    # Any manual edit means a human has looked at it.
    payload["needs_review"] = False
    sql, args = pg.build_update("expenses", payload, "id = $1 and pro_id = $2",
                                [expense_id, pro_id])
    return await pg.fetchrow(sql, *args)


async def delete_expense(pro_id: str, expense_id: str) -> bool:
    row = await pg.fetchrow(
        "delete from expenses where id = $1 and pro_id = $2 returning id", expense_id, pro_id)
    return row is not None


async def dashboard(pro_id: str, year: int) -> dict:
    """Headline numbers for the tax page."""
    e = await eur(pro_id, year)
    open_inv = await pg.fetchrow(
        """
        select coalesce(sum(outstanding), 0) as outstanding, count(*) as n
          from invoices
         where pro_id = $1 and status <> 'draft' and cancelled_at is null
           and payment_state in ('unpaid','partial','overdue')
        """, pro_id)
    review = await pg.fetchval(
        "select count(*) from expenses where pro_id = $1 and needs_review", pro_id)
    return {
        **e,
        "outstanding": float(open_inv["outstanding"]),
        "open_invoices": int(open_inv["n"]),
        "receipts_needing_review": int(review or 0),
    }
