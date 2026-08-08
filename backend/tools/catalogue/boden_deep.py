"""Boden & Fliesen in depth — 20 job types with guided forms.

Two Gewerbe share one directory group and they are priced apart here:
Fliesenleger (AT 42-62 EUR/h, DE 40-65) and Bodenleger (AT 38-58, DE 36-60).
Bands: Fliesen verlegen 35-60 EUR/m2, Großformat 55-100, Laminat verlegen
15-30, Parkett verklebt 30-60, Abschleifen 25-50.
(fixbuddy.at, daibau.at, fliesenlegung.de, my-hammer.at)

Three modelling decisions worth stating.

**The covering is not in the price.** Every published Verlegepreis in both
markets is labour plus Verlegematerial — Kleber, Fuge, Trittschall — and the
tiles or planks are chosen and often bought by the customer. So material here
is the consumables, the band is the Verlegepreis, and a note says so. Folding
in a guessed 30 EUR/m2 for tiles would double the quote and put every entry
outside its own band.

**Stairs are priced per step within a staircase, not per call-out.** Priced as a `total`
band it would validate at one step, which is a call-out price and roughly
double the per-step rate anyone quotes for a run of fourteen. It is per_unit
with a typical run of 3 to 16. Replacing a few broken tiles genuinely is a
call-out, and that one stays `total`.

**The substrate decides the job.** Screed moisture, an old adhesive bed,
underfloor heating and build-up height each change the work before anything is
laid, and three of the four are invisible from a photograph. They are the
questions, and eight of these job types need a site visit because of them.
"""
from schema import JobType as J, Operation as Op, Question as Q

G = "Boden & Fliesen"
S_FL, S_BO = "Fliesenleger", "Bodenleger"
SRC_FL = ["fixbuddy.at/was-kostet-fliesen-verlegen", "fliesenlegung.de",
          "daibau.at/baukostenrechner/fliesenlegerarbeiten"]
SRC_BO = ["daibau.at/baukostenrechner/bodenbelaege", "my-hammer.at/bodenleger"]

# The single most valuable question in the group: it decides whether anything
# has to happen before the first plank or tile goes down.
Q_UNTERGRUND = Q("untergrund", "Untergrund", "choice", affects="variant",
                 options=[("estrich_neu", "Estrich, neu"),
                          ("estrich_alt", "Estrich, alt aber eben"),
                          ("fliesen_bestand", "Bestehende Fliesen"),
                          ("holzdielen", "Holzdielen"),
                          ("unbekannt", "Unbekannt")],
                 default="estrich_alt",
                 note_if={"estrich_neu": "restfeuchte_messung",
                          "fliesen_bestand": "aufbauhoehe",
                          "holzdielen": "untergrund_eben",
                          "unbekannt": "untergrund_eben"})
# A wall is not a floor, and neither is a staircase. `Q_UNTERGRUND` above lists
# floor build-ups — screed, floorboards — and it had been handed to the wall,
# mosaic, waterproofing and stair templates as well, so a tiler being asked
# what the *wall* was made of could choose "Estrich, neu" or "Holzdielen" and
# nothing else. The wet-area template was the clearest case: its own first
# question is "W1-I, Wand mit Spritzwasser" and the substrate list underneath
# it had no wall in it.
Q_UNTERGRUND_WAND = Q("untergrund", "Untergrund", "choice", affects="variant",
                      options=[("putz", "Putz oder Mauerwerk, tragfähig"),
                               ("gipskarton", "Gipskarton oder Gipsfaser"),
                               ("estrich", "Estrich oder Betonboden"),
                               ("fliesen_bestand", "Bestehende Fliesen"),
                               ("unbekannt", "Unbekannt")],
                      default="putz",
                      note_if={"gipskarton": "untergrund_tragfaehig",
                               "fliesen_bestand": "aufbauhoehe",
                               "unbekannt": "untergrund_tragfaehig"})
