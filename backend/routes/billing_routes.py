from fastapi import APIRouter, HTTPException, Depends, Request
from database import db
from auth import get_current_user, require_admin
from models import CheckoutRequest
from utils import serialize_doc
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import os

router = APIRouter(prefix="/billing")

# Prices are stored NET (VAT-exclusive). Brutto = net * (1 + VAT_RATE/100), Stripe charges brutto.
PRO_SUBSCRIPTION_AMOUNT = 29.99            # NET €/month (Pro plan)
PRO_SUBSCRIPTION_ANNUAL  = 29.99 * 10     # NET €/year  (2 months free — annual discount)
TOOLKIT_STANDARD_AMOUNT = 14.99            # NET €/month for non-Pro users (Invoice + Tax)
TOOLKIT_PRO_AMOUNT = 9.99                  # NET €/month for Pro plan subscribers (Invoice + Tax)
TAX_TOOLKIT_STANDARD = 14.99               # NET €/month Tax (parity w/ Invoice)
TAX_TOOLKIT_PRO = 9.99
PM_TOOLKIT_STANDARD = 29.99                # NET €/month PM (heavier toolkit)
PM_TOOLKIT_PRO = 19.99
BUNDLE_STANDARD = 39.99                    # All 3 toolkits — saves ~38%
BUNDLE_PRO = 29.99                         # All 3 toolkits — saves ~25%
VAT_RATE = 20                              # Austrian standard rate

# ── Explorer intro plan ─────────────────────────────────────────────────────
# First 3 months: ONLY the Explorer plan is offered to a new pro. €1/month,
# charged €3 upfront for the whole 3-month window, ALL toolkits included.
# After it ends the pro sees the upgrade gate (claim Pro badge OR stay Standard).
EXPLORER_PER_MONTH = 1.0
EXPLORER_MONTHS = 3
EXPLORER_PRICE = 3.0          # gross — €1 × 3 months billed once
EXPLORER_DAYS = 90

# Each toolkit advertises a unique key + the pro_profile flag it activates.
TOOLKITS = {
    "invoice": {"flag": "has_invoice_toolkit", "std": TOOLKIT_STANDARD_AMOUNT, "pro": TOOLKIT_PRO_AMOUNT},
    "tax":     {"flag": "has_tax_toolkit",     "std": TAX_TOOLKIT_STANDARD,    "pro": TAX_TOOLKIT_PRO},
    "pm":      {"flag": "has_pm_toolkit",      "std": PM_TOOLKIT_STANDARD,     "pro": PM_TOOLKIT_PRO},
}

def _brutto(net: float) -> float:
    return round(net * (1.0 + VAT_RATE / 100.0), 2)


def _tz(dt):
    if dt and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def billing_mode(pro: dict | None, explorer_enabled: bool = True) -> dict:
    """Single source of truth for which Billing UI a pro should see.

    modes:
      explorer_offer  — new pro, within first 3 months, Explorer live, not yet activated
      explorer_active — Explorer plan currently running (all toolkits unlocked)
      pro             — paid Pro subscriber
      choose_plan     — Explorer turned OFF by admin → new pro picks Standard or Pro
      gate            — Explorer ended / window passed → choose Pro or stay Standard
      standard        — pro explicitly chose / dismissed to stay on Standard
    """
    now = datetime.now(timezone.utc)
    if not pro:
        return {"mode": "gate", "explorer_active": False, "explorer_days_remaining": None,
                "explorer_ends_at": None, "explorer_used": False, "explorer_gate_dismissed": False}
    plan = pro.get("plan_tier", "standard")
    ends = _tz(pro.get("explorer_ends_at"))
    created = _tz(pro.get("created_at"))
    explorer_used = bool(pro.get("explorer_used"))
    gate_dismissed = bool(pro.get("explorer_gate_dismissed"))
    explorer_active = plan == "explorer" and bool(ends) and ends > now
    explorer_days = (ends - now).days if (explorer_active and ends) else None
    within_window = bool(created and (created + timedelta(days=EXPLORER_DAYS)) > now)

    if explorer_active:
        mode = "explorer_active"
    elif plan == "pro":
        mode = "pro"
    elif gate_dismissed:
        # Pro explicitly chose to stay on Standard
        mode = "standard"
    elif (not explorer_used) and explorer_enabled and within_window:
        mode = "explorer_offer"
    elif (not explorer_used) and (not explorer_enabled):
        # Admin disabled the Explorer intro → new pro picks Standard or Pro directly
        mode = "choose_plan"
    else:
        mode = "gate"

    return {
        "mode": mode,
        "explorer_active": explorer_active,
        "explorer_days_remaining": explorer_days,
        "explorer_started_at": _tz(pro.get("explorer_started_at")).isoformat() if pro.get("explorer_started_at") else None,
        "explorer_ends_at": ends.isoformat() if ends else None,
        "explorer_used": explorer_used,
        "explorer_gate_dismissed": gate_dismissed,
    }


