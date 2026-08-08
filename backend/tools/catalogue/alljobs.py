import sys; sys.path.insert(0, '.')
import axes
import pricing
from schema import validate_questions
from maler_deep import MALER_DEEP
from boden_deep import BODEN_DEEP
from garten_deep import GARTEN_DEEP
from trades import ALL as CORE
from wide1 import BAUEN, TISCHLER, KUECHE
from wide2 import FENSTER, DACH
from wide3 import HEIZUNG, UMZUG, REINIGUNG, POLSTER, SOLAR, MONTAGE, GUTACHTER
from wide4 import FAHRZEUGE
from sanitaer_deep import SANITAER_DEEP
from elektrik_deep import ELEKTRIK_DEEP

# Groups the core file predates the group/segment fields; tag them here so the
# catalogue lines up with business_directory."group" for prospect matching.
GROUP_FIX = {
    "maler": ("Maler & Tapezierer", "Maler & Lackierer"),
    "fliesen": ("Boden & Fliesen", "Fliesenleger"),
    "sanitaer": ("Sanitär", "Sanitär- / Klempner"),
    "elektrik": ("Elektrik", "Elektriker"),
    "trockenbau": ("Trockenbau & Verputzen", "Trockenbauer"),
    "abriss": ("Abriss & Entsorgung", "Abrissunternehmen"),
}
for j in CORE:
    if not j.group:
        j.group, j.segment = GROUP_FIX.get(j.trade, ("", ""))

ALL_JOBS = (MALER_DEEP + BODEN_DEEP + GARTEN_DEEP + CORE + SANITAER_DEEP + ELEKTRIK_DEEP + BAUEN + TISCHLER + KUECHE + FENSTER +
            DACH + HEIZUNG + UMZUG + REINIGUNG + POLSTER + SOLAR + MONTAGE +
            GUTACHTER + FAHRZEUGE)

# Condition and access are not written into the job definitions. They are the
# two questions every job is asked, so they are assigned in one place — see
# `axes.py` for what an axis is and why the wording had to stop being the same
# for a lawn and a bathroom. `validate` fails the build on a typo rather than
# letting a job quietly keep the building wording.
axes.validate(ALL_JOBS)
for j in ALL_JOBS:
    j.condition_axis, j.access_axis = axes.axes_for(j)

# No job may carry its own condition or access question any more: the survey
# builds both from the axis, and a hand-written one would render twice — which
# is how `boden.parkett_schleifen` came to show two consecutive steps both
# headed "Zustand", meaning different things.
_own = [(j.key, q.key) for j in ALL_JOBS for q in j.guided_form
        if q.key in ("condition", "access") or q.affects in ("condition", "access")]
assert not _own, f"condition/access belong to the axis, not the job: {_own}"

# What each answer costs. Assigned centrally for the same reason the axes are:
# the tables are worth more when the whole trade can be read down one column
# than when each number sits beside the job it happens to belong to.
_unused = pricing.apply(ALL_JOBS)
assert not _unused, (
    "pricing entries that matched no question — a renamed question stops being "
    f"priced silently: {_unused}")

# What each answer is allowed to do to the price. See `Question` in schema.py:
# the rule that matters is that the default answer costs nothing, because every
# market band in the catalogue was validated with no answers given.
validate_questions(ALL_JOBS)
