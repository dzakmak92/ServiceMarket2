# 01 Discovery (DACH B2B): HeizKlar (working name): heating-cost billing and monthly UVI without a Messdienst contract
Date: 2026-11-15 | Verdict: GO with conditions | Winner Q-01 | Runners-up Q-02, Q-03

## Hunting grounds
**Founder lens:** trades marketplace for AT/DE (pricing catalogue, invoice/tax/PM toolkits), full-stack + Stripe, German native, GDPR/DSG. Trades/Handwerk pains get a founder-fit bonus.

**Selection rule (user):** high demand, high pain, low saturation, high potential, higher pricing, and WTP both one-time and recurring. Regulation-driven pains are favoured because deadlines create urgency and the obligations recur yearly.

| # | Ground | Why WTP may be high (once + recurring) | Sources |
|---|---|---|---|
| D1 | Handwerk & small businesses: E-Rechnung (receive since 2025, send 2027/28), quotes, GoBD, DATEV handover | legal deadline; setup once + monthly use | r/Handwerker, r/Selbststaendig, r/steuern; handwerker forums; sevDesk, lexoffice, Plancraft, HERO, Craftnote reviews |
| D2 | Online shops & e-commerce: Abmahnungen, BFSG accessibility (since 06/2025), EPR (VerpackG/LUCID, ElektroG), DSGVO, legal texts | fines and Abmahnung costs; audit once + monitoring | r/de, r/Selbststaendig, r/shopify; shopbetreiber-blog, OMR; Trusted Shops, IT-Recht Kanzlei, Händlerbund reviews |
| D3 | Steuerberater/Kanzleien & bookkeeping: DATEV friction, Mandanten-Belege, staff shortage, E-Rechnung for clients | firm budgets; per-client recurring | r/steuern, r/Buchhaltung; steuerberater forums; DATEV, Candis, GetMyInvoices reviews |
| D4 | IT security & compliance for KMU / MSPs: NIS2 (DE NIS2UmsuCG, AT NISG), ISO 27001, TISAX, cyber-insurance questionnaires | audit once + yearly evidence | r/de_EDV, r/sysadmin (DACH), heise forums; Secfix, DataGuard, Proliance reviews |
| D5 | Freelancers, consultants, agencies: Scheinselbstständigkeit/Statusfeststellung, contracts, time tracking, Angebote | clients demand compliance; once per engagement + recurring | r/Selbststaendig, r/de_EDV, freelancermap, gulp forums; Malt, freelance.de reviews |
| D6 | HR in KMU: Arbeitszeiterfassung obligation, Personalakte, onboarding, Minijob/Lohn | legal requirement; per-employee recurring | r/arbeitsleben, r/Personaler, r/Selbststaendig; Personio, clockin, Papershift, Factorial reviews |
| D7 | Hausverwaltungen & Vermieter: Nebenkosten/Heizkostenabrechnung, CO2-Kostenaufteilung, WEG administration, tenant communication | yearly statements; per-unit recurring | r/Mietrecht, r/Finanzen, r/Austria; hausverwaltung forums; Immoware24, objego, Domus, Casavi reviews |
| D8 | Mittelstand/importers: CBAM (definitive regime 2026), EUDR, ESG/VSME questionnaires from banks and customers, Lieferkette | penalties; setup once + quarterly/yearly reports | r/de, r/Finanzen (business), logistik/zoll forums; IHK pages; CBAM tools, EcoVadis reviews |

**Exclusions:** legal/tax/medical advice (tools and workflows only), gambling, crypto, children.

## Signal log (summary)
207 signals across 8 grounds and 3 countries (DE/AT/CH), each with link and date. Per-ground tables are in `scan/D1.md` … `scan/D8.md`; notes saved during the scan are in `scan/raw/`.
- **Platforms:** Reddit (German subs), Google SERP (German forums, OMR/Capterra/Trustpilot snippets, regulator pages), App Store DE, Trustpilot DE, Google Trends DE, and keyword volume (Serpstat, g_de).
- **Caveat:** the Reddit API returns German posts as English machine translations, so those quotes are marked [MT] and are not the original wording. Trustpilot, App Store and forum quotes are verbatim German.

