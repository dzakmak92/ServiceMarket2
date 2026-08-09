"""How the catalogue reads on a screen.

The catalogue in `backend/data/estimation_catalogue.json` is generated from
the Python sources under `tools/catalogue/`, and it is a *pricing* document:
hours per unit, material per unit, waste factors, market bands. Everything in
it earns its place by changing a number.

This module holds the other half — the part that decides whether a
tradesperson can find and understand what the pricing produced. It is
deliberately a separate file rather than more fields in the generator:

  · Regenerating the catalogue must not silently drop this. The generator is
    run when a coefficient changes; the wording below changes when somebody
    reads a screen and does not understand it. Different clocks.

  · Nothing here touches a price. A wrong section puts a template one scroll
    away; a wrong hours_per_unit puts a wrong number on a customer's invoice.
    Keeping them apart keeps that distinction visible in the diff.

Three things live here:

**SECTIONS**, and the tables around it — how one trade's templates are
chunked, what each group is called in four languages, which coloured zone it
sits in, and which templates are shown in two groups at once. `group` in the
catalogue cannot do any of this: every one of the 19 Maler templates carries
the same group, "Maler & Tapezierer", so grouping by it produces one section
containing everything. Only the seven trades with enough templates to need
chunking have sections; below about ten a flat list is faster to read than a
list with headings in it.

`test_sections.py` checks the shape of all of it: every template placed
exactly once before cross-listing, every cross-listing pointing at a section
that exists, every zone's sections contiguous, and every heading, subtitle and
zone name present in all four languages.

**FIELD_HELP** — one line under a form field saying what it is for, so the
survey does not read as an interrogation: five questions with no indication
which of them moves the money.

The wording is mine, not sourced. It describes what the estimator does with
each answer, which is checkable against the code; it does not make claims
about trade practice that a practising pro has not confirmed.

Checkable, and checked. Ten of these lines used to end "der Preis rechnet das
noch nicht mit", which was true when they were written and became the exact
opposite of the truth the moment those answers were priced. A help line that
lies about the price is worse than no help line, and no help line is the
documented fallback — so `test_estimator.py` fails if any priced question's
help still denies it, in any of the four languages.

**AXIS_HELP_I18N** — the same, for the two questions whose wording depends on
the trade. Their German lives in `tools/catalogue/axes.py` beside the option
labels it explains, so the sentence and the options cannot drift apart.
"""
from __future__ import annotations

from services import catalogue_i18n

# ── Sections, zones and cross-listings ──────────────────────────────────
#
# Four tables describe how one trade's templates are laid out:
#
#   SECTIONS        the groups, ordered, with their German heading
#   SECTION_LABELS  that heading in the other three languages
#   SECTION_SUBS    one line under the heading naming what is in the group
#   ZONES           an optional pair of coloured bands above the sections
#   CROSS_LISTED    templates that honestly belong in two groups
#
# **Grouping.** Ordered by the sequence the work happens in where a trade has
# one — a painter strips and fills before painting, a plumber quotes the
# blockage before the bathroom — and by kind where it does not. No group is
# larger than seven, because past that a group is a list again, which is the
# defect this replaced: eleven of nineteen Maler templates used to sit under
# one "Innen" heading.
#
# **Zones.** A band above the sections, given its own colour by the interface.
# Only where a trade has a real second axis that the sections do not already
# carry: indoors/outdoors for Maler and Reinigung, recurring/one-off for
# Garten, fault/planned for Sanitär, single points/whole installation for
# Elektrik. Fliesen and Montage get none — their sections already say
# everything a zone would, and a band drawn round the whole list separates
# nothing.
#
# Two colours exist, so a trade gets at most two zones. That is a constraint
# worth keeping rather than working around: a third zone would need a third
# colour, and the palette has no third colour that is not already spoken for.
#
# A zone's sections must be contiguous and are listed here in the order they
# appear in SECTIONS. Colour that alternates down a page says nothing.
#
# **Cross-listing.** A template may appear in more than one group when it
# genuinely belongs to both, rather than being filed under whichever is least
# wrong. Holzfenster streichen is lacquer work billed per piece *and* work on
# the weather side of the building; a Kanal-Kamerabefahrung is a documented
# survey *and* how a blockage gets found. Both places show the template, and
# both say where else it appears, so the duplicate reads as one template seen
# twice rather than two similar templates.
#
# It is the same template either way: one key, one price, one position in the
# quote. Ticking it in one place ticks it in the other.

