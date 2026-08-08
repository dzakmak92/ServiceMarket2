"""What each answer in the guided form costs.

Until now, nothing. The estimator read the quantity, condition, access and the
Notdienst flag; every other question was recorded, printed on the quote as an
assumption, and absent from the number underneath it. Measured on
`maler.innenanstrich`: all five Untergrund options moved the price by exactly
€0 while Zustand moved it by €307. So a painter who answered "Altbau, Leim-
oder Kalkfarbe" — which means washing every wall down to the plaster before a
brush is lifted — was quoted the price for an intact wall, and the quote said
in words that the wall was not intact.

That is the gap this file closes. Each entry says what one answer adds to the
hours, to the material, or to the scope, and `services/estimator.py` reads it.

**How to read a number here.** `("altbau_leimfarbe", (0.35, 0.60))` means that
answer adds 35–60 % to the labour of the whole job, additively, in the same
pool as condition and access — never multiplied, because stacking multipliers
is what produced v0's 5.7x worst case. The two ends are the honest spread, not
a confidence interval.

**Where the numbers come from.** Trade practice and the physical content of
the work: a third coat is roughly half a coat's labour again; a rippled cast
radiator has three times the surface of a flat panel; dry-strippable fleece
wallpaper comes off in sheets and painted-over woodchip does not. They are
reasoned, not sourced from a price radar, and they are deliberately conserv-
ative — the catalogue's `confidence` field already says which *bands* are
corroborated, and none of these uplifts is. A pro who disagrees is right, and
the range is wide enough to say so.

**The default answer is always absent.** Every market band in the catalogue is
validated with no answers given, so an uplift on a default would invalidate the
band it was checked against. `schema.validate_questions` fails the build on it,
which is why several entries below carry a *negative* uplift instead: where the
catalogue's default is the harder case — a hedge cut on both sides, a badly
weathered window, mould over half a square metre — the cheaper answers are the
ones that move.
"""
from dataclasses import replace

# Keyed either by question key, which applies wherever that question appears,
# or by "job.key/question.key" for the one job that needs to differ. Job-
# specific entries win. Each value is a dict of the four fields a Question
# carries: uplift, material_uplift, drops, drops_disposal.

def _u(**kw):
    """One entry, written as uplift=..., material=..., drops=..., no_disposal=..."""
    return {"uplift": kw.get("uplift", {}),
            "material_uplift": kw.get("material", {}),
            "drops": kw.get("drops", {}),
            "drops_disposal": kw.get("no_disposal", {})}


