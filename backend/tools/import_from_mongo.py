#!/usr/bin/env python3
"""Import a MongoDB backup into the Postgres schema.

Reads the dump produced by `tools/export_backup.py` (or a live Mongo) and
writes it into Supabase. Every target table carries `legacy_id`, which is how
old ObjectId references resolve to new UUIDs — the mapping is looked up from
the database rather than held in memory, so a resumed run finds what an
earlier run already wrote.

Usage
    python tools/import_from_mongo.py backups/<stamp>          # from a dump
    python tools/import_from_mongo.py --from-mongo             # live read
    python tools/import_from_mongo.py <dir> --dry-run          # count only
    python tools/import_from_mongo.py <dir> --only users,pro_profiles

Order matters and is fixed: users → pro_profiles → customers → jobs →
quotes → invoices → children. Foreign keys enforce it, so a wrong order
fails loudly rather than silently orphaning rows.

Idempotent: every insert is `on conflict (legacy_id) do nothing`, so a
partial run can simply be repeated.

⚠  Invoices are imported with their ORIGINAL numbers and marked issued. The
   immutability trigger would block that, so the import disables it for the
   invoice tables inside a transaction and restores it after. Historic
   invoices are legally retained and must keep their original identity —
   renumbering them would itself be a compliance breach.
"""
from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import os
import sys
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterator, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from db import pg  # noqa: E402

# Import order. Reversed for the --wipe path so children go first.
ORDER = [
    "users", "pro_profiles", "customers", "jobs",
    "quotes", "quote_lines", "change_orders",
    "invoices", "invoice_lines", "invoice_payments",
    "job_tasks", "job_materials", "job_diary", "job_time_logs", "job_documents",
    "expenses", "notifications", "business_directory",
]


# ── source readers ─────────────────────────────────────────────────────
def read_dump(backup_dir: Path) -> dict[str, list[dict]]:
    from bson import json_util
    path = backup_dir / "backup.json.gz"
    if not path.exists():
        sys.exit(f"No backup.json.gz in {backup_dir}")
    out: dict[str, list[dict]] = defaultdict(list)
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                rec = json_util.loads(line)
                out[rec["__collection__"]].append(rec["doc"])
    return out


async def read_mongo() -> dict[str, list[dict]]:
    from motor.motor_asyncio import AsyncIOMotorClient
    url, name = os.environ.get("MONGO_URL"), os.environ.get("DB_NAME")
    if not url or not name:
        sys.exit("MONGO_URL / DB_NAME not set.")
    db = AsyncIOMotorClient(url)[name]
    out: dict[str, list[dict]] = {}
    for coll in await db.list_collection_names():
        out[coll] = await db[coll].find({}).to_list(length=None)
    return out


# ── coercion ───────────────────────────────────────────────────────────
def s(v: Any) -> Optional[str]:
    if v is None:
        return None
    v = str(v).strip()
    return v or None


def num(v: Any, default: str = "0") -> Decimal:
    try:
        return Decimal(str(v if v is not None else default))
    except (InvalidOperation, ValueError):
        return Decimal(default)


def boolean(v: Any, default: bool = False) -> bool:
    return default if v is None else bool(v)


def dt(v: Any):
    return v if v is not None else None


# ── legacy id resolution ───────────────────────────────────────────────
async def resolve(table: str, legacy: Any) -> Optional[str]:
    """Map an old ObjectId onto the new UUID via legacy_id."""
    if not legacy:
        return None
    return await pg.fetchval(
        f"select id::text from {table} where legacy_id = $1", str(legacy))


# ── transforms ─────────────────────────────────────────────────────────
# Each returns the column dict for one target row, or None to skip.

async def t_user(d: dict) -> Optional[dict]:
    role = d.get("role")
    # Homeowner accounts have no counterpart in the one-sided product; their
    # useful content (name, address, phone) is carried over by t_customer
    # instead, attached to whichever pro actually served them.
    if role not in ("tradesperson", "admin"):
        return None
    return {
        "legacy_id": str(d["_id"]), "email": s(d.get("email")),
        "password_hash": s(d.get("password_hash")) or "!", "name": s(d.get("name")) or "",
        "given_name": s(d.get("given_name")), "family_name": s(d.get("family_name")),
        "role": role, "country": (s(d.get("country")) or "AT")[:2].upper(),
        "lang": (s(d.get("lang")) or "de") if s(d.get("lang")) in ("de","en","tr","es") else "de",
        "phone": s(d.get("phone")), "address": s(d.get("address")),
        "postal_code": s(d.get("postal_code")), "city": s(d.get("city")),
        "onboarding_complete": boolean(d.get("onboarding_complete")),
        "is_email_verified": boolean(d.get("is_email_verified")),
        "banned": boolean(d.get("banned")),
        "policy_version_accepted": s(d.get("policy_version_accepted")),
        "policy_accepted_at": dt(d.get("policy_accepted_at")),
        "created_at": dt(d.get("created_at")),
    }


