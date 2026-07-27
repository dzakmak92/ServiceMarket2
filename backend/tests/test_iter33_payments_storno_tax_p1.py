"""Iter33 — Payments + Storno + Tax accountant share + OCR refinements."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL",
                     "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")


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


def _first_open_invoice(pro_sess):
    """Find an invoice that has no payments yet, isn't storno/cancelled."""
    r = pro_sess.get(f"{BASE}/api/pro-invoices").json()
    for inv in r.get("invoices", []):
        if inv.get("is_storno") or inv.get("cancelled_by_storno_id"):
            continue
        if inv.get("payment_status") in ("paid", "partial", "cancelled"):
            continue
        if (inv.get("paid_total") or 0) > 0:
            continue
        # Also skip if the invoice carries leftover payments[] from other
        # test suites (e.g. iter34 pay-now seeds a payment via direct DB push
        # without updating paid_total).
        if len(inv.get("payments") or []) > 0:
            continue
        return inv
    pytest.skip("No clean open invoice for testing")


# ──────────────────────────────────────────────
# 1. Partial-payment tracking
# ──────────────────────────────────────────────
def test_record_partial_payment_then_full(pro_sess):
    inv = _first_open_invoice(pro_sess)
    brutto = float(inv["brutto_total"])

    # First payment — 30% of total
    half = round(brutto * 0.3, 2)
    r1 = pro_sess.post(f"{BASE}/api/pro-invoices/{inv['id']}/payments",
                       json={"amount_eur": half, "method": "transfer", "note": "Anzahlung"})
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["payment_status"] == "partial"
    assert abs(d1["paid_total"] - half) < 0.01
    assert abs(d1["outstanding"] - (brutto - half)) < 0.01

    # Second payment — remaining
    r2 = pro_sess.post(f"{BASE}/api/pro-invoices/{inv['id']}/payments",
                       json={"amount_eur": round(brutto - half, 2), "method": "cash"})
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["payment_status"] == "paid"
    assert d2["outstanding"] < 0.01

    # Cleanup so other tests are not skipped
    for p in (d2.get("payments") or []):
        pro_sess.delete(f"{BASE}/api/pro-invoices/{inv['id']}/payments/{p['id']}")


def test_delete_payment_reverts_status(pro_sess):
    inv = _first_open_invoice(pro_sess)
    brutto = float(inv["brutto_total"])
    r = pro_sess.post(f"{BASE}/api/pro-invoices/{inv['id']}/payments",
                     json={"amount_eur": brutto, "method": "transfer"})
    assert r.json()["payment_status"] == "paid"
    pid = r.json()["payments"][-1]["id"]

    rd = pro_sess.delete(f"{BASE}/api/pro-invoices/{inv['id']}/payments/{pid}")
    assert rd.status_code == 200
    assert rd.json()["payment_status"] == "issued"
    assert rd.json()["outstanding"] == brutto


def test_storno_or_cancelled_cannot_accept_payment(pro_sess):
    # Find a storno invoice
    r = pro_sess.get(f"{BASE}/api/pro-invoices").json()
    storno_inv = next((i for i in r["invoices"] if i.get("is_storno")), None)
    if not storno_inv:
        pytest.skip("No storno invoice in seed")
    res = pro_sess.post(f"{BASE}/api/pro-invoices/{storno_inv['id']}/payments",
                        json={"amount_eur": 10, "method": "transfer"})
    assert res.status_code == 400


def test_tax_dashboard_excludes_storno_from_outstanding(pro_sess):
    """REGRESSION: storno + cancelled docs must NOT bleed into the
    'outstanding' tile. They net to zero with the originals."""
    r = pro_sess.get(f"{BASE}/api/tax/dashboard").json()
    # Outstanding must always be >= 0
    assert r["outstanding_brutto"] >= 0, f"outstanding went negative: {r['outstanding_brutto']}"
    # Sum of stornos must be neutralised by their originals
    invs = pro_sess.get(f"{BASE}/api/pro-invoices").json().get("invoices", [])
    storno_brutto = sum(float(i["brutto_total"]) for i in invs if i.get("is_storno"))
    cancelled_brutto = sum(float(i["brutto_total"]) for i in invs if i.get("cancelled_by_storno_id"))
    assert abs(storno_brutto + cancelled_brutto) < 0.01, \
        f"storno {storno_brutto} + cancelled {cancelled_brutto} should net to 0"


def test_revenue_summary_excludes_storno_from_count(pro_sess):
    """Quarterly invoice counts on the accountant view should NOT include storno docs."""
    tok_resp = pro_sess.post(f"{BASE}/api/tax/accountant-share").json()
    token = tok_resp["accountant_token"]
    try:
        d = requests.get(f"{BASE}/api/tax/public/accountant/{token}", timeout=30).json()
        # Sum invoice counts across all quarters
        total_count = sum(
            sum(b.get("count", 0) for b in q["buckets"].values())
            for q in d["quarters"].values()
        )
        # Total count of NON-storno NON-cancelled docs
        invs = pro_sess.get(f"{BASE}/api/pro-invoices").json().get("invoices", [])
        from datetime import datetime
        this_year_docs = [i for i in invs
                          if not i.get("is_storno") and not i.get("cancelled_by_storno_id")
                          and i.get("invoice_date", "")[:4] == str(d["year"])]
        assert total_count == len(this_year_docs), \
            f"count mismatch — accountant {total_count} vs actual {len(this_year_docs)}"
    finally:
        pro_sess.delete(f"{BASE}/api/tax/accountant-share")


