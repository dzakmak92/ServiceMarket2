"""
Backend tests for live location routes - iteration 53
Tests: POST, GET, PATCH, DELETE /api/live-location
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

PRO_EMAIL = "pro@test.com"
PRO_PASS = "Test123!"
HO_EMAIL = "homeowner@test.com"
HO_PASS = "Test123!"
JOB_ID = "6a21e8ecece82e6c4e9deabc"
EXISTING_SESSION = "6a234a8a5e2e75929be54492"


def get_session(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return s
    return None


@pytest.fixture(scope="module")
def pro_token():
    s = get_session(PRO_EMAIL, PRO_PASS)
    if not s:
        pytest.skip("Pro login failed")
    return s


@pytest.fixture(scope="module")
def ho_token():
    s = get_session(HO_EMAIL, HO_PASS)
    if not s:
        pytest.skip("HO login failed")
    return s


class TestPostLiveLocation:
    """POST /api/live-location - TP starts live location"""

    def test_post_returns_session_and_dest(self, pro_token):
        r = pro_token.post(f"{BASE_URL}/api/live-location", json={"job_id": JOB_ID, "lat": 48.2085, "lng": 16.3721})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "session_id" in data
        assert data["lat"] is not None
        assert data["lng"] is not None
        assert data.get("dest_lat") is not None, "dest_lat should be geocoded"
        assert data.get("dest_lng") is not None, "dest_lng should be geocoded"
        assert 47.5 < data["dest_lat"] < 48.5, "dest_lat should be near Vienna"

    def test_post_rejects_homeowner(self, ho_token):
        r = ho_token.post(f"{BASE_URL}/api/live-location", json={"job_id": JOB_ID, "lat": 48.2, "lng": 16.3})
        assert r.status_code == 403

    def test_post_invalid_job_id(self, pro_token):
        r = pro_token.post(f"{BASE_URL}/api/live-location", json={"job_id": "invalid_id", "lat": 48.2, "lng": 16.3})
        assert r.status_code == 400


class TestGetLiveLocation:
    """GET /api/live-location/{session_id}"""

    def test_get_existing_session(self, ho_token):
        r = ho_token.get(f"{BASE_URL}/api/live-location/{EXISTING_SESSION}")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "is_active" in data
        assert "lat" in data
        assert "lng" in data
        assert "dest_lat" in data
        assert "dest_lng" in data

    def test_get_fresh_session_has_dest(self, pro_token, ho_token):
        r = pro_token.post(f"{BASE_URL}/api/live-location", json={"job_id": JOB_ID, "lat": 48.21, "lng": 16.37})
        assert r.status_code == 200
        sid = r.json()["session_id"]

        r2 = ho_token.get(f"{BASE_URL}/api/live-location/{sid}")
        assert r2.status_code == 200
        d = r2.json()
        assert d.get("is_active") is True
        assert d.get("dest_lat") is not None, "dest_lat missing from GET response"
        assert d.get("dest_lng") is not None, "dest_lng missing from GET response"


class TestPatchLiveLocation:
    """PATCH /api/live-location/{session_id}"""

    def test_patch_updates_position(self, pro_token):
        r = pro_token.post(f"{BASE_URL}/api/live-location", json={"job_id": JOB_ID, "lat": 48.20, "lng": 16.37})
        assert r.status_code == 200
        sid = r.json()["session_id"]

        r2 = pro_token.patch(f"{BASE_URL}/api/live-location/{sid}", json={"lat": 48.21, "lng": 16.38})
        assert r2.status_code == 200, f"PATCH failed: {r2.text}"
        d = r2.json()
        assert d.get("ok") is True
        assert d["lat"] == 48.21
        assert d["lng"] == 16.38


class TestDeleteLiveLocation:
    """DELETE /api/live-location/{session_id}"""

    def test_delete_stops_session(self, pro_token, ho_token):
        r = pro_token.post(f"{BASE_URL}/api/live-location", json={"job_id": JOB_ID, "lat": 48.20, "lng": 16.37})
        assert r.status_code == 200
        sid = r.json()["session_id"]

        r2 = pro_token.delete(f"{BASE_URL}/api/live-location/{sid}")
        assert r2.status_code == 200
        assert r2.json().get("ok") is True

        r3 = ho_token.get(f"{BASE_URL}/api/live-location/{sid}")
        assert r3.status_code == 200
        assert r3.json().get("is_active") is False