SECTIONS: dict[str, list[tuple[str, str, list[str]]]] = {
    # trade: [(section key, German heading, [job keys])]

    # Maler: the order the work happens in. Headings are verbs and are not
    # numbered — the order carries the sequence on its own, and numbering it
    # would read as instructions to a tradesperson about their own job.
    "maler": [
        ("vorbereiten", "Vorbereiten", [
            "maler.tapete_entfernen", "maler.risse_sanieren",
            "maler.spachteln_q3", "maler.spachteln_q4",
        ]),
        ("streichen", "Streichen", [
            "maler.innenanstrich", "maler.decke", "maler.wohnung_komplett",
        ]),
        ("wandbelag", "Tapezieren und verputzen", [
            "maler.tapezieren", "maler.designtapete", "maler.strukturputz",
        ]),
        ("lackieren", "Lackieren", [
            "maler.tuer_lackieren", "maler.heizkoerper_lackieren",
            "maler.holzfenster_streichen",
        ]),
        ("sanieren", "Sanieren und beschichten", [
            "maler.schimmelsanierung", "maler.bodenbeschichtung",
        ]),
        ("fassade", "Fassade streichen und dämmen", [
            "maler.fassade_reinigen", "maler.fassade", "maler.holzschutz",
            "maler.wdvs",
        ]),
    ],

    # Garten splits on how the work is sold, not on where it is: mowing is a
    # season, a terrace is a project, and the two are quoted, scheduled and
    # priced differently.
    "garten": [
        ("pflege_flaechen", "Rasen und Flächen pflegen", [
            "garten.rasenmaehen", "garten.vertikutieren", "garten.laub",
            "garten.winterdienst",
        ]),
        ("schneiden", "Schneiden", [
            "garten.hecke_schnitt", "garten.baumschnitt",
        ]),
        ("baeume", "Bäume und Gehölze", [
            "garten.baumfaellung", "garten.hecke_pflanzen",
        ]),
        ("anlegen", "Rasen und Beete anlegen", [
            "garten.rasen_neu", "garten.rollrasen", "garten.beet_anlegen",
        ]),
        ("wege", "Wege, Terrassen, Treppen", [
            "garten.pflaster", "garten.terrasse_holz", "garten.treppe_aussen",
        ]),
        ("grenzen", "Grenzen und Sichtschutz", [
            "garten.zaun", "garten.sichtschutz", "garten.mauer_gabione",
        ]),
        ("wasser", "Wasser im Boden", [
            "garten.drainage", "garten.bewaesserung", "garten.pool",
        ]),
    ],

    # Sanitär splits on whether something is broken now. A blocked WC and a
    # bathroom refit are not the same errand, and the customer on the phone
    # has already told you which one it is.
    "sanitaer": [
        ("verstopfung", "Verstopfung lösen", [
            "sanitaer.rohrreinigung_waschbecken", "sanitaer.rohrreinigung_wc",
        ]),
        ("leck", "Leck, Ausfall, Notdienst", [
            "sanitaer.rohrbruch", "sanitaer.spuelkasten",
            "sanitaer.notdienst_anfahrt",
        ]),
        ("geraet", "Einzelnes Gerät tauschen", [
            "sanitaer.wc_tauschen", "sanitaer.waschtisch", "sanitaer.armatur",
            "sanitaer.duschkabine", "sanitaer.badewanne_tausch",
            "sanitaer.waschmaschinenanschluss", "sanitaer.boiler",
        ]),
        ("waerme", "Wärme und Warmwasser", [
            "sanitaer.therme_tausch", "sanitaer.therme_wartung",
        ]),
        ("bad", "Bad und Leitungen erneuern", [
            "sanitaer.wanne_zu_dusche", "sanitaer.bad_basis",
            "sanitaer.bad_komplett", "sanitaer.steigleitung",
        ]),
        ("pruefen", "Prüfen und dokumentieren", [
            "sanitaer.dichtheitspruefung", "sanitaer.kamerabefahrung",
        ]),
    ],

    # Elektrik splits on scale: one point on an existing installation, or the
    # installation itself. The first is an hour with a bag of tools, the
    # second wants the power off and a certificate at the end.
    "elektrik": [
        ("dosen", "Steckdosen und Schalter", [
            "elektrik.steckdose", "elektrik.schalter_tauschen",
            "elektrik.aussensteckdose", "elektrik.datendose",
        ]),
        ("licht", "Licht und Geräteanschlüsse", [
            "elektrik.leuchte_montieren", "elektrik.rauchmelder",
            "elektrik.herdanschluss", "elektrik.smarthome",
        ]),
        ("leitungen", "Leitungen und Verteiler", [
            "elektrik.leitung_verlegen", "elektrik.verteiler_klein",
            "elektrik.verteiler", "elektrik.wohnung_neuinstallation",
        ]),
        ("nachruesten", "Nachrüsten", [
            "elektrik.wallbox", "elektrik.gegensprechanlage",
        ]),
        ("pruefen", "Prüfen und Störungssuche", [
            "elektrik.stoerungssuche", "elektrik.e_befund",
            "elektrik.geraetepruefung",
        ]),
    ],

    # Fliesen is a sequence and nothing else: what is there comes off, the
    # substrate is sealed, tiles go on, joints get finished. No zone — the
    # sections already say everything a band round them would.
    "fliesen": [
        ("vorbereiten", "Entfernen und abdichten", [
            "fliesen.entfernen_duennbett", "fliesen.entfernen_dickbett",
            "fliesen.abdichtung",
        ]),
        ("verlegen", "Verlegen", [
            "fliesen.verlegen_boden", "fliesen.verlegen_wand",
            "fliesen.grossformat", "fliesen.mosaik",
        ]),
        ("sonder", "Treppen, Terrassen, Sockel", [
            "fliesen.treppe", "fliesen.terrasse", "fliesen.sockelleisten",
        ]),
        ("reparatur", "Fugen und Reparatur", [
            "fliesen.fugen_sanieren", "fliesen.silikonfugen",
            "fliesen.einzelne_ersetzen",
        ]),
    ],

    # Montage is grouped by what is being fitted. There is no sequence to
    # follow and no second axis, so no zone.
    "montage": [
        ("moebel", "Möbel und Einrichtung", [
            "montage.kueche", "montage.moebel", "montage.regal",
            "montage.tv_wandhalterung",
        ]),
        ("tueren", "Türen und Schlösser", [
            "montage.innentuer", "montage.schliesszylinder",
            # Not `montage.tueroeffnung`. Three templates carry a key from a
            # neighbouring trade — this one, `steinmetz.fensterbank` under
            # maurer and `glaser.scheibe` under fenster — so the key prefix
            # cannot be assumed to be the trade. Placing it by the name it
            # looks like it should have is how it goes missing from the screen.
            "schluessel.tueroeffnung",
        ]),
        ("fenster", "Fenster und Beschattung", [
            "montage.fliegengitter", "montage.markise", "montage.rollladen",
        ]),
        ("regie", "Nach Aufwand", [
            "montage.stunde",
        ]),
    ],

    # Reinigung is indoors or it is the building. Nine templates is few enough
    # that one group per zone is the whole layout.
    "reinigung": [
        ("innen", "Wohnung, Büro, Innenräume", [
            "reinigung.grundreinigung", "reinigung.bauendreinigung",
            "reinigung.unterhalt_buero", "reinigung.polster",
            "reinigung.schaedlinge",
        ]),
        ("gebaeude", "Gebäude und Außenflächen", [
            "reinigung.fenster", "reinigung.hausbetreuung",
            "reinigung.graffiti", "reinigung.tiefgarage",
        ]),
    ],
}

# The heading each section gets in the other three languages. German is in
# SECTIONS above because that is the catalogue's own language; these are the
# translations the interface needs. Keyed by section key, which is unique
# only within a trade — hence the trade prefix.
SECTION_LABELS: dict[str, dict[str, str]] = {
    "maler.vorbereiten": {"en": "Preparing", "tr": "Hazırlamak", "es": "Preparar"},
    "maler.streichen": {"en": "Painting", "tr": "Boyamak", "es": "Pintar"},
    "maler.wandbelag": {"en": "Wallpapering and plastering",
                        "tr": "Duvar kağıdı ve sıva", "es": "Empapelar y revocar"},
    "maler.lackieren": {"en": "Lacquering", "tr": "Lake boyamak", "es": "Lacar"},
    "maler.sanieren": {"en": "Remediating and coating",
                       "tr": "Onarmak ve kaplamak", "es": "Sanear y revestir"},
    "maler.fassade": {"en": "Painting and insulating the façade",
                      "tr": "Cepheyi boyamak ve yalıtmak",
                      "es": "Pintar y aislar la fachada"},

    "garten.pflege_flaechen": {"en": "Mowing and clearing",
                               "tr": "Biçme ve temizleme", "es": "Segar y despejar"},
    "garten.schneiden": {"en": "Cutting back", "tr": "Budama", "es": "Podar"},
    "garten.baeume": {"en": "Trees and shrubs", "tr": "Ağaç ve çalılar",
                      "es": "Árboles y arbustos"},
    "garten.anlegen": {"en": "New lawn and beds", "tr": "Yeni çim ve tarhlar",
                       "es": "Césped y parterres nuevos"},
    "garten.wege": {"en": "Paths, terraces, steps", "tr": "Yol, teras, merdiven",
                    "es": "Caminos, terrazas, escaleras"},
    "garten.grenzen": {"en": "Boundaries and screening",
                       "tr": "Sınır ve perde", "es": "Límites y protección visual"},
    "garten.wasser": {"en": "Water below ground", "tr": "Yer altı suyu işleri",
                      "es": "Agua bajo tierra"},

    "sanitaer.verstopfung": {"en": "Clearing a blockage", "tr": "Tıkanıklık açma",
                             "es": "Desatascar"},
    "sanitaer.leck": {"en": "Leaks, failures, callouts",
                      "tr": "Sızıntı, arıza, acil çağrı",
                      "es": "Fugas, averías, urgencias"},
    "sanitaer.geraet": {"en": "Replacing one fixture", "tr": "Tek cihaz değişimi",
                        "es": "Sustituir un aparato"},
    "sanitaer.waerme": {"en": "Heat and hot water", "tr": "Isı ve sıcak su",
                        "es": "Calefacción y agua caliente"},
    "sanitaer.bad": {"en": "Renewing a bathroom or pipework",
                     "tr": "Banyo ve tesisat yenileme",
                     "es": "Renovar baño o instalación"},
    "sanitaer.pruefen": {"en": "Testing and certifying",
                         "tr": "Kontrol ve belgeleme",
                         "es": "Comprobar y certificar"},

    "elektrik.dosen": {"en": "Sockets and switches", "tr": "Priz ve anahtarlar",
                       "es": "Enchufes e interruptores"},
    "elektrik.licht": {"en": "Lights and appliance points",
                       "tr": "Aydınlatma ve cihaz bağlantıları",
                       "es": "Luces y tomas de aparatos"},
    "elektrik.leitungen": {"en": "Cabling and boards", "tr": "Tesisat ve panolar",
                           "es": "Cableado y cuadros"},
    "elektrik.nachruesten": {"en": "Retrofitting", "tr": "Sonradan ekleme",
                             "es": "Instalar después"},
    "elektrik.pruefen": {"en": "Testing and fault-finding",
                         "tr": "Test ve arıza arama", "es": "Pruebas y averías"},

    "fliesen.vorbereiten": {"en": "Removing and sealing",
                            "tr": "Sökme ve su yalıtımı", "es": "Retirar e impermeabilizar"},
    "fliesen.verlegen": {"en": "Laying", "tr": "Döşeme", "es": "Colocación"},
    "fliesen.sonder": {"en": "Stairs, terraces, skirting",
                       "tr": "Merdiven, teras, süpürgelik",
                       "es": "Escaleras, terrazas, rodapiés"},
    "fliesen.reparatur": {"en": "Grout and repairs", "tr": "Derz ve onarım",
                          "es": "Juntas y reparación"},

    "montage.moebel": {"en": "Furniture and fittings", "tr": "Mobilya ve donanım",
                       "es": "Muebles y equipamiento"},
    "montage.tueren": {"en": "Doors and locks", "tr": "Kapı ve kilitler",
                       "es": "Puertas y cerraduras"},
    "montage.fenster": {"en": "Windows and shading", "tr": "Pencere ve gölgeleme",
                        "es": "Ventanas y protección solar"},
    "montage.regie": {"en": "By the hour", "tr": "Saat başı", "es": "Por horas"},

    "reinigung.innen": {"en": "Homes, offices, interiors",
                        "tr": "Ev, ofis, iç mekanlar",
                        "es": "Viviendas, oficinas, interiores"},
    "reinigung.gebaeude": {"en": "Buildings and outdoor areas",
                           "tr": "Bina ve dış alanlar", "es": "Edificios y exteriores"},
}

