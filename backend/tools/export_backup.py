#!/usr/bin/env python3
"""Pre-migration backup: dump every MongoDB collection to disk.

Run this BEFORE Phase 2 touches any collection. It produces three
representations of the same data, because they serve different purposes:

  backup.json.gz   full-fidelity BSON-typed JSON. This is the ONLY artefact
                   that can be restored (see restore_backup.py). ObjectIds,
                   dates and binary survive intact.
  *.csv            one file per collection, flattened. For grepping and for
                   collections too big for a spreadsheet.
  backup.xlsx      one sheet per collection. For eyeballing and sharing.
                   Excel caps at ~1.05M rows/sheet and mangles long numeric
                   strings — treat it as a VIEW, never as the backup.
  gridfs/          the binary files (pro logos, Gewerbeschein/insurance PDFs,
                   tax-receipt photos, PM job photos). Easy to forget; they
                   are not in any collection.

Usage
    cd backend
    python tools/export_backup.py                    # → ./backups/<timestamp>/
    python tools/export_backup.py --out /mnt/backup
    python tools/export_backup.py --only business_directory,pro_invoices
    python tools/export_backup.py --no-xlsx          # skip Excel (big DBs)
    python tools/export_backup.py --verify <dir>     # re-check an existing dump

Reads MONGO_URL and DB_NAME from backend/.env, exactly like the app does.

⚠  DATA PROTECTION — the dump contains personal data (customer names,
   addresses, phone numbers, site photos, invoices). Under DSGVO/GDPR it is
   a processing activity: store it encrypted, keep it off shared drives, and
   delete it once the migration is verified. Password hashes are excluded by
   default; pass --include-secrets to override (you should not need to).
"""
from __future__ import annotations

import argparse
import asyncio
import gzip
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from bson import json_util  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket  # noqa: E402

# Collections whose loss would be unrecoverable, in priority order. These are
# exported first and their counts are asserted loudly at the end.
CRITICAL = [
    # 8,660 geocoded Austrian businesses — hand-imported, the prospect list
    # the one-sided product is built on. Cannot be regenerated.
    "business_directory",
    # Legally retained for 7 years (DE: up to 10). Immutable by design.
    "pro_invoices",
    "invoices",
    # The pros themselves: bank details, Kleinunternehmer flag, logos, tax ids.
    "pro_profiles",
    "users",
    # Consent + audit trails — GDPR evidence, cannot be reconstructed.
    "consent_records",
    "audit_log",
    # Gap-free invoice sequences. Losing these breaks numbering continuity,
    # which is a compliance problem, not an inconvenience.
    "counters",
]

# Fields stripped unless --include-secrets. Not a security boundary — just
# keeps credentials out of a file that will get emailed around.
REDACT = {
    "users": ["password_hash"],
    "pro_profiles": ["stripe_customer_id"],
}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _flatten(doc: dict, prefix: str = "") -> dict:
    """Flatten nested docs to dotted columns so they fit a spreadsheet grid.
    Lists become JSON strings — lossy on purpose; the JSON dump is the source
    of truth."""
    out: dict = {}
    for k, v in doc.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_flatten(v, f"{key}."))
        elif isinstance(v, list):
            out[key] = json.dumps(v, default=str, ensure_ascii=False)
        else:
            out[key] = v
    return out


