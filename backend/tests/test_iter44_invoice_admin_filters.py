"""Iter44 — Pro Settings business address, /pro-invoices filters+pagination, /pro-invoices/stats, admin invoices filter, /api/admin/jobs/{id}."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def pro_sess():
    return _login("pro@test.com", "Test123!")


@pytest.fixture(scope="module")
def admin_sess():
    return _login("admin@servicemarket.eu", "Admin123!")


@pytest.fixture(scope="module")
def home_sess():
    return _login("homeowner@test.com", "Test123!")


# ───────── (1) Pro Profile business_* fields ─────────
class TestProProfileBusinessFields:
    def test_get_pro_profile_includes_business_fields(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/profile/pro")
        assert r.status_code == 200, r.text
        d = r.json()
        # Fields may be empty strings or None for new pros but keys must exist
        for k in ("business_address", "business_postal_code", "business_city", "business_country"):
            assert k in d, f"{k} missing in /api/profile/pro response keys={list(d.keys())}"

    def test_patch_pro_profile_persists_business_fields(self, pro_sess):
        payload = {
            "business_address": "Teststraße 12/3",
            "business_postal_code": "1010",
            "business_city": "Wien",
            "business_country": "AT",
        }
        r = pro_sess.patch(f"{BASE}/api/profile/pro", json=payload)
        assert r.status_code == 200, r.text
        # Re-fetch and check persistence
        g = pro_sess.get(f"{BASE}/api/profile/pro").json()
        assert g["business_address"] == "Teststraße 12/3"
        assert g["business_postal_code"] == "1010"
        assert g["business_city"] == "Wien"
        assert g["business_country"] == "AT"


# ───────── (2) Template preview reflects business address ─────────
class TestTemplatePreviewAddress:
    def test_preview_pdf_renders(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices/templates/pastel_mint/preview")
        # Accept 200 with pdf/html or json; just ensure no 5xx
        assert r.status_code in (200, 201), f"unexpected {r.status_code}: {r.text[:200]}"
        # Should be some body
        assert len(r.content) > 50


# ───────── (3) /api/pro-invoices filtering + pagination ─────────
class TestProInvoicesListFilters:
    def test_default_list(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("invoices", "total", "page", "per_page"):
            assert k in d, f"{k} missing keys={list(d.keys())}"
        assert isinstance(d["invoices"], list)
        assert isinstance(d["total"], int)

    def test_per_page_pagination(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices?page=1&per_page=20")
        assert r.status_code == 200
        d = r.json()
        assert d["per_page"] == 20
        assert d["page"] == 1
        assert len(d["invoices"]) <= 20

    def test_per_page_50(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices?per_page=50")
        assert r.status_code == 200
        assert r.json()["per_page"] == 50

    def test_per_page_max_100(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices?per_page=100")
        assert r.status_code == 200
        assert r.json()["per_page"] == 100

    def test_per_page_over_max_rejected(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices?per_page=500")
        # FastAPI Query(le=100) should 422; some impls clamp
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            assert r.json()["per_page"] <= 100

    def test_filter_by_year(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices?year=2025")
        assert r.status_code == 200
        # All returned should be from that year or none
        for inv in r.json()["invoices"][:5]:
            d = inv.get("invoice_date") or ""
            if d:
                assert d.startswith("2025") or "2025" in d

    def test_filter_by_year_month(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices?year=2025&month=1")
        assert r.status_code == 200

    def test_filter_month_without_year_ok(self, pro_sess):
        # month alone should still respond OK (likely no filter or 422 acceptable)
        r = pro_sess.get(f"{BASE}/api/pro-invoices?month=6")
        assert r.status_code in (200, 422)

    def test_filter_invalid_month(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices?year=2025&month=13")
        assert r.status_code == 422

    def test_filter_payment_status_paid(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices?payment_status=paid")
        assert r.status_code == 200
        for inv in r.json()["invoices"][:5]:
            assert inv.get("payment_status") == "paid"

    def test_filter_payment_status_issued(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices?payment_status=issued")
        assert r.status_code == 200

    def test_filter_search_q(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices?q=test")
        assert r.status_code == 200


# ───────── (4) /api/pro-invoices/stats ─────────
class TestProInvoicesStats:
    def test_stats_default(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices/stats")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in (
            "issued_brutto",
            "paid_brutto",
            "pending_brutto",
            "this_month_brutto",
            "issued_count",
            "paid_count",
            "pending_count",
        ):
            assert k in d, f"{k} missing keys={list(d.keys())}"
        # numeric sanity
        assert isinstance(d["issued_count"], int)
        assert isinstance(d["issued_brutto"], (int, float))

    def test_stats_year_filter(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices/stats?year=2025")
        assert r.status_code == 200
        assert "issued_brutto" in r.json()

    def test_stats_year_2099_returns_zero(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices/stats?year=2099")
        assert r.status_code == 200
        d = r.json()
        assert d["issued_count"] == 0
        assert d["paid_count"] == 0


# ───────── (5) /api/admin/invoices filtering ─────────
class TestAdminInvoicesFilters:
    def test_admin_invoices_default(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/admin/invoices")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("invoices", "total", "page", "per_page"):
            assert k in d, f"missing {k} in keys={list(d.keys())}"

    def test_admin_invoices_status_paid(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/admin/invoices?status=paid")
        assert r.status_code == 200

    def test_admin_invoices_status_unpaid(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/admin/invoices?status=unpaid")
        assert r.status_code == 200

    def test_admin_invoices_per_page_20(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/admin/invoices?per_page=20")
        assert r.status_code == 200
        assert r.json()["per_page"] == 20

    def test_admin_invoices_per_page_50(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/admin/invoices?per_page=50")
        assert r.status_code == 200
        assert r.json()["per_page"] == 50

    def test_admin_invoices_per_page_100(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/admin/invoices?per_page=100")
        assert r.status_code == 200
        assert r.json()["per_page"] == 100

    def test_admin_invoices_year_filter(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/admin/invoices?year=2025")
        assert r.status_code == 200

    def test_admin_invoices_homeowner_forbidden(self, home_sess):
        r = home_sess.get(f"{BASE}/api/admin/invoices")
        assert r.status_code in (401, 403)


# ───────── (6) GET /api/admin/jobs/{id} ─────────
class TestAdminJobDetails:
    def _first_job_id(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/admin/jobs?per_page=1")
        if r.status_code != 200:
            # Try list-style fallback
            r = admin_sess.get(f"{BASE}/api/admin/jobs")
        assert r.status_code == 200, r.text
        body = r.json()
        items = body.get("jobs") or body.get("items") or (body if isinstance(body, list) else [])
        if not items:
            pytest.skip("No jobs in DB to test admin job details")
        j = items[0]
        return j.get("id") or j.get("_id") or j.get("job_id")

    def test_admin_job_detail_ok(self, admin_sess):
        jid = self._first_job_id(admin_sess)
        r = admin_sess.get(f"{BASE}/api/admin/jobs/{jid}")
        assert r.status_code == 200, r.text
        d = r.json()
        # Should expose job fields + quote_count + homeowner + accepted_pro keys
        assert "quote_count" in d, f"quote_count missing keys={list(d.keys())}"
        assert "homeowner" in d, f"homeowner missing keys={list(d.keys())}"
        assert "accepted_pro" in d, f"accepted_pro missing keys={list(d.keys())}"
        assert isinstance(d["quote_count"], int)
        # No raw mongo _id leaked
        assert "_id" not in d

    def test_admin_job_detail_404(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/admin/jobs/nonexistent-id-xyz")
        assert r.status_code in (404, 400)

    def test_admin_job_detail_forbidden_for_homeowner(self, home_sess, admin_sess):
        try:
            jid = self._first_job_id(admin_sess)
        except Exception:
            pytest.skip("no job")
        r = home_sess.get(f"{BASE}/api/admin/jobs/{jid}")
        assert r.status_code in (401, 403)

    def test_admin_job_detail_forbidden_for_pro(self, pro_sess, admin_sess):
        try:
            jid = self._first_job_id(admin_sess)
        except Exception:
            pytest.skip("no job")
        r = pro_sess.get(f"{BASE}/api/admin/jobs/{jid}")
        assert r.status_code in (401, 403)


# ───────── (7) Regression smoke — keep iter40 critical endpoints alive ─────────
class TestRegressionSmoke:
    def test_templates_list_3(self, pro_sess):
        r = pro_sess.get(f"{BASE}/api/pro-invoices/templates/list")
        assert r.status_code == 200
        assert len(r.json()["templates"]) == 3

    def test_admin_fees_endpoint_alive(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/admin/fees")
        assert r.status_code in (200, 404)  # endpoint exists / route ok
