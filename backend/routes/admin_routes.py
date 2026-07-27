from fastapi import APIRouter, HTTPException, Depends, Request, Response
from database import db
from auth import get_current_user, require_admin
from utils import serialize_doc
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from typing import Optional
import csv
import io

router = APIRouter(prefix="/admin")


@router.get("/platform-settings")
async def get_platform_settings(user: dict = Depends(require_admin)):
    """Global feature flags + registration context to inform plan decisions."""
    from services.platform_settings import explorer_enabled
    now = datetime.now(timezone.utc)
    last_30 = now - timedelta(days=30)
    last_7 = now - timedelta(days=7)
    new_pros_30d = await db.users.count_documents({"role": "tradesperson", "created_at": {"$gte": last_30}})
    new_pros_7d = await db.users.count_documents({"role": "tradesperson", "created_at": {"$gte": last_7}})
    explorer_active = await db.pro_profiles.count_documents({"plan_tier": "explorer"})
    return {
        "explorer_enabled": await explorer_enabled(),
        "new_pros_30d": new_pros_30d,
        "new_pros_7d": new_pros_7d,
        "explorer_active_count": explorer_active,
    }


@router.patch("/platform-settings")
async def update_platform_settings(data: dict, user: dict = Depends(require_admin)):
    """Toggle the Explorer intro plan on/off for NEW tradespeople.
    Existing active Explorer pros keep their plan until it expires."""
    from services.platform_settings import set_explorer_enabled, explorer_enabled
    if "explorer_enabled" in data:
        await set_explorer_enabled(bool(data["explorer_enabled"]))
    return {"explorer_enabled": await explorer_enabled()}



