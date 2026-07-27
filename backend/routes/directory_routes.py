"""Business Directory + Pro Heatmap.

A SEPARATE collection (`business_directory`) of tradesperson businesses, imported
from a CSV (lat/lng per business). Rendered as a Leaflet heat map for:
  - Homeowners: a "Pros near you" coverage map (under the More menu)
  - Admin: a business-intelligence density map (+ CSV import + claim moderation)

Each listing can be CLAIMED by a logged-in user. A claim is a pending request that
an admin approves/rejects. On approval the listing is linked to that user.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from database import db
from auth import get_current_user, require_admin
from utils import serialize_doc
from models import BusinessClaimRequest, ClaimReviewRequest, BusinessInquiryRequest
from bson import ObjectId
from pymongo import UpdateOne
from datetime import datetime, timezone
from typing import Optional
import csv
import io
import re
import math
import httpx

router = APIRouter(prefix="/directory")

# Common English → local city-name aliases so an English search ("Vienna")
# still matches data stored under the local name ("Wien").
CITY_ALIASES = {
    "vienna": "wien",
    "viena": "wien",
    "lower austria": "niederösterreich",
    "carinthia": "kärnten",
    "styria": "steiermark",
    "tyrol": "tirol",
}


def _parse_coord(raw, lo, hi):
    """Robust coordinate parser.

    Trusts clean decimals as-is (≤1 dot, comma treated as decimal). When the value
    has MULTIPLE dots (a thousand-separator / broken export such as '482.034.384'
    or '16.332.828'), strips separators and reconstructs the decimal by trying a
    cut position that lands inside the plausible [lo, hi] range.
    """
    s = str(raw or "").strip().replace(",", ".")
    if not s:
        return None
    cleaned = re.sub(r"[^0-9.\-]", "", s)
    if not cleaned:
        return None
    # Trust an as-is decimal ONLY when it already falls in the plausible range.
    # (A single thousand-separator dot like '482.046' parses to 482.046 which is
    # out of range, so it correctly falls through to reconstruction → 48.2046.)
    if cleaned.count(".") <= 1:
        try:
            v = float(cleaned)
            if lo <= v <= hi:
                return round(v, 7)
        except Exception:
            pass
    neg = cleaned.startswith("-")
    digits = re.sub(r"\D", "", cleaned)
    if not digits:
        return None
    for cut in (2, 1, 3):
        cand = digits[:cut] + "." + digits[cut:] if cut < len(digits) else digits
        try:
            v = float(cand)
        except Exception:
            continue
        if neg:
            v = -v
        if lo <= v <= hi:
            return round(v, 7)
    return None


def _sniff_delimiter(header_line: str) -> str:
    return ";" if header_line.count(";") > header_line.count(",") else ","


# Major Austrian cities — a fast, always-available fallback for the manual
# location box (so it works even if Nominatim is rate-limited/unreachable).
AT_CITIES = {
    "wien": (48.2082, 16.3738), "vienna": (48.2082, 16.3738),
    "graz": (47.0707, 15.4395), "linz": (48.3069, 14.2858),
    "salzburg": (47.8095, 13.0550), "innsbruck": (47.2692, 11.4041),
    "klagenfurt": (46.6247, 14.3055), "villach": (46.6111, 13.8558),
    "wels": (48.1575, 14.0289), "sankt pölten": (48.2047, 15.6256),
    "st. pölten": (48.2047, 15.6256), "st pölten": (48.2047, 15.6256),
    "dornbirn": (47.4125, 9.7417), "bregenz": (47.5031, 9.7471),
    "wiener neustadt": (47.8149, 16.2407), "steyr": (48.0408, 14.4197),
    "feldkirch": (47.2382, 9.5985), "leonding": (48.2667, 14.2500),
    "baden": (48.0059, 16.2329), "leoben": (47.3826, 15.0897),
    "krems": (48.4093, 15.6140), "amstetten": (48.1239, 14.8722),
}


def _local_geocode(q: str):
    """Return (lat, lng) if the query mentions a known Austrian city, else None."""
    ql = q.lower().strip()
    for name, coords in AT_CITIES.items():
        if name in ql:
            return coords
    return None


def _apply_geo_box(query, lat, lng, radius_km):
    """Restrict a query to a lat/lng bounding box around (lat,lng) within
    radius_km. Cheap rectangular pre-filter (no geo index needed); the client
    refines to a true circle via haversine."""
    if lat is None or lng is None or not radius_km:
        return query
    dlat = radius_km / 111.0
    dlng = radius_km / (111.0 * max(0.1, math.cos(math.radians(lat))))
    query["lat"] = {"$gte": lat - dlat, "$lte": lat + dlat}
    query["lng"] = {"$gte": lng - dlng, "$lte": lng + dlng}
    return query


def _build_query(category=None, group=None, segment=None, city=None, q=None, claimed=None):
    """Shared filter builder for heatmap / markers / business list."""
    query = {}
    if category:
        query["category"] = category
    if group:
        query["group"] = group
    if segment:
        query["segment"] = segment
    if city:
        query["city"] = city
    if claimed == "true":
        query["claimed"] = True
    elif claimed == "false":
        query["claimed"] = {"$ne": True}
    if q:
        terms = [q]
        alias = CITY_ALIASES.get(q.strip().lower())
        if alias:
            terms.append(alias)
        ors = []
        for term in terms:
            ors += [
                {"name": {"$regex": term, "$options": "i"}},
                {"city": {"$regex": term, "$options": "i"}},
                {"category": {"$regex": term, "$options": "i"}},
                {"segment": {"$regex": term, "$options": "i"}},
                {"group": {"$regex": term, "$options": "i"}},
            ]
        query["$or"] = ors
    return query


# ── HEATMAP (any authenticated user) ───────────────────────────────────────
@router.get("/heatmap")
async def heatmap(
    user: dict = Depends(get_current_user),
    category: Optional[str] = None,
    group: Optional[str] = None,
    segment: Optional[str] = None,
    city: Optional[str] = None,
):
    """Return heat points + per-city aggregates for the density map."""
    q = _build_query(category=category, group=group, segment=segment, city=city)

    points = []
    city_acc = {}  # name -> {sum_lat, sum_lng, count}
    claimed = 0
    cursor = db.business_directory.find(
        q, {"lat": 1, "lng": 1, "city": 1, "claimed": 1}
    )
    async for b in cursor:
        lat, lng = b.get("lat"), b.get("lng")
        if lat is None or lng is None:
            continue
        points.append([lat, lng, 1])
        cname = (b.get("city") or "").strip()
        if cname:
            acc = city_acc.setdefault(cname, {"sum_lat": 0.0, "sum_lng": 0.0, "count": 0})
            acc["sum_lat"] += lat
            acc["sum_lng"] += lng
            acc["count"] += 1
        if b.get("claimed"):
            claimed += 1

    cities = [
        {
            "name": name,
            "lat": round(a["sum_lat"] / a["count"], 5),
            "lng": round(a["sum_lng"] / a["count"], 5),
            "count": a["count"],
        }
        for name, a in city_acc.items()
    ]
    cities.sort(key=lambda c: -c["count"])
    total = len(points)
    return {
        "points": points,
        "cities": cities,
        "total": total,
        "claimed": claimed,
        "unclaimed": total - claimed,
    }


@router.get("/markers")
async def markers(
    user: dict = Depends(get_current_user),
    category: Optional[str] = None,
    group: Optional[str] = None,
    segment: Optional[str] = None,
    city: Optional[str] = None,
    q: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: Optional[float] = None,
):
    """All matching businesses as lightweight map markers (colour-by-group on the
    client). Includes public business contact fields so a homeowner can reach out.
    When lat/lng/radius_km are supplied, results are restricted to that area so
    the homeowner's 'near me' view is accurate even on the full dataset."""
    query = _build_query(category=category, group=group, segment=segment, city=city, q=q)
    _apply_geo_box(query, lat, lng, radius_km)
    proj = {"name": 1, "segment": 1, "city": 1, "lat": 1, "lng": 1, "claimed": 1}
    # Near-me queries return the full local set (accuracy); the country-wide
    # overview is capped for client render performance.
    limit = 8000 if (lat is not None and lng is not None and radius_km) else 5000
    docs = await db.business_directory.find(query, proj).limit(limit).to_list(limit)
    out = []
    claimed_shown = 0
    for d in docs:
        if d.get("lat") is None or d.get("lng") is None:
            continue
        is_claimed = bool(d.get("claimed"))
        if is_claimed:
            claimed_shown += 1
        # NOTE: contact details (phone/email/website) are intentionally NOT
        # exposed to clients. Homeowners reach out via an on-platform message.
        out.append({
            "id": str(d["_id"]),
            "name": d.get("name"),
            "segment": d.get("segment") or "",
            "city": d.get("city") or "",
            "lat": d["lat"],
            "lng": d["lng"],
            "claimed": is_claimed,
        })
    total = await db.business_directory.count_documents(query)
    claimed_total = await db.business_directory.count_documents({**query, "claimed": True})
    return {
        "markers": out,
        "shown": len(out),
        "total": total,
        "claimed": claimed_total,
        "unclaimed": total - claimed_total,
        "claimed_shown": claimed_shown,
    }