async def export(out_dir: Path, only: list[str] | None, want_xlsx: bool,
                 include_secrets: bool, skip_gridfs: bool) -> dict:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        sys.exit("MONGO_URL / DB_NAME not set. Run from backend/ with a populated .env.")

    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=10_000)
    db = client[db_name]
    try:
        await db.command("ping")
    except Exception as exc:
        sys.exit(f"Cannot reach MongoDB at {mongo_url.split('@')[-1]}: {exc}")

    names = sorted(await db.list_collection_names())
    if only:
        missing = set(only) - set(names)
        if missing:
            print(f"!  requested but not present: {', '.join(sorted(missing))}")
        names = [n for n in names if n in only]
    # Critical collections first, so a run that dies partway still saved them.
    names.sort(key=lambda n: (n not in CRITICAL, CRITICAL.index(n) if n in CRITICAL else 0, n))

    out_dir.mkdir(parents=True, exist_ok=True)
    csv_dir = out_dir / "csv"
    csv_dir.mkdir(exist_ok=True)

    manifest: dict = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "database": db_name,
        "collections": {},
        "gridfs": {},
        "secrets_included": include_secrets,
    }

    import pandas as pd

    sheets: dict[str, "pd.DataFrame"] = {}
    json_path = out_dir / "backup.json.gz"

    with gzip.open(json_path, "wt", encoding="utf-8") as jf:
        for name in names:
            docs = await db[name].find({}).to_list(length=None)
            if not include_secrets:
                for field in REDACT.get(name, []):
                    for d in docs:
                        d.pop(field, None)

            # Newline-delimited so a truncated file still parses up to the cut.
            for d in docs:
                jf.write(json_util.dumps({"__collection__": name, "doc": d}) + "\n")

            flat = [_flatten(json.loads(json_util.dumps(d))) for d in docs]
            df = pd.DataFrame(flat)
            if not df.empty:
                df.to_csv(csv_dir / f"{name}.csv", index=False)
            sheets[name] = df

            manifest["collections"][name] = len(docs)
            flag = "★" if name in CRITICAL else " "
            print(f"  {flag} {name:<32} {len(docs):>8,} docs")

    # ── GridFS: logos, licences, receipts, job photos ────────────────────
    if not skip_gridfs:
        gridfs_dir = out_dir / "gridfs"
        gridfs_dir.mkdir(exist_ok=True)
        for bucket_name in ("portfolio", "fs"):
            try:
                bucket = AsyncIOMotorGridFSBucket(db, bucket_name=bucket_name)
                files = await db[f"{bucket_name}.files"].find({}).to_list(length=None)
            except Exception:
                continue
            if not files:
                continue
            bdir = gridfs_dir / bucket_name
            bdir.mkdir(parents=True, exist_ok=True)
            saved = 0
            for f in files:
                fid = f["_id"]
                try:
                    stream = await bucket.open_download_stream(fid)
                    (bdir / f"{fid}").write_bytes(await stream.read())
                    saved += 1
                except Exception as exc:
                    print(f"    ! gridfs {fid}: {exc}")
            # Keep the metadata so filenames/content-types survive.
            (bdir / "_files.json").write_text(json_util.dumps(files, indent=2))
            manifest["gridfs"][bucket_name] = saved
            print(f"    · gridfs/{bucket_name:<24} {saved:>8,} files")

    # ── Excel view ───────────────────────────────────────────────────────
    if want_xlsx:
        xlsx_path = out_dir / "backup.xlsx"
        try:
            with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
                for name, df in sheets.items():
                    if df.empty:
                        continue
                    if len(df) > 1_000_000:
                        print(f"  ! {name}: {len(df):,} rows exceeds the Excel sheet cap — CSV only")
                        continue
                    # Excel sheet names: 31 chars, no []:*?/\
                    sheet = name[:31]
                    for ch in "[]:*?/\\":
                        sheet = sheet.replace(ch, "_")
                    df.to_excel(writer, sheet_name=sheet, index=False)
            print(f"\n  → {xlsx_path.name}")
        except ImportError:
            print("\n  ! openpyxl not installed — skipping .xlsx (CSV + JSON are complete).")
            print("    pip install openpyxl")

    manifest["backup_json_sha256"] = _sha256(json_path)
    manifest["backup_json_bytes"] = json_path.stat().st_size
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    client.close()
    return manifest


def verify(out_dir: Path) -> int:
    """Re-read a dump and check it against its manifest."""
    manifest_path = out_dir / "manifest.json"
    if not manifest_path.exists():
        print(f"No manifest.json in {out_dir}")
        return 1
    manifest = json.loads(manifest_path.read_text())
    json_path = out_dir / "backup.json.gz"

    actual = _sha256(json_path)
    if actual != manifest.get("backup_json_sha256"):
        print(f"FAIL checksum mismatch\n  manifest {manifest.get('backup_json_sha256')}\n  actual   {actual}")
        return 1

    counts: dict[str, int] = {}
    with gzip.open(json_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                counts[json.loads(line)["__collection__"]] = counts.get(json.loads(line)["__collection__"], 0) + 1

    ok = True
    for name, expected in manifest["collections"].items():
        got = counts.get(name, 0)
        if got != expected:
            print(f"FAIL {name}: manifest {expected:,}, file {got:,}")
            ok = False
    if ok:
        total = sum(manifest["collections"].values())
        print(f"OK  checksum matches, {total:,} documents across "
              f"{len(manifest['collections'])} collections")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="Pre-migration MongoDB backup")
    ap.add_argument("--out", default="backups", help="output root (default: ./backups)")
    ap.add_argument("--only", help="comma-separated collections (default: all)")
    ap.add_argument("--no-xlsx", action="store_true", help="skip the Excel workbook")
    ap.add_argument("--no-gridfs", action="store_true", help="skip binary files")
    ap.add_argument("--include-secrets", action="store_true",
                    help="keep password hashes and Stripe ids (you should not need this)")
    ap.add_argument("--verify", metavar="DIR", help="verify an existing dump and exit")
    args = ap.parse_args()

    if args.verify:
        return verify(Path(args.verify))

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(args.out) / stamp
    only = [c.strip() for c in args.only.split(",")] if args.only else None

    print(f"Backing up {os.environ.get('DB_NAME', '?')} → {out_dir}\n")
    manifest = asyncio.run(export(
        out_dir, only, not args.no_xlsx, args.include_secrets, args.no_gridfs))

    total = sum(manifest["collections"].values())
    print(f"\n{total:,} documents · {manifest['backup_json_bytes'] / 1e6:.1f} MB compressed")

    missing = [c for c in CRITICAL if manifest["collections"].get(c, 0) == 0]
    if missing:
        print("\n⚠  CRITICAL collections empty or absent: " + ", ".join(missing))
        print("   If you expected data there, STOP and investigate before migrating.")

    print(f"\nVerify with:  python tools/export_backup.py --verify {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
