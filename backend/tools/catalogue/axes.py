"""Which words the two shared questions use, per job.

The estimator applies exactly two modifiers to every job type: how hard the
conditions are, and how hard the thing is to reach. They are worth up to +75 %
and +30 % respectively — between them the largest lever in the catalogue after
quantity itself.

For a long time both were asked in one vocabulary, the vocabulary of an
interior renovation. Every job that did not declare its own wording got
"Zustand des Objekts — Neubau, besenrein / Renovierung, leerstehend / …" and
"Zugang — Erdgeschoss oder Lift / Obergeschoss ohne Lift / Enge Treppe",
appended by the survey builder. That was 89 of 149 job types for condition and
80 for access, and it produced questions like:

  · mowing a lawn, asked whether the building is broom-clean;
  · replacing four tyres, asked whether the flat has a lift;
  · re-roofing a house, asked to choose between a lift and a narrow staircase
    for work that happens on a roof;
  · painting a facade, asked about a staircase while the same form already
    asks, correctly, whether a scaffold is needed.

A pro cannot answer those. They pick something, and the something they pick
moves the price. The garden templates show what the fix looks like — twelve of
the twenty already carried hand-written garden wording ("Zustand der Fläche —
Neuanlage, frei / Bestand, gepflegt / …") — but the other eight had been
missed, and every trade outside the five with a deep-catalogue file had no
wording of its own at all.

**The arithmetic does not change.** An axis is a relabelling. Its options are
the same uplift keys `COND_UPLIFT` and `ACCESS_UPLIFT` already contain, in the
same order, with the same default. Switching a job from one axis to another
moves no number: the estimate for an unanswered form is identical before and
after, and so is the market-band check, which runs at `renovierung_leer` and
`eg_oder_lift` in both cases.

**"none" is for where the axis is not a wording problem but an absent one.** A
sewer camera survey has no building condition to report — finding out what
state the pipe is in *is* the job. Where an axis is "none" the question is not
asked and the uplift stays at the value the job's market band was calibrated
against, which is the same value an unanswered question produces today. So
removing a question a pro could not answer does not silently reprice the work.
"""
from schema import Axis

# ── Condition ───────────────────────────────────────────────────────────
#
# Four levels, always in the same order: no uplift, +12–25 %, +30–50 %,
# +45–75 %. What separates the levels is constant across every axis — how much
# of the time goes on working around something that is in the way, and on
# protecting it. Only the something changes.

