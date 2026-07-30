from schema import JobType, Operation as Op, Question as Q

# Shared answers, same vocabulary as the deep trade files.
Q_ZUGANG = Q("access", "Zugang", "choice", affects="access",
             options=[("eg_oder_lift", "Erdgeschoss oder Lift"),
                      ("og_ohne_lift", "Obergeschoss ohne Lift"),
                      ("enge_treppe", "Enge Treppe")], default="eg_oder_lift")
Q_ZUSTAND = Q("condition", "Zustand", "choice", affects="condition",
              options=[("neubau", "Neubau, leer"),
                       ("renovierung_leer", "Renovierung, leer"),
                       ("renovierung_bewohnt", "Renovierung, bewohnt"),
                       ("altbau_bewohnt", "Altbau, bewohnt")],
              default="renovierung_leer")
Q_BAUJAHR = Q("baujahr", "Baujahr", "number", unit="Jahr", affects="note")
Q_ABSPERR = Q("absperrventil", "Absperrventil vorhanden und dicht", "bool",
              affects="note", default=True, note_if={"False": "kein_absperrventil"})
Q_ALTANLAGE = Q("altanlage", "Zustand der Bestandsanlage", "choice", affects="note",
                options=[("modern", "Modern, mit FI"),
                         ("mit_pe", "Älter, aber mit Schutzleiter"),
                         ("klassisch_null", "Klassische Nullung / kein PE"),
                         ("unbekannt", "Unbekannt")],
                default="unbekannt",
                note_if={"klassisch_null": "klassische_nullung",
                         "unbekannt": "altanlage_unbekannt"})

# Boden & Fliesen moved to boden_deep.py when the group was deepened from six
# job types to twenty — the six here were reproduced there with guided forms,
# so leaving them would have duplicated every key.
#
# The Sanitär and Elektrik lists below are different: sanitaer_deep.py and
# elektrik_deep.py *add* to them rather than replace them. These seven job
# types were the odd ones out in two otherwise-deep trades — a Wärmepumpe had
# a survey and a Gastherme did not — so they carry guided forms too now. The
# remaining trades have none by design: they are wide coverage, not depth.

