"""Which catalogue strings reach a screen, and which of them are translated.

The interface has four languages; the catalogue had one. This measures the gap
rather than asserting it away — the counts below are printed on every run so
the remaining work is a number somebody can watch fall, not a vague intention.

Two things are hard failures:

  · a translation attached to German text the catalogue no longer contains,
    which means a label was reworded and its translation now describes
    something else;
  · a table that is short in one language, which is how a form ends up half
    Turkish and half German mid-question.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import catalogue_i18n as I  # noqa: E402
from services import catalogue_ui as U  # noqa: E402
from services import estimator as E  # noqa: E402

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


cat = E.catalogue()

# Every German string the API can put in front of a tradesperson, by kind.
SURFACES = {"job titles": set(), "question labels": set(), "answer options": set(),
            "axis text": set(), "quote lines": set(), "notes": set()}
for j in cat["jobs"]:
    SURFACES["job titles"].add(j["label_de"])
    for q in j["guided_form"]:
        SURFACES["question labels"].add(q["label_de"])
        SURFACES["answer options"].update(lbl for _v, lbl in q["options"])
    SURFACES["quote lines"].update(o["label_de"] for o in j["operations"])
for axis in (list(cat["modifiers"]["condition_axes"].values())
             + list(cat["modifiers"]["access_axes"].values())):
    SURFACES["axis text"].add(axis["label_de"])
    SURFACES["axis text"].update(axis["options"].values())
SURFACES["notes"].update(n["de"] for n in cat["notes"].values())

# Strings the estimator composes rather than reads. Collected by running real
# estimates, because that is the only way to see them: the setup position, the
# disposal position and the skip size exist nowhere in the catalogue file, and
# an audit that only walks the JSON reports 100 % while a quote still opens
# with a German line. One job per trade, plus a demolition-heavy one to force
# a container and a material split.
CONTAINERS = {"Big Bag (bis 1 t)", "3 m³ Mulde", "7 m³ Mulde",
              "Mehrere Mulden oder Abrollcontainer"}
SURFACES["estimator lines"] = {E.SETUP_LABEL, E.DISPOSAL_LABEL, "Material"}
SURFACES["estimator lines"].update(E.TRADE_LABELS.values())
SURFACES["estimator lines"].update(CONTAINERS)

ALL = set().union(*SURFACES.values())
DONE = I.translated_keys()

print("── coverage, by what the string is ──")
total = done_total = 0
for kind, strings in SURFACES.items():
    have = len(strings & DONE)
    total += len(strings)
    done_total += have
    print(f"  {kind:16s} {have:4d} / {len(strings):4d}"
          f"   {100 * have // max(len(strings), 1):3d}%")
print(f"  {'-' * 40}\n  {'all':16s} {done_total:4d} / {total:4d}"
      f"   {100 * done_total // total:3d}%")

print("\n── the two questions asked on every job must be complete ──")
# These are the most-read strings in the catalogue: every job asks both.
missing_axis = sorted(SURFACES["axis text"] - DONE)
check(not missing_axis,
      f"every axis label and option is translated ({len(missing_axis)} missing): "
      f"{missing_axis[:3]}")

print("\n── a translation must still describe something the catalogue says ──")
# A reworded German label leaves its translation behind, attached to text that
# no longer exists. That is worse than an untranslated string: it is a silent
# claim that the wording was checked.
orphans = sorted(DONE - ALL)
check(not orphans,
      f"no translation points at text the catalogue has dropped "
      f"({len(orphans)}): {orphans[:3]}")

print("\n── no table is short in one language ──")
short = []
for table in I.TABLES:
    for german, row in table.items():
        for lang in I.LANGS:
            if not row.get(lang):
                short.append(f"{german!r} has no {lang}")
check(not short, f"every entry covers all three languages ({len(short)}): {short[:3]}")

print("\n── translate() degrades to German, never to a key or a blank ──")
check(I.translate("Zustand der Fläche", "en") == "Condition of the ground",
      "a known string comes back translated")
check(I.translate("Zustand der Fläche", "de") == "Zustand der Fläche",
      "German asks for nothing and gets the original")
check(I.translate("Ein Text den niemand übersetzt hat", "en")
      == "Ein Text den niemand übersetzt hat",
      "an unknown string falls back to German rather than to a key")
check(I.translate("", "en") == "" and I.translate(None, "en") is None,
      "empty and None are returned unchanged")
check(I.translate("Zustand der Fläche", "fr") == "Zustand der Fläche",
      "an unsupported language falls back rather than raising")

print("\n── the survey endpoint actually carries the translation ──")
form = E.survey("garten.rasenmaehen")["form"]
q = next(x for x in form if x["key"] == "condition")
for lang, expect in (("en", "Condition of the ground"),
                     ("tr", "Alanın durumu"),
                     ("es", "Estado del terreno")):
    d = U.decorate_question(q, lang)
    check(d["label"] == expect, f"mowing asks about the ground in {lang}: {d['label']!r}")
    check(all(lbl for _v, lbl in d["options"]), f"and every option has a label in {lang}")

de = U.decorate_question(q, "de")
check(de["label_de"] == "Zustand der Fläche" and de["label"] == "Zustand der Fläche",
      "German keeps both fields identical")
# A quote already sent quotes the German. The screen that re-renders it in
# another language still has to be able to show what was agreed.
en = U.decorate_question(q, "en")
check(en["label_de"] == "Zustand der Fläche",
      "the German is kept alongside the translation, not replaced by it")

print("\n── every skip size the estimator can name is a string we translate ──")
# The vocabulary above is hand-written; this is what keeps it honest. If
# `_container` grows a fifth size, one of these estimates returns it and the
# name lands outside the set rather than shipping untranslated.
seen_containers = set()
for j in cat["jobs"]:
    c = E.estimate(j["key"], {}).get("container")
    if c:
        seen_containers.add(c)
check(seen_containers <= CONTAINERS,
      f"no estimate names a container the audit does not know "
      f"({sorted(seen_containers - CONTAINERS)})")

print("\n── a whole estimate comes back in one language, not one and a half ──")
est = E.estimate("abbruch.entkernung" if any(
    j["key"] == "abbruch.entkernung" for j in cat["jobs"]) else cat["jobs"][0]["key"], {})
# Pick a job that actually produces every kind of line: setup, operations,
# a material split and disposal. Half the point of this check is the composite
# "<operation> — Material", which is in no table by design.
best = max(cat["jobs"], key=lambda j: len(E.estimate(j["key"], {})["lines"]))
est = E.estimate(best["key"], {})
for lang in ("en", "tr", "es"):
    loc = U.localise_estimate(est, lang)
    german_left = [ln["description"] for ln in loc["lines"]
                   if ln["description"] == ln["description_de"]
                   and I.translate(ln["description_de"], lang) != ln["description_de"]]
    check(not german_left,
          f"{best['key']} has no line left in German in {lang} ({german_left[:2]})")
    check(loc["job"]["label"] != loc["job"]["label_de"] or lang == "de",
          f"the job title is translated in {lang}: {loc['job']['label']!r}")
    check(all(n.get("text") for n in loc["notes"]),
          f"every note carries translated text in {lang}")
    check(loc["assumptions"] == "\n".join("• " + n["text"] for n in loc["notes"]),
          f"the assumptions block is rebuilt from the translated notes in {lang}")

mat = [ln for ln in U.localise_estimate(est, "en")["lines"]
       if ln["description_de"].endswith(" — Material")]
check(not mat or all("Material" in ln["description"] for ln in mat),
      f"a split material line keeps its suffix in English ({len(mat)} of them)")

print("\n── localising must not touch the estimate it was given ──")
# `_estimate` result is what /save writes to the database. Mutating it here
# would persist an English rendering as the record of a German quote.
before = est["lines"][0]["description"]
U.localise_estimate(est, "tr")
check(est["lines"][0]["description"] == before,
      "the German estimate is unchanged after localising a copy")
check(U.localise_estimate(est, "de") is est,
      "asking for German returns the original object, not a rebuilt one")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
for f in fails:
    print("  · " + f)
sys.exit(1 if fails else 0)
