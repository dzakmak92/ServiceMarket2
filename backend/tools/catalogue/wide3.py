from schema import JobType as J, Operation as Op

# ══ Heizung (174) ═════════════════════════════════════════════════════
HEIZUNG = [
    J(key="heizung.heizkoerper", trade="heizung", group="Heizung",
      segment="Heizungsinstallateur", label_de="Heizkörper tauschen", unit="Stk",
      setup_hours=(0.8, 1.5), typical_size=(1, 8),
      market_band_at=(320, 750), market_band_de=(340, 800), band_basis="total",
      confidence="medium", note_keys=["anlage_entleeren", "hydraulischer_abgleich",
                                      "altgeraet_entsorgung"],
      operations=[
          Op("demontage", "Altheizkörper demontieren", "Stk", (0.6, 1.1),
             debris_kg_per_unit=(25, 55)),
          Op("koerper", "Heizkörper und Ventile", "Stk", (0.0, 0.0), kind="material",
             material_per_unit=(140, 340)),
          Op("montage", "Montieren und anschließen", "Stk", (1.4, 2.6)),
          Op("befuellen", "Befüllen und entlüften", "Stk", (0.4, 0.8)),
      ]),
    J(key="heizung.fussbodenheizung", trade="heizung", group="Heizung",
      segment="Heizungsinstallateur", label_de="Fußbodenheizung verlegen (Nass)",
      unit="m2", setup_hours=(2.0, 4.0), typical_size=(40, 150),
      market_band_at=(55, 110), market_band_de=(58, 115), confidence="medium",
      note_keys=["estrich_folgt", "aufbauhoehe"],
      operations=[
          Op("daemmung", "Systemplatte verlegen", "m2", (0.08, 0.15),
             material_per_unit=(11, 20)),
          Op("rohr", "Heizrohr verlegen", "m2", (0.10, 0.18),
             material_per_unit=(6, 12), waste_factor=0.05),
          Op("verteiler", "Verteiler anschließen und abdrücken", "m2", (0.05, 0.10),
             material_per_unit=(6, 14)),
      ]),
    J(key="heizung.waermepumpe", trade="heizung", group="Heizung",
      segment="Heizungsinstallateur", label_de="Luft-Wasser-Wärmepumpe einbauen",
      unit="Stk", setup_hours=(2.0, 4.0), typical_size=(1, 1),
      market_band_at=(14000, 30000), market_band_de=(15000, 32000),
      band_basis="total", confidence="low",
      note_keys=["foerderung", "schallschutz", "stromanschluss_bauseits",
                 "heizlastberechnung"],
      operations=[
          Op("demontage", "Altanlage demontieren", "Stk", (3.0, 6.0),
             debris_kg_per_unit=(80, 200)),
          Op("geraet", "Wärmepumpe inkl. Speicher", "Stk", (0.0, 0.0),
             kind="material", material_per_unit=(9000, 18000)),
          Op("montage", "Aufstellung, Hydraulik, Elektro", "Stk", (24, 45)),
          Op("inbetriebnahme", "Inbetriebnahme und Einregulierung", "Stk", (3.0, 6.0)),
      ]),
    J(key="heizung.kaminofen", trade="heizung", group="Heizung", segment="Kaminbau",
      label_de="Kaminofen anschließen", unit="Stk",
      setup_hours=(0.8, 1.5), typical_size=(1, 1),
      market_band_at=(450, 1400), market_band_de=(480, 1500), band_basis="total",
      confidence="low", note_keys=["rauchfangkehrer", "brandschutz_abstand"],
      operations=[
          Op("anschluss", "Rauchrohr und Anschluss herstellen", "Stk", (2.5, 5.0),
             material_per_unit=(120, 340)),
          Op("bodenplatte", "Bodenplatte / Funkenschutz", "Stk", (0.5, 1.0),
             material_per_unit=(80, 220), tier_min="standard"),
      ]),
]

