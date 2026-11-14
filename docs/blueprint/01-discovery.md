# 01 Discovery: (winner pending user choice)
Date: 2026-11-14 | Verdict: GO with conditions (top 3 within 2 points; user to pick)

## Hunting grounds

**Founder lens:** built a trades marketplace with pricing catalogue, invoicing, tax and PM toolkits (AT/DE); full-stack + Stripe; multilingual. Pains in trades / home services get a founder-fit bonus.

**Regions:** USA, Europe (UK, DACH, EU), Australia. App Store / Play reviews pulled from US, GB, DE and AU storefronts; Reddit regional subs included.

Selection rule (user, 2026-11-14): hunt where pain is high, solutions are missing or failing, prices are medium-high and willingness to pay is high. Grounds are therefore weighted toward businesses and prosumers who bill time to clients; two B2C grounds kept where spend per event is large.

| # | Ground | Type | Why WTP may be high | Source map |
|---|---|---|---|---|
| G1 | Trades & home-service businesses (quoting, scheduling, invoicing, getting paid) | B2B | revenue tool; incumbents $50–$300/mo | r/Contractor, r/electricians, r/Plumbing, r/HVAC, r/sweatystartup, r/AusTradies, r/UKBuilders; Jobber, ServiceM8, Tradify, Housecall Pro reviews |
| G2 | Freelancers & small agencies (proposals, scope creep, getting paid) | B2B | billable hours lost | r/freelance, r/agency, r/web_design, r/graphic_design; HoneyBook, Bonsai, Dubsado reviews |
| G3 | Accounting, bookkeeping & tax practices (client docs, workflow, busy season) | B2B | firms pay per seat; hours = money | r/Accounting, r/Bookkeeping, r/taxpros, r/CPA, r/AusFinance pros; Karbon, TaxDome, Canopy, Xero Practice Manager reviews |
| G4 | Small landlords & property managers (rent, maintenance, compliance) | Prosumer B2B | rent at stake; tax-deductible | r/Landlord, r/LandlordUK, r/realestateinvesting, r/AusPropertyChat; TurboTenant, Landlord Studio, Buildium, Arthur reviews |
| G5 | Construction subcontractors & small GCs (change orders, pay apps, retainage, compliance docs) | B2B | large invoices, cash-flow pain | r/Construction, r/ConstructionManagers, r/Contractor; Procore, Buildertrend, CoConstruct, Fieldwire reviews |
| G6 | Appointment-based practices: salons, physio, therapists, trainers (no-shows, booking, admin; no clinical advice) | B2B | each no-show is lost revenue | r/salons, r/hairstylist, r/physicaltherapy, r/therapists (admin only), r/personaltraining; Vagaro, Fresha, Jane, Mindbody, SimplePractice reviews |
| G7 | Homeowners renovating or hiring tradespeople | B2C | spend per project in the thousands | r/HomeImprovement, r/HomeOwners, r/DIYUK, r/AusRenovation; Angi, Thumbtack, Checkatrade, hipages, MyHammer reviews |
| G8 | Job seekers & career switchers (applications, ATS, interviews) | B2C | people pay $20–50/mo while searching | r/jobs, r/recruitinghell, r/jobsearchhacks, r/cscareerquestions, r/AusJobs, r/UKJobs; Teal, Jobscan, Huntr, LinkedIn Premium reviews |

**Exclusions:** medical, legal, financial advice (G5 stays on admin/tooling, not advice); gambling; crypto; children's accounts.

## Signal log (summary)
523 Reddit posts, 22 comment threads and 145 App Store reviews collected (treg, 2026-11-14) across 8 grounds and 4 regions (US, UK, AU, DE).
After removing off-topic and vendor/research posts, 194 signals were logged with links and dates; per-ground tables are in `scan/G1.md` … `scan/G8.md`, raw data in `scan/raw/`.
Platforms: Reddit (≈70 subreddits), Apple App Store (US/GB/AU), Trustpilot (TaxDome), web search for pricing. TikTok and Google Play were not pulled; that weakens the shareability scores.
Bias control: 132 vendor/research posts were excluded. They are counted as "builder saturation".

