from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
import os

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
fs_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="portfolio")


async def create_indexes():
    await db.users.create_index("email", unique=True)
    await db.jobs.create_index([("country", 1), ("status", 1), ("category", 1)])
    await db.quotes.create_index([("job_id", 1), ("pro_id", 1)], unique=True)
    await db.messages.create_index([("job_id", 1), ("sent_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.saved_pros.create_index([("homeowner_id", 1), ("pro_id", 1)], unique=True)
    await db.pro_availability.create_index([("pro_id", 1), ("day", 1), ("slot", 1)])
    await db.login_attempts.create_index("identifier")
    await db.payment_transactions.create_index("session_id")
    await db.reviews.create_index([("pro_id", 1), ("is_hidden", 1)])
