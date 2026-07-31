# Deep test: what works, what does not, and what is missing

Five review agents plus a real end-to-end harness — the ASGI app Vercel
serves, against a Postgres built from `backend/db/migrations/` in order —
walked the whole journey: a lead arriving, a job, a guided estimate, a quote,
the customer accepting, the work, a Nachtrag, the invoice, the money, the tax
year, and erasure.

Every finding below was verified by reading the code and, where it touches
the database, by running it. The ones marked **fixed** are covered by
`backend/tests/test_e2e_journey.py`, which fails if they come back.

Two capabilities are blocked on decisions that are not mine to make:

- **Payments (Stripe).** The MCP server needs an interactive OAuth flow this
  session cannot perform. Nothing on the payment rail has been touched.
- **Photo/LLM estimation.** Blocked on a DSGVO-compliant provider decision.

---

## Fixed

### The journey could not complete at all

| What | Why it never worked |
|---|---|
| `GET /api/auth/me` 500'd for every tradesperson | `load_user` selected the raw uuid `id` while `/api/auth/login` selected `id::text`. asyncpg takes either against a uuid column but raises `DataError` when a `UUID` meets a parameter cast `::text` — which is what `require_pro_id` does. |
| Onboarding was impossible without a Turnstile secret | `TEST_SECRET_KEYS` was declared, documented, and never read. No `pro_profiles` row means every business endpoint 404s, so this stopped the journey on step one. |
| `POST /api/estimate/quote` raised `TypeError` on every call | An int catalogue version concatenated to a str. This endpoint had never once succeeded. |
| The job detail page white-screened on open | `OverviewTab` read `data.pl`, `data.job`, `data.customer`, `data.quote`, `data.invoices` — the API returned none of them, `pl.profit_eur` threw, and React unmounted the whole tree. Overview is the default tab, so every route into a job landed on a blank window. The app had no error boundary anywhere. |
| The project list was permanently empty | It read `data.projects` where `GET /api/jobs` returns `{jobs, total}`, and filtered on `active/on_hold/done/archived` — none of which are members of the `job_status` enum. |

### Legal and financial correctness

| What | Why it mattered |
|---|---|
| **A Storno could never be issued** | It was inserted as `status='issued'` and its lines inserted straight after, which `invoice_lines_enforce_immutability` refuses; the `restrict_violation` took the whole transaction. There was no path at all to correct a wrong invoice — the one thing § 11 UStG and GoBD absolutely require. Now built as a draft and issued once its lines are in, so the number still comes from the trigger and the series stays gap-free. |
| **The GDPR purge aborted permanently** | `invoice_lines.source_quote_line_id` is `ON DELETE SET NULL`, so deleting a cited quote is an UPDATE on an issued invoice's lines. The account would never be deleted and the cron would retry the same failure forever. Quotes and change orders are now retained where an invoice line cites them, as jobs and customers already were. |
| **A Storno subtracted its invoice twice** | The rollups excluded the cancelled original while still counting the credit note. Cancelling a €300 invoice took €300 off lifetime value and pushed receivables to −€300. Turnover now keeps both so the pair nets to zero; receivables exclude both. `storno()` also refreshes the customer rollup, which only ever ran on issue and on payment. |
| **Nachträge were all worth €0** | The Billing tab builds one from positions; the model never declared `items`; Pydantic drops unknown fields in silence; `net_amount` fell to its default. The customer approved €0 in the portal and a €0 line went onto the invoice — exactly the silent margin leak change orders exist to close. |
| **"Mark paid" 500'd on every press** | It recorded the settlement with `method='manual'`; `payment_method` is an enum of `transfer, card, sepa, sofort, cash, other`. |
| `/api/tax/year-end.pdf` raised `KeyError` on every request | The renderer was written against Mongo-era shapes and read seven keys the Postgres route never passed. It now takes the repositories' dicts verbatim. |
| `datev-full.csv` had no UTF-8 BOM | The one export that goes to an accountant arrived in Excel with every umlaut mangled; the other two were fine. |
| Editing an expense left its VAT and gross stale | Change a net from 100 to 200 and `vat_amount` stayed 20, feeding the input VAT on the USt-VA and the category totals on the EÜR. |

### Tenancy