@router.get("/stats")
async def get_stats(user: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({"role": "tradesperson"})
    total_pros = await db.users.count_documents({"role": "tradesperson"})
    active_jobs = await db.jobs.count_documents({"status": "open"})
    in_progress = await db.jobs.count_documents({"status": "in_progress"})
    completed_jobs = await db.jobs.count_documents({"status": "completed"})
    pending_verifications = await db.pro_profiles.count_documents({
        "$or": [{"is_verified": False}, {"is_licensed": False}, {"is_insured": False}]
    })

    # MRR from Pro subscriptions
    pro_count = await db.pro_profiles.count_documents({"plan_tier": "pro"})
    mrr = pro_count * 29.99

    # Contact fee revenue this month
    from datetime import timedelta
    first_of_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    fee_pipeline = [
        {"$match": {"incurred_at": {"$gte": first_of_month}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    fee_result = await db.fee_log.aggregate(fee_pipeline).to_list(1)
    contact_revenue = fee_result[0]["total"] if fee_result else 0

    return {
        "total_users": total_users,
        "total_pros": total_pros,
        "mrr": mrr,
        "contact_revenue_month": contact_revenue,
        "total_revenue_month": mrr + contact_revenue,
        "active_jobs": active_jobs,
        "in_progress_jobs": in_progress,
        "completed_jobs": completed_jobs,
        "pending_verifications": pending_verifications
    }


@router.get("/users")
async def list_users(
    user: dict = Depends(require_admin),
    role: Optional[str] = None,
    q: Optional[str] = None,
    year: Optional[int] = None,
    page: int = 1,
    per_page: int = 25,
):
    per_page = min(max(per_page, 1), 100)
    page = max(page, 1)
    query = {}
    if role:
        query["role"] = role
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"name": rx}, {"email": rx}, {"city": rx}]
    if year:
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        query["created_at"] = {"$gte": start, "$lt": end}

    users = await db.users.find(query, {"password_hash": 0}).sort("created_at", -1).skip((page-1)*per_page).limit(per_page).to_list(per_page)
    total = await db.users.count_documents(query)
    return {"users": [serialize_doc(u) for u in users], "total": total, "page": page, "per_page": per_page}


@router.patch("/users/{user_id}")
async def update_user(user_id: str, updates: dict, user: dict = Depends(require_admin)):
    # Only allow specific fields
    allowed = {"is_email_verified", "banned"}
    safe_updates = {k: v for k, v in updates.items() if k in allowed}
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": safe_updates})
    return {"message": "User updated"}


@router.get("/verifications")
async def list_verifications(
    user: dict = Depends(require_admin),
    status: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    per_page: int = 25,
):
    per_page = min(max(per_page, 1), 100)
    page = max(page, 1)
    query: dict = {}
    if status == "pending":
        query["$or"] = [{"is_verified": False}, {"is_licensed": False}, {"is_insured": False}]
    elif status == "verified":
        query["is_verified"] = True
    elif status == "rejected":
        query["licence_status"] = "rejected"
    total = await db.pro_profiles.count_documents(query)
    pros = await db.pro_profiles.find(query).sort("created_at", -1).skip((page-1)*per_page).limit(per_page).to_list(per_page)
    result = []
    for pro in pros:
        p = serialize_doc(pro)
        u = await db.users.find_one({"_id": ObjectId(pro["user_id"])}) if pro.get("user_id") else None
        if u:
            # Optional search filter (name/email) applied client-side AFTER hydration
            if q:
                hay = f"{u.get('name','')} {u.get('email','')} {pro.get('business_name','')}".lower()
                if q.lower() not in hay:
                    continue
            p["user_name"] = u.get("name", "")
            p["user_email"] = u.get("email", "")
            p["user_country"] = u.get("country", "")
            p["user_phone"] = u.get("phone", "")
        if pro.get("licence_file_id"):
            p["licence_url"] = f"/api/uploads/{pro['licence_file_id']}"
        if pro.get("insurance_file_id"):
            p["insurance_url"] = f"/api/uploads/{pro['insurance_file_id']}"
        result.append(p)
    return {"pros": result, "total": total, "page": page, "per_page": per_page}


@router.patch("/pros/{pro_id}/verify")
async def verify_pro(pro_id: str, data: dict, user: dict = Depends(require_admin)):
    """Admin updates licence / insurance status. Allowed values: pending | verified | rejected | missing.
    The badge booleans (is_licensed / is_insured / is_verified) are derived from those statuses."""
    raw = await db.pro_profiles.find_one({"_id": ObjectId(pro_id)})
    if not raw:
        raise HTTPException(status_code=404, detail="Pro not found")

    updates = {}
    # Licence (Gewerbeschein) — required document
    if "licence_status" in data:
        v = data["licence_status"]
        if v not in ("pending", "verified", "rejected"):
            raise HTTPException(status_code=400, detail="Invalid licence_status")
        updates["licence_status"] = v
        updates["is_licensed"] = (v == "verified")
    # Insurance (Gewerbeversicherung) — optional document
    if "insurance_status" in data:
        v = data["insurance_status"]
        if v not in ("pending", "verified", "rejected", "missing"):
            raise HTTPException(status_code=400, detail="Invalid insurance_status")
        updates["insurance_status"] = v
        updates["is_insured"] = (v == "verified")
    # Legacy overall verified flag
    if "is_verified" in data:
        updates["is_verified"] = bool(data["is_verified"])

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    # Auto-derive overall is_verified: licence must at minimum be verified
    final_licence = updates.get("is_licensed", raw.get("is_licensed", False))
    updates["is_verified"] = bool(final_licence)
    updates["verified_at"] = datetime.now(timezone.utc) if final_licence else None

    await db.pro_profiles.update_one({"_id": ObjectId(pro_id)}, {"$set": updates})
    # Return the FULL merged state so the frontend doesn't have to refetch
    merged = await db.pro_profiles.find_one({"_id": ObjectId(pro_id)})
    return {
        "message": "Verification updated",
        "is_licensed": bool(merged.get("is_licensed")),
        "is_insured": bool(merged.get("is_insured")),
        "is_verified": bool(merged.get("is_verified")),
        "licence_status": merged.get("licence_status"),
        "insurance_status": merged.get("insurance_status"),
    }


@router.get("/jobs")
async def list_all_jobs(
    user: dict = Depends(require_admin),
    status: Optional[str] = None,
    category: Optional[str] = None,
    listing_type: Optional[str] = None,
    q: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    page: int = 1,
    per_page: int = 25,
):
    per_page = min(max(per_page, 1), 100)
    page = max(page, 1)
    query: dict = {}
    if status:
        query["status"] = status
    if category:
        query["category"] = category
    if listing_type and listing_type in ("task", "project"):
        query["listing_type"] = listing_type
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"title": rx}, {"description": rx}, {"city": rx}]
    if year:
        if month:
            start = datetime(year, month, 1, tzinfo=timezone.utc)
            ny = year + (1 if month == 12 else 0)
            nm = 1 if month == 12 else month + 1
            end = datetime(ny, nm, 1, tzinfo=timezone.utc)
        else:
            start = datetime(year, 1, 1, tzinfo=timezone.utc)
            end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        query["posted_at"] = {"$gte": start, "$lt": end}

    jobs = await db.jobs.find(query).sort("posted_at", -1).skip((page-1)*per_page).limit(per_page).to_list(per_page)
    total = await db.jobs.count_documents(query)
    result = []
    for j in jobs:
        js = serialize_doc(j)
        js["quote_count"] = await db.quotes.count_documents({"job_id": js["id"]})
        result.append(js)
    # Per-category bucket counts (un-filtered by category, but honour status+year+month for context)
    bucket_q = {k: v for k, v in query.items() if k != "category"}
    pipeline = [
        {"$match": bucket_q},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    cat_buckets = []
    async for row in db.jobs.aggregate(pipeline):
        cat_buckets.append({"category": row["_id"], "count": row["count"]})
    return {"jobs": result, "total": total, "page": page, "per_page": per_page, "category_buckets": cat_buckets}


@router.get("/reviews")
async def list_reviews(
    user: dict = Depends(require_admin),
    flagged_only: bool = False,
    q: Optional[str] = None,
    year: Optional[int] = None,
    page: int = 1,
    per_page: int = 25,
):
    per_page = min(max(per_page, 1), 100)
    page = max(page, 1)
    query = {}
    if flagged_only:
        query["is_flagged"] = True
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"text": rx}, {"comment": rx}]
    if year:
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        query["created_at"] = {"$gte": start, "$lt": end}

    total = await db.reviews.count_documents(query)
    reviews = await db.reviews.find(query).sort("created_at", -1).skip((page-1)*per_page).limit(per_page).to_list(per_page)
    result = []
    for rev in reviews:
        r = serialize_doc(rev)
        ho = await db.users.find_one({"_id": ObjectId(rev["homeowner_id"])}) if rev.get("homeowner_id") else None
        if ho:
            r["reviewer_name"] = ho.get("name", "")
        # Resolve pro display name
        if rev.get("pro_id"):
            try:
                pp = await db.pro_profiles.find_one({"_id": ObjectId(rev["pro_id"])})
            except Exception:
                pp = None
            if pp:
                if pp.get("business_name"):
                    r["pro_name"] = pp["business_name"]
                else:
                    pu = await db.users.find_one({"_id": ObjectId(pp["user_id"])}) if pp.get("user_id") else None
                    r["pro_name"] = pu.get("name", "") if pu else ""
        result.append(r)
    return {"reviews": result, "total": total, "page": page, "per_page": per_page}


