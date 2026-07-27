"""
Clean all test transactional data and reseed with fresh, realistic data
that includes job_numbers, bookings, availability, quotes and messages.
Run once:  cd /app/backend && python reseed_clean.py
"""
import asyncio
import os
import sys
import random
import string
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import motor.motor_asyncio
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME   = os.environ.get("DB_NAME", "servicemarket")
_client   = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
db        = _client[DB_NAME]


# ─── helpers ───────────────────────────────────────────────────────────────
def now():
    return datetime.now(timezone.utc)

def days_ago(n):
    return now() - timedelta(days=n)

def days_ahead(n):
    return now() + timedelta(days=n)

def _generate_job_id():
    """Format: YY-MMR2-R4  e.g. 26-06P5-GYS4"""
    n = now()
    yy = n.strftime("%y")
    mm = n.strftime("%m")
    chars = string.ascii_uppercase + string.digits
    r2 = "".join(random.choices(chars, k=2))
    r4 = "".join(random.choices(chars, k=4))
    return f"{yy}-{mm}{r2}-{r4}"


async def get_next_job_number():
    """Generate a unique job ID, retrying on the rare collision."""
    for _ in range(10):
        jid = _generate_job_id()
        if not await db.jobs.find_one({"job_number": jid}):
            return jid
    raise RuntimeError("Could not generate unique job ID")


# ─── clean ──────────────────────────────────────────────────────────────────
async def clean_test_data():
    print("Cleaning transactional test data…")
    colls = ["jobs", "quotes", "messages", "threads", "bookings",
             "notifications", "pro_invoices", "counters"]
    for c in colls:
        res = await db[c].delete_many({})
        print(f"  {c}: deleted {res.deleted_count}")
    # Reset pro_profiles fees/plan
    await db.pro_profiles.update_many(
        {},
        {"$set": {"monthly_fees": 0.0, "plan_tier": "standard",
                  "has_invoice_toolkit": False, "has_tax_toolkit": False,
                  "has_pm_toolkit": False, "has_bundle": False}}
    )
    print("  pro_profiles: reset plan flags")

import bcrypt
def hash_password(pw): return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


