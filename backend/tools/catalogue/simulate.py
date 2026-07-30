import sys, json, statistics as st
sys.path.insert(0, '.')
from itertools import product
from alljobs import ALL_JOBS
from engine import estimate
from schema import COND_UPLIFT, ACCESS_UPLIFT, BAUSCHUTT_KG_PER_M3

JOBS = ALL_JOBS
CONDS = list(COND_UPLIFT); ACCS = list(ACCESS_UPLIFT)
TIERS = ["basic", "standard", "premium"]; COUNTRIES = ["AT", "DE"]

rows = []
for j in JOBS:
    lo, hi = j.typical_size
    sizes = sorted({round(lo,1), round((lo+hi)/2,1), round(hi,1), round(hi*2,1)})
    for q, c, cond, acc, tier in product(sizes, COUNTRIES, CONDS, ACCS, TIERS):
        r = estimate(j, q, country=c, condition=cond, access=acc, tier=tier)
        rows.append({"job": j.key, "trade": j.trade, "unit": j.unit, "qty": q,
                     "country": c, "condition": cond, "access": acc, "tier": tier,
                     "h_lo": r["hours"][0], "h_hi": r["hours"][1],
                     "eur_lo": r["total"][0], "eur_hi": r["total"][1],
                     "pu_lo": r["per_unit"][0], "pu_hi": r["per_unit"][1],
                     "debris_lo": r["debris_kg"][0], "debris_hi": r["debris_kg"][1]})

print(f"SCENARIOS SIMULATED: {len(rows):,}  across {len(JOBS)} job types\n")

# ── 1. The small-job premium — the product's core claim ───────────────
print("1) SMALL-JOB PREMIUM  (€/unit at smallest vs largest size, AT, reno leer)")
print(f"   {'job':32} {'small':>9} {'large':>9}  premium")
prem = []
for j in JOBS:
    if j.band_basis != "per_unit": continue
    lo, hi = j.typical_size[0], j.typical_size[1]*2
    a = estimate(j, lo, country="AT"); b = estimate(j, hi, country="AT")
    ma = (a["per_unit"][0]+a["per_unit"][1])/2; mb = (b["per_unit"][0]+b["per_unit"][1])/2
    prem.append((ma/mb, j.key, ma, mb))
for ratio, key, ma, mb in sorted(prem, reverse=True):
    print(f"   {key:32} {ma:8.1f} {mb:8.1f}   ×{ratio:.2f}")
print(f"   median premium ×{st.median(p[0] for p in prem):.2f}")

# ── 2. Uncertainty — where the survey earns its keep ──────────────────
print("\n2) UNCERTAINTY  (hi/lo spread at typical size — high = ask more questions)")
unc = []
for j in JOBS:
    q = sum(j.typical_size)/2
    r = estimate(j, q, country="AT")
    unc.append((r["total"][1]/r["total"][0], j.key))
for ratio, key in sorted(unc, reverse=True)[:8]:
    print(f"   {key:32} ×{ratio:.2f}")

# ── 3. Debris and container sizing ────────────────────────────────────
print("\n3) DEBRIS  (kg at typical size; weight binds before volume)")
for j in JOBS:
    q = sum(j.typical_size)/2
    r = estimate(j, q, country="AT")
    if r["debris_kg"][1] < 1: continue
    kg = r["debris_kg"]
    m3 = (kg[0]/BAUSCHUTT_KG_PER_M3[1], kg[1]/BAUSCHUTT_KG_PER_M3[0])
    cont = ("Big Bag" if kg[1] <= 1000 else "3 m³ Mulde" if kg[1] <= 3500 else "7 m³ Mulde")
    print(f"   {j.key:32} {q:5.0f} {j.unit:4} {kg[0]:6.0f}..{kg[1]:6.0f} kg "
          f"= {m3[0]:4.1f}..{m3[1]:4.1f} m³  → {cont}")

# ── 4. DE vs AT ───────────────────────────────────────────────────────
print("\n4) DE vs AT  (same job, same conditions — labour rate difference)")
diffs = []
for j in JOBS:
    q = sum(j.typical_size)/2
    a = estimate(j, q, country="AT"); d = estimate(j, q, country="DE")
    ma = (a["total"][0]+a["total"][1])/2; md = (d["total"][0]+d["total"][1])/2
    diffs.append((md/ma, j.key))
print(f"   DE / AT median ×{st.median(x[0] for x in diffs):.3f}  "
      f"(range ×{min(x[0] for x in diffs):.2f} .. ×{max(x[0] for x in diffs):.2f})")

# ── 5. Tier spread ────────────────────────────────────────────────────
print("\n5) TIER SPREAD  (basic → premium, where the catalogue defines options)")
for j in JOBS:
    q = sum(j.typical_size)/2
    vals = [ (estimate(j,q,country='AT',tier=t)['total'][0]
             +estimate(j,q,country='AT',tier=t)['total'][1])/2 for t in TIERS]
    if vals[2] > vals[0]*1.02:
        print(f"   {j.key:32} {vals[0]:8.0f} → {vals[1]:8.0f} → {vals[2]:8.0f} €"
              f"  ×{vals[2]/vals[0]:.2f}")
