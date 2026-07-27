"""GDPR / data-subject-rights endpoints.

Endpoints:
  - POST /api/privacy/data-rights-request      (public)
  - POST /api/privacy/removal-request          (public — for non-user listings)
  - GET  /api/me/export                        (auth)   data portability
  - DELETE /api/me                             (auth)   right to erasure (7-day grace)
  - POST /api/me/cancel-deletion               (auth)   undo within grace
  - PUT  /api/me/marketing-prefs               (auth)   right to object
  - GET  /api/me/consent                       (auth)   view current consent record
  - POST /api/me/consent                       (auth)   record cookie / marketing consent

Admin:
  - GET  /api/admin/data-rights-requests       (admin)  queue + SLA tracker
  - PUT  /api/admin/data-rights-requests/{id}  (admin)  update status
"""
import io
import json
import zipfile
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId

from auth import get_current_user, require_admin
from database import db
from utils import serialize_doc

router = APIRouter(prefix="/privacy")
me_router = APIRouter(prefix="/me")
admin_privacy_router = APIRouter(prefix="/admin")

# Current published version of the legal documents.
# Bump whenever the policy text changes — users will need to re-accept.
CURRENT_POLICY_VERSION = "1.0-draft-2026-02-28"

# Grace period for account deletion.
DELETE_GRACE_DAYS = 7


# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────
class DataRightsRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    request_type: str  # access | rectification | erasure | restriction | portability | object | withdraw_consent
    details: Optional[str] = Field(default="", max_length=2000)


class RemovalRequest(BaseModel):
    listing_id: Optional[str] = None
    business_name: Optional[str] = Field(default="", max_length=200)
    email: EmailStr
    reason: Optional[str] = Field(default="", max_length=1000)


class ConsentRecord(BaseModel):
    cookies_essential: bool = True   # always true (necessary)
    cookies_analytics: bool = False
    cookies_marketing: bool = False
    marketing_emails: bool = False
    policy_version: Optional[str] = None


class MarketingPrefs(BaseModel):
    marketing_emails: bool


# ──────────────────────────────────────────────
# Public — data rights & removal forms
# ──────────────────────────────────────────────
@router.post("/data-rights-request")
async def submit_data_rights_request(data: DataRightsRequest, request: Request):
    """Persist a GDPR Article 12-22 request. 30-day SLA enforced by admin queue."""
    allowed = {"access", "rectification", "erasure", "restriction",
               "portability", "object", "withdraw_consent"}
    if data.request_type not in allowed:
        raise HTTPException(status_code=400, detail="Invalid request_type")

    now = datetime.now(timezone.utc)
    doc = {
        "kind": "data_rights",
        "name": data.name.strip(),
        "email": data.email.lower().strip(),
        "request_type": data.request_type,
        "details": (data.details or "").strip(),
        "status": "open",
        "submitted_at": now,
        "due_at": now + timedelta(days=30),
        "ip": (request.client.host if request.client else "unknown"),
        "user_agent": request.headers.get("user-agent", ""),
    }
    res = await db.data_rights_requests.insert_one(doc)
    return {"id": str(res.inserted_id), "due_at": doc["due_at"].isoformat()}


@router.post("/removal-request")
async def submit_removal_request(data: RemovalRequest, request: Request):
    """For non-user business-listing removal (legitimate-interest objection).
    Currently we don't scrape, but the endpoint is provided per legal docs."""
    if not (data.listing_id or (data.business_name and data.business_name.strip())):
        raise HTTPException(status_code=400, detail="listing_id or business_name required")

    now = datetime.now(timezone.utc)
    doc = {
        "kind": "removal",
        "listing_id": data.listing_id,
        "business_name": (data.business_name or "").strip(),
        "email": data.email.lower().strip(),
        "reason": (data.reason or "").strip(),
        "status": "open",
        "submitted_at": now,
        "due_at": now + timedelta(days=30),
        "ip": (request.client.host if request.client else "unknown"),
    }
    res = await db.data_rights_requests.insert_one(doc)
    return {"id": str(res.inserted_id), "due_at": doc["due_at"].isoformat()}


# ──────────────────────────────────────────────
# Authenticated — me endpoints
# ──────────────────────────────────────────────
@me_router.get("/consent")
async def get_consent(user: dict = Depends(get_current_user)):
    """Return the latest consent record + current published policy version."""
    consent = await db.consent_records.find_one(
        {"user_id": user["_id"]}, sort=[("recorded_at", -1)]
    )
    return {
        "consent": serialize_doc(consent) if consent else None,
        "current_policy_version": CURRENT_POLICY_VERSION,
    }


@me_router.post("/consent")
async def record_consent(data: ConsentRecord, user: dict = Depends(get_current_user)):
    """Append a new consent record (immutable history)."""
    doc = {
        "user_id": user["_id"],
        "cookies_essential": True,
        "cookies_analytics": bool(data.cookies_analytics),
        "cookies_marketing": bool(data.cookies_marketing),
        "marketing_emails": bool(data.marketing_emails),
        "policy_version": data.policy_version or CURRENT_POLICY_VERSION,
        "recorded_at": datetime.now(timezone.utc),
    }
    await db.consent_records.insert_one(doc)
    # Mirror marketing pref to user doc for fast access
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"notif_email_marketing": doc["marketing_emails"]}}
    )
    return {"ok": True, "recorded_at": doc["recorded_at"].isoformat()}


@me_router.put("/marketing-prefs")
async def update_marketing_prefs(prefs: MarketingPrefs, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"notif_email_marketing": bool(prefs.marketing_emails)}}
    )
    # Audit log
    await db.consent_records.insert_one({
        "user_id": user["_id"],
        "kind": "marketing_pref_change",
        "marketing_emails": bool(prefs.marketing_emails),
        "recorded_at": datetime.now(timezone.utc),
    })
    return {"ok": True}