def _toolkit_pricing(kind: str, is_pro: bool, pro_profile: dict | None) -> dict:
    cfg = TOOLKITS[kind]
    net = cfg["pro"] if is_pro else cfg["std"]
    return {
        "key": kind,
        "net": net,
        "brutto": _brutto(net),
        "is_pro_price": is_pro,
        "standard_net": cfg["std"],
        "pro_net": cfg["pro"],
        "active": bool((pro_profile or {}).get(cfg["flag"])),
    }


@router.get("/pricing")
async def get_pricing(user: dict = Depends(get_current_user)):
    """Returns NET + BRUTTO prices for Pro and all 3 Toolkits + the all-in-one Bundle."""
    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]}) if user.get("role") == "tradesperson" else None
    is_pro = (pro_profile or {}).get("plan_tier") == "pro"
    bundle_net = BUNDLE_PRO if is_pro else BUNDLE_STANDARD
    invoice_pricing = _toolkit_pricing("invoice", is_pro, pro_profile)
    tax_pricing = _toolkit_pricing("tax", is_pro, pro_profile)
    pm_pricing = _toolkit_pricing("pm", is_pro, pro_profile)
    has_all = invoice_pricing["active"] and tax_pricing["active"] and pm_pricing["active"]
    has_bundle = bool((pro_profile or {}).get("has_bundle"))
    from services.platform_settings import explorer_enabled as _expl_on
    mode_info = billing_mode(pro_profile, await _expl_on())
    return {
        "vat_rate": VAT_RATE,
        "pro": {
            "net": PRO_SUBSCRIPTION_AMOUNT,
            "brutto": _brutto(PRO_SUBSCRIPTION_AMOUNT),
        },
        "explorer": {
            "per_month": EXPLORER_PER_MONTH,
            "months": EXPLORER_MONTHS,
            "total": EXPLORER_PRICE,
            "active": mode_info["explorer_active"],
            "days_remaining": mode_info["explorer_days_remaining"],
        },
        "billing_mode": mode_info["mode"],
        # legacy field — kept so existing BillingPage code keeps working
        "toolkit": invoice_pricing,
        "toolkits": {
            "invoice": invoice_pricing,
            "tax": tax_pricing,
            "pm": pm_pricing,
        },
        "bundle": {
            "net": bundle_net,
            "brutto": _brutto(bundle_net),
            "is_pro_price": is_pro,
            "standard_net": BUNDLE_STANDARD,
            "pro_net": BUNDLE_PRO,
            "active": has_bundle,
            # Cumulative MRR if bought à-la-carte — used by frontend for savings hint
            "alacarte_net": round(invoice_pricing["net"] + tax_pricing["net"] + pm_pricing["net"], 2),
        },
        "is_pro": is_pro,
        # Back-compat: existing code reads `has_toolkit` for the invoice toolkit
        "has_toolkit": invoice_pricing["active"],
    }