Q_UNTERGRUND_TREPPE = Q("untergrund", "Untergrund der Stufen", "choice",
                        affects="variant",
                        options=[("beton", "Betontreppe, roh"),
                                 ("estrich_stufen", "Stufen bereits ausgeglichen"),
                                 ("fliesen_bestand", "Bestehende Fliesen"),
                                 ("holz", "Holztreppe"),
                                 ("unbekannt", "Unbekannt")],
                        default="beton",
                        note_if={"fliesen_bestand": "aufbauhoehe",
                                 "holz": "untergrund_eben",
                                 "unbekannt": "untergrund_eben"})
Q_FBH = Q("fussbodenheizung", "Fußbodenheizung vorhanden", "bool", affects="note",
          default=False, note_if={"True": "fbh_aufheizprotokoll"})
Q_BAUJAHR = Q("baujahr", "Baujahr", "number", unit="Jahr", affects="note",
              help_de="Vor 1990 kann der Kleber Asbest enthalten.")
Q_VERLEGEART = Q("verlegeart", "Verlegeart", "choice", affects="variant",
                 options=[("gerade", "Gerade / im Verband"),
                          ("diagonal", "Diagonal"),
                          ("muster", "Muster, Fischgrät oder Bordüre")],
                 default="gerade",
                 note_if={"diagonal": "verschnitt_muster",
                          "muster": "verschnitt_muster"})
Q_RAUM = Q("raum", "Raum", "choice", affects="variant",
           options=[("wohnraum", "Wohnraum"), ("kueche", "Küche"),
                    ("bad", "Bad oder Dusche"), ("aussen", "Außenbereich")],
           default="wohnraum",
           note_if={"bad": "abdichtung_nassbereich", "aussen": "frostsicher_aussen"})
Q_TUEREN = Q("tueren_kuerzen", "Türblätter müssen gekürzt werden", "bool",
             affects="note", default=False, note_if={"True": "tuerblatt_kuerzen"})
Q_BELAG_BAUSEITS = Q("belag_bauseits", "Belag wird beigestellt", "bool",
                     affects="note", default=True,
                     note_if={"True": "belag_nicht_enthalten",
                              "False": "belag_nicht_enthalten"})

