"""Data-subject rights (Postgres).

Art. 15 gives one month to answer an access request and Art. 17 the same for
erasure. Both buttons in the UI 404'd, which means the clock would have been
running the first time anyone pressed one and nothing would have happened.

The endpoints are ordinary. What is not ordinary is that erasure here has to
refuse part of its own request: invoices carry a seven-to-ten year retention
obligation that Art. 17(3)(b) explicitly exempts, so "delete everything" is
not a thing this application may do. It deletes what it can, keeps what it
must, and tells the user which is which — see `repositories/privacy.py`.
"""
from __future__ import annotations

import io
import hmac
import ipaddress
import json
import logging
import zipfile
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from repositories import privacy as repo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/privacy", tags=["privacy"])
me_router = APIRouter(prefix="/me", tags=["privacy"])


def _ip(request: Request) -> Optional[str]:
    """The address, once, from the proxy header Vercel sets.

    Taken for the consent trail only. Art. 7(1) wants the circumstances of
    consent demonstrable, and an address with no timestamp beside it would
    prove nothing while still being personal data.

    Validated before it is returned, because the three columns it feeds are
    `inet` and asyncpg raises DataError on anything that is not an address —
    which would lose the consent record itself. The header is client-supplied
    data on the way in, so `X-Forwarded-For: nonsense` is enough to make the
    insert fail; dropping an unparseable address costs a line of provenance,
    while the alternative costs the evidence the article asks for.
    """
    fwd = request.headers.get("x-forwarded-for", "")
    first = fwd.split(",")[0].strip() if fwd else ""
    candidate = first or (request.client.host if request.client else None)
    if not candidate:
        return None
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


class ConsentIn(BaseModel):
    # Not settable. Necessary cookies are not consented to, they are
    # necessary — offering a toggle would misrepresent the legal basis.
    cookies_analytics: bool = False
    cookies_marketing: bool = False
    marketing_emails: bool = False
    policy_version: Optional[str] = None


class MarketingIn(BaseModel):
    marketing_emails: bool


class DataRightsIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    request_type: str = Field(
        pattern="^(access|rectification|erasure|restriction|portability|object|withdraw_consent)$")
    details: Optional[str] = Field(default=None, max_length=2000)


class RemovalIn(BaseModel):
    email: EmailStr
    business_name: Optional[str] = Field(default=None, max_length=200)
    listing_id: Optional[str] = None
    reason: Optional[str] = Field(default=None, max_length=1000)


# ── Public: anyone may exercise a right, account or not ────────────────
@router.post("/data-rights-request", status_code=201)
async def data_rights_request(body: DataRightsIn, request: Request):
    """Register an Art. 12-22 request against its statutory deadline.

    Open to anyone: a data subject need not have an account to have rights,
    and most people asking about a directory listing do not have one. The
    response returns the deadline, so the person asking knows when to chase.
    """
    row = await repo.log_request(
        kind="data_rights", request_type=body.request_type,
        name=body.name.strip(), email=str(body.email).lower(),
        details=(body.details or "").strip() or None,
        ip=_ip(request), user_agent=request.headers.get("user-agent", "")[:400])
    return {"id": str(row["id"]), "due_at": row["due_at"],
            "note": "Wir antworten innerhalb eines Monats (DSGVO Art. 12 Abs. 3)."}


@router.post("/removal-request", status_code=201)
async def removal_request(body: RemovalIn, request: Request):
    """Objection to a directory listing under Art. 21."""
    if not (body.listing_id or (body.business_name or "").strip()):
        raise HTTPException(400, "listing_id oder business_name erforderlich")
    row = await repo.log_request(
        kind="removal", email=str(body.email).lower(),
        business_name=(body.business_name or "").strip() or None,
        details=(body.reason or "").strip() or None,
        ip=_ip(request), user_agent=request.headers.get("user-agent", "")[:400])
    return {"id": str(row["id"]), "due_at": row["due_at"]}


# ── The account holder's own rights ────────────────────────────────────
@me_router.get("/consent")
async def get_consent(user: dict = Depends(get_current_user)):
    latest = await repo.latest_consent(user["id"])
    return {
        "consent": dict(latest) if latest else None,
        "current_policy_version": repo.CURRENT_POLICY_VERSION,
        # True when the text has changed since they last agreed, which is the
        # only honest trigger for asking again.
        "needs_reconsent": bool(
            not latest or latest["policy_version"] != repo.CURRENT_POLICY_VERSION),
    }


@me_router.post("/consent", status_code=201)
async def post_consent(body: ConsentIn, request: Request,
                       user: dict = Depends(get_current_user)):
    row = await repo.record_consent(
        user["id"], cookies_analytics=body.cookies_analytics,
        cookies_marketing=body.cookies_marketing,
        marketing_emails=body.marketing_emails,
        policy_version=body.policy_version, ip=_ip(request),
        user_agent=request.headers.get("user-agent", ""))
    return {"recorded_at": row["recorded_at"],
            "policy_version": row["policy_version"]}


