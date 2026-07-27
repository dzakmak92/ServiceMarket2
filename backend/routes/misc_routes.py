from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response
from database import db, fs_bucket
from auth import get_current_user
from models import (UserProfileUpdate, ProProfileUpdate, AvailabilityUpdate,
                    TranslateRequest, BookingCreate)
from utils import serialize_doc
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from typing import Optional
from pydantic import BaseModel
import asyncio
import io
import json
import logging
import re

logger = logging.getLogger(__name__)
router = APIRouter()


# ──────────────────────────────────────────────
# PROFILE
# ──────────────────────────────────────────────
@router.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    return user


@router.patch("/profile")
async def update_profile(data: UserProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"_id": ObjectId(user["_id"])}, {"$set": updates})
    updated = await db.users.find_one({"_id": ObjectId(user["_id"])})
    updated.pop("password_hash", None)
    return serialize_doc(updated)


@router.get("/profile/pro")
async def get_pro_profile(user: dict = Depends(get_current_user)):
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Not a tradesperson")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    return serialize_doc(pro)


@router.patch("/profile/pro")
async def update_pro_profile(data: ProProfileUpdate, user: dict = Depends(get_current_user)):
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Not a tradesperson")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}

    # IBAN validation: refuse a malformed IBAN before persisting so we never
    # save garbage that would silently break EPC-QR generation downstream.
    if "bank_iban" in updates and updates["bank_iban"]:
        from services.pro_invoicing import _is_valid_iban, _normalize_iban
        clean = _normalize_iban(updates["bank_iban"])
        if not _is_valid_iban(clean):
            raise HTTPException(
                status_code=400,
                detail="The IBAN you entered failed the ISO 13616 checksum. Please re-check it (no typos in the digits).",
            )
        updates["bank_iban"] = clean   # store normalised (no spaces, uppercase)

    # BIC validation: segno requires exactly 8 or 11 characters.
    if "bank_bic" in updates and updates["bank_bic"]:
        bic_clean = updates["bank_bic"].replace(" ", "").upper()
        if len(bic_clean) not in (8, 11):
            raise HTTPException(
                status_code=400,
                detail=f"BIC must be exactly 8 or 11 characters (e.g. BKAUATWW or BKAUATWWXXX). Got {len(bic_clean)} chars.",
            )
        updates["bank_bic"] = bic_clean

    if updates:
        await db.pro_profiles.update_one({"user_id": user["_id"]}, {"$set": updates})
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    return serialize_doc(pro)


# ──────────────────────────────────────────────
# PORTFOLIO (max 10 photos for all plans — stored in GridFS)
# ──────────────────────────────────────────────
MAX_PORTFOLIO_PHOTOS = 10
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB raw upload
ALLOWED_CT = {"image/jpeg", "image/png", "image/webp"}


def _portfolio_cap(pro: dict) -> int:
    return MAX_PORTFOLIO_PHOTOS


