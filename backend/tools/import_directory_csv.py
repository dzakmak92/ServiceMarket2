#!/usr/bin/env python3
"""Import the Austrian business directory CSV into Postgres.

    python tools/import_directory_csv.py Companies.csv
    python tools/import_directory_csv.py Companies.csv --dry-run
    python tools/import_directory_csv.py --stats

In the one-sided product this is no longer a homeowner-facing map: it is the
prospect list, and the source for the onboarding "claim my business" step
that prefills a tradesperson's company details.

Handles the quirks the original import hit:

  · Delimiter is sniffed — the file is semicolon-separated, not comma.
  · Headers are matched case- and accent-insensitively, with common aliases
    (zip/plz → postal_code, lon/long → lng).
  · **Coordinates written with thousand separators.** The export produced
    `482.213.796` for 48.2213796 and `482.046` for 48.2046. Trusting the
    single-dot form gives a latitude of 482, which is off the planet — so
    values outside a plausible range are rescaled rather than accepted.
  · Upsert on osm_id where present, else on name+city, so a re-run updates
    instead of duplicating.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import io
import sys
import unicodedata
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from db import pg  # noqa: E402

# Austria, with a margin. Used to decide whether a coordinate is plausible.
LAT_RANGE = (46.0, 49.5)
LNG_RANGE = (9.0, 17.5)

ALIASES = {
    "name": "name", "firma": "name", "company": "name", "unternehmen": "name",
    "group": "group", "gruppe": "group",
    "segment": "segment", "branche": "segment",
    "category": "category", "kategorie": "category",
    "address": "address", "adresse": "address", "strasse": "address", "street": "address",
    "postal_code": "postal_code", "postalcode": "postal_code", "plz": "postal_code",
    "zip": "postal_code", "zipcode": "postal_code",
    "city": "city", "stadt": "city", "ort": "city",
    "country": "country", "land": "country",
    "lat": "lat", "latitude": "lat", "breite": "lat", "breitengrad": "lat",
    "lng": "lng", "lon": "lng", "long": "lng", "longitude": "lng",
    "laenge": "lng", "langengrad": "lng", "laengengrad": "lng",
    "phone": "phone", "telefon": "phone", "tel": "phone",
    "email": "email", "e_mail": "email", "mail": "email",
    "website": "website", "web": "website", "url": "website", "homepage": "website",
    "osm_id": "osm_id", "osmid": "osm_id", "id": "osm_id",
}


def _norm(h: str) -> str:
    h = unicodedata.normalize("NFKD", (h or "").strip().lower())
    h = "".join(c for c in h if not unicodedata.combining(c))
    return h.replace(" ", "_").replace("-", "_").replace(".", "")


def parse_coord(raw: Any, lo: float, hi: float) -> Optional[float]:
    """Recover a coordinate from a value mangled by thousand separators.

    `48.2213796` survives untouched. `482.213.796` has two dots, so the
    separators are stripped and a decimal point reinserted after the leading
    two digits. `482.046` is the dangerous case: it parses cleanly as a float
    but 482 is not a latitude, so it is rescaled by powers of ten until it
    lands in range. Anything that still does not fit is dropped rather than
    stored — a business pinned to the wrong continent is worse than one with
    no pin at all.
    """
    if raw is None:
        return None
    s = str(raw).strip().replace(",", ".")
    if not s or s in ("-", "0"):
        return None

    if s.count(".") > 1:
        digits = s.replace(".", "")
        neg = digits.startswith("-")
        digits = digits.lstrip("-")
        if len(digits) < 3:
            return None
        s = ("-" if neg else "") + digits[:2] + "." + digits[2:]

    try:
        v = float(s)
    except ValueError:
        return None

    for _ in range(8):
        if lo <= abs(v) <= hi or lo <= v <= hi:
            return round(v, 6)
        if abs(v) > hi:
            v /= 10.0
        else:
            break
    return round(v, 6) if lo <= v <= hi else None


def read_rows(path: Path) -> tuple[list[dict], list[str]]:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        sys.exit("Could not decode the file in UTF-8, CP1252 or Latin-1.")

    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t|")
        delim = dialect.delimiter
    except csv.Error:
        delim = ";" if sample.count(";") > sample.count(",") else ","

    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    headers = [_norm(h) for h in (reader.fieldnames or [])]
    mapped = {h: ALIASES.get(h) for h in headers}
    rows = []
    for r in reader:
        out: dict[str, Any] = {}
        for orig, value in r.items():
            key = mapped.get(_norm(orig or ""))
            if key and value not in (None, ""):
                out[key] = str(value).strip()
        if out:
            rows.append(out)
    unmapped = [h for h in headers if not mapped.get(h)]
    return rows, unmapped


def clean(row: dict) -> Optional[dict]:
    name = (row.get("name") or "").strip()
    if not name:
        return None
    return {
        "name": name[:300],
        "group": (row.get("group") or None),
        "segment": (row.get("segment") or None),
        "category": (row.get("category") or None),
        "address": (row.get("address") or None),
        "postal_code": (row.get("postal_code") or None),
        "city": (row.get("city") or None),
        "country": ((row.get("country") or "AT")[:2].upper()),
        "lat": parse_coord(row.get("lat"), *LAT_RANGE),
        "lng": parse_coord(row.get("lng"), *LNG_RANGE),
        "phone": (row.get("phone") or None),
        "email": (row.get("email") or None),
        "website": (row.get("website") or None),
        "osm_id": (row.get("osm_id") or None),
    }


async def import_rows(rows: list[dict], batch: int = 500) -> dict:
    inserted = updated = 0
    async with pg.transaction() as con:
        for i in range(0, len(rows), batch):
            for r in rows[i:i + batch]:
                if r.get("osm_id"):
                    res = await con.fetchrow(
                        """
                        insert into business_directory
                          (osm_id, name, "group", segment, category, address, postal_code,
                           city, country, lat, lng, phone, email, website)
                        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                        on conflict (osm_id) do update set
                          name=excluded.name, "group"=excluded."group",
                          segment=excluded.segment, category=excluded.category,
                          address=excluded.address, postal_code=excluded.postal_code,
                          city=excluded.city, country=excluded.country,
                          lat=coalesce(excluded.lat, business_directory.lat),
                          lng=coalesce(excluded.lng, business_directory.lng),
                          phone=excluded.phone, email=excluded.email,
                          website=excluded.website
                        returning (xmax = 0) as is_insert
                        """,
                        r["osm_id"], r["name"], r["group"], r["segment"], r["category"],
                        r["address"], r["postal_code"], r["city"], r["country"],
                        r["lat"], r["lng"], r["phone"], r["email"], r["website"])
                else:
                    # No stable id: match on name+city so a re-run updates.
                    existing = await con.fetchval(
                        "select id from business_directory "
                        "where lower(name)=lower($1) and coalesce(lower(city),'')=coalesce(lower($2),'')",
                        r["name"], r["city"])
                    if existing:
                        await con.execute(
                            """
                            update business_directory set "group"=$2, segment=$3, category=$4,
                              address=$5, postal_code=$6, country=$7,
                              lat=coalesce($8, lat), lng=coalesce($9, lng),
                              phone=$10, email=$11, website=$12
                            where id=$1
                            """, existing, r["group"], r["segment"], r["category"],
                            r["address"], r["postal_code"], r["country"],
                            r["lat"], r["lng"], r["phone"], r["email"], r["website"])
                        res = {"is_insert": False}
                    else:
                        await con.execute(
                            """
                            insert into business_directory
                              (name, "group", segment, category, address, postal_code,
                               city, country, lat, lng, phone, email, website)
                            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                            """,
                            r["name"], r["group"], r["segment"], r["category"], r["address"],
                            r["postal_code"], r["city"], r["country"], r["lat"], r["lng"],
                            r["phone"], r["email"], r["website"])
                        res = {"is_insert": True}
                if res and res["is_insert"]:
                    inserted += 1
                else:
                    updated += 1
            print(f"  {min(i + batch, len(rows)):,} / {len(rows):,}")
    return {"inserted": inserted, "updated": updated}


async def stats() -> int:
    await pg.init_pool()
    total = await pg.fetchval("select count(*) from business_directory")
    geo = await pg.fetchval("select count(*) from business_directory where lat is not null")
    bad = await pg.fetchval(
        f"select count(*) from business_directory where lat is not null and "
        f"(lat not between {LAT_RANGE[0]} and {LAT_RANGE[1]} "
        f" or lng not between {LNG_RANGE[0]} and {LNG_RANGE[1]})")
    print(f"businesses:       {total:,}")
    print(f"with coordinates: {geo:,}")
    print(f"out of range:     {bad:,}  (should be 0)")
    print("\ntop segments:")
    for r in await pg.fetch(
        "select segment, count(*) n from business_directory "
        "where segment is not null group by segment order by n desc limit 10"):
        print(f"  {r['segment'][:40]:<40} {r['n']:>6,}")
    print("\ntop cities:")
    for r in await pg.fetch(
        "select city, count(*) n from business_directory "
        "where city is not null group by city order by n desc limit 10"):
        print(f"  {r['city'][:40]:<40} {r['n']:>6,}")
    await pg.close_pool()
    return 0


async def main_async(args) -> int:
    path = Path(args.csv)
    if not path.exists():
        sys.exit(f"No such file: {path}")

    rows, unmapped = read_rows(path)
    print(f"{len(rows):,} rows read from {path.name}")
    if unmapped:
        print(f"  ignored columns: {', '.join(unmapped)}")

    cleaned = [c for c in (clean(r) for r in rows) if c]
    skipped = len(rows) - len(cleaned)
    with_geo = sum(1 for c in cleaned if c["lat"] is not None)
    print(f"  {len(cleaned):,} usable · {skipped:,} skipped (no name) · "
          f"{with_geo:,} with coordinates")

    if with_geo < len(cleaned) * 0.5:
        print("\n⚠ Fewer than half the rows produced a usable coordinate.")
        print("  Check a raw lat value — the export may use a format not handled here.")
        for r in rows[:3]:
            print(f"    lat={r.get('lat')!r}  lng={r.get('lng')!r}")

    if args.dry_run:
        print("\ndry run — nothing written")
        for c in cleaned[:5]:
            print(f"  {c['name'][:40]:<40} {c['city'] or '—':<15} "
                  f"{c['lat']},{c['lng']}  {c['segment'] or ''}")
        return 0

    await pg.init_pool()
    print()
    res = await import_rows(cleaned)
    print(f"\ninserted {res['inserted']:,} · updated {res['updated']:,}")
    total = await pg.fetchval("select count(*) from business_directory")
    print(f"directory now holds {total:,} businesses")
    await pg.close_pool()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Import the business directory CSV")
    ap.add_argument("csv", nargs="?", help="path to the CSV")
    ap.add_argument("--dry-run", action="store_true", help="parse and report, write nothing")
    ap.add_argument("--stats", action="store_true", help="report what is already imported")
    args = ap.parse_args()
    if args.stats:
        return asyncio.run(stats())
    if not args.csv:
        ap.error("give a CSV path, or --stats")
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
