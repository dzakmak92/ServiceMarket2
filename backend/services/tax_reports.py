"""Tax Toolkit aggregations + Austrian-compliant reports.

Powers GET /api/tax/* endpoints. Source data:
  - pro_invoices (revenue)
  - fee_log + payment_transactions where target=this pro (deductible business expenses)
  - quotes (mileage/travel_cost — Fahrtenbuch)

Cash-basis (EÜR) per Austrian §4(3) — we count revenue when paid_at is set,
expenses when status=paid on fee_log + Stripe txns.
"""
from __future__ import annotations
import csv
import io
import logging
from datetime import datetime, timezone, date
from typing import Optional

from bson import ObjectId

from database import db

logger = logging.getLogger(__name__)

# Austrian USt-VA quarter deadlines (15th of month following quarter end)
USTVA_DEADLINES = {
    "Q1": (4, 15),   # 15 April
    "Q2": (7, 15),   # 15 July
    "Q3": (10, 15),  # 15 October
    "Q4": (1, 15),   # 15 January (following year)
}

QUARTER_MONTHS = {
    "Q1": (1, 3), "Q2": (4, 6), "Q3": (7, 9), "Q4": (10, 12),
}


def quarter_of(d: datetime | date) -> str:
    m = d.month
    if m <= 3: return "Q1"
    if m <= 6: return "Q2"
    if m <= 9: return "Q3"
    return "Q4"


def quarter_window(year: int, quarter: str) -> tuple[datetime, datetime]:
    m_start, m_end = QUARTER_MONTHS[quarter]
    start = datetime(year, m_start, 1, tzinfo=timezone.utc)
    if m_end == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, m_end + 1, 1, tzinfo=timezone.utc)
    return start, end


# ──────────────────────────────────────────────
# Revenue (pro_invoices)
# ──────────────────────────────────────────────
async def revenue_summary(pro_id: str, start: datetime, end: datetime, paid_only: bool = False) -> dict:
    """Aggregate revenue between [start, end). Buckets by VAT rate (20% / 10% / 0%)."""
    q = {"pro_id": pro_id, "invoice_date": {"$gte": start, "$lt": end}}
    if paid_only:
        q["payment_status"] = "paid"
    buckets: dict[int, dict] = {0: {"net": 0.0, "vat": 0.0, "brutto": 0.0, "count": 0},
                                10: {"net": 0.0, "vat": 0.0, "brutto": 0.0, "count": 0},
                                20: {"net": 0.0, "vat": 0.0, "brutto": 0.0, "count": 0}}
    total_net, total_vat, total_brutto, paid_brutto, pending_brutto = 0.0, 0.0, 0.0, 0.0, 0.0
    async for inv in db.pro_invoices.find(q):
        rate = int(inv.get("vat_rate", 20))
        b = buckets.setdefault(rate, {"net": 0.0, "vat": 0.0, "brutto": 0.0, "count": 0})
        net_v = float(inv.get("net_total", 0))
        vat_v = float(inv.get("vat_total", 0))
        brutto_v = float(inv.get("brutto_total", 0))
        b["net"] += net_v
        b["vat"] += vat_v
        b["brutto"] += brutto_v
        # Storno + cancelled docs net the original to zero — they MUST be
        # in the net/vat/brutto totals (for USt-VA correctness) but should
        # NEVER feed the count (visual confusion) or paid/pending sums.
        is_storno = bool(inv.get("is_storno"))
        pay_status = inv.get("payment_status") or inv.get("status") or "issued"
        is_cancelled = pay_status == "cancelled" or bool(inv.get("cancelled_by_storno_id"))
        if not is_storno and not is_cancelled:
            b["count"] += 1
        total_net += net_v
        total_vat += vat_v
        total_brutto += brutto_v
        if is_storno or is_cancelled:
            # Already netted via the negative-amount storno. Don't double-count
            # in paid/pending so the "outstanding" tile never goes negative.
            continue
        # Use paid_total / outstanding when available — that supports partial payments
        if "paid_total" in inv:
            paid_brutto += float(inv.get("paid_total", 0) or 0)
            pending_brutto += float(inv.get("outstanding", brutto_v) or 0)
        else:
            if pay_status == "paid":
                paid_brutto += brutto_v
            else:
                pending_brutto += brutto_v
    return {
        "buckets": {str(k): {**v, "net": round(v["net"], 2), "vat": round(v["vat"], 2), "brutto": round(v["brutto"], 2)} for k, v in buckets.items()},
        "net": round(total_net, 2),
        "vat": round(total_vat, 2),
        "brutto": round(total_brutto, 2),
        "paid_brutto": round(paid_brutto, 2),
        "pending_brutto": round(pending_brutto, 2),
    }


