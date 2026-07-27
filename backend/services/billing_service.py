"""billing_service.py — Unified payment-activation logic.

Called by BOTH the Stripe webhook (server push) and the checkout-status
polling endpoint (browser poll), ensuring plans are activated regardless of
whether the browser stays open after Stripe redirect.

All functions are idempotent: calling them multiple times for the same
session_id is safe.
"""
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from database import db

import logging
logger = logging.getLogger(__name__)

# ── Re-export constants so server.py can import from here ───────────────────
from routes.billing_routes import TOOLKITS   # noqa: E402  (lazy avoids circular)

# Explorer intro plan: €1/month for the first 3 months (charged €3 upfront),
# unlocks ALL toolkits. After it ends the pro sees the Pro/Standard upgrade gate.
EXPLORER_DAYS = 90


def is_explorer_active(pro_profile: dict) -> bool:
    """Return True when the pro is on an active 3-month Explorer intro plan."""
    if (pro_profile or {}).get("plan_tier") != "explorer":
        return False
    ends = pro_profile.get("explorer_ends_at")
    if not ends:
        return False
    if ends.tzinfo is None:
        ends = ends.replace(tzinfo=timezone.utc)
    return ends > datetime.now(timezone.utc)


def is_trial_active(pro_profile: dict) -> bool:
    """Return True when the pro has an active 14-day trial."""
    trial_ends_at = pro_profile.get("trial_ends_at")
    if not trial_ends_at:
        return False
    now = datetime.now(timezone.utc)
    # ensure timezone-aware comparison
    if trial_ends_at.tzinfo is None:
        trial_ends_at = trial_ends_at.replace(tzinfo=timezone.utc)
    return trial_ends_at > now


def is_sub_active(pro_profile: dict) -> bool:
    """Return True when a paid Pro subscription (or trial / Explorer) is active."""
    if is_trial_active(pro_profile):
        return True
    if is_explorer_active(pro_profile):
        return True
    if pro_profile.get("plan_tier") != "pro":
        return False
    valid_until = pro_profile.get("sub_valid_until")
    if valid_until is None:
        # Legacy pro (before sub_valid_until was introduced) — treat as active
        return True
    if valid_until.tzinfo is None:
        valid_until = valid_until.replace(tzinfo=timezone.utc)
    return valid_until > datetime.now(timezone.utc)


def transaction_label(txn: dict) -> str:
    """Human-readable label for a payment_transactions row."""
    meta = txn.get("metadata", {})
    txn_type = meta.get("type") or ("subscription" if meta.get("plan") == "pro" else "")
    bp = meta.get("billing_period", "monthly")

    if txn_type in ("subscription", "pro") or meta.get("plan") == "pro":
        return f"Pro Plan ({'Annual' if bp == 'annual' else 'Monthly'})"
    if txn_type == "explorer" or meta.get("plan") == "explorer":
        return "Explorer Plan (3 months)"
    if txn_type == "toolkit":
        labels = {"invoice": "Invoice Toolkit", "tax": "Tax Toolkit", "pm": "PM Toolkit"}
        return labels.get(meta.get("toolkit_kind", ""), "Toolkit")
    if txn_type == "bundle":
        return "Pro Bundle (All Toolkits)"
    if txn_type == "contact_fees":
        return "Contact Fees"
    if txn_type == "monthly_invoice":
        return "Monthly Invoice"
    if txn_type == "pay_link":
        return "Customer Invoice Payment"
    return "Payment"


