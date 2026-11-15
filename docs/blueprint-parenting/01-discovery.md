# 01 Discovery (Parenting DACH): Einspringer (working name): employer-paid backup childcare for small and mid-sized firms
Date: 2026-11-15 | Verdict: GO with conditions | Winner R-01 | Runners-up R-04, R-02

## Hunting grounds
**Founder lens:** DACH marketplace builder (ServiceMarket), full-stack + Stripe, German native. Marketplace-shaped pains (matching parents with providers) get a founder-fit bonus.

| # | Ground | Who pays | Sources |
|---|---|---|---|
| P1 | Kita-Platz search and Kita admin (waitlists, Rechtsanspruch, Kita-Gutschein, fees) | parents; Kita operators | r/Eltern, r/de, urbia, Rabeneltern; Kita portals (kita.de, Little Bird) reviews |
| P2 | Elterngeld, Elternzeit, Kindergeld, Mutterschutz paperwork (AT Kinderbetreuungsgeld, CH Mutterschaftsentschädigung) | parents (paid Elterngeld advice, calculators) | r/Eltern, r/Finanzen, elterngeld forums; ElterngeldDigital, Elterngeldrechner apps |
| P3 | Family organisation and mental load; Kita/school communication chaos (Elternbriefe, WhatsApp groups, school apps) | parents | r/Eltern, r/de; FamilyWall, Cozi, OurHome, Kita-Info-App, Stay Informed, Sdui reviews |
| P4 | Separated parents and co-parenting (Wechselmodell, Umgang, expenses, communication) | parents (high WTP; lawyers, mediators) | r/Eltern, r/Scheidung, väteraufbruch forums; 2houses, OurFamilyWizard, Elternplan apps |
| P5 | Baby and toddler routines: sleep, feeding, crying (non-medical) | parents (sleep coaching, courses) | r/Eltern, urbia, BabyCenter DE; Napper, Huckleberry, BabyBuddy, Schlafcoach offers |
| P6 | School transitions and learning support, parent-facing (Übertritt/Gymnasialempfehlung, Nachhilfe costs, homework stress) | parents | r/Eltern, r/Lehrer, schulforen; Nachhilfe platforms, Sofatutor/Studienkreis reviews |
| P7 | Holiday and backup childcare (14 weeks of school holidays vs 30 days of leave, sick-child days, babysitters) | parents; employers | r/Eltern, r/arbeitsleben; Ferienprogramm portals, Babysits, Betreut.de reviews |
| P8 | Working parents and employers: Elternzeit planning, Wiedereinstieg, part-time, employer family benefits | employers (B2B budget); parents | r/arbeitsleben, r/Personaler, r/Eltern; family-service providers (pme Familienservice, Voiio), HR tools |

**Exclusions:** medical, legal and financial advice; apps or accounts for children; gambling; crypto.

## Signal log (summary)
210 signals across 8 grounds, all with link and date. Per-ground tables are in `scan/P1.md` … `scan/P8.md`; notes saved during the scan are in `scan/raw/`.
- **Sources:** Reddit (German subs), Google SERP (urbia, Rabeneltern, BabyCenter, gutefrage, press, official pages), App Store and Google Play DE/AT/CH, Trustpilot, Google Trends DE, and keyword volume (Serpstat g_de).
- **Translation caveat:** Reddit returns German posts as English machine translations, so those quotes are not the original wording. App, Play and forum quotes are verbatim German.

