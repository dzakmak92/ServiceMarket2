# ServiceMarket PRD

## Original Problem Statement
Build a competitive full-stack app like myhammer.de

## Core Requirements
- Authentication: JWT-based custom auth with Cloudflare Turnstile anti-bot protection
- Languages: EN/DE/TR/ES
- Payments: Real Stripe integration, Austrian compliance for Admin Invoicing
- Pro Toolkits: Invoice Toolkit, Tax Toolkit, Project Management (PM) Toolkit, All-in-One Bundle
- UX/UI: Comprehensive dashboard, real-time push notifications, Outlook-style thread pagination, Google Maps geofencing, swipeable mobile tabs
- GDPR and Austrian-DSG compliant
- Jobs vs Projects splitting (volume/income distinction)
- Live ETA/Location sharing in chat
- Advanced Calendar features (color coding, drag-and-drop, recurring jobs)

## Architecture
- Backend: FastAPI + Motor (async MongoDB)
- Frontend: React SPA (TailwindCSS + Shadcn)
- DB: MongoDB (no `threads` collection — threads computed from messages)
- Auth: JWT custom
- Maps: OpenStreetMap / Leaflet.js (free)
- Payments: Stripe

## Key DB Schema
- `users`: roles, metadata
- `jobs`: listing_type, job_number, recurring job fields
- `bookings`: time slots, drag-and-drop reschedule states
- `messages`: core chat (NO threads collection)
- `feedback`: admin notified on new entries
- `live_location_sessions`: GPS sessions with dest_lat/dest_lng

## Key API Endpoints
- `PATCH /api/messages/{job_id}/share-location`
- `GET /api/messages/{job_id}/live-location`
- `POST /api/jobs` (supports recurring timeline)
- `POST /api/misc/bookings/{booking_id}/reschedule/propose`
- `POST /api/live-location` (start session)
- `PATCH /api/live-location/{session_id}` (update position)
- `GET /api/live-location/{session_id}` (poll)
- `DELETE /api/live-location/{session_id}` (stop)

## 3rd Party Integrations
- Stripe (Payments) — requires User API Key
- Cloudflare Turnstile (Anti-bot) — requires .env key
- Emergent LLM Key (Translation, Receipt OCR)
- OpenStreetMap Nominatim / Leaflet.js — Free, integrated

## Critical Notes
- DB Architecture: `db.threads` collection DOES NOT exist. Never query it directly.
- Timezone Handling: MongoDB returns offset-naive datetimes. Strip tzinfo when comparing.
- Mobile: All grids must collapse gracefully (grid-cols-1 on mobile). Use min-w-0 + overflow-hidden.

---

## What's Been Implemented

