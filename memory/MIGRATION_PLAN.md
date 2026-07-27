# Migration Plan — Two-Sided Marketplace → One-Sided Pro Tool

**From:** ServiceMarket (homeowners post jobs → pros bid → platform takes lead fees)
**To:** A quote-to-cash tool for the one-van business that **rides** MyHammer instead of competing with it.

Source of truth for the target product: `p0deepdive.md` (Fast-Quote → Payment → Compliant Invoice, one `Job` spine, five trade template sets).

> **Effort sizing assumption:** one experienced full-stack dev working with AI assistance. `S` ≈ ≤3 days, `M` ≈ 1–2 weeks, `L` ≈ 3–5 weeks, `XL` ≈ 6+ weeks. Ranges are for the *whole* item incl. tests.

---

## 1. The pivot in one page

The existing codebase is a **marketplace**: it owns the demand side, sells leads (€4–10 contact fee per accepted quote), and monetises pros through tiers (Explorer €1/mo → Pro €29.99/mo) plus a 1% payment fee.

The target is a **tool**: it owns nothing on the demand side, has no homeowner accounts, and sells a flat subscription to the tradesperson. Leads arrive from wherever the pro already gets them — MyHammer, phone, WhatsApp, walk-up.

That inverts three things at the architectural level:

| | Marketplace (today) | Tool (target) |
|---|---|---|
| **Who has an account** | Homeowner *and* pro | **Pro only.** The customer never logs in |
| **Who owns the customer record** | The platform (`users` with `role: homeowner`) | **The pro.** A CRM row, not an account |
| **Where a job comes from** | Posted into the platform by a homeowner | **Created by the pro** from a lead they already have |
| **What a quote is** | A competing *bid* against a cap of 5–8 rivals | A **branded document** sent to one customer |
| **How the customer interacts** | Logs in, browses, chats | **Opens a link** — quote, status, invoice, pay |

The good news: the third row is already solved in the codebase. The PM Toolkit's **share-token public portal** (`/api/pm/public/*`, `PMPublicStatusPage.jsx`, `SubContractorPage.jsx`) is exactly the "customer sees their job without an account" mechanism a one-sided product needs. It was built as a side feature; in the new model it becomes the **primary customer surface**.

### The single most important decision

**Promote `pm_projects` to be the one `Job` spine and delete the marketplace `jobs` collection.**

The doc warns that a single `Job` object is make-or-break. You currently have two spines — marketplace `jobs` and `pm_projects` — with invoices able to hang off either (`draft-from-job` / `draft-from-project`). Pick `pm_projects`, because it already has what a one-sided spine needs and `jobs` has what only a marketplace needs:

| `pm_projects` has | `jobs` has |
|---|---|
| Embedded customer (no account required) | `posted_by_id` → a homeowner **account** |
| Tasks, materials, diary, photos, timer | Quote cap, contact fee, category fee |
| Change orders with customer approval | `quote_count_cache`, bidding status machine |
| Milestone payments | Marketplace visibility/urgency/budget range |
| Share-token customer portal | — |
| Templates + apply-template | — |
| Job File PDF export | — |

`pm_projects` is heavier than a Montage handyman needs (Kanban, Gantt). Solve that with a **`mode` field**, reusing the concept already present as `listing_type: task | project`:

- **`mode: 'simple'`** — customer + quote + invoice. Tasks/Kanban/Gantt hidden. Montage, emergency Sanitär, small Maler jobs. Target: whole loop under 2 minutes.
- **`mode: 'project'`** — the full PM surface. Bathroom reno, GaLaBau project, flat repaint.
- **`mode: 'recurring'`** — a service contract that spawns visits (Garten maintenance, Winterdienst). **To build.**

---

## 2. Target architecture

```
Customer (CRM, owned by pro, no account)
   │
   ├── Job  [mode: simple | project | recurring]     ◀── THE SPINE (= today's pm_projects)
   │     ├── Quote      (versioned, line items, tiers)      ◀── BUILD
   │     ├── Nachträge  (change orders)                     ◀── EXISTS
   │     ├── Tasks / Materials / Diary / Timer / Photos     ◀── EXISTS (project mode)
   │     ├── Visits     (recurring mode)                    ◀── BUILD
   │     ├── Payments   (deposit, milestones, final)        ◀── PARTIAL
   │     ├── Invoices   (Abschlag / Schluss / Storno)       ◀── EXISTS, needs compliance work
   │     └── Documents  (before/after, Abnahme sign-off)    ◀── MOSTLY EXISTS
   │
   └── Customer Portal (share-token, no login)               ◀── EXISTS — becomes primary surface
```