CONDITION_AXES: dict[str, Axis] = {
    "gebaeude": Axis(
        "Zustand des Objekts",
        {"neubau": "Neubau, besenrein",
         "renovierung_leer": "Renovierung, leerstehend",
         "renovierung_bewohnt": "Renovierung, bewohnt",
         "altbau_bewohnt": "Altbau, bewohnt"},
        "renovierung_leer",
        "Bewohnt kostet mehr als leerstehend: abdecken, täglich aufräumen."),

    # Kept apart from `gebaeude` because the trades that use it care about
    # occupancy for a different reason: a plumber coordinates a water shut-off
    # with the people living there, and "besenrein" says nothing about that.
    "wohnung": Axis(
        "Zustand der Wohnung",
        {"neubau": "Neubau, leer",
         "renovierung_leer": "Renovierung, Wohnung leer",
         "renovierung_bewohnt": "Renovierung, bewohnt",
         "altbau_bewohnt": "Altbau, bewohnt"},
        "renovierung_leer",
        "Bewohnt heißt: abstimmen, abdecken, Wasser nur kurz abstellen."),

    "flaeche": Axis(
        "Zustand der Fläche",
        {"neubau": "Neuanlage, frei",
         "renovierung_leer": "Bestand, gepflegt",
         "renovierung_bewohnt": "Bestand, verwildert",
         "altbau_bewohnt": "Stark verwildert, Wurzelwerk"},
        "renovierung_leer",
        "Was auf der Fläche steht, muss zuerst weg — das ist die Zeit."),

    # `flaeche` above asks what has to be cleared before building something on
    # the ground. That is the right question for paving, a fence or a pool, and
    # the wrong one for the jobs that *are* the clearing: nobody mows a
    # "Neuanlage, frei", and asking a gardener to place a hedge cut on a scale
    # that starts at "newly laid" is the same category error as asking them
    # whether the building is broom-clean. The levels here are the ones that
    # actually decide how long maintenance takes — how far the growth has got
    # since somebody last did it.
    "bewuchs": Axis(
        "Zustand des Bewuchses",
        {"neubau": "Kurz, regelmäßig gepflegt",
         "renovierung_leer": "Normal aufgewachsen",
         "renovierung_bewohnt": "Hoch, länger nicht gemacht",
         "altbau_bewohnt": "Verwildert, verholzt"},
        "renovierung_leer",
        "Je länger nichts gemacht wurde, desto mehr Schnittgut und desto "
        "langsamer die Maschine."),

    # Winter service is the one garden job where nothing grows. What decides
    # the time is how much of the surface a machine can take and how much has
    # to be done by hand — steps, kerbs, gateways, parked cars.
    "raeumflaeche": Axis(
        "Zustand der Räumfläche",
        {"neubau": "Eben, frei, maschinell räumbar",
         "renovierung_leer": "Überwiegend maschinell, einzelne Hindernisse",
         "renovierung_bewohnt": "Verwinkelt, Stufen und Kanten",
         "altbau_bewohnt": "Eng, überwiegend Handarbeit"},
        "renovierung_leer",
        "Was die Maschine nicht schafft, wird geschoben und gestreut — "
        "von Hand."),

    # For work on the outside of a building. The driver is not what the flat
    # looks like but what has to be protected and worked around: plantings,
    # parked cars, balconies in use, windows that cannot be masked shut.
    "umfeld": Axis(
        "Umfeld am Gebäude",
        {"neubau": "Baustelle, frei",
         "renovierung_leer": "Bestand, frei zugänglich",
         "renovierung_bewohnt": "Bewohnt, Balkone und Fenster in Nutzung",
         "altbau_bewohnt": "Altbestand, empfindliches Umfeld"},
        "renovierung_leer",
        "Was rundherum geschützt werden muss, kostet Zeit vor und nach der Arbeit."),

    "fahrzeug": Axis(
        "Zustand des Fahrzeugs",
        {"neubau": "Neuwertig",
         "renovierung_leer": "Gepflegt, normaler Zustand",
         "renovierung_bewohnt": "Ältere Ausführung, Verschleiß sichtbar",
         "altbau_bewohnt": "Stark korrodiert oder festgefahren"},
        "renovierung_leer",
        "Festsitzende Schrauben und Korrosion sind der Zeitfresser."),

    "verschmutzung": Axis(
        "Verschmutzungsgrad",
        {"neubau": "Leicht, regelmäßig gepflegt",
         "renovierung_leer": "Normal, üblicher Gebrauch",
         "renovierung_bewohnt": "Stark verschmutzt",
         "altbau_bewohnt": "Extrem, Verkrustung, Ruß oder Fett"},
        "renovierung_leer",
        "Der größte Hebel in der Reinigung: einmal wischen oder dreimal."),

    "moebel": Axis(
        "Zustand des Möbels",
        {"neubau": "Neuwertig, nur neuer Bezug",
         "renovierung_leer": "Gebraucht, Polsterung intakt",
         "renovierung_bewohnt": "Stark abgenutzt, Polsterung ergänzen",
         "altbau_bewohnt": "Antik oder Gestell locker"},
        "renovierung_leer",
        "Was unter dem Bezug erneuert werden muss, entscheidet über die Stunden."),
}

# ── Access ──────────────────────────────────────────────────────────────
#
# Three levels: no uplift, +8–18 %, +15–30 %. What separates them is how much
# of the day goes on carrying material and tools to where the work is.