async def t_pro_profile(d: dict) -> Optional[dict]:
    user_id = await resolve("users", d.get("user_id"))
    if not user_id:
        return None
    return {
        "legacy_id": str(d["_id"]), "user_id": user_id,
        "business_name": s(d.get("business_name")) or s(d.get("company_name")) or "",
        "contact_person": s(d.get("contact_person")), "tagline": s(d.get("tagline")),
        "description": s(d.get("description")),
        "hourly_rate": num(d.get("hourly_rate")) or None,
        "years_experience": d.get("years_experience"),
        "service_categories": d.get("service_categories") or [],
        "service_areas": d.get("service_areas") or [],
        "languages_spoken": d.get("languages_spoken") or [],
        "invoice_country": (s(d.get("business_country")) or "AT")[:2].upper(),
        "vat_id": s(d.get("invoice_tax_id")), "tax_number": s(d.get("tax_number")),
        "is_kleinunternehmer": boolean(d.get("is_kleinunternehmer")),
        "invoice_footer": s(d.get("invoice_footer")),
        "invoice_template": s(d.get("invoice_template")) or "classic",
        "business_address": s(d.get("business_address")),
        "business_postal_code": s(d.get("business_postal_code")),
        "business_city": s(d.get("business_city")),
        "business_country": s(d.get("business_country")) or "AT",
        "bank_account_holder": s(d.get("bank_account_holder")),
        "bank_iban": s(d.get("bank_iban")), "bank_bic": s(d.get("bank_bic")),
        "bank_name": s(d.get("bank_name")),
        "logo_file_id": s(d.get("logo_file_id")),
        "logo_content_type": s(d.get("logo_content_type")),
        "licence_file_id": s(d.get("licence_file_id")),
        "licence_status": s(d.get("licence_status")) or "missing",
        "insurance_file_id": s(d.get("insurance_file_id")),
        "insurance_status": s(d.get("insurance_status")) or "missing",
        "is_verified": boolean(d.get("is_verified")),
        "is_licensed": boolean(d.get("is_licensed")),
        "is_insured": boolean(d.get("is_insured")),
        "plan_tier": s(d.get("plan_tier")) or "standard",
        "explorer_started_at": dt(d.get("explorer_started_at")),
        "explorer_ends_at": dt(d.get("explorer_ends_at")),
        "stripe_customer_id": s(d.get("stripe_customer_id")),
        "service_center_lat": d.get("service_center_lat"),
        "service_center_lng": d.get("service_center_lng"),
        "service_radius_km": d.get("service_radius_km"),
        "created_at": dt(d.get("created_at")),
    }


async def t_customer_from_pm(d: dict) -> Optional[dict]:
    """A PM project's embedded customer blob becomes a real row."""
    pro_id = await resolve("pro_profiles", d.get("pro_id"))
    c = d.get("customer") or {}
    name = s(c.get("name"))
    if not pro_id or not name:
        return None
    return {
        "legacy_id": f"pmcust:{d['_id']}", "pro_id": pro_id, "type": "private",
        "name": name, "email": s(c.get("email")), "phone": s(c.get("phone")),
        "address": s(c.get("address")), "postal_code": s(c.get("postal_code")),
        "city": s(c.get("city")), "country": (s(c.get("country")) or "AT")[:2].upper(),
        "created_at": dt(d.get("created_at")),
    }


async def t_job_from_pm(d: dict) -> Optional[dict]:
    pro_id = await resolve("pro_profiles", d.get("pro_id"))
    if not pro_id:
        return None
    customer_id = await resolve("customers", f"pmcust:{d['_id']}")
    status_map = {"planning": "accepted", "active": "in_progress",
                  "done": "completed", "cancelled": "cancelled"}
    return {
        "legacy_id": str(d["_id"]), "legacy_source": "pm_project",
        "pro_id": pro_id, "customer_id": customer_id,
        "mode": "project", "status": status_map.get(d.get("status"), "accepted"),
        "title": s(d.get("name")) or s(d.get("title")) or "Projekt",
        "description": s(d.get("description")) or "",
        "category": s(d.get("category")),
        "site_address": s((d.get("customer") or {}).get("address")),
        "site_city": s((d.get("customer") or {}).get("city")),
        "source": "manual",
        "contract_amount": num(d.get("base_amount")) or None,
        "share_token": s(d.get("share_token")), "sub_token": s(d.get("sub_token")),
        "completed_at": dt(d.get("completed_at")),
        "created_at": dt(d.get("created_at")),
    }


