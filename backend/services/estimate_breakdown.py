"""Where the number came from, and what the other answers would cost.

The estimator returns one range. This turns that into the two things a
tradesperson actually asks when they look at it:

  · **How does it add up?** A base figure plus one line per answer that moved
    it, ending on the total the header shows.
  · **What if I picked the other one?** For every option of every priced
    question, what the total would become.

Both are computed by running the estimator again with different answers,
never by re-deriving its arithmetic. That matters: a breakdown that models
the pricing separately is a second implementation to keep in step, and it
will drift — this one cannot disagree with the estimate, because it *is* the
estimate, run again.

Cost measured at 0.044 ms per run over the cached catalogue; the job with the
most options needs eight runs, so the whole block costs under half a
millisecond. That is why this is done on the server in one request rather
than by the phone firing eight.

**Only the questions that actually move the price appear here.** That is
`condition`, `access` and the quantity — the same set the estimator reports
in `answers_applied`. Questions declared `affects="variant"` are recorded and
attach notes but the arithmetic does not read them, so listing them would
produce a column of "± € 0" rows that look like a bug and are in fact the
truth about a field that should not have implied otherwise.
"""
from __future__ import annotations

from typing import Any, Optional

from services import estimator

# The answers that reach the total. `emergency` is derived rather than asked,
# so it is not something the pro picks an option for.
PRICED = ("condition", "access")


def _neutral(cat: dict, key: str) -> Optional[str]:
    """The option of a priced question that adds nothing.

    Read from the modifier table rather than hardcoded, so adding a condition
    to the catalogue cannot leave this pointing at the wrong baseline. There
    is exactly one zero-uplift option in each table today; if that ever stops
    being true the first one wins, which is the conservative choice — a base
    that is too low makes the deltas too large and visible, rather than
    hiding them.
    """
    table = cat.get("modifiers", {}).get(f"{key}_uplift", {})
    for value, span in table.items():
        if not any(float(x) for x in span):
            return value
    return None


def _total(job_key: str, answers: dict, **kw) -> list[float]:
    return estimator.estimate(job_key, answers, **kw)["total_net"]


def build(job_key: str, answers: dict, applied: list[str], form: list[dict],
          **kw: Any) -> dict:
    """The breakdown and the alternatives for one estimate.

    `applied` is the estimator's own `answers_applied` — what it says it
    used. Passing it in rather than deciding here keeps one source of truth
    for that question, which is the thing that went wrong when the badge
    logic tried to decide for itself.
    """
    cat = estimator.catalogue()
    answers = dict(answers or {})
    by_key = {q["key"]: q for q in (form or [])}

    # Which priced questions are on this form and were used.
    priced = [k for k in PRICED if k in by_key and k in applied]

    # ── the breakdown ────────────────────────────────────────────────
    #
    # Cumulative, not independent. Each delta is measured against the state
    # with every earlier answer already applied, so the lines sum to the
    # total by construction rather than by hoping the uplifts compose. The
    # last line lands exactly on the figure in the header — which is the only
    # property that makes a breakdown worth printing.
    neutral = dict(answers)
    for k in priced:
        n = _neutral(cat, k)
        if n is not None:
            neutral[k] = n

    base = _total(job_key, neutral, **kw)
    steps: list[dict] = []
    running = dict(neutral)
    prev = base
    for k in priced:
        running[k] = answers.get(k)
        now = _total(job_key, running, **kw)
        q = by_key[k]
        steps.append({
            "key": k,
            "label": q.get("label_de") or k,
            "value_label": _label_for(q, answers.get(k)),
            "delta": [round(now[0] - prev[0], 2), round(now[1] - prev[1], 2)],
        })
        prev = now

    # ── the alternatives ─────────────────────────────────────────────
    alternatives: dict[str, list[dict]] = {}
    for k in priced:
        q = by_key[k]
        current = _total(job_key, answers, **kw)
        opts = []
        for value, label in (q.get("options") or []):
            trial = dict(answers)
            trial[k] = value
            t = _total(job_key, trial, **kw)
            opts.append({
                "value": value,
                "label": label,
                "total_net": [round(t[0], 2), round(t[1], 2)],
                # Against what is selected now, because that is the
                # comparison being made when someone looks at the chip.
                "delta": [round(t[0] - current[0], 2), round(t[1] - current[1], 2)],
                "selected": value == answers.get(k),
            })
        alternatives[k] = opts

    return {
        "base_net": [round(base[0], 2), round(base[1], 2)],
        "steps": steps,
        "alternatives": alternatives,
    }


def _label_for(question: dict, value: Any) -> str:
    for v, label in (question.get("options") or []):
        if v == value:
            return label
    return "" if value is None else str(value)
