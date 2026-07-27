from fastapi import APIRouter, HTTPException, Depends, Response, Request
from database import db
from auth import (hash_password, verify_password, create_access_token, create_refresh_token,
                  set_auth_cookies, get_current_user)
from models import RegisterRequest, LoginRequest, OnboardingRequest
from services.turnstile import verify_turnstile_token
from utils import serialize_doc
from datetime import datetime, timezone
import jwt
import os

router = APIRouter(prefix="/auth")


@router.post("/register")
async def register(data: RegisterRequest, response: Response, request: Request):
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    # GDPR consent gate — users MUST accept terms + privacy policy to sign up.
    if not (data.accepted_terms and data.accepted_privacy):
        raise HTTPException(
            status_code=400,
            detail="You must accept the Terms of Service and Privacy Policy to create an account.",
        )

    # NB: Cloudflare Turnstile is verified at the END of onboarding (iter24),
    # not here on signup. Signup form stays clean and a clear "human" challenge
    # happens right before the user can start posting jobs / browsing.

    now = datetime.now(timezone.utc)
    user_doc = {
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": None,
        "country": None,
        "lang": "en",
        "city": "",
        "phone": "",
        "onboarding_complete": False,
        "is_email_verified": True,
        "notif_email": True,
        "notif_email_marketing": bool(data.marketing_opt_in),
        "notif_sms": False,
        "privacy_show_lastname": True,
        "privacy_share_contact_pre_accept": False,
        "notif_categories": [],
        "policy_version_accepted": data.policy_version or "1.0-draft-2026-02-28",
        "policy_accepted_at": now,
        "created_at": now,
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    # Audit-grade consent record (immutable history)
    ip = request.client.host if request.client else "unknown"
    await db.consent_records.insert_one({
        "user_id": user_id,
        "kind": "registration",
        "accepted_terms": True,
        "accepted_privacy": True,
        "marketing_emails": bool(data.marketing_opt_in),
        "policy_version": user_doc["policy_version_accepted"],
        "ip": ip,
        "user_agent": request.headers.get("user-agent", ""),
        "recorded_at": now,
    })

    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token)

    user_doc["_id"] = user_id
    user_doc.pop("password_hash", None)
    return serialize_doc(user_doc)


@router.post("/login")
async def login(data: LoginRequest, response: Response, request: Request):
    email = data.email.lower().strip()
    ip = request.client.host or "unknown"
    identifier = f"{ip}:{email}"

    # Check brute force
    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5:
        from datetime import timedelta
        locked_at = attempts.get("last_attempt")
        if locked_at and (datetime.now(timezone.utc) - locked_at.replace(tzinfo=timezone.utc)).seconds < 900:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"last_attempt": datetime.now(timezone.utc)}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Clear failed attempts
    await db.login_attempts.delete_one({"identifier": identifier})

    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token)

    user["_id"] = user_id
    user.pop("password_hash", None)
    out = serialize_doc(user)
    if user.get("role") == "tradesperson":
        pp = await db.pro_profiles.find_one({"user_id": user_id}, {"plan_tier": 1})
        out["plan_tier"] = (pp or {}).get("plan_tier") or "standard"
    return out


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    out = serialize_doc(user)
    # Attach pro plan_tier so the front-end can gate Pro-only UX (e.g. instant
    # push alerts) without a second round-trip.
    if user.get("role") == "tradesperson":
        pp = await db.pro_profiles.find_one({"user_id": user["_id"]}, {"plan_tier": 1})
        out["plan_tier"] = (pp or {}).get("plan_tier") or "standard"
    return out


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"_id": __import__("bson").ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user_id = str(user["_id"])
        access_token = create_access_token(user_id, user["email"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
        return {"message": "Token refreshed"}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@router.post("/onboarding")
async def complete_onboarding(data: OnboardingRequest, response: Response, request: Request, user: dict = Depends(get_current_user)):
    from bson import ObjectId
    if user.get("onboarding_complete"):
        raise HTTPException(status_code=400, detail="Onboarding already complete")

    # Anti-bot — Turnstile is the LAST step of onboarding (iter24 — moved from signup form)
    ip = request.client.host if request.client else "unknown"
    if not await verify_turnstile_token(data.turnstile_token or "", remote_ip=ip):
        raise HTTPException(
            status_code=400,
            detail="Unable to verify you are human. Please complete the security check and try again.",
        )

    # Single-sided product: the only self-service role is the tradesperson.
    if data.role != "tradesperson":
        raise HTTPException(status_code=400, detail="Invalid role")
    required = {"contact_person": data.contact_person, "company_name": data.company_name,
                "address": data.address, "postal_code": data.postal_code, "city": data.city,
                "phone": data.phone, "licence_file_id": data.licence_file_id}
    for k, v in required.items():
        if not (v or "").strip():
            raise HTTPException(status_code=400, detail=f"Missing required field: {k}")

    # Build user update payload
    full_name = ((data.name or "").strip() + " " + (data.surname or "").strip()).strip() or user.get("name", "")
    user_update = {
        "role": data.role,
        "country": data.country,
        "onboarding_complete": True,
        "name": full_name,
        "given_name": (data.name or "").strip() or None,
        "family_name": (data.surname or "").strip() or None,
        "phone": (data.phone or "").strip() or None,
        "address": (data.address or "").strip() or None,
        "postal_code": (data.postal_code or "").strip() or None,
        "city": (data.city or "").strip() or None,
    }
    await db.users.update_one({"_id": ObjectId(user["_id"])}, {"$set": user_update})

    # Create / fill the service-provider profile
    now = datetime.now(timezone.utc)
    pro_update = {
        "business_name": (data.company_name or "").strip(),
        "company_name": (data.company_name or "").strip(),
        "contact_person": (data.contact_person or "").strip(),
        # Documents (admin verifies in queue)
        "licence_file_id": data.licence_file_id,
        "licence_status": "pending",     # pending | verified | rejected
        "insurance_file_id": data.insurance_file_id,
        "insurance_status": "pending" if data.insurance_file_id else "missing",
        # Badges derive from the statuses above (computed on read)
        "is_verified": False,
        "is_licensed": False,
        "is_insured": False,
    }
    existing_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if existing_profile:
        await db.pro_profiles.update_one(
            {"_id": existing_profile["_id"]},
            {"$set": pro_update},
        )
    else:
        await db.pro_profiles.insert_one({
            "user_id": user["_id"],
            "tagline": "", "description": "",
            "hourly_rate": 0, "years_experience": 0,
            "service_categories": [], "service_areas": [],
            "portfolio_photos": [],
            "plan_tier": "standard", "card_last4": "",
            "monthly_fees": 0.0, "rating_avg": 0.0,
            "reviews_count": 0, "completed_jobs_count": 0,
            "response_time_minutes": None,
            "created_at": now,
            **pro_update,
        })

    updated_user = await db.users.find_one({"_id": ObjectId(user["_id"])})
    updated_user["_id"] = str(updated_user["_id"])
    updated_user.pop("password_hash", None)
    return serialize_doc(updated_user)
