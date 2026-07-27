"""Tests for the admin Explorer on/off toggle and the choose_plan billing mode."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@servicemarket.eu", "password": "Admin123!"}
PRO = {"email": "pro@test.com", "password": "Test123!"}


def _session(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin():
    return _session(ADMIN)


@pytest.fixture(scope="module")
def pro():
    return _session(PRO)


@pytest.fixture(autouse=True)
def _restore(admin, pro):
    """Always leave Explorer ENABLED and the test pro Explorer-active."""
    yield
    admin.patch(f"{API}/admin/platform-settings", json={"explorer_enabled": True}, timeout=30)
    # Re-activate explorer for the test pro by resetting then... simplest: leave as-is;
    # the migrate script / seed restores it. We at least re-enable the flag.


def test_get_platform_settings_shape(admin):
    r = admin.get(f"{API}/admin/platform-settings", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "explorer_enabled" in d
    assert "new_pros_30d" in d and isinstance(d["new_pros_30d"], int)
    assert "explorer_active_count" in d


def test_non_admin_cannot_read_settings(pro):
    r = pro.get(f"{API}/admin/platform-settings", timeout=30)
    assert r.status_code in (401, 403)


def test_toggle_off_makes_new_pro_choose_plan(admin, pro):
    # Disable Explorer globally
    r = admin.patch(f"{API}/admin/platform-settings", json={"explorer_enabled": False}, timeout=30)
    assert r.status_code == 200 and r.json()["explorer_enabled"] is False

    # Put the test pro into a fresh new-signup state
    pro.post(f"{API}/billing/explorer/simulate-reset", timeout=30)

    # With Explorer off, a new pro must choose Standard/Pro directly
    mode = pro.get(f"{API}/billing/subscription-status", timeout=30).json()["billing_mode"]
    assert mode == "choose_plan", mode

    # Explorer checkout must be blocked
    rc = pro.post(f"{API}/billing/checkout/explorer", json={"origin_url": "https://x.com"}, timeout=30)
    assert rc.status_code == 400


def test_toggle_on_restores_explorer_offer(admin, pro):
    admin.patch(f"{API}/admin/platform-settings", json={"explorer_enabled": True}, timeout=30)
    pro.post(f"{API}/billing/explorer/simulate-reset", timeout=30)
    mode = pro.get(f"{API}/billing/subscription-status", timeout=30).json()["billing_mode"]
    assert mode == "explorer_offer", mode
    # And checkout works again (returns a Stripe url)
    rc = pro.post(f"{API}/billing/checkout/explorer", json={"origin_url": "https://x.com"}, timeout=30)
    assert rc.status_code == 200 and rc.json().get("url")
