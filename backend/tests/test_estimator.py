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
import re
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
# Zero, not "at most one". The catalogue carried a standing maler.fassade DE
# failure until the band was restated net of scaffolding — the estimate had
# been right all along and the published band was measuring a different scope.
# A tolerance here would have let that keep hiding.
check(not band_fails, f"{len(band_fails)} band miss(es): {band_fails or 'none'}")

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

print("\n── answers that did not move the number say so ──")
prov = E.estimate("maler.wohnung_komplett",
                  {"wohnflaeche": 85, "untergrund": "altbau_leimfarbe",
                   "farbwechsel": True, "condition": "altbau_bewohnt",
                   "access": "enge_treppe", "moebel": "voll"})
check(set(prov["answers_applied"]) == {"wohnflaeche", "condition", "access"},
      f"priced answers reported: {prov['answers_applied']}")
check("farbwechsel" in prov["answers_recorded"],
      "a variant answer is reported as recorded, not as priced")
check(not (set(prov["answers_applied"]) & set(prov["answers_recorded"])),
      "no answer is claimed both ways")
emerg = E.estimate("sanitaer.rohrbruch",
                   {"zeit": "nacht_sonntag", "ort": "boden", "wasser_ab": False})
check("zeit" in emerg["answers_applied"] and emerg["rate_basis"] == "notdienst",
      "the one variant answer that IS priced — a night call-out — counts as applied")
# The notes are a promise the pro forwards to a customer. A note may not claim
# extra work is included when nothing in the arithmetic added it — five did,
# and they were all attached to `variant` answers the engine does not read.
# The negated forms ("nicht enthalten") are the honest majority and must not
# trip this, so the match excludes them.
INCLUSION = re.compile(
    r"(?<!nicht )(?<!nicht im Angebot )(ist|sind) (berücksichtigt|enthalten|kalkuliert)")
# Every job whose operations genuinely cover the claim. Anything else claiming
# inclusion is a note the arithmetic does not back.
HONEST = {"abdichtung_nassbereich", "verschnitt_muster", "altgeraet_entsorgung",
          "staub", "gruenschnitt_entsorgung", "abtransport", "dehnungsfuge",
          "leitungsortung", "lack_demontage", "netzanmeldung", "stueckfaellung",
          "oeffnung_wand", "raeumpflicht_uebertragung", "grossformat_zweiter_mann",
          "anlage_entleeren", "kein_lift", "transport_werkstatt",
          "koordination_gewerke", "netzbetreiber_meldung", "messprotokoll_netzwerk"}
overclaim = [k for k, n in cat["notes"].items()
             if INCLUSION.search(n["de"]) and k not in HONEST]
check(not overclaim, f"no note promises unpriced work: {overclaim}")

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
    # A shared question is present exactly when the job declares an axis for
    # it. "none" is a claim the catalogue makes on purpose — the question does
    # not apply to this job — so asserting the question is always there would
    # forbid the catalogue from ever saying so.
    for shared in ("condition", "access"):
        declared = j.get(f"{shared}_axis", "gebaeude") != "none"
        if declared != (shared in keys):
            form_fails.append(
                f"{j['key']}: {shared}_axis says {j.get(f'{shared}_axis')!r} "
                f"but the form {'has' if shared in keys else 'lacks'} it")
    for q in s["form"]:
        if q["type"] == "choice" and not q["options"]:
            form_fails.append(f"{j['key']}/{q['key']}: choice with no options")
check(not form_fails, f"every survey renders ({len(form_fails)} problem(s)): {form_fails[:3]}")
check(all(any(q["affects"] == "qty" for q in E.survey(j["key"])["form"])
          for j in JOBS if j["band_basis"] == "per_unit"),
      "every per-unit job asks for a quantity")

print("\n── the shared questions are asked in the job's own vocabulary ──")
# The bug this replaced: 89 of 149 job types were asked "Zustand des Objekts —
# Neubau, besenrein / Renovierung, leerstehend" and 80 were asked "Zugang —
# Erdgeschoss oder Lift", whatever the job was. Mowing a lawn asked about a
# broom-clean building; a tyre change asked about a lift. Both answers move the
# price by up to 75 % and 30 %, so an unanswerable question was setting it.
#
# Checked two ways. Structurally, because that is exact: a trade that never
# works inside a dwelling must not be on the `gebaeude` axis. And by wording,
# because the structure would still pass if a new axis were written in the old
# words — only phrases with no other reading are listed, so "Nur über Treppe
# oder Durchgang" (a real way into a garden) does not trip it.
INDOOR_WORDS = ("besenrein", "leerstehend", "Erdgeschoss", "Obergeschoss",
                "Lift", "Enge Treppe", "Wohnung leer")