# One line under a section heading naming what is in it, because a heading on
# its own ("Sanieren und beschichten") does not say which two templates that
# is. German included here rather than in SECTIONS: SECTIONS is the placement,
# this is prose, and keeping all four languages of one sentence together is
# what stops three of them being updated and the fourth not.
#
# A section without an entry renders without a subtitle.
SECTION_SUBS: dict[str, dict[str, str]] = {
    "maler.vorbereiten": {
        "de": "Entfernen, spachteln, Risse schließen",
        "en": "Stripping, filling, closing cracks",
        "tr": "Sökme, macunlama, çatlak kapatma",
        "es": "Retirar, alisar, sellar fisuras"},
    "maler.streichen": {
        "de": "Wände und Decken", "en": "Walls and ceilings",
        "tr": "Duvar ve tavan", "es": "Paredes y techos"},
    "maler.wandbelag": {
        "de": "Wandbeläge innen", "en": "Indoor wall coverings",
        "tr": "İç mekan duvar kaplamaları", "es": "Revestimientos interiores"},
    "maler.lackieren": {
        "de": "Türen, Heizkörper, Fenster", "en": "Doors, radiators, windows",
        "tr": "Kapı, radyatör, pencere", "es": "Puertas, radiadores, ventanas"},
    "maler.sanieren": {
        "de": "Schimmel, Boden", "en": "Mould, floors",
        "tr": "Küf, zemin", "es": "Moho, suelos"},
    "maler.fassade": {
        "de": "Alles an der Außenhülle", "en": "Everything on the building envelope",
        "tr": "Bina kabuğundaki her şey", "es": "Todo en la envolvente del edificio"},

    "garten.pflege_flaechen": {
        "de": "Pro Einsatz oder pro Saison", "en": "Per visit or per season",
        "tr": "Sefer başına veya sezonluk", "es": "Por visita o por temporada"},
    "garten.schneiden": {
        "de": "Hecke und Baumkrone", "en": "Hedges and tree crowns",
        "tr": "Çit ve ağaç tacı", "es": "Setos y copas"},
    "garten.baeume": {
        "de": "Fällen, pflanzen, Krone", "en": "Felling, planting, crown work",
        "tr": "Kesme, dikme, taç bakımı", "es": "Talar, plantar, copa"},
    "garten.anlegen": {
        "de": "Saat, Rollrasen, Bepflanzung", "en": "Seed, turf, planting",
        "tr": "Tohum, hazır çim, bitkilendirme", "es": "Siembra, tepe, plantación"},
    "garten.wege": {
        "de": "Befestigte Flächen", "en": "Hard landscaping",
        "tr": "Sert zeminler", "es": "Superficies pavimentadas"},
    "garten.grenzen": {
        "de": "Zaun, Wand, Sichtschutz", "en": "Fences, walls, screens",
        "tr": "Çit, duvar, perde", "es": "Vallas, muros, pantallas"},
    "garten.wasser": {
        "de": "Was unter der Oberfläche liegt", "en": "What sits below the surface",
        "tr": "Yüzeyin altında kalanlar", "es": "Lo que va bajo la superficie"},

    "sanitaer.verstopfung": {
        "de": "Abfluss läuft nicht ab", "en": "The drain will not run",
        "tr": "Gider akmıyor", "es": "El desagüe no evacua"},
    "sanitaer.leck": {
        "de": "Wasser, wo keines sein soll", "en": "Water where none should be",
        "tr": "Olmaması gereken yerde su", "es": "Agua donde no debe haberla"},
    "sanitaer.geraet": {
        "de": "Ein Stück raus, eines rein", "en": "One out, one in",
        "tr": "Biri çıkar, biri girer", "es": "Uno fuera, otro dentro"},
    "sanitaer.waerme": {
        "de": "Therme und Speicher", "en": "Boilers and cylinders",
        "tr": "Kombi ve boyler", "es": "Calderas y acumuladores"},
    "sanitaer.bad": {
        "de": "Mehrere Tage Baustelle", "en": "Several days on site",
        "tr": "Birkaç günlük şantiye", "es": "Varios días de obra"},
    "sanitaer.pruefen": {
        "de": "Mit Protokoll", "en": "With a written report",
        "tr": "Raporlu", "es": "Con acta escrita"},

    "elektrik.dosen": {
        "de": "Am Bestand, pro Stück", "en": "On an existing installation, per piece",
        "tr": "Mevcut tesisatta, adet başına", "es": "Sobre instalación existente, por pieza"},
    "elektrik.licht": {
        "de": "Anschließen und montieren", "en": "Connecting and mounting",
        "tr": "Bağlama ve montaj", "es": "Conectar y montar"},
    "elektrik.leitungen": {
        "de": "Strom aus, Wand auf", "en": "Power off, wall open",
        "tr": "Elektrik kesik, duvar açık", "es": "Sin corriente, pared abierta"},
    "elektrik.nachruesten": {
        "de": "Was vorher nicht da war", "en": "What was not there before",
        "tr": "Önceden olmayanlar", "es": "Lo que antes no estaba"},
    "elektrik.pruefen": {
        "de": "Messen, suchen, befunden", "en": "Measuring, tracing, certifying",
        "tr": "Ölçme, arama, belgeleme", "es": "Medir, localizar, certificar"},

    "fliesen.vorbereiten": {
        "de": "Bevor die erste Fliese liegt", "en": "Before the first tile goes down",
        "tr": "İlk karo döşenmeden önce", "es": "Antes de la primera baldosa"},
    "fliesen.verlegen": {
        "de": "Boden und Wand", "en": "Floor and wall",
        "tr": "Zemin ve duvar", "es": "Suelo y pared"},
    "fliesen.sonder": {
        "de": "Zuschnitt und Detailarbeit", "en": "Cutting and detail work",
        "tr": "Kesim ve detay işi", "es": "Corte y trabajo de detalle"},
    "fliesen.reparatur": {
        "de": "Am bestehenden Belag", "en": "On tiling that is already there",
        "tr": "Mevcut kaplamada", "es": "Sobre el alicatado existente"},

    "montage.moebel": {
        "de": "Möbel werden beigestellt", "en": "Furniture supplied by the customer",
        "tr": "Mobilya müşteri tarafından sağlanır",
        "es": "Los muebles los aporta el cliente"},
    "montage.tueren": {
        "de": "Montieren, tauschen, öffnen", "en": "Fitting, swapping, opening",
        "tr": "Montaj, değişim, açma", "es": "Montar, cambiar, abrir"},
    "montage.fenster": {
        "de": "Am und ums Fenster", "en": "On and around the window",
        "tr": "Pencerede ve çevresinde", "es": "En la ventana y su entorno"},
    "montage.regie": {
        "de": "Wenn keine Vorlage passt", "en": "When no template fits",
        "tr": "Hiçbir şablon uymadığında", "es": "Cuando ninguna plantilla encaja"},

    "reinigung.innen": {
        "de": "Bewohnte und genutzte Räume", "en": "Lived-in and working rooms",
        "tr": "Oturulan ve kullanılan mekanlar", "es": "Espacios habitados y en uso"},
    "reinigung.gebaeude": {
        "de": "Außenhaut und Gemeinschaftsflächen",
        "en": "Building envelope and common areas",
        "tr": "Bina kabuğu ve ortak alanlar",
        "es": "Envolvente y zonas comunes"},
}

