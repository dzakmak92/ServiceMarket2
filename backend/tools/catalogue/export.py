import sys, json; sys.path.insert(0,'.')
from dataclasses import asdict
from alljobs import ALL_JOBS
from engine import estimate
from schema import COND_UPLIFT, COND_SETUP_ADD, ACCESS_UPLIFT, HOURLY, DISPOSAL_PER_T

JOBS = ALL_JOBS

# Site-visit necessity is DECLARED, not derived.
#
# The first version derived it from the hi/lo spread, which looked principled
# and was wrong. At 64 job types the spread turns out to measure what share of
# the price is variable labour, not how hidden the preconditions are: window
# cleaning topped the list at x4.35 because it is small and setup-dominated,
# while a boiler swap looked certain at x1.84 only because an 1,800-2,900 EUR
# appliance swamps the labour variance. Deriving the flag from it would have
# sent a tradesperson to inspect a window and quote a Wärmepumpe blind.
#
# These are the jobs where a precondition that cannot be seen from a photo or
# a phone call changes the scope materially: concealed build-up, concealed
# services, structural involvement, or a measurement that must be exact before
# anything is fabricated.
SITE_VISIT = {
    "fliesen.entfernen_duennbett", "fliesen.entfernen_dickbett",   # bed type unknown
    "abriss.estrich", "abriss.nichttragende_wand",                 # what is underneath
    "maurer.durchbruch", "maurer.wand_mauern",                     # structural
    "sanitaer.rohrbruch",                                          # leak location
    "elektrik.leitung_verlegen", "elektrik.verteiler",             # concealed services
    "maler.tapete_entfernen", "maler.fassade",                     # layers, substrate
    "dach.ziegel_umdecken", "dach.flachdach", "dach.rinne",        # substructure
    "fenster.tausch", "fenster.rolladen", "fenster.markise",       # Aufmaß, anchorage
    "glaser.scheibe", "steinmetz.fensterbank",                     # Aufmaß
    "tischler.einbauschrank", "tischler.innentuer",                # Aufmaß
    "kueche.montage", "kueche.demontage",                          # Anschlüsse, Aufmaß
    "heizung.waermepumpe", "heizung.fussbodenheizung",             # Heizlast, Aufbauhöhe
    "heizung.kaminofen",                                           # Rauchfang, Abstände
    "garten.pflaster", "garten.pool", "garten.zaun",               # Untergrund, Leitungen
    "solar.pv_dach",                                               # Dachstatik
    "polster.sofa",                                                # Gestellzustand
    "gutachter.bauschaden",                                        # the visit IS the job
    "umzug.wohnung", "umzug.entruempelung",                        # volume, access
}

# Kept as a separate signal with an honest name: how much of the price is
# variable labour rather than fixed material. High means the pro's own rate
# matters most, which is exactly where the feedback loop pays off.
LABOUR_VARIANCE_NOTE = ("share of price that is variable labour; high values "
                        "converge fastest once pro_rates has real data")

