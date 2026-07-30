from schema import JobType, Operation as Op

# ── Boden & Fliesen ───────────────────────────────────────────────────
# Bands: Fliesen verlegen AT 35-60 EUR/m2 (fixbuddy.at). Fliesen entfernen
# 15-30 incl. disposal; AT typical 20-40, stark verklebt 25-55 (my-hammer.at,
# baucheck.io). Debris 18-23 kg/m2 Duennbett; Dickbett far higher.
BODEN = [
    JobType(
        key="fliesen.entfernen_duennbett", trade="fliesen",
        label_de="Fliesen entfernen (Dünnbett)", unit="m2",
        setup_hours=(1.0, 1.8), typical_size=(6, 30),
        market_band_at=(15, 30), market_band_de=(15, 32),
        sources=["my-hammer.at/bauschutt-entsorgen", "baucheck.io"],
        note_keys=["asbest_vor_1990", "staub"],
        operations=[
            Op("abschlagen", "Fliesen abschlagen", "m2", (0.16, 0.27),
               debris_kg_per_unit=(20, 26)),
            Op("kleberreste", "Kleberreste abschleifen", "m2", (0.06, 0.11)),
            Op("entsorgung", "Entsorgung Bauschutt", "m2", (0.0, 0.0),
               kind="disposal"),
        ],
    ),
    JobType(
        key="fliesen.entfernen_dickbett", trade="fliesen",
        label_de="Fliesen entfernen (Dickbett, Altbau)", unit="m2",
        setup_hours=(1.2, 2.2), typical_size=(6, 25),
        market_band_at=(25, 55), market_band_de=(25, 58),
        sources=["baucheck.io", "fliesenlegung.de"],
        note_keys=["asbest_vor_1990", "staub", "dickbett_mehraufwand"],
        operations=[
            # 15-40 mm cement bed. Breaker work, not chisel work.
            Op("abschlagen", "Fliesen und Mörtelbett abschlagen", "m2", (0.34, 0.58),
               debris_kg_per_unit=(45, 75)),
            Op("untergrund", "Untergrund nacharbeiten", "m2", (0.08, 0.16)),
            Op("entsorgung", "Entsorgung Bauschutt", "m2", (0.0, 0.0), kind="disposal"),
        ],
    ),
    JobType(
        key="fliesen.verlegen_boden", trade="fliesen",
        label_de="Bodenfliesen verlegen", unit="m2",
        setup_hours=(1.2, 2.0), typical_size=(8, 40),
        market_band_at=(35, 60), market_band_de=(35, 65),
        sources=["fixbuddy.at/was-kostet-fliesen-verlegen"],
        note_keys=["untergrund_eben", "verschnitt_muster"],
        operations=[
            Op("grundierung", "Grundierung", "m2", (0.03, 0.05)),
            Op("verlegen", "Fliesen verlegen", "m2", (0.35, 0.55)),
            Op("verfugen", "Verfugen und Silikon", "m2", (0.10, 0.18)),
            Op("kleber", "Kleber und Fugenmasse", "m2", (0.0, 0.0), kind="material",
               material_per_unit=(4.50, 8.00), waste_factor=0.05),
        ],
    ),
    JobType(
        key="fliesen.verlegen_wand", trade="fliesen",
        label_de="Wandfliesen verlegen", unit="m2",
        setup_hours=(1.2, 2.0), typical_size=(8, 30),
        market_band_at=(40, 70), market_band_de=(40, 75),
        sources=["fixbuddy.at"],
        note_keys=["abdichtung_nassbereich"],
        operations=[
            Op("abdichtung", "Verbundabdichtung Nassbereich", "m2", (0.10, 0.18),
               material_per_unit=(3.00, 5.50)),
            Op("verlegen", "Wandfliesen verlegen", "m2", (0.40, 0.62)),
            Op("verfugen", "Verfugen und Silikon", "m2", (0.10, 0.18)),
            Op("kleber", "Kleber und Fugenmasse", "m2", (0.0, 0.0), kind="material",
               material_per_unit=(4.50, 8.00), waste_factor=0.05),
        ],
    ),
    JobType(
        key="boden.laminat", trade="fliesen", label_de="Laminat verlegen", unit="m2",
        setup_hours=(0.8, 1.5), typical_size=(15, 60),
        market_band_at=(15, 30), market_band_de=(15, 32),
        note_keys=["untergrund_eben", "dehnungsfuge"],
        operations=[
            Op("unterlage", "Trittschalldämmung verlegen", "m2", (0.03, 0.06),
               material_per_unit=(2.00, 4.00)),
            Op("verlegen", "Laminat verlegen", "m2", (0.14, 0.24)),
            Op("leisten", "Sockelleisten montieren", "m2", (0.06, 0.10),
               material_per_unit=(2.50, 4.50)),
        ],
    ),
    JobType(
        key="boden.parkett", trade="fliesen", label_de="Parkett verlegen (verklebt)",
        unit="m2", setup_hours=(1.0, 1.8), typical_size=(15, 60),
        market_band_at=(30, 60), market_band_de=(32, 65),
        note_keys=["untergrund_eben", "raumklima"],
        operations=[
            Op("spachteln", "Untergrund spachteln", "m2", (0.08, 0.14),
               material_per_unit=(2.00, 3.50)),
            Op("verkleben", "Parkett vollflächig verkleben", "m2", (0.28, 0.45),
               material_per_unit=(4.00, 7.00)),
            Op("schleifen", "Schleifen und versiegeln", "m2", (0.12, 0.22),
               material_per_unit=(2.50, 4.50), tier_min="standard"),
        ],
    ),
]

# ── Sanitär ───────────────────────────────────────────────────────────
# Bands here are per PIECE (unit Stk), so band_basis is the whole job.
SANITAER = [
    JobType(
        key="sanitaer.wc_tauschen", messy=False, trade="sanitaer",
        label_de="WC tauschen (wandhängend)", unit="Stk",
        setup_hours=(0.6, 1.0), typical_size=(1, 1),
        market_band_at=(280, 650), market_band_de=(300, 700),
        band_basis="total", note_keys=["absperrventil", "altgeraet_entsorgung"],
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
        setup_hours=(0.3, 0.6), typical_size=(1, 6),
        market_band_at=(70, 180), market_band_de=(75, 190),
        band_basis="total", note_keys=["e_befund", "altbau_leitungen"],
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

ALL = BODEN + SANITAER + ELEKTRIK + TROCKENBAU + ABRISS