# ── Zones ───────────────────────────────────────────────────────────────
#
# The band above the sections, one colour each. Listed in the order the zones
# appear, with the section keys they contain — which must be contiguous in
# SECTIONS, because a zone drawn twice down the page is two bands of one
# colour and colour that repeats says nothing about where you are.
#
# A trade absent from here returns `zone: None` on every section and renders
# as a plain list of headings.
ZONES: dict[str, list[tuple[str, dict[str, str], list[str]]]] = {
    # Where the work happens. Note what is *not* here: a third zone for
    # Sanierung. Schimmelsanierung Innenwand and Bodenbeschichtung Garage oder
    # Keller are both indoor work, so they sit in Innen — a colour of their own
    # would have invented a place that does not exist.
    "maler": [
        ("innen", {"de": "Innen", "en": "Indoors",
                   "tr": "İç mekan", "es": "Interior"},
         ["vorbereiten", "streichen", "wandbelag", "lackieren", "sanieren"]),
        ("aussen", {"de": "Außen", "en": "Outdoors",
                    "tr": "Dış mekan", "es": "Exterior"},
         ["fassade"]),
    ],
    # How the work is sold. Everything a gardener does is outdoors, so
    # indoors/outdoors would be one band round the whole list; recurring
    # against one-off is the split that actually changes the quote.
    "garten": [
        ("pflege", {"de": "Regelmäßige Pflege", "en": "Regular upkeep",
                    "tr": "Düzenli bakım", "es": "Mantenimiento periódico"},
         ["pflege_flaechen", "schneiden"]),
        ("projekt", {"de": "Anlegen und bauen", "en": "Landscaping and building",
                     "tr": "Peyzaj ve yapım", "es": "Crear y construir"},
         ["baeume", "anlegen", "wege", "grenzen", "wasser"]),
    ],
    # Whether something is broken now. Störung comes first because that is the
    # call you are on the phone to when you open this.
    "sanitaer": [
        ("stoerung", {"de": "Störung", "en": "Something is broken",
                      "tr": "Arıza", "es": "Avería"},
         ["verstopfung", "leck"]),
        ("geplant", {"de": "Geplante Arbeiten", "en": "Planned work",
                     "tr": "Planlı işler", "es": "Trabajos planificados"},
         ["geraet", "waerme", "bad", "pruefen"]),
    ],
    # Scale. One point on an existing installation is a different job from
    # opening up the installation itself.
    "elektrik": [
        ("punkte", {"de": "Einzelne Punkte", "en": "Single points",
                    "tr": "Tekil noktalar", "es": "Puntos sueltos"},
         ["dosen", "licht"]),
        ("anlage", {"de": "Anlage und Prüfung", "en": "Installation and testing",
                    "tr": "Tesisat ve kontrol", "es": "Instalación y pruebas"},
         ["leitungen", "nachruesten", "pruefen"]),
    ],
    "reinigung": [
        ("innen", {"de": "Innen", "en": "Indoors",
                   "tr": "İç mekan", "es": "Interior"}, ["innen"]),
        ("aussen", {"de": "Gebäude und Außen", "en": "Building and outdoors",
                    "tr": "Bina ve dış mekan", "es": "Edificio y exterior"},
         ["gebaeude"]),
    ],
}

# Templates that honestly belong in two groups, and are shown in both.
#
# The bar for an entry here is that filing it in one place only would make it
# hard to find from the other, *and* that both readings describe the same work
# — not that two headings could each be argued for. Six entries across seven
# trades; if this list grows much past that, the grouping above is wrong and
# duplicating templates is hiding it.
#
# `{job key: [extra section keys]}`. The job stays in its SECTIONS home and is
# additionally shown in each section named here.
CROSS_LISTED: dict[str, dict[str, list[str]]] = {
    "maler": {
        # Lacquer work billed per piece, and the weather side of the building.
        "maler.holzfenster_streichen": ["fassade"],
        # Remediation in its own right, and the thing that has to happen
        # before a wall can be painted at all.
        "maler.schimmelsanierung": ["vorbereiten"],
    },
    "garten": {
        # Crown work is routine care on a maintained garden and part of the
        # decision when a tree is coming out.
        "garten.baumschnitt": ["baeume"],
    },
    "sanitaer": {
        # A cylinder is one more fixture to swap, and it is what makes the hot
        # water — somebody quoting a heating job looks for it there.
        "sanitaer.boiler": ["waerme"],
        # A service visit is planned maintenance and a documented one.
        "sanitaer.therme_wartung": ["pruefen"],
        # A camera survey is a report with a protocol, and it is how a
        # blockage that will not clear gets found.
        "sanitaer.kamerabefahrung": ["verstopfung"],
    },
    "elektrik": {
        # Smart switches are a point on the wall and a retrofit.
        "elektrik.smarthome": ["nachruesten"],
    },
    "reinigung": {
        # A window has two sides and is cleaned from both.
        "reinigung.fenster": ["innen"],
    },
}


