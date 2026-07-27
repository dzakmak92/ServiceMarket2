"""Pay-now flow for pro invoices — Stripe Checkout with platform-collected
1% service fee. Pro enables a per-invoice public payment link; customer opens
it without an account, sees the breakdown, confirms, and pays via Stripe.

Webhook flow on success automatically records a payment on the invoice
(equal to the invoice amount, NOT including the fee — fee belongs to the
platform). Idempotent: status endpoint checks `payment_transactions` for
prior processing.
"""
from __future__ import annotations
import os
import logging
from datetime import datetime, timezone
from secrets import token_urlsafe
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pay-link")
public_router = APIRouter(prefix="/pay-link/public")

SERVICE_FEE_PCT = 0.01  # 1% platform fee on top of the invoice amount


def _cents(eur: float) -> int:
    """Convert EUR amount to cents (Stripe-friendly integer)."""
    return int(round(eur * 100))


async def _get_pro_invoice_or_404(invoice_id: str, pro_user_id: str) -> dict:
    """Locate a pro's invoice or raise 404."""
    pro = await db.pro_profiles.find_one({"user_id": pro_user_id})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    try:
        inv = await db.pro_invoices.find_one({"_id": ObjectId(invoice_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not inv or inv["pro_id"] != str(pro["_id"]):
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


# ──────────────────────────────────────────────
# Pro endpoints
# ──────────────────────────────────────────────
@router.post("/{invoice_id}/enable")
async def enable_pay_link(invoice_id: str, user: dict = Depends(get_current_user)):
    """Generate (or rotate) a public pay-token for this invoice."""
    inv = await _get_pro_invoice_or_404(invoice_id, user["_id"])
    if inv.get("is_storno") or inv.get("cancelled_by_storno_id"):
        raise HTTPException(status_code=400, detail="Cannot create a pay link for a storno or cancelled invoice.")
    if (inv.get("payment_status") == "paid") or (float(inv.get("outstanding", inv.get("brutto_total", 0))) <= 0):
        raise HTTPException(status_code=400, detail="Invoice is already fully paid.")
    new_token = token_urlsafe(20)
    await db.pro_invoices.update_one(
        {"_id": inv["_id"]},
        {"$set": {
            "pay_link_token": new_token,
            "pay_link_enabled": True,
            "pay_link_created_at": datetime.now(timezone.utc),
        }},
    )
    return {"pay_link_token": new_token, "enabled": True}


@router.post("/{invoice_id}/disable")
async def disable_pay_link(invoice_id: str, user: dict = Depends(get_current_user)):
    inv = await _get_pro_invoice_or_404(invoice_id, user["_id"])
    await db.pro_invoices.update_one(
        {"_id": inv["_id"]},
        {"$set": {"pay_link_enabled": False}},
    )
    return {"enabled": False}


@router.get("/{invoice_id}")
async def get_pay_link_status(invoice_id: str, user: dict = Depends(get_current_user)):
    inv = await _get_pro_invoice_or_404(invoice_id, user["_id"])
    return {
        "enabled": bool(inv.get("pay_link_enabled")),
        "token": inv.get("pay_link_token"),
        "outstanding_eur": float(inv.get("outstanding") or inv.get("brutto_total", 0)),
    }


# ──────────────────────────────────────────────
# Public (customer-facing) endpoints — no auth
# ──────────────────────────────────────────────
@public_router.get("/{token}")
async def public_pay_view(token: str):
    """Customer-facing invoice summary + fee breakdown."""
    inv = await db.pro_invoices.find_one({"pay_link_token": token, "pay_link_enabled": True})
    if not inv:
        raise HTTPException(status_code=404, detail="Payment link expired or revoked")
    if inv.get("is_storno") or inv.get("cancelled_by_storno_id"):
        raise HTTPException(status_code=410, detail="This invoice has been cancelled.")
    outstanding = float(inv.get("outstanding") if inv.get("outstanding") is not None else inv.get("brutto_total", 0))
    if outstanding <= 0:
        raise HTTPException(status_code=410, detail="This invoice is already paid in full.")

    fee = round(outstanding * SERVICE_FEE_PCT, 2)
    total = round(outstanding + fee, 2)

    # Pro snapshot (just name + business for the customer to confirm)
    pro_snap = inv.get("pro_snapshot") or {}

    return {
        "invoice_number": inv.get("invoice_number"),
        "invoice_date": inv.get("invoice_date"),
        "currency": (inv.get("currency") or "eur").upper(),
        "outstanding_eur": outstanding,
        "service_fee_eur": fee,
        "service_fee_pct": SERVICE_FEE_PCT * 100,
        "total_eur": total,
        "customer_name": (inv.get("customer_snapshot") or {}).get("name"),
        "pro": {
            "name": pro_snap.get("business_name") or pro_snap.get("name"),
            "city": pro_snap.get("city"),
        },
        "line_items_count": len(inv.get("line_items") or []),
    }


class PublicCheckoutBody(BaseModel):
    origin_url: str  # frontend URL (used to build success/cancel)


@public_router.post("/{token}/checkout")
async def public_create_checkout(token: str, body: PublicCheckoutBody):
    """Create a Stripe Checkout Session for the OUTSTANDING + 1% fee.

    Customer is redirected to Stripe; on success Stripe redirects back to
    `/pay/{token}/success?session_id={CHECKOUT_SESSION_ID}` which polls
    `/api/pay-link/public/checkout-status/{session_id}` until paid, then we
    record the payment on the invoice.
    """
    inv = await db.pro_invoices.find_one({"pay_link_token": token, "pay_link_enabled": True})
    if not inv:
        raise HTTPException(status_code=404, detail="Payment link expired or revoked")
    if inv.get("is_storno") or inv.get("cancelled_by_storno_id"):
        raise HTTPException(status_code=410, detail="This invoice has been cancelled.")
    outstanding = float(inv.get("outstanding") if inv.get("outstanding") is not None else inv.get("brutto_total", 0))
    if outstanding <= 0:
        raise HTTPException(status_code=410, detail="This invoice is already paid in full.")

    fee = round(outstanding * SERVICE_FEE_PCT, 2)
    total = round(outstanding + fee, 2)
    total_cents = _cents(total)
    if total_cents < 100:  # Stripe minimum charge for EUR is €0.50
        raise HTTPException(status_code=400, detail="Amount too small to charge.")

    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    api_key = os.environ["STRIPE_API_KEY"]
    origin = body.origin_url.rstrip("/")
    success_url = f"{origin}/pay/{token}/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/pay/{token}"

    checkout = StripeCheckout(api_key=api_key, webhook_url=f"{origin}/api/webhook/stripe")
    metadata = {
        "type": "invoice_payment",
        "invoice_id": str(inv["_id"]),
        "invoice_number": inv.get("invoice_number"),
        "pro_id": inv.get("pro_id"),
        "pay_link_token": token,
        "invoice_amount_eur": str(round(outstanding, 2)),
        "service_fee_eur": str(round(fee, 2)),
    }
    req = CheckoutSessionRequest(
        amount=total,
        currency=(inv.get("currency") or "eur"),
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
    )
    session = await checkout.create_checkout_session(req)

    # Record pending transaction for idempotency on the status endpoint
    await db.payment_transactions.update_one(
        {"session_id": session.session_id},
        {"$setOnInsert": {
            "session_id": session.session_id,
            "amount": total,
            "currency": (inv.get("currency") or "eur"),
            "status": "pending",
            "payment_status": "unpaid",
            "metadata": metadata,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {"checkout_url": session.url, "session_id": session.session_id, "total_eur": total}


@public_router.get("/checkout-status/{session_id}")
async def public_checkout_status(session_id: str):
    """Polled by the public success page. On 'paid' status, records the
    invoice payment exactly ONCE (idempotent via payment_transactions doc)."""
    txn = await db.payment_transactions.find_one({"session_id": session_id})
    if not txn:
        raise HTTPException(status_code=404, detail="Unknown checkout session.")
    meta = txn.get("metadata") or {}
    if meta.get("type") != "invoice_payment":
        raise HTTPException(status_code=400, detail="Not an invoice payment session.")

    # Already processed?
    if txn.get("payment_status") == "paid" and txn.get("invoice_payment_recorded"):
        return {"payment_status": "paid", "status": "complete", "already_processed": True}

    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    checkout = StripeCheckout(
        api_key=os.environ["STRIPE_API_KEY"],
        webhook_url="",  # not used by status query
    )
    try:
        status = await checkout.get_checkout_status(session_id)
    except Exception as exc:
        logger.warning("get_checkout_status failed for %s: %s", session_id, exc)
        return {"payment_status": txn.get("payment_status", "unpaid"), "status": txn.get("status", "pending")}

    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": status.status,
            "payment_status": status.payment_status,
            "updated_at": datetime.now(timezone.utc),
        }},
    )

    if status.payment_status == "paid" and status.status == "complete":
        # Record the payment on the invoice ONCE (atomic flag prevents double-recording
        # if the customer refreshes the success page or the webhook also fires later).
        invoice_id = meta.get("invoice_id")
        invoice_amount = float(meta.get("invoice_amount_eur") or 0)
        if invoice_id and invoice_amount > 0:
            res = await db.payment_transactions.update_one(
                {"session_id": session_id, "invoice_payment_recorded": {"$ne": True}},
                {"$set": {"invoice_payment_recorded": True}},
            )
            if res.modified_count == 1:
                # Append payment to the invoice
                await db.pro_invoices.update_one(
                    {"_id": ObjectId(invoice_id)},
                    {"$push": {"payments": {
                        "id": str(ObjectId()),
                        "amount_eur": invoice_amount,
                        "method": "card",
                        "paid_on": datetime.now(timezone.utc),
                        "note": f"Online payment via Stripe ({session_id[-12:]})",
                        "recorded_at": datetime.now(timezone.utc),
                        "stripe_session_id": session_id,
                    }}},
                )
                # Recompute aggregates
                inv = await db.pro_invoices.find_one({"_id": ObjectId(invoice_id)})
                paid_total = round(sum(float(p.get("amount_eur") or 0) for p in (inv.get("payments") or [])), 2)
                brutto = float(inv.get("brutto_total") or 0)
                outstanding = round(max(0.0, brutto - paid_total), 2)
                new_status = "paid" if paid_total + 0.01 >= brutto else ("partial" if paid_total > 0 else "issued")
                await db.pro_invoices.update_one(
                    {"_id": inv["_id"]},
                    {"$set": {
                        "paid_total": paid_total,
                        "outstanding": outstanding,
                        "payment_status": new_status,
                        "fully_paid_at": (datetime.now(timezone.utc) if new_status == "paid" else inv.get("fully_paid_at")),
                        # Auto-disable the link once fully paid so it can't be re-charged
                        "pay_link_enabled": False if new_status == "paid" else inv.get("pay_link_enabled", True),
                    }},
                )
                # Ledger entry for the admin "Payouts owed" tracker: the platform
                # collected the full amount (invoice + 1%); the pro is owed the
                # invoice amount and the platform keeps the fee. Idempotent — runs
                # only inside the modified_count==1 guard (once per session).
                try:
                    fee_eur = round(float(meta.get("service_fee_eur") or 0), 2)
                    await db.pro_payouts.insert_one({
                        "pro_id": inv["pro_id"],
                        "invoice_id": str(inv["_id"]),
                        "invoice_number": inv.get("invoice_number"),
                        "amount_eur": round(invoice_amount, 2),   # owed to the pro
                        "fee_eur": fee_eur,                       # platform 1%
                        "gross_eur": round(invoice_amount + fee_eur, 2),
                        "currency": "eur",
                        "method": "card",
                        "stripe_session_id": session_id,
                        "status": "owed",
                        "paid_at": datetime.now(timezone.utc),
                        "settled_at": None,
                        "settled_by": None,
                        "settled_ref": None,
                    })
                except Exception:
                    logger.exception("Failed to write payout ledger entry")

                # Tell the pro via in-app notification
                try:
                    pro_user_id = (await db.pro_profiles.find_one({"_id": ObjectId(inv["pro_id"])})).get("user_id")
                    await db.notifications.insert_one({
                        "user_id": pro_user_id,
                        "kind": "invoice_payment_received",
                        "title": f"Payment received · {inv['invoice_number']}",
                        "body": f"€{invoice_amount:.2f} paid via card (Stripe). Outstanding now €{outstanding:.2f}.",
                        "link_to": "/my-invoices",
                        "is_read": False,
                        "created_at": datetime.now(timezone.utc),
                    })
                    try:
                        from push import send_push_to_user
                        await send_push_to_user(pro_user_id, {
                            "title": "💰 Payment received",
                            "body": f"{inv['invoice_number']} · €{invoice_amount:.2f}",
                            "url": "/my-invoices",
                            "tag": f"pay-{inv['invoice_number']}",
                        })
                    except Exception:
                        pass
                except Exception:
                    logger.exception("Failed to notify pro of payment")

    return {
        "payment_status": status.payment_status,
        "status": status.status,
        "amount": status.amount_total,
    }
