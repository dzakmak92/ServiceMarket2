"""Garten & Außenbereich in depth — 20 job types with guided forms.

Bands: GaLaBau AT 35-55 EUR/h, DE 35-58. Rasen anlegen 8-20 EUR/m2, Rollrasen
14-30, Pflasterung 60-130, Zaun 45-100/lfm, Heckenschnitt 4-12/lfm.
(daibau.at/baukostenrechner/gartengestaltung, my-hammer.at, galabau-preise.de)

This is the group where the product's shape is least about a one-off quote.

**Most of the money is recurring.** Mowing, edging, scarifying, leaf clearance,
hedge trimming and winter service are the same customer twelve or twenty times
a year, and they are the jobs a Wartungsvertrag exists for. Six of these job
types are that kind of work and every one of them is `messy=False` — nobody
masks a garden to cut a lawn, and charging protection setup to a 40-minute
mowing visit was the same mistake that pushed a Rohrreinigung to 202 EUR.

**Setup dominates completely at small sizes.** Mowing is 0.002 h/m2; the travel
and unloading is 0.4-0.8 h. A 150 m2 lawn is nearly all setup, which is exactly
why the trade quotes a minimum call-out and why a flat EUR/m2 rate loses money
on every small garden. The catalogue produces that shape without being told to.

**Green waste is not Bauschutt and excavated soil is neither.** Grünschnitt runs
30-70 EUR/t and Aushub 8-26, against 75-130 for rubble. Pricing a paving job's
spoil at rubble rates overstated it by nearly 100 EUR/m2 in an earlier
revision; pricing hedge cuttings at rubble rates does the same in miniature,
several times a season.

**Season is a scheduling fact, not a price.** Hedge cutting is restricted
between 1 March and 30 September in AT (Naturschutzgesetze der Länder) and DE
(§39 BNatSchG). That is a note and a calendar constraint, not a surcharge.
"""
from schema import JobType as J, Operation as Op, Question as Q

G = "Garten & Außenbereich"
S_GALA, S_PFL, S_POOL = "Garten- & Landschaftsbau", "Pflaster- & Straßenbau", "Poolbau"
S_BAUM = "Baumpflege"
SRC = ["daibau.at/baukostenrechner/gartengestaltung", "my-hammer.at/gartenbau",
       "galabau-preise.de"]

Q_ABTRANSPORT = Q("gruenschnitt", "Grünschnitt", "choice", affects="variant",
                  options=[("abtransport", "Wird abtransportiert"),
                           ("verbleibt", "Verbleibt vor Ort")],
                  default="abtransport", note_if={"verbleibt": "gruenschnitt_verbleibt"})
Q_LEITUNGEN = Q("leitungen", "Erdleitungen im Bereich bekannt", "choice", affects="note",
                options=[("keine", "Keine bekannt"), ("bekannt", "Ja, eingemessen"),
                         ("unbekannt", "Unbekannt")],
                default="unbekannt",
                note_if={"unbekannt": "leitungen_im_boden",
                         "bekannt": "leitungen_im_boden"})

