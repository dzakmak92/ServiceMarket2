from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=2)
    accepted_terms: bool = False
    accepted_privacy: bool = False
    policy_version: Optional[str] = None
    marketing_opt_in: bool = False
    turnstile_token: Optional[str] = None  # Cloudflare Turnstile token


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OnboardingRequest(BaseModel):
    role: str  # tradesperson
    country: str  # AT | DE | CH | FR | ES | TR
    # Common
    name: Optional[str] = None       # first name
    surname: Optional[str] = None    # last / family name
    phone: Optional[str] = None
    address: Optional[str] = None    # street + house number
    postal_code: Optional[str] = None
    city: Optional[str] = None
    # Service provider-only
    contact_person: Optional[str] = None
    company_name: Optional[str] = None
    licence_file_id: Optional[str] = None        # GridFS id (Gewerbeschein — required)
    insurance_file_id: Optional[str] = None      # GridFS id (Gewerbeversicherung — optional)
    # Anti-bot — Turnstile final-step token
    turnstile_token: Optional[str] = None


class Attachment(BaseModel):
    file_id: str
    url: str
    name: str
    content_type: str
    size: int


class MilestoneItem(BaseModel):
    """A named phase in a project quote (e.g. 'Phase 1: Planning — €500')."""
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    amount: float = Field(gt=0)
    order: int = 0


class AIClassifyRequest(BaseModel):
    description: str = Field(min_length=10)
    title: Optional[str] = None
    lang: Optional[str] = "en"


# ──────────────────────────────────────────────
# INVOICING (iter24 — Austrian/EU-compliant per §11 UStG)
# ──────────────────────────────────────────────
class CompanySettings(BaseModel):
    """Singleton document — operator's company details, embedded into every invoice as supplier block."""
    legal_name: str = Field(min_length=2)
    street: str
    postal_code: str
    city: str
    country: str = "AT"
    vat_id: Optional[str] = None         # UID-Nummer (e.g., ATU12345678) — required to charge VAT
    tax_id: Optional[str] = None         # Steuernummer (fallback)
    iban: Optional[str] = None
    bic: Optional[str] = None
    bank_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    logo_file_id: Optional[str] = None
    is_kleinunternehmer: bool = False    # Per §6(1)27 UStG — turnover < €35k, no VAT
    default_vat_rate: int = 20           # 0 / 10 / 20 — Austrian standard
    invoice_footer_text: Optional[str] = None  # e.g. payment-terms boilerplate
    storno_prefix: str = "GUT-"          # Credit-note number prefix
    invoice_prefix: str = "RG-"          # Invoice number prefix


class StornoRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ProProfileUpdate(BaseModel):
    business_name: Optional[str] = None
    tagline: Optional[str] = None
    description: Optional[str] = None
    hourly_rate: Optional[int] = None
    years_experience: Optional[int] = None
    service_categories: Optional[List[str]] = None
    service_areas: Optional[List[str]] = None
    portfolio_photos: Optional[List[str]] = None
    languages_spoken: Optional[List[str]] = None
    # Tax / invoicing model — affects the pro's own customer invoices (Invoice Toolkit)
    is_kleinunternehmer: Optional[bool] = None
    # Bank details for EPC-QR on issued invoices (captured after Toolkit purchase)
    bank_account_holder: Optional[str] = None
    bank_iban: Optional[str] = None
    bank_bic: Optional[str] = None
    bank_name: Optional[str] = None
    invoice_tax_id: Optional[str] = None
    invoice_footer: Optional[str] = None
    # Business address shown on invoices (separate from user's personal city for cases like co-working / branch addresses)
    business_address: Optional[str] = None       # street + number
    business_postal_code: Optional[str] = None
    business_city: Optional[str] = None
    business_country: Optional[str] = None       # e.g. "AT"
    # Geo-fencing (iter25)
    service_center_lat: Optional[float] = None
    service_center_lng: Optional[float] = None
    service_radius_km: Optional[int] = None  # 0 / None = no geo filter, behaves like before


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None  # street + number + postal code
    lang: Optional[str] = None
    notif_email: Optional[bool] = None
    notif_sms: Optional[bool] = None
    notif_categories: Optional[List[str]] = None
    # Per-event notification preferences (master notif_email/notif_sms still gate everything)
    notif_new_message: Optional[bool] = None        # both roles
    notif_booking_confirmed: Optional[bool] = None  # both
    notif_job_status: Optional[bool] = None         # both: job started / completed
    notif_payment_receipt: Optional[bool] = None    # both: monthly billing run
    privacy_show_lastname: Optional[bool] = None
    privacy_share_contact_pre_accept: Optional[bool] = None


class AvailabilityUpdate(BaseModel):
    slots: List[dict]  # [{"day": "Mon", "slot": "09:00-12:00", "is_available": True}]


class TranslateRequest(BaseModel):
    text: str
    target_lang: str  # de | tr | es | en


class CheckoutRequest(BaseModel):
    origin_url: str


class BusinessClaimRequest(BaseModel):
    """A pro requests to claim a business_directory listing as their own
    (onboarding accelerator — prefills company details)."""
    message: Optional[str] = None
    contact_phone: Optional[str] = None


class ClaimReviewRequest(BaseModel):
    action: str  # "approve" | "reject"
