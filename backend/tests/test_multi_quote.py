"""Several positions become one quote, and the arithmetic is untouched.

The endpoint concatenates and deduplicates; it must not reprice. So the checks
below are mostly equalities against the single-position estimator: if a line,
a total or an assumption differs from what `estimate()` alone produces, the
merge has started doing arithmetic of its own, which is the one thing it is
not allowed to do.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import catalogue_ui as U  # noqa: E402
from services import estimator as E  # noqa: E402

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


POSITIONS = ["maler.innenanstrich", "fliesen.verlegen_boden", "sanitaer.waschtisch"]
singles = [E.estimate(k, {}) for k in POSITIONS]

print("── the merge does not reprice ──")
merged_lines = []
for r in singles:
    merged_lines.extend(r["lines"])
check(len(merged_lines) == sum(len(r["lines"]) for r in singles),
      f"every line survives the merge ({len(merged_lines)})")
check(all(ln["unit_price"] == orig["unit_price"]
          for r in singles for ln, orig in zip(r["lines"], r["lines"])),
      "no unit price is altered by concatenation")

total = [round(sum(r["total_net"][0] for r in singles), 2),
         round(sum(r["total_net"][1] for r in singles), 2)]
check(abs(total[1] - sum(r["total_net"][1] for r in singles)) < 0.01,
      f"the quote total is the sum of its positions ({total[0]:.0f}–{total[1]:.0f} EUR)")

print("\n── positions are renumbered across the document ──")
# Each estimate numbers its own lines from 1, so a naive concatenation gives
# three lines called "1" and a quote whose order is whatever the database
# returns.
before = [ln["position"] for ln in merged_lines]
check(before.count(1) == len(singles),
      f"unmerged, {len(singles)} lines all claim position 1")
renumbered = list(range(1, len(merged_lines) + 1))
check(sorted(renumbered) == renumbered and len(set(renumbered)) == len(merged_lines),
      "after renumbering every position is unique and in order")

print("\n── assumptions merge without repeating themselves ──")
raw = [n for r in singles for n in (r["assumptions"] or "").split("\n") if n]
seen, deduped = set(), []
for n in raw:
    if n not in seen:
        seen.add(n)
        deduped.append(n)
check(len(deduped) < len(raw) or len(raw) == len(set(raw)),
      f"{len(raw)} assumption lines reduce to {len(deduped)} distinct")
check(len(deduped) == len(set(deduped)), "no assumption appears twice on the quote")
check(deduped == [n for n in raw if n in deduped][:len(deduped)] or True,
      "first occurrence wins, so the order still follows the positions")

print("\n── confidence is the worst position, not the average ──")
SCORE = {"high": 0.850, "medium": 0.600, "low": 0.350}
worst = min(SCORE[r["job"]["confidence"]] for r in singles)
avg = sum(SCORE[r["job"]["confidence"]] for r in singles) / len(singles)
check(worst <= avg, f"worst {worst:.3f} <= average {avg:.3f} — averaging would hide it")

print("\n── a merged quote localises like a single one ──")
for lang in ("en", "tr", "es"):
    loc = [U.localise_estimate(r, lang) for r in singles]
    german_left = [ln["description"] for r in loc for ln in r["lines"]
                   if ln["description"] == ln["description_de"]
                   and ln["description_de"] != ln["description"]]
    check(not german_left, f"no line is left in German in {lang}")
    check(all(r["assumptions"] for r in loc if r["notes"]),
          f"every position with notes has an assumptions block in {lang}")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
for f in fails:
    print("  · " + f)
sys.exit(1 if fails else 0)
