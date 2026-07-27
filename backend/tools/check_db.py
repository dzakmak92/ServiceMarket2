#!/usr/bin/env python3
"""Check the Postgres connection and report what is wrong if it fails.

    cd backend
    python tools/check_db.py

Prints a diagnosis rather than a stack trace: the failure modes here are all
configuration, and the raw asyncpg error rarely names the actual mistake.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

ENV_PATH = BACKEND / ".env"
load_dotenv(ENV_PATH)

# Characters that must be percent-encoded inside the password segment of a
# URL. An unencoded '@' or '/' silently truncates the host and produces a
# confusing "could not translate host name".
MUST_ENCODE = "@/#?:%&+ "


def fail(msg: str, *hints: str) -> int:
    print(f"\n✗ {msg}")
    for h in hints:
        print(f"  → {h}")
    return 1


def inspect_dsn(dsn: str) -> list[str]:
    """Static checks before we even try to connect."""
    notes: list[str] = []

    if dsn.strip() != dsn:
        notes.append("DATABASE_URL has leading/trailing whitespace — remove it.")
    if dsn.startswith(('"', "'")) or dsn.endswith(('"', "'")):
        notes.append("DATABASE_URL is wrapped in quotes — .env values need no quotes.")
    if "[YOUR-PASSWORD]" in dsn or "YOUR-PASSWORD" in dsn:
        notes.append("The placeholder is still there — replace it with the real password.")

    try:
        parts = urlsplit(dsn.strip().strip('"').strip("'"))
    except ValueError:
        notes.append("DATABASE_URL is not a parseable URL.")
        return notes

    if parts.scheme not in ("postgresql", "postgres"):
        notes.append(f"Scheme is '{parts.scheme}', expected 'postgresql'.")

    host = parts.hostname or ""
    port = parts.port
    user = parts.username or ""
    pw = parts.password or ""

    if not host:
        notes.append(
            "No host could be parsed. This usually means the password contains an "
            "unencoded special character that broke the URL — see below.")
    if port == 5432 and "pooler" not in host:
        notes.append(
            "Port 5432 is the DIRECT connection. A web process will exhaust its "
            "connection limit; use the Transaction pooler (6543) instead.")
    if "pooler" in host and port not in (5432, 6543):
        notes.append(f"Port {port} looks wrong for a pooler host.")
    if "pooler" in host and not user.startswith("postgres."):
        notes.append(
            "Pooler hosts need the 'postgres.<project-ref>' username. Re-copy the "
            "string from the Transaction pooler tab.")

    # The password is already percent-decoded by urlsplit, so if decoding it
    # again changes nothing but it contains a raw special char, it was never
    # encoded in the first place.
    raw_pw_segment = ""
    # Greedy to the LAST '@': an unencoded '@' inside the password is exactly
    # the case we are hunting, so stopping at the first one would miss it.
    m = re.match(r"^[a-z+]+://([^:/@]+):(.*)@([^@/]+)", dsn, re.I)
    if m:
        raw_pw_segment = m.group(2)
    bad = [c for c in MUST_ENCODE if c in raw_pw_segment]
    if bad:
        shown = " ".join(repr(c) for c in bad)
        encoded = quote(unquote(raw_pw_segment), safe="")
        notes.append(
            f"Password contains unencoded character(s): {shown}. "
            f"Percent-encode it, or reset the password to a URL-safe one.")
        notes.append(f"Encoded form would be: {encoded}")

    return notes


async def main() -> int:
    print(f"env file: {ENV_PATH}")
    if not ENV_PATH.exists():
        return fail("backend/.env does not exist.",
                    "cp .env.example .env   (from the backend/ directory)")

    dsn = os.environ.get("DATABASE_URL", "")
    if not dsn:
        return fail("DATABASE_URL is not set in backend/.env.",
                    "Add the line: DATABASE_URL=postgresql://...",
                    "No quotes, no spaces around the '='.")

    problems = inspect_dsn(dsn)

    try:
        parts = urlsplit(dsn)
        host, port = parts.hostname or "?", parts.port or "?"
        print(f"host:     {host}")
        print(f"port:     {port}"
              f"{'  (transaction pooler)' if port == 6543 else ''}"
              f"{'  (direct / session)' if port == 5432 else ''}")
        print(f"user:     {parts.username or '?'}")
        print(f"password: {'set (' + str(len(parts.password or '')) + ' chars)' if parts.password else 'MISSING'}")
    except ValueError as exc:
        print(f"could not parse the URL: {exc}")

    if problems:
        print("\n⚠ problems found:")
        for p in problems:
            print(f"  → {p}")
        # A malformed URL will not connect; say so instead of surfacing a
        # misleading DNS error.
        if any("host could be parsed" in p or "not a parseable" in p
               or "unencoded" in p or "placeholder" in p for p in problems):
            return fail("Fix the problems above, then run this again.")

    print("\nconnecting…")
    try:
        from db.pg import close_pool, fetchval, init_pool
        await init_pool()
    except Exception as exc:
        msg = str(exc)
        hints: list[str] = []
        low = msg.lower()
        if "password authentication failed" in low:
            hints.append("Wrong password. Supabase → Settings → Database → "
                         "Reset database password (nothing else uses it yet).")
            hints.append("If it contains special characters, percent-encode them.")
        elif "could not translate host name" in low or "name or service not known" in low:
            hints.append("Host does not resolve. Either the URL is malformed (see above), "
                         "or this machine is IPv4-only and the transaction pooler is IPv6.")
            hints.append("Try the Session pooler tab instead — it is IPv4-friendly and "
                         "works the same for our purposes.")
        elif "timeout" in low or "timed out" in low:
            hints.append("Reachability problem — a firewall or IPv6-only route.")
            hints.append("Try the Session pooler tab.")
        elif "does not exist" in low and "database" in low:
            hints.append("The database name at the end of the URL should be 'postgres'.")
        return fail(f"connection failed: {msg}", *hints)

    try:
        n = await fetchval(
            "select count(*) from information_schema.tables where table_schema='public'")
        ver = await fetchval("select version()")
        print(f"\n✓ connected")
        print(f"  {str(ver).split(' on ')[0]}")
        print(f"  public tables: {n}")
        if int(n or 0) < 30:
            print(f"\n⚠ expected 30 tables, found {n}. The migrations may not all be applied.")
            return 1
        rows = await fetchval(
            "select coalesce(sum(c.reltuples)::bigint, 0) from pg_class c "
            "join pg_namespace n on n.oid = c.relnamespace "
            "where n.nspname = 'public' and c.relkind = 'r'")
        print(f"  approx rows:   {rows}")
        print("\nAll good — tell Claude the connection works.")
        return 0
    finally:
        await close_pool()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
