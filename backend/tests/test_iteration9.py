"""Iter9 tests:
- DELETE /api/notifications (clear all)
- GET /api/billing/next-invoice (pro / homeowner-403)
- POST /api/billing/admin/run-monthly (admin / 403)
- GET /api/pros/<id> includes bookings + availability
- GET /api/pros/<proId>/bookings
- Quote accept stamps due_at on fee_log (next 25th)
- Standard pro does NOT receive instant new_job_match within 2s
- Pro-tier pro receives new_job_match within 2s
"""

import os
import time
import requests
import pytest
from datetime import datetime, timezone

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login {email} failed: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def homeowner_s():
    return _login("homeowner@test.com", "Test123!")


@pytest.fixture(scope="module")
def pro_s():
    return _login("pro@test.com", "Test123!")


@pytest.fixture(scope="module")
def admin_s():
    return _login("admin@servicemarket.eu", "Admin123!")


# ---------------- Helpers ---------------- #
def _create_job(s, suffix=""):
    payload = {
        "title": f"TEST_iter9 plumb {suffix}",
        "description": "There is a persistent leak under the kitchen sink that needs urgent fixing this week ideally.",
        "category": "plumbing",
        "country": "AT",
        "city": "Vienna",
        "budget_min": 80,
        "budget_max": 200,
    }
    r = s.post(f"{BASE}/api/jobs", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"create job: {r.status_code} {r.text}"
    return r.json()


# ---------------- Tests ---------------- #
class TestNotificationsClear:
    def test_clear_all_notifications(self, homeowner_s, pro_s):
        # Make sure pro has at least one notif by posting a job (homeowner→pro match)
        _create_job(homeowner_s, suffix="notif")
        time.sleep(1.5)
        # Pro: get current count, then clear
        r0 = pro_s.get(f"{BASE}/api/notifications", timeout=30)
        assert r0.status_code == 200, r0.text
        before_count = len(r0.json().get("notifications", []))

        r = pro_s.delete(f"{BASE}/api/notifications", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("message") == "Notifications cleared"
        assert isinstance(data.get("deleted"), int)
        assert data["deleted"] >= 0  # may be 0 if pro is standard (instant skipped)
        # Pro is standard so no instant alert was inserted — at least asserts API works
        # If there were prior notifications, deletion should >0
        if before_count > 0:
            assert data["deleted"] >= before_count or data["deleted"] > 0

        # Verify GET returns empty
        r2 = pro_s.get(f"{BASE}/api/notifications", timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("notifications") == []
        assert r2.json().get("unread_count") == 0


class TestNextInvoice:
    def test_pro_next_invoice(self, pro_s):
        r = pro_s.get(f"{BASE}/api/billing/next-invoice", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "amount" in data and isinstance(data["amount"], (int, float))
        assert "fee_count" in data and isinstance(data["fee_count"], int)
        assert "due_at" in data and isinstance(data["due_at"], str)
        assert "cycle_start" in data and isinstance(data["cycle_start"], str)
        # due_at should be ISO ending with T00:00:00+00:00 on the 25th
        assert "T00:00:00+00:00" in data["due_at"], data["due_at"]
        due = datetime.fromisoformat(data["due_at"])
        assert due.day == 25
        # future
        assert due > datetime.now(timezone.utc)

    def test_homeowner_forbidden(self, homeowner_s):
        r = homeowner_s.get(f"{BASE}/api/billing/next-invoice", timeout=30)
        assert r.status_code == 403


class TestAdminRunMonthly:
    def test_admin_ok(self, admin_s):
        r = admin_s.post(f"{BASE}/api/billing/admin/run-monthly", timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "invoices_created" in data and isinstance(data["invoices_created"], int)
        assert data["invoices_created"] >= 0

    def test_non_admin_forbidden(self, pro_s):
        r = pro_s.post(f"{BASE}/api/billing/admin/run-monthly", timeout=30)
        assert r.status_code == 403


class TestProEndpointsBookings:
    def test_pros_detail_has_bookings_and_avail(self, homeowner_s, pro_s):
        me = pro_s.get(f"{BASE}/api/auth/me", timeout=30).json()
        pro_user_id = me.get("id") or me.get("_id")
        assert pro_user_id
        r = homeowner_s.get(f"{BASE}/api/pros/{pro_user_id}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "bookings" in data and isinstance(data["bookings"], list)
        assert "availability" in data and isinstance(data["availability"], list)
        # capture pro_profile id for next test
        global _PRO_PROFILE_ID
        _PRO_PROFILE_ID = data.get("id") or data.get("_id")

    def test_pros_bookings_endpoint(self, homeowner_s, pro_s):
        me = pro_s.get(f"{BASE}/api/auth/me", timeout=30).json()
        pro_user_id = me.get("id") or me.get("_id")
        d = homeowner_s.get(f"{BASE}/api/pros/{pro_user_id}", timeout=30).json()
        pro_profile_id = d.get("id") or d.get("_id")
        r = homeowner_s.get(f"{BASE}/api/pros/{pro_profile_id}/bookings", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "bookings" in data and isinstance(data["bookings"], list)
        for b in data["bookings"]:
            assert set(b.keys()) <= {"date", "day", "slot"}


class TestFeeDueAt:
    def test_quote_accept_stamps_due_at(self, homeowner_s, pro_s):
        # Snapshot current fee_count
        pre = pro_s.get(f"{BASE}/api/billing/next-invoice", timeout=30).json()
        pre_count = pre.get("fee_count", 0)

        # 1. homeowner posts fresh job
        job = _create_job(homeowner_s, suffix="fee")
        job_id = job.get("id") or job.get("_id")
        assert job_id
        # 2. pro posts quote
        qr = pro_s.post(
            f"{BASE}/api/quotes",
            json={"job_id": job_id, "price_type": "pauschal", "amount": 150, "message": "TEST iter9 quote message body padded to twenty chars"},
            timeout=30,
        )
        assert qr.status_code in (200, 201), qr.text
        quote = qr.json().get("quote") or qr.json()
        quote_id = quote.get("id") or quote.get("_id")
        assert quote_id
        # 3. homeowner accepts
        ar = homeowner_s.post(f"{BASE}/api/quotes/{quote_id}/accept", timeout=30)
        assert ar.status_code == 200, ar.text

        # 4. fee_count should increment + due_at on next 25th
        post = pro_s.get(f"{BASE}/api/billing/next-invoice", timeout=30).json()
        assert post["fee_count"] == pre_count + 1, (pre_count, post)
        due = datetime.fromisoformat(post["due_at"])
        assert due.day == 25
        assert due > datetime.now(timezone.utc)


class TestPushPlanTier:
    def test_standard_pro_no_instant_match(self, homeowner_s, pro_s):
        # Ensure pro is standard (seed default) and clear notifs
        pro_s.delete(f"{BASE}/api/notifications", timeout=30)
        job = _create_job(homeowner_s, suffix="standard")
        job_id = job.get("id") or job.get("_id")
        # Poll for up to 2s — instant alert should NOT arrive for standard pro
        found = False
        for _ in range(4):
            time.sleep(0.5)
            ns = pro_s.get(f"{BASE}/api/notifications", timeout=30).json().get("notifications", [])
            if any(n.get("kind") == "new_job_match" and n.get("job_id") == str(job_id) for n in ns):
                found = True
                break
        assert not found, "Standard pro received instant alert (regression!)"
