import sys; sys.path.insert(0, '.')
from maler_deep import MALER_DEEP
from boden_deep import BODEN_DEEP
from trades import ALL as CORE
from wide1 import BAUEN, TISCHLER, KUECHE
from wide2 import GARTEN, FENSTER, DACH
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

ALL_JOBS = (MALER_DEEP + BODEN_DEEP + CORE + SANITAER_DEEP + ELEKTRIK_DEEP + BAUEN + TISCHLER + KUECHE + GARTEN + FENSTER +
            DACH + HEIZUNG + UMZUG + REINIGUNG + POLSTER + SOLAR + MONTAGE +
            GUTACHTER + FAHRZEUGE)
