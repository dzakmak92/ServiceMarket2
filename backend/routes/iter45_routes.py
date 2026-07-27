"""Iter45 admin/invoicing additions:
- /admin/online-payments  → Pay-Now 1% fee transactions list (paginated)
- /admin/invoice-templates → template usage stats + per-pro picks
- /admin/invoices/export.zip → admin invoices as individual PDFs in a ZIP
- /pro-invoices/export.zip  → pro invoices as individual PDFs in a ZIP
"""
from __future__ import annotations
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from auth import get_current_user, require_admin
from database import db
from services.invoice_templates import render_with_template


router = APIRouter(prefix="/admin")
pro_router = APIRouter(prefix="/pro-invoices")


def _make_dt(year: Optional[int], month: Optional[int]) -> tuple[Optional[datetime], Optional[datetime]]:
    if not year:
        return None, None
    if month:
        start = datetime(year, month, 1, tzinfo=timezone.utc)
        ny = year + (1 if month == 12 else 0)
        nm = 1 if month == 12 else month + 1
        end = datetime(ny, nm, 1, tzinfo=timezone.utc)
    else:
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    return start, end


# ─────────────────────────── Online Payments (1% fee) ───────────────────────────
@router.get("/online-payments")
async def list_online_payments(
    user: dict = Depends(require_admin),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    status: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List Pay-Now (1% fee) Stripe transactions — filtered + paginated."""
    query: dict = {"metadata.type": "invoice_payment"}
    if status and status != "all":
        query["payment_status"] = status
    start, end = _make_dt(year, month)
    if start and end:
        query["created_at"] = {"$gte": start, "$lt": end}
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [
            {"metadata.invoice_number": rx},
            {"session_id": rx},
            {"metadata.pro_name": rx},
        ]

    total = await db.payment_transactions.count_documents(query)
    items: list = []
    cursor = db.payment_transactions.find(query).sort("created_at", -1).skip((page - 1) * per_page).limit(per_page)
    sum_invoice = sum_fee = 0.0
    async for t in cursor:
        meta = t.get("metadata") or {}
        amt = float(meta.get("invoice_amount_eur") or 0)
        fee = float(meta.get("service_fee_eur") or 0)
        items.append({
            "id": str(t["_id"]),
            "session_id": t.get("session_id"),
            "invoice_number": meta.get("invoice_number"),
            "invoice_amount_eur": amt,
            "service_fee_eur": fee,
            "pro_id": meta.get("pro_id"),
            "pro_name": meta.get("pro_name"),
            "payment_status": t.get("payment_status"),
            "status": t.get("status"),
            "created_at": t.get("created_at").isoformat() if isinstance(t.get("created_at"), datetime) else t.get("created_at"),
            "paid_at": t.get("paid_at").isoformat() if isinstance(t.get("paid_at"), datetime) else t.get("paid_at"),
        })
        if t.get("payment_status") == "paid":
            sum_invoice += amt
            sum_fee += fee
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "totals": {"paid_invoice_volume": sum_invoice, "paid_fee_revenue": sum_fee},
    }


# ─────────────────────────── Invoice Templates ───────────────────────────
@router.get("/invoice-templates")
async def list_invoice_templates_admin(user: dict = Depends(require_admin)):
    """Per-template adoption stats (count of pros + their business names)."""
    from services.invoice_templates import TEMPLATE_OPTIONS, migrate_template_key

    counts: dict = {t["key"]: 0 for t in TEMPLATE_OPTIONS}
    per_template: dict = {t["key"]: [] for t in TEMPLATE_OPTIONS}
    async for p in db.pro_profiles.find({}):
        tpl = migrate_template_key(p.get("invoice_template")) or "pastel_mint"
        counts[tpl] = counts.get(tpl, 0) + 1
        if len(per_template[tpl]) < 20:  # Cap per-template list
            u = None
            try:
                u = await db.users.find_one({"_id": p["user_id"]} if isinstance(p["user_id"], ObjectId) else {"_id": ObjectId(p["user_id"])})
            except Exception:
                pass
            per_template[tpl].append({
                "pro_id": str(p["_id"]),
                "pro_name": (u or {}).get("name") or p.get("business_name") or "",
                "business_name": p.get("business_name") or "",
                "logo_file_id": p.get("logo_file_id"),
            })
    total = sum(counts.values())
    return {
        "templates": [
            {"key": t["key"], "name": t["name"], "count": counts.get(t["key"], 0),
             "pct": round(100 * counts.get(t["key"], 0) / max(1, total), 1),
             "pros": per_template[t["key"]]}
            for t in TEMPLATE_OPTIONS
        ],
        "total_pros": total,
    }


# ─────────────────────────── ZIP export helpers ───────────────────────────
def _safe_invoice_name(inv: dict) -> str:
    """Build a safe, human-readable filename for one invoice inside the ZIP."""
    num = inv.get("invoice_number") or str(inv.get("_id", "unknown"))
    # Sanitise: replace any filesystem-unsafe chars
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in str(num))
    return f"{safe}.pdf"


def _make_zip(pdf_pairs: list[tuple[str, bytes]]) -> bytes:
    """Pack (filename, pdf_bytes) pairs into an in-memory ZIP archive."""
    buf = BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        seen: dict[str, int] = {}
        for fname, data in pdf_pairs:
            # De-duplicate filenames (e.g. if invoice numbers clash)
            if fname in seen:
                seen[fname] += 1
                base, ext = fname.rsplit(".", 1)
                fname = f"{base}_{seen[fname]}.{ext}"
            else:
                seen[fname] = 0
            zf.writestr(fname, data)
    return buf.getvalue()


async def _gather_pdfs_for_pro(pro_id: str, query: dict, limit: int = 100) -> list[tuple[str, bytes]]:
    """Build the actual PDFs for every invoice matching the query (capped)."""
    pairs: list[tuple[str, bytes]] = []
    cursor = db.pro_invoices.find({**query, "pro_id": pro_id}).sort("invoice_date", -1).limit(limit)
    async for inv in cursor:
        try:
            pairs.append((_safe_invoice_name(inv), await render_with_template(inv)))
        except Exception:
            continue
    return pairs


@pro_router.get("/export.zip")
async def pro_export_invoices_zip(
    user: dict = Depends(get_current_user),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    payment_status: Optional[str] = None,
):
    """Pro exports all (filtered) invoices as individual PDFs inside a ZIP archive."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Not a tradesperson")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    query: dict = {}
    start, end = _make_dt(year, month)
    if start and end:
        query["invoice_date"] = {"$gte": start, "$lt": end}
    if payment_status and payment_status != "all":
        query["payment_status"] = payment_status
    pairs = await _gather_pdfs_for_pro(str(pro["_id"]), query)
    fname = f"invoices-{year or 'all'}{f'-{month:02d}' if month else ''}.zip"
    return Response(
        content=_make_zip(pairs),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/invoices/export.zip")
async def admin_export_invoices_zip(
    user: dict = Depends(require_admin),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
):
    """Admin exports every pro_invoice for the period as individual PDFs in a ZIP (capped at 200)."""
    query: dict = {}
    start, end = _make_dt(year, month)
    if start and end:
        query["invoice_date"] = {"$gte": start, "$lt": end}
    pairs: list[tuple[str, bytes]] = []
    cursor = db.pro_invoices.find(query).sort("invoice_date", -1).limit(200)
    async for inv in cursor:
        try:
            pairs.append((_safe_invoice_name(inv), await render_with_template(inv)))
        except Exception:
            continue
    fname = f"admin-invoices-{year or 'all'}{f'-{month:02d}' if month else ''}.zip"
    return Response(
        content=_make_zip(pairs),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