def sections_for(trade: str, job_keys: list[str]) -> list[dict] | None:
    """The section layout for one trade, or None when a flat list is right.

    `job_keys` is what the catalogue actually holds for this trade. Anything
    listed here but absent from the catalogue is dropped silently — a
    template can be retired. Anything in the catalogue but *not* placed in a
    section lands in a trailing "Weitere" bucket rather than disappearing,
    because a template nobody can reach is worse than an untidy heading.

    A key may appear in more than one section, via CROSS_LISTED. Each section
    that shows a cross-listed key also carries, in `cross`, the keys of the
    *other* sections it appears in, so the interface can say so on the card.
    Only section keys are returned, not labels: the caller already has every
    section's label in all four languages and resolving it there is what keeps
    the notice translated without this function knowing about languages.

    `total` is the number of distinct templates, which is not the number of
    rows once anything is cross-listed. A heading that counted placements
    would tell a painter there are twenty-one templates when there are
    nineteen.
    """
    scheme = SECTIONS.get(trade)
    if not scheme:
        return None

    # Which zone each section belongs to, flattened from ZONES so the lookup
    # below is a dict access rather than a scan.
    zone_of = {sec: (zkey, labels)
               for zkey, labels, secs in ZONES.get(trade, [])
               for sec in secs}

    cross = CROSS_LISTED.get(trade, {})
    have = set(job_keys)
    home = {k: skey for skey, _, keys in scheme for k in keys}

    # Every section a cross-listed key ends up in: its home plus its extras.
    # Built before the loop because a section needs to name the *other* places
    # a key appears, including ones later in the list.
    appears: dict[str, list[str]] = {}
    for k, extra in cross.items():
        if k in have and k in home:
            appears[k] = [home[k], *extra]

    # Where a section has to show keys that are not its own.
    extra_in: dict[str, list[str]] = {}
    for k, secs in appears.items():
        for skey in secs[1:]:
            extra_in.setdefault(skey, []).append(k)

    out: list[dict] = []
    placed: set[str] = set()
    for key, heading, keys in scheme:
        present = [k for k in keys if k in have]
        placed.update(present)
        # Cross-listed arrivals go last in the section, after what lives there.
        borrowed = [k for k in extra_in.get(key, []) if k in have]
        rows = present + borrowed
        if not rows:
            continue
        zkey, zlabels = zone_of.get(key, (None, {}))
        subs = SECTION_SUBS.get(f"{trade}.{key}", {})
        out.append({"key": key, "label_de": heading,
                    "labels": SECTION_LABELS.get(f"{trade}.{key}", {}),
                    "sub_de": subs.get("de", ""),
                    "subs": {k: v for k, v in subs.items() if k != "de"},
                    "zone": zkey,
                    "zone_label_de": zlabels.get("de", ""),
                    "zone_labels": {k: v for k, v in zlabels.items() if k != "de"},
                    "cross": {k: [s for s in appears[k] if s != key]
                              for k in rows if k in appears},
                    "job_keys": rows})

    leftover = [k for k in job_keys if k not in placed]
    if leftover:
        # No zone: a template nobody placed cannot be claimed to be indoors.
        out.append({"key": "weitere", "label_de": "Weitere",
                    "labels": {"en": "More", "tr": "Diğer", "es": "Otros"},
                    "sub_de": "", "subs": {},
                    "zone": None, "zone_label_de": "", "zone_labels": {},
                    "cross": {}, "job_keys": leftover})
    return out


# ── Field help ──────────────────────────────────────────────────────────
#
# One sentence per question key, in the catalogue's own language. Shown under
# the field.
#
# A line here must describe what the estimator *does*, not what the question
# sounds like it should do. Only `qty`, `condition`, `access` and the Notdienst
# flag reach the total; every `affects="variant"` question is recorded and may
# attach a note, and the arithmetic does not read it — the estimator's own
# docstring says so. Measured on maler.innenanstrich: all five Untergrund
# options move the price by € 0 while Zustand moves it by up to €307. Wording
# that implies otherwise is how a pro ends up quoting a crumbling wall at the
# intact-wall price.
#
# Only the keys that appear often enough to be worth the words. `access` and
# `condition` alone account for 129 of the 417 questions in the catalogue —
# and they are the two that actually move the price, which is exactly what
# nobody can tell from looking at the form.
#
# A key with no entry renders no help line. That is the intended fallback,
# not a gap to be filled with something vague.

FIELD_HELP: dict[str, str] = {
    # `condition` and `access` are not here. They carry their own German help
    # from the axis that supplies their labels, so the sentence and the options
    # it explains cannot drift apart — see AXIS_HELP_I18N below.

    # Quantity, the largest lever of all.
    "flaeche": "Der größte Hebel im Preis. Grob geschätzt ist besser als leer.",
    "anzahl": "Der größte Hebel im Preis.",
    "laenge": "Der größte Hebel im Preis.",
    "wohnflaeche": "Der größte Hebel im Preis.",
    "stufen": "Der größte Hebel im Preis.",
    "parteien": "Der größte Hebel im Preis.",
    "stromkreise": "Bestimmt, wie viel Verteilerplatz und Leitung nötig ist.",
    "entfernung": "Je weiter, desto mehr Leitung und Grabarbeit.",

    # Common variant questions: they pick different work, not a surcharge.
    "untergrund": "Der größte Hebel nach der Menge. Leimfarbe, altes Holz oder Bestandsfliesen kosten eine Vorarbeit, die jetzt im Preis steht.",
    "untergrund_boden": "Alter Beton braucht einen Schleifgang mehr, eine Altbeschichtung muss ganz herunter — beides ist eingerechnet.",
    "untergrund_aussen": "Kreidender Putz braucht eine festigende Grundierung. Der Aufschlag steckt im Preis.",
    "verlegung": "Vollflächig verklebt ist deutlich mehr Arbeit und mehr Material als lose verlegt. Beides ist eingerechnet.",
    "verlegeart": "Diagonal und Muster heißen mehr Schnitte und mehr Verschnitt. Beides ist eingerechnet.",
    "material": "Ändert den Materialanteil der Schätzung — Naturstein und Glas liegen deutlich über der Standardausführung.",
    "typ": "Ändert die Arbeitszeit: ein Rippenheizkörper hat ein Vielfaches der Fläche eines Flachheizkörpers.",
    "umfang": "Bestimmt, wie viel der Fläche wirklich angefasst wird.",
    "groesse": "Der größte Hebel im Preis.",
    "hoehe": "Mehr Höhe heißt mehr Material, mehr Zeit und ein anderer Zugang. Eingerechnet.",
    "raum": "Bad und Außenbereich brauchen Abdichtung bzw. Frostsicherheit und mehr Zuschnitt um Einbauten.",
    "zeit": "Abends, nachts und am Wochenende gilt der Notdiensttarif.",
    "leitungen": "Unbekannte Erdleitungen heißen vorsichtiger graben. Der Zuschlag ist enthalten; Stemmen und Verputzen sind es nicht.",

    # Recorded only: these produce a note on the quote, not a surcharge.
    "baujahr": "Vor 1990 kann Asbest im Spiel sein — dann kommt ein Hinweis ins Angebot.",
    "belag_bauseits": "Beigestelltes Material wird nicht berechnet, aber auch nicht gewährleistet.",
    "moebel": "Voll möbliert heißt räumen, abdecken und täglich wieder aufräumen — jetzt im Preis, und im Angebot vermerkt.",
    "fussbodenheizung": "Erzeugt einen Hinweis im Angebot — der Preis ändert sich nicht.",
    "geruest": "Wird vermerkt. Ein Gerüst wird gesondert angeboten.",
    "altanlage": "Eine klassische Nullung ohne Schutzleiter bedeutet Mehrarbeit an jedem Punkt. Eingerechnet.",
    "tueren_kuerzen": "Erzeugt einen Hinweis im Angebot — der Preis ändert sich nicht.",
    "absperrventil": "Ohne funktionierendes Ventil kommt das Abstellen des Strangs dazu.",
    "feuchte": "Aufsteigende Feuchte verlangt eine Sperrgrundierung — Arbeit und Material sind enthalten.",
    "fi_vorhanden": "Ohne FI entspricht die Anlage nicht dem Stand der Technik. Kommt als Hinweis ins Angebot.",
    "platz": "Ohne Platz im Verteiler wird ein größerer nötig — das wird gesondert angeboten.",
    "verteiler_platz": "Ohne Platz im Verteiler wird ein größerer nötig — das wird gesondert angeboten.",
}

