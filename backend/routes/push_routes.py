"""Web Push subscription endpoints."""

import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from database import db
from push import public_key, send_push_to_user

logger = logging.getLogger(__name__)
router = APIRouter()


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
