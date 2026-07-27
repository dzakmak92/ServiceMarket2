"""Iter35 backend tests: NEW admin tabs (Toolkits/Pay-Now/White-label),
admin RBAC, storno-fix regression on tax dashboard, and Pay-Now sanity.

Credentials from /app/memory/test_credentials.md.
"""
from __future__ import annotations
import os
import pytest
import requests

def _read_env():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return ""


BASE = _read_env()
assert BASE, "REACT_APP_BACKEND_URL missing"

ADMIN = {"email": "admin@servicemarket.eu", "password": "Admin123!"}
PRO = {"email": "pro@test.com", "password": "Test123!"}
HO = {"email": "homeowner@test.com", "password": "Test123!"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=creds, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Auth failed for {creds['email']}: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin_s():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def pro_s():
    return _login(PRO)


@pytest.fixture(scope="module")
def ho_s():
    return _login(HO)


# ──────────────────────────────────────────────
# Admin RBAC — non-admin must get 403
# ──────────────────────────────────────────────
ADMIN_ENDPOINTS = [
    "/api/admin/toolkits/dashboard",
    "/api/admin/pay-now/revenue",
    "/api/admin/white-label/logos",
    "/api/admin/share-tokens/audit",
    "/api/admin/tax/ocr-audit",
    "/api/admin/storno/audit",
    "/api/admin/tax/accountant-shares",
    "/api/admin/tax/ust-va-reminders",
    "/api/admin/pros?has_toolkit=1",
    "/api/admin/audit-log",
]


@pytest.mark.parametrize("path", ADMIN_ENDPOINTS)
def test_admin_rbac_pro_forbidden(pro_s, path):
    r = pro_s.get(f"{BASE}{path}", timeout=15)
    assert r.status_code in (401, 403), f"Pro got {r.status_code} on {path}"


@pytest.mark.parametrize("path", ADMIN_ENDPOINTS)
def test_admin_rbac_homeowner_forbidden(ho_s, path):
    r = ho_s.get(f"{BASE}{path}", timeout=15)
    assert r.status_code in (401, 403), f"HO got {r.status_code} on {path}"


# ──────────────────────────────────────────────
# Admin Toolkits dashboard
# ──────────────────────────────────────────────
def test_toolkits_dashboard_shape(admin_s):
    r = admin_s.get(f"{BASE}/api/admin/toolkits/dashboard", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "total_pros" in d and isinstance(d["total_pros"], int)
    assert "total_mrr" in d and isinstance(d["total_mrr"], (int, float))
    assert "new_subs_30d" in d
    tks = d["toolkits"]
    for k in ("invoice", "tax", "pm", "bundle"):
        assert k in tks
        for f in ("subs", "mrr", "standard_tier", "pro_tier", "conversion_pct"):
            assert f in tks[k], f"{k} missing {f}"


def test_pros_with_toolkit_list(admin_s):
    r = admin_s.get(f"{BASE}/api/admin/pros?has_toolkit=1", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "items" in d and "count" in d
    for it in d["items"]:
        assert any([it.get("has_invoice_toolkit"), it.get("has_tax_toolkit"), it.get("has_pm_toolkit")])


def test_share_tokens_audit(admin_s):
    r = admin_s.get(f"{BASE}/api/admin/share-tokens/audit", timeout=20)
    assert r.status_code == 200
    d = r.json()
    for k in ("pm_customer_links", "pm_sub_links", "tax_accountant_links", "pay_links", "totals"):
        assert k in d
    assert "all" in d["totals"]


def test_ocr_audit(admin_s):
    r = admin_s.get(f"{BASE}/api/admin/tax/ocr-audit", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "totals" in d
    for f in ("all_receipts", "mtd_receipts", "est_cost_all_eur", "est_cost_mtd_eur", "avg_confidence"):
        assert f in d["totals"]
    assert "top_users" in d and "recent" in d


# ──────────────────────────────────────────────
# Admin Pay-Now revenue
# ──────────────────────────────────────────────
def test_pay_now_revenue_shape(admin_s):
    r = admin_s.get(f"{BASE}/api/admin/pay-now/revenue", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    for f in ("volume_ytd", "fees_ytd", "volume_mtd", "fees_mtd", "failed_30d"):
        assert f in d["totals"], f
    assert isinstance(d["top_pros"], list)
    assert isinstance(d["recent"], list)


# ──────────────────────────────────────────────
# Admin White-label logos
# ──────────────────────────────────────────────
def test_white_label_list(admin_s):
    r = admin_s.get(f"{BASE}/api/admin/white-label/logos", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "items" in d and "count" in d
    for it in d["items"]:
        for f in ("pro_id", "logo_file_id", "logo_url", "moderation_status"):
            assert f in it


def test_white_label_filter_pending(admin_s):
    r = admin_s.get(f"{BASE}/api/admin/white-label/logos?status=pending", timeout=20)
    assert r.status_code == 200
    for it in r.json()["items"]:
        assert it["moderation_status"] in (None, "pending")


def test_white_label_approve_404_for_bad_id(admin_s):
    r = admin_s.post(f"{BASE}/api/admin/white-label/logos/000000000000000000000000/approve",
                     json={"note": "ok"}, timeout=15)
    assert r.status_code == 404


# ──────────────────────────────────────────────
# Storno fix regression: tax dashboard outstanding_brutto must be ≥ 0
# ──────────────────────────────────────────────
def test_tax_dashboard_outstanding_non_negative(pro_s):
    r = pro_s.get(f"{BASE}/api/tax/dashboard", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    # Could be top-level or nested under year object — find it
    out = None
    if "outstanding_brutto" in d:
        out = d["outstanding_brutto"]
    elif "pending_brutto" in d:
        out = d["pending_brutto"]
    else:
        # search nested
        for v in d.values():
            if isinstance(v, dict):
                if "outstanding_brutto" in v:
                    out = v["outstanding_brutto"]; break
                if "pending_brutto" in v:
                    out = v["pending_brutto"]; break
    assert out is not None, f"Could not locate outstanding/pending in tax dashboard: {d.keys()}"
    assert out >= 0, f"Storno fix regressed — outstanding/pending is negative: {out}"


def test_tax_dashboard_revenue_summary_positive(pro_s):
    """Sanity: paid_brutto and pending_brutto should both be non-negative."""
    r = pro_s.get(f"{BASE}/api/tax/dashboard", timeout=20)
    assert r.status_code == 200
    d = r.json()
    # Look for nested revenue summary
    def _search(o):
        if isinstance(o, dict):
            if "paid_brutto" in o or "pending_brutto" in o:
                yield o
            for v in o.values():
                yield from _search(v)
    for sub in _search(d):
        if "paid_brutto" in sub:
            assert sub["paid_brutto"] >= 0, f"paid_brutto negative: {sub['paid_brutto']}"
        if "pending_brutto" in sub:
            assert sub["pending_brutto"] >= 0, f"pending_brutto negative: {sub['pending_brutto']}"


# ──────────────────────────────────────────────
# Pay-Now flow regression
# ──────────────────────────────────────────────
def test_pay_link_enable_for_open_invoice(pro_s):
    """Find an open invoice with outstanding > 0 and enable its pay link."""
    r = pro_s.get(f"{BASE}/api/pro-invoices", timeout=20)
    if r.status_code != 200:
        pytest.skip(f"pro-invoices fetch failed: {r.status_code}")
    invs = r.json() if isinstance(r.json(), list) else r.json().get("items") or r.json().get("invoices") or []
    cand = None
    for inv in invs:
        if inv.get("is_storno") or inv.get("cancelled_by_storno_id"):
            continue
        out = inv.get("outstanding")
        if out is None:
            out = inv.get("brutto_total")
        if out and float(out) > 0 and inv.get("payment_status") != "paid":
            cand = inv; break
    if not cand:
        pytest.skip("No open invoice with outstanding>0")
    iid = cand.get("id") or cand.get("_id")
    r = pro_s.post(f"{BASE}/api/pay-link/{iid}/enable", timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("pay_link_token")
    assert tok and len(tok) > 10

    # Public view (no auth)
    s = requests.Session()
    r2 = s.get(f"{BASE}/api/pay-link/public/{tok}", timeout=15)
    assert r2.status_code == 200, r2.text
    pub = r2.json()
    assert "outstanding_eur" in pub and "service_fee_eur" in pub and "total_eur" in pub
    # 1% fee math
    expected_fee = round(float(pub["outstanding_eur"]) * 0.01, 2)
    assert abs(pub["service_fee_eur"] - expected_fee) < 0.01
    assert abs(pub["total_eur"] - (pub["outstanding_eur"] + pub["service_fee_eur"])) < 0.01
    assert pub["service_fee_pct"] == 1.0


def test_pay_link_public_bad_token_404():
    s = requests.Session()
    r = s.get(f"{BASE}/api/pay-link/public/garbage-token", timeout=15)
    assert r.status_code == 404


def test_pay_link_status_unknown_session_404():
    s = requests.Session()
    r = s.get(f"{BASE}/api/pay-link/public/checkout-status/cs_unknown_xxx", timeout=15)
    assert r.status_code == 404
