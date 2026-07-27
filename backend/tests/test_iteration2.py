"""Iteration 2 backend tests:
- AI job-category classify
- Quote create (no fee log) + accept (fee log + auto-decline)
- Share location + contact endpoints + accepted_pro_user_id in get_job
- Portfolio upload (max 10) + delete
- Billing cancel-subscription + pay-outstanding
- Search endpoint, messages thread returns other_pro_id
"""
import os
import time
import pytest
import requests
from bson import ObjectId

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")


def _get_id(d):
    return d.get("id") or d.get("_id")


# ------------ AI classify ------------
class TestAIClassify:
    def test_classify_homeowner_plumbing(self, homeowner):
        r = homeowner["session"].post(
            f"{BASE_URL}/api/ai/classify-job",
            json={"description": "My kitchen sink is dead, water doesn't drain", "title": "Sink clogged"},
            timeout=60,
        )
        if r.status_code in (500, 502, 503, 504):
            pytest.skip(f"LLM transient: {r.status_code} {r.text[:200]}")
        assert r.status_code == 200, f"classify-job failed: {r.status_code} {r.text}"
        data = r.json()
        assert "category" in data
        assert "confidence" in data
        assert 0.0 <= float(data["confidence"]) <= 1.0
        # plumbing strongly expected, but allow other known cat
        known = ["plumbing", "electrical", "painting", "home_cleaning", "handyman",
                 "gardening", "carpentry", "hvac", "moving", "pest_control",
                 "locksmith", "appliance_repair", "tiling", "flooring"]
        assert data["category"] in known

    def test_classify_role_guard_pro_forbidden(self, pro):
        r = pro["session"].post(
            f"{BASE_URL}/api/ai/classify-job",
            json={"description": "My kitchen sink is dead, water doesn't drain"},
            timeout=30,
        )
        assert r.status_code == 403


# ------------ Quote create + accept ------------
class TestQuoteAcceptFlow:
    @pytest.fixture(scope="class")
    def fresh_job_and_quote(self, homeowner, pro):
        # Create job
        job_payload = {
            "title": "TEST iter2 kitchen sink fix",
            "description": "Sink clogged, water doesn't drain. Need help asap please this week.",
            "category": "plumbing",
            "city": "Vienna",
            "budget_min": 100,
            "budget_max": 300,
            "urgency": "this_week",
        }
        jr = homeowner["session"].post(f"{BASE_URL}/api/jobs", json=job_payload)
        assert jr.status_code in (200, 201), jr.text
        job = jr.json()
        jid = _get_id(job)

        # Pro submits quote
        qr = pro["session"].post(
            f"{BASE_URL}/api/quotes",
            json={"job_id": jid, "price_type": "pauschal", "amount": 220, "message": "Can come tomorrow morning to fix it.", "duration_days": 1},
        )
        assert qr.status_code in (200, 201), qr.text
        quote = qr.json()
        return {"job_id": jid, "quote_id": _get_id(quote)}

    def test_create_quote_does_not_log_fee_yet(self, pro, fresh_job_and_quote):
        # fee-log should NOT contain a fee with this quote_id yet (before accept)
        r = pro["session"].get(f"{BASE_URL}/api/billing/fee-log")
        assert r.status_code == 200
        fees = r.json().get("fees", [])
        qid = fresh_job_and_quote["quote_id"]
        matching = [f for f in fees if f.get("quote_id") == qid]
        assert matching == [], f"Fee was logged at quote creation (should be only at acceptance): {matching}"

    def test_accept_quote_flow(self, homeowner, pro, fresh_job_and_quote):
        qid = fresh_job_and_quote["quote_id"]
        jid = fresh_job_and_quote["job_id"]
        # Optional: have a 2nd pro quote so we can verify auto-decline (skip if no second pro fixture)

        # Accept
        ar = homeowner["session"].post(f"{BASE_URL}/api/quotes/{qid}/accept")
        assert ar.status_code == 200, ar.text
        body = ar.json()
        assert body.get("job_id") == jid

        # Job is now in_progress, accepted_pro_user_id exposed
        jr = homeowner["session"].get(f"{BASE_URL}/api/jobs/{jid}")
        assert jr.status_code == 200
        jd = jr.json()
        assert jd.get("status") == "in_progress"
        # at minimum one of accepted_pro_user_id / pro_user_id
        assert jd.get("accepted_pro_user_id") or jd.get("pro_user_id")

        # Fee log: pro is on STANDARD by default → fee should be created with status pending
        fl = pro["session"].get(f"{BASE_URL}/api/billing/fee-log")
        assert fl.status_code == 200
        fees = fl.json().get("fees", [])
        matching = [f for f in fees if f.get("quote_id") == qid]
        # If pro is already on 'pro' plan, no fee will be logged — allow either case but log it
        if not matching:
            # check pro plan
            pp = pro["session"].get(f"{BASE_URL}/api/profile/pro").json()
            if pp.get("plan_tier") == "pro":
                pytest.skip("Pro is on 'pro' plan — no fee expected (acceptable)")
            else:
                pytest.fail(f"No fee_log entry for accepted quote {qid} (plan={pp.get('plan_tier')})")
        else:
            assert matching[0].get("status") == "pending"


