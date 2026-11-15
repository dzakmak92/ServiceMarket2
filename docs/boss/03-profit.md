# 03 Profit
Date: 2026-11-15 | treg spent this phase: $0.00 (all inputs come from Phase 1–2 logged calls)

**These are scenarios, not forecasts. The pre-sale tests decide.**

**Assumptions** (benchmarks `[A]`):
- capture of monthly search: 0.5 / 1.5 / 3 %
- community reach rate: 1 / 3 / 6 %
- visit→paid: 1 / 2 / 4 %
- paid months in Year 1: 3 / 5 / 8
- fee: 3 % card on web, 15 % app store
- € → $ at 1.08
- hourly value: $0 (founder unpaid), so payback is immediate whenever net > 0
- all search volumes and community sizes are `[E]` from logged treg calls in the hunts and checks (`docs/boss/checks/*.md`)

The generic model is blind to three things, so read the corrections below the tables:
- outbound B2B sales (I-02)
- a marketplace's demand-side cold start (I-03, I-10)
- community relevance (big generic subreddits inflate I-01, I-05 and I-07)

## Inputs
| I-ID | Concept | Price & model | Search demand /mo | Community reach | Build h `[A]` | Running /mo `[A]` | Fee |
|---|---|---|---|---|---|---|---|
| I-01 | ServiceTitan reconciliation add-on (US) | $99/mo | 1,640 | 140,367 | 200 | $50 | 3% |
| I-02 | Einspringer backup care (DE, B2B outbound) | manual B2B: €490 setup + €1,490/yr plan + €32/extra h | 0 | 0 | 220 | €100 | 3% |
| I-03 | Fair-lead trades marketplace (AT/DE) | €45/mo | 4,290 | 115,268 | 120 | €80 | 3% |
| I-04 | HeizKlar heating billing (DE) | €23/mo + €149 setup | 20,480 | 12,838 | 260 | €80 | 3% |
| I-05 | EU packaging EPR cockpit (DE/AT) | €29/mo + €149 setup | 8,910 | 68,178 | 220 | €60 | 3% |
| I-06 | Co-parenting care-share record (DACH, app) | €7.99/mo | 9,390 | 90,851 | 140 | €30 | 15% |
| I-07 | Freelancer Scheinselbstständigkeit risk file (DE) | €99/mo + €490 setup | 5,900 | 69,300 | 160 | €50 | 3% |
| I-08 | Migration-first spa booking (US) | $149/mo | 2,110 | 57,175 | 400 | $150 | 3% |
| I-09 | Handwerk E-Rechnung inbox (feature) | €9/mo | 2,940 | 64,378 | 60 | €20 | 3% |
| I-10 | Vetted sleep-consultant marketplace (DE) | €60 per booking | 790 | 102,959 | 140 | €40 | 3% |

## Year-1 scenarios (USD; € converted at 1.08 [A])
| I-ID | Buyers L/B/H | Revenue L/B/H | Net L/B/H | Profit score | Adjustment |
|---|---|---|---|---|---|
| I-01 | 15 / 90 / 360 | $4,461 / $44,611 / $285,513 | $3,727 / $42,673 / $276,348 | 4 | — |
| I-02 | 4 / 10 / 20 | $6,489 / $25,812 / $73,483 | $2,480 / $11,853 / $33,617 | 4 | +1 (recurring B2B, WTP 5 evidence) |
| I-03 | 14 / 85 / 338 | $2,056 / $20,559 / $131,577 | $957 / $18,905 / $126,593 | 3 | — |
| I-04 | 14 / 81 / 326 | $3,195 / $23,218 / $117,143 | $2,063 / $21,484 / $112,592 | 4 | — |
| I-05 | 12 / 73 / 292 | $3,100 / $23,173 / $120,124 | $2,230 / $21,701 / $115,743 | 4 | — |
| I-06 | 15 / 88 / 353 | $381 / $3,810 / $24,387 | $-65 / $2,850 / $20,340 | 1 | −1 (low case < 0) |
| I-07 | 10 / 63 / 251 | $8,899 / $66,828 / $347,912 | $7,984 / $64,175 / $336,827 | 5 | +1 (recurring B2B, WTP 5 evidence) |
| I-08 | 7 / 42 / 168 | $3,122 / $31,216 / $199,784 | $1,228 / $28,480 / $191,990 | 4 | — |
| I-09 | 8 / 49 / 197 | $239 / $2,392 / $15,307 | $-27 / $2,061 / $14,588 | 1 | −1 (low case < 0) |
| I-10 | 11 / 65 / 258 | $698 / $4,187 / $16,749 | $159 / $3,543 / $15,728 | 2 | — |

