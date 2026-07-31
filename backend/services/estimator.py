"""Estimation from the DE/AT coefficient catalogue.

Turns a handful of survey answers into hours, material, debris, disposal and a
set of quote lines — deterministically, offline, with no model involved.

The catalogue (`backend/data/estimation_catalogue.json`) is the data; this is
the arithmetic. Both were validated together: 187 of 188 job/country pairs land
inside a published DE/AT market band, and the harness that proves it lives in
`backend/tools/catalogue/`. The maths here is deliberately identical to
`backend/tools/catalogue/engine.py` — if the two drift, the validation stops
saying anything about what the app actually quotes.

Four properties are deliberate.

**Output is a range, never a point.** The low and high are both real, and the
caller decides where in it to price. A single number would be a false
precision the underlying coefficients cannot support.

**The pro's own rate wins.** Hourly rates from the catalogue are a cold start
for someone who has never quoted the work. Once `pro_rates` holds a real
figure, that is used instead — which is the whole reason the catalogue is
built on hours rather than prices.

**Notes are attached, not merged.** Each triggered note comes back separately
with its severity, so the UI can show a critical asbestos warning differently
from a note about who moves the furniture, and the pro can remove any of them
before sending.

**The lines add up.** An estimate whose positions sum to less than its own
total is worse than no estimate: the pro sends the positions, not the summary.
So setup hours and disposal get their own lines, uplifts are carried in the
labour unit prices, and `lines_net` reports what the positions actually come
to.

**Answers that did not move the number say so.** The catalogue has one
quantity axis per job plus condition, access and Notdienst. Questions declared
`affects="variant"` — tile format, wallpaper pattern match, felling in a
confined space — are recorded and attach notes, but nothing in the arithmetic
reads them yet. `answers_applied` and `answers_recorded` come back separately
rather than letting the caller assume every question was priced, because the
alternative is a quote whose assumptions promise work the total does not
contain.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

CATALOGUE_PATH = Path(__file__).resolve().parent.parent / "data" / "estimation_catalogue.json"

TIER_ORDER = {"basic": 0, "standard": 1, "premium": 2}

SETUP_LABEL = "Anfahrt, Einrichten und Schutzmaßnahmen"
DISPOSAL_LABEL = "Entsorgung inkl. Container"

# Answers that mean the work is not happening on an ordinary weekday. The
# catalogue prices these off the Notdienst rate rather than an uplift, because
# in both markets a call-out at night is sold as a different service, not the
# same service with a surcharge.
OUT_OF_HOURS = {"nacht_sonntag"}


@lru_cache(maxsize=1)
def catalogue() -> dict:
    """Loaded once per process. It is a static asset, not per-request data."""
    with CATALOGUE_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def jobs(*, trade: Optional[str] = None, group: Optional[str] = None) -> list[dict]:
    out = catalogue()["jobs"]
    if trade:
        out = [j for j in out if j["trade"] == trade]
    if group:
        out = [j for j in out if j["group"] == group]
    return out


def get_job(job_key: str) -> Optional[dict]:
    return next((j for j in catalogue()["jobs"] if j["key"] == job_key), None)


def rate_key(job: dict, op: dict) -> str:
    """The `pro_rates.key` this operation learns from.

    The catalogue does not carry rate keys — it is a physical model of hours
    and material, deliberately free of anyone's prices. The join to a business's
    own pricing is made here, by convention, so a pro who overrides
    "elektrik.steckdose_setzen" once has it applied on every job that contains
    that operation.
    """
    return f"{job['trade']}.{op['key']}"


def qty_question(job: dict) -> Optional[dict]:
    """The guided-form question that sets the quantity, if there is one.

    Only a question measured in the job's own unit can be the quantity. Several
    jobs ask for something else that scales the work — cable run in lfm for a
    socket priced per Stk, bathroom area for a full refit priced per job — and
    treating those as the quantity would quote six outdoor sockets when the
    customer asked for one six metres away. Those answers are recorded and
    shown, but they do not multiply anything: the catalogue has a single
    quantity axis per job and pretending otherwise would be arithmetic the
    coefficients cannot support.
    """
    for q in job.get("guided_form") or []:
        if q.get("affects") == "qty" and (q.get("unit") or "") == job["unit"]:
            return q
    return None


def _rng(pair) -> tuple[float, float]:
    return float(pair[0]), float(pair[1])


def _mid(pair) -> float:
    return (float(pair[0]) + float(pair[1])) / 2


def resolve_qty(job: dict, answers: dict) -> float:
    """Quantity from the answers, or the middle of the job's typical size.

    The fallback is the midpoint rather than the small end on purpose: an
    estimate that assumes the smallest plausible job flatters itself.
    """
    q = qty_question(job)
    for key in ([q["key"]] if q else []) + ["qty"]:
        val = answers.get(key)
        if val not in (None, ""):
            try:
                v = float(val)
            except (TypeError, ValueError):
                continue
            if v > 0:
                return v
    if job["band_basis"] == "total":
        return 1.0
    return _mid(job["typical_size"])


def estimate(job_key: str, answers: Optional[dict] = None, *, country: str = "AT",
             tier: str = "standard", hourly: Optional[tuple[float, float]] = None,
             rates: Optional[dict] = None,
             calibration: Optional[dict] = None) -> dict:
    """Estimate one job.

    `answers` are the guided-form values. `rates` maps a rate key (see
    `rate_key`) to the business's own EUR amount per unit and overrides the
    catalogue default wherever it applies. `calibration` is what this business's
    own finished jobs have shown about its speed — see
    `services.calibration` — and scales the hours, setup included, because a
    business that is a fifth slower is a fifth slower at unloading the van too.
    """
    cat = catalogue()
    job = get_job(job_key)
    if not job:
        raise LookupError(f"Unknown job type: {job_key}")

    answers = answers or {}
    rates = rates or {}
    country = country if country in ("AT", "DE") else "AT"
    tier = tier if tier in TIER_ORDER else "standard"
    want_tier = TIER_ORDER[tier]

    # Anything absent falls back to the middle of the road rather than the
    # cheapest case. Defaulting to a clean empty new-build would produce an
    # estimate that is only right for the job nobody rings about.
    mods = cat["modifiers"]
    condition = answers.get("condition")
    if condition not in mods["condition_uplift"]:
        condition = "renovierung_leer"
    access = answers.get("access")
    if access not in mods["access_uplift"]:
        access = "eg_oder_lift"
    qty = resolve_qty(job, answers)

    cond_up = _rng(mods["condition_uplift"][condition])
    acc_up = _rng(mods["access_uplift"][access])
    # Dusty work in an occupied flat needs protection and daily cleanup; a
    # service call does not. `messy` is the catalogue's declaration of which
    # this is, and 25 of the job types set it False.
    setup_add = (_rng(mods["condition_setup_add"][condition])
                 if job.get("messy", True) else (0.0, 0.0))

    # Additive, never multiplicative. Stacking multipliers produced a 5.7x
    # worst case in v0 that no customer would have signed.
    up_lo = 1 + cond_up[0] + acc_up[0]
    up_hi = 1 + cond_up[1] + acc_up[1]

    out_of_hours = str(answers.get("zeit") or "") in OUT_OF_HOURS
    emergency = bool(
        (answers.get("emergency") or out_of_hours) and job.get("emergency_capable"))

    if hourly:
        h_lo, h_hi = _rng(hourly)
        rate_basis = "pro"
    elif emergency:
        h_lo, h_hi = _rng(cat["hourly_notdienst"][country])
        rate_basis = "notdienst"
    else:
        h_lo, h_hi = _rng(cat["hourly_rates"][country][job["trade"]])
        rate_basis = "catalogue"
    h_mid = (h_lo + h_hi) / 2

    work = [0.0, 0.0]
    material = [0.0, 0.0]
    debris_kg = [0.0, 0.0]
    disposal = [0.0, 0.0]
    lines: list[dict] = []
    op_notes: list[str] = []

    def _line(**kw) -> None:
        kw.setdefault("waste_factor", 0.0)
        kw.setdefault("is_optional", False)
        kw.setdefault("is_selected", not kw["is_optional"])
        kw["position"] = len(lines) + 1
        kw["unit_price"] = round(float(kw["unit_price"]), 2)
        kw["qty"] = round(float(kw["qty"]), 2)
        lines.append(kw)

    # Setup first: it is the position pros most often forget, and putting it at
    # the top of the quote is the point of separating it out at all.
    setup = (float(job["setup_hours"][0]) + setup_add[0],
             float(job["setup_hours"][1]) + setup_add[1])
    setup_rate = rates.get(f"{job['trade']}.stundensatz")
    _line(kind="labor", description=SETUP_LABEL, qty=_mid(setup), unit="h",
          unit_price=setup_rate if setup_rate is not None else h_mid,
          rate_key=f"{job['trade']}.stundensatz",
          rate_source="pro" if setup_rate is not None else rate_basis)

    for op in job["operations"]:
        if TIER_ORDER.get(op.get("tier_min", "basic"), 0) > want_tier:
            continue

        hpu = _rng(op["hours_per_unit"])
        mpu = _rng(op["material_per_unit"])
        dpu = _rng(op["debris_kg_per_unit"])
        waste = float(op.get("waste_factor") or 0)

        w_lo, w_hi = qty * hpu[0] * up_lo, qty * hpu[1] * up_hi
        work[0] += w_lo
        work[1] += w_hi
        # Waste applies to material only. Nobody buys 8% more labour.
        material[0] += qty * mpu[0] * (1 + waste)
        material[1] += qty * mpu[1] * (1 + waste)

        d_lo, d_hi = qty * dpu[0], qty * dpu[1]
        debris_kg[0] += d_lo
        debris_kg[1] += d_hi
        # Not all debris costs the same to be rid of: excavated soil is a
        # fraction of Bauschutt, Sperrmüll is a multiple of it.
        rate = _rng(cat["disposal_per_tonne"][country].get(
            op.get("debris_type", "bauschutt"),
            cat["disposal_per_tonne"][country]["bauschutt"]))
        disposal[0] += d_lo / 1000 * rate[0]
        disposal[1] += d_hi / 1000 * rate[1]

        op_notes += op.get("note_keys") or []

        # An operation can carry both hours and material — laying turf is
        # labour at 0.03 h/m² and turf at 6-11 EUR/m² in the same line of the
        # catalogue. Those become two positions, because Verschnitt applies to
        # the turf and not to the labour, and because a customer reading
        # "Rollrasen verlegen 2,27 EUR/m²" would rightly ask where the grass
        # is. Folding them into one price hid 1,800 EUR on a 300 m² lawn.
        rk = rate_key(job, op)
        kind = op["kind"] if op["kind"] in ("labor", "material", "travel") else "other"
        has_labour = any(hpu)
        has_material = any(mpu)

        if has_labour:
            own = rates.get(rk)
            # The uplift is carried in the unit price, not applied later. A
            # position that reads 0.07 h/m² on a job quoted at 0.10 h/m² is a
            # position the customer can argue down to the wrong number.
            _line(kind=kind if kind != "material" else "labor",
                  description=op["label_de"], qty=qty, unit=op["unit"],
                  unit_price=(own if own is not None
                              else _mid(hpu) * ((up_lo + up_hi) / 2) * h_mid),
                  rate_key=rk,
                  rate_source="pro" if own is not None else "catalogue")

        if has_material:
            mat_rk = rk if not has_labour else f"{rk}.material"
            own = rates.get(mat_rk)
            _line(kind="material",
                  description=op["label_de"] if not has_labour
                  else f"{op['label_de']} — Material",
                  qty=qty, unit=op["unit"],
                  unit_price=own if own is not None else _mid(mpu),
                  waste_factor=waste, rate_key=mat_rk,
                  rate_source="pro" if own is not None else "catalogue")

    # The business's own measured speed, applied last and to everything. It
    # multiplies hours, never the rate: a business that runs long has a time
    # problem, and inflating its hourly rate to compensate would hide that
    # behind a number the customer compares against competitors.
    cal = float((calibration or {}).get("hours_factor") or 1.0)
    if cal != 1.0:
        setup = (setup[0] * cal, setup[1] * cal)
        work = [work[0] * cal, work[1] * cal]
        for ln in lines:
            if ln["kind"] not in ("labor", "travel"):
                continue
            # The setup line is billed in hours, so the correction belongs in
            # its quantity. Scaling its rate instead would print an unchanged
            # 2.85 h beside an inflated hourly figure — the one place in the
            # quote where the customer can see the two and compare them.
            if ln.get("rate_key", "").endswith(".stundensatz") and ln["unit"] == "h":
                ln["qty"] = round(ln["qty"] * cal, 2)
            else:
                ln["unit_price"] = round(ln["unit_price"] * cal, 2)

    hours = (work[0] + setup[0], work[1] + setup[1])
    labour = (hours[0] * h_lo, hours[1] * h_hi)
    total = (labour[0] + material[0] + disposal[0],
             labour[1] + material[1] + disposal[1])

    if disposal[1] > 0:
        _line(kind="other", description=DISPOSAL_LABEL, qty=1, unit="psch",
              unit_price=_mid(disposal), rate_key=f"{job['trade']}.entsorgung",
              rate_source="catalogue")

    # What the positions actually come to. It sits inside `total_net` but is
    # not its exact midpoint — a midpoint of products is not the product of
    # midpoints — and the caller is entitled to see both rather than be told
    # they are the same number.
    lines_net = sum(
        ln["qty"] * (1 + ln["waste_factor"]) * ln["unit_price"] for ln in lines)

    notes = notes_for(job, answers, extra_keys=op_notes,
                      emergency=emergency, country=country)

    return {
        "job": {
            "key": job["key"], "label_de": job["label_de"], "unit": job["unit"],
            "trade": job["trade"], "group": job["group"], "segment": job["segment"],
            "confidence": job["confidence"],
            "site_visit_required": job["site_visit_required"],
            "quote_mode": job["quote_mode"],
            "small_job_premium": job["small_job_premium"],
        },
        "qty": round(qty, 2),
        "qty_source": (qty_question(job) or {}).get("key") or (
            "answer" if answers.get("qty") else "typical_size"),
        **_answer_provenance(job, answers, emergency),
        # Echoed so the stored estimate keeps the inputs that produced it.
        # When a coefficient turns out wrong, the answer that should have
        # caught it is almost always in here.
        "answers_echo": dict(answers),
        "catalogue_version": cat["version"],
        "calibration": ({"hours_factor": cal,
                         "scope": (calibration or {}).get("scope"),
                         "samples": (calibration or {}).get("samples"),
                         "realised_hourly": (calibration or {}).get("realised_hourly")}
                        if cal != 1.0 else None),
        "country": country, "tier": tier,
        "condition": condition, "access": access,
        "emergency": emergency, "rate_basis": rate_basis,
        "hours": [round(hours[0], 2), round(hours[1], 2)],
        "setup_hours": [round(setup[0], 2), round(setup[1], 2)],
        "hourly_used": [round(h_lo, 2), round(h_hi, 2)],
        "labour": [round(labour[0], 2), round(labour[1], 2)],
        "material": [round(material[0], 2), round(material[1], 2)],
        "debris_kg": [round(debris_kg[0]), round(debris_kg[1])],
        "container": _container(debris_kg[1]),
        "disposal": [round(disposal[0], 2), round(disposal[1], 2)],
        "total_net": [round(total[0], 2), round(total[1], 2)],
        "lines_net": round(lines_net, 2),
        "per_unit": ([round(total[0] / qty, 2), round(total[1] / qty, 2)]
                     if qty else None),
        "market_band": job["market_band_at"] if country == "AT" else job["market_band_de"],
        "band_basis": job["band_basis"],
        "lines": lines,
        "notes": notes,
        "assumptions": assumptions_text(notes),
    }


def _answer_provenance(job: dict, answers: dict, emergency: bool) -> dict:
    """Which answers changed the total, and which were only recorded.

    Stated rather than implied. A pro reading an estimate is entitled to know
    that picking 120x240 tiles attached a note and did not add an hour — that
    is a limit of the model, and hiding it turns the guided form into theatre.
    """
    applied: list[str] = []
    recorded: list[str] = []
    q_key = (qty_question(job) or {}).get("key")

    for q in job.get("guided_form") or []:
        if q["key"] not in answers:
            continue
        if q["key"] == q_key or q["affects"] in ("condition", "access"):
            applied.append(q["key"])
        elif q["key"] == "zeit" and emergency:
            applied.append(q["key"])
        else:
            recorded.append(q["key"])

    for k in ("qty", "condition", "access"):
        if k in answers and k not in applied and k != q_key:
            applied.append(k)
    if emergency and "emergency" in answers:
        applied.append("emergency")

    return {"answers_applied": applied, "answers_recorded": recorded}


def _container(kg_high: float) -> Optional[str]:
    """Chosen by weight, not volume.

    Bauschutt runs 1,100-1,500 kg/m³, so a 7 m³ skip hits its weight limit at
    roughly a third full. Sizing by volume systematically under-orders.
    """
    if kg_high < 50:
        return None
    if kg_high <= 1000:
        return "Big Bag (bis 1 t)"
    if kg_high <= 3500:
        return "3 m³ Mulde"
    if kg_high <= 7000:
        return "7 m³ Mulde"
    return "Mehrere Mulden oder Abrollcontainer"


def notes_for(job: dict, answers: Optional[dict] = None, *,
              extra_keys: Optional[list[str]] = None,
              emergency: bool = False, country: str = "AT") -> list[dict]:
    """Notes the job always carries, plus those the answers triggered.

    Returned with severity so the UI can rank them: an asbestos warning and a
    note about who moves the furniture must not look alike.
    """
    cat = catalogue()
    answers = answers or {}
    keys: list[str] = list(job.get("note_keys") or []) + list(extra_keys or [])

    for q in job.get("guided_form") or []:
        given = answers.get(q["key"])
        if given is None:
            continue
        # note_if keys are strings in JSON, booleans included ("True"/"False").
        for value, note_key in (q.get("note_if") or {}).items():
            if str(given) == value:
                keys.append(note_key)

    # Baujahr is a number, so it cannot be expressed as a note_if mapping.
    try:
        baujahr = int(answers["baujahr"])
    except (KeyError, TypeError, ValueError):
        baujahr = None
    if baujahr:
        if baujahr < 1990:
            keys.append("asbest_vor_1990")
        if baujahr < 1970 and job["trade"] == "sanitaer":
            keys.append("bleirohre_vor_1970")

    if emergency:
        keys.append("nacht_zuschlag")

    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    seen: set[str] = set()
    out = []
    for k in keys:
        if k in seen or k not in cat["notes"]:
            continue
        seen.add(k)
        out.append({"key": k, "severity": cat["notes"][k]["severity"],
                    "text_de": cat["notes"][k]["de"]})
    out.sort(key=lambda n: order.get(n["severity"], 9))
    return out


def assumptions_text(notes: list[dict]) -> str:
    """The notes as a block ready to drop into a quote's assumptions field."""
    return "\n".join(f"• {n['text_de']}" for n in notes)


