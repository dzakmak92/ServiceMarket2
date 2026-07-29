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
        from routes.invoice_routes import router as invoice_router
        from routes.job_routes import router as job_router
        from routes.pm_pg_routes import (portal_router as pm_portal_router,
                                         router as pm_router,
                                         timer_router as pm_timer_router)
        from routes.quote_routes import (invoice_router as quote_invoice_router,
                                         public_router as portal_router,
                                         router as quote_router)
        from routes.tax_pg_routes import router as tax_router
        from routes.upload_routes import (portal_router as upload_portal_router,
                                          router as upload_router)

        for r in (auth_router, customer_router, job_router, quote_router,
                  quote_invoice_router, invoice_router, tax_router,
                  pm_router, pm_timer_router, upload_router,
                  portal_router, pm_portal_router, upload_portal_router):
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
        if import_error:
            body["status"] = "degraded"
            body["import_error"] = _scrub(import_error)
        return body

    @app.get("/api/diag/net")
    async def diag_net():
        """Temporary. Establishes what this runtime can actually reach.

        getaddrinfo is raising a ValueError the standard library never raises,
        so it has been replaced. Whether DNS is broken for everything or only
        for the database path decides whether an HTTPS-based data API is a way
        out or a dead end, and that is not worth guessing at one deploy per
        attempt. Returns no secrets — hostnames and error strings only.
        """
        out: dict = {}

        def record(key, fn, *a):
            """Run anything and store either its value or its failure.

            Every field is individually guarded, including repr() and
            attribute access: whatever replaced getaddrinfo is an unknown
            object, and asking it to describe itself can raise just as easily
            as calling it. A diagnostic that can 500 tells us nothing.
            """
            try:
                out[key] = {"ok": True, "result": str(fn(*a))[:200]}
            except BaseException as exc:  # noqa: BLE001 — reporting, not handling
                out[key] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"[:250]}

        try:
            import socket as s

            # If these are not the stdlib functions, the module they come from
            # names whatever is patching them.
            record("getaddrinfo_repr", lambda: repr(s.getaddrinfo))
            record("getaddrinfo_module", lambda: getattr(s.getaddrinfo, "__module__", "?"))
            record("gethostbyname_repr", lambda: repr(s.gethostbyname))
            record("socket_module_file", lambda: getattr(s, "__file__", "?"))
            record("probe_public_host", lambda: s.getaddrinfo("example.com", 443))
            record("probe_ip_literal", lambda: s.getaddrinfo("93.184.216.34", 443))
            record("probe_create_connection",
                   lambda: s.create_connection(("93.184.216.34", 443), timeout=5).close())

            dsn = os.environ.get("DATABASE_URL")
            if dsn:
                from urllib.parse import urlsplit
                host = urlsplit(dsn).hostname
                out["db_host"] = host
                record("probe_db_getaddrinfo", lambda: s.getaddrinfo(host, 6543))
                record("probe_db_gethostbyname", lambda: s.gethostbyname(host))

            # Does outbound HTTPS work at all? If it does, Supabase's REST API
            # is a viable route to the same data without raw TCP.
            url = os.environ.get("SUPABASE_URL") or "https://supabase.com"
            out["https_url"] = url
            try:
                import httpx
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.get(url)
                out["probe_https"] = {"ok": True, "status": resp.status_code}
            except BaseException as exc:  # noqa: BLE001 — reporting, not handling
                out["probe_https"] = {"ok": False,
                                      "error": f"{type(exc).__name__}: {exc}"[:250]}
        except BaseException as exc:  # noqa: BLE001 — return what we collected
            out["diagnostic_error"] = f"{type(exc).__name__}: {exc}"[:250]

        return out

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