PRICING: dict[str, dict] = {

    # ══ Maler ═══════════════════════════════════════════════════════════

    # The substrate is the single biggest thing a painter's estimate gets
    # wrong, and it was worth nothing. Leimfarbe is the extreme: it cannot be
    # painted over at all, and the note attached to it already said so.
    "untergrund": _u(
        uplift={"gipskarton_neu": (0.00, 0.05),
                "raufaser": (0.00, 0.03),
                "altbau_leimfarbe": (0.35, 0.60),
                "schadhaft": (0.20, 0.40)},
        material={"gipskarton_neu": (0.05, 0.15),
                  "altbau_leimfarbe": (0.15, 0.30),
                  "schadhaft": (0.10, 0.25)}),

    # Furniture was `affects="note"` and cost nothing. Moving a fully furnished
    # room, covering it and uncovering it daily is the most reliable half-day
    # of unbilled work in the trade.
    "moebel": _u(uplift={"teilweise": (0.06, 0.12), "voll": (0.15, 0.28)}),

    # Both of these mean an extra coat, and one of them means a different
    # product. The notes promised them; the totals did not contain them.
    "nikotin": _u(uplift={"True": (0.10, 0.18)},
                  material={"True": (0.20, 0.40)}),
    "farbwechsel": _u(uplift={"True": (0.28, 0.40)},
                      material={"True": (0.30, 0.45)}),

    "tapetenart": _u(uplift={"raufaser_mehrfach": (0.30, 0.55),
                             "vlies": (-0.35, -0.20),
                             "papier_alt": (0.45, 0.80)}),
    "ansatz": _u(uplift={"ohne": (-0.08, -0.04), "versetzt": (0.10, 0.18)},
                 material={"ohne": (-0.05, -0.02), "versetzt": (0.10, 0.20)}),
    # The customer is buying the paper. It is the whole material line.
    "material_bauseits": _u(drops={"True": ["mat"]}),

    "altlack": _u(uplift={"abblaetternd": (0.35, 0.60),
                          "furnier_roh": (0.15, 0.30)},
                  material={"furnier_roh": (0.10, 0.20)}),
    # A ribbed radiator has roughly three times the surface of a flat panel and
    # every bit of it is brush work.
    "maler.heizkoerper_lackieren/typ": _u(
        uplift={"rippen": (0.35, 0.60), "guss_alt": (0.50, 0.85)}),
    "maler.holzfenster_streichen/zustand_holz": _u(
        uplift={"gut": (-0.20, -0.12), "schaeden": (0.30, 0.55)}),
    "maler.holzschutz/zustand_holz": _u(
        uplift={"neu": (-0.15, -0.08), "lasiert_intakt": (-0.12, -0.06)}),
    "maler.strukturputz/art": _u(
        uplift={"rollputz": (-0.15, -0.10), "spachtel_dekor": (0.35, 0.65)},
        material={"rollputz": (-0.10, -0.05), "spachtel_dekor": (0.20, 0.45)}),
    "maler.risse_sanieren/art": _u(
        uplift={"setzriss": (0.40, 0.80), "anschlussfuge": (0.10, 0.25)}),
    "untergrund_aussen": _u(
        uplift={"putz_kreidend": (0.15, 0.30), "wdvs_bestand": (0.05, 0.12),
                "sichtbeton": (0.10, 0.25)},
        material={"putz_kreidend": (0.15, 0.30), "sichtbeton": (0.10, 0.20)}),
    "maler.fassade/hoehe": _u(uplift={"bis_4": (0.08, 0.15), "ueber_4": (0.18, 0.32)}),
    "maler.fassade_reinigen/verschmutzung": _u(
        uplift={"staub": (-0.25, -0.15), "graffiti": (0.40, 0.90)},
        material={"graffiti": (0.50, 1.20)}),
    "daemmstoff": _u(uplift={"mineralwolle": (0.10, 0.18), "holzfaser": (0.12, 0.22)},
                     material={"mineralwolle": (0.25, 0.45), "holzfaser": (0.35, 0.70)}),
    "staerke": _u(material={"12": (-0.10, -0.06), "20": (0.12, 0.20)}),
    "untergrund_boden": _u(
        uplift={"beton_neu": (-0.10, -0.05), "estrich": (0.00, 0.08),
                "beschichtet": (0.35, 0.70)}),
    "feuchte": _u(uplift={"True": (0.15, 0.30)}, material={"True": (0.25, 0.50)}),
    # Default is True — the catalogue prices the containment case. Below the
    # threshold there is no abschottung, so it is the "no" that moves.
    "umfang_gross": _u(uplift={"False": (-0.30, -0.18)},
                       material={"False": (-0.35, -0.20)}),

    # ══ Fliesen und Boden ═══════════════════════════════════════════════

    "fliesen.verlegen_boden/untergrund": _u(
        uplift={"estrich_neu": (0.00, 0.05), "fliesen_bestand": (0.10, 0.20),
                "holzdielen": (0.25, 0.45), "unbekannt": (0.05, 0.15)},
        material={"fliesen_bestand": (0.05, 0.15), "holzdielen": (0.15, 0.35)}),
    "fliesen.grossformat/untergrund": _u(
        uplift={"estrich_neu": (0.00, 0.05), "fliesen_bestand": (0.10, 0.20),
                "holzdielen": (0.25, 0.45), "unbekannt": (0.05, 0.15)},
        material={"fliesen_bestand": (0.05, 0.15), "holzdielen": (0.15, 0.35)}),
    # The wall, mosaic and wet-area list. Plasterboard in a wet room needs a
    # board change or a full seal, and tiling onto tile needs a bonding primer.
    "fliesen.verlegen_wand/untergrund": _u(
        uplift={"gipskarton": (0.05, 0.15), "fliesen_bestand": (0.12, 0.22),
                "unbekannt": (0.05, 0.15)},
        material={"gipskarton": (0.05, 0.20), "fliesen_bestand": (0.05, 0.15)}),
    "fliesen.mosaik/untergrund": _u(
        uplift={"gipskarton": (0.05, 0.15), "fliesen_bestand": (0.12, 0.22),
                "unbekannt": (0.05, 0.15)},
        material={"gipskarton": (0.05, 0.20), "fliesen_bestand": (0.05, 0.15)}),
    "fliesen.abdichtung/untergrund": _u(
        uplift={"gipskarton": (0.08, 0.18), "fliesen_bestand": (0.10, 0.20),
                "unbekannt": (0.05, 0.15)},
        material={"gipskarton": (0.10, 0.25)}),
    "fliesen.treppe/untergrund": _u(
        uplift={"estrich_stufen": (-0.10, -0.05), "fliesen_bestand": (0.15, 0.30),
                "holz": (0.30, 0.55), "unbekannt": (0.05, 0.15)},
        material={"holz": (0.15, 0.35)}),
    # Boden: the same list, and the same physical reasons.
    "boden.laminat/untergrund": _u(
        uplift={"fliesen_bestand": (0.05, 0.12), "holzdielen": (0.15, 0.30),
                "unbekannt": (0.05, 0.15)}),
    "boden.vinyl/untergrund": _u(
        uplift={"fliesen_bestand": (0.08, 0.18), "holzdielen": (0.20, 0.40),
                "unbekannt": (0.05, 0.15)}),
    "boden.parkett/untergrund": _u(
        uplift={"fliesen_bestand": (0.10, 0.22), "holzdielen": (0.20, 0.40),
                "unbekannt": (0.05, 0.15)}),
    "boden.teppich/untergrund": _u(
        uplift={"fliesen_bestand": (0.05, 0.12), "holzdielen": (0.12, 0.25),
                "unbekannt": (0.05, 0.15)}),
    "boden.ausgleich/untergrund": _u(
        uplift={"fliesen_bestand": (0.08, 0.18), "holzdielen": (0.20, 0.40),
                "unbekannt": (0.08, 0.20)}),

    # Diagonal and pattern laying: more cuts, more waste. The note already said
    # "Verschnitt ist mit dem angegebenen Prozentsatz kalkuliert. Diagonal- oder
    # Musterverlegung erhöht den Verschnitt" — and then did not increase it.
    "verlegeart": _u(uplift={"diagonal": (0.10, 0.18), "muster": (0.20, 0.35)},
                     material={"diagonal": (0.06, 0.12), "muster": (0.10, 0.20)}),
    # Two different questions share the key `verlegung`. Vinyl defaults to
    # click-fit and teppich to loose-laid, so on both it is gluing that costs.
    "boden.vinyl/verlegung": _u(uplift={"vollflaechig": (0.15, 0.30)},
                                material={"vollflaechig": (0.15, 0.30)}),
    # Carpet defaults to fully bonded, so it is loose-laying that saves.
    "boden.teppich/verlegung": _u(uplift={"lose": (-0.25, -0.15)},
                                  material={"lose": (-0.25, -0.15)}),
    # Small rooms, more cuts around fittings, and outdoors adds frost detailing.
    "raum": _u(uplift={"kueche": (0.05, 0.10), "bad": (0.10, 0.20),
                       "aussen": (0.12, 0.25)}),
    "format": _u(uplift={"100x100": (0.05, 0.12), "120x240": (0.25, 0.45)},
                 material={"120x240": (0.10, 0.20)}),
    "bett": _u(uplift={"dickbett": (0.30, 0.55), "duennbett": (-0.20, -0.12)}),
    "zustand_belag": _u(uplift={"leicht": (-0.18, -0.10), "lack_alt": (0.20, 0.40)}),
    "oberflaeche": _u(uplift={"oel": (0.08, 0.18)}, material={"oel": (0.10, 0.25)}),
    # Default is the thinnest pour, so both other answers add.
    "boden.ausgleich/hoehe": _u(
        uplift={"bis_15": (0.15, 0.30), "ueber_15": (0.40, 0.75)},
        material={"bis_15": (0.35, 0.70), "ueber_15": (0.90, 1.80)}),
    "beanspruchung": _u(uplift={"w1": (-0.15, -0.08), "w3": (0.25, 0.45)},
                        material={"w1": (-0.15, -0.08), "w3": (0.20, 0.40)}),
    "umfang": _u(uplift={"nur_silikon": (-0.45, -0.30), "teilweise": (-0.25, -0.15)}),
    "setzstufe": _u(uplift={"False": (-0.30, -0.20)},
                    material={"False": (-0.25, -0.15)}),
    "aufbau": _u(uplift={"stelzlager": (-0.15, -0.08), "splitt": (-0.05, 0.00)},
                 material={"stelzlager": (0.10, 0.25)}),

    # ══ Garten ══════════════════════════════════════════════════════════

    # The note has always read "der Entsorgungsanteil entfällt". Now it does.
    "gruenschnitt": _u(no_disposal={"verbleibt": ["schnittgut", "abrechen",
                                                  "zusammen", "gruenschnitt",
                                                  "haeckseln"]}),
    "aushub_abtransport": _u(no_disposal={"verbleibt": ["aushub"]}),

    "garten.hecke_schnitt/hoehe": _u(
        uplift={"bis_150": (-0.20, -0.12), "ueber_250": (0.25, 0.50)}),
    "seiten": _u(uplift={"einseitig": (-0.35, -0.25)}),
    "garten.baumschnitt/groesse": _u(
        uplift={"obstbaum": (-0.35, -0.25), "gross": (0.45, 0.85)}),
    "garten.baumfaellung/groesse": _u(
        uplift={"bis_8": (-0.30, -0.20), "ueber_15": (0.40, 0.75)}),
    "umfeld": _u(uplift={"frei": (-0.30, -0.20)}),
    "menge": _u(uplift={"leicht": (-0.30, -0.20)}),
    "moos": _u(uplift={"False": (-0.15, -0.08)}),
    "vorbereitung": _u(uplift={"erdplanum": (-0.20, -0.12), "bauland": (0.25, 0.50)}),
    "belastung": _u(uplift={"fussweg": (-0.20, -0.12), "lkw": (0.30, 0.55)},
                    material={"fussweg": (-0.15, -0.10), "lkw": (0.25, 0.50)}),
    "garten.zaun/hoehe": _u(uplift={"100": (-0.10, -0.06), "200": (0.12, 0.22)},
                            material={"100": (-0.15, -0.10), "200": (0.18, 0.30)}),
    "garten.sichtschutz/hoehe": _u(uplift={"150": (-0.08, -0.04), "200": (0.10, 0.18)},
                                   material={"150": (-0.12, -0.08), "200": (0.12, 0.22)}),
    "garten.hecke_pflanzen/hoehe": _u(
        uplift={"bis_100": (-0.15, -0.10), "ueber_175": (0.20, 0.40)},
        material={"bis_100": (-0.25, -0.15), "ueber_175": (0.35, 0.70)}),
    "tiefe": _u(uplift={"bis_60": (-0.20, -0.12), "ueber_100": (0.30, 0.55)}),
    "funktion": _u(uplift={"stuetz": (0.25, 0.50)}, material={"stuetz": (0.20, 0.40)}),
    "bepflanzung": _u(uplift={"bodendecker": (-0.15, -0.10), "gehoelze": (0.15, 0.30)},
                      material={"bodendecker": (-0.25, -0.15), "gehoelze": (0.30, 0.60)}),
    "vlies": _u(uplift={"False": (-0.12, -0.08)}, material={"False": (-0.20, -0.12)}),
    "steuerung": _u(uplift={"manuell": (-0.15, -0.10), "smart": (0.10, 0.20)},
                    material={"manuell": (-0.25, -0.15), "smart": (0.25, 0.50)}),
    "bereitschaft": _u(uplift={"werktags": (-0.25, -0.15),
                               "bereitschaft_24": (0.30, 0.60)}),
    "streumittel": _u(material={"salz": (-0.15, 0.00)}),
    "garten.terrasse_holz/material": _u(
        material={"laerche": (-0.20, -0.10), "bangkirai": (0.15, 0.40)}),
    "garten.sichtschutz/material": _u(
        uplift={"holz": (-0.05, 0.00), "glas_alu": (0.15, 0.30)},
        material={"holz": (-0.20, -0.10), "glas_alu": (0.40, 0.90)}),
    "garten.treppe_aussen/material": _u(
        uplift={"betonstein": (-0.10, -0.05), "naturstein": (0.20, 0.40)},
        material={"betonstein": (-0.20, -0.10), "naturstein": (0.35, 0.80)}),
    "unterkonstruktion": _u(uplift={"splitt": (0.10, 0.20),
                                    "punktfundamente": (0.25, 0.45)},
                            material={"punktfundamente": (0.10, 0.25)}),
    "garten.pool/groesse": _u(uplift={"klein": (-0.25, -0.15), "gross": (0.30, 0.55)},
                              material={"klein": (-0.25, -0.15), "gross": (0.35, 0.70)}),
    "technik": _u(uplift={"basis": (-0.15, -0.10), "premium": (0.20, 0.40)},
                  material={"basis": (-0.25, -0.15), "premium": (0.40, 0.80)}),
    # Cutting a lawn every week keeps it short; a fortnightly cut in high
    # season is the harder one, and a one-off on a long lawn harder still.
    "haeufigkeit": _u(uplift={"einmalig": (0.15, 0.30),
                              "woechentlich": (-0.15, -0.08)}),

    # ══ Sanitär ═════════════════════════════════════════════════════════

    "montageart": _u(uplift={"stand": (-0.15, -0.08),
                             "umbau_wandhaengend": (0.60, 1.10)},
                     material={"umbau_wandhaengend": (0.50, 1.00)}),
    "spuelkasten": _u(uplift={"unterputz_neu": (0.35, 0.65), "aufputz": (-0.10, -0.05)},
                      material={"unterputz_neu": (0.40, 0.80)}),
    "sanitaer.waschtisch/typ": _u(
        uplift={"moebel": (0.15, 0.30), "aufsatz": (0.10, 0.25)},
        material={"moebel": (0.30, 0.60), "aufsatz": (0.15, 0.35)}),
    "anschluesse": _u(uplift={"versetzen": (0.35, 0.65), "neu": (0.55, 1.00)},
                      material={"versetzen": (0.10, 0.25), "neu": (0.20, 0.45)}),
    "abgas": _u(uplift={"neu_erforderlich": (0.25, 0.50), "ungeklaert": (0.10, 0.25)},
                material={"neu_erforderlich": (0.20, 0.45)}),
    "standort": _u(uplift={"keller": (0.05, 0.12), "dachboden": (0.12, 0.28)}),
    "ort": _u(uplift={"sichtbar": (-0.35, -0.25), "wand": (0.15, 0.30),
                      "boden": (0.30, 0.60)}),
    "absperrventil": _u(uplift={"False": (0.15, 0.35)}),
    "sanitaer.spuelkasten/typ": _u(uplift={"ap": (-0.25, -0.15)}),
    "sanitaer.therme_wartung/typ": _u(uplift={"brennwert": (0.10, 0.20)}),
    "sanitaer.rohrreinigung_waschbecken/art": _u(uplift={"kueche": (0.10, 0.25)}),
    "sanitaer.rohrreinigung_wc/umfang": _u(uplift={"mehrere": (0.45, 0.90)}),
    "sanitaer.dichtheitspruefung/umfang": _u(uplift={"haus": (0.50, 1.00)}),
    "sanitaer.bad_basis/leitungen": _u(uplift={"True": (0.35, 0.70)},
                                       material={"True": (0.20, 0.45)}),
    "fliesen_alt": _u(uplift={"dickbett": (0.15, 0.30), "duennbett": (-0.10, -0.05)}),
    # Default is "nein / unbekannt" — the catalogue prices the case where the
    # floor has to come up. Confirming 12 cm of build-up is the saving.
    "aufbauhoehe": _u(uplift={"ja": (-0.35, -0.20)}, material={"ja": (-0.25, -0.12)}),
    "sanitaer.steigleitung/verlegung": _u(
        uplift={"aufputz": (-0.25, -0.15)}, material={"aufputz": (0.05, 0.15)}),
    "elektrik.steckdose/wand": _u(
        uplift={"beton": (0.25, 0.50), "hohlwand": (-0.15, -0.08)}),
    "sanitaer.duschkabine/wand": _u(uplift={"False": (0.20, 0.45)}),

    # ══ Elektrik ════════════════════════════════════════════════════════

    "elektrik.steckdose/leitung": _u(uplift={"neue_zuleitung": (0.45, 0.90)},
                                     material={"neue_zuleitung": (0.30, 0.70)}),
    "elektrik.gegensprechanlage/leitung": _u(
        uplift={"nein": (0.35, 0.70)}, material={"nein": (0.25, 0.55)}),
    "elektrik.leitung_verlegen/verlegung": _u(
        uplift={"hohlraum": (-0.30, -0.20), "aufputz": (-0.35, -0.25)}),
    "elektrik.leitung_verlegen/untergrund": _u(
        uplift={"gipskarton": (-0.25, -0.15), "beton": (0.35, 0.70)}),
    "elektrik.wallbox/verlegung": _u(
        uplift={"unterputz": (0.20, 0.40), "erdverlegt": (0.55, 1.10)},
        material={"erdverlegt": (0.25, 0.55)}),
    "elektrik.leuchte_montieren/art": _u(
        uplift={"haengeleuchte": (0.10, 0.20), "spots": (0.35, 0.70)}),
    "elektrik.e_befund/objekt": _u(uplift={"haus": (0.25, 0.50),
                                           "gewerbe": (0.55, 1.10)}),
    # Labelled Standard / Gehoben / Smart Home; the keys are the tier names.
    "ausstattung": _u(uplift={"basic": (-0.15, -0.08), "premium": (0.35, 0.70)},
                      material={"basic": (-0.20, -0.12), "premium": (0.60, 1.20)}),
    "symptom": _u(uplift={"teilausfall": (0.15, 0.30), "flackern": (0.20, 0.40)}),
    "vernetzt": _u(uplift={"True": (0.10, 0.25)}, material={"True": (0.30, 0.60)}),
    "durchbruch": _u(uplift={"True": (0.20, 0.45)}),
    # `unbekannt` is the default, so the catalogue already prices the
    # contingency; what moves is finding out it was warranted, or not.
    "altanlage": _u(uplift={"modern": (-0.12, -0.06), "mit_pe": (-0.06, 0.00),
                            "klassisch_null": (0.20, 0.40)}),

    # ══ Reinigung und Montage ═══════════════════════════════════════════

    # These trades' templates get their guided forms in the next commit; the
    # question keys they will use are priced there, with the questions.
}