| What | Exposure |
|---|---|
| `POST /api/invoices` accepted any `customer_id` or `job_id` | The foreign keys point at `customers(id)`/`jobs(id)` with nothing tying either to `pro_id`. Another business's customer name came back in the invoice list, and at `issue()` their whole row — address, email, phone, vat_id, private notes — was frozen into an immutable `customer_snapshot` that erasure is then obliged to keep for ten years. |
| `GET /api/jobs/{id}/invoice-preview` leaked approved Nachträge | The accepted-quote half of `to_invoice_lines` was scoped by `pro_id`; the change-order half was scoped by `job_id` alone. Any authenticated pro holding a job uuid got the titles and amounts. |
| `POST /api/me/consent` 500'd on an unparseable `X-Forwarded-For` | Three columns are `inet`; the header is client-supplied. `X-Forwarded-For: nonsense` was enough to lose the consent record — the Art. 7(1) evidence itself. |

### Usability

- **PATCH reused the create model** on materials, change orders and expenses.
  On the first two `name`/`title` was required, so every inline edit 422'd.
  On expenses it was worse: the defaults are real values that survive
  `exclude_none`, so patching one amount silently rewrote the category to
  "Sonstige", the VAT rate to 20 and `vat_deductible` to true.
- **The timer could be started and never stopped.** The running timer is
  keyed on `job_id`; the UI compared `project_id`, so the clock always read
  `00:00:00` and every tap started a new zero-length log.
- **Five of eight labels in the phone's bottom navigation were debug
  strings** — `nav_customers`, `nav_quotes`, `nav_capture_lead`,
  `nav_recurring`, `nav_estimate` existed in no language file. The German
  fallbacks written beside them are unreachable: `t()` returns the key when a
  translation is missing, and a key is truthy, so `t('x') || 'Fallback'` is
  dead code at all 119 sites that use it.
- **The default language was English**, with no locale detection, on a
  product whose users are Austrian and German.
- **Six working screens were desktop-unreachable** — Customers, Quotes, lead
  capture, Recurring, the Estimator and the Schedule appeared only in
  `MobileNav`, which is `md:hidden`.
- **Three CTAs bounced to the home page**, including the single largest
  button on the pro home screen: `/browse-jobs`, `/my-quotes` and
  `/jobs/:id` are marketplace remnants that are not routes any more.
- **No error boundary anywhere.** Added, per tab on the job detail page.

---

## Found and not fixed

These are real and verified. They are not one-line changes, and several are
product decisions rather than defects.

### ~~The invoice path has no working screen~~ — fixed

The editor is rewritten against the real API and driven end to end in a
browser: `/invoice-from-project/{id}` → 4 inherited positions → draft
(€2.031,08 net / €2.437,30 gross) → issue → **RG-2026-0005** on the list.

What it used to do: fetch two endpoints that do not exist, post `line_items`/
`unit_net`/`homeowner_id`/`payment_due_days` where the API takes `lines`/
`unit_price`/`customer_id`/`payment_terms_days`, and never call `/issue` at
all, so no invoice could ever get a number. It also applied a flat 20 % VAT
to every line, which is the exact defect the Postgres rewrite exists to stop.
It now shows the server's per-line treatment and never computes tax itself.

`InvoiceFromProjectRedirect` read `r.data.job_id` from `GET /api/jobs/{id}` —
a column `jobs` does not have, because the job *is* the row — so it always
navigated to `/jobs/none/invoice`. It is a plain redirect now.

Still open here: `ExternalInvoiceModal` in `MyInvoicesPage` has the same
payload mismatch for free-form invoices with no job behind them.

### The customer portal shows no quote

`GET /api/portal/{token}` returns `{job, quotes}`. `PMPublicStatusPage`
renders `data.title`, `data.progress_pct`, `data.pro`, `data.change_orders`,
`data.payments`, `data.financials`, `data.diary_recent` — none of which exist
in that payload — and never touches `data.quotes`.
`POST /api/portal/{token}/quotes/{id}/accept` works and has no caller. The
customer cannot accept a quote; only the pro can, on their behalf. The
Abnahme form reads `job.abnahme_at`, which the portal's job projection does
not select, so it reappears after signing and can be submitted forever.

### Whole feature areas are UI shells over nothing

