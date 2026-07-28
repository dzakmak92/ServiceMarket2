"""Vercel entry point — a guarded wrapper around the real application.

The application itself lives in `_app.py`. This module exists only to import
it in a way that cannot fail silently.

Why the indirection: an ImportError at the top of the entry point means Vercel
never receives an `app` object, so there is nothing to answer a request. The
platform returns a bare INTERNAL_FUNCTION_INVOCATION_FAILED with no module
name, no traceback, nothing actionable — the failure erases its own
explanation. That is unfixable from the outside, and it does not matter
whether the missing piece is a dependency, a file left out of the bundle, or
a syntax error.

So the import is guarded, and the fallback is written against the raw ASGI
protocol using nothing but the standard library. It holds even when fastapi
itself is missing, which is the one case a FastAPI-based error handler cannot
cover. Any request then returns JSON naming the exception instead of a blank
500.

Files beginning with an underscore are not treated as functions by Vercel, so
`_app.py` is bundled as an ordinary module rather than deployed separately.
"""
from __future__ import annotations

import json
import logging
import sys
import traceback
from pathlib import Path

# `_app` sits next to this file; the bundle root is not necessarily on the path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    from _app import app  # noqa: F401  — this is what Vercel serves
except Exception as exc:  # noqa: BLE001 — must never propagate
    _trace = traceback.format_exc()
    logger.error("FATAL: the application could not be imported\n%s", _trace)

    _body = json.dumps({
        "status": "boot_failed",
        "error": f"{type(exc).__name__}: {exc}",
        "python": sys.version.split()[0],
        "sys_path": [p for p in sys.path if p],
        "bundle": sorted(p.name for p in Path(__file__).resolve().parent.parent.iterdir()),
        "hint": "The function started but the application failed to import. "
                "A ModuleNotFoundError for a third-party package means pip did "
                "not install api/requirements.txt; one for 'routes' or 'db' "
                "means backend/ is missing from the function bundle.",
    }, indent=2).encode()

    async def app(scope, receive, send):  # type: ignore[misc]
        """Minimal ASGI application. Standard library only, by design."""
        if scope.get("type") == "lifespan":
            # Answer the protocol properly; an unanswered lifespan message
            # leaves some servers waiting forever instead of serving.
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
        await send({"type": "http.response.body", "body": _body})
