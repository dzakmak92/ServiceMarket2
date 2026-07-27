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
    turnstile_token: Optional[str] = None  # Cloudflare Turnstile token — required for homeowner signup


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OnboardingRequest(BaseModel):
    role: str  # homeowner | tradesperson
    country: str  # AT | DE | CH | FR | ES | TR
    # Homeowner & service provider — common
    name: Optional[str] = None       # first name
    surname: Optional[str] = None    # last / family name
    phone: Optional[str] = None
    address: Optional[str] = None    # street + house number
    postal_code: Optional[str] = None
    city: Optional[str] = None
    # Homeowner-only
    username: Optional[str] = None   # public display handle
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


class JobCreate(BaseModel):
    title: str = Field(min_length=5)
    category: str
    description: str = ""  # optional for tasks; required for projects (enforced in route)
    city: str
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    urgency: str = "medium"  # low | medium | high
    attachments: Optional[List[Attachment]] = None
    # Listing type split (iter36)
    listing_type: str = "task"          # "task" | "project"
    timeline_weeks: Optional[int] = None  # projects: estimated duration 1–52 weeks
    site_visit_required: bool = False   # projects: pro needs a site visit before quoting
    # Recurring jobs
    recurring_type: Optional[str] = None   # "weekly" | "biweekly" | "monthly"
    recurring_count: Optional[int] = None  # 2–8 total occurrences (including first)


class JobStatusUpdate(BaseModel):
    status: str  # in_progress | completed | cancelled


class JobUpdate(BaseModel):
    """Homeowner-side edit of a job that's still in 'open' status."""
    title: Optional[str] = Field(default=None, min_length=5)
    category: Optional[str] = None
    description: Optional[str] = None
    city: Optional[str] = None
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    urgency: Optional[str] = None  # low | medium | high
    attachments: Optional[List[Attachment]] = None
    listing_type: Optional[str] = None
    timeline_weeks: Optional[int] = None
    site_visit_required: Optional[bool] = None


class JobLocationShare(BaseModel):
    address_full: str = Field(min_length=4)
    lat: Optional[float] = None
    lng: Optional[float] = None


class AIClassifyRequest(BaseModel):
    description: str = Field(min_length=10)
    title: Optional[str] = None
    lang: Optional[str] = "en"


class QuoteCreate(BaseModel):
    job_id: str
    # New iter22 fields — pauschal vs hourly required
    price_type: str = Field(default="pauschal")  # 'pauschal' | 'hourly' | 'milestone'
    amount: int = Field(gt=0)  # flat fee (pauschal) OR hourly rate (hourly) OR total of all milestones (milestone)
    estimated_hours: Optional[float] = Field(default=None, ge=0)
    travel_cost: int = Field(default=0, ge=0)
    parking_cost: int = Field(default=0, ge=0)
    message: str = Field(min_length=20)
    milestones: Optional[List[MilestoneItem]] = None  # iter36: project phase breakdown

    @property
    def computed_total(self) -> int:
        base = self.amount if self.price_type == "pauschal" else int(round(self.amount * (self.estimated_hours or 0)))
        return base + self.travel_cost + self.parking_cost


class MessageCreate(BaseModel):
    job_id: str
    to_id: str
    text: str
    kind: str = "text"
    booking_day: Optional[str] = None
    booking_slot: Optional[str] = None
    attachments: Optional[List[Attachment]] = None


class BookingCreate(BaseModel):
    job_id: str
    pro_id: str
    day: str
    slot: str
    date: Optional[str] = None  # ISO YYYY-MM-DD; used for iCal export


class ReviewCreate(BaseModel):
    job_id: str
    rating: int = Field(ge=1, le=5)
    text: Optional[str] = None


class ReviewResponseCreate(BaseModel):
    response: str = Field(min_length=1, max_length=1000)


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


class FeeEditRequest(BaseModel):
    """Admin edits a contact_fee row's amount before the monthly invoice is generated."""
    amount: float = Field(ge=0)
    reason: Optional[str] = None


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
    address: Optional[str] = None  # street + number + postal code (homeowner)
    lang: Optional[str] = None
    notif_email: Optional[bool] = None
    notif_sms: Optional[bool] = None
    notif_categories: Optional[List[str]] = None
    # Per-event notification preferences (master notif_email/notif_sms still gate everything)
    notif_new_message: Optional[bool] = None        # both roles
    notif_new_review: Optional[bool] = None         # pros: new review on their profile
    notif_new_quote: Optional[bool] = None          # homeowners: pro sent a quote
    notif_quote_accepted: Optional[bool] = None     # pros: homeowner accepted their quote
    notif_new_job_match: Optional[bool] = None      # pros: new matching job posted
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


class CategoryFeeUpdate(BaseModel):
    contact_fee: float


class BusinessClaimRequest(BaseModel):
    """A user requests to claim a business_directory listing as their own."""
    message: Optional[str] = None
    contact_phone: Optional[str] = None


class BusinessInquiryRequest(BaseModel):
    """A homeowner writes a message to a (possibly unclaimed) directory business.
    Captured as a lead and surfaced to admins for onboarding."""
    message: str


class ClaimReviewRequest(BaseModel):
    action: str  # "approve" | "reject"
