"""Round-trip test for export_backup / restore_backup with a stubbed driver."""
import asyncio, gzip, json, os, sys, types
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND)); sys.path.insert(0, str(BACKEND / "tools"))
os.environ["MONGO_URL"] = "mongodb://stub/"; os.environ["DB_NAME"] = "servicemarket"

from bson import ObjectId, json_util

# ── representative fixture: nested docs, ObjectIds, datetimes, lists, unicode,
#    and the thousand-separator coords that broke the real CSV import ──
DATA = {
    "business_directory": [
        {"_id": ObjectId(), "name": "Weber Malerei GmbH", "city": "Wien",
         "lat": 48.2213796, "lng": 16.3738, "segment": "Maler", "claimed": False,
         "osm_id": "way/123"} for _ in range(3)
    ],
    "pro_invoices": [
        {"_id": ObjectId(), "invoice_number": "RG-2026-0001",
         "invoice_date": datetime(2026, 3, 1, tzinfo=timezone.utc),
         "pro_snapshot": {"business_name": "Müller Sanitär", "bank_iban": "AT611904300234573201"},
         "line_items": [{"description": "Wandfläche 40 m²", "qty": 40, "unit_net": 12.5}],
         "brutto_total": 600.0, "net_total": 500.0},
    ],
    "users": [
        {"_id": ObjectId(), "email": "pro@test.com", "name": "Anna Müller",
         "password_hash": "$2b$12$SECRET", "role": "tradesperson"},
    ],
    "pro_profiles": [{"_id": ObjectId(), "business_name": "X", "stripe_customer_id": "cus_SECRET"}],
    "counters": [{"_id": "pro_invoice_seq_abc_2026", "value": 7}],
    "empty_collection": [],
}

# ── stub motor ──────────────────────────────────────────────────────────
class Coll:
    def __init__(s, d): s.d = d
    def find(s, *a, **k): return s
    async def to_list(s, length=None): return [dict(x) for x in s.d]
    async def count_documents(s, *a, **k): return len(s.d)
class DB:
    def __init__(s, d): s.d = d
    def __getitem__(s, n): return Coll(s.d.get(n, []))
    async def command(s, *a, **k): return {"ok": 1}
    async def list_collection_names(s): return list(s.d)
class Client:
    def __init__(s, *a, **k): pass
    def __getitem__(s, n): return DB(DATA)
    def close(s): pass

import export_backup as EB
EB.AsyncIOMotorClient = Client
EB.AsyncIOMotorGridFSBucket = lambda *a, **k: (_ for _ in ()).throw(Exception("no gridfs"))

import tempfile
OUT = Path(tempfile.mkdtemp()) / "dump"
manifest = asyncio.run(EB.export(OUT, None, True, False, False))

fails = []
def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond: fails.append(msg)

print("\n── manifest ──")
check(manifest["collections"]["business_directory"] == 3, "business_directory counted (3)")
check(manifest["collections"]["pro_invoices"] == 1, "pro_invoices counted (1)")
check(manifest["collections"]["empty_collection"] == 0, "empty collection recorded, not skipped")

print("\n── critical-first ordering ──")
names = list(manifest["collections"])
check(names[0] == "business_directory", f"most-critical collection exported first (got {names[0]})")

print("\n── secret redaction ──")
raw = gzip.open(OUT / "backup.json.gz", "rt", encoding="utf-8").read()
check("$2b$12$SECRET" not in raw, "password_hash stripped from dump")
check("cus_SECRET" not in raw, "stripe_customer_id stripped from dump")
check("pro@test.com" in raw, "non-secret user fields retained")

print("\n── round-trip fidelity (export → restore loader) ──")
sys.argv = ["x"]
import restore_backup as RB
loaded = {}
for name, doc in RB.load_docs(OUT / "backup.json.gz", None):
    loaded.setdefault(name, []).append(doc)
inv = loaded["pro_invoices"][0]
check(isinstance(inv["_id"], ObjectId), "ObjectId survives round-trip as ObjectId")
check(isinstance(inv["invoice_date"], datetime), "datetime survives as datetime")
check(inv["pro_snapshot"]["bank_iban"] == "AT611904300234573201", "nested dict intact")
check(inv["line_items"][0]["qty"] == 40, "list-of-dicts intact")
check(loaded["business_directory"][0]["name"] == "Weber Malerei GmbH", "unicode/name intact")
check(loaded["counters"][0]["value"] == 7, "counters (invoice sequence) intact")
check(loaded["business_directory"][0]["lat"] == 48.2213796, "float coord precision intact")

print("\n── artefacts ──")
check((OUT / "csv" / "business_directory.csv").exists(), "per-collection CSV written")
check(not (OUT / "csv" / "empty_collection.csv").exists(), "no CSV for empty collection")
check((OUT / "backup.xlsx").exists(), "Excel workbook written")
import pandas as pd
xl = pd.ExcelFile(OUT / "backup.xlsx")
check("business_directory" in xl.sheet_names, "xlsx has a sheet per collection")
check(len(pd.read_excel(OUT / "backup.xlsx", sheet_name="business_directory")) == 3, "xlsx row count correct")
flat = pd.read_csv(OUT / "csv" / "pro_invoices.csv")
check("pro_snapshot.business_name" in flat.columns, "nested fields flattened to dotted columns")

print("\n── verify() ──")
check(EB.verify(OUT) == 0, "verify() passes on an intact dump")

print("\n── verify() detects corruption ──")
import shutil
BAD = OUT.parent / "corrupt"; shutil.rmtree(BAD, ignore_errors=True); shutil.copytree(OUT, BAD)
lines = gzip.open(BAD / "backup.json.gz", "rt", encoding="utf-8").read().splitlines()
gzip.open(BAD / "backup.json.gz", "wt", encoding="utf-8").write("\n".join(lines[:-2]))
check(EB.verify(BAD) == 1, "truncated dump is rejected")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S): " + "; ".join(fails)))
sys.exit(1 if fails else 0)