# The same lines in the other three languages. Keyed identically.
FIELD_HELP_I18N: dict[str, dict[str, str]] = {
    "flaeche": {
        "en": "The biggest lever on the price. A rough figure beats an empty field.",
        "tr": "Fiyattaki en büyük etken. Kaba bir tahmin boş bırakmaktan iyidir.",
        "es": "La mayor palanca del precio. Una cifra aproximada es mejor que dejarlo vacío.",
    },
    "anzahl": {"en": "The biggest lever on the price.", "tr": "Fiyattaki en büyük etken.",
               "es": "La mayor palanca del precio."},
    "laenge": {"en": "The biggest lever on the price.", "tr": "Fiyattaki en büyük etken.",
               "es": "La mayor palanca del precio."},
    "wohnflaeche": {"en": "The biggest lever on the price.", "tr": "Fiyattaki en büyük etken.",
                    "es": "La mayor palanca del precio."},
    "stufen": {"en": "The biggest lever on the price.", "tr": "Fiyattaki en büyük etken.",
               "es": "La mayor palanca del precio."},
    "parteien": {"en": "The biggest lever on the price.", "tr": "Fiyattaki en büyük etken.",
                 "es": "La mayor palanca del precio."},
    "stromkreise": {"en": "Sets how much board space and cable is needed.",
                    "tr": "Ne kadar pano yeri ve kablo gerektiğini belirler.",
                    "es": "Determina cuánto espacio de cuadro y cable hace falta."},
    "entfernung": {"en": "The further it runs, the more cable and digging.",
                   "tr": "Mesafe arttıkça kablo ve kazı artar.",
                   "es": "Cuanto más lejos, más cable y más zanja."},
    "untergrund": {
        "en": "The biggest lever after quantity. Distemper, old timber or existing tiles each cost preparation, and that is now in the price.",
        "tr": "Miktardan sonraki en büyük etken. Tutkal boya, eski ahşap veya mevcut fayans hazırlık gerektirir; artık fiyatta.",
        "es": "La mayor palanca tras la cantidad. La pintura al temple, la madera vieja o el alicatado existente exigen preparación, y ahora está en el precio.",
    },
    "untergrund_boden": {
        "en": "Old concrete needs another grinding pass and an existing coating has to come off entirely. Both are priced.",
        "tr": "Eski beton bir tur daha zımpara, mevcut kaplama ise tamamen sökülmek ister. İkisi de hesapta.",
        "es": "El hormigón viejo pide otra pasada de lijado y un revestimiento existente hay que retirarlo entero. Ambos están calculados.",
    },
    "untergrund_aussen": {
        "en": "Chalking render needs a consolidating primer. The surcharge is in the price.",
        "tr": "Tebeşirlenen sıva sağlamlaştırıcı astar ister. Farkı fiyatta.",
        "es": "El revoco pulverulento necesita una imprimación consolidante. El recargo está en el precio.",
    },
    "verlegung": {
        "en": "Fully bonded is considerably more work and more material than loose-laid. Both are priced.",
        "tr": "Tam yapıştırma, serbest sermeye göre belirgin biçimde daha fazla işçilik ve malzeme. İkisi de hesapta.",
        "es": "Encolado a toda superficie es bastante más trabajo y material que colocado suelto. Ambos están calculados.",
    },
    "verlegeart": {
        "en": "Diagonal and patterned laying mean more cuts and more waste. Both are priced.",
        "tr": "Diyagonal ve desenli döşeme daha çok kesim ve fire demek. İkisi de hesapta.",
        "es": "En diagonal y con dibujo hay más cortes y más merma. Ambos están calculados.",
    },
    "material": {"en": "Changes the material share — natural stone and glass sit well above the standard option.",
                "tr": "Malzeme payını değiştirir — doğal taş ve cam standardın belirgin üstünde.",
                "es": "Cambia la parte de material: la piedra natural y el vidrio están muy por encima del estándar."},
    "typ": {"en": "Changes the labour: a ribbed radiator has several times the surface of a flat panel.",
           "tr": "İşçiliği değiştirir: dilimli radyatörün yüzeyi panelin kat kat fazlası.",
           "es": "Cambia la mano de obra: un radiador de elementos tiene varias veces la superficie de uno de panel."},
    "umfang": {"en": "Decides how much of the area is actually touched.",
              "tr": "Alanın ne kadarına gerçekten dokunulduğunu belirler.",
              "es": "Decide cuánta superficie se toca realmente."},
    "groesse": {"en": "The biggest lever on the price.", "tr": "Fiyattaki en büyük etken.",
                "es": "La mayor palanca del precio."},
    "hoehe": {"en": "More height means more material, more time and a different way up. Priced.",
             "tr": "Daha fazla yükseklik: daha çok malzeme, daha çok süre, farklı erişim. Hesapta.",
             "es": "Más altura significa más material, más tiempo y otro acceso. Calculado."},
    "raum": {"en": "Bathrooms and outdoor areas need sealing or frost detailing and more cutting around fittings.",
            "tr": "Banyo ve dış alan yalıtım ya da dona dayanıklılık ve daha çok kesim ister.",
            "es": "Baños y exteriores exigen impermeabilización o resistencia a heladas y más cortes alrededor de los aparatos."},
    "zeit": {"en": "Evenings, nights and weekends are charged at the callout rate.",
             "tr": "Akşam, gece ve hafta sonu acil tarifesi geçerlidir.",
             "es": "Tardes, noches y fines de semana van a tarifa de urgencia."},
    "leitungen": {"en": "Unknown buried services mean digging carefully. That is priced; chasing and making good are not.",
                 "tr": "Bilinmeyen yeraltı hatları dikkatli kazı demek. Bu hesapta; kırım ve sıva değil.",
                 "es": "Conducciones enterradas desconocidas obligan a excavar con cuidado. Eso está calculado; rozar y repasar no."},
    "baujahr": {"en": "Before 1990 asbestos is possible — that puts a note on the quote.",
                "tr": "1990 öncesinde asbest olabilir — teklife bir not eklenir.",
                "es": "Antes de 1990 puede haber amianto: se añade un aviso al presupuesto."},
    "belag_bauseits": {"en": "Supplied material is not charged — and not warranted either.",
                       "tr": "Müşterinin verdiği malzeme ücretlendirilmez, garanti de edilmez.",
                       "es": "El material aportado no se cobra — ni se garantiza."},
    "moebel": {"en": "Fully furnished means clearing, covering and tidying again every day — now in the price, and noted on the quote.",
              "tr": "Tam eşyalı: boşaltma, örtme ve her gün yeniden toplama — artık fiyatta ve teklifte belirtiliyor.",
              "es": "Totalmente amueblado significa despejar, cubrir y volver a recoger cada día: ahora en el precio y anotado en la oferta."},
    "fussbodenheizung": {"en": "Adds a note to the quote — the price does not change.",
                         "tr": "Teklife not ekler — fiyat değişmez.",
                         "es": "Añade un aviso al presupuesto; el precio no cambia."},
    "geruest": {"en": "Noted. Scaffolding is quoted separately.",
                "tr": "Not edilir. İskele ayrıca teklif edilir.",
                "es": "Se anota. El andamio se presupuesta aparte."},
    "altanlage": {"en": "A classic unearthed installation means extra work at every point. Priced.",
                 "tr": "Topraklamasız klasik tesisat her noktada ek iş demek. Hesapta.",
                 "es": "Una instalación clásica sin toma de tierra da trabajo extra en cada punto. Calculado."},
    "tueren_kuerzen": {"en": "Adds a note to the quote — the price does not change.",
                       "tr": "Teklife not ekler — fiyat değişmez.",
                       "es": "Añade un aviso al presupuesto; el precio no cambia."},
    "absperrventil": {"en": "Without a working valve, shutting off the riser is added.",
                      "tr": "Çalışan vana yoksa kolonun kapatılması eklenir.",
                      "es": "Sin llave de corte funcional se añade cerrar el montante."},
    "feuchte": {"en": "Rising damp calls for a barrier primer — labour and material are included.",
               "tr": "Yükselen nem bariyer astarı ister — işçilik ve malzeme dahil.",
               "es": "La humedad por capilaridad exige una imprimación barrera: mano de obra y material incluidos."},
    "fi_vorhanden": {"en": "Without an RCD the installation is not to current standard. Noted on the quote.",
                     "tr": "Kaçak akım rölesi yoksa tesisat güncel standarda uygun değildir. Teklife not edilir.",
                     "es": "Sin diferencial la instalación no cumple la norma actual. Se anota."},
    "platz": {"en": "Without room in the board a larger one is needed — quoted separately.",
              "tr": "Panoda yer yoksa daha büyüğü gerekir — ayrıca teklif edilir.",
              "es": "Sin espacio en el cuadro hace falta uno mayor: se presupuesta aparte."},
    "verteiler_platz": {"en": "Without room in the board a larger one is needed — quoted separately.",
                        "tr": "Panoda yer yoksa daha büyüğü gerekir — ayrıca teklif edilir.",
                        "es": "Sin espacio en el cuadro hace falta uno mayor: se presupuesta aparte."},
}

