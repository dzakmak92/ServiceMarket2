"""Iter30 — PM (Project Management) Toolkit P0 backend tests.

Covers: pricing.has all toolkits + bundle, has_pm_toolkit RBAC, full CRUD on
projects/tasks/materials/diary, materials totals + variance, public read-only
status-page gating.
"""
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
        pytest.skip(f"login failed {email}: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def pro_sess():
    return _login("pro@test.com", "Test123!")


@pytest.fixture(scope="module")
def project_id(pro_sess):
    # Find a won quote we can bootstrap a project from
    qs = pro_sess.get(f"{BASE}/api/quotes").json().get("quotes", [])
    wins = [q for q in qs if q.get("status") == "accepted"]
    if not wins:
        pytest.skip("No accepted quotes for pro@test.com")
    # Try a few different won jobs in case the first already has a project
    last_err = None
    for q in wins:
        r = pro_sess.post(f"{BASE}/api/pm/projects", json={"job_id": q["job_id"]})
        if r.status_code == 200:
            return r.json()["id"]
        last_err = r.text
    pytest.skip(f"Could not bootstrap a PM project: {last_err}")


# ──────────────────────────────────────────────
# 1. Project CRUD
# ──────────────────────────────────────────────
def test_create_project_idempotent(pro_sess, project_id):
    """Re-posting the same job_id returns the same project id."""
    # Find the job for that project
    proj = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}").json()
    again = pro_sess.post(f"{BASE}/api/pm/projects", json={"job_id": proj["job_id"]}).json()
    assert again["id"] == project_id


def test_list_projects(pro_sess, project_id):
    r = pro_sess.get(f"{BASE}/api/pm/projects").json()
    ids = [p["id"] for p in r["projects"]]
    assert project_id in ids


def test_patch_project_status_note(pro_sess, project_id):
    r = pro_sess.patch(f"{BASE}/api/pm/projects/{project_id}",
                       json={"customer_status_note": "We will finish by Friday."})
    assert r.status_code == 200
    assert r.json()["customer_status_note"] == "We will finish by Friday."


def test_create_project_requires_won_quote(pro_sess):
    r = pro_sess.post(f"{BASE}/api/pm/projects", json={"job_id": "000000000000000000000000"})
    assert r.status_code in (400, 404), r.text


# ──────────────────────────────────────────────
# 2. Tasks Kanban
# ──────────────────────────────────────────────
def test_task_crud_and_move(pro_sess, project_id):
    # Create
    r = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/tasks",
                      json={"title": "Buy tiles", "column": "todo"})
    assert r.status_code == 200, r.text
    task = r.json()
    tid = task["id"]
    assert task["column"] == "todo"

    # List shows it
    lst = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}/tasks").json()
    assert any(t["id"] == tid for t in lst["tasks"])

    # Patch to doing
    p = pro_sess.patch(f"{BASE}/api/pm/projects/{project_id}/tasks/{tid}",
                      json={"column": "doing"})
    assert p.status_code == 200
    assert p.json()["column"] == "doing"

    # Delete
    d = pro_sess.delete(f"{BASE}/api/pm/projects/{project_id}/tasks/{tid}")
    assert d.status_code == 200


# ──────────────────────────────────────────────
# 3. Materials with totals
# ──────────────────────────────────────────────
def test_material_totals_and_variance(pro_sess, project_id):
    # Clean slate — delete any materials already there
    existing = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}/materials").json()
    for m in existing["materials"]:
        pro_sess.delete(f"{BASE}/api/pm/projects/{project_id}/materials/{m['id']}")

    r1 = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/materials",
                       json={"name": "Tiles", "qty": 10, "unit": "m²",
                             "planned_cost": 400.0, "actual_cost": 420.0})
    assert r1.status_code == 200
    r2 = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/materials",
                       json={"name": "Cement", "qty": 5, "unit": "bag",
                             "planned_cost": 50.0, "actual_cost": 45.0})
    assert r2.status_code == 200

    lst = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}/materials").json()
    assert lst["totals"]["planned"] == 450.0
    assert lst["totals"]["actual"] == 465.0
    assert lst["totals"]["variance"] == 15.0


# ──────────────────────────────────────────────
# 4. Diary
# ──────────────────────────────────────────────
def test_diary_crud_and_total_hours(pro_sess, project_id):
    # Reset
    existing = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}/diary").json()
    for e in existing["entries"]:
        pro_sess.delete(f"{BASE}/api/pm/projects/{project_id}/diary/{e['id']}")

    pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/diary",
                 json={"note": "Demolished tiles", "hours": 4.5})
    pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/diary",
                 json={"note": "Bought materials", "hours": 1.5})

    lst = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}/diary").json()
    assert lst["total_hours"] == 6.0
    assert len(lst["entries"]) == 2


# ──────────────────────────────────────────────
# 5. Public share page
# ──────────────────────────────────────────────
def test_public_share_no_auth(pro_sess, project_id):
    proj = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}").json()
    token = proj["share_token"]

    # Unauthenticated request to public endpoint
    r = requests.get(f"{BASE}/api/pm/public/{token}", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["project_id"] == project_id
    assert "progress_pct" in body
    assert "pro" in body
    assert "tasks_total" in body
    # No private fields leaked
    assert "share_token" not in body
    assert "notes" not in body  # internal-only


def test_public_share_404_on_bad_token():
    r = requests.get(f"{BASE}/api/pm/public/this-is-not-a-real-token", timeout=30)
    assert r.status_code == 404


def test_rotate_share_token_invalidates_old(pro_sess, project_id):
    proj = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}").json()
    old_token = proj["share_token"]
    new = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/rotate-share-token").json()
    assert new["share_token"] != old_token
    # Old token should now 404
    r_old = requests.get(f"{BASE}/api/pm/public/{old_token}", timeout=30)
    assert r_old.status_code == 404
    r_new = requests.get(f"{BASE}/api/pm/public/{new['share_token']}", timeout=30)
    assert r_new.status_code == 200


# ──────────────────────────────────────────────
# 6. RBAC
# ──────────────────────────────────────────────
def test_homeowner_blocked_from_pm():
    s = _login("homeowner@test.com", "Test123!")
    r = s.get(f"{BASE}/api/pm/projects")
    assert r.status_code == 403


def test_pricing_exposes_pm_toolkit(pro_sess):
    p = pro_sess.get(f"{BASE}/api/billing/pricing").json()
    assert "pm" in p["toolkits"]
    pm = p["toolkits"]["pm"]
    assert pm["standard_net"] == 29.99
    assert pm["pro_net"] == 19.99
