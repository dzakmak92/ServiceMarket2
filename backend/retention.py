"""Lightweight retention scheduler. Runs once per hour and:
  - Hard-deletes accounts whose deletion grace period has elapsed.
  - Marks users inactive for 12+ months as ready-for-deletion (soft delete).

We avoid pulling in APScheduler/Celery by using a single asyncio task started
in server.startup. Good enough for a single-pod deployment; revisit if we
scale horizontally.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from bson import ObjectId
from database import db

logger = logging.getLogger(__name__)

RUN_EVERY_SECONDS = 60 * 60        # hourly
INACTIVITY_DAYS = 365              # 12 months


async def _hard_delete_expired():
    now = datetime.now(timezone.utc)
    cursor = db.users.find({
        "deletion_scheduled_for": {"$lt": now},
        "is_deleted": True,
    })
    async for user in cursor:
        uid = str(user["_id"])
        try:
            # Cascading delete — anonymise rather than wipe shared rows
            # so other users' history stays consistent (e.g. message threads).
            anon_payload = {
                "from_id_deleted": True,
                "deleted_at": now,
            }
            await db.messages.update_many({"from_id": uid}, {"$set": anon_payload})
            await db.messages.update_many({"to_id": uid}, {"$set": {"to_id_deleted": True, "deleted_at": now}})
            await db.jobs.update_many({"posted_by_id": uid}, {"$set": {"poster_deleted": True}})

            # Wipe the user-owned collections fully.
            await db.consent_records.delete_many({"user_id": uid})
            await db.notifications.delete_many({"user_id": uid})
            await db.push_subscriptions.delete_many({"user_id": uid})
            await db.pro_profiles.delete_many({"user_id": uid})

            # Finally remove the user doc itself
            await db.users.delete_one({"_id": ObjectId(uid)})
            logger.info(f"[retention] hard-deleted user {uid} after grace period")
        except Exception as e:
            logger.error(f"[retention] failed to hard-delete user {uid}: {e}")


async def _flag_inactive_users():
    cutoff = datetime.now(timezone.utc) - timedelta(days=INACTIVITY_DAYS)
    # Only auto-flag users who have never even logged in for 12 months
    # AND don't already have a deletion scheduled.
    res = await db.users.update_many(
        {
            "last_login_at": {"$lt": cutoff},
            "deletion_scheduled_for": {"$exists": False},
            "is_deleted": {"$ne": True},
        },
        {"$set": {"flagged_inactive_at": datetime.now(timezone.utc)}},
    )
    if res.modified_count:
        logger.info(f"[retention] flagged {res.modified_count} users as inactive (>{INACTIVITY_DAYS}d)")


async def _retention_loop():
    last_billing_check = None
    while True:
        try:
            await _hard_delete_expired()
            await _flag_inactive_users()
            # Monthly billing cron — run at most once per calendar day
            today = datetime.now(timezone.utc).date()
            if last_billing_check != today:
                await _maybe_generate_monthly_invoices()
                await _maybe_send_ustva_reminders()
                last_billing_check = today
        except Exception as e:
            logger.error(f"[retention] loop error: {e}")
        await asyncio.sleep(RUN_EVERY_SECONDS)


async def _maybe_generate_monthly_invoices():
    """Cron: fees on the 1st of month, subscriptions on the 15th. Idempotent —
    invoice creation uses a (target_user_id, leistungsdatum_start) uniqueness
    check so a daily call is harmless."""
    now = datetime.now(timezone.utc)
    settings = await db.company_settings.find_one({"_id": "default"})
    if not settings:
        return  # Operator hasn't configured company yet — skip silently

    from services.invoicing import create_subscription_invoice, create_fees_invoice
    # Previous month window
    first_of_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_of_prev = first_of_this - timedelta(seconds=1)
    period_start = last_of_prev.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    period_end = first_of_this

    if now.day == 1:
        # Aggregated contact-fees invoices
        pro_ids = await db.fee_log.distinct("pro_id", {
            "status": "pending",
            "incurred_at": {"$gte": period_start, "$lt": period_end},
        })
        for pid in pro_ids:
            try:
                await create_fees_invoice(pid, period_start, period_end)
            except Exception as e:
                logger.error(f"[billing-cron] fees invoice for pro {pid} failed: {e}")
        logger.info(f"[billing-cron] fees invoices generated for {len(pro_ids)} pros")

    if now.day == 15:
        # Pro subscription invoices
        pros = await db.pro_profiles.find({"plan_tier": "pro"}).to_list(2000)
        skipped = 0
        created = 0
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
                await create_subscription_invoice(p["user_id"], period_start, period_end)
                created += 1
            except Exception as e:
                logger.error(f"[billing-cron] sub invoice for pro {p['_id']} failed: {e}")
        logger.info(f"[billing-cron] subscription invoices: created={created} skipped={skipped}")



async def _maybe_send_ustva_reminders():
    """Fire USt-VA reminder notifications:

      • EARLY  — on the 1st of the month following a quarter-end (so 1 Apr / 1 Jul / 1 Oct / 1 Jan).
                  Gives the pro ~2 weeks to prepare.
      • LATE   — on the 14th of {Feb, May, Aug, Nov}, exactly 24 h before the
                  15th-of-month deadline.

    Targets every pro with `has_tax_toolkit=True`. Idempotent: each (user, quarter, kind)
    notification doc is unique-keyed so re-running the cron on the same day is a no-op.
    """
    now = datetime.now(timezone.utc)
    DEADLINE_QUARTER = {2: "Q4", 5: "Q1", 8: "Q2", 11: "Q3"}
    early_quarter = {1: "Q4", 4: "Q1", 7: "Q2", 10: "Q3"}.get(now.month) if now.day == 1 else None
    late_quarter = DEADLINE_QUARTER.get(now.month) if now.day == 14 else None
    targets: list[tuple[str, str]] = []  # (kind, quarter)
    if early_quarter:
        targets.append(("tax_ustva_early", early_quarter))
    if late_quarter:
        targets.append(("tax_ustva_24h", late_quarter))
    if not targets:
        return

    cursor = db.pro_profiles.find({"has_tax_toolkit": True})
    total_sent = 0
    async for pro in cursor:
        for kind, quarter in targets:
            # Idempotency — skip if we already sent this exact reminder today
            dedup_key = f"{kind}-{quarter}-{now.year}"
            existing = await db.notifications.find_one({
                "user_id": pro["user_id"],
                "kind": kind,
                "dedup_key": dedup_key,
            })
            if existing:
                continue
            try:
                if kind == "tax_ustva_early":
                    title = f"USt-VA-Erinnerung — {quarter}"
                    body = (
                        f"Die Umsatzsteuer-Voranmeldung für {quarter} ist bis zum 15. "
                        f"{now.strftime('%B %Y')} fällig. Öffne das Tax Toolkit, um die Zahlen vorzubereiten."
                    )
                    push_title = f"USt-VA {quarter} fällig"
                    push_body = "Voranmeldung bis 15. — Tax Toolkit öffnen."
                else:  # tax_ustva_24h
                    title = f"⚠ USt-VA {quarter} morgen fällig"
                    body = (
                        f"Die Umsatzsteuer-Voranmeldung für {quarter} muss morgen (15. "
                        f"{now.strftime('%B %Y')}) eingereicht und bezahlt werden."
                    )
                    push_title = f"⚠ USt-VA {quarter} morgen fällig"
                    push_body = "24 h Frist — jetzt einreichen."

                await db.notifications.insert_one({
                    "user_id": pro["user_id"],
                    "kind": kind,
                    "dedup_key": dedup_key,
                    "title": title,
                    "body": body,
                    "link_to": "/tax",
                    "is_read": False,
                    "created_at": now,
                })
                try:
                    from push import send_push_to_user
                    await send_push_to_user(pro["user_id"], {
                        "title": push_title,
                        "body": push_body,
                        "url": "/tax",
                        "tag": dedup_key,
                        "requireInteraction": True,
                    })
                except Exception:
                    pass
                total_sent += 1
            except Exception:
                logger.exception("USt-VA reminder (%s) for pro %s failed", kind, pro.get("_id"))
    logger.info(f"[ust-va-cron] reminders sent: {total_sent} (targets={targets})")


def start_retention_scheduler():
    """Start the background loop. Called once from server.startup()."""
    asyncio.create_task(_retention_loop())
    logger.info(f"[retention] scheduler started — runs every {RUN_EVERY_SECONDS // 60} min")