# What `affects` means, in words. The estimator already classifies every
# answer this way; the screen has never said so, which is why a form with two
# priced answers and three recorded ones looks like five priced ones.
#
# `qty`, `condition` and `access` reach the total. `variant` selects which
# operations are priced — it changes the work, so it changes the money too,
# but through a different door. `note` reaches only the wording of the quote.
PRICE_EFFECT = {
    "qty": "amount",
    "condition": "surcharge",
    "access": "surcharge",
    "variant": "scope",
    "note": "note",
}

# `affects="qty"` on a question does not mean that question is the quantity.
# A cable run in lfm on a job priced per Stk is declared `qty` and measured at
# a € 0 effect — the estimator has one quantity axis and `survey()` flags which
# question owns it. These lines are used for the others, whose default help
# (`laenge`: "der größte Hebel im Preis") would be the same overclaim the
# variant fields made before.
FIELD_HELP_NOT_QTY: dict[str, str] = {
    "de": "Wird vermerkt. Bei dieser Vorlage ist das nicht die Menge — der Preis ändert sich dadurch nicht.",
    "en": "Noted. On this template this is not the quantity — it does not change the price.",
    "tr": "Not edilir. Bu şablonda miktar bu değildir — fiyatı değiştirmez.",
    "es": "Se anota. En esta plantilla no es la cantidad: no cambia el precio.",
}

# The help under the quantity field that `survey()` builds itself. It carries
# the job's unit and typical size, so it cannot live in the key-based table
# above; the estimator hands over the pieces and the sentence is assembled per
# language here, rather than shipping a German line to an English screen.
QTY_HELP: dict[str, dict[str, str]] = {
    "typical": {
        "de": "Typisch {lo}–{hi} {unit}",
        "en": "Unknown buried services mean digging carefully. That is priced; chasing and making good are not.",
        "tr": "Bilinmeyen yeraltı hatları dikkatli kazı demek. Bu hesapta; kırım ve sıva değil.",
        "es": "Conducciones enterradas desconocidas obligan a excavar con cuidado. Eso está calculado; rozar y repasar no.",
    },
    "whole": {
        "de": "Preis gilt je {unit}",
        "en": "The price is per {unit}",
        "tr": "Fiyat her {unit} için geçerlidir",
        "es": "El precio es por {unit}",
    },
    "whole_range": {
        "de": "Preis gilt je {unit}, typisch {lo}–{hi}",
        "en": "The price is per {unit}, typically {lo}–{hi}",
        "tr": "Fiyat her {unit} için geçerlidir, tipik olarak {lo}–{hi}",
        "es": "El precio es por {unit}, normalmente {lo}–{hi}",
    },
}


# ── Axis help ───────────────────────────────────────────────────────────
#
# `condition` and `access` no longer have one help line between them. They are
# asked in whichever vocabulary the job's trade uses — see
# `tools/catalogue/axes.py` — and the sentence under the field has to describe
# that vocabulary, not the building one. Keyed `question.axis`, which is what
# `survey()` stamps on the question.
#
# German lives in the axis itself, next to the option labels it explains, so
# the two cannot drift apart. Only the translations are here.

