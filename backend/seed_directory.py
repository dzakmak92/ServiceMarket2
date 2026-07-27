"""Seed demo businesses into `business_directory` so the Pro Heatmap is populated
before the operator imports their real CSV. Demo rows are tagged source='seed'
and are safe to wipe/re-run; CSV-imported rows (source='csv') are never touched.

Run:  python seed_directory.py
"""
import asyncio
import os
import random
from datetime import datetime, timezone

from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient

# City center coords + how many demo businesses to scatter around each.
CITIES = [
    ("Wien", 48.2082, 16.3738, 16),
    ("Graz", 47.0707, 15.4395, 8),
    ("Linz", 48.3069, 14.2858, 7),
    ("Salzburg", 47.8095, 13.0550, 6),
    ("Innsbruck", 47.2692, 11.4041, 5),
    ("Klagenfurt", 46.6249, 14.3050, 4),
    ("Villach", 46.6111, 13.8558, 3),
    ("Wels", 48.1573, 14.0291, 3),
    ("Sankt Pölten", 48.2047, 15.6256, 3),
    ("Dornbirn", 47.4125, 9.7438, 3),
    ("Bregenz", 47.5066, 9.7471, 2),
    ("Steyr", 48.0394, 14.4231, 2),
    ("Leoben", 47.3833, 15.1000, 2),
]

CATEGORIES = [
    "Plumbing", "Electrical", "Carpentry", "Painting", "Roofing",
    "Gardening", "Cleaning", "Heating", "Masonry", "Tiling", "Locksmith",
]

NAME_A = [
    "Alpen", "Donau", "Stadt", "Meister", "Profi", "Tirol", "Wiener", "Steirer",
    "Berg", "Haus", "Top", "Pro", "Schnell", "Klassik", "Nord", "Süd",
]
NAME_B = {
    "Plumbing": "Installateur", "Electrical": "Elektro", "Carpentry": "Tischlerei",
    "Painting": "Maler", "Roofing": "Dachdecker", "Gardening": "Gärtnerei",
    "Cleaning": "Reinigung", "Heating": "Heizung", "Masonry": "Bau",
    "Tiling": "Fliesen", "Locksmith": "Schlüsseldienst",
}


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    rng = random.Random(42)
    now = datetime.now(timezone.utc)

    # Wipe previous demo rows only.
    res = await db.business_directory.delete_many({"source": "seed"})
    print(f"Removed {res.deleted_count} previous seed rows")

    docs = []
    for city, clat, clng, n in CITIES:
        for _ in range(n):
            cat = rng.choice(CATEGORIES)
            # jitter within ~6km of the city center
            lat = clat + rng.uniform(-0.05, 0.05)
            lng = clng + rng.uniform(-0.07, 0.07)
            name = f"{rng.choice(NAME_A)} {NAME_B[cat]} {rng.choice(['GmbH', 'KG', '& Söhne', 'e.U.'])}"
            docs.append({
                "name": name,
                "category": cat,
                "city": city,
                "postal_code": "",
                "address": "",
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "phone": f"+43 {rng.randint(1, 7)}{rng.randint(100, 999)} {rng.randint(100000, 999999)}",
                "website": "",
                "email": "",
                "source": "seed",
                "claimed": False,
                "has_pending_claim": False,
                "created_at": now,
                "updated_at": now,
            })

    if docs:
        await db.business_directory.insert_many(docs)
    print(f"Inserted {len(docs)} demo businesses across {len(CITIES)} cities")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
