"""Iter 63 supplemental: explicit guard / role / language tests for the
Job File PDF export endpoints using the seeded project IDs from the request.
"""
import os
import pytest
import requests


def _read_frontend_env():
    try:
        with open("/app/frontend/.env", "r") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL

DONE_PID = "6a284a8f939d4f5bf9b5db10"
# Seed has shifted; previously-active project is now done. Pick a truly active project at runtime.
ACTIVE_PID_FALLBACK = "6a283c58573a159e6192ab8d"


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def pro():
    return _login("pro@test.com", "Test123!")


@pytest.fixture(scope="module")
def homeowner():
    return _login("homeowner@test.com", "Test123!")


def _assert_pdf(r):
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    assert "application/pdf" in r.headers.get("content-type", "")
    assert r.content[:5] == b"%PDF-"
    assert len(r.content) > 1500


@pytest.mark.parametrize("lang", ["en", "de", "tr", "es"])
def test_pro_export_all_langs_for_done_project(pro, lang):
    r = pro.get(f"{BASE_URL}/api/pm/projects/{DONE_PID}/export-pdf", params={"lang": lang}, timeout=60)
    _assert_pdf(r)


def _pick_active_pid(sess):
    r = sess.get(f"{BASE_URL}/api/pm/projects", timeout=20)
    for p in r.json().get("projects", []):
        if p.get("status") == "active":
            return p["id"]
    return ACTIVE_PID_FALLBACK


def test_pro_export_blocked_on_active_project(pro):
    pid = _pick_active_pid(pro)
    r = pro.get(f"{BASE_URL}/api/pm/projects/{pid}/export-pdf", params={"lang": "en"}, timeout=30)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"


@pytest.mark.parametrize("lang", ["en", "de", "tr", "es"])
def test_homeowner_export_all_langs_for_done_project(homeowner, lang):
    r = homeowner.get(f"{BASE_URL}/api/pm/my-projects/{DONE_PID}/export-pdf", params={"lang": lang}, timeout=60)
    _assert_pdf(r)


def test_homeowner_export_blocked_on_active_project(pro, homeowner):
    pid = _pick_active_pid(pro)
    r = homeowner.get(f"{BASE_URL}/api/pm/my-projects/{pid}/export-pdf", params={"lang": "en"}, timeout=30)
    # may be 400 (not done) or 403/404 if homeowner doesn't own it
    assert r.status_code in (400, 403, 404), f"got {r.status_code}: {r.text[:200]}"


def test_pro_hitting_homeowner_endpoint_is_forbidden(pro):
    r = pro.get(f"{BASE_URL}/api/pm/my-projects/{DONE_PID}/export-pdf", params={"lang": "en"}, timeout=30)
    assert r.status_code == 403
