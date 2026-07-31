"""Learning what a business charges — the arithmetic, without a database.

The numbers below are the ones run against the real Supabase schema while
building this: three accepted quotes for the same operation at 9.00, 6.00 and
21.00 EUR/m². The 6.00 is a job won on a discount, the 21.00 a difficult one.

A mean says 12.00. A median says 9.00. That 33 % gap is the whole argument for
the design, and it is why last-write-wins — the obvious implementation — would
have let one discounted job reset a business's standard rate.
"""
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


# The repository's own rule, extracted so it can be exercised: positive
# amounts only, median over them.
def learned(amounts):
    kept = [a for a in amounts if a > 0]
    return round(statistics.median(kept), 2) if kept else None


print("── the median is not the mean, and the difference is the point ──")
SAMPLES = [9.00, 6.00, 21.00]
check(learned(SAMPLES) == 9.00, f"three accepted quotes learn 9,00 ({learned(SAMPLES)})")
check(round(statistics.mean(SAMPLES), 2) == 12.00,
      "a mean would have said 12,00 — a third higher, on the strength of one job")
check(learned([9.00]) == 9.00, "one accepted quote is already better than a catalogue average")
check(learned([9.00, 6.00]) == 7.50, "two average out, which is what a median of two is")

print("\n── a discount does not become the standard rate ──")
# The failure mode last-write-wins produces: quote at 9, discount to 6 to win
# the next one, and every future quote now starts at 6.
check(learned([9.00, 6.00, 9.00]) == 9.00,
      "one discount among three does not move the rate")
check(learned([9.00, 9.00, 9.00, 6.00]) == 9.00, "nor among four")
# It should move once the discount is the business, not the exception.
check(learned([6.00, 6.00, 6.00, 9.00]) == 6.00,
      "but a sustained lower price does move it — this is learning, not stubbornness")

print("\n── goodwill is not a rate ──")
check(learned([0, 9.00, 9.00]) == 9.00, "a 0 EUR line is dropped, not averaged in")
check(learned([0, 0]) is None, "and a set of nothing but zeroes learns nothing")
check(learned([]) is None, "no samples, no rate")

print("\n── the estimator consumes what is learned ──")
from services import estimator as E  # noqa: E402

base = E.estimate("maler.innenanstrich", {"qty": 60})
own = E.estimate("maler.innenanstrich", {"qty": 60}, rates={"maler.anstrich2": 9.00})
line = next(l for l in own["lines"] if l["rate_key"] == "maler.anstrich2")
check(line["unit_price"] == 9.00, "a learned rate replaces the catalogue default")
check(line["rate_source"] == "pro", "and is labelled as the business's own")
check(all(l["rate_source"] == "catalogue" for l in base["lines"]),
      "with no learned rates, every position says catalogue")
check(base["rates_applied"] == 0 and own["rates_applied"] == 1,
      "the count of business-priced positions is reported")

# total_net and lines_net measure different things once a business's own
# prices are in play, and collapsing them would throw away the comparison a
# pro most wants: the catalogue says this, your own rates say that.
check(own["total_net"] == base["total_net"],
      "the modelled range is unchanged — it is what the catalogue says, "
      "not what this business charges")
check(own["lines_net"] != base["lines_net"], "but what the positions come to does move")
lo, hi = base["total_net"]
check(lo * 0.97 <= base["lines_net"] <= hi * 1.03,
      "with no overrides the positions sit inside the modelled range")
check(own["lines_net"] > hi,
      f"and may legitimately sit outside it once they do not "
      f"({own['lines_net']} vs {own['total_net']}) — this pro charges above the model")

print("\n── the join that makes any of it possible ──")
# rate_key was silently dropped on the way into quote_lines, which cut the
# link from an accepted position back to the thing it prices.
import re  # noqa: E402

quotes_src = (Path(__file__).resolve().parent.parent
              / "repositories" / "quotes.py").read_text()
fields = re.search(r"LINE_FIELDS = \{(.*?)\}", quotes_src, re.S).group(1)
check('"rate_key"' in fields, "quote_lines accepts rate_key")
check("rates_repo.learn_from_quote" in quotes_src, "acceptance triggers learning")
check("except Exception" in quotes_src.split("learn_from_quote")[1][:400],
      "and a failure there never costs the pro the acceptance itself")

# Every operation the estimator emits must produce a key the join can use.
cat = E.catalogue()
bad = [f"{j['key']}/{o['key']}" for j in cat["jobs"] for o in j["operations"]
       if "." not in E.rate_key(j, o)]
check(not bad, f"every operation yields a joinable rate key ({len(bad)} bad)")
keys = {E.rate_key(j, o) for j in cat["jobs"] for o in j["operations"]}
check(len(keys) > 200, f"{len(keys)} distinct rate keys across the catalogue")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
for f in fails:
    print("  ·", f)
sys.exit(1 if fails else 0)