# ──────────────────────────────────────────────
# 2. Storno
# ──────────────────────────────────────────────
def test_issue_storno_creates_negative_invoice(pro_sess):
    inv = _first_open_invoice(pro_sess)
    orig_brutto = float(inv["brutto_total"])
    r = pro_sess.post(f"{BASE}/api/pro-invoices/{inv['id']}/storno",
                     json={"reason": "Wrong customer details"})
    assert r.status_code == 200
    d = r.json()
    assert d["is_storno"] is True
    assert d["storno_of_invoice_number"] == inv["invoice_number"]
    assert d["brutto_total"] == -abs(orig_brutto)
    assert d["net_total"] == -abs(float(inv["net_total"]))
    # Original now marked cancelled
    orig = pro_sess.get(f"{BASE}/api/pro-invoices/{inv['id']}").json()
    assert orig["payment_status"] == "cancelled"
    assert orig["cancelled_by_storno_number"] == d["invoice_number"]


def test_cannot_storno_a_storno(pro_sess):
    r = pro_sess.get(f"{BASE}/api/pro-invoices").json()
    storno_inv = next((i for i in r["invoices"] if i.get("is_storno")), None)
    if not storno_inv:
        pytest.skip("No storno invoice")
    res = pro_sess.post(f"{BASE}/api/pro-invoices/{storno_inv['id']}/storno", json={"reason": "x"})
    assert res.status_code == 400


def test_cannot_double_storno(pro_sess):
    r = pro_sess.get(f"{BASE}/api/pro-invoices").json()
    cancelled = next((i for i in r["invoices"] if i.get("cancelled_by_storno_id")), None)
    if not cancelled:
        pytest.skip("No cancelled invoice")
    res = pro_sess.post(f"{BASE}/api/pro-invoices/{cancelled['id']}/storno", json={"reason": "x"})
    assert res.status_code == 400


# ──────────────────────────────────────────────
# 3. Tax accountant share
# ──────────────────────────────────────────────
def test_accountant_share_token_lifecycle(pro_sess):
    # Issue
    r1 = pro_sess.post(f"{BASE}/api/tax/accountant-share").json()
    token = r1["accountant_token"]
    assert token

    # Public view (no auth)
    pub = requests.get(f"{BASE}/api/tax/public/accountant/{token}", timeout=30)
    assert pub.status_code == 200
    data = pub.json()
    assert "year" in data
    assert "revenue" in data
    assert "expenses" in data
    assert "profit" in data
    assert "quarters" in data
    assert all(q in data["quarters"] for q in ("Q1", "Q2", "Q3", "Q4"))
    assert "downloads" in data

    # Public CSV download works (no auth)
    csv_resp = requests.get(f"{BASE}{data['downloads']['revenue_csv']}", timeout=30)
    assert csv_resp.status_code == 200
    assert csv_resp.headers["content-type"].startswith("text/csv")

    # Public PDF download works
    pdf_resp = requests.get(f"{BASE}{data['downloads']['year_pdf']}", timeout=30)
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"

    # Revoke
    rv = pro_sess.delete(f"{BASE}/api/tax/accountant-share")
    assert rv.status_code == 200
    # Old token now 404
    after = requests.get(f"{BASE}/api/tax/public/accountant/{token}", timeout=30)
    assert after.status_code == 404


def test_accountant_share_rotates_token(pro_sess):
    a = pro_sess.post(f"{BASE}/api/tax/accountant-share").json()["accountant_token"]
    b = pro_sess.post(f"{BASE}/api/tax/accountant-share").json()["accountant_token"]
    assert a != b
    # Old token must be dead
    assert requests.get(f"{BASE}/api/tax/public/accountant/{a}", timeout=30).status_code == 404
    pro_sess.delete(f"{BASE}/api/tax/accountant-share")


def test_homeowner_cannot_create_accountant_share():
    s = _login("homeowner@test.com", "Test123!")
    r = s.post(f"{BASE}/api/tax/accountant-share")
    assert r.status_code == 403


# ──────────────────────────────────────────────
# 4. USt-VA reminder dedup — verify via direct mongo (sync pymongo for test loop safety)
# ──────────────────────────────────────────────
def test_ustva_reminder_dedup_invariant():
    """The cron should never produce duplicate (user_id, kind, dedup_key) tuples.

    We don't fire the cron synchronously (motor's event loop isn't compatible
    with sync test code), but we verify the invariant on whatever's already in
    the collection — important for production safety.
    """
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    import os
    from pymongo import MongoClient
    client = MongoClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    seen = set()
    for doc in db.notifications.find({"kind": {"$in": ["tax_ustva_early", "tax_ustva_24h"]}}):
        key = (doc["user_id"], doc["kind"], doc.get("dedup_key"))
        assert key not in seen, f"duplicate USt-VA reminder: {key}"
        seen.add(key)
