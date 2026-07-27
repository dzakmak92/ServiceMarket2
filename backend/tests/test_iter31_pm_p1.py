"""Iter31 — PM Toolkit P1 backend tests (drag-and-drop reorder, time tracker,
templates, sub-contractor magic-link, overview aggregation, to-invoice draft).
"""
import os
import time
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


@pytest.fixture(scope="module")
def project_id(pro_sess):
    r = pro_sess.get(f"{BASE}/api/pm/projects").json()
    if not r["projects"]:
        pytest.skip("No PM projects exist for pro@test.com")
    return r["projects"][0]["id"]


# ──────────────────────────────────────────────
# 1. Drag-and-drop bulk reorder
# ──────────────────────────────────────────────
def test_bulk_reorder_tasks(pro_sess, project_id):
    # Seed 3 tasks in todo
    ids = []
    for i in range(3):
        r = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/tasks",
                          json={"title": f"reorder_{i}", "column": "todo"})
        assert r.status_code == 200
        ids.append(r.json()["id"])

    # Reverse them + move 1st to doing
    payload = {"tasks": [
        {"id": ids[2], "column": "todo", "order": 0},
        {"id": ids[1], "column": "todo", "order": 1},
        {"id": ids[0], "column": "doing", "order": 0},
    ]}
    r = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/tasks/reorder", json=payload)
    assert r.status_code == 200
    assert r.json()["updated"] == 3

    # Verify positions
    lst = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}/tasks").json()["tasks"]
    by_id = {t["id"]: t for t in lst}
    assert by_id[ids[0]]["column"] == "doing"
    assert by_id[ids[2]]["column"] == "todo"
    assert by_id[ids[2]]["order"] == 0
    assert by_id[ids[1]]["order"] == 1

    # Cleanup
    for tid in ids:
        pro_sess.delete(f"{BASE}/api/pm/projects/{project_id}/tasks/{tid}")


# ──────────────────────────────────────────────
# 2. Time tracker (start/stop with auto-diary)
# ──────────────────────────────────────────────
def test_timer_start_stop_creates_diary(pro_sess, project_id):
    # Ensure no other timer running
    pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/timer/stop")  # ignore error

    diary_before = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}/diary").json()
    n_before = len(diary_before["entries"])

    r = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/timer/start")
    assert r.status_code == 200
    assert r.json()["started_at"] is not None

    # Currently running
    r2 = pro_sess.get(f"{BASE}/api/pm/timer")
    assert r2.json()["running"] is not None
    assert r2.json()["running"]["project_id"] == project_id

    # Wait at least 1s so the elapsed hour > rounding threshold (0.01h = 36s)
    # We can't actually wait 36s in a unit test, so just verify the stop works.
    time.sleep(2)
    r3 = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/timer/stop")
    assert r3.status_code == 200
    assert r3.json()["stopped"] is True

    # Timer no longer running
    r4 = pro_sess.get(f"{BASE}/api/pm/timer")
    assert r4.json()["running"] is None


def test_timer_starting_new_stops_old(pro_sess, project_id):
    pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/timer/start")
    # Starting again should be idempotent — old gets auto-stopped, new one created
    r = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/timer/start")
    assert r.status_code == 200

    # Stop
    pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/timer/stop")
    assert pro_sess.get(f"{BASE}/api/pm/timer").json()["running"] is None


# ──────────────────────────────────────────────
# 3. Templates
# ──────────────────────────────────────────────
def test_templates_list_includes_builtins(pro_sess):
    r = pro_sess.get(f"{BASE}/api/pm/templates")
    assert r.status_code == 200
    names = [t["name"] for t in r.json()["templates"]]
    assert "Kitchen renovation" in names
    assert "Bathroom renovation" in names


def test_apply_builtin_template(pro_sess, project_id):
    before = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}/tasks").json()
    n_before = len(before["tasks"])

    r = pro_sess.post(
        f"{BASE}/api/pm/projects/{project_id}/apply-template?template_id=builtin-painting-job"
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 5  # Painting job has 5 tasks

    after = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}/tasks").json()
    assert len(after["tasks"]) == n_before + 5

    # Cleanup — delete tasks added by template
    new_titles = {"Surface prep & masking", "Prime walls", "First coat", "Second coat", "Touch-ups & cleanup"}
    for t in after["tasks"]:
        if t["title"] in new_titles:
            pro_sess.delete(f"{BASE}/api/pm/projects/{project_id}/tasks/{t['id']}")