@router.post("/checkout/subscription")
async def create_subscription_checkout(
    data: CheckoutRequest,
    user: dict = Depends(get_current_user),
    billing_period: str = "monthly",
):
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros can subscribe")
    if billing_period not in ("monthly", "annual"):
        raise HTTPException(status_code=400, detail="billing_period must be 'monthly' or 'annual'")

    # Double-click guard: reject if a pending checkout for this user was created < 60s ago
    sixty_sec_ago = datetime.now(timezone.utc) - timedelta(seconds=60)
    recent = await db.payment_transactions.find_one({
        "user_id": user["_id"],
        "payment_status": "unpaid",
        "metadata.type": "subscription",
        "created_at": {"$gt": sixty_sec_ago},
    })
    if recent:
        return {"url": None, "session_id": recent["session_id"], "reuse": True}

    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest

    api_key = os.environ.get("STRIPE_API_KEY")
    origin = data.origin_url.rstrip("/")
    success_url = f"{origin}/billing?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/billing"

    net = PRO_SUBSCRIPTION_ANNUAL if billing_period == "annual" else PRO_SUBSCRIPTION_AMOUNT
    brutto = _brutto(net)

    stripe_checkout = StripeCheckout(
        api_key=api_key,
        webhook_url=f"{origin}/api/webhook/stripe",
        webhook_secret=os.environ.get("STRIPE_WEBHOOK_SECRET") or None,
    )

    checkout_req = CheckoutSessionRequest(
        amount=brutto,
        currency="eur",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["_id"],
            "plan": "pro",
            "type": "subscription",
            "billing_period": billing_period,
        }
    )

    session = await stripe_checkout.create_checkout_session(checkout_req)

    await db.payment_transactions.update_one(
        {"session_id": session.session_id},
        {"$setOnInsert": {
            "user_id": user["_id"],
            "session_id": session.session_id,
            "amount": brutto,
            "net_amount": net,
            "vat_rate": VAT_RATE,
            "currency": "eur",
            "status": "pending",
            "payment_status": "unpaid",
            "metadata": {"plan": "pro", "type": "subscription", "billing_period": billing_period},
            "created_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )

    return {"url": session.url, "session_id": session.session_id}


@router.post("/checkout/explorer")
async def create_explorer_checkout(data: CheckoutRequest, user: dict = Depends(get_current_user)):
    """Stripe checkout for the €3 Explorer intro plan (3 months, all toolkits)."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros can subscribe")
    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    from services.platform_settings import explorer_enabled as _expl_on
    if billing_mode(pro_profile, await _expl_on())["mode"] != "explorer_offer":
        raise HTTPException(status_code=400, detail="The Explorer plan is no longer available for your account")

    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    api_key = os.environ.get("STRIPE_API_KEY")
    origin = data.origin_url.rstrip("/")
    success_url = f"{origin}/billing?session_id={{CHECKOUT_SESSION_ID}}&explorer=1"
    cancel_url = f"{origin}/billing"

    stripe_checkout = StripeCheckout(
        api_key=api_key,
        webhook_url=f"{origin}/api/webhook/stripe",
        webhook_secret=os.environ.get("STRIPE_WEBHOOK_SECRET") or None,
    )
    checkout_req = CheckoutSessionRequest(
        amount=EXPLORER_PRICE,
        currency="eur",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": user["_id"], "type": "explorer", "plan": "explorer"},
    )
    session = await stripe_checkout.create_checkout_session(checkout_req)
    await db.payment_transactions.update_one(
        {"session_id": session.session_id},
        {"$setOnInsert": {
            "user_id": user["_id"],
            "session_id": session.session_id,
            "amount": EXPLORER_PRICE,
            "net_amount": EXPLORER_PRICE,
            "vat_rate": 0,
            "currency": "eur",
            "status": "pending",
            "payment_status": "unpaid",
            "metadata": {"type": "explorer", "plan": "explorer"},
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {"url": session.url, "session_id": session.session_id, "amount": EXPLORER_PRICE}


@router.post("/explorer/simulate-expiry")
async def simulate_explorer_expiry(user: dict = Depends(get_current_user)):
    """TEST HELPER: instantly end the caller's Explorer plan to preview the upgrade gate."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    if pro.get("plan_tier") != "explorer":
        raise HTTPException(status_code=400, detail="No active Explorer plan to expire")
    from services.billing_service import _downgrade_explorer
    await _downgrade_explorer(pro, datetime.now(timezone.utc))
    return {"message": "Explorer plan expired. The upgrade gate is now active.", "mode": "gate"}


@router.post("/explorer/simulate-reset")
async def simulate_explorer_reset(user: dict = Depends(get_current_user)):
    """TEST HELPER: reset the caller back to the fresh Explorer offer state."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    now = datetime.now(timezone.utc)
    await db.pro_profiles.update_one(
        {"_id": pro["_id"]},
        {
            "$set": {
                "plan_tier": "standard",
                "monthly_fees": 0.0,
                "has_invoice_toolkit": False,
                "has_tax_toolkit": False,
                "has_pm_toolkit": False,
                "has_bundle": False,
                "created_at": now,
            },
            "$unset": {
                "explorer_started_at": "", "explorer_ends_at": "", "explorer_used": "",
                "explorer_expired_at": "", "explorer_gate_dismissed": "",
            },
        },
    )
    return {"message": "Reset to the Explorer offer state.", "mode": "explorer_offer"}


@router.post("/explorer/choose-standard")
async def explorer_choose_standard(user: dict = Depends(get_current_user)):
    """Pro chose to stay on the free Standard plan at the upgrade gate."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    await db.pro_profiles.update_one(
        {"_id": pro["_id"]},
        {"$set": {"plan_tier": "standard", "explorer_gate_dismissed": True}},
    )
    return {"message": "You're on the Standard plan. You can upgrade to Pro anytime."}


@router.post("/checkout/toolkit")
async def create_toolkit_checkout(data: CheckoutRequest, user: dict = Depends(get_current_user), kind: str = "invoice"):
    """Stripe checkout for any single Toolkit add-on (invoice / tax / pm).
    Net price depends on Pro-plan tier; Stripe charges brutto (NET × 1.20).
    Defaults to 'invoice' for back-compat with the original button."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros can subscribe to the toolkit")
    if kind not in TOOLKITS:
        raise HTTPException(status_code=400, detail=f"Unknown toolkit '{kind}'")

    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=404, detail="Pro profile not found")

    cfg = TOOLKITS[kind]
    if pro_profile.get(cfg["flag"]):
        raise HTTPException(status_code=400, detail=f"{kind.title()} Toolkit is already active")

    is_pro = pro_profile.get("plan_tier") == "pro"
    net = cfg["pro"] if is_pro else cfg["std"]
    brutto = _brutto(net)

    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    api_key = os.environ.get("STRIPE_API_KEY")
    origin = data.origin_url.rstrip("/")
    success_url = f"{origin}/billing?session_id={{CHECKOUT_SESSION_ID}}&toolkit={kind}"
    cancel_url = f"{origin}/billing"

    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=f"{origin}/api/webhook/stripe")
    checkout_req = CheckoutSessionRequest(
        amount=brutto, currency="eur",
        success_url=success_url, cancel_url=cancel_url,
        metadata={
            "user_id": user["_id"],
            "type": "toolkit",
            "toolkit_kind": kind,
            "tier_at_purchase": "pro" if is_pro else "standard",
        },
    )
    session = await stripe_checkout.create_checkout_session(checkout_req)

    await db.payment_transactions.update_one(
        {"session_id": session.session_id},
        {"$setOnInsert": {
            "user_id": user["_id"],
            "session_id": session.session_id,
            "amount": brutto,
            "net_amount": net,
            "vat_rate": VAT_RATE,
            "currency": "eur",
            "status": "pending",
            "payment_status": "unpaid",
            "metadata": {
                "type": "toolkit",
                "toolkit_kind": kind,
                "tier_at_purchase": "pro" if is_pro else "standard",
            },
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {"url": session.url, "session_id": session.session_id, "net": net, "brutto": brutto}


@router.post("/checkout/bundle")
async def create_bundle_checkout(data: CheckoutRequest, user: dict = Depends(get_current_user)):
    """Stripe checkout for the all-in-one Bundle (Invoice + Tax + PM toolkits).
    Activates all 3 has_*_toolkit flags on payment confirmation."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros can subscribe")
    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    is_pro = pro_profile.get("plan_tier") == "pro"
    net = BUNDLE_PRO if is_pro else BUNDLE_STANDARD
    brutto = _brutto(net)

    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    api_key = os.environ.get("STRIPE_API_KEY")
    origin = data.origin_url.rstrip("/")
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=f"{origin}/api/webhook/stripe")
    checkout_req = CheckoutSessionRequest(
        amount=brutto, currency="eur",
        success_url=f"{origin}/billing?session_id={{CHECKOUT_SESSION_ID}}&bundle=1",
        cancel_url=f"{origin}/billing",
        metadata={"user_id": user["_id"], "type": "bundle", "tier_at_purchase": "pro" if is_pro else "standard"},
    )
    session = await stripe_checkout.create_checkout_session(checkout_req)
    await db.payment_transactions.update_one(
        {"session_id": session.session_id},
        {"$setOnInsert": {
            "user_id": user["_id"], "session_id": session.session_id,
            "amount": brutto, "net_amount": net, "vat_rate": VAT_RATE,
            "currency": "eur", "status": "pending", "payment_status": "unpaid",
            "metadata": {"type": "bundle", "tier_at_purchase": "pro" if is_pro else "standard"},
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {"url": session.url, "session_id": session.session_id, "net": net, "brutto": brutto}




@router.get("/checkout/status/{session_id}")
async def get_checkout_status(session_id: str, user: dict = Depends(get_current_user)):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    from services.billing_service import process_paid_session

    api_key = os.environ.get("STRIPE_API_KEY")
    origin = os.environ.get("FRONTEND_URL", "http://localhost:3000")

    stripe_checkout = StripeCheckout(
        api_key=api_key,
        webhook_url=f"{origin}/api/webhook/stripe",
        webhook_secret=os.environ.get("STRIPE_WEBHOOK_SECRET") or None,
    )

    status = await stripe_checkout.get_checkout_status(session_id)

    # Update raw status on transaction record
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": status.status,
            "payment_status": status.payment_status,
            "updated_at": datetime.now(timezone.utc)
        }}
    )

    # Delegate full activation logic to the shared service
    if status.payment_status == "paid" and status.status == "complete":
        await process_paid_session(session_id, status.payment_status)

    return {
        "payment_status": status.payment_status,
        "status": status.status,
        "amount": status.amount_total
    }


