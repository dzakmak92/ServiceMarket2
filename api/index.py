"""Vercel serverless entry point.

Vercel discovers `app` in this module and serves it as an ASGI function.
Everything under /api/* routes here; the React build is served statically.

This mounts ONLY the Postgres routes. The MongoDB-backed modules are
deliberately excluded — there is no MongoDB on Vercel, so importing them
would fail at cold start. They stay in the repo until each is ported.

Everything lives in this one file on purpose. A second module beside it in
api/ — even underscore-prefixed, which Vercel's own convention says is not an
endpoint — made the platform stop matching the `functions` pattern in
vercel.json and reject the deployment before building. One file in api/ is the
arrangement Vercel accepts.

The application is built inside `_build_app()` so the call can be guarded. If
anything in it raises, `app` falls back to a bare ASGI callable written with
the standard library alone, which answers with the failing exception. Without
that, an import error means Vercel never receives an `app` object at all and
every request returns INTERNAL_FUNCTION_INVOCATION_FAILED with no module name
and no traceback — a failure that erases its own explanation.
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _scrub(text: str) -> str:
    """Strip credentials out of anything derived from the connection string.

    Diagnostics get returned over HTTP, and a DSN carries the database
    password. Never let one reach a response body or a log line.
    """
    return re.sub(r"://[^@\s/]+@", "://***@", text)


def _build_app():
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(title="ServiceMarket API", version="2.0.0", docs_url="/api/docs",
                  openapi_url="/api/openapi.json")

    # In production the API is same-origin with the SPA, so CORS only matters
    # for local development against a separately-served frontend.
    origins = [o for o in (
        os.environ.get("FRONTEND_URL"),
        "http://localhost:3000", "http://localhost:3001",
    ) if o]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])

    # Route imports are guarded separately from the app itself: a broken route
    # module should still leave /api/health able to say which one it was.
    import_error: str | None = None
    try:
        from routes._pro import require_pro_id  # noqa: F401
        from routes.auth_routes import router as auth_router
        from routes.customer_routes import router as customer_router
        from routes.estimate_routes import router as estimate_router
        from routes.invoice_routes import router as invoice_router
        from routes.job_routes import router as job_router
        from routes.privacy_pg_routes import (me_router as privacy_me_router,
                                              router as privacy_router)
        from routes.profile_routes import router as profile_router
        from routes.recurring_routes import router as recurring_router
        from routes.template_routes import router as template_router
        from routes.pm_pg_routes import (portal_router as pm_portal_router,
                                         router as pm_router,
                                         timer_router as pm_timer_router)
        from routes.pm_template_routes import (job_router as pm_sub_router,
                                               public_router as pm_sub_portal,
                                               router as pm_tpl_router)
        from routes.quote_routes import (invoice_router as quote_invoice_router,
                                         public_router as portal_router,
                                         router as quote_router)
        from routes.tax_pg_routes import (public_router as tax_public_router,
                                          router as tax_router)
        from routes.upload_routes import (portal_router as upload_portal_router,
                                          router as upload_router)
        from routes.weather_routes import router as weather_router

        for r in (auth_router, customer_router, job_router, quote_router,
                  profile_router, recurring_router, template_router,
                  estimate_router, privacy_router, privacy_me_router,
                  quote_invoice_router, invoice_router, tax_router,
                  pm_router, pm_timer_router, pm_tpl_router,
                  pm_sub_router, upload_router, weather_router,
                  portal_router, pm_portal_router, pm_sub_portal,
                  tax_public_router,
                  upload_portal_router):
            app.include_router(r, prefix="/api")
    except Exception as exc:  # noqa: BLE001 — must not propagate
        import_error = f"{type(exc).__name__}: {exc}"
        logger.error("route import failed — API routes are NOT mounted\n%s",
                     traceback.format_exc())

    @app.on_event("startup")
    async def startup() -> None:
        """Serverless startup: open a small pool and nothing else.

        No index creation, no seeding, no background tasks — this runs on
        every cold start, and a serverless function is killed as soon as the
        response is sent, so a background asyncio task would never finish.
        Scheduled work belongs in Vercel Cron or pg_cron.

        A failure here is logged, never raised. Raising in a startup handler
        aborts ASGI lifespan, which takes down every route — including
        /api/health, the one endpoint whose purpose is to report that the
        database is misconfigured. The pool opens lazily on first query
        instead, so the app boots without a database and says so.
        """
        try:
            # Imported inside the guard: if backend/ is missing from the
            # bundle this raises ModuleNotFoundError, and an unguarded import
            # would abort lifespan as surely as a failed connection.
            from db.pg import init_pool
            # One connection per instance. Vercel may run many instances
            # concurrently, and each holding ten would exhaust the pooler.
            await init_pool(min_size=0, max_size=1)
        except Exception as exc:  # noqa: BLE001 — must not propagate
            logger.error("startup: Postgres pool unavailable: %s", _scrub(str(exc)))

    @app.on_event("shutdown")
    async def shutdown() -> None:
        try:
            from db.pg import close_pool
            await close_pool()
        except Exception as exc:  # noqa: BLE001 — teardown must not 500
            logger.warning("shutdown: %s", _scrub(str(exc)))

    @app.get("/api/health")
    async def health():
        detail = None
        try:
            from db.pg import fetchval
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
            "routes_mounted": len(app.routes),
            "version": "2.0.0",
            "region": os.environ.get("VERCEL_REGION"),
        }
        if detail:
            body["detail"] = detail
            # Show what the connection string actually contains when it fails.
            # Supabase's pooler reports the underlying role in its error
            # regardless of the tenant sent, so "user postgres" alone cannot
            # distinguish a missing project ref from a wrong password. Never
            # includes the password itself.
            dsn = os.environ.get("DATABASE_URL")
            if dsn:
                from urllib.parse import urlsplit
                try:
                    u = urlsplit(dsn)
                    pw = u.password or ""
                    body["dsn"] = {
                        "user": u.username,
                        "host": u.hostname,
                        "port": u.port,
                        "database": (u.path or "").lstrip("/"),
                        "password_present": bool(pw),
                        "password_is_placeholder":
                            pw.lower().replace("-", "") in ("yourpassword", "password"),
                        "password_needs_encoding":
                            any(c in pw for c in "@:/?#[]"),
                    }
                except Exception as exc:  # noqa: BLE001 — reporting only
                    body["dsn"] = {"parse_error": f"{type(exc).__name__}: {exc}"[:160]}
        if import_error:
            body["status"] = "degraded"
            body["import_error"] = _scrub(import_error)
        return body

    @app.post("/api/webhook/stripe")
    async def stripe_webhook(request: Request):
        """Placeholder until the Stripe SDK replaces emergentintegrations.

        Returns 200 so Stripe does not retry indefinitely against an endpoint
        that cannot yet verify signatures, and logs loudly so the gap stays
        visible.
        """
        logger.warning("Stripe webhook received but the handler is not yet wired "
                       "to the real SDK — event ignored.")
        return {"status": "not_configured"}

    return app


def _build_fallback(exc: BaseException):
    """A bare ASGI app that reports why the real one could not be built.

    Standard library only, by design — it has to work in the case where
    fastapi itself is what failed to import.
    """
    body = json.dumps({
        "status": "boot_failed",
        "error": f"{type(exc).__name__}: {exc}",
        "python": sys.version.split()[0],
        "bundle": sorted(p.name for p in Path(__file__).resolve().parent.parent.iterdir()),
        "hint": "The function started but the application failed to build. A "
                "ModuleNotFoundError for a third-party package means pip did not "
                "install api/requirements.txt; one for 'routes' or 'db' means "
                "backend/ is missing from the function bundle.",
    }, indent=2).encode()

    async def fallback(scope, receive, send):
        if scope.get("type") == "lifespan":
            # Answer the protocol properly; an unanswered lifespan message
            # leaves some servers waiting rather than serving.
            while True:
                message = await receive()
                if message["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif message["type"] == "lifespan.shutdown":
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        if scope.get("type") != "http":
            return
        await send({
            "type": "http.response.start",
            "status": 500,
            "headers": [(b"content-type", b"application/json"),
                        (b"cache-control", b"no-store")],
        })
        await send({"type": "http.response.body", "body": body})

    return fallback


try:
    _resolved = _build_app()
except Exception as _exc:  # noqa: BLE001 — must never propagate
    logger.error("FATAL: the application could not be built\n%s", traceback.format_exc())
    _resolved = _build_fallback(_exc)

# Bound at module level, unindented, unconditionally. Vercel's Python builder
# scans the file for a top-level `app` (or `handler`) symbol to decide it is a
# Serverless Function at all. Assigning it inside the try above hid it from
# that scan, and the deployment was rejected before building with "The pattern
# api/index.py defined in `functions` doesn't match any Serverless Functions
# inside the `api` directory" — an error about discovery, not about the code.
app = _resolved