# ──────────────────────────────────────────────
# Expenses (operator fees paid by this pro)
# ──────────────────────────────────────────────
async def expense_summary(user_id: str, start: datetime, end: datetime) -> dict:
    """Sum every payment_transaction where this pro paid the operator
    (contact fees + toolkit subscriptions + Pro plan subscription).
    These are all deductible business expenses."""
    q = {"user_id": user_id, "status": "paid", "created_at": {"$gte": start, "$lt": end}}
    total_net, total_vat, total_brutto = 0.0, 0.0, 0.0
    by_kind: dict[str, dict] = {}
    items = []
    async for txn in db.payment_transactions.find(q):
        net = float(txn.get("net_amount", 0))
        if not net and txn.get("amount"):
            # Legacy txns stored only brutto — back-derive
            net = round(float(txn["amount"]) / 1.20, 2)
        vat = round(float(txn.get("amount", 0)) - net, 2)
        brutto = float(txn.get("amount", 0))
        kind = (txn.get("metadata") or {}).get("type", "unknown")
        b = by_kind.setdefault(kind, {"net": 0.0, "vat": 0.0, "brutto": 0.0, "count": 0})
        b["net"] += net; b["vat"] += vat; b["brutto"] += brutto; b["count"] += 1
        total_net += net; total_vat += vat; total_brutto += brutto
        items.append({
            "date": txn.get("created_at"),
            "kind": kind,
            "net": round(net, 2),
            "vat": round(vat, 2),
            "brutto": round(brutto, 2),
            "session_id": txn.get("session_id"),
        })
    return {
        "by_kind": {k: {**v, "net": round(v["net"], 2), "vat": round(v["vat"], 2), "brutto": round(v["brutto"], 2)} for k, v in by_kind.items()},
        "net": round(total_net, 2),
        "vat": round(total_vat, 2),
        "brutto": round(total_brutto, 2),
        "items": items,
    }


# ──────────────────────────────────────────────
# Mileage book (Fahrtenbuch)
# ──────────────────────────────────────────────
KM_RATE = 0.42   # Austrian "amtliches Kilometergeld" 2024+


async def mileage_book(pro_id: str, year: int) -> dict:
    """Iterate the pro's accepted quotes whose job was completed during the year.
    travel_cost is treated as the trip's deductible expense; we surface it
    alongside the job city for accountant review."""
    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    trips = []
    total_eur = 0.0
    async for q in db.quotes.find({"pro_id": pro_id, "status": "accepted"}):
        if not q.get("travel_cost"):
            continue
        try:
            job = await db.jobs.find_one({"_id": ObjectId(q["job_id"])})
        except Exception:
            continue
        if not job or not job.get("completed_at"):
            continue
        ca = job["completed_at"]
        # Some legacy docs are stored naive — coerce to UTC for safe compare
        if ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)
        if ca < start or ca >= end:
            continue
        cost = float(q["travel_cost"])
        trips.append({
            "date": ca,
            "job_title": job.get("title", ""),
            "city": job.get("city", ""),
            "travel_cost_eur": round(cost, 2),
            # Equivalent km if charged at the lump-sum rate
            "estimated_km": round(cost / KM_RATE, 1) if cost else 0,
        })
        total_eur += cost
    return {
        "year": year, "km_rate_eur": KM_RATE,
        "total_eur": round(total_eur, 2),
        "total_estimated_km": round(total_eur / KM_RATE, 1) if total_eur else 0,
        "trip_count": len(trips),
        "trips": trips,
    }


# ──────────────────────────────────────────────
# SVS contributions (Selbstständigenvorsorge)
# Simplified 2026 brackets — pro can override
# ──────────────────────────────────────────────
def svs_contribution(annual_profit_eur: float) -> dict:
    """Estimate Austrian SVS social-security contribution. Provisional pension
    insurance 18.5%, health 6.8%, accident €146/y. Min/max thresholds applied.
    Numbers are 2026 ballpark — pro should still verify with SVS.at."""
    p = max(float(annual_profit_eur), 0.0)
    min_basis = 5710.32     # Geringfügigkeitsgrenze ×12 (illustrative)
    max_basis = 84840.0     # Höchstbeitragsgrundlage ×12 (illustrative)
    basis = min(max(p, min_basis), max_basis)
    pension = round(basis * 0.185, 2)
    health = round(basis * 0.068, 2)
    accident = 146.0
    total = round(pension + health + accident, 2)
    return {
        "annual_profit_basis_eur": basis,
        "min_basis_eur": min_basis,
        "max_basis_eur": max_basis,
        "pension_eur": pension,
        "health_eur": health,
        "accident_eur": accident,
        "total_eur": total,
        "monthly_eur": round(total / 12, 2),
    }


