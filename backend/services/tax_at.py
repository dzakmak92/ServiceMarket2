"""Austrian social insurance and income tax — arithmetic only.

Pure functions with no database, no clock and no request. Extracted from the
Mongo-era `tax_reports` for the same reason the PDF layout was: that module
imports bson and the Mongo client at the top, so the Postgres side could not
touch it without dragging MongoDB into the serverless bundle.

**These are estimates and the app must say so.** SVS bases contributions on a
provisional figure and reconciles years later; Einkommensteuer depends on
allowances, loss carry-forward and the Gewinnfreibetrag, none of which this
knows about. The output is the shape of the bill, not the bill. A number
presented as final here is a number a tradesperson budgets against and is then
short of, which is worse than showing nothing.

Rates are stated as constants with their year so a stale figure is visible in
a diff rather than buried in an expression.
"""
from __future__ import annotations

YEAR = 2026

# ── SVS (Sozialversicherung der Selbständigen) ────────────────────────
# Pension 18.5 %, health 6.8 %, accident a flat annual sum. The basis is the
# profit, floored at the Geringfügigkeitsgrenze and capped at the
# Höchstbeitragsgrundlage — which is why a very small profit still owes
# something and a very large one stops growing.
SVS_PENSION_RATE = 0.185
SVS_HEALTH_RATE = 0.068
SVS_ACCIDENT_EUR = 146.0
SVS_MIN_BASIS = 5710.32
SVS_MAX_BASIS = 84840.0

# ── Einkommensteuer, progressive ──────────────────────────────────────
# (upper bound of the band, marginal rate). The first band is the
# tax-free amount, which is why a small profit owes no income tax at all
# while still owing SVS.
EST_BRACKETS = [
    (12816, 0.00),
    (20818, 0.20),
    (35836, 0.30),
    (69166, 0.40),
    (103072, 0.48),
    (1000000, 0.50),
    (float("inf"), 0.55),
]

DISCLAIMER = ("Richtwert auf Basis des Gewinns dieses Jahres. SVS rechnet "
              "vorläufig ab und stellt Jahre später endgültig fest; "
              "Gewinnfreibetrag, Verlustvortrag und persönliche Absetzbeträge "
              "sind nicht berücksichtigt. Keine Steuerberatung.")


def svs_contribution(annual_profit_eur: float) -> dict:
    """What SVS will provisionally ask for on this profit.

    The monthly figure is the one that matters day to day: SVS bills
    quarterly and a tradesperson who has not set it aside finds out in
    February.
    """
    profit = max(float(annual_profit_eur or 0), 0.0)
    basis = min(max(profit, SVS_MIN_BASIS), SVS_MAX_BASIS)
    pension = round(basis * SVS_PENSION_RATE, 2)
    health = round(basis * SVS_HEALTH_RATE, 2)
    total = round(pension + health + SVS_ACCIDENT_EUR, 2)
    return {
        "year": YEAR,
        "annual_profit_eur": round(profit, 2),
        "basis_eur": round(basis, 2),
        # Stated so a pro can see *why* a loss-making year still owes money,
        # and why a very good one stops rising.
        "basis_floored": profit < SVS_MIN_BASIS,
        "basis_capped": profit > SVS_MAX_BASIS,
        "min_basis_eur": SVS_MIN_BASIS,
        "max_basis_eur": SVS_MAX_BASIS,
        "pension_eur": pension,
        "health_eur": health,
        "accident_eur": SVS_ACCIDENT_EUR,
        "total_eur": total,
        "monthly_eur": round(total / 12, 2),
        "quarterly_eur": round(total / 4, 2),
        "disclaimer": DISCLAIMER,
    }


def income_tax(taxable_profit_eur: float) -> dict:
    """Progressive Einkommensteuer on a taxable profit.

    Returns the band-by-band working, not just a total. A pro who can see that
    the next 1,000 EUR of profit is taxed at 40 % can make a decision about
    it; a single number invites the belief that a raise pushes all income into
    a higher band.
    """
    profit = max(float(taxable_profit_eur or 0), 0.0)
    tax = 0.0
    last = 0.0
    bands = []
    for cap, rate in EST_BRACKETS:
        amount = min(profit, cap) - last
        if amount <= 0:
            break
        band_tax = round(amount * rate, 2)
        bands.append({"up_to_eur": None if cap == float("inf") else cap,
                      "rate_pct": round(rate * 100),
                      "amount_eur": round(amount, 2),
                      "tax_eur": band_tax})
        tax += band_tax
        last = cap
        if profit <= cap:
            break
    return {
        "year": YEAR,
        "taxable_profit_eur": round(profit, 2),
        "estimated_tax_eur": round(tax, 2),
        "effective_rate_pct": round(tax / profit * 100, 1) if profit else 0.0,
        # What the next euro costs, which is the number that changes decisions.
        "marginal_rate_pct": bands[-1]["rate_pct"] if bands else 0,
        "bands": bands,
        "disclaimer": DISCLAIMER,
    }


def liability(revenue_net: float, expenses_net: float) -> dict:
    """Both, in the order they actually apply.

    SVS is deductible from the income-tax base, so it must be computed first
    and subtracted. Running them independently against the same profit — the
    obvious thing to do — overstates income tax by roughly a quarter of the
    SVS bill.
    """
    profit = round(float(revenue_net or 0) - float(expenses_net or 0), 2)
    svs = svs_contribution(profit)
    taxable = max(profit - svs["total_eur"], 0.0)
    est = income_tax(taxable)
    total = round(svs["total_eur"] + est["estimated_tax_eur"], 2)
    return {
        "revenue_net_eur": round(float(revenue_net or 0), 2),
        "expenses_net_eur": round(float(expenses_net or 0), 2),
        "profit_eur": profit,
        "svs": svs,
        "income_tax": est,
        "total_due_eur": total,
        # The number to put aside from every euro that comes in. A pro who
        # knows this is 34 % prices differently from one who does not.
        "set_aside_pct": round(total / profit * 100, 1) if profit > 0 else 0.0,
        "disclaimer": DISCLAIMER,
    }
