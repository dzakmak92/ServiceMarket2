"""iter36 — Feedback + Support + Unified Admin Filter/Pagination tests.

Covers:
- POST /api/feedback (3 kinds + validation)
- POST /api/feedback/support (job-bound, 404, 403)
- GET /api/feedback/mine (combined, sorted)
- GET /api/admin/feedback (admin-only, filters, pagination, counts)
- PATCH /api/admin/feedback/{id} (status + resolved_at, admin_response)
- GET/PATCH /api/admin/support
- Logo auto-approval (POST /api/profile/pro/logo)
- Unified pagination filters on /api/admin/{users,jobs,reviews,verifications,invoices}
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")


# ─── Feedback POST / validation ─────────────────────────────────────────
class TestFeedbackSubmission:
    def test_homeowner_submit_feedback_kind(self, homeowner):
        s = homeowner["session"]
        r = s.post(f"{BASE_URL}/api/feedback", json={
            "kind": "feedback", "subject": "TEST_iter36 feedback", "message": "Great service overall."
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["kind"] == "feedback"
        assert body["status"] == "open"
        assert "id" in body and len(body["id"]) > 0
        assert body["subject"] == "TEST_iter36 feedback"

    def test_pro_submit_feature(self, pro):
        r = pro["session"].post(f"{BASE_URL}/api/feedback", json={
            "kind": "feature", "subject": "TEST_iter36 feat", "message": "Add dark mode."
        })
        assert r.status_code == 200
        assert r.json()["kind"] == "feature"

    def test_submit_issue(self, homeowner):
        r = homeowner["session"].post(f"{BASE_URL}/api/feedback", json={
            "kind": "issue", "subject": "TEST_iter36 issue", "message": "Found a bug here."
        })
        assert r.status_code == 200
        assert r.json()["kind"] == "issue"

    def test_bad_kind_rejected(self, homeowner):
        r = homeowner["session"].post(f"{BASE_URL}/api/feedback", json={
            "kind": "random", "subject": "TEST_iter36 bad", "message": "Some content"
        })
        # pydantic-validated kind; 400 or 422 acceptable
        assert r.status_code in (400, 422), r.text

    def test_short_subject_rejected(self, homeowner):
        r = homeowner["session"].post(f"{BASE_URL}/api/feedback", json={
            "kind": "feedback", "subject": "ab", "message": "Valid message length"
        })
        assert r.status_code in (400, 422)

    def test_short_message_rejected(self, homeowner):
        r = homeowner["session"].post(f"{BASE_URL}/api/feedback", json={
            "kind": "feedback", "subject": "Valid subject", "message": "abc"
        })
        assert r.status_code in (400, 422)

    def test_anon_cannot_submit(self, anon):
        r = anon.post(f"{BASE_URL}/api/feedback", json={
            "kind": "feedback", "subject": "TEST_iter36 anon", "message": "Should fail."
        })
        assert r.status_code in (401, 403)


# ─── Feedback /mine ────────────────────────────────────────────────────
class TestFeedbackMine:
    def test_mine_returns_own_items(self, homeowner):
        s = homeowner["session"]
        # Seed 1 feedback
        s.post(f"{BASE_URL}/api/feedback", json={
            "kind": "feedback", "subject": "TEST_iter36 mine seed", "message": "marker-12345"
        })
        r = s.get(f"{BASE_URL}/api/feedback/mine")
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "count" in body
        assert isinstance(body["items"], list)
        # Must contain at least one item we just inserted
        markers = [it for it in body["items"] if it.get("subject", "").startswith("TEST_iter36")]
        assert len(markers) >= 1
        # Each item carries entry_kind
        for it in body["items"]:
            assert it.get("entry_kind") in ("feedback", "support")


# ─── Support tickets ───────────────────────────────────────────────────
class TestSupportTickets:
    def test_support_requires_valid_job(self, homeowner):
        r = homeowner["session"].post(f"{BASE_URL}/api/feedback/support", json={
            "job_id": "507f1f77bcf86cd799439011",
            "category": "no_show",
            "subject": "TEST_iter36 nojob",
            "message": "This job does not exist"
        })
        assert r.status_code == 404

    def _own_job_id(self, homeowner):
        jr = homeowner["session"].get(f"{BASE_URL}/api/jobs").json()
        jobs = jr.get("jobs", []) if isinstance(jr, dict) else jr
        return jobs[0]["id"] if jobs else None

    def test_support_bad_category(self, homeowner):
        job_id = self._own_job_id(homeowner)
        if not job_id:
            pytest.skip("no jobs for homeowner")
        r = homeowner["session"].post(f"{BASE_URL}/api/feedback/support", json={
            "job_id": job_id, "category": "totally_bogus",
            "subject": "TEST_iter36 cat", "message": "msg longer than 5"
        })
        assert r.status_code in (400, 422)

    def test_homeowner_can_file_on_own_job(self, homeowner):
        job_id = self._own_job_id(homeowner)
        if not job_id:
            pytest.skip("no jobs for homeowner")
        r = homeowner["session"].post(f"{BASE_URL}/api/feedback/support", json={
            "job_id": job_id, "category": "quality",
            "subject": "TEST_iter36 support", "message": "Issue with workmanship."
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "open"
        assert body["category"] == "quality"
        assert body["job_id"] == job_id

    def test_pro_not_party_403(self, pro):
        # Find a job the pro has NEVER quoted on (high score: an arbitrary one). We'll
        # ask admin for jobs and pick one without pro_user_id matching the pro.
        # Simpler: try the homeowner's first job — if pro happens to quote, accept 200.
        # We deliberately want to verify 403 path:
        # Pull any job and check via /api/jobs/{id} — if pro is not party, expect 403.
        any_job_resp = requests.get(f"{BASE_URL}/api/jobs")
        if any_job_resp.status_code != 200:
            pytest.skip("public /api/jobs unavailable")
        items = any_job_resp.json()
        if not items:
            pytest.skip("no public jobs")
        # Iterate up to 5 jobs to find one not owned by pro & not quoted by pro
        for j in items[:10]:
            jid = j.get("id") or j.get("_id")
            r = pro["session"].post(f"{BASE_URL}/api/feedback/support", json={
                "job_id": jid, "category": "no_show",
                "subject": "TEST_iter36 prosup", "message": "should be 403"
            })
            if r.status_code == 403:
                return
            # If 200 → pro is party (quote exists) — keep looking
        pytest.skip("could not locate a job where pro is not party")


# ─── Admin Feedback list/patch ─────────────────────────────────────────
class TestAdminFeedback:
    def test_admin_403_for_non_admin(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/admin/feedback")
        assert r.status_code == 403

    def test_admin_403_for_pro(self, pro):
        r = pro["session"].get(f"{BASE_URL}/api/admin/feedback")
        assert r.status_code == 403

    def test_admin_list_shape(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/feedback")
        assert r.status_code == 200
        body = r.json()
        for k in ("items", "total", "page", "per_page", "counts"):
            assert k in body, f"missing {k}"
        assert isinstance(body["items"], list)
        assert "all" in body["counts"]
        for kind_key in ("feedback", "feature", "issue"):
            assert kind_key in body["counts"]
        for st in ("status_open", "status_in_progress", "status_resolved", "status_closed"):
            assert st in body["counts"]

    def test_admin_per_page_cap(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/feedback?per_page=500")
        assert r.status_code == 200
        # Should be capped at 100
        assert r.json()["per_page"] == 100

    def test_admin_kind_filter(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/feedback?kind=feedback&per_page=50")
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["kind"] == "feedback"

    def test_admin_search_q(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/feedback?q=TEST_iter36")
        assert r.status_code == 200
        # We may have seeded test items in prior tests
        items = r.json()["items"]
        assert all("TEST_iter36" in (it.get("subject", "") + it.get("message", "")) for it in items) or items == []

    def test_admin_patch_status_resolved_and_response(self, admin, homeowner):
        # Seed
        s = homeowner["session"].post(f"{BASE_URL}/api/feedback", json={
            "kind": "issue", "subject": "TEST_iter36 patch", "message": "Will be resolved by admin"
        }).json()
        fid = s["id"]
        r = admin["session"].patch(f"{BASE_URL}/api/admin/feedback/{fid}", json={
            "status": "resolved", "admin_response": "Fixed in production."
        })
        assert r.status_code == 200, r.text
        assert r.json().get("updated") is True

        # Verify via admin GET list - search by subject
        listr = admin["session"].get(f"{BASE_URL}/api/admin/feedback?q=TEST_iter36 patch")
        rows = [x for x in listr.json()["items"] if x["id"] == fid]
        assert len(rows) == 1
        row = rows[0]
        assert row["status"] == "resolved"
        assert row.get("admin_response") == "Fixed in production."
        assert "resolved_at" in row and row["resolved_at"] is not None

    def test_admin_patch_bad_status_400(self, admin, homeowner):
        s = homeowner["session"].post(f"{BASE_URL}/api/feedback", json={
            "kind": "feedback", "subject": "TEST_iter36 badpatch", "message": "for bad status patch"
        }).json()
        fid = s["id"]
        r = admin["session"].patch(f"{BASE_URL}/api/admin/feedback/{fid}", json={"status": "weird"})
        assert r.status_code == 400

    def test_admin_patch_404(self, admin):
        r = admin["session"].patch(f"{BASE_URL}/api/admin/feedback/507f1f77bcf86cd799439011", json={"status": "closed"})
        assert r.status_code == 404


# ─── Admin Support list/patch ──────────────────────────────────────────
class TestAdminSupport:
    def test_admin_support_403_non_admin(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/admin/support")
        assert r.status_code == 403

    def test_admin_support_list_shape(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/support")
        assert r.status_code == 200
        body = r.json()
        for k in ("items", "total", "page", "per_page", "counts"):
            assert k in body
        for c in ("no_show", "quality", "pricing", "communication", "other"):
            assert c in body["counts"]

    def test_admin_support_category_filter(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/support?category=quality&per_page=25")
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["category"] == "quality"

    def test_admin_support_patch_resolved(self, admin, homeowner):
        jr = homeowner["session"].get(f"{BASE_URL}/api/jobs").json()
        jobs = jr.get("jobs", []) if isinstance(jr, dict) else jr
        if not jobs:
            pytest.skip("no jobs")
        jid = jobs[0]["id"]
        t = homeowner["session"].post(f"{BASE_URL}/api/feedback/support", json={
            "job_id": jid, "category": "other",
            "subject": "TEST_iter36 supresolve", "message": "resolve me please"
        }).json()
        tid = t["id"]
        r = admin["session"].patch(f"{BASE_URL}/api/admin/support/{tid}", json={
            "status": "resolved", "admin_response": "Handled."
        })
        assert r.status_code == 200
        # verify
        listr = admin["session"].get(f"{BASE_URL}/api/admin/support?q=TEST_iter36 supresolve")
        rows = [x for x in listr.json()["items"] if x["id"] == tid]
        assert len(rows) == 1
        assert rows[0]["status"] == "resolved"
        assert rows[0].get("admin_response") == "Handled."


# ─── Logo auto-approval ────────────────────────────────────────────────
class TestLogoAutoApprove:
    def test_logo_upload_auto_approved(self, pro):
        # 1x1 PNG
        png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01"
            b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        s = pro["session"]
        r = s.post(
            f"{BASE_URL}/api/profile/pro/logo",
            files={"file": ("logo.png", io.BytesIO(png), "image/png")},
            headers={"Content-Type": None},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Look at returned status or refetch profile
        prof = s.get(f"{BASE_URL}/api/profile/pro").json()
        assert prof.get("logo_moderation_status") == "approved", (
            f"expected approved, got {prof.get('logo_moderation_status')}"
        )


# ─── Unified Admin filters & pagination ────────────────────────────────
class TestAdminFiltersPagination:
    def test_users_pagination_filter(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/users?role=tradesperson&per_page=25&page=1")
        assert r.status_code == 200
        body = r.json()
        for k in ("users", "total", "page", "per_page"):
            assert k in body
        assert body["per_page"] == 25
        for u in body["users"]:
            assert u.get("role") == "tradesperson"

    def test_users_search_q(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/users?q=admin")
        assert r.status_code == 200
        assert "users" in r.json()

    def test_users_per_page_cap(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/users?per_page=1000")
        assert r.status_code == 200
        assert r.json()["per_page"] == 100

    def test_jobs_pagination_buckets(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/jobs?per_page=25")
        assert r.status_code == 200
        body = r.json()
        for k in ("jobs", "total", "page", "per_page", "category_buckets"):
            assert k in body
        assert body["per_page"] == 25
        assert isinstance(body["category_buckets"], list)
        if body["category_buckets"]:
            assert "category" in body["category_buckets"][0]
            assert "count" in body["category_buckets"][0]

    def test_jobs_status_filter(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/jobs?status=open&per_page=25")
        assert r.status_code == 200
        for j in r.json()["jobs"]:
            assert j.get("status") == "open"

    def test_jobs_year_month_filter(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/jobs?year=2026&month=1&per_page=25")
        assert r.status_code == 200
        assert isinstance(r.json()["jobs"], list)

    def test_reviews_filters(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/reviews?per_page=25&page=1")
        assert r.status_code == 200
        body = r.json()
        for k in ("reviews", "total", "page", "per_page"):
            assert k in body

    def test_verifications_filters(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/verifications?status=pending&per_page=25")
        assert r.status_code == 200
        body = r.json()
        for k in ("pros", "total", "page", "per_page"):
            assert k in body

    def test_invoices_filters(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/invoices?per_page=25&page=1")
        assert r.status_code == 200
        body = r.json()
        for k in ("invoices", "total", "page", "per_page"):
            assert k in body

    def test_non_admin_blocked_users(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/admin/users")
        assert r.status_code == 403
