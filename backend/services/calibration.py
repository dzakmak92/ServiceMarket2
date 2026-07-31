"""What the estimates got wrong, and by how much.

The catalogue is a model of the trade. This is what turns it into a model of
one business — the only part a competitor cannot copy, because it is made of
that business's own hours.

The arithmetic is deliberately dull. Everything here is pure so it can be
argued with and tested without a database, and every guard exists because the
alternative failure is worse than no calibration at all.

**Median, not mean.** One job where the timer ran overnight would drag a mean
factor to 3x and quietly inflate every future estimate. A median ignores it.

**A floor on samples.** Two jobs are an anecdote. Below MIN_SAMPLES the factor
is computed and reported but not applied, so a pro can see it forming before
it starts changing prices behind their back.

**A clamp.** A factor outside CLAMP is not a slow tradesperson, it is a data
problem: a timer left running, a job logged against the wrong estimate, a
quantity typed with a stray zero. Applying it would be acting confidently on
something that is probably a bug.

**No compounding.** An estimate produced *with* a calibration already applied
must be un-applied before it is compared, or the correction squares itself
every time a job completes. `job_estimates.calibration_applied` records what
was in force; `_undo` reverses it.
"""
from __future__ import annotations

import statistics
from typing import Any, Iterable, Optional

# Below this the factor is informational only. Three is not statistically
# respectable; it is the point at which a tradesperson recognises the pattern
# themselves, which is what makes the number credible to them.
MIN_SAMPLES = 3

# Outside this a factor is a data problem, not a business fact.
CLAMP = (0.5, 2.0)

# A sample this far off is dropped before the median rather than clamped into
# it. The line is at 3x, not at the timer-error scale, because of what the
# factor is *for*: it models how fast this business works. A job that took
# three times the estimate did not take three times as long to paint a wall —
# the scope was wrong, or the substrate was, or a timer ran over a weekend.
# None of those are facts about speed, and letting them in raises the price of
# every future job on the strength of one bad day.
#
# The median alone is not enough to catch this. Four samples at 1.25, 1.25,
# 1.5 and 4.0 have a median of 1.375: with an even count the middle two are
# averaged, so the outlier still moves the answer.
OUTLIER = (0.33, 3.0)


def scope_trade(trade: str) -> str:
    return f"trade:{trade}"


def scope_job(job_key: str) -> str:
    return f"job:{job_key}"


def _undo(measured_ratio: float, applied: Optional[float]) -> float:
    """Ratio as it would have been against the uncalibrated catalogue.

    If an estimate was already scaled by 1.2 and the job then took 1.0x that
    estimate, the business is really 1.2x the catalogue — not 1.0x. Skipping
    this makes every completed job push the factor back toward 1.0.
    """
    if applied and applied > 0:
        return measured_ratio * float(applied)
    return measured_ratio


def sample_ratio(actual_hours: float, hours_low: float, hours_high: float,
                 *, calibration_applied: Optional[float] = None) -> Optional[float]:
    """One job's measured hours against what was predicted.

    Compared against the midpoint, which is the number a pro would have
    quoted. Comparing against the low end would make every business look slow
    and against the high end would make every business look fast.
    """
    predicted = (float(hours_low) + float(hours_high)) / 2
    if predicted <= 0 or actual_hours <= 0:
        return None
    ratio = _undo(float(actual_hours) / predicted, calibration_applied)
    if not OUTLIER[0] <= ratio <= OUTLIER[1]:
        return None
    return ratio


def summarise(samples: Iterable[dict]) -> Optional[dict]:
    """Fold measured jobs into one calibration.

    Each sample needs `actual_hours`, `hours_low`, `hours_high`; optionally
    `labour_mid` and `calibration_applied`.
    """
    ratios: list[float] = []
    realised: list[float] = []
    for s in samples:
        r = sample_ratio(s.get("actual_hours") or 0, s.get("hours_low") or 0,
                         s.get("hours_high") or 0,
                         calibration_applied=s.get("calibration_applied"))
        if r is None:
            continue
        ratios.append(r)
        # What an hour of this work actually earned. Quoted labour divided by
        # the hours it really took — not the rate on the quote, which is the
        # rate before the job overran.
        labour = s.get("labour_mid")
        hours = s.get("actual_hours") or 0
        if labour and hours > 0:
            realised.append(float(labour) / float(hours))

    if not ratios:
        return None

    median = statistics.median(ratios)
    factor = min(max(median, CLAMP[0]), CLAMP[1])
    return {
        "samples": len(ratios),
        # The raw median is kept alongside the clamped one: if they differ,
        # the clamp fired, and that is worth showing rather than hiding.
        "hours_factor": round(factor, 3),
        "hours_factor_raw": round(median, 3),
        "clamped": abs(median - factor) > 1e-9,
        "factor_low": round(min(ratios), 3),
        "factor_high": round(max(ratios), 3),
        "realised_hourly": round(statistics.median(realised), 2) if realised else None,
        "applies": len(ratios) >= MIN_SAMPLES,
    }


def pick(calibrations: dict[str, dict], *, job_key: str, trade: str) -> Optional[dict]:
    """The calibration to apply to one estimate.

    Job-specific wins when it has enough samples of its own, because being slow
    on Fassade specifically is a different fact from being slow in general.
    Otherwise the trade-wide figure, which generalises from far fewer jobs —
    a painter who is a fifth faster than the catalogue is usually a fifth
    faster at everything.
    """
    for scope in (scope_job(job_key), scope_trade(trade)):
        c = calibrations.get(scope)
        if c and c.get("samples", 0) >= MIN_SAMPLES:
            return {**c, "scope": scope}
    return None


def explain(c: Optional[dict]) -> Optional[str]:
    """One German sentence for the pro. Says the direction, not just a number."""
    if not c:
        return None
    f = float(c["hours_factor"])
    n = c.get("samples", 0)
    what = "Ihren Aufträgen" if str(c.get("scope", "")).startswith("trade:") else "dieser Arbeit"
    if f > 1.02:
        return (f"Auf Basis von {n} abgerechneten Aufträgen brauchen Sie für "
                f"{what} rund {round((f - 1) * 100)} % länger als der Richtwert. "
                f"Die Schätzung ist entsprechend angehoben.")
    if f < 0.98:
        return (f"Auf Basis von {n} abgerechneten Aufträgen sind Sie bei {what} "
                f"rund {round((1 - f) * 100)} % schneller als der Richtwert. "
                f"Die Schätzung ist entsprechend gesenkt.")
    return (f"Auf Basis von {n} abgerechneten Aufträgen entsprechen Ihre Zeiten "
            f"dem Richtwert.")