## Combined ranking (40% profit · 30% check · 20% WTP+virality · 10% feasibility)
| Rank | I-ID | Concept | Profit /5 | Check /35 | WTP+viral /10 | Feasibility /5 | Build h | Combined /100 |
|---|---|---|---|---|---|---|---|---|
| 1 | I-07 | Freelancer Scheinselbstständigkeit risk file (DE) | 5 | 25 | 8 | 4 | 160 | **85.4** |
| 2 | I-02 | Einspringer backup care (DE, B2B outbound) | 4 | 24 | 9 | 3 | 220 | **76.6** |
| 3 | I-03 | Fair-lead trades marketplace (AT/DE) | 3 | 28 | 9 | 4 | 120 | **74.0** |
| 4 | I-05 | EU packaging EPR cockpit (DE/AT) | 4 | 23 | 8 | 3 | 220 | **73.7** |
| 5 | I-04 | HeizKlar heating billing (DE) | 4 | 23 | 8 | 2 | 260 | **71.7** |
| 6 | I-08 | Migration-first spa booking (US) | 4 | 20 | 8 | 2 | 400 | **69.1** |
| 7 | I-01 | ServiceTitan reconciliation add-on (US) | 4 | 19 | 7 | 2 | 200 | **66.3** |
| 8 | I-10 | Vetted sleep-consultant marketplace (DE) | 2 | 22 | 6 | 4 | 140 | **54.9** |
| 9 | I-09 | Handwerk E-Rechnung inbox (feature) | 1 | 23 | 8 | 4 | 60 | **51.7** |
| 10 | I-06 | Co-parenting care-share record (DACH, app) | 1 | 21 | 6 | 4 | 140 | **46.0** |

## Input notes
- **I-01:** search: servicetitan pricing/reviews/api/alternatives/quickbooks, HCP vs ST; community: r/Bookkeeping, r/QuickBooks, r/quickbooksonline
- **I-02:** manual model, see below
- **I-03:** price = ~1 won job/month at a €45 average fee (tiers €19/49/99); search: myhammer erfahrungen/kosten/alternative, aufträge für handwerker, handwerker aufträge finden; community: r/Handwerker
- **I-04:** price = 8 units × €2.90; search: heizkostenabrechnung, heizkostenverteiler, techem alternative, selbst erstellen; community: r/Vermieten
- **I-05:** search: verpackungsgesetz, verpackungslizenz, lizenzero, verpackungsregister, verpackungsverordnung eu; community: r/selbststaendig, r/Kleinunternehmer
- **I-06:** search: wechselmodell, umgangsrecht, wechselmodell unterhalt, unterhaltsrechner wechselmodell, mehr-/sonderbedarf; community: r/Eltern, r/vaeter; 15% store fee
- **I-07:** search: statusfeststellungsverfahren, scheinselbstständigkeit (+kriterien), about half from freelancers; community: r/selbststaendig, r/Unternehmer
- **I-08:** search: salon/spa software, mindbody/vagaro alternatives; community: r/MassageTherapists, r/MedSpa, r/gymowner
- **I-09:** search: xrechnung validator, e rechnung empfangen/datev, zugferd viewer; community: r/selbststaendig; in practice limited to ServiceMarket users
- **I-10:** price = 20% commission on a €299 package; search: babyschlaf, schlafberaterin, schlafberatung online (database gaps); community: r/Eltern, r/schwanger

## I-02 manual B2B model (the search model can't see outbound sales)
- **Funnel:** 200 KMU contacted in Year 1 (ServiceMarket business contacts, IHK/HWK, LinkedIn) → close 2 / 5 / 10 % = 4 / 10 / 20 employers `[A]`.
- **Revenue per employer:** €490 setup + €124/mo plan × paid months + 20 / 40 / 60 extra hours at €32 `[A]`.
- **Margin:**
  - The plan keeps about 46 % after carer pay: 8 h per parent included × 10 parents × 50 % use × €20/h `[A]`.
  - Extra hours keep €12/h.
  - Running cost €100/mo covers insurance and admin for background checks `[A]`.
- **Anchor:** Notfallmamas sells small-firm plans "from a low four-figure sum" per year `[E]` (checks/I-02.md).

## Corrections the formula misses
| I-ID | Correction | Direction |
|---|---|---|
| I-03 | **The upside is understated, but so is the risk.** It reuses the existing ServiceMarket product (120 h, the lowest build), so its margin starts early. Revenue is capped by homeowner jobs in the launch city, not by trade sign-ups. The Vienna test (≥ 15 awarded jobs in 6 weeks) is the real gate. At €45 per won job, 100 jobs a month ≈ €54k/yr `[A]`. | wider range |
| I-07 | r/selbststaendig is mostly freelancers, not agency buyers, and about half the search intent comes from freelancers, so the base case is likely **overstated by ~2×** → ~$32k, still profit score 4 (5 with the adjustment). Agency count in DE is large `[A]`; LinkedIn and partner channels dominate. | down |
| I-01 | r/Bookkeeping and r/QuickBooks are generic; only ServiceTitan-serving bookkeepers buy. API partner gating can zero it. The base case is **likely overstated 3–5×**. | down |
| I-05 | The Omnibus suspension of the representative duty for small firms could shrink the pain mid-year; registration and fees stay. | down risk |
| I-04 | heidisystems runs SEO landing pages in ~25 cities, so capture of the head terms is likely at the low end. | down |
| I-08 | US market from DACH, high CPC, and the card-migration risk could make it a kill. | down risk |

## Gate 3 check
- [x] Every surviving idea has inputs, three scenarios and a profit score
- [x] Benchmarks tagged `[A]`; evidence inputs come from logged treg calls (Phase 1–2)
- [x] Combined ranking shown with weights (re-weightable)
- [ ] User approves or re-weights