## Pain topics (best per ground, plus the strongest runners-up)
| Q-ID | Topic | Ground | WTP | Saturation | Paid once and repeatedly | Detail |
|---|---|---|---|---|---|---|
| Q-01 | Heating-cost billing plus monthly UVI without ista/Techem lock-in, for 2–30-unit houses and small HVs | D7 | 4 | medium | devices + setup once; per unit per month; costs can be passed to tenants (§7 Abs. 2 HeizkostenV) | scan/D7.md T1 |
| Q-02 | Client-side Scheinselbstständigkeit risk file for agencies and SMBs with 5–50 freelancers | D5 | 5 | medium (9am) | pool audit once; monitoring monthly | scan/D5.md T1 |
| Q-03 | Cross-border packaging EPR cockpit for small shops (PPWR/LUCID/ARA) | D2 | 4 | medium (low for a neutral layer) | setup per country once; yearly reporting | scan/D2.md T1 |
| Q-04 | NIS2 supplier questionnaires and evidence pack for non-regulated KMU, via MSPs | D4 | 3 | medium-high | evidence pack once; yearly re-answers | scan/D4.md T1 |
| Q-05 | E-Rechnung inbound validation, GoBD archive and DATEV handover (Handwerk side D1, Kanzlei side D3) | D1+D3 | 3 | medium-high | setup and Verfahrensdoku once; monthly | scan/D1.md T1, scan/D3.md T1 |
| Q-06 | CBAM operations for importers above 50 t and their customs brokers | D8 | 3 | medium | onboarding once; quarterly and yearly | scan/D8.md T2 |
| Q-07 | HR/time-tracking price hikes for 10–50-staff firms | D6 | 4 | high | migration once; flat subscription | scan/D6.md T1 |

## Demand: search volume (Google DE, monthly) and 5-year trend
| Q-ID | Keywords (volume; CPC €) | Trend DE (weekly index, 5 yrs) |
|---|---|---|
| Q-01 | heizkostenverteiler 12,100 (€72); heizkostenabrechnung 8,100 (€1.5); nebenkostenabrechnung software 480; heizkostenabrechnung software 140 | rising: ~1–3 (2022–25) → 5–12 (2026) → 17 (Nov 2026) |
| Q-02 | statusfeststellungsverfahren 2,400; scheinselbstständigkeit 1,900; … kriterien 1,600 | low, rising: 0–1 → 2–8 |
| Q-03 | verpackungsgesetz 2,900; verpackungslizenz 2,400 | spiky: peak 100 in the week of 18.10.2026 |
| Q-04 | nis2 14,800 (CPC €89) | strongly rising: ~1 → 20–37 |
| Q-05 | zugferd 14,800; xrechnung validator 1,300 (CPC €58); e rechnung empfangen 880 (broad 6,600) | not pulled |
| Q-06 | cbam 8,100 (mixed languages) | rising: 0–1 → 6–15 |

A high CPC (heizkostenverteiler €72, nis2 €89, xrechnung validator €58) means advertisers pay a lot for these buyers, which is a commercial-value signal `[E]`.