async def process_paid_session(session_id: str, payment_status: str) -> dict:
    """Activate the right feature based on a completed Stripe session.

    Returns a dict with 'activated' bool and optionally 'txn_type'.
    """
    if payment_status != "paid":
        return {"activated": False, "reason": "not_paid"}

    txn = await db.payment_transactions.find_one({"session_id": session_id})
    if not txn:
        logger.warning(f"process_paid_session: no transaction found for session {session_id}")
        return {"activated": False, "reason": "txn_not_found"}

    # Idempotency — skip if already processed
    if txn.get("payment_status") == "paid":
        return {"activated": True, "already_processed": True}

    now = datetime.now(timezone.utc)

    # Mark transaction as paid
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": "complete",
            "payment_status": "paid",
            "paid_at": now,
        }}
    )

    txn_meta = txn.get("metadata", {})
    txn_type = txn_meta.get("type") or ("subscription" if txn_meta.get("plan") == "pro" else None)
    owner_user_id = txn.get("user_id")

    # ── Contact fees ────────────────────────────────────────────────────────
    if txn_type == "contact_fees":
        fee_ids = txn_meta.get("fee_ids", [])
        obj_ids = []
        for f in fee_ids:
            try:
                obj_ids.append(ObjectId(f))
            except Exception:
                pass
        if obj_ids:
            await db.fee_log.update_many(
                {"_id": {"$in": obj_ids}},
                {"$set": {"status": "paid", "paid_at": now}}
            )
        pro_profile = await db.pro_profiles.find_one({"user_id": owner_user_id})
        if pro_profile:
            outstanding_total = 0
            async for f in db.fee_log.find({"pro_id": str(pro_profile["_id"]), "status": "pending"}):
                outstanding_total += f.get("amount", 0)
            await db.pro_profiles.update_one(
                {"_id": pro_profile["_id"]},
                {"$set": {"monthly_fees": round(outstanding_total, 2)}}
            )

    # ── Single toolkit ───────────────────────────────────────────────────────
    elif txn_type == "toolkit":
        kind = txn_meta.get("toolkit_kind", "invoice")
        cfg = TOOLKITS.get(kind, TOOLKITS["invoice"])
        pro_profile = await db.pro_profiles.find_one({"user_id": owner_user_id})
        if pro_profile:
            await db.pro_profiles.update_one(
                {"_id": pro_profile["_id"]},
                {"$set": {
                    cfg["flag"]: True,
                    f"{kind}_toolkit_started_at": now,
                    f"{kind}_toolkit_valid_until": now + timedelta(days=31),
                }},
            )

    # ── All-in-one bundle ────────────────────────────────────────────────────
    elif txn_type == "bundle":
        pro_profile = await db.pro_profiles.find_one({"user_id": owner_user_id})
        if pro_profile:
            await db.pro_profiles.update_one(
                {"_id": pro_profile["_id"]},
                {"$set": {
                    "has_invoice_toolkit": True,
                    "has_tax_toolkit": True,
                    "has_pm_toolkit": True,
                    "has_bundle": True,
                    "bundle_started_at": now,
                    "bundle_valid_until": now + timedelta(days=31),
                }},
            )

    # ── Explorer intro plan (€3 upfront for 3 months, all toolkits) ──────────
    elif txn_type == "explorer":
        pro_profile = await db.pro_profiles.find_one({"user_id": owner_user_id})
        if pro_profile:
            ends = now + timedelta(days=EXPLORER_DAYS)
            await db.pro_profiles.update_one(
                {"_id": pro_profile["_id"]},
                {
                    "$set": {
                        "plan_tier": "explorer",
                        "monthly_fees": 0.0,
                        "explorer_started_at": now,
                        "explorer_ends_at": ends,
                        "explorer_used": True,
                        "has_invoice_toolkit": True,
                        "has_tax_toolkit": True,
                        "has_pm_toolkit": True,
                        "has_bundle": True,
                        "invoice_toolkit_valid_until": ends,
                        "tax_toolkit_valid_until": ends,
                        "pm_toolkit_valid_until": ends,
                    },
                    "$unset": {"explorer_expired_at": "", "explorer_gate_dismissed": ""},
                },
            )
            await db.notifications.insert_one({
                "user_id": owner_user_id,
                "kind": "subscription",
                "title": "Explorer plan activated",
                "body": f"All toolkits unlocked until {ends.strftime('%d %b %Y')}. Enjoy the full experience!",
                "link_to": "/billing",
                "is_read": False,
                "created_at": now,
            })
        txn_type = "explorer"

    # ── Pro plan subscription ────────────────────────────────────────────────
    else:
        billing_period = txn_meta.get("billing_period", "monthly")
        days = 366 if billing_period == "annual" else 31
        pro_profile = await db.pro_profiles.find_one({"user_id": owner_user_id})
        if pro_profile:
            current_valid = pro_profile.get("sub_valid_until")
            if current_valid and current_valid.tzinfo is None:
                current_valid = current_valid.replace(tzinfo=timezone.utc)
            base = current_valid if (current_valid and current_valid > now) else now
            new_valid_until = base + timedelta(days=days)
            await db.pro_profiles.update_one(
                {"_id": pro_profile["_id"]},
                {"$set": {
                    "plan_tier": "pro",
                    "monthly_fees": 0.0,
                    "sub_started_at": now,
                    "sub_valid_until": new_valid_until,
                    "sub_billing_period": billing_period,
                    "sub_cancels_at": None,
                }}
            )
            await db.notifications.insert_one({
                "user_id": owner_user_id,
                "kind": "subscription",
                "title": "Pro Plan Activated",
                "body": f"Your Pro plan is active until {new_valid_until.strftime('%d %b %Y')}.",
                "link_to": "/billing",
                "is_read": False,
                "created_at": now,
            })
        txn_type = f"subscription ({billing_period})"

    logger.info(f"process_paid_session: activated session={session_id} type={txn_type}")
    return {"activated": True, "txn_type": txn_type}


