"""Maler in depth — 19 job types with guided forms.

Bands from AT/DE price radars: Malerstunde AT 38-55, DE 35-60. Innenanstrich
7-15 EUR/m2 all-in, Tapezieren 8-16, Fassade 18-44 *inklusive Gerüst*,
WDVS 120-220 ebenfalls inklusive Gerüst.
(fixbuddy.at, daibau.at, profirechner.de, handwerksratgeber.de)

Three things learned writing this trade.

**Published Maler bands include the scaffolding.** The v1 catalogue took the
18-44 EUR/m2 Fassade band at face value while pricing the job explicitly
without Gerüst, and carried a permanent validation failure because of it. That
was never a coefficient error — the estimate was right and the band was
measuring something else. The Gerüst entry in this same catalogue is 6-14
EUR/m2, so the bands for the two facade jobs are stated net of it and the note
that says scaffolding is excluded is now consistent with the number.

**The substrate is the whole job.** A painter quoting per m2 of wall is
quoting the coat; what varies by a factor of four is what has to happen before
it — nothing on new plasterboard, a full strip and wash on five layers of
painted-over woodchip. So `untergrund` is a question on every surface job and
it is the one that moves the number most.

**A colour change is not free.** Dark to light is three coats, not two, and it
is the single most common source of an argument on site. It is asked, it is
priced, and it produces a note.
"""
from schema import JobType as J, Operation as Op, Question as Q

G, S = "Maler & Tapezierer", "Maler & Lackierer"
SRC = ["fixbuddy.at/was-kostet-maler", "daibau.at/baukostenrechner/maler",
       "profirechner.de/malerarbeiten-kosten-rechner"]
SRC_FAS = ["hausbau-magazin.at/malerkosten-oesterreich",
           "daibau.at/baukostenrechner/fassade"]

# The question that moves the number most on every surface job.
Q_UNTERGRUND = Q("untergrund", "Untergrund", "choice", affects="variant",
                 options=[("gipskarton_neu", "Gipskarton, neu gespachtelt"),
                          ("putz_gestrichen", "Verputzt, gestrichen, intakt"),
                          ("raufaser", "Raufaser, gestrichen"),
                          ("altbau_leimfarbe", "Altbau, Leim- oder Kalkfarbe"),
                          ("schadhaft", "Rissig oder abblätternd")],
                 default="putz_gestrichen",
                 note_if={"altbau_leimfarbe": "leimfarbe_altanstrich",
                          "schadhaft": "untergrund_tragfaehig"},
                 help_de="Was schon an der Wand ist, entscheidet über den Aufwand davor.")
Q_FARBWECHSEL = Q("farbwechsel", "Deutlicher Farbwechsel", "bool", affects="variant",
                  default=False, note_if={"True": "deckkraft_farbwechsel"},
                  help_de="Dunkel auf hell braucht einen dritten Anstrich")
Q_MOEBEL = Q("moebel", "Möblierung", "choice", affects="note",
             options=[("leer", "Leer"), ("teilweise", "Teilweise geräumt"),
                      ("voll", "Voll möbliert")],
             default="leer", note_if={"voll": "moebel_bauseits",
                                      "teilweise": "moebel_bauseits"})
Q_NIKOTIN = Q("nikotin", "Nikotin- oder Wasserflecken", "bool", affects="variant",
              default=False, note_if={"True": "nikotin_sperrgrund"})
Q_BAUJAHR = Q("baujahr", "Baujahr", "number", unit="Jahr", affects="note",
              help_de="Vor 1960 kann der Altanstrich Blei enthalten.")
Q_GERUEST = Q("geruest", "Gerüst", "choice", affects="note",
              options=[("bauseits", "Wird bauseits gestellt"),
                       ("noetig", "Wird benötigt"),
                       ("nicht_noetig", "Nicht nötig, Leiter reicht")],
              default="noetig", note_if={"noetig": "geruest_nicht_enthalten"})