@router.get("/geocode")
async def geocode(q: str, user: dict = Depends(get_current_user)):
    """Geocode a city / postcode / address to lat,lng via Nominatim (OSM).

    Fallback for homeowners whose browser GPS is unavailable or blocked (e.g.
    inside an embedded preview iframe, or a desktop without a location sensor).
    Biased to the user's country for better matches on generic city names."""
    q = (q or "").strip()
    if len(q) < 2:
        raise HTTPException(status_code=400, detail="Query too short")
    # 1) Instant, reliable match for major AT cities (no external dependency).
    local = _local_geocode(q)
    if local:
        return {"lat": local[0], "lng": local[1], "display_name": q}
    params = {"q": q, "format": "json", "limit": 1}
    cc = (user.get("country") or "").strip().lower()
    if cc:
        params["countrycodes"] = cc
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params=params,
                headers={"User-Agent": "ServiceMarket/1.0 (find-pros geocode)"},
            )
            data = r.json()
            if data:
                return {
                    "lat": float(data[0]["lat"]),
                    "lng": float(data[0]["lon"]),
                    "display_name": data[0].get("display_name", q),
                }
    except Exception:
        pass
    # Retry once without the country bias before giving up.
    if cc:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": q, "format": "json", "limit": 1},
                    headers={"User-Agent": "ServiceMarket/1.0 (find-pros geocode)"},
                )
                data = r.json()
                if data:
                    return {
                        "lat": float(data[0]["lat"]),
                        "lng": float(data[0]["lon"]),
                        "display_name": data[0].get("display_name", q),
                    }
        except Exception:
            pass
    raise HTTPException(status_code=404, detail="Location not found")


