"""Stored estimates and the calibration derived from them.

The join that makes the feedback loop possible is unglamorous: an estimate
knows its `job_id`, a job owns its `job_time_logs`, and the difference between
predicted and measured hours is one subtraction. Everything interesting is in
deciding which rows are allowed to count.

Only **finished** jobs count, and only jobs with a **stopped** timer. A running
timer has no duration, and a job still in progress has not finished being slow
yet — counting either would make every business look fast in week one and slow
in week three.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from db import pg
from services import calibration

# Statuses where the work is over and the hours are final.
DONE = ("completed", "invoiced", "closed")


async def save(pro_id: str, estimate: dict, *, job_id: Optional[str] = None,
               quote_id: Optional[str] = None,
               calibration_applied: Optional[float] = None) -> dict:
    """Freeze one estimate.

    Stored whether or not it became a quote. A pro who calculates a job, reads
    the number and walks away has told us something real about their pricing;
    learning only from work that was won would bias the model toward the jobs
    that were cheap enough to win.
    """
    job = estimate["job"]
    row = {
        "pro_id": pro_id,
        "job_id": job_id,
        "quote_id": quote_id,
        "catalogue_version": estimate.get("catalogue_version") or "unknown",
        "job_key": job["key"],
        "trade": job["trade"],
        "country": estimate["country"],
        "tier": estimate["tier"],
        "answers": json.dumps(estimate.get("answers_echo") or {}),
        "qty": estimate["qty"],
        "unit": job["unit"],
        "hours_low": estimate["hours"][0],
        "hours_high": estimate["hours"][1],
        "labour_low": estimate["labour"][0],
        "labour_high": estimate["labour"][1],
        "total_low": estimate["total_net"][0],
        "total_high": estimate["total_net"][1],
        "hourly_low": estimate["hourly_used"][0],
        "hourly_high": estimate["hourly_used"][1],
        "lines": json.dumps(estimate.get("lines") or []),
        "calibration_applied": calibration_applied,
    }
    cols = list(row)
    return await pg.fetchrow(
        f"insert into job_estimates ({', '.join(cols)}) "
        f"values ({pg.placeholders(len(cols))}) returning *", *row.values())


async def attach(pro_id: str, estimate_id: str, *, job_id: Optional[str] = None,
                 quote_id: Optional[str] = None) -> Optional[dict]:
    """Link an estimate to the job or quote it turned into.

    Separate from `save` because the order varies: the guided form is often
    filled in before a job exists, and the quote is created after.
    """
    sets, args = [], []
    for col, val in (("job_id", job_id), ("quote_id", quote_id)):
        if val:
            args.append(val)
            sets.append(f"{col} = ${len(args)}")
    if not sets:
        return None
    args += [estimate_id, pro_id]
    return await pg.fetchrow(
        f"update job_estimates set {', '.join(sets)} "
        f"where id = ${len(args) - 1} and pro_id = ${len(args)} returning *", *args)


async def measured(pro_id: str) -> list[dict]:
    """Every estimate whose job is finished and timed.

    The `sum(seconds)` is over stopped entries only — `seconds` is a generated
    column that is null while a timer runs, so a forgotten running timer
    excludes itself rather than counting as zero.
    """
    return await pg.fetch(
        """
        select e.id, e.job_key, e.trade, e.qty, e.unit, e.created_at,
               e.hours_low, e.hours_high, e.labour_low, e.labour_high,
               e.total_low, e.total_high, e.calibration_applied,
               j.job_number, j.title, j.status,
               t.actual_seconds
          from job_estimates e
          join jobs j on j.id = e.job_id and j.deleted_at is null
          join lateral (
                 select sum(l.seconds) as actual_seconds
                   from job_time_logs l
                  where l.job_id = j.id and l.stopped_at is not null
               ) t on true
         where e.pro_id = $1
           and j.status = any($2::job_status[])
           and coalesce(t.actual_seconds, 0) > 0
         order by e.created_at desc
        """, pro_id, list(DONE))


def _samples(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        hours = float(r["actual_seconds"]) / 3600.0
        out.append({
            "actual_hours": hours,
            "hours_low": float(r["hours_low"]),
            "hours_high": float(r["hours_high"]),
            "labour_mid": (float(r["labour_low"]) + float(r["labour_high"])) / 2,
            "calibration_applied": (float(r["calibration_applied"])
                                    if r["calibration_applied"] is not None else None),
        })
    return out


async def recompute(pro_id: str) -> dict:
    """Rebuild every calibration for this business from scratch.

    Recomputed rather than updated incrementally. An incremental median needs
    the whole history anyway, and a full rebuild means correcting one bad
    timer entry actually fixes the number instead of leaving it baked in.
    """
    rows = await measured(pro_id)
    by_scope: dict[str, list[dict]] = {}
    for r in rows:
        s = _samples([r])[0]
        by_scope.setdefault(calibration.scope_trade(r["trade"]), []).append(s)
        by_scope.setdefault(calibration.scope_job(r["job_key"]), []).append(s)

    written = []
    for scope, samples in by_scope.items():
        summary = calibration.summarise(samples)
        if not summary:
            continue
        await pg.execute(
            """
            insert into pro_calibration
                   (pro_id, scope, hours_factor, realised_hourly, samples,
                    factor_low, factor_high, computed_at)
            values ($1, $2, $3, $4, $5, $6, $7, now())
            on conflict (pro_id, scope) do update set
                hours_factor    = excluded.hours_factor,
                realised_hourly = excluded.realised_hourly,
                samples         = excluded.samples,
                factor_low      = excluded.factor_low,
                factor_high     = excluded.factor_high,
                computed_at     = now()
            """,
            pro_id, scope, summary["hours_factor"], summary["realised_hourly"],
            summary["samples"], summary["factor_low"], summary["factor_high"])
        written.append({"scope": scope, **summary})

    # A scope that no longer has any measured jobs — every one of its jobs
    # deleted or reopened — must not keep applying a factor nobody can trace.
    if by_scope:
        await pg.execute(
            "delete from pro_calibration where pro_id = $1 and scope <> all($2::text[])",
            pro_id, list(by_scope))
    else:
        await pg.execute("delete from pro_calibration where pro_id = $1", pro_id)

    written.sort(key=lambda w: (-w["samples"], w["scope"]))
    return {"scopes": written, "jobs_measured": len(rows)}


async def calibrations(pro_id: str) -> dict[str, dict]:
    rows = await pg.fetch(
        "select scope, hours_factor, realised_hourly, samples, factor_low, "
        "factor_high, computed_at from pro_calibration where pro_id = $1", pro_id)
    return {r["scope"]: {**r, "hours_factor": float(r["hours_factor"])} for r in rows}


async def accuracy(pro_id: str) -> dict:
    """Per-job comparison, newest first, plus the headline numbers.

    The headline a tradesperson has never seen: what an hour actually earned,
    against what they thought they were charging. It is usually lower, and the
    gap is the whole argument for the product.
    """
    rows = await measured(pro_id)
    jobs = []
    for r in rows:
        hours = float(r["actual_seconds"]) / 3600.0
        predicted = (float(r["hours_low"]) + float(r["hours_high"])) / 2
        labour = (float(r["labour_low"]) + float(r["labour_high"])) / 2
        ratio = calibration.sample_ratio(
            hours, r["hours_low"], r["hours_high"],
            calibration_applied=(float(r["calibration_applied"])
                                 if r["calibration_applied"] is not None else None))
        jobs.append({
            "estimate_id": str(r["id"]),
            "job_key": r["job_key"], "trade": r["trade"],
            "job_number": r["job_number"], "title": r["title"],
            "qty": float(r["qty"]), "unit": r["unit"],
            "predicted_hours": round(predicted, 2),
            "actual_hours": round(hours, 2),
            "ratio": round(ratio, 2) if ratio else None,
            # Excluded from the median but shown, so a pro can see which job
            # was thrown out and go and fix the timer entry.
            "excluded": ratio is None,
            "realised_hourly": round(labour / hours, 2) if hours else None,
            "created_at": r["created_at"],
        })

    overall = calibration.summarise(_samples(rows))
    quoted = [float(r["labour_low"] + r["labour_high"]) / 2 for r in rows]
    total_hours = sum(float(r["actual_seconds"]) / 3600.0 for r in rows)
    return {
        "jobs": jobs,
        "overall": overall,
        "jobs_measured": len(rows),
        "realised_hourly_all":
            round(sum(quoted) / total_hours, 2) if total_hours else None,
    }
