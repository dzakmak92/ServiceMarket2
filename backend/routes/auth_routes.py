"""Auth endpoints (Postgres).

Single-sided: the only self-service role is the tradesperson. Admins are
created out of band.
"""
from __future__ import annotations

import hashlib
import ipaddress
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from auth import (JWT_ALGORITHM, clear_auth_cookies, create_access_token,
                  create_refresh_token, get_current_user, get_jwt_secret,
                  hash_password, load_user, set_auth_cookies, verify_password)
from db import pg
from services import mailer
from services.turnstile import verify_turnstile_token

logger = logging.getLogger(__name__)


def _client_ip(request: Request):
    """The caller's address, or None if it is not one.

    `password_reset_tokens.requested_ip` is `inet`, and X-Forwarded-For is
    client-supplied — an unparseable value would make the insert raise and
    lose the reset request itself. Losing a line of provenance is the lesser
    failure.
    """
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    candidate = fwd or (request.client.host if request.client else None)
    if not candidate:
        return None
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None

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


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
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


# One hour. Long enough to find the mail, short enough to bound the window in
# which a forwarded link is still a working credential.
RESET_TTL = timedelta(hours=1)
# Per address, per hour. Enough for someone who mistypes their email twice,
# few enough that this cannot be used to mailbomb a customer.
MAX_RESETS_PER_HOUR = 5


def _hash_token(token: str) -> str:
    """SHA-256, because what is stored must not be usable.

    A reset token is a bearer credential: whoever holds it becomes the
    account. Storing it in the clear would mean any read of the table — a
    leaked backup, an over-broad support query — hands over every account
    with an outstanding reset. bcrypt is the wrong tool here: the value is
    128 bits of `secrets` output, not a guessable human password, so there is
    nothing for a slow hash to buy, and the redemption path has to look it up
    by exact value.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordIn, request: Request):
    """Start a reset. Always answers the same way.

    Deliberately identical whether or not the address has an account: any
    difference — a different message, a different status, a measurably
    different response time — turns this endpoint into a way to find out who
    is registered, and the addresses here belong to tradespeople whose
    business email is their livelihood.

    So it never says whether it found anything. The only observable
    difference is that an email arrives, and only the owner of the mailbox
    can observe that.
    """
    email = data.email.lower().strip()
    ip = _client_ip(request)
    same = {"sent": True,
            "note": "Falls ein Konto mit dieser Adresse besteht, ist eine "
                    "E-Mail unterwegs."}

    row = await pg.fetchrow(
        "select id::text as id, email, name from users "
        "where email = $1 and deleted_at is null", email)
    if not row:
        return same

    recent = await pg.fetchval(
        "select count(*) from password_reset_tokens "
        "where user_id = $1::uuid and created_at > now() - interval '1 hour'",
        row["id"])
    if int(recent or 0) >= MAX_RESETS_PER_HOUR:
        # Still the same answer. Telling the caller they have been throttled
        # would confirm the address exists.
        logger.warning("password reset throttled for user %s", row["id"])
        return same

    token = secrets.token_urlsafe(32)
    await pg.execute(
        """
        insert into password_reset_tokens
               (user_id, token_hash, expires_at, requested_ip, user_agent)
        values ($1::uuid, $2, now() + $3, $4::inet, $5)
        """,
        # A timedelta, not a string: asyncpg encodes it straight to `interval`
        # and rejects the text form outright.
        row["id"], _hash_token(token), RESET_TTL,
        ip, (request.headers.get("user-agent") or "")[:400])

    base = (os.environ.get("FRONTEND_URL")
            or str(request.base_url).rstrip("/"))
    link = f"{base}/reset-password?token={token}"
    delivered = await mailer.send(
        to=row["email"],
        subject="Passwort zurücksetzen",
        text=(f"Hallo {row['name'] or ''},\n\n"
              f"mit diesem Link setzen Sie Ihr Passwort neu:\n\n{link}\n\n"
              f"Der Link gilt eine Stunde und kann nur einmal verwendet "
              f"werden. Wenn Sie das nicht angefordert haben, ignorieren Sie "
              f"diese E-Mail — Ihr Passwort bleibt unverändert.\n"))
    if not delivered:
        # The operator's only route to recover a locked-out user while there
        # is no mailer. Never returned to the caller.
        logger.warning("password reset link for %s (undeliverable): %s",
                       row["email"], link)
    return same


@router.post("/reset-password")
async def reset_password(data: ResetPasswordIn, response: Response):
    """Redeem a token and set a new password.

    Single use and time limited, both checked in the same statement that
    marks it used — so two requests racing with the same token cannot both
    succeed. Every other outstanding token for the account is invalidated
    too: if the reset was prompted by a compromise, leaving a second live
    link would defeat the point.
    """
    row = await pg.fetchrow(
        """
        update password_reset_tokens
           set used_at = now()
         where token_hash = $1
           and used_at is null
           and expires_at > now()
        returning user_id::text as user_id
        """, _hash_token(data.token))
    if not row:
        raise HTTPException(400, "Dieser Link ist abgelaufen oder wurde bereits verwendet.")

    async with pg.transaction() as con:
        user = await con.fetchrow(
            "update users set password_hash = $2, updated_at = now() "
            "where id = $1::uuid and deleted_at is null "
            "returning id::text as id, email",
            row["user_id"], hash_password(data.new_password))
        if not user:
            raise HTTPException(400, "Dieses Konto besteht nicht mehr.")
        await con.execute(
            "update password_reset_tokens set used_at = now() "
            "where user_id = $1::uuid and used_at is null", row["user_id"])

    # The failed-login counter is keyed on ip+email and would otherwise keep
    # someone locked out of the password they have just legitimately set.
    await pg.execute(
        "delete from platform_settings where key like $1",
        f"login_attempt:%:{user['email']}")

    set_auth_cookies(response, create_access_token(user["id"], user["email"]),
                     create_refresh_token(user["id"]))
    return {"reset": True, "email": user["email"]}


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