`api/index.py` mounts 23 routers. `billing_routes`, `admin_routes` (+3),
`feedback_routes`, `push_routes`, `directory_routes`, `payment_link_routes`,
`analytics_routes` and `pm_routes` exist and are not mounted. Every call from
`BillingPage` (all 15 — the entire subscription flow), the whole
`pages/admin/**` tree, `useNotifications`, `useWebPush`, `FeedbackPage`,
`ProCalendarPage`, `PayInvoicePage` and `PaySuccessPage` 404s. Six components
are imported nowhere, including `AdvancedAnalytics` (disconnected at both
ends) and `AttachmentUploader` (the obvious missing UI for the job-documents
endpoints, which are mounted and have no caller).

### Tax treatments that can never fire

- **§13b reverse charge is unreachable.** `_tax_context` takes
  `is_bauleistung`; both call sites leave it `False` and no route sets it. A
  caller who explicitly sends `tax_treatment: "reverse_charge_13b"` is
  silently downgraded to `standard`. An Austrian Bauleistung to another
  Bauleister is invoiced with 20 % VAT — a defective invoice the recipient
  can refuse, and the supplier owes the wrongly-shown tax under
  § 11 Abs 12 UStG.
- **Intra-EU reverse charge likewise.** It requires
  `customer_has_valid_vat_id`, read from `vat_id_validated_at` — a column
  nothing in the codebase ever writes. There is no VIES check.
- ~~**§35a is printed for everyone**~~ — fixed. `is_35a_eligible()` had the
  rule right and no caller, so every invoice with an hour of labour on it
  told an Austrian household about a German deduction it cannot take, and a
  German GmbH about one it cannot use. The split is still always printed; the
  claim is gated, read from the frozen `customer_snapshot` so a historic
  invoice reprints exactly as the customer received it. Four cases are
  covered in `test_invoice_pdf.py`. The invoice editor now also makes `kind`
  an explicit per-line choice rather than defaulting everything to labour,
  which was overstating the deductible base.
- **`kind='other'` disappears from the split**, so an invoice with such a
  line prints a labour + material breakdown that does not reconcile to the
  net total, with nothing explaining the difference.

### Records and retention

- **`audit_log` holds zero rows.** The only insert anywhere is registration
  consent. Issuing, storno, payment recording, payment deletion (an unlogged
  hard DELETE of a Zahlungseingang) and GDPR purges write nothing. There is
  no hash chain and no `REVOKE UPDATE, DELETE` behind the "append-only"
  comment.
- **No archived invoice copy.** `pdf_ref` exists and is never written; every
  PDF is re-rendered from current code, and `legal_notes` are recomputed at
  read time. Change a legal string and every historic invoice reprints
  differently from the one the customer holds. § 14b UStG is met by
  regeneration, not by storage.
- **Invoice retention rests on a trigger, not on the foreign keys.** The FK
  chain is `CASCADE` the whole way from `users`. With the trigger disabled —
  which `backend/db/tests/compliance_checks.sql` itself does — one
  `delete from users` takes the invoices with it. These should be `RESTRICT`.
- **Nothing enforces the mandatory fields at issue time.**
  `tax_rules.mandatory_fields()` has no caller. An invoice with no customer
  can be issued and the PDF renders an empty recipient block; a pro with
  neither `vat_id` nor `tax_number` issues invoices with no UID at all.
- **`customer_snapshot` freezes the pro's private notes and tags** into an
  immutable record that survives erasure by design, retained 7–10 years under
  a basis that only covers invoicing data.

### Data flow

- **A document-level quote discount is dropped on the way to the invoice.**
  `quotes.discount_pct` is applied to the quote's totals; `to_invoice_lines`
  copies only the per-line discount. A quote accepted at 10 % off is invoiced
  at full price.
- **`rate_key` is dropped by the template resolver**, so quotes created via
  `POST /api/templates/{id}/apply` — the main creation path — teach the rate
  learner nothing and it keeps falling back to `default_price` forever.
- **EÜR reports gross as net** when a year has payments but no invoices
  (`net_ratio` falls back to 1). Profit is overstated by the whole VAT, and
  that figure flows into SVS, income tax, the year-end PDF and the accountant
  link.
- **Change orders are flagged `invoiced` outside the invoice's transaction.**
  Delete the draft — which is allowed — and they are stuck at `invoiced` and
  can never be billed.
