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
    "AT": {"maler": (38, 55), "fliesen": (42, 62), "sanitaer": (68, 112),
           "elektrik": (55, 85), "trockenbau": (40, 60), "abriss": (35, 55),
           "maurer": (42, 65), "tischler": (45, 70), "garten": (35, 55),
           "fenster": (45, 70), "dach": (45, 70), "heizung": (68, 110),
           "umzug": (30, 48), "kueche": (45, 70), "montage": (35, 58),
           "reinigung": (25, 42), "polster": (40, 62), "solar": (55, 85),
           "metallbau": (48, 72), "geruest": (38, 58)},
    "DE": {"maler": (35, 60), "fliesen": (40, 65), "sanitaer": (68, 115),
           "elektrik": (55, 90), "trockenbau": (38, 62), "abriss": (35, 58),
           "maurer": (40, 68), "tischler": (45, 75), "garten": (35, 58),
           "fenster": (45, 72), "dach": (45, 75), "heizung": (68, 112),
           "umzug": (30, 50), "kueche": (45, 72), "montage": (35, 60),
           "reinigung": (25, 45), "polster": (40, 65), "solar": (55, 90),
           "metallbau": (48, 75), "geruest": (38, 60)},
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