@router.post("/profile/pro/portfolio")
async def add_portfolio_photo(
    file: UploadFile = File(...),
    caption: str = Form(""),
    user: dict = Depends(get_current_user),
):
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Not a tradesperson")

    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")

    photos = pro.get("portfolio_photos", []) or []
    cap = _portfolio_cap(pro)
    if len(photos) >= cap:
        raise HTTPException(status_code=400, detail=f"Maximum {cap} photos allowed")

    if file.content_type not in ALLOWED_CT:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG/WebP allowed")

    body = await file.read()
    if len(body) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB)")
    if len(body) < 100:
        raise HTTPException(status_code=400, detail="Empty file")

    file_id = await fs_bucket.upload_from_stream(
        filename=file.filename or "portfolio.jpg",
        source=body,
        metadata={
            "user_id": user["_id"],
            "pro_id": str(pro["_id"]),
            "content_type": file.content_type,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    photo_doc = {
        "file_id": str(file_id),
        "url": f"/api/portfolio/{file_id}",
        "caption": caption,
        "content_type": file.content_type,
        "size": len(body),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    photos.append(photo_doc)
    await db.pro_profiles.update_one(
        {"_id": pro["_id"]}, {"$set": {"portfolio_photos": photos}}
    )
    return {
        "message": "Photo added",
        "photo": photo_doc,
        "count": len(photos),
        "max": cap,
    }


@router.delete("/profile/pro/portfolio/{idx}")
async def delete_portfolio_photo(idx: int, user: dict = Depends(get_current_user)):
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Not a tradesperson")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    photos = pro.get("portfolio_photos", []) or []
    if idx < 0 or idx >= len(photos):
        raise HTTPException(status_code=404, detail="Photo not found")

    removed = photos.pop(idx)
    await db.pro_profiles.update_one(
        {"_id": pro["_id"]}, {"$set": {"portfolio_photos": photos}}
    )
    # Best-effort delete from GridFS
    fid = removed.get("file_id")
    if fid:
        try:
            await fs_bucket.delete(ObjectId(fid))
        except Exception:
            pass
    return {"message": "Photo removed", "count": len(photos)}

# ──────────────────────────────────────────────
# Pro logo (white-label for invoices)
# ──────────────────────────────────────────────
LOGO_MAX_BYTES = 1 * 1024 * 1024  # 1 MB
LOGO_ALLOWED_CT = {"image/jpeg", "image/png", "image/webp"}


@router.post("/profile/pro/logo")
async def upload_pro_logo(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Not a tradesperson")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    if file.content_type not in LOGO_ALLOWED_CT:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG/WebP allowed")
    body = await file.read()
    if len(body) > LOGO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Logo too large (max 1 MB)")
    if len(body) < 50:
        raise HTTPException(status_code=400, detail="Empty file")

    # Replace existing — best-effort delete old GridFS file
    old_id = pro.get("logo_file_id")
    if old_id:
        try:
            await fs_bucket.delete(ObjectId(old_id))
        except Exception:
            pass

    file_id = await fs_bucket.upload_from_stream(
        filename=file.filename or "logo.png",
        source=body,
        metadata={
            "user_id": user["_id"],
            "pro_id": str(pro["_id"]),
            "content_type": file.content_type,
            "kind": "pro_logo",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    await db.pro_profiles.update_one(
        {"_id": pro["_id"]},
        {"$set": {
            "logo_file_id": str(file_id),
            "logo_content_type": file.content_type,
            "logo_uploaded_at": datetime.now(timezone.utc).isoformat(),
            # White-label is now auto-approved (admin queue removed in iter36)
            "logo_moderation_status": "approved",
        }},
    )
    return {
        "logo_url": f"/api/portfolio/{file_id}",
        "logo_file_id": str(file_id),
        "content_type": file.content_type,
        "size": len(body),
    }


@router.delete("/profile/pro/logo")
async def delete_pro_logo(user: dict = Depends(get_current_user)):
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Not a tradesperson")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    old_id = pro.get("logo_file_id")
    if old_id:
        try:
            await fs_bucket.delete(ObjectId(old_id))
        except Exception:
            pass
    await db.pro_profiles.update_one(
        {"_id": pro["_id"]},
        {"$unset": {"logo_file_id": "", "logo_content_type": "", "logo_uploaded_at": ""}},
    )
    return {"deleted": True}


class InvoiceTemplatePatch(BaseModel):
    invoice_template: str  # one of: pastel_mint | pastel_rose | pastel_lavender (legacy keys still accepted + auto-migrated)


@router.patch("/profile/pro/invoice-template")
async def set_invoice_template(payload: InvoiceTemplatePatch, user: dict = Depends(get_current_user)):
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Not a tradesperson")
    from services.invoice_templates import migrate_template_key, is_known_template_key
    if not is_known_template_key(payload.invoice_template):
        raise HTTPException(status_code=400, detail="Template must be one of: pastel_mint, pastel_rose, pastel_lavender")
    requested = migrate_template_key(payload.invoice_template) or "pastel_mint"
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    await db.pro_profiles.update_one(
        {"_id": pro["_id"]},
        {"$set": {"invoice_template": requested}},
    )
    return {"invoice_template": requested}




@router.get("/portfolio/{file_id}")
async def serve_portfolio_photo(file_id: str):
    """Public endpoint — portfolio images need to render in <img src>."""
    try:
        oid = ObjectId(file_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        stream = await fs_bucket.open_download_stream(oid)
        data = await stream.read()
        ct = (stream.metadata or {}).get("content_type", "image/jpeg")
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(
        content=data,
        media_type=ct,
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ──────────────────────────────────────────────
# Generic file upload — used by job posts + chat messages
# Images (JPEG/PNG/WebP) and PDFs only. 10 MB max. Up to 5 attachments per
# parent doc is enforced at the calling endpoint (jobs / messages).
# ──────────────────────────────────────────────
UPLOAD_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
UPLOAD_ALLOWED_CT = {
    "image/jpeg", "image/png", "image/webp",
    "application/pdf",
}


@router.post("/uploads/file")
async def upload_generic_file(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload a single file to GridFS and return its metadata.
    The caller (job-create / message-create) is responsible for embedding the
    returned attachment object in their request body.
    """
    if file.content_type not in UPLOAD_ALLOWED_CT:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG, PNG, WebP and PDF files are allowed",
        )
    body = await file.read()
    if len(body) > UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")
    if len(body) < 50:
        raise HTTPException(status_code=400, detail="Empty file")

    file_id = await fs_bucket.upload_from_stream(
        filename=file.filename or "upload",
        source=body,
        metadata={
            "user_id": user["_id"],
            "content_type": file.content_type,
            "purpose": "attachment",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return {
        "file_id": str(file_id),
        "url": f"/api/uploads/{file_id}",
        "name": file.filename or "upload",
        "content_type": file.content_type,
        "size": len(body),
    }


@router.get("/uploads/{file_id}")
async def serve_uploaded_file(file_id: str):
    """Public file download — used by <img>, <a download> for chat/job attachments."""
    try:
        oid = ObjectId(file_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        stream = await fs_bucket.open_download_stream(oid)
        data = await stream.read()
        meta = stream.metadata or {}
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(
        content=data,
        media_type=meta.get("content_type", "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ──────────────────────────────────────────────
# AVAILABILITY
# ──────────────────────────────────────────────
@router.put("/availability")
async def update_availability(data: AvailabilityUpdate, user: dict = Depends(get_current_user)):
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Not a tradesperson")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    pro_id = str(pro["_id"])

    for slot_data in data.slots:
        await db.pro_availability.update_one(
            {"pro_id": pro_id, "day": slot_data["day"], "slot": slot_data["slot"]},
            {"$set": {"is_available": slot_data["is_available"]}},
            upsert=True
        )
    return {"message": "Availability updated"}


@router.get("/availability/{pro_id}")
async def get_availability(pro_id: str, user: dict = Depends(get_current_user)):
    avail = await db.pro_availability.find({"pro_id": pro_id}).to_list(50)
    return {"availability": [{"day": a["day"], "slot": a["slot"], "is_available": a["is_available"]} for a in avail]}


@router.get("/pros/{pro_id}/bookings")
async def get_pro_bookings(pro_id: str, user: dict = Depends(get_current_user)):
    """Confirmed booking slots for a pro — used to paint booked cells on the public calendar.
    Only returns minimal data (date, day, slot) — no homeowner PII.
    """
    bookings = await db.bookings.find(
        {"pro_id": pro_id, "status": "confirmed"}
    ).to_list(500)
    return {
        "bookings": [
            {
                "date": b.get("date"),  # ISO YYYY-MM-DD or None
                "day": b.get("day"),
                "slot": b.get("slot"),
            }
            for b in bookings
        ]
    }


# ──────────────────────────────────────────────
# NOTIFICATIONS
# ──────────────────────────────────────────────
@router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    notifs = await db.notifications.find(
        {"user_id": user["_id"]}
    ).sort("created_at", -1).limit(50).to_list(50)
    unread_count = await db.notifications.count_documents({"user_id": user["_id"], "is_read": False})
    return {"notifications": [serialize_doc(n) for n in notifs], "unread_count": unread_count}


@router.patch("/notifications/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": user["_id"], "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"message": "All notifications marked as read"}


@router.patch("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"_id": ObjectId(notif_id), "user_id": user["_id"]},
        {"$set": {"is_read": True}}
    )
    return {"message": "Notification marked as read"}


@router.delete("/notifications")
async def clear_all_notifications(user: dict = Depends(get_current_user)):
    """Delete all notifications for the current user (used by 'Clear all')."""
    result = await db.notifications.delete_many({"user_id": user["_id"]})
    return {"message": "Notifications cleared", "deleted": result.deleted_count}


# ──────────────────────────────────────────────
# BOOKINGS
# ──────────────────────────────────────────────
@router.post("/bookings")
async def create_booking(data: BookingCreate, user: dict = Depends(get_current_user)):
    if user["role"] != "homeowner":
        raise HTTPException(status_code=403, detail="Only homeowners can book")

    job = await db.jobs.find_one({"_id": ObjectId(data.job_id)})
    if not job or job["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="Job must be in progress")
    if job["posted_by_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Check for duplicate booking
    existing = await db.bookings.find_one({
        "job_id": data.job_id, "pro_id": data.pro_id,
        "day": data.day, "slot": data.slot, "status": "confirmed"
    })
    if existing:
        return {"message": "Slot already booked", "booking": serialize_doc(existing)}

    booking_doc = {
        "job_id": data.job_id,
        "homeowner_id": user["_id"],
        "pro_id": data.pro_id,
        "day": data.day,
        "slot": data.slot,
        "date": data.date,  # ISO YYYY-MM-DD when client knows the exact date
        "status": "confirmed",
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.bookings.insert_one(booking_doc)
    booking_doc["_id"] = result.inserted_id

    # Create booking message in thread
    pro_profile = await db.pro_profiles.find_one({"_id": ObjectId(data.pro_id)})
    if pro_profile:
        pro_user_id = pro_profile["user_id"]
        await db.messages.insert_one({
            "job_id": data.job_id,
            "from_id": user["_id"],
            "to_id": pro_user_id,
            "text": f"Appointment booked: {data.date} ({data.day}), {data.slot}",
            "kind": "booking",
            "booking_id": str(result.inserted_id),
            "booking_day": data.day,
            "booking_slot": data.slot,
            "booking_date": data.date,
            "sent_at": datetime.now(timezone.utc),
            "read_at": None
        })
        await db.notifications.insert_one({
            "user_id": pro_user_id,
            "kind": "booking_made",
            "title": "New appointment booked",
            "body": f"Appointment booked for {data.day} {data.slot}",
            "link_to": "/messages",
            "is_read": False,
            "created_at": datetime.now(timezone.utc)
        })

    return {"message": "Booking created", "booking": serialize_doc(booking_doc)}


@router.get("/bookings")
async def list_bookings(user: dict = Depends(get_current_user)):
    query = {}
    if user["role"] == "homeowner":
        query["homeowner_id"] = user["_id"]
    elif user["role"] == "tradesperson":
        pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
        if pro:
            query["pro_id"] = str(pro["_id"])

    bookings = await db.bookings.find(query).sort("created_at", -1).to_list(200)

    enriched = []
    for b in bookings:
        doc = serialize_doc(b)
        # Attach job title + number
        try:
            job = await db.jobs.find_one({"_id": ObjectId(b["job_id"])})
            if job:
                doc["job_title"] = job.get("title", "")
                doc["job_number"] = job.get("job_number", "")
                doc["job_category"] = job.get("category", "")
                doc["job_status"] = job.get("status", "open")
                doc["listing_type"] = job.get("listing_type", "task")
                doc["address_full"] = job.get("address_full", "")
        except Exception:
            pass
        # Attach homeowner display name
        try:
            ho = await db.users.find_one({"_id": ObjectId(b["homeowner_id"])})
            if ho:
                doc["homeowner_name"] = ho.get("name", "")
        except Exception:
            pass
        enriched.append(doc)

    return {"bookings": enriched}


@router.patch("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, user: dict = Depends(get_current_user)):
    await db.bookings.update_one(
        {"_id": ObjectId(booking_id)},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc)}}
    )
    return {"message": "Booking cancelled"}


# ──────────────────────────────────────────────
# Reschedule (TP proposes new date/slot → HO confirms or rejects)
# ──────────────────────────────────────────────
class RescheduleProposal(BaseModel):
    new_date: str   # YYYY-MM-DD
    new_slot: str   # HH:MM-HH:MM
    new_day: str    # Mon/Tue/…


@router.patch("/bookings/{booking_id}/propose-reschedule")
async def propose_reschedule(booking_id: str, data: RescheduleProposal, user: dict = Depends(get_current_user)):
    """TP proposes a new date/slot. HO must confirm before the booking is updated."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only tradespeople can propose a reschedule")
    try:
        boid = ObjectId(booking_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid booking ID")

    booking = await db.bookings.find_one({"_id": boid})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Booking is already cancelled")

    now = datetime.now(timezone.utc)
    await db.bookings.update_one(
        {"_id": boid},
        {"$set": {
            "reschedule_status": "pending",
            "proposed_date": data.new_date,
            "proposed_slot": data.new_slot,
            "proposed_day": data.new_day,
            "proposed_at": now,
        }}
    )

    # Notify the homeowner
    pro_user = user
    await db.notifications.insert_one({
        "user_id": str(booking["homeowner_id"]) if not isinstance(booking["homeowner_id"], str) else booking["homeowner_id"],
        "kind": "reschedule_proposed",
        "title": "Appointment reschedule requested",
        "body": f"{pro_user.get('name','Pro')} wants to reschedule to {data.new_date} {data.new_slot}. Please confirm.",
        "link_to": "/messages",
        "booking_id": booking_id,
        "is_read": False,
        "created_at": now,
    })
    return {"ok": True, "reschedule_status": "pending"}


@router.patch("/bookings/{booking_id}/accept-reschedule")
async def accept_reschedule(booking_id: str, user: dict = Depends(get_current_user)):
    """HO accepts the proposed reschedule — updates the booking date/slot."""
    if user["role"] != "homeowner":
        raise HTTPException(status_code=403, detail="Only homeowners can accept a reschedule")
    try:
        boid = ObjectId(booking_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid booking ID")

    booking = await db.bookings.find_one({"_id": boid})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("reschedule_status") != "pending":
        raise HTTPException(status_code=400, detail="No pending reschedule proposal")

    now = datetime.now(timezone.utc)
    await db.bookings.update_one(
        {"_id": boid},
        {"$set": {
            "date": booking["proposed_date"],
            "slot": booking["proposed_slot"],
            "day": booking["proposed_day"],
            "reschedule_status": "accepted",
            "rescheduled_at": now,
        },
        "$unset": {"proposed_date": "", "proposed_slot": "", "proposed_day": "", "proposed_at": ""}
        }
    )

    # Notify the TP
    pro_profile = await db.pro_profiles.find_one({"_id": ObjectId(booking["pro_id"])}) if booking.get("pro_id") else None
    if pro_profile:
        await db.notifications.insert_one({
            "user_id": str(pro_profile["user_id"]),
            "kind": "reschedule_accepted",
            "title": "Reschedule confirmed!",
            "body": f"Your reschedule to {booking['proposed_date']} {booking['proposed_slot']} was accepted.",
            "link_to": "/pro-calendar",
            "is_read": False,
            "created_at": now,
        })
    return {"ok": True, "new_date": booking["proposed_date"], "new_slot": booking["proposed_slot"]}


@router.patch("/bookings/{booking_id}/reject-reschedule")
async def reject_reschedule(booking_id: str, user: dict = Depends(get_current_user)):
    """HO rejects the reschedule — booking stays at original date."""
    if user["role"] != "homeowner":
        raise HTTPException(status_code=403, detail="Only homeowners can reject a reschedule")
    try:
        boid = ObjectId(booking_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid booking ID")

    booking = await db.bookings.find_one({"_id": boid})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    now = datetime.now(timezone.utc)
    await db.bookings.update_one(
        {"_id": boid},
        {"$set": {"reschedule_status": "rejected"},
         "$unset": {"proposed_date": "", "proposed_slot": "", "proposed_day": "", "proposed_at": ""}}
    )

    # Notify the TP
    pro_profile = await db.pro_profiles.find_one({"_id": ObjectId(booking["pro_id"])}) if booking.get("pro_id") else None
    if pro_profile:
        await db.notifications.insert_one({
            "user_id": str(pro_profile["user_id"]),
            "kind": "reschedule_rejected",
            "title": "Reschedule request declined",
            "body": "The homeowner declined your reschedule request. Original date/slot stands.",
            "link_to": "/pro-calendar",
            "is_read": False,
            "created_at": now,
        })
    return {"ok": True}
WEEKDAY_INDEX = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}


def _ics_escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def _parse_slot(slot: str):
    """'09:00-12:00' -> ((9, 0), (12, 0)). Returns (None, None) on parse failure."""
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$", slot or "")
    if not m:
        return None, None
    return (int(m.group(1)), int(m.group(2))), (int(m.group(3)), int(m.group(4)))


def _booking_datetime(booking: dict):
    """Resolve the booking's start/end naive local datetimes."""
    start_hm, end_hm = _parse_slot(booking.get("slot", ""))
    if not start_hm:
        return None, None

    iso_date = booking.get("date")
    if iso_date:
        try:
            d = datetime.fromisoformat(iso_date).date()
        except Exception:
            d = None
    else:
        d = None

    if d is None:
        # Compute the next occurrence of the configured weekday from today
        target = WEEKDAY_INDEX.get(booking.get("day"))
        if target is None:
            return None, None
        today = datetime.now(timezone.utc).date()
        offset = (target - today.weekday()) % 7
        d = today + timedelta(days=offset)

    start = datetime(d.year, d.month, d.day, start_hm[0], start_hm[1], 0, tzinfo=timezone.utc)
    end = datetime(d.year, d.month, d.day, end_hm[0], end_hm[1], 0, tzinfo=timezone.utc)
    return start, end


@router.get("/bookings/{booking_id}/ical")
async def booking_ical(booking_id: str, user: dict = Depends(get_current_user)):
    try:
        booking = await db.bookings.find_one({"_id": ObjectId(booking_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Authorize: either party (or admin) may export
    pro_profile = await db.pro_profiles.find_one({"_id": ObjectId(booking["pro_id"])}) if booking.get("pro_id") else None
    pro_user_id = pro_profile["user_id"] if pro_profile else None
    if user["_id"] not in (booking.get("homeowner_id"), pro_user_id) and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    start, end = _booking_datetime(booking)
    if not start:
        raise HTTPException(status_code=500, detail="Invalid booking time")

    # Fetch related entities
    job = await db.jobs.find_one({"_id": ObjectId(booking["job_id"])}) if booking.get("job_id") else None
    homeowner = await db.users.find_one({"_id": ObjectId(booking["homeowner_id"])})
    pro_user = await db.users.find_one({"_id": ObjectId(pro_user_id)}) if pro_user_id else None

    summary = _ics_escape(f"ServiceMarket: {job.get('title', 'Appointment')}" if job else "ServiceMarket Appointment")
    location = _ics_escape(job.get("address_full") or job.get("city", "")) if job else ""
    desc_lines = [
        f"Job: {job.get('title', '')}" if job else "",
        f"Customer: {homeowner.get('name', '')}" if homeowner else "",
        f"Pro: {(pro_profile or {}).get('business_name') or (pro_user.get('name') if pro_user else '')}",
        f"Pro phone: {pro_user.get('phone', '') if pro_user else ''}",
    ]
    description = _ics_escape("\n".join(line for line in desc_lines if line))

    dtfmt = "%Y%m%dT%H%M%SZ"
    now_str = datetime.now(timezone.utc).strftime(dtfmt)
    uid = f"booking-{booking_id}@servicemarket.eu"

    ics = "\r\n".join([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ServiceMarket//Appointments//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{now_str}",
        f"DTSTART:{start.strftime(dtfmt)}",
        f"DTEND:{end.strftime(dtfmt)}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        f"LOCATION:{location}",
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ])
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="servicemarket-{booking_id}.ics"'},
    )


# ──────────────────────────────────────────────
# Notifications — Server-Sent Events (sub-second push)
# ──────────────────────────────────────────────
@router.get("/notifications/stream")
async def notifications_stream(user: dict = Depends(get_current_user)):
    """SSE stream — emits 'notification' events whenever new rows appear for this user.

    Falls back: clients should also keep polling on a longer interval to recover
    from disconnects / proxy buffering quirks.
    """
    user_id = user["_id"]

    async def event_generator():
        # Send a hello so EventSource opens immediately
        yield "event: hello\ndata: {}\n\n"

        last_seen_at = datetime.now(timezone.utc).replace(tzinfo=None)
        # Soft cap so connections recycle every ~10 minutes
        end_at = last_seen_at + timedelta(minutes=10)

        try:
            while datetime.now(timezone.utc).replace(tzinfo=None) < end_at:
                new = await db.notifications.find(
                    {"user_id": user_id, "created_at": {"$gt": last_seen_at}}
                ).sort("created_at", 1).to_list(20)
                for n in new:
                    created = n["created_at"]
                    if getattr(created, "tzinfo", None) is not None:
                        created = created.replace(tzinfo=None)
                    last_seen_at = max(last_seen_at, created)
                    payload = serialize_doc(n)
                    yield f"event: notification\ndata: {json.dumps(payload, default=str)}\n\n"
                # heartbeat keeps the connection alive through any proxies
                yield ": keep-alive\n\n"
                await asyncio.sleep(3)
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ──────────────────────────────────────────────
# TRANSLATE
# ──────────────────────────────────────────────
@router.post("/translate")
async def translate_text(data: TranslateRequest, user: dict = Depends(get_current_user)):
    try:
        from deep_translator import GoogleTranslator
        lang_map = {"en": "en", "de": "de", "tr": "tr", "es": "es"}
        target = lang_map.get(data.target_lang, "en")
        translated = GoogleTranslator(source="auto", target=target).translate(data.text)
        return {"translated": translated, "target_lang": data.target_lang}
    except Exception as e:
        return {"translated": data.text, "target_lang": data.target_lang, "error": str(e)}


# ──────────────────────────────────────────────
# SEARCH
# ──────────────────────────────────────────────
@router.get("/search")
async def search(q: str, user: dict = Depends(get_current_user)):
    if not q or len(q) < 2:
        return {"jobs": [], "pros": []}

    country = user.get("country")
    regex = {"$regex": q, "$options": "i"}

    # Search jobs
    job_query = {
        "country": country,
        "status": "open",
        "$or": [{"title": regex}, {"description": regex}, {"city": regex}]
    }
    jobs = await db.jobs.find(job_query).limit(10).to_list(10)

    # Search pros
    user_ids = await db.users.find(
        {"role": "tradesperson", "country": country, "name": regex}
    ).distinct("_id")
    user_id_strings = [str(uid) for uid in user_ids]

    pro_query = {
        "$or": [
            {"user_id": {"$in": user_id_strings}},
            {"business_name": regex},
            {"tagline": regex}
        ]
    }
    pros_raw = await db.pro_profiles.find(pro_query).limit(10).to_list(10)

    pros_out = []
    for pro in pros_raw:
        p = serialize_doc(pro)
        u = await db.users.find_one({"_id": ObjectId(pro["user_id"])})
        if u:
            p["name"] = u.get("name", "")
            p["city"] = u.get("city", "")
        pros_out.append(p)

    return {"jobs": [serialize_doc(j) for j in jobs], "pros": pros_out}


# ──────────────────────────────────────────────
# CATEGORIES
# ──────────────────────────────────────────────
@router.get("/categories")
async def list_categories():
    """Public — used on landing page and in onboarding."""
    cats = await db.categories.find({"is_active": True}).to_list(20)
    return {"categories": cats}