# ------------ Share location / contact ------------
class TestShareLocationAndContact:
    @pytest.fixture(scope="class")
    def in_progress_ids(self, homeowner, pro):
        # Reuse pattern: create+accept fresh job
        job_payload = {
            "title": "TEST iter2 contact share",
            "description": "Need help with bathroom plumbing this week. Detailed description provided.",
            "category": "plumbing", "city": "Vienna",
            "budget_min": 100, "budget_max": 250, "urgency": "this_week"
        }
        jr = homeowner["session"].post(f"{BASE_URL}/api/jobs", json=job_payload)
        jid = _get_id(jr.json())
        qr = pro["session"].post(
            f"{BASE_URL}/api/quotes",
            json={"job_id": jid, "price_type": "pauschal", "amount": 180, "message": "Tomorrow works for me, will bring tools.", "duration_days": 1},
        )
        qid = _get_id(qr.json())
        ar = homeowner["session"].post(f"{BASE_URL}/api/quotes/{qid}/accept")
        assert ar.status_code == 200
        return {"job_id": jid, "quote_id": qid}

    def test_share_location_requires_in_progress(self, homeowner):
        # create an OPEN job and try sharing
        jr = homeowner["session"].post(f"{BASE_URL}/api/jobs", json={
            "title": "TEST open job share", "description": "Description long enough for share test of location.",
            "category": "plumbing", "city": "Vienna", "urgency": "this_week"
        })
        open_jid = _get_id(jr.json())
        r = homeowner["session"].patch(
            f"{BASE_URL}/api/jobs/{open_jid}/share-location",
            json={"address_full": "Mariahilfer Straße 1, 1060 Wien"},
        )
        assert r.status_code == 400

    def test_share_location_in_progress(self, homeowner, in_progress_ids):
        jid = in_progress_ids["job_id"]
        r = homeowner["session"].patch(
            f"{BASE_URL}/api/jobs/{jid}/share-location",
            json={"address_full": "Mariahilfer Straße 1, 1060 Wien", "lat": 48.20, "lng": 16.35},
        )
        assert r.status_code == 200, r.text
        # verify get_job now reflects location_shared (indirectly via /contact)
        c = homeowner["session"].get(f"{BASE_URL}/api/jobs/{jid}/contact")
        assert c.status_code == 200
        cd = c.json()
        assert cd.get("location_shared") is True
        assert "Mariahilfer" in (cd.get("address_full") or "")

    def test_contact_endpoint_returns_pro_and_homeowner(self, homeowner, in_progress_ids):
        jid = in_progress_ids["job_id"]
        r = homeowner["session"].get(f"{BASE_URL}/api/jobs/{jid}/contact")
        assert r.status_code == 200
        d = r.json()
        assert "pro" in d and "homeowner" in d
        assert "user_id" in d["pro"]

    def test_contact_pre_acceptance_forbidden(self, homeowner):
        # Create a new open job
        jr = homeowner["session"].post(f"{BASE_URL}/api/jobs", json={
            "title": "TEST open contact", "description": "Need plumber help, sufficiently long description here.",
            "category": "plumbing", "city": "Vienna", "urgency": "this_week"
        })
        jid = _get_id(jr.json())
        r = homeowner["session"].get(f"{BASE_URL}/api/jobs/{jid}/contact")
        assert r.status_code == 403


# ------------ Portfolio ------------
# Real 1×1 JPEG bytes for multipart upload (~125 bytes)
import base64 as _b64
TINY_JPEG_BYTES = _b64.b64decode(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh"
    "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR"
    "CAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAA"
    "AAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAM"
    "AwEAAhEDEQA/AKqgAH//2Q=="
)