@router.get("/categories")
async def categories(user: dict = Depends(get_current_user)):
    cats = await db.business_directory.distinct("category")
    return {"categories": sorted([c for c in cats if c])}


@router.get("/facets")
async def facets(user: dict = Depends(get_current_user)):
    """Distinct filter values for the directory UI."""
    groups = await db.business_directory.distinct("group")
    segments = await db.business_directory.distinct("segment")
    cs = await db.business_directory.distinct("city")
    return {
        "groups": sorted([g for g in groups if g]),
        "segments": sorted([s for s in segments if s]),
        "cities": sorted([c for c in cs if c]),
    }


@router.get("/cities")
async def cities(user: dict = Depends(get_current_user)):
    cs = await db.business_directory.distinct("city")
    return {"cities": sorted([c for c in cs if c])}


@router.get("/businesses")
async def list_businesses(
    user: dict = Depends(get_current_user),
    category: Optional[str] = None,
    group: Optional[str] = None,
    segment: Optional[str] = None,
    city: Optional[str] = None,
    q: Optional[str] = None,
    claimed: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: Optional[float] = None,
    page: int = 1,
    per_page: int = 20,
):
    query = _build_query(
        category=category, group=group, segment=segment, city=city, q=q, claimed=claimed
    )
    _apply_geo_box(query, lat, lng, radius_km)

    per_page = max(1, min(per_page, 50))
    total = await db.business_directory.count_documents(query)
    docs = (
        await db.business_directory.find(query)
        .sort("name", 1)
        .skip((page - 1) * per_page)
        .limit(per_page)
        .to_list(per_page)
    )

    ids = [str(d["_id"]) for d in docs]
    my_claims = {}
    if ids:
        async for cl in db.business_claims.find(
            {"user_id": user["_id"], "business_id": {"$in": ids}}
        ):
            # keep most relevant status (pending wins for display)
            prev = my_claims.get(cl["business_id"])
            if prev != "pending":
                my_claims[cl["business_id"]] = cl.get("status")

    out = []
    for d in docs:
        s = serialize_doc(d)
        bid = s["id"]
        s["my_claim_status"] = my_claims.get(bid)  # pending|approved|rejected|None
        s["claimed_by_me"] = d.get("claimed_by_user_id") == user["_id"]
        # never leak the claimant identity or raw contact channels
        s.pop("claimed_by_user_id", None)
        for f in ("phone", "email", "website"):
            s.pop(f, None)
        out.append(s)

    return {"businesses": out, "total": total, "page": page, "per_page": per_page}


