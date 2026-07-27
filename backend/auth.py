"""JWT auth against Postgres.

Stateless by design, which is what makes it work on serverless: there is no
session store to warm and nothing to share between invocations. The token is
verified with a secret and the user row is one indexed lookup.

Cookies are `secure` outside development — the app is served over HTTPS on
Vercel, and a non-secure auth cookie there is a session waiting to be lifted
off a café network.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import HTTPException, Request

from db import pg

JWT_ALGORITHM = "HS256"
ACCESS_TTL = timedelta(minutes=60)
REFRESH_TTL = timedelta(days=7)

# Columns a caller may see. password_hash is never among them — the previous
# implementation fetched the whole document and popped it afterwards, which
# only works as long as nobody forgets.
USER_COLUMNS = (
    "id, legacy_id, email, name, given_name, family_name, role, country, lang, "
    "phone, address, postal_code, city, onboarding_complete, is_email_verified, "
    "banned, notif_email, notif_email_marketing, notif_new_message, "
    "notif_job_status, notif_payment_receipt, policy_version_accepted, "
    "policy_accepted_at, created_at"
)


def get_jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")
    return secret


def _is_production() -> bool:
    return (os.environ.get("VERCEL_ENV") == "production"
            or os.environ.get("ENVIRONMENT", "").lower() in ("production", "prod"))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        # An imported placeholder hash ("!") is not a valid bcrypt string.
        # Treat it as "no password set" rather than letting it raise.
        return False


def create_access_token(user_id: str, email: str) -> str:
    return jwt.encode(
        {"sub": str(user_id), "email": email,
         "exp": datetime.now(timezone.utc) + ACCESS_TTL, "type": "access"},
        get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": str(user_id), "exp": datetime.now(timezone.utc) + REFRESH_TTL,
         "type": "refresh"},
        get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, access_token: str, refresh_token: str) -> None:
    secure = _is_production()
    response.set_cookie("access_token", access_token, httponly=True, secure=secure,
                        samesite="lax", max_age=int(ACCESS_TTL.total_seconds()), path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=secure,
                        samesite="lax", max_age=int(REFRESH_TTL.total_seconds()), path="/")


def clear_auth_cookies(response) -> None:
    for name in ("access_token", "refresh_token"):
        response.delete_cookie(name, path="/")


def _token_from(request: Request) -> Optional[str]:
    token = request.cookies.get("access_token")
    if token:
        return token
    header = request.headers.get("Authorization", "")
    return header[7:] if header.startswith("Bearer ") else None


async def load_user(user_id: str) -> Optional[dict]:
    """Fetch by uuid, falling back to legacy_id.

    During the migration a token issued before the import still carries the
    old Mongo ObjectId. The fallback keeps those sessions alive; it goes when
    the legacy columns do.
    """
    row = await pg.fetchrow(
        f"select {USER_COLUMNS} from users "
        f"where (id::text = $1 or legacy_id = $1) and deleted_at is null",
        str(user_id))
    if not row:
        return None
    # `_id` is kept as an alias so the existing route code keeps working
    # while the remaining modules are ported.
    row["_id"] = str(row["id"])
    return row


async def get_current_user(request: Request) -> dict:
    token = _token_from(request)
    if not token:
        raise HTTPException(401, "Not authenticated")

    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    if payload.get("type") != "access":
        raise HTTPException(401, "Invalid token type")

    user = await load_user(payload.get("sub", ""))
    if not user:
        raise HTTPException(401, "User not found")
    if user.get("banned"):
        raise HTTPException(403, "This account has been suspended.")
    return user


async def get_current_user_optional(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    return user


async def require_pro(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "tradesperson":
        raise HTTPException(403, "Pro access required")
    return user