# ──────────────────────────────────────────────
# Einkommensteuer (income tax) — AT 2026 progressive brackets
# ──────────────────────────────────────────────
EST_BRACKETS_2026 = [
    (12816, 0.00),
    (20818, 0.20),
    (35836, 0.30),
    (69166, 0.40),
    (103072, 0.48),
    (1000000, 0.50),
    (float("inf"), 0.55),
]


def income_tax_at(taxable_profit_eur: float) -> dict:
    """Apply 2026 Austrian progressive Einkommensteuer brackets to the
    self-employed net profit. Result rounded to cents."""
    p = max(float(taxable_profit_eur), 0.0)
    tax = 0.0
    last = 0.0
    breakdown = []
    for cap, rate in EST_BRACKETS_2026:
        slice_amt = min(p, cap) - last
        if slice_amt <= 0:
            break
        slice_tax = round(slice_amt * rate, 2)
        breakdown.append({"upper": cap, "rate_pct": int(rate * 100), "slice_eur": round(slice_amt, 2), "tax_eur": slice_tax})
        tax += slice_tax
        last = cap
        if p <= cap:
            break
    return {
        "taxable_profit_eur": round(p, 2),
        "estimated_tax_eur": round(tax, 2),
        "effective_rate_pct": round((tax / p) * 100, 1) if p else 0,
        "brackets": breakdown,
    }


# ──────────────────────────────────────────────
# DATEV-shaped CSV exports
# ──────────────────────────────────────────────
async def revenue_csv(pro_id: str, year: int, quarter: Optional[str] = None) -> str:
    """Returns a DATEV-EXTF-compatible CSV of issued invoices.
    Columns the accountant can map: Belegdatum, Belegnummer, Kunde, Konto,
    Soll/Haben, Betrag_Brutto, USt%, Betrag_Netto, Verwendungszweck."""
    if quarter:
        start, end = quarter_window(year, quarter)
    else:
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Belegdatum", "Belegnummer", "Kunde", "Konto", "Soll_Haben",
                "Betrag_Brutto", "USt_Prozent", "Betrag_Netto", "USt_Betrag", "Status", "Verwendungszweck"])
    async for inv in db.pro_invoices.find({"pro_id": pro_id, "invoice_date": {"$gte": start, "$lt": end}}).sort("invoice_date", 1):
        cust = inv.get("customer_snapshot") or {}
        w.writerow([
            inv["invoice_date"].strftime("%d.%m.%Y") if inv.get("invoice_date") else "",
            inv.get("invoice_number", ""),
            cust.get("name", ""),
            "4000",                                  # Standard revenue account
            "H" if inv.get("status") != "cancelled" else "S",
            f"{inv.get('brutto_total', 0):.2f}".replace(".", ","),
            inv.get("vat_rate", 20),
            f"{inv.get('net_total', 0):.2f}".replace(".", ","),
            f"{inv.get('vat_total', 0):.2f}".replace(".", ","),
            inv.get("status", ""),
            f"Rechnung {inv.get('invoice_number','')}",
        ])
    return buf.getvalue()


async def expenses_csv(user_id: str, year: int, quarter: Optional[str] = None) -> str:
    if quarter:
        start, end = quarter_window(year, quarter)
    else:
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Belegdatum", "Beleg_Session", "Lieferant", "Konto", "Soll_Haben",
                "Betrag_Brutto", "USt_Prozent", "Betrag_Netto", "USt_Betrag", "Art", "Verwendungszweck"])
    async for txn in db.payment_transactions.find({"user_id": user_id, "status": "paid", "created_at": {"$gte": start, "$lt": end}}).sort("created_at", 1):
        net = float(txn.get("net_amount") or round(float(txn.get("amount", 0)) / 1.20, 2))
        brutto = float(txn.get("amount", 0))
        vat = round(brutto - net, 2)
        kind = (txn.get("metadata") or {}).get("type", "unknown")
        # Map kind → DATEV account
        account = {
            "contact_fees": "6815",
            "toolkit": "6920",
            "subscription": "6920",
            "bundle": "6920",
        }.get(kind, "4980")
        w.writerow([
            txn["created_at"].strftime("%d.%m.%Y") if txn.get("created_at") else "",
            txn.get("session_id", ""),
            "ServiceMarket Operator",
            account,
            "S",
            f"{brutto:.2f}".replace(".", ","),
            int(txn.get("vat_rate", 20)),
            f"{net:.2f}".replace(".", ","),
            f"{vat:.2f}".replace(".", ","),
            kind,
            f"ServiceMarket {kind}",
        ])
    return buf.getvalue()


