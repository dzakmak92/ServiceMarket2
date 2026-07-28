"""Async Postgres access for the Supabase-backed schema.

One pool for the process, thin helpers over asyncpg, and a transaction
context manager. Repositories build on this; routes never touch it directly.

Configuration — set in backend/.env:

    DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres

Port 6543 is Supabase's **transaction-mode** pooler (pgbouncer). It does not
support prepared statements, so asyncpg's statement cache MUST be off or you
get intermittent `prepared statement "__asyncpg_stmt_x__" does not exist`
errors under concurrency — the classic Supabase-plus-asyncpg trap. We detect
the pooler port and disable the cache automatically.

Port 5432 is the direct connection: prepared statements work, connection
count is limited. Fine for migrations and scripts, not for a web process.
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional, Sequence
from urllib.parse import urlsplit, urlunsplit

import asyncpg

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None

# Remembered so a lazy re-init uses the same sizing as the original call —
# a serverless instance wants (0, 1); a long-lived dev server wants (1, 10).
_pool_config: dict[str, int] = {"min_size": 1, "max_size": 10}
_init_lock = asyncio.Lock()

# Transaction-mode pooler ports. Session mode (5432) keeps prepared statements.
_POOLER_PORTS = {"6543"}


# Raised by Vercel's Fluid compute runtime, which instruments outbound
# connections and expects a literal address rather than a hostname. Nothing in
# asyncpg or anyio raises this on the connection path — anyio's own
# ip_address() call is wrapped in try/except ValueError — so it cannot be
# fixed in our dependencies, only worked around.
_HOSTNAME_NOT_IP = "does not appear to be an IPv4 or IPv6 address"


def _resolve_dsn_host(dsn: str) -> tuple[str, str, str]:
    """Rewrite a DSN to point at a resolved address. Returns (dsn, host, ip)."""
    parts = urlsplit(dsn)
    host = parts.hostname
    if not host:
        raise ValueError("DATABASE_URL has no host component")
    port = parts.port or 5432

    infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    # Prefer IPv4. Supabase's pooler answers on both, and an environment with
    # no IPv6 route would otherwise pick an address it cannot reach.
    infos.sort(key=lambda i: 0 if i[0] == socket.AF_INET else 1)
    ip = infos[0][4][0]

    # Carry the credentials across verbatim. urlsplit does NOT decode them, so
    # re-quoting would double-encode: a password of 'p%40ss' becomes
    # 'p%2540ss' and authentication fails. Slicing the original netloc keeps
    # whatever encoding the connection string already had.
    userinfo = ""
    if "@" in parts.netloc:
        userinfo = parts.netloc.rsplit("@", 1)[0] + "@"

    literal = f"[{ip}]" if ":" in ip else ip
    netloc = f"{userinfo}{literal}:{port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query,
                       parts.fragment)), host, ip


def _is_transaction_pooler(dsn: str) -> bool:
    tail = dsn.rsplit("@", 1)[-1]
    host_port = tail.split("/", 1)[0]
    port = host_port.rsplit(":", 1)[-1] if ":" in host_port else "5432"
    return port in _POOLER_PORTS or "pooler.supabase.com" in host_port


async def init_pool(dsn: Optional[str] = None, *, min_size: int = 1, max_size: int = 10) -> asyncpg.Pool:
    """Create the process-wide pool. Idempotent."""
    global _pool
    if _pool is not None:
        return _pool

    _pool_config.update(min_size=min_size, max_size=max_size)
    dsn = dsn or os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError(
            "DATABASE_URL is not set. Add the Supabase connection string to backend/.env."
        )

    kwargs: dict[str, Any] = {"min_size": min_size, "max_size": max_size, "command_timeout": 30}
    if _is_transaction_pooler(dsn):
        # pgbouncer in transaction mode cannot hold prepared statements.
        kwargs["statement_cache_size"] = 0
        kwargs["max_cached_statement_lifetime"] = 0

    _pool = await _open_pool(dsn, kwargs)
    logger.info("Postgres pool ready (transaction pooler: %s)", _is_transaction_pooler(dsn))
    return _pool


async def _open_pool(dsn: str, kwargs: dict[str, Any]) -> asyncpg.Pool:
    """Open a pool, falling back to a resolved address if the host is rejected.

    With min_size=0 asyncpg does not connect during create_pool, so the pool is
    proven with a real query — otherwise a broken DSN would only surface on the
    first request, past the point where we can retry.
    """
    pool_ = await asyncpg.create_pool(dsn, **kwargs)
    try:
        async with pool_.acquire() as con:
            await con.fetchval("select 1")
        return pool_
    except ValueError as exc:
        if _HOSTNAME_NOT_IP not in str(exc):
            raise
        await pool_.close()

    resolved, host, ip = _resolve_dsn_host(dsn)
    logger.warning("runtime rejected the hostname %r; retrying against %s", host, ip)
    # The certificate is issued for the hostname, which is no longer what we
    # present, so full verification cannot succeed. 'require' keeps the
    # connection encrypted without verifying the name — libpq's own semantics
    # for that mode, and what most Postgres clients default to.
    kwargs.setdefault("ssl", "require")
    pool_ = await asyncpg.create_pool(resolved, **kwargs)
    async with pool_.acquire() as con:
        await con.fetchval("select 1")
    return pool_


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Postgres pool not initialised — call init_pool() on startup.")
    return _pool


async def get_pool() -> asyncpg.Pool:
    """The pool, creating it on first use.

    Startup is the normal place to open it, but on a serverless platform
    startup can fail for reasons that later resolve — a variable added after
    the first cold start, a pooler that was briefly unreachable. Raising for
    the life of the instance in that case turns a transient fault into a
    permanent one, so every query re-attempts instead.
    """
    if _pool is not None:
        return _pool
    async with _init_lock:
        # Another coroutine may have won the race while we waited.
        if _pool is None:
            await init_pool(**_pool_config)
        return _pool


# ── Query helpers ──────────────────────────────────────────────────────
# asyncpg returns Record objects; routes and repositories want plain dicts
# so FastAPI can serialise them without a custom encoder.

async def fetch(sql: str, *args: Any) -> list[dict]:
    async with (await get_pool()).acquire() as con:
        return [dict(r) for r in await con.fetch(sql, *args)]


async def fetchrow(sql: str, *args: Any) -> Optional[dict]:
    async with (await get_pool()).acquire() as con:
        row = await con.fetchrow(sql, *args)
        return dict(row) if row else None


async def fetchval(sql: str, *args: Any) -> Any:
    async with (await get_pool()).acquire() as con:
        return await con.fetchval(sql, *args)


async def execute(sql: str, *args: Any) -> str:
    async with (await get_pool()).acquire() as con:
        return await con.execute(sql, *args)


@asynccontextmanager
async def transaction() -> AsyncIterator[asyncpg.Connection]:
    """Run several statements atomically.

    Required wherever the database's own guarantees depend on it — most
    importantly invoice issuing, where the number is only consumed if the
    row is actually written:

        async with transaction() as con:
            inv = await con.fetchrow("insert into invoices ... returning *")
            await con.executemany("insert into invoice_lines ...", rows)
    """
    async with (await get_pool()).acquire() as con:
        async with con.transaction():
            yield con


# ── Small SQL builders ─────────────────────────────────────────────────
# Just enough to keep repositories from hand-rolling placeholder strings.
# Deliberately not an ORM: the schema carries real constraints and triggers,
# and an ORM would only obscure them.

def placeholders(n: int, start: int = 1) -> str:
    """'$1, $2, $3'"""
    return ", ".join(f"${i}" for i in range(start, start + n))


def build_insert(table: str, data: dict, *, returning: str = "*") -> tuple[str, list]:
    cols = list(data.keys())
    sql = (
        f"insert into {table} ({', '.join(cols)}) "
        f"values ({placeholders(len(cols))}) returning {returning}"
    )
    return sql, list(data.values())


def build_update(table: str, data: dict, where: str, where_args: Sequence[Any],
                 *, returning: str = "*") -> tuple[str, list]:
    """`where` uses $1.. for its own args; the SET placeholders follow them."""
    cols = list(data.keys())
    offset = len(where_args) + 1
    sets = ", ".join(f"{c} = ${i}" for i, c in enumerate(cols, start=offset))
    sql = f"update {table} set {sets} where {where} returning {returning}"
    return sql, [*where_args, *data.values()]
