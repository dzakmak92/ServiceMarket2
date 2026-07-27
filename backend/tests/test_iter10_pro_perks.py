"""Iter10 — Pro-plan perks regression tests:
   - Portfolio cap = 10 for ALL plans (Pro 30-photo perk removed in iter20).
   - GET /api/pros sorts Pro-tier members BEFORE Standard.
"""
import os
import base64 as _b64
import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient


load_dotenv()
BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
_MC = MongoClient(os.environ["MONGO_URL"])
_DB = _MC[os.environ["DB_NAME"]]


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    return s


class TestPortfolioCap:
    def test_cap_is_10_regardless_of_plan(self):
        """Portfolio cap is 10 for both Standard and Pro plans (iter20: 30-photo perk removed)."""
        s = _login("pro@test.com", "Test123!")
        u = _DB.users.find_one({"email": "pro@test.com"})
        # Try with plan_tier='pro' — still capped at 10
        _DB.pro_profiles.update_one({"user_id": str(u["_id"])}, {"$set": {"plan_tier": "pro"}})
        try:
            prof = s.get(f"{BASE}/api/profile/pro", timeout=20).json()
            existing = prof.get("portfolio_photos") or []
            for _ in range(len(existing)):
                s.delete(f"{BASE}/api/profile/pro/portfolio/0", timeout=20)

            tiny = _b64.b64decode(
                "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
                "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh"
                "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR"
                "CAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAA"
                "AAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAM"
                "AwEAAhEDEQA/AKqgAH//2Q=="
            )
            r = s.post(
                f"{BASE}/api/profile/pro/portfolio",
                files={"file": ("t.jpg", tiny, "image/jpeg")},
                data={"caption": "TEST_iter20_cap"},
                timeout=20,
            )
            assert r.status_code == 200, r.text
            assert r.json().get("max") == 10, f"Portfolio cap should be 10, got {r.json().get('max')}"
        finally:
            prof = s.get(f"{BASE}/api/profile/pro", timeout=20).json()
            for _ in range(len(prof.get("portfolio_photos") or [])):
                s.delete(f"{BASE}/api/profile/pro/portfolio/0", timeout=20)
            _DB.pro_profiles.update_one({"user_id": str(u["_id"])}, {"$set": {"plan_tier": "standard"}})


class TestProTierFeaturedSort:
    def test_pros_list_sorts_pro_tier_first(self):
        """Pro-tier pros must appear before Standard in GET /api/pros."""
        homeowner = _login("homeowner@test.com", "Test123!")
        # Flip pro@test.com to 'pro'
        u = _DB.users.find_one({"email": "pro@test.com"})
        _DB.pro_profiles.update_one({"user_id": str(u["_id"])}, {"$set": {"plan_tier": "pro"}})
        try:
            r = homeowner.get(f"{BASE}/api/pros", timeout=20)
            assert r.status_code == 200
            pros = r.json().get("pros", [])
            assert len(pros) >= 1, "Need at least one pro to test"
            # First entry must be pro-tier
            assert pros[0].get("plan_tier") == "pro", f"First entry not pro-tier: {pros[0].get('plan_tier')}"
        finally:
            _DB.pro_profiles.update_one({"user_id": str(u["_id"])}, {"$set": {"plan_tier": "standard"}})