Everything the customer touches — accept a quote, approve a Nachtrag, see status, sign off, pay — goes through the share-token portal. No homeowner accounts anywhere.

---

## 3. Inventory

### 3.1 KEEP — reuse as-is or with light edits

The genuinely valuable, already-paid-for assets. Roughly **60% of the backend and 50% of the frontend survives.**

| # | Asset | Files | Why it matters in the new model |
|---|---|---|---|
| K1 | **Invoice Toolkit** | `services/pro_invoicing.py`, `routes/pro_invoicing_routes.py` (766), `services/invoice_templates.py` (664), `MyInvoicesPage.jsx` (1064), `ProInvoiceEditorPage.jsx` | **This is pillar A3.** Per-pro gap-free numbering, storno-as-negative-mirror, PDF templates, external invoices. Needs compliance additions (§4.1), not a rewrite |
| K2 | **EPC-QR / GiroCode** | `pro_invoicing.py:222` | A real DACH strength the P0 doc doesn't even list. Customer scans, bank app pre-fills. Ships value **before** any PSP integration — which is exactly why payments can go last |
| K3 | **Tax Toolkit** | `routes/tax_routes.py` (560), `services/tax_reports.py`, `services/tax_pdf.py`, `TaxToolkitPage.jsx`, `AccountantSharePage.jsx` | USt-VA, EÜR, SVS, mileage, year-end PDF, **DATEV export**, accountant share link. The doc calls DATEV a P1 retention feature — you already have it |
| K4 | **Vision OCR pipeline** ⭐ | `routes/tax_routes.py:284` `_ocr_receipt()` | **The highest-leverage reuse in the repo.** Image → strict JSON → confidence score → graceful degradation → GridFS persistence. This is *precisely* the pattern needed for photo→measurement, part-ID, and colour preview. Extract to `services/vision.py` and build every AI feature on it |
| K5 | **PM Toolkit → the spine** | `routes/pm_routes.py` (1907), `services/pm_pdf_export.py`, `pages/pro/pm/*` | Tasks, materials, diary, timer, templates, Gantt, Kanban. Becomes `mode: 'project'` |
| K6 | **Change orders (Nachträge)** | `pm_routes.py:1365–1470` | Create → send → customer approves w/ e-signature → convert to invoice → **auto-flips CO to `invoiced`** so it can't be double-billed. This is the doc's correlation #2, already delivered and tested. Plugs the biggest silent margin leak |
| K7 | **Share-token customer portal** ⭐ | `pm_routes.py:1664+`, `PMPublicStatusPage.jsx` (297), `SubContractorPage.jsx` | **Promote to primary customer surface.** No-account access, token rotation, scoped payloads (sub-contractors never see P&L or customer contact). The whole one-sided UX rests on this |
| K8 | **Job File PDF export** | `services/pm_pdf_export.py` (556), `ExportJobFileModal.jsx` | 4-language archival PDF with photo gallery, EXIF rotation, diary, financials. Doubles as the doc's "dispute shield" (Part B #5) and a §634 defence |
| K9 | **Calendar & scheduling** | `ProCalendarPage.jsx` (799), `MonthBookingCalendar.jsx`, `DatedAvailabilityMatrix.jsx`, `MySchedulePage.jsx`, iCal export | Becomes the pro's own job calendar. Foundation for recurring visits and route sequencing |
| K10 | **PWA + Web Push** | `hooks/useWebPush.js`, `routes/push_routes.py`, service worker, `InstallPrompt.jsx` | Mobile-first is a doc requirement; iOS + Android push already working |
| K11 | **i18n, 4 languages** | `translations/index.js`, `contexts/LangContext.js` | DE/EN/TR/ES. The doc flags Turkish/Balkan tradespeople as a "later lever" — you're already there. Needs an AT/DE legal-label split (§4.5) |
| K12 | **GDPR / DSGVO** | `routes/privacy_routes.py` (332), `retention.py`, `PrivacySettings.jsx`, `pages/legal/*` | Part E #2 of the doc. Data-rights requests, retention, removal, cookie consent, imprint. Expensive to build, already done |
| K13 | **UI kit + mobile work** | 45 shadcn components, `ScrollSnapTabStrip`, `MobileNav`, responsive-table CSS | Dozens of iterations of 390px overflow fixes, glove-friendly targets, tables→cards. The doc's "mobile UX beats feature count" is largely pre-paid |
| K14 | **Uploads / GridFS** | `misc_routes.py:317–378`, `AttachmentUploader.jsx` (259) | Photo capture plumbing for before/after, materials, receipts, quote inputs |
| K15 | **Auth + onboarding** | `routes/auth_routes.py`, `auth.py`, `OnboardingPage.jsx` (473), Turnstile | Keep; strip the homeowner branch. Licence/insurance upload stays (trust badges) |
| K16 | **Pro dashboard analytics** | `AdvancedAnalytics.jsx`, `ProDashboardPage.jsx`, `routes/analytics_routes.py` | Win rate, cash-flow timeline. Part E #9 wants time-to-quote and quote-to-cash added |
| K17 | **Invoice payment links** | `routes/payment_link_routes.py` (386), `PayInvoicePage.jsx` | Works today. Deferred to Phase 8 only for the *Connect* rework — the existing link keeps working meanwhile |
| K18 | **Admin: support, users, insights** | `AdminSupport.jsx`, `AdminUsers.jsx`, `AdminInsights.jsx`, `feedback_routes.py` | Part E #11 — these users call, they don't chat-bot. AI feedback clustering is a nice-to-have worth keeping |
| K19 | **Barcode scanner** | `BarcodeScannerModal.jsx`, `pm_routes.py:688` | Material entry. Genuine nice-to-have; keep |
| K20 | **Storno audit + share-token audit** | `admin_advanced_routes.py:244,393` | Already GoBD-shaped thinking. Grows into the immutability audit trail |