async def _downgrade_explorer(pro_profile: dict, now: datetime | None = None) -> None:
    """Move an Explorer pro to Standard and revoke the bundled toolkits.
    Idempotent — safe to call multiple times. Notifies the pro once."""
    now = now or datetime.now(timezone.utc)
    await db.pro_profiles.update_one(
        {"_id": pro_profile["_id"]},
        {"$set": {
            "plan_tier": "standard",
            "has_invoice_toolkit": False,
            "has_tax_toolkit": False,
            "has_pm_toolkit": False,
            "has_bundle": False,
            "explorer_expired_at": now,
        },
         "$unset": {"explorer_started_at": "", "explorer_ends_at": ""}}
    )
    if not pro_profile.get("explorer_expired_at"):
        await db.notifications.insert_one({
            "user_id": pro_profile["user_id"],
            "kind": "subscription",
            "title": "Your Explorer plan has ended",
            "body": "Claim your Pro badge or continue on the free Standard plan.",
            "link_to": "/billing",
            "is_read": False,
            "created_at": now,
        })


async def expire_explorer_profiles() -> int:
    """Downgrade Explorer plans whose explorer_ends_at has passed. Returns count."""
    now = datetime.now(timezone.utc)
    count = 0
    async for pro in db.pro_profiles.find({"plan_tier": "explorer"}):
        ends = pro.get("explorer_ends_at")
        if ends and ends.tzinfo is None:
            ends = ends.replace(tzinfo=timezone.utc)
        if not ends or ends <= now:
            await _downgrade_explorer(pro, now)
            count += 1
    if count:
        logger.info(f"expire_explorer_profiles: downgraded {count} explorer pro(s)")
    return count


async def expire_stale_subscriptions() -> int:
    """Downgrade Pro plans whose sub_valid_until has passed.
    Called by the background scheduler every 6 hours.
    Returns count of downgraded pros.
    """
    now = datetime.now(timezone.utc)
    count = 0

    # 1. Plans where sub_valid_until has passed and no grace-period cancellation
    result = await db.pro_profiles.update_many(
        {
            "plan_tier": "pro",
            "$or": [
                {"sub_valid_until": {"$lt": now}, "sub_cancels_at": None},
                {"sub_valid_until": {"$lt": now}, "sub_cancels_at": {"$exists": False}},
            ]
        },
        {"$set": {"plan_tier": "standard"}}
    )
    count += result.modified_count

    # 2. Plans where the grace-period end (sub_cancels_at) has passed
    result = await db.pro_profiles.update_many(
        {"plan_tier": "pro", "sub_cancels_at": {"$lt": now, "$ne": None}},
        {"$set": {"plan_tier": "standard", "sub_cancels_at": None}}
    )
    count += result.modified_count

    if count:
        logger.info(f"expire_stale_subscriptions: downgraded {count} pro(s)")

    # Also expire any Explorer intro plans that have run their 3-month course
    count += await expire_explorer_profiles()
    return count
