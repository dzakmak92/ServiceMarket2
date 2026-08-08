"""Catalogue schema — DE/AT trade estimation coefficients.

Design rules, learned from v0 and v1:

 1. TIME is the primitive, not price. Every operation carries hours per unit.
    Price falls out of the pro's own hourly rate. A catalogue of €/m² ages
    badly and cannot be validated; a catalogue of h/m² is a physical claim.

 2. Setup is separate from work. Fixed hours per job that do not scale with
    area — arrive, protect, carry, mask, clean. This is what makes small jobs
    expensive per m² and it is the thing pros most often under-quote.

 3. Uplifts are ADDITIVE, never multiplicative. Stacking multipliers produced
    a 5.7x worst case that no customer would sign.

 4. Every job type declares a MARKET BAND (€/m² or € total, DE and AT) that
    the computed result must land inside. A coefficient that produces a price
    outside the band is wrong, and the harness fails it. This is the only
    defence against a plausible-looking catalogue that quietly loses money.

 5. Debris is kg, not m3. For Bauschutt weight binds before volume — 60 m2 of
    Dickbett is 4,500 kg in 4.1 m3, so the container is chosen by weight and
    disposal is billed per tonne.
"""
from dataclasses import dataclass, field
from typing import Optional

Range = tuple[float, float]


@dataclass
class Operation:
    """One line of work within a job. Produces a quote position."""
    key: str
    label_de: str
    unit: str                       # m2 | lfm | Stk | psch | h
    hours_per_unit: Range           # the physical claim
    kind: str = "labor"             # labor | material | travel | disposal
    material_per_unit: Range = (0.0, 0.0)   # EUR of material per unit
    waste_factor: float = 0.0       # Verschnitt on material only
    debris_kg_per_unit: Range = (0.0, 0.0)
    # Not all debris costs the same to get rid of. Charging Bauschutt rates for
    # clean excavated soil overstated paving by nearly 100 EUR/m2; charging them
    # for Sperrmüll understates a clearance badly in the other direction.
    debris_type: str = "bauschutt"
    optional: bool = False
    tier_min: str = "basic"         # basic | standard | premium
    note_keys: list[str] = field(default_factory=list)


@dataclass
class Question:
    """One tap in the guided survey.

    `affects` says what the answer changes: the quantity, a coefficient
    variant, or only which notes are attached. Keeping that explicit is what
    stops the form asking things that do not change the number — the fastest
    way to make a tradesperson stop using it.

    For a long time `affects="variant"` was a promise the arithmetic did not
    keep. The estimator read quantity, condition, access and the Notdienst flag
    and nothing else, so all five Untergrund options on an Innenanstrich moved
    the price by exactly €0 while Zustand moved it by €307 — and the pro had no
    way to tell which was which. Tile format, laying pattern, tree size, wall
    build-up, how filthy the carpet was: recorded, printed on the quote as an
    assumption, and absent from the number underneath it.

    The three fields below are how a question says what its answers cost.

    `uplift` and `material_uplift` are ADDITIVE, in the same pool as condition
    and access, never multiplicative — stacking multipliers produced a 5.7x
    worst case in v0 that no customer would have signed. `{"diagonal": (0.10,
    0.18)}` means diagonal laying costs 10–18 % more labour than the default
    answer does, on top of whatever else is true of the job.

    `drops` removes operations outright, and `drops_disposal` removes only
    what an operation costs to get rid of while keeping its hours. Those are
    not surcharges in reverse — the work genuinely is not happening — and
    expressing them as a negative uplift would spread the saving across
    positions that never had the cost in them.

    The second one exists because "Grünschnitt verbleibt vor Ort" already
    printed *"der Entsorgungsanteil entfällt"* on the quote while the total
    went on containing the tip fee, and dropping the whole operation would
    have been just as wrong in the other direction: somebody still rakes the
    clippings up, they just do not drive them anywhere.

    **The default answer always costs nothing.** Every market band in the
    catalogue was validated with no answers given, so an option that moved the
    price from the default would silently invalidate the band it was checked
    against. `validate_questions` fails the build on it.
    """
    key: str
    label_de: str
    type: str                      # number | choice | bool
    unit: str = ""
    options: list = field(default_factory=list)   # [(value, label_de)]
    affects: str = "note"          # qty | variant | condition | access | note
    default: object = None
    note_if: dict = field(default_factory=dict)   # {answer: note_key}
    help_de: str = ""
    uplift: dict = field(default_factory=dict)          # {answer: Range} labour
    material_uplift: dict = field(default_factory=dict)  # {answer: Range}
    drops: dict = field(default_factory=dict)            # {answer: [op key]}
    drops_disposal: dict = field(default_factory=dict)   # {answer: [op key]}


