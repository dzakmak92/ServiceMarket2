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

import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional, Sequence

import asyncpg

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None

# Transaction-mode pooler ports. Session mode (5432) keeps prepared statements.
_POOLER_PORTS = {"6543"}


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

    _pool = await asyncpg.create_pool(dsn, **kwargs)
    logger.info("Postgres pool ready (transaction pooler: %s)", _is_transaction_pooler(dsn))
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Postgres pool not initialised — call init_pool() on startup.")
    return _pool


# ── Query helpers ──────────────────────────────────────────────────────
# asyncpg returns Record objects; routes and repositories want plain dicts
# so FastAPI can serialise them without a custom encoder.

async def fetch(sql: str, *args: Any) -> list[dict]:
    async with pool().acquire() as con:
        return [dict(r) for r in await con.fetch(sql, *args)]


async def fetchrow(sql: str, *args: Any) -> Optional[dict]:
    async with pool().acquire() as con:
        row = await con.fetchrow(sql, *args)
        return dict(row) if row else None


async def fetchval(sql: str, *args: Any) -> Any:
    async with pool().acquire() as con:
        return await con.fetchval(sql, *args)


async def execute(sql: str, *args: Any) -> str:
    async with pool().acquire() as con:
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
    async with pool().acquire() as con:
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
