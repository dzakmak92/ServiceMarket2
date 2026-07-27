import os
from datetime import datetime, timezone
from bson import ObjectId
from database import db
from auth import hash_password


CATEGORIES = [
    {"_id": "plumbing", "name_en": "Plumbing", "name_de": "Sanitär", "name_tr": "Tesisatçılık", "name_es": "Fontanería", "icon": "Droplet", "tile_color": "#e8f4fb", "accent_color": "#4a9ade", "contact_fee": 8.0, "is_active": True},
    {"_id": "electrical", "name_en": "Electrical", "name_de": "Elektrik", "name_tr": "Elektrik", "name_es": "Electricidad", "icon": "Zap", "tile_color": "#fef9e8", "accent_color": "#f59e0b", "contact_fee": 10.0, "is_active": True},
    {"_id": "painting", "name_en": "Painting", "name_de": "Malerei", "name_tr": "Boyacılık", "name_es": "Pintura", "icon": "PaintBucket", "tile_color": "#fde8e8", "accent_color": "#e74c3c", "contact_fee": 6.0, "is_active": True},
    {"_id": "home_cleaning", "name_en": "Home Cleaning", "name_de": "Reinigung", "name_tr": "Ev Temizliği", "name_es": "Limpieza del Hogar", "icon": "Sparkles", "tile_color": "#e8f8f0", "accent_color": "#2ecc71", "contact_fee": 4.0, "is_active": True},
    {"_id": "handyman", "name_en": "Handyman", "name_de": "Handwerker", "name_tr": "Tamirci", "name_es": "Manitas", "icon": "Hammer", "tile_color": "#f0e8fe", "accent_color": "#8b5cf6", "contact_fee": 6.0, "is_active": True},
    {"_id": "gardening", "name_en": "Gardening", "name_de": "Gartenarbeit", "name_tr": "Bahçe", "name_es": "Jardinería", "icon": "Leaf", "tile_color": "#e8f8e8", "accent_color": "#16a34a", "contact_fee": 5.0, "is_active": True},
    {"_id": "carpentry", "name_en": "Carpentry", "name_de": "Tischlerei", "name_tr": "Marangozluk", "name_es": "Carpintería", "icon": "TreePine", "tile_color": "#fef0e8", "accent_color": "#92400e", "contact_fee": 8.0, "is_active": True},
    {"_id": "hvac", "name_en": "HVAC", "name_de": "Heizung & Klima", "name_tr": "Isıtma & Klima", "name_es": "Climatización", "icon": "Wind", "tile_color": "#e8f4fb", "accent_color": "#0ea5e9", "contact_fee": 10.0, "is_active": True},
    {"_id": "moving", "name_en": "Moving", "name_de": "Umzug", "name_tr": "Taşımacılık", "name_es": "Mudanzas", "icon": "Package", "tile_color": "#fef8e8", "accent_color": "#f59e0b", "contact_fee": 6.0, "is_active": True},
    {"_id": "pest_control", "name_en": "Pest Control", "name_de": "Schädlingsbekämpfung", "name_tr": "Haşere Kontrol", "name_es": "Control de Plagas", "icon": "Bug", "tile_color": "#fee8e8", "accent_color": "#dc2626", "contact_fee": 8.0, "is_active": True},
    {"_id": "locksmith", "name_en": "Locksmith", "name_de": "Schlüsseldienst", "name_tr": "Çilingir", "name_es": "Cerrajería", "icon": "KeyRound", "tile_color": "#f0e8fe", "accent_color": "#7c3aed", "contact_fee": 8.0, "is_active": True},
    {"_id": "appliance_repair", "name_en": "Appliance Repair", "name_de": "Gerätereparatur", "name_tr": "Cihaz Tamiri", "name_es": "Reparación de Electrodomésticos", "icon": "Settings2", "tile_color": "#f4f4f4", "accent_color": "#6b7280", "contact_fee": 8.0, "is_active": True},
    {"_id": "tiling", "name_en": "Tiling", "name_de": "Fliesenleger", "name_tr": "Fayans", "name_es": "Alicatado", "icon": "Grid3x3", "tile_color": "#e8f4fb", "accent_color": "#0891b2", "contact_fee": 8.0, "is_active": True},
    {"_id": "flooring", "name_en": "Flooring", "name_de": "Bodenbelag", "name_tr": "Zemin Kaplama", "name_es": "Suelos", "icon": "Layers", "tile_color": "#fef0e8", "accent_color": "#a16207", "contact_fee": 8.0, "is_active": True},
]


async def seed_categories():
    for cat in CATEGORIES:
        await db.categories.update_one({"_id": cat["_id"]}, {"$setOnInsert": cat}, upsert=True)


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@servicemarket.eu")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "country": "AT",
            "lang": "en",
            "onboarding_complete": True,
            "is_email_verified": True,
            "created_at": datetime.now(timezone.utc)
        })
    elif not verify_password_safe(admin_password, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )


def verify_password_safe(plain, hashed):
    try:
        import bcrypt
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