def validate_questions(jobs) -> None:
    """The guardrails on what a question is allowed to do to a price.

    Four of them, each because the alternative is a wrong quote rather than an
    untidy file:

     1. The default answer costs nothing, or the job's market band — checked
        with no answers given — stops describing what the app quotes.
     2. An uplift names an answer the question actually offers, so a typo
        cannot become an option that is silently free.
     3. A dropped operation exists on the job, so `belag_bauseits` cannot go on
        quietly failing to remove the material it promises to remove.
     4. Ranges run low-to-high and never below -1.0, which would price labour
        as a credit.
    """
    problems: list[str] = []
    for j in jobs:
        ops = {o.key for o in j.operations}
        for q in j.guided_form:
            offered = {v for v, _ in q.options} or {True, False}
            for name, table in (("uplift", q.uplift),
                                ("material_uplift", q.material_uplift)):
                for answer, rng in table.items():
                    if answer not in offered and str(answer) not in {str(o) for o in offered}:
                        problems.append(f"{j.key}/{q.key}: {name} for unoffered {answer!r}")
                    if not (isinstance(rng, tuple) and len(rng) == 2):
                        problems.append(f"{j.key}/{q.key}: {name}[{answer!r}] is not a range")
                        continue
                    if rng[0] > rng[1]:
                        problems.append(f"{j.key}/{q.key}: {name}[{answer!r}] runs backwards")
                    if rng[0] <= -1.0:
                        problems.append(f"{j.key}/{q.key}: {name}[{answer!r}] would invert the price")
                if q.default is not None and table.get(q.default, (0.0, 0.0)) != (0.0, 0.0):
                    problems.append(
                        f"{j.key}/{q.key}: the default answer {q.default!r} carries a "
                        f"{name} — the market band was validated without it")
            for name, table in (("drops", q.drops),
                                ("drops_disposal", q.drops_disposal)):
                for answer, keys in table.items():
                    if answer not in offered and str(answer) not in {str(o) for o in offered}:
                        problems.append(f"{j.key}/{q.key}: {name} for unoffered {answer!r}")
                    for k in keys:
                        if k not in ops:
                            problems.append(
                                f"{j.key}/{q.key}: {name} names {k!r}, which the job has not got")
                if q.default is not None and table.get(q.default):
                    problems.append(f"{j.key}/{q.key}: the default answer {name}")
            # Removing a disposal cost that is not there reads as a saving on
            # the quote and is not one.
            for answer, keys in q.drops_disposal.items():
                for k in keys:
                    op = next((o for o in j.operations if o.key == k), None)
                    if op is not None and not any(op.debris_kg_per_unit):
                        problems.append(
                            f"{j.key}/{q.key}: drops_disposal names {k!r}, which produces no debris")
    assert not problems, "question guardrails:\n  " + "\n  ".join(problems)


@dataclass
class Axis:
    """One domain's wording for a shared uplift.

    Condition and access are the only two questions the estimator applies to
    every job, and for a long time every job was therefore asked them in the
    same words: whether the *building* was "Neubau, besenrein" and whether it
    had a lift. On a lawn, a roof and a tyre change that is not a hard
    question — it is a question about something that is not there, and the pro
    still has to answer it, because the answer moves the price by up to 75 %.

    An axis keeps the arithmetic and replaces the words. `options` maps the
    same uplift keys the estimator already knows onto labels that describe the
    thing actually being worked on. Nothing about the calculation changes when
    a job switches axis: same keys, same uplifts, same default. Only the
    sentence the tradesperson reads changes, from one that is about a building
    to one that is about their job.
    """
    label_de: str
    options: dict           # uplift key -> German label, cheapest first
    default: str
    help_de: str = ""