### 3.2 REPURPOSE — keep the code/data, change the meaning

| # | Asset | Today | Becomes |
|---|---|---|---|
| R1 | **Business directory (8,660 real AT businesses)** ⭐ | Homeowner-facing map to find/contact pros | **Your customer-acquisition list.** 8.6k Austrian tradesperson businesses with segment, city, coords = a segmented prospect list for the five launch trades. Kill the homeowner map; keep the data + admin tooling |
| R2 | **"Claim my business" onboarding** | Pro claims a directory listing | **Onboarding accelerator.** Pro finds their own business → company name, address, segment, coords prefill. Directly serves Part E #4 ("first quote in 10 minutes without reading anything") |
| R3 | **Live location / ETA** | ETA strip inside marketplace chat | **"On my way" link to the customer.** Doc C5 #5 (Sanitär triage + ETA texting) and C3 (Montage route). Send the token by SMS/WhatsApp; no account needed |
| R4 | **Marketplace `listing_type: task \| project`** | Two posting flows | The `Job.mode: simple \| project \| recurring` discriminator |
| R5 | **PM templates (5 built-ins)** | Kitchen / Bathroom / Painting / Boiler / Rewire | Seed shape for the trade template library. Bathroom-reno ≈ the doc's C5 must-have. Needs Leistungsverzeichnis positions with units/rates/waste factors bolted on (§4.2) |
| R6 | **Explorer plan (€3 / 3 months)** | Intro tier inside a lead-fee model | **Keep the mechanic, drop the context.** Monthly-cancelable, no 12-month lock-in — precisely the doc's competitive wedge #4. Just becomes the trial for the flat subscription |
| R7 | **Availability matrix** | Homeowners book slots | Pro's own capacity planning + recurring-visit scheduling |
| R8 | **`quotes` collection** | Marketplace bids | **Do not migrate.** Drop it and build the new quote model clean (§4.1). The shapes have almost nothing in common |
| R9 | **Notifications + bell** | Cross-role marketplace events | Pro-only: quote viewed, quote expiring, invoice overdue, recurring visit due |
| R10 | **Admin Heatmap** | Directory moderation + CSV import | Sales/ops tool over the prospect list (R1) |

### 3.3 REMOVE — the marketplace

**~4,100 frontend lines + ~1,700 backend lines deleted outright**, plus partial gutting of `misc_routes.py`.