# ──────────────────────────────────────────────
# DATEV Buchungsstapel — combined export
# ──────────────────────────────────────────────
_BU_KEY = {20: "22", 10: "12", 0: ""}  # USt-% → DATEV BU-Schlüssel


def _fmt(v: float) -> str:
    """German decimal format: 1234,56"""
    return f"{v:.2f}".replace(".", ",")


async def datev_buchungsstapel(pro_id: str, user_id: str, year: int, quarter: Optional[str] = None) -> str:
    """Returns a combined DATEV-Buchungsstapel CSV (Einnahmen + Ausgaben).

    Columns follow the DATEV EXTF Buchungsstapel v700 core fields:
    Umsatz (Brutto) · S/H · Konto · Gegenkonto · BU-Schlüssel ·
    Belegdatum · Belegfeld1 · Buchungstext · Betrag_Netto · USt% · USt_Betrag · Typ
    """
    if quarter:
        start, end = quarter_window(year, quarter)
    else:
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

    buf = io.StringIO(newline="")
    w = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_MINIMAL)

    # ── DATEV EXTF-style meta header ───────────────────────────────────────
    period = f"{quarter} {year}" if quarter else str(year)
    w.writerow([
        "EXTF", "700", "21", "Buchungsstapel",
        "Exportiert aus ServiceMarket",
        period,
        "EUR",
    ])
    # Column header row
    w.writerow([
        "Umsatz (Brutto)", "S/H", "Konto", "Gegenkonto", "BU-Schlüssel",
        "Belegdatum", "Belegfeld 1", "Buchungstext",
        "Betrag_Netto", "USt_%", "USt_Betrag", "Typ",
    ])

    # ── Einnahmen (revenue invoices) ───────────────────────────────────────
    async for inv in db.pro_invoices.find(
        {"pro_id": pro_id, "invoice_date": {"$gte": start, "$lt": end}}
    ).sort("invoice_date", 1):
        if inv.get("is_storno") or inv.get("status") == "cancelled":
            continue
        cust = inv.get("customer_snapshot") or {}
        brutto = float(inv.get("brutto_total") or 0)
        net = float(inv.get("net_total") or 0)
        vat = round(brutto - net, 2)
        vat_rate = int(inv.get("vat_rate", 20))
        bu = _BU_KEY.get(vat_rate, "")
        inv_no = (inv.get("invoice_number") or "")[:12]
        text = f"Rechnung {inv_no} {cust.get('name', '')}".strip()[:60]
        date_str = inv["invoice_date"].strftime("%d.%m.%Y") if inv.get("invoice_date") else ""
        w.writerow([
            _fmt(brutto), "H", "4000", "10000", bu,
            date_str, inv_no, text,
            _fmt(net), vat_rate, _fmt(vat), "Einnahme",
        ])

    # ── Ausgaben (expenses) ────────────────────────────────────────────────
    _KIND_ACCOUNT = {
        "contact_fees": "6815",
        "toolkit": "6920",
        "subscription": "6920",
        "bundle": "6920",
    }
    async for txn in db.payment_transactions.find(
        {"user_id": user_id, "status": "paid", "created_at": {"$gte": start, "$lt": end}}
    ).sort("created_at", 1):
        brutto = float(txn.get("amount", 0))
        net = float(txn.get("net_amount") or round(brutto / 1.20, 2))
        vat = round(brutto - net, 2)
        kind = (txn.get("metadata") or {}).get("type", "unknown")
        account = _KIND_ACCOUNT.get(kind, "4980")
        vat_rate = int(txn.get("vat_rate", 20))
        bu = _BU_KEY.get(vat_rate, "")
        date_str = txn["created_at"].strftime("%d.%m.%Y") if txn.get("created_at") else ""
        ref = (txn.get("session_id") or "")[:12]
        text = f"ServiceMarket {kind}"[:60]
        w.writerow([
            _fmt(brutto), "S", account, "70000", bu,
            date_str, ref, text,
            _fmt(net), vat_rate, _fmt(vat), "Ausgabe",
        ])

    return buf.getvalue()
