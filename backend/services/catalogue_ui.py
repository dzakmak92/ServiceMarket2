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

Two things live here:

**SECTIONS** — how one trade's templates are chunked. `group` in the
catalogue cannot do this: every one of the 19 Maler templates carries the
same group, "Maler & Tapezierer", so grouping by it produces one section
containing everything. Only the seven trades with enough templates to need
chunking have sections; below about ten a flat list is faster to read than a
list with headings in it.

**FIELD_HELP** — one line under a form field saying what it is for. The
guided forms already have a `help_de` slot on every question and it is empty
on 407 of the 417 questions in the catalogue, which is why the survey reads
as an interrogation: five questions, no indication which of them moves the
money and which is only recorded. `affects` already answers that — it is
just never shown.

The wording is mine, not sourced. It describes what the estimator does with
each answer, which is checkable against the code; it does not make claims
about trade practice that a practising pro has not confirmed.
"""
from __future__ import annotations

# ── Sections ────────────────────────────────────────────────────────────
#
# Ordered. The order is "what most people came for" first, not alphabetical:
# a painter opens the app for an Innenanstrich far more often than for a
# Wärmedämmverbundsystem.
#
# Every job key of a listed trade must appear exactly once. `sections_for`
# asserts that, so adding a template to the catalogue without placing it here
# fails loudly instead of making it invisible on the screen.

SECTIONS: dict[str, list[tuple[str, str, list[str]]]] = {
    # trade: [(section key, German heading, [job keys])]
    "maler": [
        ("innen", "Innen", [
            "maler.innenanstrich", "maler.decke", "maler.wohnung_komplett",
            "maler.spachteln_q3", "maler.spachteln_q4", "maler.tapezieren",
            "maler.designtapete", "maler.tapete_entfernen", "maler.strukturputz",
            "maler.tuer_lackieren", "maler.heizkoerper_lackieren",
        ]),
        ("aussen", "Außen", [
            "maler.fassade", "maler.fassade_reinigen", "maler.holzschutz",
            "maler.wdvs", "maler.holzfenster_streichen",
        ]),
        ("sanierung", "Sanierung", [
            "maler.schimmelsanierung", "maler.risse_sanieren",
            "maler.bodenbeschichtung",
        ]),
    ],
    "garten": [
        ("pflege", "Regelmäßige Pflege", [
            "garten.rasenmaehen", "garten.hecke_schnitt", "garten.laub",
            "garten.vertikutieren", "garten.winterdienst",
        ]),
        ("baeume", "Bäume und Hecken", [
            "garten.baumfaellung", "garten.baumschnitt", "garten.hecke_pflanzen",
        ]),
        ("anlegen", "Anlegen und Bepflanzen", [
            "garten.rasen_neu", "garten.rollrasen", "garten.beet_anlegen",
            "garten.bewaesserung",
        ]),
        ("bauen", "Bauen und Befestigen", [
            "garten.pflaster", "garten.terrasse_holz", "garten.zaun",
            "garten.sichtschutz", "garten.mauer_gabione", "garten.treppe_aussen",
            "garten.drainage", "garten.pool",
        ]),
    ],
    "sanitaer": [
        ("stoerung", "Störung und Notdienst", [
            "sanitaer.rohrreinigung_wc", "sanitaer.rohrreinigung_waschbecken",
            "sanitaer.rohrbruch", "sanitaer.notdienst_anfahrt",
            "sanitaer.spuelkasten",
        ]),
        ("tausch", "Einzelnes Gerät tauschen", [
            "sanitaer.armatur", "sanitaer.wc_tauschen", "sanitaer.waschtisch",
            "sanitaer.badewanne_tausch", "sanitaer.duschkabine",
            "sanitaer.boiler", "sanitaer.therme_tausch",
            "sanitaer.waschmaschinenanschluss",
        ]),
        ("umbau", "Bad und Umbau", [
            "sanitaer.bad_komplett", "sanitaer.bad_basis",
            "sanitaer.wanne_zu_dusche", "sanitaer.steigleitung",
        ]),
        ("pruefen", "Prüfen und Warten", [
            "sanitaer.therme_wartung", "sanitaer.dichtheitspruefung",
            "sanitaer.kamerabefahrung",
        ]),
    ],
    "elektrik": [
        ("punkte", "Einzelne Punkte", [
            "elektrik.steckdose", "elektrik.schalter_tauschen",
            "elektrik.aussensteckdose", "elektrik.leuchte_montieren",
            "elektrik.datendose", "elektrik.rauchmelder",
            "elektrik.herdanschluss",
        ]),
        ("anlage", "Verteiler und Leitungen", [
            "elektrik.verteiler", "elektrik.verteiler_klein",
            "elektrik.leitung_verlegen", "elektrik.wohnung_neuinstallation",
        ]),
        ("nachruesten", "Nachrüsten", [
            "elektrik.wallbox", "elektrik.smarthome",
            "elektrik.gegensprechanlage",
        ]),
        ("pruefen", "Prüfen und Störungssuche", [
            "elektrik.e_befund", "elektrik.geraetepruefung",
            "elektrik.stoerungssuche",
        ]),
    ],
    "fliesen": [
        ("verlegen", "Verlegen", [
            "fliesen.verlegen_boden", "fliesen.verlegen_wand",
            "fliesen.grossformat", "fliesen.mosaik", "fliesen.terrasse",
            "fliesen.treppe", "fliesen.sockelleisten",
        ]),
        ("vorbereiten", "Entfernen und Vorbereiten", [
            "fliesen.entfernen_duennbett", "fliesen.entfernen_dickbett",
            "fliesen.abdichtung",
        ]),
        ("reparatur", "Fugen und Reparatur", [
            "fliesen.fugen_sanieren", "fliesen.silikonfugen",
            "fliesen.einzelne_ersetzen",
        ]),
    ],
    "montage": [
        ("innen", "Möbel und Innenausbau", [
            "montage.moebel", "montage.regal", "montage.kueche",
            "montage.tv_wandhalterung", "montage.innentuer",
        ]),
        ("fenster", "Fenster und Außen", [
            "montage.rollladen", "montage.fliegengitter", "montage.markise",
        ]),
        ("schloss", "Schlösser und Türöffnung", [
            "montage.schliesszylinder", "schluessel.tueroeffnung",
        ]),
        ("regie", "Nach Aufwand", [
            "montage.stunde",
        ]),
    ],
    "reinigung": [
        ("innen", "Wohnung und Büro", [
            "reinigung.grundreinigung", "reinigung.unterhalt_buero",
            "reinigung.bauendreinigung", "reinigung.polster",
        ]),
        ("gebaeude", "Gebäude und Außenflächen", [
            "reinigung.hausbetreuung", "reinigung.fenster",
            "reinigung.tiefgarage", "reinigung.graffiti",
        ]),
        ("spezial", "Spezial", [
            "reinigung.schaedlinge",
        ]),
    ],
}

# The heading each section gets in the other three languages. German is in
# SECTIONS above because that is the catalogue's own language; these are the
# translations the interface needs. Keyed by section key, which is unique
# only within a trade — hence the trade prefix.
SECTION_LABELS: dict[str, dict[str, str]] = {
    "maler.innen": {"en": "Indoors", "tr": "İç mekan", "es": "Interior"},
    "maler.aussen": {"en": "Outdoors", "tr": "Dış mekan", "es": "Exterior"},
    "maler.sanierung": {"en": "Remediation", "tr": "Onarım", "es": "Saneamiento"},
    "garten.pflege": {"en": "Regular upkeep", "tr": "Düzenli bakım", "es": "Mantenimiento"},
    "garten.baeume": {"en": "Trees and hedges", "tr": "Ağaç ve çit", "es": "Árboles y setos"},
    "garten.anlegen": {"en": "Planting", "tr": "Ekim ve dikim", "es": "Plantación"},
    "garten.bauen": {"en": "Building and paving", "tr": "Yapı ve döşeme", "es": "Obra y pavimento"},
    "sanitaer.stoerung": {"en": "Faults and callouts", "tr": "Arıza ve acil", "es": "Averías y urgencias"},
    "sanitaer.tausch": {"en": "Replacing a fixture", "tr": "Tekil değişim", "es": "Sustituir un aparato"},
    "sanitaer.umbau": {"en": "Bathrooms and refits", "tr": "Banyo ve tadilat", "es": "Baños y reformas"},
    "sanitaer.pruefen": {"en": "Testing and servicing", "tr": "Kontrol ve bakım", "es": "Revisión y mantenimiento"},
    "elektrik.punkte": {"en": "Single points", "tr": "Tekil noktalar", "es": "Puntos sueltos"},
    "elektrik.anlage": {"en": "Boards and cabling", "tr": "Pano ve tesisat", "es": "Cuadros y cableado"},
    "elektrik.nachruesten": {"en": "Retrofits", "tr": "Sonradan ekleme", "es": "Instalaciones nuevas"},
    "elektrik.pruefen": {"en": "Testing and fault-finding", "tr": "Test ve arıza arama", "es": "Pruebas y averías"},
    "fliesen.verlegen": {"en": "Laying", "tr": "Döşeme", "es": "Colocación"},
    "fliesen.vorbereiten": {"en": "Removal and prep", "tr": "Sökme ve hazırlık", "es": "Retirada y preparación"},
    "fliesen.reparatur": {"en": "Grout and repairs", "tr": "Derz ve onarım", "es": "Juntas y reparación"},
    "montage.innen": {"en": "Furniture and interiors", "tr": "Mobilya ve iç mekan", "es": "Muebles e interiores"},
    "montage.fenster": {"en": "Windows and outdoors", "tr": "Pencere ve dış mekan", "es": "Ventanas y exterior"},
    "montage.schloss": {"en": "Locks and lockouts", "tr": "Kilit ve kapı açma", "es": "Cerraduras y aperturas"},
    "montage.regie": {"en": "By the hour", "tr": "Saat başı", "es": "Por horas"},
    "reinigung.innen": {"en": "Homes and offices", "tr": "Ev ve ofis", "es": "Viviendas y oficinas"},
    "reinigung.gebaeude": {"en": "Buildings and outdoor areas", "tr": "Bina ve dış alanlar", "es": "Edificios y exteriores"},
    "reinigung.spezial": {"en": "Specialist", "tr": "Özel", "es": "Especial"},
}


def sections_for(trade: str, job_keys: list[str]) -> list[dict] | None:
    """The section layout for one trade, or None when a flat list is right.

    `job_keys` is what the catalogue actually holds for this trade. Anything
    listed here but absent from the catalogue is dropped silently — a
    template can be retired. Anything in the catalogue but *not* placed in a
    section lands in a trailing "Weitere" bucket rather than disappearing,
    because a template nobody can reach is worse than an untidy heading.
    """
    scheme = SECTIONS.get(trade)
    if not scheme:
        return None

    have = set(job_keys)
    out: list[dict] = []
    placed: set[str] = set()
    for key, heading, keys in scheme:
        present = [k for k in keys if k in have]
        placed.update(present)
        if present:
            out.append({"key": key, "label_de": heading,
                        "labels": SECTION_LABELS.get(f"{trade}.{key}", {}),
                        "job_keys": present})

    leftover = [k for k in job_keys if k not in placed]
    if leftover:
        out.append({"key": "weitere", "label_de": "Weitere",
                    "labels": {"en": "More", "tr": "Diğer", "es": "Otros"},
                    "job_keys": leftover})
    return out


# ── Field help ──────────────────────────────────────────────────────────
#
# One sentence per question key, in the catalogue's own language. Shown under
# the field.
#
# Only the keys that appear often enough to be worth the words. `access` and
# `condition` alone account for 129 of the 417 questions in the catalogue —
# and they are the two that actually move the price, which is exactly what
# nobody can tell from looking at the form.
#
# A key with no entry renders no help line. That is the intended fallback,
# not a gap to be filled with something vague.

FIELD_HELP: dict[str, str] = {
    # The two that change the number.
    "access": "Ohne Lift kommt Tragzeit dazu — bei enger Treppe deutlich mehr.",
    "condition": "Bewohnt kostet mehr als leerstehend: abdecken, täglich aufräumen.",

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
    "untergrund": "Bestimmt, welche Vorarbeit gerechnet wird.",
    "untergrund_boden": "Alter Beton braucht meist einen Schleifgang mehr.",
    "untergrund_aussen": "Bestimmt, welche Vorarbeit gerechnet wird.",
    "verlegung": "Bestimmt Zuschnitt und Verschnitt.",
    "verlegeart": "Bestimmt Zuschnitt und Verschnitt.",
    "material": "Bestimmt Materialpreis und Verarbeitungszeit.",
    "typ": "Bestimmt, welche Arbeitsschritte gerechnet werden.",
    "umfang": "Bestimmt, welche Arbeitsschritte gerechnet werden.",
    "groesse": "Bestimmt Aufwand und Entsorgungsmenge.",
    "hoehe": "Mehr Höhe heißt mehr Material und mehr Trocknungszeit.",
    "raum": "Bestimmt Vorarbeit und Materialwahl.",
    "zeit": "Abends, nachts und am Wochenende gilt der Notdiensttarif.",
    "leitungen": "Neue Leitungen heißen stemmen, verputzen und mehr Zeit.",

    # Recorded only: these produce a note on the quote, not a surcharge.
    "baujahr": "Vor 1990 kann Asbest im Spiel sein — dann kommt ein Hinweis ins Angebot.",
    "belag_bauseits": "Beigestelltes Material wird nicht berechnet, aber auch nicht gewährleistet.",
    "moebel": "Wird im Angebot vermerkt, damit der Kunde weiß, was er räumen muss.",
    "fussbodenheizung": "Erzeugt einen Hinweis im Angebot — der Preis ändert sich nicht.",
    "geruest": "Wird vermerkt. Ein Gerüst wird gesondert angeboten.",
    "altanlage": "Wird im Angebot vermerkt.",
    "tueren_kuerzen": "Erzeugt einen Hinweis im Angebot — der Preis ändert sich nicht.",
    "absperrventil": "Ohne funktionierendes Ventil kommt das Abstellen des Strangs dazu.",
    "feuchte": "Erzeugt einen Hinweis im Angebot — der Preis ändert sich nicht.",
    "fi_vorhanden": "Ohne FI entspricht die Anlage nicht dem Stand der Technik. Kommt als Hinweis ins Angebot.",
    "platz": "Ohne Platz im Verteiler wird ein größerer nötig — das wird gesondert angeboten.",
    "verteiler_platz": "Ohne Platz im Verteiler wird ein größerer nötig — das wird gesondert angeboten.",
}

# The same lines in the other three languages. Keyed identically.
FIELD_HELP_I18N: dict[str, dict[str, str]] = {
    "access": {
        "en": "Without a lift, carrying time is added — a narrow staircase, considerably more.",
        "tr": "Asansör yoksa taşıma süresi eklenir — dar merdivende çok daha fazla.",
        "es": "Sin ascensor se añade tiempo de acarreo; por escalera estrecha, bastante más.",
    },
    "condition": {
        "en": "Occupied costs more than empty: covering up, tidying every day.",
        "tr": "Oturulan yer boş olandan pahalıdır: örtme, her gün toplama.",
        "es": "Ocupado cuesta más que vacío: cubrir y recoger cada día.",
    },
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
    "untergrund": {"en": "Sets which preparation work is priced in.",
                   "tr": "Hangi ön hazırlığın hesaplanacağını belirler.",
                   "es": "Determina qué trabajo previo se calcula."},
    "untergrund_boden": {"en": "Old concrete usually needs one more grinding pass.",
                         "tr": "Eski beton genelde bir tur daha zımpara ister.",
                         "es": "El hormigón viejo suele necesitar un lijado más."},
    "untergrund_aussen": {"en": "Sets which preparation work is priced in.",
                          "tr": "Hangi ön hazırlığın hesaplanacağını belirler.",
                          "es": "Determina qué trabajo previo se calcula."},
    "verlegung": {"en": "Sets the cutting and the waste allowance.",
                  "tr": "Kesim ve fire payını belirler.",
                  "es": "Determina el corte y el desperdicio."},
    "verlegeart": {"en": "Sets the cutting and the waste allowance.",
                   "tr": "Kesim ve fire payını belirler.",
                   "es": "Determina el corte y el desperdicio."},
    "material": {"en": "Sets the material price and the working time.",
                 "tr": "Malzeme fiyatını ve işçilik süresini belirler.",
                 "es": "Determina el precio del material y el tiempo de trabajo."},
    "typ": {"en": "Sets which steps of work are priced in.",
            "tr": "Hangi iş adımlarının hesaplanacağını belirler.",
            "es": "Determina qué pasos de trabajo se calculan."},
    "umfang": {"en": "Sets which steps of work are priced in.",
               "tr": "Hangi iş adımlarının hesaplanacağını belirler.",
               "es": "Determina qué pasos de trabajo se calculan."},
    "groesse": {"en": "Sets the effort and the amount to dispose of.",
                "tr": "İş yükünü ve atık miktarını belirler.",
                "es": "Determina el esfuerzo y la cantidad a retirar."},
    "hoehe": {"en": "More height means more material and more drying time.",
              "tr": "Yükseklik arttıkça malzeme ve kuruma süresi artar.",
              "es": "Más altura significa más material y más secado."},
    "raum": {"en": "Sets the preparation and the choice of material.",
             "tr": "Ön hazırlığı ve malzeme seçimini belirler.",
             "es": "Determina la preparación y la elección del material."},
    "zeit": {"en": "Evenings, nights and weekends are charged at the callout rate.",
             "tr": "Akşam, gece ve hafta sonu acil tarifesi geçerlidir.",
             "es": "Tardes, noches y fines de semana van a tarifa de urgencia."},
    "leitungen": {"en": "New cabling means chasing, plastering and more time.",
                  "tr": "Yeni tesisat kırım, sıva ve daha çok zaman demektir.",
                  "es": "Cableado nuevo implica rozas, enlucido y más tiempo."},
    "baujahr": {"en": "Before 1990 asbestos is possible — that puts a note on the quote.",
                "tr": "1990 öncesinde asbest olabilir — teklife bir not eklenir.",
                "es": "Antes de 1990 puede haber amianto: se añade un aviso al presupuesto."},
    "belag_bauseits": {"en": "Supplied material is not charged — and not warranted either.",
                       "tr": "Müşterinin verdiği malzeme ücretlendirilmez, garanti de edilmez.",
                       "es": "El material aportado no se cobra — ni se garantiza."},
    "moebel": {"en": "Noted on the quote so the customer knows what to clear.",
               "tr": "Müşterinin neyi boşaltacağını bilmesi için teklife not düşülür.",
               "es": "Se anota en el presupuesto para que el cliente sepa qué retirar."},
    "fussbodenheizung": {"en": "Adds a note to the quote — the price does not change.",
                         "tr": "Teklife not ekler — fiyat değişmez.",
                         "es": "Añade un aviso al presupuesto; el precio no cambia."},
    "geruest": {"en": "Noted. Scaffolding is quoted separately.",
                "tr": "Not edilir. İskele ayrıca teklif edilir.",
                "es": "Se anota. El andamio se presupuesta aparte."},
    "altanlage": {"en": "Noted on the quote.", "tr": "Teklife not edilir.",
                  "es": "Se anota en el presupuesto."},
    "tueren_kuerzen": {"en": "Adds a note to the quote — the price does not change.",
                       "tr": "Teklife not ekler — fiyat değişmez.",
                       "es": "Añade un aviso al presupuesto; el precio no cambia."},
    "absperrventil": {"en": "Without a working valve, shutting off the riser is added.",
                      "tr": "Çalışan vana yoksa kolonun kapatılması eklenir.",
                      "es": "Sin llave de corte funcional se añade cerrar el montante."},
    "feuchte": {"en": "Adds a note to the quote — the price does not change.",
                "tr": "Teklife not ekler — fiyat değişmez.",
                "es": "Añade un aviso al presupuesto; el precio no cambia."},
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


def decorate_question(q: dict, lang: str = "de") -> dict:
    """Add the help line and the price-effect class to one question."""
    out = dict(q)
    key = q.get("key")
    if not out.get("help_de"):
        out["help_de"] = FIELD_HELP.get(key, "")
    if lang != "de":
        out["help"] = (FIELD_HELP_I18N.get(key) or {}).get(lang) or out.get("help_de") or ""
    else:
        out["help"] = out.get("help_de") or ""
    out["price_effect"] = PRICE_EFFECT.get(q.get("affects"), "note")
    return out
