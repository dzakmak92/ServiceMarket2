"""Invoice PDF: assert the legally-required content is actually on the page.

Renders a deliberately nasty invoice — three VAT rates, a §13b line, a §35a
split and Abschlag netting — then extracts the text and checks for each
mandatory element. Every case here is one the previous single-rate renderer
got wrong or omitted.
"""
import datetime
import sys
from decimal import Decimal as D
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from services.invoice_pdf import render_invoice_pdf

INVOICE = {
    "invoice_number": "RG-2026-0007", "type": "schluss", "status": "issued",
    "issue_date": datetime.date(2026, 7, 27),
    "service_date_start": datetime.date(2026, 6, 1),
    "service_date_end": datetime.date(2026, 7, 20),
    "due_date": datetime.date(2026, 8, 10),
    "net_total": D("2734.00"), "vat_total": D("349.00"), "gross_total": D("3083.00"),
    "labor_net": D("1660.00"), "material_net": D("1074.00"),
    "prior_payments_gross": D("1200.00"),
    "note": "Vielen Dank für Ihren Auftrag.", "storno_reason": None,
    "legal_notes": ["Steuerschuldnerschaft des Leistungsempfängers gemäß § 13b UStG (Bauleistung)."],
    "pro_snapshot": {
        "business_name": "Weber Malerei GmbH", "business_address": "Hauptstraße 12",
        "business_postal_code": "1010", "business_city": "Wien", "vat_id": "ATU12345678",
        "bank_account_holder": "Weber Malerei GmbH", "bank_iban": "AT611904300234573201",
        "bank_bic": "BKAUATWW", "bank_name": "Bank Austria",
        "invoice_footer": "Gerichtsstand Wien · FN 123456a"},
    "customer_snapshot": {
        "name": "Herr Gruber", "address": "Seestraße 4", "postal_code": "1220",
        "city": "Wien", "country": "AT"},
    "lines": [
        {"description": "Malerarbeiten 60 m²", "qty": D("60"), "unit": "m²",
         "unit_price": D("12.00"), "vat_rate": D("20"), "net_amount": D("720.00"),
         "vat_amount": D("144.00"), "kind": "labor"},
        {"description": "Feinsteinzeug 60x60 (inkl. 15% Verschnitt)", "qty": D("23"),
         "unit": "m²", "unit_price": D("38.00"), "vat_rate": D("20"),
         "net_amount": D("874.00"), "vat_amount": D("174.80"), "kind": "material"},
        {"description": "Fachliteratur Farbmischung", "qty": D("1"), "unit": "Stk",
         "unit_price": D("200.00"), "vat_rate": D("10"), "net_amount": D("200.00"),
         "vat_amount": D("20.00"), "kind": "material"},
        {"description": "Bauleistung an Bauträger", "qty": D("1"), "unit": "Stk",
         "unit_price": D("500.00"), "vat_rate": D("0"), "net_amount": D("500.00"),
         "vat_amount": D("0.00"), "kind": "labor"},
        {"description": "Nachtrag: Estrich ausgleichen", "qty": D("1"), "unit": "Stk",
         "unit_price": D("440.00"), "vat_rate": D("20"), "net_amount": D("440.00"),
         "vat_amount": D("88.00"), "kind": "labor"},
    ],
}

CHECKS = [
    ("invoice type is named",                    lambda t: "Schlussrechnung" in t),
    ("invoice number present",                   lambda t: "RG-2026-0007" in t),
    ("Leistungszeitraum present (§11/§14 UStG)", lambda t: "Leistungszeitraum" in t and "01.06.2026" in t),
    ("supplier UID present",                     lambda t: "ATU12345678" in t),
    ("20% VAT band shown",                       lambda t: "20% USt" in t),
    ("10% VAT band shown",                       lambda t: "10% USt" in t),
    ("0% band shown for the §13b line",          lambda t: "0% USt" in t),
    # The split is always printed — it costs nothing and helps any customer
    # read the invoice. The §35a *claim* is not: this customer is Austrian and
    # private, and § 35a EStG is a German deduction. The previous assertion
    # expected the claim here, which is the defect it was written to protect.
    ("labour/material split shown",              lambda t: "Aufteilung der Leistung" in t
                                                            and "Lohn- und Fahrtkosten" in t),
    ("but no §35a claim to an Austrian customer", lambda t: "35a" not in t),
    ("§13b reverse-charge note present",         lambda t: "13b" in t),
    ("prior Abschläge deducted",                 lambda t: "Abschlagszahlungen" in t),
    ("remaining balance shown",                  lambda t: "Restbetrag" in t),
    ("amount due = 3083 − 1200",                 lambda t: "1.883,00" in t),
    ("IBAN present",                             lambda t: "AT611904300234573201" in t),
    ("GiroCode rendered",                        lambda t: "QR-Code" in t),
]


def main() -> int:
    from pypdf import PdfReader
    pdf = render_invoice_pdf(INVOICE)
    text = "\n".join(p.extract_text() for p in PdfReader(BytesIO(pdf)).pages)
    fails = []
    for name, fn in CHECKS:
        ok = fn(text)
        print(("  ok   " if ok else "  FAIL ") + name)
        if not ok:
            fails.append(name)

    # § 35a is gated on who is reading the invoice. `is_35a_eligible` had the
    # rule right and no caller, so the claim went onto every invoice with an
    # hour of labour on it — telling an Austrian household about a German
    # deduction it cannot take, and a German GmbH about one it cannot use.
    print()
    for country, ctype, expected, who in [
        ("DE", "private",  True,  "a German private customer"),
        ("DE", "business", False, "a German business"),
        ("AT", "private",  False, "an Austrian private customer"),
        ("AT", "business", False, "an Austrian business"),
    ]:
        inv = {**INVOICE,
               "customer_snapshot": {**INVOICE["customer_snapshot"],
                                     "country": country, "type": ctype}}
        txt = "\n".join(p.extract_text()
                        for p in PdfReader(BytesIO(render_invoice_pdf(inv))).pages)
        for ok, name in (
            (("35a" in txt) is expected,
             f"§35a {'shown' if expected else 'not shown'} to {who}"),
            ("Aufteilung der Leistung" in txt,
             f"and the split is still printed for {who}"),
        ):
            print(("  ok   " if ok else "  FAIL ") + name)
            if not ok:
                fails.append(name)

    # A malformed IBAN must omit the QR rather than print a dead one that
    # scans to nothing — the customer would believe they had paid.
    bad = {**INVOICE, "pro_snapshot": {**INVOICE["pro_snapshot"], "bank_iban": "AT00INVALID"}}
    t2 = "\n".join(p.extract_text() for p in PdfReader(BytesIO(render_invoice_pdf(bad))).pages)
    ok = "QR-Code" not in t2 and "AT00INVALID" in t2
    print(("  ok   " if ok else "  FAIL ") + "invalid IBAN: QR omitted, bank details still shown")
    if not ok:
        fails.append("invalid IBAN handling")

    print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
