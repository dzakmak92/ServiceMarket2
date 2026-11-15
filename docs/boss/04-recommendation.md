# 04 Recommendation
Date: 2026-11-15
- **treg spent in boss:** $0.060 of $0.38 approved ($0.058 for checks, $0.002 for verification).
- **Source verification:** 12 key sources re-read on the live pages on 2026-11-15 (`04-verification.md`): 8 confirmed, 3 changed, 1 unverified. Changes are applied below.
- **Hunt spend before boss:** $0.449.
- **Diversity check:** the top 3 of the combined ranking serve different buyers and jobs (agencies using freelancers; KMU employers with parent staff; trades and homeowners), so no swap was needed.

## The 3 to build
| R | I-ID | App | Year-1 net (base) | Check /35 | Combined /100 | Pre-sale test |
|---|---|---|---|---|---|---|
| R-1 | I-07 | Freelancer-Einsatz risk file for agencies (DE) | ~$64k (model); ~$32k after the audience correction | 25 | 85.4 | ≥ 5 agencies pay a €490 founding audit, from 40 conversations in 3 weeks |
| R-2 | I-02 | Einspringer: employer-paid backup childcare for KMU | ~$12k | 24 | 76.6 | ≥ 3 KMU pay for a pilot (or 5 LOIs) **and** ≥ 15 vetted carers, in 1 metro in 3 weeks |
| R-3 | I-03 | Fair-lead trades marketplace: one firm per job, fee only on award (ServiceMarket repositioned) | ~$19k (capped by homeowner demand) | 28 | 74.0 | Vienna: ≥ 15 jobs awarded through the platform in 6 weeks (kill < 5) |

## R-1 · I-07 Freelancer-Einsatz risk file
- **One line:** For German agencies and SMBs using 5–50 freelancers, a per-engagement Scheinselbstständigkeit risk file that monitors how each engagement actually runs (duration, exclusivity, billing model, integration), keeps the evidence and flags drift. Unlike 9am Compliance Hub or law-firm checklists, it watches the live signals rather than storing documents, and it gives indicators, never a verdict.
- **Why it's on the list:**
  - Profit score 5 (base ~$64k model, ~$32k corrected)
  - Check 25/35
  - WTP 5 (business budget)
- **Evidence:**
  1. An agency with 35 freelancers and a lawyer engaged puts the exposure at ~€110k per freelancer over 4 years, plus personal liability under § 266a StGB (`scan/D5.md`, `checks/I-07.md`) `[E]`.
  2. An event firm asks "Is there even any software that properly handles this…?" (r/Veranstaltungstechnik; `scan/D5.md`) `[E]`.
  3. The main competitor, 9am Compliance Hub, costs €79–299+/mo and has 0 OMR reviews: priced, but no visible traction (`checks/I-07.md`) `[E]`.
