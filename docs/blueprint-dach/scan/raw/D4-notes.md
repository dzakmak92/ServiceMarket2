# D4 raw notes (IT security & compliance KMU/MSP DACH)

Running cost: $0.00376 after 5 calls (3 reddit, 2 SERP)

## Regulation facts
- DE NIS2UmsuCG: Bundestag 13.11.2025, Bundesrat 21.11.2025, verkündet 05.12.2025, in force 06.12.2025 (BSI FAQ https://www.bsi.bund.de/DE/Themen/Regulierte-Wirtschaft/NIS-2-regulierte-Unternehmen/NIS-2-FAQ/NIS-2-FAQ-allgemein/FAQ-zu-NIS-2_node.html). Registration within 3 months -> 06.03.2026; BSI page: "Die gesetzliche Registrierungsfrist ist bereits abgelaufen" (https://www.bsi.bund.de/DE/Themen/Regulierte-Wirtschaft/NIS-2-regulierte-Unternehmen/nis-2-regulierte-unternehmen_node.html). Meldepflicht 24h/72h (BSI nis2know).
- vantarion.de 31.07.2026: ~29,500 affected companies; "Nachfrist bis 31. Juli 2026" (vendor, context) https://www.vantarion.de/nis2-registrierung-nachfrist/ ; DENIC blog 22.06.2026 new registration deadline https://blog.denic.de/bsi-registrierung-unter-nis-2-neue-registrierungsfrist/
- AT NISG 2026: in force 01.10.2026; register via USP by 31.12.2026 (WKO https://www.wko.at/it-sicherheit/nis2-uebersicht); Selbstdeklaration within 12 months of registration (schoenherr 25.11.2025 https://www.schoenherr.eu/content/oesterreich-nisg-2026-alles-was-sie-wissen-mussen)

## Signals
- r/arbeitsleben 2026-06-12, score 21, 18 comments: AT NIS2 company horror, hard-coded passwords, no money for equipment. https://www.reddit.com/r/arbeitsleben/comments/1u44ww9/ (pain, AT)
- r/ITManagers 2026-05-27, score 55, 34 comments: NIS2 audit; "roughly 60% of firms they assess have major gaps in supply chain documentation" ; "build a simple vendor assessment template" https://www.reddit.com/r/ITManagers/comments/1toxb5k/ (passwork mention -> possible vendor)
- r/informatik 2026-07-22, score 3, 13 comments: NIS2 Art 21(2)g training — "Wie dokumentiert ihr die Teilnahme? Wie weist ihr gegenüber Prüfern nach?" https://www.reddit.com/r/informatik/comments/1v3h6sy/
- r/OTSecurity 2026-10-29, score 11, 12 comments: NIS2 OT asset inventory from Siemens TIA — "compiling an asset inventory would mean a lot of manual work" asks for software https://www.reddit.com/r/OTSecurity/comments/1xiegp4/
- r/ISO27001 2026-07-22 score 18, 17c: overlap NIS2/GDPR/ISO (Swedish org; not DACH)
- r/informatik 2026-04-02 score 14, 43 comments: small business looking for paid ISO 27001 advice "diese Beratung darf natürlich Geld kosten" https://www.reddit.com/r/informatik/comments/1sai361/
- r/Unternehmer 2026-09-10 score 0: "ISO-Zertifizierungen. Ein Grausen" — vendor/research (promoting tool)
- r/Computersicherheit 2026-10-05: survey ISO 27001 effort — vendor/research
- r/founder 2026-07-30: DACH 6-person startup ISO 27001 via Kertos: consultants from 10k CHF; platform offers 7k-14k; Swiss auditors up to 15,000 CHF year 1; 250h lead; "enterprises insist on filling out tedious questionnaires, even though their questions are 80-90% the same as ISO" https://www.reddit.com/r/founder/comments/1vaof35/ score 1, 5 comments
- r/sysadmin 2026-03-06: Mercedes-Benz dealer ISO 27001 or TISAX? score 0, 10c https://www.reddit.com/r/sysadmin/comments/1rmq02p/

## Batch 2 (running cost $0.0079 after 11 calls)
- r/informatik 2026-08-04 score 11, 38 comments: "Wie viel Sinn macht eine Cyberversicherung?" — hard to meet all conditions so money actually paid; no recourse for minor details https://www.reddit.com/r/informatik/comments/1vfax3i/
- r/cybersecurity 2026-08-05 score 112, 80 comments (global, not DACH-specific): "renewal questionnaire and the goalposts moved again... Keeping this policy would require doubling our security spend." https://www.reddit.com/r/cybersecurity/comments/1vgi6z8/
- r/sysadmin 2026-07-28 score 256, 117 comments: EU mid-size supplier, "sent us a 40-question security assessment with a contract clause attached, we answer it or we're not a supplier anymore" ; must get evidence from ~20 small suppliers; "I don't have a GRC team or a tool budget" https://www.reddit.com/r/sysadmin/comments/1v8tekg/
  - top comment score 160: "It sounds like the NIS2 directive is working exactly as intended." ; reply score 60: "increase bureaucracy and sink endless money into useless paper trails"
- r/SideProject 2026-06-28 (vendor/research, nisd2.eu): "existing tooling (Vanta, DataGuard and friends) charges 7,000 to 12,000 euros a year"; plan paid guided implementation 500 EUR/month; ~225 users in 3 months https://www.reddit.com/r/SideProject/comments/1uhokqz/
- r/de_EDV 2026-07-10 score 15, 7c: NIS2 factory audit gaps; evidence for external automation vendors w/ shared accounts on Siemens PLCs hard to prove https://www.reddit.com/r/de_EDV/comments/1usne7y/
- r/soc2 2026-10-08 score 10, 11c: "Every vendor security questionnaire somehow becomes a group project where I own the spreadsheet" https://www.reddit.com/r/soc2/comments/1x0okag/
- r/msp 2026-09-07 score 22, 26c: Munich MSP starter; 1-50 employee clients https://www.reddit.com/r/msp/comments/1w9pr5f/
- SERP "NIS2 Kunden Fragebogen Lieferant": many vendors already content-marketing this: Kertos blog 02.11.2026, ubesafe.de 02.11.2026, nisd2.eu open questionnaire 53 Fragen, kastl-rieter.de 17.09.2026 ("Ein Fragebogen im Anhang, achtzehn Seiten, Rücklauf bis Ende des Monats. Und im Haus kann ihn keiner..."), sequesto.com 17.10.2026, khosla-compliance.de, sdh.global. -> saturation of content rising
- § 38 BSIG: GF must approve/monitor measures + training; BSI Handreichung GL-Schulung; Innenhaftung; nis2-umsetzung.com: repeat training at least every 3 years [vendor]. Training offers: ask-akademie 4.5h webinar, cybercampus-nrw, gesellschaft-datenschutz.
- Incumbent SERP: Secfix "Automatisieren Sie bis zu 90 %"; sectorpunk Secfix pricing ($60-$120?) 04.03.2026; DataGuard pricing page dataguard.de/pricing; Kertos OMR reviews; fr.de/handelsblatt adv: consulting projects 150-250k EUR Mittelstand (advertorial, Kertos)

## Batch 3 (running cost $0.01266 after 17 calls)
- r/selbststaendig 2026-06-10 score 2, 11c: "NIS2… schon jemand einen Lieferantenfragebogen auf dem Tisch?" (OP is founder researching -> vendor/research) https://www.reddit.com/r/selbststaendig/comments/1u2c6sf/
  - comment score 1: "I've already answered some and also sent them." (Hab schon einige beantwortet)
  - comment score 3 sarcastic: "Oh yeah, please build a tool for that. $20 ARR could be realistic." -> skepticism on WTP for small suppliers
  - OP: "double the work… filling it out yourselves + collecting the same from your suppliers... Excel ping pong"
- r/informatik cyberversicherung comments: top score 38 "For the insurance? Makes perfect sense!" (sarcasm on insurer benefit)
- r/sysadmin 2025-12-07 score 27, 33c: 40-employee services co budgeting ISO 27001 cert cost (not DACH-specific) https://www.reddit.com/r/sysadmin/comments/1pgux0e/ (older than 12m: just inside)
- r/grc 2026-11-05 score 13, 27c: Germany 2-person company, sole ISMS person, "I honestly can't tell if they would hold up in an audit"; asks if gap assessment from external consultant worth it https://www.reddit.com/r/grc/comments/1xoxtpw/
- r/ISO27001 2026-09-06 score 29, 12c: ISMS on spreadsheets (vendor/research, UK GRC SaaS founder)
- r/ISO27001 2026-05-24 score 13, 49c: ISMS tools recommendation, Confluence+Jira? https://www.reddit.com/r/ISO27001/comments/1tm8fwl/
- TISAX: ENX fee 405 EUR one-time per site & scope (via dataguard.de/tisax/kosten); secjur TISAX für KMU 07.11.2026; daturex 04.11.2026; kopexa 07.03.2026
- MSP/NIS2: BSI sector FAQ: MSP/MSSP in scope; GvW 20.10.2026 "BSI ändert die Einstufung des konzerninternen MSP"; kjello 28.10.2026 "Kann ich meine NIS2-Pflichten an einen MSP auslagern? Nein."; cybervize: IT-Dienstleister must fulfill own duties AND prove to customers

## Batch 4 (running cost $0.01515 after 22 calls; page read cost $0)
- Cyber insurance SERP (vendor/MSP content, context): hagel-it.de 13.04.2026 "40 % aller Cyber-Schadensmeldungen werden 2026 abgelehnt" [vendor claim, unverified]; buzzard-ai "fast jeder dritte Antrag wird abgelehnt" [vendor]; keep-it-fair 27.08.2026 GDV Muster-Fragebogen für KMU; badata: MFA, EDR, ...; itcc.de 02.04.2026; deeploi 'So bereitest du dich auf den Fragebogen vor'
- CH: ISG Meldepflicht for critical infrastructure in force 01.04.2025, 24h to BACS (https://www.bacs.admin.ch/de/informationen-zur-meldepflicht ; kmu.admin.ch). No NIS2 equivalent for general KMU in CH.
- Pricing: Proliance ISMS Light from 500 EUR/mo, Core 1,000 EUR/mo, ISMS consulting packages 1,000/2,500 EUR/mo first year, NIS2 Executive Training 600 EUR (https://www.proliance.ai/plattform/informationssicherheit/isms-software ; nisd2 audit)
- nisd2.eu pricing audit (20.07.2026, vendor/research but verbatim pricing capture) https://nisd2.eu/wiki/vergleich/grc-vergleich : 137 vendors, 102 demo-call required; Secfix, Kertos, SECJUR, HiScout, DataGuard all demo-call (DataGuard Base/Pro/Enterprise 'Get a quote'); Kopexa 249 EUR/mo Lite, 599 Pro; Orbiq Team 85 EUR/mo, Business 190; NIS2Compass from 29 EUR/mo; Copla 3,500 EUR/yr NIS2; Conformio 145 EUR/mo; RC_NIS2 799 EUR/mo + GF-Schulung 999 EUR one-time; Vanta/Drata enterprise "€30,000+/year" (their claim)
- Trustpilot DataGuard (www.dataguard.de): TrustScore 3.8 / 97 reviews. 1-star 2026-03-05: "after the minimum term which is 24 months, they impose a 6 months termination clause" ; "wasted £18,000 on essentially nothing" ; "portal ... nothing more than a buggy glorified cloud storage" ; "In the end we dumped their portal as using AI was much more beneficial". 1-star 2026-05-19 "very little practical value relative to the cost". 1-star 2026-06-20 ISO 27001 2013->2022 duplicate work; debt collection. (UK reviewers mostly)

## Batch 5 (running cost $0.01929 after 28 calls)
- r/GehaltAT 2026-08-17 score 4, 8c: AT, QM person responsible for ISMS; "Often, companies are asking for NIS2 knowledge" — training worth? https://www.reddit.com/r/GehaltAT/comments/1vr3hr9/
- r/grc 2026-08-28 score 8, 10c: NIS2 compliance "either show an ISO 27001 certificate ... or satisfy a national battery of controls" — what evidence auditors ask https://www.reddit.com/r/grc/comments/1w0noy8/
- r/StartupDACH 2026-04-13 score 18, 23c: 60-person SaaS, first fin-services client -> NIS2/GDPR/DORA, "Vendor Risk Management is another area where we're sloppy"; "shared passwords are in a Google Doc" https://www.reddit.com/r/StartupDACH/comments/1sknn84/ (Passwork mention -> possible astroturf, weak)
  - comment score 8: "this doesn't need any dedicated software. We use Confluence and Jira"
  - comment score 2: "We automated as much as possible from the beginning with Vanta... the 'annoying' part is providing the evidence." (pays competitor)
- Sastrify = SaaS procurement/spend mgmt (Cologne), has vendor compliance/certificate tracking; NOT an ISMS/NIS2 tool -> adjacent (third-party risk) only https://www.sastrify.com/de
- AT funding: KMU.DIGITAL 4.0 budget "vollständig ausgeschöpft" (kmudigital.at); WKO Kärnten 14.01.2026 new funds up to 3,000 EUR for analysis/strategy; WKO "NIS 2: Förderung für KMU" (Cyber Security Förderung: technologies + technical consulting); FFG KMU cyber-sicher earlier: max 40% / 10,000 EUR [older]
- r/selbststaendig gutefrage/administrator SERP: no useful hits (2024 only)

## Batch 6 (FINAL running cost $0.02005 after 31 paid calls; 2 page reads cost $0)
- SERP Systemhaus/Fragebogen: ubesafe "Betroffenheitsprüfung für 800 € netto"; cybervize partner programme for IT-Dienstleister (white-label NIS2 for MSP customers); elovade NIS2 solutions for IT-Dienstleister; Kertos 02.11.2026: no BSIG fine if supplier does not answer
- SERP questionnaire automation DE: Secfix AI questionnaire automation (de.secfix.com/product/security-questionnaires), Orbiq buyer guide 05.04.2026, Kertos Trust Center, SecureSlate, reportact, mondoo -> AI questionnaire answering already offered by DACH platforms
- kastl-rieter.de/nis2-zulieferer (MSP, Köln, 17.09.2026, context): "Ein Fragebogen im Anhang, achtzehn Seiten, Rücklauf bis Ende des Monats. Und im Haus kann ihn keiner beantworten."; "Es kommen Rückfragen, meist jährlich."; BSI FAQ quote: "Wir begrüßen aktuelle Vorstöße der Wirtschaft, einen einheitlichen Fragenkatalog für Lieferanten zu erarbeiten"; BSI: "Verträge allein genügen nicht."; no BSIG fine for non-affected supplier, "Auf dem Spiel steht der Auftrag."
- Astroturf flag: r/sysadmin 1v8tekg and r/de_EDV 1usne7y are the same account, both name-drop the same password manager; r/ITManagers 1toxb5k and r/StartupDACH 1sknn84 also name-drop it. Engagement real, framing possibly promotional.
- Skipped App Store / Play (B2B web compliance tools, no relevant mobile apps) to save budget.
