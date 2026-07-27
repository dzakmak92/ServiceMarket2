"""Pro-side invoicing routes (Invoice Toolkit).
Pro generates B2C invoices to homeowners. Requires has_invoice_toolkit=True
on the pro_profile + filled bank details.
"""
from fastapi import APIRouter, HTTPException, Depends, Response, Query
import logging
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field

from database import db
from auth import get_current_user
from utils import serialize_doc
from services.pro_invoicing import (
    create_pro_invoice, render_pro_invoice_pdf,
)
from services.invoice_templates import render_with_template, TEMPLATE_OPTIONS, migrate_template_key

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/pro-invoices")


class ProInvoiceLineItem(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    qty: float = Field(gt=0)
    unit_net: float = Field(ge=0)


class ExternalCustomer(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = "AT"


class ProInvoiceCreate(BaseModel):
    job_id: Optional[str] = None
    homeowner_id: Optional[str] = None
    line_items: list[ProInvoiceLineItem] = Field(min_length=1, max_length=20)
    note: Optional[str] = None
    payment_due_days: int = Field(default=14, ge=0, le=90)
    # When the invoice originates from an approved PM change order (Nachtrag),
    # these let us close the loop and flip the CO to "invoiced".
    change_order_id: Optional[str] = None
    project_id: Optional[str] = None
    # Off-platform ("external") invoicing: jobs closed OUTSIDE ServiceMarket.
    # When source == 'external', the customer is entered manually (no job/homeowner).
    source: Optional[str] = None
    customer: Optional[ExternalCustomer] = None


async def _require_pro_with_toolkit(user: dict) -> dict:
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Pros only")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    if not pro.get("has_invoice_toolkit"):
        raise HTTPException(status_code=402, detail="Invoice Toolkit not active for this pro")
    return pro


@router.get("/draft-from-job/{job_id}")
async def draft_from_job(job_id: str, user: dict = Depends(get_current_user)):
    """Pre-fill an invoice draft from a completed job + accepted quote.
    Returns suggested line items, homeowner id, and net price."""
    pro = await _require_pro_with_toolkit(user)
    pro_id = str(pro["_id"])

    try:
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Only completed jobs can be invoiced")

    # Find the accepted quote for this pro
    quote = await db.quotes.find_one({
        "job_id": job_id,
        "pro_id": pro_id,
        "status": "accepted",
    })
    if not quote:
        raise HTTPException(status_code=400, detail="No accepted quote found for this pro on this job")

    # Check if this job already has an active (non-storno'd) invoice from this pro
    existing_invoice = await db.pro_invoices.find_one({
        "pro_id": pro_id,
        "job_id": job_id,
        "invoice_type": {"$ne": "storno"},
        "is_storno": {"$ne": True},
        "cancelled_by_storno_id": {"$exists": False},
        "payment_status": {"$nin": ["cancelled", "storno"]},
    })
    already_invoiced = existing_invoice is not None

    amount = float(quote.get("price") or quote.get("amount") or 0)
    homeowner_id = job.get("posted_by_id")
    homeowner = await db.users.find_one({"_id": ObjectId(homeowner_id)}) if homeowner_id else None
    line_items = [{
        "description": f"{job.get('title', 'Auftrag')} — {job.get('category', '')}".strip().rstrip(" —"),
        "qty": 1,
        "unit_net": round(amount, 2),
    }]
    # Travel + parking lines if present on the quote
    if quote.get("travel_cost"):
        line_items.append({"description": "Anfahrt", "qty": 1, "unit_net": round(float(quote["travel_cost"]), 2)})
    if quote.get("parking_cost"):
        line_items.append({"description": "Parkkosten", "qty": 1, "unit_net": round(float(quote["parking_cost"]), 2)})

    return {
        "job": {
            "id": job_id,
            "title": job.get("title", ""),
            "category": job.get("category", ""),
            "city": job.get("city", ""),
            "completed_at": job.get("completed_at").isoformat() if job.get("completed_at") else None,
        },
        "homeowner": {
            "id": homeowner_id,
            "name": (homeowner or {}).get("name", ""),
            "address": (homeowner or {}).get("address", ""),
            "postal_code": (homeowner or {}).get("postal_code", ""),
            "city": (homeowner or {}).get("city", ""),
            "country": (homeowner or {}).get("country", ""),
        },
        "line_items": line_items,
        "is_kleinunternehmer": bool(pro.get("is_kleinunternehmer", False)),
        "has_bank_details": bool(pro.get("bank_iban")),
        "already_invoiced": already_invoiced,
        "existing_invoice_number": existing_invoice.get("invoice_number") if existing_invoice else None,
    }


@router.get("/draft-from-project/{project_id}")
async def draft_from_project(project_id: str, user: dict = Depends(get_current_user)):
    """Invoice-draft fallback sourced from a PM project (used for Nachträge/
    change-order invoicing). Does NOT require the original job to still exist."""
    pro = await _require_pro_with_toolkit(user)
    try:
        proj = await db.pm_projects.find_one({"_id": ObjectId(project_id), "pro_id": str(pro["_id"])})
    except Exception:
        raise HTTPException(status_code=404, detail="Project not found")
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    cust = proj.get("customer", {}) or {}
    homeowner_id = cust.get("homeowner_id")
    homeowner = None
    if homeowner_id:
        try:
            homeowner = await db.users.find_one({"_id": ObjectId(homeowner_id)})
        except Exception:
            homeowner = None
    return {
        "job": {
            "id": proj.get("job_id"),
            "title": proj.get("title") or proj.get("job_title", ""),
            "category": proj.get("job_category", ""),
            "city": cust.get("city", ""),
            "completed_at": None,
        },
        "homeowner": {
            "id": homeowner_id,
            "name": (homeowner or {}).get("name", "") or cust.get("name", ""),
            "address": (homeowner or {}).get("address", ""),
            "postal_code": (homeowner or {}).get("postal_code", ""),
            "city": (homeowner or {}).get("city", "") or cust.get("city", ""),
            "country": (homeowner or {}).get("country", ""),
        },
        "line_items": [],
        "is_kleinunternehmer": bool(pro.get("is_kleinunternehmer", False)),
        "has_bank_details": bool(pro.get("bank_iban")),
        "already_invoiced": False,
    }



@router.post("")
async def create(data: ProInvoiceCreate, user: dict = Depends(get_current_user)):
    pro = await _require_pro_with_toolkit(user)
    if not pro.get("bank_iban"):
        raise HTTPException(status_code=400, detail="Add your bank details first (Settings → Invoice details).")
    is_external = (data.source == "external")
    if is_external and (not data.customer or not data.customer.name.strip()):
        raise HTTPException(status_code=400, detail="External invoices need customer details (at least a name).")
    try:
        inv = await create_pro_invoice(
            pro_id=str(pro["_id"]),
            job_id=None if is_external else data.job_id,
            homeowner_user_id=None if is_external else data.homeowner_id,
            line_items=[li.model_dump() for li in data.line_items],
            note=data.note,
            payment_due_days=data.payment_due_days,
            source="external" if is_external else "servicemarket",
            customer_override=(data.customer.model_dump() if (is_external and data.customer) else None),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Close the loop: if this invoice came from an approved change order, mark it invoiced.
    if data.change_order_id and data.project_id:
        try:
            await db.pm_change_orders.update_one(
                {"_id": ObjectId(data.change_order_id), "project_id": data.project_id, "status": "approved"},
                {"$set": {
                    "status": "invoiced",
                    "invoiced_at": datetime.now(timezone.utc),
                    "invoice_id": str(inv.get("_id") or inv.get("id") or ""),
                    "invoice_number": inv.get("invoice_number"),
                }},
            )
        except Exception:
            pass
    return serialize_doc(inv)


@router.get("/stats")
async def my_stats(user: dict = Depends(get_current_user), year: Optional[int] = None):
    """Aggregate KPI counts for MyInvoices: issued/paid/pending brutto for the
    given year (defaults to current). Excludes storno + cancelled docs."""
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        return {"issued_brutto": 0, "paid_brutto": 0, "pending_brutto": 0,
                "this_month_brutto": 0, "issued_count": 0, "paid_count": 0, "pending_count": 0}
    from datetime import datetime, timezone
    y = year or datetime.now(timezone.utc).year
    start = datetime(y, 1, 1, tzinfo=timezone.utc)
    end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    issued_brutto = paid_brutto = pending_brutto = this_month_brutto = 0.0
    issued_count = paid_count = pending_count = 0
    cursor = db.pro_invoices.find({
        "pro_id": str(pro["_id"]),
        "invoice_date": {"$gte": start, "$lt": end},
        "is_storno": {"$ne": True},
        "cancelled_by_storno_id": {"$exists": False},
        "payment_status": {"$nin": ["cancelled", "storno"]},
    })
    async for r in cursor:
        b = float(r.get("brutto_total") or 0)
        paid = float(r.get("paid_total") or 0)
        outstanding = float(r.get("outstanding") or max(0, b - paid))
        issued_brutto += b
        issued_count += 1
        inv_date = r.get("invoice_date")
        if isinstance(inv_date, datetime) and inv_date.tzinfo is None:
            inv_date = inv_date.replace(tzinfo=timezone.utc)
        if inv_date and inv_date >= month_start:
            this_month_brutto += b
        ps = r.get("payment_status") or r.get("status")
        if ps == "paid":
            paid_brutto += b
            paid_count += 1
        elif ps == "partial":
            paid_brutto += paid
            pending_brutto += outstanding
            pending_count += 1
        else:
            pending_brutto += b
            pending_count += 1
    return {
        "issued_brutto": issued_brutto, "paid_brutto": paid_brutto,
        "pending_brutto": pending_brutto, "this_month_brutto": this_month_brutto,
        "issued_count": issued_count, "paid_count": paid_count, "pending_count": pending_count,
    }


@router.get("/cashflow")
async def cashflow(user: dict = Depends(get_current_user)):
    """Weekly cash flow: groups unpaid invoices by due-date week for the next 12 weeks,
    plus a 'overdue' bucket. Used by the Pro dashboard Cash Flow Timeline widget."""
    from datetime import datetime, timezone, timedelta
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        return {"weeks": [], "overdue": 0.0}
    now = datetime.now(timezone.utc)
    # Fetch all open invoices (not paid / cancelled / storno)
    cursor = db.pro_invoices.find({
        "pro_id": str(pro["_id"]),
        "invoice_type": {"$ne": "storno"},
        "is_storno": {"$ne": True},
        "cancelled_by_storno_id": {"$exists": False},
        "payment_status": {"$nin": ["paid", "cancelled", "storno"]},
    })
    overdue = 0.0
    week_buckets: dict[int, float] = {}  # week_offset → amount
    async for inv in cursor:
        b = float(inv.get("brutto_total") or 0)
        paid = float(inv.get("paid_total") or 0)
        outstanding = max(0.0, b - paid)
        if outstanding <= 0:
            continue
        inv_date = inv.get("invoice_date") or inv.get("created_at")
        due_days = int(inv.get("payment_due_days") or 14)
        if isinstance(inv_date, datetime):
            if inv_date.tzinfo is None:
                inv_date = inv_date.replace(tzinfo=timezone.utc)
            due_date = inv_date + timedelta(days=due_days)
        else:
            due_date = now  # fallback
        delta_days = (due_date - now).days
        if delta_days < 0:
            overdue += outstanding
        else:
            week_offset = min(delta_days // 7, 11)  # cap at week 11
            week_buckets[week_offset] = week_buckets.get(week_offset, 0.0) + outstanding
    weeks = [
        {"week": i, "label": f"Wk {i+1}", "amount": round(week_buckets.get(i, 0.0), 2)}
        for i in range(12)
    ]
    return {"weeks": weeks, "overdue": round(overdue, 2)}


@router.get("")
async def list_my(
    user: dict = Depends(get_current_user),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    payment_status: Optional[str] = None,
    source: Optional[str] = None,
    q: Optional[str] = None,
    sort_by: Optional[str] = Query("invoice_date", regex="^(invoice_date|total_brutto|invoice_number)$"),
    order: Optional[str] = Query("desc", regex="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        return {"invoices": [], "total": 0, "page": page, "per_page": per_page}
    per_page = min(max(per_page, 1), 100)
    page = max(page, 1)
    query: dict = {"pro_id": str(pro["_id"])}
    # Source: 'external' (off-platform) vs 'servicemarket' (linked to a SM job).
    # Old invoices have no `source` field, so treat them as servicemarket.
    if source == "external":
        query["source"] = "external"
    elif source == "servicemarket":
        query["source"] = {"$ne": "external"}
    if payment_status and payment_status != "all":
        # Support both old invoices (only `status` field) and new ones (`payment_status`)
        query["$or"] = [
            {"payment_status": payment_status},
            {"payment_status": {"$exists": False}, "status": payment_status},
        ]
    if year:
        from datetime import datetime, timezone
        if month:
            start = datetime(year, month, 1, tzinfo=timezone.utc)
            ny = year + (1 if month == 12 else 0)
            nm = 1 if month == 12 else month + 1
            end = datetime(ny, nm, 1, tzinfo=timezone.utc)
        else:
            start = datetime(year, 1, 1, tzinfo=timezone.utc)
            end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        query["invoice_date"] = {"$gte": start, "$lt": end}
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [
            {"invoice_number": rx},
            {"customer_snapshot.name": rx},
            {"line_items.description": rx},
        ]
    total = await db.pro_invoices.count_documents(query)
    mongo_order = 1 if order == "asc" else -1
    rows = await db.pro_invoices.find(query).sort(sort_by, mongo_order) \
        .skip((page - 1) * per_page).limit(per_page).to_list(per_page)
    out = []
    for r in rows:
        d = serialize_doc(r)
        d.pop("_id", None)
        out.append(d)
    return {"invoices": out, "total": total, "page": page, "per_page": per_page}


@router.get("/{invoice_id}")
async def get_one(invoice_id: str, user: dict = Depends(get_current_user)):
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    try:
        inv = await db.pro_invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not inv or inv["pro_id"] != str(pro["_id"]):
        raise HTTPException(status_code=404, detail="Invoice not found")
    return serialize_doc(inv)


@router.get("/{invoice_id}/pdf")
async def get_pdf(invoice_id: str, user: dict = Depends(get_current_user)):
    """Returns the invoice PDF. Allowed for the pro who issued it, OR for the
    homeowner the invoice was issued to (so they can open it from chat / email)."""
    try:
        inv = await db.pro_invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    is_owner_pro = pro and inv["pro_id"] == str(pro["_id"])
    is_target_homeowner = inv.get("homeowner_id") == user["_id"]
    if not (is_owner_pro or is_target_homeowner):
        raise HTTPException(status_code=403, detail="Not allowed to view this invoice")
    pdf_bytes = await render_with_template(inv)
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{inv["invoice_number"]}.pdf"'},
    )


@router.get("/templates/list")
async def list_invoice_templates(user: dict = Depends(get_current_user)):
    """Returns the 3 white-label invoice template options + the pro's current pick."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Not a tradesperson")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    current = migrate_template_key((pro or {}).get("invoice_template", "pastel_mint"))
    return {
        "templates": TEMPLATE_OPTIONS,
        "current": current,
        "logo_url": (f"/api/portfolio/{pro['logo_file_id']}" if pro and pro.get("logo_file_id") else None),
    }


@router.get("/templates/{template_key}/preview")
async def preview_invoice_template(template_key: str, user: dict = Depends(get_current_user)):
    """Renders a dummy invoice in the chosen template so the pro can preview before committing.
    Accepts both new (iter41) and legacy template keys."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Not a tradesperson")
    from services.invoice_templates import is_known_template_key
    if not is_known_template_key(template_key):
        raise HTTPException(status_code=404, detail="Unknown template")
    migrated = migrate_template_key(template_key) or "pastel_mint"
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    from services.pro_invoicing import get_pro_snapshot
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    pro_snap = await get_pro_snapshot(str(pro["_id"]))
    pro_snap["invoice_template"] = migrated
    # Build a dummy invoice payload
    dummy = {
        "invoice_number": "RG-2026-PREVIEW",
        "pro_id": str(pro["_id"]),
        "pro_snapshot": pro_snap,
        "customer_snapshot": {
            "name": "Maria Beispiel",
            "address": "Musterstraße 12/3",
            "postal_code": "1010",
            "city": "Wien",
            "country": "AT",
        },
        "line_items": [
            {"description": "Beratung & Vor-Ort-Termin", "qty": 2, "unit_net": 75.0,
             "line_net": 150.0, "vat_rate": 0 if pro_snap.get("is_kleinunternehmer") else 20,
             "vat_amount": 0 if pro_snap.get("is_kleinunternehmer") else 30.0,
             "line_total_brutto": 150.0 if pro_snap.get("is_kleinunternehmer") else 180.0},
            {"description": "Materialaufwand (Pauschale)", "qty": 1, "unit_net": 220.0,
             "line_net": 220.0, "vat_rate": 0 if pro_snap.get("is_kleinunternehmer") else 20,
             "vat_amount": 0 if pro_snap.get("is_kleinunternehmer") else 44.0,
             "line_total_brutto": 220.0 if pro_snap.get("is_kleinunternehmer") else 264.0},
        ],
        "net_total": 370.0,
        "vat_total": 0.0 if pro_snap.get("is_kleinunternehmer") else 74.0,
        "vat_rate": 0 if pro_snap.get("is_kleinunternehmer") else 20,
        "brutto_total": 370.0 if pro_snap.get("is_kleinunternehmer") else 444.0,
        "payment_due_days": 14,
        "invoice_date": datetime.now(timezone.utc),
        "note": "",
    }
    pdf_bytes = await render_with_template(dummy)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="preview-{template_key}.pdf"'},
    )


@router.post("/{invoice_id}/mark-paid")
async def mark_paid(invoice_id: str, user: dict = Depends(get_current_user)):
    """Pro can manually mark an invoice paid once they confirm receipt of the SEPA payment."""
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    try:
        inv = await db.pro_invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not inv or inv["pro_id"] != str(pro["_id"]):
        raise HTTPException(status_code=404, detail="Invoice not found")
    await db.pro_invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Marked paid"}



class ShareInvoiceRequest(BaseModel):
    to_user_id: str
    note: Optional[str] = None


@router.post("/{invoice_id}/share-message")
async def share_via_message(invoice_id: str, data: ShareInvoiceRequest, user: dict = Depends(get_current_user)):
    """Pro can share an issued invoice with the homeowner via in-app message.
    Creates a message with kind='invoice_share' AND fires a Web Push so the
    homeowner is alerted right away."""
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    try:
        inv = await db.pro_invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not inv or inv["pro_id"] != str(pro["_id"]):
        raise HTTPException(status_code=404, detail="Invoice not found")

    msg_body = (
        f"\U0001F4C4 {inv['invoice_number']} \u2014 \u20AC{inv['brutto_total']:.2f}"
        + (f"\n\n{data.note}" if data.note else "")
    )
    msg_doc = {
        "from_id": user["_id"],
        "to_id": data.to_user_id,
        "job_id": inv.get("job_id"),
        "text": msg_body,
        "kind": "invoice_share",
        "invoice_id": invoice_id,
        "invoice_number": inv["invoice_number"],
        "invoice_brutto": inv["brutto_total"],
        "sent_at": datetime.now(timezone.utc),
        "is_read": False,
    }
    await db.messages.insert_one(msg_doc)

    # Persist bell notification + fire Web Push (best-effort; never break the
    # main flow if push delivery fails)
    sender_name = user.get("name") or "Your contractor"
    title = f"New invoice from {sender_name}"
    body = f"{inv['invoice_number']} \u2014 \u20AC{inv['brutto_total']:.2f}"
    link_to = f"/messages?job={inv.get('job_id') or ''}&to={user['_id']}"
    try:
        await db.notifications.insert_one({
            "user_id": data.to_user_id,
            "kind": "invoice_share",
            "title": title,
            "body": body,
            "link_to": link_to,
            "invoice_id": invoice_id,
            "is_read": False,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        logger.exception("Persist bell notification (invoice_share) failed")
    try:
        from push import send_push_to_user
        await send_push_to_user(
            data.to_user_id,
            {
                "title": title,
                "body": body,
                "url": link_to,
                "tag": f"invoice-{invoice_id}",
                "requireInteraction": True,        # surfaces it more prominently
            },
        )
    except Exception:
        logger.exception("Web Push (invoice_share) to %s failed", data.to_user_id)
    return {"message": "Invoice shared in chat"}



# ──────────────────────────────────────────────
# Mark-as-paid + partial payment tracking
# ──────────────────────────────────────────────
class PaymentBody(BaseModel):
    amount_eur: float = Field(gt=0)
    method: str = Field(default="transfer")  # transfer | cash | card | other
    paid_on: Optional[datetime] = None  # defaults to now
    note: Optional[str] = None


@router.post("/{invoice_id}/payments")
async def record_payment(invoice_id: str, body: PaymentBody, user: dict = Depends(get_current_user)):
    """Record a payment received on an invoice. Multiple payments allowed
    (partial-payment tracking). Returns the updated invoice with computed
    paid_total / outstanding / payment_status fields.
    """
    pro = await _require_pro_with_toolkit(user)
    try:
        inv = await db.pro_invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not inv or inv["pro_id"] != str(pro["_id"]):
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.get("is_storno"):
        raise HTTPException(status_code=400, detail="Cannot record payment on a storno (credit note).")
    if inv.get("cancelled_by_storno_id"):
        raise HTTPException(status_code=400, detail="Invoice has been cancelled by a storno.")

    method = body.method.lower()
    if method not in {"transfer", "cash", "card", "other"}:
        raise HTTPException(status_code=400, detail="Bad payment method")

    payment = {
        "id": str(ObjectId()),
        "amount_eur": round(float(body.amount_eur), 2),
        "method": method,
        "paid_on": body.paid_on or datetime.now(timezone.utc),
        "note": (body.note or "").strip()[:500],
        "recorded_at": datetime.now(timezone.utc),
    }
    await db.pro_invoices.update_one(
        {"_id": inv["_id"]},
        {"$push": {"payments": payment}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )

    # Recompute aggregate fields after the push
    inv = await db.pro_invoices.find_one({"_id": inv["_id"]})
    paid_total = round(sum(float(p.get("amount_eur", 0) or 0) for p in (inv.get("payments") or [])), 2)
    brutto = float(inv.get("brutto_total") or 0)
    outstanding = round(max(0.0, brutto - paid_total), 2)
    status = "paid" if paid_total + 0.01 >= brutto else ("partial" if paid_total > 0 else "issued")
    await db.pro_invoices.update_one(
        {"_id": inv["_id"]},
        {"$set": {
            "paid_total": paid_total,
            "outstanding": outstanding,
            "payment_status": status,
            "fully_paid_at": (datetime.now(timezone.utc) if status == "paid" and not inv.get("fully_paid_at") else inv.get("fully_paid_at")),
        }},
    )
    inv = await db.pro_invoices.find_one({"_id": inv["_id"]})
    return serialize_doc(inv)


@router.delete("/{invoice_id}/payments/{payment_id}")
async def delete_payment(invoice_id: str, payment_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pro_with_toolkit(user)
    try:
        inv = await db.pro_invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not inv or inv["pro_id"] != str(pro["_id"]):
        raise HTTPException(status_code=404, detail="Invoice not found")

    await db.pro_invoices.update_one(
        {"_id": inv["_id"]},
        {"$pull": {"payments": {"id": payment_id}}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )
    inv = await db.pro_invoices.find_one({"_id": inv["_id"]})
    paid_total = round(sum(float(p.get("amount_eur", 0) or 0) for p in (inv.get("payments") or [])), 2)
    brutto = float(inv.get("brutto_total") or 0)
    outstanding = round(max(0.0, brutto - paid_total), 2)
    status = "paid" if paid_total + 0.01 >= brutto else ("partial" if paid_total > 0 else "issued")
    fully_paid_at = inv.get("fully_paid_at") if status == "paid" else None
    await db.pro_invoices.update_one(
        {"_id": inv["_id"]},
        {"$set": {
            "paid_total": paid_total,
            "outstanding": outstanding,
            "payment_status": status,
            "fully_paid_at": fully_paid_at,
        }},
    )
    return {"deleted": True, "paid_total": paid_total, "outstanding": outstanding, "payment_status": status}


# ──────────────────────────────────────────────
# Storno (credit note) — Austrian compliance
# Invoices cannot be deleted once issued; the only legal correction is a
# storno that reverses every line item, gets its own sequential number, and
# references the original via storno_of_invoice_id. The original gets
# cancelled_by_storno_id set so it surfaces as "cancelled" in the UI.
# ──────────────────────────────────────────────
from services.pro_invoicing import next_pro_invoice_number, get_pro_snapshot  # noqa: E402


class StornoBody(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


@router.post("/{invoice_id}/storno")
async def issue_storno(invoice_id: str, body: StornoBody, user: dict = Depends(get_current_user)):
    """Issue a Storno (credit note) for an existing invoice.

    Creates a NEW invoice with the same customer + line items but negative
    amounts. Marks the original as cancelled. Both surface on Tax + USt-VA
    so the totals correctly net out.
    """
    pro = await _require_pro_with_toolkit(user)
    try:
        orig = await db.pro_invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not orig or orig["pro_id"] != str(pro["_id"]):
        raise HTTPException(status_code=404, detail="Invoice not found")
    if orig.get("is_storno"):
        raise HTTPException(status_code=400, detail="Cannot storno a storno.")
    if orig.get("cancelled_by_storno_id"):
        raise HTTPException(status_code=400, detail="Invoice already cancelled by storno {0}".format(orig["cancelled_by_storno_id"]))

    pro_snap = await get_pro_snapshot(str(pro["_id"]))
    # Mirror line items with NEGATIVE amounts; keep VAT rate so USt-VA nets correctly
    neg_lines = []
    for li in orig.get("line_items", []):
        neg_lines.append({
            "description": f"Storno: {li.get('description', '')}".strip()[:300],
            "qty": float(li.get("qty", 1)),
            "unit_net": -abs(float(li.get("unit_net", 0))),
            "vat_rate": int(li.get("vat_rate") or 0),
            "line_net": -abs(float(li.get("line_net") or 0)),
            "vat_amount": -abs(float(li.get("vat_amount") or 0)),
            "line_total_brutto": -abs(float(li.get("line_total_brutto") or 0)),
        })
    storno_no = await next_pro_invoice_number(str(pro["_id"]))
    now = datetime.now(timezone.utc)
    storno_doc = {
        "invoice_number": storno_no,
        "pro_id": str(pro["_id"]),
        "job_id": orig.get("job_id"),
        "homeowner_id": orig.get("homeowner_id"),
        "pro_snapshot": pro_snap,
        "customer_snapshot": orig.get("customer_snapshot", {}),
        "line_items": neg_lines,
        "net_total": -abs(float(orig.get("net_total") or 0)),
        "vat_total": -abs(float(orig.get("vat_total") or 0)),
        "vat_rate": int(orig.get("vat_rate") or 0),
        "brutto_total": -abs(float(orig.get("brutto_total") or 0)),
        "currency": orig.get("currency", "eur"),
        "status": "issued",
        "payment_status": "storno",
        "is_storno": True,
        "storno_of_invoice_id": str(orig["_id"]),
        "storno_of_invoice_number": orig["invoice_number"],
        "storno_reason": (body.reason or "").strip()[:500],
        "kleinunternehmer_note": pro_snap["is_kleinunternehmer"],
        "note": f"Stornorechnung zu {orig['invoice_number']}" + (f" · {body.reason}" if body.reason else ""),
        "payment_due_days": 0,
        "invoice_date": now,
        "created_at": now,
    }
    res = await db.pro_invoices.insert_one(storno_doc)
    storno_doc["_id"] = res.inserted_id

    # Mark the original as cancelled
    await db.pro_invoices.update_one(
        {"_id": orig["_id"]},
        {"$set": {
            "cancelled_by_storno_id": str(res.inserted_id),
            "cancelled_by_storno_number": storno_no,
            "cancelled_at": now,
            "payment_status": "cancelled",
        }},
    )

    return serialize_doc(storno_doc)
