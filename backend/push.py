"""Web Push helper — sends VAPID-authenticated Push messages via pywebpush.

Subscriptions are stored in db.push_subscriptions:
    { user_id, endpoint, keys: {p256dh, auth}, created_at, last_used_at, user_agent }
"""

import os
import json
import logging
from typing import Optional
from datetime import datetime, timezone

from pywebpush import webpush, WebPushException

from database import db

logger = logging.getLogger(__name__)

VAPID_PUBLIC = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_PEM = (os.environ.get("VAPID_PRIVATE_KEY_PEM", "") or "").replace("\\n", "\n").strip()
VAPID_EMAIL = os.environ.get("VAPID_CONTACT_EMAIL", "admin@servicemarket.eu")


def _vapid_claims() -> dict:
    return {"sub": f"mailto:{VAPID_EMAIL}"}


async def send_push_to_user(user_id: str, payload: dict, *, ttl: int = 60) -> int:
    """Send a Web Push to every active subscription owned by `user_id`.

    Returns the count of subscriptions successfully delivered. Cleans up any
    subscriptions the push service marked as expired (HTTP 404/410).
    """
    if not VAPID_PRIVATE_PEM:
        logger.warning("VAPID private key not configured; skipping push")
        return 0

    subs = await db.push_subscriptions.find({"user_id": user_id}).to_list(20)
    if not subs:
        return 0

    delivered = 0
    payload_json = json.dumps(payload, default=str)
    expired_ids = []

    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
                data=payload_json,
                vapid_private_key=VAPID_PRIVATE_PEM,
                vapid_claims=_vapid_claims(),
                ttl=ttl,
            )
            delivered += 1
            await db.push_subscriptions.update_one(
                {"_id": sub["_id"]},
                {"$set": {"last_used_at": datetime.now(timezone.utc)}},
            )
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):
                expired_ids.append(sub["_id"])
            else:
                logger.exception("WebPush failed for %s (status=%s)", user_id, status)
        except Exception:
            logger.exception("WebPush unexpected failure for %s", user_id)

    if expired_ids:
        await db.push_subscriptions.delete_many({"_id": {"$in": expired_ids}})
    return delivered


def public_key() -> Optional[str]:
    return VAPID_PUBLIC or None