@router.post("/downgrade")
async def downgrade_to_standard(user: dict = Depends(get_current_user)):
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros can change plan")

    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=404, detail="Pro profile not found")

    await db.pro_profiles.update_one(
        {"_id": pro_profile["_id"]},
        {"$set": {"plan_tier": "standard"}}
    )
    return {"message": "Downgraded to standard plan"}


@router.get("/subscription-status")
async def get_subscription_status(user: dict = Depends(get_current_user)):
    """Returns full subscription metadata for the BillingPage."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Pros only")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]}, {"_id": 0})
    if not pro:
        return {"plan_tier": "standard", "billing_mode": "gate"}

    now = datetime.now(timezone.utc)

    def _tz(dt):
        if dt and dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt

    valid_until = _tz(pro.get("sub_valid_until"))
    cancels_at  = _tz(pro.get("sub_cancels_at"))
    trial_ends  = _tz(pro.get("trial_ends_at"))

    days_remaining     = (valid_until - now).days if valid_until and valid_until > now else None
    trial_active       = bool(trial_ends and trial_ends > now)
    trial_days_rem     = (trial_ends - now).days if trial_active and trial_ends else None

    from services.platform_settings import explorer_enabled as _expl_on
    mode_info = billing_mode(pro, await _expl_on())

    return {
        "plan_tier":          pro.get("plan_tier", "standard"),
        "billing_mode":       mode_info["mode"],
        "explorer_active":    mode_info["explorer_active"],
        "explorer_days_remaining": mode_info["explorer_days_remaining"],
        "explorer_started_at": mode_info["explorer_started_at"],
        "explorer_ends_at":   mode_info["explorer_ends_at"],
        "explorer_used":      mode_info["explorer_used"],
        "explorer_gate_dismissed": mode_info["explorer_gate_dismissed"],
        "has_invoice_toolkit": bool(pro.get("has_invoice_toolkit")),
        "has_tax_toolkit": bool(pro.get("has_tax_toolkit")),
        "has_pm_toolkit": bool(pro.get("has_pm_toolkit")),
        "has_bundle": bool(pro.get("has_bundle")),
        "sub_valid_until":    valid_until.isoformat() if valid_until else None,
        "sub_cancels_at":     cancels_at.isoformat() if cancels_at else None,
        "sub_billing_period": pro.get("sub_billing_period", "monthly"),
        "sub_started_at":     _tz(pro.get("sub_started_at")).isoformat() if pro.get("sub_started_at") else None,
        "trial_ends_at":      trial_ends.isoformat() if trial_ends else None,
        "trial_active":       trial_active,
        "trial_days_remaining": trial_days_rem,
        "days_remaining":     days_remaining,
        "has_stripe_customer": bool(pro.get("stripe_customer_id")),
    }


@router.get("/transactions")
async def get_transactions(user: dict = Depends(get_current_user)):
    from services.billing_service import transaction_label
    txns = await db.payment_transactions.find(
        {"user_id": user["_id"]}
    ).sort("created_at", -1).to_list(30)
    result = []
    for t in txns:
        doc = serialize_doc(t)
        doc["display_label"] = transaction_label(t)
        result.append(doc)
    return {"transactions": result}


@router.post("/cancel-subscription")
async def cancel_subscription(user: dict = Depends(get_current_user)):
    """Self-serve Pro plan cancellation — access continues until end of paid period."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros can change plan")

    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    if pro_profile.get("plan_tier") != "pro":
        raise HTTPException(status_code=400, detail="Not on Pro plan")

    now = datetime.now(timezone.utc)
    valid_until = pro_profile.get("sub_valid_until")
    if valid_until and valid_until.tzinfo is None:
        valid_until = valid_until.replace(tzinfo=timezone.utc)

    if not valid_until or valid_until <= now:
        await db.pro_profiles.update_one(
            {"_id": pro_profile["_id"]},
            {"$set": {"plan_tier": "standard", "sub_cancelled_at": now}}
        )
        return {"message": "Subscription cancelled. You are now on Standard plan.", "cancels_immediately": True}

    await db.pro_profiles.update_one(
        {"_id": pro_profile["_id"]},
        {"$set": {"sub_cancels_at": valid_until, "sub_cancelled_at": now}}
    )
    return {
        "message": f"Subscription ends {valid_until.strftime('%d %b %Y')}. You keep Pro until then.",
        "cancels_at": valid_until.isoformat(),
        "cancels_immediately": False,
    }


