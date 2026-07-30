"""Estimator + band validation harness."""
from schema import (COND_UPLIFT, COND_SETUP_ADD, ACCESS_UPLIFT, HOURLY,
                    DISPOSAL_PER_T, BAUSCHUTT_KG_PER_M3)

def estimate(job, qty, *, country="AT", condition="renovierung_leer",
             access="eg_oder_lift", tier="standard", hourly=None):
    order = {"basic": 0, "standard": 1, "premium": 2}
    want = order[tier]
    h_lo, h_hi = hourly or HOURLY[country][job.trade]
    cu_lo, cu_hi = COND_UPLIFT[condition]
    au_lo, au_hi = ACCESS_UPLIFT[access]
    su_lo, su_hi = COND_SETUP_ADD[condition]
    up_lo, up_hi = 1 + cu_lo + au_lo, 1 + cu_hi + au_hi

    work_lo = work_hi = 0.0
    mat_lo = mat_hi = 0.0
    debris_lo = debris_hi = 0.0
    lines = []
    for op in job.operations:
        if order[op.tier_min] > want or op.optional:
            continue
        wl = qty * op.hours_per_unit[0] * up_lo
        wh = qty * op.hours_per_unit[1] * up_hi
        ml = qty * op.material_per_unit[0] * (1 + op.waste_factor)
        mh = qty * op.material_per_unit[1] * (1 + op.waste_factor)
        work_lo += wl; work_hi += wh; mat_lo += ml; mat_hi += mh
        debris_lo += qty * op.debris_kg_per_unit[0]
        debris_hi += qty * op.debris_kg_per_unit[1]
        lines.append((op, (wl, wh), (ml, mh)))

    setup = (job.setup_hours[0] + su_lo, job.setup_hours[1] + su_hi)
    hours = (work_lo + setup[0], work_hi + setup[1])
    labour = (hours[0] * h_lo, hours[1] * h_hi)
    disposal = (debris_lo / 1000 * DISPOSAL_PER_T[country][0],
                debris_hi / 1000 * DISPOSAL_PER_T[country][1])
    total = (labour[0] + mat_lo + disposal[0], labour[1] + mat_hi + disposal[1])
    return {"job": job, "qty": qty, "hours": hours, "setup": setup,
            "labour": labour, "material": (mat_lo, mat_hi),
            "debris_kg": (debris_lo, debris_hi), "disposal": disposal,
            "total": total, "per_unit": (total[0]/qty, total[1]/qty), "lines": lines}

def validate(job, *, country="AT", condition="renovierung_leer"):
    """Does this job land inside its published market band at typical size?"""
    band = job.market_band_at if country == "AT" else job.market_band_de
    if not band:
        return None
    lo_q, hi_q = job.typical_size
    mid_q = (lo_q + hi_q) / 2
    r = estimate(job, mid_q, country=country, condition=condition)
    pu = r["per_unit"]
    # Overlap is too weak a test: a range of 5..18 "overlaps" a band of 7..12
    # while being wrong at both ends. The MIDPOINT must sit inside the band —
    # that is the number a pro would actually quote.
    mid = (pu[0] + pu[1]) / 2
    overlap = band[0] <= mid <= band[1]
    return {"job": job.key, "country": country, "qty": mid_q, "mid": mid,
            "estimate": pu, "band": band, "ok": overlap,
            "hours": r["hours"], "total": r["total"]}
