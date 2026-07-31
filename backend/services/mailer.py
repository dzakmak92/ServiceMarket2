"""Sending email, when there is somewhere to send it.

This deployment has no email rail at all — no provider, no SMTP credentials,
no dependency. That is a real gap and it blocks password reset, which is why
this module exists rather than the reset flow simply not being built: the
machinery around the email is the part with the security decisions in it, and
it can be finished and tested now. Delivery is one environment variable away.

Two backends, tried in order, and neither adds a dependency:

  · **Resend** — set `RESEND_API_KEY`. Called over `httpx`, which the project
    already ships.
  · **SMTP** — set `SMTP_HOST` (plus `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
    `SMTP_STARTTLS`). `smtplib` is standard library.

With neither configured `send` returns False and logs the fact. It does not
raise: a caller that fails loudly on a missing mailer turns "we could not
email you" into a 500, and the endpoint above this one deliberately answers
identically whether or not the address exists.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def _sender() -> str:
    return os.environ.get("MAIL_FROM") or "no-reply@servicemarket.at"


def configured() -> bool:
    """Whether anything would actually be delivered."""
    return bool(os.environ.get("RESEND_API_KEY") or os.environ.get("SMTP_HOST"))


async def send(*, to: str, subject: str, text: str) -> bool:
    """Best-effort delivery. Returns whether it went out.

    Plain text only. A password-reset mail is one sentence and a link; HTML
    would add a rendering surface and a spam signal for no benefit.
    """
    if os.environ.get("RESEND_API_KEY"):
        return await _send_resend(to=to, subject=subject, text=text)
    if os.environ.get("SMTP_HOST"):
        return _send_smtp(to=to, subject=subject, text=text)

    # Deliberately loud. Without this line an operator has no way to complete
    # a reset for a locked-out user, and no way to notice that the mailer is
    # unconfigured in the first place.
    logger.warning(
        "No mailer configured (set RESEND_API_KEY or SMTP_HOST). "
        "Message NOT sent to %s — subject %r.", to, subject)
    return False


async def _send_resend(*, to: str, subject: str, text: str) -> bool:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                json={"from": _sender(), "to": [to], "subject": subject, "text": text},
            )
        if r.status_code >= 400:
            logger.error("Resend refused the message (%s): %s", r.status_code, r.text[:300])
            return False
        return True
    except Exception as exc:  # noqa: BLE001 — delivery must never 500 the caller
        logger.error("Resend request failed: %s", exc)
        return False


def _send_smtp(*, to: str, subject: str, text: str) -> bool:
    msg = EmailMessage()
    msg["From"] = _sender()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    try:
        host = os.environ["SMTP_HOST"]
        port = int(os.environ.get("SMTP_PORT") or 587)
        with smtplib.SMTP(host, port, timeout=10) as s:
            if (os.environ.get("SMTP_STARTTLS") or "1") not in ("0", "false", "no"):
                s.starttls()
            user, password = os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASS")
            if user and password:
                s.login(user, password)
            s.send_message(msg)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("SMTP delivery failed: %s", exc)
        return False
