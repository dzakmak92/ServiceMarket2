"""Quote endpoints (Postgres) + the public customer portal.

`router` is pro-authenticated. `public_router` is token-scoped and needs no
account: the customer never logs in, so the share token is their credential.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user
from db import pg
from repositories import quotes as repo
from routes._pro import require_pro_id

router = APIRouter(prefix="/quotes", tags=["quotes"])
public_router = APIRouter(prefix="/portal", tags=["customer-portal"])


class QuoteLineIn(BaseModel):
    position: Optional[int] = None
    kind: str = Field(default="labor", pattern="^(labor|material|travel|other)$")
    description: str = Field(min_length=1, max_length=300)
    detail: Optional[str] = None
    # Bounded. Both were unconstrained floats, so a quantity of -5 produced a
    # quote totalling -468.00 which the list rendered and the Send button was
    # happy to mail to a customer. The upper bound is the numeric(12,2)
    # column: 999999999 x 100 overflowed it and surfaced as a bare 500 with
    # an English message inside a German UI.
    qty: float = Field(default=1, ge=0, le=1_000_000)
    unit: str = "pcs"
    unit_price: float = Field(default=0, ge=0, le=10_000_000)
    # Verschnitt. Pattern-aware for tiling — diagonal and herringbone waste
    # far more than straight, and a flat guess loses money on tile one.
    waste_factor: float = Field(default=0, ge=0, le=1)
    discount_pct: float = Field(default=0, ge=0, le=100)
    # Constrained to the Postgres enum. As a free string a typo — or any of
    # the treatments the resolver refuses to honour — was accepted and then
    # silently billed at the standard rate.
    tax_treatment: Optional[str] = Field(
        default=None,
        pattern="^(standard|reduced|reduced_alt|zero|kleinunternehmer"
                "|reverse_charge_13b|intra_eu|export)$")
    vat_rate: Optional[float] = Field(default=None, ge=0, le=100)
    is_optional: bool = False
    is_selected: bool = True
    # The join back to pro_rates, and the only reason acceptance can learn what
    # this business actually charges. The repository has always stored it and
    # the estimator has always produced one per position, but this model did
    # not declare it — so Pydantic dropped it on every request that came
    # through a route. Creation survived only because the estimator writes to
    # the repository directly; the moment a quote was edited or revised, the
    # key was gone and accepting it taught nothing.
    rate_key: Optional[str] = Field(default=None, max_length=120)


class QuoteIn(BaseModel):
    job_id: str
    tier: str = Field(default="standard", pattern="^(basic|standard|premium)$")
    title: Optional[str] = None
    intro: Optional[str] = None
    # Auto-inserted protective caveats, so an optimistic estimate does not
    # become a fixed-price trap when the substrate turns out to be rotten.
    assumptions: Optional[str] = None
    valid_until: Optional[date] = None
    discount_pct: float = Field(default=0, ge=0, le=100)
    lines: list[QuoteLineIn] = []


class TieredQuoteIn(BaseModel):
    job_id: str
    title: Optional[str] = None
    intro: Optional[str] = None
    assumptions: Optional[str] = None
    valid_until: Optional[date] = None
    basic: Optional[list[QuoteLineIn]] = None
    standard: Optional[list[QuoteLineIn]] = None
    premium: Optional[list[QuoteLineIn]] = None


class LinesIn(BaseModel):
    lines: list[QuoteLineIn]


class RejectIn(BaseModel):
    reason: str = ""


class AcceptIn(BaseModel):
    """Verbal on-site acceptance still needs a name against it."""
    accepted_by: Optional[str] = None


def _lines(items) -> list[dict]:
    return [i.model_dump(exclude_none=True) for i in (items or [])]


@router.get("")
async def list_quotes(job_id: Optional[str] = None, status: Optional[str] = None,
                      limit: int = Query(default=50, le=200), offset: int = 0,
                      user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    return await repo.list_for_pro(pro_id, job_id=job_id, status=status,
                                   limit=limit, offset=offset)


@router.post("", status_code=201)
async def create_quote(body: QuoteIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    data = body.model_dump(exclude={"lines", "job_id", "tier"}, exclude_none=True)
    try:
        return await repo.create(pro_id, body.job_id, lines=_lines(body.lines),
                                 tier=body.tier, **data)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/tiered", status_code=201)
async def create_tiered(body: TieredQuoteIn, user: dict = Depends(get_current_user)):
    """Basic / Standard / Premium in one call — the escape from pure price
    comparison when eight firms are quoting the same lead."""
    pro_id = await require_pro_id(user)
    tiers = {t: _lines(getattr(body, t)) for t in ("basic", "standard", "premium")
             if getattr(body, t)}
    if not tiers:
        raise HTTPException(400, "Provide lines for at least one tier")
    data = body.model_dump(exclude={"basic", "standard", "premium", "job_id"}, exclude_none=True)
    try:
        return {"quotes": await repo.create_tiers(pro_id, body.job_id, tiers, **data)}
    except LookupError as e:
        raise HTTPException(404, str(e))


@router.get("/{quote_id}")
async def get_quote(quote_id: str, user: dict = Depends(get_current_user)):
    q = await repo.get(await require_pro_id(user), quote_id)
    if not q:
        raise HTTPException(404, "Quote not found")
    return q


@router.put("/{quote_id}/lines")
async def replace_lines(quote_id: str, body: LinesIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    try:
        return await repo.replace_lines(pro_id, quote_id, _lines(body.lines))
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(409, str(e))


@router.post("/{quote_id}/revise", status_code=201)
async def revise(quote_id: str, body: LinesIn, user: dict = Depends(get_current_user)):
    """A change creates version N+1; version N is superseded, never rewritten."""
    pro_id = await require_pro_id(user)
    try:
        return await repo.revise(pro_id, quote_id, lines=_lines(body.lines))
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(409, str(e))


@router.get("/{quote_id}/pdf")
async def quote_pdf(quote_id: str, user: dict = Depends(get_current_user)):
    """The branded Angebot the customer actually receives."""
    from fastapi.responses import Response

    from services.quote_pdf import render_quote_pdf

    pro_id = await require_pro_id(user)
    quote = await repo.get(pro_id, quote_id)
    if not quote:
        raise HTTPException(404, "Quote not found")

    pro = await pg.fetchrow("select * from pro_profiles where id = $1", pro_id)
    customer = await pg.fetchrow(
        "select * from customers where id = $1", quote.get("customer_id")) \
        if quote.get("customer_id") else {}

    pdf = render_quote_pdf(dict(quote), pro=dict(pro or {}), customer=dict(customer or {}))
    name = f"Angebot-{quote.get('quote_number') or quote_id[:8]}.pdf"
    return Response(
        content=pdf, media_type="application/pdf",
        # inline: a tradesperson checks it on the phone before sending, and a
        # forced download makes that two taps and a file manager.
        headers={"Content-Disposition": f'inline; filename="{name}"'},
    )


@router.post("/{quote_id}/send")
async def send_quote(quote_id: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    q = await repo.mark_sent(pro_id, quote_id)
    if not q:
        raise HTTPException(404, "Quote not found or already decided")
    job = await pg.fetchrow("select share_token from jobs where id = $1", q["job_id"])
    return {"quote": q, "share_token": (job or {}).get("share_token")}


@router.post("/{quote_id}/accept")
async def accept_quote(quote_id: str, body: AcceptIn = AcceptIn(),
                       user: dict = Depends(get_current_user)):
    """Pro-side acceptance, for when the customer says yes on the doorstep."""
    pro_id = await require_pro_id(user)
    try:
        return await repo.accept(quote_id, pro_id=pro_id)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.post("/{quote_id}/reject")
async def reject_quote(quote_id: str, body: RejectIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    try:
        return await repo.reject(quote_id, body.reason, pro_id=pro_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


@router.post("/expire-stale")
async def expire_stale(user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    return {"expired": await repo.expire_stale(pro_id)}


# ── Quote → Invoice ───────────────────────────────────────────────────
invoice_router = APIRouter(prefix="/jobs", tags=["quotes"])


@invoice_router.get("/{job_id}/invoice-preview")
async def invoice_preview(job_id: str, user: dict = Depends(get_current_user)):
    """What the invoice would inherit, without creating anything."""
    pro_id = await require_pro_id(user)
    return {"lines": await repo.to_invoice_lines(pro_id, job_id)}


@invoice_router.post("/{job_id}/draft-invoice", status_code=201)
async def draft_invoice(job_id: str,
                        invoice_type: str = Query(default="standard",
                                                  pattern="^(standard|abschlag|schluss)$"),
                        user: dict = Depends(get_current_user)):
    """Create a draft invoice pre-filled from the accepted quote + Nachträge.

    Every accepted line is inherited with its kind and tax treatment intact,
    so the §35a split and per-position VAT survive the hand-off. Approved
    change orders are pulled in and flipped to `invoiced` so they cannot be
    billed twice.
    """
    pro_id = await require_pro_id(user)
    try:
        return await repo.draft_invoice_from_job(pro_id, job_id, invoice_type=invoice_type)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


# ══════════════════════════════════════════════════════════════════════
# Customer portal — no account, share token is the credential
# ══════════════════════════════════════════════════════════════════════

@public_router.get("/{share_token}")
async def portal_view(share_token: str):
    data = await repo.get_by_share_token(share_token)
    if not data:
        raise HTTPException(404, "This link is no longer valid.")
    for q in data["quotes"]:
        await repo.mark_viewed(str(q["id"]))
    return data


@public_router.post("/{share_token}/quotes/{quote_id}/accept")
async def portal_accept(share_token: str, quote_id: str):
    data = await repo.get_by_share_token(share_token)
    if not data or not any(str(q["id"]) == quote_id for q in data["quotes"]):
        raise HTTPException(404, "This link is no longer valid.")
    try:
        return await repo.accept(quote_id)
    except (LookupError, ValueError) as e:
        raise HTTPException(409, str(e))


@public_router.post("/{share_token}/quotes/{quote_id}/reject")
async def portal_reject(share_token: str, quote_id: str, body: RejectIn):
    data = await repo.get_by_share_token(share_token)
    if not data or not any(str(q["id"]) == quote_id for q in data["quotes"]):
        raise HTTPException(404, "This link is no longer valid.")
    try:
        return await repo.reject(quote_id, body.reason)
    except LookupError as e:
        raise HTTPException(404, str(e))
