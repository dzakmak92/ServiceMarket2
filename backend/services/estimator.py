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

**The pro's own rate wins, and the two figures stay apart.** Hourly rates from
the catalogue are a cold start for someone who has never quoted the work. Once
`pro_rates` holds a real figure it prices the positions instead — which is the
whole reason the catalogue is built on hours rather than prices.

That makes `total_net` and `lines_net` disagree, and they should. `total_net`
is what the model says the work costs; `lines_net` is what this business's own
prices come to. Collapsing them would throw away the comparison a pro most
wants: the catalogue says 334-807, your own rates put it at 612. `rates_applied`
counts how many positions came from the business rather than the catalogue, so
a caller can tell which case it is instead of guessing from a discrepancy.

**Notes are attached, not merged.** Each triggered note comes back separately
with its severity, so the UI can show a critical asbestos warning differently
from a note about who moves the furniture, and the pro can remove any of them
before sending.

**The lines add up.** An estimate whose positions sum to less than its own
total is worse than no estimate: the pro sends the positions, not the summary.
So setup hours and disposal get their own lines, uplifts are carried in the
labour unit prices, and `lines_net` reports what the positions actually come
to.

**Answers that did not move the number say so.** Most of the form now does
move it: the catalogue states what each answer costs, additively, and this
reads it. What remains recorded-only is the set of questions that genuinely
change nothing about the hours — which trade a note is for, whether a permit
has been applied for. `answers_applied` and `answers_recorded` come back
separately, built from the arithmetic that actually ran rather than from the
question's declared `affects`, because the alternative is a quote whose
assumptions promise work the total does not contain.
"""
from __future__ import annotations

import math
import re

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

# Which asbestos note a pre-1990 build year attaches, by job. A job that is not
# in here gets none: swapping a tap or lacquering a door in a 1975 flat
# disturbs no building fabric, and the jobs that do take up an old floor or
# tile bed carry `asbest_vor_1990` in their own `note_keys` already, on every
# estimate, because for those the risk does not depend on the answer.
ASBEST_BY_JOB: dict[str, str] = {
    # Taking up a single old tile means taking up the bed it sits in, which is
    # exactly what the adhesive note is about.
    "fliesen.einzelne_ersetzen": "asbest_vor_1990",
    # These open a wall, a floor or a duct to reach something behind it. What
    # they can meet is lagging, panelling and fire-stopping, not floor glue.
    "elektrik.steckdose": "asbest_bauteile_vor_1990",
    "elektrik.wohnung_neuinstallation": "asbest_bauteile_vor_1990",
    "sanitaer.rohrbruch": "asbest_bauteile_vor_1990",
    "sanitaer.steigleitung": "asbest_bauteile_vor_1990",
    "sanitaer.wanne_zu_dusche": "asbest_bauteile_vor_1990",
    "sanitaer.bad_basis": "asbest_bauteile_vor_1990",
    "sanitaer.wc_tauschen": "asbest_bauteile_vor_1990",
    "sanitaer.waschtisch": "asbest_bauteile_vor_1990",
}

# Sanding or burning back old paint. `bleifarbe_vor_1960` was written for this
# and then never attached to anything — the only note in the catalogue that no
# answer could reach.
BLEIFARBE_JOBS = {
    "maler.tuer_lackieren", "maler.holzfenster_streichen",
    "boden.parkett_schleifen",
}

# Answers that mean the work is not happening on an ordinary weekday. The
# catalogue prices these off the Notdienst rate rather than an uplift, because
# in both markets a call-out at night is sold as a different service, not the
# same service with a surcharge.
OUT_OF_HOURS = {"nacht_sonntag"}

# What an unanswered form is priced at, and — deliberately the same thing —
# what the market bands were validated at. Anything absent falls back to the
# middle of the road rather than the cheapest case: defaulting to a clean empty
# new-build would produce an estimate that is only right for the job nobody
# rings about. Every axis in the catalogue keeps these as its own default, so
# switching a job's wording cannot move its price.
DEFAULT_ANSWER = {"condition": "renovierung_leer", "access": "eg_oder_lift"}

# The ceiling on everything additive put together. The honest worst case is an
# occupied Altbau reached up a narrow stair with the worst substrate the
# question offers, which comes to roughly 3x — and v0's lesson was that a
# number above that is not a hard job, it is a modelling error that nobody
# would have signed. Reported through `uplift_clamped` rather than applied
# silently, because a quote that hit the ceiling is one to look at by hand.
MAX_UPLIFT = 3.0


def _variant_effects(job: dict, answers: dict) -> tuple:
    """What the answered form does to hours, material and scope.

    Returns the additive labour uplift, the additive material uplift, the
    operations the answers removed, the operations that keep their hours but
    lose their tip fee, and the questions that carried any of it — the last so
    that `answers_applied` can name them instead of the pro having to guess
    which of five taps was the one that mattered.
    """
    up = [0.0, 0.0]
    mat = [0.0, 0.0]
    dropped: set[str] = set()
    no_disposal: set[str] = set()
    priced: list[str] = []

    for q in job.get("guided_form") or []:
        if q["key"] not in answers:
            continue
        given = answers[q["key"]]
        # JSON keys are strings, and a bool answer arrives as True/False. Both
        # spellings are accepted so a checkbox can carry an uplift.
        moved = False
        for field, sink in (("uplift", up), ("material_uplift", mat)):
            table = q.get(field) or {}
            rng = table.get(given)
            if rng is None:
                rng = table.get(str(given))
            if rng:
                sink[0] += float(rng[0])
                sink[1] += float(rng[1])
                moved = True
        for field, sink in (("drops", dropped), ("drops_disposal", no_disposal)):
            table = q.get(field) or {}
            keys = table.get(given)
            if keys is None:
                keys = table.get(str(given))
            if keys:
                sink.update(keys)
                moved = True
        if moved:
            priced.append(q["key"])

    return tuple(up), tuple(mat), dropped, no_disposal, priced


@lru_cache(maxsize=1)
def catalogue() -> dict:
    """Loaded once per process. It is a static asset, not per-request data."""
    with CATALOGUE_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


# German collation for sorting: without this, Ä/Ö/Ü sort after Z and
# "Möbel montieren" lands below "TV-Wandhalterung".
_FOLD = str.maketrans({"ä": "a", "ö": "o", "ü": "u", "ß": "s",
                       "Ä": "A", "Ö": "O", "Ü": "U"})

# The trades the picker offers, and the order it offers them in.
#
# The catalogue holds 21 trades and 136 job types. Fourteen of those trades are
# hidden rather than removed: their jobs stay in the file, keep their prices,
# and `get_job` still resolves them, so an estimate or quote that already cites
# one goes on working and reprints correctly. Only the picker is narrowed.
#
# Widening this list is the whole change needed to offer a trade again.
OFFERED_TRADES = (
    "maler", "fliesen", "elektrik", "sanitaer", "garten", "reinigung", "montage",
)

# What to call them. The catalogue keys are terse and two of them read badly on
# their own: `elektrik` is the trade but `Elektriker` is the person, and
# `montage` covers four different groups, which is why it is named for the
# range rather than the word.
TRADE_LABELS = {
    "maler": "Maler", "fliesen": "Fliesen", "elektrik": "Elektrik",
    "sanitaer": "Sanitär", "garten": "Garten", "reinigung": "Reinigung",
    "montage": "Montage / Allround",
}


def jobs(*, trade: Optional[str] = None, group: Optional[str] = None,
         include_hidden: bool = False) -> list[dict]:
    """Job types, narrowed to the trades on offer unless asked otherwise.

    `include_hidden` exists for the tools that must see everything — export,
    calibration, anything auditing the catalogue — so hiding a trade from the
    picker never quietly shrinks a report.
    """
    out = catalogue()["jobs"]
    if not include_hidden:
        out = [j for j in out if j["trade"] in OFFERED_TRADES]
    if trade:
        out = [j for j in out if j["trade"] == trade]
    if group:
        out = [j for j in out if j["group"] == group]
    # Alphabetical by the label the pro reads, with umlauts folded so Ä sorts
    # with A rather than after Z. The file is stored in this order too, but
    # sorting here as well means a hand-edit to the JSON cannot quietly
    # reorder somebody's list.
    return sorted(out, key=lambda j: j["label_de"].translate(_FOLD).lower())


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


# A quantity may arrive as a number or as whatever the pro typed. Both are
# normal: the guided form posts JSON, but the field is free text and this is
# a German-language product.
_THOUSANDS = re.compile(r"^\d{1,3}(\.\d{3})+$")


def parse_number(val) -> Optional[float]:
    """A number from a person, or None.

    German writes 12,5 where English writes 12.5, and the pro typing into a
    German form types the comma. `float("12,5")` raises, the old code caught
    the exception and moved on, and the estimate quietly fell back to the
    job's typical size — 57.5 m² for a 12.5 m² room, a quote three times the
    work described, with `qty_source` still reporting "answer". A wrong
    number that announces itself is a nuisance; a wrong number wearing the
    right label is how a pro loses money on a job.

    The rules, in order, because "1.234" is genuinely ambiguous:
      · both separators present → the last one is the decimal point
      · only dots, in groups of three → thousands ("1.234" is 1234)
      · a lone comma → decimal ("12,5" is 12.5)

    Booleans are rejected outright. `float(True)` is 1.0, so a checkbox
    posted into a quantity field used to quote a one-square-metre job.
    """
    if isinstance(val, bool) or val is None:
        return None
    if isinstance(val, (int, float)):
        v = float(val)
        return v if math.isfinite(v) else None
    if not isinstance(val, str):
        return None
    t = val.strip().replace("\u00a0", "").replace(" ", "")
    if not t:
        return None
    if "," in t and "." in t:
        dec = max(t.rfind(","), t.rfind("."))
        t = t[:dec].replace(",", "").replace(".", "") + "." + t[dec + 1:]
    elif _THOUSANDS.match(t):
        t = t.replace(".", "")
    elif "," in t:
        t = t.replace(",", ".")
    try:
        v = float(t)
    except (TypeError, ValueError):
        return None
    # Rejected rather than passed on: `resolve_qty`'s `v > 0` lets +inf
    # through, and an infinite quantity produced either a crash in the debris
    # rounding or a JSON body containing the literal `Infinity`, which most
    # parsers refuse.
    return v if math.isfinite(v) else None


# The same range services/calibration.py enforces; imported by value rather
# than from that module to avoid a cycle, and asserted equal by the tests.
HOURS_FACTOR_CLAMP = (0.5, 2.0)


def _clamp_factor(val) -> float:
    """A usable hours factor, whatever arrived."""
    v = parse_number(val)
    if v is None:
        return 1.0
    return min(max(v, HOURS_FACTOR_CLAMP[0]), HOURS_FACTOR_CLAMP[1])


def _clamp_hourly(pair):
    """A caller's (low, high) rate pair, ordered and finite, or None.

    An inverted pair produced an estimate whose low exceeded its high, which
    every downstream consumer reads as a range.
    """
    if pair is None:
        return None
    try:
        lo, hi = parse_number(pair[0]), parse_number(pair[1])
    except (TypeError, IndexError, KeyError):
        return None
    if lo is None or hi is None or lo < 0 or hi < 0:
        return None
    return (min(lo, hi), max(lo, hi))


def as_bool(val) -> bool:
    """A yes/no from an answer that may be a string.

    `survey()` declares this question as `type: bool` and its own note rule
    keys off the *string* "True", so string booleans are expected here — and
    `notes_for` handles them. `estimate` did not: it tested truthiness, and
    every non-empty string is truthy, so an answer of "false" or "nein"
    switched the Notdienst rate on. Ninety per cent added to the low end of a
    quote because the customer said no.
    """
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return bool(val)
    if isinstance(val, str):
        return val.strip().lower() in {"true", "yes", "y", "ja", "1", "on"}
    return bool(val)


def _norm_choice(val) -> str:
    """A catalogue choice key from an answer, forgiving of case and padding.

    A value round-tripped through a store that trims or upper-cases used to
    stop matching and silently priced as an ordinary weekday.
    """
    return str(val or "").strip().lower()


def resolve_qty_detail(job: dict, answers: Optional[dict]) -> tuple[float, str]:
    """The quantity, and where it actually came from.

    The second half is the point. `qty_source` used to be derived from the
    shape of the job rather than from what happened — for any job with a
    quantity question it named that question whether it had been answered,
    left blank, or answered with something unusable.
    """
    answers = answers or {}
    q = qty_question(job)
    for key in ([q["key"]] if q else []) + ["qty"]:
        if key not in answers:
            continue
        v = parse_number(answers.get(key))
        if v is not None and v > 0:
            return v, key
    if job["band_basis"] == "total":
        return 1.0, "unit_job"
    return _mid(job["typical_size"]), "typical_size"


def resolve_qty(job: dict, answers: Optional[dict] = None) -> float:
    """Quantity from the answers, or the middle of the job's typical size.

    The fallback is the midpoint rather than the small end on purpose: an
    estimate that assumes the smallest plausible job flatters itself.
    """
    return resolve_qty_detail(job, answers)[0]


def estimate(job_key: str, answers: Optional[dict] = None, *, country: str = "AT",
             tier: str = "standard", hourly: Optional[tuple[float, float]] = None,
             rates: Optional[dict] = None,
             calibration: Optional[dict] = None,
             qty_overrides: Optional[dict] = None) -> dict:
    """Estimate one job.

    `answers` are the guided-form values. `rates` maps a rate key (see
    `rate_key`) to the business's own EUR amount per unit and overrides the
    catalogue default wherever it applies. `calibration` is what this business's
    own finished jobs have shown about its speed — see
    `services.calibration` — and scales the hours, setup included, because a
    business that is a fifth slower is a fifth slower at unloading the van too.

    `qty_overrides` maps a rate key to the quantity the pro says that position
    actually is. The catalogue derives every position from one quantity axis —
    62 m² of wall means 62 m² of masking — and on a real job that is often
    wrong in one place: the floor is covered already, the ceiling is not being
    painted. Rather than force the pro to abandon the estimate, a position can
    be corrected in place.

    The correction is exact for the position and additive to the total: the
    line's own contribution is recomputed at its unit price and the difference
    applied to both ends of the range. It cannot be more precise than that —
    the range's ends come from a spread of hours, not from a spread of
    quantities — and pretending otherwise would invent a precision the
    coefficients do not have. `qty_adjusted` reports which keys moved so the
    screen can say so rather than quietly showing a different number.

    Keyed by rate key rather than by position index: checked across all 149
    job types, no estimate contains the same rate key twice, and an index
    shifts the moment an answer adds or drops an operation.
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

    mods = cat["modifiers"]
    # A job whose axis is "none" is never asked the question, so an answer for
    # it can only have come from a stale form or a hand-built request. It is
    # discarded rather than applied: a caller must not be able to add 75 % to a
    # job by posting a field the screen does not show.
    condition = answers.get("condition") if axis_for(job, "condition") else None
    if condition not in mods["condition_uplift"]:
        condition = DEFAULT_ANSWER["condition"]
    access = answers.get("access") if axis_for(job, "access") else None
    if access not in mods["access_uplift"]:
        access = DEFAULT_ANSWER["access"]
    qty, qty_source = resolve_qty_detail(job, answers)

    cond_up = _rng(mods["condition_uplift"][condition])
    acc_up = _rng(mods["access_uplift"][access])
    # Dusty work in an occupied flat needs protection and daily cleanup; a
    # service call does not. `messy` is the catalogue's declaration of which
    # this is, and 25 of the job types set it False.
    setup_add = (_rng(mods["condition_setup_add"][condition])
                 if job.get("messy", True) else (0.0, 0.0))

    # What the rest of the form costs. Until now the answer was "nothing": the
    # estimator read quantity, condition, access and the Notdienst flag, so a
    # pro picking "Altbau, Leim- oder Kalkfarbe" as the substrate — which means
    # washing the whole wall down before a brush is lifted — was quoted the
    # price for an intact one. The catalogue now says what each answer costs
    # and this reads it. `variant_up` is the sum of what was answered.
    (variant_up, variant_mat, dropped, no_disposal,
     priced_answers) = _variant_effects(job, answers)

    # Additive, never multiplicative. Stacking multipliers produced a 5.7x
    # worst case in v0 that no customer would have signed. The variant uplifts
    # join the same pool for the same reason, and the sum is clamped: the
    # honest worst case is an occupied Altbau up a narrow stair with the worst
    # substrate, and that is roughly 3x, not 6x.
    up_lo = min(1 + cond_up[0] + acc_up[0] + variant_up[0], MAX_UPLIFT)
    up_hi = min(1 + cond_up[1] + acc_up[1] + variant_up[1], MAX_UPLIFT)
    mat_lo = max(1 + variant_mat[0], 0.0)
    mat_hi = max(1 + variant_mat[1], 0.0)

    out_of_hours = _norm_choice(answers.get("zeit")) in OUT_OF_HOURS
    emergency = bool(
        (as_bool(answers.get("emergency")) or out_of_hours) and job.get("emergency_capable"))

    safe_hourly = _clamp_hourly(hourly)
    if safe_hourly:
        h_lo, h_hi = safe_hourly
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
        # `optional` is skipped by backend/tools/catalogue/engine.py, which is
        # the harness this module's docstring says it must stay identical to.
        # This filter was missing, so an optional operation would have been
        # priced into the total here and excluded there — the validation would
        # have gone on passing while the app quoted something else. The
        # shipped catalogue has no optional operations today, which is exactly
        # why the drift was invisible.
        if op.get("optional"):
            continue
        # An answer can remove an operation outright. "Belag wird beigestellt"
        # means the customer is buying the tiles, "Grünschnitt verbleibt vor
        # Ort" means nobody is paying a tip fee. Both were already printed on
        # the quote as assumptions while the total went on containing the cost
        # they said was not there.
        if op["key"] in dropped:
            continue

        hpu = _rng(op["hours_per_unit"])
        mpu = _rng(op["material_per_unit"])
        dpu = _rng(op["debris_kg_per_unit"])
        waste = float(op.get("waste_factor") or 0)

        w_lo, w_hi = qty * hpu[0] * up_lo, qty * hpu[1] * up_hi
        work[0] += w_lo
        work[1] += w_hi
        # Waste applies to material only. Nobody buys 8% more labour.
        material[0] += qty * mpu[0] * (1 + waste) * mat_lo
        material[1] += qty * mpu[1] * (1 + waste) * mat_hi

        # Green waste that stays on site, spoil that stays on the plot: the
        # work of gathering it still happens, the tip fee does not. The note
        # attached to these answers has always said "der Entsorgungsanteil
        # entfällt"; until now only the note said it.
        d_lo, d_hi = ((0.0, 0.0) if op["key"] in no_disposal
                      else (qty * dpu[0], qty * dpu[1]))
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
                  # Same rule as labour: the uplift rides in the unit price, so
                  # the positions the pro sends add up to the total the app
                  # showed them.
                  unit_price=(own if own is not None
                              else _mid(mpu) * ((mat_lo + mat_hi) / 2)),
                  waste_factor=waste, rate_key=mat_rk,
                  rate_source="pro" if own is not None else "catalogue")

    # The business's own measured speed, applied last and to everything. It
    # multiplies hours, never the rate: a business that runs long has a time
    # problem, and inflating its hourly rate to compensate would hide that
    # behind a number the customer compares against competitors.
    # Clamped here as well as in services/calibration.py. That module
    # documents CLAMP = (0.5, 2.0) as the range beyond which a factor is a
    # data problem rather than a slow tradesperson — but this line re-derived
    # the number from a plain dict, so any caller building that dict itself
    # bypassed the guard entirely. -1.0 produced a negative total with the
    # low above the high; NaN produced a quote of NaN; 100.0 produced 68,460.
    # The `or 1.0` also silently promoted a legitimate 0.0 to 1.0 while
    # reporting the estimate as uncalibrated.
    cal = _clamp_factor((calibration or {}).get("hours_factor"))
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

    # ── the pro's own quantities, where they disagree with the catalogue ──
    adjusted: list[str] = []
    for ln in lines:
        want = parse_number((qty_overrides or {}).get(ln["rate_key"]))
        if want is None or want < 0 or abs(want - ln["qty"]) < 1e-9:
            continue
        moved = (want - ln["qty"]) * (1 + ln["waste_factor"]) * ln["unit_price"]
        ln["qty"] = round(want, 3)
        ln["qty_source"] = "pro"
        total = (total[0] + moved, total[1] + moved)
        adjusted.append(ln["rate_key"])
    # A corrected position must never drag the total below nothing.
    total = (max(total[0], 0.0), max(total[1], 0.0))

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
        # Where the number actually came from, not what shape the job is.
        # This used to name the quantity question for any job that had one —
        # answered, blank or answered with something unusable, all reported
        # the same — so a fallback to the typical size was indistinguishable
        # from the pro's own figure.
        "qty_source": qty_source,
        **_answer_provenance(job, answers, emergency, priced_answers),
        # A quote that hit the ceiling is one for a human to look at.
        "uplift_clamped": (1 + cond_up[1] + acc_up[1] + variant_up[1]) > MAX_UPLIFT,
        "dropped_operations": sorted(dropped),
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
        # Which positions the pro corrected by hand. Empty on an untouched
        # estimate, which is the only state in which total_net is purely the
        # model's own arithmetic.
        "qty_adjusted": adjusted,
        # How many positions were priced by this business rather than by the
        # catalogue. Zero means lines_net should sit inside total_net; above
        # zero means the two are measuring different things on purpose.
        "rates_applied": sum(1 for ln in lines if ln["rate_source"] == "pro"),
        "per_unit": ([round(total[0] / qty, 2), round(total[1] / qty, 2)]
                     if qty else None),
        # Copied. `catalogue()` is lru_cached, so this handed the caller a
        # live reference into the process-wide catalogue: one `r["market_band"][0] = 999`
        # anywhere and every later estimate for that job carried it, for the
        # life of the process.
        "market_band": list(job["market_band_at"] if country == "AT" else job["market_band_de"]),
        "band_basis": job["band_basis"],
        "lines": lines,
        "notes": notes,
        "assumptions": assumptions_text(notes),
    }