@me_router.get("/export")
async def export_my_data(user: dict = Depends(get_current_user)):
    """Right to data portability (GDPR Art. 20) — returns a ZIP containing
    a single JSON file with all personal data we hold about the user.
    Stream is sent inline so the browser triggers a download."""
    uid = user["_id"]

    # Pull all related collections
    user_doc = await db.users.find_one({"_id": ObjectId(uid)})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    user_doc.pop("password_hash", None)

    pro_profile = await db.pro_profiles.find_one({"user_id": uid})
    jobs_posted = await db.jobs.find({"posted_by_id": uid}).to_list(1000)
    quotes_sent = await db.quotes.find({"pro_id": str((pro_profile or {}).get("_id", ""))}).to_list(1000) if pro_profile else []
    messages = await db.messages.find({"$or": [{"from_id": uid}, {"to_id": uid}]}).to_list(5000)
    bookings = await db.bookings.find({"$or": [{"homeowner_id": uid}, {"pro_id": str((pro_profile or {}).get("_id", ""))}]}).to_list(1000)
    fee_logs = await db.fee_logs.find({"pro_id": str((pro_profile or {}).get("_id", ""))}).to_list(1000) if pro_profile else []
    notifications = await db.notifications.find({"user_id": uid}).to_list(1000)
    consent_history = await db.consent_records.find({"user_id": uid}).sort("recorded_at", -1).to_list(200)

    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "exported_for": user["email"],
        "policy_version": CURRENT_POLICY_VERSION,
        "data": {
            "account": serialize_doc(user_doc),
            "pro_profile": serialize_doc(pro_profile) if pro_profile else None,
            "jobs_posted": [serialize_doc(d) for d in jobs_posted],
            "quotes_sent": [serialize_doc(d) for d in quotes_sent],
            "messages": [serialize_doc(d) for d in messages],
            "bookings": [serialize_doc(d) for d in bookings],
            "fee_logs": [serialize_doc(d) for d in fee_logs],
            "notifications": [serialize_doc(d) for d in notifications],
            "consent_history": [serialize_doc(d) for d in consent_history],
        },
    }

    # Wrap in a ZIP so payloads with attachments don't blow up; future-proof.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(
            "servicemarket_data_export.json",
            json.dumps(payload, default=str, indent=2, ensure_ascii=False),
        )
        z.writestr(
            "README.txt",
            "This archive contains all personal data ServiceMarket holds about you, "
            "exported under GDPR Article 20 (right to data portability).\n\n"
            "Format: JSON.\n"
            f"Exported: {payload['exported_at']}\n"
            f"For: {payload['exported_for']}\n\n"
            "Questions? Contact contact@servicemarket.at.\n",
        )
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="servicemarket_data_export.zip"'},
    )


@me_router.delete("")
async def request_account_deletion(user: dict = Depends(get_current_user)):
    """Right to erasure (GDPR Art. 17). Soft-deletes immediately, hard-deletes after grace."""
    now = datetime.now(timezone.utc)
    grace_until = now + timedelta(days=DELETE_GRACE_DAYS)
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {
            "deletion_requested_at": now,
            "deletion_scheduled_for": grace_until,
            "is_deleted": True,  # frontend hides the account
        }}
    )
    await db.consent_records.insert_one({
        "user_id": user["_id"],
        "kind": "deletion_requested",
        "scheduled_for": grace_until,
        "recorded_at": now,
    })
    return {
        "ok": True,
        "scheduled_for": grace_until.isoformat(),
        "grace_days": DELETE_GRACE_DAYS,
    }


@me_router.post("/cancel-deletion")
async def cancel_deletion(user: dict = Depends(get_current_user)):
    """Cancel an in-grace deletion."""
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$unset": {"deletion_requested_at": "", "deletion_scheduled_for": "", "is_deleted": ""}}
    )
    await db.consent_records.insert_one({
        "user_id": user["_id"],
        "kind": "deletion_cancelled",
        "recorded_at": datetime.now(timezone.utc),
    })
    return {"ok": True}


# ──────────────────────────────────────────────
# Admin — data rights queue
# ──────────────────────────────────────────────
@admin_privacy_router.get("/data-rights-requests")
async def list_data_rights_requests(
    status: Optional[str] = None,
    _: dict = Depends(require_admin),
):
    q = {}
    if status:
        q["status"] = status
    docs = await db.data_rights_requests.find(q).sort("submitted_at", -1).to_list(500)
    now = datetime.now(timezone.utc)
    out = []
    for d in docs:
        d_ser = serialize_doc(d)
        due = d.get("due_at")
        if isinstance(due, datetime):
            # Mongo may return naive datetimes; coerce to UTC-aware before comparison
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            d_ser["overdue"] = bool(d.get("status") == "open" and due < now)
            d_ser["days_remaining"] = max(0, (due - now).days)
        out.append(d_ser)
    return {"requests": out, "total": len(out)}


@admin_privacy_router.put("/data-rights-requests/{req_id}")
async def update_data_rights_request(
    req_id: str,
    status: str,
    notes: str = "",
    admin: dict = Depends(require_admin),
):
    if status not in {"open", "in_progress", "completed", "rejected"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    try:
        oid = ObjectId(req_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    update = {
        "status": status,
        "last_updated_at": datetime.now(timezone.utc),
        "handled_by_admin_id": admin["_id"],
    }
    if notes:
        update["admin_notes"] = notes
    if status == "completed":
        update["completed_at"] = datetime.now(timezone.utc)
    res = await db.data_rights_requests.update_one({"_id": oid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}