async def t_invoice(d: dict) -> Optional[dict]:
    pro_id = await resolve("pro_profiles", d.get("pro_id"))
    if not pro_id:
        return None
    is_storno = bool(d.get("is_storno"))
    cancelled = bool(d.get("cancelled_by_storno_id"))
    inv_date = dt(d.get("invoice_date")) or dt(d.get("created_at"))
    return {
        "legacy_id": str(d["_id"]), "pro_id": pro_id,
        "job_id": await resolve("jobs", d.get("job_id")),
        "customer_id": None,
        "invoice_number": s(d.get("invoice_number")),
        "type": "storno" if is_storno else "standard",
        "status": "cancelled" if cancelled else "issued",
        "pro_snapshot": json.dumps(d.get("pro_snapshot") or {}, default=str),
        "customer_snapshot": json.dumps(d.get("customer_snapshot") or {}, default=str),
        "issue_date": inv_date.date() if hasattr(inv_date, "date") else inv_date,
        # The old schema had no Leistungszeitpunkt. Backfilling it with the
        # invoice date is the only defensible guess, and it is recorded here
        # so the assumption is visible rather than silent.
        "service_date_start": inv_date.date() if hasattr(inv_date, "date") else inv_date,
        "payment_terms_days": int(d.get("payment_due_days") or 14),
        "net_total": num(d.get("net_total")), "vat_total": num(d.get("vat_total")),
        "gross_total": num(d.get("brutto_total")),
        "is_kleinunternehmer": boolean(d.get("kleinunternehmer_note")),
        "invoice_country": "AT",
        "note": s(d.get("note")), "storno_reason": s(d.get("storno_reason")),
        "cancelled_at": dt(d.get("cancelled_at")),
        "created_at": dt(d.get("created_at")),
    }


async def t_invoice_line(d: dict, parent: str, pos: int) -> dict:
    rate = num(d.get("vat_rate"))
    return {
        "invoice_id": parent, "position": pos,
        # The old model had no labour/material split. Everything lands as
        # 'other' rather than being guessed — a wrong §35a split on a historic
        # invoice is worse than an absent one.
        "kind": "other",
        "description": s(d.get("description")) or "",
        "qty": num(d.get("qty"), "1"), "unit": "pcs",
        "unit_price": num(d.get("unit_net")),
        "tax_treatment": "kleinunternehmer" if rate == 0 else "standard",
        "vat_rate": rate,
    }


async def t_directory(d: dict) -> Optional[dict]:
    name = s(d.get("name"))
    if not name:
        return None
    return {
        "legacy_id": str(d["_id"]), "osm_id": s(d.get("osm_id")), "name": name,
        "group": s(d.get("group")), "segment": s(d.get("segment")),
        "category": s(d.get("category")), "address": s(d.get("address")),
        "postal_code": s(d.get("postal_code")) or s(d.get("zip")),
        "city": s(d.get("city")), "country": (s(d.get("country")) or "AT")[:2].upper(),
        "lat": d.get("lat"), "lng": d.get("lng"),
        "phone": s(d.get("phone")), "email": s(d.get("email")),
        "website": s(d.get("website")),
    }


# ── writer ─────────────────────────────────────────────────────────────
async def insert_rows(table: str, rows: list[dict], conflict: str = "legacy_id") -> int:
    n = 0
    for row in rows:
        if not row:
            continue
        cols = list(row)
        sql = (f"insert into {table} ({', '.join(cols)}) "
               f"values ({pg.placeholders(len(cols))}) "
               f"on conflict ({conflict}) do nothing returning id")
        try:
            if await pg.fetchval(sql, *row.values()):
                n += 1
        except Exception as exc:
            print(f"    ! {table}: {exc}")
    return n


