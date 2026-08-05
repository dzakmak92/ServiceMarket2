"""The Angebot's own arithmetic.

A quote is a legally binding offer. Its positions printed the amount before
the document discount and "Nettobetrag" printed the amount after it, with
nothing between them to explain the gap — a single 1.000,00 € line above a
net of 800,00 €. That is not a rounding complaint: it is a document the
customer is entitled to query and the pro cannot defend.

The totals are a pure function so they can be checked here rather than by
rendering a PDF and reading the bytes back out.
"""
import sys
from decimal import Decimal as D
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.quote_pdf import totals_rows  # noqa: E402

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def money(rows, label):
    for k, v in rows:
        if k.startswith(label):
            return v
    return None


print("\n── a discounted offer shows where the discount went ──")
lines = [{"net_amount": D("1000.00"), "is_optional": False}]
r = totals_rows({"discount_pct": D("20"), "net_total": D("800.00"),
                 "vat_total": D("160.00"), "gross_total": D("960.00")}, lines)
check(money(r, "Zwischensumme") == "1.000,00 €",
      "the subtotal equals the positions above it")
check(money(r, "Rabatt") == "-200,00 €", "the discount has its own row")
check(money(r, "Nettobetrag") == "800,00 €", "and the net is what remains")
check([k for k, _ in r] == ["Zwischensumme", "Rabatt 20 %", "Nettobetrag",
                            "USt.", "Gesamtbetrag"],
      "in an order a customer can follow down the page")

print("\n── an undiscounted offer gains no extra rows ──")
r = totals_rows({"discount_pct": D("0"), "net_total": D("1000.00"),
                 "vat_total": D("200.00"), "gross_total": D("1200.00")}, lines)
check([k for k, _ in r] == ["Nettobetrag", "USt.", "Gesamtbetrag"],
      "no subtotal and no discount row when there is no discount")

print("\n── optional positions are not in the subtotal ──")
mixed = [{"net_amount": D("1000.00"), "is_optional": False},
         {"net_amount": D("500.00"), "is_optional": True, "is_selected": False}]
r = totals_rows({"discount_pct": D("10"), "net_total": D("900.00"),
                 "vat_total": D("180.00"), "gross_total": D("1080.00")}, mixed)
check(money(r, "Zwischensumme") == "1.000,00 €",
      "an unselected optional line is excluded, as it is from the total")
check(money(r, "Rabatt") == "-100,00 €", "so the discount row still reconciles")

print("\n── a selected optional position is part of the offer ──")
sel = [{"net_amount": D("1000.00"), "is_optional": False},
       {"net_amount": D("500.00"), "is_optional": True, "is_selected": True}]
r = totals_rows({"discount_pct": D("10"), "net_total": D("1350.00"),
                 "vat_total": D("270.00"), "gross_total": D("1620.00")}, sel)
check(money(r, "Zwischensumme") == "1.500,00 €", "it counts toward the subtotal")
check(money(r, "Rabatt") == "-150,00 €", "and the discount reconciles against it")

print("\n── the fallback, for a quote whose lines did not come through ──")
r = totals_rows({"discount_pct": D("25"), "net_total": D("750.00"),
                 "vat_total": D("150.00"), "gross_total": D("900.00")}, [])
check(money(r, "Zwischensumme") == "1.000,00 €",
      "the subtotal is derived from the net and the rate")
check(money(r, "Rabatt") == "-250,00 €", "and still reconciles")

print("\n── a total discount does not print a meaningless row ──")
r = totals_rows({"discount_pct": D("100"), "net_total": D("0.00"),
                 "vat_total": D("0.00"), "gross_total": D("0.00")}, lines)
check("Zwischensumme" not in [k for k, _ in r],
      "100 % off skips the subtotal rather than dividing by zero")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
for f in fails:
    print("  ·", f)
sys.exit(1 if fails else 0)
