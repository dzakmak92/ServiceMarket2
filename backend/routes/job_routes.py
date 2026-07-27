from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from database import db
from auth import get_current_user
from models import JobCreate, JobUpdate, JobStatusUpdate, JobLocationShare
from utils import serialize_doc
from routes.push_routes import notify_matching_pros
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from typing import Optional

router = APIRouter(prefix="/jobs")


@router.get("")
async def list_jobs(
    user: dict = Depends(get_current_user),
    category: Optional[str] = None,
    status: Optional[str] = None,
    listing_type: Optional[str] = None,
    page: int = 1
):
    """List jobs - pros see their country's open jobs, homeowners see ALL their own jobs by default."""
    query = {}
    if user["role"] == "tradesperson":
        requested_status = status or "open"
        query["country"] = user.get("country")
        query["status"] = requested_status
        # For in_progress/completed: the pro is the accepted worker — filter by their pro_id
        if requested_status in ("in_progress", "completed"):
            pro_profile_for_filter = await db.pro_profiles.find_one({"user_id": user["_id"]})
            if pro_profile_for_filter:
                query["accepted_pro_id"] = str(pro_profile_for_filter["_id"])
            del query["country"]  # country filter not needed for own jobs
    elif user["role"] == "homeowner":
        query["posted_by_id"] = user["_id"]
        if status:
            query["status"] = status         # homeowners see ALL their jobs unless they filter
    elif user["role"] == "admin":
        if status:
            query["status"] = status

    if category:
        query["category"] = category
    if listing_type and listing_type in ("task", "project"):
        query["listing_type"] = listing_type

    jobs = await db.jobs.find(query).sort("posted_at", -1).skip((page - 1) * 20).limit(20).to_list(20)
    total = await db.jobs.count_documents(query)

    # Geo-fence filter: only apply for pros browsing OPEN jobs with a service radius set
    if user["role"] == "tradesperson" and query.get("status") == "open":
        pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
        if pro_profile and (pro_profile.get("service_radius_km") or 0) > 0:
            from services.geo import within_radius
            c_lat = pro_profile.get("service_center_lat")
            c_lng = pro_profile.get("service_center_lng")
            r_km = int(pro_profile.get("service_radius_km") or 0)
            jobs = [j for j in jobs if within_radius(j.get("city"), c_lat, c_lng, r_km)]

    result = []
    for job in jobs:
        j = serialize_doc(job)
        # Get quote count
        j["quote_count"] = await db.quotes.count_documents({"job_id": j["id"]})
        result.append(j)

    return {"jobs": result, "total": total, "page": page}


import random
import string

def _generate_job_id() -> str:
    """Format: YY-MMR2-R4  e.g. 26-06P5-GYS4
    YY = 2-digit year, MM = 2-digit month, R2 = 2 random alphanum, R4 = 4 random alphanum.
    36^6 ≈ 2.17 billion combinations — effectively no collisions at any realistic scale.
    """
    now = datetime.now(timezone.utc)
    yy = now.strftime("%y")
    mm = now.strftime("%m")
    chars = string.ascii_uppercase + string.digits
    r2 = "".join(random.choices(chars, k=2))
    r4 = "".join(random.choices(chars, k=4))
    return f"{yy}-{mm}{r2}-{r4}"


async def _next_job_number() -> str:
    """Generate a unique job ID, retrying on the rare collision."""
    for _ in range(10):
        jid = _generate_job_id()
        if not await db.jobs.find_one({"job_number": jid}):
            return jid
    raise RuntimeError("Could not generate unique job ID")