NO_BUILDING = {"garten", "dach", "solar", "kfz", "fahrrad", "geruest", "polster"}
wording = []
for j in JOBS:
    if j["trade"] not in NO_BUILDING:
        continue
    for kind in ("condition", "access"):
        if j.get(f"{kind}_axis") == "gebaeude":
            wording.append(f"{j['key']}: {kind} still on the building axis")
    for q in E.survey(j["key"])["form"]:
        if q["key"] not in ("condition", "access"):
            continue
        for _v, label in q["options"]:
            if any(w in label for w in INDOOR_WORDS):
                wording.append(f"{j['key']}/{q['key']}: {label!r}")
check(not wording,
      f"no job without a building is asked about one ({len(wording)}): {wording[:3]}")

# The screenshot that started this: a lawn asked whether the building was
# broom-clean, and the answer was worth up to +64 % of a €75 quote.
mow = E.survey("garten.rasenmaehen")["form"]
mow_cond = next(q for q in mow if q["key"] == "condition")
check(mow_cond["label_de"] == "Zustand der Fläche",
      f"mowing asks about the lawn, not the building ({mow_cond['label_de']!r})")
check([lbl for _v, lbl in mow_cond["options"]][0] == "Neuanlage, frei",
      "and offers ground conditions as its cheapest case")

# Every axis must offer the whole uplift vocabulary, or a pro would be unable
# to reach a level the estimator can price.
axis_fails = []
for kind, table in (("condition", "condition_uplift"), ("access", "access_uplift")):
    for name, axis in cat["modifiers"][f"{kind}_axes"].items():
        if set(axis["options"]) != set(cat["modifiers"][table]):
            axis_fails.append(f"{kind}/{name}: options {sorted(axis['options'])}")
        if axis["default"] not in axis["options"]:
            axis_fails.append(f"{kind}/{name}: default {axis['default']!r} not offered")
check(not axis_fails, f"every axis covers the full uplift vocabulary: {axis_fails}")

print("\n── relabelling the question did not reprice the work ──")
# An axis is wording. Every one of them keeps the default the bands were
# validated at, so the estimate for an unanswered form must be the number it
# has always been — otherwise 149 market bands quietly stopped holding.
DEFAULTS = {"condition": "renovierung_leer", "access": "eg_oder_lift"}
drift = []
for j in JOBS:
    for kind in ("condition", "access"):
        axis = j.get(f"{kind}_axis")
        if axis == "none":
            continue
        if cat["modifiers"][f"{kind}_axes"][axis]["default"] != DEFAULTS[kind]:
            drift.append(f"{j['key']}/{kind}: axis {axis} defaults elsewhere")
check(not drift, f"every axis default is the calibration point: {drift[:3]}")

# And where a job declares "none", posting the field anyway must not price it.
noaxis = [j for j in JOBS if j.get("condition_axis") == "none"]
check(bool(noaxis), f"the catalogue does declare 'none' somewhere ({len(noaxis)})")
for j in noaxis[:3]:
    plain = E.estimate(j["key"], {})["total_net"]
    forced = E.estimate(j["key"], {"condition": "altbau_bewohnt"})["total_net"]
    check(plain == forced,
          f"{j['key']}: a condition it never asks for cannot be posted in")

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
# meta describes what the picker offers, not what the file holds. A picker
# announcing "136 Auftragstypen" and then listing 100 would misdescribe itself.
check(meta["job_count"] == len(E.jobs()), "meta counts the jobs it offers")
check(meta["job_count"] < len(JOBS),
      f"which is fewer than the catalogue holds ({meta['job_count']} of {len(JOBS)})")
check(len(E.jobs(include_hidden=True)) == len(JOBS),
      "and include_hidden still reaches every one, for exports and audits")
check([t["key"] for t in meta["trades"]] == list(E.OFFERED_TRADES),
      "trades come back in the offered order, not alphabetical")
check(all(t.get("label") and isinstance(t.get("count"), int) and t["count"] > 0
          for t in meta["trades"]), "each carrying a label and a real count")
check(sum(t["count"] for t in meta["trades"]) == meta["job_count"],
      "and the per-trade counts add up to the total")
offered_groups = {j["group"] for j in E.jobs()}
check({g["group"] for g in meta["groups"]} == offered_groups,
      f"{len(meta['groups'])} groups, all of them reachable from a tile")
# Hidden means hidden from the picker, not gone. Anything already citing one
# of these job types has to keep pricing.
hidden = [j for j in JOBS if j["trade"] not in E.OFFERED_TRADES]
check(hidden, f"{len(hidden)} job types are hidden")
check(all(E.get_job(j["key"]) for j in hidden),
      "and every one of them still resolves by key")
check(set(meta["conditions"]) == set(cat["modifiers"]["condition_uplift"]),
      "meta lists the condition vocabulary the estimator accepts")