@router.post("/businesses/{business_id}/claim")
async def claim_business(
    business_id: str,
    body: BusinessClaimRequest,
    user: dict = Depends(get_current_user),
):
    try:
        biz = await db.business_directory.find_one({"_id": ObjectId(business_id)})
    except Exception:
        biz = None
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")
    if biz.get("claimed"):
        raise HTTPException(status_code=400, detail="This business has already been claimed")

    existing = await db.business_claims.find_one(
        {"business_id": business_id, "user_id": user["_id"], "status": "pending"}
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending claim for this business")

    now = datetime.now(timezone.utc)
    claim = {
        "business_id": business_id,
        "business_name": biz.get("name"),
        "business_city": biz.get("city"),
        "user_id": user["_id"],
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "user_role": user.get("role"),
        "message": (body.message or "").strip()[:1000],
        "contact_phone": (body.contact_phone or "").strip()[:40],
        "status": "pending",
        "created_at": now,
        "reviewed_at": None,
        "reviewed_by": None,
    }
    res = await db.business_claims.insert_one(claim)
    await db.business_directory.update_one(
        {"_id": biz["_id"]}, {"$set": {"has_pending_claim": True}}
    )
    return {"ok": True, "claim": serialize_doc({**claim, "_id": res.inserted_id})}


@router.post("/businesses/{business_id}/inquire")
async def inquire_business(
    business_id: str,
    body: BusinessInquiryRequest,
    user: dict = Depends(get_current_user),
):
    """A homeowner writes an on-platform message to a directory business.

    Stored as a lead and pushed to all admins (onboarding funnel). For UNCLAIMED
    businesses this is the only contact channel — raw phone/email is never shown."""
    msg = (body.message or "").strip()
    if len(msg) < 5:
        raise HTTPException(status_code=400, detail="Please write a short message")
    try:
        biz = await db.business_directory.find_one({"_id": ObjectId(business_id)})
    except Exception:
        biz = None
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    now = datetime.now(timezone.utc)
    lead = {
        "business_id": business_id,
        "business_name": biz.get("name"),
        "business_city": biz.get("city"),
        "business_segment": biz.get("segment") or biz.get("category"),
        "business_claimed": bool(biz.get("claimed")),
        "homeowner_id": user["_id"],
        "homeowner_name": user.get("name") or user.get("username") or "Homeowner",
        "homeowner_email": user.get("email"),
        "message": msg[:1500],
        "status": "new",
        "created_at": now,
        "resolved_at": None,
    }
    res = await db.directory_inquiries.insert_one(lead)

    # Notify all admins (lead funnel for onboarding the business).
    admins = await db.users.find({"role": "admin"}, {"_id": 1}).to_list(20)
    if admins:
        await db.notifications.insert_many([
            {
                "user_id": str(a["_id"]),
                "type": "directory_lead",
                "title": "New business inquiry",
                "body": f"{lead['homeowner_name']} → {biz.get('name','a business')}",
                "link_to": "/admin?tab=heatmap",
                "is_read": False,
                "created_at": now,
            }
            for a in admins
        ])

    return {"ok": True, "inquiry_id": str(res.inserted_id)}


@router.get("/my-claims")
async def my_claims(user: dict = Depends(get_current_user)):
    docs = (
        await db.business_claims.find({"user_id": user["_id"]})
        .sort("created_at", -1)
        .to_list(100)
    )
    return {"claims": [serialize_doc(d) for d in docs]}


# ── ADMIN ───────────────────────────────────────────────────────────────────
@router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    total = await db.business_directory.count_documents({})
    claimed = await db.business_directory.count_documents({"claimed": True})
    pending = await db.business_claims.count_documents({"status": "pending"})

    async def _top(field, limit=15):
        pipe = [
            {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": limit},
        ]
        return [
            {field: (c["_id"] or "—"), "count": c["count"]}
            async for c in db.business_directory.aggregate(pipe)
        ]

    return {
        "total": total,
        "claimed": claimed,
        "unclaimed": total - claimed,
        "pending_claims": pending,
        "new_inquiries": await db.directory_inquiries.count_documents({"status": "new"}),
        "top_cities": await _top("city"),
        "top_groups": await _top("group"),
        "top_segments": await _top("segment"),
        "top_categories": await _top("category"),
    }


@router.get("/admin/inquiries")
async def admin_inquiries(admin: dict = Depends(require_admin), status: str = "new", page: int = 1):
    """Homeowner → business leads for the admin onboarding funnel."""
    query = {} if status == "all" else {"status": status}
    total = await db.directory_inquiries.count_documents(query)
    docs = (
        await db.directory_inquiries.find(query)
        .sort("created_at", -1)
        .skip((page - 1) * 50)
        .limit(50)
        .to_list(50)
    )
    return {"inquiries": [serialize_doc(d) for d in docs], "total": total, "page": page}


@router.post("/admin/inquiries/{inquiry_id}/resolve")
async def resolve_inquiry(inquiry_id: str, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(inquiry_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    res = await db.directory_inquiries.update_one(
        {"_id": oid},
        {"$set": {"status": "resolved", "resolved_at": datetime.now(timezone.utc)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    return {"ok": True}


@router.get("/admin/claims")
async def admin_claims(
    admin: dict = Depends(require_admin),
    status: str = "pending",
    page: int = 1,
):
    query = {} if status == "all" else {"status": status}
    total = await db.business_claims.count_documents(query)
    docs = (
        await db.business_claims.find(query)
        .sort("created_at", -1)
        .skip((page - 1) * 50)
        .limit(50)
        .to_list(50)
    )
    return {"claims": [serialize_doc(d) for d in docs], "total": total, "page": page}


@router.post("/admin/claims/{claim_id}/review")
async def review_claim(
    claim_id: str,
    body: ClaimReviewRequest,
    admin: dict = Depends(require_admin),
):
    try:
        claim = await db.business_claims.find_one({"_id": ObjectId(claim_id)})
    except Exception:
        claim = None
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Claim already reviewed")

    action = (body.action or "").lower()
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve or reject")

    now = datetime.now(timezone.utc)
    biz_id = claim["business_id"]
    await db.business_claims.update_one(
        {"_id": claim["_id"]},
        {"$set": {
            "status": "approved" if action == "approve" else "rejected",
            "reviewed_at": now,
            "reviewed_by": admin["_id"],
        }},
    )

    if action == "approve":
        try:
            await db.business_directory.update_one(
                {"_id": ObjectId(biz_id)},
                {"$set": {
                    "claimed": True,
                    "claimed_by_user_id": claim["user_id"],
                    "claimed_at": now,
                    "has_pending_claim": False,
                }},
            )
        except Exception:
            pass
        # auto-reject the other pending claims for the same business
        await db.business_claims.update_many(
            {"business_id": biz_id, "status": "pending", "_id": {"$ne": claim["_id"]}},
            {"$set": {"status": "rejected", "reviewed_at": now, "reviewed_by": admin["_id"]}},
        )
    else:
        others = await db.business_claims.count_documents(
            {"business_id": biz_id, "status": "pending", "_id": {"$ne": claim["_id"]}}
        )
        if not others:
            try:
                await db.business_directory.update_one(
                    {"_id": ObjectId(biz_id)}, {"$set": {"has_pending_claim": False}}
                )
            except Exception:
                pass

    return {"ok": True}


@router.post("/admin/import")
async def import_csv(
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin),
):
    """Upsert businesses from a CSV (comma OR semicolon delimited; auto-detected).

    Recognised headers (case-insensitive): name (required), lat & lng (required),
    group, segment, category, city, country, postal_code/zip, address, phone,
    website, email, osm_id. Coordinates may be clean decimals or a broken
    thousand-separator export (e.g. '482.034.384' → 48.2034384). Rows missing
    name/lat/lng are skipped. Upsert key = osm_id when present, else name + city.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8-sig", errors="replace")
    except Exception:
        text = content.decode("latin-1", errors="replace")

    first_line = next((ln for ln in text.splitlines() if ln.strip()), "")
    delim = _sniff_delimiter(first_line)
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)

    skipped = 0
    now = datetime.now(timezone.utc)

    # Build ALL upserts as a single bulk_write so large files (8k+ rows) import
    # in one round-trip instead of timing out on thousands of sequential awaits.
    ops = []
    for row in reader:
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        name = r.get("name") or r.get("business_name") or r.get("business")
        lat = _parse_coord(r.get("lat") or r.get("latitude"), 40, 55)
        lng = _parse_coord(r.get("lng") or r.get("longitude") or r.get("lon"), 5, 25)
        if not name or lat is None or lng is None:
            skipped += 1
            continue

        group = r.get("group") or ""
        segment = r.get("segment") or ""
        city = r.get("city") or ""
        osm_id = r.get("osm_id") or ""
        phone = (r.get("phone") or "").lstrip("'").strip()
        payload = {
            "name": name,
            "group": group,
            "segment": segment,
            "category": r.get("category") or segment or group or "Other",
            "city": city,
            "country": r.get("country") or "",
            "postal_code": r.get("postal_code") or r.get("zip") or "",
            "address": r.get("address") or "",
            "lat": lat,
            "lng": lng,
            "osm_id": osm_id,
            "phone": phone,
            "website": r.get("website") or "",
            "email": r.get("email") or "",
            "source": "csv",
            "updated_at": now,
        }
        key = {"osm_id": osm_id} if osm_id else {"name": name, "city": city}
        ops.append(UpdateOne(
            key,
            {
                "$set": payload,
                # Preserve claim state on re-import; only set defaults on first insert.
                "$setOnInsert": {
                    "claimed": False,
                    "has_pending_claim": False,
                    "created_at": now,
                },
            },
            upsert=True,
        ))

    inserted = updated = 0
    if ops:
        # ordered=False → a single bad row never aborts the rest of the batch.
        res = await db.business_directory.bulk_write(ops, ordered=False)
        inserted = res.upserted_count
        updated = res.modified_count

    return {"ok": True, "inserted": inserted, "updated": updated, "skipped": skipped}
