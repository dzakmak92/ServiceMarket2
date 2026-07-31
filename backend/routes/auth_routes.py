"""Auth endpoints (Postgres).

Single-sided: the only self-service role is the tradesperson. Admins are
created out of band.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from auth import (JWT_ALGORITHM, clear_auth_cookies, create_access_token,
                  create_refresh_token, get_current_user, get_jwt_secret,
                  hash_password, load_user, set_auth_cookies, verify_password)
from db import pg
from services.turnstile import verify_turnstile_token

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_FAILED_LOGINS = 5
LOCKOUT = timedelta(minutes=15)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=2, max_length=200)
    accepted_terms: bool = False
    accepted_privacy: bool = False
    policy_version: Optional[str] = None
    marketing_opt_in: bool = False


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    # Same floor as registration. A change-password form that accepts a weaker
    # password than sign-up did is a downgrade path.
    new_password: str = Field(min_length=8)


class OnboardingIn(BaseModel):
    country: str = Field(default="AT", pattern="^[A-Z]{2}$")
    name: Optional[str] = None
    surname: Optional[str] = None
    phone: str = Field(min_length=4)
    address: str = Field(min_length=2)
    postal_code: str = Field(min_length=2)
    city: str = Field(min_length=2)
    contact_person: str = Field(min_length=2)
    company_name: str = Field(min_length=2)
    licence_file_id: str = Field(min_length=1)
    insurance_file_id: Optional[str] = None
    turnstile_token: Optional[str] = None


async def _record_consent(user_id: str, kind: str, data: dict, request: Request) -> None:
    """Audit-grade consent record. Separate from the user row on purpose:
    consent is a point-in-time fact and must survive later profile edits."""
    await pg.execute(
        """
        insert into audit_log (user_id, entity, entity_id, action, detail, ip)
        values ($1, 'consent', $1, $2, $3::jsonb, $4)
        """,
        user_id, kind,
        __import__("json").dumps(data, default=str),
        request.client.host if request.client else None)


@router.post("/register", status_code=201)
async def register(data: RegisterIn, response: Response, request: Request):
    email = data.email.lower().strip()

    # GDPR consent gate — both must be affirmative, and the record is kept.
    if not (data.accepted_terms and data.accepted_privacy):
        raise HTTPException(
            400, "You must accept the Terms of Service and Privacy Policy to create an account.")

    if await pg.fetchval("select 1 from users where email = $1", email):
        raise HTTPException(400, "Email already registered")

    policy_version = data.policy_version or "1.0"
    row = await pg.fetchrow(
        """
        insert into users (email, password_hash, name, role,
                           notif_email_marketing, policy_version_accepted, policy_accepted_at)
        values ($1, $2, $3, 'tradesperson', $4, $5, now())
        returning id::text as id, email, name, role
        """,
        email, hash_password(data.password), data.name.strip(),
        bool(data.marketing_opt_in), policy_version)

    await _record_consent(row["id"], "registration", {
        "accepted_terms": True, "accepted_privacy": True,
        "marketing_emails": bool(data.marketing_opt_in),
        "policy_version": policy_version,
        "user_agent": request.headers.get("user-agent", ""),
    }, request)

    set_auth_cookies(response, create_access_token(row["id"], email),
                     create_refresh_token(row["id"]))
    return await load_user(row["id"])


async def _is_locked_out(identifier: str) -> bool:
    """True while this ip+email is inside its lockout window.

    Keyed on ip *and* email so one attacker cannot lock a legitimate user out
    of their own account by hammering their address from somewhere else.
    """
    import json as _json
    attempt = await pg.fetchrow(
        "select value from platform_settings where key = $1",
        f"login_attempt:{identifier}")
    if not attempt:
        return False
    v = attempt["value"] if isinstance(attempt["value"], dict) else _json.loads(attempt["value"])
    if int(v.get("count", 0)) < MAX_FAILED_LOGINS:
        return False
    return datetime.now(timezone.utc) - datetime.fromisoformat(v["last"]) < LOCKOUT


async def _record_failure(identifier: str) -> None:
    await pg.execute(
        """
        insert into platform_settings (key, value)
        values ($1, jsonb_build_object('count', 1, 'last', $2::text))
        on conflict (key) do update
          set value = jsonb_build_object(
                'count', coalesce((platform_settings.value->>'count')::int, 0) + 1,
                'last', $2::text),
              updated_at = now()
        """,
        f"login_attempt:{identifier}", datetime.now(timezone.utc).isoformat())


@router.post("/login")
async def login(data: LoginIn, response: Response, request: Request):
    email = data.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"

    if await _is_locked_out(identifier):
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")

    row = await pg.fetchrow(
        "select id::text as id, email, password_hash, banned from users "
        "where email = $1 and deleted_at is null", email)

    if not row or not verify_password(data.password, row["password_hash"] or ""):
        await _record_failure(identifier)
        raise HTTPException(401, "Invalid email or password")

    if row["banned"]:
        raise HTTPException(403, "This account has been suspended.")

    await pg.execute("delete from platform_settings where key = $1",
                     f"login_attempt:{identifier}")
    set_auth_cookies(response, create_access_token(row["id"], row["email"]),
                     create_refresh_token(row["id"]))

    user = await load_user(row["id"])
    if user and user.get("role") == "tradesperson":
        user["plan_tier"] = await pg.fetchval(
            "select plan_tier from pro_profiles where user_id::text = $1", row["id"]) or "standard"
    return user


@router.post("/change-password")
async def change_password(data: ChangePasswordIn, response: Response,
                          request: Request,
                          user: dict = Depends(get_current_user)):
    """Change your own password.

    There was no way to do this, and no way to reset a forgotten one either:
    no endpoint, no token, nothing in the UI. So a password could never be
    rotated after a leak, and anyone who forgot theirs was permanently locked
    out of their own business — its invoices, its tax year, its customers.

    Requires the current password even though the session already proves who
    you are: a session can be a borrowed laptop, and re-authenticating is what
    stops a walk-up from taking the account. Throttled on the same ip+email
    counter as login, because an endpoint that verifies a password is an
    endpoint that can be used to guess one.
    """
    email = (user.get("email") or "").lower().strip()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"

    if await _is_locked_out(identifier):
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")

    row = await pg.fetchrow(
        "select id::text as id, password_hash from users "
        "where id = $1::uuid and deleted_at is null", user["id"])
    if not row or not verify_password(data.current_password, row["password_hash"] or ""):
        await _record_failure(identifier)
        raise HTTPException(401, "The current password is not correct.")

    if data.new_password == data.current_password:
        raise HTTPException(400, "The new password must differ from the current one.")

    await pg.execute(
        "update users set password_hash = $2, updated_at = now() where id = $1::uuid",
        row["id"], hash_password(data.new_password))
    await pg.execute("delete from platform_settings where key = $1",
                     f"login_attempt:{identifier}")

    # Re-issue the cookies. The old tokens stay valid until they expire — this
    # deployment has no token denylist — so the honest thing is to say so
    # rather than imply every other session was just killed.
    set_auth_cookies(response, create_access_token(row["id"], email),
                     create_refresh_token(row["id"]))
    return {"changed": True,
            "note": "Andere Geräte bleiben angemeldet, bis ihre Sitzung abläuft."}


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"message": "Logged out"}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    if user.get("role") == "tradesperson":
        user["plan_tier"] = await pg.fetchval(
            "select plan_tier from pro_profiles where user_id::text = $1", user["id"]) or "standard"
    return user


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Invalid token type")

    user = await load_user(payload.get("sub", ""))
    if not user:
        raise HTTPException(401, "User not found")
    # Rotate both: a refresh token that outlives its use is a stolen session
    # with a seven-day lifetime.
    set_auth_cookies(response, create_access_token(user["id"], user["email"]),
                     create_refresh_token(user["id"]))
    return {"message": "Token refreshed"}


@router.post("/onboarding")
async def onboarding(data: OnboardingIn, request: Request,
                     user: dict = Depends(get_current_user)):
    if user.get("onboarding_complete"):
        raise HTTPException(400, "Onboarding already complete")

    # Turnstile sits at the END of onboarding rather than on the signup form:
    # the challenge lands right before the account becomes able to do anything.
    ip = request.client.host if request.client else "unknown"
    if not await verify_turnstile_token(data.turnstile_token or "", remote_ip=ip):
        raise HTTPException(
            400, "Unable to verify you are human. Please complete the security check.")

    full_name = " ".join(filter(None, [(data.name or "").strip(),
                                       (data.surname or "").strip()])) or user.get("name", "")

    async with pg.transaction() as con:
        await con.execute(
            """
            update users set country=$2, name=$3, given_name=$4, family_name=$5,
              phone=$6, address=$7, postal_code=$8, city=$9, onboarding_complete=true
            where id::text = $1
            """,
            user["id"], data.country, full_name,
            (data.name or "").strip() or None, (data.surname or "").strip() or None,
            data.phone.strip(), data.address.strip(),
            data.postal_code.strip(), data.city.strip())

        await con.execute(
            """
            insert into pro_profiles (user_id, business_name, contact_person,
                                      licence_file_id, licence_status,
                                      insurance_file_id, insurance_status,
                                      invoice_country, business_country)
            values ($1::uuid, $2, $3, $4, 'pending', $5, $6, $7, $7)
            on conflict (user_id) do update
              set business_name = excluded.business_name,
                  contact_person = excluded.contact_person,
                  licence_file_id = excluded.licence_file_id,
                  licence_status = 'pending',
                  insurance_file_id = excluded.insurance_file_id,
                  insurance_status = excluded.insurance_status
            """,
            user["id"], data.company_name.strip(), data.contact_person.strip(),
            data.licence_file_id, data.insurance_file_id,
            "pending" if data.insurance_file_id else "missing", data.country)

    return await load_user(user["id"])
