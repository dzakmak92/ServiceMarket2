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

    Built through `_csv` like the other two exports rather than with its own
    `csv.writer`: the hand-rolled one omitted the UTF-8 BOM, so this file —
    alone of the three — arrived in Excel with every umlaut in a supplier or
    customer name mangled.
    """
    start, end = _period(year)
    header = ["Umsatz", "Soll_Haben", "Belegdatum", "Belegfeld1",
              "Buchungstext", "Konto", "Gegenkonto", "USt_Prozent",
              "USt_Betrag", "Leistungsdatum", "Typ"]
    out: list[list] = []

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
        out.append([
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
        out.append([
            f"{r['gross_amount']:.2f}".replace(".", ","),
            "H", r["expense_date"].strftime("%d%m%Y"), "",
            f"{r['category']} {r['vendor'] or ''}"[:60],
            "4980", "1200", f"{r['vat_rate']:.0f}",
            f"{r['vat_amount']:.2f}".replace(".", ","),
            r["expense_date"].strftime("%d%m%Y"), "Beleg",
        ])
    return _csv(header, out)


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

    # Re-derive net/vat/gross whenever any of the three moved. Writing only
    # the supplied column left the other two at their old figures — change a
    # net from 100 to 200 and vat_amount stayed 20, which then fed the input
    # VAT on the USt-VA and the by-category totals on the EÜR. The current row
    # supplies whatever the caller did not send.
    if {"net_amount", "gross_amount", "vat_rate"} & set(payload):
        cur = await pg.fetchrow(
            "select net_amount, gross_amount, vat_rate from expenses "
            "where id = $1 and pro_id = $2", expense_id, pro_id)
        if not cur:
            return None
        rate = Decimal(str(payload.get("vat_rate", cur["vat_rate"] or 0)))
        # Net wins when both are sent; the gross is the derived figure on a
        # receipt a pro is correcting from the paper in their hand.
        if "net_amount" in payload:
            net = Decimal(str(payload["net_amount"]))
            gross = (net * (1 + rate / 100)).quantize(Decimal("0.01"))
        elif "gross_amount" in payload:
            gross = Decimal(str(payload["gross_amount"]))
            net = (gross / (1 + rate / 100)).quantize(Decimal("0.01"))
        else:
            net = Decimal(str(cur["net_amount"] or 0))
            gross = (net * (1 + rate / 100)).quantize(Decimal("0.01"))
        payload["net_amount"] = net
        payload["gross_amount"] = gross
        payload["vat_amount"] = (gross - net).quantize(Decimal("0.01"))

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
    # Receivables, not turnover, so the two exclusions are different from the
    # ones used for lifetime value: a cancelled invoice cannot be collected,
    # and a Storno is a credit note rather than a debt. Counting the Storno
    # while dropping the invoice it cancels made outstanding go negative.
    open_inv = await pg.fetchrow(
        """
        select coalesce(sum(outstanding), 0) as outstanding, count(*) as n
          from invoices
         where pro_id = $1 and status <> 'draft' and cancelled_at is null
           and type <> 'storno'
           and payment_state in ('unpaid','partial','overdue')
        """, pro_id)
    review = await pg.fetchval(
        "select count(*) from expenses where pro_id = $1 and needs_review", pro_id)

    # The quarter the pro is standing in, and what it currently owes. The
    # screen showed "Quartal undefined" because nothing here supplied it.
    q = (date.today().month - 1) // 3 + 1
    this_q = await ust_va(pro_id, year, quarter=q)
    klein = await pg.fetchval(
        "select is_kleinunternehmer from pro_profiles where id = $1", pro_id)
    expenses_gross = sum(c["gross"] for c in e["by_category"])

    return {
        **e,
        "outstanding": float(open_inv["outstanding"]),
        "open_invoices": int(open_inv["n"]),
        "receipts_needing_review": int(review or 0),
        # The names the tax dashboard reads. It asked for `revenue_brutto`,
        # `outstanding_brutto`, `expenses_brutto`, `profit_eur`,
        # `ust_due_this_quarter`, `current_quarter` and `is_kleinunternehmer`;
        # this returned none of them, so every tile on the screen read
        # EUR 0,00 for a business with real turnover, and the USt line read
        # "Quartal undefined". Supplied here rather than translated in the
        # component, so the two cannot drift apart again.
        "revenue_brutto": float(e["income_gross"]),
        "outstanding_brutto": float(open_inv["outstanding"]),
        "expenses_brutto": float(expenses_gross),
        "profit_eur": float(e["income_net"]) - float(expenses_gross),
        "current_quarter": f"Q{q}",
        "ust_due_this_quarter": float(this_q["payable"]),
        "is_kleinunternehmer": bool(klein),
    }


# ── Fahrtenbuch ────────────────────────────────────────────────────────
# The Austrian Kilometergeld rate. Stated as a constant with its year so a
# stale figure shows up in a diff instead of hiding inside an expression.
KM_RATE_EUR = 0.50
KM_RATE_YEAR = 2026


async def mileage(pro_id: str, year: int) -> dict:
    """Travel billed on work that was actually finished this year.

    Built from the `travel` positions on accepted quotes rather than from a
    separate log, because a separate log is a thing nobody fills in. What a pro
    charged for getting there is already recorded on every quote they sent, and
    it is the same figure the Finanzamt would want to see substantiated.

    The kilometres are derived, not measured, and labelled as such. A
    Fahrtenbuch that satisfies §16 EStG needs date, destination, purpose and
    odometer readings; this has the first three and infers the fourth from the
    money. It is a starting point for an accountant, not a substitute for the
    book — and the response says so rather than letting the number look
    authoritative.
    """
    start, end = _period(year)
    rows = await pg.fetch(
        """
        select j.completed_at::date as trip_date, j.title, j.site_city,
               j.site_postal_code, q.quote_number,
               sum(l.net_amount) as travel_net
          from quote_lines l
          join quotes q on q.id = l.quote_id
          join jobs j on j.id = q.job_id
         where q.pro_id = $1 and q.status = 'accepted'
           and l.kind = 'travel' and l.is_selected
           and j.completed_at >= $2 and j.completed_at < $3
           and j.deleted_at is null
         group by j.completed_at, j.title, j.site_city, j.site_postal_code,
                  q.quote_number
        having sum(l.net_amount) > 0
         order by j.completed_at
        """, pro_id, start, end)

    trips = [{
        "date": r["trip_date"],
        "job_title": r["title"],
        "destination": " ".join(filter(None, [r["site_postal_code"], r["site_city"]])),
        "reference": r["quote_number"],
        "travel_net_eur": float(r["travel_net"]),
        "implied_km": round(float(r["travel_net"]) / KM_RATE_EUR, 1),
    } for r in rows]
    total = round(sum(t["travel_net_eur"] for t in trips), 2)
    return {
        "year": year,
        "km_rate_eur": KM_RATE_EUR,
        "km_rate_year": KM_RATE_YEAR,
        "trip_count": len(trips),
        "total_net_eur": total,
        "implied_km": round(total / KM_RATE_EUR, 1) if total else 0,
        "trips": trips,
        "basis": "Aus den Anfahrts-Positionen angenommener Angebote zu "
                 "abgeschlossenen Aufträgen.",
        "caveat": "Die Kilometer sind aus dem verrechneten Betrag abgeleitet, "
                  "nicht gemessen. Ein Fahrtenbuch nach § 16 EStG verlangt "
                  "zusätzlich Kilometerstände; diese Aufstellung ersetzt es "
                  "nicht.",
    }


# ── CSV exports ────────────────────────────────────────────────────────
def _csv(header: list[str], rows: list[list]) -> str:
    """Semicolon-separated with a UTF-8 BOM.

    Both are for Excel in a German locale, which is where these files go. A
    comma-separated file opens as one column per row, and without the BOM
    every umlaut in a supplier name arrives mangled. Neither is a detail an
    accountant will debug — they will just say the export is broken.
    """
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_MINIMAL,
                   lineterminator="\r\n")
    w.writerow(header)
    for r in rows:
        w.writerow(r)
    return "\ufeff" + buf.getvalue()


def _de(v) -> str:
    """1234.5 -> "1234,50". German decimal comma, no thousands separator —
    a separator would need quoting and accountants import these raw."""
    return f"{float(v or 0):.2f}".replace(".", ",")


async def revenue_csv(pro_id: str, year: int) -> str:
    start, end = _period(year)
    rows = await pg.fetch(
        """
        select i.issue_date, i.invoice_number, i.net_total, i.vat_total,
               i.gross_total, i.status, c.name as customer, c.country
          from invoices i
          left join customers c on c.id = i.customer_id
         where i.pro_id = $1 and i.status <> 'draft'
           and i.issue_date >= $2 and i.issue_date < $3
         order by i.issue_date, i.invoice_number
        """, pro_id, start, end)
    return _csv(
        ["Belegdatum", "Rechnungsnummer", "Kunde", "Land", "Netto", "USt",
         "Brutto", "Status"],
        [[r["issue_date"].strftime("%d.%m.%Y"), r["invoice_number"] or "",
          r["customer"] or "", r["country"] or "", _de(r["net_total"]),
          _de(r["vat_total"]), _de(r["gross_total"]), r["status"]]
         for r in rows])


async def expenses_csv(pro_id: str, year: int) -> str:
    start, end = _period(year)
    rows = await pg.fetch(
        """
        select expense_date, vendor, category, description, net_amount,
               vat_rate, vat_amount, gross_amount, vat_deductible, filename
          from expenses
         where pro_id = $1 and expense_date >= $2 and expense_date < $3
         order by expense_date
        """, pro_id, start, end)
    return _csv(
        ["Belegdatum", "Lieferant", "Kategorie", "Bezeichnung", "Netto",
         "USt-Satz", "USt", "Brutto", "Vorsteuerabzug", "Beleg"],
        [[r["expense_date"].strftime("%d.%m.%Y"), r["vendor"] or "",
          r["category"], r["description"] or "", _de(r["net_amount"]),
          _de(r["vat_rate"]), _de(r["vat_amount"]), _de(r["gross_amount"]),
          "ja" if r["vat_deductible"] else "nein", r["filename"] or ""]
         for r in rows])
