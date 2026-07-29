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
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional, Sequence
from urllib.parse import urlsplit

import asyncpg

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None

# Remembered so a lazy re-init uses the same sizing as the original call —
# a serverless instance wants (0, 1); a long-lived dev server wants (1, 10).
_pool_config: dict[str, int] = {"min_size": 1, "max_size": 10}
_init_lock = asyncio.Lock()

# Transaction-mode pooler ports. Session mode (5432) keeps prepared statements.
_POOLER_PORTS = {"6543"}


def _check_dsn(dsn: str) -> None:
    """Reject a DSN Python cannot parse, with an explanation.

    Square brackets in the netloc mark an IPv6 literal, so urlsplit validates
    whatever is inside them and raises

        ValueError: '<host>' does not appear to be an IPv4 or IPv6 address

    naming the *host* even when the brackets are actually around the password.
    asyncpg parses DSNs with the same parser, so the pool fails the same way.
    Supabase presents its connection string with the password shown as the
    placeholder [YOUR-PASSWORD], and the brackets have to be deleted along
    with the text — keeping them produces exactly this error, which points at
    the hostname and reads like a DNS fault.
    """
    try:
        urlsplit(dsn).hostname
    except ValueError as exc:
        raise RuntimeError(
            f"DATABASE_URL cannot be parsed ({exc}). Square brackets are only "
            f"valid around an IPv6 address. If you copied the connection "
            f"string from Supabase, delete the brackets along with the "
            f"placeholder text so it reads "
            f"...:yourpassword@host:6543/postgres — not "
            f"...:[YOUR-PASSWORD]@host:6543/postgres."
        ) from exc


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

    _check_dsn(dsn)

    kwargs: dict[str, Any] = {"min_size": min_size, "max_size": max_size, "command_timeout": 30}
    if _is_transaction_pooler(dsn):
        # pgbouncer in transaction mode cannot hold prepared statements.
        kwargs["statement_cache_size"] = 0
        kwargs["max_cached_statement_lifetime"] = 0

    _pool = await _open_pool(dsn, kwargs)
    logger.info("Postgres pool ready (transaction pooler: %s)", _is_transaction_pooler(dsn))
    return _pool


async def _open_pool(dsn: str, kwargs: dict[str, Any]) -> asyncpg.Pool:
    """Open a pool and prove it with a real query.

    With min_size=0 asyncpg does not connect during create_pool at all, so a
    bad connection string would otherwise surface on the first request rather
    than at startup where it is logged and reported by /api/health.
    """
    pool_ = await asyncpg.create_pool(dsn, **kwargs)
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