- **Price and model:** a €490 founding audit of the freelancer pool (one-time), then €99/mo up to 25 freelancers and €199/mo up to 50 `[A]`.
- **Riskiest assumption:** agencies pay for monitoring even though their lawyers say paperwork alone doesn't decide status (importance 5, evidence 2).
- **Pre-sale test:**
  - Pitch 40 agency MDs and HR leads (LinkedIn, r/Unternehmer, VGSD, 3 tax-adviser or labour-law partners).
  - Offer the founding audit for €490 (refundable if the product isn't delivered).
  - **Pass:** ≥ 5 paid in 3 weeks. **Fail:** < 2 → `b:handoff R-2`.
- **Build size:** ~160 h.
  - **In:** criteria catalogue (DRV/BSG indicators per engagement), document vault with expiry reminders, engagement timeline (duration, share of revenue, exclusivity flags), audit-trail export for the lawyer.
  - **Left out:** filing the Statusfeststellung, AT/CH, ATS/VMS integrations, the 2028 reform module.
- **RDG guard:** a generic catalogue filled in by the client, traffic lights per criterion, no status verdict, a "send to your lawyer" export, and a partner law firm for individual checks. This follows the BGH Smartlaw reasoning.
- **Red team:** "Agencies will buy a €190 lawyer consultation once a year and a spreadsheet, not a subscription. And if the 2028 reform makes clients withhold contributions anyway, the risk file's urgency vanishes."

## R-2 · I-02 Einspringer
- **One line:** For KMU (10–250 staff) whose employees lose days to sick children and Kita closures, a yearly backup-care plan that sends a vetted carer home within hours, billed using the €600 tax-free allowance. Unlike pme (built for corporates; it now guarantees next-day back-up care for calls up to 18:00, per verification) or babysitter sites (paywalls, dead profiles), it is sized and priced for small firms. Same-day booking has to be the edge, because next-day is already pme's promise.
- **Why it's on the list:**
  - Profit score 4 (~$12k base, with the +1 adjustment for recurring B2B)
  - Check 24/35
  - WTP 5
- **Evidence:**
  1. Sick-child days drop from 15 to 10 per child and parent on 1.1.2027, and the minister rejected an extension on 23.09.2026 `[E]`.
  2. § 3 Nr. 34a b EStG allows up to €600 per employee per year tax-free for short-term care for compelling job reasons (familienportal.de) `[E]`.
  3. Notfallmamas sells yearly employer contracts and has a separate small-firm price list from a "low four-figure sum" (`checks/I-02.md`) `[E]`.
- **Price and model:** €490 setup, then €1,490/yr flat for up to 15 parents (8 h per parent included) or €15 per parent per month; extra hours €32 `[A]`.
- **Riskiest assumption:** KMU, not just large or public employers, will prepay a yearly plan (importance 5, evidence 2). Second: carer supply and their employment status.
- **Pre-sale test:**
  - Pick 1 metro without Notfallmamas.
  - In 3 weeks: 30 KMU conversations (ServiceMarket business contacts, IHK/HWK, LinkedIn) plus carer recruiting.
  - **Pass:** ≥ 3 paid pilots (founding first year €990) or 5 signed LOIs, **and** ≥ 15 vetted carers.
  - **Fail:** < 2 employers or < 8 carers.
- **Build size:** ~220 h, reusing ServiceMarket's bookings, ETA, chat, ratings and Stripe.
  - **Left out:** AT/CH, holiday camps, nursing care, a native app (PWA only).
- **Gates before the first booking:** an employment-status and AÜG opinion, liability insurance, and a Steuerberater's confirmation of the § 3 Nr. 34a b treatment.
- **Red team:** "Supply collapses exactly when demand peaks: the winter infection wave hits every client at once, and carers get sick too. A KMU won't renew after one 'no carer available' morning."

## R-3 · I-03 Fair-lead trades marketplace
- **One line:** For trades fed up with paying for shared and ghost contacts, a marketplace where each job goes to one firm and the fee is due only when the job is awarded. Unlike MyHammer (paid per shared contact; €17–80 according to pro reviews, while the official page names no price) or CHECK24 Profis (pay per interest), the trade pays only for won work. It runs on the existing ServiceMarket.
- **Why it's on the list:**
  - Highest check score (28/35), lowest build (~120 h), founder fit 5
  - Profit score 3 (base ~$19k, but uncapped upside if liquidity works)
- **Evidence:**
  1. About 28 of 50 MyHammer pro-app reviews complain about paying €17–80 per shared contact; several ask for "Gebühr nur bei Auftragsvergabe" (`checks/I-03.md`) `[E]`.
   - The €17–80 range comes from reviews only; MyHammer's official page names no amount (verification: unverified).
   - The often-quoted "€120 per won job" (Baulisten) is a worked example, not a range (changed).
  2. Angi's booked-job pro app rates 4.55★ (38,238 ratings) against 3.94★ (39,577) for its lead app `[E]`.
  3. "myhammer kosten" gets 1,300/mo and "myhammer alternative" 480/mo in DE; r/Handwerker has 115k members, and "Ist MyHammer echt meine einzige Möglichkeit?" got 144 up / 215 comments `[E]`.
- **Price and model:** a success fee per awarded job, tiered €19 / €49 / €99 by job size, collected in-flow through a Stripe deposit. No subscription, no minimum term `[A]`.
- **Riskiest assumptions:**
  - Demand-side cold start in the launch city (importance 5, evidence 2).
  - Fee leakage once trade and customer are in contact (importance 5, evidence 2).
- **Pre-sale test:** a Vienna liquidity test over 6 weeks, with homeowners recruited through local small-job posts and trades from ServiceMarket plus "MyHammer-Alternative" pages.
  - **Pass:** ≥ 30 verified trades, ≥ 40 real jobs posted, ≥ 15 awarded in-platform.
  - **Kill or pivot:** < 5 awarded.
  - **Switch to a flat fee** if more than 40% of contacts go dark after the first chat.
- **Build size:** ~120 h on the existing app.
  - **In:** single-firm matching, award confirmation, Stripe Connect deposit and fee capture, AT trade-licence check, new positioning and landing pages.
  - **Left out:** DE rollout, ads.
- **Red team:** "Homeowners go where the trades already are (MyHammer: 3M customers, 80k jobs/month). Without paid acquisition you can't fill Vienna, and with it the €19–99 fee doesn't cover the CAC. Free 'fair' rivals (Hilfreno, WerkFinder) already promise the same."

## What to do this week
1. **Pre-sell R-1 first.** It needs no supply side and no build, and 40 B2B conversations give a clear answer in 3 weeks. It also has the highest profit case.
2. **Start R-3's Vienna test in parallel**, because the product already exists. Spend about 2 days repositioning ServiceMarket (one firm per job, fee on award) and recruiting the first 30 trades. It is the cheapest test to run, and it improves the product you already have even if R-1 wins.
3. **Hold R-2** until R-1 reports. Its test needs 3 parallel tracks (employers, carers, a legal and tax opinion). If R-1 fails, run R-2's test next.
4. When a test passes, `b:handoff` that pick to write the manager files (`PROJECT_IDEA.md`, `docs/blueprint/01-validation.md`, `STATE.md`) and start building in manager Phase 2.
