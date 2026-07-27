"""Admin advanced routes — iter35 admin extensions for the new toolkits.

Covers:
  1. Pay-Now Revenue dashboard
  2. Toolkit subscription dashboard (Invoice/Tax/PM/Bundle)
  3. Storno audit log
  4. White-label logo moderation queue
  5. Public share-token audit (PM share, sub, accountant, pay-link)
  6. Tax accountant share audit
  7. USt-VA reminder log
  8. Receipt OCR audit + cost tracking
  9. Toolkit refund / credit panel
"""
from __future__ import annotations
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import require_admin
from database import db, fs_bucket

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin")


def _safe_float(v) -> float:
    """Coerce to float, returning 0.0 on None/invalid input."""
    try:
        return float(v) if v is not None else 0.0
    except (ValueError, TypeError):
        return 0.0


def _serialise(doc: dict) -> dict:
    if not doc:
        return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    for k, v in list(doc.items()):
        if isinstance(v, ObjectId):
            doc[k] = str(v)
    return doc


# ──────────────────────────────────────────────
# 1. Pay-Now Revenue dashboard
#    Aggregate all `payment_transactions` of type=invoice_payment
# ──────────────────────────────────────────────
@router.get("/pay-now/revenue")
async def pay_now_revenue(user: dict = Depends(require_admin)):
    """Platform 1% service-fee revenue + total processed volume."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    totals = {
        "volume_ytd": 0.0, "fees_ytd": 0.0, "count_ytd": 0,
        "volume_mtd": 0.0, "fees_mtd": 0.0, "count_mtd": 0,
        "volume_all": 0.0, "fees_all": 0.0, "count_all": 0,
        "failed_30d": 0,
    }
    failed_30d_since = now - timedelta(days=30)

    async for txn in db.payment_transactions.find({"metadata.type": "invoice_payment"}):
        meta = txn.get("metadata") or {}
        invoice_amount = _safe_float(meta.get("invoice_amount_eur"))
        fee_amount = _safe_float(meta.get("service_fee_eur"))
        is_paid = txn.get("payment_status") == "paid" and txn.get("status") == "complete"
        created = txn.get("created_at") or txn.get("updated_at") or now
        # Mongo can yield tz-naive datetimes (older inserts). Coerce to UTC-aware.
        if isinstance(created, datetime) and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)

        if is_paid:
            totals["volume_all"] += invoice_amount
            totals["fees_all"] += fee_amount
            totals["count_all"] += 1
            if created >= year_start:
                totals["volume_ytd"] += invoice_amount
                totals["fees_ytd"] += fee_amount
                totals["count_ytd"] += 1
            if created >= month_start:
                totals["volume_mtd"] += invoice_amount
                totals["fees_mtd"] += fee_amount
                totals["count_mtd"] += 1
        elif created >= failed_30d_since and txn.get("status") in ("expired", "failed"):
            totals["failed_30d"] += 1

    # Per-pro top 10
    per_pro: dict[str, dict] = {}
    async for txn in db.payment_transactions.find({"metadata.type": "invoice_payment", "payment_status": "paid"}):
        meta = txn.get("metadata") or {}
        pro_id = meta.get("pro_id")
        if not pro_id:
            continue
        d = per_pro.setdefault(pro_id, {"pro_id": pro_id, "volume": 0.0, "fees": 0.0, "count": 0})
        d["volume"] += _safe_float(meta.get("invoice_amount_eur"))
        d["fees"] += _safe_float(meta.get("service_fee_eur"))
        d["count"] += 1
    top_pros = sorted(per_pro.values(), key=lambda x: x["fees"], reverse=True)[:10]
    # Hydrate pro name
    for row in top_pros:
        try:
            pro = await db.pro_profiles.find_one({"_id": ObjectId(row["pro_id"])})
            if pro:
                u = await db.users.find_one({"_id": ObjectId(pro["user_id"])}) if not isinstance(pro["user_id"], ObjectId) else None
                row["pro_name"] = (u or {}).get("name") or pro.get("business_name") or row["pro_id"][-6:]
        except Exception:
            row["pro_name"] = row["pro_id"][-6:]

    # Round
    for k in ("volume_all", "fees_all", "volume_ytd", "fees_ytd", "volume_mtd", "fees_mtd"):
        totals[k] = round(totals[k], 2)
    for row in top_pros:
        row["volume"] = round(row["volume"], 2)
        row["fees"] = round(row["fees"], 2)

    # Latest 20 paid sessions
    recent: list = []
    async for txn in db.payment_transactions.find(
        {"metadata.type": "invoice_payment", "payment_status": "paid"},
    ).sort("updated_at", -1).limit(20):
        meta = txn.get("metadata") or {}
        recent.append({
            "session_id": txn.get("session_id"),
            "invoice_number": meta.get("invoice_number"),
            "invoice_amount_eur": _safe_float(meta.get("invoice_amount_eur")),
            "service_fee_eur": _safe_float(meta.get("service_fee_eur")),
            "paid_at": txn.get("updated_at") or txn.get("created_at"),
            "pro_id": meta.get("pro_id"),
        })

    return {
        "totals": totals,
        "top_pros": top_pros,
        "recent": recent,
        "as_of": now,
    }


# ──────────────────────────────────────────────
# 2. Toolkit subscription dashboard
# ──────────────────────────────────────────────
@router.get("/toolkits/dashboard")
async def toolkits_dashboard(user: dict = Depends(require_admin)):
    """Per-toolkit subscriber count + MRR + free→paid conversion."""
    total_pros = await db.pro_profiles.count_documents({})

    # Subscriber counts per toolkit flag
    invoice_subs = await db.pro_profiles.count_documents({"has_invoice_toolkit": True})
    tax_subs = await db.pro_profiles.count_documents({"has_tax_toolkit": True})
    pm_subs = await db.pro_profiles.count_documents({"has_pm_toolkit": True})
    bundle_subs = await db.pro_profiles.count_documents({
        "has_invoice_toolkit": True, "has_tax_toolkit": True, "has_pm_toolkit": True,
    })

    # Per-toolkit MRR — derive from plan_tier (standard vs pro pricing)
    # Pricing constants (must match billing_routes.py)
    PRICES = {
        "invoice": {"standard": 14.99, "pro": 9.99},
        "tax": {"standard": 14.99, "pro": 9.99},
        "pm": {"standard": 29.99, "pro": 19.99},
        "bundle": {"standard": 39.99, "pro": 24.99},
    }

    def _net(tier: str, kind: str) -> float:
        return PRICES.get(kind, {}).get(tier or "standard", 0.0)

    # Per-toolkit MRR — collect tier per pro
    invoice_mrr = tax_mrr = pm_mrr = bundle_mrr = 0.0
    invoice_std = invoice_pro = 0
    tax_std = tax_pro = 0
    pm_std = pm_pro = 0
    bundle_std = bundle_pro = 0
    async for pro in db.pro_profiles.find({"$or": [{"has_invoice_toolkit": True}, {"has_tax_toolkit": True}, {"has_pm_toolkit": True}]}):
        tier = pro.get("plan_tier", "standard")
        is_bundle = pro.get("has_invoice_toolkit") and pro.get("has_tax_toolkit") and pro.get("has_pm_toolkit")
        if is_bundle:
            bundle_mrr += _net(tier, "bundle")
            if tier == "pro":
                bundle_pro += 1
            else:
                bundle_std += 1
        else:
            if pro.get("has_invoice_toolkit"):
                invoice_mrr += _net(tier, "invoice")
                if tier == "pro":
                    invoice_pro += 1
                else:
                    invoice_std += 1
            if pro.get("has_tax_toolkit"):
                tax_mrr += _net(tier, "tax")
                if tier == "pro":
                    tax_pro += 1
                else:
                    tax_std += 1
            if pro.get("has_pm_toolkit"):
                pm_mrr += _net(tier, "pm")
                if tier == "pro":
                    pm_pro += 1
                else:
                    pm_std += 1

    total_mrr = invoice_mrr + tax_mrr + pm_mrr + bundle_mrr

    # Recently activated subscribers (last 30 days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    recent_subs = await db.payment_transactions.count_documents({
        "metadata.type": {"$in": ["toolkit_subscription", "bundle_subscription"]},
        "payment_status": "paid",
        "created_at": {"$gte": cutoff},
    })

    return {
        "total_pros": total_pros,
        "toolkits": {
            "invoice": {"subs": invoice_subs, "mrr": round(invoice_mrr, 2),
                        "standard_tier": invoice_std, "pro_tier": invoice_pro,
                        "conversion_pct": round(invoice_subs / total_pros * 100, 1) if total_pros else 0},
            "tax": {"subs": tax_subs, "mrr": round(tax_mrr, 2),
                    "standard_tier": tax_std, "pro_tier": tax_pro,
                    "conversion_pct": round(tax_subs / total_pros * 100, 1) if total_pros else 0},
            "pm": {"subs": pm_subs, "mrr": round(pm_mrr, 2),
                   "standard_tier": pm_std, "pro_tier": pm_pro,
                   "conversion_pct": round(pm_subs / total_pros * 100, 1) if total_pros else 0},
            "bundle": {"subs": bundle_subs, "mrr": round(bundle_mrr, 2),
                       "standard_tier": bundle_std, "pro_tier": bundle_pro,
                       "conversion_pct": round(bundle_subs / total_pros * 100, 1) if total_pros else 0},
        },
        "total_mrr": round(total_mrr, 2),
        "new_subs_30d": recent_subs,
    }


# ──────────────────────────────────────────────
# 3. Storno audit log
# ──────────────────────────────────────────────
@router.get("/storno/audit")
async def storno_audit(user: dict = Depends(require_admin),
                       limit: int = 100,
                       skip: int = 0):
    """Chronological list of every storno doc + linked original."""
    total = await db.pro_invoices.count_documents({"is_storno": True})
    items: list = []
    async for storno in db.pro_invoices.find({"is_storno": True}).sort("created_at", -1).skip(skip).limit(limit):
        # Hydrate pro
        pro_name = ""
        try:
            pro = await db.pro_profiles.find_one({"_id": ObjectId(storno["pro_id"])})
            if pro:
                u = await db.users.find_one({"_id": pro["user_id"]} if isinstance(pro["user_id"], ObjectId) else {"_id": ObjectId(pro["user_id"])})
                pro_name = (u or {}).get("name") or pro.get("business_name") or ""
        except Exception:
            pass

        items.append({
            "id": str(storno["_id"]),
            "storno_number": storno["invoice_number"],
            "storno_brutto": storno["brutto_total"],
            "storno_reason": storno.get("storno_reason", ""),
            "of_invoice_id": storno.get("storno_of_invoice_id"),
            "of_invoice_number": storno.get("storno_of_invoice_number"),
            "created_at": storno.get("created_at"),
            "pro_id": storno["pro_id"],
            "pro_name": pro_name,
            "customer": (storno.get("customer_snapshot") or {}).get("name"),
        })

    # Per-pro abuse signal — # stornos in last 30 days
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    per_pro: dict[str, int] = {}
    async for s in db.pro_invoices.find({"is_storno": True, "created_at": {"$gte": cutoff}}):
        per_pro[s["pro_id"]] = per_pro.get(s["pro_id"], 0) + 1
    # Anyone with >= 5 stornos / month flagged
    suspicious = [{"pro_id": pid, "storno_count_30d": cnt} for pid, cnt in per_pro.items() if cnt >= 5]
    suspicious.sort(key=lambda x: x["storno_count_30d"], reverse=True)

    return {"total": total, "items": items, "suspicious": suspicious}


# ──────────────────────────────────────────────
# 4. White-label logo moderation queue
# ──────────────────────────────────────────────
@router.get("/white-label/logos")
async def list_pro_logos(user: dict = Depends(require_admin),
                         status: Optional[str] = None):
    """List every pro with an uploaded logo + moderation status."""
    q: dict = {"logo_file_id": {"$exists": True, "$ne": None}}
    if status == "pending":
        q["logo_moderation_status"] = {"$in": [None, "pending"]}
    elif status == "approved":
        q["logo_moderation_status"] = "approved"
    elif status == "rejected":
        q["logo_moderation_status"] = "rejected"

    items: list = []
    async for pro in db.pro_profiles.find(q).sort("logo_uploaded_at", -1).limit(200):
        u = None
        try:
            u = await db.users.find_one({"_id": pro["user_id"]} if isinstance(pro["user_id"], ObjectId) else {"_id": ObjectId(pro["user_id"])})
        except Exception:
            pass
        items.append({
            "pro_id": str(pro["_id"]),
            "pro_name": (u or {}).get("name") or pro.get("business_name") or "",
            "business_name": pro.get("business_name"),
            "logo_file_id": pro.get("logo_file_id"),
            "logo_url": f"/api/portfolio/{pro['logo_file_id']}",
            "logo_content_type": pro.get("logo_content_type"),
            "logo_uploaded_at": pro.get("logo_uploaded_at"),
            "moderation_status": pro.get("logo_moderation_status", "pending"),
            "moderation_note": pro.get("logo_moderation_note", ""),
            "moderated_by": pro.get("logo_moderated_by"),
            "moderated_at": pro.get("logo_moderated_at"),
        })
    return {"items": items, "count": len(items)}


@router.post("/white-label/logos/{pro_id}/approve")
async def approve_logo(pro_id: str, payload: dict = None, user: dict = Depends(require_admin)):
    try:
        oid = ObjectId(pro_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad pro id")
    res = await db.pro_profiles.update_one(
        {"_id": oid},
        {"$set": {
            "logo_moderation_status": "approved",
            "logo_moderation_note": (payload or {}).get("note", ""),
            "logo_moderated_by": str(user["_id"]),
            "logo_moderated_at": datetime.now(timezone.utc),
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pro not found")
    return {"status": "approved"}


@router.post("/white-label/logos/{pro_id}/reject")
async def reject_logo(pro_id: str, payload: dict = None, user: dict = Depends(require_admin)):
    """Reject + delete the logo. Pro will be notified to upload a new one."""
    payload = payload or {}
    try:
        oid = ObjectId(pro_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad pro id")
    pro = await db.pro_profiles.find_one({"_id": oid})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro not found")

    # Delete GridFS file
    if pro.get("logo_file_id"):
        try:
            await fs_bucket.delete(ObjectId(pro["logo_file_id"]))
        except Exception:
            pass

    await db.pro_profiles.update_one(
        {"_id": oid},
        {"$set": {
            "logo_moderation_status": "rejected",
            "logo_moderation_note": payload.get("note") or "Rejected by moderator",
            "logo_moderated_by": str(user["_id"]),
            "logo_moderated_at": datetime.now(timezone.utc),
        }, "$unset": {"logo_file_id": "", "logo_content_type": "", "logo_uploaded_at": ""}},
    )

    # Best-effort notification
    try:
        await db.notifications.insert_one({
            "user_id": pro["user_id"] if isinstance(pro["user_id"], ObjectId) else ObjectId(pro["user_id"]),
            "kind": "logo_rejected",
            "title": "Invoice logo rejected",
            "body": f"Your uploaded invoice logo was rejected by the moderation team. Reason: {payload.get('note', 'see settings')}",
            "link_to": "/settings",
            "is_read": False,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        pass
    return {"status": "rejected"}


# ──────────────────────────────────────────────
# 5. Share-token audit (PM share, sub-contractor, accountant, pay-link)
# ──────────────────────────────────────────────
@router.get("/share-tokens/audit")
async def share_tokens_audit(user: dict = Depends(require_admin)):
    """Inventory of all active public share tokens across the platform."""
    # PM project share tokens
    pm_share: list = []
    async for p in db.pm_projects.find({"share_enabled": True, "share_token": {"$ne": None}}):
        pm_share.append({
            "kind": "pm_customer",
            "project_id": str(p["_id"]),
            "project_title": p.get("title"),
            "pro_id": p.get("pro_id"),
            "created_at": p.get("created_at"),
            "url_path": f"/p/{p['share_token']}",
        })

    pm_sub: list = []
    async for p in db.pm_projects.find({"sub_token": {"$ne": None, "$exists": True}}):
        pm_sub.append({
            "kind": "pm_sub_contractor",
            "project_id": str(p["_id"]),
            "project_title": p.get("title"),
            "pro_id": p.get("pro_id"),
            "created_at": p.get("updated_at"),
            "url_path": f"/sub/{p['sub_token']}",
        })

    # Tax accountant tokens
    tax_acc: list = []
    async for pro in db.pro_profiles.find({"tax_accountant_token": {"$ne": None, "$exists": True}}):
        tax_acc.append({
            "kind": "tax_accountant",
            "pro_id": str(pro["_id"]),
            "created_at": pro.get("tax_accountant_token_created_at"),
            "url_path": f"/accountant/{pro['tax_accountant_token']}",
        })

    # Pay-link tokens
    pay_links: list = []
    async for inv in db.pro_invoices.find({"pay_link_enabled": True, "pay_link_token": {"$ne": None}}):
        pay_links.append({
            "kind": "pay_link",
            "invoice_id": str(inv["_id"]),
            "invoice_number": inv.get("invoice_number"),
            "outstanding_eur": float(inv.get("outstanding") or inv.get("brutto_total", 0)),
            "pro_id": inv.get("pro_id"),
            "created_at": inv.get("pay_link_created_at"),
            "url_path": f"/pay/{inv['pay_link_token']}",
        })

    return {
        "pm_customer_links": pm_share,
        "pm_sub_links": pm_sub,
        "tax_accountant_links": tax_acc,
        "pay_links": pay_links,
        "totals": {
            "pm_customer": len(pm_share),
            "pm_sub": len(pm_sub),
            "tax_accountant": len(tax_acc),
            "pay_link": len(pay_links),
            "all": len(pm_share) + len(pm_sub) + len(tax_acc) + len(pay_links),
        },
    }


@router.post("/share-tokens/revoke")
async def admin_revoke_token(payload: dict, user: dict = Depends(require_admin)):
    """Force-revoke a token. Used when a pro abuses the public share feature."""
    kind = payload.get("kind")
    if kind == "pm_customer":
        await db.pm_projects.update_one(
            {"_id": ObjectId(payload["project_id"])},
            {"$set": {"share_enabled": False, "share_token": None}},
        )
    elif kind == "pm_sub_contractor":
        await db.pm_projects.update_one(
            {"_id": ObjectId(payload["project_id"])},
            {"$set": {"sub_token": None}},
        )
    elif kind == "tax_accountant":
        await db.pro_profiles.update_one(
            {"_id": ObjectId(payload["pro_id"])},
            {"$unset": {"tax_accountant_token": "", "tax_accountant_token_created_at": ""}},
        )
    elif kind == "pay_link":
        await db.pro_invoices.update_one(
            {"_id": ObjectId(payload["invoice_id"])},
            {"$set": {"pay_link_enabled": False}},
        )
    else:
        raise HTTPException(status_code=400, detail="Unknown token kind")
    return {"revoked": True}


# ──────────────────────────────────────────────
# 6. Tax accountant share audit (separate convenience endpoint)
# ──────────────────────────────────────────────
@router.get("/tax/accountant-shares")
async def tax_accountant_shares(user: dict = Depends(require_admin)):
    items: list = []
    async for pro in db.pro_profiles.find({"tax_accountant_token": {"$exists": True, "$ne": None}}):
        u = None
        try:
            u = await db.users.find_one({"_id": pro["user_id"]} if isinstance(pro["user_id"], ObjectId) else {"_id": ObjectId(pro["user_id"])})
        except Exception:
            pass
        items.append({
            "pro_id": str(pro["_id"]),
            "pro_name": (u or {}).get("name") or pro.get("business_name", ""),
            "business_name": pro.get("business_name"),
            "uid": pro.get("invoice_tax_id"),
            "created_at": pro.get("tax_accountant_token_created_at"),
            "url_path": f"/accountant/{pro['tax_accountant_token']}",
        })
    return {"items": items, "count": len(items)}


# ──────────────────────────────────────────────
# 7. USt-VA reminder log
# ──────────────────────────────────────────────
@router.get("/tax/ust-va-reminders")
async def ust_va_reminders(user: dict = Depends(require_admin), limit: int = 200):
    """Audit log of every USt-VA reminder sent by the cron."""
    items: list = []
    async for n in db.notifications.find({"kind": {"$in": ["tax_ustva_early", "tax_ustva_24h"]}}).sort("created_at", -1).limit(limit):
        # Hydrate user
        try:
            u = await db.users.find_one({"_id": n["user_id"]} if isinstance(n["user_id"], ObjectId) else {"_id": ObjectId(n["user_id"])})
        except Exception:
            u = None
        items.append({
            "id": str(n["_id"]),
            "user_id": str(n["user_id"]),
            "user_name": (u or {}).get("name", ""),
            "kind": n["kind"],
            "dedup_key": n.get("dedup_key"),
            "title": n.get("title"),
            "is_read": bool(n.get("is_read")),
            "created_at": n.get("created_at"),
        })
    # Summary counts
    early = await db.notifications.count_documents({"kind": "tax_ustva_early"})
    late = await db.notifications.count_documents({"kind": "tax_ustva_24h"})
    return {"items": items, "totals": {"early": early, "late": late}}


# ──────────────────────────────────────────────
# 8. Receipt OCR audit + cost tracking
# ──────────────────────────────────────────────
OCR_COST_PER_RECEIPT = 0.003  # rough estimate for gpt-4o-mini vision call


@router.get("/tax/ocr-audit")
async def ocr_audit(user: dict = Depends(require_admin), limit: int = 100):
    """Receipt OCR usage stats — total calls, est. cost, avg confidence,
    per-pro usage (catch abuse)."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total = await db.tax_receipts.count_documents({})
    mtd = await db.tax_receipts.count_documents({"uploaded_at": {"$gte": month_start}})

    conf_sum = 0.0
    conf_count = 0
    per_user: dict[str, int] = {}
    async for r in db.tax_receipts.find({}):
        c = r.get("ocr_confidence")
        if isinstance(c, (int, float)):
            conf_sum += float(c)
            conf_count += 1
        uid_key = str(r.get("user_id"))
        per_user[uid_key] = per_user.get(uid_key, 0) + 1
    avg_confidence = round(conf_sum / conf_count, 2) if conf_count else 0.0

    # Top 10 users by receipt count
    top_users = []
    for uid, cnt in sorted(per_user.items(), key=lambda kv: kv[1], reverse=True)[:10]:
        try:
            u = await db.users.find_one({"_id": ObjectId(uid)})
            name = (u or {}).get("name", uid[-6:])
        except Exception:
            name = uid[-6:]
        top_users.append({"user_id": uid, "name": name, "count": cnt, "est_cost_eur": round(cnt * OCR_COST_PER_RECEIPT, 2)})

    # Latest 20 receipts (for spot-check)
    recent: list = []
    async for r in db.tax_receipts.find().sort("uploaded_at", -1).limit(20):
        recent.append({
            "id": str(r["_id"]),
            "vendor": r.get("vendor"),
            "amount_brutto": r.get("amount_brutto"),
            "vat_rate": r.get("vat_rate"),
            "category": r.get("category"),
            "ocr_confidence": r.get("ocr_confidence"),
            "uploaded_at": r.get("uploaded_at"),
            "user_id": str(r.get("user_id")),
        })

    return {
        "totals": {
            "all_receipts": total,
            "mtd_receipts": mtd,
            "est_cost_all_eur": round(total * OCR_COST_PER_RECEIPT, 2),
            "est_cost_mtd_eur": round(mtd * OCR_COST_PER_RECEIPT, 2),
            "avg_confidence": avg_confidence,
        },
        "top_users": top_users,
        "recent": recent,
        "per_receipt_cost_eur": OCR_COST_PER_RECEIPT,
    }