## Incumbents and gap (top 4)
- **Q-01:** ista, Techem, Brunata-Metrona, Minol and KALO (Messdienste, €60–120 per unit per year, long device-rental contracts); objego (owned by ista; price hikes up to 350%); software layer hellohousing Pro (€234 per house per year incl. gateway), vermieter1.de (UVI PDFs from manually entered readings), the Minol app, heidisystems ([SERP 2026-11-15](https://vermieter1.de/funktionen/verbrauchsinformation)). **Gap:** device-agnostic automatic reading (OMS/wM-Bus), monthly UVI and the yearly HeizkostenV + CO2KostAufG statement, sold as a third-party service with pass-through costs at about half the Messdienst price. Plus installers for the retrofit (founder's Handwerker network).
- **Q-02:** 9am Compliance Hub (€79–299+/mo), law-firm checklists, Statusfeststellung services. **Gap:** live document monitoring per engagement, AT/CH, and an audit trail. Note the RDG (legal-services law) risk.
- **Q-03:** Lizenzero/Interzero (Trustpilot 2.0), Landbell, RLG, per-country representatives. **Gap:** a neutral seller-side triage of which countries to serve, plus a register and reporting cockpit. Regulatory risk: the Omnibus proposal to remove representatives.
- **Q-05:** Lexware Office, sevDesk, DATEV Unternehmen online, free validators (ELSTER/KoSIT). **Gap:** trade-specific matching to projects, and a supplier-correction loop for Kanzleien.

## Scorecard (1–5)
| Criterion | Q-01 HeizKlar | Q-02 Freelancer file | Q-03 EPR cockpit | Q-05 E-Rechnung | Q-04 NIS2 pack | Q-06 CBAM |
|---|---|---|---|---|---|---|
| Pain intensity | 4 | 4 | 5 | 3 | 4 | 4 |
| Frequency | 4 (monthly UVI + yearly) | 3 | 3 | 5 | 3 | 3 |
| Demand / virality | 4 | 3 | 4 | 5 | 5 | 4 |
| WTP | 4 | 5 | 4 | 3 | 3 | 3 |
| Reachability | 3 | 3 | 4 | 4 | 3 | 2 |
| Gap vs best incumbent | 3 | 3 | 3 | 2 | 2 | 3 |
| Buildable in 6 weeks | 3 (software MVP; devices via partner) | 4 | 3 | 4 | 4 | 3 |
| Founder fit | 4 (property + Handwerker installers) | 3 | 2 | 5 | 2 | 1 |
| **Total / 40** | **29** | **28** | **28** | **31** | **26** | **23** |
| **Brief-weighted** (+WTP +Gap +price level) | **29+4+3+4 = 40** | **28+5+3+4 = 40** | **28+4+3+4 = 39** | **31+3+2+2 = 38** | 26+3+2+3 = 34 | 23+3+3+3 = 32 |

The brief weighting applies the user's rule (low saturation, higher pricing, high WTP once and repeatedly), so WTP and gap count double and price level is added. On the plain score Q-05 leads, but it fails "low saturation" and "higher pricing".

**Hard kills:** none.
**Watch items:**
- **Q-01:** needs device and installer partners, which are available; Messdienst contracts lock some landlords in until contract end.
- **Q-02:** close to the legal-advice exclusion (RDG); it must stay a documentation and workflow tool.
- **Q-03:** the EU Omnibus could shrink the problem.
- Q-06 is dropped (below 24 on brief fit and no user voice). Q-07 is dropped for saturation.

**Verdict:**
- **Q-01:** GO with conditions. It ties Q-02 on the brief-weighted score and wins the tie on the hard 31.12.2026 deadline, the rising trend, the tenant pass-through (low price resistance) and founder fit.
- **Q-02:** runner-up, with the strongest WTP but RDG risk and lower volume.
- **Q-03:** runner-up, with the loudest pain but regulatory uncertainty.

## Winning concept
**J-01 (→ Q-01):** When I own or manage a building with 2–30 flats and the heating meters must be remotely readable by 31.12.2026, I want monthly consumption info and the yearly heating-cost statement done automatically and passed on to tenants as allowed. That way I comply (and avoid the 3% tenant cut) without signing a 10-year ista/Techem contract at €60–120 per flat per year.
- **Current workaround:** a Messdienst contract, or Excel plus manual readings plus software that only renders PDFs (vermieter1.de), or hellohousing.

**Wedge:** a device-agnostic reading service plus a UVI and statement engine for German small landlords and small Hausverwaltungen (2–30 units). It has three parts:
- read OMS/wM-Bus meters via an affordable gateway
- send the monthly UVI by e-mail or portal
- produce the yearly HeizkostenV + CO2KostAufG statement that feeds the Nebenkostenabrechnung

It is billed as a third-party service, so the costs can be passed to tenants. Installers come through the ServiceMarket Handwerker network. It is not a full property-management suite and not a meter manufacturer. AT (HeizKG) and CH (cantonal VHKA) come later.

**One-liner:** For small landlords who must deliver monthly heating-consumption info from 2027, HeizKlar is a heating-cost billing service that reads any standard radio meter, sends the UVI and produces the yearly statement, with costs passed to tenants. Unlike ista or Techem it needs no 10-year contract, and it costs about half.

**Pricing hypothesis (once + recurring):**
- **One-time:** onboarding per house €149 (meter mapping, gateway setup, first statement); devices at cost; installation by a partner Handwerker via ServiceMarket (a marketplace commission).
- **Recurring:** €2.90 per unit per month (about €35/yr vs €60–120 at the Messdienste), passed through to tenants as third-party billing costs. The yearly statement is included.
- **Founding offer:** first year €99 per house (up to 10 units).
- **Free tier:** a UVI calculator from manually entered readings for one house, with no automatic reading, no yearly statement and no tenant portal.
- This clears the brief's minimum (€29/mo recurring per landlord at 10+ units; €149+ one-time).

**Conditions:**
1. Verify that §7 Abs. 2 HeizkostenV pass-through holds for an independent service; get a tenancy-law check on the templates (no legal advice in the product).
2. Prove reading with 2 meter brands (OMS keys from the manufacturer).
3. Measure how many prospects are already locked in a Messdienst contract.

## Riskiest assumptions (top 3)
| # | Type | Assumption | Importance | Evidence | Test |
|---|---|---|---|---|---|
| A1 | Viability | Enough small landlords are not locked in a Messdienst contract, or will switch at contract end | 5 | 3 (objego exodus; "Messdienst ist keine Pflicht" content; landlords asking in the Buhl forum) | "Vertragsende-Check" on the landing page: ask contract status; ≥ 40% of 50 respondents free within 12 months |
| A2 | Feasibility | OMS/wM-Bus meters from 2+ brands can be read via an affordable gateway, with keys obtainable | 4 | 2 (hellohousing does it) | Buy 2 meter brands + 1 gateway (about €300); read 30 days of data |
| A3 | Reachability/timing | Demand continues after the 31.12.2026 deadline (UVI duty, 3% cut, yearly statements) | 4 | 4 (trend rising to Nov 2026; the duty is permanent) | Post 2 hooks in Haus & Grund-style forums, r/Mietrecht and Facebook landlord groups; ≥ 3% CTR to the waitlist |

## Content hooks (German)
1. "Ab 1.1.2027: Ihre Mieter dürfen 3 % der Heizkosten kürzen, wenn die monatliche Verbrauchsinfo fehlt."
2. "Brauche ich wirklich ista oder Techem? Nein: die Heizkostenverordnung verlangt keinen Messdienst."
3. "objego +350 %? So rechnen Sie Heizkosten für 6 Wohnungen selbst ab, für 2,90 € pro Wohnung."
4. "Funkzähler-Pflicht bis 31.12.2026: Checkliste für private Vermieter."
5. "Umlagefähig: warum Ihr Abrechnungsdienst Sie (fast) nichts kostet."

Formats that work here are checklist/deadline explainers (the chip.de and hellohousing pattern) and forum Q&A answers.

## Pre-sale test plan
- **Test:** a landing page with a founding offer (first year €99 per house, refundable until go-live) and a "Vertragsende-Check", plus 5 concierge pilots: the first UVI done by hand from photos of the meters.
- **Thresholds (set in advance):** ≥ 10 reservations from ≥ 400 targeted visitors within 14 days, **or** ≥ 5 of 20 landlords and small HVs contacted agree to a paid pilot.
- **Fail:** fewer than 3 reservations. Then `h:back 1` and promote Q-02 or Q-03.
- **Landing copy (DE):** "Heizkostenabrechnung und monatliche Verbrauchsinfo, ohne 10-Jahres-Vertrag. Funkzähler auslesen, UVI automatisch versenden, Jahresabrechnung nach HeizkostenV & CO2KostAufG — ab 2,90 € pro Wohnung und Monat, umlagefähig."
- **Outreach (manual, one-to-one, only to people who publicly asked):** "Sie hatten im Forum nach der UVI-Pflicht gefragt. Ich baue einen kleinen Abrechnungsdienst für Häuser mit 2–30 Wohnungen; gern prüfe ich kostenlos, was Sie bis Ende 2026 brauchen. Kein Interesse? Dann melde ich mich nicht wieder."