# ══ Umzug & Transport (154) ═══════════════════════════════════════════
UMZUG = [
    J(key="umzug.wohnung", trade="umzug", group="Umzug & Transport",
      segment="Umzugsunternehmen", label_de="Wohnungsumzug", unit="m3",
      setup_hours=(1.0, 2.0), typical_size=(20, 60),
      market_band_at=(28, 60), market_band_de=(30, 65), confidence="medium",
      note_keys=["halteverbot", "kein_lift", "versicherung"],
      operations=[
          Op("verpacken", "Verpacken und sichern", "m3", (0.25, 0.50),
             material_per_unit=(2.50, 6.00)),
          Op("tragen", "Aus- und Einladen", "m3", (0.28, 0.52)),
          Op("transport", "Transport", "m3", (0.10, 0.20),
             material_per_unit=(3.00, 7.00)),
      ]),
    J(key="umzug.entruempelung", trade="umzug", group="Umzug & Transport",
      segment="Transportunternehmen", label_de="Entrümpelung", unit="m3",
      setup_hours=(1.0, 2.0), typical_size=(10, 50),
      market_band_at=(40, 95), market_band_de=(42, 100), confidence="medium",
      note_keys=["abtransport", "wertgegenstaende"],
      operations=[
          Op("raeumen", "Räumen und tragen", "m3", (0.45, 0.85),
             debris_kg_per_unit=(120, 220), debris_type="sperrmuell"),
          Op("entsorgung", "Entsorgung", "m3", (0.0, 0.0), kind="disposal"),
      ]),
]

# ══ Reinigung (45) ════════════════════════════════════════════════════
REINIGUNG = [
    J(key="reinigung.grundreinigung", trade="reinigung", group="Reinigung",
      segment="Gebäudereiniger", label_de="Grundreinigung Wohnung", unit="m2",
      setup_hours=(0.5, 1.0), typical_size=(50, 140),
      market_band_at=(4, 12), market_band_de=(4, 13), confidence="medium",
      note_keys=["schluessel_uebergabe"],
      operations=[
          Op("reinigung", "Grundreinigung aller Flächen", "m2", (0.06, 0.13),
             material_per_unit=(0.20, 0.50)),
      ]),
    J(key="reinigung.fenster", trade="reinigung", group="Reinigung",
      segment="Gebäudereiniger", label_de="Fensterreinigung", unit="Stk",
      setup_hours=(0.3, 0.7), typical_size=(8, 30),
      market_band_at=(6, 18), market_band_de=(6, 20), confidence="medium",
      note_keys=["erreichbarkeit"],
      operations=[Op("fenster", "Fenster beidseitig reinigen", "Stk", (0.10, 0.25),
                     material_per_unit=(0.20, 0.60))]),
    J(key="reinigung.hausbetreuung", trade="reinigung", group="Reinigung",
      segment="Hausmeisterservice", label_de="Hausbetreuung (Stiegenhaus, pro Besuch)",
      unit="Stk", setup_hours=(0.2, 0.4), typical_size=(1, 1),
      market_band_at=(45, 130), market_band_de=(48, 140), band_basis="total",
      confidence="medium", note_keys=["schluessel_uebergabe"],
      operations=[Op("reinigung", "Stiegenhaus reinigen", "Stk", (1.0, 2.5),
                     material_per_unit=(3, 8))]),
    J(key="reinigung.schaedlinge", trade="reinigung", group="Reinigung",
      segment="Schädlingsbekämpfung", label_de="Schädlingsbekämpfung (Erstbehandlung)",
      unit="Stk", setup_hours=(0.4, 0.8), typical_size=(1, 1),
      market_band_at=(180, 480), market_band_de=(190, 500), band_basis="total",
      confidence="low", note_keys=["nachkontrolle", "raeumung_waehrend"],
      operations=[
          Op("befund", "Befund und Ortung", "Stk", (0.5, 1.2)),
          Op("behandlung", "Behandlung", "Stk", (1.0, 2.5),
             material_per_unit=(45, 140)),
      ]),
]