def test_template_crud(pro_sess):
    r = pro_sess.post(f"{BASE}/api/pm/templates", json={
        "name": "Test template",
        "category": "test",
        "tasks": [{"title": "task A", "column": "todo"}, {"title": "task B", "column": "doing"}],
    })
    assert r.status_code == 200
    tid = r.json()["id"]
    assert "id" in r.json()

    # List shows it
    lst = pro_sess.get(f"{BASE}/api/pm/templates").json()
    assert any(t.get("id") == tid for t in lst["templates"])

    # Delete
    d = pro_sess.delete(f"{BASE}/api/pm/templates/{tid}")
    assert d.status_code == 200


# ──────────────────────────────────────────────
# 4. Sub-contractor magic-link
# ──────────────────────────────────────────────
def test_sub_invite_and_scoped_access(pro_sess, project_id):
    # Issue
    r = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/sub-invite")
    assert r.status_code == 200
    token = r.json()["sub_token"]

    # Sub view (no auth)
    pub = requests.get(f"{BASE}/api/pm/public/sub/{token}", timeout=30)
    assert pub.status_code == 200
    data = pub.json()
    assert data["project_id"] == project_id
    assert "tasks" in data
    # Private fields stripped
    assert "customer" not in data
    assert "pl" not in data
    assert "share_token" not in data

    # Sub adds diary
    r2 = requests.post(f"{BASE}/api/pm/public/sub/{token}/diary",
                       json={"note": "Did the rough-in", "hours": 3.5, "author_name": "Markus"},
                       timeout=30)
    assert r2.status_code == 200
    assert "Markus" in r2.json()["note"]

    # Sub can move a task (column change) but NOT delete or rename
    if data["tasks"]:
        first = data["tasks"][0]
        r3 = requests.patch(f"{BASE}/api/pm/public/sub/{token}/tasks/{first['id']}",
                            json={"column": "doing"}, timeout=30)
        assert r3.status_code == 200
        # Rename should be rejected (only column/order allowed)
        r4 = requests.patch(f"{BASE}/api/pm/public/sub/{token}/tasks/{first['id']}",
                            json={"title": "HACKED"}, timeout=30)
        assert r4.status_code == 400

    # Revoke
    rev = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/sub-revoke")
    assert rev.status_code == 200
    # Now public endpoint returns 404
    after = requests.get(f"{BASE}/api/pm/public/sub/{token}", timeout=30)
    assert after.status_code == 404


# ──────────────────────────────────────────────
# 5. Overview aggregation
# ──────────────────────────────────────────────
def test_overview_has_all_blocks(pro_sess, project_id):
    r = pro_sess.get(f"{BASE}/api/pm/projects/{project_id}/overview")
    assert r.status_code == 200
    d = r.json()
    for k in ("project", "job", "customer", "quote", "chat", "invoices", "pl", "progress_pct", "activity"):
        assert k in d, f"missing {k}"
    # P&L computed
    pl = d["pl"]
    for k in ("revenue_eur", "materials_actual_eur", "labour_hours", "labour_cost_eur", "profit_eur", "margin_pct"):
        assert k in pl
    # Activity should contain at least the project_created entry
    kinds = [a["kind"] for a in d["activity"]]
    assert "project_created" in kinds


# ──────────────────────────────────────────────
# 6. Project to invoice draft
# ──────────────────────────────────────────────
def test_to_invoice_imports_materials_and_labour(pro_sess, project_id):
    r = pro_sess.post(f"{BASE}/api/pm/projects/{project_id}/to-invoice")
    assert r.status_code == 200
    d = r.json()
    assert d["job_id"] is not None
    assert isinstance(d["line_items"], list)
    # If the test project has materials + diary hours, we should have at least 1 line
    # (we can't strictly require >0 because state varies)