# ── Sanitär ───────────────────────────────────────────────────────────
# Bands here are per PIECE (unit Stk), so band_basis is the whole job.
SANITAER = [
    JobType(
        key="sanitaer.wc_tauschen", messy=False, trade="sanitaer",
        label_de="WC tauschen (wandhängend)", unit="Stk",
        setup_hours=(0.6, 1.0), typical_size=(1, 1),
        market_band_at=(280, 650), market_band_de=(300, 700),
        band_basis="total", note_keys=["absperrventil", "altgeraet_entsorgung"],
        guided_form=[
            Q("anzahl", "Anzahl WCs", "number", unit="Stk", affects="qty", default=1),
            Q("montageart", "Montageart", "choice", affects="variant",
              options=[("wandhaengend_bestand", "Wandhängend, Vorwand vorhanden"),
                       ("stand", "Stand-WC gegen Stand-WC"),
                       ("umbau_wandhaengend", "Stand-WC auf wandhängend umbauen")],
              default="wandhaengend_bestand",
              note_if={"umbau_wandhaengend": "vorwand_erforderlich"}),
            Q("spuelkasten", "Spülkasten", "choice", affects="variant",
              options=[("unterputz_bleibt", "Unterputz, bleibt"),
                       ("unterputz_neu", "Unterputz, wird getauscht"),
                       ("aufputz", "Aufputz")],
              default="unterputz_bleibt",
              note_if={"unterputz_neu": "oeffnung_wand"}),
            Q_ABSPERR, Q_BAUJAHR, Q_ZUGANG],
        operations=[
            Op("demontage", "Altgerät demontieren", "Stk", (0.5, 0.9),
               debris_kg_per_unit=(20, 35)),
            Op("montage", "WC montieren und anschließen", "Stk", (1.3, 2.2)),
            Op("dichtheit", "Dichtheitsprüfung", "Stk", (0.2, 0.4)),
            Op("material", "Kleinmaterial, Dichtungen, Silikon", "Stk", (0.0, 0.0),
               kind="material", material_per_unit=(35, 80)),
        ],
    ),
    JobType(
        key="sanitaer.waschtisch", messy=False, trade="sanitaer",
        label_de="Waschtisch mit Armatur tauschen", unit="Stk",
        setup_hours=(0.5, 0.9), typical_size=(1, 1),
        market_band_at=(220, 520), market_band_de=(240, 560),
        band_basis="total", note_keys=["altgeraet_entsorgung"],
        guided_form=[
            Q("anzahl", "Anzahl Waschtische", "number", unit="Stk", affects="qty",
              default=1),
            Q("typ", "Ausführung", "choice", affects="variant",
              options=[("standard", "Standard-Waschtisch"),
                       ("moebel", "Möbelwaschtisch mit Unterschrank"),
                       ("aufsatz", "Aufsatzbecken")],
              default="standard"),
            Q("anschluesse", "Anschlüsse", "choice", affects="variant",
              options=[("passend", "Vorhanden und passend"),
                       ("versetzen", "Müssen versetzt werden"),
                       ("neu", "Neu herzustellen")],
              default="passend",
              note_if={"versetzen": "oeffnung_wand", "neu": "oeffnung_wand"}),
            Q_ABSPERR, Q_BAUJAHR, Q_ZUGANG],
        operations=[
            Op("demontage", "Altgerät demontieren", "Stk", (0.4, 0.7),
               debris_kg_per_unit=(15, 30)),
            Op("montage", "Waschtisch und Armatur montieren", "Stk", (1.0, 1.8)),
            Op("material", "Eckventile, Siphon, Kleinmaterial", "Stk", (0.0, 0.0),
               kind="material", material_per_unit=(45, 95)),
        ],
    ),
    JobType(
        key="sanitaer.therme_tausch", trade="sanitaer",
        label_de="Gastherme tauschen", unit="Stk",
        setup_hours=(1.0, 1.8), typical_size=(1, 1),
        market_band_at=(2600, 4800), market_band_de=(2800, 5200),
        band_basis="total",
        note_keys=["rauchfangkehrer", "gasleitung_normgerecht", "foerderung"],
        guided_form=[
            Q("abgas", "Abgasführung", "choice", affects="variant",
              options=[("bestand_nutzbar", "Bestand weiter nutzbar"),
                       ("neu_erforderlich", "Neu erforderlich"),
                       ("ungeklaert", "Noch zu klären")],
              default="bestand_nutzbar",
              note_if={"neu_erforderlich": "rauchfangkehrer",
                       "ungeklaert": "rauchfangkehrer"}),
            Q("standort", "Standort", "choice", affects="variant",
              options=[("bad_kueche", "Bad oder Küche"), ("keller", "Keller"),
                       ("dachboden", "Dachboden")],
              default="bad_kueche"),
            Q("baujahr_anlage", "Baujahr der Altanlage", "number", unit="Jahr",
              affects="note",
              help_de="Über 20 Jahre: Ersatzteile oft nicht mehr verfügbar"),
            Q("umstellung", "Wechsel des Energieträgers geplant", "bool",
              affects="note", default=False, note_if={"True": "foerderung"}),
            Q_ZUGANG],
        operations=[
            Op("demontage", "Altgerät demontieren, Anlage entleeren", "Stk", (1.5, 2.5),
               debris_kg_per_unit=(35, 60)),
            Op("geraet", "Gastherme inkl. Montagezubehör", "Stk", (0.0, 0.0),
               kind="material", material_per_unit=(1800, 2900)),
            Op("montage", "Montage, Anschluss Gas/Wasser/Strom", "Stk", (4.5, 7.0)),
            Op("inbetriebnahme", "Inbetriebnahme und Einregulierung", "Stk", (1.2, 2.0)),
        ],
    ),
    JobType(
        key="sanitaer.rohrbruch", trade="sanitaer",
        label_de="Rohrbruch orten und reparieren", unit="psch",
        setup_hours=(0.8, 1.5), typical_size=(1, 1),
        market_band_at=(350, 1200), market_band_de=(380, 1300),
        band_basis="total", note_keys=["folgeschaeden", "oeffnung_wand"],
        # The one job in this file that is sold at night. Notdienst is a
        # different service at a different rate, not a surcharge on this one.
        emergency_capable=True,
        guided_form=[
            Q("ort", "Vermutete Schadensstelle", "choice", affects="variant",
              options=[("sichtbar", "Sichtbar zugänglich"),
                       ("wand", "In der Wand"), ("boden", "Im Boden oder Estrich"),
                       ("unbekannt", "Unbekannt")],
              default="unbekannt",
              note_if={"boden": "leitungsortung", "unbekannt": "leitungsortung"}),
            Q("wasser_ab", "Wasser ist abgestellt", "bool", affects="note",
              default=False, note_if={"False": "kein_absperrventil"}),
            Q("zeit", "Einsatzzeit", "choice", affects="variant",
              options=[("regulaer", "Werktag 7-17 Uhr"),
                       ("nacht_sonntag", "Nacht oder Sonn-/Feiertag")],
              default="regulaer", note_if={"nacht_sonntag": "nacht_zuschlag"}),
            Q("folgeschaden", "Bereits Wasserschaden sichtbar", "bool",
              affects="note", default=True, note_if={"True": "folgeschaeden"}),
            Q_BAUJAHR, Q_ZUGANG],
        operations=[
            Op("ortung", "Leckortung", "psch", (1.0, 2.5)),
            Op("oeffnen", "Wand/Boden öffnen", "psch", (1.0, 2.5),
               debris_kg_per_unit=(30, 90)),
            Op("reparatur", "Rohr reparieren, Dichtheitsprüfung", "psch", (1.5, 3.5)),
            Op("material", "Rohrmaterial, Fittings", "psch", (0.0, 0.0),
               kind="material", material_per_unit=(60, 220)),
        ],
    ),
]

