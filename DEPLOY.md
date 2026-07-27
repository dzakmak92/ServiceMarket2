# Deploying to Vercel

Stack: **Vercel** serves the React SPA and runs the FastAPI backend as a
Python serverless function; **Supabase** provides Postgres and Storage. No
other host is involved.

---

## 1 · Import the repo

Vercel → **Add New → Project** → import `dzakmak92/ServiceMarket2`, branch
`claude/zip-extract-md-compare-poze9h`.

Leave the build settings alone — `vercel.json` already declares them:

| | |
|---|---|
| Build | `cd frontend && npm install && npm run build` |
| Output | `frontend/build` |
| Function | `api/index.py`, Python runtime, 1024 MB, 60 s |
| Region | `fra1` (Frankfurt) — EU residency, and closest to the Supabase project in `eu-west-1` |

## 2 · Environment variables

Settings → Environment Variables. Set for **Production** *and* **Preview**.

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.mctkeujyujhafhbyokvs:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:6543/postgres` | **Transaction pooler**. Serverless opens and drops connections constantly; the direct connection would exhaust its limit within minutes |
| `JWT_SECRET` | a long random string | `openssl rand -base64 48`. Changing it later logs everyone out |
| `SUPABASE_URL` | `https://mctkeujyujhafhbyokvs.supabase.co` | |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` | Bypasses RLS. Server-side only — never expose it to the browser |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret | Onboarding fails closed without it |
| `REACT_APP_TURNSTILE_SITE_KEY` | Turnstile **site** key | Public by design |
| `REACT_APP_BACKEND_URL` | *(leave empty)* | The API is same-origin under `/api` |
| `ENVIRONMENT` | `production` | Makes auth cookies `Secure` |

If the password contains `@ / # ? : % & +`, percent-encode it — it sits
between `:` and `@` in a URL and an unencoded `@` truncates the hostname.

## 3 · Deploy and verify

```
https://<your-app>.vercel.app/api/health
```

Expected:

```json
{"status":"ok","database":true,"version":"2.0.0","region":"fra1"}
```

`"database": false` means `DATABASE_URL` is wrong or unreachable — run
`python backend/tools/check_db.py` locally with the same value; it names the
cause.

Interactive API docs: `/api/docs`.

---

## What is deployed, and what is not

**Live (70 routes):** auth, customers, jobs, quotes, invoices + PDF, tax
(USt-VA / EÜR / DATEV / expenses), project mode (tasks, materials, diary,
timer, documents, Nachträge), uploads, and the token-scoped customer portal.

**Not deployed yet** — still MongoDB-backed, listed in `.vercelignore`:
billing and subscriptions, the admin panel, push notifications, the business
directory, feedback and support, privacy/data-rights endpoints, live
location, payment links, and the legacy PM/tax/invoicing modules.

They are excluded rather than broken: importing them on Vercel would fail at
cold start because there is no MongoDB. Each returns once ported.

## Serverless constraints worth knowing

- **Pool size is 1 per instance.** Vercel may run many instances at once;
  ten connections each would exhaust the pooler. Set in `api/index.py`.
- **No background tasks.** A serverless function is killed once the response
  is sent, so the old subscription-expiry loop cannot live here. It becomes a
  Vercel Cron or a `pg_cron` job in Supabase.
- **No seeding or index creation at startup.** Those ran on every cold start
  and were MongoDB calls besides.
- **Cold starts** run 1–3 s for Python. Noticeable on the first request after
  idle, invisible afterwards.
- **60 s function limit** (Pro). The Job File PDF embeds up to 24 photos; on
  the Hobby plan's 10 s cap that one endpoint may time out.

## Still to do before this replaces Emergent entirely

1. **Extract the MongoDB data** — it lives in Emergent's container. Do this
   before cancelling anything. `backend/tools/export_backup.py`.
2. **Import it** — `backend/tools/import_from_mongo.py`.
3. **Move the GridFS binaries** — `backend/tools/migrate_gridfs.py`.
4. **Replace `emergentintegrations`** — the real Stripe SDK for payments, a
   direct LLM SDK for receipt OCR and classification. The Stripe webhook in
   `api/index.py` is a logged placeholder until then.
5. **Port the remaining routes** listed above.