ACCESS_AXES: dict[str, Axis] = {
    "gebaeude": Axis(
        "Zugang",
        {"eg_oder_lift": "Erdgeschoss oder Lift",
         "og_ohne_lift": "Obergeschoss ohne Lift",
         "enge_treppe": "Enge Treppe"},
        "eg_oder_lift",
        "Ohne Lift kommt Tragzeit dazu — bei enger Treppe deutlich mehr."),

    "grundstueck": Axis(
        "Zugang zum Grundstück",
        {"eg_oder_lift": "Direkt befahrbar",
         "og_ohne_lift": "Nur über Gehweg oder Tor",
         "enge_treppe": "Nur über Treppe oder Durchgang"},
        "eg_oder_lift",
        "Ob die Maschine bis zur Fläche kommt, entscheidet über Stunden."),

    # Height work. The old wording offered a lift and a staircase for jobs
    # done on a roof or off a scaffold — and on the facade templates it sat
    # next to a Gerüst question that was already asking the real thing.
    "hoehe": Axis(
        "Zugang zur Arbeitsfläche",
        {"eg_oder_lift": "Vom Boden oder von der Leiter erreichbar",
         "og_ohne_lift": "Anleiterung oder Hubsteiger nötig",
         "enge_treppe": "Nur über Gerüst erreichbar"},
        "eg_oder_lift",
        "Wie die Arbeitshöhe erreicht wird. Gerüst und Bühne werden gesondert angeboten."),

    "werkstatt": Axis(
        "Wo wird gearbeitet",
        {"eg_oder_lift": "In der Werkstatt",
         "og_ohne_lift": "Beim Kunden vor Ort",
         "enge_treppe": "Vor Ort und beengt (Tiefgarage, Hof)"},
        "eg_oder_lift",
        "Vor Ort fehlen Hebebühne und Werkzeugwand — das kostet Zeit."),
}

# ── Assignment ──────────────────────────────────────────────────────────
#
# By trade first, because within a trade the answer is nearly always the same,
# then by job for the exceptions. Every exception below is a job that happens
# somewhere other than inside the dwelling its trade normally works in.

TRADE_AXES: dict[str, tuple[str, str]] = {
    # trade: (condition axis, access axis)
    "maler":      ("gebaeude", "gebaeude"),
    "fliesen":    ("gebaeude", "gebaeude"),
    "boden":      ("gebaeude", "gebaeude"),
    "garten":     ("flaeche", "grundstueck"),
    "elektrik":   ("wohnung", "gebaeude"),
    "sanitaer":   ("wohnung", "gebaeude"),
    "heizung":    ("wohnung", "gebaeude"),
    "reinigung":  ("verschmutzung", "gebaeude"),
    "montage":    ("gebaeude", "gebaeude"),
    "tischler":   ("gebaeude", "gebaeude"),
    "kueche":     ("gebaeude", "gebaeude"),
    "trockenbau": ("gebaeude", "gebaeude"),
    "maurer":     ("gebaeude", "gebaeude"),
    "abriss":     ("gebaeude", "gebaeude"),
    "metallbau":  ("gebaeude", "gebaeude"),
    "fenster":    ("gebaeude", "gebaeude"),
    "umzug":      ("gebaeude", "gebaeude"),
    "gutachter":  ("gebaeude", "gebaeude"),
    # Whole trades that never work inside a flat.
    "dach":       ("umfeld", "hoehe"),
    "solar":      ("umfeld", "hoehe"),
    "geruest":    ("umfeld", "hoehe"),
    "kfz":        ("fahrzeug", "werkstatt"),
    "fahrrad":    ("fahrzeug", "werkstatt"),
    "polster":    ("moebel", "werkstatt"),
}