async def seed_test_users():
    """Seed the development test pro."""
    test_pro_email = "pro@test.com"
    # Keep the test pro's badges correct on every re-run. Per the Explorer intro
    # plan, pro@test.com is pre-seeded as Explorer-ACTIVE (3-month, all toolkits)
    # so the new billing flow can be demoed/tested without going through Stripe.
    # NOTE: plan_tier is set with $setOnInsert-style guard logic below so a manual
    # migration or a real upgrade is NOT clobbered on hot-reload.
    existing_pro_user = await db.users.find_one({"email": test_pro_email})
    if existing_pro_user:
        from datetime import timedelta
        _expl_ends = datetime.now(timezone.utc) + timedelta(days=90)
        _pp = await db.pro_profiles.find_one({"user_id": str(existing_pro_user["_id"])})
        _set = {"is_verified": True, "is_licensed": True, "is_insured": True}
        # Only (re)establish the Explorer pre-seed when the pro is NOT already on a
        # real paid Pro plan (so we never downgrade a genuine upgrade). Standard or
        # an existing Explorer both get refreshed to a clean Explorer-active state.
        if not _pp or _pp.get("plan_tier") != "pro":
            _set.update({
                "plan_tier": "explorer",
                "explorer_started_at": datetime.now(timezone.utc),
                "explorer_ends_at": _expl_ends,
                "explorer_used": True,
                "has_invoice_toolkit": True,
                "has_tax_toolkit": True,
                "has_pm_toolkit": True,
                "has_bundle": True,
                "invoice_toolkit_valid_until": _expl_ends,
                "tax_toolkit_valid_until": _expl_ends,
                "pm_toolkit_valid_until": _expl_ends,
            })
        await db.pro_profiles.update_one(
            {"user_id": str(existing_pro_user["_id"])},
            {"$set": _set,
             "$unset": {"explorer_expired_at": "", "explorer_gate_dismissed": ""}},
        )
    if not existing_pro_user:
        pro_result = await db.users.insert_one({
            "email": test_pro_email,
            "password_hash": hash_password("Test123!"),
            "name": "Markus Weber",
            "role": "tradesperson",
            "country": "AT",
            "lang": "en",
            "city": "Vienna",
            "phone": "+436608765432",
            "onboarding_complete": True,
            "is_email_verified": True,
            "notif_email": True,
            "notif_sms": False,
            "created_at": datetime.now(timezone.utc)
        })
        pro_user_id = str(pro_result.inserted_id)

        # Create pro profile
        await db.pro_profiles.insert_one({
            "user_id": pro_user_id,
            "business_name": "Weber Installations",
            "tagline": "Quality plumbing since 2005",
            "description": "Professional plumber with 18 years of experience. I specialize in tap replacements, pipe repairs, bathroom installations, and emergency plumbing. All work is fully insured and comes with a 2-year guarantee.",
            "hourly_rate": 65,
            "years_experience": 18,
            "service_categories": ["plumbing", "hvac"],
            "service_areas": ["Vienna 1010", "Vienna 1020", "Vienna 1030"],
            "portfolio_photos": [],
            "is_verified": True,
            "is_licensed": True,
            "is_insured": True,
            "plan_tier": "standard",
            "card_last4": "4242",
            "monthly_fees": 0.0,
            "rating_avg": 4.8,
            "reviews_count": 12,
            "completed_jobs_count": 47,
            "response_time_minutes": 45,
            "created_at": datetime.now(timezone.utc)
        })

        # Seed pro availability — 1-hour slots from 08:00 to 20:00, Mon-Fri all on
        days = ["Mon", "Tue", "Wed", "Thu", "Fri"]
        slots = [f"{h:02d}:00-{h+1:02d}:00" for h in range(8, 20)]  # 12 1-hour slots
        pro_profile = await db.pro_profiles.find_one({"user_id": pro_user_id})
        if pro_profile:
            pro_id = str(pro_profile["_id"])
            for day in days:
                for slot in slots:
                    await db.pro_availability.update_one(
                        {"pro_id": pro_id, "day": day, "slot": slot},
                        {"$setOnInsert": {"pro_id": pro_id, "day": day, "slot": slot, "is_available": True}},
                        upsert=True
                    )


async def migrate_legacy_slots():
    """Expand legacy 3-hour pro_availability slots (e.g. '09:00-12:00') into
    individual 1-hour rows ('09:00-10:00', '10:00-11:00', '11:00-12:00').
    Idempotent: bails out once no legacy docs remain.
    """
    import re
    SLOT_RE = re.compile(r"^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$")

    legacy_docs = await db.pro_availability.find({}).to_list(5000)
    expanded = 0
    for doc in legacy_docs:
        m = SLOT_RE.match(doc.get("slot") or "")
        if not m:
            continue
        sh, sm, eh, em = int(m[1]), int(m[2]), int(m[3]), int(m[4])
        # Only expand if span > 1 hour (>= 120 minutes)
        if (eh * 60 + em) - (sh * 60 + sm) <= 60:
            continue
        # Build the new 1-hour rows
        new_rows = []
        cur = sh
        while cur < eh:
            new_rows.append({
                "pro_id": doc["pro_id"],
                "day": doc["day"],
                "slot": f"{cur:02d}:00-{cur+1:02d}:00",
                "is_available": doc.get("is_available", True),
            })
            cur += 1
        # Insert new rows (skip if already exist) + remove the old multi-hour row
        for row in new_rows:
            await db.pro_availability.update_one(
                {"pro_id": row["pro_id"], "day": row["day"], "slot": row["slot"]},
                {"$setOnInsert": row},
                upsert=True,
            )
        await db.pro_availability.delete_one({"_id": doc["_id"]})
        expanded += 1
    return expanded


async def seed_all():
    await seed_categories()
    await seed_admin()
    await seed_test_users()
    await migrate_legacy_slots()

    # Write test credentials
    import os
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@servicemarket.eu")
        admin_pw = os.environ.get("ADMIN_PASSWORD", "Admin123!")
        f.write(f"""# ServiceMarket Test Credentials

## Admin Account
- Email: {admin_email}
- Password: {admin_pw}
- Role: admin

## Test Pro (Tradesperson)
- Email: pro@test.com
- Password: Test123!
- Role: tradesperson
- Country: AT

## Auth Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/refresh
""")
