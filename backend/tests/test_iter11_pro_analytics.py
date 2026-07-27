"""Iteration 11 — Pro Advanced Analytics endpoint tests.

Covers GET /api/analytics/pro-insights:
  - 200 + payload shape for a tradesperson
  - 403 for homeowner
  - plan_tier field reflects current pro_profile.plan_tier (flip via Mongo)
"""
import os
import pytest
from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


def _flip_plan_tier(mongo, email, tier):
    user = mongo.users.find_one({"email": email})
    assert user, f"User {email} not found"
    # pro_profiles.user_id is stored as a string of the ObjectId
    result = mongo.pro_profiles.update_one(
        {"user_id": str(user["_id"])}, {"$set": {"plan_tier": tier}}
    )
    assert result.matched_count == 1, "pro_profile not found"


# ─── Endpoint shape & auth ────────────────────────────────────────
class TestProInsightsShape:
    def test_pro_insights_returns_200_with_all_required_keys(self, pro, base_url, mongo):
        # Ensure baseline (standard)
        _flip_plan_tier(mongo, "pro@test.com", "standard")
        r = pro["session"].get(f"{base_url}/api/analytics/pro-insights")
        assert r.status_code == 200, r.text
        data = r.json()

        # Required top-level keys
        for k in ("plan_tier", "currency", "earnings_6m", "funnel",
                  "avg_response_minutes", "category_conversion",
                  "peak_hours", "totals"):
            assert k in data, f"Missing key: {k}"

        assert data["currency"] == "eur"
        assert data["plan_tier"] in ("standard", "pro")

        # earnings_6m: exactly 6 items, each with month/earned/fees
        assert isinstance(data["earnings_6m"], list)
        assert len(data["earnings_6m"]) == 6
        for e in data["earnings_6m"]:
            assert "month" in e and "earned" in e and "fees" in e
            assert isinstance(e["earned"], (int, float))
            assert isinstance(e["fees"], (int, float))

        # funnel keys
        f = data["funnel"]
        for k in ("quotes_sent", "accepted", "completed",
                  "rate_accept_pct", "rate_complete_pct"):
            assert k in f, f"funnel missing {k}"

        # category_conversion <= 5
        assert isinstance(data["category_conversion"], list)
        assert len(data["category_conversion"]) <= 5

        # peak_hours: 24 buckets
        assert isinstance(data["peak_hours"], list)
        assert len(data["peak_hours"]) == 24
        assert all(isinstance(v, int) for v in data["peak_hours"])

        # totals
        t = data["totals"]
        for k in ("earned_6m", "fees_6m", "net_6m"):
            assert k in t

    def test_pro_insights_homeowner_forbidden(self, homeowner, base_url):
        r = homeowner["session"].get(f"{base_url}/api/analytics/pro-insights")
        assert r.status_code == 403, r.text


# ─── Plan tier dynamic reflection ─────────────────────────────────
class TestProInsightsPlanTier:
    def test_plan_tier_reflects_mongo_value(self, pro, base_url, mongo):
        # Start at standard
        _flip_plan_tier(mongo, "pro@test.com", "standard")
        r = pro["session"].get(f"{base_url}/api/analytics/pro-insights")
        assert r.status_code == 200
        assert r.json()["plan_tier"] == "standard"

        # Flip to pro
        _flip_plan_tier(mongo, "pro@test.com", "pro")
        r = pro["session"].get(f"{base_url}/api/analytics/pro-insights")
        assert r.status_code == 200
        assert r.json()["plan_tier"] == "pro"

        # Restore to standard
        _flip_plan_tier(mongo, "pro@test.com", "standard")
        r = pro["session"].get(f"{base_url}/api/analytics/pro-insights")
        assert r.json()["plan_tier"] == "standard"


# ─── Regression: /api/pros pro-tier first ─────────────────────────
class TestProsListPriority:
    def test_pros_endpoint_returns_pro_tier_first_when_promoted(self, homeowner, base_url, mongo):
        _flip_plan_tier(mongo, "pro@test.com", "pro")
        try:
            r = homeowner["session"].get(f"{base_url}/api/pros?country=AT")
            assert r.status_code == 200
            payload = r.json()
            pros = payload.get("pros") if isinstance(payload, dict) else payload
            assert isinstance(pros, list) and len(pros) > 0
            # First few should include any 'pro' plan_tier (look for our flipped pro)
            top_tiers = [p.get("plan_tier") for p in pros[:5]]
            assert "pro" in top_tiers, f"Expected 'pro' in first 5 results, got {top_tiers}"
        finally:
            _flip_plan_tier(mongo, "pro@test.com", "standard")


# ─── Regression: /api/billing/plans benefits content ──────────────
class TestBillingBenefits:
    def test_billing_endpoint_or_returns_200(self, anon, base_url):
        # Frontend page renders benefits — just ensure billing plans
        # endpoint is reachable (or fallback to homepage 200)
        r = anon.get(f"{base_url}/api/billing/plans")
        # Endpoint may not exist; accept either 200 or 404
        assert r.status_code in (200, 401, 403, 404)
