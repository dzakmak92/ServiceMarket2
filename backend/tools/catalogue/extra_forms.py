"""The questions the thin templates were missing.

Sanitär and Elektrik came out of the deep-catalogue pass with the fewest
questions of any offered trade — 44 % and 57 % of their answers reached the
price, against 85 % for Maler — and eleven of their templates asked one or two
things before naming a number.

The pattern is the same in every one of them: the template asks about the
*preconditions* and not about the *thing being fitted*. Replacing a tap asked
whether the isolating valve worked and what year the building went up, and
never asked what kind of tap. Swapping a bath asked whether the tiles around it
survive, and not whether the bath is steel, acrylic or freestanding, or what
happens to the panel. A consumer-unit extension asked how many circuits and
whether there was room, and not whether there is an RCD — which is the single
line that turns a two-hour job into a half-day and is legally required the
moment the board is opened.

Each addition below is a question a tradesperson asks on the phone, and each
one is priced in `pricing.py`. Nothing here is a note dressed up as a question:
where the honest answer was "this changes nothing", no question was added.
"""
from schema import Question as Q

EXTRA_FORMS: dict[str, list] = {

    # ══ Sanitär ═════════════════════════════════════════════════════════

    "sanitaer.armatur": [
        Q("art", "Art der Armatur", "choice", affects="variant",
          options=[("waschtisch", "Waschtisch"), ("kueche", "Küchenarmatur"),
                   ("dusche_ap", "Dusche oder Wanne, Aufputz"),
                   ("dusche_up", "Dusche oder Wanne, Unterputz"),
                   ("thermostat", "Thermostatarmatur")],
          default="waschtisch",
          help_de="Unterputz heißt Wand öffnen — das ist eine andere Arbeit als ein Wechsel am Waschtisch."),
    ],
    "sanitaer.badewanne_tausch": [
        Q("wanne_typ", "Bauart der neuen Wanne", "choice", affects="variant",
          options=[("stahl", "Stahl-Email, Standardmaß"),
                   ("acryl", "Acryl mit Wannenträger"),
                   ("freistehend", "Freistehend")],
          default="stahl"),
        Q("verkleidung", "Wannenschürze", "choice", affects="variant",
          options=[("bestand", "Bestand bleibt"),
                   ("fertigelement", "Neues Fertigelement"),
                   ("gemauert", "Neu gemauert und gefliest")],
          default="fertigelement"),
    ],
    "sanitaer.duschkabine": [
        Q("bauart", "Bauart", "choice", affects="variant",
          options=[("nische", "Nischentür"), ("eckeinstieg", "Eckeinstieg"),
                   ("walk_in", "Walk-in"), ("rund", "Runddusche")],
          default="nische"),
        Q("glas", "Maß", "choice", affects="variant",
          options=[("standard", "Standardmaß ab Lager"),
                   ("sondermass", "Sondermaß, Zuschnitt nötig")],
          default="standard", note_if={"sondermass": "aufmass_vor_fertigung"}),
    ],
    "sanitaer.waschmaschinenanschluss": [
        Q("abfluss", "Abfluss", "choice", affects="variant",
          options=[("vorhanden", "Vorhanden und nutzbar"),
                   ("anschluss_neu", "Neu an bestehende Leitung"),
                   ("hebeanlage", "Hebeanlage erforderlich")],
          default="anschluss_neu"),
        Q("montage", "Montageart", "choice", affects="variant",
          options=[("aufputz", "Aufputz"), ("unterputz", "Unterputz, Wand aufstemmen")],
          default="unterputz", note_if={"unterputz": "oeffnung_wand"}),
    ],
    "sanitaer.dichtheitspruefung": [
        Q("medium", "Prüfmedium", "choice", affects="variant",
          options=[("wasser", "Wasser"), ("luft", "Luft"),
                   ("kanal", "Kanal, mit Absperrblase")],
          default="wasser"),
    ],
    "sanitaer.kamerabefahrung": [
        Q("zugang_kanal", "Zugang zum Kanal", "choice", affects="variant",
          options=[("schacht", "Revisionsschacht vorhanden"),
                   ("wc", "Über WC oder Ablauf"),
                   ("oeffnen", "Muss erst geöffnet werden")],
          default="schacht"),
        Q("spuelen", "Vorher spülen erforderlich", "bool", affects="variant",
          default=False),
    ],
    "sanitaer.notdienst_anfahrt": [
        Q("problem", "Was ist passiert", "choice", affects="variant",
          options=[("wasseraustritt", "Wasser tritt aus"),
                   ("verstopfung", "Verstopfung"),
                   ("kein_warmwasser", "Kein Warmwasser oder Heizung aus"),
                   ("unklar", "Noch unklar")],
          default="unklar", note_if={"wasseraustritt": "folgeschaeden"}),
    ],
    "sanitaer.rohrreinigung_wc": [
        Q("verfahren", "Verfahren", "choice", affects="variant",
          options=[("spirale", "Rohrreinigungsspirale"),
                   ("hochdruck", "Hochdruckspülung")],
          default="spirale"),
        Q("zeit", "Einsatzzeit", "choice", affects="variant",
          options=[("regulaer", "Werktag 7-17 Uhr"),
                   ("abend", "Abend oder Samstag"),
                   ("nacht_sonntag", "Nacht oder Sonn-/Feiertag")],
          default="regulaer"),
    ],
    "sanitaer.rohrreinigung_waschbecken": [
        Q("verfahren", "Verfahren", "choice", affects="variant",
          options=[("siphon", "Siphon öffnen und reinigen"),
                   ("spirale", "Rohrreinigungsspirale"),
                   ("hochdruck", "Hochdruckspülung")],
          default="siphon"),
    ],
    "sanitaer.boiler": [
        Q("montage", "Aufstellung", "choice", affects="variant",
          options=[("wand", "Wandmontage"), ("stand", "Standspeicher")],
          default="wand"),
        Q("energie", "Beheizung", "choice", affects="variant",
          options=[("elektro", "Elektrisch"), ("indirekt", "Indirekt über Heizung"),
                   ("waermepumpe", "Warmwasser-Wärmepumpe")],
          default="elektro"),
    ],
    "sanitaer.spuelkasten": [
        Q("defekt", "Was ist defekt", "choice", affects="variant",
          options=[("fuellventil", "Füllventil"), ("spuelventil", "Spülventil"),
                   ("undicht", "Undicht, Wasser läuft nach"),
                   ("druckerplatte", "Drückerplatte oder Gestänge")],
          default="fuellventil"),
    ],
    "sanitaer.therme_wartung": [
        Q("abgasmessung", "Abgasmessung mit Protokoll", "bool", affects="variant",
          default=True),
    ],

    # ══ Elektrik ════════════════════════════════════════════════════════

    "elektrik.geraetepruefung": [
        Q("geraeteart", "Art der Geräte", "choice", affects="variant",
          options=[("buero", "Bürogeräte"), ("werkstatt", "Werkstatt und Maschinen"),
                   ("baustelle", "Baustellengeräte")],
          default="buero"),
        Q("protokoll", "Dokumentation", "choice", affects="variant",
          options=[("liste", "Prüfliste"), ("datenbank", "Datenbank mit Historie")],
          default="liste", note_if={"datenbank": "pruefplakette"}),
    ],
    "elektrik.herdanschluss": [
        Q("geraet", "Gerät", "choice", affects="variant",
          options=[("herd", "Herd mit Kochfeld"),
                   ("autark", "Autarkes Kochfeld"),
                   ("induktion_stark", "Induktion, mehrphasig")],
          default="herd"),
    ],
    "elektrik.schalter_tauschen": [
        Q("typ_schalter", "Ausführung", "choice", affects="variant",
          options=[("standard", "Standardschalter oder Steckdose"),
                   ("dimmer", "Dimmer"),
                   ("jalousie", "Jalousieschalter"),
                   ("bewegungsmelder", "Bewegungsmelder")],
          default="standard"),
    ],
    "elektrik.rauchmelder": [
        Q("decke", "Deckenaufbau", "choice", affects="variant",
          options=[("gipskarton", "Gipskarton oder Holz"),
                   ("beton", "Beton")],
          default="gipskarton"),
    ],
    "elektrik.aussensteckdose": [
        Q("montageort", "Montageort", "choice", affects="variant",
          options=[("fassade", "An der Fassade"),
                   ("standsaeule", "Standsäule im Garten")],
          default="fassade"),
    ],
    "elektrik.datendose": [
        Q("verlegung", "Verlegung", "choice", affects="variant",
          options=[("unterputz", "Unterputz, Schlitz fräsen"),
                   ("kanal", "Kabelkanal"), ("aufputz", "Aufputz")],
          default="unterputz"),
        Q("patchfeld", "Patchfeld vorhanden", "bool", affects="variant", default=True),
    ],
    "elektrik.verteiler_klein": [
        # The one question that decides whether this is a two-hour job.
        # ÖVE/ÖNORM E 8001 and DIN VDE 0100-410: opening the board without an
        # RCD present means retrofitting one.
        Q("fi", "FI-Schutzschalter vorhanden", "choice", affects="variant",
          options=[("vorhanden", "Ja"), ("nachruesten", "Nein, muss nachgerüstet werden"),
                   ("unbekannt", "Unbekannt")],
          default="unbekannt",
          note_if={"nachruesten": "fi_nachruesten", "unbekannt": "fi_nachruesten"}),
    ],
    "elektrik.smarthome": [
        Q("system", "System", "choice", affects="variant",
          options=[("funk", "Funk, herstellergebunden"),
                   ("wlan", "WLAN"), ("bus", "Bussystem, verdrahtet")],
          default="funk", note_if={"funk": "system_bindung", "bus": "neue_leitung_noetig"}),
    ],
    "elektrik.gegensprechanlage": [
        Q("video", "Ausführung", "choice", affects="variant",
          options=[("audio", "Nur Audio"), ("video", "Mit Video")],
          default="audio"),
    ],

    # ══ Maler und Fliesen ═══════════════════════════════════════════════

    "maler.holzschutz": [
        Q("bauteil", "Bauteil", "choice", affects="variant",
          options=[("zaun", "Zaun oder Sichtschutz"),
                   ("fassade", "Holzfassade"),
                   ("carport", "Carport oder Gartenhaus")],
          default="fassade"),
        Q("anstriche", "Anstriche", "choice", affects="variant",
          options=[("einmal", "Einmal"), ("zweimal", "Zweimal")],
          default="zweimal"),
    ],
    "maler.fassade_reinigen": [
        Q("verfahren", "Verfahren", "choice", affects="variant",
          options=[("niederdruck", "Niederdruck mit Reiniger"),
                   ("hochdruck", "Hochdruck"),
                   ("heisswasser", "Heißwasser oder Dampf")],
          default="niederdruck"),
        Q("impraegnierung", "Imprägnierung im Anschluss", "bool", affects="variant",
          default=True),
    ],
    "maler.heizkoerper_lackieren": [
        Q("demontage", "Heizkörper abnehmen", "bool", affects="variant", default=False),
    ],
    "maler.risse_sanieren": [
        Q("breite", "Rissbreite", "choice", affects="variant",
          options=[("bis_1", "Bis 1 mm"), ("bis_3", "1 bis 3 mm"),
                   ("ueber_3", "Über 3 mm")],
          default="bis_1"),
    ],
    "fliesen.sockelleisten": [
        Q("art", "Ausführung", "choice", affects="variant",
          options=[("geschnitten", "Aus der Fliese geschnitten"),
                   ("fertig", "Fertigsockel"),
                   ("hohlkehle", "Mit Hohlkehle")],
          default="geschnitten"),
    ],
    "fliesen.fugen_sanieren": [
        Q("fugenbreite", "Fugenbreite", "choice", affects="variant",
          options=[("schmal", "Bis 3 mm"), ("breit", "Über 3 mm")],
          default="schmal"),
    ],
    "fliesen.entfernen_duennbett": [
        Q("wand_boden", "Fläche", "choice", affects="variant",
          options=[("boden", "Boden"), ("wand", "Wand"), ("beides", "Wand und Boden")],
          default="boden"),
    ],
}