@router.post("/undo-cancel-subscription")
async def undo_cancel_subscription(user: dict = Depends(get_current_user)):
    """Reverses an end-of-period cancellation — keeps the Pro plan active."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros can manage subscriptions")

    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    if pro_profile.get("plan_tier") != "pro":
        raise HTTPException(status_code=400, detail="No active Pro subscription to restore")
    if not pro_profile.get("sub_cancels_at"):
        raise HTTPException(status_code=400, detail="Subscription is not scheduled to cancel")

    now = datetime.now(timezone.utc)
    await db.pro_profiles.update_one(
        {"_id": pro_profile["_id"]},
        {"$unset": {"sub_cancels_at": "", "sub_cancelled_at": ""},
         "$set": {"updated_at": now}}
    )
    return {"message": "Cancellation reversed. Your Pro plan will continue as normal."}


@router.post("/trial/start")
async def start_trial(user: dict = Depends(get_current_user)):
    """Start a 14-day Pro trial (once per account, not available if already paid)."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros can start a trial")

    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    if pro_profile.get("trial_ends_at"):
        raise HTTPException(status_code=400, detail="Trial already used")
    if pro_profile.get("sub_started_at") or pro_profile.get("plan_tier") == "pro":
        raise HTTPException(status_code=400, detail="Already subscribed — trial not available")

    trial_ends_at = datetime.now(timezone.utc) + timedelta(days=14)
    await db.pro_profiles.update_one(
        {"_id": pro_profile["_id"]},
        {"$set": {"trial_ends_at": trial_ends_at}}
    )
    return {"trial_ends_at": trial_ends_at.isoformat(), "message": "14-day Pro trial started!"}


