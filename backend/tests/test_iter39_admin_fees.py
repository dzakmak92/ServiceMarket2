"""Phase 3 / iter39 — admin job-fees endpoints + report-problem support ticket."""
import os
import pytest
import requests
from bson import ObjectId
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "admin@servicemarket.eu", "password": "Admin123!"}
PRO = {"email": "pro@test.com", "password": "Test123!"}
HOMEOWNER = {"email": "homeowner@test.com", "password": "Test123!"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def pro_session():
    return _login(PRO)


@pytest.fixture(scope="module")
def homeowner_session():
    return _login(HOMEOWNER)


@pytest.fixture(scope="module")
def seeded_fee(admin_session):
    """Insert a fee_log row directly via mongo for testing edit/cancel."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    client = MongoClient(mongo_url)
    db = client[db_name]

    # Find a pro
    pro = db.pro_profiles.find_one({})
    if not pro:
        pytest.skip("No pro_profile available to seed fee")
    pro_id = str(pro["_id"])
    job_id = "TEST_JOB_ITER39_" + ObjectId().__str__()
    fee_doc = {
        "pro_id": pro_id,
        "job_id": job_id,
        "amount": 5.0,
        "status": "pending",
        "category": "contact_fee",
        "incurred_at": datetime.now(timezone.utc),
        "due_at": datetime.now(timezone.utc),
    }
    res = db.fee_log.insert_one(fee_doc)
    fee_id = str(res.inserted_id)

    # Capture original monthly_fees
    pro_doc = db.pro_profiles.find_one({"_id": pro["_id"]})
    original_monthly = pro_doc.get("monthly_fees", 0.0)

    yield {"fee_id": fee_id, "job_id": job_id, "pro_id": pro_id, "original_monthly": original_monthly}

    # Cleanup
    db.fee_log.delete_one({"_id": res.inserted_id})
    db.admin_audit_log.delete_many({"fee_id": fee_id})
    client.close()


class TestAdminJobFees:
    def test_list_job_fees_admin_ok(self, admin_session, seeded_fee):
        r = admin_session.get(f"{BASE_URL}/api/admin/jobs/{seeded_fee['job_id']}/fees")
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "items" in data
        # Should include our seeded contact_fee
        kinds = {i["kind"] for i in data["items"]}
        assert "contact_fee" in kinds
        contact_item = next(i for i in data["items"] if i["kind"] == "contact_fee")
        for k in ("id", "pro_id", "pro_name", "amount", "status", "incurred_at"):
            assert k in contact_item, f"missing key {k}"
        assert contact_item["amount"] == 5.0
        assert contact_item["status"] == "pending"

    def test_list_job_fees_unknown_job_returns_empty(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/jobs/nonexistent_job_xyz_12345/fees")
        assert r.status_code == 200
        data = r.json()
        assert data["items"] == []
        assert data["count"] == 0

    def test_list_job_fees_non_admin_forbidden(self, pro_session, seeded_fee):
        r = pro_session.get(f"{BASE_URL}/api/admin/jobs/{seeded_fee['job_id']}/fees")
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_list_job_fees_homeowner_forbidden(self, homeowner_session, seeded_fee):
        r = homeowner_session.get(f"{BASE_URL}/api/admin/jobs/{seeded_fee['job_id']}/fees")
        assert r.status_code == 403


class TestAdminFeePatch:
    def test_patch_fee_bad_id_404(self, admin_session):
        bad_oid = str(ObjectId())  # valid oid format but not in db
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/fees/{bad_oid}",
            json={"amount": 3.0, "reason": "test reason"},
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_patch_fee_negative_amount_400(self, admin_session, seeded_fee):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/fees/{seeded_fee['fee_id']}",
            json={"amount": -1.0, "reason": "negative test"},
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"

    def test_patch_fee_empty_reason_422(self, admin_session, seeded_fee):
        # Pydantic min_length=3 enforces this
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/fees/{seeded_fee['fee_id']}",
            json={"amount": 3.0, "reason": ""},
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"

    def test_patch_fee_edit_amount_ok(self, admin_session, seeded_fee):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/fees/{seeded_fee['fee_id']}",
            json={"amount": 3.0, "reason": "Goodwill discount"},
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("updated") is True

        # Verify via GET that amount changed
        r2 = admin_session.get(f"{BASE_URL}/api/admin/jobs/{seeded_fee['job_id']}/fees")
        assert r2.status_code == 200
        contact = next(i for i in r2.json()["items"] if i["kind"] == "contact_fee")
        assert contact["amount"] == 3.0

    def test_patch_fee_cancel_decrements_monthly_fees(self, admin_session, seeded_fee):
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        client = MongoClient(mongo_url)
        db = client[db_name]

        # current amount (after the edit above it's 3.0)
        fee_before = db.fee_log.find_one({"_id": ObjectId(seeded_fee["fee_id"])})
        amount_pending = fee_before["amount"]
        pro_before = db.pro_profiles.find_one({"_id": ObjectId(seeded_fee["pro_id"])})
        monthly_before = float(pro_before.get("monthly_fees", 0.0) or 0.0)

        r = admin_session.patch(
            f"{BASE_URL}/api/admin/fees/{seeded_fee['fee_id']}",
            json={"status": "cancelled", "reason": "Refund"},
        )
        assert r.status_code == 200, r.text[:300]

        fee_after = db.fee_log.find_one({"_id": ObjectId(seeded_fee["fee_id"])})
        assert fee_after["status"] == "cancelled"
        pro_after = db.pro_profiles.find_one({"_id": ObjectId(seeded_fee["pro_id"])})
        monthly_after = float(pro_after.get("monthly_fees", 0.0) or 0.0)
        assert abs(monthly_after - (monthly_before - amount_pending)) < 0.01, (
            f"monthly_fees not decremented: before={monthly_before}, after={monthly_after}, fee={amount_pending}"
        )

        # Audit entry exists
        audit = db.admin_audit_log.find_one({"fee_id": seeded_fee["fee_id"], "kind": "fee_adjusted"})
        assert audit is not None
        client.close()


class TestReportProblemSupport:
    """Validate the support ticket endpoint used by ReportProblemButton."""

    def _find_pro_job_id(self):
        from pymongo import MongoClient
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        c = MongoClient(os.environ.get("MONGO_URL"))
        db = c[os.environ.get("DB_NAME")]
        u = db.users.find_one({"email": "pro@test.com"})
        pro = db.pro_profiles.find_one({"user_id": u["_id"]}) or db.pro_profiles.find_one({"user_id": str(u["_id"])})
        q = db.quotes.find_one({"pro_id": str(pro["_id"])}) or db.quotes.find_one({"pro_id": pro["_id"]})
        return str(q["job_id"]) if q else None

    def test_pro_can_file_support_ticket_with_job(self, pro_session):
        job_id = self._find_pro_job_id()
        if not job_id:
            pytest.skip("no job_id for pro available")
        r = pro_session.post(
            f"{BASE_URL}/api/feedback/support",
            json={
                "job_id": job_id,
                "category": "pricing",
                "subject": "TEST_iter39 job fee dispute",
                "message": "Automated test linked to job.",
            },
        )
        assert r.status_code in (200, 201), f"unexpected: {r.status_code} {r.text[:300]}"
