"""Iter17 — GDPR / data-subject-rights coverage."""
import io
import os
import zipfile
import json
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


class TestRegistrationConsent:
    """Registration requires GDPR consent acceptance."""

    def test_register_without_consent_blocked(self):
        email = f"noconsent_{os.urandom(4).hex()}@example.com"
        r = requests.post(
            f"{BASE}/api/auth/register",
            json={"email": email, "password": "Test123!", "name": "Test User"},
            timeout=10,
        )
        assert r.status_code == 400
        assert "Terms" in r.json()["detail"] or "Privacy" in r.json()["detail"]
        # Verify nothing was persisted
        assert _DB.users.find_one({"email": email}) is None

    def test_register_with_consent_persists_policy_version(self):
        email = f"consented_{os.urandom(4).hex()}@example.com"
        r = requests.post(
            f"{BASE}/api/auth/register",
            json={
                "email": email,
                "password": "Test123!",
                "name": "Consented User",
                "accepted_terms": True,
                "accepted_privacy": True,
                "marketing_opt_in": True,
                "policy_version": "1.0-draft-2026-02-28",
                "turnstile_token": "XXXX.DUMMY.TOKEN.XXXX",
            },
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("policy_version_accepted") == "1.0-draft-2026-02-28"

        # Cleanup
        u = _DB.users.find_one({"email": email})
        assert u is not None
        _DB.users.delete_one({"_id": u["_id"]})
        _DB.consent_records.delete_many({"user_id": str(u["_id"])})


class TestPublicForms:
    def test_data_rights_request_returns_30_day_due_at(self):
        r = requests.post(
            f"{BASE}/api/privacy/data-rights-request",
            json={
                "name": "Jane Doe",
                "email": "jane.doe@example.com",
                "request_type": "access",
                "details": "Please send me my data",
            },
            timeout=10,
        )
        assert r.status_code == 200
        body = r.json()
        assert body.get("id")
        assert body.get("due_at")
        # cleanup
        from bson import ObjectId
        _DB.data_rights_requests.delete_one({"_id": ObjectId(body["id"])})

    def test_data_rights_request_rejects_invalid_type(self):
        r = requests.post(
            f"{BASE}/api/privacy/data-rights-request",
            json={
                "name": "Jane Doe",
                "email": "jane.doe@example.com",
                "request_type": "delete_everything",  # not in allowed set
            },
            timeout=10,
        )
        assert r.status_code == 400


class TestMeEndpoints:
    def test_export_returns_zip_with_json_payload(self):
        s = _login("pro@test.com", "Test123!")
        r = s.get(f"{BASE}/api/me/export", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type") == "application/zip"
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        assert "servicemarket_data_export.json" in names
        assert "README.txt" in names
        payload = json.loads(z.read("servicemarket_data_export.json").decode("utf-8"))
        assert payload["data"]["account"]["email"] == "pro@test.com"
        # Password hash must NOT be exported
        assert "password_hash" not in payload["data"]["account"]
        # consent_history is included
        assert "consent_history" in payload["data"]

    def test_marketing_prefs_toggle(self):
        s = _login("homeowner@test.com", "Test123!")
        # Turn ON
        r = s.put(f"{BASE}/api/me/marketing-prefs", json={"marketing_emails": True}, timeout=10)
        assert r.status_code == 200
        u = _DB.users.find_one({"email": "homeowner@test.com"})
        assert u.get("notif_email_marketing") is True
        # Turn OFF
        s.put(f"{BASE}/api/me/marketing-prefs", json={"marketing_emails": False}, timeout=10)
        u = _DB.users.find_one({"email": "homeowner@test.com"})
        assert u.get("notif_email_marketing") is False

    def test_deletion_schedule_and_cancel_roundtrip(self):
        # Create a throwaway user
        email = f"deletable_{os.urandom(4).hex()}@example.com"
        requests.post(f"{BASE}/api/auth/register", json={
            "email": email, "password": "Test123!", "name": "Deletable",
            "accepted_terms": True, "accepted_privacy": True,
            "policy_version": "1.0-draft-2026-02-28",
            "turnstile_token": "XXXX.DUMMY.TOKEN.XXXX",
        }, timeout=10)
        s = _login(email, "Test123!")

        # Schedule deletion
        r = s.delete(f"{BASE}/api/me", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body.get("grace_days") == 7
        assert body.get("scheduled_for")
        u = _DB.users.find_one({"email": email})
        assert u.get("is_deleted") is True
        assert u.get("deletion_scheduled_for") is not None

        # Cancel
        r = s.post(f"{BASE}/api/me/cancel-deletion", timeout=10)
        assert r.status_code == 200
        u = _DB.users.find_one({"email": email})
        assert "deletion_scheduled_for" not in u
        assert "is_deleted" not in u

        # Cleanup
        _DB.users.delete_one({"email": email})
        _DB.consent_records.delete_many({"user_id": str(u["_id"])})


class TestAdminQueue:
    def test_admin_can_list_and_update(self):
        admin = _login("admin@servicemarket.eu", "Admin123!")
        r = admin.get(f"{BASE}/api/admin/data-rights-requests", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "requests" in body
        assert "total" in body
        for req in body["requests"]:
            assert "overdue" in req
            assert "days_remaining" in req

    def test_non_admin_cannot_list(self):
        s = _login("homeowner@test.com", "Test123!")
        r = s.get(f"{BASE}/api/admin/data-rights-requests", timeout=10)
        assert r.status_code in (401, 403)