def survey(job_key: str) -> dict:
    """Everything the UI needs to render the guided form for one job.

    The shared condition and access questions are appended when the job does
    not already ask them, because they move the number on every job type and a
    form that omits them silently assumes the middle case.
    """
    job = get_job(job_key)
    if not job:
        raise LookupError(f"Unknown job type: {job_key}")
    cat = catalogue()
    form = [dict(q) for q in (job.get("guided_form") or [])]
    asked = {q["key"] for q in form}

    if "qty" not in asked and not qty_question(job) and job["band_basis"] != "total":
        form.insert(0, {
            "key": "qty", "label_de": "Menge", "type": "number",
            "unit": job["unit"], "options": [], "affects": "qty",
            "default": _mid(job["typical_size"]), "note_if": {},
            "help_de": f"Typisch {job['typical_size'][0]}–{job['typical_size'][1]} {job['unit']}",
        })
    if "condition" not in asked:
        form.append(_shared_choice(
            "condition", "Zustand des Objekts", cat["modifiers"]["condition_uplift"],
            {"neubau": "Neubau, besenrein",
             "renovierung_leer": "Renovierung, leerstehend",
             "renovierung_bewohnt": "Renovierung, bewohnt",
             "altbau_bewohnt": "Altbau, bewohnt"},
            "renovierung_leer"))
    if "access" not in asked:
        form.append(_shared_choice(
            "access", "Zugang", cat["modifiers"]["access_uplift"],
            {"eg_oder_lift": "Erdgeschoss oder Lift",
             "og_ohne_lift": "Obergeschoss ohne Lift",
             "enge_treppe": "Enge Treppe"},
            "eg_oder_lift"))
    if job.get("messy", True) is False and job.get("emergency_capable"):
        form.append({
            "key": "emergency", "label_de": "Notdienst", "type": "bool",
            "unit": "", "options": [], "affects": "variant", "default": False,
            "note_if": {"True": "nacht_zuschlag"},
            "help_de": "Einsatz außerhalb der regulären Arbeitszeit",
        })

    return {
        "job": {k: job[k] for k in (
            "key", "trade", "label_de", "unit", "group", "segment", "confidence",
            "typical_size", "band_basis", "site_visit_required", "quote_mode",
            "small_job_premium", "messy", "emergency_capable")},
        "form": form,
        "always_notes": [{"key": k, **cat["notes"][k]}
                         for k in (job.get("note_keys") or []) if k in cat["notes"]],
        "operations": [{"key": o["key"], "label_de": o["label_de"], "unit": o["unit"],
                        "kind": o["kind"], "tier_min": o["tier_min"],
                        "rate_key": rate_key(job, o)} for o in job["operations"]],
    }


def _shared_choice(key: str, label: str, source: dict, labels: dict,
                   default: str) -> dict:
    return {
        "key": key, "label_de": label, "type": "choice", "unit": "",
        "options": [[v, labels.get(v, v)] for v in source],
        "affects": key, "default": default, "note_if": {}, "help_de": "",
    }


def meta() -> dict:
    """The catalogue's shape, for building pickers without shipping all of it."""
    cat = catalogue()
    groups: dict[str, dict[str, Any]] = {}
    for j in cat["jobs"]:
        g = groups.setdefault(j["group"], {"group": j["group"], "trades": set(), "count": 0})
        g["trades"].add(j["trade"])
        g["count"] += 1
    return {
        "version": cat["version"],
        "countries": cat["countries"],
        "job_count": len(cat["jobs"]),
        "note_count": len(cat["notes"]),
        "groups": sorted(({"group": g["group"], "trades": sorted(g["trades"]),
                           "count": g["count"]} for g in groups.values()),
                         key=lambda g: g["group"]),
        "trades": sorted({j["trade"] for j in cat["jobs"]}),
        "conditions": list(cat["modifiers"]["condition_uplift"]),
        "access": list(cat["modifiers"]["access_uplift"]),
    }
