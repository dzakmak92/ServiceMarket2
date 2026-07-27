"""Feature C — crew assignment, task dependencies, auto-shift, schedule + conflicts."""
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


def _pro():
    s = requests.Session()
    assert s.post(f"{API}/auth/login", json=PRO, timeout=30).status_code == 200
    return s


async def _make_project():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"]); db = c[os.environ["DB_NAME"]]
    u = await db.users.find_one({"email": "pro@test.com"})
    pp = await db.pro_profiles.find_one({"user_id": str(u["_id"])})
    now = datetime.now(timezone.utc)
    doc = {"pro_id": str(pp["_id"]), "job_id": str(ObjectId()), "title": "Sched PyTest",
           "status": "active", "quote_price_eur": 1000.0, "share_token": token_urlsafe(12),
           "share_enabled": True, "created_at": now, "updated_at": now}
    r = await db.pm_projects.insert_one(doc); c.close()
    return str(r.inserted_id)


async def _cleanup(pid):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"]); db = c[os.environ["DB_NAME"]]
    await db.pm_projects.delete_one({"_id": ObjectId(pid)})
    await db.pm_tasks.delete_many({"project_id": pid}); c.close()


@pytest.fixture(scope="module")
def pid():
    p = asyncio.get_event_loop().run_until_complete(_make_project())
    yield p
    asyncio.get_event_loop().run_until_complete(_cleanup(p))


@pytest.fixture(scope="module")
def pro():
    return _pro()


def _mk_task(pro, pid, title, assignee=None, start=None, due=None, depends_on=None):
    body = {"title": title, "column": "todo"}
    if assignee: body["assignee"] = assignee
    if start: body["start_at"] = start
    if due: body["due_at"] = due
    if depends_on: body["depends_on"] = depends_on
    r = pro.post(f"{API}/pm/projects/{pid}/tasks", json=body, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_assignee_and_autoshift(pro, pid):
    a = _mk_task(pro, pid, "Demo", assignee="Hans", start="2026-07-01T08:00:00Z", due="2026-07-03T17:00:00Z")
    b = _mk_task(pro, pid, "Tile", assignee="Hans", start="2026-07-02T08:00:00Z", due="2026-07-04T17:00:00Z", depends_on=a["id"])
    assert a["assignee"] == "Hans" and b["depends_on"] == a["id"]

    # move predecessor's due later -> dependent auto-shifts to start at/after new due
    pro.patch(f"{API}/pm/projects/{pid}/tasks/{a['id']}", json={"due_at": "2026-07-08T17:00:00Z"}, timeout=30)
    tasks = pro.get(f"{API}/pm/projects/{pid}/tasks", timeout=30).json()["tasks"]
    tile = next(t for t in tasks if t["id"] == b["id"])
    start = datetime.fromisoformat(tile["start_at"].replace("Z", "+00:00"))
    assert start >= datetime(2026, 7, 8, 17, 0, tzinfo=timezone.utc)


def test_schedule_endpoint_and_conflicts(pro, pid):
    # two overlapping tasks for the SAME assignee on a fresh project -> conflict
    _mk_task(pro, pid, "Job X", assignee="Petra", start="2026-08-01T08:00:00Z", due="2026-08-05T17:00:00Z")
    _mk_task(pro, pid, "Job Y", assignee="Petra", start="2026-08-03T08:00:00Z", due="2026-08-06T17:00:00Z")
    sched = pro.get(f"{API}/pm/schedule", timeout=30).json()
    assert "Petra" in sched["crew"]
    petra_conflicts = [c for c in sched["conflicts"] if c["assignee"] == "Petra"]
    assert len(petra_conflicts) >= 1
    # the conflicting tasks are flagged
    flagged = [t for t in sched["tasks"] if t.get("conflict") and t.get("assignee") == "Petra"]
    assert len(flagged) >= 2


def test_clear_assignee(pro, pid):
    t = _mk_task(pro, pid, "Cleanup", assignee="Temp")
    r = pro.patch(f"{API}/pm/projects/{pid}/tasks/{t['id']}", json={"assignee": ""}, timeout=30)
    assert r.status_code == 200 and r.json().get("assignee") in (None, "")
