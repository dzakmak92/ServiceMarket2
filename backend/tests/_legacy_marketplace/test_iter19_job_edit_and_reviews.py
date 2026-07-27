"""
Iteration 19 backend tests:
1) PATCH /api/jobs/{job_id} — homeowner job edit while status='open'
2) GET /api/pros/{pro_id} — review enrichment (job_id/job_title/job_category/job_city)
"""
import os
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")


# --------------------------- helpers ---------------------------

def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=60)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def homeowner_sess():
    return _login("homeowner@test.com", "Test123!")


@pytest.fixture(scope="module")
def pro_sess():
    return _login("pro@test.com", "Test123!")


@pytest.fixture(scope="module")
def created_job(homeowner_sess):
    """Create a fresh OPEN job we can edit/cancel without disturbing seed data."""
    payload = {
        "title": "TEST_iter19 leaky kitchen tap",
        "category": "plumbing",
        "description": "Original description for the iter19 backend test job.",
        "city": "Vienna",
        "budget_min": 100,
        "budget_max": 200,
        "urgency": "medium",
        "attachments": []
    }
    r = homeowner_sess.post(f"{BASE}/api/jobs", json=payload, timeout=60)
    assert r.status_code in (200, 201), f"create job failed: {r.status_code} {r.text}"
    job = r.json()
    job_id = job.get("id") or job.get("_id")
    assert job_id, f"no id in response: {job}"
    yield job_id
    # cleanup — cancel the job (only works if still open; ignore if not)
    try:
        homeowner_sess.delete(f"{BASE}/api/jobs/{job_id}", timeout=30)
    except Exception:
        pass


# --------------------------- PATCH /api/jobs/{id} ---------------------------

class TestJobEdit:
    def test_edit_open_job_basic_fields(self, homeowner_sess, created_job):
        payload = {"title": "TEST_iter19 leaky kitchen tap UPDATED",
                   "description": "Updated description body",
                   "city": "Salzburg",
                   "urgency": "high",
                   "budget_min": 150,
                   "budget_max": 300}
        r = homeowner_sess.patch(f"{BASE}/api/jobs/{created_job}", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == payload["title"]
        assert body["description"] == payload["description"]
        assert body["city"] == "Salzburg"
        assert body["urgency"] == "high"
        assert body["budget_min"] == 150
        assert body["budget_max"] == 300
        assert "edited_at" in body and body["edited_at"], "edited_at should be set"

        # GET-back to verify persistence
        g = homeowner_sess.get(f"{BASE}/api/jobs/{created_job}", timeout=30)
        assert g.status_code == 200
        gd = g.json()
        assert gd["title"] == payload["title"]
        assert gd["city"] == "Salzburg"
        assert gd["urgency"] == "high"

    def test_edit_attachments_max5(self, homeowner_sess, created_job):
        too_many = [
            {"file_id": f"f{i}", "url": f"https://example.com/{i}.jpg",
             "name": f"f{i}.jpg", "content_type": "image/jpeg", "size": 100}
            for i in range(6)
        ]
        r = homeowner_sess.patch(f"{BASE}/api/jobs/{created_job}",
                                 json={"attachments": too_many}, timeout=30)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

        # 5 attachments should succeed
        five = too_many[:5]
        r2 = homeowner_sess.patch(f"{BASE}/api/jobs/{created_job}",
                                  json={"attachments": five}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert len(r2.json().get("attachments", [])) == 5

    def test_edit_budget_max_less_than_min_fails(self, homeowner_sess, created_job):
        r = homeowner_sess.patch(f"{BASE}/api/jobs/{created_job}",
                                 json={"budget_min": 500, "budget_max": 100}, timeout=30)
        assert r.status_code == 400, r.text

    def test_edit_title_too_short_fails(self, homeowner_sess, created_job):
        # pydantic will return 422 for min_length violation
        r = homeowner_sess.patch(f"{BASE}/api/jobs/{created_job}",
                                 json={"title": "abc"}, timeout=30)
        assert r.status_code in (400, 422), r.text

    def test_pro_cannot_edit_homeowner_job(self, pro_sess, created_job):
        r = pro_sess.patch(f"{BASE}/api/jobs/{created_job}",
                           json={"title": "TEST_iter19 hostile rename attempt"}, timeout=30)
        assert r.status_code == 403, r.text

    def test_unauth_cannot_edit(self, created_job):
        anon = requests.Session()
        r = anon.patch(f"{BASE}/api/jobs/{created_job}",
                       json={"title": "TEST_iter19 anon rename"}, timeout=30)
        assert r.status_code in (401, 403), r.text

    def test_non_existent_job_404(self, homeowner_sess):
        r = homeowner_sess.patch(f"{BASE}/api/jobs/000000000000000000000000",
                                 json={"title": "TEST_iter19 ghost"}, timeout=30)
        assert r.status_code == 404, r.text

    def test_cannot_edit_non_open_job(self, homeowner_sess):
        """Find an already in_progress/completed/cancelled job for this homeowner and verify 400."""
        non_open = []
        for st in ("in_progress", "completed", "cancelled"):
            r = homeowner_sess.get(f"{BASE}/api/jobs", params={"status": st}, timeout=30)
            if r.status_code == 200:
                non_open.extend(r.json().get("jobs", []))
            if non_open:
                break
        if not non_open:
            pytest.skip("no non-open job available to test guard")
        jid = non_open[0].get("id") or non_open[0].get("_id")
        r2 = homeowner_sess.patch(f"{BASE}/api/jobs/{jid}",
                                  json={"title": "TEST_iter19 should be blocked"}, timeout=30)
        assert r2.status_code == 400, f"expected 400 for status={non_open[0].get('status')} got {r2.status_code}: {r2.text}"


# --------------------------- GET /api/pros/{pro_id} review enrichment ---------------------------

PRO_ID = "6a14b72e05a5dee99e39fd16"


class TestProDetailReviews:
    def test_pro_detail_loads_with_reviews(self, homeowner_sess):
        r = homeowner_sess.get(f"{BASE}/api/pros/{PRO_ID}", timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        # Existing keys should still be present (no regression)
        for k in ("name", "reviews", "availability", "bookings"):
            assert k in body, f"missing key {k} in pro detail response"

        reviews = body["reviews"]
        assert isinstance(reviews, list), "reviews should be a list"

        if not reviews:
            pytest.skip("pro has no reviews — skipping enrichment check")

        rev = reviews[0]
        # Enriched fields (job context)
        assert "job_id" in rev, f"review missing job_id: {rev}"
        assert "job_title" in rev
        assert "job_category" in rev
        assert "job_city" in rev
        # reviewer_name still present
        assert "reviewer_name" in rev

    def test_reviews_limit_up_to_50(self, homeowner_sess):
        r = homeowner_sess.get(f"{BASE}/api/pros/{PRO_ID}", timeout=60)
        assert r.status_code == 200
        reviews = r.json().get("reviews", [])
        assert len(reviews) <= 50, f"expected <=50 reviews, got {len(reviews)}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
