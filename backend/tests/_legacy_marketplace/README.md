# Quarantined marketplace tests

These 31 suites were written against the two-sided marketplace and no longer
run: they exercise endpoints removed in Phase 1 (`/api/jobs`, `/api/quotes`,
`/api/messages`, `/api/reviews`, `/api/saved-pros`, the contact-fee billing
path, the homeowner project portal) or seed fixtures with `role: "homeowner"`.

They are quarantined rather than deleted because most of them **also** cover
features we are keeping — invoicing, tax reporting, the PM toolkit, push,
privacy. The assertions are the cheapest available specification of that
behaviour, so they are worth reading before rewriting.

Triage in **Phase 2**, once the `Job` spine and Customer CRM land:

| Rewrite against the new spine | Delete — tested a removed feature |
|---|---|
| `test_iter24_*`, `test_iter25_*`, `test_iter27_*` (invoicing, QR, storno) | `test_iter16_quotes_thread.py` |
| `test_iter29_*`, `test_iter44_*`, `test_iter47_*` (tax, invoice filters, audit) | `test_iter19_job_edit_and_reviews.py` |
| `test_iter30_*`, `test_iter61_*`, `test_iter63_*` (PM toolkit, job file) | `test_iter50_jobs_projects_split.py` |
| `test_iter48_*`, `test_iter56_*` (billing, Explorer plan) | `test_iter60_homeowner_my_projects.py` |
| `test_iter36_*`, `test_iter45_*` (feedback, complaints) | `test_iter9_pro_tier_push.py` (job-match dispatcher) |

The 23 suites still in `backend/tests/` do not touch removed surfaces. They
have not been executed here — this environment has no FastAPI install or
MongoDB — so treat them as *unverified*, not *passing*.