NOTES = {
  "asbest_vor_1990": {"severity":"critical","de":"Bei Bauteilen vor 1990 kann der Kleber bzw. Bodenbelag Asbest enthalten. Vor Abbruch ist eine Materialanalyse erforderlich; Arbeiten nach TRGS 519 sind nicht im Angebot enthalten."},
  "statik_nicht_tragend": {"severity":"critical","de":"Angebot gilt für nichttragende Bauteile. Die Tragfähigkeit ist bauseits bzw. durch einen Statiker zu bestätigen."},
  "e_befund": {"severity":"high","de":"Elektrobefund bzw. Anlagenprüfung nicht enthalten. Bestehende Leitungen werden als normgerecht angenommen."},
  "rauchfangkehrer": {"severity":"high","de":"Behördliche Abnahme und Rauchfangkehrer-Befund sind nicht enthalten."},
  "gasleitung_normgerecht": {"severity":"high","de":"Bestehende Gasleitung, Abgasführung und Elektroanschluss werden als normgerecht und weiterverwendbar angenommen."},
  "dickbett_mehraufwand": {"severity":"high","de":"Aufbau nicht einsehbar. Bei Dickbett-Verlegung entsteht Mehraufwand, der nach tatsächlichem Aufwand verrechnet wird."},
  "abdichtung_nassbereich": {"severity":"high","de":"Verbundabdichtung im Nassbereich nach ÖNORM B 3407 / DIN 18534 ist enthalten."},
  "untergrund_tragfaehig": {"severity":"medium","de":"Angebot gilt für tragfähigen, trockenen Untergrund. Risse, Schimmel oder nicht tragfähige Altanstriche sind nicht enthalten."},
  "untergrund_eben": {"severity":"medium","de":"Untergrund wird als eben und tragfähig angenommen. Ausgleichsarbeiten sind nicht enthalten."},
  "altbau_untergrund": {"severity":"medium","de":"Bei Altbauten ist der Untergrund oft nicht lot- und fluchtgerecht. Ausgleich nach Aufwand."},
  "geruest_nicht_enthalten": {"severity":"medium","de":"Gerüst ist nicht im Angebot enthalten und wird bauseits beigestellt."},
  "moebel_bauseits": {"severity":"low","de":"Möbel werden bauseits ausgeräumt bzw. mittig gestellt und abgedeckt."},
  "staub": {"severity":"low","de":"Staubschutz und tägliche Grobreinigung sind enthalten. Feinreinigung nicht enthalten."},
  "altgeraet_entsorgung": {"severity":"low","de":"Entsorgung des Altgeräts ist enthalten."},
  "witterung": {"severity":"low","de":"Ausführung witterungsabhängig; Verzögerungen begründen keinen Preisnachlass."},
  "verschnitt_muster": {"severity":"low","de":"Verschnitt ist mit dem angegebenen Prozentsatz kalkuliert. Diagonal- oder Musterverlegung erhöht den Verschnitt."},
  "dehnungsfuge": {"severity":"low","de":"Dehnungsfugen werden nach Herstellervorgabe ausgeführt."},
  "raumklima": {"severity":"low","de":"Raumklima 18-24 °C und 45-65 % rel. Luftfeuchte sind bauseits sicherzustellen."},
  "absperrventil": {"severity":"low","de":"Funktionsfähiges Absperrventil wird vorausgesetzt."},
  "folgeschaeden": {"severity":"medium","de":"Trocknung und Folgeschäden (Maler, Boden) sind nicht enthalten."},
  "oeffnung_wand": {"severity":"medium","de":"Öffnen und Verschließen von Wand bzw. Boden ist enthalten; Oberflächenwiederherstellung nicht."},
  "abtransport": {"severity":"low","de":"Abtransport und Deponiegebühren sind kalkuliert; Mulde bauseits stellplatzpflichtig."},

  # ── added with the wide build ────────────────────────────────────────
  "statik_pflicht": {"severity":"critical","de":"Eingriffe in tragende Bauteile erfordern eine statische Berechnung und Freigabe. Diese ist nicht im Angebot enthalten und muss vor Arbeitsbeginn vorliegen."},
  "statik_dach": {"severity":"critical","de":"Die Tragfähigkeit der Dachkonstruktion für die Zusatzlast ist vor Montage nachzuweisen."},
  "leitungen_im_boden": {"severity":"critical","de":"Vor Grabarbeiten sind Leitungspläne einzuholen. Schäden an nicht eingemessenen Leitungen sind nicht vom Angebot gedeckt."},
  "leitungsortung": {"severity":"high","de":"Vor dem Bohren wird eine Leitungsortung durchgeführt. Für nicht ortbare Altleitungen wird keine Haftung übernommen."},
  "brandschutz_abstand": {"severity":"high","de":"Die vorgeschriebenen Sicherheitsabstände zu brennbaren Bauteilen sind einzuhalten; bauseits zu prüfen."},
  "genehmigung_bau": {"severity":"high","de":"Baubehördliche Genehmigung ist bauseits einzuholen und nicht im Angebot enthalten."},
  "genehmigung_strasse": {"severity":"high","de":"Genehmigung für die Nutzung öffentlichen Grundes ist bauseits einzuholen."},
  "netzanmeldung": {"severity":"high","de":"Anmeldung beim Netzbetreiber und Zählertausch sind nicht im Angebot enthalten."},
  "heizlastberechnung": {"severity":"high","de":"Angebot basiert auf überschlägiger Auslegung. Eine Heizlastberechnung nach ÖNORM H 7500 / DIN EN 12831 wird empfohlen."},
  "geruest_erforderlich": {"severity":"high","de":"Für diese Arbeiten ist ein Gerüst erforderlich; es ist nicht im Angebot enthalten."},
  "aufmass_vor_fertigung": {"severity":"high","de":"Fertigung erst nach Aufmaß vor Ort. Maßabweichungen zum Plan können den Preis ändern."},
  "absturzsicherung_norm": {"severity":"high","de":"Ausführung nach ÖNORM B 5371 / DIN 18065 (Geländerhöhe, Öffnungsweiten)."},
  "windklasse": {"severity":"medium","de":"Markise ist für die angegebene Windklasse ausgelegt; bei Sturm einzufahren."},
  "hydraulischer_abgleich": {"severity":"medium","de":"Hydraulischer Abgleich ist nicht enthalten und wird gesondert angeboten."},
  "anlage_entleeren": {"severity":"medium","de":"Die Heizungsanlage muss für die Arbeiten entleert werden; Wiederbefüllung ist enthalten."},
  "estrich_folgt": {"severity":"medium","de":"Estricharbeiten sind nicht enthalten und erfolgen durch das Folgegewerk."},
  "aufbauhoehe": {"severity":"medium","de":"Die erforderliche Aufbauhöhe ist bauseits sicherzustellen; Türen sind ggf. zu kürzen."},
  "gefaelle": {"severity":"medium","de":"Ausreichendes Gefälle zur Entwässerung wird vorausgesetzt."},
  "entwaesserung": {"severity":"medium","de":"Entwässerung und Anschluss an den Kanal sind nicht enthalten."},
  "unterbau_tragfaehig": {"severity":"medium","de":"Angebot gilt für tragfähigen Untergrund. Bodenaustausch bei nicht tragfähigem Untergrund nach Aufwand."},
  "laibung_nacharbeit": {"severity":"medium","de":"Innen- und Außenlaibungen sind nachzuarbeiten; Malerarbeiten nicht enthalten."},
  "wand_lot": {"severity":"medium","de":"Wände werden als lot- und fluchtgerecht angenommen; Ausgleich nach Aufwand."},
  "anschluesse_vorhanden": {"severity":"medium","de":"Wasser-, Abwasser- und Elektroanschlüsse werden an geeigneter Position als vorhanden angenommen."},
  "stromanschluss_bauseits": {"severity":"medium","de":"Bauseitiger Stromanschluss an geeigneter Stelle wird vorausgesetzt."},
  "schallschutz": {"severity":"medium","de":"Einhaltung der Schallschutzgrenzwerte am Aufstellort ist zu prüfen."},
  "standzeit": {"severity":"medium","de":"Die Grundmiete umfasst vier Wochen Standzeit; darüber hinaus wird wochenweise verrechnet."},
  "grenzabstand": {"severity":"medium","de":"Grenzabstände und Zustimmung des Nachbarn sind bauseits zu klären."},
  "vogelschutz_zeitraum": {"severity":"medium","de":"Radikalschnitt ist zwischen 1. März und 30. September gesetzlich eingeschränkt."},
  "halteverbot": {"severity":"medium","de":"Halteverbotszonen sind bauseits zu beantragen; Kosten nicht enthalten."},
  "kein_lift": {"severity":"medium","de":"Tragen ohne Aufzug ist kalkuliert; ab dem 3. Obergeschoss entsteht Mehraufwand."},
  "versicherung": {"severity":"medium","de":"Transportversicherung deckt den gesetzlichen Rahmen; Höherwertversicherung auf Wunsch."},
  "wertgegenstaende": {"severity":"medium","de":"Wertgegenstände und persönliche Unterlagen sind vor Beginn zu entnehmen."},
  "raeumung_waehrend": {"severity":"medium","de":"Die Räume sind während der Behandlung und der Nachwirkzeit nicht zu betreten."},
  "nachkontrolle": {"severity":"medium","de":"Eine Nachkontrolle ist im Preis enthalten; weitere Behandlungen nach Aufwand."},
  "laborkosten_extra": {"severity":"medium","de":"Laboranalysen und Materialprüfungen werden gesondert verrechnet."},
  "unabhaengigkeit": {"severity":"medium","de":"Das Gutachten wird unabhängig erstellt; ein bestimmtes Ergebnis kann nicht zugesagt werden."},
  "transport_werkstatt": {"severity":"low","de":"Abholung und Rücklieferung in die Werkstatt sind enthalten."},
  "stoff_bauseits_moeglich": {"severity":"low","de":"Beistellung des Bezugsstoffs durch den Auftraggeber ist möglich; Materialanteil entfällt dann."},
  "montageanleitung_bauseits": {"severity":"low","de":"Montageanleitung und Beschläge sind bauseits beizustellen."},
  "schluessel_uebergabe": {"severity":"low","de":"Schlüsselübergabe ist zu vereinbaren; Schlüsselverwaltung nach Absprache."},
  "erreichbarkeit": {"severity":"low","de":"Angebot gilt für vom Boden bzw. Innenraum erreichbare Flächen."},
  "identitaetsnachweis": {"severity":"low","de":"Ein Identitäts- und Wohnsitznachweis ist vor der Öffnung vorzulegen."},
  "nacht_zuschlag": {"severity":"low","de":"Für Einsätze außerhalb der Geschäftszeiten gelten Zuschläge."},
  "regie_abrechnung": {"severity":"low","de":"Abrechnung nach tatsächlichem Aufwand; angefangene Viertelstunden werden gerundet."},
  "behoerdlich_vorgeschrieben": {"severity":"low","de":"Leistung ist behördlich vorgeschrieben; Intervalle richten sich nach der Landesverordnung."},
  "rdks_sensoren": {"severity":"low","de":"RDKS-Sensoren werden geprüft; Ersatz bei Defekt nach Aufwand."},
  "verschleissteile_extra": {"severity":"low","de":"Verschleißteile (Kette, Bremsbeläge, Züge) sind nicht enthalten."},
  "altoel_entsorgung": {"severity":"low","de":"Altölentsorgung ist im Preis enthalten."},
  "aw_modellabhaengig": {"severity":"medium","de":"Der tatsächliche Zeitaufwand ist modellabhängig und richtet sich nach den Herstellervorgaben (Arbeitswerte)."},
  "bewaesserung_bauseits": {"severity":"low","de":"Bewässerung in den ersten Wochen ist bauseits sicherzustellen; ohne sie keine Anwachsgarantie."},
  "altbau_leitungen": {"severity":"high","de":"In Altbauten sind Leitungen häufig nicht normgerecht verlegt. Notwendige Anpassungen werden nach Aufwand verrechnet."},
  "abschaltung": {"severity":"medium","de":"Zeitweise Abschaltung der Stromversorgung ist erforderlich."},
  "foerderung": {"severity":"low","de":"Förderungsabwicklung ist nicht enthalten."},
}

