"""Iter40 — share-in-conversation pay-link + admin fee notification side-effects + template list shape."""
import os
import requests
import pytest
from datetime import datetime, timezone

from bson import ObjectId
from pymongo import MongoClient

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


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


@pytest.fixture(scope="module")
def admin_sess():
    return _login("admin@servicemarket.eu", "Admin123!")


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


# ──────────────────────────────────────────────
# 1. /templates/list shape
# ──────────────────────────────────────────────
def test_templates_list_has_3_keys_no_description(pro_sess):
    r = pro_sess.get(f"{BASE}/api/pro-invoices/templates/list")
    assert r.status_code == 200
    d = r.json()
    assert len(d["templates"]) == 3
    keys = {t["key"] for t in d["templates"]}
    assert keys == {"pastel_mint", "pastel_grey", "pastel_rose"}
    for t in d["templates"]:
        assert "description" not in t, f"description should not appear in {t}"
        assert "name" in t and "key" in t


@pytest.mark.parametrize("legacy", ["classic", "modern", "minimalist", "bold", "elegant"])
def test_preview_legacy_keys_render_pdf(pro_sess, legacy):
    r = pro_sess.get(f"{BASE}/api/pro-invoices/templates/{legacy}/preview")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 2000


# ──────────────────────────────────────────────
# 2. share-in-conversation
# ──────────────────────────────────────────────
def _find_pro_invoice_with_job(mongo, pro_user_id):
    pro = mongo.pro_profiles.find_one({"user_id": str(pro_user_id)})
    if not pro:
        return None, None
    inv = mongo.pro_invoices.find_one({
        "pro_id": str(pro["_id"]),
        "job_id": {"$ne": None},
        "homeowner_id": {"$ne": None},
        "is_storno": {"$ne": True},
        "cancelled_by_storno_id": {"$exists": False},
        "payment_status": {"$nin": ["paid", "cancelled"]},
    })
    return pro, inv


def test_share_in_conversation_success(pro_sess, mongo):
    me = pro_sess.get(f"{BASE}/api/auth/me").json()
    pro_user_id = me["id"] if "id" in me else me.get("_id")
    pro, inv = _find_pro_invoice_with_job(mongo, pro_user_id)
    if not inv:
        pytest.skip("No invoice with job_id+homeowner_id found for test pro")
    invoice_id = str(inv["_id"])

    # Enable pay-link first
    e = pro_sess.post(f"{BASE}/api/pay-link/{invoice_id}/enable")
    if e.status_code == 400:
        pytest.skip(f"Could not enable pay-link: {e.text}")
    assert e.status_code == 200, e.text

    # Share in conversation
    r = pro_sess.post(f"{BASE}/api/pay-link/{invoice_id}/share-in-conversation")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["sent"] is True
    assert "message_id" in data
    assert "pay_url" in data
    assert "/pay/" in data["pay_url"]

    # Verify message was inserted
    msg = mongo.messages.find_one({"_id": ObjectId(data["message_id"])})
    assert msg is not None
    assert "Zahlungslink für Rechnung" in msg["text"]
    assert str(msg["job_id"]) == str(inv["job_id"])

    # Verify notification to homeowner
    homeowner_oid = ObjectId(inv["homeowner_id"]) if isinstance(inv["homeowner_id"], str) else inv["homeowner_id"]
    notif = mongo.notifications.find_one({
        "user_id": homeowner_oid,
        "kind": "pay_link_shared",
    }, sort=[("created_at", -1)])
    assert notif is not None
    assert notif["is_read"] is False


def test_share_in_conversation_400_when_paylink_disabled(pro_sess, mongo):
    me = pro_sess.get(f"{BASE}/api/auth/me").json()
    pro_user_id = me["id"] if "id" in me else me.get("_id")
    _, inv = _find_pro_invoice_with_job(mongo, pro_user_id)
    if not inv:
        pytest.skip("No suitable invoice")
    invoice_id = str(inv["_id"])
    # Disable the pay-link first
    pro_sess.post(f"{BASE}/api/pay-link/{invoice_id}/disable")
    r = pro_sess.post(f"{BASE}/api/pay-link/{invoice_id}/share-in-conversation")
    assert r.status_code == 400
    assert "pay-link" in r.text.lower() or "enable" in r.text.lower()


