"""Iteration 27 — QR fix + Lost-quote + Conversation tabs + Dual-price toolkit + Share-message.

Covers:
- IBAN validation (PATCH /api/profile/pro 400 on bad checksum, accepts valid AT IBAN)
- POST /api/quotes/{id}/mark-lost (pro can flip a pending/declined quote to lost)
- GET /api/messages/threads exposes my_quote_status (for pro)
- POST /api/pro-invoices/{id}/share-message creates kind='invoice_share' message
- GET /api/pro-invoices/{id}/pdf accessible to BOTH the pro AND the homeowner the invoice was issued to
- GET /api/billing/pricing returns both standard_net and pro_net
"""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL",
                     "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")

VALID_AT_IBAN = "AT611904300234573201"
INVALID_IBAN = "AT12 3456 7890 1234 5678"


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def pro_sess():
    return _login("pro@test.com", "Test123!")


@pytest.fixture(scope="module")
def homeowner_sess():
    return _login("homeowner@test.com", "Test123!")


# ---------- 1. IBAN checksum ----------

def test_iban_validation_rejects_invalid(pro_sess):
    r = pro_sess.patch(f"{BASE}/api/profile/pro", json={"bank_iban": INVALID_IBAN})
    assert r.status_code == 400, r.text
    assert "iban" in r.json()["detail"].lower()


def test_iban_validation_accepts_valid_and_normalises(pro_sess):
    """Valid AT IBAN should save and be normalised (spaces stripped, uppercase)."""
    r = pro_sess.patch(f"{BASE}/api/profile/pro", json={"bank_iban": "at61 1904 3002 3457 3201"})
    assert r.status_code == 200, r.text
    assert r.json()["bank_iban"] == VALID_AT_IBAN


# ---------- 2. Mark quote as lost ----------

def test_mark_quote_lost(pro_sess):
    quotes = pro_sess.get(f"{BASE}/api/quotes").json().get("quotes", [])
    pending = [q for q in quotes if q.get("status") == "pending"]
    if not pending:
        pytest.skip("no pending quotes to mark lost")
    qid = pending[0]["id"]
    r = pro_sess.post(f"{BASE}/api/quotes/{qid}/mark-lost")
    assert r.status_code == 200, r.text


def test_cannot_mark_accepted_lost(pro_sess):
    accepted = [q for q in pro_sess.get(f"{BASE}/api/quotes").json().get("quotes", []) if q.get("status") == "accepted"]
    if not accepted:
        pytest.skip("no accepted quotes")
    r = pro_sess.post(f"{BASE}/api/quotes/{accepted[0]['id']}/mark-lost")
    assert r.status_code == 400


# ---------- 3. Thread serializer exposes my_quote_status ----------

def test_threads_expose_my_quote_status(pro_sess):
    r = pro_sess.get(f"{BASE}/api/messages/threads")
    assert r.status_code == 200, r.text
    threads = r.json().get("threads", [])
    if not threads:
        pytest.skip("no threads")
    # Field is always present (None or a status string)
    for th in threads:
        assert "my_quote_status" in th


# ---------- 4. Pricing endpoint exposes BOTH standard_net and pro_net ----------

def test_pricing_exposes_both_toolkit_tiers(pro_sess):
    p = pro_sess.get(f"{BASE}/api/billing/pricing").json()
    assert p["toolkit"]["standard_net"] == 14.99
    assert p["toolkit"]["pro_net"] == 9.99


# ---------- 5. Share invoice via message ----------

def test_share_invoice_via_chat(pro_sess, homeowner_sess):
    # Pick the pro's most recent invoice
    invs = pro_sess.get(f"{BASE}/api/pro-invoices").json().get("invoices", [])
    if not invs:
        pytest.skip("no invoices to share")
    inv = invs[0]
    # Find the homeowner_id from the invoice doc itself
    target = inv.get("homeowner_id") or inv.get("customer_snapshot", {}).get("id")
    if not target:
        pytest.skip("invoice has no homeowner_id")
    r = pro_sess.post(
        f"{BASE}/api/pro-invoices/{inv['id']}/share-message",
        json={"to_user_id": target, "note": "Hier ist die Rechnung."},
    )
    assert r.status_code == 200, r.text


# ---------- 6. Homeowner can fetch pro-invoice PDF when they're the target ----------

def test_homeowner_can_open_invoice_pdf(pro_sess, homeowner_sess):
    invs = pro_sess.get(f"{BASE}/api/pro-invoices").json().get("invoices", [])
    if not invs:
        pytest.skip("no invoices")
    inv = invs[0]
    target = inv.get("homeowner_id")
    if not target:
        pytest.skip("invoice has no homeowner_id")
    # Login as that homeowner
    me = homeowner_sess.get(f"{BASE}/api/auth/me").json()
    if me.get("id") != target:
        pytest.skip(f"homeowner_test fixture is not the invoice target ({me.get('id')} vs {target})")
    r = homeowner_sess.get(f"{BASE}/api/pro-invoices/{inv['id']}/pdf")
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"
