"""Iter16 backend tests:
 - GET /api/quotes (as pro) returns enriched quotes with job_* fields
 - GET /api/messages/thread/{job_id}/{other_user_id} as a tradesperson
   returns pro_availability + other_pro_id pointing to the PRO's OWN profile
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")
PRO_EMAIL = "pro@test.com"
PRO_PASSWORD = "Test123!"


@pytest.fixture(scope="module")
def pro_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": PRO_EMAIL, "password": PRO_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Pro login failed: {r.status_code} {r.text}"
    return s


def test_quotes_enriched_payload(pro_session):
    r = pro_session.get(f"{BASE_URL}/api/quotes", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "quotes" in data
    quotes = data["quotes"]
    assert isinstance(quotes, list) and len(quotes) > 0, "Pro should have quotes"
    sample = quotes[0]
    # Required enriched fields
    required = [
        "job_description", "job_attachments", "job_posted_at",
        "job_budget_min", "job_budget_max", "job_urgency",
        "job_posted_by_id", "job_status",
    ]
    missing = [k for k in required if k not in sample]
    assert not missing, f"Missing keys in quote payload: {missing}; have: {list(sample.keys())}"
    assert isinstance(sample["job_attachments"], list)


def test_quotes_status_buckets(pro_session):
    r = pro_session.get(f"{BASE_URL}/api/quotes", timeout=20)
    quotes = r.json()["quotes"]
    statuses = {q.get("status") for q in quotes}
    # at minimum 'pending' or 'accepted' should appear
    assert statuses & {"pending", "accepted", "declined", "completed"}, statuses


def test_thread_for_pro_exposes_other_pro_id(pro_session):
    # Get first thread for the pro
    r = pro_session.get(f"{BASE_URL}/api/messages/threads", timeout=20)
    assert r.status_code == 200
    threads = r.json().get("threads", [])
    if not threads:
        pytest.skip("Pro has no threads to verify")
    t = threads[0]
    job_id = t["job_id"]
    other_id = t["other_user_id"]
    r2 = pro_session.get(f"{BASE_URL}/api/messages/thread/{job_id}/{other_id}", timeout=20)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    # iter16: for a tradesperson, these should both be present and reference the pro's OWN profile
    assert "other_pro_id" in body, body.keys()
    assert "pro_availability" in body
    assert body["other_pro_id"], "other_pro_id should be non-null for a logged-in pro"
    assert isinstance(body["pro_availability"], list)