def apply(jobs) -> list:
    """Attach the tables above to the questions they name.

    Returns the entries that matched nothing, so a renamed question cannot
    quietly stop pricing. `alljobs.py` fails the build on a non-empty result:
    the failure mode this guards against is silent — the form goes on asking,
    the estimate goes back to ignoring the answer, and nothing looks broken.
    """
    used: set[str] = set()
    for j in jobs:
        # Each job gets its own copies first. The deep files share Question
        # instances between templates on purpose — `Q_ABTRANSPORT` is one
        # object used by five garden jobs — which is fine while a question is
        # only a label, and wrong the moment it carries a price: writing the
        # green-waste rule for the hedge template would have written it onto
        # the mowing template too, naming an operation mowing has not got.
        j.guided_form = [replace(q) for q in j.guided_form]
        for q in j.guided_form:
            entry = PRICING.get(f"{j.key}/{q.key}")
            if entry is not None:
                used.add(f"{j.key}/{q.key}")
            else:
                entry = PRICING.get(q.key)
                if entry is not None:
                    used.add(q.key)
            if not entry:
                continue
            q.uplift = dict(entry["uplift"])
            q.material_uplift = dict(entry["material_uplift"])
            # An operation named for one job but absent from another sharing
            # the same question is simply not dropped there — the green-waste
            # entry names five collection operations across five templates.
            ops = {o.key for o in j.operations}
            q.drops = {a: [k for k in v if k in ops]
                       for a, v in entry["drops"].items()}
            q.drops = {a: v for a, v in q.drops.items() if v}
            q.drops_disposal = {a: [k for k in v if k in ops]
                                for a, v in entry["drops_disposal"].items()}
            q.drops_disposal = {a: v for a, v in q.drops_disposal.items() if v}
    return sorted(set(PRICING) - used)
