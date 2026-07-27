"""One-off migration: put the test pro (pro@test.com) on an ACTIVE Explorer plan
so the new 3-month intro flow can be demoed immediately.

Run:  python migrate_explorer_testpro.py
"""
import asyncio
import os
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')
from motor.motor_asyncio import AsyncIOMotorClient

EXPLORER_DAYS = 90


async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    pro_user = await db.users.find_one({"email": "pro@test.com"})
    if not pro_user:
        print("pro@test.com not found — nothing to migrate")
        return
    pro = await db.pro_profiles.find_one({"user_id": str(pro_user["_id"])})
    if not pro:
        print("pro profile not found")
        return

    now = datetime.now(timezone.utc)
    ends = now + timedelta(days=EXPLORER_DAYS)
    await db.pro_profiles.update_one(
        {"_id": pro["_id"]},
        {
            "$set": {
                "plan_tier": "explorer",
                "monthly_fees": 0.0,
                "explorer_started_at": now,
                "explorer_ends_at": ends,
                "explorer_used": True,
                "has_invoice_toolkit": True,
                "has_tax_toolkit": True,
                "has_pm_toolkit": True,
                "has_bundle": True,
                "invoice_toolkit_valid_until": ends,
                "tax_toolkit_valid_until": ends,
                "pm_toolkit_valid_until": ends,
            },
            "$unset": {"explorer_expired_at": "", "explorer_gate_dismissed": ""},
        },
    )
    print(f"pro@test.com -> Explorer active until {ends.isoformat()}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
