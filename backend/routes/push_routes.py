"""Web Push subscription endpoints + matching job notification dispatcher."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from database import db
from push import public_key, send_push_to_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Standard-plan pros receive the push 15 minutes after the job is posted.
STANDARD_DELAY_SECONDS = 15 * 60


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=10)
    keys: PushKeys


@router.get("/push/public-key")
async def get_public_key():
    """Public endpoint — frontend reads this to subscribe via the browser Push API."""
    key = public_key()
    if not key:
        raise HTTPException(status_code=503, detail="Push notifications not configured")
    return {"public_key": key}


@router.post("/push/subscribe")
async def subscribe(data: PushSubscriptionIn, request: Request, user: dict = Depends(get_current_user)):
    """Upsert (one subscription per endpoint, owned by the current user)."""
    user_agent = request.headers.get("user-agent", "")[:300]
    now = datetime.now(timezone.utc)

    await db.push_subscriptions.update_one(
        {"endpoint": data.endpoint},
        {
            "$set": {
                "user_id": user["_id"],
                "endpoint": data.endpoint,
                "keys": data.keys.model_dump(),
                "user_agent": user_agent,
                "last_used_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    # Mark on user that push is enabled (cheap denormalized flag for UI)
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"push_enabled": True}},
    )
    return {"message": "Subscribed", "enabled": True}


@router.post("/push/unsubscribe")
async def unsubscribe(data: dict, user: dict = Depends(get_current_user)):
    endpoint = (data or {}).get("endpoint")
    query = {"user_id": user["_id"]}
    if endpoint:
        query["endpoint"] = endpoint
    deleted = await db.push_subscriptions.delete_many(query)
    remaining = await db.push_subscriptions.count_documents({"user_id": user["_id"]})
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"push_enabled": remaining > 0}},
    )
    return {"message": "Unsubscribed", "deleted": deleted.deleted_count, "enabled": remaining > 0}


@router.post("/push/test")
async def push_test(user: dict = Depends(get_current_user)):
    """Self-test — sends a push to the current user's subscriptions."""
    n = await send_push_to_user(
        user["_id"],
        {
            "title": "ServiceMarket — test push 🔔",
            "body": "If you see this, instant job alerts are working.",
            "url": "/",
            "tag": "push-test",
        },
    )
    return {"delivered": n}


async def _user_pref(user_id: str, key: str, default: bool = True) -> bool:
    """Check a per-event notification preference. Master notif_email switch and
    the per-event toggle must BOTH be enabled."""
    try:
        u = await db.users.find_one({"_id": ObjectId(user_id)}, {key: 1, "notif_email": 1})
    except Exception:
        return default
    if not u:
        return False
    if u.get("notif_email") is False:
        return False
    val = u.get(key)
    return default if val is None else bool(val)


async def notify_new_review(pro_user_id: str, review_id: str, rating: int, homeowner_name: str = ""):
    """In-app notification + Web Push when a homeowner posts a new review."""
    if not pro_user_id:
        return
    if not await _user_pref(pro_user_id, "notif_new_review"):
        return
    stars = "⭐" * max(1, min(rating or 5, 5))
    title = f"New {rating}-star review {stars}"
    body = f"From {homeowner_name}" if homeowner_name else "A customer just left a review"
    await db.notifications.insert_one({
        "user_id": pro_user_id,
        "kind": "new_review",
        "title": title,
        "body": body,
        "link_to": "/settings?tab=portfolio",
        "review_id": review_id,
        "is_read": False,
        "created_at": datetime.now(timezone.utc),
    })
    try:
        await send_push_to_user(
            pro_user_id,
            {"title": title, "body": body, "url": "/settings?tab=portfolio", "tag": f"review-{review_id}"},
        )
    except Exception:
        logger.exception("Push (new_review) to %s failed", pro_user_id)


async def _send_match_alert(pro_user_id: str, job_id: str, job_title: str, job_city: str, delayed: bool = False):
    """Insert in-app notification + send Web Push for a job match."""
    if delayed:
        # Re-check the job still exists & is open before firing the delayed push
        try:
            job = await db.jobs.find_one({"_id": ObjectId(job_id)})
        except Exception:
            return
        if not job or job.get("status") != "open":
            return

    body = f"{job_title} · {job_city}".strip(" ·")
    await db.notifications.insert_one({
        "user_id": pro_user_id,
        "kind": "new_job_match",
        "title": "New matching job posted" + (" (now open to all)" if delayed else ""),
        "body": body,
        "link_to": f"/jobs/{job_id}",
        "job_id": job_id,
        "is_read": False,
        "created_at": datetime.now(timezone.utc),
    })
    try:
        await send_push_to_user(
            pro_user_id,
            {
                "title": "New matching job 🛠️",
                "body": body,
                "url": f"/jobs/{job_id}",
                "tag": f"job-{job_id}",
            },
        )
    except Exception:
        logger.exception("Push to %s failed", pro_user_id)


# ──────────────────────────────────────────────
# Job-match dispatcher — called from job creation
# ──────────────────────────────────────────────
async def notify_matching_pros(job: dict) -> int:
    """For a newly posted job, find pros whose service_categories include the job's
    category AND whose user country matches AND whose service_areas (postal/city
    substrings) match the job city. Pro-plan pros get the alert immediately; Standard
    plan pros get it after a 15-minute delay (the Pro-plan advantage).
    """
    category = job.get("category")
    country = job.get("country") or ""
    city = (job.get("city") or "").strip().lower()
    job_id = str(job["_id"]) if isinstance(job.get("_id"), ObjectId) else job.get("id")
    job_title = job.get("title", "New job")
    job_city = job.get("city") or ""
    homeowner_id = job.get("posted_by_id")

    if not category or not job_id:
        return 0

    pros = await db.pro_profiles.find({"service_categories": category}).to_list(500)
    count = 0
    standard_targets = []

    for pro in pros:
        pro_user_id = pro.get("user_id")
        if not pro_user_id or pro_user_id == homeowner_id:
            continue

        try:
            pro_user = await db.users.find_one({"_id": ObjectId(pro_user_id)})
        except Exception:
            continue
        if not pro_user or pro_user.get("banned"):
            continue
        if country and pro_user.get("country") and pro_user["country"] != country:
            continue

        areas = pro.get("service_areas") or []
        if areas and city:
            haystack = " ".join(str(a).lower() for a in areas)
            if city not in haystack and (pro_user.get("city") or "").lower() != city:
                continue

        if pro.get("plan_tier") in ("pro", "explorer"):
            # Pro / Explorer plan → instant alert
            await _send_match_alert(pro_user_id, job_id, job_title, job_city, delayed=False)
            count += 1
        else:
            # Standard → schedule delayed alert (in-memory; production should use a real scheduler)
            standard_targets.append(pro_user_id)

    # Fire the delayed pushes concurrently (each waits 15 min independently)
    if standard_targets:
        async def _delayed_batch():
            await asyncio.sleep(STANDARD_DELAY_SECONDS)
            for uid in standard_targets:
                try:
                    await _send_match_alert(uid, job_id, job_title, job_city, delayed=True)
                except Exception:
                    logger.exception("Delayed alert failed for %s", uid)
        asyncio.create_task(_delayed_batch())

    return count
