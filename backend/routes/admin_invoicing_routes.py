"""Admin invoicing routes (iter24).

Endpoints:
- GET/PUT /admin/company-settings    — singleton company-detail config
- GET     /admin/invoices            — list (optionally filtered by type)
- GET     /admin/invoices/{id}       — single
- GET     /admin/invoices/{id}/pdf   — stream the PDF
- POST    /admin/invoices/generate-subscriptions
- POST    /admin/invoices/generate-fees
- POST    /admin/invoices/{id}/storno
- GET     /admin/fees/grouped        — pending fees grouped by pro
- PATCH   /admin/fees/{id}           — edit amount of a single pending fee
"""
from fastapi import APIRouter, HTTPException, Depends, Response
from datetime import datetime, timezone, timedelta
from calendar import monthrange
from bson import ObjectId
from typing import Optional, List

from database import db
from auth import require_admin
from models import CompanySettings, StornoRequest, FeeEditRequest
from utils import serialize_doc
from services.invoicing import (
    create_subscription_invoice, create_fees_invoice, create_storno_invoice,
    render_invoice_pdf,
)

router = APIRouter(prefix="/admin/billing")


# ──────────────────────────────────────────────
# Company settings (singleton, _id="default")
# ──────────────────────────────────────────────
@router.get("/company-settings")
async def get_company_settings(user: dict = Depends(require_admin)):
    s = await db.company_settings.find_one({"_id": "default"})
    if not s:
        return {"configured": False}
    return {"configured": True, "settings": serialize_doc(s)}


@router.put("/company-settings")
async def upsert_company_settings(data: CompanySettings, user: dict = Depends(require_admin)):
    payload = data.model_dump()
    payload["_id"] = "default"
    payload["updated_at"] = datetime.now(timezone.utc)
    await db.company_settings.replace_one({"_id": "default"}, payload, upsert=True)
    return {"message": "Settings saved", "settings": serialize_doc(payload)}


# ──────────────────────────────────────────────
# Invoice list / detail / PDF
# ──────────────────────────────────────────────
@router.get("/invoices")
async def list_invoices(
    invoice_type: Optional[str] = None,
    user: dict = Depends(require_admin),
):
    q = {}
    if invoice_type in ("subscription", "fees", "storno"):
        q["invoice_type"] = invoice_type
    rows = await db.invoices.find(q).sort("invoice_date", -1).to_list(500)
    return {"invoices": [serialize_doc(r) for r in rows]}


@router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(require_admin)):
    try:
        r = await db.invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not r:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return serialize_doc(r)


@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(invoice_id: str, user: dict = Depends(require_admin)):
    try:
        r = await db.invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not r:
        raise HTTPException(status_code=404, detail="Invoice not found")
    pdf_bytes = render_invoice_pdf(r)
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{r["invoice_number"]}.pdf"'},
    )


# ──────────────────────────────────────────────
# Mass-generate (manual + cron entry points)
# ──────────────────────────────────────────────
def _previous_month_window(now: Optional[datetime] = None) -> tuple[datetime, datetime]:
    """Return [start_of_prev_month, start_of_this_month) — both tz-aware UTC."""
    now = now or datetime.now(timezone.utc)
    first_of_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_of_prev = first_of_this - timedelta(seconds=1)
    first_of_prev = last_of_prev.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return first_of_prev, first_of_this


@router.post("/invoices/generate-subscriptions")
async def generate_subscription_invoices(user: dict = Depends(require_admin)):
    """One invoice per active Pro for the previous month. Idempotent: skips pros
    who already have a subscription invoice for the same period."""
    period_start, period_end = _previous_month_window()
    settings = await db.company_settings.find_one({"_id": "default"})
    if not settings:
        raise HTTPException(status_code=400, detail="Company settings not configured")

    pros = await db.pro_profiles.find({"plan_tier": "pro"}).to_list(2000)
    created = []
    skipped = 0
    for p in pros:
        existing = await db.invoices.find_one({
            "invoice_type": "subscription",
            "target_user_id": p["user_id"],
            "leistungsdatum_start": period_start,
        })
        if existing:
            skipped += 1
            continue
        try:
            inv = await create_subscription_invoice(p["user_id"], period_start, period_end)
            created.append(inv["invoice_number"])
        except Exception:
            pass
    return {"created": len(created), "skipped": skipped, "period": period_start.strftime("%m/%Y"),
            "invoice_numbers": created}


@router.post("/invoices/generate-fees")
async def generate_fees_invoices(user: dict = Depends(require_admin)):
    """One aggregated fees invoice per pro for the previous month."""
    period_start, period_end = _previous_month_window()
    settings = await db.company_settings.find_one({"_id": "default"})
    if not settings:
        raise HTTPException(status_code=400, detail="Company settings not configured")

    # Distinct pros with pending fees in the period
    pro_ids = await db.fee_log.distinct("pro_id", {
        "status": "pending",
        "incurred_at": {"$gte": period_start, "$lt": period_end},
    })
    created = []
    for pid in pro_ids:
        try:
            inv = await create_fees_invoice(pid, period_start, period_end)
            if inv:
                created.append(inv["invoice_number"])
        except Exception:
            pass
    return {"created": len(created), "period": period_start.strftime("%m/%Y"),
            "invoice_numbers": created}


@router.post("/invoices/{invoice_id}/storno")
async def storno_invoice(invoice_id: str, data: StornoRequest, user: dict = Depends(require_admin)):
    try:
        inv = await create_storno_invoice(invoice_id, data.reason)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return serialize_doc(inv)


# ──────────────────────────────────────────────
# Fees admin (grouped by pro, editable)
# ──────────────────────────────────────────────
@router.get("/fees/grouped")
async def fees_grouped_by_pro(
    status: str = "pending",
    user: dict = Depends(require_admin),
):
    fees = await db.fee_log.find({"status": status}).sort("incurred_at", -1).to_list(2000)
    by_pro: dict = {}
    for f in fees:
        pid = f.get("pro_id")
        if not pid:
            continue
        by_pro.setdefault(pid, []).append(serialize_doc(f))

    out = []
    for pro_id, items in by_pro.items():
        try:
            p = await db.pro_profiles.find_one({"_id": ObjectId(pro_id)})
        except Exception:
            p = None
        if not p:
            continue
        u = await db.users.find_one({"_id": ObjectId(p["user_id"])}) or {}
        out.append({
            "pro_id": pro_id,
            "user_id": p["user_id"],
            "name": u.get("name", ""),
            "email": u.get("email", ""),
            "company_name": p.get("company_name") or p.get("business_name", ""),
            "fee_count": len(items),
            "total_eur": round(sum(x.get("amount", 0) for x in items), 2),
            "fees": items,
        })
    out.sort(key=lambda r: r["total_eur"], reverse=True)
    return {"groups": out, "total_fees": sum(g["fee_count"] for g in out)}


@router.patch("/fees/{fee_id}")
async def edit_fee(fee_id: str, data: FeeEditRequest, user: dict = Depends(require_admin)):
    try:
        f = await db.fee_log.find_one({"_id": ObjectId(fee_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Fee not found")
    if not f:
        raise HTTPException(status_code=404, detail="Fee not found")
    if f.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending fees can be edited")

    await db.fee_log.update_one(
        {"_id": ObjectId(fee_id)},
        {"$set": {
            "amount": round(float(data.amount), 2),
            "edited_at": datetime.now(timezone.utc),
            "edited_by_admin": user["_id"],
            "edit_reason": data.reason or "",
        }},
    )
    return {"message": "Fee updated", "amount": round(float(data.amount), 2)}
