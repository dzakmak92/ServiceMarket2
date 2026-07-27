"""
Iteration 6 - Admin panel backend tests
Covers the new/updated admin endpoints introduced by the admin panel rewrite:
- PATCH /api/admin/categories/{id} (min €4 enforcement)
- GET  /api/admin/category-revenue
- GET  /api/admin/billing-stats
- GET  /api/admin/invoices
- GET  /api/admin/invoices/export.csv
- POST /api/admin/invoices/{txn_id}/retry
- DELETE /api/admin/jobs/{id}
- DELETE /api/admin/reviews/{id}
- PATCH /api/admin/users/{id}/ban
- GET  /api/admin/recent-activity
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")


# ── Categories: min €4 enforcement ────────────────────────────────
class TestCategoryFees:
    def test_set_fee_below_min_returns_400(self, admin):
        s = admin["session"]
        r = s.patch(f"{BASE_URL}/api/admin/categories/plumbing", json={"contact_fee": 2})
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        body = r.json()
        msg = body.get("detail") or body.get("message") or ""
        assert "4" in str(msg), f"Error message should mention €4 min: {msg}"

    def test_set_fee_valid_returns_200_and_persists(self, admin):
        s = admin["session"]
        # Set to 7
        r = s.patch(f"{BASE_URL}/api/admin/categories/plumbing", json={"contact_fee": 7})
        assert r.status_code == 200, r.text

        # Verify via GET /admin/categories
        r2 = s.get(f"{BASE_URL}/api/admin/categories")
        assert r2.status_code == 200
        cats = r2.json().get("categories", [])
        plumbing = next((c for c in cats if c.get("_id") == "plumbing" or c.get("id") == "plumbing"), None)
        assert plumbing is not None, "plumbing category missing"
        assert float(plumbing.get("contact_fee", 0)) == 7.0, plumbing


# ── Overview tab supporting endpoints ─────────────────────────────
class TestOverviewEndpoints:
    def test_category_revenue_shape(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/category-revenue")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "categories" in body
        assert isinstance(body["categories"], list)
        # If non-empty, validate row shape
        if body["categories"]:
            row = body["categories"][0]
            for key in ("category", "label", "revenue", "quotes"):
                assert key in row, f"missing key {key} in {row}"

    def test_recent_activity_sorted_desc(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/recent-activity")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "events" in body
        events = body["events"]
        assert isinstance(events, list)
        # Validate sort order desc when >=2
        if len(events) >= 2:
            prev = events[0]["at"]
            for e in events[1:]:
                assert e["at"] <= prev, f"events not sorted desc: {prev} < {e['at']}"
                prev = e["at"]

    def test_revenue_timeseries(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/revenue-timeseries")
        assert r.status_code == 200, r.text
        series = r.json().get("series", [])
        assert isinstance(series, list)
        assert len(series) == 6
        for pt in series:
            for k in ("month", "mrr", "fees"):
                assert k in pt


# ── Billing tab ───────────────────────────────────────────────────
class TestBilling:
    def test_billing_stats_keys(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/billing-stats")
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("mrr", "pro_subscriptions", "contact_revenue_month", "failed_payments"):
            assert k in body, f"missing key {k} in billing-stats"

    def test_invoices_shape(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/invoices")
        assert r.status_code == 200, r.text
        invoices = r.json().get("invoices", [])
        assert isinstance(invoices, list)
        if invoices:
            inv = invoices[0]
            for k in ("invoice_no", "user_name", "user_email", "plan", "amount", "payment_status"):
                assert k in inv, f"missing key {k} in invoice"
            assert inv["invoice_no"].startswith("INV-"), inv["invoice_no"]
            assert len(inv["invoice_no"].split("-")[1]) == 6

    def test_export_csv(self, admin):
        r = admin["session"].get(f"{BASE_URL}/api/admin/invoices/export.csv")
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", ""), r.headers
        first_line = r.text.splitlines()[0]
        assert first_line.startswith("Invoice,User,Email"), first_line

    def test_retry_invoice(self, admin):
        # Find an unpaid invoice
        s = admin["session"]
        invs = s.get(f"{BASE_URL}/api/admin/invoices").json().get("invoices", [])
        target = next((i for i in invs if i.get("payment_status") in ("unpaid", "failed")), None)
        if not target:
            pytest.skip("no unpaid invoice available")
        rid = target["id"]
        r = s.post(f"{BASE_URL}/api/admin/invoices/{rid}/retry")
        assert r.status_code == 200, r.text
        # Verify status='retry_requested' via subsequent invoices fetch
        invs2 = s.get(f"{BASE_URL}/api/admin/invoices").json().get("invoices", [])
        updated = next((i for i in invs2 if i["id"] == rid), None)
        assert updated is not None
        assert updated.get("status") == "retry_requested", updated


# ── Destructive moderation ────────────────────────────────────────
class TestModeration:
    def test_delete_job_soft_cancels(self, admin):
        s = admin["session"]
        # Find an open job
        jobs = s.get(f"{BASE_URL}/api/admin/jobs", params={"status": "open"}).json().get("jobs", [])
        if not jobs:
            pytest.skip("no open jobs to cancel")
        job = jobs[0]
        jid = job["id"]
        r = s.delete(f"{BASE_URL}/api/admin/jobs/{jid}")
        assert r.status_code == 200, r.text
        # Verify status=cancelled via list cancelled
        jobs_after = s.get(f"{BASE_URL}/api/admin/jobs", params={"status": "cancelled"}).json().get("jobs", [])
        ids = [j["id"] for j in jobs_after]
        assert jid in ids, f"job {jid} not in cancelled list"

    def test_delete_review_soft_hides(self, admin):
        s = admin["session"]
        reviews = s.get(f"{BASE_URL}/api/admin/reviews").json().get("reviews", [])
        target = next((rv for rv in reviews if not rv.get("is_hidden")), None)
        if not target:
            pytest.skip("no visible review to hide")
        rid = target["id"]
        r = s.delete(f"{BASE_URL}/api/admin/reviews/{rid}")
        assert r.status_code == 200, r.text
        # Verify hidden
        reviews_after = s.get(f"{BASE_URL}/api/admin/reviews").json().get("reviews", [])
        updated = next((rv for rv in reviews_after if rv["id"] == rid), None)
        assert updated is not None
        assert updated.get("is_hidden") is True, updated

    def test_ban_user_toggles_banned(self, admin):
        s = admin["session"]
        users = s.get(f"{BASE_URL}/api/admin/users", params={"role": "homeowner"}).json().get("users", [])
        # Exclude any banned already
        target = next((u for u in users if not u.get("banned") and u.get("email") != "admin@servicemarket.eu"), None)
        if not target:
            pytest.skip("no non-banned homeowner to ban")
        uid = target["id"]
        r = s.patch(f"{BASE_URL}/api/admin/users/{uid}/ban", json={"banned": True})
        assert r.status_code == 200, r.text
        assert r.json().get("banned") is True
        # Unban to restore
        s.patch(f"{BASE_URL}/api/admin/users/{uid}/ban", json={"banned": False})


# ── Role-based access (non-admin should not access admin endpoints) ──
class TestRBAC:
    def test_homeowner_blocked(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/admin/billing-stats")
        assert r.status_code in (401, 403), r.status_code

    def test_pro_blocked(self, pro):
        r = pro["session"].get(f"{BASE_URL}/api/admin/invoices")
        assert r.status_code in (401, 403), r.status_code