def _answer_provenance(job: dict, answers: dict, emergency: bool,
                       priced: Optional[list] = None) -> dict:
    """Which answers changed the total, and which were only recorded.

    Stated rather than implied. A pro reading an estimate is entitled to know
    that picking 120x240 tiles attached a note and did not add an hour — that
    is a limit of the model, and hiding it turns the guided form into theatre.

    `priced` is the list of questions whose answer carried an uplift or removed
    an operation. It is passed in rather than re-derived so that this cannot
    disagree with the arithmetic that actually ran: the whole value of the
    split is that a question in `answers_applied` really did move the money.
    """
    applied: list[str] = []
    recorded: list[str] = []
    q_key = (qty_question(job) or {}).get("key")
    priced_set = set(priced or ())

    for q in job.get("guided_form") or []:
        if q["key"] not in answers:
            continue
        if q["key"] == q_key or q["affects"] in ("condition", "access"):
            applied.append(q["key"])
        elif q["key"] in priced_set:
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
        # What a pre-1990 year means depends on what the job opens up. This
        # used to be one line — any job that asks the year, any year under
        # 1990, gets the floor-adhesive note — and the jobs that genuinely
        # take up a covering already carry that note unconditionally. So the
        # rule never fired anywhere it was right: it fired on thirteen job
        # types that never touch a floor, telling a customer having a tap
        # swapped that the adhesive under their floor covering may contain
        # asbestos. An assumption on a quote is a term the customer is held
        # to; a wrong one is worse than a missing one.
        if baujahr < 1990:
            note = ASBEST_BY_JOB.get(job["key"])
            if note:
                keys.append(note)
        if baujahr < 1960 and job["key"] in BLEIFARBE_JOBS:
            keys.append("bleifarbe_vor_1960")
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

    The shared condition and access questions are appended in the wording the
    job's trade uses — its *axis* — because they move the number on every job
    type and a form that omits them silently assumes the middle case.

    They used to be appended in one wording, the wording of an interior
    renovation, to all 89 job types that did not hand-write their own. So a
    lawn was asked whether the building was broom-clean and a tyre change was
    asked whether the flat had a lift, and because both answers are worth up to
    +75 % and +30 % the pro's guess at an unanswerable question set the price.
    `condition_axis` and `access_axis` name which vocabulary this job uses, or
    "none" where the question does not apply to it at all. The uplift keys
    behind the labels are the same in every axis, so this is wording, not
    arithmetic — see `tools/catalogue/axes.py`.

    Exactly one question is flagged `is_quantity`, wherever it comes from. The
    UI needs to know which field is the quantity and it cannot tell from the
    key: two thirds of the job types ask for it under their own name —
    `anzahl`, `flaeche`, `stufen`, `wohnflaeche` — and a screen matching on
    the literal key `qty` treated those as ordinary detail questions. The
    catalogue knows which one multiplies; saying so here is cheaper than
    every caller re-deriving `qty_question`'s unit rule.
    """
    job = get_job(job_key)
    if not job:
        raise LookupError(f"Unknown job type: {job_key}")
    cat = catalogue()
    form = [dict(q) for q in (job.get("guided_form") or [])]
    asked = {q["key"] for q in form}

    own_qty = qty_question(job)
    if own_qty is not None:
        for q in form:
            if q["key"] == own_qty["key"]:
                q["is_quantity"] = True
    elif "qty" not in asked and job["unit"] != "psch":
        # Jobs priced as a whole get the question too. `band_basis == "total"`
        # only sets the fallback quantity to one instead of the typical
        # midpoint — `estimate()` multiplies by it either way — so leaving the
        # field off meant a pro fitting three outdoor sockets was quoted for
        # one with no field to say otherwise. The default stays at 1 for those
        # jobs, which is what the estimator already assumed: adding the
        # question must not move a single existing number.
        whole = job["band_basis"] == "total"
        lo, hi = job["typical_size"]
        form.insert(0, {
            "key": "qty", "label_de": "Anzahl" if whole else "Menge",
            "type": "number", "unit": job["unit"], "options": [],
            "affects": "qty", "is_quantity": True,
            "default": 1.0 if whole else _mid(job["typical_size"]),
            "note_if": {},
            # The sentence is assembled where the other three languages live
            # (`catalogue_ui`); what belongs here is the job's own numbers.
            # `help_de` stays filled for callers that never pass through the
            # decorator.
            "help_fmt": {
                "id": ("whole_range" if hi > lo else "whole") if whole else "typical",
                "args": {"unit": job["unit"], "lo": lo, "hi": hi},
            },
            "help_de": (
                f"Preis gilt je {job['unit']}"
                + (f", typisch {lo}–{hi}" if hi > lo else "")
                if whole else f"Typisch {lo}–{hi} {job['unit']}"),
        })
    for key in ("condition", "access"):
        if key in asked:
            continue
        axis = axis_for(job, key)
        if axis:
            form.append(_shared_choice(key, job.get(f"{key}_axis") or "gebaeude", axis))
    # Not when the job already asks `zeit`. That question already reaches the
    # Notdienst rate — `OUT_OF_HOURS` reads it — so appending the checkbox put
    # two controls for one fact on the same screen, and a pro could set them
    # against each other.
    if (job.get("messy", True) is False and job.get("emergency_capable")
            and "zeit" not in asked):
        form.append({
            "key": "emergency", "label_de": "Notdienst", "type": "bool",
            "unit": "", "options": [], "affects": "variant", "default": False,
            "note_if": {"True": "nacht_zuschlag"},
            "help_de": "Einsatz außerhalb der regulären Arbeitszeit",
        })

    # Which tiers actually produce a different estimate for this job type.
    # The tier machinery is real — an operation carrying `tier_min` is dropped
    # below that tier — but only 4 of the 136 job types use it and none gates
    # anything to `premium`. So for almost every job "basic", "standard" and
    # "premium" are the same number, and a UI offering three options would be
    # showing the customer three identical prices. Stated here so the screen
    # can offer the choice only where there is one.
    tiers_present = sorted(
        {o.get("tier_min") or "basic" for o in job["operations"]},
        key=lambda t: TIER_ORDER.get(t, 0))

    return {
        "job": {k: job[k] for k in (
            "key", "trade", "label_de", "unit", "group", "segment", "confidence",
            "typical_size", "band_basis", "site_visit_required", "quote_mode",
            "small_job_premium", "messy", "emergency_capable")},
        "tiers_differ": len(tiers_present) > 1,
        "tiers_present": tiers_present,
        "form": form,
        "always_notes": [{"key": k, **cat["notes"][k]}
                         for k in (job.get("note_keys") or []) if k in cat["notes"]],
        "operations": [{"key": o["key"], "label_de": o["label_de"], "unit": o["unit"],
                        "kind": o["kind"], "tier_min": o["tier_min"],
                        "rate_key": rate_key(job, o)} for o in job["operations"]],
    }


def axis_for(job: dict, key: str) -> Optional[dict]:
    """The condition or access axis this job is asked in, or None for "none".

    None is not a fallback. It is the catalogue saying the question does not
    apply — a sewer camera survey has no building condition to report, because
    establishing the condition is what the job produces. Where that is so the
    question is not asked and the uplift stays at `DEFAULT_ANSWER[key]`, the
    same value an unanswered form has always produced and the value each job's
    market band was calibrated against. Dropping an unanswerable question must
    not reprice the work.
    """
    axes = catalogue()["modifiers"].get(f"{key}_axes") or {}
    return axes.get(job.get(f"{key}_axis") or "gebaeude")


def _shared_choice(key: str, name: str, axis: dict) -> dict:
    # `axis` is carried on the question so the translation layer can localise
    # the help line for the vocabulary actually shown. Without it a Turkish pro
    # mowing a lawn read the German ground-conditions labels above an English
    # sentence about covering furniture in an occupied flat.
    return {
        "key": key, "label_de": axis["label_de"], "type": "choice", "unit": "",
        "options": [[v, label] for v, label in axis["options"].items()],
        "affects": key, "default": axis["default"], "note_if": {},
        "help_de": axis.get("help_de") or "", "axis": name,
    }


def meta() -> dict:
    """The catalogue's shape, for building pickers without shipping all of it.

    Counts describe what is on offer, not what is in the file. A picker that
    announced "136 Auftragstypen" and then listed 100 would be lying about its
    own contents.

    `trades` carries a label and a count per trade because the picker leads
    with the trade now — a bare list of keys was enough for a filter chip and
    is not enough for a tile.
    """
    cat = catalogue()
    offered = jobs()

    groups: dict[str, dict[str, Any]] = {}
    for j in offered:
        g = groups.setdefault(j["group"], {"group": j["group"], "trades": set(), "count": 0})
        g["trades"].add(j["trade"])
        g["count"] += 1

    counts: dict[str, int] = {}
    for j in offered:
        counts[j["trade"]] = counts.get(j["trade"], 0) + 1

    return {
        "version": cat["version"],
        "countries": cat["countries"],
        "job_count": len(offered),
        "note_count": len(cat["notes"]),
        "groups": sorted(({"group": g["group"], "trades": sorted(g["trades"]),
                           "count": g["count"]} for g in groups.values()),
                         key=lambda g: g["group"]),
        # In OFFERED_TRADES order, not alphabetical: the order is a product
        # decision about which trades lead, and sorting would discard it.
        "trades": [{"key": k, "label": TRADE_LABELS.get(k, k), "count": counts.get(k, 0)}
                   for k in OFFERED_TRADES if counts.get(k)],
        "conditions": list(cat["modifiers"]["condition_uplift"]),
        "access": list(cat["modifiers"]["access_uplift"]),
    }