out = {"version": 1, "countries": ["AT","DE"],
       "modifiers": {"condition_uplift": COND_UPLIFT, "condition_setup_add": COND_SETUP_ADD,
                     "access_uplift": ACCESS_UPLIFT},
       "hourly_rates": HOURLY, "disposal_per_tonne": DISPOSAL_PER_T,
       "site_visit_required": sorted(SITE_VISIT),
       "labour_variance_note": LABOUR_VARIANCE_NOTE,
       "notes": NOTES, "jobs": []}

for j in JOBS:
    q = sum(j.typical_size)/2
    r = estimate(j, q, country="AT")
    spread = r["total"][1]/r["total"][0]
    small = estimate(j, j.typical_size[0], country="AT")
    large = estimate(j, j.typical_size[1]*2, country="AT")
    premium = ((small["per_unit"][0]+small["per_unit"][1])/2) / \
              ((large["per_unit"][0]+large["per_unit"][1])/2)
    out["jobs"].append({
        "key": j.key, "trade": j.trade, "label_de": j.label_de, "unit": j.unit,
        "setup_hours": j.setup_hours, "typical_size": j.typical_size,
        "market_band_at": j.market_band_at, "market_band_de": j.market_band_de,
        "band_basis": j.band_basis, "sources": j.sources,
        "confidence": j.confidence, "group": j.group, "segment": j.segment,
        "note_keys": j.note_keys,
        "labour_variance": round(spread, 2),
        "site_visit_required": j.key in SITE_VISIT,
        "quote_mode": "regie" if j.key in SITE_VISIT else "fixed",
        "small_job_premium": round(premium, 2),
        "operations": [{
            "key": o.key, "label_de": o.label_de, "unit": o.unit, "kind": o.kind,
            "hours_per_unit": o.hours_per_unit,
            "material_per_unit": o.material_per_unit,
            "waste_factor": o.waste_factor,
            "debris_kg_per_unit": o.debris_kg_per_unit,
            "debris_type": o.debris_type,
            "optional": o.optional, "tier_min": o.tier_min,
            "note_keys": o.note_keys,
        } for o in j.operations],
    })

import pathlib
pathlib.Path("catalogue.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
print("jobs:", len(out["jobs"]), "| notes:", len(NOTES))
regie=[j for j in out["jobs"] if j["site_visit_required"]]
conf={}
for j in out["jobs"]: conf[j["confidence"]]=conf.get(j["confidence"],0)+1
print(f"\nsite visit required: {len(regie)}/{len(out['jobs'])} "
      f"({100*len(regie)//len(out['jobs'])}%)")
print("confidence:", conf)
groups={}
for j in out["jobs"]: groups[j["group"]]=groups.get(j["group"],0)+1
print("groups covered:", len(groups))