@router.post("")
async def create_job(data: JobCreate, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    if user["role"] != "homeowner":
        raise HTTPException(status_code=403, detail="Only homeowners can post jobs")

    if data.budget_min and data.budget_max and data.budget_max < data.budget_min:
        raise HTTPException(status_code=400, detail="budget_max must be >= budget_min")

    # Attachment limit: 5 for tasks, 20 for projects
    attachments = [a.model_dump() for a in (data.attachments or [])]
    max_att = 20 if data.listing_type == "project" else 5
    if len(attachments) > max_att:
        raise HTTPException(status_code=400, detail=f"Maximum {max_att} attachments per listing")

    # Projects require a description (scope)
    if data.listing_type == "project" and not data.description.strip():
        raise HTTPException(status_code=400, detail="Project scope/description is required")

    name = user.get("name", "")
    show_last = user.get("privacy_show_lastname", True)
    if not show_last:
        parts = name.split()
        display_name = f"{parts[0]} {parts[-1][0]}." if len(parts) > 1 else name
    else:
        display_name = name

    job_number = await _next_job_number()

    now = datetime.now(timezone.utc)

    # Recurring: determine offsets (in days) for additional occurrences
    recurring_offsets: list[int] = []
    if data.recurring_type in ("weekly", "biweekly", "monthly") and data.recurring_count and data.recurring_count > 1:
        count = min(max(data.recurring_count, 2), 8)
        interval_days = {"weekly": 7, "biweekly": 14, "monthly": 30}[data.recurring_type]
        recurring_offsets = [interval_days * i for i in range(1, count)]

    recurring_group_id = str(ObjectId()) if recurring_offsets else None

    job_doc = {
        "job_number": job_number,
        "posted_by_id": user["_id"],
        "posted_by_name": display_name,
        "title": data.title,
        "category": data.category,
        "description": data.description,
        "country": user.get("country"),
        "city": data.city,
        "budget_min": data.budget_min,
        "budget_max": data.budget_max,
        "urgency": data.urgency,
        "status": "open",
        "accepted_pro_id": None,
        "final_price": None,
        "quote_count_cache": 0,
        "posted_at": now,
        "completed_at": None,
        "attachments": attachments,
        "listing_type": data.listing_type,
        "timeline_weeks": data.timeline_weeks,
        "site_visit_required": data.site_visit_required,
        "recurring_type": data.recurring_type,
        "recurring_group_id": recurring_group_id,
        "recurring_occurrence": 1 if recurring_offsets else None,
    }
    result = await db.jobs.insert_one(job_doc)
    job_doc["_id"] = result.inserted_id

    # Create additional occurrences for recurring jobs
    if recurring_offsets and recurring_group_id:
        for idx, offset_days in enumerate(recurring_offsets, start=2):
            child_jid = await _next_job_number()
            child_doc = {
                **{k: v for k, v in job_doc.items() if k != "_id"},
                "job_number": child_jid,
                "posted_at": now + timedelta(days=offset_days),
                "recurring_occurrence": idx,
                "recurring_group_id": recurring_group_id,
            }
            await db.jobs.insert_one(child_doc)

    # Fire instant push + in-app notifications to matching pros (fire-and-forget)
    background_tasks.add_task(notify_matching_pros, dict(job_doc))

    return serialize_doc(job_doc)


@router.get("/{job_id}")
async def get_job(job_id: str, user: dict = Depends(get_current_user)):
    try:
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    j = serialize_doc(job)

    # Attach quotes with pro info + availability (this week + next week of free slots)
    quotes = await db.quotes.find({"job_id": job_id}).to_list(50)
    quotes_out = []
    for q in quotes:
        q_ser = serialize_doc(q)
        # Surface the new pricing fields even for legacy rows (price/price_type may be missing)
        q_ser.setdefault("price_type", "pauschal")
        q_ser.setdefault("amount", q_ser.get("price"))
        q_ser.setdefault("travel_cost", 0)
        q_ser.setdefault("parking_cost", 0)
        q_ser.setdefault("estimated_hours", None)
        q_ser.setdefault("milestones", [])  # iter36 — project phase breakdown
        q_ser["price_total"] = q.get("price_total") or q.get("price")
        # Get pro user info
        pro_profile = await db.pro_profiles.find_one({"_id": ObjectId(q["pro_id"])}) if q.get("pro_id") else None
        if pro_profile:
            pro_user = await db.users.find_one({"_id": ObjectId(pro_profile["user_id"])})
            q_ser["pro_name"] = pro_user.get("name", "") if pro_user else ""
            q_ser["pro_rating"] = pro_profile.get("rating_avg", 0)
            q_ser["pro_reviews"] = pro_profile.get("reviews_count", 0)
            q_ser["pro_verified"] = pro_profile.get("is_verified", False)
            q_ser["pro_badge"] = pro_profile.get("plan_tier") in ("pro", "explorer")
            q_ser["pro_user_id"] = pro_profile.get("user_id", "")
            # 14-day read-only availability snapshot (this week + next week of free slots)
            today = datetime.now(timezone.utc).date()
            avail_rows = await db.pro_availability.find({"pro_id": str(pro_profile["_id"])}).to_list(200)
            # Build a {weekday → [slots]} index of only-available weekdays
            avail_by_day = {}
            for a in avail_rows:
                if not a.get("is_available"):
                    continue
                avail_by_day.setdefault(a["day"], []).append(a["slot"])
            book_rows = await db.bookings.find({
                "pro_id": str(pro_profile["_id"]),
                "status": "confirmed",
            }).to_list(200)
            booked = {(b.get("date"), b.get("slot")) for b in book_rows}
            weekday_names = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
            upcoming_free = []
            for i in range(14):
                d = today + timedelta(days=i)
                wd = weekday_names[d.weekday()]
                day_iso = d.isoformat()
                for s in avail_by_day.get(wd, []):
                    if (day_iso, s) in booked:
                        continue
                    upcoming_free.append({"date": day_iso, "slot": s})
                    if len(upcoming_free) >= 8:
                        break
                if len(upcoming_free) >= 8:
                    break
            q_ser["pro_next_slots"] = upcoming_free
        quotes_out.append(q_ser)

    j["quotes"] = quotes_out
    j["quote_count"] = len(quotes)
    j["quote_count_remaining"] = max(0, 5 - len(quotes))  # iter22 — 5-application cap

    # Surface the accepted pro's user_id (handy for the homeowner to open messages)
    if j.get("accepted_pro_id"):
        try:
            accepted_pp = await db.pro_profiles.find_one({"_id": ObjectId(j["accepted_pro_id"])})
            if accepted_pp:
                j["accepted_pro_user_id"] = accepted_pp.get("user_id", "")
                j["pro_user_id"] = accepted_pp.get("user_id", "")
        except Exception:
            pass

    return j


@router.patch("/{job_id}/status")
async def update_job_status(job_id: str, data: JobStatusUpdate, user: dict = Depends(get_current_user)):
    try:
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Only homeowner who posted can update, or admin
    if user["role"] != "admin" and job["posted_by_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    update = {"status": data.status}
    if data.status == "completed":
        update["completed_at"] = datetime.now(timezone.utc)

    await db.jobs.update_one({"_id": ObjectId(job_id)}, {"$set": update})

    # Notify the accepted pro when homeowner marks complete
    if data.status == "completed" and job.get("accepted_pro_id"):
        try:
            pro_profile = await db.pro_profiles.find_one({"_id": ObjectId(job["accepted_pro_id"])})
            if pro_profile:
                pro_uid = pro_profile.get("user_id")
                job_num  = job.get("job_number", str(job_id)[:8])
                job_title = job.get("title", "Your job")
                await db.notifications.insert_one({
                    "user_id":   pro_uid,
                    "type":      "job_completed",
                    "title":     "Job marked complete!",
                    "body":      f'"{job_title}" ({job_num}) has been marked complete by the homeowner. You can now send an invoice.',
                    "link_to":   "/my-invoices",
                    "job_id":    str(job_id),
                    "is_read":   False,
                    "created_at": datetime.now(timezone.utc),
                })
        except Exception:
            pass  # never block the status update

    return {"message": "Status updated", "status": data.status}


@router.patch("/{job_id}")
async def update_job(job_id: str, data: JobUpdate, user: dict = Depends(get_current_user)):
    """Homeowner-side edit of an OPEN job (title/category/description/city/budget/urgency/attachments)."""
    try:
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if user["role"] != "admin" and job["posted_by_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if job.get("status") != "open":
        raise HTTPException(status_code=400, detail="Only open jobs can be edited")

    update: dict = {}
    if data.title is not None:
        update["title"] = data.title.strip()
    if data.category is not None:
        update["category"] = data.category
    if data.description is not None:
        update["description"] = data.description.strip()
    if data.city is not None:
        if not data.city.strip():
            raise HTTPException(status_code=400, detail="City cannot be empty")
        update["city"] = data.city.strip()
    if data.urgency is not None:
        if data.urgency not in ("low", "medium", "high"):
            raise HTTPException(status_code=400, detail="Invalid urgency")
        update["urgency"] = data.urgency
    # budget — allow null to clear, but validate min <= max when both set
    if data.budget_min is not None or data.budget_max is not None:
        new_min = data.budget_min if data.budget_min is not None else job.get("budget_min")
        new_max = data.budget_max if data.budget_max is not None else job.get("budget_max")
        if new_min is not None and new_max is not None and new_max < new_min:
            raise HTTPException(status_code=400, detail="budget_max must be >= budget_min")
        if data.budget_min is not None:
            update["budget_min"] = data.budget_min or None
        if data.budget_max is not None:
            update["budget_max"] = data.budget_max or None
    if data.attachments is not None:
        atts = [a.model_dump() for a in data.attachments]
        if len(atts) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 attachments per job")
        update["attachments"] = atts

    if not update:
        return serialize_doc(job)

    update["edited_at"] = datetime.now(timezone.utc)
    await db.jobs.update_one({"_id": ObjectId(job_id)}, {"$set": update})
    updated = await db.jobs.find_one({"_id": ObjectId(job_id)})
    return serialize_doc(updated)


@router.delete("/{job_id}")
async def cancel_job(job_id: str, user: dict = Depends(get_current_user)):
    try:
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if user["role"] != "admin" and job["posted_by_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    if job["status"] not in ["open"]:
        raise HTTPException(status_code=400, detail="Can only cancel open jobs")

    await db.jobs.update_one({"_id": ObjectId(job_id)}, {"$set": {"status": "cancelled"}})
    return {"message": "Job cancelled"}


@router.patch("/{job_id}/share-location")
async def share_location(job_id: str, data: JobLocationShare, user: dict = Depends(get_current_user)):
    """Homeowner shares the precise address with the accepted pro after quote acceptance."""
    try:
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["posted_by_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if job["status"] not in ("in_progress", "completed"):
        raise HTTPException(status_code=400, detail="Quote must be accepted first")

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {
            "address_full": data.address_full,
            "lat": data.lat,
            "lng": data.lng,
            "location_shared": True,
            "location_shared_at": datetime.now(timezone.utc),
        }}
    )
    # Notify pro via system message + notification
    pro_id = job.get("accepted_pro_id")
    if pro_id:
        pro_profile = await db.pro_profiles.find_one({"_id": ObjectId(pro_id)})
        if pro_profile:
            pro_user_id = pro_profile["user_id"]
            await db.messages.insert_one({
                "job_id": job_id,
                "from_id": user["_id"],
                "to_id": pro_user_id,
                "text": f"📍 Address shared: {data.address_full}",
                "kind": "location",
                "address_full": data.address_full,
                "lat": data.lat,
                "lng": data.lng,
                "sent_at": datetime.now(timezone.utc),
                "read_at": None,
            })
            await db.notifications.insert_one({
                "user_id": pro_user_id,
                "kind": "location_shared",
                "title": "Address shared",
                "body": f"Homeowner shared the job address: {data.address_full}",
                "link_to": "/messages",
                "is_read": False,
                "created_at": datetime.now(timezone.utc),
            })
    return {"message": "Location shared", "address_full": data.address_full}


@router.get("/{job_id}/contact")
async def get_contact_info(job_id: str, user: dict = Depends(get_current_user)):
    """After a quote is accepted, expose contact info between homeowner and accepted pro."""
    try:
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] not in ("in_progress", "completed"):
        raise HTTPException(status_code=403, detail="Contact info available only after acceptance")

    pro_id = job.get("accepted_pro_id")
    if not pro_id:
        raise HTTPException(status_code=404, detail="No accepted pro")

    pro_profile = await db.pro_profiles.find_one({"_id": ObjectId(pro_id)})
    pro_user = await db.users.find_one({"_id": ObjectId(pro_profile["user_id"])}) if pro_profile else None
    homeowner_user = await db.users.find_one({"_id": ObjectId(job["posted_by_id"])})

    if user["_id"] not in (job["posted_by_id"], pro_profile["user_id"] if pro_profile else None) and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    return {
        "pro": {
            "user_id": pro_profile["user_id"] if pro_profile else "",
            "name": pro_user.get("name") if pro_user else "",
            "phone": pro_user.get("phone", "") if pro_user else "",
            "email": pro_user.get("email", "") if pro_user else "",
            "business_name": pro_profile.get("business_name", "") if pro_profile else "",
            "city": pro_user.get("city", "") if pro_user else "",
        },
        "homeowner": {
            "name": homeowner_user.get("name") if homeowner_user else "",
            "phone": homeowner_user.get("phone", "") if homeowner_user else "",
            "email": homeowner_user.get("email", "") if homeowner_user else "",
            "city": homeowner_user.get("city", "") if homeowner_user else "",
        },
        "address_full": job.get("address_full") or "",
        "lat": job.get("lat"),
        "lng": job.get("lng"),
        "location_shared": bool(job.get("location_shared")),
    }
