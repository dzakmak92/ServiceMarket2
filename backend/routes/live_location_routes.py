"""
Live location sharing — TP shares real-time GPS position with homeowner.
Sessions auto-expire after 4 hours or when TP explicitly stops sharing.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from typing import Optional
from database import db
from auth import get_current_user
import httpx
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/live-location", tags=["live-location"])


async def _geocode(address: str) -> tuple:
    """Geocode an address via Nominatim (OSM). Returns (lat, lng) or (None, None)."""
    if not address or len(address.strip()) < 5:
        return None, None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": address, "format": "json", "limit": 1},
                headers={"User-Agent": "ServiceMarket/1.0 (live-location)"},
            )
            data = r.json()
            if data and len(data) > 0:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as exc:
        logger.warning("Geocode failed for address=%r: %s", address, exc)
    return None, None


class LocationStart(BaseModel):
    job_id: str
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class LocationUpdate(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


@router.post("")
async def start_live_location(data: LocationStart, user: dict = Depends(get_current_user)):
    """TP starts sharing their live location. Creates a session + inserts a live_location message."""
    if user.get("role") != "tradesperson":
        raise HTTPException(status_code=403, detail="Only tradespeople can share live location")

    try:
        job_oid = ObjectId(data.job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = await db.jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not job.get("address_full"):
        raise HTTPException(status_code=400, detail="Homeowner has not shared their location yet")

    # Geocode destination once (job address) so frontend can calculate ETA
    dest_lat, dest_lng = await _geocode(job.get("address_full", ""))

    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=400, detail="Pro profile not found")

    pro_id = str(pro_profile["_id"])

    # Threads are derived from messages (no threads collection exists).
    # Use job_id + both user IDs as the logical thread key.
    homeowner_id = job.get("posted_by_id")
    if not homeowner_id:
        raise HTTPException(status_code=400, detail="Job has no homeowner")

    # Reuse existing active session for this job + pro
    existing = await db.live_location_sessions.find_one(
        {"job_id": job_oid, "pro_user_id": user["_id"], "is_active": True}
    )
    now = datetime.now(timezone.utc)

    if existing:
        # Re-geocode if dest_lat/dest_lng was not stored (e.g. session created before this feature)
        if existing.get("dest_lat") is None and job.get("address_full"):
            dest_lat, dest_lng = await _geocode(job.get("address_full", ""))
            await db.live_location_sessions.update_one(
                {"_id": existing["_id"]},
                {"$set": {"lat": data.lat, "lng": data.lng, "updated_at": now,
                          "dest_lat": dest_lat, "dest_lng": dest_lng}}
            )
        else:
            await db.live_location_sessions.update_one(
                {"_id": existing["_id"]},
                {"$set": {"lat": data.lat, "lng": data.lng, "updated_at": now}}
            )
            dest_lat = existing.get("dest_lat")
            dest_lng = existing.get("dest_lng")
        session_id = str(existing["_id"])
    else:
        session_doc = {
            "job_id": job_oid,
            "pro_id": pro_id,
            "pro_user_id": user["_id"],
            "homeowner_id": homeowner_id,
            "lat": data.lat,
            "lng": data.lng,
            "dest_lat": dest_lat,
            "dest_lng": dest_lng,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
            "expires_at": now + timedelta(hours=4),
        }
        result = await db.live_location_sessions.insert_one(session_doc)
        session_id = str(result.inserted_id)

        # Send one system message using job_id + from/to IDs (no threads collection)
        pro_name = user.get("name", "Pro")
        await db.messages.insert_one({
            "job_id": data.job_id,
            "from_id": user["_id"],
            "to_id": homeowner_id,
            "text": f"{pro_name} is sharing their live location",
            "kind": "live_location",
            "session_id": session_id,
            "lat": data.lat,
            "lng": data.lng,
            "session_ended": False,
            "sent_at": now,
        })

        # Notify homeowner
        ho_id = homeowner_id if isinstance(homeowner_id, str) else str(homeowner_id)
        await db.notifications.insert_one({
            "user_id": ho_id,
            "type": "live_location_shared",
            "title": f"{pro_name} is on their way!",
            "body": f"{pro_name} started sharing their live location for your job.",
            "link_to": "/messages",
            "job_id": data.job_id,
            "is_read": False,
            "created_at": now,
        })

    return {"session_id": session_id, "lat": data.lat, "lng": data.lng, "dest_lat": dest_lat, "dest_lng": dest_lng}


@router.patch("/{session_id}")
async def update_live_location(session_id: str, data: LocationUpdate, user: dict = Depends(get_current_user)):
    """TP updates their live GPS position (called every ~30s by the frontend watchPosition)."""
    try:
        session_oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = await db.live_location_sessions.find_one({"_id": session_oid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["pro_user_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Not your session")
    if not session.get("is_active"):
        raise HTTPException(status_code=400, detail="Session already ended")

    now = datetime.now(timezone.utc)
    await db.live_location_sessions.update_one(
        {"_id": session_oid},
        {"$set": {"lat": data.lat, "lng": data.lng, "updated_at": now}}
    )
    # Also update the message so it carries the freshest coords
    await db.messages.update_one(
        {"session_id": session_id, "kind": "live_location"},
        {"$set": {"lat": data.lat, "lng": data.lng, "updated_at": now}}
    )
    return {"ok": True, "lat": data.lat, "lng": data.lng}


@router.get("/{session_id}")
async def get_live_location(session_id: str, user: dict = Depends(get_current_user)):
    """HO polls this every 5 s to refresh the map pin in the chat bubble."""
    try:
        session_oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = await db.live_location_sessions.find_one({"_id": session_oid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Auto-expire
    now = datetime.now(timezone.utc)
    now_naive = now.replace(tzinfo=None)  # MongoDB stores naive datetimes
    expires_at = session.get("expires_at")
    if session.get("is_active") and expires_at:
        # Normalise both sides to naive UTC for comparison
        exp = expires_at.replace(tzinfo=None) if hasattr(expires_at, "tzinfo") else expires_at
        if exp < now_naive:
            await db.live_location_sessions.update_one(
                {"_id": session_oid}, {"$set": {"is_active": False}}
            )
            return {"is_active": False, "lat": session.get("lat"), "lng": session.get("lng"),
                    "dest_lat": session.get("dest_lat"), "dest_lng": session.get("dest_lng"), "updated_at": None}

    return {
        "is_active": session.get("is_active", False),
        "lat": session.get("lat"),
        "lng": session.get("lng"),
        "dest_lat": session.get("dest_lat"),
        "dest_lng": session.get("dest_lng"),
        "updated_at": session["updated_at"].isoformat() if session.get("updated_at") else None,
    }


@router.delete("/{session_id}")
async def stop_live_location(session_id: str, user: dict = Depends(get_current_user)):
    """TP explicitly stops sharing their live location."""
    try:
        session_oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = await db.live_location_sessions.find_one({"_id": session_oid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["pro_user_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Not your session")

    now = datetime.now(timezone.utc)
    await db.live_location_sessions.update_one(
        {"_id": session_oid},
        {"$set": {"is_active": False, "ended_at": now}}
    )
    await db.messages.update_one(
        {"session_id": session_id, "kind": "live_location"},
        {"$set": {"session_ended": True, "updated_at": now}}
    )
    return {"ok": True}