## Pain topics (best per ground)
| R-ID | Topic | Ground | WTP | Saturation | Pays once / recurring | Detail |
|---|---|---|---|---|---|---|
| R-01 | Backup care for sick-child days and Kita closures, paid by the employer | P7 | 5 (employer contracts) | medium (pme serves large firms; KMU underserved [A]) | onboarding once; yearly contract + hours | scan/P7.md T1 |
| R-02 | Gymnasium decision (Übertritt) guide for parents, DE/AT | P6 | 4 | low | one-time 39–99 € | scan/P6.md T1 |
| R-03 | Vetted, credentialed sleep consultants (marketplace) | P5 | 4 | medium | 199–449 € packages | scan/P5.md T1 |
| R-04 | Elternzeit-Fahrplan for KMU employers (+ a kit for parents' requests) | P8 | 4–5 employer / 3 parent | low–medium | workshop once; ~€1k/yr | scan/P8.md T1 |
| R-05 | Kita-Platz cockpit + Tagesmutter gap matching | P1 | 3–4 | low–medium | 199 € letters; matching fees | scan/P1.md T1 |
| R-06 | Care-share and expense evidence record for separated parents | P4 | 3 | low | €7–12/mo; export once | scan/P4.md T1 |
| R-07 | Elterngeld planning for complex households | P2 | 4 | high | one-time 40–329 € | scan/P2.md T1 |
| R-08 | Family inbox for Kita, school and WhatsApp messages | P3 | 3–4 | low but rising | €30–40/yr | scan/P3.md T1 |

## Demand (Google DE, monthly searches; 12-month trend)
| R-ID | Keywords |
|---|---|
| R-01 | kinderkrankengeld 6,600; kinderkrankentage 5,400 (spike in the week of 20.09.2026, when the cut was announced); ferienbetreuung 1,600; babysitter finden 390; notfallmamas 50 |
| R-02 | gymnasialempfehlung 260 (seasonal, Nov–May) |
| R-03 | schlafcoach baby / schlafberatung: no measurable volume (demand runs through Instagram and referrals) |
| R-04 | elternzeit beantragen 18,100 (trend index 57–100, steady); elternzeit arbeitgeber 590; teilzeit nach elternzeit 320 |
| R-05 | kita gutschein 1,300 (CPC €28); tagesmutter finden 260 |
| R-06 | wechselmodell 2,900; wechselmodell unterhalt 2,400 (CPC €11) |
| R-07 | elterngeldrechner 74,000; elterngeld berechnen 9,900 |
| R-08 | familienkalender app 2,900 |

**Policy facts (checked 2026-11-15):**
- **Sick-child days:** the cut from 15 to 10 per child and parent from 1.1.2027 (single parents 30 → 20) happens automatically unless the Bundestag extends the old rule. The health minister rejected an extension on 23.09.2026 ([personalwirtschaft](https://www.personalwirtschaft.de/news/arbeitsrecht/kinderkrankentage-linnemann-plant-kuerzung-ab-2027-209347/), [für-gründer: what employers must plan for](https://www.fuer-gruender.de/blog/kinderkrankentage-2027-arbeitgeber-muessen-mit-weniger-ausfalltagen-rechnen/)) `[E]`.
- **Tax-free employer support:** up to €600 per employee per year for short-term care of children for compelling job-related reasons, § 3 Nr. 34a b EStG ([familienportal.de](https://familienportal.de/familienportal/familienleistungen/steuerentlastungen/welche-arbeitgeberleistungen-zur-besseren-vereinbarkeit-von-familie-und-beruf-sind-steuerfrei--125190), [IHK](https://www.ihk.de/ostwuerttemberg/produktmarken/recht/steuerrecht-neu/kinderbetreuungskosten-6626178)) `[E]`. Holiday care is not covered when the facility is simply closed for holidays ([Haufe](https://www.haufe.de/id/beitrag/verguetungsoptimierung-durch-gehaltsextras-moeglichkeiten-44-steuerfreie-betreuungsleistungen-HI10649173.html)).

## Scorecard (1–5)
| Criterion | R-01 Backup care | R-02 Übertritt guide | R-03 Sleep experts | R-04 KMU Elternzeit | R-05 Kita cockpit | R-06 Co-parent record | R-07 Elterngeld |
|---|---|---|---|---|---|---|---|
| Pain intensity | 4 | 5 | 5 | 3 | 5 | 5 | 4 |
| Frequency | 3 | 1 | 3 | 2 | 2 | 4 | 1 |
| Demand / virality | 4 | 2 | 2 | 3 | 3 | 3 | 5 |
| WTP | 5 | 4 | 4 | 4 | 3 | 3 | 4 |
| Reachability | 3 | 4 | 3 | 3 | 4 | 3 | 4 |
| Gap | 3 | 4 | 3 | 4 | 3 | 4 | 1 |
| Buildable in 6 weeks | 3 (two-sided) | 5 | 3 | 4 | 4 | 4 | 4 |
| Founder fit | 5 (marketplace engine, KMU/Handwerk employers) | 2 | 4 | 3 | 4 | 2 | 2 |
| **Total / 40** | **30** | **27** | **27** | **26** | **28** | **28** | **25** |
| **Brief-weighted** (+WTP +Gap +price level) | **30+5+3+5 = 43** | 27+4+4+2 = 37 | 27+4+3+4 = 38 | **26+4+4+4 = 38** | 28+3+3+3 = 37 | 28+3+4+2 = 37 | 25+4+1+2 = 32 |

**Hard kills:** none.
**Watch items:**
- R-01: the supply side, meaning vetted carers available the same day, and their legal status (freelance vs employed; see the hunt-2 D5 finding on Scheinselbstständigkeit).
- R-03: next to medical advice.
- R-06: next to legal advice (court evidence).
- R-07 is dropped for saturation, and R-08 for weak WTP.

**Verdict:**
- **R-01:** GO with conditions. It is the clear leader: the only topic with WTP 5 that is paid from a business budget, has a hard date (1.1.2027) and is tax-advantaged.
- **R-04:** runner-up. It shares the buyer (KMU employers) and could become module 2.
- **R-02:** runner-up. It is the strongest B2C one-time product: low saturation, emotion 5, but seasonal and low volume.

## Winning concept
**J-01 (→ R-01):** When my child is sick or the Kita is closed and I have no sick-child days left (only 10 from 2027), I want a vetted carer at home within hours, paid by my employer. That way I can work, keep my income and keep my job standing.
- **Current workaround:** unpaid leave (one parent loses "about 100 euros per day" of bonus), grandparents, partners swapping, or calling in sick.

**Wedge:** employer-paid backup childcare for KMU (10–250 staff), starting in one German metro. The employer buys a yearly plan, and employees book a vetted carer for sick-child and closure days through the app, on short notice. Carers hold an extended criminal-record certificate, a first-aid-for-children course and insurance, and give supervision only, no medical care. Billing to the employer is set up to use the €600 tax-free allowance per employee.
- **Not:** a babysitter classifieds site, holiday camps, or nursing.

**One-liner:** For small and mid-sized employers whose staff lose days to sick children and Kita closures, Einspringer is a backup-care service that sends a vetted carer within hours. Unlike pme (built for corporates) or babysitter sites (paywalls, dead profiles), it is a fixed yearly plan sized for KMU and uses the €600 tax-free allowance.

**Pricing hypothesis (once + recurring):**
- **One-time:** setup €490 per employer (policy template, employee onboarding, local carer pool).
- **Recurring:** €15 per eligible parent per month, or €1,490/yr flat for up to 15 parents, including 8 care hours per parent per year. Extra hours are €32/h (carer gets €18–20/h).
- **Anchors:**
  - Notfallmamas yearly contracts: Uni Bremen books 80 h/yr; Gesundheit Nord gives 2 days/month.
  - pme: free to employees, paid by the employer.
  - Babysits Business: €5.49 per user per month.
  - Holiday day camps for employers: €260–280/week.
  - One lost workday for the employer is roughly €200–400 [A].
- **Free tier:** none for employers. Parents can join a waitlist and ask their employer.

**Conditions:**
1. Legal status of carers (employment via Minijob/Teilzeit vs freelance; Arbeitnehmerüberlassung check) before launch.
2. Confirm that § 3 Nr. 34a b covers this model with a Steuerberater.
3. A supply test in one city: ≥ 15 vetted carers able to be on call.

## Riskiest assumptions (top 3)
| # | Type | Assumption | Importance | Evidence | Test |
|---|---|---|---|---|---|
| A1 | Viability | KMU employers (not only corporates) pay a yearly plan | 5 | 3 (contracts exist at universities and hospitals; KMU evidence is inference) | 20 conversations with KMU owners/HR in one city (incl. ServiceMarket Handwerk firms) → ≥ 3 paid pilots (€490 setup) or signed LOIs |
| A2 | Feasibility (supply) | Enough vetted carers can be on call the same day in one metro | 5 | 2 (Notfallmamas operates; supply is the hard side of every care marketplace) | Recruit 15 carers via student job boards and Tagesmütter networks in 14 days; measure response time on 5 test requests |
| A3 | Desirability | Parents trust a stranger with a sick child at home | 4 | 3 (parents use Notfallmamas/pme; Betreut complaints are about the platform, not the idea) | Parent survey via employers plus 5 concierge bookings; ≥ 4 of 5 rebook |

## Content hooks (German)
1. "Ab 2027 nur noch 10 Kinderkrankentage. Und dann?"
2. "Kind krank, Kita zu, Chef wartet: so überbrücken andere Eltern den Tag."
3. "600 € pro Jahr steuerfrei: der Benefit, den kaum ein Mittelständler kennt."
4. "Ein Ausfalltag kostet Sie mehr als ein Jahr Notfallbetreuung."
5. "Wir sind ein Handwerksbetrieb mit 12 Leuten und haben trotzdem Notfall-Kinderbetreuung." (testimonial format after the pilots)

Channels: LinkedIn for KMU owners/HR, IHK/HWK newsletters, ServiceMarket business users, and parents forwarding the offer to their employer.

## Pre-sale test plan
- **Test:** an employer landing page with a founding offer (setup €490 waived, first year €990 for up to 15 parents, refundable if no carer is available) plus 3 concierge pilots in one city.
- **Thresholds (set in advance):** ≥ 3 employers pay or sign an LOI out of 20 conversations within 3 weeks, **and** ≥ 15 carers recruited.
- **Fail:** fewer than 2 employers, or under 8 carers. Then `h:back 1` and promote R-04 (same buyer, no supply side) or R-02.
- **Landing copy (DE):** "Kind krank, Kita zu? Einspringer schickt in wenigen Stunden eine geprüfte Betreuung zu Ihren Mitarbeitenden nach Hause. Fester Jahresplan für Betriebe ab 10 Mitarbeitenden, nutzbar mit dem steuerfreien 600-€-Zuschuss."
- **Outreach (manual, one-to-one):** to KMU owners and HR in one city, starting with existing ServiceMarket business contacts. Clear opt-out.
