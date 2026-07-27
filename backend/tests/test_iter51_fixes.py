"""Tests for iter51 fixes: live_location_routes import fix, feedback admin notifications"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s

@pytest.fixture(scope="module")
def ho_session(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": "homeowner@test.com", "password": "Test123!"})
    assert r.status_code == 200, f"HO login failed: {r.text}"
    return session

@pytest.fixture(scope="module")
def pro_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "pro@test.com", "password": "Test123!"})
    assert r.status_code == 200, f"Pro login failed: {r.text}"
    return s

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@servicemarket.eu", "password": "Admin123!"})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return s


class TestAuth:
    """Authentication tests"""

    def test_homeowner_login(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login", json={"email": "homeowner@test.com", "password": "Test123!"})
        assert r.status_code == 200
        data = r.json()
        assert data.get("role") == "homeowner" or "user" in data or "email" in data
        print("HO login OK")

    def test_pro_login(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "pro@test.com", "password": "Test123!"})
        assert r.status_code == 200
        print("Pro login OK")

    def test_admin_login(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data.get("role") == "admin"
        print("Admin login OK")


class TestLiveLocation:
    """Live location routes - import fix verification"""

    def test_live_location_invalid_job_returns_not_500(self, pro_session):
        """POST /api/live-location with fake job_id should return 400/404, NOT 500 (import error)"""
        r = pro_session.post(f"{BASE_URL}/api/live-location", json={
            "job_id": "000000000000000000000000",
            "lat": 48.2082,
            "lng": 16.3738
        })
        # Should be 404 (job not found), definitely not 500
        assert r.status_code in [400, 404], f"Expected 400/404 but got {r.status_code}: {r.text}"
        print(f"Live location invalid job: {r.status_code} - OK (not 500)")

    def test_live_location_requires_auth(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/live-location", json={
            "job_id": "000000000000000000000000",
            "lat": 48.2082,
            "lng": 16.3738
        })
        assert r.status_code in [401, 403], f"Expected auth error, got {r.status_code}"
        print("Live location auth guard OK")

    def test_get_live_location_nonexistent(self, pro_session):
        """GET /api/live-location/{session_id} for non-existent session"""
        r = pro_session.get(f"{BASE_URL}/api/live-location/000000000000000000000000")
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
        print(f"GET live location nonexistent: {r.status_code} OK")


class TestFeedback:
    """Feedback routes - admin notification verification"""

    def test_submit_feedback_creates_entry(self, ho_session):
        r = ho_session.post(f"{BASE_URL}/api/feedback", json={
            "kind": "feedback",
            "subject": "TEST_Feedback subject iter51",
            "message": "This is a test feedback message for iter51 testing",
            "rating": 4
        })
        assert r.status_code == 200, f"Feedback submit failed: {r.text}"
        data = r.json()
        assert "id" in data
        assert data.get("kind") == "feedback"
        print(f"Feedback created: {data['id']}")
        return data["id"]

    def test_submit_issue_triggers_admin_notification(self, ho_session, admin_session):
        # Submit an issue
        r = ho_session.post(f"{BASE_URL}/api/feedback", json={
            "kind": "issue",
            "subject": "TEST_Issue report iter51",
            "message": "This is a test issue report for iter51 admin notification test",
        })
        assert r.status_code == 200, f"Issue submit failed: {r.text}"
        fid = r.json()["id"]
        print(f"Issue created: {fid}")

        # Check admin has a notification for it
        notif_r = admin_session.get(f"{BASE_URL}/api/notifications")
        assert notif_r.status_code == 200
        notifs = notif_r.json()
        items = notifs.get("items") or notifs if isinstance(notifs, list) else []
        if isinstance(notifs, dict):
            items = notifs.get("items", notifs.get("notifications", []))
        # Check there's at least one new_issue notification
        types = [n.get("type") for n in items]
        assert "new_issue" in types or any("issue" in str(t) for t in types), \
            f"No new_issue notification found. Types: {types[:10]}"
        print("Admin notification for issue OK")

    def test_list_my_feedback(self, ho_session):
        r = ho_session.get(f"{BASE_URL}/api/feedback/mine")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        print(f"My feedback: {data['count']} items")