## Pain topics (cross-ground; best topic per ground plus strong runners-up)
| P-ID | Topic (users' words) | Ground | Sources | Workaround | Detail |
|---|---|---|---|---|---|
| P-01 | "$1500/year for only 150 active accounts": TaxDome per-client repricing breaks small-firm economics and prospect intake | G3 | 8 threads, 3 subs + Trustpilot | stay on legacy plan, then move to Karbon/Canopy/Financial Cents; shared folders for prospects | scan/G3.md T1 |
| P-02 | Trades pay for shared, fake or ghosting leads and the platform won't refund | G7 | 20 threads, 14 subs, US/UK/AU/DE | keep paying, card disputes, wait out 12-month contracts, move to Google and word of mouth | scan/G7.md T1 |
| P-03 | Booking and practice software price creep, add-ons, lock-in (multi-staff spas, salons, studios) | G6 | 19 threads, 10 subs | switch between incumbents, pay export fees | scan/G6.md T1 |
| P-04 | ServiceTitan and ServiceTrade failing mid-market HVAC and electrical shops | G1 | 8 threads, 6 subs | put up with it, parallel QuickBooks, Excel | scan/G1.md T1 |
| P-05 | Subcontractors not getting paid: retainage frozen, claims under-certified, statutory payment claims (SOPA, Construction Act) | G5 | 6 threads, 6 subs (US/AU/NZ/UK/SG) + 5 lien threads | lawyers, DIY adjudication, liens, eat the loss | scan/G5.md T1 |
| P-06 | Paying for AI job tools (auto-apply, ATS score, copilot) that don't get interviews | G8 | 13 threads, 9 subs + 20 reviews | cancel, refund fights, back to networking | scan/G8.md T1 |
| P-07 | Rental bookkeeping and tax prep for landlords with about 5–30 units (Schedule E, MTD, Nebenkosten) | G4 | 6 threads + reviews | Excel, QBO/QB Enterprise, Stessa, accountant | scan/G4.md T2 |
| P-08 | All-in-one freelancer CRM price rises and lock-in (HoneyBook, FreshBooks) | G2 | 7 threads + 25 reviews | pay for 2 CRMs during switch, Dubsado | scan/G2.md T3 |

## Loud & spreading (1–5)
| P-ID | Volume | Spread | Momentum | Emotion | Shareability |
|---|---|---|---|---|---|
| P-01 | 5 | 2 | 2 (10-day spike after 2026-11-02 repricing; the underlying practice-management cost pain recurs all year) | 5 | 3 |
| P-02 | 4 | 5 | 4 (recurring for years; FTC action 2023) | 4 | 4 |
| P-03 | 5 | 4 | 3 | 5 | 3 |
| P-04 | 3 | 3 | 3 | 5 | 3 |
| P-05 | 2 (5 with lien threads) | 4 | 3 | 4 | 3 |
| P-06 | 3 | 4 | 4 | 4 | 4 |
Momentum and shareability are `[A]`: they are estimated from post dates and engagement, without Trends or TikTok data, because the paid budget was nearly used.

## Willingness to pay
| P-ID | Ladder | Best evidence | Price anchors |
|---|---|---|---|
| P-01 | 5 | "$5,000 more than we pay this year"; "$800/year → $1500/year" (r/taxpros) | TaxDome from $1,500/yr per 150 accounts; Karbon $59–89/user/mo |
| P-02 | 5 | "£390 a month", "$3,400 for 7 jobs", "$56-$64" per lead | Angi $15–85+/lead; Checkatrade ~£390/mo; Thumbtack $8–150/lead |
| P-03 | 4 (near 5) | 8–10-staff practices shopping with budget; SimplePractice $29→$49 | Mindbody $79–699/mo; Fresha 20% of first booking |
| P-04 | 4 | firms leaving ServiceTitan | $250–500/tech/mo + $5–50k setup `[A]` secondhand |
| P-05 | 3 | subs pay lawyers and adjudication time; others offered to pay the person who won a $23k SOPA claim | Payapps (AU/UK, per-claim fee subs complain about); Siteline custom; Knowify $99–329/mo |
| P-06 | 4 (counter-signal: 9/20 reviews object to paying while unemployed) | $49.95/mo Jobscan; "$639" in 78 days | Teal, Jobscan, Final Round $30–150/mo |

## Incumbents and gap (top 5)
- **P-01:** TaxDome (repriced), Karbon, Canopy, Financial Cents, Content Snare, Liscio. Gap: flat, predictable pricing and free intake for prospects and seasonal clients. The landing spots are ready, and saturation is rising.
- **P-02:** Angi/HomeAdvisor, Thumbtack, Checkatrade, hipages, MyHammer on the platform side. Lead-tracking and auto-response tools already sell to trades (LeadTruffle, NextPhone, ShiftFlow and others: [web](https://www.getnextphone.com/blog/angi-leads-for-contractors)). Gap: a lead source that is not shared and not pay-per-lead. That is a marketplace with a demand-side cold start, not a quick SaaS.
- **P-03:** Mindbody, Vagaro, SimplePractice, Fresha, Booksy; switching targets Mangomint, GlossGenius, Boulevard, Sessions Health. Gap: painless migration and data export. The category is crowded.
- **P-04:** ServiceTitan, ServiceTrade, FieldEdge, BuildOps, Housecall Pro MAX. Gap: reliable tech closeout and accounting sync. Replacing a full field-service management platform is a very large build.
- **P-05:** Payapps (AU and UK statutory claims, head-contractor-led, per-claim fee: [payapps.com](https://payapps.com/)), SOPA Toolbox (lawyer-built deadline app), Siteline and Textura (US pay applications), Levelset (US liens). Gap: a sub-side tool for owner-operator subcontractors, covering claim, deadline, payment notice and adjudication steps across regimes. It is narrower than first thought ("nobody covers AU/UK" was wrong).

## Scorecard (1–5)
| Criterion | P-02 Leads | P-04 FSM mid-market | P-05 Sub payment | P-01 TaxDome exodus | P-06 AI job tools | P-03 Booking SW |
|---|---|---|---|---|---|---|
| Pain intensity | 4 | 5 | 5 | 4 | 4 | 4 |
| Frequency | 4 | 5 | 3 | 3 | 4 | 4 |
| Virality | 4 | 3 | 3 | 3 | 4 | 4 |
| WTP | 5 | 4 | 3 | 5 | 3 | 4 |
| Reachability | 4 | 3 | 3 | 4 | 4 | 3 |
| Gap vs best incumbent | 2 | 3 | 3 | 3 | 2 | 2 |
| Buildable in 6 weeks | 2 | 1 | 4 | 3 | 4 | 2 |
| Founder fit | 5 | 4 | 4 | 2 | 1 | 2 |
| **Total / 40** | **30** | **28** | **28** | **27** | **26** | **25** |

Hard kills: none outright. Watch items:
- **P-01:** close to the "single spike" rule; it is rescued only by the recurring practice-management cost pain.
- **P-02:** an app alone doesn't fix it, because the lead *model* is the problem. It needs a marketplace or a pricing-model change.
- P-07 and P-08 are below 24 and are dropped. P-06 is weak on founder fit.

**Verdict:** no clear runaway; the top 3 are within 2 points.
- **P-02 (30):** GO with conditions. Fix the gap (a non-shared, non-pay-per-lead model) and buildability (it may be the existing ServiceMarket marketplace, repositioned).
- **P-05 (28):** GO with conditions. Test willingness to pay in software (level 3 → 4) and confirm subs will pay instead of the head contractor.
- **P-04 (28):** GO with conditions. Needs a narrow wedge, because a full field-service platform is out of scope.
- P-01 is the time-boxed alternative: the window closes before the January busy season.

Winner: **pending user choice** (see STATE.md open questions).