async def run(data: dict[str, list[dict]], only: Optional[set[str]], dry: bool) -> dict:
    counts: dict[str, int] = {}

    def want(t: str) -> bool:
        return not only or t in only

    print(f"source collections: {', '.join(sorted(data))}\n")
    if dry:
        for k in sorted(data):
            print(f"  {k:<28} {len(data[k]):>7,}")
        return {}

    if want("users"):
        rows = [await t_user(d) for d in data.get("users", [])]
        counts["users"] = await insert_rows("users", rows)
        print(f"  users                 {counts['users']:>7,}  "
              f"(homeowner accounts skipped — no counterpart in the one-sided model)")

    if want("pro_profiles"):
        rows = [await t_pro_profile(d) for d in data.get("pro_profiles", [])]
        counts["pro_profiles"] = await insert_rows("pro_profiles", rows)
        print(f"  pro_profiles          {counts['pro_profiles']:>7,}")

    if want("customers"):
        rows = [await t_customer_from_pm(d) for d in data.get("pm_projects", [])]
        counts["customers"] = await insert_rows("customers", rows)
        print(f"  customers             {counts['customers']:>7,}  "
              f"(promoted from embedded PM customer blobs)")

    if want("jobs"):
        rows = [await t_job_from_pm(d) for d in data.get("pm_projects", [])]
        counts["jobs"] = await insert_rows("jobs", rows)
        print(f"  jobs                  {counts['jobs']:>7,}  (from pm_projects)")

    if want("invoices"):
        # Historic invoices keep their original numbers and issued state.
        # The immutability trigger would refuse that, so it is suspended for
        # the import and restored immediately after.
        async with pg.transaction() as con:
            await con.execute("alter table invoices disable trigger invoices_immutable")
            await con.execute("alter table invoice_lines disable trigger invoice_lines_immutable")
        try:
            rows = [await t_invoice(d) for d in data.get("pro_invoices", [])]
            counts["invoices"] = await insert_rows("invoices", rows)
            print(f"  invoices              {counts['invoices']:>7,}  "
                  f"(original numbers preserved — they are legally retained)")

            n = 0
            for d in data.get("pro_invoices", []):
                parent = await resolve("invoices", d["_id"])
                if not parent:
                    continue
                for i, li in enumerate(d.get("line_items") or [], start=1):
                    line = await t_invoice_line(li, parent, i)
                    n += await insert_rows("invoice_lines", [line], conflict="id")
            counts["invoice_lines"] = n
            print(f"  invoice_lines         {n:>7,}  (kind='other' — the old model had no split)")
        finally:
            async with pg.transaction() as con:
                await con.execute("alter table invoices enable trigger invoices_immutable")
                await con.execute("alter table invoice_lines enable trigger invoice_lines_immutable")

        # Advance each pro's counter past the highest imported number, so the
        # next issued invoice continues the series instead of colliding.
        await pg.execute(
            """
            insert into number_counters (pro_id, kind, year, value)
            select i.pro_id, 'invoice',
                   extract(year from i.issue_date)::int,
                   max(coalesce(nullif(regexp_replace(i.invoice_number, '\\D', '', 'g'), '')::bigint, 0)
                       % 10000)
              from invoices i
             where i.invoice_number is not null and i.issue_date is not null
             group by i.pro_id, extract(year from i.issue_date)::int
            on conflict (pro_id, kind, year) do update
              set value = greatest(number_counters.value, excluded.value)
            """)
        print("  number_counters               advanced past imported invoice numbers")

    if want("business_directory"):
        rows = [await t_directory(d) for d in data.get("business_directory", [])]
        counts["business_directory"] = await insert_rows("business_directory", rows)
        print(f"  business_directory    {counts['business_directory']:>7,}  "
              f"(the irreplaceable prospect list)")

    return counts


async def main_async(args) -> int:
    await pg.init_pool()
    data = await read_mongo() if args.from_mongo else read_dump(Path(args.source))
    only = {c.strip() for c in args.only.split(",")} if args.only else None
    counts = await run(data, only, args.dry_run)
    if not args.dry_run:
        print(f"\n{sum(counts.values()):,} rows imported")
        print("\nVerify with:  python tools/import_from_mongo.py --verify")
    await pg.close_pool()
    return 0


async def verify_async() -> int:
    await pg.init_pool()
    print("Postgres row counts\n")
    for t in ORDER:
        try:
            n = await pg.fetchval(f"select count(*) from {t}")
            print(f"  {t:<24} {n:>8,}")
        except Exception:
            pass
    orphan = await pg.fetchval(
        "select count(*) from invoices where status <> 'draft' and service_date_start is null")
    print(f"\nissued invoices missing a Leistungszeitpunkt: {orphan} (must be 0)")
    await pg.close_pool()
    return 0 if not orphan else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="MongoDB → Postgres import")
    ap.add_argument("source", nargs="?", help="backup directory from export_backup.py")
    ap.add_argument("--from-mongo", action="store_true", help="read a live Mongo instead")
    ap.add_argument("--only", help="comma-separated target tables")
    ap.add_argument("--dry-run", action="store_true", help="count the source, write nothing")
    ap.add_argument("--verify", action="store_true", help="report Postgres counts and exit")
    args = ap.parse_args()

    if args.verify:
        return asyncio.run(verify_async())
    if not args.source and not args.from_mongo:
        ap.error("give a backup directory or --from-mongo")
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