@router.patch("/reviews/{review_id}")
async def moderate_review(review_id: str, data: dict, user: dict = Depends(require_admin)):
    await db.reviews.update_one({"_id": ObjectId(review_id)}, {"$set": {"is_hidden": data.get("is_hidden", True)}})
    return {"message": "Review updated"}


@router.get("/categories")
async def list_categories(user: dict = Depends(require_admin)):
    cats = await db.categories.find().to_list(20)
    return {"categories": cats}


@router.patch("/categories/{cat_id}")
async def update_category(cat_id: str, data: dict, user: dict = Depends(require_admin)):
    if "contact_fee" in data:
        fee = float(data["contact_fee"])
        if fee < 4.0:
            raise HTTPException(status_code=400, detail="Minimum fee is €4")
        await db.categories.update_one({"_id": cat_id}, {"$set": {"contact_fee": fee}})
    return {"message": "Category updated"}


# ──────────────────────────────────────────────
# OVERVIEW — revenue time-series + category bar + activity feed
# ──────────────────────────────────────────────
@router.get("/revenue-timeseries")
async def revenue_timeseries(user: dict = Depends(require_admin)):
    """Last 6 months MRR + contact fee revenue."""
    now = datetime.now(timezone.utc)
    months = []
    for i in range(5, -1, -1):
        # Walk back i months
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        start = datetime(year, month, 1, tzinfo=timezone.utc)
        nm = month + 1
        ny = year
        if nm == 13:
            nm = 1
            ny += 1
        end = datetime(ny, nm, 1, tzinfo=timezone.utc)
        months.append((start, end, start.strftime("%b")))

    pro_count_now = await db.pro_profiles.count_documents({"plan_tier": "pro"})
    # We don't keep historical pro_count, so we backfill with the current count for the last month
    # and approximate older months by dropping ~10% per step back (simple smoothing for chart).
    series = []
    cur_pro = pro_count_now
    for idx in range(len(months) - 1, -1, -1):
        start, end, label = months[idx]
        # contact fees in this month from fee_log
        pipeline = [
            {"$match": {"incurred_at": {"$gte": start, "$lt": end}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        agg = await db.fee_log.aggregate(pipeline).to_list(1)
        fees_total = round((agg[0]["total"] if agg else 0), 2)
        mrr = round(cur_pro * 29.99, 2)
        series.insert(0, {"month": label, "mrr": mrr, "fees": fees_total})
        # Decay back in time
        cur_pro = max(0, int(cur_pro * 0.9))
    return {"series": series}


@router.get("/category-revenue")
async def category_revenue(user: dict = Depends(require_admin)):
    """Last 30 days revenue per category from fee_log."""
    since = datetime.now(timezone.utc) - timedelta(days=30)
    pipeline = [
        {"$match": {"incurred_at": {"$gte": since}}},
        {"$group": {"_id": "$category", "revenue": {"$sum": "$amount"}, "quotes": {"$sum": 1}}},
        {"$sort": {"revenue": -1}}
    ]
    rows = await db.fee_log.aggregate(pipeline).to_list(50)
    # Pull category labels
    cats = await db.categories.find().to_list(50)
    cat_map = {c["_id"]: c for c in cats}
    out = []
    for r in rows:
        meta = cat_map.get(r["_id"], {})
        out.append({
            "category": r["_id"],
            "label": meta.get("name_en", r["_id"]),
            "revenue": round(r.get("revenue", 0), 2),
            "quotes": r.get("quotes", 0),
        })
    return {"categories": out}


@router.get("/recent-activity")
async def recent_activity(user: dict = Depends(require_admin), limit: int = 20):
    """Merge several event sources into a single sorted activity feed."""
    events = []

    # Recent verifications submitted (uses pro_profile.created_at as proxy)
    async for p in db.pro_profiles.find().sort("created_at", -1).limit(limit):
        u = await db.users.find_one({"_id": ObjectId(p["user_id"])})
        if u:
            events.append({
                "kind": "verification",
                "title": f"{u.get('name','Unknown')} submitted ID verification",
                "at": p.get("created_at"),
            })

    # Recent jobs marked completed
    async for j in db.jobs.find({"status": "completed"}).sort("updated_at", -1).limit(limit):
        events.append({
            "kind": "job",
            "title": f"Job #{str(j['_id'])[-4:]} marked complete",
            "at": j.get("updated_at") or j.get("posted_at"),
        })

    # Recent reviews (flagged)
    async for r in db.reviews.find({"is_flagged": True}).sort("created_at", -1).limit(limit):
        events.append({
            "kind": "moderation",
            "title": "Review reported by user",
            "at": r.get("created_at"),
        })

    # Recent successful Pro subscriptions
    async for t in db.payment_transactions.find({"payment_status": "paid"}).sort("created_at", -1).limit(limit):
        u = await db.users.find_one({"_id": ObjectId(t["user_id"])}) if t.get("user_id") else None
        meta = t.get("metadata", {})
        if meta.get("plan") == "pro" and u:
            events.append({
                "kind": "billing",
                "title": f"{u.get('name','Unknown')} upgraded to Pro plan",
                "at": t.get("created_at"),
            })

    # Sort by 'at' desc, drop tz-naive (just in case)
    def _key(e):
        v = e.get("at")
        if not v:
            return datetime(1970, 1, 1, tzinfo=timezone.utc)
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace("Z", "+00:00"))
            except Exception:
                return datetime(1970, 1, 1, tzinfo=timezone.utc)
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v

    events.sort(key=_key, reverse=True)
    return {"events": [{**e, "at": _key(e).isoformat()} for e in events[:limit]]}


# ──────────────────────────────────────────────
# BILLING tab — stats + invoices + CSV export + retry
# ──────────────────────────────────────────────
@router.get("/billing-stats")
async def billing_stats(user: dict = Depends(require_admin)):
    pro_count = await db.pro_profiles.count_documents({"plan_tier": "pro"})
    mrr = pro_count * 29.99

    first_of_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    fee_pipeline = [
        {"$match": {"incurred_at": {"$gte": first_of_month}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    fee_agg = await db.fee_log.aggregate(fee_pipeline).to_list(1)
    contact_revenue = round(fee_agg[0]["total"] if fee_agg else 0, 2)

    failed_count = await db.payment_transactions.count_documents({
        "payment_status": {"$in": ["unpaid", "failed"]},
        "status": {"$ne": "complete"},
    })

    return {
        "mrr": round(mrr, 2),
        "pro_subscriptions": pro_count,
        "contact_revenue_month": contact_revenue,
        "failed_payments": failed_count,
    }


async def _invoice_rows(limit: int = 200, skip: int = 0, query: Optional[dict] = None):
    q = query or {}
    rows = await db.payment_transactions.find(q).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    out = []
    for t in rows:
        u = await db.users.find_one({"_id": ObjectId(t["user_id"])}) if t.get("user_id") else None
        meta = t.get("metadata", {})
        plan_label = "Pro" if meta.get("plan") == "pro" else ("Contact fees" if meta.get("type") == "contact_fees" else "Standard")
        out.append({
            "id": str(t["_id"]),
            "session_id": t.get("session_id"),
            "invoice_no": f"INV-{str(t['_id'])[-6:].upper()}",
            "user_name": u.get("name", "") if u else "",
            "user_email": u.get("email", "") if u else "",
            "country": u.get("country", "") if u else "",
            "plan": plan_label,
            "amount": round(float(t.get("amount", 0)), 2),
            "currency": t.get("currency", "eur"),
            "created_at": t.get("created_at").isoformat() if isinstance(t.get("created_at"), datetime) else t.get("created_at"),
            "payment_status": t.get("payment_status", "unpaid"),
            "status": t.get("status", "pending"),
        })
    return out


@router.get("/invoices")
async def list_invoices(
    user: dict = Depends(require_admin),
    status: Optional[str] = None,
    year: Optional[int] = None,
    page: int = 1,
    per_page: int = 25,
):
    per_page = min(max(per_page, 1), 100)
    page = max(page, 1)
    query: dict = {}
    if status:
        query["payment_status"] = status
    if year:
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        query["created_at"] = {"$gte": start, "$lt": end}
    total = await db.payment_transactions.count_documents(query)
    rows = await _invoice_rows(limit=per_page, skip=(page - 1) * per_page, query=query)
    return {"invoices": rows, "total": total, "page": page, "per_page": per_page}


@router.get("/invoices/export.csv")
async def export_invoices_csv(user: dict = Depends(require_admin)):
    rows = await _invoice_rows(limit=1000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Invoice", "User", "Email", "Country", "Plan", "Amount", "Currency", "Date", "Payment status", "Status"])
    for r in rows:
        w.writerow([
            r["invoice_no"], r["user_name"], r["user_email"], r["country"],
            r["plan"], r["amount"], r["currency"], r["created_at"],
            r["payment_status"], r["status"],
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="invoices.csv"'},
    )


@router.post("/invoices/{txn_id}/retry")
async def retry_invoice(txn_id: str, user: dict = Depends(require_admin)):
    """Mark a failed invoice for retry. In production this would create a new Stripe Checkout."""
    try:
        await db.payment_transactions.update_one(
            {"_id": ObjectId(txn_id)},
            {"$set": {"retry_at": datetime.now(timezone.utc), "status": "retry_requested"}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"message": "Retry requested"}


# ──────────────────────────────────────────────
# Destructive moderation actions
# ──────────────────────────────────────────────
@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, user: dict = Depends(require_admin)):
    try:
        result = await db.jobs.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": {"status": "cancelled", "cancelled_by_admin_at": datetime.now(timezone.utc)}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Job cancelled by admin"}


@router.get("/jobs/{job_id}")
async def get_admin_job(job_id: str, user: dict = Depends(require_admin)):
    """Full job detail + customer + accepted-pro snapshot — used by AdminSupport drawer."""
    try:
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    js = serialize_doc(job)
    js.pop("_id", None)
    js["quote_count"] = await db.quotes.count_documents({"job_id": str(job["_id"])})
    js["homeowner"] = None
    js["accepted_pro"] = None
    # Resolve customer (posted_by_id) + accepted pro (accepted_quote_id → quote.pro_user_id)
    homeowner_id = job.get("posted_by_id") or job.get("homeowner_id")
    if homeowner_id:
        try:
            ho = await db.users.find_one({"_id": ObjectId(homeowner_id)} if isinstance(homeowner_id, str) else {"_id": homeowner_id})
            if ho:
                js["homeowner"] = {"id": str(ho["_id"]), "name": ho.get("name"), "email": ho.get("email")}
        except Exception:
            pass
    if job.get("accepted_quote_id"):
        try:
            q = await db.quotes.find_one({"_id": ObjectId(job["accepted_quote_id"])})
            if q:
                pu = await db.users.find_one({"_id": ObjectId(q["pro_user_id"])})
                pp = await db.pro_profiles.find_one({"user_id": ObjectId(q["pro_user_id"])})
                js["accepted_pro"] = {
                    "user_id": str(q["pro_user_id"]),
                    "name": pu.get("name") if pu else "",
                    "business_name": pp.get("business_name") if pp else "",
                    "quote_amount": float(q.get("amount") or 0),
                }
        except Exception:
            pass
    return js



@router.delete("/reviews/{review_id}")
async def delete_review(review_id: str, user: dict = Depends(require_admin)):
    try:
        result = await db.reviews.update_one(
            {"_id": ObjectId(review_id)},
            {"$set": {"is_hidden": True, "deleted_by_admin_at": datetime.now(timezone.utc)}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Review not found")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Review not found")
    return {"message": "Review hidden"}


@router.patch("/users/{user_id}/ban")
async def ban_user(user_id: str, data: dict, user: dict = Depends(require_admin)):
    banned = bool(data.get("banned", True))
    try:
        result = await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"banned": banned, "banned_at": datetime.now(timezone.utc) if banned else None}}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User updated", "banned": banned}
