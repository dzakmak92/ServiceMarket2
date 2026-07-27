"""Iter 63: Job File PDF export for completed PM projects.

- Pro can export a completed project's Job File PDF in all 4 langs (en/de/tr/es).
- Returned content is a valid PDF (application/pdf + %PDF magic + multi-section).
- Export is blocked (400) for non-completed projects.
- Homeowner can export their own completed project's Job File.
- Role scoping: a pro hitting the homeowner endpoint gets 403.

Uses cookie-based auth via POST /api/auth/login.
"""
import io
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
assert BASE_URL, "REACT_APP_BACKEND_URL is required"

PRO_EMAIL, PRO_PW = "pro@test.com", "Test123!"
HO_EMAIL, HO_PW = "homeowner@test.com", "Test123!"


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def pro():
    return _login(PRO_EMAIL, PRO_PW)


@pytest.fixture(scope="module")
def homeowner():
    return _login(HO_EMAIL, HO_PW)


@pytest.fixture(scope="module")
def pro_projects(pro):
    r = pro.get(f"{BASE_URL}/api/pm/projects", timeout=20)
    assert r.status_code == 200, r.text
    projects = r.json().get("projects", [])
    assert projects, "pro has no PM projects to test against"
    return projects


def _ensure_done(pro, project_id):
    r = pro.patch(f"{BASE_URL}/api/pm/projects/{project_id}", json={"status": "done"}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("status") == "done"


def _assert_valid_pdf(resp):
    assert resp.status_code == 200, f"{resp.status_code} {resp.text[:200]}"
    assert "application/pdf" in resp.headers.get("content-type", ""), resp.headers
    assert resp.content[:5] == b"%PDF-", resp.content[:20]
    assert len(resp.content) > 1500


def test_pro_export_all_languages(pro, pro_projects):
    pid = pro_projects[0]["id"]
    _ensure_done(pro, pid)
    for lang in ("en", "de", "tr", "es"):
        r = pro.get(f"{BASE_URL}/api/pm/projects/{pid}/export-pdf", params={"lang": lang}, timeout=60)
        _assert_valid_pdf(r)


def test_pro_export_pdf_has_sections(pro, pro_projects):
    pid = pro_projects[0]["id"]
    _ensure_done(pro, pid)
    r = pro.get(f"{BASE_URL}/api/pm/projects/{pid}/export-pdf", params={"lang": "en"}, timeout=60)
    _assert_valid_pdf(r)
    try:
        from pypdf import PdfReader
    except Exception:
        from PyPDF2 import PdfReader
    reader = PdfReader(io.BytesIO(r.content))
    text = "".join((p.extract_text() or "") for p in reader.pages)
    for kw in ("Job File", "Summary", "Tasks", "Materials", "Financials"):
        assert kw in text, f"section '{kw}' missing from PDF"


def test_pro_export_blocked_when_not_done(pro, pro_projects):
    pid = pro_projects[0]["id"]
    # flip to active, expect 400
    r = pro.patch(f"{BASE_URL}/api/pm/projects/{pid}", json={"status": "active"}, timeout=20)
    assert r.status_code == 200, r.text
    r = pro.get(f"{BASE_URL}/api/pm/projects/{pid}/export-pdf", params={"lang": "en"}, timeout=30)
    assert r.status_code == 400
    # restore done so other tests / UI have a completed project
    _ensure_done(pro, pid)


def test_homeowner_export_own_completed_project(pro, homeowner, pro_projects):
    pid = pro_projects[0]["id"]
    _ensure_done(pro, pid)
    # this project must belong to the test homeowner
    r = homeowner.get(f"{BASE_URL}/api/pm/my-projects", timeout=20)
    assert r.status_code == 200, r.text
    mine = {p["id"] for p in r.json().get("projects", [])}
    if pid not in mine:
        pytest.skip("seed project not owned by test homeowner")
    r = homeowner.get(f"{BASE_URL}/api/pm/my-projects/{pid}/export-pdf", params={"lang": "de"}, timeout=60)
    _assert_valid_pdf(r)


def test_pro_cannot_use_homeowner_export_endpoint(pro, pro_projects):
    pid = pro_projects[0]["id"]
    r = pro.get(f"{BASE_URL}/api/pm/my-projects/{pid}/export-pdf", params={"lang": "en"}, timeout=30)
    assert r.status_code == 403