- **The offline queue discards writes on an expired session.** Every 4xx
  except 408/429 is treated as permanent and the entry is deleted; a token
  that expired while the device was offline destroys the Bautagebuch entry
  the user was told had been saved.
- ~~**The receipts screen reads a key the API does not return**~~ — fixed.
  Three mismatches, not two: `receipts` vs `expenses`, multipart against a
  JSON endpoint, and `receipt_date`/`amount_brutto` against columns called
  `expense_date`/`gross_amount`. No expense could be entered from the UI at
  all, so the EÜR reported income against zero expenses and the USt-VA
  claimed no input VAT. The tab is now an expense ledger over the CRUD that
  was already there; the image goes through `/api/uploads` with
  `kind=receipt`. The "auto-OCR" copy on the button and on the paywall was
  removed — no such feature exists.
- **`POST /api/recurring` with a checklist 500s** — a jsonb column written
  without `json.dumps`, unlike every other jsonb write in the codebase.

### Mounted, working, and with no screen

Still stranded: rate card (`/api/profile/pro/rates` — the input every estimate
and quote depends on), `POST /api/estimate/compare` and `/calibrate`,
`GET /api/tax/liability` (the "what you actually owe" number the toolkit is
sold on), tiered quotes (`POST /api/quotes/tiered`), job documents, time-log
listing and correction, pro-side Abnahme, and the consent history the backend
maintains for the data subject to read.

Reached since: the expense CRUD behind the EÜR, quote revision and the quote
PDF, customer detail/edit/delete, and `GET /api/invoices/overdue` (dunning).

### ~~The job status dropdown~~ — fixed

It offered `active/on_hold/done/archived` — names from the old `pm_projects`
table, none of them members of the `job_status` enum — and PATCHed them onto
`/api/jobs/{id}`, where `JobPatch` declares no `status` field, so Pydantic
dropped the value before the route saw it. Two independent breakages: no
option offered was legal, and none would have arrived anyway. A job could
never leave `accepted` from the UI, which starves the calibration loop —
`estimates.measured()` counts only completed/invoiced/closed. The dropdown now
calls `PATCH /api/jobs/{id}/status`, which already validated transitions, and
is built from `allowed_transitions` on the job payload rather than a second
copy of the state machine in JavaScript.

Same class of defect, found while wiring the quote editor: `QuoteLineIn` never
declared `rate_key`, so editing or revising a quote silently severed the link
back to `pro_rates` and accepting it taught the business nothing. An
undeclared field on a Pydantic model is not a validation error — it is a
deletion.

### Accessibility and touch

- No form input in the app has an associated label — zero `htmlFor` across
  89 `<label>` elements. Customers and lead capture use placeholders only,
  with the required marker `*` *inside* the placeholder, so it vanishes the
  moment the user types. (The two new editors — quote lines and customer
  detail — wrap their inputs in `<label>`, which associates them without
  needing an id. The rest of the app has not been converted.)
- `.chip` and `.chip-active` existed in no stylesheet. The customer form has
  used both class names since it was written, so the Privat/Firma segmented
  control rendered as two bare words with no selected state. Now defined.
- Seven destructive actions delete with no confirmation, including a
  construction-diary entry — a legally relevant record — behind a bare 12px
  icon. Delete controls are 12–14px with `hover:text-red-warn` as the only
  danger cue, which never fires on touch. Roughly a third of the 40px minimum,
  for users wearing gloves.
- The portfolio delete button is `opacity-0 group-hover:opacity-100`: on a
  phone it is invisible, still occupies the corner of every photo, and fires
  on tap.
- The bottom nav puts 9–10 targets in one row (~36px each on a 360px phone)
  with a `text-[10px]` label.
- `TaxToolkitPage` spins forever on any request failure — eight silent
  `.catch(() => {})` leaving `data` null behind an infinite loader, on the
  screen a pro opens with bad signal on site.
- Sixteen icon-only buttons have no accessible name.

---

## Infrastructure

The migrations are not reproducible on a plain Postgres: `001` reaches into
an `extensions` schema and `008` writes to `storage.buckets`, both Supabase
provisions. They are also not idempotent — re-running `001` or `007` fails on
`type "user_role" already exists`. The workaround is documented at the top of
`backend/tests/test_e2e_journey.py`.