# ══ Polsterarbeiten (38) ══════════════════════════════════════════════
POLSTER = [
    J(key="polster.sofa", trade="polster", group="Polsterarbeiten",
      segment="Polsterei", label_de="Sofa neu beziehen (3-Sitzer)", unit="Stk",
      setup_hours=(0.8, 1.5), typical_size=(1, 1),
      market_band_at=(900, 2400), market_band_de=(950, 2500), band_basis="total",
      confidence="low", note_keys=["stoff_bauseits_moeglich", "transport_werkstatt"],
      operations=[
          Op("demontage", "Altbezug abnehmen", "Stk", (2.0, 4.0)),
          Op("stoff", "Bezugsstoff", "Stk", (0.0, 0.0), kind="material",
             material_per_unit=(280, 700), waste_factor=0.12),
          Op("polstern", "Polsterung erneuern und beziehen", "Stk", (10, 20)),
      ]),
]

# ══ Erneuerbare Energien (2) ══════════════════════════════════════════
SOLAR = [
    J(key="solar.pv_dach", trade="solar", group="Erneuerbare Energien",
      segment="Solarteur", label_de="PV-Anlage Schrägdach", unit="kWp",
      setup_hours=(3.0, 6.0), typical_size=(5, 15),
      market_band_at=(1300, 2100), market_band_de=(1250, 2000), confidence="medium",
      note_keys=["netzanmeldung", "statik_dach", "geruest_erforderlich", "foerderung"],
      operations=[
          Op("montage_system", "Unterkonstruktion montieren", "kWp", (2.5, 4.5),
             material_per_unit=(140, 260)),
          Op("module", "Module und Wechselrichter", "kWp", (0.0, 0.0),
             kind="material", material_per_unit=(650, 1050)),
          Op("dc_ac", "DC/AC-Verkabelung", "kWp", (1.5, 3.0),
             material_per_unit=(60, 130)),
          Op("inbetriebnahme", "Inbetriebnahme und Anmeldung", "kWp", (0.8, 1.6)),
      ]),
]

# ══ Montage & Allround (89) ═══════════════════════════════════════════
MONTAGE = [
    J(key="montage.stunde", trade="montage", group="Montage & Allround",
      segment="Montageservice & Allroundhandwerker",
      label_de="Allround-Handwerker (Regiestunde)", unit="h",
      setup_hours=(0.4, 0.8), typical_size=(2, 8),
      market_band_at=(45, 80), market_band_de=(45, 85), confidence="high",
      note_keys=["regie_abrechnung"],
      operations=[Op("arbeit", "Handwerkerleistung nach Aufwand", "h", (1.0, 1.0))]),
    J(key="montage.tv_wandhalterung", trade="montage", group="Montage & Allround",
      segment="Montageservice & Allroundhandwerker",
      label_de="TV-Wandhalterung montieren", unit="Stk",
      setup_hours=(0.3, 0.6), typical_size=(1, 1),
      market_band_at=(90, 240), market_band_de=(95, 250), band_basis="total",
      confidence="medium", note_keys=["untergrund_tragfaehig", "leitungsortung"],
      operations=[
          Op("montage", "Halterung dübeln und ausrichten", "Stk", (1.0, 2.0),
             material_per_unit=(15, 45)),
      ]),
]

# ══ Gutachter (18) ════════════════════════════════════════════════════
GUTACHTER = [
    J(key="gutachter.bauschaden", trade="montage", group="Gutachter & Sachverständige",
      segment="Bausachverständiger / Gutachter", label_de="Bauschadengutachten",
      unit="Stk", setup_hours=(1.0, 2.0), typical_size=(1, 1),
      market_band_at=(900, 2500), market_band_de=(950, 2600), band_basis="total",
      confidence="low", note_keys=["unabhaengigkeit", "laborkosten_extra"],
      operations=[
          Op("ortstermin", "Ortstermin und Aufnahme", "Stk", (3.0, 6.0)),
          Op("gutachten", "Auswertung und Gutachten", "Stk", (8.0, 18.0)),
      ]),
]