@router.post("/customer-portal")
async def customer_portal(data: CheckoutRequest, user: dict = Depends(get_current_user)):
    """Redirect to Stripe Customer Portal for self-service billing management."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Pros only")

    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=404, detail="Pro profile not found")

    stripe_customer_id = pro_profile.get("stripe_customer_id")
    if not stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="No Stripe customer record linked yet. Contact support@servicemarket.eu.",
        )

    import stripe as _stripe
    api_key = os.environ.get("STRIPE_API_KEY", "")
    _stripe.api_key = api_key
    if "sk_test_emergent" in api_key:
        _stripe.api_base = "https://integrations.emergentagent.com/stripe"

    origin = data.origin_url.rstrip("/")
    portal = _stripe.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=f"{origin}/billing",
    )
    return {"url": portal.url}


@router.post("/cancel-toolkit")
async def cancel_toolkit(user: dict = Depends(get_current_user), kind: str = "invoice"):
    """Immediately deactivate a purchased toolkit (invoice / tax / pm)."""
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Only pros can manage toolkits")
    if kind not in TOOLKITS:
        raise HTTPException(status_code=400, detail=f"kind must be one of: {list(TOOLKITS.keys())}")

    pro_profile = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro_profile:
        raise HTTPException(status_code=404, detail="Pro profile not found")

    flag = TOOLKITS[kind]["flag"]
    if not pro_profile.get(flag):
        raise HTTPException(status_code=400, detail=f"{kind} toolkit is not active")

    now = datetime.now(timezone.utc)
    await db.pro_profiles.update_one(
        {"_id": pro_profile["_id"]},
        {"$set": {flag: False, f"{kind}_toolkit_cancelled_at": now}}
    )

    kind_labels = {"invoice": "Invoice", "tax": "Tax", "pm": "Project Management"}
    label = kind_labels.get(kind, kind.title())
    await db.notifications.insert_one({
        "user_id": user["_id"],
        "kind": "toolkit_cancelled",
        "title": f"{label} Toolkit deactivated",
        "body": f"Your {label} Toolkit has been cancelled and access removed.",
        "link_to": "/billing",
        "is_read": False,
        "created_at": now,
    })
    return {"message": f"{label} Toolkit cancelled.", "kind": kind}
