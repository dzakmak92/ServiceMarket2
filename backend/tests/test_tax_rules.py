"""Tax treatment resolution — DE/AT divergence, §13b, §35a, cross-border.

Pure logic, so this is genuinely testable without a database. Each case
below is a rule from the P0 deep-dive's compliance section.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.tax_rules import (
    TaxContext, resolve_treatment, vat_rate, legal_note, is_35a_eligible, RATES,
)

fails = []
def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)

print("── VAT rates diverge by country ──")
check(vat_rate("standard", "AT") == 20.0, "AT standard is 20%")
check(vat_rate("standard", "DE") == 19.0, "DE standard is 19%")
check(vat_rate("reduced", "AT") == 10.0, "AT reduced is 10%")
check(vat_rate("reduced", "DE") == 7.0,  "DE reduced is 7%")
check(vat_rate("standard", "XX") == 20.0, "unknown country falls back to AT, not to a crash")

print("\n── zero-rated treatments carry no VAT in any country ──")
for t in ("kleinunternehmer", "reverse_charge_13b", "intra_eu", "export"):
    check(vat_rate(t, "DE") == 0.0 and vat_rate(t, "AT") == 0.0, f"{t} is 0%")

print("\n── §13b reverse charge (Bauleistung to another Bauleister) ──")
b2b_bau = TaxContext(supplier_country="DE", customer_country="DE",
                     customer_is_business=True, customer_is_bauleister=True,
                     is_bauleistung=True)
check(resolve_treatment(b2b_bau) == "reverse_charge_13b", "Bauleistung to a Bauleister shifts liability")
check(resolve_treatment(TaxContext(supplier_country="DE", customer_country="DE",
      customer_is_business=True, customer_is_bauleister=True, is_bauleistung=False))
      == "standard", "non-Bauleistung to the same customer stays standard")
check(resolve_treatment(TaxContext(supplier_country="DE", customer_country="DE",
      customer_is_business=True, is_bauleistung=True))
      == "standard", "Bauleistung to a NON-Bauleister stays standard")

print("\n── Kleinunternehmer overrides everything ──")
check(resolve_treatment(TaxContext(supplier_is_kleinunternehmer=True, is_bauleistung=True,
      customer_is_bauleister=True)) == "kleinunternehmer",
      "Kleinunternehmer wins over §13b (they may not show VAT at all)")

print("\n── cross-border ──")
check(resolve_treatment(TaxContext(supplier_country="AT", customer_country="DE",
      customer_is_business=True, customer_has_valid_vat_id=True)) == "intra_eu",
      "EU B2B with a validated UID is intra-EU reverse charge")
check(resolve_treatment(TaxContext(supplier_country="AT", customer_country="DE",
      customer_is_business=True, customer_has_valid_vat_id=False)) == "standard",
      "EU B2B WITHOUT a validated UID is NOT zero-rated")
check(resolve_treatment(TaxContext(supplier_country="AT", customer_country="CH",
      customer_is_business=True)) == "export", "Switzerland is a third country")
check(resolve_treatment(TaxContext(supplier_country="AT", customer_country="DE"))
      == "standard", "EU private customer is taxed normally")

print("\n── explicit reduced rate is honoured only when nothing overrides ──")
check(resolve_treatment(TaxContext(), requested="reduced") == "reduced", "reduced honoured")
check(resolve_treatment(TaxContext(supplier_is_kleinunternehmer=True), requested="reduced")
      == "kleinunternehmer", "reduced ignored for a Kleinunternehmer")

print("\n── mandatory legal notes ──")
check("6 Abs. 1 Z 27" in legal_note("kleinunternehmer", "AT"), "AT cites §6(1)27 UStG")
check("19 UStG" in legal_note("kleinunternehmer", "DE"), "DE cites §19 UStG")
check("13b" in legal_note("reverse_charge_13b"), "§13b note names the paragraph")
check(legal_note("standard") is None, "standard needs no note")

print("\n── §35a eligibility ──")
check(is_35a_eligible(TaxContext(customer_country="DE", customer_is_business=False)),
      "German private customer is eligible")
check(not is_35a_eligible(TaxContext(customer_country="DE", customer_is_business=True)),
      "German business customer is not")
check(not is_35a_eligible(TaxContext(customer_country="AT", customer_is_business=False)),
      "Austrian customer has no §35a equivalent")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
sys.exit(1 if fails else 0)
