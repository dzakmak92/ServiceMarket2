"""Analytics routes — Pro-only insights for the Advanced Analytics dashboard.

Endpoints:
  GET /api/analytics/pro-insights
    -> earnings_6m: [{ month, earned, fees }] for the last 6 calendar months
    -> funnel: { quotes_sent, accepted, completed, rate_accept_pct, rate_complete_pct }
    -> avg_response_minutes: median time from job posted_at to quote sent_at (per pro)
    -> category_conversion: top 5 categories by quote-accept rate (pro-specific)
    -> peak_hours: 24-bucket distribution of when jobs in the pro's categories get posted
    -> currency: 'eur'
    -> plan_tier: 'standard' or 'pro' (frontend uses this to gate the card)
"""
import os
import statistics
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId

from database import db
from auth import get_current_user

router = APIRouter(prefix="/analytics")


def _month_label(d: datetime) -> str:
    return d.strftime("%b %Y")


def _start_of_month(d: datetime) -> datetime:
    return d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _to_dt(v) -> datetime | None:
    """Best-effort convert mongo `datetime` or ISO string to tz-aware UTC."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str):
        try:
            d = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


@router.get("/pro-insights")
async def pro_insights(user: dict = Depends(get_current_user)):
    """Return Advanced Analytics insights for a tradesperson."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Tradespersons only")

    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=404, detail="Pro profile not found")

    pro_id_str = str(pro_profile["_id"])
    plan_tier = pro_profile.get("plan_tier") or "standard"

    # ── 1. Earnings (last 6 calendar months) ─────────────────────────
    now = datetime.now(timezone.utc)
    months: list[datetime] = []
    cursor = _start_of_month(now)
    for i in range(6):
        months.append(cursor)
        # Go back one month
        if cursor.month == 1:
            cursor = cursor.replace(year=cursor.year - 1, month=12)
        else:
            cursor = cursor.replace(month=cursor.month - 1)
    months = list(reversed(months))  # oldest first

    # Accepted quotes by this pro -> price counts as earnings in the accepted_at month
    accepted_quotes = await db.quotes.find(
        {"pro_id": pro_id_str, "status": "accepted"}
    ).to_list(2000)
    earnings_by_month = defaultdict(float)
    for q in accepted_quotes:
        when = _to_dt(q.get("accepted_at") or q.get("sent_at"))
        if not when:
            continue
        key = when.strftime("%Y-%m")
        earnings_by_month[key] += float(q.get("price") or 0)

    # Contact fees paid this period
    fees = await db.fee_logs.find({"pro_id": pro_id_str}).to_list(2000)
    fees_by_month = defaultdict(float)
    for f in fees:
        when = _to_dt(f.get("incurred_at"))
        if not when:
            continue
        key = when.strftime("%Y-%m")
        fees_by_month[key] += float(f.get("amount") or 0)

    earnings_6m = []
    for m in months:
        key = m.strftime("%Y-%m")
        earnings_6m.append({
            "month": _month_label(m),
            "earned": round(earnings_by_month.get(key, 0.0), 2),
            "fees": round(fees_by_month.get(key, 0.0), 2),
        })

    # ── 2. Funnel: Quotes sent → Accepted → Completed ────────────────
    all_quotes = await db.quotes.find({"pro_id": pro_id_str}).to_list(5000)
    quotes_sent = len(all_quotes)
    accepted_ids = {str(q.get("job_id")) for q in all_quotes if q.get("status") == "accepted"}
    accepted = len(accepted_ids)
    completed = 0
    if accepted_ids:
        completed = await db.jobs.count_documents({
            "_id": {"$in": [ObjectId(j) for j in accepted_ids if ObjectId.is_valid(j)]},
            "status": "completed",
            "accepted_pro_id": pro_id_str,
        })
    rate_accept_pct = round((accepted / quotes_sent) * 100, 1) if quotes_sent else 0.0
    rate_complete_pct = round((completed / accepted) * 100, 1) if accepted else 0.0
    funnel = {
        "quotes_sent": quotes_sent,
        "accepted": accepted,
        "completed": completed,
        "rate_accept_pct": rate_accept_pct,
        "rate_complete_pct": rate_complete_pct,
    }

    # ── 3. Median response time + ── 4. Per-category accept stats ───
    # Batch-load all parent jobs ONCE with both posted_at + category projection
    response_minutes: list[float] = []
    job_ids = list({q.get("job_id") for q in all_quotes if q.get("job_id")})
    job_ids_oid = [ObjectId(j) for j in job_ids if ObjectId.is_valid(j)]
    jobs_map: dict[str, dict] = {}
    if job_ids_oid:
        async for j in db.jobs.find(
            {"_id": {"$in": job_ids_oid}},
            {"posted_at": 1, "category": 1},
        ):
            jobs_map[str(j["_id"])] = j
    for q in all_quotes:
        job = jobs_map.get(str(q.get("job_id")))
        if not job:
            continue
        posted_at = _to_dt(job.get("posted_at"))
        sent_at = _to_dt(q.get("sent_at"))
        if posted_at and sent_at and sent_at >= posted_at:
            delta_min = (sent_at - posted_at).total_seconds() / 60.0
            # Sanity cap at 30 days
            if 0 <= delta_min <= 60 * 24 * 30:
                response_minutes.append(delta_min)
    median_response = round(statistics.median(response_minutes), 1) if response_minutes else None

    # Per-category aggregation (using the same jobs_map)
    per_cat: dict[str, dict] = defaultdict(lambda: {"sent": 0, "accepted": 0})
    for q in all_quotes:
        job = jobs_map.get(str(q.get("job_id"))) or {}
        cat = job.get("category")
        if not cat:
            continue
        per_cat[cat]["sent"] += 1
        if q.get("status") == "accepted":
            per_cat[cat]["accepted"] += 1
    category_conversion = []
    for cat, c in per_cat.items():
        if c["sent"] < 1:
            continue
        rate = round((c["accepted"] / c["sent"]) * 100, 1) if c["sent"] else 0
        category_conversion.append({
            "category": cat,
            "sent": c["sent"],
            "accepted": c["accepted"],
            "rate_pct": rate,
        })
    category_conversion.sort(key=lambda x: (-x["rate_pct"], -x["sent"]))
    category_conversion = category_conversion[:5]

    # ── 5. Peak hours of new-job postings in pro's service categories ─
    service_cats = pro_profile.get("service_categories") or []
    peak_buckets = [0] * 24
    if service_cats:
        peak_query: dict = {"category": {"$in": service_cats}}
        # Only filter by country when set — empty-string fallback would mis-match
        if user.get("country"):
            peak_query["country"] = user["country"]
        async for j in db.jobs.find(peak_query, {"posted_at": 1}).limit(1000):
            posted_at = _to_dt(j.get("posted_at"))
            if posted_at:
                peak_buckets[posted_at.hour] += 1

    return {
        "plan_tier": plan_tier,
        "currency": "eur",
        "earnings_6m": earnings_6m,
        "funnel": funnel,
        "avg_response_minutes": median_response,
        "category_conversion": category_conversion,
        "peak_hours": peak_buckets,
        "totals": {
            "earned_6m": round(sum(e["earned"] for e in earnings_6m), 2),
            "fees_6m": round(sum(e["fees"] for e in earnings_6m), 2),
            "net_6m": round(sum(e["earned"] - e["fees"] for e in earnings_6m), 2),
        },
    }