# ── Elektrik ──────────────────────────────────────────────────────────
ELEKTRIK = [
    JobType(
        key="elektrik.steckdose", trade="elektrik",
        label_de="Steckdose setzen (Unterputz, Bestand)", unit="Stk",
        setup_hours=(0.2, 0.35), typical_size=(1, 6),
        market_band_at=(70, 180), market_band_de=(75, 190),
        band_basis="total", note_keys=["e_befund", "altbau_leitungen"],
        guided_form=[
            Q("anzahl", "Anzahl Steckdosen", "number", unit="Stk", affects="qty",
              default=1),
            Q("wand", "Wandaufbau", "choice", affects="variant",
              options=[("hohlwand", "Gipskarton / Hohlwand"),
                       ("ziegel", "Ziegel oder Putz"), ("beton", "Beton")],
              default="ziegel", note_if={"beton": "staub"}),
            Q("leitung", "Zuleitung", "choice", affects="variant",
              options=[("vorhanden", "Vorhanden, abzweigbar"),
                       ("neue_zuleitung", "Neue Zuleitung erforderlich")],
              default="vorhanden",
              note_if={"neue_zuleitung": "neue_zuleitung_noetig"}),
            Q_ALTANLAGE, Q_BAUJAHR, Q_ZUSTAND, Q_ZUGANG],
        operations=[
            Op("dose", "Dose setzen (Dosenfräse)", "Stk", (0.28, 0.50),
               debris_kg_per_unit=(2, 6)),
            Op("anschluss", "Verdrahten und anschließen", "Stk", (0.18, 0.32)),
            Op("material", "Dose, Einsatz, Abdeckung", "Stk", (0.0, 0.0),
               kind="material", material_per_unit=(12, 35)),
        ],
    ),
    JobType(
        key="elektrik.leitung_verlegen", trade="elektrik",
        label_de="Leitung verlegen (Unterputz)", unit="lfm",
        setup_hours=(0.8, 1.4), typical_size=(10, 60),
        market_band_at=(15, 35), market_band_de=(16, 38),
        note_keys=["e_befund", "staub"],
        guided_form=[
            Q("laenge", "Leitungslänge", "number", unit="lfm", affects="qty",
              default=25),
            Q("verlegung", "Verlegung", "choice", affects="variant",
              options=[("unterputz", "Unterputz, Schlitz fräsen"),
                       ("hohlraum", "Im Hohlraum oder Kabelkanal"),
                       ("aufputz", "Aufputz")],
              default="unterputz", note_if={"unterputz": "staub"}),
            Q("untergrund", "Wandaufbau", "choice", affects="variant",
              options=[("gipskarton", "Gipskarton"), ("ziegel", "Ziegel"),
                       ("beton", "Beton")],
              default="ziegel", note_if={"beton": "staub"}),
            Q("durchbruch", "Wand- oder Deckendurchbrüche nötig", "bool",
              affects="note", default=False, note_if={"True": "mauerdurchbruch"}),
            Q_ALTANLAGE, Q_ZUSTAND, Q_ZUGANG],
        operations=[
            # Mauernutfräse, 3-5 lfm/h. The first pass assumed hand chiselling
            # and produced 42 EUR/lfm against a 15-35 market band.
            Op("schlitz", "Schlitz fräsen", "lfm", (0.06, 0.11),
               debris_kg_per_unit=(3, 8)),
            Op("verlegen", "Leitung verlegen", "lfm", (0.035, 0.065)),
            Op("verschliessen", "Schlitz verschließen", "lfm", (0.05, 0.09),
               material_per_unit=(1.20, 2.50)),
            Op("kabel", "Kabel NYM", "lfm", (0.0, 0.0), kind="material",
               material_per_unit=(1.80, 3.50), waste_factor=0.08),
        ],
    ),
    JobType(
        key="elektrik.verteiler", trade="elektrik",
        label_de="Verteiler erneuern (Wohnung)", unit="Stk",
        setup_hours=(1.0, 1.8), typical_size=(1, 1),
        market_band_at=(900, 2200), market_band_de=(950, 2400),
        band_basis="total", note_keys=["e_befund", "abschaltung"],
        guided_form=[
            Q("stromkreise", "Anzahl Stromkreise", "number", unit="Stk",
              affects="note", default=12),
            Q("fi_vorhanden", "FI-Schutzschalter vorhanden", "bool", affects="note",
              default=False, note_if={"False": "fi_nachruesten"}),
            Q("platz", "Platz im Verteilerfeld ausreichend", "bool", affects="note",
              default=True, note_if={"False": "verteiler_erweiterung"}),
            Q_ALTANLAGE, Q_BAUJAHR, Q_ZUSTAND, Q_ZUGANG],
        operations=[
            Op("demontage", "Altverteiler demontieren", "Stk", (1.0, 1.8),
               debris_kg_per_unit=(8, 18)),
            Op("montage", "Verteiler montieren und verdrahten", "Stk", (5.0, 9.0)),
            Op("pruefung", "Prüfung und Protokoll", "Stk", (1.0, 2.0)),
            Op("material", "Verteiler, LS-Schalter, FI", "Stk", (0.0, 0.0),
               kind="material", material_per_unit=(320, 780)),
        ],
    ),
]