# ──────────────────────────────────────────────
# 9. Toolkit refund / credit panel
# ──────────────────────────────────────────────
@router.post("/toolkits/refund")
async def admin_refund_toolkit(payload: dict, user: dict = Depends(require_admin)):
    """Refund a pro's most recent toolkit subscription cycle and disable the
    toolkit flag. Stripe refund is best-effort — DB state is the source of
    truth so even if Stripe fails the pro is no longer charged going forward.

    Payload: {pro_id, toolkit ('invoice'|'tax'|'pm'|'bundle'), reason}
    """
    pro_id = payload.get("pro_id")
    toolkit = payload.get("toolkit")
    reason = (payload.get("reason") or "")[:500]
    if toolkit not in {"invoice", "tax", "pm", "bundle"}:
        raise HTTPException(status_code=400, detail="Bad toolkit")
    try:
        pro = await db.pro_profiles.find_one({"_id": ObjectId(pro_id)})
    except Exception:
        pro = None
    if not pro:
        raise HTTPException(status_code=404, detail="Pro not found")

    # Find most-recent paid toolkit txn
    txn_filter = {"metadata.pro_id": pro_id, "payment_status": "paid"}
    if toolkit == "bundle":
        txn_filter["metadata.type"] = "bundle_subscription"
    else:
        txn_filter["metadata.type"] = "toolkit_subscription"
        txn_filter["metadata.toolkit"] = toolkit
    last_txn = await db.payment_transactions.find_one(txn_filter, sort=[("created_at", -1)])

    refund_amount = float(last_txn.get("amount", 0)) if last_txn else 0.0

    # Best-effort Stripe refund
    refund_status = "skipped"
    refund_id = None
    if last_txn and last_txn.get("session_id"):
        try:
            import stripe
            stripe.api_key = os.environ.get("STRIPE_API_KEY")
            sess = stripe.checkout.Session.retrieve(last_txn["session_id"])
            if sess.get("payment_intent"):
                r = stripe.Refund.create(payment_intent=sess["payment_intent"], reason="requested_by_customer")
                refund_id = r.id
                refund_status = "issued"
        except Exception as exc:
            logger.warning("Stripe refund failed for %s: %s", pro_id, exc)
            refund_status = "failed"

    # Disable toolkit flags
    if toolkit == "bundle":
        flags_unset = {"has_invoice_toolkit": False, "has_tax_toolkit": False, "has_pm_toolkit": False}
    else:
        flags_unset = {f"has_{toolkit}_toolkit": False}
    await db.pro_profiles.update_one({"_id": pro["_id"]}, {"$set": flags_unset})

    # Audit log
    audit_doc = {
        "kind": "toolkit_refund",
        "pro_id": pro_id,
        "toolkit": toolkit,
        "reason": reason,
        "refund_amount_eur": refund_amount,
        "stripe_refund_id": refund_id,
        "refund_status": refund_status,
        "issued_by": str(user["_id"]),
        "session_id": (last_txn or {}).get("session_id"),
        "created_at": datetime.now(timezone.utc),
    }
    await db.admin_audit_log.insert_one(audit_doc)

    # Notify pro
    try:
        await db.notifications.insert_one({
            "user_id": pro["user_id"] if isinstance(pro["user_id"], ObjectId) else ObjectId(pro["user_id"]),
            "kind": "toolkit_refunded",
            "title": f"{toolkit.title()} toolkit refunded",
            "body": f"Your {toolkit} toolkit subscription has been refunded ({refund_status}). Amount: €{refund_amount:.2f}. {reason}",
            "link_to": "/billing",
            "is_read": False,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        pass

    return {
        "refund_status": refund_status,
        "refund_amount_eur": refund_amount,
        "stripe_refund_id": refund_id,
        "toolkit_disabled": toolkit,
    }


@router.get("/audit-log")
async def admin_audit_log(user: dict = Depends(require_admin), limit: int = 100, kind: Optional[str] = None):
    """Audit trail of every privileged admin action (refunds, rejections, etc.)."""
    q: dict = {}
    if kind:
        q["kind"] = kind
    items: list = []
    async for entry in db.admin_audit_log.find(q).sort("created_at", -1).limit(limit):
        items.append(_serialise(entry))
    return {"items": items, "count": len(items)}



# ──────────────────────────────────────────────
# 10. Toolkit subscribers list (force-disable / refund support actions)
# ──────────────────────────────────────────────
@router.get("/pros")
async def list_pros_with_toolkits(user: dict = Depends(require_admin),
                                  has_toolkit: int = 0):
    """List pros, optionally filtered to those with any toolkit subscription."""
    q: dict = {}
    if has_toolkit:
        q["$or"] = [
            {"has_invoice_toolkit": True},
            {"has_tax_toolkit": True},
            {"has_pm_toolkit": True},
        ]
    items: list = []
    async for pro in db.pro_profiles.find(q).limit(500):
        # Hydrate user name
        u = None
        try:
            u = await db.users.find_one({"_id": pro["user_id"]} if isinstance(pro["user_id"], ObjectId) else {"_id": ObjectId(pro["user_id"])})
        except Exception:
            pass
        items.append({
            "pro_id": str(pro["_id"]),
            "pro_name": (u or {}).get("name") or pro.get("business_name") or "",
            "business_name": pro.get("business_name"),
            "plan_tier": pro.get("plan_tier", "standard"),
            "has_invoice_toolkit": bool(pro.get("has_invoice_toolkit")),
            "has_tax_toolkit": bool(pro.get("has_tax_toolkit")),
            "has_pm_toolkit": bool(pro.get("has_pm_toolkit")),
        })
    return {"items": items, "count": len(items)}



# ──────────────────────────────────────────────
# 11. Job-fee admin: view + edit + cancel fees attached to a job
#     Used from AdminSupport tab when a pro complains about a fee.
# ──────────────────────────────────────────────
@router.get("/jobs/{job_id}/fees")
async def list_job_fees(job_id: str, user: dict = Depends(require_admin)):
    """All fees ever charged against this job: per-pro contact fees + Pay-Now service fees.
    Hard-capped at 500 rows to avoid unbounded responses on prolific jobs."""
    items: list = []
    # Contact fees from fee_log
    async for f in db.fee_log.find({"job_id": job_id}).sort("incurred_at", -1).limit(500):
        pro = await db.pro_profiles.find_one({"_id": ObjectId(f["pro_id"])} if isinstance(f["pro_id"], str) else {"_id": f["pro_id"]})
        pro_name = ""
        if pro:
            pu = await db.users.find_one({"_id": pro["user_id"]} if isinstance(pro["user_id"], ObjectId) else {"_id": ObjectId(pro["user_id"])})
            pro_name = (pu or {}).get("name") or pro.get("business_name") or ""
        items.append({
            "id": str(f["_id"]),
            "kind": "contact_fee",
            "pro_id": str(f["pro_id"]),
            "pro_name": pro_name,
            "amount": _safe_float(f.get("amount")),
            "status": f.get("status"),  # pending | paid | cancelled
            "incurred_at": f.get("incurred_at").isoformat() if isinstance(f.get("incurred_at"), datetime) else f.get("incurred_at"),
            "due_at": f.get("due_at").isoformat() if isinstance(f.get("due_at"), datetime) else f.get("due_at"),
            "category": f.get("category"),
        })
    # Pay-Now service fees (1%)
    async for t in db.payment_transactions.find({"metadata.type": "invoice_payment", "metadata.job_id": job_id}):
        meta = t.get("metadata") or {}
        items.append({
            "id": str(t["_id"]),
            "kind": "paynow_service_fee",
            "pro_id": str(meta.get("pro_id") or ""),
            "pro_name": meta.get("pro_name") or "",
            "amount": _safe_float(meta.get("service_fee_eur")),
            "status": "paid" if t.get("payment_status") == "paid" else "pending",
            "incurred_at": t.get("created_at").isoformat() if isinstance(t.get("created_at"), datetime) else t.get("created_at"),
        })
    return {"items": items, "count": len(items)}


class FeeUpdate(BaseModel):
    amount: Optional[float] = None
    status: Optional[str] = None  # pending | paid | cancelled
    reason: str = Field(..., min_length=3, max_length=500)


@router.patch("/fees/{fee_id}")
async def update_fee(fee_id: str, body: FeeUpdate, user: dict = Depends(require_admin)):
    """Edit or cancel a fee. Currently only operates on `db.fee_log` rows (contact_fee).
    Pay-Now fees are paid Stripe charges and need to be refunded via the Pay-Now panel."""
    try:
        oid = ObjectId(fee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad fee id")
    fee = await db.fee_log.find_one({"_id": oid})
    if not fee:
        raise HTTPException(status_code=404, detail="Fee not found")
    updates: dict = {"updated_at": datetime.now(timezone.utc), "admin_note": body.reason[:500]}
    delta_amount = 0.0
    if body.amount is not None:
        if body.amount < 0:
            raise HTTPException(status_code=400, detail="Negative amounts not allowed")
        delta_amount = _safe_float(body.amount) - _safe_float(fee.get("amount"))
        updates["amount"] = round(_safe_float(body.amount), 2)
    if body.status:
        if body.status not in ("pending", "paid", "cancelled"):
            raise HTTPException(status_code=400, detail="Bad status")
        updates["status"] = body.status
        if body.status == "cancelled":
            # Cancellation zeroes the amount out of the pro's monthly_fees if still pending
            if fee.get("status") == "pending":
                delta_amount = -_safe_float(fee.get("amount"))
    await db.fee_log.update_one({"_id": oid}, {"$set": updates})

    if delta_amount and fee.get("pro_id"):
        try:
            await db.pro_profiles.update_one(
                {"_id": ObjectId(fee["pro_id"]) if isinstance(fee["pro_id"], str) else fee["pro_id"]},
                {"$inc": {"monthly_fees": delta_amount}},
            )
        except Exception:
            pass

    # Notify the affected pro about the fee change (iter40)
    try:
        pro_doc = await db.pro_profiles.find_one(
            {"_id": ObjectId(fee["pro_id"]) if isinstance(fee["pro_id"], str) else fee["pro_id"]}
        )
        if pro_doc:
            job_id_str = str(fee.get("job_id") or "")[:8]
            kind = "fee_cancelled" if body.status == "cancelled" else "fee_adjusted"
            if body.status == "cancelled":
                title = "Fee cancelled by admin"
                body_text = (
                    f"A contact fee of €{_safe_float(fee.get('amount')):.2f} on job {job_id_str} "
                    f"was cancelled by the support team. Reason: {body.reason[:200]}"
                )
            else:
                old_amt = _safe_float(fee.get("amount"))
                new_amt = _safe_float(updates.get("amount", old_amt))
                title = "Fee adjusted by admin"
                body_text = (
                    f"A contact fee on job {job_id_str} was changed "
                    f"from €{old_amt:.2f} to €{new_amt:.2f}. Reason: {body.reason[:200]}"
                )
            await db.notifications.insert_one({
                "user_id": pro_doc["user_id"] if isinstance(pro_doc["user_id"], ObjectId) else ObjectId(pro_doc["user_id"]),
                "kind": kind,
                "title": title,
                "body": body_text,
                "link_to": "/billing",
                "is_read": False,
                "created_at": datetime.now(timezone.utc),
                "metadata": {"job_id": fee.get("job_id"), "fee_id": str(fee_id), "delta": delta_amount},
            })
    except Exception:
        pass

    # Audit log
    await db.admin_audit_log.insert_one({
        "kind": "fee_adjusted",
        "fee_id": str(fee_id),
        "job_id": fee.get("job_id"),
        "pro_id": str(fee.get("pro_id")),
        "changes": {k: v for k, v in updates.items() if k != "updated_at"},
        "delta_amount": delta_amount,
        "admin_id": str(user["_id"]),
        "created_at": datetime.now(timezone.utc),
    })
    return {"updated": True}
