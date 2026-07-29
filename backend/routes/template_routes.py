"""Trade template library endpoints (Postgres)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user
from repositories import quotes as quotes_repo
from repositories import templates as repo
from routes._pro import require_pro_id

router = APIRouter(prefix="/templates", tags=["templates"])


class ApplyIn(BaseModel):
    job_id: str
    tier: str = Field(default="standard", pattern="^(basic|standard|premium)$")
    title: Optional[str] = None


@router.get("")
async def list_templates(trade: Optional[str] = None,
                         user: dict = Depends(get_current_user)):
    return await repo.list_for_pro(await require_pro_id(user), trade=trade)


@router.get("/{template_id}")
async def get_template(template_id: str, user: dict = Depends(get_current_user)):
    tpl = await repo.get(await require_pro_id(user), template_id)
    if not tpl:
        raise HTTPException(404, "Template not found")
    return tpl


@router.get("/{template_id}/preview")
async def preview(template_id: str,
                  tier: str = Query(default="standard", pattern="^(basic|standard|premium)$"),
                  user: dict = Depends(get_current_user)):
    """The lines this template would produce, priced from the pro's own rates,
    without creating anything."""
    pro_id = await require_pro_id(user)
    if not await repo.get(pro_id, template_id):
        raise HTTPException(404, "Template not found")
    return {"lines": await repo.resolve_lines(pro_id, template_id, tier=tier)}


@router.post("/{template_id}/apply", status_code=201)
async def apply_template(template_id: str, body: ApplyIn,
                         user: dict = Depends(get_current_user)):
    """Create a quote on a job from this template.

    The lines are copied, not linked. A template that kept editing a quote
    already sent to a customer would change an offer after the fact.
    """
    pro_id = await require_pro_id(user)
    tpl = await repo.get(pro_id, template_id)
    if not tpl:
        raise HTTPException(404, "Template not found")
    lines = await repo.resolve_lines(pro_id, template_id, tier=body.tier)
    if not lines:
        raise HTTPException(400, "This template has no lines for that tier")
    try:
        return await quotes_repo.create(
            pro_id, body.job_id, lines=lines, tier=body.tier,
            title=body.title or tpl["name"],
            assumptions=tpl.get("assumptions") or None)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