@dataclass
class JobType:
    key: str
    trade: str
    label_de: str
    unit: str                       # the unit the customer thinks in
    operations: list[Operation]
    setup_hours: Range              # per job, independent of size
    typical_size: Range             # for sanity output
    market_band_at: Optional[Range] = None   # EUR per unit, all-in
    market_band_de: Optional[Range] = None
    band_basis: str = "per_unit"    # per_unit | total
    sources: list[str] = field(default_factory=list)
    note_keys: list[str] = field(default_factory=list)
    # How much to trust the band. "high" = corroborated against a published
    # DE/AT price radar; "medium" = trade knowledge, plausible but unsourced;
    # "low" = placeholder, must be checked with a practising pro before it
    # prices anything real. Recorded so the gaps are visible instead of the
    # catalogue looking uniformly authoritative.
    confidence: str = "medium"
    group: str = ""          # matches business_directory."group"
    segment: str = ""        # matches business_directory.segment
    guided_form: list = field(default_factory=list)   # list[Question]
    # Does the job make mess? Dusty work in an occupied flat needs protection,
    # daily cleanup and furniture moving — the COND_SETUP_ADD hours. A service
    # call does not: nobody masks a bathroom to unclog a sink, and charging
    # that setup pushed a 30-minute Rohrreinigung to 202 EUR against an 80-180
    # band. Repairs, inspections and maintenance set this False.
    messy: bool = True
    emergency_capable: bool = False   # can be sold as a Notdienst call-out
    # Which wording the two shared questions use for this job, or "none" where
    # the axis genuinely does not apply. Assigned in `axes.py`, not here, so
    # the whole mapping can be read on one screen instead of being scattered
    # across seven files. See `Axis` above for why this is wording only.
    condition_axis: str = "gebaeude"
    access_axis: str = "gebaeude"


# Condition and access are shared across trades: a painter and a tiler are
# both slowed by the same occupied Altbau.
COND_UPLIFT = {
    "neubau":              (0.00, 0.00),
    "renovierung_leer":    (0.12, 0.25),
    "renovierung_bewohnt": (0.30, 0.50),
    "altbau_bewohnt":      (0.45, 0.75),
}
COND_SETUP_ADD = {           # extra fixed hours, protection and daily cleanup
    "neubau":              (0.0, 0.0),
    "renovierung_leer":    (0.4, 0.8),
    "renovierung_bewohnt": (1.2, 2.0),
    "altbau_bewohnt":      (1.5, 2.5),
}
ACCESS_UPLIFT = {
    "eg_oder_lift": (0.00, 0.00),
    "og_ohne_lift": (0.08, 0.18),
    "enge_treppe":  (0.15, 0.30),
}

# Hourly rates, grounded: AT Malerstunde 35-55; DE Handwerk 35-60, Großstadt
# 50-70, Meister 70-90. Sanitär and Elektrik sit above Maler in both markets.
HOURLY = {
    "AT": {"maler": (38, 55), "fliesen": (42, 62), "boden": (38, 58), "sanitaer": (68, 112),
           "elektrik": (62, 110), "trockenbau": (40, 60), "abriss": (35, 55),
           "maurer": (42, 65), "tischler": (45, 70), "garten": (35, 55),
           "fenster": (45, 70), "dach": (45, 70), "heizung": (68, 110),
           "umzug": (30, 48), "kueche": (45, 70), "montage": (35, 58),
           "reinigung": (25, 42), "polster": (40, 62), "solar": (55, 85),
           "metallbau": (48, 72), "geruest": (38, 58),
           # Split out of `montage` once they got their own guided forms: a
           # workshop's labour rate is not an allrounder's, and lumping them
           # together meant a trade could never be repriced on its own.
           "kfz": (35, 58), "fahrrad": (35, 58), "gutachter": (35, 58)},
    "DE": {"maler": (35, 60), "fliesen": (40, 65), "boden": (36, 60), "sanitaer": (68, 115),
           "elektrik": (62, 112), "trockenbau": (38, 62), "abriss": (35, 58),
           "maurer": (40, 68), "tischler": (45, 75), "garten": (35, 58),
           "fenster": (45, 72), "dach": (45, 75), "heizung": (68, 112),
           "umzug": (30, 50), "kueche": (45, 72), "montage": (35, 60),
           "reinigung": (25, 45), "polster": (40, 65), "solar": (55, 90),
           "metallbau": (48, 75), "geruest": (38, 60),
           "kfz": (35, 60), "fahrrad": (35, 60), "gutachter": (35, 60)},
}

# EUR per tonne, by material. Bauschutt is the reference; the others differ by
# up to an order of magnitude and the difference lands directly in the quote.
# Notdienst is its own rate band, not a multiplier: AT 125-160 EUR/h, and a
# weekend call-out runs 50-100% above weekday work.
HOURLY_NOTDIENST = {"AT": (125, 160), "DE": (120, 170)}

DISPOSAL_PER_T = {
    "AT": {"bauschutt": (75, 130), "aushub": (8, 26), "gruenschnitt": (30, 70),
           "sperrmuell": (130, 260), "altholz": (60, 120), "metall": (0, 0)},
    "DE": {"bauschutt": (70, 140), "aushub": (8, 30), "gruenschnitt": (30, 75),
           "sperrmuell": (140, 280), "altholz": (60, 130), "metall": (0, 0)},
}
BAUSCHUTT_KG_PER_M3 = (1100, 1500)
