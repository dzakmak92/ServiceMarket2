"""Iteration 7 backend tests:
- GET /api/categories is now public (no auth)
- PATCH /api/profile supports `address` field for homeowners
- GET /api/auth/me returns address after update
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
HOMEOWNER = {"email": "homeowner@test.com", "password": "Test123!"}


@pytest.fixture(scope="module")
def homeowner_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=HOMEOWNER, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


# --- Categories public endpoint ---
class TestCategoriesPublic:
    def test_categories_no_auth(self):
        # Use a fresh client with NO cookies
        r = requests.get(f"{BASE_URL}/api/categories", timeout=15)
        assert r.status_code == 200, f"expected 200 (public), got {r.status_code}: {r.text}"
        data = r.json()
        assert "categories" in data
        assert isinstance(data["categories"], list)
        assert len(data["categories"]) > 0


# --- Profile address field ---
class TestProfileAddress:
    def test_patch_profile_with_address(self, homeowner_session):
        addr = "Kärntner Strasse 1, 1010 Vienna"
        r = homeowner_session.patch(
            f"{BASE_URL}/api/profile",
            json={"address": addr},
            timeout=15,
        )
        assert r.status_code == 200, f"PATCH /profile failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("address") == addr, f"address not in PATCH response: {body}"

    def test_auth_me_returns_address(self, homeowner_session):
        # Ensure PATCH ran first
        addr = "Kärntner Strasse 1, 1010 Vienna"
        homeowner_session.patch(f"{BASE_URL}/api/profile", json={"address": addr}, timeout=15)
        r = homeowner_session.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200, f"/auth/me failed: {r.status_code} {r.text}"
        me = r.json()
        assert me.get("address") == addr, f"address not persisted in /auth/me: {me}"
