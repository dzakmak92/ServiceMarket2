"""The feedback loop's arithmetic — pure, no database.

The four samples below are the ones run against the real Supabase schema while
building this: three honest jobs at 1.25, 1.25 and 1.5 times the predicted
hours, and one where the timer ran overnight at 4.0. Every guard here exists
because of what happens if it is missing, and the overnight timer is the case
that motivates most of them.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import calibration as C  # noqa: E402

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def s(actual, lo=8.0, hi=12.0, labour=490.0, applied=None):
    return {"actual_hours": actual, "hours_low": lo, "hours_high": hi,
            "labour_mid": labour, "calibration_applied": applied}


print("── one sample, measured against the midpoint ──")
check(C.sample_ratio(10, 8, 12) == 1.0, "10 h against a predicted 8-12 is exactly on")
check(C.sample_ratio(12.5, 8, 12) == 1.25, "12.5 h is 1.25x")
# Against the low end every business looks slow; against the high end every
# business looks fast. The midpoint is the number a pro would have quoted.
check(C.sample_ratio(8, 8, 12) == 0.8, "the low end is not the yardstick")
check(C.sample_ratio(0, 8, 12) is None, "a job with no measured time is not a sample")
check(C.sample_ratio(10, 0, 0) is None, "a prediction of zero hours is not a sample")

print("\n── a job that went wrong is not evidence about speed ──")
# The gate is at 3x, not at the timer-error scale: a job that took three times
# the estimate did not take three times as long to paint a wall. The scope was
# wrong, or a timer ran over a weekend. Neither is a fact about how fast this
# business works, and both would raise every future price.
check(C.sample_ratio(40, 8, 12) is None, "4.0x is out")
check(C.sample_ratio(60, 8, 12) is None, "6.0x — a timer left running — is out")
check(C.sample_ratio(1, 8, 12) is None, "0.1x, started and stopped by accident, is out")
check(C.sample_ratio(25, 8, 12) == 2.5, "2.5x is painful but real, and counts")
check(C.sample_ratio(4, 8, 12) == 0.4, "and so does a genuinely fast job at 0.4x")

print("\n── the median alone would not have caught it ──")
r = C.summarise([s(12.5), s(12.5), s(15.0), s(40.0)])
check(r["samples"] == 3, f"the 40 h job is excluded from the count ({r['samples']})")
check(r["hours_factor"] == 1.25, f"factor is the median 1.25, not the mean ({r['hours_factor']})")
check(r["factor_low"] == 1.25 and r["factor_high"] == 1.5,
      "the spread is reported, so the number is not a bare claim")
# Why the gate is needed at all: with an even sample count the median averages
# the middle two, so an outlier still moves the answer.
check(round(sum(sorted([1.25, 1.25, 1.5, 4.0])[1:3]) / 2, 3) == 1.375,
      "without the gate those same four samples would have given 1.375")
check(r["applies"], "three samples is enough to apply")
check(not C.summarise([s(12.5), s(12.5)])["applies"],
      "two is not — an anecdote must not move prices")
check(C.summarise([]) is None, "no samples produces no calibration")
check(C.summarise([s(0), s(0)]) is None, "nor do samples that are all unusable")

print("\n── the clamp catches what the gate let through ──")
slow = C.summarise([s(23), s(24), s(25)])
check(slow["hours_factor"] == 2.0, f"clamped to 2.0 (raw {slow['hours_factor_raw']})")
check(slow["clamped"], "and says it clamped rather than hiding it")
check(slow["hours_factor_raw"] > 2.0, "the raw median is kept for the pro to see")
# Inside the 0.33 gate but below the 0.5 clamp, so the clamp is what fires
# rather than the gate — the two guards are doing different jobs.
fast = C.summarise([s(4.0), s(4.2), s(3.8)])
check(fast["hours_factor"] == 0.5,
      f"and at the other end (raw {fast['hours_factor_raw']})")
check(not C.summarise([s(12.5), s(12.5), s(15.0)])["clamped"],
      "a normal business is not clamped")

print("\n── the correction does not compound ──")
# The trap: an estimate produced WITH a 1.25 factor already applied, where the
# job then took exactly that long. The business is still 1.25x the catalogue.
# Without undoing the applied factor this reads as 1.0 and the calibration
# walks back to neutral on every completed job.
naive = C.sample_ratio(12.5, 10, 15)
check(naive == 1.0, "an already-calibrated estimate that was met reads as 1.0 raw")
undone = C.sample_ratio(12.5, 10, 15, calibration_applied=1.25)
check(undone == 1.25, "undoing the applied factor restores the real 1.25")
loop = C.summarise([s(12.5, 10, 15, applied=1.25)] * 3)
check(loop["hours_factor"] == 1.25, "so the factor holds instead of decaying to 1.0")

print("\n── what an hour actually earned ──")
# The number almost no small business computes for itself: quoted labour
# divided by the hours the work really took, not the rate on the quote.
earned = C.summarise([s(12.5, labour=490.0)] * 3)
check(earned["realised_hourly"] == 39.2,
      f"490 EUR over 12.5 h is 39.20 EUR/h, not the 49 EUR that was quoted "
      f"({earned['realised_hourly']})")
check(C.summarise([s(12.5, labour=None)] * 3)["realised_hourly"] is None,
      "and is absent rather than zero when there is no labour figure")

print("\n── which scope applies ──")
cals = {
    "trade:maler": {"hours_factor": 1.1, "samples": 12},
    "job:maler.fassade": {"hours_factor": 1.6, "samples": 4},
    "job:maler.decke": {"hours_factor": 0.7, "samples": 2},
}
check(C.pick(cals, job_key="maler.fassade", trade="maler")["scope"] == "job:maler.fassade",
      "job-specific wins when it has its own evidence")
check(C.pick(cals, job_key="maler.decke", trade="maler")["scope"] == "trade:maler",
      "two samples on one job type falls back to the trade, which has twelve")
check(C.pick(cals, job_key="maler.tapezieren", trade="maler")["scope"] == "trade:maler",
      "an unseen job type uses the trade-wide figure")
check(C.pick(cals, job_key="sanitaer.wc_tauschen", trade="sanitaer") is None,
      "and an unseen trade gets nothing rather than a painter's speed")
check(C.pick({}, job_key="maler.decke", trade="maler") is None, "no data, no calibration")

print("\n── the sentence the pro reads ──")
check("länger" in C.explain({"hours_factor": 1.25, "samples": 7, "scope": "trade:maler"}),
      "a factor above 1 says longer, not just a number")
check("schneller" in C.explain({"hours_factor": 0.8, "samples": 7, "scope": "job:x"}),
      "and below 1 says faster")
check("25 %" in C.explain({"hours_factor": 1.25, "samples": 7, "scope": "trade:maler"}),
      "with the size of the gap")
check(C.explain(None) is None, "no calibration, no sentence")

print("\n── the estimator applies it to hours, never to the rate ──")
from services import estimator as E  # noqa: E402

base = E.estimate("maler.innenanstrich", {"qty": 60})
adj = E.estimate("maler.innenanstrich", {"qty": 60},
                 calibration={"hours_factor": 1.25, "scope": "trade:maler", "samples": 7})
check(abs(adj["hours"][0] / base["hours"][0] - 1.25) < 0.01, "hours scale by the factor")
check(adj["hourly_used"] == base["hourly_used"],
      "the hourly rate is untouched — a business that runs long has a time "
      "problem, and inflating the rate would hide it behind the number a "
      "customer compares against competitors")
check(adj["material"] == base["material"], "material does not take longer")
check(adj["total_net"][0] > base["total_net"][0], "but the total does move")
lo, hi = adj["total_net"]
check(lo * 0.97 <= adj["lines_net"] <= hi * 1.03,
      f"and the positions still add up ({adj['lines_net']} in {adj['total_net']})")
setup_line = next(l for l in adj["lines"] if l["unit"] == "h")
base_setup = next(l for l in base["lines"] if l["unit"] == "h")
check(setup_line["unit_price"] == base_setup["unit_price"]
      and setup_line["qty"] > base_setup["qty"],
      "the setup line grows in hours, not in rate — it is the one position "
      "where the customer can see both")
check(E.estimate("maler.innenanstrich", {"qty": 60})["calibration"] is None,
      "an uncalibrated estimate says so")
check(adj["calibration"]["samples"] == 7, "a calibrated one carries its evidence")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
for f in fails:
    print("  ·", f)
sys.exit(1 if fails else 0)
