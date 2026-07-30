"""Estimation catalogue and estimator — pure logic, no database.

Two things are being defended here.

The **catalogue's own claim**: every job type lands inside a published DE/AT
market band at its typical size. That is the property the coefficients were
built to satisfy, and it is worth nothing if it holds only in the authoring
harness and not in the code the API actually calls. So this runs the band check
through `services.estimator`, not through `tools/catalogue/engine.py`.

The **estimate's internal consistency**: the positions a pro sends must add up
to the total the app showed them. They diverged by 1,800 EUR on a 300 m² lawn
before the material carried by labour operations was given its own line.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import estimator as E  # noqa: E402

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


cat = E.catalogue()
JOBS = cat["jobs"]

print("── the catalogue loads and is the shape the code expects ──")
check(len(JOBS) >= 90, f"{len(JOBS)} job types")
check(len(cat["notes"]) >= 110, f"{len(cat['notes'])} notes")
check(all(cat["hourly_rates"][c] for c in ("AT", "DE")), "hourly rates for both countries")
check({j["trade"] for j in JOBS} <= set(cat["hourly_rates"]["AT"]),
      "every trade has an hourly rate")
check(all(n["severity"] in ("critical", "high", "medium", "low")
          for n in cat["notes"].values()), "every note has a known severity")
check(all(k in cat["notes"] for j in JOBS for k in j["note_keys"]),
      "no job references a note that does not exist")
check(all(v in cat["notes"] for j in JOBS for q in j["guided_form"]
          for v in (q.get("note_if") or {}).values()),
      "no note_if references a note that does not exist")

print("\n── every job lands inside its published market band ──")
band_fails = []
for j in JOBS:
    for country in ("AT", "DE"):
        band = j["market_band_at"] if country == "AT" else j["market_band_de"]
        if not band:
            continue
        # A "total" band is quoted per piece — one window, one WC — so it is
        # checked at qty 1. A per-unit band is a published average over a
        # typical job where the contractor's setup is already amortised, so it
        # is checked at the large end of typical.
        qty = 1.0 if j["band_basis"] == "total" else j["typical_size"][1]
        r = E.estimate(j["key"], {"qty": qty}, country=country)
        mid = sum(r["per_unit"]) / 2
        if not band[0] <= mid <= band[1]:
            band_fails.append(f"{j['key']} {country}: {mid:.0f} vs {band}")
# maler.fassade DE is the one documented miss: the German band includes
# scaffolding hire, which this catalogue prices as its own job type.
check(len(band_fails) <= 1, f"{len(band_fails)} band miss(es): {band_fails or 'none'}")

print("\n── the positions add up to the total ──")
sum_fails = []
for j in JOBS:
    qty = 1.0 if j["band_basis"] == "total" else j["typical_size"][1]
    r = E.estimate(j["key"], {"qty": qty})
    lo, hi = r["total_net"]
    if not lo * 0.97 <= r["lines_net"] <= hi * 1.03:
        sum_fails.append(f"{j['key']}: lines {r['lines_net']} vs {r['total_net']}")
check(not sum_fails, f"line sums inside the range ({len(sum_fails)} outside)")

print("\n── condition and access move the number, additively ──")
key = "maler.innenanstrich"
base = E.estimate(key, {"qty": 60, "condition": "neubau", "access": "eg_oder_lift"})
worst = E.estimate(key, {"qty": 60, "condition": "altbau_bewohnt", "access": "enge_treppe"})
check(worst["total_net"][1] > base["total_net"][1], "an occupied Altbau up three flights costs more")
ratio = worst["total_net"][1] / base["total_net"][1]
# v0 stacked multipliers and reached 5.7x, which no customer would sign.
check(ratio < 3.0, f"worst case is {ratio:.2f}x the best, not a multiplied blowout")

print("\n── setup is fixed, so small jobs cost more per unit ──")
small = E.estimate(key, {"qty": 10})
large = E.estimate(key, {"qty": 200})
check(small["per_unit"][0] > large["per_unit"][0] * 1.3,
      f"10 m² is {small['per_unit'][0] / large['per_unit'][0]:.1f}x the per-m² of 200 m²")
check(small["total_net"][0] < large["total_net"][0], "but the small job still costs less in total")

print("\n── a service call is not charged protection hours ──")
messy = next(j for j in JOBS if j["messy"])
clean = next(j for j in JOBS if not j["messy"])
occupied = {"condition": "altbau_bewohnt"}
check(E.estimate(clean["key"], occupied)["setup_hours"]
      == E.estimate(clean["key"], {"condition": "neubau"})["setup_hours"],
      f"{clean['key']} setup is unchanged by an occupied Altbau")
check(E.estimate(messy["key"], occupied)["setup_hours"][1]
      > E.estimate(messy["key"], {"condition": "neubau"})["setup_hours"][1],
      f"{messy['key']} setup grows in an occupied Altbau")

print("\n── the Notdienst rate applies only where the job supports it ──")
emer = next(j for j in JOBS if j["emergency_capable"])
non_emer = next(j for j in JOBS if not j["emergency_capable"])
check(E.estimate(emer["key"], {"emergency": True})["rate_basis"] == "notdienst",
      f"{emer['key']} at night bills the Notdienst rate")
check(E.estimate(non_emer["key"], {"emergency": True})["rate_basis"] == "catalogue",
      f"{non_emer['key']} does not become a call-out just because the flag is set")
check(any(n["key"] == "nacht_zuschlag"
          for n in E.estimate(emer["key"], {"emergency": True})["notes"]),
      "a call-out attaches the surcharge note")

print("\n── notes ──")
# Chosen because this job does not carry the asbestos note unconditionally —
# tile removal does, so it could not show that the Baujahr trigger works.
elec = "elektrik.wohnung_neuinstallation"
asb = E.estimate(elec, {"qty": 75, "baujahr": 1968})
check(any(n["key"] == "asbest_vor_1990" for n in asb["notes"]),
      "a pre-1990 building attaches the asbestos note")
check(asb["notes"][0]["severity"] == "critical", "critical notes sort first")
check(not any(n["key"] == "asbest_vor_1990"
              for n in E.estimate(elec, {"qty": 75, "baujahr": 2015})["notes"]),
      "a 2015 building does not")
check(not any(n["key"] == "bleirohre_vor_1970" for n in asb["notes"]),
      "lead pipes are a plumbing note, not an electrician's")
check(any(n["key"] == "bleirohre_vor_1970"
          for n in E.estimate("sanitaer.steigleitung", {"baujahr": 1955})["notes"]),
      "but a pre-1970 riser replacement gets it")
check(E.estimate(elec, {"qty": 75, "baujahr": "nonsense"}) is not None,
      "an unparseable Baujahr does not raise")
check(asb["assumptions"].startswith("•"), "assumptions render as a bullet block")
check(len(asb["notes"]) == len({n["key"] for n in asb["notes"]}), "notes are deduplicated")

print("\n── quantity resolution ──")
sockets = E.estimate("elektrik.schalter_tauschen", {"anzahl": 6})
check(sockets["qty"] == 6, "a qty question in the job's own unit sets the quantity")
outdoor = E.estimate("elektrik.aussensteckdose", {"entfernung": 6})
check(outdoor["qty"] == 1,
      "a cable run in lfm does not become six sockets on a per-Stk job")
check(E.estimate("maler.innenanstrich", {})["qty"] == 57.5,
      "no answer falls back to the middle of typical size, not the small end")
check(E.estimate("maler.innenanstrich", {"qty": "  "})["qty"] == 57.5, "blank qty falls back too")
check(E.estimate("maler.innenanstrich", {"qty": -5})["qty"] == 57.5, "negative qty falls back too")

print("\n── the pro's own rate wins ──")
own = E.estimate(key, {"qty": 60}, rates={"maler.anstrich2": 9.5})
line = next(l for l in own["lines"] if l["rate_key"] == "maler.anstrich2")
check(line["unit_price"] == 9.5 and line["rate_source"] == "pro", "learned rate replaces the default")
check(all(l["rate_source"] == "catalogue"
          for l in E.estimate(key, {"qty": 60})["lines"]), "without rates everything is catalogue")

print("\n── debris and containers are sized by weight ──")
demo = E.estimate("fliesen.entfernen_dickbett", {"qty": 60})
check(demo["debris_kg"][1] > 3000, f"60 m² of Dickbett is {demo['debris_kg'][1]:.0f} kg")
check(demo["container"] is not None, f"and needs a container: {demo['container']}")
check(E.estimate(key, {"qty": 60})["container"] is None, "painting a wall needs none")
check(E._container(999) == "Big Bag (bis 1 t)", "under a tonne is a Big Bag")
check(E._container(1001) == "3 m³ Mulde", "over a tonne is a skip")

print("\n── the guided form is renderable for every job ──")
form_fails = []
for j in JOBS:
    s = E.survey(j["key"])
    keys = [q["key"] for q in s["form"]]
    if len(keys) != len(set(keys)):
        form_fails.append(f"{j['key']}: duplicate question keys {keys}")
    if "condition" not in keys or "access" not in keys:
        form_fails.append(f"{j['key']}: missing a shared question")
    for q in s["form"]:
        if q["type"] == "choice" and not q["options"]:
            form_fails.append(f"{j['key']}/{q['key']}: choice with no options")
check(not form_fails, f"every survey renders ({len(form_fails)} problem(s)): {form_fails[:3]}")
check(all(any(q["affects"] == "qty" for q in E.survey(j["key"])["form"])
          for j in JOBS if j["band_basis"] == "per_unit"),
      "every per-unit job asks for a quantity")

print("\n── answering the shared questions actually changes the estimate ──")
for j in JOBS[:20]:
    s = E.survey(j["key"])
    answers = {q["key"]: q["default"] for q in s["form"] if q["default"] is not None}
    r = E.estimate(j["key"], answers)
    if r["total_net"][0] <= 0:
        fails.append(f"{j['key']} estimates at zero from its own defaults")
check(not [f for f in fails if "estimates at zero" in f], "defaults produce a non-zero estimate")

print("\n── unknown jobs are refused, not guessed ──")
try:
    E.estimate("does.not.exist", {})
    check(False, "unknown job key raises")
except LookupError:
    check(True, "unknown job key raises LookupError")

print("\n── meta describes the catalogue without shipping it ──")
meta = E.meta()
check(meta["job_count"] == len(JOBS), "meta counts the jobs")
check(len(meta["groups"]) >= 20, f"{len(meta['groups'])} directory groups")
check(set(meta["conditions"]) == set(cat["modifiers"]["condition_uplift"]),
      "meta lists the condition vocabulary the estimator accepts")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
for f in fails:
    print("  ·", f)
sys.exit(1 if fails else 0)