@me_router.get("/consent/history")
async def get_consent_history(user: dict = Depends(get_current_user)):
    """The whole trail. Art. 7(1) asks a controller to demonstrate consent;
    showing the user the same record is the cheapest way to be honest about
    what is held."""
    return {"records": [dict(r) for r in await repo.consent_history(user["id"])]}


@me_router.put("/marketing-prefs")
async def marketing_prefs(body: MarketingIn, request: Request,
                          user: dict = Depends(get_current_user)):
    """Withdrawal must be as easy as giving it (Art. 7(3)), which is why this
    is one boolean and not a preference centre."""
    await repo.record_consent(
        user["id"], kind="marketing_change",
        marketing_emails=body.marketing_emails, ip=_ip(request),
        user_agent=request.headers.get("user-agent", ""))
    return {"marketing_emails": body.marketing_emails}


@me_router.get("/export")
async def export_my_data(user: dict = Depends(get_current_user)):
    """Everything held about this account, as a ZIP of JSON.

    Zipped rather than served raw because the payload runs to megabytes on a
    working business, and a browser asked to render that inline will hang
    rather than download.
    """
    payload = await repo.export(user)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("daten.json",
                   json.dumps(payload, default=str, indent=2, ensure_ascii=False))
        z.writestr("LIESMICH.txt", _readme(payload))
    return Response(
        content=buf.getvalue(), media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="meine-daten.zip"'})


def _readme(payload: dict) -> str:
    counts = "\n".join(
        f"  {k}: {len(v) if isinstance(v, list) else 1}"
        for k, v in sorted(payload["data"].items()) if v)
    return (
        "Ihre Daten\n"
        "==========\n\n"
        f"Erstellt: {payload['exported_at']}\n"
        f"Für: {payload['exported_for']}\n"
        f"Rechtsgrundlage: {payload['legal_basis']}\n\n"
        "Die Datei daten.json enthält alle personenbezogenen Daten, die zu "
        "Ihrem Konto gespeichert sind, im JSON-Format.\n\n"
        f"{payload['note']}\n\n"
        "Enthaltene Bereiche:\n" + counts + "\n\n"
        "Nicht enthalten sind Passwörter (nur als nicht umkehrbarer Hash "
        "gespeichert) sowie Zugangs-Token, deren Weitergabe ein "
        "Sicherheitsrisiko wäre.\n\n"
        "Hochgeladene Dateien sind hier als Verzeichnis aufgeführt, aber nicht "
        "beigelegt; sie können in der App einzeln heruntergeladen werden.\n")


@me_router.get("/deletion")
async def deletion_preview(user: dict = Depends(get_current_user)):
    """What deleting the account would do — before it is done.

    Shown first because part of the answer is "not everything". A user who
    presses delete and is later told their invoices were kept has been
    surprised by a retention they should have been told about up front.
    """
    status = await repo.deletion_status(user["id"])
    return {"scheduled": status, "plan": await repo.plan_deletion(user["id"])}


@me_router.delete("")
async def request_deletion(request: Request, user: dict = Depends(get_current_user)):
    """Right to erasure, executed after a grace period.

    The account stays usable until the period expires, which is not an
    oversight: `auth.load_user` filters on `deleted_at`, so marking the row
    deleted now would log the user out of the account they may want to keep
    with no way back in to say so. A grace period exists to be undone.
    """
    return await repo.request_deletion(user["id"], ip=_ip(request))


@me_router.post("/cancel-deletion")
async def cancel_deletion(user: dict = Depends(get_current_user)):
    if not await repo.cancel_deletion(user["id"]):
        raise HTTPException(409, "Es liegt keine widerrufbare Löschung vor.")
    return {"cancelled": True}


# ── The job that carries it out ────────────────────────────────────────
@me_router.api_route("/purge-due", methods=["GET", "POST"])
async def purge_due(request: Request):
    """Delete every account whose grace period has expired.

    Called on a schedule, not by a person, so it authenticates with a shared
    secret rather than a session. Without PURGE_SECRET set it refuses: an
    endpoint that erases accounts must fail closed, and a misconfigured
    deployment that silently allowed anyone to call it would be the worst
    possible bug in this file.

    GET as well as POST, and `Authorization: Bearer` as well as the custom
    header, because Vercel Cron only issues GET and only sends a bearer
    token — so as a POST-with-custom-header this could not be scheduled at
    all, which is why nothing was calling it. Art. 17 erasure that is
    implemented, tested, and never triggered is not erasure: the grace period
    expired and the account sat there.
    """
    import os
    secret = os.environ.get("PURGE_SECRET")
    if not secret:
        raise HTTPException(503, "PURGE_SECRET is not configured.")
    supplied = (request.headers.get("x-purge-secret")
                or (request.headers.get("authorization") or "").removeprefix("Bearer ").strip())
    # compare_digest: this is a bare shared secret on an endpoint that deletes
    # accounts, and `==` on a str leaks its length and prefix through timing.
    if not secret or not hmac.compare_digest(supplied or "", secret):
        raise HTTPException(403, "Forbidden")
    return await repo.purge_due()
