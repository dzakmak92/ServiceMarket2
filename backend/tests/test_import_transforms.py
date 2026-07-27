"""Importer transforms: MongoDB documents → Postgres rows.

Pure functions with a stubbed legacy-id lookup, so this runs without either
database. Every case is a decision the import makes about historic data, and
several are irreversible once the run happens — which is why they are pinned
here rather than discovered in production.
"""
import asyncio
import datetime
import importlib.util
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from bson import ObjectId  # noqa: E402

import db.pg as pg  # noqa: E402

LOOKUP: dict = {}


async def _fetchval(sql, *a):
    if "legacy_id = $1" in sql:
        return LOOKUP.get(str(a[0]))
    return None


pg.fetchval = _fetchval

_spec = importlib.util.spec_from_file_location(
    "importer", BACKEND / "tools" / "import_from_mongo.py")
m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m)

FAILS: list = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


async def main():
    uid, pid, projid = ObjectId(), ObjectId(), ObjectId()

    print("-- users --")
    check(await m.t_user({"_id": ObjectId(), "email": "h@x.at", "role": "homeowner"}) is None,
          "homeowner accounts are skipped (no counterpart in the one-sided model)")
    pro = await m.t_user({"_id": uid, "email": "P@X.AT", "role": "tradesperson",
                          "name": "Weber", "country": "at", "lang": "xx"})
    check(pro["role"] == "tradesperson", "tradesperson imported")
    check(pro["country"] == "AT", "country upper-cased")
    check(pro["lang"] == "de", "unknown lang falls back to de, not a constraint violation")
    check(pro["password_hash"] == "!", "missing password hash becomes an unusable placeholder")

    LOOKUP[str(uid)] = "u-uuid"
    print("\n-- pro_profiles --")
    pp = await m.t_pro_profile({"_id": pid, "user_id": uid, "company_name": "Weber GmbH",
                                "is_kleinunternehmer": True, "business_country": "de"})
    check(pp["business_name"] == "Weber GmbH", "company_name falls back to business_name")
    check(pp["invoice_country"] == "DE", "invoice_country derived and upper-cased")
    check(pp["is_kleinunternehmer"] is True, "Kleinunternehmer flag carried over")
    check(await m.t_pro_profile({"_id": ObjectId(), "user_id": ObjectId()}) is None,
          "profile with an unresolvable user is skipped, not orphaned")

    LOOKUP[str(pid)] = "p-uuid"
    print("\n-- PM project -> customer + job --")
    proj = {"_id": projid, "pro_id": pid, "name": "Bad sanieren", "status": "done",
            "customer": {"name": "Gruber", "city": "Wien"}, "base_amount": 3000}
    cust = await m.t_customer_from_pm(proj)
    check(cust["legacy_id"] == f"pmcust:{projid}", "embedded customer gets a derived legacy_id")
    check(cust["name"] == "Gruber", "customer promoted out of the blob")
    LOOKUP[f"pmcust:{projid}"] = "c-uuid"
    job = await m.t_job_from_pm(proj)
    check(job["mode"] == "project", "PM project becomes a project-mode job")
    check(job["status"] == "completed", "status 'done' maps to 'completed'")
    check(job["customer_id"] == "c-uuid", "job links to the promoted customer")
    check(job["legacy_source"] == "pm_project", "provenance recorded")

    print("\n-- invoices --")
    inv = await m.t_invoice({"_id": ObjectId(), "pro_id": pid, "invoice_number": "RG-2026-0003",
                             "invoice_date": datetime.datetime(2026, 3, 1),
                             "net_total": 100, "vat_total": 20, "brutto_total": 120})
    check(inv["invoice_number"] == "RG-2026-0003", "original number preserved (legally retained)")
    check(inv["status"] == "issued", "imported as issued")
    check(inv["service_date_start"] == datetime.date(2026, 3, 1),
          "missing Leistungszeitpunkt backfilled from the invoice date")
    st = await m.t_invoice({"_id": ObjectId(), "pro_id": pid, "is_storno": True,
                            "invoice_date": datetime.datetime(2026, 3, 2)})
    check(st["type"] == "storno", "storno detected from the legacy flag")
    canc = await m.t_invoice({"_id": ObjectId(), "pro_id": pid, "cancelled_by_storno_id": "x",
                              "invoice_date": datetime.datetime(2026, 3, 2)})
    check(canc["status"] == "cancelled", "cancelled original marked cancelled")

    line = await m.t_invoice_line({"description": "Arbeit", "qty": 2, "unit_net": 50,
                                   "vat_rate": 20}, "i-uuid", 1)
    check(line["kind"] == "other",
          "line kind is 'other' - a guessed 35a split on a historic invoice is worse than none")
    kl = await m.t_invoice_line({"description": "x", "unit_net": 10, "vat_rate": 0}, "i-uuid", 1)
    check(kl["tax_treatment"] == "kleinunternehmer", "0% legacy line maps to kleinunternehmer")

    print("\n-- directory --")
    b = await m.t_directory({"_id": ObjectId(), "name": "Weber", "lat": 48.2, "lng": 16.3,
                             "zip": "1010", "segment": "Maler"})
    check(b["postal_code"] == "1010", "zip falls back to postal_code")
    check(b["segment"] == "Maler", "segment preserved for prospect targeting")
    check(await m.t_directory({"_id": ObjectId()}) is None, "nameless directory row skipped")


if __name__ == "__main__":
    asyncio.run(main())
    print("\n" + ("ALL PASS" if not FAILS else f"{len(FAILS)} FAILURE(S)"))
    raise SystemExit(1 if FAILS else 0)
