"""Vercel serverless entry point.

Vercel discovers `app` in this module and serves it as an ASGI function.
Everything under /api/* routes here; the React build is served statically.

This mounts ONLY the Postgres routes. The MongoDB-backed modules are
deliberately excluded — there is no MongoDB on Vercel, so importing them
would fail at cold start. They stay in the repo until each is ported.
"""
from __future__ import annotations

import logging
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ServiceMarket API", version="2.0.0", docs_url="/api/docs",
              openapi_url="/api/openapi.json")

# In production the API is same-origin with the SPA, so CORS only matters for
# local development against a separately-served frontend.
_origins = [o for o in (
    os.environ.get("FRONTEND_URL"),
    "http://localhost:3000", "http://localhost:3001",
) if o]
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

from routes._pro import require_pro_id  # noqa: E402,F401
from routes.auth_routes import router as auth_router  # noqa: E402
from routes.customer_routes import router as customer_router  # noqa: E402
from routes.invoice_routes import router as invoice_router  # noqa: E402
from routes.job_routes import router as job_router  # noqa: E402
from routes.pm_pg_routes import (portal_router as pm_portal_router,  # noqa: E402
                                 router as pm_router, timer_router as pm_timer_router)
from routes.quote_routes import (invoice_router as quote_invoice_router,  # noqa: E402
                                 public_router as portal_router, router as quote_router)
from routes.tax_pg_routes import router as tax_router  # noqa: E402
from routes.upload_routes import (portal_router as upload_portal_router,  # noqa: E402
                                  router as upload_router)

for r in (auth_router, customer_router, job_router, quote_router,
          quote_invoice_router, invoice_router, tax_router,
          pm_router, pm_timer_router, upload_router,
          portal_router, pm_portal_router, upload_portal_router):
    app.include_router(r, prefix="/api")


def _scrub(text: str) -> str:
    """Strip credentials out of anything derived from the connection string.

    Diagnostics get returned over HTTP, and a DSN carries the database
    password. Never let one reach a response body or a log line.
    """
    return re.sub(r"://[^@\s/]+@", "://***@", text)


@app.on_event("startup")
async def startup() -> None:
    """Serverless startup: open a small pool and nothing else.

    No index creation, no seeding, no background tasks — this runs on every
    cold start, and a serverless function is killed as soon as the response
    is sent, so a background asyncio task would simply never finish.
    Scheduled work belongs in Vercel Cron or pg_cron.

    A failure here is logged, never raised. Raising in a startup handler
    aborts ASGI lifespan, which takes down every route — including /api/health,
    the one endpoint whose purpose is to report that the database is
    misconfigured. The pool is opened lazily on first query instead, so the
    app boots without a database and says so.
    """
    from db.pg import init_pool
    try:
        # One connection per instance. Vercel may run many instances
        # concurrently, and each holding ten would exhaust the pooler.
        await init_pool(min_size=0, max_size=1)
    except Exception as exc:  # noqa: BLE001 — must not propagate
        logger.error("startup: Postgres pool unavailable: %s", _scrub(str(exc)))


@app.on_event("shutdown")
async def shutdown() -> None:
    from db.pg import close_pool
    await close_pool()


@app.get("/api/health")
async def health():
    from db.pg import fetchval
    detail = None
    try:
        await fetchval("select 1")
        db_ok = True
    except Exception as exc:
        db_ok = False
        detail = _scrub(f"{type(exc).__name__}: {exc}")
        logger.error("health: database unreachable: %s", detail)
    body = {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "unavailable",
        "database_url_set": bool(os.environ.get("DATABASE_URL")),
        "version": "2.0.0",
        "region": os.environ.get("VERCEL_REGION"),
    }
    if detail:
        body["detail"] = detail
    return body


@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request):
    """Placeholder until the Stripe SDK replaces emergentintegrations.

    Returns 200 so Stripe does not retry indefinitely against an endpoint
    that cannot yet verify signatures, and logs loudly so the gap is visible.
    """
    logger.warning("Stripe webhook received but the handler is not yet wired "
                   "to the real SDK — event ignored.")
    return {"status": "not_configured"}