JOB_AXES: dict[str, tuple[str, str]] = {
    # ── Maler: the outside of the building is not the inside of the flat ──
    "maler.fassade":               ("umfeld", "hoehe"),
    "maler.fassade_reinigen":      ("umfeld", "hoehe"),
    "maler.wdvs":                  ("umfeld", "hoehe"),
    "maler.holzfenster_streichen": ("umfeld", "hoehe"),
    # "Holzfassade oder Zaun lasieren" — a fence has no storeys and is not
    # broom-clean. It is reached from the ground, which is what `hoehe` says.
    "maler.holzschutz":            ("umfeld", "hoehe"),

    # ── Fliesen: one of them is outdoors on the ground ──
    "fliesen.terrasse":            ("flaeche", "grundstueck"),

    # ── Elektrik: two jobs that happen on an outside wall ──
    "elektrik.aussensteckdose":    ("umfeld", "grundstueck"),
    "elektrik.wallbox":            ("umfeld", "grundstueck"),

    # ── Sanitär: the pipe's condition is the survey's result, not its input ──
    "sanitaer.kamerabefahrung":    ("none", "gebaeude"),

    # ── Reinigung: three of the nine are not a dwelling ──
    "reinigung.tiefgarage":        ("verschmutzung", "grundstueck"),
    "reinigung.graffiti":          ("verschmutzung", "hoehe"),
    "reinigung.fenster":           ("verschmutzung", "hoehe"),

    # ── Montage: mounted on the facade, worked from a ladder ──
    "montage.markise":             ("umfeld", "hoehe"),
    "fenster.markise":             ("umfeld", "hoehe"),

    # ── Garten: maintenance is not construction ──
    # These five are the jobs where the growth *is* the work. See `bewuchs`.
    "garten.rasenmaehen":          ("bewuchs", "grundstueck"),
    "garten.vertikutieren":        ("bewuchs", "grundstueck"),
    "garten.laub":                 ("bewuchs", "grundstueck"),
    "garten.hecke_schnitt":        ("bewuchs", "grundstueck"),
    "garten.baumschnitt":          ("bewuchs", "grundstueck"),
    # And the one where nothing grows at all: asking a snow-clearing contract
    # whether the ground is "stark verwildert, Wurzelwerk" is the last of the
    # questions nobody could answer.
    "garten.winterdienst":         ("raeumflaeche", "grundstueck"),

    # ── Garten: the pool is a hole in the ground, not a planted area ──
    # Its own `aushub` and `leitungen` questions carry the ground; what the
    # condition axis measures here is what has to be cleared and reinstated.
    "garten.pool":                 ("flaeche", "grundstueck"),
}


def axes_for(job) -> tuple[str, str]:
    """The (condition, access) axis pair for one job type."""
    cond, acc = TRADE_AXES.get(job.trade, ("gebaeude", "gebaeude"))
    return JOB_AXES.get(job.key, (cond, acc))


def validate(jobs) -> None:
    """Fails loudly rather than defaulting a typo to the building wording.

    An axis name that does not exist, or an override for a job key that does
    not, would otherwise be invisible: the job would simply keep asking about
    a building and nobody would see it until a pro complained.
    """
    keys = {j.key for j in jobs}
    trades = {j.trade for j in jobs}
    unknown_job = sorted(set(JOB_AXES) - keys)
    unknown_trade = sorted(set(TRADE_AXES) - trades)
    missing_trade = sorted(trades - set(TRADE_AXES))
    assert not unknown_job, f"JOB_AXES names jobs that do not exist: {unknown_job}"
    assert not unknown_trade, f"TRADE_AXES names trades that do not exist: {unknown_trade}"
    assert not missing_trade, f"trades with no axis assignment: {missing_trade}"
    for name, (c, a) in list(JOB_AXES.items()) + [(t, v) for t, v in TRADE_AXES.items()]:
        assert c == "none" or c in CONDITION_AXES, f"{name}: unknown condition axis {c!r}"
        assert a == "none" or a in ACCESS_AXES, f"{name}: unknown access axis {a!r}"