### Session 2026-06-14 — Find Pros: single combined page + 8.6k CSV import + GPS near-me (NEW)
- **P0 Large CSV import fixed:** Refactored `directory_routes.py::import_csv` from per-row `find_one`/`insert_one` (timed out on big files) to a single PyMongo `bulk_write([UpdateOne(..., upsert=True)], ordered=False)` with `$setOnInsert` preserving claim state. Imported the user's real **8,660-row** semicolon CSV in ~14s (8,032 new + 628 updated, 0 skipped → **8,900** total businesses). Broken thousand-separator coords (`482.213.796`→48.2213796) decoded correctly (0 out-of-range). Admin import UI (`AdminHeatmap.jsx`) switched from axios → **native `fetch`** (credentials:'include') to avoid multipart timeouts.
- **Find Pros rebuilt into ONE combined page** (`FindProsPage.jsx`, homeowner): registered ServiceMarket pros (cards) + the imported directory Leaflet map + directory business list, all on a single scroll page. Removed the standalone `/business-map` link from the homeowner desktop Header 'More' dropdown (now empty) + mobile bottom-nav 'More' sheet (route still exists for pros' claim flow).
- **Trust badges:** `ProCard.jsx` now renders Verified / Certified (licensed) / Insured pills from `is_verified` / `is_licensed` / `is_insured`. Pros without these flags show no badges.
- **GPS 'near me':** `gps-toggle-btn` uses `navigator.geolocation`; on success recenters the map (`Recenter` via `useMap().flyTo`), drops a 'You are here' marker + radius `Circle`, shows a radius bar (10/25/50/100 km), and annotates pro cards + directory rows with haversine distance, sorted nearest-first. Registered pros render as larger teal `proMarkers` on the map (click → `/pros/:id`).
- **Server geo box:** `/api/directory/markers` & `/api/directory/businesses` accept `lat`/`lng`/`radius_km` → `_apply_geo_box` bounding-box filter (no geo index needed; client refines to a circle). Overview capped at 5000 markers for render perf; near-me returns the full local set. (Vienna 25km=1703, Graz 25km=654.)
- **i18n:** new `fp_*` keys (subtitle, GPS labels, radius, verified/certified/insured, sections, distance) in EN/DE/TR/ES.
- **Tested:** backend pytest `tests/test_iter65_directory_geo.py` 4/4 (bulk import + coord decode + geo box + badge flags). Frontend testing_agent **iteration_65 = 100% (22/22)** — badges gating, GPS radius + distance + Clear, contact modal, filters, nav cleanup, 390px zero overflow, admin fetch-import (+rows). No bugs.
- **Notes (non-blocking):** admin CSV success flash is short-lived (cosmetic); `FindProsPage.jsx` ~446 lines (could extract ContactModal/BusinessRow later); 240 leftover rows from the prior 868-row import remain (valid AT businesses, harmless).

#### Follow-up refinements (2026-06-14, same session)
- Map now colours pins by **segment** (48 segments) instead of group; legend shows the top-14 segments present + acts as a quick segment filter. `BusinessHeatMap` gained a `colorField` prop (default 'group'; Find Pros passes 'segment').
- The map filter dropdown switched from group → **segment** (`hm-segment-select`, all 48 segments). `/api/directory/markers` already supported the `segment` param.
- **Removed the "More local businesses" directory list section** from Find Pros (and its pagination/BusinessRow machinery). Directory businesses are now browsed/contacted solely via the map pins (click pin → Contact modal). Verified via screenshot.

#### GPS fix + manual location fallback (2026-06-14)
- **Bug:** Homeowners reported "GPS could not get my location". Root causes: `enableHighAccuracy:true` + 10s timeout frequently fails on desktops/VMs, and the embedded preview iframe can block `navigator.geolocation` entirely.
- **Fixes:** (1) GPS options relaxed to `{enableHighAccuracy:false, timeout:12000, maximumAge:300000}` (network/wifi/IP fix is far more reliable). (2) **Manual location fallback** — new `GET /api/directory/geocode?q=` (Nominatim proxy, biased to the user's country, retries without bias) lets the homeowner type a city/postcode → map recenters + near-me works. The manual form auto-opens on any GPS failure and prefills the user's saved city; also reachable anytime via an "Enter location manually" button. New i18n `fp_enter_manually`/`fp_manual_ph`/`fp_locate`/`fp_manual_hint` (also backfilled the missing German `fp_*` block + `fp_all_categories`).
- **Tested:** pytest `test_iter65_directory_geo.py` now 5/5 (added geocode: city/postcode→AT coords, junk→404, short→400). Screenshot: manual "Graz" lookup recenters the map with "You are here" + radius ring + nearby pins.

#### Directory map overhaul + lead funnel + onboarding claim (2026-06-15)
- **Map pins** now coloured by MEANING (claimed=green vs unclaimed=slate), never by 48 categories; **name-only tooltips**. `BusinessHeatMap` exports `MAP_COLORS` (removed `buildGroupColors`/`colorField`).
- **Find Pros legend** simplified per user: a single line **"More than 8k pros"** (or "{n} pros within {r} km" under GPS) + a "tap a pin to message" hint. Dropped the confusing multi-stat colour key.
- **Privacy:** `/api/directory/markers` and `/api/directory/businesses` no longer return phone/email/website. Homeowners contact via an **on-platform message** only.
- **Lead funnel:** `POST /api/directory/businesses/{id}/inquire` stores a `directory_inquiries` lead and notifies all admins. Admin Heatmap shows a **"Homeowner inquiries"** section (`GET /admin/inquiries`, `POST /admin/inquiries/{id}/resolve`) + a "New inquiries" stat. Homeowner MessageModal replaces the old contact-reveal modal.
- **Admin Heatmap:** removed the "Top groups" breakdown (kept **Top categories** + **Top cities**); map legend recoloured to claim-status; 5 stat cards.
- **TP onboarding:** new **"Claim my business — join the family"** step (pro flow is now 5 steps; step index 3). Shows the names-only map + a search pre-filled with the company name + claimable results. Claims go to admin approval; the step is **skippable**. New `OnboardingClaimStep.jsx`.
- **Geocode robustness:** added a built-in major-AT-cities table checked before Nominatim, so the manual-location box always resolves common cities even when Nominatim is rate-limited.
- **i18n:** new `fp_*` / `onb_claim_*` keys across EN/DE/TR/ES.
- **Tested:** pytest `test_iter65_directory_geo.py` **7/7** (markers hide contact + totals; homeowner inquiry→lead→admin→resolve; geocode; bulk import; geo box; badges). Frontend testing_agent iteration_66 **12/13** (only blocker: Turnstile-gated new-account signup). Main agent **self-tested the onboarding claim step end-to-end** with a seeded non-onboarded pro (qaonboard@test.com): role→details→licence upload→claim step (search "Weber"→8 results→claim→success)→skip to security. Simplified legend verified ("More than 8k pros").



### Session [2026-06-10] — Calendar: schedule↔availability sync, schedule redesign, save toast
- **Synced schedule & availability**: added a `focusDate` prop to `DatedAvailabilityMatrix` (+`useEffect` deriving `weekOffset`/`mobileDayIdx` from it via exported `startOfWeek`). Calendar passes `focusDate={selected}`, so the availability editor's displayed week + selected day always follow the calendar's selected day (and "Jump to date"). A booking now shows consistently in both (schedule appointment card + red ✕ booked slot in the matrix).
- **Schedule redesigned to mirror the Availability section**: rewrote `WeekAgenda` from a flat 7-day list into a **day-strip + selected-day** layout — week range header with prev/next week nav, a Mon–Sun day-strip (teal dot marks days with appointments), and the selected day's appointments below (or per-day "No appointments" / a calm coffee empty-state when the whole week is free). Same visual language as the availability picker. Both keyed on `selected` → inherently synced.
- **Save toast**: toggling an availability slot now shows the page's existing toast pill ("Availability saved" / error) via `showToast` (NOT sonner — the page already has a local `toast` state; using sonner shadowed it and broke `.error`).
- New i18n keys `cal_avail_saved`, `cal_avail_save_err` (EN/DE/TR/ES). Fixed a stray `default t;` line that had crept into `translations/index.js`.
- **Verified**: jump-to-booking moves schedule + availability to the same week (Jun 16 booking visible in both); availability toggle persists + shows toast; desktop cohesive; mobile 390px zero overflow, day-strip = 7 buttons.

### Session [2026-06-10] — Calendar = control center: availability editor moved from Settings
- Per user: the Calendar page should be the editing "control center". **Moved the editable availability matrix (`DatedAvailabilityMatrix`) from Settings → Calendar** and **removed the availability section from Settings entirely** (deleted its import, `SLOTS`/`DAYS`, `availability`/`bookings` state, `fetchAvailability`, `toggleAvail`, and the `about-availability` JSX block).
- On the Calendar page it sits as a full card below the 7-day agenda ("Weekly availability", `pro-cal-availability`) using the SAME component the user liked — desktop 7×12 grid + mobile day-strip + slot chips (testidPrefix `cal-avail`), `editable`, wired to `getActive`/`toggleAvail` → `PUT /api/availability` with optimistic update. Replaced the earlier read-only `AvailabilitySummary` (removed).
- **Public profile (`ProDetailPage`) left untouched** (it has its own local availability matrix).
- **Verified**: calendar matrix renders & is editable; toggling a slot (Wed 12:00) persisted across reload; Settings no longer shows any availability block/matrix; mobile (390px) shows the day-strip view with zero overflow.

### Session [2026-06-10] — Pro Calendar desktop redesign + "jump to next booking" (design_agent blueprint)
- Used `design_agent` (blueprint saved at `/app/design_guidelines.json`). Implemented with the app's existing `teal`/`cream`/`ink` tokens for consistency (kept brand teal rather than introducing a new shade).
- **Removed the disliked "Weekly Availability" matrix** from the calendar's right sidebar (the wall of empty grey cells that looked "creepy" on empty weeks). Availability editing now lives solely on Settings; the calendar shows a clean read-only **`AvailabilitySummary`** (per-day "Mon 08:00–18:00 … Sat Off") with an **Edit → Settings** link.
- **New `UpNextWidget`** (teal card, right sidebar top): surfaces the pro's next upcoming booking (relative label "In 6 days", title, date, time, customer) with a **"Jump to date"** button (`jump-next-booking-btn`) that jumps the month grid + 7-day agenda to that booking. Friendly "You're all caught up" state when none.
- **Layout**: switched to a 12-col bento grid — left `lg:col-span-8` (calendar/list + 7-day agenda), right `lg:col-span-4` (Up Next, Active Jobs, Availability Summary). Stacks single-column below `lg`.
- **Calmer calendar cells**: removed the alarming red dashed border + "✕" on no-availability days; empty days are now soft cream, never disabled-looking.
- **Calm agenda empty-state**: when the 7-day window has zero bookings, shows a friendly visual (coffee image) + "Your schedule is beautifully clear" instead of seven "No appointments" rows (`pro-cal-agenda-empty`).
- Removed obsolete `AvailabilityToggle`, `toggleSlot`, `saving` state, unused `DEFAULT_SLOTS`/`BookingCard`. New i18n keys `cal_clear_title`, `cal_clear_sub` (EN/DE/TR/ES).
- **Verified**: desktop visual (12-col bento, Up Next, summary, calm grid); jump-to-date (agenda → next booking); empty-state on a free week; mobile 390px = zero overflow, all widgets present & stacked.

### Session [2026-06-10] — Pro Calendar + Settings availability: mobile overhaul
- **Pro Calendar** (`ProCalendarPage.jsx`): month grid is now compact on mobile (`min-h-[44px] md:min-h-[64px]`, 1 booking pill + "+N" on mobile vs 2 on desktop) so it takes less space. Directly below the calendar a new **7-day "Schedule" agenda** (`WeekAgenda`) shows the next 7 days day-by-day (each day lists bookings via compact `AgendaRow`, or "No appointments"). Defaults to **today**; clicking any calendar day shifts the 7-day window (a **Today** button resets it). List view changed from "Upcoming 30 days" → **"Next 7 days"** (`upcoming` window today→+6). Removed unused `BookingCard`/`selectedBookings`.
- **Settings availability** (`components/DatedAvailabilityMatrix.jsx`, used only by ProSettingsPage; public profile has its own local copy): made responsive. Desktop keeps the 7-column matrix (`hidden md:block`, no more forced horizontal scroll on mobile). Mobile (`md:hidden`) shows a **day-strip selector (Mon–Sun + dates)** + the selected day's time slots as a 2-column grid of toggle chips (available ✓ / booked ✕ / off), fully editable. New `mobileDayIdx` state (defaults to today). Distinct mobile testids `settings-avail-mday-{i}` and `settings-avail-m-{day}-{slot}-{iso}`.
- New i18n keys (EN/DE/TR/ES): `cal_next_7_days`, `cal_schedule`, `cal_today`, `cal_day_free`, `cal_no_upcoming`.
- **Verified at 390px (CDP)**: zero horizontal overflow on both pages; calendar agenda renders 7 day blocks + day-click/Today reset work; list view header = "Next 7 days"; settings mobile view active (7 day buttons, 12 slot chips, desktop grid hidden, slot toggle works, no runtime errors). Desktop unchanged.

### Session [2026-06-10] — Mobile fix: Kanban toolbar overflow
- **Bug**: On phones the PM Kanban tab's toolbar (move-hint text + "Save as template" / "Apply template" buttons) sat in a single non-stacking `flex justify-between` row, so the buttons overflowed off-screen and squished the hint into a tall narrow column.
- **Fix** (`KanbanTab.jsx`): toolbar now stacks vertically below the `md` breakpoint (matching the Kanban columns, which are single-column on mobile) with `flex flex-col gap-2 md:flex-row md:items-center md:justify-between`; button group wraps. Desktop unchanged.
- **Audit**: drove a 390px layout via CDP and programmatically measured horizontal overflow (`scrollWidth` vs viewport + any off-screen element) across all high-traffic Pro screens (Dashboard, Billing, Tax, Invoices, Calendar, Settings, Schedule, every PM project tab) and Homeowner screens (Dashboard, My Projects list+detail, Post-a-Job, Messages, Browse Jobs) — all clean (scrollWidth == 390). Kanban toolbar was the only offender. User confirmed fixed on device.

### Session [2026-06-10] — Job File PDF Export for completed PM projects (NEW)
- **Feature**: One-click export of a complete, archivable **Job File PDF** for COMPLETED projects (`status == 'done'`), available to BOTH the Pro and the Homeowner. Language picker at export time (EN/DE/TR/ES) localises every label.
- **PDF contents**: header with the pro's logo (if set) + business line, Summary, Tasks grouped by Kanban column (Done/In progress/To do), Materials, Work diary (+ total hours), Change orders (Nachträge), Milestone payments, Financials/P&L, and an embedded photo gallery — **all** photos (job progress photos + material photos) pulled from GridFS, EXIF-rotated + RGB-normalised via Pillow.
- **Backend**: new `services/pm_pdf_export.py` (`generate_job_file_pdf(proj, lang)` — async data gather + reportlab render; `SUPPORTED_LANGS`, `LABELS` for 4 langs, `MAX_PHOTOS=24`). Routes: `GET /api/pm/projects/{id}/export-pdf?lang=` (pro, `_require_pm_toolkit` + owned) and `GET /api/pm/my-projects/{id}/export-pdf?lang=` (homeowner, scoped to `customer.homeowner_id`). Both guard `status=='done'` → 400 otherwise; cross-role → 403. Helper `_safe_filename` in pm_routes.
- **Frontend**: shared `components/ExportJobFileModal.jsx` (4-lang picker + blob download, defaults to current UI lang). "Export Job File" button shown ONLY when project is `done` on `PMProjectDetailPage.jsx` (`pm-export-jobfile-btn`) and `HomeownerProjectDetailPage.jsx` (`ho-export-jobfile-btn`). New i18n keys `pm_export_*` in EN/DE/TR/ES.
- **Tested**: testing_agent iteration_63 = backend 16/16 (pytest `test_iter63_jobfile_export.py` 5 + `test_iter63_jobfile_guards.py` 11) — all 4 langs return 200 application/pdf on both endpoints, 400 for non-done, 403 cross-role, embedded image verified. Frontend 100% for both roles (button gating, modal lang picker, download + success toast).
- **Notes (non-blocking)**: pre-existing Homeowner "Quick reminder" modal auto-opens and overlaps content until dismissed (not caused by this feature). ExportJobFileModal surfaces a single generic error toast for 400/403 (button is client-gated to done projects, so users shouldn't normally hit it). pm_routes.py still ~1900 lines (refactor backlog).

### Session [2026-06-10] — Mobile UX overhaul (admin + toolkits) & material photos
- **Removed swipe-to-change-tab globally**: `SwipeableTabPanel` is now a passive wrapper — it was hijacking horizontal table scrolling on mobile and switching tabs. Fixes admin + all toolkits + both accounts (pro/homeowner). Tab nav is via the `ScrollSnapTabStrip` only.
- **Responsive tables → cards on mobile**: one global `@media (max-width:767px)` rule stacks `.admin-table` and `.stack-table` rows into labelled cards (via `td[data-label]::before`), eliminating horizontal overflow. Applied to admin (Users/Billing + all via shared class) and toolkit tables (PM Materials, Tax breakdowns, Accountant share).
- **Materials add-photo**: each material row has a camera button → uploads via `POST /api/uploads/file` then `PATCH` material `photos[]`; shows thumbnails + lightbox + remove. Materials models gained `photos:List[str]`.
- **Tested**: testing_agent iteration_62 = 100% backend (3/3 new pytest) + 100% frontend. At 390×844: admin Users/Billing + PM Materials stack with 0 horizontal overflow; horizontal drag no longer changes tabs; desktop 12/12 admin tabs regress clean. Material photo upload/persist/remove verified.
- **Notes (non-blocking)**: pm_routes.py ~1880 lines (refactor backlog); material `photos[]` URLs aren't ownership-validated server-side (future tightening); /tax stack-tables only render with seeded data (empty-state, not a bug).

### Session [2026-06-09] — Batch of 5 features (CO loop, HO notifs, barcode, AI insights, templates)
1. **CO → "invoiced"**: issuing a Nachtrag invoice from an approved change order now auto-flips the CO to `invoiced` (passes `change_order_id`+`project_id` through `ProInvoiceCreate`). Prevents double-invoicing; shows on pro Billing tab, HO page & public portal.
2. **Homeowner notifications**: in-app bell + web push when the pro sends a change order (`send_change_order`) or requests a milestone payment (`create_payment_request`) → deep-links to `/my-projects/<id>` (`_notify_homeowner_co_sent` / `_notify_homeowner_payment_requested`).
3. **Materials barcode scan**: `GET /api/pm/barcode-lookup?code=` (UPCitemdb free trial + graceful SKU fallback); `BarcodeScannerModal` (html5-qrcode camera + manual entry) in the Materials tab auto-fills product name/brand. Materials gained `barcode`/`brand` fields.
4. **Admin AI Insights tab** (`admin_insights_routes.py` + `AdminInsights.jsx`): `POST /api/admin/insights/analyze` summarises + categorises feedback & reviews via **gpt-5-mini** (Emergent key) into overview + sentiment + missing/problems/nice-to-have/praise with mention counts; cached in `db.admin_insights`. (Note: `gpt-5.4-mini` is NOT available on the proxy.)
5. **PM template upgrades**: built-in templates now carry **default materials + milestone payment schedules** (+ new "Electrical rewire" template); `apply-template` creates materials and (with a contract `base_amount` + IBAN) milestone payment requests; **"Save project as template"** (`POST /api/pm/templates/from-project/{id}`) snapshots tasks+materials+payments. Apply toast reports counts and warns if milestones skipped (no IBAN).
- **Tested**: testing_agent iteration_61 = 100% backend (13/13 new pytest `test_iter61_batch5.py`) + 100% frontend. Backend also verified via curl (CO flip, HO bell notif, barcode lookup, insights JSON, template apply counts).
- **Known**: `pm_routes.py` ~1880 lines — flagged for a future split (templates/materials/payments/notifications modules).

### Session [2026-06-09] — Homeowner "My Projects" area (NEW)
- Homeowners now have a dedicated logged-in area to view the managed PM projects their tradesperson runs, instead of relying on a per-link public portal.
- **Nav**: "My Projects" added to homeowner top nav (Header) + mobile More sheet.
- **List** (`/my-projects`, `HomeownerProjectsPage.jsx`): cards with status, category, pro name, progress %/tasks, and "Action needed" badges (pending change orders / due payments).
- **Detail** (`/my-projects/:id`, `HomeownerProjectDetailPage.jsx`): pro snapshot + "Message your pro" deep link (`/messages?job=&to=`), progress, photos, change orders (approve/decline with pre-filled e-signature), milestone payments (EPC-QR + "I've paid"), financials, diary.
- **Backend** (`pm_homeowner_routes.py`): `GET /api/pm/my-projects` (list), `GET /api/pm/my-projects/{id}` (detail incl. `job_id`+`pro_user_id`), `POST .../change-orders/{co}/approve|reject`, `POST .../payments/{pay}/client-paid` — all role-gated (homeowner) and scoped to `customer.homeowner_id`. Refactored `build_customer_project_payload()` in pm_routes.py, shared by the public portal + this auth view (DRY).
- **Tested**: testing_agent iteration_60 = 100% backend (10/10 pytest in `test_iter60_homeowner_my_projects.py`) + 100% frontend. Cross-account action parity (pro creates+sends CO → homeowner approves/declines, financials update), message deep-link, and 403 scoping for pros all verified. No bugs.

### Session [2026-06-09] — Kanban: replaced drag-and-drop with one-tap move controls
- Removed the finicky `@dnd-kit` drag-and-drop from the PM Kanban (`KanbanTab.jsx`). Each task card now has clear **move buttons** showing the target column name (e.g. "‹ To do" / "Done ›") — one tap moves a task between To do / In progress / Done. Far more reliable on desktop and touch.
- Uses existing `PATCH /api/pm/projects/{id}/tasks/{taskId}` with `{column}` (optimistic update + revert on failure).
- Added `pm_task_move_left` / `pm_task_move_right` keys and updated `pm_kanban_dnd_hint` in EN/DE/TR/ES. Verified both move directions persist correctly (todo↔doing). `@dnd-kit` no longer referenced in src.

### Session [2026-06-09] — CRITICAL fix: CO→Invoice "Job not found"
- **Bug**: "Convert to invoice" on an approved Change Order (Nachtrag) landed on "Job not found" with zero line items. Root cause: the invoice editor loaded a draft via `draft-from-job/<jobId>`, which requires the original Job to still exist + be completed + have an accepted quote. PM projects whose source job was archived/removed broke the flow.
- **Fix**: `ProInvoiceEditorPage.jsx` now loads the job-independent `GET /api/pro-invoices/draft-from-project/<id>` when `from_project` is present, prefills Nachtrag items via `POST /api/pm/projects/<id>/change-orders/<co>/to-invoice`, and submits with `draft.job.id` (nullable). `InvoiceFromProjectRedirect.jsx` now falls back to `jobId='none'` when a project has no backing job.
- Verified end-to-end (manual + testing_agent iteration_59, 8/8 flows pass): editor loads, line items + "Nachtrag CO-..." note prefilled, total correct (€450). Portal CO reject, pro mark-paid, /schedule, crew/dependency editor, EPC-QR toggle, 375px overflow, full tab regression all PASS.
- **Seed note**: `pro@test.com` toolkit flags can drift to False if the Explorer `simulate-reset` test helper runs mid-session; a backend restart re-seeds Explorer-active (90d, all toolkits) automatically. seed.py logic confirmed correct.

### Session [2026-06-09] — Explorer 3-month intro plan (NEW PRICING MODEL)
- **Explorer plan**: a pro's first 3 months offer ONLY the Explorer plan — €1/month, charged **€3 upfront** for the whole 3-month window, unlocking ALL toolkits (Invoice/Tax/PM) + Pro badge + free job contacts.
- After 3 months → **upgrade gate**: "Claim your badge" (upgrade to Pro €29.99/mo) OR "Stay on Standard" (free).
- New `plan_tier` value `explorer`; fields `explorer_started_at/ends_at/used/expired_at/gate_dismissed` on `pro_profiles`.
- Backend `billing_mode()` (single source of truth) returns: `explorer_offer | explorer_active | pro | gate | standard`. Exposed via `/api/billing/subscription-status` & `/api/billing/pricing` (+ explorer block, toolkit flags).
- Endpoints: `POST /api/billing/checkout/explorer` (€3 Stripe session, only in offer mode), `/explorer/simulate-expiry` & `/explorer/simulate-reset` (TEST helpers), `/explorer/choose-standard`.
- Explorer counts as premium everywhere: `pro_badge` (job_routes), free quotes/no contact fee (quote_routes), instant push (push_routes), Dashboard Pro KPIs unlocked. Helper: `frontend/src/utils/tier.js` `isPremiumTier()` + `planLabel()`.
- `expire_stale_subscriptions` now also expires Explorers past `explorer_ends_at` (revokes toolkit flags, notifies, shows gate).
- Test pro `pro@test.com` pre-seeded as **Explorer-active** (survives restarts via `seed.py`; was the root-cause bug fixed this session — seed no longer force-resets plan_tier to standard).
- Frontend: `BillingPage.jsx` ExplorerOfferCard / ExplorerActiveCard / UpgradeGateCard / ExplorerDevControls. Verified: full lifecycle offer→active(toolkits unlocked)→gate(toolkits revoked)→claim Pro / stay Standard.
- Tested: 21/21 backend Explorer tests pass (`backend/tests/test_iter56_explorer_plan.py`); full frontend regression ~95% (no critical issues) — iteration_56 & iteration_57 reports.

### Session 2026-06-14 (Invoice Toolkit — external invoices + 1% fee explainer)
- **External (off-platform) invoices:** Pros can invoice jobs closed OUTSIDE ServiceMarket. `ProInvoiceCreate` gains `source` ('external') + `customer` (`ExternalCustomer`); `create_pro_invoice(source, customer_override)` stamps `source` on the invoice. List `GET /api/pro-invoices?source=external|servicemarket` (old invoices w/o `source` = servicemarket).
  - Frontend `MyInvoicesPage.jsx`: "New external invoice" button → modal (manual customer + line items + due days + note, live net total); purple **External** badge + left border on external rows; Source filter (All/ServiceMarket/External). Translations EN/DE/TR/ES. Verified: create (RG-2026-0006, source=external, 20% VAT) + filters (external=1, servicemarket=5, all=6).
- **Online payment 1% fee — current behaviour (`routes/payment_link_routes.py`):** `SERVICE_FEE_PCT=0.01`; customer pays `outstanding + 1%` (fee ON TOP, paid by customer, NOT deducted from pro). Uses ONE platform Stripe account via emergentintegrations `StripeCheckout` — **NO Stripe Connect** (no transfer_data/destination/application_fee), so 100% (invoice + fee) lands in the PLATFORM Stripe balance. Only the invoice amount is recorded as paid on the pro's invoice; the pro's IBAN is informational and there is NO auto-payout to the pro. Auto-split (pro share→pro IBAN, 1%→platform) requires Stripe Connect (NOT implemented).
- **Payouts-owed tracker (interim, no Connect — `routes/payout_routes.py`, `AdminPayouts.jsx`):** Each successful online payment writes a `pro_payouts` ledger entry (status 'owed'; owed amount + 1% fee + gross; idempotent inside the payment-success guard). New Admin **Payouts** tab: totals (owed / settled / fees earned), amount owed grouped by pro with copyable IBAN, per-pro **Mark settled** (bulk + reference), ledger filter (owed/settled/all). Endpoints: `GET /api/admin/payouts/summary`, `GET /api/admin/payouts`, `POST /api/admin/payouts/{id}/settle`, `POST /api/admin/payouts/settle-pro/{pro_id}`. Verified create→settle end-to-end. NOTE: `sk_test_emergent` is a managed key that only works via emergentintegrations and is rejected by the native Stripe SDK, so Stripe Connect is impossible until the operator supplies their OWN real Stripe key. **TODO (live Connect key):** swap to Connect destination charges (auto-split, 1% application fee).


### Session 2026-06-13 (Current)
- **Pro Heatmap + Business Directory (NEW, shipped & tested 100% frontend):** A separate `business_directory` collection of tradesperson businesses (lat/lng each) rendered as a Leaflet **leaflet.heat** gradient density map.
  - **Homeowner page** `/business-map` (in the "More" menu, desktop dropdown + mobile sheet): heat map over Austria, stat cards (pros mapped / cities covered / claimed), search + category + city filters, paginated business list, and a **Claim this business** flow (modal → pending claim).
  - **Admin tab** "Heatmap" (`AdminHeatmap.jsx`): heat map, 4 stat cards, top-cities/top-categories breakdowns, **CSV import** (multipart), and **pending-claim moderation** (Approve/Reject). Approve links the listing to the claimant and auto-rejects competing claims.
  - **Claim lifecycle** verified end-to-end (HO claim → admin approve → claimed=1; duplicate-claim guarded). CSV import verified (skips rows missing name/lat/lng; upsert by name+city). English→local city alias in search (vienna→Wien).
  - Backend: `routes/directory_routes.py` (+ models `BusinessClaimRequest`, `ClaimReviewRequest`); demo seed `seed_directory.py` (64 businesses / 13 cities). Frontend: `components/BusinessHeatMap.jsx`, `pages/shared/BusinessMapPage.jsx`, `pages/admin/tabs/AdminHeatmap.jsx`. Dep added: `leaflet.heat`. Translations (EN/DE/TR/ES) for `nav_heatmap` + `hm_*`.
  - **PENDING (user):** operator will import the real CSV later. Expected headers (case-insensitive): `name, lat, lng` (required) + optional `category, city, postal_code/zip, address, phone, website, email`.

- **Real data imported (2026-06-14):** User's `Companies.csv` (868 Austrian companies, semicolon-delimited) imported. Columns: name;group;segment;city;country;phone;email;website;lat;lng;osm_id;address. Coordinates were encoded with thousand-separators/missing decimal (e.g. `482.034.384`→48.2034384) — importer auto-detects delimiter (`,`/`;`) and reconstructs coords via `_parse_coord` (now range-checks the single-dot case so `482.046` is correctly decoded to 48.2046 instead of being trusted as-is). Added `group`+`segment`+`osm_id` fields (upsert key = osm_id).

- **Map redesign — coloured pins per group + role-based action (2026-06-14):**
  - Replaced the heat-blob layer with **coloured `CircleMarker` pins (colour = group)** rendered via canvas (`preferCanvas`) for the full 868-marker set. New `GET /api/directory/markers` returns all filtered markers (incl. public contact fields). `BusinessHeatMap.jsx` exports `buildGroupColors(groups)` + `GROUP_PALETTE`; a clickable colour legend appears under the map (HO + Admin).
  - **Role-based action:** homeowners now get **Contact** (modal with tel:/mailto:/website/address) instead of Claim; tradespeople keep the **Claim** flow. Pin click opens the role-appropriate modal.
  - **Data coverage note:** the imported set only spans **lat 48.18–48.77, lng 13.43–16.44 = NE Austria** (Vienna + Mühlviertel/Linz/Innviertel). 0 companies west of Salzburg or south of lat 47. For full-AT coverage the operator must add companies from other regions (Graz, Salzburg, Tyrol, Carinthia, Vorarlberg) to the CSV. Map intentionally keeps the whole-Austria view so the coverage gap is visible.

### Session 2026-06-10
- **P0 fix — Pro Calendar timezone desync (RESOLVED):** `DatedAvailabilityMatrix.jsx` matched bookings using `date.toISOString().slice(0,10)`, which converts local midnight to UTC and shifts the day backward for positive UTC offsets (user at UTC+2). A booking on the 16th was matched against the 15th, so the 16th slot wrongly stayed "available" while Schedule showed it booked.
  - Added exported `toLocalDateStr(date)` helper (getFullYear/getMonth/getDate, no UTC shift) and used it in `isBookedOn`, cell keys, and all test-ids.
  - Also excluded `status === 'cancelled'` bookings from `bookedMap`.
  - "Up Next" widget moved above the calendar on mobile (sidebar on desktop).

### Earlier Session

### Session (prior)
- Fixed live location button icon: now uses `LocateFixed` (GPS crosshair) icon in **red** color
- ETA strip always visible when session active (shows "En route" when no destination, ETA countdown when destination known)
- Added `live_location_en_route` translations (EN/DE/TR/ES)

### Previous Sessions
- Task vs Project splitting (listing_type field)
- Custom Job IDs (job_number)
- Real-time Live Location map (Leaflet/OpenStreetMap) with 5s polling
- ETA countdown system with Nominatim geocoding + Haversine distance
- Admin Notifications for new support tickets and reviews
- Advanced Calendar: drag-and-drop rescheduling, color-coding, recurring jobs
- Fixed MongoDB timezone bugs (offset-naive vs offset-aware)
- Fixed "Thread not found" bug (removed queries to non-existent db.threads)
- Fixed mobile layout overflows: Inbox, Admin, Settings, Billing, PostJob pages
- Multi-language support: EN/DE/TR/ES dictionary

---

## Prioritized Backlog

### P1
- Dunning notifications: when Pro's sub_valid_until is 7 days away → UI bell + optional email
- Translation audit: hardcoded English strings in browse/admin pages need mapping

### P2
- Resend email integration: sticky reminders for Tax & PM toolkits
- Redis-backed LLM rate-limiter
- StreamingResponse for portfolio + attachment serving

### Refactoring
- Audit all grid-cols-3/4 layouts for responsive collapse (sm:grid-cols-2 → grid-cols-1)