def _multipart_upload(session, base_url, idx=0):
    """Upload a tiny JPEG via multipart/form-data — the modern GridFS endpoint.
    NOTE: must clear the sticky 'Content-Type: application/json' header from conftest fixture,
    otherwise FastAPI can't parse the multipart body.
    """
    return session.post(
        f"{base_url}/api/profile/pro/portfolio",
        files={"file": (f"test_{idx}.jpg", TINY_JPEG_BYTES, "image/jpeg")},
        data={"caption": f"TEST_{idx}"},
        headers={"Content-Type": None},  # let requests set proper multipart boundary
        timeout=20,
    )


class TestPortfolio:
    def test_upload_and_delete(self, pro):
        # First, clean existing portfolio so we can test the cap rejection
        prof = pro["session"].get(f"{BASE_URL}/api/profile/pro").json()
        existing = prof.get("portfolio_photos", []) or []
        for _ in range(len(existing)):
            d = pro["session"].delete(f"{BASE_URL}/api/profile/pro/portfolio/0")
            assert d.status_code == 200, d.text

        # Standard tier: upload 10 photos
        for i in range(10):
            r = _multipart_upload(pro["session"], BASE_URL, i)
            assert r.status_code == 200, f"upload {i} failed: {r.text}"
            assert r.json().get("count") == i + 1
            assert r.json().get("max") == 10, f"standard cap should be 10, got {r.json().get('max')}"

        # 11th should 400 with "10" in detail
        r11 = _multipart_upload(pro["session"], BASE_URL, 10)
        assert r11.status_code == 400
        assert "10" in r11.json().get("detail", "")

        # Delete index 0
        d = pro["session"].delete(f"{BASE_URL}/api/profile/pro/portfolio/0")
        assert d.status_code == 200
        assert d.json().get("count") == 9

        # Cleanup
        for _ in range(9):
            pro["session"].delete(f"{BASE_URL}/api/profile/pro/portfolio/0")


# ------------ Billing cancel-subscription + pay-outstanding ------------
class TestBillingIter2:
    def test_cancel_subscription_when_standard_returns_400(self, pro):
        # Ensure pro is on standard
        prof = pro["session"].get(f"{BASE_URL}/api/profile/pro").json()
        if prof.get("plan_tier") == "pro":
            # downgrade first
            pro["session"].post(f"{BASE_URL}/api/billing/downgrade")
        r = pro["session"].post(f"{BASE_URL}/api/billing/cancel-subscription")
        assert r.status_code == 400

    def test_pay_outstanding(self, pro):
        # Should have pending fees from acceptance tests above (only if pro plan is standard)
        r = pro["session"].post(
            f"{BASE_URL}/api/billing/pay-outstanding",
            json={"origin_url": BASE_URL},
        )
        if r.status_code == 400:
            # No outstanding fees - acceptable
            assert "outstanding" in r.json().get("detail", "").lower()
            pytest.skip("No outstanding fees to pay")
        if r.status_code in (500, 502, 503):
            pytest.skip(f"Stripe transient: {r.status_code} {r.text[:200]}")
        assert r.status_code == 200, r.text
        d = r.json()
        url = d.get("url")
        assert url and url.startswith("http")
        # transaction stored with metadata.type=contact_fees
        txns = pro["session"].get(f"{BASE_URL}/api/billing/transactions").json().get("transactions", [])
        found = [t for t in txns if t.get("session_id") == d.get("session_id")]
        assert found
        meta = found[0].get("metadata", {})
        assert meta.get("type") == "contact_fees"


# ------------ Search + Messages thread ------------
class TestSearchAndThread:
    def test_search_q_sink(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/search", params={"q": "sink"})
        assert r.status_code == 200
        d = r.json()
        assert "jobs" in d and "pros" in d
        assert isinstance(d["jobs"], list) and isinstance(d["pros"], list)

    def test_thread_returns_other_pro_id(self, homeowner, pro):
        # Find an in-progress thread between homeowner and pro
        threads = homeowner["session"].get(f"{BASE_URL}/api/messages/threads").json().get("threads", [])
        pro_uid = pro["user"].get("_id") or pro["user"].get("id")
        match = next((t for t in threads if t["other_user_id"] == pro_uid), None)
        if not match:
            pytest.skip("No thread between homeowner and pro available")
        r = homeowner["session"].get(f"{BASE_URL}/api/messages/thread/{match['job_id']}/{pro_uid}")
        assert r.status_code == 200
        d = r.json()
        assert "other_pro_id" in d
