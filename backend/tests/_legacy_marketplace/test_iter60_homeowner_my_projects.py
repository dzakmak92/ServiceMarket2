"""Iter 60 - Homeowner 'My Projects' feature end-to-end backend tests.

Validates:
- GET /api/pm/my-projects (list, scoped to logged-in homeowner)
- GET /api/pm/my-projects/{id} (detail incl job_id + pro_user_id)
- POST /api/pm/my-projects/{id}/change-orders/{co}/approve|reject (action parity w/ portal)
- POST /api/pm/my-projects/{id}/payments/{pay}/client-paid
- Authorization: pro user gets 403; cross-homeowner gets 404
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")

HOMEOWNER = {"email": "homeowner@test.com", "password": "Test123!"}
PRO = {"email": "pro@test.com", "password": "Test123!"}

HO_ID = "6a14b72e05a5dee99e39fd13"
PROJ_CO_TEST = "6a283c58573a159e6192ab8d"          # has payments
PROJ_BATHROOM = "6a284a8f939d4f5bf9b5db10"         # used for CO approve/reject parity


def login(session: requests.Session, creds: dict) -> requests.Session:
    r = session.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return session


@pytest.fixture(scope="module")
def homeowner_session():
    s = requests.Session()
    return login(s, HOMEOWNER)


@pytest.fixture(scope="module")
def pro_session():
    s = requests.Session()
    return login(s, PRO)


# ── List ───────────────────────────────────────────────────────────
class TestList:
    def test_list_returns_homeowner_projects(self, homeowner_session):
        r = homeowner_session.get(f"{BASE_URL}/api/pm/my-projects", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "projects" in data and isinstance(data["projects"], list)
        ids = {p["id"] for p in data["projects"]}
        assert PROJ_CO_TEST in ids, f"expected project {PROJ_CO_TEST} in list: {ids}"
        assert PROJ_BATHROOM in ids, f"expected project {PROJ_BATHROOM} in list: {ids}"
        # field shape sanity
        sample = data["projects"][0]
        for key in ("id", "title", "status", "progress_pct", "tasks_total",
                    "tasks_done", "pending_change_orders", "due_payments", "pro_name"):
            assert key in sample, f"missing key {key} in {sample}"

    def test_pro_cannot_list_homeowner_projects(self, pro_session):
        r = pro_session.get(f"{BASE_URL}/api/pm/my-projects", timeout=20)
        assert r.status_code == 403, f"expected 403 for pro, got {r.status_code}: {r.text}"


# ── Detail ─────────────────────────────────────────────────────────
class TestDetail:
    def test_detail_has_job_and_pro_user(self, homeowner_session):
        r = homeowner_session.get(f"{BASE_URL}/api/pm/my-projects/{PROJ_CO_TEST}", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "job_id" in d
        assert "pro_user_id" in d and d["pro_user_id"]
        assert "payments" in d
        assert "change_orders" in d
        assert "financials" in d

    def test_detail_unknown_id_404(self, homeowner_session):
        r = homeowner_session.get(f"{BASE_URL}/api/pm/my-projects/000000000000000000000000", timeout=20)
        assert r.status_code == 404

    def test_pro_cannot_get_homeowner_detail(self, pro_session):
        r = pro_session.get(f"{BASE_URL}/api/pm/my-projects/{PROJ_CO_TEST}", timeout=20)
        assert r.status_code == 403


# ── CO action parity ────────────────────────────────────────────────
def _create_and_send_co(pro_s: requests.Session, project_id: str, title: str) -> str:
    """Pro creates + sends a change order on a project. Returns co_id."""
    payload = {
        "title": title,
        "items": [{"description": "Extra fittings", "qty": 1, "unit_net": 120.0}],
    }
    r = pro_s.post(f"{BASE_URL}/api/pm/projects/{project_id}/change-orders", json=payload, timeout=20)
    assert r.status_code in (200, 201), f"co create failed: {r.status_code} {r.text}"
    co = r.json()
    co_id = co.get("id") or co.get("_id")
    assert co_id, f"no co id in response: {co}"
    r2 = pro_s.post(f"{BASE_URL}/api/pm/projects/{project_id}/change-orders/{co_id}/send", timeout=20)
    assert r2.status_code in (200, 204), f"co send failed: {r2.status_code} {r2.text}"
    return co_id


class TestChangeOrderActionParity:
    def test_homeowner_approves_co_increases_total(self, pro_session, homeowner_session):
        # snapshot financials BEFORE
        det0 = homeowner_session.get(f"{BASE_URL}/api/pm/my-projects/{PROJ_BATHROOM}", timeout=20).json()
        total_before = det0["financials"]["new_total_net_eur"]

        co_id = _create_and_send_co(pro_session, PROJ_BATHROOM, "TEST_iter60 approve CO")

        # homeowner approves
        r = homeowner_session.post(
            f"{BASE_URL}/api/pm/my-projects/{PROJ_BATHROOM}/change-orders/{co_id}/approve",
            json={"name": "Anna Müller"}, timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "approved"

        # verify flip + total increased by 120
        det1 = homeowner_session.get(f"{BASE_URL}/api/pm/my-projects/{PROJ_BATHROOM}", timeout=20).json()
        co = next(c for c in det1["change_orders"] if c["id"] == co_id)
        assert co["status"] == "approved"
        assert det1["financials"]["new_total_net_eur"] == pytest.approx(total_before + 120.0, abs=0.01)

    def test_homeowner_rejects_co(self, pro_session, homeowner_session):
        co_id = _create_and_send_co(pro_session, PROJ_BATHROOM, "TEST_iter60 reject CO")
        r = homeowner_session.post(
            f"{BASE_URL}/api/pm/my-projects/{PROJ_BATHROOM}/change-orders/{co_id}/reject",
            json={"name": "Anna Müller", "note": "not needed"}, timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "rejected"

        det = homeowner_session.get(f"{BASE_URL}/api/pm/my-projects/{PROJ_BATHROOM}", timeout=20).json()
        co = next(c for c in det["change_orders"] if c["id"] == co_id)
        assert co["status"] == "rejected"

    def test_reapproving_already_decided_co_400(self, pro_session, homeowner_session):
        co_id = _create_and_send_co(pro_session, PROJ_BATHROOM, "TEST_iter60 double-approve")
        ok = homeowner_session.post(
            f"{BASE_URL}/api/pm/my-projects/{PROJ_BATHROOM}/change-orders/{co_id}/approve",
            json={"name": "Anna Müller"}, timeout=20,
        )
        assert ok.status_code == 200
        again = homeowner_session.post(
            f"{BASE_URL}/api/pm/my-projects/{PROJ_BATHROOM}/change-orders/{co_id}/approve",
            json={"name": "Anna Müller"}, timeout=20,
        )
        assert again.status_code == 400


# ── Payment client-paid ─────────────────────────────────────────────
class TestClientPaid:
    def test_mark_payment_paid(self, homeowner_session):
        det = homeowner_session.get(f"{BASE_URL}/api/pm/my-projects/{PROJ_CO_TEST}", timeout=20).json()
        pays = det.get("payments") or []
        # pick a payment that is requested (not already paid/marked)
        target = next((p for p in pays if p.get("status") == "requested"), None)
        if not target:
            pytest.skip("No requested payment available to mark (already marked/paid)")
        pay_id = target["id"]
        r = homeowner_session.post(
            f"{BASE_URL}/api/pm/my-projects/{PROJ_CO_TEST}/payments/{pay_id}/client-paid", timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("status") in ("client_marked_paid", "paid")

        # verify persisted
        det2 = homeowner_session.get(f"{BASE_URL}/api/pm/my-projects/{PROJ_CO_TEST}", timeout=20).json()
        pay = next(p for p in det2["payments"] if p["id"] == pay_id)
        assert pay["status"] in ("client_marked_paid", "paid")

    def test_pro_cannot_call_homeowner_action(self, pro_session):
        # Pro user should be blocked from approving via the homeowner endpoint.
        r = pro_session.post(
            f"{BASE_URL}/api/pm/my-projects/{PROJ_BATHROOM}/change-orders/000000000000000000000000/approve",
            json={"name": "Anna Müller"}, timeout=20,
        )
        assert r.status_code == 403, f"expected 403 for pro, got {r.status_code}: {r.text}"