MALER_DEEP = [
    # ── Innen: Flächen ────────────────────────────────────────────────
    J(key="maler.innenanstrich", trade="maler", group=G, segment=S,
      label_de="Innenanstrich Wände, 2 Anstriche", unit="m2",
      setup_hours=(0.8, 1.5), typical_size=(25, 90),
      market_band_at=(7, 15), market_band_de=(7, 20),
      confidence="high", sources=SRC,
      note_keys=["moebel_bauseits", "trocknung_nutzung"],
      guided_form=[Q_UNTERGRUND, Q_FARBWECHSEL, Q_NIKOTIN, Q_MOEBEL],
      operations=[
          Op("abdecken", "Abdecken und Abkleben", "m2", (0.030, 0.050)),
          Op("anstrich2", "Wandanstrich, zwei Anstriche", "m2", (0.055, 0.085)),
          Op("farbe", "Dispersionsfarbe", "m2", (0, 0), kind="material",
             material_per_unit=(1.10, 1.90), waste_factor=0.08)]),

    J(key="maler.decke", trade="maler", group=G, segment=S,
      label_de="Deckenanstrich, 2 Anstriche", unit="m2",
      setup_hours=(0.6, 1.2), typical_size=(12, 40),
      market_band_at=(9, 18), market_band_de=(9, 22),
      confidence="high", sources=SRC,
      note_keys=["trocknung_nutzung"],
      guided_form=[Q_UNTERGRUND, Q_NIKOTIN, Q_MOEBEL],
      operations=[
          Op("abdecken", "Abdecken", "m2", (0.030, 0.050)),
          # Overhead work is slower than a wall and the reason ceilings carry
          # a surcharge in every price list.
          Op("anstrich2", "Deckenanstrich, zwei Anstriche", "m2", (0.070, 0.110)),
          Op("farbe", "Deckenfarbe", "m2", (0, 0), kind="material",
             material_per_unit=(1.10, 1.80), waste_factor=0.08)]),

    J(key="maler.wohnung_komplett", trade="maler", group=G, segment=S,
      label_de="Wohnung komplett streichen", unit="m2",
      # Priced per m2 Wohnfläche, which is the number a customer knows. Wall
      # plus ceiling area runs roughly 3.2x the floor area in a normal flat,
      # and asking a customer to measure their walls is how a lead is lost.
      setup_hours=(2.5, 4.5), typical_size=(45, 110),
      market_band_at=(20, 42), market_band_de=(20, 46),
      confidence="medium", sources=SRC,
      note_keys=["moebel_bauseits", "trocknung_nutzung", "musteranstrich"],
      guided_form=[
          Q("wohnflaeche", "Wohnfläche", "number", unit="m2", affects="qty",
            default=70, help_de="Wand- und Deckenfläche werden daraus gerechnet"),
          Q_UNTERGRUND, Q_FARBWECHSEL, Q_NIKOTIN, Q_MOEBEL],
      operations=[
          Op("abdecken", "Abdecken und Abkleben", "m2", (0.075, 0.125)),
          Op("waende", "Wände, zwei Anstriche", "m2", (0.130, 0.200)),
          Op("decken", "Decken, zwei Anstriche", "m2", (0.070, 0.110)),
          Op("ausbessern", "Kleinausbesserungen", "m2", (0.020, 0.055)),
          Op("farbe", "Dispersionsfarbe", "m2", (0, 0), kind="material",
             material_per_unit=(3.30, 5.80), waste_factor=0.08)]),

    J(key="maler.spachteln_q3", trade="maler", group=G, segment=S,
      label_de="Spachteln Q3 (glatt, streiffrei)", unit="m2",
      setup_hours=(0.8, 1.5), typical_size=(25, 90),
      market_band_at=(12, 25), market_band_de=(12, 28),
      confidence="high", sources=SRC,
      note_keys=["untergrund_tragfaehig", "staub"],
      guided_form=[Q_UNTERGRUND, Q_MOEBEL],
      operations=[
          Op("grundierung", "Grundierung", "m2", (0.020, 0.035)),
          Op("spachtel_arbeit", "Flächenspachtelung Q3", "m2", (0.110, 0.180)),
          Op("schleifen", "Schleifen und entstauben", "m2", (0.035, 0.060)),
          Op("spachtel_mat", "Spachtelmasse und Grundierung", "m2", (0, 0),
             kind="material", material_per_unit=(1.40, 2.60), waste_factor=0.10)]),

    J(key="maler.spachteln_q4", trade="maler", group=G, segment=S,
      label_de="Spachteln Q4 (streiflichttauglich)", unit="m2",
      setup_hours=(1.0, 1.8), typical_size=(20, 70),
      market_band_at=(20, 42), market_band_de=(20, 46),
      confidence="medium", sources=SRC,
      # Q4 is the level customers ask for by name after seeing one bad wall in
      # raking light, and the level most often quoted at Q3 prices.
      note_keys=["untergrund_tragfaehig", "staub", "trocknung_nutzung"],
      guided_form=[Q_UNTERGRUND, Q_MOEBEL],
      operations=[
          Op("grundierung", "Grundierung", "m2", (0.020, 0.035)),
          Op("q3", "Grundspachtelung", "m2", (0.110, 0.180)),
          Op("q4", "Feinspachtelung vollflächig", "m2", (0.090, 0.150)),
          Op("schleifen", "Schleifen und entstauben", "m2", (0.055, 0.090)),
          Op("mat", "Spachtelmasse, Fein- und Grundierung", "m2", (0, 0),
             kind="material", material_per_unit=(2.40, 4.20), waste_factor=0.10)]),

    # ── Innen: Tapete ─────────────────────────────────────────────────
    J(key="maler.tapete_entfernen", trade="maler", group=G, segment=S,
      label_de="Tapete entfernen", unit="m2",
      setup_hours=(0.6, 1.2), typical_size=(20, 70),
      market_band_at=(5, 12), market_band_de=(5, 14),
      confidence="high", sources=SRC,
      note_keys=["altbau_untergrund", "staub"],
      guided_form=[
          Q("tapetenart", "Art der Tapete", "choice", affects="variant",
            options=[("raufaser_1x", "Raufaser, einmal gestrichen"),
                     ("raufaser_mehrfach", "Raufaser, mehrfach überstrichen"),
                     ("vlies", "Vlies, trocken abziehbar"),
                     ("papier_alt", "Alte Papiertapete, mehrlagig")],
            default="raufaser_1x",
            note_if={"raufaser_mehrfach": "untergrund_tragfaehig",
                     "papier_alt": "altbau_untergrund"}),
          # Stripping is done standing up, and only up to about 2,20 m of it.
          # Above that the top band comes off a hop-up or a trestle that has to
          # be moved along every wall, which slows the whole wall rather than
          # just its top — and in an Altbau at 3,50 m it is a rolling tower,
          # plus the time to put it up and take it down again.
          Q("raumhoehe", "Raumhöhe", "choice", affects="variant",
            options=[("bis_2_60", "Bis 2,60 m"), ("bis_3_20", "Bis 3,20 m"),
                     ("ueber_3_20", "Über 3,20 m")],
            default="bis_2_60", note_if={"ueber_3_20": "hoehenarbeit_sicherung"}),
          Q_MOEBEL],
      operations=[
          # Raufaser peels; woodchip painted over five times does not.
          Op("loesen", "Tapete lösen und abziehen", "m2", (0.070, 0.160),
             debris_kg_per_unit=(0.4, 1.2), debris_type="sperrmuell"),
          Op("reste", "Kleisterreste waschen", "m2", (0.030, 0.060))]),

    J(key="maler.tapezieren", trade="maler", group=G, segment=S,
      label_de="Raufaser tapezieren und streichen", unit="m2",
      setup_hours=(0.8, 1.5), typical_size=(25, 90),
      market_band_at=(11, 22), market_band_de=(11, 25),
      confidence="medium", sources=SRC,
      note_keys=["untergrund_eben", "trocknung_nutzung"],
      guided_form=[Q_UNTERGRUND, Q_MOEBEL],
      operations=[
          Op("vorbereiten", "Untergrund vorbereiten und grundieren", "m2", (0.030, 0.055)),
          Op("tapezieren", "Raufaser ansetzen und tapezieren", "m2", (0.090, 0.150)),
          Op("anstrich2", "Zwei Anstriche", "m2", (0.055, 0.085)),
          Op("mat", "Raufaser, Kleister und Farbe", "m2", (0, 0), kind="material",
             material_per_unit=(2.40, 4.20), waste_factor=0.12)]),

    J(key="maler.designtapete", trade="maler", group=G, segment=S,
      label_de="Vlies- oder Designtapete verlegen", unit="m2",
      setup_hours=(1.0, 2.0), typical_size=(10, 35),
      market_band_at=(22, 55), market_band_de=(22, 60),
      confidence="medium", sources=SRC,
      # Patterned wallpaper is the one Maler job where material dominates and
      # where Verschnitt is a real number rather than a rounding allowance.
      note_keys=["verschnitt_muster", "untergrund_eben", "tapete_bauseits_moeglich"],
      guided_form=[
          Q("ansatz", "Musteransatz", "choice", affects="variant",
            options=[("ohne", "Kein Ansatz / uni"), ("gerade", "Gerader Ansatz"),
                     ("versetzt", "Versetzter Ansatz")],
            default="gerade", note_if={"versetzt": "verschnitt_muster"}),
          Q("material_bauseits", "Tapete wird beigestellt", "bool", affects="variant",
            default=False, note_if={"True": "tapete_bauseits_moeglich"}),
          Q_UNTERGRUND, Q_MOEBEL],
      operations=[
          Op("vorbereiten", "Untergrund vorbereiten und grundieren", "m2", (0.035, 0.065)),
          Op("verlegen", "Tapete ansetzen und verlegen", "m2", (0.130, 0.250)),
          Op("mat", "Vlies- bzw. Designtapete", "m2", (0, 0), kind="material",
             material_per_unit=(11.00, 26.00), waste_factor=0.15)]),

    # ── Innen: Lack ───────────────────────────────────────────────────
    J(key="maler.tuer_lackieren", trade="maler", group=G, segment=S,
      label_de="Innentür lackieren (Blatt und Zarge)", unit="Stk",
      setup_hours=(0.5, 1.0), typical_size=(1, 6), band_basis="total",
      market_band_at=(120, 260), market_band_de=(125, 290),
      confidence="medium", sources=SRC,
      note_keys=["lack_demontage", "trocknung_nutzung"],
      guided_form=[
          Q("anzahl", "Anzahl Türen", "number", unit="Stk", affects="qty", default=1),
          Q("altlack", "Bestehender Lack", "choice", affects="variant",
            options=[("intakt", "Intakt, nur anschleifen"),
                     ("abblaetternd", "Abblätternd"),
                     ("furnier_roh", "Furnier oder roh")],
            default="intakt", note_if={"abblaetternd": "untergrund_tragfaehig"}),
          Q_BAUJAHR],
      operations=[
          Op("demontage", "Beschläge demontieren und montieren", "Stk", (0.25, 0.45)),
          Op("schleifen", "Schleifen und entstauben", "Stk", (0.45, 0.90)),
          Op("grundieren", "Grundierung", "Stk", (0.30, 0.55)),
          Op("lackieren", "Zweimal lackieren mit Zwischenschliff", "Stk", (0.95, 1.80)),
          Op("mat", "Grundierung und Lack", "Stk", (0, 0), kind="material",
             material_per_unit=(9.00, 22.00), waste_factor=0.10)]),

    J(key="maler.heizkoerper_lackieren", trade="maler", group=G, segment=S,
      messy=False,
      label_de="Heizkörper lackieren", unit="Stk",
      setup_hours=(0.4, 0.8), typical_size=(1, 5), band_basis="total",
      market_band_at=(60, 150), market_band_de=(60, 160),
      confidence="medium", sources=SRC,
      note_keys=["heizkoerper_kalt", "trocknung_nutzung"],
      guided_form=[
          Q("anzahl", "Anzahl Heizkörper", "number", unit="Stk", affects="qty", default=1),
          Q("typ", "Bauart", "choice", affects="variant",
            options=[("flach", "Flachheizkörper"), ("rippen", "Rippenheizkörper"),
                     ("guss_alt", "Alter Gussradiator")],
            default="flach")],
      operations=[
          Op("abdecken", "Abdecken und Abkleben", "Stk", (0.20, 0.35)),
          Op("schleifen", "Entrosten und anschleifen", "Stk", (0.30, 0.65)),
          Op("lackieren", "Heizkörperlack, zwei Aufträge", "Stk", (0.50, 1.00)),
          Op("mat", "Grundierung und Heizkörperlack", "Stk", (0, 0), kind="material",
             material_per_unit=(7.00, 16.00), waste_factor=0.10)]),

    J(key="maler.holzfenster_streichen", trade="maler", group=G, segment=S,
      label_de="Holzfenster streichen", unit="Stk",
      setup_hours=(0.6, 1.2), typical_size=(1, 8), band_basis="total",
      market_band_at=(130, 320), market_band_de=(140, 350),
      confidence="medium", sources=SRC,
      note_keys=["witterung", "holzschutz_intervall", "lack_demontage"],
      guided_form=[
          Q("anzahl", "Anzahl Fenster", "number", unit="Stk", affects="qty", default=2),
          Q("zustand_holz", "Zustand des Holzes", "choice", affects="variant",
            options=[("gut", "Gut, nur anschleifen"),
                     ("verwittert", "Verwittert, Altanstrich lose"),
                     ("schaeden", "Holzschäden sichtbar")],
            default="verwittert",
            note_if={"schaeden": "untergrund_tragfaehig"}),
          Q_BAUJAHR, Q_GERUEST],
      operations=[
          Op("demontage", "Beschläge lösen und wieder montieren", "Stk", (0.30, 0.55)),
          Op("vorbereiten", "Altanstrich anschleifen, lose Teile entfernen", "Stk", (0.70, 1.60)),
          Op("grundieren", "Holzgrundierung", "Stk", (0.35, 0.70)),
          Op("lackieren", "Zweimal Wetterschutzlack", "Stk", (0.90, 1.80)),
          Op("mat", "Grundierung, Lack und Dichtstoff", "Stk", (0, 0), kind="material",
             material_per_unit=(14.00, 32.00), waste_factor=0.10)]),

    # ── Innen: Sanierung ──────────────────────────────────────────────
    J(key="maler.schimmelsanierung", trade="maler", group=G, segment=S,
      label_de="Schimmelsanierung Innenwand", unit="m2",
      setup_hours=(1.2, 2.5), typical_size=(2, 15),
      market_band_at=(28, 75), market_band_de=(28, 85),
      confidence="medium", sources=SRC,
      # The note that matters more than the price: treating the surface
      # without fixing the cause guarantees a callback, and the callback will
      # be blamed on the paint.
      note_keys=["schimmel_ursache_extra", "raumklima", "staub"],
      guided_form=[
          Q("flaeche", "Befallene Fläche", "number", unit="m2", affects="qty", default=4,
            help_de="Ab 0,5 m² ist es nach Umweltbundesamt ein Fall für Fachfirmen"),
          Q("ursache", "Ursache", "choice", affects="note",
            options=[("kondensat", "Kondensat / Lüftungsverhalten"),
                     ("wasserschaden", "Wasserschaden"),
                     ("waermebruecke", "Wärmebrücke"),
                     ("unbekannt", "Unbekannt")],
            default="unbekannt",
            note_if={"unbekannt": "schimmel_ursache_extra",
                     "wasserschaden": "folgeschaeden"}),
          Q("umfang_gross", "Mehr als 0,5 m² befallen", "bool", affects="note",
            default=True, note_if={"True": "schimmel_grossflaechig"}),
          Q_MOEBEL],
      operations=[
          Op("abschotten", "Arbeitsbereich abschotten", "m2", (0.060, 0.120)),
          Op("entfernen", "Befallenen Putz bzw. Anstrich entfernen", "m2", (0.150, 0.320),
             debris_kg_per_unit=(3.0, 9.0)),
          Op("behandeln", "Desinfektion und Trocknung prüfen", "m2", (0.080, 0.160)),
          Op("aufbauen", "Sperrgrund und Neuanstrich", "m2", (0.110, 0.200)),
          Op("mat", "Schimmelentferner, Sperrgrund, Farbe", "m2", (0, 0), kind="material",
             material_per_unit=(6.00, 14.00), waste_factor=0.10)]),

    J(key="maler.strukturputz", trade="maler", group=G, segment=S,
      label_de="Struktur- oder Dekorputz innen", unit="m2",
      setup_hours=(1.0, 2.0), typical_size=(12, 45),
      market_band_at=(22, 48), market_band_de=(22, 55),
      confidence="low", sources=SRC,
      note_keys=["untergrund_eben", "musteranstrich", "trocknung_nutzung"],
      guided_form=[
          Q("art", "Art", "choice", affects="variant",
            options=[("rollputz", "Rollputz"), ("reibeputz", "Reibeputz"),
                     ("spachtel_dekor", "Dekorspachtel / Beton-Optik")],
            default="reibeputz",
            note_if={"spachtel_dekor": "musteranstrich"}),
          Q_UNTERGRUND, Q_MOEBEL],
      operations=[
          Op("grundieren", "Haftgrund", "m2", (0.025, 0.045)),
          Op("auftragen", "Putz auftragen und strukturieren", "m2", (0.150, 0.300)),
          Op("mat", "Putz und Haftgrund", "m2", (0, 0), kind="material",
             material_per_unit=(5.00, 11.00), waste_factor=0.12)]),

    J(key="maler.risse_sanieren", trade="maler", group=G, segment=S,
      messy=False,
      label_de="Risse sanieren", unit="lfm",
      setup_hours=(0.6, 1.2), typical_size=(3, 25),
      market_band_at=(9, 28), market_band_de=(9, 30),
      confidence="low", sources=SRC,
      note_keys=["untergrund_tragfaehig", "statik_nicht_tragend"],
      guided_form=[
          Q("laenge", "Risslänge gesamt", "number", unit="lfm", affects="qty", default=8),
          Q("art", "Art des Risses", "choice", affects="variant",
            options=[("haarriss", "Haarriss im Putz"),
                     ("setzriss", "Setzriss, durchgehend"),
                     ("anschlussfuge", "Anschlussfuge Wand/Decke")],
            default="haarriss",
            note_if={"setzriss": "statik_nicht_tragend"})],
      operations=[
          Op("oeffnen", "Riss öffnen und entstauben", "lfm", (0.060, 0.140),
             debris_kg_per_unit=(0.3, 0.9)),
          Op("verfuellen", "Armieren und verspachteln", "lfm", (0.090, 0.200)),
          Op("schleifen", "Schleifen und ausbessern", "lfm", (0.050, 0.110)),
          Op("mat", "Armierband, Spachtel, Grundierung", "lfm", (0, 0), kind="material",
             material_per_unit=(1.20, 3.00), waste_factor=0.10)]),

    # ── Außen ─────────────────────────────────────────────────────────
    J(key="maler.fassade", trade="maler", group=G, segment=S,
      label_de="Fassadenanstrich", unit="m2",
      setup_hours=(3.0, 6.0),      # Gerüst koordinieren, absichern
      typical_size=(80, 300),
      # Net of scaffolding. Published bands (AT 18-44, DE 20-48) include the
      # Gerüst; this job explicitly does not, and geruest.standard in this same
      # catalogue is 6-14 EUR/m2. Quoting the estimate against a band that
      # measures a different scope was the catalogue's one standing validation
      # failure, and it was the band that was wrong, not the coefficients.
      market_band_at=(12, 34), market_band_de=(13, 38),
      confidence="medium", sources=SRC_FAS,
      note_keys=["geruest_nicht_enthalten", "witterung", "fassade_haftung"],
      guided_form=[
          Q("untergrund_aussen", "Untergrund", "choice", affects="variant",
            options=[("putz_intakt", "Putz, intakt gestrichen"),
                     ("putz_kreidend", "Putz, kreidend"),
                     ("wdvs_bestand", "Bestehendes WDVS"),
                     ("sichtbeton", "Sichtbeton")],
            default="putz_intakt",
            note_if={"putz_kreidend": "fassade_haftung"}),
          Q("hoehe", "Gebäudehöhe", "choice", affects="variant",
            options=[("bis_2", "Bis 2 Geschosse"), ("bis_4", "3 bis 4 Geschosse"),
                     ("ueber_4", "Mehr als 4 Geschosse")],
            default="bis_2", note_if={"ueber_4": "hoehenarbeit_sicherung"}),
          Q_GERUEST],
      operations=[
          Op("reinigen", "Fassade reinigen", "m2", (0.035, 0.070)),
          Op("grundierung", "Tiefengrund", "m2", (0.025, 0.045)),
          Op("anstrich2", "Fassadenanstrich, zwei Anstriche", "m2", (0.090, 0.150)),
          Op("fassadenfarbe", "Fassadenfarbe", "m2", (0, 0), kind="material",
             material_per_unit=(3.20, 6.50), waste_factor=0.10)]),

    J(key="maler.fassade_reinigen", trade="maler", group=G, segment=S,
      messy=False,
      label_de="Fassade reinigen und imprägnieren", unit="m2",
      setup_hours=(1.5, 3.0), typical_size=(60, 250),
      market_band_at=(7, 18), market_band_de=(7, 20),
      confidence="low", sources=SRC_FAS,
      note_keys=["witterung", "geruest_nicht_enthalten"],
      guided_form=[
          Q("verschmutzung", "Verschmutzung", "choice", affects="variant",
            options=[("staub", "Staub und Flugschmutz"),
                     ("algen", "Algen und Grünbelag"),
                     ("graffiti", "Graffiti")],
            default="algen", note_if={"graffiti": "regie_abrechnung"}),
          Q_GERUEST],
      operations=[
          Op("reinigen", "Reinigen, Niederdruck", "m2", (0.040, 0.085)),
          Op("impraegnieren", "Imprägnierung auftragen", "m2", (0.030, 0.055)),
          Op("mat", "Reiniger und Imprägnierung", "m2", (0, 0), kind="material",
             material_per_unit=(1.60, 3.60), waste_factor=0.08)]),

    J(key="maler.wdvs", trade="maler", group=G, segment=S,
      label_de="Wärmedämmverbundsystem (WDVS)", unit="m2",
      setup_hours=(6.0, 12.0), typical_size=(90, 320),
      # Also net of scaffolding, for the same reason as maler.fassade.
      # Published 120-220 (AT) / 130-250 (DE) include Gerüst.
      market_band_at=(105, 200), market_band_de=(112, 225),
      confidence="low", sources=SRC_FAS,
      note_keys=["geruest_nicht_enthalten", "witterung", "wdvs_details",
                 "foerderung"],
      guided_form=[
          Q("daemmstoff", "Dämmstoff", "choice", affects="variant",
            options=[("eps", "EPS"), ("mineralwolle", "Mineralwolle"),
                     ("holzfaser", "Holzfaser")],
            default="eps"),
          Q("staerke", "Dämmstärke", "choice", affects="variant",
            options=[("12", "12 cm"), ("16", "16 cm"), ("20", "20 cm")],
            default="16"),
          Q_GERUEST],
      operations=[
          Op("vorbereiten", "Untergrund prüfen und vorbereiten", "m2", (0.050, 0.100)),
          Op("kleben", "Dämmplatten kleben und dübeln", "m2", (0.220, 0.380)),
          Op("armieren", "Armierungsschicht mit Gewebe", "m2", (0.180, 0.300)),
          Op("oberputz", "Grundierung und Oberputz", "m2", (0.140, 0.240)),
          Op("details", "Sockel, Laibungen und Anschlüsse", "m2", (0.070, 0.150)),
          Op("mat", "Dämmung, Kleber, Gewebe, Putz", "m2", (0, 0), kind="material",
             material_per_unit=(38.00, 72.00), waste_factor=0.10)]),

    J(key="maler.holzschutz", trade="maler", group=G, segment=S,
      label_de="Holzfassade oder Zaun lasieren", unit="m2",
      setup_hours=(1.0, 2.0), typical_size=(20, 120),
      market_band_at=(13, 32), market_band_de=(13, 34),
      confidence="low", sources=SRC_FAS,
      note_keys=["witterung", "holzschutz_intervall"],
      guided_form=[
          Q("zustand_holz", "Zustand", "choice", affects="variant",
            options=[("neu", "Neu, unbehandelt"),
                     ("lasiert_intakt", "Lasiert, intakt"),
                     ("vergraut", "Vergraut oder abblätternd")],
            default="vergraut",
            note_if={"vergraut": "untergrund_tragfaehig"})],
      operations=[
          Op("vorbereiten", "Reinigen, schleifen, entgrauen", "m2", (0.060, 0.130)),
          Op("lasieren", "Zweimal lasieren", "m2", (0.070, 0.130)),
          Op("mat", "Holzschutzlasur", "m2", (0, 0), kind="material",
             material_per_unit=(2.20, 5.00), waste_factor=0.10)]),

    J(key="maler.bodenbeschichtung", trade="maler", group=G, segment=S,
      label_de="Bodenbeschichtung Garage oder Keller", unit="m2",
      setup_hours=(1.5, 3.0), typical_size=(15, 60),
      market_band_at=(30, 70), market_band_de=(30, 75),
      confidence="low", sources=SRC,
      note_keys=["untergrund_tragfaehig", "trocknung_nutzung", "raumklima"],
      guided_form=[
          Q("untergrund_boden", "Untergrund", "choice", affects="variant",
            options=[("beton_neu", "Beton, neu"), ("beton_alt", "Beton, alt"),
                     ("estrich", "Estrich"), ("beschichtet", "Bereits beschichtet")],
            default="beton_alt",
            note_if={"beschichtet": "untergrund_tragfaehig"}),
          Q("feuchte", "Aufsteigende Feuchte bekannt", "bool", affects="note",
            default=False, note_if={"True": "folgeschaeden"})],
      operations=[
          Op("schleifen", "Schleifen und entstauben", "m2", (0.060, 0.120),
             debris_kg_per_unit=(0.5, 1.5)),
          Op("grundieren", "Epoxid-Grundierung", "m2", (0.040, 0.080)),
          Op("beschichten", "Beschichtung auftragen", "m2", (0.060, 0.120)),
          Op("mat", "Grundierung und Beschichtung", "m2", (0, 0), kind="material",
             material_per_unit=(13.00, 26.00), waste_factor=0.10)]),
]
