"""Feedback + Support tickets routes — iter36

Customer feedback for the platform (feedback / feature / issue) AND
job-related complaint tickets, all surfaced in a unified user view
(/feedback) and admin Tabs (Feedback + Support).
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, require_admin
from database import db

router = APIRouter(prefix="/feedback")
admin_router = APIRouter(prefix="/admin/feedback")
support_admin_router = APIRouter(prefix="/admin/support")


def _serialize(doc: dict) -> dict:
    if not doc:
        return doc
    d = dict(doc)
    if "_id" in d:
        d["id"] = str(d.pop("_id"))
    for k, v in list(d.items()):
        if isinstance(v, ObjectId):
            d[k] = str(v)
    return d


# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────
FEEDBACK_KINDS = {"feedback", "feature", "issue"}
SUPPORT_CATEGORIES = {"no_show", "quality", "pricing", "communication", "other"}
STATUSES = {"open", "in_progress", "resolved", "closed"}


class FeedbackCreate(BaseModel):
    kind: str = Field(..., description="feedback | feature | issue")
    subject: str = Field(..., min_length=3, max_length=140)
    message: str = Field(..., min_length=5, max_length=4000)
    rating: Optional[int] = Field(None, ge=1, le=5)


class SupportTicketCreate(BaseModel):
    job_id: str
    category: str = Field(..., description="no_show | quality | pricing | communication | other")
    subject: str = Field(..., min_length=3, max_length=140)
    message: str = Field(..., min_length=5, max_length=4000)


class AdminUpdate(BaseModel):
    status: Optional[str] = None
    admin_response: Optional[str] = None


# ──────────────────────────────────────────────
# Public — user submits + lists own
# ──────────────────────────────────────────────
@router.post("")
async def submit_feedback(body: FeedbackCreate, user: dict = Depends(get_current_user)):
    if body.kind not in FEEDBACK_KINDS:
        raise HTTPException(status_code=400, detail="Bad kind")
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user["_id"] if isinstance(user["_id"], ObjectId) else ObjectId(user["_id"]),
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "user_role": user.get("role", ""),
        "kind": body.kind,
        "subject": body.subject.strip(),
        "message": body.message.strip(),
        "rating": body.rating,
        "status": "open",
        "admin_response": None,
        "created_at": now,
        "updated_at": now,
    }
    res = await db.feedback.insert_one(doc)
    doc["_id"] = res.inserted_id

    # Notify all admin users about new feedback/issues
    admins = await db.users.find({"role": "admin"}, {"_id": 1}).to_list(10)
    if admins:
        notif_type = "new_issue" if body.kind == "issue" else "new_feedback"
        notif_title = f"New {'Issue Report' if body.kind == 'issue' else 'Platform Feedback'}"
        notif_body = f"{user.get('name','User')} — {body.subject[:60]}"
        link = "/admin?tab=feedback" if body.kind in ("feedback", "feature") else "/admin?tab=support"
        await db.notifications.insert_many([
            {
                "user_id": str(a["_id"]),
                "type": notif_type,
                "title": notif_title,
                "body": notif_body,
                "link_to": link,
                "is_read": False,
                "created_at": now,
            }
            for a in admins
        ])

    return _serialize(doc)


@router.post("/support")
async def submit_support_ticket(body: SupportTicketCreate, user: dict = Depends(get_current_user)):
    if body.category not in SUPPORT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Bad category")
    try:
        job = await db.jobs.find_one({"_id": ObjectId(body.job_id)})
    except Exception:
        job = None
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Anyone party to the job (homeowner or any pro who quoted/won) may file
    uid_str = str(user["_id"])
    # Jobs store the homeowner under `posted_by_id` (canonical field across the codebase)
    is_owner = str(job.get("posted_by_id")) == uid_str or str(job.get("homeowner_id")) == uid_str
    # Allow pros who have a quote on this job too
    if not is_owner:
        my_quote = await db.quotes.find_one({"job_id": body.job_id, "pro_user_id": uid_str})
        if not my_quote:
            raise HTTPException(status_code=403, detail="Not party to this job")
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user["_id"] if isinstance(user["_id"], ObjectId) else ObjectId(user["_id"]),
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "user_role": user.get("role", ""),
        "job_id": body.job_id,
        "job_title": job.get("title", ""),
        "category": body.category,
        "subject": body.subject.strip(),
        "message": body.message.strip(),
        "status": "open",
        "admin_response": None,
        "created_at": now,
        "updated_at": now,
    }
    res = await db.support_tickets.insert_one(doc)
    doc["_id"] = res.inserted_id

    # Notify admins about new support/complaint ticket
    admins = await db.users.find({"role": "admin"}, {"_id": 1}).to_list(10)
    if admins:
        await db.notifications.insert_many([
            {
                "user_id": str(a["_id"]),
                "type": "new_support_ticket",
                "title": "New Job Complaint",
                "body": f"{user.get('name','User')} — {body.subject[:60]}",
                "link_to": "/admin?tab=support",
                "is_read": False,
                "created_at": now,
            }
            for a in admins
        ])

    return _serialize(doc)


@router.get("/mine")
async def list_my_submissions(user: dict = Depends(get_current_user)):
    """Return BOTH feedback and support tickets for the current user, sorted desc."""
    uid_obj = user["_id"] if isinstance(user["_id"], ObjectId) else ObjectId(user["_id"])
    items: list = []
    async for d in db.feedback.find({"user_id": uid_obj}).sort("created_at", -1).limit(200):
        item = _serialize(d)
        item["entry_kind"] = "feedback"
        items.append(item)
    async for d in db.support_tickets.find({"user_id": uid_obj}).sort("created_at", -1).limit(200):
        item = _serialize(d)
        item["entry_kind"] = "support"
        items.append(item)
    items.sort(key=lambda x: x.get("created_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return {"items": items, "count": len(items)}


# ──────────────────────────────────────────────
# Admin — Feedback (platform feedback / features / issues)
# ──────────────────────────────────────────────
def _build_admin_query(kind: Optional[str], status: Optional[str],
                       q: Optional[str], year: Optional[int]) -> dict:
    query: dict = {}
    if kind and kind in FEEDBACK_KINDS:
        query["kind"] = kind
    if status and status in STATUSES:
        query["status"] = status
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"subject": rx}, {"message": rx}, {"user_name": rx}, {"user_email": rx}]
    if year:
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        query["created_at"] = {"$gte": start, "$lt": end}
    return query


@admin_router.get("")
async def admin_list_feedback(
    user: dict = Depends(require_admin),
    kind: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    year: Optional[int] = None,
    page: int = 1,
    per_page: int = 25,
):
    per_page = min(max(per_page, 1), 100)
    page = max(page, 1)
    query = _build_admin_query(kind, status, q, year)
    total = await db.feedback.count_documents(query)
    items = []
    async for d in db.feedback.find(query).sort("created_at", -1).skip((page - 1) * per_page).limit(per_page):
        items.append(_serialize(d))
    # Summary buckets (independent of filters)
    counts = {"all": await db.feedback.count_documents({})}
    for k in FEEDBACK_KINDS:
        counts[k] = await db.feedback.count_documents({"kind": k})
    for s in STATUSES:
        counts[f"status_{s}"] = await db.feedback.count_documents({"status": s})
    return {"items": items, "total": total, "page": page, "per_page": per_page, "counts": counts}


@admin_router.patch("/{fid}")
async def admin_update_feedback(fid: str, body: AdminUpdate, user: dict = Depends(require_admin)):
    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.status:
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="Bad status")
        updates["status"] = body.status
        if body.status == "resolved":
            updates["resolved_at"] = datetime.now(timezone.utc)
    if body.admin_response is not None:
        updates["admin_response"] = body.admin_response.strip()[:2000]
        updates["admin_response_by"] = str(user["_id"])
    res = await db.feedback.update_one({"_id": ObjectId(fid)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"updated": True}


# ──────────────────────────────────────────────
# Admin — Support tickets (job complaints)
# ──────────────────────────────────────────────
@support_admin_router.get("")
async def admin_list_support(
    user: dict = Depends(require_admin),
    category: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    year: Optional[int] = None,
    page: int = 1,
    per_page: int = 25,
):
    per_page = min(max(per_page, 1), 100)
    page = max(page, 1)
    query: dict = {}
    if category and category in SUPPORT_CATEGORIES:
        query["category"] = category
    if status and status in STATUSES:
        query["status"] = status
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"subject": rx}, {"message": rx}, {"user_name": rx}, {"user_email": rx}, {"job_title": rx}]
    if year:
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        query["created_at"] = {"$gte": start, "$lt": end}

    total = await db.support_tickets.count_documents(query)
    items = []
    async for d in db.support_tickets.find(query).sort("created_at", -1).skip((page - 1) * per_page).limit(per_page):
        items.append(_serialize(d))
    # Summary buckets
    counts: dict = {"all": await db.support_tickets.count_documents({})}
    for c in SUPPORT_CATEGORIES:
        counts[c] = await db.support_tickets.count_documents({"category": c})
    for s in STATUSES:
        counts[f"status_{s}"] = await db.support_tickets.count_documents({"status": s})
    return {"items": items, "total": total, "page": page, "per_page": per_page, "counts": counts}


@support_admin_router.patch("/{tid}")
async def admin_update_support(tid: str, body: AdminUpdate, user: dict = Depends(require_admin)):
    try:
        tid_obj = ObjectId(tid)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad ticket id")
    existing = await db.support_tickets.find_one({"_id": tid_obj})
    if not existing:
        raise HTTPException(status_code=404, detail="Ticket not found")

    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.status:
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="Bad status")
        updates["status"] = body.status
        if body.status == "resolved":
            updates["resolved_at"] = datetime.now(timezone.utc)
    if body.admin_response is not None:
        updates["admin_response"] = body.admin_response.strip()[:2000]
        updates["admin_response_by"] = str(user["_id"])
    await db.support_tickets.update_one({"_id": tid_obj}, {"$set": updates})

    # Iter45: notify the original submitter when status changes to resolved/closed.
    # NOTE: notifications.user_id MUST be stored as `str(...)` — misc_routes.get_notifications
    # queries by user["_id"] which is stringified in auth.py. Storing as ObjectId here
    # made the notification invisible to the recipient (iter45 testing-agent finding).
    new_status = updates.get("status")
    if new_status in ("resolved", "closed") and new_status != existing.get("status"):
        try:
            await db.notifications.insert_one({
                "user_id": str(existing["user_id"]),
                "kind": "support_resolved" if new_status == "resolved" else "support_closed",
                "title": f"Your complaint was {new_status}",
                "body": (
                    f"Your complaint \"{existing.get('subject','')[:60]}\" has been "
                    f"{new_status} by our support team."
                    + (f"\n\nResponse: {updates['admin_response'][:300]}" if updates.get("admin_response") else "")
                ),
                "link_to": "/feedback",
                "is_read": False,
                "created_at": datetime.now(timezone.utc),
                "metadata": {"ticket_id": tid, "job_id": existing.get("job_id")},
            })
        except Exception:
            pass
    return {"updated": True}
