"""Feature A — Change Orders (Nachträge) + client portal + payment requests."""
import os
import asyncio
import requests
import pytest
from datetime import datetime, timezone
from secrets import token_urlsafe

from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).resolve().parent.parent / '.env')
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
PRO = {"email": "pro@test.com", "password": "Test123!"}


def _pro_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=PRO, timeout=30)
    assert r.status_code == 200, r.text
    return s


async def _make_project():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"]); db = c[os.environ["DB_NAME"]]
    u = await db.users.find_one({"email": "pro@test.com"})
    pp = await db.pro_profiles.find_one({"user_id": str(u["_id"])})
    ho = await db.users.find_one({"email": "homeowner@test.com"})
    now = datetime.now(timezone.utc)
    share = token_urlsafe(16)
    doc = {
        "pro_id": str(pp["_id"]), "job_id": str(ObjectId()), "job_title": "PyTest reno",
        "job_category": "plumbing", "quote_price_eur": 2000.0, "title": "PyTest CO Project",
        "status": "active", "customer": {"homeowner_id": str(ho["_id"]), "name": "Test HO"},
        "share_token": share, "share_enabled": True, "hourly_rate_eur": 60.0,
        "created_at": now, "updated_at": now,
    }
    r = await db.pm_projects.insert_one(doc)
    c.close()
    return str(r.inserted_id), share


async def _cleanup(pid):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"]); db = c[os.environ["DB_NAME"]]
    await db.pm_projects.delete_one({"_id": ObjectId(pid)})
    await db.pm_change_orders.delete_many({"project_id": pid})
    await db.pm_payment_requests.delete_many({"project_id": pid})
    c.close()


@pytest.fixture(scope="module")
def project():
    pid, share = asyncio.get_event_loop().run_until_complete(_make_project())
    yield pid, share
    asyncio.get_event_loop().run_until_complete(_cleanup(pid))


@pytest.fixture(scope="module")
def pro():
    return _pro_session()


def test_change_order_lifecycle(pro, project):
    pid, share = project
    # create
    r = pro.post(f"{API}/pm/projects/{pid}/change-orders", json={
        "title": "Extra waterproofing", "description": "rot found",
        "items": [{"description": "Membrane", "qty": 10, "unit_net": 20}, {"description": "Labour", "qty": 3, "unit_net": 60}],
        "vat_rate": 20,
    }, timeout=30)
    assert r.status_code == 200, r.text
    co = r.json()
    assert co["net_total"] == 380.0 and co["brutto_total"] == 456.0
    assert co["status"] == "draft" and co["number"] == "CO-001"
    coid = co["id"]

    # cannot invoice a draft
    assert pro.post(f"{API}/pm/projects/{pid}/change-orders/{coid}/to-invoice", timeout=30).status_code == 400

    # send -> sent
    assert pro.post(f"{API}/pm/projects/{pid}/change-orders/{coid}/send", timeout=30).json()["status"] == "sent"

    # portal shows it as sent
    portal = requests.get(f"{API}/pm/public/{share}", timeout=30).json()
    assert any(c["id"] == coid and c["status"] == "sent" for c in portal["change_orders"])

    # client approves (e-sign)
    ap = requests.post(f"{API}/pm/public/{share}/change-orders/{coid}/approve", json={"name": "Maria Test"}, timeout=30)
    assert ap.status_code == 200 and ap.json()["status"] == "approved"

    # portal financials now include the approved extra
    portal = requests.get(f"{API}/pm/public/{share}", timeout=30).json()
    assert portal["financials"]["approved_extras_net_eur"] == 380.0
    assert portal["financials"]["new_total_net_eur"] == 2380.0

    # now invoiceable
    inv = pro.post(f"{API}/pm/projects/{pid}/change-orders/{coid}/to-invoice", timeout=30)
    assert inv.status_code == 200 and len(inv.json()["line_items"]) == 2

    # approved CO can't be edited
    assert pro.patch(f"{API}/pm/projects/{pid}/change-orders/{coid}", json={"title": "x"}, timeout=30).status_code == 400


def test_change_order_reject(pro, project):
    pid, share = project
    co = pro.post(f"{API}/pm/projects/{pid}/change-orders", json={"title": "Optional skylight", "items": [{"description": "Skylight", "qty": 1, "unit_net": 500}]}, timeout=30).json()
    pro.post(f"{API}/pm/projects/{pid}/change-orders/{co['id']}/send", timeout=30)
    rj = requests.post(f"{API}/pm/public/{share}/change-orders/{co['id']}/reject", json={"name": "Maria Test", "note": "too pricey"}, timeout=30)
    assert rj.status_code == 200 and rj.json()["status"] == "rejected"


def test_payment_request_flow(pro, project):
    pid, share = project
    p = pro.post(f"{API}/pm/projects/{pid}/payments", json={"label": "Milestone 1", "amount_eur": 800, "source": "milestone"}, timeout=30)
    assert p.status_code == 200, p.text
    pay = p.json()
    assert pay["status"] == "requested" and pay["reference"] == "PAY-001"

    # portal exposes the payment + an EPC-QR (test pro has IBAN)
    portal = requests.get(f"{API}/pm/public/{share}", timeout=30).json()
    pp = next(x for x in portal["payments"] if x["id"] == pay["id"])
    assert pp["epc_qr_base64"] and pp["epc_qr_base64"].startswith("data:image/png;base64,")

    # client marks paid
    cm = requests.post(f"{API}/pm/public/{share}/payments/{pay['id']}/client-paid", timeout=30)
    assert cm.status_code == 200 and cm.json()["status"] == "client_marked_paid"

    # pro confirms paid
    mp = pro.post(f"{API}/pm/projects/{pid}/payments/{pay['id']}/mark-paid", timeout=30)
    assert mp.status_code == 200 and mp.json()["status"] == "paid"