def test_share_in_conversation_404_for_other_pros_invoice(pro_sess):
    # Random non-existent invoice id (valid ObjectId format)
    fake = str(ObjectId())
    r = pro_sess.post(f"{BASE}/api/pay-link/{fake}/share-in-conversation")
    assert r.status_code == 404


def test_share_in_conversation_403_for_homeowner():
    s = _login("homeowner@test.com", "Test123!")
    fake = str(ObjectId())
    r = s.post(f"{BASE}/api/pay-link/{fake}/share-in-conversation")
    # homeowner does not have a pro_profile, so they get 404 (pro profile not found)
    assert r.status_code in (403, 404)


# ──────────────────────────────────────────────
# 3. Admin fee PATCH writes a notification
# ──────────────────────────────────────────────
def _seed_fee(mongo, pro_id, amount=10.0):
    fee = {
        "pro_id": pro_id,
        "job_id": str(ObjectId()),
        "amount": amount,
        "status": "pending",
        "kind": "contact_fee",
        "created_at": datetime.now(timezone.utc),
    }
    res = mongo.fee_log.insert_one(fee)
    return str(res.inserted_id), fee


def test_fee_cancel_creates_notification(admin_sess, pro_sess, mongo):
    me = pro_sess.get(f"{BASE}/api/auth/me").json()
    pro_user_id = me["id"] if "id" in me else me.get("_id")
    pro = mongo.pro_profiles.find_one({"user_id": pro_user_id})
    assert pro is not None

    fee_id, fee = _seed_fee(mongo, str(pro["_id"]), amount=12.34)
    pro_user_oid = pro["user_id"] if isinstance(pro["user_id"], ObjectId) else ObjectId(pro["user_id"])

    r = admin_sess.patch(
        f"{BASE}/api/admin/fees/{fee_id}",
        json={"status": "cancelled", "reason": "TEST_iter40 cancel"},
    )
    assert r.status_code == 200, r.text

    notif = mongo.notifications.find_one(
        {"user_id": pro_user_oid, "kind": "fee_cancelled"},
        sort=[("created_at", -1)],
    )
    assert notif is not None
    assert notif["link_to"] == "/billing"
    assert fee["job_id"][:8] in notif["body"]
    assert "TEST_iter40 cancel" in notif["body"]
    # cleanup
    mongo.fee_log.delete_one({"_id": ObjectId(fee_id)})
    mongo.notifications.delete_one({"_id": notif["_id"]})


def test_fee_adjust_amount_creates_notification(admin_sess, pro_sess, mongo):
    me = pro_sess.get(f"{BASE}/api/auth/me").json()
    pro_user_id = me["id"] if "id" in me else me.get("_id")
    pro = mongo.pro_profiles.find_one({"user_id": pro_user_id})
    fee_id, fee = _seed_fee(mongo, str(pro["_id"]), amount=20.0)
    pro_user_oid = pro["user_id"] if isinstance(pro["user_id"], ObjectId) else ObjectId(pro["user_id"])

    r = admin_sess.patch(
        f"{BASE}/api/admin/fees/{fee_id}",
        json={"amount": 5.0, "reason": "TEST_iter40 adjust"},
    )
    assert r.status_code == 200, r.text

    notif = mongo.notifications.find_one(
        {"user_id": pro_user_oid, "kind": "fee_adjusted"},
        sort=[("created_at", -1)],
    )
    assert notif is not None
    assert "TEST_iter40 adjust" in notif["body"]
    assert "€20.00" in notif["body"] and "€5.00" in notif["body"]
    # cleanup
    mongo.fee_log.delete_one({"_id": ObjectId(fee_id)})
    mongo.notifications.delete_one({"_id": notif["_id"]})
