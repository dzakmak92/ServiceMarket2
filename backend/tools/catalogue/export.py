import sys, json; sys.path.insert(0,'.')
from dataclasses import asdict
from maler import MALER
from trades import ALL
from engine import estimate
from schema import COND_UPLIFT, COND_SETUP_ADD, ACCESS_UPLIFT, HOURLY, DISPOSAL_PER_T

JOBS = MALER + ALL

# Rule derived from the simulation: a job whose hi/lo spread exceeds this
# cannot honestly be quoted fixed-price without a site visit.
REGIE_THRESHOLD = 2.6

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
  "abschaltung": {"severity":"medium","de":"Zeitweise Abschaltung der Stromversorgung ist erforderlich."},
  "foerderung": {"severity":"low","de":"Förderungsabwicklung ist nicht enthalten."},
}

out = {"version": 1, "countries": ["AT","DE"],
       "modifiers": {"condition_uplift": COND_UPLIFT, "condition_setup_add": COND_SETUP_ADD,
                     "access_uplift": ACCESS_UPLIFT},
       "hourly_rates": HOURLY, "disposal_per_tonne": DISPOSAL_PER_T,
       "regie_threshold": REGIE_THRESHOLD, "notes": NOTES, "jobs": []}

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
        "note_keys": j.note_keys,
        "uncertainty_spread": round(spread, 2),
        "quote_mode": "regie" if spread > REGIE_THRESHOLD else "fixed",
        "small_job_premium": round(premium, 2),
        "operations": [{
            "key": o.key, "label_de": o.label_de, "unit": o.unit, "kind": o.kind,
            "hours_per_unit": o.hours_per_unit,
            "material_per_unit": o.material_per_unit,
            "waste_factor": o.waste_factor,
            "debris_kg_per_unit": o.debris_kg_per_unit,
            "optional": o.optional, "tier_min": o.tier_min,
            "note_keys": o.note_keys,
        } for o in j.operations],
    })

import pathlib
pathlib.Path("catalogue.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
print("jobs:", len(out["jobs"]), "| notes:", len(NOTES))
regie = [j["key"] for j in out["jobs"] if j["quote_mode"]=="regie"]
print(f"\nRULE: {len(regie)} of {len(out['jobs'])} job types exceed the {REGIE_THRESHOLD}x")
print("spread and must NOT be quoted fixed-price without a site visit:")
for k in regie: print("   ", k)
