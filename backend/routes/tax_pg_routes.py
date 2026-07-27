"""Tax toolkit endpoints (Postgres): USt-VA, EÜR, DATEV, expenses."""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from auth import get_current_user
from repositories import tax as repo
from routes._pro import require_pro_id

router = APIRouter(prefix="/tax", tags=["tax"])


class ExpenseIn(BaseModel):
    expense_date: Optional[date] = None
    vendor: Optional[str] = None
    category: str = "Sonstige"
    description: Optional[str] = None
    net_amount: Optional[float] = None
    gross_amount: Optional[float] = None
    vat_rate: float = 20
    payment_method: Optional[str] = Field(
        default=None, pattern="^(transfer|card|sepa|sofort|cash|other)$")
    # Input VAT is only reclaimable against a valid supplier invoice.
    vat_deductible: bool = True
    job_id: Optional[str] = None
    storage_ref: Optional[str] = None
    filename: Optional[str] = None
    ocr_confidence: Optional[float] = None


@router.get("/dashboard")
async def dashboard(year: int = Query(default=None), user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    return await repo.dashboard(pro_id, year or date.today().year)


@router.get("/ust-va")
async def ust_va(year: int, month: Optional[int] = Query(default=None, ge=1, le=12),
                 quarter: Optional[int] = Query(default=None, ge=1, le=4),
                 user: dict = Depends(get_current_user)):
    """Umsatzsteuer-Voranmeldung, computed from invoice LINES.

    The Mongo build inferred one rate per invoice; here a mixed invoice
    reports each band correctly and §13b turnover gets its own figure
    instead of being folded into the standard band.
    """
    pro_id = await require_pro_id(user)
    return await repo.ust_va(pro_id, year, month=month, quarter=quarter)


@router.get("/eur")
async def eur(year: int = Query(default=None), user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    return await repo.eur(pro_id, year or date.today().year)


@router.get("/exports/datev.csv")
async def datev(year: int = Query(default=None), user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    y = year or date.today().year
    csv_text = await repo.datev_csv(pro_id, y)
    return Response(
        content=csv_text.encode("utf-8-sig"),   # BOM: Excel/DATEV expect it
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="datev-{y}.csv"'},
    )


@router.get("/expenses")
async def list_expenses(year: Optional[int] = None, category: Optional[str] = None,
                        needs_review: Optional[bool] = None,
                        limit: int = Query(default=100, le=500), offset: int = 0,
                        user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    return await repo.list_expenses(pro_id, year=year, category=category,
                                    needs_review=needs_review, limit=limit, offset=offset)


@router.get("/expense-categories")
async def categories():
    return {"categories": repo.EXPENSE_CATEGORIES}


@router.post("/expenses", status_code=201)
async def create_expense(body: ExpenseIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    if not (body.net_amount or body.gross_amount):
        raise HTTPException(400, "Provide net_amount or gross_amount")
    return await repo.create_expense(pro_id, body.model_dump(exclude_none=True))


@router.patch("/expenses/{expense_id}")
async def update_expense(expense_id: str, body: ExpenseIn,
                         user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    row = await repo.update_expense(pro_id, expense_id, body.model_dump(exclude_none=True))
    if not row:
        raise HTTPException(404, "Expense not found")
    return row


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    if not await repo.delete_expense(pro_id, expense_id):
        raise HTTPException(404, "Expense not found")
    return {"deleted": True}
