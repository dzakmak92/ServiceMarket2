from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user
from models import MessageCreate
from utils import serialize_doc
from datetime import datetime, timezone
from bson import ObjectId

router = APIRouter(prefix="/messages")


@router.get("/threads")
async def list_threads(user: dict = Depends(get_current_user)):
    """List all message threads for the current user"""
    user_id = user["_id"]

    messages = await db.messages.find(
        {"$or": [{"from_id": user_id}, {"to_id": user_id}]}
    ).sort("sent_at", -1).to_list(500)

    # Group into threads
    threads = {}
    for msg in messages:
        other_id = msg["to_id"] if msg["from_id"] == user_id else msg["from_id"]
        thread_key = f"{msg['job_id']}_{other_id}"

        if thread_key not in threads:
            threads[thread_key] = {
                "thread_id": thread_key,
                "job_id": msg["job_id"],
                "other_user_id": other_id,
                "last_message": serialize_doc(msg),
                "unread_count": 0
            }

    # Count unread messages per thread
    unread_messages = await db.messages.find(
        {"to_id": user_id, "read_at": None}
    ).to_list(500)
    for umsg in unread_messages:
        other_id = umsg["from_id"]
        thread_key = f"{umsg['job_id']}_{other_id}"
        if thread_key in threads:
            threads[thread_key]["unread_count"] += 1

    # Enrich with job and user info
    result = []
    for tk, thread in threads.items():
        try:
            job = await db.jobs.find_one({"_id": ObjectId(thread["job_id"])})
        except Exception:
            continue  # skip threads with invalid/non-ObjectId job_ids (e.g. 'pay-now-test')
        try:
            other_user = await db.users.find_one({"_id": ObjectId(thread["other_user_id"])})
        except Exception:
            continue

        if not job or not other_user:
            continue

        other_pro_profile = None
        if other_user.get("role") == "tradesperson":
            other_pro_profile = await db.pro_profiles.find_one({"user_id": thread["other_user_id"]})

        thread["job_title"] = job.get("title", "")
        thread["job_status"] = job.get("status", "")
        thread["job_category"] = job.get("category", "")
        thread["other_name"] = other_user.get("name", "")
        thread["other_role"] = other_user.get("role", "")
        thread["other_pro_plan"] = other_pro_profile.get("plan_tier", "standard") if other_pro_profile else None
        thread["other_pro_id"] = str(other_pro_profile["_id"]) if other_pro_profile else None
        thread["other_verified"] = other_pro_profile.get("is_verified", False) if other_pro_profile else False

        # Drive the Active / Completed tab + green/red coloring in the UI:
        #  - if the current user is a PRO, look up their own quote on this job
        #    → my_quote_status reflects 'pending' | 'accepted' | 'declined' | 'lost'
        #  - homeowners only ever see jobs from their side, so we set my_quote_status=null
        thread["my_quote_status"] = None
        if user["role"] == "tradesperson":
            my_pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
            if my_pro:
                my_q = await db.quotes.find_one({"job_id": str(job["_id"]), "pro_id": str(my_pro["_id"])})
                if my_q:
                    thread["my_quote_status"] = my_q.get("status")

        result.append(thread)

    # Sort by last message time (newest first)
    result.sort(key=lambda x: x["last_message"].get("sent_at", ""), reverse=True)
    return {"threads": result}


@router.get("/thread/{job_id}/{other_user_id}")
async def get_thread(job_id: str, other_user_id: str, user: dict = Depends(get_current_user)):
    """Get all messages in a thread"""
    user_id = user["_id"]
    current_user_role = user.get("role")

    messages = await db.messages.find({
        "job_id": job_id,
        "$or": [
            {"from_id": user_id, "to_id": other_user_id},
            {"from_id": other_user_id, "to_id": user_id}
        ]
    }).sort("sent_at", 1).to_list(200)

    # Mark messages as read
    await db.messages.update_many(
        {"job_id": job_id, "to_id": user_id, "from_id": other_user_id, "read_at": None},
        {"$set": {"read_at": datetime.now(timezone.utc)}}
    )

    # Get job info
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    other_user = await db.users.find_one({"_id": ObjectId(other_user_id)})

    # Pro availability + pro_id resolution.
    # - When the *other* user is a pro (homeowner is viewing): expose that pro's data.
    # - When the *current* user is a pro (pro is viewing): expose their OWN availability
    #   so the chat-side booking calendar can render for the pro too.
    pro_availability = []
    other_pro_id = None
    if other_user and other_user.get("role") == "tradesperson":
        pro_profile = await db.pro_profiles.find_one({"user_id": other_user_id})
        if pro_profile:
            other_pro_id = str(pro_profile["_id"])
            avail = await db.pro_availability.find({"pro_id": other_pro_id, "is_available": True}).to_list(50)
            pro_availability = [{"day": a["day"], "slot": a["slot"]} for a in avail]
    elif current_user_role == "tradesperson":
        pro_profile = await db.pro_profiles.find_one({"user_id": user_id})
        if pro_profile:
            other_pro_id = str(pro_profile["_id"])
            avail = await db.pro_availability.find({"pro_id": other_pro_id, "is_available": True}).to_list(50)
            pro_availability = [{"day": a["day"], "slot": a["slot"]} for a in avail]

    return {
        "messages": [serialize_doc(m) for m in messages],
        "job": serialize_doc(job) if job else None,
        "other_user": {
            "id": str(other_user["_id"]),
            "name": other_user.get("name", ""),
            "role": other_user.get("role", ""),
        } if other_user else None,
        "pro_availability": pro_availability,
        "other_pro_id": other_pro_id,
    }


@router.post("")
async def send_message(data: MessageCreate, user: dict = Depends(get_current_user)):
    user_id = user["_id"]

    # Verify job exists
    try:
        job = await db.jobs.find_one({"_id": ObjectId(data.job_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Verify recipient exists
    try:
        recipient = await db.users.find_one({"_id": ObjectId(data.to_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Limit attachments — max 5 per message
    attachments = [a.model_dump() for a in (data.attachments or [])]
    if len(attachments) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 attachments per message")

    msg_doc = {
        "job_id": data.job_id,
        "from_id": user_id,
        "to_id": data.to_id,
        "text": data.text,
        "kind": data.kind,
        "sent_at": datetime.now(timezone.utc),
        "read_at": None,
        "booking_day": data.booking_day,
        "booking_slot": data.booking_slot,
        "attachments": attachments,
    }
    result = await db.messages.insert_one(msg_doc)
    msg_doc["_id"] = result.inserted_id

    # Create notification for recipient
    await db.notifications.insert_one({
        "user_id": data.to_id,
        "kind": "new_message",
        "title": "New message",
        "body": f"{user.get('name', 'Someone')} sent you a message",
        "link_to": f"/messages",
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    })

    # Fire Web Push (best-effort, non-blocking)
    try:
        from push import send_push_to_user
        sender_name = user.get("name") or "Someone"
        preview = (data.text or "")[:80] or "Sent you a file"
        await send_push_to_user(data.to_id, {
            "title": f"New message from {sender_name}",
            "body": preview,
            "url": "/messages",
            "tag": f"msg-{data.job_id}",
        })
    except Exception:
        pass

    return serialize_doc(msg_doc)
