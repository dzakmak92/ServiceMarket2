from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
import asyncio

from database import create_indexes
from seed import seed_all
from routes.auth_routes import router as auth_router
from routes.customer_routes import router as customer_router
from routes.job_routes import router as job_router
from routes.invoice_routes import router as invoice_router
from routes.tax_pg_routes import router as tax_pg_router
from routes.upload_routes import (router as upload_router,
                                  portal_router as upload_portal_router)
from routes.pm_pg_routes import (router as pm_pg_router,
                                 timer_router as pm_timer_router,
                                 portal_router as pm_portal_router)
from routes.quote_routes import (router as quote_router,
                                 public_router as portal_router,
                                 invoice_router as quote_invoice_router)
from routes.billing_routes import router as billing_router
from routes.admin_routes import router as admin_router
from routes.admin_invoicing_routes import router as admin_invoicing_router
from routes.admin_advanced_routes import router as admin_advanced_router
from routes.pro_invoicing_routes import router as pro_invoicing_router
from routes.tax_routes import router as tax_router, public_tax_router
from routes.payment_link_routes import router as pay_link_router, public_router as pay_link_public_router
from routes.pm_routes import router as pm_router, public_router as pm_public_router
from routes.admin_insights_routes import router as admin_insights_router
from routes.misc_routes import router as misc_router
from routes.ai_routes import router as ai_router
from routes.push_routes import router as push_router
from routes.analytics_routes import router as analytics_router
from routes.privacy_routes import router as privacy_router, me_router as me_privacy_router, admin_privacy_router
from routes.feedback_routes import router as feedback_router, admin_router as admin_feedback_router, support_admin_router
from routes.iter45_routes import router as iter45_admin_router, pro_router as iter45_pro_router
from routes.live_location_routes import router as live_location_router
from routes.directory_routes import router as directory_router
from routes.payout_routes import router as payout_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ServiceMarket API", version="1.0.0")

# CORS — allow frontend URL + localhost for development
frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
origins = list({frontend_url, "http://localhost:3000", "http://localhost:3001"})

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers under /api prefix.
# IMPORTANT: iter45_pro_router MUST be registered BEFORE pro_invoicing_router because
# both share the `/pro-invoices` prefix. The pro_invoicing_router has a catch-all
# `/{invoice_id}` route that would otherwise swallow `/export.pdf` and 404 it.
for router in [auth_router, customer_router, job_router,
               quote_router, quote_invoice_router, portal_router, invoice_router,
               tax_pg_router, pm_pg_router, pm_timer_router, pm_portal_router,
               upload_router, upload_portal_router,
               billing_router, admin_router, admin_invoicing_router, admin_advanced_router,
               iter45_admin_router, iter45_pro_router,
               pro_invoicing_router, tax_router, public_tax_router, pm_router, pm_public_router,
               admin_insights_router,
               pay_link_router, pay_link_public_router,
               misc_router, ai_router,
               push_router, analytics_router, privacy_router, me_privacy_router,
               admin_privacy_router, feedback_router, admin_feedback_router, support_admin_router,
               live_location_router, directory_router, payout_router]:
    app.include_router(router, prefix="/api")


# ── Stripe webhook — NO auth, processes payment events server-side ──────────
@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request):
    """Dual-track payment confirmation: webhook fires on every payment,
    regardless of whether the browser is still open after Stripe redirect."""
    body = await request.body()
    sig  = request.headers.get("Stripe-Signature", "")
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        api_key        = os.environ.get("STRIPE_API_KEY")
        webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET") or None
        stripe_checkout = StripeCheckout(
            api_key=api_key,
            webhook_url=f"{frontend_url}/api/webhook/stripe",
            webhook_secret=webhook_secret,
        )
        event = await stripe_checkout.handle_webhook(body, sig)
        logger.info(f"Stripe webhook received: {event.event_type} session={event.session_id}")

        # Act on completed payment events
        if event.event_type == "checkout.session.completed" and event.payment_status == "paid":
            from services.billing_service import process_paid_session
            result = await process_paid_session(event.session_id, event.payment_status)
            logger.info(f"Webhook activation: {result}")

        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error"}


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


async def _subscription_expiry_loop():
    """Background task: expire stale Pro plans every 6 hours."""
    await asyncio.sleep(30)  # Brief delay after startup
    while True:
        try:
            from services.billing_service import expire_stale_subscriptions
            count = await expire_stale_subscriptions()
            if count:
                logger.info(f"Subscription expiry loop: downgraded {count} pro(s)")
        except Exception as e:
            logger.error(f"Subscription expiry loop error: {e}")
        await asyncio.sleep(6 * 3600)  # Run every 6 hours


@app.on_event("startup")
async def startup():
    logger.info("Starting ServiceMarket API...")

    # Postgres (Supabase) — the Phase 2 spine. Mongo still serves the routes
    # that have not been ported yet, so both run side by side until the
    # migration completes.
    from db.pg import init_pool
    try:
        await init_pool()
        logger.info("Postgres pool initialised")
    except Exception as exc:
        logger.error("Postgres unavailable: %s", exc)
        if os.environ.get("REQUIRE_POSTGRES", "").lower() in ("1", "true", "yes"):
            raise

    await create_indexes()
    await seed_all()
    # GDPR retention / inactive-user cleanup (hourly)
    from retention import start_retention_scheduler
    start_retention_scheduler()
    # Subscription expiry background loop
    asyncio.create_task(_subscription_expiry_loop())
    logger.info("ServiceMarket API started successfully")


@app.on_event("shutdown")
async def shutdown():
    from db.pg import close_pool
    await close_pool()
    from database import client
    client.close()
