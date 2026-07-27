"""Cloudflare Turnstile verification helper.

A single async httpx call to https://challenges.cloudflare.com/turnstile/v0/siteverify
returns whether a given client token is valid.  No SDK — just one POST.

Verification is idempotent: re-used / expired tokens return success=False with
error code `timeout-or-duplicate`, which the route handler treats like any
other failure (no user is created).
"""
import logging
import os
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TIMEOUT_S = 5.0

# Cloudflare's well-known TEST keys — always pass.  When TURNSTILE_SECRET_KEY env
# var is set to this value the verification step is a no-op (used in CI / preview).
TEST_SECRET_KEYS = {"1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA"}


async def verify_turnstile_token(token: str, remote_ip: Optional[str] = None) -> bool:
    """Verify a Turnstile token against Cloudflare.

    Returns True on success, False on every failure (network, invalid token,
    duplicate, missing secret, etc).  Errors are logged for diagnostics but
    never surface details to the user.
    """
    secret = os.environ.get("TURNSTILE_SECRET_KEY", "")
    if not secret:
        logger.warning("TURNSTILE_SECRET_KEY not set — refusing verification")
        return False

    if not token:
        return False

    payload = {"secret": secret, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            resp = await client.post(VERIFY_URL, data=payload)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.exception("Turnstile network failure")
        return False

    ok = bool(data.get("success"))
    if not ok:
        logger.info("Turnstile verification failed: codes=%s", data.get("error-codes"))
    return ok
