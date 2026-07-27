"""Country-scoped VAT rules and invoice mandatory-field logic.

The migration plan calls for picking one launch country and configuring the
other rather than hardcoding it. The Mongo build hardcoded AT's 20% in
`pro_invoicing.VAT_RATE_DEFAULT`, which would have invoiced German customers
at the wrong rate.

Nothing here is a substitute for a Steuerberater review before launch. It
encodes the rules; a professional confirms them.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# ── VAT rates by country ───────────────────────────────────────────────
# AT: 20 standard · 13 (Beherbergung, some cultural) · 10 (food, books, rent)
# DE: 19 standard · 7 reduced
RATES: dict[str, dict[str, float]] = {
    "AT": {"standard": 20.0, "reduced": 10.0, "reduced_alt": 13.0, "zero": 0.0},
    "DE": {"standard": 19.0, "reduced": 7.0, "reduced_alt": 7.0, "zero": 0.0},
}
DEFAULT_COUNTRY = "AT"

# Treatments that carry no VAT regardless of country.
ZERO_RATED = {"kleinunternehmer", "reverse_charge_13b", "intra_eu", "export", "zero"}


@dataclass(frozen=True)
class TaxContext:
    """Everything needed to decide how a line is taxed."""
    supplier_country: str = DEFAULT_COUNTRY
    customer_country: str = DEFAULT_COUNTRY
    customer_is_business: bool = False
    customer_has_valid_vat_id: bool = False
    customer_is_bauleister: bool = False
    supplier_is_kleinunternehmer: bool = False
    is_bauleistung: bool = False


def vat_rate(treatment: str, country: str = DEFAULT_COUNTRY) -> float:
    if treatment in ZERO_RATED:
        return 0.0
    table = RATES.get((country or DEFAULT_COUNTRY).upper(), RATES[DEFAULT_COUNTRY])
    return table.get(treatment, table["standard"])


def resolve_treatment(ctx: TaxContext, *, requested: Optional[str] = None) -> str:
    """Pick the tax treatment for a line.

    Order matters: Kleinunternehmer status overrides everything (they may not
    show VAT at all), then §13b, then cross-border rules. An explicitly
    requested reduced rate is honoured only once none of those apply.
    """
    if ctx.supplier_is_kleinunternehmer:
        return "kleinunternehmer"

    # §13b UStG — Bauleistung supplied to another Bauleister. The liability
    # shifts to the recipient; the invoice shows no VAT and must say why.
    if ctx.is_bauleistung and ctx.customer_is_bauleister and ctx.customer_country == ctx.supplier_country:
        return "reverse_charge_13b"

    if ctx.customer_country != ctx.supplier_country:
        eu = {"AT","DE","BE","BG","HR","CY","CZ","DK","EE","FI","FR","GR","HU","IE",
              "IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"}
        if ctx.customer_country not in eu:
            return "export"
        if ctx.customer_is_business and ctx.customer_has_valid_vat_id:
            return "intra_eu"
        # EU private customer: taxed where the service is supplied. For work on
        # immovable property that is the property's location — which for these
        # five trades is effectively always the site.

    if requested in ("reduced", "reduced_alt", "zero"):
        return requested
    return "standard"


def legal_note(treatment: str, country: str = DEFAULT_COUNTRY) -> Optional[str]:
    """The sentence the invoice must carry for a non-standard treatment.

    Omitting these is not cosmetic: a §13b invoice without the note is
    defective, and the recipient can refuse it.
    """
    c = (country or DEFAULT_COUNTRY).upper()
    if treatment == "kleinunternehmer":
        return ("Gemäß § 6 Abs. 1 Z 27 UStG wird keine Umsatzsteuer ausgewiesen "
                "(Kleinunternehmerregelung)." if c == "AT" else
                "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet "
                "(Kleinunternehmerregelung).")
    if treatment == "reverse_charge_13b":
        return ("Steuerschuldnerschaft des Leistungsempfängers gemäß § 13b UStG "
                "(Bauleistung). Die Umsatzsteuer ist vom Leistungsempfänger abzuführen.")
    if treatment == "intra_eu":
        return ("Steuerfreie innergemeinschaftliche Leistung — "
                "Reverse Charge gemäß Art. 196 MwStSystRL.")
    if treatment == "export":
        return "Steuerfreie Ausfuhrlieferung / Drittlandsleistung."
    return None


def mandatory_fields(country: str = DEFAULT_COUNTRY) -> list[str]:
    """Fields an invoice must carry. Used to block issuing an incomplete one.

    AT: § 11 UStG · DE: § 14 UStG. The two lists agree in substance; the
    labels differ (UID vs USt-IdNr), which the UI layer localises.
    """
    return [
        "supplier_name", "supplier_address",
        "supplier_vat_id_or_tax_number",
        "customer_name", "customer_address",
        "invoice_number", "issue_date",
        "service_date",             # Leistungszeitpunkt / -zeitraum
        "line_descriptions", "net_amount", "vat_rate", "vat_amount", "gross_amount",
    ]


def is_35a_eligible(ctx: TaxContext) -> bool:
    """§35a EStG applies to German private customers.

    They may deduct 20% of the LABOUR portion (capped) from their income tax,
    provided the invoice separates labour from material and the bill is paid
    by bank transfer rather than cash. Austria has no direct equivalent, but
    splitting the invoice costs nothing and helps the customer either way —
    so the split is always produced and only the on-invoice hint is gated.
    """
    return ctx.customer_country == "DE" and not ctx.customer_is_business


def note_35a() -> str:
    return ("Hinweis: Der ausgewiesene Lohnanteil ist gemäß § 35a EStG "
            "steuerlich absetzbar. Voraussetzung ist die Zahlung per "
            "Überweisung (keine Barzahlung).")
