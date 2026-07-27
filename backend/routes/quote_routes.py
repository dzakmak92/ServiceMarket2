from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user
from models import QuoteCreate
from utils import serialize_doc
from billing_cycle import next_billing_date
from datetime import datetime, timezone
from bson import ObjectId

router = APIRouter(prefix="/quotes")


async def create_notification(user_id: str, kind: str, title: str, body: str, link_to: str = "/dashboard"):
    await db.notifications.insert_one({
        "user_id": user_id,
        "kind": kind,
        "title": title,
        "body": body,
        "link_to": link_to,
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    })


@router.post("")
async def create_quote(data: QuoteCreate, user: dict = Depends(get_current_user)):
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros can submit quotes")

    # Get pro profile
    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=400, detail="Pro profile not found")

    pro_id = str(pro_profile["_id"])

    # Check job exists and is open
    try:
        job = await db.jobs.find_one({"_id": ObjectId(data.job_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "open":
        raise HTTPException(status_code=400, detail="Job is not accepting quotes")

    # Check for duplicate quote
    existing = await db.quotes.find_one({"job_id": data.job_id, "pro_id": pro_id})
    if existing:
        raise HTTPException(status_code=400, detail="You already quoted on this job")

    # Per-job quote cap: 5 for tasks, 8 for projects (keeps projects competitive)
    quote_count = await db.quotes.count_documents({"job_id": data.job_id})
    quote_cap = 8 if job.get("listing_type") == "project" else 5
    if quote_count >= quote_cap:
        raise HTTPException(status_code=400, detail="JOB_FULL")

    # Validate price type
    if data.price_type not in ("pauschal", "hourly", "milestone"):
        raise HTTPException(status_code=400, detail="price_type must be 'pauschal', 'hourly', or 'milestone'")
    if data.price_type == "hourly" and (not data.estimated_hours or data.estimated_hours <= 0):
        raise HTTPException(status_code=400, detail="estimated_hours is required for hourly quotes")
    if data.price_type == "milestone":
        if not data.milestones or len(data.milestones) < 2:
            raise HTTPException(status_code=400, detail="Milestone quotes require at least 2 phases")
        # Override amount with sum of milestones (ensures billing/invoice total is always correct)
        milestone_total = int(round(sum(m.amount for m in data.milestones)))
        total_price = milestone_total + data.travel_cost + data.parking_cost
    else:
        total_price = data.computed_total
    # NOTE: contact fee is NOT charged here. It is incurred when the homeowner accepts the quote.

    quote_doc = {
        "job_id": data.job_id,
        "pro_id": pro_id,
        "pro_user_id": user["_id"],
        # Legacy price column kept as the *total* so existing UI / billing / sort still works
        "price": total_price,
        "price_total": total_price,
        "price_type": data.price_type,
        "amount": data.amount if data.price_type != "milestone" else int(round(sum(m.amount for m in data.milestones))),
        "estimated_hours": data.estimated_hours,
        "travel_cost": data.travel_cost,
        "parking_cost": data.parking_cost,
        "message": data.message,
        "milestones": [m.model_dump() for m in (data.milestones or [])],
        "status": "pending",
        "sent_at": datetime.now(timezone.utc),
        "contact_fee_paid": 0.0
    }
    result = await db.quotes.insert_one(quote_doc)

    # Update quote count on job
    await db.jobs.update_one({"_id": ObjectId(data.job_id)}, {"$inc": {"quote_count_cache": 1}})

    # Notify homeowner
    await create_notification(
        job["posted_by_id"], "new_quote",
        "New quote received",
        f"New quote of €{total_price} received for '{job['title']}'",
        f"/jobs/{data.job_id}"
    )

    # Web Push to homeowner (best-effort)
    try:
        from push import send_push_to_user
        await send_push_to_user(job["posted_by_id"], {
            "title": "New quote received",
            "body": f"€{total_price} quote on '{job['title']}'",
            "url": f"/jobs/{data.job_id}",
            "tag": f"quote-{data.job_id}",
        })
    except Exception:
        pass

    quote_doc["_id"] = result.inserted_id
    return serialize_doc(quote_doc)


@router.post("/{quote_id}/accept")
async def accept_quote(quote_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "homeowner":
        raise HTTPException(status_code=403, detail="Only homeowners can accept quotes")

    try:
        quote = await db.quotes.find_one({"_id": ObjectId(quote_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Quote not found")
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    # Verify homeowner owns the job
    job = await db.jobs.find_one({"_id": ObjectId(quote["job_id"])})
    if not job or job["posted_by_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if job["status"] != "open":
        raise HTTPException(status_code=400, detail="Job is not open")

    job_id = quote["job_id"]
    pro_id = quote["pro_id"]

    # Accept this quote
    await db.quotes.update_one({"_id": ObjectId(quote_id)}, {"$set": {"status": "accepted"}})

    # Decline all other quotes
    await db.quotes.update_many(
        {"job_id": job_id, "_id": {"$ne": ObjectId(quote_id)}},
        {"$set": {"status": "declined"}}
    )

    # ── Charge the accepted pro a contact fee (only if they're on Standard plan) ──
    pro_profile = await db.pro_profiles.find_one({"_id": ObjectId(pro_id)})
    fee = 0.0
    if pro_profile and pro_profile.get("plan_tier") == "standard":
        category_doc = await db.categories.find_one({"_id": job["category"]})
        fee = category_doc.get("contact_fee", 6.0) if category_doc else 6.0
        await db.fee_log.insert_one({
            "pro_id": pro_id,
            "quote_id": quote_id,
            "job_id": job_id,
            "category": job["category"],
            "amount": fee,
            "status": "pending",  # outstanding — pro pays via /api/billing/pay-outstanding
            "incurred_at": datetime.now(timezone.utc),
            "due_at": next_billing_date(),  # monthly cycle cutoff (25th)
        })
        await db.pro_profiles.update_one(
            {"_id": pro_profile["_id"]},
            {"$inc": {"monthly_fees": fee}}
        )
        # Also update the quote's recorded fee for transparency
        await db.quotes.update_one(
            {"_id": ObjectId(quote_id)},
            {"$set": {"contact_fee_paid": fee}}
        )

    # Update job status
    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"status": "in_progress", "accepted_pro_id": pro_id, "final_price": quote["price"]}}
    )

    # Get pro user id for messaging
    if pro_profile:
        pro_user_id = pro_profile["user_id"]

        # Create system acceptance message
        await db.messages.insert_one({
            "job_id": job_id,
            "from_id": pro_user_id,
            "to_id": user["_id"],
            "text": f"Quote of €{quote['price']} was accepted",
            "kind": "acceptance",
            "sent_at": datetime.now(timezone.utc),
            "read_at": None
        })

        # Notify pro
        await create_notification(
            pro_user_id, "quote_accepted",
            "Your quote was accepted!",
            f"Your €{quote['price']} quote for '{job['title']}' was accepted",
            f"/messages"
        )

        # Web Push to pro (best-effort)
        try:
            from push import send_push_to_user
            await send_push_to_user(pro_user_id, {
                "title": "Quote accepted!",
                "body": f"Your €{quote['price']} quote for '{job['title']}' was accepted. Open chat to confirm details.",
                "url": "/messages",
                "tag": f"accepted-{job_id}",
                "requireInteraction": True,
            })
        except Exception:
            pass

    return {"message": "Quote accepted", "job_id": job_id, "pro_user_id": pro_profile.get("user_id") if pro_profile else None}

@router.post("/{quote_id}/mark-lost")
async def mark_quote_lost(quote_id: str, user: dict = Depends(get_current_user)):
    """The pro themselves can flag a quote as Lost (e.g., didn't win it / the
    homeowner went silent). Moves it out of the Applied tab into the Lost tab.
    Lost quotes can NOT be marked lost again. Accepted quotes cannot be marked
    lost — the pro has to wait for the homeowner to close the job."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Pros only")
    try:
        quote = await db.quotes.find_one({"_id": ObjectId(quote_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Quote not found")
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    # Ownership check
    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile or quote.get("pro_id") != str(pro_profile["_id"]):
        raise HTTPException(status_code=403, detail="Not your quote")
    if quote.get("status") in ("accepted", "lost"):
        raise HTTPException(status_code=400, detail=f"Cannot mark a {quote['status']} quote as lost")
    await db.quotes.update_one(
        {"_id": ObjectId(quote_id)},
        {"$set": {"status": "lost", "lost_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Quote moved to Lost"}



@router.get("")
async def list_my_quotes(user: dict = Depends(get_current_user)):
    """List quotes for the current pro, enriched with job details for the My Quotes UI."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros can view their quotes")

    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        return {"quotes": []}

    pro_id = str(pro_profile["_id"])
    quotes = await db.quotes.find({"pro_id": pro_id}).sort("sent_at", -1).to_list(200)

    # Iter45: gather every job-id this pro has a pending/in-progress complaint on
    job_ids_with_complaint: set[str] = set()
    async for tk in db.support_tickets.find({
        "user_id": user["_id"] if isinstance(user["_id"], ObjectId) else ObjectId(user["_id"]),
        "status": {"$in": ["open", "in_progress"]},
    }, {"job_id": 1}):
        if tk.get("job_id"):
            job_ids_with_complaint.add(str(tk["job_id"]))

    result = []
    for q in quotes:
        q_ser = serialize_doc(q)
        try:
            job = await db.jobs.find_one({"_id": ObjectId(q["job_id"])})
        except Exception:
            job = None
        if job:
            # Bring along enough to render an expandable card client-side
            q_ser["job_number"] = job.get("job_number", "")
            q_ser["job_title"] = job.get("title", "")
            q_ser["job_description"] = job.get("description", "")
            q_ser["job_status"] = job.get("status", "")
            q_ser["job_city"] = job.get("city", "")
            q_ser["job_category"] = job.get("category", "")
            q_ser["job_urgency"] = job.get("urgency", "medium")
            q_ser["job_budget_min"] = job.get("budget_min")
            q_ser["job_budget_max"] = job.get("budget_max")
            q_ser["job_posted_at"] = job.get("posted_at")
            q_ser["job_attachments"] = job.get("attachments", []) or []
            q_ser["job_accepted_pro_id"] = job.get("accepted_pro_id")
            q_ser["job_posted_by_id"] = job.get("posted_by_id")
        q_ser["has_open_complaint"] = str(q["job_id"]) in job_ids_with_complaint
        result.append(q_ser)

    return {"quotes": result}
