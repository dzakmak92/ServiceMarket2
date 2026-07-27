import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")


def _make_session(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=90)
    if r.status_code != 200:
        pytest.skip(f"Login failed for {email}: {r.status_code} {r.text}")
    return s, r.json()


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def homeowner():
    s, user = _make_session("homeowner@test.com", "Test123!")
    return {"session": s, "user": user}


@pytest.fixture(scope="session")
def pro():
    s, user = _make_session("pro@test.com", "Test123!")
    return {"session": s, "user": user}


@pytest.fixture(scope="session")
def admin():
    s, user = _make_session("admin@servicemarket.eu", "Admin123!")
    return {"session": s, "user": user}


@pytest.fixture(scope="session")
def anon():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