print("\n── tiers are only offered where the catalogue distinguishes them ──")
# The machinery is real: an operation carrying `tier_min` is dropped below
# that tier. The data is not — only 4 of 136 job types use it, and none gates
# anything to `premium`. So for almost every job all three tiers resolve to
# the same estimate, and a UI offering the choice would show the customer
# three identical prices.
_tiered = [j["key"] for j in E.jobs()
           if E.survey(j["key"])["tiers_differ"]]
check(len(_tiered) >= 1, f"{len(_tiered)} job type(s) actually tier")
for _k in _tiered[:1]:
    _lo = E.estimate(_k, {}, country="AT", tier="basic", rates={}, calibration=None)
    _hi = E.estimate(_k, {}, country="AT", tier="standard", rates={}, calibration=None)
    check(_lo["total_net"] != _hi["total_net"],
          f"{_k}: basic and standard differ ({_lo['total_net'][1]} vs {_hi['total_net'][1]})")
# And where they do not, survey() says so rather than letting the screen guess.
_flat = next(j["key"] for j in E.jobs()
             if not E.survey(j["key"])["tiers_differ"])
_a = E.estimate(_flat, {}, country="AT", tier="basic", rates={}, calibration=None)
_b = E.estimate(_flat, {}, country="AT", tier="premium", rates={}, calibration=None)
check(_a["total_net"] == _b["total_net"],
      f"{_flat}: tiers_differ is false and the numbers agree")

# ── what the pro typed ────────────────────────────────────────────────────
# Every case below produced a silently wrong number before, not an error.

print("\n── a number as a person writes it ──")
check(E.parse_number("12,5") == 12.5, "German decimal comma: 12,5 is twelve and a half")
check(E.parse_number("12.5") == 12.5, "and an English decimal point still works")
check(E.parse_number("1.234") == 1234.0, "dots in threes are thousands: 1.234 is one thousand")
check(E.parse_number("1.234,50") == 1234.5, "German thousands with a decimal comma")
check(E.parse_number("1,234.50") == 1234.5, "and the English form of the same number")
check(E.parse_number(" 60 ") == 60.0, "padding is not part of the number")
check(E.parse_number("60\u00a0m²") is None, "a unit stuck to the number is not a number")
check(E.parse_number(True) is None and E.parse_number(False) is None,
      "a checkbox is not a quantity — float(True) used to quote a 1 m² job")
check(E.parse_number("abc") is None and E.parse_number("") is None
      and E.parse_number(None) is None, "nonsense is rejected rather than guessed at")
check(E.parse_number(float("inf")) is None and E.parse_number("inf") is None
      and E.parse_number(float("nan")) is None,
      "non-finite is rejected — it used to crash, or emit literal Infinity in JSON")

print("\n── the quantity, and where it says it came from ──")
_job = E.get_job("maler.innenanstrich")
_typ = E._mid(_job["typical_size"])
check(E.resolve_qty_detail(_job, {"qty": "12,5"}) == (12.5, "qty"),
      "12,5 m² is quoted as 12,5 m², not as the typical size")
_bad = E.estimate("maler.innenanstrich", {"qty": "12,5"})
_good = E.estimate("maler.innenanstrich", {"qty": 12.5})
check(_bad["total_net"] == _good["total_net"],
      f"and the total matches the same job entered as a number ({_bad['total_net']})")
check(E.resolve_qty_detail(_job, {})[1] == "typical_size",
      "an unanswered quantity says typical_size, not the name of the question")
check(E.resolve_qty_detail(_job, {"qty": -5})[1] == "typical_size",
      "a negative quantity falls back and says so")
check(E.resolve_qty_detail(_job, {"qty": 0})[1] == "typical_size",
      "and so does zero")
check(E.resolve_qty_detail(_job, {"qty": "abc"})[1] == "typical_size",
      "and so does a word")
check(E.estimate("elektrik.schalter_tauschen", {})["qty_source"] == "unit_job",
      "a per-job price is not attributed to an answer nobody gave")
check(E.resolve_qty(_job, None) == _typ,
      "resolve_qty(job, None) falls back instead of raising")

print("\n── yes means yes ──")
_em = "elektrik.stoerungssuche"
_no = E.estimate(_em, {"emergency": False})["total_net"]
for falsey in ("false", "False", "nein", "0", "off", "", None):
    check(E.estimate(_em, {"emergency": falsey})["total_net"] == _no,
          f'emergency={falsey!r} is not an emergency')
for truthy in (True, "true", "ja", "1", "on"):
    check(E.estimate(_em, {"emergency": truthy})["total_net"] != _no,
          f"emergency={truthy!r} is")