AXIS_HELP_I18N: dict[str, dict[str, str]] = {
    "condition.bewuchs": {
        "en": "The longer it has been left, the more cuttings there are and the "
              "slower the machine goes.",
        "tr": "Ne kadar uzun süre yapılmadıysa, o kadar çok kesim atığı olur ve "
              "makine o kadar yavaşlar.",
        "es": "Cuanto más tiempo lleve sin hacerse, más restos de corte hay y "
              "más despacio va la máquina.",
    },
    "condition.raeumflaeche": {
        "en": "Whatever the machine cannot reach is shovelled and gritted by hand.",
        "tr": "Makinenin ulaşamadığı yerler elle küreklenir ve tuzlanır.",
        "es": "Lo que no alcanza la máquina se palea y se esparce a mano.",
    },
    "condition.gebaeude": {
        "en": "Occupied costs more than empty: covering up, tidying every day.",
        "tr": "Oturulan yer boş olandan pahalıdır: örtme, her gün toplama.",
        "es": "Ocupado cuesta más que vacío: cubrir y recoger cada día.",
    },
    "condition.wohnung": {
        "en": "Occupied means coordinating, covering up, and shutting the water off only briefly.",
        "tr": "Oturulan yer: koordinasyon, örtme ve suyu yalnızca kısa süre kapatma.",
        "es": "Ocupado implica coordinar, cubrir y cortar el agua solo un momento.",
    },
    "condition.flaeche": {
        "en": "Whatever is standing on the ground has to come off first — that is the time.",
        "tr": "Zeminde ne varsa önce kaldırılmalı — zaman oradan gider.",
        "es": "Lo que haya sobre el terreno hay que quitarlo primero: ahí está el tiempo.",
    },
    "condition.umfeld": {
        "en": "What has to be protected around the work costs time before and after it.",
        "tr": "Çevrede korunması gerekenler, işten önce ve sonra zaman ister.",
        "es": "Lo que hay que proteger alrededor cuesta tiempo antes y después.",
    },
    "condition.fahrzeug": {
        "en": "Seized bolts and corrosion are what eat the hours.",
        "tr": "Sıkışmış cıvatalar ve korozyon saatleri yer.",
        "es": "Los tornillos agarrotados y la corrosión son los que comen horas.",
    },
    "condition.verschmutzung": {
        "en": "The biggest lever in cleaning: one pass or three.",
        "tr": "Temizlikteki en büyük etken: bir kez mi, üç kez mi.",
        "es": "La mayor palanca en limpieza: una pasada o tres.",
    },
    "condition.moebel": {
        "en": "What has to be renewed under the cover decides the hours.",
        "tr": "Kılıfın altında nelerin yenileneceği saatleri belirler.",
        "es": "Lo que haya que renovar bajo la tapicería decide las horas.",
    },
    "access.gebaeude": {
        "en": "Without a lift, carrying time is added — a narrow staircase, considerably more.",
        "tr": "Asansör yoksa taşıma süresi eklenir — dar merdivende çok daha fazla.",
        "es": "Sin ascensor se añade tiempo de acarreo; por escalera estrecha, bastante más.",
    },
    "access.grundstueck": {
        "en": "Whether the machine reaches the area decides the hours.",
        "tr": "Makinenin alana ulaşıp ulaşmaması saatleri belirler.",
        "es": "Que la máquina llegue a la zona decide las horas.",
    },
    "access.hoehe": {
        "en": "How the working height is reached. Scaffold and platform are quoted separately.",
        "tr": "Çalışma yüksekliğine nasıl çıkılacağı. İskele ve platform ayrı teklif edilir.",
        "es": "Cómo se alcanza la altura de trabajo. Andamio y plataforma se ofertan aparte.",
    },
    "access.werkstatt": {
        "en": "On site there is no lift and no tool wall — that costs time.",
        "tr": "Sahada lift ve alet duvarı yoktur — bu zaman demektir.",
        "es": "A domicilio no hay elevador ni panel de herramientas: eso cuesta tiempo.",
    },
}


def decorate_question(q: dict, lang: str = "de") -> dict:
    """Add the help line, the price-effect class and the label in `lang`.

    `label_de` and the option labels stay on the response untouched. The
    translated forms are added beside them as `label` and `options_labels`,
    because a quote already sent quotes the German and a screen re-rendering it
    in another language must still be able to show what was agreed.
    """
    out = dict(q)
    key = q.get("key")
    if q.get("axis"):
        key = f"{key}.{q['axis']}"
    out["label"] = catalogue_i18n.translate(q.get("label_de") or "", lang)
    out["options"] = [[v, catalogue_i18n.translate(lbl, lang)]
                      for v, lbl in (q.get("options") or [])]
    fmt = q.get("help_fmt")
    if fmt and fmt.get("id") in QTY_HELP:
        table = QTY_HELP[fmt["id"]]
        out["help"] = (table.get(lang) or table["de"]).format(**fmt.get("args", {}))
        out["help_de"] = table["de"].format(**fmt.get("args", {}))
    elif q.get("affects") == "qty" and not q.get("is_quantity"):
        out["help"] = FIELD_HELP_NOT_QTY.get(lang) or FIELD_HELP_NOT_QTY["de"]
        out["help_de"] = FIELD_HELP_NOT_QTY["de"]
    else:
        if not out.get("help_de"):
            out["help_de"] = FIELD_HELP.get(key, "")
        if lang != "de":
            table = AXIS_HELP_I18N.get(key) or FIELD_HELP_I18N.get(key) or {}
            out["help"] = table.get(lang) or out.get("help_de") or ""
        else:
            out["help"] = out.get("help_de") or ""
    # Derived from what the question *does*, not from what it is declared to
    # be. `affects` says which kind of thing an answer is — a quantity, a
    # variant of the work, a note — and for a long time "variant" and "note"
    # both meant "changes nothing". Now most of them carry an uplift or remove
    # an operation, and a screen that went on labelling those as notes would
    # be making exactly the old promise in reverse: telling a pro that the tap
    # which just added 40 % to the quote was only for the record.
    effect = PRICE_EFFECT.get(q.get("affects"), "note")
    if effect in ("note", "scope") and (q.get("uplift") or q.get("material_uplift")
                                        or q.get("drops") or q.get("drops_disposal")):
        effect = "scope"
    elif effect == "scope":
        effect = "note"
    out["price_effect"] = effect
    return out


# The bullet that opens each assumption on a quote. German uses "•" and so does
# every other language here; it is punctuation, not a word.
_BULLET = "• "

# When an operation is split into labour and material, the estimator writes the
# material half as "<operation> — Material". That composite string is in no
# table and never will be: it is one per operation, and the half that varies is
# already translated. Split it, translate both ends, rejoin.
_MATERIAL_SUFFIX = " — Material"


def _line_text(description: str, lang: str) -> str:
    t = catalogue_i18n.translate
    if description.endswith(_MATERIAL_SUFFIX):
        base = description[: -len(_MATERIAL_SUFFIX)]
        return f"{t(base, lang)} — {t('Material', lang)}"
    return t(description, lang)


def localise_estimate(est: dict, lang: str = "de") -> dict:
    """The same estimate with its German surfaces rendered in `lang`.

    The estimator works in one language on purpose: it is the language the
    catalogue is written in, and an arithmetic layer that had to pick a
    language would be a layer that could get the price wrong by getting the
    locale wrong. Translation belongs here, at the edge, where nothing is
    computed from the text.

    German is never thrown away. Every translated field is added *beside* the
    German one — `description` next to `description_de`, `text` next to
    `text_de` — because a quote is a document about what was agreed, and the
    words that were agreed were German. A screen showing an English rendering
    of a sent quote still has to be able to produce the original.

    Returns a new dict. `est` is often the row that gets stored, and mutating
    it here would persist a translation into the record of a German quote.
    """
    if lang == "de" or lang not in catalogue_i18n.LANGS:
        return est
    t = catalogue_i18n.translate

    out = dict(est)
    job = est.get("job")
    if job:
        out["job"] = {**job, "label": t(job.get("label_de") or "", lang)}

    out["lines"] = [{**ln,
                     "description_de": ln.get("description"),
                     "description": _line_text(ln.get("description") or "", lang)}
                    for ln in est.get("lines") or []]

    # Not a line — a sentence on the debris panel. Translated all the same:
    # "3 m³ Mulde" sitting under an English heading is the kind of half-language
    # screen the whole exercise is meant to remove.
    if est.get("container"):
        out["container_de"] = est["container"]
        out["container"] = t(est["container"], lang)

    notes = [{**n, "text": t(n.get("text_de") or "", lang)}
             for n in est.get("notes") or []]
    out["notes"] = notes
    # Rebuilt rather than translated as a block: `assumptions` is the notes
    # joined, and translating the joined string would look for a table entry
    # that is six paragraphs long and find nothing.
    out["assumptions"] = "\n".join(_BULLET + n["text"] for n in notes)
    return out
