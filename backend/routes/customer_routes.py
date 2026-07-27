"""Customer CRM endpoints (Postgres).

Replaces nothing — the marketplace had no customer records of its own.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from repositories import customers as repo
from routes._pro import require_pro_id

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerIn(BaseModel):
    type: str = Field(default="private", pattern="^(private|business)$")
    name: str = Field(min_length=1, max_length=200)
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = Field(default=None, pattern="^[A-Z]{2}$")
    vat_id: Optional[str] = None
    is_bauleister: Optional[bool] = None
    notes: Optional[str] = None
    tags: Optional[list[str]] = None


class CustomerPatch(CustomerIn):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    type: Optional[str] = Field(default=None, pattern="^(private|business)$")


@router.get("")
async def list_customers(
    q: str = "",
    type: Optional[str] = Query(default=None, pattern="^(private|business)$"),
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user: dict = Depends(get_current_user),
):
    pro_id = await require_pro_id(user)
    return await repo.search(pro_id, q=q, limit=limit, offset=offset, customer_type=type)


@router.post("", status_code=201)
async def create_customer(body: CustomerIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    data = body.model_dump(exclude_none=True)

    # Surface a likely duplicate rather than silently creating a second record
    # for the same person — three half-populated rows for one customer would
    # destroy the repeat-business view the CRM exists to give.
    dup = await repo.find_duplicate(
        pro_id, email=data.get("email", ""), phone=data.get("phone", ""), name=data["name"])
    if dup:
        return {"customer": dup, "created": False, "duplicate_of": str(dup["id"])}

    return {"customer": await repo.create(pro_id, data), "created": True}


@router.get("/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    cust = await repo.get(pro_id, customer_id)
    if not cust:
        raise HTTPException(404, "Customer not found")
    return cust


@router.patch("/{customer_id}")
async def update_customer(customer_id: str, body: CustomerPatch,
                          user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    cust = await repo.update(pro_id, customer_id, body.model_dump(exclude_none=True))
    if not cust:
        raise HTTPException(404, "Customer not found")
    return cust


@router.delete("/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    if not await repo.soft_delete(pro_id, customer_id):
        raise HTTPException(404, "Customer not found")
    # Soft delete only: invoices referencing this customer are legally retained
    # for 7 years (DE: up to 10) and hold a foreign key to it.
    return {"deleted": True, "soft": True}
