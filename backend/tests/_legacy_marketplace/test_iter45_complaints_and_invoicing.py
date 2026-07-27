"""Iter45 backend tests:
- has_open_complaint flag on /api/quotes
- /admin/support/{id} resolved → writes notification + 400/404 guards
- /admin/online-payments + filters/pagination + RBAC
- /admin/invoice-templates
- /admin/invoices/export.pdf + /pro-invoices/export.pdf
"""
from __future__ import annotations
import os
import time
import pytest
import requests

def _load_base():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not url:
        try:
            with open("/app/frontend/.env") as fh:
                for line in fh:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return url.rstrip("/")


BASE = _load_base()


# ─────────────────────────── helpers ───────────────────────────
def _get(session, path, **kw):
    return session.get(f"{BASE}{path}", timeout=60, **kw)


def _post(session, path, **kw):
    return session.post(f"{BASE}{path}", timeout=60, **kw)


def _patch(session, path, **kw):
    return session.patch(f"{BASE}{path}", timeout=60, **kw)


# ─────────────────────────── 1. has_open_complaint flow ───────────────────────────
class TestComplaintFlag:
    def test_pro_complaint_marks_quote_with_flag(self, pro, admin):
        s_pro = pro["session"]
        r = _get(s_pro, "/api/quotes")
        assert r.status_code == 200, r.text
        quotes = r.json().get("quotes", [])
        # find an accepted/won quote
        won = [q for q in quotes if q.get("status") == "accepted"]
        if not won:
            pytest.skip("Pro has no accepted quote — cannot test complaint enrichment")
        target = won[0]
        job_id = target["job_id"]

        # File a support ticket on that job
        sub = _post(s_pro, "/api/feedback/support", json={
            "job_id": job_id,
            "category": "quality",
            "subject": "TEST_iter45 complaint subject",
            "message": "TEST_iter45 message body for the complaint",
        })
        assert sub.status_code == 200, sub.text
        ticket_id = sub.json()["id"]

        # GET /quotes again → that quote should now have has_open_complaint=true
        r2 = _get(s_pro, "/api/quotes")
        assert r2.status_code == 200
        quotes2 = r2.json().get("quotes", [])
        matched = [q for q in quotes2 if q["job_id"] == job_id]
        assert matched, "lost the target quote on re-fetch"
        assert matched[0].get("has_open_complaint") is True, "Quote not flagged with has_open_complaint"

        # Save for next tests
        TestComplaintFlag.ticket_id = ticket_id
        TestComplaintFlag.pro_user_id = pro["user"].get("id") or pro["user"].get("_id")

    def test_admin_resolve_writes_notification(self, admin, pro):
        tid = getattr(TestComplaintFlag, "ticket_id", None)
        if not tid:
            pytest.skip("No ticket created in previous test")
        s_admin = admin["session"]
        r = _patch(s_admin, f"/api/admin/support/{tid}", json={
            "status": "resolved",
            "admin_response": "TEST_iter45 admin response",
        })
        assert r.status_code == 200, r.text

        # Pro fetches their notifications
        time.sleep(1)
        s_pro = pro["session"]
        nr = _get(s_pro, "/api/notifications")
        assert nr.status_code == 200, nr.text
        notes = nr.json()
        if isinstance(notes, dict):
            notes = notes.get("notifications") or notes.get("items") or []
        found = [
            n for n in notes
            if n.get("kind") == "support_resolved" and (n.get("link_to") == "/feedback")
        ]
        assert found, f"No support_resolved notification with link /feedback. Got kinds={[n.get('kind') for n in notes[:10]]}"

    def test_admin_patch_bad_id_400(self, admin):
        s_admin = admin["session"]
        r = _patch(s_admin, "/api/admin/support/not-an-objectid", json={"status": "closed"})
        assert r.status_code == 400, r.text

    def test_admin_patch_valid_missing_404(self, admin):
        s_admin = admin["session"]
        # Valid ObjectId hex but unlikely to exist
        r = _patch(s_admin, "/api/admin/support/507f1f77bcf86cd799439011", json={"status": "closed"})
        assert r.status_code == 404, r.text


# ─────────────────────────── 2. Online Payments ───────────────────────────
class TestOnlinePayments:
    def test_pro_forbidden(self, pro):
        r = _get(pro["session"], "/api/admin/online-payments")
        assert r.status_code == 403

    def test_homeowner_forbidden(self, homeowner):
        r = _get(homeowner["session"], "/api/admin/online-payments")
        assert r.status_code == 403

    def test_admin_basic_shape(self, admin):
        r = _get(admin["session"], "/api/admin/online-payments")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("items", "total", "page", "per_page", "totals"):
            assert k in data, f"Missing key {k} in response"
        assert "paid_invoice_volume" in data["totals"]
        assert "paid_fee_revenue" in data["totals"]
        assert isinstance(data["items"], list)

    def test_admin_filters_and_per_page_cap(self, admin):
        r = _get(admin["session"], "/api/admin/online-payments",
                 params={"year": 2026, "month": 6, "per_page": 50, "status": "paid"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["per_page"] == 50
        # per_page max cap = 100 (422 from FastAPI validator)
        r2 = _get(admin["session"], "/api/admin/online-payments", params={"per_page": 500})
        assert r2.status_code == 422, r2.text


# ─────────────────────────── 3. Invoice Templates ───────────────────────────
class TestInvoiceTemplates:
    def test_pro_forbidden(self, pro):
        r = _get(pro["session"], "/api/admin/invoice-templates")
        assert r.status_code == 403

    def test_admin_returns_shape_and_sum(self, admin):
        r = _get(admin["session"], "/api/admin/invoice-templates")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "templates" in d and "total_pros" in d
        assert isinstance(d["templates"], list) and len(d["templates"]) >= 1
        s = 0
        for t in d["templates"]:
            for k in ("key", "name", "count", "pct", "pros"):
                assert k in t, f"Template missing field {k}"
            assert isinstance(t["pros"], list)
            s += t["count"]
        assert s == d["total_pros"], f"sum(counts)={s} != total_pros={d['total_pros']}"


# ─────────────────────────── 4. PDF export endpoints ───────────────────────────
class TestPdfExports:
    def test_admin_export_pdf(self, admin):
        r = _get(admin["session"], "/api/admin/invoices/export.pdf", params={"year": 2026, "month": 6})
        assert r.status_code == 200, r.text
        assert "application/pdf" in r.headers.get("content-type", "")
        assert len(r.content) > 1024, f"PDF too small: {len(r.content)} bytes"

    def test_admin_export_pdf_pro_forbidden(self, pro):
        r = _get(pro["session"], "/api/admin/invoices/export.pdf")
        assert r.status_code == 403

    def test_pro_export_pdf(self, pro):
        r = _get(pro["session"], "/api/pro-invoices/export.pdf", params={"year": 2026, "month": 6})
        assert r.status_code == 200, r.text
        assert "application/pdf" in r.headers.get("content-type", "")
        assert len(r.content) > 1024, f"Pro PDF too small: {len(r.content)} bytes"

    def test_pro_export_pdf_payment_status_filter(self, pro):
        r = _get(pro["session"], "/api/pro-invoices/export.pdf",
                 params={"year": 2026, "payment_status": "paid"})
        assert r.status_code == 200, r.text
        assert "application/pdf" in r.headers.get("content-type", "")

    def test_pro_export_pdf_admin_forbidden(self, admin):
        r = _get(admin["session"], "/api/pro-invoices/export.pdf")
        assert r.status_code == 403