BODEN_DEEP = [
    # ── Fliesen: Abbruch ──────────────────────────────────────────────
    J(key="fliesen.entfernen_duennbett", trade="fliesen", group=G, segment=S_FL,
      label_de="Fliesen entfernen (Dünnbett)", unit="m2",
      setup_hours=(1.0, 1.8), typical_size=(6, 30),
      market_band_at=(15, 30), market_band_de=(15, 32),
      confidence="medium", sources=SRC_FL,
      note_keys=["asbest_vor_1990", "staub"],
      guided_form=[Q_BAUJAHR, Q_FBH],
      operations=[
          Op("abschlagen", "Fliesen abschlagen", "m2", (0.16, 0.27),
             debris_kg_per_unit=(20, 26)),
          Op("kleberreste", "Kleberreste abschleifen", "m2", (0.06, 0.11)),
          Op("entsorgung", "Entsorgung Bauschutt", "m2", (0, 0), kind="disposal")]),

    J(key="fliesen.entfernen_dickbett", trade="fliesen", group=G, segment=S_FL,
      label_de="Fliesen entfernen (Dickbett, Altbau)", unit="m2",
      setup_hours=(1.2, 2.2), typical_size=(6, 25),
      market_band_at=(25, 55), market_band_de=(25, 58),
      confidence="medium", sources=SRC_FL,
      note_keys=["asbest_vor_1990", "staub", "dickbett_mehraufwand"],
      guided_form=[
          Q("bett", "Verlegeart des Bestands", "choice", affects="variant",
            options=[("duennbett", "Dünnbett, Kleber sichtbar"),
                     ("dickbett", "Dickbett, Mörtelbett 15-40 mm"),
                     ("unbekannt", "Unbekannt")],
            default="unbekannt", note_if={"unbekannt": "dickbett_mehraufwand"},
            help_de="An einer Fliesenkante ablesbar — die wertvollste Frage im Formular"),
          Q_BAUJAHR, Q_FBH],
      operations=[
          # 15-40 mm cement bed. Breaker work, not chisel work.
          Op("abschlagen", "Fliesen und Mörtelbett abschlagen", "m2", (0.34, 0.58),
             debris_kg_per_unit=(45, 75)),
          Op("untergrund", "Untergrund nacharbeiten", "m2", (0.08, 0.16)),
          Op("entsorgung", "Entsorgung Bauschutt", "m2", (0, 0), kind="disposal")]),

    # ── Fliesen: Verlegen ─────────────────────────────────────────────
    J(key="fliesen.verlegen_boden", trade="fliesen", group=G, segment=S_FL,
      label_de="Bodenfliesen verlegen", unit="m2",
      setup_hours=(1.2, 2.0), typical_size=(8, 40),
      market_band_at=(35, 60), market_band_de=(35, 65),
      confidence="high", sources=SRC_FL,
      note_keys=["untergrund_eben", "verschnitt_muster", "belag_nicht_enthalten"],
      guided_form=[Q_UNTERGRUND, Q_VERLEGEART, Q_RAUM, Q_FBH, Q_TUEREN,
                   Q_BELAG_BAUSEITS],
      operations=[
          Op("grundierung", "Grundierung", "m2", (0.03, 0.05)),
          Op("verlegen", "Fliesen verlegen", "m2", (0.35, 0.55)),
          Op("verfugen", "Verfugen und Silikon", "m2", (0.10, 0.18)),
          Op("kleber", "Kleber und Fugenmasse", "m2", (0, 0), kind="material",
             material_per_unit=(4.50, 8.00), waste_factor=0.05)]),

    J(key="fliesen.verlegen_wand", trade="fliesen", group=G, segment=S_FL,
      label_de="Wandfliesen verlegen", unit="m2",
      setup_hours=(1.2, 2.0), typical_size=(8, 30),
      market_band_at=(40, 70), market_band_de=(40, 75),
      confidence="high", sources=SRC_FL,
      note_keys=["abdichtung_nassbereich", "belag_nicht_enthalten"],
      guided_form=[Q_UNTERGRUND_WAND, Q_VERLEGEART, Q_RAUM, Q_BELAG_BAUSEITS],
      operations=[
          Op("abdichtung", "Verbundabdichtung Nassbereich", "m2", (0.10, 0.18),
             material_per_unit=(3.00, 5.50)),
          Op("verlegen", "Wandfliesen verlegen", "m2", (0.40, 0.62)),
          Op("verfugen", "Verfugen und Silikon", "m2", (0.10, 0.18)),
          Op("kleber", "Kleber und Fugenmasse", "m2", (0, 0), kind="material",
             material_per_unit=(4.50, 8.00), waste_factor=0.05)]),

    J(key="fliesen.grossformat", trade="fliesen", group=G, segment=S_FL,
      label_de="Großformatfliesen verlegen (ab 60x120)", unit="m2",
      setup_hours=(1.5, 2.5), typical_size=(10, 45),
      market_band_at=(55, 100), market_band_de=(55, 110),
      confidence="medium", sources=SRC_FL,
      # Two people, a levelling system and the buttering-floating method. It is
      # the same trade doing a materially different job, and quoting it at the
      # 30x60 rate is how a tiler loses a day.
      note_keys=["untergrund_eben", "grossformat_zweiter_mann",
                 "belag_nicht_enthalten"],
      guided_form=[
          Q("format", "Format", "choice", affects="variant",
            options=[("60x120", "60 x 120"), ("100x100", "100 x 100"),
                     ("120x240", "120 x 240 oder größer")],
            default="60x120", note_if={"120x240": "grossformat_zweiter_mann"}),
          Q_UNTERGRUND, Q_RAUM, Q_FBH, Q_BELAG_BAUSEITS],
      operations=[
          Op("nivellieren", "Untergrund prüfen und nivellieren", "m2", (0.10, 0.18),
             material_per_unit=(2.00, 4.50)),
          Op("grundierung", "Grundierung", "m2", (0.03, 0.05)),
          Op("verlegen", "Verlegen im Kombiverfahren mit Nivelliersystem", "m2",
             (0.55, 0.90)),
          Op("verfugen", "Verfugen und Silikon", "m2", (0.10, 0.18)),
          Op("kleber", "Fließbettkleber, Fuge, Nivellierkeile", "m2", (0, 0),
             kind="material", material_per_unit=(7.00, 12.00), waste_factor=0.08)]),

    J(key="fliesen.mosaik", trade="fliesen", group=G, segment=S_FL,
      label_de="Mosaik verlegen", unit="m2",
      setup_hours=(1.0, 1.8), typical_size=(2, 12),
      market_band_at=(70, 140), market_band_de=(70, 150),
      confidence="low", sources=SRC_FL,
      note_keys=["verschnitt_muster", "belag_nicht_enthalten"],
      guided_form=[Q_UNTERGRUND_WAND, Q_RAUM, Q_BELAG_BAUSEITS],
      operations=[
          Op("grundierung", "Grundierung", "m2", (0.04, 0.07)),
          # Net-mounted sheets, not loose tesserae — the coefficient for
          # individual pieces put this 4 percent over its own band ceiling.
          Op("verlegen", "Mosaik ansetzen und verlegen", "m2", (0.90, 1.60)),
          # Far more joint per m2 than any other format, and it is the part
          # that takes the time rather than the placing.
          Op("verfugen", "Verfugen und Silikon", "m2", (0.22, 0.40)),
          Op("kleber", "Kleber und Fugenmasse", "m2", (0, 0), kind="material",
             material_per_unit=(6.00, 12.00), waste_factor=0.08)]),

    J(key="fliesen.treppe", trade="fliesen", group=G, segment=S_FL,
      label_de="Treppe fliesen", unit="Stufe",
      setup_hours=(1.0, 1.8), typical_size=(3, 16),
      # per_unit, not total. Priced as a total band it would validate at one
      # step — a call-out price, roughly double the per-step rate anyone quotes
      # for a run of fourteen.
      market_band_at=(70, 160), market_band_de=(70, 170),
      confidence="low", sources=SRC_FL,
      note_keys=["aufmass_vor_fertigung", "belag_nicht_enthalten"],
      guided_form=[
          Q("stufen", "Anzahl Stufen", "number", unit="Stufe", affects="qty", default=14),
          Q("setzstufe", "Mit Setzstufe", "bool", affects="variant", default=True),
          Q_UNTERGRUND_TREPPE, Q_BELAG_BAUSEITS],
      operations=[
          Op("zuschnitt", "Zuschnitt Tritt- und Setzstufe", "Stufe", (0.35, 0.60)),
          Op("setzen", "Stufen setzen", "Stufe", (0.55, 0.95)),
          Op("verfugen", "Verfugen und Silikon", "Stufe", (0.15, 0.28)),
          Op("mat", "Kleber, Fuge, Kantenprofil", "Stufe", (0, 0), kind="material",
             material_per_unit=(8.00, 18.00), waste_factor=0.08)]),

    J(key="fliesen.terrasse", trade="fliesen", group=G, segment=S_FL,
      label_de="Terrasse fliesen (frostsicher)", unit="m2",
      setup_hours=(2.0, 3.5), typical_size=(10, 35),
      market_band_at=(60, 120), market_band_de=(60, 130),
      confidence="low", sources=SRC_FL,
      note_keys=["frostsicher_aussen", "gefaelle", "witterung",
                 "belag_nicht_enthalten"],
      guided_form=[
          Q("aufbau", "Aufbau", "choice", affects="variant",
            options=[("drainmoertel", "Drainmörtel, gebunden"),
                     ("stelzlager", "Stelzlager, lose"),
                     ("splitt", "Splittbett")],
            default="drainmoertel"),
          Q("gefaelle_vorhanden", "Gefälle vorhanden", "bool", affects="note",
            default=True, note_if={"False": "gefaelle"}),
          # No `Q_UNTERGRUND` here. `aufbau` above already asks what the
          # terrace is built on, and the floor list underneath it was offering
          # "Estrich, neu" and "Holzdielen" as the base of a frost-proof
          # outdoor surface — two answers that are wrong and one question too
          # many.
          Q_BELAG_BAUSEITS],
      operations=[
          Op("pruefen", "Untergrund und Gefälle prüfen", "m2", (0.08, 0.15)),
          Op("abdichten", "Abdichtung und Drainage", "m2", (0.15, 0.28),
             material_per_unit=(5.00, 10.00)),
          Op("verlegen", "Frostsicher verlegen", "m2", (0.45, 0.75)),
          Op("verfugen", "Verfugen, Randfugen elastisch", "m2", (0.12, 0.22)),
          Op("mat", "Drainmörtel bzw. Lager, Fuge", "m2", (0, 0), kind="material",
             material_per_unit=(9.00, 18.00), waste_factor=0.08)]),

    # ── Fliesen: Reparatur und Wartung ────────────────────────────────
    J(key="fliesen.abdichtung", trade="fliesen", group=G, segment=S_FL,
      label_de="Verbundabdichtung Nassbereich", unit="m2",
      setup_hours=(0.8, 1.5), typical_size=(4, 18),
      market_band_at=(22, 45), market_band_de=(22, 48),
      confidence="medium", sources=SRC_FL,
      # ÖNORM B 3407 / DIN 18534. The one line a bathroom quote cannot omit
      # and the one most often left out to win the job.
      note_keys=["abdichtung_nassbereich", "fliesen_folgt"],
      guided_form=[
          Q("beanspruchung", "Beanspruchungsklasse", "choice", affects="variant",
            options=[("w1", "W1-I, Wand mit Spritzwasser"),
                     ("w2", "W2-I, bodengleiche Dusche"),
                     ("w3", "W3-I, öffentlich oder Dampfbad")],
            default="w2"),
          Q_UNTERGRUND_WAND],
      operations=[
          Op("vorbereiten", "Untergrund vorbereiten und grundieren", "m2", (0.05, 0.09)),
          Op("dichtband", "Dichtbänder, Ecken und Manschetten", "m2", (0.08, 0.15),
             material_per_unit=(2.50, 5.00)),
          Op("abdichten", "Abdichtung, zwei Lagen", "m2", (0.15, 0.28)),
          Op("mat", "Abdichtungsmasse und Grundierung", "m2", (0, 0), kind="material",
             material_per_unit=(4.00, 8.00), waste_factor=0.08)]),

    J(key="fliesen.fugen_sanieren", trade="fliesen", group=G, segment=S_FL,
      label_de="Fugen erneuern", unit="m2",
      setup_hours=(1.0, 1.8), typical_size=(4, 20),
      market_band_at=(18, 40), market_band_de=(18, 45),
      confidence="low", sources=SRC_FL,
      note_keys=["staub", "fugenfarbe_abweichung"],
      guided_form=[
          Q("umfang", "Umfang", "choice", affects="variant",
            options=[("nur_silikon", "Nur Silikonfugen"),
                     ("teilweise", "Schadhafte Fugen"),
                     ("komplett", "Alle Fugen ausfräsen")],
            default="komplett"),
          Q_RAUM],
      operations=[
          Op("ausfraesen", "Fugen ausfräsen", "m2", (0.15, 0.30),
             debris_kg_per_unit=(1.5, 3.5)),
          Op("reinigen", "Reinigen und entstauben", "m2", (0.06, 0.12)),
          Op("verfugen", "Neu verfugen", "m2", (0.10, 0.18)),
          Op("mat", "Fugenmasse und Silikon", "m2", (0, 0), kind="material",
             material_per_unit=(2.00, 4.00), waste_factor=0.08)]),

    J(key="fliesen.silikonfugen", trade="fliesen", group=G, segment=S_FL,
      messy=False,
      label_de="Silikonfugen erneuern", unit="lfm",
      setup_hours=(0.4, 0.7), typical_size=(4, 20),
      market_band_at=(8, 18), market_band_de=(8, 20),
      confidence="medium", sources=SRC_FL,
      # The recurring maintenance job of the trade: a wet-room silicone joint
      # is a wear part with a 3-5 year life, not a defect.
      note_keys=["silikon_wartungsfuge"],
      guided_form=[
          Q("laenge", "Fugenlänge", "number", unit="lfm", affects="qty", default=8),
          Q("schimmel", "Schimmel in der Fuge", "bool", affects="note",
            default=False, note_if={"True": "schimmel_ursache_extra"}),
          Q_RAUM],
      operations=[
          Op("entfernen", "Altfuge entfernen", "lfm", (0.06, 0.12)),
          Op("reinigen", "Reinigen und entfetten", "lfm", (0.03, 0.06)),
          Op("ziehen", "Neue Silikonfuge ziehen", "lfm", (0.05, 0.10)),
          Op("mat", "Sanitärsilikon und Vorlegeband", "lfm", (0, 0), kind="material",
             material_per_unit=(0.80, 1.60), waste_factor=0.10)]),

    J(key="fliesen.einzelne_ersetzen", trade="fliesen", group=G, segment=S_FL,
      messy=False,
      label_de="Einzelne Fliesen ersetzen", unit="Stk",
      setup_hours=(0.4, 0.7), typical_size=(1, 4), band_basis="total",
      # Genuinely a call-out: one to four tiles, where the travel and setup are
      # most of the price. This is the case a `total` band describes correctly.
      market_band_at=(60, 180), market_band_de=(60, 190),
      confidence="low", sources=SRC_FL,
      note_keys=["fliesen_ersatz_farbton"],
      guided_form=[
          Q("anzahl", "Anzahl Fliesen", "number", unit="Stk", affects="qty", default=1),
          Q("ersatz_vorhanden", "Ersatzfliesen vorhanden", "bool", affects="note",
            default=False, note_if={"False": "fliesen_ersatz_farbton"}),
          Q_BAUJAHR],
      operations=[
          Op("entfernen", "Fliese und Kleberbett entfernen", "Stk", (0.25, 0.50),
             debris_kg_per_unit=(3, 6)),
          Op("untergrund", "Untergrund vorbereiten", "Stk", (0.15, 0.30)),
          Op("setzen", "Neue Fliese setzen und verfugen", "Stk", (0.25, 0.50)),
          Op("mat", "Fliese, Kleber, Fuge", "Stk", (0, 0), kind="material",
             material_per_unit=(8.00, 25.00), waste_factor=0.10)]),

    J(key="fliesen.sockelleisten", trade="fliesen", group=G, segment=S_FL,
      label_de="Fliesensockel setzen", unit="lfm",
      setup_hours=(0.6, 1.2), typical_size=(8, 40),
      market_band_at=(9, 20), market_band_de=(9, 22),
      confidence="low", sources=SRC_FL,
      note_keys=["belag_nicht_enthalten"],
      guided_form=[
          Q("laenge", "Länge", "number", unit="lfm", affects="qty", default=20),
          Q_BELAG_BAUSEITS],
      operations=[
          Op("zuschnitt", "Zuschnitt und Ansetzen", "lfm", (0.08, 0.15)),
          Op("verfugen", "Verfugen und Silikon", "lfm", (0.04, 0.08)),
          Op("mat", "Kleber, Fuge, Silikon", "lfm", (0, 0), kind="material",
             material_per_unit=(1.20, 2.50), waste_factor=0.08)]),

    # ── Boden ─────────────────────────────────────────────────────────
    J(key="boden.belag_entfernen", trade="boden", group=G, segment=S_BO,
      label_de="Alten Bodenbelag entfernen", unit="m2",
      setup_hours=(0.6, 1.2), typical_size=(15, 60),
      market_band_at=(6, 16), market_band_de=(6, 18),
      confidence="medium", sources=SRC_BO,
      note_keys=["asbest_vor_1990", "staub"],
      guided_form=[
          Q("belagsart", "Bisheriger Belag", "choice", affects="variant",
            options=[("laminat_klick", "Laminat, schwimmend"),
                     ("teppich_geklebt", "Teppich, geklebt"),
                     ("pvc_geklebt", "PVC oder Linoleum, geklebt"),
                     ("parkett_geklebt", "Parkett, geklebt")],
            default="laminat_klick",
            note_if={"pvc_geklebt": "asbest_vor_1990"}),
          Q_BAUJAHR],
      operations=[
          Op("entfernen", "Belag aufnehmen", "m2", (0.06, 0.13),
             debris_kg_per_unit=(3, 8), debris_type="sperrmuell"),
          Op("kleberreste", "Kleberreste entfernen", "m2", (0.04, 0.09)),
          Op("leisten", "Sockelleisten demontieren", "m2", (0.02, 0.05))]),

    J(key="boden.ausgleich", trade="boden", group=G, segment=S_BO,
      label_de="Untergrund spachteln und ausgleichen", unit="m2",
      setup_hours=(1.0, 1.8), typical_size=(15, 60),
      market_band_at=(12, 28), market_band_de=(12, 30),
      confidence="medium", sources=SRC_BO,
      note_keys=["untergrund_eben", "trocknung_nutzung"],
      guided_form=[
          Q("hoehe", "Ausgleichshöhe", "choice", affects="variant",
            options=[("bis_5", "Bis 5 mm"), ("bis_15", "5 bis 15 mm"),
                     ("ueber_15", "Über 15 mm")],
            default="bis_5", note_if={"ueber_15": "aufbauhoehe"}),
          Q_UNTERGRUND, Q_FBH],
      operations=[
          Op("grundierung", "Grundierung", "m2", (0.03, 0.06),
             material_per_unit=(1.00, 2.00)),
          Op("ausgleichen", "Ausgleichsmasse auftragen", "m2", (0.10, 0.20),
             material_per_unit=(5.00, 11.00), waste_factor=0.08)]),

    J(key="boden.laminat", trade="boden", group=G, segment=S_BO,
      label_de="Laminat verlegen", unit="m2",
      setup_hours=(0.8, 1.5), typical_size=(15, 60),
      market_band_at=(15, 30), market_band_de=(15, 32),
      confidence="high", sources=SRC_BO,
      note_keys=["untergrund_eben", "dehnungsfuge", "belag_nicht_enthalten"],
      guided_form=[Q_UNTERGRUND, Q_VERLEGEART, Q_FBH, Q_TUEREN,
                   Q_BELAG_BAUSEITS],
      operations=[
          Op("unterlage", "Trittschalldämmung verlegen", "m2", (0.03, 0.06),
             material_per_unit=(2.00, 4.00)),
          Op("verlegen", "Laminat verlegen", "m2", (0.14, 0.24)),
          Op("leisten", "Sockelleisten montieren", "m2", (0.06, 0.10),
             material_per_unit=(2.50, 4.50))]),

    J(key="boden.vinyl", trade="boden", group=G, segment=S_BO,
      label_de="Vinyl oder Designbelag verlegen", unit="m2",
      setup_hours=(1.0, 1.8), typical_size=(15, 55),
      market_band_at=(18, 38), market_band_de=(18, 40),
      confidence="medium", sources=SRC_BO,
      note_keys=["untergrund_eben", "belag_nicht_enthalten", "raumklima"],
      guided_form=[
          Q("verlegung", "Verlegung", "choice", affects="variant",
            options=[("klick", "Klick, schwimmend"),
                     ("vollflaechig", "Vollflächig verklebt")],
            default="klick", note_if={"vollflaechig": "trocknung_nutzung"}),
          Q_UNTERGRUND, Q_FBH, Q_TUEREN, Q_BELAG_BAUSEITS],
      operations=[
          Op("spachteln", "Untergrund spachteln", "m2", (0.08, 0.14),
             material_per_unit=(2.00, 3.50)),
          Op("verlegen", "Belag verlegen", "m2", (0.16, 0.28)),
          Op("leisten", "Sockelleisten montieren", "m2", (0.06, 0.10),
             material_per_unit=(2.50, 4.50))]),

    J(key="boden.parkett", trade="boden", group=G, segment=S_BO,
      label_de="Parkett verlegen (verklebt)", unit="m2",
      setup_hours=(1.0, 1.8), typical_size=(15, 60),
      market_band_at=(30, 60), market_band_de=(32, 65),
      confidence="high", sources=SRC_BO,
      note_keys=["untergrund_eben", "raumklima", "belag_nicht_enthalten"],
      guided_form=[Q_UNTERGRUND, Q_VERLEGEART, Q_FBH, Q_TUEREN,
                   Q_BELAG_BAUSEITS],
      operations=[
          Op("spachteln", "Untergrund spachteln", "m2", (0.08, 0.14),
             material_per_unit=(2.00, 3.50)),
          Op("verkleben", "Parkett vollflächig verkleben", "m2", (0.28, 0.45),
             material_per_unit=(4.00, 7.00)),
          Op("schleifen", "Schleifen und versiegeln", "m2", (0.12, 0.22),
             material_per_unit=(2.50, 4.50), tier_min="standard")]),

    J(key="boden.parkett_schleifen", trade="boden", group=G, segment=S_BO,
      label_de="Parkett oder Dielen abschleifen und versiegeln", unit="m2",
      setup_hours=(1.5, 2.5), typical_size=(15, 60),
      market_band_at=(25, 50), market_band_de=(25, 55),
      confidence="medium", sources=SRC_BO,
      note_keys=["staub", "trocknung_nutzung", "schleifen_restdicke"],
      guided_form=[
          Q("zustand_belag", "Zustand", "choice", affects="variant",
            options=[("leicht", "Leichte Gebrauchsspuren"),
                     ("stark", "Stark abgenutzt, tiefe Kratzer"),
                     ("lack_alt", "Alter Lack, mehrlagig")],
            default="stark"),
          Q("oberflaeche", "Neue Oberfläche", "choice", affects="variant",
            options=[("versiegelung", "Versiegelung"), ("oel", "Öl oder Hartwachs")],
            default="versiegelung", note_if={"oel": "holzschutz_intervall"}),
          Q_BAUJAHR],
      operations=[
          Op("vorbereiten", "Nägel versenken, Fugen kitten", "m2", (0.05, 0.10)),
          Op("grobschliff", "Grobschliff", "m2", (0.10, 0.18),
             debris_kg_per_unit=(0.5, 1.2)),
          Op("feinschliff", "Fein- und Zwischenschliff", "m2", (0.14, 0.24)),
          Op("versiegeln", "Dreimal versiegeln", "m2", (0.16, 0.28),
             material_per_unit=(4.00, 8.00), waste_factor=0.08)]),

    J(key="boden.teppich", trade="boden", group=G, segment=S_BO,
      label_de="Teppichboden verlegen", unit="m2",
      setup_hours=(0.8, 1.5), typical_size=(15, 60),
      market_band_at=(14, 32), market_band_de=(14, 35),
      confidence="low", sources=SRC_BO,
      note_keys=["untergrund_eben", "belag_nicht_enthalten"],
      guided_form=[
          Q("verlegung", "Verlegung", "choice", affects="variant",
            options=[("lose", "Lose verlegt"), ("geklebt", "Vollflächig geklebt")],
            default="geklebt"),
          Q_UNTERGRUND, Q_TUEREN, Q_BELAG_BAUSEITS],
      operations=[
          Op("vorbereiten", "Untergrund reinigen und grundieren", "m2", (0.05, 0.10),
             material_per_unit=(0.80, 1.60)),
          Op("verlegen", "Teppich zuschneiden und verlegen", "m2", (0.14, 0.26),
             material_per_unit=(2.50, 5.00)),
          Op("leisten", "Sockelleisten montieren", "m2", (0.06, 0.10),
             material_per_unit=(2.50, 4.50))]),
]
