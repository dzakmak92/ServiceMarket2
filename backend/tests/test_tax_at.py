"""Austrian SVS and Einkommensteuer — the arithmetic, without a database.

The trap this is mostly written to catch: SVS is deductible from the
income-tax base, so it has to come off *first*. Running both against the same
profit is the obvious implementation and it overstates the bill by €6,130 on a
€60,000 profit — a number a tradesperson would budget for and never owe.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import tax_at as T  # noqa: E402

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


print("── SVS floors and caps, and says which happened ──")
tiny = T.svs_contribution(0)
check(tiny["total_eur"] > 0,
      f"a year with no profit still owes {tiny['total_eur']} — the floor is why")
check(tiny["basis_floored"] and not tiny["basis_capped"], "and it says the basis was floored")
check(tiny["basis_eur"] == T.SVS_MIN_BASIS, "at the Geringfügigkeitsgrenze")

huge = T.svs_contribution(500_000)
check(huge["basis_capped"], "a very large profit is capped")
check(huge["basis_eur"] == T.SVS_MAX_BASIS, "at the Höchstbeitragsgrundlage")
check(T.svs_contribution(1_000_000)["total_eur"] == huge["total_eur"],
      "so doubling it again changes nothing")

mid = T.svs_contribution(40_000)
check(not mid["basis_floored"] and not mid["basis_capped"], "40.000 sits between both")
check(mid["basis_eur"] == 40_000, "and is charged on the profit itself")
check(round(mid["pension_eur"] + mid["health_eur"] + mid["accident_eur"], 2)
      == mid["total_eur"], "the parts sum to the total")
check(mid["monthly_eur"] == round(mid["total_eur"] / 12, 2), "monthly is the total over twelve")
check(mid["quarterly_eur"] == round(mid["total_eur"] / 4, 2),
      "and quarterly, which is how SVS actually bills")

print("\n── income tax is progressive, and shows its working ──")
check(T.income_tax(10_000)["estimated_tax_eur"] == 0,
      "below the tax-free amount nothing is owed")
check(T.income_tax(0)["effective_rate_pct"] == 0, "and zero profit does not divide by zero")

band = T.income_tax(50_000)
check(band["estimated_tax_eur"] > 0, "above it, tax is owed")
check(len(band["bands"]) >= 3, f"across {len(band['bands'])} bands, each reported")
check(round(sum(b["tax_eur"] for b in band["bands"]), 2) == band["estimated_tax_eur"],
      "and the bands sum to the total")
check(band["effective_rate_pct"] < band["marginal_rate_pct"],
      f"the effective rate ({band['effective_rate_pct']} %) is below the marginal "
      f"({band['marginal_rate_pct']} %) — which is the thing people get wrong "
      f"about progressive tax")

# Monotonic: earning more must never leave you with less.
prev_tax, prev_net = -1, -1
for p in range(0, 200_000, 5_000):
    r = T.income_tax(p)
    if r["estimated_tax_eur"] < prev_tax or (p - r["estimated_tax_eur"]) < prev_net:
        fails.append(f"tax is not monotonic at {p}")
        break
    prev_tax, prev_net = r["estimated_tax_eur"], p - r["estimated_tax_eur"]
check("monotonic" not in " ".join(fails), "more profit never means less in hand")

print("\n── the ordering trap ──")
PROFIT = 60_000
wrong = round(T.svs_contribution(PROFIT)["total_eur"]
              + T.income_tax(PROFIT)["estimated_tax_eur"], 2)
right = T.liability(PROFIT, 0)["total_due_eur"]
check(right < wrong,
      f"SVS off the base first: {right} against {wrong} if both are run on the "
      f"same profit")
check(round(wrong - right, 2) > 6000,
      f"the gap is {round(wrong - right, 2)} EUR — a bill somebody would have "
      f"set aside for and never owed")
liab = T.liability(PROFIT, 0)
check(liab["income_tax"]["taxable_profit_eur"]
      == round(PROFIT - liab["svs"]["total_eur"], 2),
      "the taxable profit is the profit less SVS")
check(liab["total_due_eur"]
      == round(liab["svs"]["total_eur"] + liab["income_tax"]["estimated_tax_eur"], 2),
      "and the total is the two of them")

print("\n── what to set aside ──")
check(T.liability(35_000, 0)["set_aside_pct"] > 30,
      "a third of a 35.000 profit is spoken for")
check(T.liability(120_000, 0)["set_aside_pct"]
      > T.liability(35_000, 0)["set_aside_pct"],
      "and the share rises with the profit")
check(T.liability(20_000, 25_000)["set_aside_pct"] == 0,
      "a loss-making year sets aside nothing rather than a negative percentage")
check(T.liability(20_000, 25_000)["profit_eur"] < 0, "though the loss is still reported")
check(T.liability(0, 0)["total_due_eur"] > 0,
      "and no turnover at all still owes the SVS minimum")

print("\n── every figure is labelled an estimate ──")
# These end up in front of a tradesperson budgeting real money. A number that
# looks final here is one they are short of in February.
for name, out in (("svs", T.svs_contribution(40_000)),
                  ("income_tax", T.income_tax(40_000)),
                  ("liability", T.liability(40_000, 0))):
    check("Richtwert" in out.get("disclaimer", ""), f"{name} carries the disclaimer")
check("Keine Steuerberatung" in T.DISCLAIMER, "and says it is not tax advice")
check(T.YEAR == 2026, f"the rate set is stamped with its year ({T.YEAR})")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
for f in fails:
    print("  ·", f)
sys.exit(1 if fails else 0)