| Layer | Remove | Lines | Note |
|---|---|---|---|
| Frontend | `pages/homeowner/*` (8 pages) | 2,425 | HomePage, Dashboard, PostJob, JobDetail, FindPros, Settings, HomeownerProjects ×2 |
| Frontend | `pro/BrowseJobsPage.jsx` | 424 | Lead marketplace browsing |
| Frontend | `pro/MyQuotesPage.jsx` | 204 | Replaced by the new Quotes page — delete, don't adapt |
| Frontend | `shared/ProDetailPage.jsx` | 541 | Public pro profile for homeowners |
| Frontend | `shared/BusinessMapPage.jsx` | 341 | Homeowner directory map (data survives, see R1) |
| Frontend | `SearchPage.jsx` | 169 | Marketplace search |
| Frontend | `ProCard`, `JobCard`, `ExpandableJobCard`, `HomeownerCompletionReminder`, `ProJobCompletionPopup` | ~626 | Marketplace-only components |
| Frontend | `pages/shared/InboxPage.jsx` + `inbox/*` | ~1,300 | ⚠️ See decision D3 — customer has no account, so in-app chat has no counterparty |
| Frontend | Admin: `AdminJobs`, `AdminFees`, `ProReviewsPanel` | 511 | Marketplace moderation |
| Backend | `routes/quote_routes.py` | 296 | Marketplace bidding, quote caps, contact-fee charging |
| Backend | `routes/job_routes.py` | 477 | Job posting, browsing, marketplace status machine |
| Backend | `routes/pro_routes.py` | 150 | Public pro directory |
| Backend | `routes/message_routes.py` | 214 | Cross-role chat (see D3) |
| Backend | `routes/pm_homeowner_routes.py` | 176 | Homeowner's authenticated project view — the *portal* replaces it |
| Backend | `misc_routes.py`: saved-pros, reviews, review responses, marketplace bookings | ~450 of 1,154 | Keep uploads, profile, availability, notifications, categories |
| Backend | `directory_routes.py`: claim/inquire lead funnel, homeowner markers | ~250 of 734 | Keep import, geo, admin |
| Backend | `billing_routes.py`: contact fees, `fee_log`, per-category `contact_fee`, pay-outstanding | ~250 of 893 | The whole lead-fee revenue model |
| Backend | `admin_invoicing_routes.py`: fee invoicing | partial | Operator invoices *pros* for lead fees — gone with the model |
| Backend | `routes/payout_routes.py` + `AdminPayouts.jsx` | 350 | Manual payout ledger — obsolete once Connect lands (Phase 8) |
| Data | `reviews`, `saved_pros`, `fee_log`, `bookings`, marketplace `jobs`, `quotes`, `directory_inquiries` | — | Drop collections |

**Also gone by implication:** the review/rating system (the doc lists reviews as **P2**), contact-fee pricing, quote caps, homeowner Turnstile signup, category `contact_fee` admin, `notif_new_quote` / `notif_new_job_match` preferences.

### 3.4 BUILD — what's genuinely missing

Ordered by dependency, not priority. **B8 is deliberately last** per your instruction.

| # | Item | Size | Why |
|---|---|---|---|
| **B1** | **Customer CRM** — `customers` collection owned by the pro. Dedupe, contact history, per-customer job list, private/business type flag, tax-relevant fields (UID for §13b) | **M** | Foundation. Today a "customer" is either a platform account or an unstructured blob on `pm_projects`. Every trade scenario in the doc (landlord with 6 flats, Hausverwaltung with 12 sites, repeat Sanitär) needs this |
| **B2** | **Lead intake — "ride MyHammer"** — three paths: (a) forward-an-email inbox parser, (b) paste-a-lead text → LLM structuring, (c) manual quick-add. All → Customer + Job in one step | **M** | The literal mechanism of *riding* the marketplace. Doc Part E #6: no partner API, **do not scrape** — sit on top. Reuse the K4 pattern for the parser |
| **B3** | **Fast-Quote engine** ⭐ — line items, per-trade templates, rate memory, Basic/Standard/Premium tiering, reservation/assumption block, versioned revisions, branded PDF, accept-link, expiry + auto-nudge, full state machine (`draft→sent→viewed→accepted\|rejected\|expired\|negotiating→converted`) | **XL** | **Pillar A1 — the wedge, and ~90% absent.** Nothing in the repo produces a line-itemed customer-facing quote document. Biggest single build |
| **B4** | **Trade template library** — Leistungsverzeichnis skeletons per trade: positions, units, default rates, waste/Verschnitt factors (pattern-aware for Fliesen), add-ons, guided 4–8 tap forms | **L** | The moat. Doc: "competitors have generic quote builders; you ship trade-shaped ones." R5 gives the shape, not the content |
| **B5** | **Photo/voice → quote** — measurement estimation, part-ID, colour preview, voice-note→positions. All on `services/vision.py` extracted from K4, with honest confidence + always-editable output | **L** | The demo moment in every trade. Doc Part E #8: a confidently-wrong AI is worse than no AI — degrade gracefully, show ranges, allow override, disclose the sub-processor |
| **B6** | **Offline-first capture** — IndexedDB queue + sync for quote, photo, timer, sign-off | **L** | **Zero today** (no IndexedDB/localforage anywhere; the service worker is push-only). Doc: "an architecture decision, not a late patch." Non-negotiable for Sanitär cellars, Boden new-builds, rural Garten. Cost multiplies if deferred |
| **B7** | **Recurring-service engine** — contracts, visit generation, per-visit checklists, proof-of-visit photo, route order, auto-invoicing on schedule, weather trigger for Winterdienst | **L** | Doc C4: *"the highest-LTV scenario in all five trades"* and *"treat it as core, not optional."* `jobs` has recurring *fields* and the calendar shows recurring items — that is not the engine |
| **B8** | **Payment rail rework** — Stripe Connect destination charges, deposit-on-acceptance, milestone links off the spine, dunning/Mahnwesen, cash + Beleg (AT), PSP-onboarding-decoupled path | **L** | ⏸ **Phase 8, last.** See §5 for why this is safe to defer |
| **B9** | **Invoice compliance hardening** — see §4.1 | **M** | Several are live defects, not gaps |
| **B10** | **DE/AT configuration layer** — country-scoped VAT rates, legal labels, invoice mandatory fields, terminology | **M** | Doc Part E #1: pick one launch country, architect for two. Today: 20% hardcoded, AT-only, no config seam |
| **B11** | **Digital Abnahme / sign-off** — customer signs completion in the portal; attaches to the job record | **S** | CO e-signature exists; formal Abnahme doesn't. Doc Part B #5 — the §634 dispute shield |
| **B12** | **Quote/cash analytics** — time-to-quote, quote-to-cash days, average Nachtrag captured, % paid on time | **S** | Part E #9. Win rate + cash-flow already exist; add the rest. These are the renewal-conversation numbers |
| **B13** | **Customer communication log** — outbound WhatsApp / SMS / email with a thread view, replacing in-app chat | **M** | Only needed if D3 resolves toward "keep a comms surface" |

