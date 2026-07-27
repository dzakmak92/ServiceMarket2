# Your part — step by step

Four tasks. **Task 1 is the one that unblocks the most**; task 4 is only
time-sensitive because of external lead time, not because of code.

Everything below runs on a machine that can reach your MongoDB. Nothing here
touches production data destructively — the one destructive command
(`--drop`) is called out explicitly and only ever points at a scratch
database.

---

## Task 1 — Give the backend a Postgres connection *(5 minutes)*

Without this, every Postgres route returns a 500. It is the single blocker
on proving the whole Phase 2 layer works.

### 1.1 Get the connection string

1. Open **https://supabase.com/dashboard/project/mctkeujyujhafhbyokvs**
2. Left sidebar → **Project Settings** (gear icon) → **Database**
3. Scroll to **Connection string**
4. Select the **Transaction pooler** tab — *not* Session, *not* Direct
5. Copy the URI. It looks like:

```
postgresql://postgres.mctkeujyujhafhbyokvs:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
```

6. Replace `[YOUR-PASSWORD]` with your database password. If you never set
   one or have lost it: same page → **Database password** → **Reset database
   password**. Resetting is safe; nothing else uses it yet.

> **Why the pooler and not the direct connection?** Port 5432 allows very few
> concurrent connections and a web process will exhaust them. Port 6543 is
> pgbouncer in transaction mode. It cannot hold prepared statements, which
> asyncpg uses by default — `db/pg.py` detects the pooler and turns that
> cache off automatically. Pick the wrong tab and you get intermittent
> `prepared statement "__asyncpg_stmt_3__" does not exist` errors that only
> appear under load.

### 1.2 Put it in the env file

```bash
cd backend
cp .env.example .env      # only if you don't already have a .env
```

Open `backend/.env` and set:

```
DATABASE_URL=postgresql://postgres.mctkeujyujhafhbyokvs:YOURPASSWORD@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
```

Keep your existing `MONGO_URL`, `DB_NAME`, `JWT_SECRET` and the rest — Mongo
still serves the routes that have not been ported yet.

### 1.3 Check it

```bash
cd backend
pip install -r requirements.txt          # asyncpg is new
python tools/check_db.py
```

**Expected:**

```
✓ connected
  PostgreSQL 17.6
  public tables: 30
```

The script diagnoses rather than throwing a stack trace — it catches an
unencoded password character, a quoted value, the wrong port, and an
IPv6-only pooler, and tells you which one it is.

### 1.4 Tell me it's done

That's all I need. I'll run the repositories against real rows, fix whatever
surfaces, and report.

---

## Task 2 — Back up MongoDB *(10 minutes + transfer time)*

Do this **before** task 3. It is also just a good idea regardless.

```bash
cd backend
python tools/export_backup.py
```

Writes `backend/backups/<timestamp>/` containing:

| File | What it is |
|---|---|
| `backup.json.gz` | **the restorable backup** — this is the one that matters |
| `backup.xlsx` | one sheet per collection, for eyeballing |
| `csv/*.csv` | per collection |
| `gridfs/` | logos, Gewerbeschein PDFs, receipt photos, job photos |
| `manifest.json` | counts + SHA-256 |

### 2.1 Sanity-check the counts

The run prints them. **`business_directory` should be ≈ 8,900.** If it is
zero or a few hundred, stop and tell me — that dataset is the one genuinely
irreplaceable thing in the database.

### 2.2 Verify the dump

```bash
python tools/export_backup.py --verify backups/<timestamp>
```

**Expected:** `OK  checksum matches, N documents across M collections`

### 2.3 Prove the restore works

An untested backup is a guess. Two minutes:

```bash
python tools/restore_backup.py backups/<timestamp> --db servicemarket_restore_test
python tools/restore_backup.py backups/<timestamp> --db servicemarket_restore_test --check
```

**Expected:** `all collections match`

The script refuses to write into your live `DB_NAME` without an explicit
override, so this cannot touch production by accident.

> ⚠ The dump contains personal data — customer names, addresses, photos of
> people's homes. Under DSGVO it is a processing activity in its own right.
> Store it encrypted, keep it off shared drives, and delete it once the
> migration is verified. `backend/backups/` is gitignored.

---

## Task 3 — Import into Postgres *(15 minutes)*

Needs task 1 done (`DATABASE_URL` set) and task 2 done (a verified dump).

### 3.1 Dry run — counts only, writes nothing

```bash
python tools/import_from_mongo.py backups/<timestamp> --dry-run
```

Read the list. It shows what the importer *found*, not what it will write.

### 3.2 Real run

```bash
python tools/import_from_mongo.py backups/<timestamp>
```

Order is fixed and enforced by foreign keys: users → pro_profiles →
customers → jobs → invoices → children.

**Things it will print that are correct, not bugs:**

- *"homeowner accounts skipped"* — they have no counterpart in the one-sided
  product. Their useful content is not lost: each PM project's embedded
  customer becomes a real `customers` row attached to the pro who served
  them.
- *"customers promoted from embedded PM customer blobs"* — that is where your
  customer list comes from.
- *"invoices — original numbers preserved"* — historic invoices are legally
  retained for 7 years (DE: up to 10). Renumbering them would itself be a
  compliance breach, so the import keeps their identity and suspends the
  immutability trigger for the duration.
- *"invoice_lines kind='other'"* — the old model had no labour/material
  split. Guessing a §35a split on a historic invoice is worse than leaving
  it absent, so it is left absent.

### 3.3 Verify

```bash
python tools/import_from_mongo.py --verify
```

**Expected:** row counts per table, and
`issued invoices missing a Leistungszeitpunkt: 0`

If that last number is not 0, tell me — it means an invoice came through
without a service date, which is a mandatory field.

### 3.4 Re-runnable

Every insert is `on conflict do nothing`. If a run dies partway, just run it
again — it picks up where it stopped.

---

## Task 4 — Apply for a real Stripe account *(15 minutes now, weeks of waiting)*

Not needed until Phase 8, **but start it now**: KYC takes weeks and no sprint
compresses it.

1. https://dashboard.stripe.com/register — register the actual business
   entity, not a personal account
2. Complete business verification (Gewerbeschein, UID, bank account)
3. Enable **Stripe Connect** → Settings → Connect → Get started
4. Send me nothing. When Phase 8 starts I will tell you which keys to put
   where.

### Why this matters more than it looks

Right now every customer payment lands in the **platform's** Stripe balance,
and pro payouts are a manual ledger an admin settles by clicking "Mark
settled". You are holding tradespeople's money on your own books. That is
operational and likely licensing exposure (payment-institution territory),
quite apart from being the opposite of "get paid faster".

Your own PRD already records the blocker: `sk_test_emergent` is a managed key
that only works through `emergentintegrations` and is rejected by the native
Stripe SDK, so Connect is impossible until you supply your own key.

Until then the **EPC-QR / GiroCode** on every invoice does the real work: the
customer scans it, their banking app pre-fills the SEPA transfer, and the
money goes pro → customer directly without the platform touching it. That is
why the payment rail can safely be last.

---

## Summary

| # | Task | Your time | Unblocks |
|---|---|---|---|
| 1 | `DATABASE_URL` in `backend/.env` | 5 min | **Everything.** Proving the Phase 2 layer works |
| 2 | Run + verify the Mongo backup | 10 min | Task 3, and basic safety |
| 3 | Import into Postgres | 15 min | Real data in the new schema |
| 4 | Stripe account application | 15 min | Phase 8, weeks from now |

Do 1 first and tell me. I can work on task 4's neighbours meanwhile, but
tasks 1–3 are the critical path and only you can start them.
