#!/usr/bin/env python3
"""Restore a dump produced by export_backup.py.

A backup nobody has restored is a guess. Before Phase 2 touches production,
restore into a scratch database and confirm the counts match:

    python tools/restore_backup.py backups/<stamp> --db servicemarket_restore_test
    python tools/restore_backup.py backups/<stamp> --db servicemarket_restore_test --check

Usage
    python tools/restore_backup.py <dir> --db <name>            # restore
    python tools/restore_backup.py <dir> --db <name> --check    # compare only
    python tools/restore_backup.py <dir> --db <name> --only business_directory

Refuses to write into the live DB_NAME unless --force-same-db is passed, and
refuses to touch a non-empty target collection unless --drop is passed.
Restoring over live data is exactly how a backup turns into an outage.
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from bson import json_util  # noqa: E402
from pymongo import MongoClient  # noqa: E402


def load_docs(json_path: Path, only: set[str] | None):
    """Stream the newline-delimited dump, yielding (collection, doc)."""
    with gzip.open(json_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            rec = json_util.loads(line)
            name = rec["__collection__"]
            if only and name not in only:
                continue
            yield name, rec["doc"]


def main() -> int:
    ap = argparse.ArgumentParser(description="Restore a pre-migration backup")
    ap.add_argument("dir", help="backup directory (contains backup.json.gz)")
    ap.add_argument("--db", required=True, help="target database name")
    ap.add_argument("--only", help="comma-separated collections")
    ap.add_argument("--drop", action="store_true", help="drop target collections first")
    ap.add_argument("--check", action="store_true", help="compare counts, write nothing")
    ap.add_argument("--force-same-db", action="store_true",
                    help="allow restoring into the live DB_NAME")
    ap.add_argument("--batch", type=int, default=1000, help="insert batch size")
    args = ap.parse_args()

    backup_dir = Path(args.dir)
    json_path = backup_dir / "backup.json.gz"
    manifest_path = backup_dir / "manifest.json"
    if not json_path.exists():
        return print(f"No backup.json.gz in {backup_dir}") or 1

    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    live_db = os.environ.get("DB_NAME")
    if args.db == live_db and not args.force_same_db and not args.check:
        print(f"Refusing to restore into the live database ({live_db}).")
        print("Restore into a scratch DB, or pass --force-same-db if you truly mean it.")
        return 1

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        return print("MONGO_URL not set.") or 1

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=10_000)
    db = client[args.db]
    only = {c.strip() for c in args.only.split(",")} if args.only else None

    # ── check mode ───────────────────────────────────────────────────────
    if args.check:
        print(f"Comparing {backup_dir} against database '{args.db}'\n")
        expected = manifest.get("collections", {})
        if not expected:
            expected = {}
            for name, _ in load_docs(json_path, only):
                expected[name] = expected.get(name, 0) + 1
        bad = 0
        for name in sorted(expected):
            if only and name not in only:
                continue
            want, got = expected[name], db[name].count_documents({})
            mark = "ok  " if want == got else "DIFF"
            if want != got:
                bad += 1
            print(f"  {mark} {name:<32} backup {want:>8,}   db {got:>8,}")
        print(f"\n{'all collections match' if not bad else f'{bad} collection(s) differ'}")
        return 0 if not bad else 1

    # ── restore ──────────────────────────────────────────────────────────
    if args.drop:
        seen = set()
        for name, _ in load_docs(json_path, only):
            if name not in seen:
                db[name].drop()
                seen.add(name)
        print(f"Dropped {len(seen)} target collection(s).\n")
    else:
        nonempty = []
        seen = set()
        for name, _ in load_docs(json_path, only):
            if name in seen:
                continue
            seen.add(name)
            if db[name].count_documents({}, limit=1):
                nonempty.append(name)
        if nonempty:
            print("Target collections are not empty: " + ", ".join(sorted(nonempty)))
            print("Pass --drop to replace them, or pick an empty target database.")
            return 1

    buf: dict[str, list] = {}
    counts: dict[str, int] = {}

    def flush(name: str) -> None:
        if buf.get(name):
            db[name].insert_many(buf[name], ordered=False)
            counts[name] = counts.get(name, 0) + len(buf[name])
            buf[name] = []

    for name, doc in load_docs(json_path, only):
        buf.setdefault(name, []).append(doc)
        if len(buf[name]) >= args.batch:
            flush(name)
    for name in list(buf):
        flush(name)

    for name in sorted(counts):
        print(f"  restored {name:<32} {counts[name]:>8,}")

    # GridFS binaries, if the dump captured them.
    gridfs_dir = backup_dir / "gridfs"
    if gridfs_dir.exists() and not only:
        import gridfs
        for bucket_dir in sorted(p for p in gridfs_dir.iterdir() if p.is_dir()):
            meta_path = bucket_dir / "_files.json"
            if not meta_path.exists():
                continue
            files = json_util.loads(meta_path.read_text())
            fs = gridfs.GridFS(db, collection=bucket_dir.name)
            n = 0
            for f in files:
                blob = bucket_dir / str(f["_id"])
                if not blob.exists() or fs.exists(f["_id"]):
                    continue
                fs.put(blob.read_bytes(), _id=f["_id"],
                       filename=f.get("filename"), metadata=f.get("metadata"))
                n += 1
            print(f"  restored gridfs/{bucket_dir.name:<24} {n:>8,}")

    total = sum(counts.values())
    print(f"\n{total:,} documents restored into '{args.db}'")
    print(f"Confirm with:  python tools/restore_backup.py {backup_dir} --db {args.db} --check")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
