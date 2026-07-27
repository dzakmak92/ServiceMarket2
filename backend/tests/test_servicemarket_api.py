"""End-to-end backend tests for ServiceMarket API."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")


# ----- Health & Auth -----
class TestHealthAndAuth:
    def test_health(self, anon):
        r = anon.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_login_returns_id_and_underscore_id(self, anon):
        r = anon.post(f"{BASE_URL}/api/auth/login", json={"email": "homeowner@test.com", "password": "Test123!"})
        assert r.status_code == 200
        data = r.json()
        assert "id" in data and "_id" in data
        assert data["id"] == data["_id"]
        assert data["email"] == "homeowner@test.com"
        # cookie set
        assert any(c.name == "access_token" for c in anon.cookies)

    def test_me_endpoint_has_id_and_underscore_id(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        # Critical: review request asks for both `id` and `_id`
        assert "_id" in data
        assert "id" in data, "GET /api/auth/me missing 'id' field - returns user dict directly without serialize_doc"

    def test_invalid_login(self, anon):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "homeowner@test.com", "password": "wrongpass"})
        assert r.status_code in (400, 401)

    def test_register_and_logout(self):
        s = requests.Session()
        email = f"TEST_reg_{int(time.time())}@example.com"
        r = s.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "TestPass123!", "name": "Test User",
            "role": "homeowner", "country": "AT",
            # iter17 consent gate + iter23 anti-bot test-key token (always-pass)
            "accepted_terms": True, "accepted_privacy": True,
            "turnstile_token": "XXXX.DUMMY.TOKEN.XXXX",
        })
        assert r.status_code in (200, 201), f"Register failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["email"].lower() == email.lower()
        # logout
        r2 = s.post(f"{BASE_URL}/api/auth/logout")
        assert r2.status_code == 200

    def test_refresh_token(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "homeowner@test.com", "password": "Test123!"})
        assert r.status_code == 200
        r2 = s.post(f"{BASE_URL}/api/auth/refresh")
        assert r2.status_code == 200


# ----- Categories -----
class TestCategories:
    def test_get_categories(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/categories")
        assert r.status_code == 200
        cats = r.json().get("categories", [])
        assert len(cats) > 0
        ids = [c.get("_id") for c in cats]
        assert "plumbing" in ids or "electrical" in ids


# ----- Jobs -----
class TestJobs:
    @pytest.fixture(scope="class")
    def created_job(self, homeowner):
        payload = {
            "title": "TEST Fix kitchen sink leak",
            "description": "Long description for a kitchen sink leak that needs to be fixed urgently this week.",
            "category": "plumbing",
            "city": "Vienna",
            "budget_min": 100,
            "budget_max": 300,
            "urgency": "this_week",
        }
        r = homeowner["session"].post(f"{BASE_URL}/api/jobs", json=payload)
        assert r.status_code in (200, 201), f"Create job failed: {r.status_code} {r.text}"
        return r.json()

    def test_create_job(self, created_job):
        assert created_job.get("_id") or created_job.get("id")
        assert created_job["title"].startswith("TEST")

    def test_list_my_jobs(self, homeowner, created_job):
        r = homeowner["session"].get(f"{BASE_URL}/api/jobs")
        assert r.status_code == 200
        jobs = r.json() if isinstance(r.json(), list) else r.json().get("jobs", [])
        assert len(jobs) >= 1

    def test_get_job_detail(self, homeowner, created_job):
        jid = created_job.get("_id") or created_job.get("id")
        r = homeowner["session"].get(f"{BASE_URL}/api/jobs/{jid}")
        assert r.status_code == 200
        assert (r.json().get("_id") or r.json().get("id")) == jid

    def test_patch_job_status(self, homeowner, created_job):
        jid = created_job.get("_id") or created_job.get("id")
        r = homeowner["session"].patch(f"{BASE_URL}/api/jobs/{jid}/status", json={"status": "open"})
        assert r.status_code in (200, 204)


# ----- Pros -----
class TestPros:
    def test_list_pros(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/pros")
        assert r.status_code == 200
        data = r.json()
        pros = data if isinstance(data, list) else data.get("pros", data.get("items", []))
        assert isinstance(pros, list)

    def test_get_pro_detail(self, homeowner, pro):
        pid = pro["user"].get("_id") or pro["user"].get("id")
        r = homeowner["session"].get(f"{BASE_URL}/api/pros/{pid}")
        assert r.status_code in (200, 404)  # may not be visible if not verified


# ----- Quotes -----
class TestQuotes:
    @pytest.fixture(scope="class")
    def job_for_quote(self, homeowner):
        payload = {
            "title": "TEST Quote-target plumbing",
            "description": "We need someone to fix bathroom plumbing this week. Multiple leaks reported in kitchen and bathroom.",
            "category": "plumbing",
            "city": "Vienna",
            "budget_min": 200,
            "budget_max": 500,
            "urgency": "this_week",
        }
        r = homeowner["session"].post(f"{BASE_URL}/api/jobs", json=payload)
        assert r.status_code in (200, 201)
        return r.json()

    def test_pro_creates_quote(self, pro, job_for_quote):
        jid = job_for_quote.get("_id") or job_for_quote.get("id")
        r = pro["session"].post(f"{BASE_URL}/api/quotes", json={
            "job_id": jid, "price_type": "pauschal", "amount": 250, "message": "I can do it tomorrow.", "duration_days": 2
        })
        assert r.status_code in (200, 201), f"Create quote failed: {r.status_code} {r.text}"


# ----- Messages & Translate -----
class TestMessagesAndTranslate:
    def test_threads(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/messages/threads")
        assert r.status_code == 200

    def test_translate_de_to_en(self, homeowner):
        r = homeowner["session"].post(f"{BASE_URL}/api/translate", json={"text": "Hallo Welt", "target_lang": "en"})
        # deep-translator may be rate-limited; allow 503/timeout as transient
        if r.status_code in (500, 502, 503, 504):
            pytest.skip(f"Translate transient error: {r.status_code}")
        assert r.status_code == 200, f"Translate failed: {r.status_code} {r.text}"
        data = r.json()
        translated = (data.get("translated") or data.get("text") or "").lower()
        assert "hello" in translated or "world" in translated, f"Unexpected translation: {data}"


# ----- Billing -----
class TestBilling:
    def test_transactions(self, pro):
        r = pro["session"].get(f"{BASE_URL}/api/billing/transactions")
        assert r.status_code == 200

    def test_fee_log(self, pro):
        r = pro["session"].get(f"{BASE_URL}/api/billing/fee-log")
        assert r.status_code == 200

    def test_subscription_checkout_returns_url(self, pro):
        r = pro["session"].post(f"{BASE_URL}/api/billing/checkout/subscription", json={"origin_url": BASE_URL})
        if r.status_code in (500, 502, 503):
            pytest.skip(f"Stripe transient: {r.status_code} {r.text[:200]}")
        assert r.status_code == 200, f"Checkout failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        url = data.get("url") or data.get("checkout_url") or data.get("session_url")
        assert url and url.startswith("http"), f"No stripe URL: {data}"


# ----- Admin -----
class TestAdmin:
    def test_admin_stats(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/stats")
        assert r.status_code == 200

    def test_admin_verifications(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/verifications")
        assert r.status_code == 200

    def test_admin_users(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/users")
        assert r.status_code == 200

    def test_admin_forbidden_for_homeowner(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/admin/stats")
        assert r.status_code in (401, 403)


# ----- Profile -----
class TestProfile:
    def test_patch_profile(self, homeowner):
        r = homeowner["session"].patch(f"{BASE_URL}/api/profile", json={"city": "Vienna"})
        assert r.status_code in (200, 204)

    def test_patch_pro_profile(self, pro):
        r = pro["session"].patch(f"{BASE_URL}/api/profile/pro", json={"bio": "TEST experienced pro"})
        assert r.status_code in (200, 204)


# ----- Saved Pros -----
class TestSavedPros:
    def test_save_and_unsave(self, homeowner, pro):
        pid = pro["user"].get("_id") or pro["user"].get("id")
        r1 = homeowner["session"].post(f"{BASE_URL}/api/saved-pros/{pid}")
        assert r1.status_code in (200, 201)
        r2 = homeowner["session"].get(f"{BASE_URL}/api/saved-pros")
        assert r2.status_code == 200
        r3 = homeowner["session"].delete(f"{BASE_URL}/api/saved-pros/{pid}")
        assert r3.status_code in (200, 204)


# ----- Availability -----
class TestAvailability:
    def test_get_pro_availability(self, homeowner, pro):
        pid = pro["user"].get("_id") or pro["user"].get("id")
        r = homeowner["session"].get(f"{BASE_URL}/api/availability/{pid}")
        assert r.status_code == 200

    def test_put_availability(self, pro):
        r = pro["session"].put(f"{BASE_URL}/api/availability", json={
            "slots": [{"day": "Mon", "slot": "09:00-12:00", "is_available": True}]
        })
        assert r.status_code in (200, 204)


# ----- Notifications -----
class TestNotifications:
    def test_get_notifications(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/notifications")
        assert r.status_code == 200

    def test_mark_read_all(self, homeowner):
        r = homeowner["session"].patch(f"{BASE_URL}/api/notifications/read-all")
        assert r.status_code in (200, 204)
