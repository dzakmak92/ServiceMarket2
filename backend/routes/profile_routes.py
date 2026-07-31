"""Pro profile endpoints (Postgres).

The frontend has read /api/profile/pro since before the re-spine — the header,
navigation, settings, dashboard, calendar and billing pages all depend on it —
but the implementation lived in a MongoDB module that is not deployed. This is
that surface rebuilt against pro_profiles.

Three response fields are marketplace leftovers the UI still reads:
rating_avg, reviews_count and the review-derived badges. A one-sided tool has
no reviews, so they are reported as absent rather than invented. Removing them
from the payload would break the pages that read them; reporting them honestly
lets those sections render empty and be deleted with the UI that shows them.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from auth import get_current_user
from db import pg
from routes._pro import require_pro_id
from services import storage

router = APIRouter(prefix="/profile", tags=["profile"])

# Columns a pro may set about their own business. Deliberately explicit: an
# allow-list means a new column is invisible to the API until someone decides
# it should be writable, rather than exposed the moment it is added.
# The account, as opposed to the business. Same reasoning as EDITABLE below:
# an allow-list, so a column added to `users` is invisible to this endpoint
# until somebody decides it should be writable. `email`, `role` and `banned`
# are absent on purpose — changing an email is an identity change and needs
# verification, not a PATCH.
ACCOUNT_EDITABLE = {
    "name", "given_name", "family_name", "phone", "address", "postal_code",
    "city", "country", "lang",
    "notif_email", "notif_email_marketing", "notif_new_message",
    "notif_job_status", "notif_payment_receipt",
}

EDITABLE = {
    "business_name", "contact_person", "tagline", "description",
    "hourly_rate", "years_experience", "service_categories", "service_areas",
    "languages_spoken", "invoice_country", "vat_id", "tax_number",
    "is_kleinunternehmer", "invoice_footer", "invoice_template",
    "business_address", "business_postal_code", "business_city",
    "business_country", "bank_account_holder", "bank_iban", "bank_bic",
    "bank_name", "service_center_lat", "service_center_lng",
    "service_radius_km",
}

LOGO_BUCKET = storage.BUCKET_LOGOS


class ProfilePatch(BaseModel):
    business_name: Optional[str] = Field(default=None, max_length=200)
    contact_person: Optional[str] = None
    tagline: Optional[str] = None
    description: Optional[str] = None
    hourly_rate: Optional[float] = Field(default=None, ge=0)
    years_experience: Optional[int] = Field(default=None, ge=0, le=80)
    service_categories: Optional[list[str]] = None
    service_areas: Optional[list[str]] = None
    languages_spoken: Optional[list[str]] = None
    invoice_country: Optional[str] = Field(default=None, pattern="^[A-Z]{2}$")
    vat_id: Optional[str] = None
    tax_number: Optional[str] = None
    is_kleinunternehmer: Optional[bool] = None
    invoice_footer: Optional[str] = None
    invoice_template: Optional[str] = None
    business_address: Optional[str] = None
    business_postal_code: Optional[str] = None
    business_city: Optional[str] = None
    business_country: Optional[str] = Field(default=None, pattern="^[A-Z]{2}$")
    bank_account_holder: Optional[str] = None
    bank_iban: Optional[str] = None
    bank_bic: Optional[str] = None
    bank_name: Optional[str] = None
    service_center_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    service_center_lng: Optional[float] = Field(default=None, ge=-180, le=180)
    service_radius_km: Optional[int] = Field(default=None, ge=0, le=500)


class TemplatePatch(BaseModel):
    invoice_template: str = Field(min_length=1, max_length=40)


async def _payload(pro_id: str) -> dict:
    row = await pg.fetchrow("select * from pro_profiles where id = $1", pro_id)
    if not row:
        raise HTTPException(404, "Pro profile not found")

    # Counted rather than stored: a denormalised counter drifts the first time
    # a job is deleted or re-opened, and this is read far less often than jobs
    # change.
    completed = await pg.fetchval(
        "select count(*) from jobs where pro_id = $1 and status = 'completed'", pro_id) or 0

    data = dict(row)
    data["id"] = str(data["id"])
    data["user_id"] = str(data["user_id"])
    data["completed_jobs_count"] = completed
    # Invoicing is core to the one-sided product, not an add-on tier, so the
    # toolkit is always available. The flag stays because the navigation still
    # gates on it.
    data["has_invoice_toolkit"] = True
    data["portfolio_photos"] = data.get("portfolio_photos") or []
    # No reviews exist without a marketplace. Absent, not zero — zero would
    # render as "0.0 stars" and read like a bad rating.
    data["rating_avg"] = None
    data["reviews_count"] = 0
    data["monthly_fees"] = []
    if data.get("logo_file_id"):
        try:
            data["logo_url"] = await storage.signed_url_for(data["logo_file_id"])
        except Exception:  # noqa: BLE001 — a missing logo must not 500 the page
            data["logo_url"] = None
    else:
        data["logo_url"] = None
    return data


@router.get("/pro")
async def get_pro_profile(user: dict = Depends(get_current_user)):
    return await _payload(await require_pro_id(user))


@router.patch("/pro")
async def patch_pro_profile(body: ProfilePatch, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    data = {k: v for k, v in body.model_dump(exclude_none=True).items() if k in EDITABLE}
    if not data:
        return await _payload(pro_id)

    cols = list(data)
    sets = ", ".join(f"{c} = ${i}" for i, c in enumerate(cols, start=2))
    await pg.execute(
        f"update pro_profiles set {sets}, updated_at = now() where id = $1",
        pro_id, *data.values())
    return await _payload(pro_id)


@router.patch("/pro/invoice-template")
async def set_invoice_template(body: TemplatePatch, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    await pg.execute(
        "update pro_profiles set invoice_template = $2, updated_at = now() where id = $1",
        pro_id, body.invoice_template)
    return {"invoice_template": body.invoice_template}


@router.post("/pro/logo", status_code=201)
async def upload_logo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    if not storage.is_configured():
        raise HTTPException(503, "File storage is not configured")

    data = await file.read()
    content_type = storage.guess_type(file.filename or "logo", file.content_type or "image/png")
    try:
        storage.validate(LOGO_BUCKET, content_type, len(data))
        key = storage.build_key(pro_id, file.filename or "logo.png")
        ref = await storage.upload(LOGO_BUCKET, key, data, content_type=content_type)
    except storage.StorageError as exc:
        # "2 MB limit" is something the caller can act on; a 500 is not.
        raise HTTPException(400, str(exc)) from exc

    # Replace rather than accumulate: the previous logo is unreachable once the
    # row points elsewhere, and leaving it costs storage forever.
    old = await pg.fetchval("select logo_file_id from pro_profiles where id = $1", pro_id)
    await pg.execute(
        "update pro_profiles set logo_file_id = $2, logo_content_type = $3, "
        "updated_at = now() where id = $1", pro_id, ref, content_type)
    if old and old != ref:
        try:
            await storage.delete(*storage.parse_ref(old))
        except Exception:  # noqa: BLE001 — an orphaned file is not worth a 500
            pass
    return await _payload(pro_id)


@router.delete("/pro/logo")
async def delete_logo(user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    ref = await pg.fetchval("select logo_file_id from pro_profiles where id = $1", pro_id)
    await pg.execute(
        "update pro_profiles set logo_file_id = null, logo_content_type = null, "
        "updated_at = now() where id = $1", pro_id)
    if ref:
        try:
            await storage.delete(*storage.parse_ref(ref))
        except Exception:  # noqa: BLE001
            pass
    return {"deleted": True}


# ── The account behind the business ────────────────────────────────────
class AccountPatch(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = Field(default=None, pattern="^[A-Z]{2}$")
    lang: Optional[str] = Field(default=None, pattern="^(de|en|tr|es)$")
    notif_email: Optional[bool] = None
    notif_email_marketing: Optional[bool] = None
    notif_new_message: Optional[bool] = None
    notif_job_status: Optional[bool] = None
    notif_payment_receipt: Optional[bool] = None


ACCOUNT_OUT = ("id", "email", "name", "given_name", "family_name", "role",
               "country", "lang", "phone", "address", "postal_code", "city",
               "onboarding_complete", "is_email_verified",
               "notif_email", "notif_email_marketing", "notif_new_message",
               "notif_job_status", "notif_payment_receipt")


def _account(row) -> dict:
    out = {k: row[k] for k in ACCOUNT_OUT if k in row}
    out["id"] = str(out["id"])
    return out


@router.get("", tags=["profile"])
async def get_account(user: dict = Depends(get_current_user)):
    row = await pg.fetchrow(
        "select * from users where id = $1 and deleted_at is null", user["id"])
    if not row:
        raise HTTPException(404, "Account not found")
    return _account(row)


@router.patch("", tags=["profile"])
async def patch_account(body: AccountPatch, user: dict = Depends(get_current_user)):
    """Name, contact details and notification preferences.

    Separate from /profile/pro because they are different things: this is the
    person, that is the business. The settings screen has always sent both in
    one save and there was nothing here to receive this half — every name,
    phone number and notification toggle a pro changed was silently discarded.
    """
    data = {k: v for k, v in body.model_dump(exclude_none=True).items()
            if k in ACCOUNT_EDITABLE}
    if not data:
        raise HTTPException(400, "Nothing to update")

    cols = list(data)
    sets = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
    row = await pg.fetchrow(
        f"update users set {sets}, updated_at = now() "
        f"where id = $1 and deleted_at is null returning *",
        user["id"], *data.values())
    if not row:
        raise HTTPException(404, "Account not found")
    return _account(row)
