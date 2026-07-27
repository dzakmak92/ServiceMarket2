#!/usr/bin/env python3
"""Move GridFS binaries into Supabase Storage.

Run AFTER tools/import_from_mongo.py, because it resolves each file's owner
through the rows the import created.

GridFS holds the things that are easy to forget because they live in no
collection: pro logos, Gewerbeschein and insurance uploads, tax-receipt
photos, and PM job photos. A collection-only migration silently drops all of
them, and the licence documents in particular are not re-obtainable — the
tradesperson would have to be asked to upload their trade licence again.

Usage
    python tools/migrate_gridfs.py                 # live Mongo -> Storage
    python tools/migrate_gridfs.py --from backups/<stamp>
    python tools/migrate_gridfs.py --dry-run
    python tools/migrate_gridfs.py --verify

Idempotent: a file whose target row already carries a `storage_ref` is
skipped, so a partial run can be repeated.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from db import pg  # noqa: E402
from services import storage  # noqa: E402

# Where a GridFS file lands, decided by the metadata the old app wrote.
KIND_ROUTES = {
    "tax_receipt": (storage.BUCKET_RECEIPTS, "expenses"),
    "logo": (storage.BUCKET_LOGOS, "pro_profiles"),
    "licence": (storage.BUCKET_DOCUMENTS, "pro_profiles"),
    "insurance": (storage.BUCKET_DOCUMENTS, "pro_profiles"),
    "portfolio": (storage.BUCKET_JOB_PHOTOS, None),
    "pm_photo": (storage.BUCKET_JOB_PHOTOS, "job_documents"),
}
DEFAULT_ROUTE = (storage.BUCKET_DOCUMENTS, None)


async def _owner_for(file_id: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """(pro_id, table, column) — which row referenced this GridFS id.

    The legacy ids were copied verbatim into the new rows during the import,
    which is what makes this resolvable at all.
    """
    row = await pg.fetchrow(
        "select id::text as pro_id, 'pro_profiles' as t, 'logo_file_id' as c "
        "from pro_profiles where logo_file_id = $1", file_id)
    if row:
        return row["pro_id"], row["t"], row["c"]
    for col in ("licence_file_id", "insurance_file_id"):
        row = await pg.fetchrow(
            f"select id::text as pro_id from pro_profiles where {col} = $1", file_id)
        if row:
            return row["pro_id"], "pro_profiles", col
    row = await pg.fetchrow(
        "select pro_id::text as pro_id from expenses where storage_ref = $1", file_id)
    if row:
        return row["pro_id"], "expenses", "storage_ref"
    row = await pg.fetchrow(
        "select j.pro_id::text as pro_id from job_documents d "
        "join jobs j on j.id = d.job_id where d.storage_ref = $1", file_id)
    if row:
        return row["pro_id"], "job_documents", "storage_ref"
    return None, None, None


async def _gridfs_files(source: Optional[Path]):
    """Yield (file_id, filename, content_type, kind, bytes)."""
    if source:
        from bson import json_util
        for bucket_dir in sorted(p for p in (source / "gridfs").iterdir() if p.is_dir()):
            meta = bucket_dir / "_files.json"
            if not meta.exists():
                continue
            for f in json_util.loads(meta.read_text()):
                blob = bucket_dir / str(f["_id"])
                if blob.exists():
                    md = f.get("metadata") or {}
                    yield (str(f["_id"]), f.get("filename") or "file",
                           md.get("content_type") or "application/octet-stream",
                           md.get("kind") or "", blob.read_bytes())
    else:
        import os
        from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        for name in ("portfolio", "fs"):
            try:
                files = await db[f"{name}.files"].find({}).to_list(length=None)
            except Exception:
                continue
            gfs = AsyncIOMotorGridFSBucket(db, bucket_name=name)
            for f in files:
                try:
                    stream = await gfs.open_download_stream(f["_id"])
                    md = f.get("metadata") or {}
                    yield (str(f["_id"]), f.get("filename") or "file",
                           md.get("content_type") or "application/octet-stream",
                           md.get("kind") or "", await stream.read())
                except Exception as exc:
                    print(f"    ! read {f['_id']}: {exc}")


async def run(source: Optional[Path], dry: bool) -> dict:
    if not storage.is_configured():
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY are not set.")
    await pg.init_pool()

    moved = skipped = orphaned = failed = 0
    async for file_id, filename, content_type, kind, data in _gridfs_files(source):
        pro_id, table, column = await _owner_for(file_id)
        if not pro_id:
            # A file nothing references. Usually a deleted portfolio photo
            # whose row went with it. Reported rather than moved: paying to
            # store an orphan forever is worse than losing it.
            orphaned += 1
            continue

        bucket = KIND_ROUTES.get(kind, DEFAULT_ROUTE)[0]
        if dry:
            print(f"  would move {file_id} -> {bucket} (owner {pro_id[:8]}…, {table}.{column})")
            moved += 1
            continue

        key = storage.build_key(pro_id, filename)
        try:
            ref = await storage.upload(bucket, key, data, content_type=content_type)
        except storage.StorageError as exc:
            print(f"    ! upload {file_id}: {exc}")
            failed += 1
            continue

        await pg.execute(
            f"update {table} set {column} = $1 where {column} = $2", ref, file_id)
        moved += 1
        if moved % 50 == 0:
            print(f"  {moved} moved…")

    await pg.close_pool()
    return {"moved": moved, "skipped": skipped, "orphaned": orphaned, "failed": failed}


async def verify() -> int:
    await pg.init_pool()
    print("References still pointing at a raw GridFS id rather than bucket/key:\n")
    total = 0
    for table, col in (("pro_profiles", "logo_file_id"),
                       ("pro_profiles", "licence_file_id"),
                       ("pro_profiles", "insurance_file_id"),
                       ("expenses", "storage_ref"),
                       ("job_documents", "storage_ref")):
        n = await pg.fetchval(
            f"select count(*) from {table} "
            f"where {col} is not null and {col} not like '%/%'")
        total += int(n or 0)
        print(f"  {table}.{col:<20} {n:>6}")
    print(f"\n{'OK — everything migrated' if not total else f'{total} still unmigrated'}")
    await pg.close_pool()
    return 0 if not total else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="GridFS → Supabase Storage")
    ap.add_argument("--from", dest="source", help="backup directory instead of live Mongo")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verify", action="store_true")
    args = ap.parse_args()

    if args.verify:
        return asyncio.run(verify())

    res = asyncio.run(run(Path(args.source) if args.source else None, args.dry_run))
    print(f"\nmoved {res['moved']:,} · orphaned {res['orphaned']:,} · failed {res['failed']:,}")
    if res["orphaned"]:
        print("Orphans are files no row references — usually deleted portfolio photos.")
    if res["failed"]:
        print("Failures are listed above; re-running is safe and skips what already moved.")
    return 1 if res["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