GARTEN_DEEP = [
    # ── Wiederkehrende Pflege — the contract revenue ───────────────────
    J(key="garten.rasenmaehen", trade="garten", group=G, segment=S_GALA,
      messy=False, label_de="Rasen mähen (pro Einsatz)", unit="m2",
      setup_hours=(0.35, 0.65), typical_size=(150, 800),
      market_band_at=(0.10, 0.35), market_band_de=(0.10, 0.38),
      confidence="medium", sources=SRC,
      note_keys=["mindestpauschale", "gruenschnitt_entsorgung"],
      guided_form=[
          Q("flaeche", "Rasenfläche", "number", unit="m2", affects="qty", default=400),
          Q("haeufigkeit", "Häufigkeit", "choice", affects="note",
            options=[("einmalig", "Einmalig"), ("14_taegig", "14-tägig in der Saison"),
                     ("woechentlich", "Wöchentlich")],
            default="14_taegig",
            note_if={"14_taegig": "wartungsvertrag", "woechentlich": "wartungsvertrag"}),
          Q_ABTRANSPORT],
      operations=[
          Op("maehen", "Rasen mähen", "m2", (0.0012, 0.0025)),
          Op("kanten", "Kanten und Ränder", "m2", (0.0003, 0.0007)),
          Op("schnittgut", "Schnittgut aufnehmen", "m2", (0.0003, 0.0007),
             debris_kg_per_unit=(0.05, 0.15), debris_type="gruenschnitt")]),

    J(key="garten.vertikutieren", trade="garten", group=G, segment=S_GALA,
      messy=False, label_de="Vertikutieren mit Nachsaat", unit="m2",
      setup_hours=(0.6, 1.1), typical_size=(150, 500),
      market_band_at=(0.50, 1.60), market_band_de=(0.50, 1.70),
      confidence="low", sources=SRC,
      note_keys=["bewaesserung_bauseits", "witterung"],
      guided_form=[
          Q("flaeche", "Rasenfläche", "number", unit="m2", affects="qty", default=300),
          Q("moos", "Starker Moosbefall", "bool", affects="variant", default=True),
          Q_ABTRANSPORT],
      operations=[
          Op("kurz_maehen", "Kurz mähen", "m2", (0.0012, 0.0022)),
          Op("vertikutieren", "Vertikutieren", "m2", (0.0035, 0.0065)),
          Op("abrechen", "Filz abrechen und aufnehmen", "m2", (0.0020, 0.0040),
             debris_kg_per_unit=(0.15, 0.35), debris_type="gruenschnitt"),
          Op("nachsaat", "Nachsaat und Startdünger", "m2", (0.0010, 0.0020),
             material_per_unit=(0.15, 0.35), waste_factor=0.05)]),

    J(key="garten.laub", trade="garten", group=G, segment=S_GALA,
      messy=False, label_de="Laub beseitigen", unit="m2",
      setup_hours=(0.4, 0.8), typical_size=(150, 800),
      market_band_at=(0.20, 0.65), market_band_de=(0.20, 0.70),
      confidence="low", sources=SRC,
      note_keys=["gruenschnitt_entsorgung", "mindestpauschale"],
      guided_form=[
          Q("flaeche", "Fläche", "number", unit="m2", affects="qty", default=400),
          Q("menge", "Laubmenge", "choice", affects="variant",
            options=[("leicht", "Leicht"), ("stark", "Stark, mehrere Bäume")],
            default="stark"),
          Q_ABTRANSPORT],
      operations=[
          Op("zusammen", "Laub zusammenblasen und aufnehmen", "m2", (0.0025, 0.0050),
             debris_kg_per_unit=(0.30, 0.90), debris_type="gruenschnitt"),
          Op("verladen", "Verladen", "m2", (0.0008, 0.0018))]),

    J(key="garten.hecke_schnitt", trade="garten", group=G, segment=S_GALA,
      messy=False, label_de="Hecke schneiden", unit="lfm",
      setup_hours=(0.5, 1.0), typical_size=(15, 80),
      market_band_at=(4, 12), market_band_de=(4, 13),
      confidence="medium", sources=SRC,
      note_keys=["vogelschutz_zeitraum", "abtransport"],
      guided_form=[
          Q("laenge", "Heckenlänge", "number", unit="lfm", affects="qty", default=40),
          Q("hoehe", "Höhe", "choice", affects="variant",
            options=[("bis_150", "Bis 1,5 m"), ("bis_250", "1,5 bis 2,5 m"),
                     ("ueber_250", "Über 2,5 m")],
            default="bis_250", note_if={"ueber_250": "absturzsicherung_norm"}),
          Q("seiten", "Schnitt", "choice", affects="variant",
            options=[("beidseitig", "Beidseitig und Oberkante"),
                     ("einseitig", "Nur eine Seite")],
            default="beidseitig"),
          Q_ABTRANSPORT],
      operations=[
          Op("schnitt", "Hecke schneiden", "lfm", (0.05, 0.11)),
          Op("gruenschnitt", "Grünschnitt entsorgen", "lfm", (0.02, 0.05),
             debris_kg_per_unit=(3, 9), debris_type="gruenschnitt")]),

    J(key="garten.baumschnitt", trade="garten", group=G, segment=S_BAUM,
      messy=False, label_de="Baumschnitt / Kronenpflege", unit="Stk",
      setup_hours=(0.8, 1.5), typical_size=(1, 6), band_basis="total",
      market_band_at=(150, 600), market_band_de=(150, 650),
      confidence="low", sources=SRC,
      note_keys=["vogelschutz_zeitraum", "baumschutz_satzung"],
      guided_form=[
          Q("anzahl", "Anzahl Bäume", "number", unit="Stk", affects="qty", default=1),
          Q("groesse", "Baumgröße", "choice", affects="variant",
            options=[("obstbaum", "Obstbaum, vom Boden erreichbar"),
                     ("mittel", "Bis 10 m, Leiter oder Hubsteiger"),
                     ("gross", "Über 10 m, Seilklettertechnik")],
            default="mittel",
            note_if={"gross": "skt_erforderlich"}),
          Q_ABTRANSPORT],
      operations=[
          Op("schnitt", "Kronenpflege bzw. Auslichten", "Stk", (1.6, 4.2)),
          Op("haeckseln", "Häckseln und verladen", "Stk", (0.9, 2.2),
             debris_kg_per_unit=(90, 320), debris_type="gruenschnitt")]),

    J(key="garten.baumfaellung", trade="garten", group=G, segment=S_BAUM,
      messy=False, label_de="Baum fällen inkl. Entsorgung", unit="Stk",
      setup_hours=(1.2, 2.2), typical_size=(1, 4), band_basis="total",
      market_band_at=(350, 1500), market_band_de=(350, 1600),
      confidence="low", sources=SRC,
      # The permission question comes before the price question. Felling a
      # protected tree without a Bescheid is an administrative offence in both
      # markets and the fine lands on whoever cut it.
      note_keys=["baumschutz_satzung", "versicherung", "stubben_extra"],
      guided_form=[
          Q("anzahl", "Anzahl Bäume", "number", unit="Stk", affects="qty", default=1),
          Q("groesse", "Baumgröße", "choice", affects="variant",
            options=[("bis_8", "Bis 8 m"), ("bis_15", "8 bis 15 m"),
                     ("ueber_15", "Über 15 m")],
            default="bis_15", note_if={"ueber_15": "skt_erforderlich"}),
          Q("umfeld", "Umfeld", "choice", affects="variant",
            options=[("frei", "Freier Fallraum"),
                     ("beengt", "Beengt, Stückfällung nötig")],
            default="beengt", note_if={"beengt": "stueckfaellung"}),
          Q("genehmigung", "Fällgenehmigung", "choice", affects="note",
            options=[("liegt_vor", "Liegt vor"), ("nicht_noetig", "Nicht erforderlich"),
                     ("offen", "Noch zu klären")],
            default="offen", note_if={"offen": "baumschutz_satzung"})],
      operations=[
          Op("sichern", "Fallbereich sichern und abseilen", "Stk", (1.2, 3.0)),
          Op("faellen", "Fällen bzw. Stückfällung", "Stk", (2.0, 5.5)),
          Op("aufarbeiten", "Aufarbeiten, häckseln, verladen", "Stk", (1.8, 4.5),
             debris_kg_per_unit=(600, 2500), debris_type="gruenschnitt")]),

    J(key="garten.winterdienst", trade="garten", group=G, segment=S_GALA,
      messy=False, label_de="Winterdienst (Saison)", unit="m2",
      setup_hours=(0.2, 0.4), typical_size=(50, 400),
      market_band_at=(2.50, 8.00), market_band_de=(2.50, 9.00),
      confidence="low", sources=SRC,
      # Räum- und Streupflicht sits with the owner and is delegable by
      # contract, which is the reason this sells at all — and the reason the
      # contract, not the price, is what the customer is buying.
      note_keys=["raeumpflicht_uebertragung", "streumittel_vorgabe",
                 "wartungsvertrag"],
      guided_form=[
          Q("flaeche", "Zu räumende Fläche", "number", unit="m2", affects="qty",
            default=150),
          Q("bereitschaft", "Umfang", "choice", affects="variant",
            options=[("werktags", "Werktags"),
                     ("taeglich", "Täglich inkl. Wochenende"),
                     ("bereitschaft_24", "24-Stunden-Bereitschaft")],
            default="taeglich",
            note_if={"bereitschaft_24": "bereitschaft_pauschale"}),
          Q("streumittel", "Streumittel", "choice", affects="variant",
            options=[("splitt", "Splitt"), ("salz", "Auftausalz")],
            default="splitt", note_if={"salz": "streumittel_vorgabe"})],
      operations=[
          # Per m2 and per season: roughly 25-45 Einsätze in a normal DACH
          # winter, each a few seconds per m2 once the machine is there.
          Op("raeumen", "Räumen über die Saison", "m2", (0.045, 0.130)),
          Op("streuen", "Streuen über die Saison", "m2", (0.012, 0.035),
             material_per_unit=(0.30, 0.90), waste_factor=0.05)]),

    # ── Rasen und Bepflanzung ─────────────────────────────────────────
    J(key="garten.rasen_neu", trade="garten", group=G, segment=S_GALA,
      label_de="Rasen neu anlegen (Saat)", unit="m2",
      setup_hours=(1.5, 3.0), typical_size=(80, 400),
      market_band_at=(8, 20), market_band_de=(8, 22),
      confidence="medium", sources=SRC,
      note_keys=["bewaesserung_bauseits", "witterung"],
      guided_form=[
          Q("flaeche", "Fläche", "number", unit="m2", affects="qty", default=250),
          Q("vorbereitung", "Ausgangslage", "choice", affects="variant",
            options=[("erdplanum", "Erdplanum vorhanden"),
                     ("altrasen", "Alter Rasen vorhanden"),
                     ("bauland", "Baustellenfläche, verdichtet")],
            default="altrasen", note_if={"bauland": "bodenaustausch_moeglich"}),
          Q_LEITUNGEN],
      operations=[
          Op("fraesen", "Boden fräsen und planieren", "m2", (0.020, 0.040)),
          Op("substrat", "Rasentragschicht", "m2", (0.010, 0.025),
             material_per_unit=(2.20, 4.50)),
          Op("saat", "Saat ausbringen und walzen", "m2", (0.008, 0.018),
             material_per_unit=(0.60, 1.40))]),

    J(key="garten.rollrasen", trade="garten", group=G, segment=S_GALA,
      label_de="Rollrasen verlegen", unit="m2",
      setup_hours=(1.5, 3.0), typical_size=(60, 300),
      market_band_at=(14, 30), market_band_de=(15, 32),
      confidence="medium", sources=SRC,
      note_keys=["bewaesserung_bauseits", "rollrasen_sofort_verlegen"],
      guided_form=[
          Q("flaeche", "Fläche", "number", unit="m2", affects="qty", default=180),
          Q("vorbereitung", "Ausgangslage", "choice", affects="variant",
            options=[("erdplanum", "Erdplanum vorhanden"),
                     ("altrasen", "Alter Rasen vorhanden"),
                     ("bauland", "Baustellenfläche, verdichtet")],
            default="altrasen", note_if={"bauland": "bodenaustausch_moeglich"}),
          Q_LEITUNGEN],
      operations=[
          Op("vorbereitung", "Boden vorbereiten", "m2", (0.025, 0.045),
             material_per_unit=(2.00, 4.00)),
          Op("verlegen", "Rollrasen verlegen", "m2", (0.030, 0.055),
             material_per_unit=(6.00, 11.00), waste_factor=0.05)]),

    J(key="garten.beet_anlegen", trade="garten", group=G, segment=S_GALA,
      label_de="Beet anlegen und bepflanzen", unit="m2",
      setup_hours=(1.0, 2.0), typical_size=(5, 40),
      market_band_at=(35, 110), market_band_de=(35, 120),
      confidence="low", sources=SRC,
      note_keys=["anwachsgarantie", "bewaesserung_bauseits"],
      guided_form=[
          Q("flaeche", "Beetfläche", "number", unit="m2", affects="qty", default=15),
          Q("bepflanzung", "Bepflanzung", "choice", affects="variant",
            options=[("bodendecker", "Bodendecker"), ("stauden", "Staudenbeet"),
                     ("gehoelze", "Gehölze und Solitäre")],
            default="stauden"),
          Q("vlies", "Mit Unkrautvlies und Mulch", "bool", affects="variant",
            default=True)],
      operations=[
          Op("aushub", "Boden lockern und Aushub", "m2", (0.10, 0.22),
             debris_kg_per_unit=(60, 140), debris_type="aushub"),
          Op("substrat", "Pflanzsubstrat einbringen", "m2", (0.08, 0.16),
             material_per_unit=(4.00, 9.00)),
          Op("pflanzen", "Pflanzen setzen", "m2", (0.20, 0.45),
             material_per_unit=(14.00, 40.00), waste_factor=0.05),
          Op("mulch", "Vlies und Mulchschicht", "m2", (0.06, 0.12),
             material_per_unit=(2.50, 5.50), tier_min="standard")]),

    J(key="garten.hecke_pflanzen", trade="garten", group=G, segment=S_GALA,
      label_de="Hecke pflanzen", unit="lfm",
      setup_hours=(1.0, 2.0), typical_size=(10, 60),
      market_band_at=(30, 95), market_band_de=(30, 100),
      confidence="low", sources=SRC,
      note_keys=["grenzabstand", "anwachsgarantie", "bewaesserung_bauseits"],
      guided_form=[
          Q("laenge", "Länge", "number", unit="lfm", affects="qty", default=25),
          Q("hoehe", "Pflanzhöhe", "choice", affects="variant",
            options=[("bis_100", "Bis 100 cm"), ("bis_175", "100 bis 175 cm"),
                     ("ueber_175", "Über 175 cm")],
            default="bis_175"),
          Q_LEITUNGEN],
      operations=[
          Op("graben", "Pflanzgraben ausheben", "lfm", (0.18, 0.35),
             debris_kg_per_unit=(120, 260), debris_type="aushub"),
          Op("substrat", "Substrat und Dünger", "lfm", (0.06, 0.12),
             material_per_unit=(3.00, 7.00)),
          Op("pflanzen", "Pflanzen setzen und wässern", "lfm", (0.22, 0.45),
             material_per_unit=(12.00, 38.00), waste_factor=0.05)]),

    J(key="garten.bewaesserung", trade="garten", group=G, segment=S_GALA,
      label_de="Bewässerungsanlage einbauen", unit="m2",
      setup_hours=(2.0, 4.0), typical_size=(100, 500),
      market_band_at=(8, 22), market_band_de=(8, 24),
      confidence="low", sources=SRC,
      note_keys=["leitungen_im_boden", "wasseranschluss_bauseits",
                 "winterfest_machen"],
      guided_form=[
          Q("flaeche", "Zu bewässernde Fläche", "number", unit="m2", affects="qty",
            default=250),
          Q("steuerung", "Steuerung", "choice", affects="variant",
            options=[("manuell", "Manuell"), ("automatik", "Zeitsteuerung"),
                     ("smart", "App- und wettergesteuert")],
            default="automatik"),
          Q("wasserquelle", "Wasserquelle", "choice", affects="note",
            options=[("hausanschluss", "Hausanschluss"), ("brunnen", "Brunnen"),
                     ("zisterne", "Zisterne")],
            default="hausanschluss",
            note_if={"brunnen": "wasseranalyse", "zisterne": "wasseranalyse"}),
          Q_LEITUNGEN],
      operations=[
          Op("planung", "Verlegeplan und Einmessen", "m2", (0.006, 0.014)),
          Op("graben", "Gräben ziehen und schließen", "m2", (0.030, 0.060),
             debris_kg_per_unit=(25, 60), debris_type="aushub"),
          Op("rohre", "Rohre und Regner setzen", "m2", (0.035, 0.070),
             material_per_unit=(4.50, 10.00), waste_factor=0.08),
          Op("steuerung", "Ventilbox und Steuerung", "m2", (0.008, 0.018),
             material_per_unit=(1.80, 4.50))]),

    # ── Bauliche Anlagen ──────────────────────────────────────────────
    J(key="garten.pflaster", trade="garten", group=G, segment=S_PFL,
      label_de="Pflasterung (Betonstein)", unit="m2",
      setup_hours=(2.0, 4.0), typical_size=(25, 150),
      market_band_at=(60, 130), market_band_de=(60, 140),
      confidence="medium", sources=SRC,
      note_keys=["unterbau_tragfaehig", "entwaesserung", "abtransport"],
      guided_form=[
          Q("flaeche", "Fläche", "number", unit="m2", affects="qty", default=60),
          Q("belastung", "Belastung", "choice", affects="variant",
            options=[("fussweg", "Fußweg oder Terrasse"),
                     ("pkw", "PKW-Stellplatz oder Einfahrt"),
                     ("lkw", "Schwerlast")],
            default="pkw", note_if={"lkw": "unterbau_tragfaehig"}),
          Q("entwaesserung_vorhanden", "Entwässerung vorhanden", "bool",
            affects="note", default=False, note_if={"False": "entwaesserung"}),
          Q_LEITUNGEN],
      operations=[
          Op("aushub", "Aushub und Abtransport (Minibagger)", "m2", (0.09, 0.17),
             debris_kg_per_unit=(500, 750), debris_type="aushub"),
          Op("unterbau", "Frostschutz und Tragschicht", "m2", (0.11, 0.20),
             material_per_unit=(12, 22)),
          Op("bettung", "Splittbettung", "m2", (0.05, 0.11),
             material_per_unit=(3, 6)),
          Op("pflastern", "Pflaster verlegen und rütteln", "m2", (0.28, 0.52),
             material_per_unit=(18, 38), waste_factor=0.05)]),

    J(key="garten.terrasse_holz", trade="garten", group=G, segment=S_GALA,
      label_de="Holz- oder WPC-Terrasse bauen", unit="m2",
      setup_hours=(2.0, 3.5), typical_size=(12, 45),
      market_band_at=(95, 220), market_band_de=(95, 230),
      confidence="low", sources=SRC,
      note_keys=["unterbau_tragfaehig", "holzschutz_intervall", "gefaelle"],
      guided_form=[
          Q("flaeche", "Fläche", "number", unit="m2", affects="qty", default=25),
          Q("material", "Belag", "choice", affects="variant",
            options=[("laerche", "Lärche"), ("bangkirai", "Bangkirai"),
                     ("wpc", "WPC")],
            default="wpc"),
          Q("unterkonstruktion", "Unterkonstruktion", "choice", affects="variant",
            options=[("splitt", "Auf Splitt und Platten"),
                     ("stelzlager", "Stelzlager"),
                     ("punktfundamente", "Punktfundamente")],
            default="stelzlager")],
      operations=[
          Op("unterbau", "Untergrund herstellen", "m2", (0.20, 0.40),
             material_per_unit=(8.00, 18.00),
             debris_kg_per_unit=(60, 160), debris_type="aushub"),
          Op("unterkonstruktion", "Unterkonstruktion setzen und ausrichten", "m2",
             (0.30, 0.55), material_per_unit=(14.00, 28.00)),
          Op("belag", "Dielen verlegen und verschrauben", "m2", (0.45, 0.80),
             material_per_unit=(45.00, 95.00), waste_factor=0.08)]),

    J(key="garten.zaun", trade="garten", group=G, segment=S_GALA,
      label_de="Zaun setzen (Doppelstabmatte)", unit="lfm",
      setup_hours=(1.5, 2.5), typical_size=(20, 100),
      market_band_at=(45, 100), market_band_de=(48, 105),
      confidence="medium", sources=SRC,
      note_keys=["grenzabstand", "leitungen_im_boden"],
      guided_form=[
          Q("laenge", "Zaunlänge", "number", unit="lfm", affects="qty", default=50),
          Q("hoehe", "Höhe", "choice", affects="variant",
            options=[("100", "100 cm"), ("150", "150 cm"), ("200", "200 cm")],
            default="150"),
          Q("tor", "Mit Tor oder Türe", "bool", affects="note", default=True,
            note_if={"True": "tor_separat"}),
          Q_LEITUNGEN],
      operations=[
          Op("fundamente", "Pfosten setzen und betonieren", "lfm", (0.30, 0.55),
             material_per_unit=(8, 16),
             debris_kg_per_unit=(40, 90), debris_type="aushub"),
          Op("matten", "Matten montieren", "lfm", (0.20, 0.40),
             material_per_unit=(22, 45))]),

    J(key="garten.sichtschutz", trade="garten", group=G, segment=S_GALA,
      label_de="Sichtschutzwand montieren", unit="lfm",
      setup_hours=(1.2, 2.2), typical_size=(6, 30),
      market_band_at=(90, 230), market_band_de=(90, 240),
      confidence="low", sources=SRC,
      note_keys=["grenzabstand", "windklasse", "holzschutz_intervall"],
      guided_form=[
          Q("laenge", "Länge", "number", unit="lfm", affects="qty", default=12),
          Q("material", "Material", "choice", affects="variant",
            options=[("holz", "Holz"), ("wpc", "WPC"), ("glas_alu", "Glas oder Alu")],
            default="wpc"),
          Q("hoehe", "Höhe", "choice", affects="variant",
            options=[("150", "150 cm"), ("180", "180 cm"), ("200", "200 cm")],
            default="180", note_if={"200": "grenzabstand"}),
          Q_LEITUNGEN],
      operations=[
          Op("fundamente", "Punktfundamente setzen", "lfm", (0.45, 0.85),
             material_per_unit=(12, 24),
             debris_kg_per_unit=(60, 130), debris_type="aushub"),
          Op("montage", "Pfosten und Elemente montieren", "lfm", (0.50, 0.95),
             material_per_unit=(55, 130), waste_factor=0.05)]),

    J(key="garten.mauer_gabione", trade="garten", group=G, segment=S_GALA,
      label_de="Gabionen- oder Trockenmauer", unit="m2",
      setup_hours=(2.0, 3.5), typical_size=(6, 35),
      market_band_at=(190, 420), market_band_de=(190, 440),
      confidence="low", sources=SRC,
      note_keys=["statik_pflicht", "unterbau_tragfaehig", "abtransport"],
      guided_form=[
          Q("flaeche", "Ansichtsfläche", "number", unit="m2", affects="qty", default=15),
          Q("funktion", "Funktion", "choice", affects="variant",
            options=[("gestaltung", "Gestaltung, frei stehend"),
                     ("stuetz", "Stützmauer, Geländesprung")],
            default="gestaltung", note_if={"stuetz": "statik_pflicht"}),
          Q_LEITUNGEN],
      operations=[
          Op("fundament", "Fundament herstellen", "m2", (0.55, 1.00),
             material_per_unit=(22, 45),
             debris_kg_per_unit=(280, 600), debris_type="aushub"),
          Op("aufbau", "Körbe stellen und ausrichten", "m2", (0.50, 0.95),
             material_per_unit=(35, 70)),
          Op("fuellen", "Füllsteine einbringen", "m2", (0.70, 1.30),
             material_per_unit=(45, 95), waste_factor=0.05)]),

    J(key="garten.drainage", trade="garten", group=G, segment=S_GALA,
      label_de="Drainage verlegen", unit="lfm",
      setup_hours=(1.5, 3.0), typical_size=(10, 60),
      market_band_at=(45, 130), market_band_de=(45, 140),
      confidence="low", sources=SRC,
      note_keys=["leitungen_im_boden", "entwaesserung", "abtransport"],
      guided_form=[
          Q("laenge", "Länge", "number", unit="lfm", affects="qty", default=25),
          Q("tiefe", "Grabentiefe", "choice", affects="variant",
            options=[("bis_60", "Bis 60 cm"), ("bis_100", "60 bis 100 cm"),
                     ("ueber_100", "Über 100 cm")],
            default="bis_100"),
          Q("ableitung", "Ableitung", "choice", affects="note",
            options=[("sickerschacht", "Sickerschacht"), ("kanal", "Kanalanschluss"),
                     ("gelaende", "Freies Gefälle")],
            default="sickerschacht", note_if={"kanal": "kanalanschluss_genehmigung"}),
          Q_LEITUNGEN],
      operations=[
          Op("graben", "Graben ausheben", "lfm", (0.35, 0.70),
             debris_kg_per_unit=(450, 950), debris_type="aushub"),
          Op("verlegen", "Rohr, Vlies und Filterkies einbringen", "lfm", (0.30, 0.60),
             material_per_unit=(14, 30), waste_factor=0.05),
          Op("schliessen", "Graben schließen und verdichten", "lfm", (0.20, 0.40))]),

    J(key="garten.treppe_aussen", trade="garten", group=G, segment=S_PFL,
      label_de="Außentreppe bauen", unit="Stufe",
      setup_hours=(1.5, 2.5), typical_size=(3, 12),
      market_band_at=(160, 450), market_band_de=(160, 470),
      confidence="low", sources=SRC,
      note_keys=["unterbau_tragfaehig", "absturzsicherung_norm", "gefaelle"],
      guided_form=[
          Q("stufen", "Anzahl Stufen", "number", unit="Stufe", affects="qty", default=5),
          Q("material", "Material", "choice", affects="variant",
            options=[("betonstein", "Betonstein"), ("naturstein", "Naturstein"),
                     ("blockstufen", "Blockstufen")],
            default="blockstufen"),
          Q("gelaender", "Mit Geländer", "bool", affects="note", default=False,
            note_if={"True": "gelaender_separat"})],
      operations=[
          Op("aushub", "Aushub und Planum", "Stufe", (0.55, 1.10),
             debris_kg_per_unit=(320, 700), debris_type="aushub"),
          Op("fundament", "Fundament und Tragschicht", "Stufe", (0.70, 1.30),
             material_per_unit=(28, 60)),
          Op("setzen", "Stufen setzen und ausrichten", "Stufe", (0.85, 1.60),
             material_per_unit=(55, 130), waste_factor=0.05)]),

    J(key="garten.pool", trade="garten", group=G, segment=S_POOL,
      label_de="Pool einbauen (GFK-Becken, Standard)", unit="Stk",
      setup_hours=(4.0, 8.0), typical_size=(1, 1), band_basis="total",
      market_band_at=(18000, 45000), market_band_de=(19000, 48000),
      confidence="low", sources=SRC,
      note_keys=["statik_pflicht", "genehmigung_bau", "leitungen_im_boden"],
      guided_form=[
          Q("groesse", "Beckengröße", "choice", affects="variant",
            options=[("klein", "Bis 6 x 3 m"), ("mittel", "6 x 3 bis 8 x 4 m"),
                     ("gross", "Über 8 x 4 m")],
            default="mittel"),
          Q("technik", "Technik", "choice", affects="variant",
            options=[("basis", "Filter und Pumpe"),
                     ("komfort", "Mit Heizung"),
                     ("premium", "Heizung, Abdeckung, Gegenstromanlage")],
            default="komfort"),
          Q("aushub_abtransport", "Aushub", "choice", affects="note",
            options=[("abtransport", "Wird abtransportiert"),
                     ("verbleibt", "Verbleibt am Grundstück")],
            default="abtransport", note_if={"verbleibt": "aushub_verbleibt"}),
          Q_LEITUNGEN],
      operations=[
          Op("aushub", "Aushub und Abtransport", "Stk", (14, 26),
             debris_kg_per_unit=(40000, 70000), debris_type="aushub"),
          Op("becken", "Becken inkl. Technik", "Stk", (0, 0), kind="material",
             material_per_unit=(11000, 26000)),
          Op("einbau", "Einbau, Verrohrung, Technikraum", "Stk", (45, 90)),
          Op("umgebung", "Randgestaltung", "Stk", (12, 26),
             material_per_unit=(1200, 3500))]),
]