check(E.estimate(_em, {"zeit": " NACHT_SONNTAG "})["total_net"]
      == E.estimate(_em, {"zeit": "nacht_sonntag"})["total_net"],
      "an out-of-hours value survives padding and case")

print("\n── an injected rate cannot invert or poison the range ──")
_inv = E.estimate("maler.innenanstrich", {"qty": 60}, hourly=(80, 40))["total_net"]
check(_inv[0] <= _inv[1], f"an inverted hourly pair is ordered, not passed through ({_inv})")
for bad_cal in (-1.0, float("nan"), 100.0, "nonsense", None):
    _t = E.estimate("maler.innenanstrich", {"qty": 60},
                    calibration={"hours_factor": bad_cal})["total_net"]
    check(all(x == x and x > 0 for x in _t) and _t[0] <= _t[1],
          f"hours_factor={bad_cal!r} gives a usable range ({_t})")
_clamped = E.estimate("maler.innenanstrich", {"qty": 60},
                      calibration={"hours_factor": 100.0})["total_net"]
_at_max = E.estimate("maler.innenanstrich", {"qty": 60},
                     calibration={"hours_factor": E.HOURS_FACTOR_CLAMP[1]})["total_net"]
check(_clamped == _at_max,
      "and a factor far outside the clamp prices as the clamp, not as itself")

print("\n── the catalogue cannot be edited by reading an estimate ──")
_r = E.estimate("maler.innenanstrich", {"qty": 60})
_r["market_band"][0] = 999
check(E.estimate("maler.innenanstrich", {"qty": 60})["market_band"][0] != 999,
      "market_band is a copy — it used to be a live reference into the lru_cache")

print("\n── optional operations are not billed ──")
# The shipped catalogue has no optional operations, so this flips one in the
# cached copy, prices the job, and puts it back. Without the flag being read,
# the total is unchanged and this fails — which is what it did before.
_key = "fliesen.entfernen_dickbett"
_ops = E.catalogue()["jobs"][_key]["operations"] if isinstance(
    E.catalogue()["jobs"], dict) else next(
    j for j in E.catalogue()["jobs"] if j["key"] == _key)["operations"]
if len(_ops) > 1:
    _before = E.estimate(_key, {"qty": 60})["total_net"]
    _n_before = len(E.estimate(_key, {"qty": 60})["lines"])
    _ops[1]["optional"] = True
    try:
        _after = E.estimate(_key, {"qty": 60})["total_net"]
        _n_after = len(E.estimate(_key, {"qty": 60})["lines"])
    finally:
        _ops[1].pop("optional")
    check(_after[1] < _before[1],
          f"an optional operation drops out of the total ({_before} -> {_after})")
    check(_n_after < _n_before,
          f"and out of the positions ({_n_before} -> {_n_after})")
    check(E.estimate(_key, {"qty": 60})["total_net"] == _before,
          "and the catalogue is back as it was")
else:
    check(False, f"{_key} has too few operations to test the optional filter")

print("\n── every form points at its own quantity ──")
# The screen files the quantity on its own card. It cannot find it by key:
# only 56 of the job types call it `qty` and the rest use `anzahl`, `flaeche`,
# `stufen`, `wohnflaeche`. Nor by `affects`, which is declared `qty` on three
# questions that measure something else entirely — a cable run in lfm on a job
# priced per Stk — and move the total by nothing. So `survey()` flags exactly
# one, and this is the guard on that word "exactly".
_no_qty, _changed = [], []
for _j in E.catalogue()["jobs"]:
    _s = E.survey(_j["key"])
    _flagged = [q for q in _s["form"] if q.get("is_quantity")]
    check(len(_flagged) <= 1, f"{_j['key']} flags {len(_flagged)} quantity questions")
    if not _flagged:
        _no_qty.append(_j["key"])
        continue
    check(E.qty_question(_j) is None or _flagged[0]["key"] == E.qty_question(_j)["key"],
          f"{_j['key']} flags the question the estimator actually multiplies")
    # Where the field is synthesised rather than the catalogue's own, adding
    # it must not move a number: the estimator already assumed a quantity for
    # those jobs, and the field only lets the pro disagree with the assumption.
    if E.qty_question(_j) is None:
        _d = {q["key"]: q["default"] for q in _s["form"] if q.get("default") is not None}
        _without = {k: v for k, v in _d.items() if k != _flagged[0]["key"]}
        if E.estimate(_j["key"], _d)["total_net"] != E.estimate(_j["key"], _without)["total_net"]:
            _changed.append(_j["key"])
check(not _changed, f"the default quantity is the one the estimator already used ({_changed[:3]})")
check(_no_qty == ["sanitaer.rohrbruch"],
      f"only the one Pauschale job has no quantity to ask for ({_no_qty})")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
for f in fails:
    print("  ·", f)
sys.exit(1 if fails else 0)