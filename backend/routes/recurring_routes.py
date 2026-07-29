"""Recurring service contracts (Postgres).

A contract is the rule; the visits it generates are ordinary jobs on the
spine. That split is what lets a fortnightly Hausverwaltung site carry
tasks, photos, a timer and an invoice without any of those features knowing
recurrence exists.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user
from repositories import recurring as repo
from routes._pro import require_pro_id

router = APIRouter(prefix="/recurring", tags=["recurring"])

CADENCE = "^(weekly|fortnightly|monthly|quarterly|seasonal|on_demand)$"
BILLING = "^(per_visit|monthly|quarterly)$"

# Twelve months is the furthest a visit is worth materialising. Beyond that
# the contract has usually changed, and a planner full of speculative visits
# is harder to read than an empty one.
MAX_HORIZON_DAYS = 366


class ContractIn(BaseModel):
    customer_id: str
    title: str = Field(min_length=1, max_length=200)
    cadence: str = Field(pattern=CADENCE)
    # 0 = Monday, matching both Python and the column.
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    price_per_visit: Optional[float] = Field(default=None, ge=0)
    billing: str = Field(default="per_visit", pattern=BILLING)
    checklist: Optional[list] = None
    starts_on: date
    ends_on: Optional[date] = None


class ContractPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    cadence: Optional[str] = Field(default=None, pattern=CADENCE)
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    price_per_visit: Optional[float] = Field(default=None, ge=0)
    billing: Optional[str] = Field(default=None, pattern=BILLING)
    checklist: Optional[list] = None
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    active: Optional[bool] = None


@router.get("")
async def list_contracts(active: Optional[bool] = None,
                         user: dict = Depends(get_current_user)):
    return await repo.list_for_pro(await require_pro_id(user), active=active)


@router.post("", status_code=201)
async def create_contract(body: ContractIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    if body.ends_on and body.ends_on < body.starts_on:
        raise HTTPException(400, "ends_on is before starts_on")
    if body.cadence in ("weekly", "fortnightly") and body.weekday is None:
        # Without it the visit day is whatever weekday starts_on happens to
        # fall on, which is rarely what was agreed.
        raise HTTPException(400, "weekly and fortnightly contracts need a weekday")
    return await repo.create(pro_id, body.model_dump(exclude_none=True))


@router.get("/{contract_id}")
async def get_contract(contract_id: str, user: dict = Depends(get_current_user)):
    row = await repo.get(await require_pro_id(user), contract_id)
    if not row:
        raise HTTPException(404, "Contract not found")
    return row


@router.patch("/{contract_id}")
async def patch_contract(contract_id: str, body: ContractPatch,
                         user: dict = Depends(get_current_user)):
    row = await repo.update(await require_pro_id(user), contract_id,
                            body.model_dump(exclude_none=True))
    if not row:
        raise HTTPException(404, "Contract not found")
    return row


@router.get("/{contract_id}/visits")
async def contract_visits(contract_id: str, upcoming: bool = False,
                          user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    if not await repo.get(pro_id, contract_id):
        raise HTTPException(404, "Contract not found")
    return {"visits": await repo.visits(pro_id, contract_id, upcoming_only=upcoming)}


@router.post("/{contract_id}/generate")
async def generate_visits(contract_id: str,
                          days: int = Query(default=90, ge=1, le=MAX_HORIZON_DAYS),
                          user: dict = Depends(get_current_user)):
    """Materialise upcoming visits. Safe to call repeatedly and concurrently.

    Reports created and skipped separately so a second run is visibly a no-op
    rather than looking like a failure.
    """
    pro_id = await require_pro_id(user)
    try:
        return await repo.generate(pro_id, contract_id, date.today() + timedelta(days=days))
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