# ─── reseed ─────────────────────────────────────────────────────────────────
async def reseed():
    # ── fetch test accounts ───────────────────────────────────────────────
    ho_user  = await db.users.find_one({"email": "homeowner@test.com"})
    pro_user = await db.users.find_one({"email": "pro@test.com"})

    if not ho_user or not pro_user:
        print("ERROR: test users not found. Run seed.py first.")
        return

    ho_id    = str(ho_user["_id"])
    pro_uid  = str(pro_user["_id"])
    pro_prof = await db.pro_profiles.find_one({"user_id": pro_uid})
    pro_id   = str(pro_prof["_id"])

    print("Seeding fresh data…")

    # ── set pro availability Mon-Fri 08:00-18:00 ──────────────────────────
    days  = ["Mon", "Tue", "Wed", "Thu", "Fri"]
    slots = [f"{h:02d}:00-{h+1:02d}:00" for h in range(8, 18)]
    await db.pro_availability.delete_many({"pro_id": pro_id})
    avail_docs = [
        {"pro_id": pro_id, "day": d, "slot": s, "is_available": True}
        for d in days for s in slots
    ]
    await db.pro_availability.insert_many(avail_docs)
    print(f"  pro_availability: {len(avail_docs)} slots seeded (Mon-Fri 08-18)")

    # ── JOB 1: open — needs plumber (has 1 quote from pro) ──────────────
    jn1 = await get_next_job_number()
    job1_res = await db.jobs.insert_one({
        "job_number": jn1,
        "posted_by_id": ho_id,
        "posted_by_name": "Anna M.",
        "title": "Leaking kitchen tap replacement",
        "category": "plumbing",
        "description": "Kitchen tap has been dripping for 2 weeks. Need a professional plumber to replace it and inspect the pipes underneath the sink.",
        "country": "AT", "city": "Vienna",
        "budget_min": 80, "budget_max": 200,
        "urgency": "medium", "status": "open",
        "accepted_pro_id": None, "final_price": None,
        "quote_count_cache": 1,
        "posted_at": days_ago(3),
    })
    job1_id = str(job1_res.inserted_id)

    # Quote from pro on job1
    q1_res = await db.quotes.insert_one({
        "job_id": job1_id,
        "pro_id": pro_id,
        "pro_user_id": pro_uid,
        "pro_name": "Markus Weber",
        "business_name": "Weber Installations",
        "price": 140.0,
        "message": "Happy to help! I can replace the tap with a high-quality Grohe mixer and check all the connections underneath. Work is fully insured with 2-year guarantee.",
        "status": "pending",
        "created_at": days_ago(2),
    })
    q1_id = str(q1_res.inserted_id)

    # Thread + message for job1/quote1
    thread1_res = await db.threads.insert_one({
        "job_id": job1_id,
        "homeowner_id": ho_id,
        "pro_user_id": pro_uid,
        "other_pro_id": pro_id,
        "last_message_at": days_ago(2),
        "unread_homeowner": 1, "unread_pro": 0,
    })
    t1_id = str(thread1_res.inserted_id)
    await db.messages.insert_many([
        {"job_id": job1_id, "from_id": pro_uid, "to_id": ho_id,
         "message_type": "quote", "quote_id": q1_id,
         "text": "I have submitted a quote of €140 for this job.",
         "read_at": None, "sent_at": days_ago(2).isoformat()},
    ])

    # ── JOB 2: in_progress — accepted quote, has booking ─────────────────
    jn2 = await get_next_job_number()
    job2_res = await db.jobs.insert_one({
        "job_number": jn2,
        "posted_by_id": ho_id,
        "posted_by_name": "Anna M.",
        "title": "Bathroom tiles repair — 3 cracked tiles",
        "category": "tiling",
        "description": "Three tiles in the main bathroom are cracked and need replacing. Same tile series (20x20 white gloss). I have spare tiles available.",
        "country": "AT", "city": "Vienna",
        "budget_min": 100, "budget_max": 300,
        "urgency": "low", "status": "in_progress",
        "accepted_pro_id": pro_id, "final_price": 185.0,
        "quote_count_cache": 1,
        "posted_at": days_ago(7),
    })
    job2_id = str(job2_res.inserted_one.inserted_id) if hasattr(job2_res, 'inserted_one') else str(job2_res.inserted_id)

    q2_res = await db.quotes.insert_one({
        "job_id": job2_id,
        "pro_id": pro_id,
        "pro_user_id": pro_uid,
        "pro_name": "Markus Weber",
        "business_name": "Weber Installations",
        "price": 185.0,
        "message": "I can replace all three tiles in one visit. Materials included in the price.",
        "status": "accepted",
        "created_at": days_ago(6),
    })
    q2_id = str(q2_res.inserted_id)

    # Booking on job2 — upcoming next Monday
    next_mon = now()
    while next_mon.strftime('%a') != 'Mon':
        next_mon += timedelta(days=1)
    booking_date = next_mon.strftime('%Y-%m-%d')

    booking_res = await db.bookings.insert_one({
        "job_id": job2_id,
        "homeowner_id": ho_id,
        "pro_id": pro_id,
        "day": "Mon",
        "date": booking_date,
        "slot": "10:00-11:00",
        "status": "confirmed",
        "created_at": days_ago(5),
    })
    booking_id = str(booking_res.inserted_id)

    thread2_res = await db.threads.insert_one({
        "job_id": job2_id,
        "homeowner_id": ho_id,
        "pro_user_id": pro_uid,
        "other_pro_id": pro_id,
        "last_message_at": days_ago(5),
        "unread_homeowner": 0, "unread_pro": 0,
    })
    t2_id = str(thread2_res.inserted_id)
    await db.messages.insert_many([
        {"job_id": job2_id, "from_id": ho_id, "to_id": pro_uid,
         "message_type": "text",
         "text": "Hi Markus, looking forward to getting this sorted!",
         "read_at": days_ago(5).isoformat(), "sent_at": days_ago(6).isoformat()},
        {"job_id": job2_id, "from_id": pro_uid, "to_id": ho_id,
         "message_type": "booking",
         "text": f"Appointment booked: {booking_date} (Mon), 10:00-11:00",
         "read_at": days_ago(4).isoformat(), "sent_at": days_ago(5).isoformat()},
    ])

    # ── JOB 3: open — electrical, no quotes yet ──────────────────────────
    jn3 = await get_next_job_number()
    await db.jobs.insert_one({
        "job_number": jn3,
        "posted_by_id": ho_id,
        "posted_by_name": "Anna M.",
        "title": "Install 3 new power outlets in home office",
        "category": "electrical",
        "description": "Need 3 additional wall outlets installed in the home office (ground floor). Existing circuit has capacity. Austrian standard Schuko plugs.",
        "country": "AT", "city": "Vienna",
        "budget_min": 150, "budget_max": 400,
        "urgency": "low", "status": "open",
        "listing_type": "task",
        "accepted_pro_id": None, "final_price": None,
        "quote_count_cache": 0,
        "posted_at": days_ago(1),
    })

    # ── JOB 4: completed — painting, pro can invoice ──────────────────────
    jn4 = await get_next_job_number()
    job4_res = await db.jobs.insert_one({
        "job_number": jn4,
        "posted_by_id": ho_id,
        "posted_by_name": "Anna M.",
        "title": "Paint living room walls — 35 m²",
        "category": "painting",
        "description": "Living room repaint. White base + feature wall in light grey. Furniture will be covered. Need primer + 2 coats.",
        "country": "AT", "city": "Vienna",
        "budget_min": 300, "budget_max": 700,
        "urgency": "medium", "status": "completed",
        "listing_type": "task",
        "accepted_pro_id": pro_id, "final_price": 520.0,
        "quote_count_cache": 1,
        "posted_at": days_ago(30),
        "completed_at": days_ago(5),
    })
    job4_id = str(job4_res.inserted_id)
    await db.quotes.insert_one({
        "job_id": job4_id,
        "pro_id": pro_id, "pro_user_id": pro_uid,
        "pro_name": "Markus Weber", "business_name": "Weber Installations",
        "price": 520.0,
        "message": "I can complete the full repaint in 2 days including prep and cleanup.",
        "status": "accepted", "created_at": days_ago(29),
    })

    # ── PROJECT 1: open — full bathroom renovation (project) ──────────────
    jn5 = await get_next_job_number()
    await db.jobs.insert_one({
        "job_number": jn5,
        "posted_by_id": ho_id,
        "posted_by_name": "Anna M.",
        "title": "Full bathroom renovation — gut and replace",
        "category": "tiling",
        "description": (
            "Complete bathroom gut renovation: remove existing tiles, shower, bathtub, and vanity. "
            "Install new walk-in shower (120×80), large-format floor/wall tiles (60×120 slate grey), "
            "new vanity with double basin, heated towel rail. Bathroom is 8m². "
            "Plans available on request. Existing plumbing in good condition."
        ),
        "country": "AT", "city": "Vienna",
        "budget_min": 8000, "budget_max": 15000,
        "urgency": "low", "status": "open",
        "listing_type": "project",
        "timeline_weeks": 4,
        "site_visit_required": True,
        "accepted_pro_id": None, "final_price": None,
        "quote_count_cache": 0,
        "posted_at": days_ago(2),
    })

    # ── PROJECT 2: open — kitchen renovation (project) ────────────────────
    jn6 = await get_next_job_number()
    await db.jobs.insert_one({
        "job_number": jn6,
        "posted_by_id": ho_id,
        "posted_by_name": "Anna M.",
        "title": "Kitchen electrical upgrade + new cabinet installation",
        "category": "electrical",
        "description": (
            "Kitchen electrical upgrade: add 6 new dedicated circuits for appliances (oven, dishwasher, fridge, microwave, hood, coffee machine). "
            "Install under-cabinet LED lighting. Cable routing through existing false ceiling. "
            "Also: install new kitchen cabinets (IKEA-style, customer provides flat packs — labour only). "
            "Kitchen is approx. 14m²."
        ),
        "country": "AT", "city": "Vienna",
        "budget_min": 3500, "budget_max": 6000,
        "urgency": "medium", "status": "open",
        "listing_type": "project",
        "timeline_weeks": 2,
        "site_visit_required": False,
        "accepted_pro_id": None, "final_price": None,
        "quote_count_cache": 0,
        "posted_at": days_ago(1),
    })

    # ── notifications for homeowner ──────────────────────────────────────
    await db.notifications.insert_many([
        {"user_id": ho_id, "title": "New quote received",
         "body": f"Markus Weber submitted a quote for '{jn1} Leaking kitchen tap replacement'",
         "link_to": "/messages", "is_read": False, "created_at": days_ago(2)},
        {"user_id": ho_id, "title": "Appointment confirmed",
         "body": f"Your appointment for {jn2} is confirmed for {booking_date} at 10:00",
         "link_to": "/messages", "is_read": False, "created_at": days_ago(5)},
    ])

    # ── notifications for pro ─────────────────────────────────────────────
    await db.notifications.insert_many([
        {"user_id": pro_uid, "title": "New job posted",
         "body": f"New plumbing job in Vienna: {jn1} – Leaking kitchen tap",
         "link_to": "/browse-jobs", "is_read": False, "created_at": days_ago(3)},
        {"user_id": pro_uid, "title": "Quote accepted!",
         "body": f"Anna M. accepted your quote for {jn2} – Bathroom tiles repair",
         "link_to": "/messages", "is_read": True, "created_at": days_ago(6)},
    ])

    print(f"  jobs: seeded {jn1}, {jn2}, {jn3}, {jn4} (tasks)")
    print(f"  projects: seeded {jn5} (bathroom reno), {jn6} (kitchen upgrade)")
    print(f"  quotes: 3 seeded (1 pending, 1 accepted, 1 completed)")
    print(f"  booking: {booking_date} 10:00-11:00 for {jn2}")
    print(f"  threads+messages: 2 threads created")
    print(f"  notifications: 4 seeded")

    # ── put the test pro on an ACTIVE Explorer intro plan (3-month, all toolkits) ──
    expl_ends = datetime.now(timezone.utc) + timedelta(days=90)
    await db.pro_profiles.update_one(
        {"_id": pro_prof["_id"]},
        {"$set": {
            "plan_tier": "explorer",
            "explorer_started_at": datetime.now(timezone.utc),
            "explorer_ends_at": expl_ends,
            "explorer_used": True,
            "has_invoice_toolkit": True, "has_tax_toolkit": True,
            "has_pm_toolkit": True, "has_bundle": True,
            "invoice_toolkit_valid_until": expl_ends,
            "tax_toolkit_valid_until": expl_ends,
            "pm_toolkit_valid_until": expl_ends,
        },
        "$unset": {"explorer_expired_at": "", "explorer_gate_dismissed": ""}}
    )
    print("  pro@test.com: Explorer plan active (3 months, all toolkits)")

    print("\nDone! Credentials unchanged:")
    print("  homeowner@test.com / Test123!")
    print("  pro@test.com       / Test123!")
    print("  admin@servicemarket.eu / Admin123!")


async def main():
    await clean_test_data()
    await reseed()

if __name__ == "__main__":
    asyncio.run(main())