---

## 4. What's missing — detail and recommendations

### 4.1 Invoice compliance (highest risk — some are live defects)

Zero occurrences anywhere in the codebase for: **§35a, §13b, ZUGFeRD, XRechnung, GoBD, RKSV, Registrierkasse, Abschlag, §632a, Mahnung/dunning.**

| Gap | Severity | Recommendation |
|---|---|---|
| **No Leistungszeitpunkt on pro invoices** | 🔴 **Live defect.** It exists on *your* operator invoices (`services/invoicing.py:131`) but not on the ones pros issue. Mandatory under §11 UStG / §14 UStG | Add `service_date` / `service_period` to the invoice model + PDF. **Fix in Phase 5, cheap** |
| **Single flat VAT for the whole invoice** (`pro_invoicing.py:167`) | 🔴 `vat_rate = 0 if kleinunternehmer else 20`. No per-position rate, no AT 10%/13%, no cross-border. The doc's "mixed cart" case fails; a DE launch invoices at the wrong rate | Move `vat_rate` to the **line item**. Prerequisite for §13b and for B10 |
| **No §35a labor/material split** | 🟠 Named a must-have in A3, C1 *and* C5 | Add `kind: labor \| material \| travel` per position; PDF renders a §35a summary box. **Small change, big sales value** — the pro wields the customer's tax deduction as a closing argument |
| **No §13b reverse charge** | 🟠 Applies on Bauleistungen to other Bauleister — relevant for Boden/Fliesen new-build GC work (doc C2 #5) | Needs B1 (customer type + UID) first. Per-position flag + suppressed VAT + mandatory note |
| **No Abschlag/Schlussrechnung netting** | 🟠 Doc: *"the classic manual error source."* PM milestone payments are recorded but no final invoice nets them | Build once B8's milestone model is on the spine. **Do the netting logic in Phase 5 even though the payment rail is Phase 8** — netting is invoice arithmetic, not a PSP feature |
| **No ZUGFeRD / XRechnung** | 🟡 DE B2B *receiving* mandatory now; *sending* 2027 (>€800k) and 2028 (all). **B2C exempt** — and these five trades are mostly B2C | **Do not rush it, and do not sell fear.** Ship the §35a split and GoBD archiving first (they help today). Schedule ZUGFeRD for the DE launch, XRechnung later |
| **No RKSV / Registrierkasse (AT)** | 🟡 Triggered above €15k turnover **and** €7.5k cash | v1: *record* cash + issue a compliant Beleg. Full RKSV certification is a **build-vs-partner-vs-BYO-Kasse decision** — see D4. Tailwind: from **1 Oct 2026** a digital Beleg is legally equal to paper in AT regardless of amount |
| **Immutability is convention, not enforced** | 🟡 Good news: there is **no** PATCH endpoint on `pro_invoices`, so invoices are effectively immutable, and storno is correctly modelled as a negative mirror with the original locked | Formalise: append-only audit log + hash chain. The storno-audit endpoint (`admin_advanced_routes.py:244`) is already the right instinct |
| **No dunning/Mahnwesen** | 🟠 Your own PRD lists it as unbuilt "P1". The doc: *"this alone justifies the subscription for many solos"* | Scheduler + 3-stage templates. **Buildable in Phase 7 without any PSP** — a reminder email with the existing EPC-QR PDF attached needs no Stripe at all |

### 4.2 Product gaps by trade

| Trade | Have | Missing |
|---|---|---|
| **Sanitär** | Bathroom-reno template w/ milestones, PM coordination, materials | Emergency pricing card, photo part-ID, triage queue + ETA, insurance-ready doc pack |
| **Maler** | Painting template | m²/surface logic, window/door deduction, tiering, AI colour preview, prep-surcharge toggle |
| **Montage** | Timer, materials, barcode | Customer-visible time log, on-site scope-add, route order, Anfahrtspauschale + minimum-charge automation, cash/Beleg, the sub-2-minute loop |
| **Boden/Fliesen** | *(nothing trade-specific)* | Everything: measurement, pattern-aware Verschnitt, substrate/moisture checklist, material DB with waste factors, deposit-before-order gate, order-status timeline |
| **Garten** | Calendar, recurring job *fields* | The entire recurring-service engine (B7), photo-based pre-quote corridor, seasonal pipeline view, weather-triggered dispatch, proof-of-visit |

**Recommendation:** launch with **Sanitär + Maler** — they have the most existing scaffolding and the two clearest demo moments. Add Boden/Fliesen once the measurement layer (B5) is real. Garten last, because it needs B7 wholesale.

### 4.3 Field reliability

Offline is at **zero**. The doc treats it as architecture. **Recommendation: build the offline queue in Phase 6, before the recurring engine and before payments** — every later feature that writes from a phone inherits it for free, and retrofitting sync onto ten features costs several times more than onto three.

### 4.4 Payment infrastructure

Two facts from your own PRD:
- `sk_test_emergent` is a **managed key that only works via `emergentintegrations` and is rejected by the native Stripe SDK** — so Stripe Connect is impossible until the operator supplies a real Stripe key.
- Today 100% of every customer payment lands in the **platform** balance, and pro payouts are a manual `pro_payouts` ledger an admin settles by clicking "Mark settled."

**That second one is the most serious non-compliance item in the repo** — holding tradespeople's money on your books is an operational and likely licensing exposure (payment-institution territory), quite apart from being the opposite of "get paid faster."

**Recommendation:** obtain a real Stripe account **now** (it is a paperwork lead-time item, not a dev item, and KYC can take weeks) so it is ready when Phase 8 starts — but keep the *code* work last, as instructed. Until then the **EPC-QR (K2)** carries the payment story: the customer scans the invoice QR, their banking app pre-fills the SEPA transfer, money goes **pro → customer directly**, and the platform never touches it. That is both compliant and genuinely useful, and it is why deferring payments is safe.

### 4.5 Localization

UI is English-primary with DE as a translation; the doc wants **DE-native** with AT/DE legal-label divergence (USt-ID vs UID, Beleg vs Rechnung, Registrierkasse). **Recommendation:** flip the default language to DE and add a country-scoped label layer as part of B10.

---

## 5. The migration plan

Nine phases. Payments are Phase 8 — deliberately last, and safe to defer because K2 (EPC-QR) already gets the pro paid.

> Every phase ends shippable. Do not run phases 1–3 in parallel; the strip has to land before the re-spine, and the re-spine before the quote engine.

---

### Phase 0 — Decide and freeze *(no code, ~1 week)*

Settle the six decisions in §6 in writing. Specifically: launch country, spine choice, what happens to in-app chat, RKSV posture, and whether existing marketplace data matters.

**Exit criteria:** decisions recorded in `memory/PRD.md`; a Steuerberater/Fachanwalt engagement booked for the Phase 5 review; a real Stripe account application submitted.

---

### Phase 1 — Strip the marketplace *(M, ~2 weeks)*

Delete §3.3 in full. Remove the `homeowner` role from `auth`/onboarding; collapse `role` to `tradesperson | admin`. Gut the fee-based revenue path in `billing_routes.py`. Drop the marketplace collections.

**Do this first and do it ruthlessly.** Every later phase is cheaper against a smaller surface, and half-deleted marketplace code will otherwise haunt the re-spine.

**Exit criteria:** app builds and runs pro-only; no route references `role == "homeowner"`; test suite green after removing marketplace tests.
**Risk:** low. Deletion, not transformation.

---

### Phase 2 — Re-spine *(L, ~3–4 weeks)*

Build **B1 (Customer CRM)**. Introduce `Job.mode` (R4). Promote `pm_projects` → the `Job` spine; make `mode: 'simple'` genuinely lightweight (no Kanban/Gantt chrome). Repoint invoicing at the single spine — retire `draft-from-job`, keep and generalise `draft-from-project`. Promote the share-token portal (K7) to the primary customer surface.

**Exit criteria:** a pro can create a customer, create a simple job, and invoice it end-to-end with no marketplace involvement and no customer account.
**Risk:** 🔴 **highest structural risk in the plan.** `pm_routes.py` is 1,907 lines and your PRD already flags it for a split. Do the split *here*, while touching it anyway: `pm_routes` → `jobs`, `tasks`, `materials`, `change_orders`, `payments`, `templates`.

---

### Phase 3 — Fast-Quote engine *(XL, ~6–8 weeks)*

Build **B3**. Line-item quote model, versioning, tiering, reservation blocks, branded PDF, accept-link through the portal, expiry + nudge, the full state machine. Wire **quote → invoice pre-fill properly**: the invoice inherits *every* accepted line, not today's collapsed single line (`pro_invoicing_routes.py:69`).

Build **B2 (lead intake)** alongside — it feeds the quote engine and is the thing that makes "riding MyHammer" real.

**Exit criteria:** photo/voice/form → send-ready branded quote in under 3 minutes; customer accepts via link; job created; invoice pre-fills every line.
**This is the wedge. If only one phase gets done properly, it is this one.**

---

### Phase 4 — Trade templates + vision *(L, ~4–6 weeks)*

Build **B4** and **B5**. Extract `services/vision.py` from K4 first, then build measurement, part-ID and colour preview on it. Ship Sanitär + Maler template sets complete; Boden/Fliesen next.

**Exit criteria:** each launch trade has one signature demo moment that works on a real phone with a real photo.
**Risk:** AI accuracy. Non-negotiable: ranges not point estimates, visible confidence, always editable, honest labelling. Doc Part E #7 — put the liability position in the ToS *and* the UX.

---

### Phase 5 — Invoice compliance hardening *(M, ~2–3 weeks)*

Fix §4.1 in this order: per-position VAT → Leistungszeitpunkt → §35a split → §13b → Abschlag/Schluss netting → immutability audit log. Build **B10** (DE/AT config) and **B11** (digital Abnahme).

**Exit criteria:** Steuerberater/Fachanwalt sign-off on generated invoices for both AT and DE. Do not skip this review — it is the cheapest insurance in the whole plan.

---

### Phase 6 — Offline & field reliability *(L, ~3–4 weeks)*

Build **B6**. IndexedDB queue + sync for quote, photo, timer, sign-off. Conflict resolution. One-handed / glove / sunlight pass over the field screens.

**Do it here, not later.** Everything built after inherits the queue; everything built before needs retrofitting — and there is already plenty of "before."

---

### Phase 7 — Recurring engine + dunning *(L, ~4–5 weeks)*

Build **B7** (recurring contracts, visits, checklists, proof-of-visit, auto-invoicing, route order) and the **dunning ladder** from B8 that needs no PSP — polite → firm → Mahnung, on a schedule, with the EPC-QR PDF attached. Add **B12** analytics.

**Exit criteria:** a Hausverwaltung with 12 fortnightly sites runs end-to-end with auto-monthly invoicing. That is the doc's highest-LTV scenario.

---

### Phase 8 — Payment rail ⏸ *(L, ~4–5 weeks)* — **LAST, as instructed**

Real Stripe key → **Stripe Connect destination charges** (auto-split, 1% application fee) → retire the manual `pro_payouts` ledger → deposit-on-acceptance wired to the quote-accept event → milestone links off the spine → cash + Beleg path (AT) → PSP-onboarding-decoupled path so the app is fully useful *before* payment setup completes.

**Why last works:** K2 (EPC-QR) already gets the pro paid, and Phase 7 already chases late payers. Connect improves the economics and removes the licensing exposure — it does not gate the product's core value. **Caveat:** the Stripe account application must be filed in Phase 0, because KYC lead time is measured in weeks and is not something a sprint can compress.

---

### Phase 9 — Launch prep *(M, ~2–3 weeks)*

DE-first language flip. Onboarding to first-value-in-one-job (Part E #4 — import nothing, learn rates from the first quote). Prospect-list activation using R1's 8.6k businesses. Phone/WhatsApp support line (Part E #11). Pricing: flat per-business, monthly-cancelable, anchored below two MyHammer lead contacts, reusing the Explorer mechanic (R6).

---

### Timeline shape

Phases 0–3 are the **critical path to a demonstrable product** — roughly **12–15 weeks** and the point at which you can put it in front of a Maler. Phases 4–7 are ~15–20 weeks to a complete P0. Phase 8 adds ~4–5. Call it **8–10 months** at one dev; less with two, since Phases 4 and 5 parallelise cleanly and Phase 6 can overlap Phase 7.

---

## 6. Open decisions

| # | Decision | Why it blocks | Recommendation |
|---|---|---|---|
| **D1** | **Launch country: AT or DE?** | Determines VAT rates, invoice fields, cash rules, e-invoice posture, and which of §35a / RKSV is v1 | **AT.** You're Austria-based, the tax toolkit is already AT-shaped, the 8.6k prospect list is Austrian, and the Oct-2026 digital-Beleg change is a direct tailwind. Architect for DE via B10 |
| **D2** | **Confirm the spine is `pm_projects`** | Phase 2 is a rewrite if this flips | **Yes.** It already has the embedded customer, portal, change orders and templates that a one-sided product needs |
| **D3** | **In-app chat: kill, or replace with outbound comms?** | ~1,500 lines and B13's fate | **Kill in-app chat** (no counterparty without accounts). Ship a **minimal outbound log** — quote sent / reminder sent / Nachtrag sent — in Phase 3. Defer full WhatsApp/SMS (B13) to P1 |
| **D4** | **RKSV: build, partner, or BYO-Kasse?** | Gates the cash path for Montage and small Sanitär jobs | **Partner or BYO for v1.** Record cash + issue a compliant Beleg; do not attempt full signature-chain certification in P0 |
| **D5** | **Does existing marketplace data need preserving?** | Phase 1 scope | Appears mostly seed/demo (`seed.py`, `reseed_clean.py`, `migrate_explorer_testpro.py`). **Verify against production before deleting.** The 8.6k directory rows are the one genuinely irreplaceable dataset — back them up first |
| **D6** | **Reviews: drop entirely, or keep as a P2 stub?** | Affects Phase 1 deletion scope | **Drop now.** The doc puts reviews at P2. Removing is cheap; a stub is dead weight through eight phases |

---

## 7. Data migration

Low-risk, because there is little real transactional data — this is a schema migration, not a data migration.

1. **Back up `business_directory` first.** 8,660 real rows with coordinates; the single irreplaceable asset (R1).
2. **Pro accounts + `pro_profiles` migrate as-is.** Bank details, Kleinunternehmer flag, logo, invoice template, business address all carry over unchanged.
3. **`pro_invoices` migrate as-is.** Immutable by design and legally retained — never rewrite them. New compliance fields apply to *new* invoices only; historic ones keep their original shape. This is a legal requirement, not a convenience.
4. **`pm_projects` → `jobs`**, all set to `mode: 'project'`. Backfill `customer_id` by promoting each embedded `customer` blob into a `customers` row (B1).
5. **Marketplace `jobs` → discard.** If any completed job carries an invoice, synthesise a minimal `Job` + `Customer` from the invoice's `customer_snapshot` so the invoice keeps a parent.
6. **`quotes` → discard** (R8). The models share almost nothing.
7. **Drop:** `reviews`, `saved_pros`, `fee_log`, `bookings`, `directory_inquiries`, `business_claims`.
8. **Retention:** confirm the 7-year (DE: up to 10) invoice retention path survives the migration. Doc A3 — the export-everything guarantee is both a legal need and a trust signal.

---

## 8. Summary

| | Count |
|---|---|
| **Keep** | 20 asset groups — Invoice Toolkit, Tax Toolkit, PM spine, customer portal, vision OCR, PWA, i18n, GDPR, UI kit |
| **Repurpose** | 10 — directory→prospect list, claim→onboarding, live-location→ETA, Explorer→trial |
| **Remove** | ~4,100 frontend + ~1,700 backend lines, plus partial gutting of 4 route files |
| **Build** | 13 items; **B3 (Fast-Quote) is the wedge and the single biggest lift** |

**Roughly 55–60% of the codebase survives the pivot.** What survives is, satisfyingly, the expensive half: compliance-shaped invoicing, tax reporting, mobile polish, GDPR, PWA, i18n, and a working vision pipeline. What dies is the marketplace scaffolding — the half that was competing with MyHammer instead of riding it.

The three things that decide whether this works:
1. **Phase 2's spine consolidation** — get one `Job` object or nothing downstream holds together.
2. **Phase 3's quote engine** — it is the wedge; there is no product without it.
3. **Phase 6's offline layer** — cheap now, punitive later.