# ── Trockenbau & Abriss ───────────────────────────────────────────────
TROCKENBAU = [
    JobType(
        key="trockenbau.staenderwand", trade="trockenbau",
        label_de="Ständerwand (doppelt beplankt)", unit="m2",
        setup_hours=(1.0, 1.8), typical_size=(8, 30),
        market_band_at=(45, 85), market_band_de=(45, 90),
        note_keys=["statik_nicht_tragend"],
        operations=[
            Op("staender", "Ständerwerk stellen", "m2", (0.20, 0.35),
               material_per_unit=(6.00, 10.00)),
            Op("daemmung", "Dämmung einlegen", "m2", (0.06, 0.12),
               material_per_unit=(3.50, 6.50)),
            Op("beplankung", "Doppelt beplanken", "m2", (0.24, 0.38),
               material_per_unit=(8.00, 13.00), waste_factor=0.08),
            Op("spachteln", "Spachteln Q2", "m2", (0.10, 0.17),
               material_per_unit=(1.20, 2.20)),
        ],
    ),
]
ABRISS = [
    JobType(
        key="abriss.estrich", trade="abriss",
        label_de="Estrich entfernen", unit="m2",
        setup_hours=(1.5, 2.5), typical_size=(15, 60),
        market_band_at=(20, 45), market_band_de=(20, 48),
        note_keys=["asbest_vor_1990", "staub", "abtransport"],
        operations=[
            # 5-7 cm cement screed at ~2,000 kg/m3 = 100-140 kg/m2.
            Op("abbruch", "Estrich abbrechen", "m2", (0.28, 0.50),
               debris_kg_per_unit=(100, 145)),
            Op("entsorgung", "Entsorgung Bauschutt", "m2", (0.0, 0.0), kind="disposal"),
        ],
    ),
    JobType(
        key="abriss.nichttragende_wand", trade="abriss",
        label_de="Nichttragende Wand abbrechen", unit="m2",
        setup_hours=(1.2, 2.2), typical_size=(6, 25),
        market_band_at=(30, 70), market_band_de=(30, 75),
        note_keys=["statik_nicht_tragend", "asbest_vor_1990", "staub"],
        operations=[
            # 10-12 cm brick/block at ~1,400 kg/m3 = 140-170 kg/m2.
            Op("abbruch", "Wand abbrechen", "m2", (0.35, 0.65),
               debris_kg_per_unit=(140, 175)),
            Op("entsorgung", "Entsorgung Bauschutt", "m2", (0.0, 0.0), kind="disposal"),
        ],
    ),
]

ALL = SANITAER + ELEKTRIK + TROCKENBAU + ABRISS
