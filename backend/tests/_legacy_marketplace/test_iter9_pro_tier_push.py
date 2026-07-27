"""Iter9: Verify Pro-tier pros DO receive instant new_job_match within ~2s.
Uses sync pymongo to flip plan_tier=pro, posts job, polls, then resets.
"""
import os
import time
import requests
import pytest
from pymongo import MongoClient

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


def test_pro_tier_instant_push():
    # Load backend env so MONGO_URL/DB_NAME match
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    mc = MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]

    homeowner = _login("homeowner@test.com", "Test123!")
    pro = _login("pro@test.com", "Test123!")
    me = pro.get(f"{BASE}/api/auth/me", timeout=30).json()
    pro_user_id = me.get("id") or me.get("_id")

    db.pro_profiles.update_one({"user_id": pro_user_id}, {"$set": {"plan_tier": "pro"}})
    pro.delete(f"{BASE}/api/notifications", timeout=30)

    try:
        r = homeowner.post(
            f"{BASE}/api/jobs",
            json={
                "title": "TEST_iter9 PRO instant",
                "description": "Pro tier instant push test description padded to satisfy minimum length constraint.",
                "category": "plumbing",
                "country": "AT",
                "city": "Vienna",
                "budget_min": 50,
                "budget_max": 100,
            },
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        job_id = (r.json().get("id") or r.json().get("_id"))

        found = False
        for _ in range(8):
            time.sleep(0.5)
            ns = pro.get(f"{BASE}/api/notifications", timeout=30).json().get("notifications", [])
            if any(n.get("kind") == "new_job_match" and n.get("job_id") == str(job_id) for n in ns):
                found = True
                break
        assert found, "Pro-tier pro did NOT receive instant new_job_match within 4s"
    finally:
        db.pro_profiles.update_one({"user_id": pro_user_id}, {"$set": {"plan_tier": "standard"}})
        mc.close()
