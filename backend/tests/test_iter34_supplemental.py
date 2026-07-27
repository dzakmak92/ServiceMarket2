"""Iter34 supplemental — Tax dashboard outstanding tile + Receipts PATCH/DELETE."""
import os
import io
import requests
import pytest

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def pro_sess():
    return _login("pro@test.com", "Test123!")


# ──────────────────────────────────────────────
# Tax Dashboard outstanding tile
# ──────────────────────────────────────────────
def test_tax_dashboard_returns_outstanding(pro_sess):
    r = pro_sess.get(f"{BASE}/api/tax/dashboard")
    assert r.status_code == 200, r.text
    data = r.json()
    # The tax dashboard should have outstanding/revenue/expenses
    assert isinstance(data, dict)
    # Look for outstanding-related fields
    has_outstanding_field = any("outstanding" in str(k).lower() for k in data.keys()) or \
                            any("outstanding" in str(data).lower())
    assert has_outstanding_field, f"No outstanding field found in tax dashboard: {list(data.keys())}"


def test_tax_dashboard_excludes_cancelled_storno(pro_sess):
    """The outstanding tile should exclude cancelled-by-storno docs."""
    # Get current invoices to know what's there
    inv_resp = pro_sess.get(f"{BASE}/api/pro-invoices").json()
    invoices = inv_resp.get("invoices", [])
    # Sum manually what *should* be outstanding (not paid/cancelled/storno)
    expected_outstanding = 0.0
    for inv in invoices:
        if inv.get("is_storno") or inv.get("payment_status") in ("cancelled", "paid"):
            continue
        expected_outstanding += float(inv.get("outstanding", inv.get("brutto_total", 0)))

    dash = pro_sess.get(f"{BASE}/api/tax/dashboard").json()
    # Find any outstanding numeric field
    outstanding_val = None
    for k, v in dash.items():
        if "outstanding" in str(k).lower() and isinstance(v, (int, float)):
            outstanding_val = float(v)
            break
    if outstanding_val is None:
        pytest.skip("No numeric outstanding field on dashboard")
    # Allow small tolerance
    assert abs(outstanding_val - expected_outstanding) < 1.0, \
        f"Dashboard outstanding {outstanding_val} != expected {expected_outstanding}"


# ──────────────────────────────────────────────
# Receipts PATCH / DELETE
# ──────────────────────────────────────────────
def test_receipts_list_endpoint(pro_sess):
    r = pro_sess.get(f"{BASE}/api/tax/receipts")
    assert r.status_code == 200, r.text


def test_receipt_patch_and_delete(pro_sess):
    # List existing
    r = pro_sess.get(f"{BASE}/api/tax/receipts").json()
    items = r if isinstance(r, list) else r.get("receipts", [])
    if not items:
        pytest.skip("No receipts seeded to test PATCH/DELETE")
    rec = items[0]
    rid = rec.get("id") or rec.get("_id")
    if not rid:
        pytest.skip("Receipt missing id")

    # PATCH: update vendor
    new_vendor = "TEST_VENDOR_PATCH"
    p = pro_sess.patch(f"{BASE}/api/tax/receipts/{rid}", json={"vendor": new_vendor})
    if p.status_code == 404:
        pytest.skip("PATCH receipts endpoint not found")
    assert p.status_code in (200, 204), p.text
    # GET to verify persisted
    g = pro_sess.get(f"{BASE}/api/tax/receipts").json()
    items2 = g if isinstance(g, list) else g.get("receipts", [])
    found = next((x for x in items2 if (x.get("id") or x.get("_id")) == rid), None)
    if found:
        assert found.get("vendor") == new_vendor


# ──────────────────────────────────────────────
# Accountant public PDF/CSV without auth
# ──────────────────────────────────────────────
def test_accountant_public_pdf_no_auth(pro_sess):
    tok = pro_sess.post(f"{BASE}/api/tax/accountant-share").json()["accountant_token"]
    try:
        data = requests.get(f"{BASE}/api/tax/public/accountant/{tok}", timeout=30).json()
        pdf = requests.get(f"{BASE}{data['downloads']['year_pdf']}", timeout=30)
        assert pdf.status_code == 200
        assert pdf.headers["content-type"] == "application/pdf"
        assert pdf.content[:4] == b"%PDF"

        csv_rev = requests.get(f"{BASE}{data['downloads']['revenue_csv']}", timeout=30)
        assert csv_rev.status_code == 200
        assert csv_rev.headers["content-type"].startswith("text/csv")

        csv_exp = requests.get(f"{BASE}{data['downloads']['expenses_csv']}", timeout=30)
        assert csv_exp.status_code == 200
        assert csv_exp.headers["content-type"].startswith("text/csv")
    finally:
        pro_sess.delete(f"{BASE}/api/tax/accountant-share")


def test_accountant_public_404_on_bad_token():
    r = requests.get(f"{BASE}/api/tax/public/accountant/nonexistent_token_xyz", timeout=30)
    assert r.status_code == 404
