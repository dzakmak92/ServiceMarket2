from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import get_current_user
from utils import serialize_doc
from bson import ObjectId
from typing import Optional

router = APIRouter(prefix="/pros")


@router.get("")
async def browse_pros(
    user: dict = Depends(get_current_user),
    category: Optional[str] = None,
    page: int = 1
):
    """Browse pros in user's country"""
    query = {}

    # Pros must have completed their profile somewhat
    if user.get("country"):
        # Get users who are tradespeople in this country
        user_ids = await db.users.find(
            {"role": "tradesperson", "country": user.get("country")}
        ).distinct("_id")
        user_id_strings = [str(uid) for uid in user_ids]

        query["user_id"] = {"$in": user_id_strings}

    if category:
        query["service_categories"] = category

    # Sort: Pro-tier members first (featured placement; "pro" < "standard" alpha → asc puts pro first),
    # then by rating desc
    pros = await db.pro_profiles.find(query).sort(
        [("plan_tier", 1), ("rating_avg", -1)]
    ).skip((page - 1) * 20).limit(20).to_list(20)
    total = await db.pro_profiles.count_documents(query)

    result = []
    for pro in pros:
        p = serialize_doc(pro)
        user_data = await db.users.find_one({"_id": ObjectId(pro["user_id"])})
        if user_data:
            p["name"] = user_data.get("name", "")
            p["city"] = user_data.get("city", "")
            p["country"] = user_data.get("country", "")
            p["lang"] = user_data.get("lang", "en")
        result.append(p)

    return {"pros": result, "total": total, "page": page}


@router.get("/{pro_id}")
async def get_pro(pro_id: str, user: dict = Depends(get_current_user)):
    """Get a pro profile by pro_profile id or user_id"""
    pro_profile = None

    # Try by ObjectId (profile id)
    try:
        pro_profile = await db.pro_profiles.find_one({"_id": ObjectId(pro_id)})
    except Exception:
        pass

    # Try by user_id
    if not pro_profile:
        pro_profile = await db.pro_profiles.find_one({"user_id": pro_id})

    if not pro_profile:
        raise HTTPException(status_code=404, detail="Pro not found")

    p = serialize_doc(pro_profile)
    user_data = await db.users.find_one({"_id": ObjectId(pro_profile["user_id"])})
    if user_data:
        p["name"] = user_data.get("name", "")
        p["city"] = user_data.get("city", "")
        p["country"] = user_data.get("country", "")

    # Get reviews (recent 50 — frontend paginates 5/page)
    reviews = await db.reviews.find(
        {"pro_id": str(pro_profile["_id"]), "is_hidden": {"$ne": True}}
    ).sort("created_at", -1).limit(50).to_list(50)

    reviews_out = []
    for rev in reviews:
        r = serialize_doc(rev)
        homeowner = await db.users.find_one({"_id": ObjectId(rev["homeowner_id"])})
        if homeowner:
            full = (homeowner.get("name") or "").strip()
            show_last = homeowner.get("privacy_show_lastname", True)
            if not show_last:
                parts = full.split()
                r["reviewer_name"] = f"{parts[0]} {parts[-1][0]}." if len(parts) > 1 else full
            else:
                r["reviewer_name"] = full
        # Attach job context for the review (no PII)
        job_id = rev.get("job_id")
        if job_id:
            try:
                job_doc = await db.jobs.find_one({"_id": ObjectId(job_id)})
                if job_doc:
                    r["job_id"] = str(job_doc["_id"])
                    r["job_title"] = job_doc.get("title", "")
                    r["job_category"] = job_doc.get("category", "")
                    r["job_city"] = job_doc.get("city", "")
                    r["job_completed_at"] = (
                        job_doc.get("completed_at").isoformat()
                        if job_doc.get("completed_at") else None
                    )
            except Exception:
                pass
        # Pro response (pre-serialized via serialize_doc; ensure ISO strings)
        if rev.get("response"):
            r["response"] = rev["response"]
            if rev.get("response_created_at"):
                r["response_created_at"] = rev["response_created_at"].isoformat()
            if rev.get("response_updated_at"):
                r["response_updated_at"] = rev["response_updated_at"].isoformat()
        reviews_out.append(r)
    p["reviews"] = reviews_out
    # Always recompute count + avg from the *visible* reviews so an admin hiding
    # a review immediately reflects in the public profile (the cached counters
    # on pro_profiles can otherwise go stale).
    visible_n = len(reviews_out)
    p["reviews_count"] = visible_n
    p["rating_avg"] = round(sum((r.get("rating") or 0) for r in reviews_out) / visible_n, 1) if visible_n else 0

    # Get availability
    avail = await db.pro_availability.find(
        {"pro_id": str(pro_profile["_id"]), "is_available": True}
    ).to_list(50)
    p["availability"] = [{"day": a["day"], "slot": a["slot"]} for a in avail]

    # Confirmed bookings — used to paint "booked" cells on the public calendar (no PII)
    bookings = await db.bookings.find(
        {"pro_id": str(pro_profile["_id"]), "status": "confirmed"}
    ).to_list(500)
    p["bookings"] = [
        {"date": b.get("date"), "day": b.get("day"), "slot": b.get("slot")}
        for b in bookings
    ]

    # Check if current user saved this pro
    saved = await db.saved_pros.find_one({
        "homeowner_id": user["_id"],
        "pro_id": str(pro_profile["_id"])
    })
    p["is_saved"] = bool(saved)

    return p
