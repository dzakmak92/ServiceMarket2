"""The grouping tables in `catalogue_ui`, checked for the ways they can rot.

None of this touches a price, which is exactly why it needs a test: a template
placed in no section is invisible on the screen and nothing else fails. The
generator can add a template tomorrow, and the only thing standing between
that and a template nobody can reach is this file.

Run directly: `python3 tests/test_sections.py`
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services import estimator as E          # noqa: E402
from services import catalogue_ui as U       # noqa: E402

LANGS = ("en", "tr", "es")
fails = 0


def check(ok, msg):
    global fails
    if not ok:
        fails += 1
    print(f"  {'ok  ' if ok else 'FAIL'} {msg}")


jobs = E.catalogue()["jobs"]
by_trade: dict[str, list[str]] = {}
for j in jobs:
    by_trade.setdefault(j["trade"], []).append(j["key"])

print("── every template is placed, exactly once ──")
for trade, scheme in sorted(U.SECTIONS.items()):
    have = set(by_trade.get(trade, []))
    placed = [k for _, _, keys in scheme for k in keys]
    check(len(placed) == len(set(placed)),
          f"{trade}: no template placed twice in SECTIONS ({len(placed)} placements)")
    check(set(placed) == have,
          f"{trade}: SECTIONS covers the catalogue exactly "
          f"(missing {sorted(have - set(placed))}, unknown {sorted(set(placed) - have)})")

print("\n── no group is a list again ──")
for trade, scheme in sorted(U.SECTIONS.items()):
    big = [(k, len(keys)) for k, _, keys in scheme if len(keys) > 7]
    check(not big, f"{trade}: every group is 7 templates or fewer ({big})")

print("\n── cross-listings point somewhere real ──")
for trade, cross in sorted(U.CROSS_LISTED.items()):
    scheme = U.SECTIONS.get(trade, [])
    sec_keys = {k for k, _, _ in scheme}
    home = {k: skey for skey, _, keys in scheme for k in keys}
    for job, extras in cross.items():
        check(job in home, f"{trade}: {job} is cross-listed and exists in SECTIONS")
        check(all(s in sec_keys for s in extras),
              f"{trade}: {job} cross-lists into real sections {extras}")
        check(home.get(job) not in extras,
              f"{trade}: {job} is not cross-listed into its own home section")
        check(len(extras) == len(set(extras)),
              f"{trade}: {job} names each extra section once")

print("\n── a zone's sections are contiguous ──")
for trade, zones in sorted(U.ZONES.items()):
    order = [k for k, _, _ in U.SECTIONS.get(trade, [])]
    seen: list[str] = []
    for zkey, _, secs in zones:
        check(all(s in order for s in secs),
              f"{trade}/{zkey}: every listed section exists")
        idx = [order.index(s) for s in secs if s in order]
        check(idx == sorted(idx) and idx == list(range(min(idx), min(idx) + len(idx))),
              f"{trade}/{zkey}: sections are contiguous and in SECTIONS order")
        seen += secs
    check(sorted(seen) == sorted(order),
          f"{trade}: every section is in exactly one zone")
    check(len(zones) <= 2,
          f"{trade}: at most two zones, because there are two colours ({len(zones)})")

print("\n── every string exists in every language ──")
for trade, scheme in sorted(U.SECTIONS.items()):
    for key, heading, _ in scheme:
        check(bool(heading), f"{trade}.{key}: has a German heading")
        labels = U.SECTION_LABELS.get(f"{trade}.{key}", {})
        check(all(labels.get(l) for l in LANGS),
              f"{trade}.{key}: heading in {', '.join(LANGS)}")
        subs = U.SECTION_SUBS.get(f"{trade}.{key}", {})
        check(bool(subs) and all(subs.get(l) for l in ("de", *LANGS)),
              f"{trade}.{key}: subtitle in all four languages")
for trade, zones in sorted(U.ZONES.items()):
    for zkey, labels, _ in zones:
        check(all(labels.get(l) for l in ("de", *LANGS)),
              f"{trade}/{zkey}: zone name in all four languages")

print("\n── what sections_for actually returns ──")
for trade in sorted(U.SECTIONS):
    keys = by_trade.get(trade, [])
    secs = U.sections_for(trade, keys)
    rows = [k for s in secs for k in s["job_keys"]]
    extra = sum(len(v) for v in U.CROSS_LISTED.get(trade, {}).values())
    check(set(rows) == set(keys),
          f"{trade}: every template appears at least once on screen")
    check(len(rows) == len(keys) + extra,
          f"{trade}: {len(rows)} rows for {len(keys)} templates "
          f"({extra} cross-listed)")
    check(not any(s["key"] == "weitere" for s in secs),
          f"{trade}: nothing fell into the Weitere bucket")
    # A cross-listed row must name the other places it appears, and must never
    # name its own section — that would read as "also under here".
    for s in secs:
        for job, others in s.get("cross", {}).items():
            check(job in s["job_keys"], f"{trade}/{s['key']}: cross names a row it shows")
            check(s["key"] not in others,
                  f"{trade}/{s['key']}: {job} does not point at its own section")
            check(all(o in {x['key'] for x in secs} for o in others),
                  f"{trade}/{s['key']}: {job} points at sections that are rendered")

print("\n── trades without sections still get a flat list ──")
for trade in sorted(by_trade):
    if trade in U.SECTIONS:
        continue
    check(U.sections_for(trade, by_trade[trade]) is None,
          f"{trade}: {len(by_trade[trade])} templates, no sections")

print("\n" + ("ALL PASS" if not fails else f"{fails} FAILURE(S)"))
sys.exit(1 if fails else 0)
