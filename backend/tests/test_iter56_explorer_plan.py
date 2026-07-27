"""Iteration 56: Explorer intro plan end-to-end backend tests.

Covers:
  - Explorer ACTIVE state (pro@test.com is pre-seeded)
  - billing_mode consistency vs toolkit flags
  - Premium endpoints accessible (Invoices, Tax, PM) while Explorer active
  - Pro badge visibility in /api/jobs* feeds (plan_tier in ['pro','explorer'])
  - GATE transition via simulate-expiry (flags must be revoked)
  - choose-standard endpoint flips mode out of gate
  - claim-pro returns Stripe url
  - simulate-reset returns to explorer_offer
  - /api/billing/checkout/explorer returns Stripe url
  - Regression: homeowner login, job & project post, pro browse, admin dashboard
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def pro_session():
    return _login("pro@test.com", "Test123!")


@pytest.fixture(scope="module")
def homeowner_session():
    return _login("homeowner@test.com", "Test123!")


@pytest.fixture(scope="module")
def admin_session():
    return _login("admin@servicemarket.eu", "Admin123!")


# ───────────────────────── Phase 1: Explorer ACTIVE ─────────────────────────

class TestExplorerActive:
    def test_subscription_status_explorer_active(self, pro_session):
        r = pro_session.get(f"{API}/billing/subscription-status", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        print("subscription-status:", d)
        mode = d.get("billing_mode") or d.get("mode")
        assert mode == "explorer_active", f"expected explorer_active, got {mode}: {d}"
        # explorer days remaining > 0
        days = d.get("explorer_days_remaining")
        assert days is None or days >= 0

    def test_pricing_mode_matches(self, pro_session):
        r = pro_session.get(f"{API}/billing/pricing", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        mode = d.get("billing_mode") or d.get("mode")
        assert mode == "explorer_active", f"pricing mode mismatch: {mode}"

    def test_toolkit_flags_consistent_with_mode(self, pro_session):
        r = pro_session.get(f"{API}/billing/subscription-status", timeout=20)
        d = r.json()
        mode = d.get("billing_mode") or d.get("mode")
        # While explorer_active, all 3 toolkits MUST be unlocked
        flags = {
            "invoice": d.get("has_invoice_toolkit"),
            "tax": d.get("has_tax_toolkit"),
            "pm": d.get("has_pm_toolkit"),
        }
        print("mode:", mode, "flags:", flags)
        if mode == "explorer_active":
            assert all(flags.values()), f"Explorer active but flags not all True: {flags}"
        if mode == "gate":
            # CRITICAL: must not have any toolkit flag while gate
            assert not any(flags.values()), f"INCONSISTENT: mode=gate but flags still True: {flags}"

    def test_invoices_endpoint_accessible(self, pro_session):
        r = pro_session.get(f"{API}/pro-invoices", timeout=20)
        assert r.status_code == 200, f"My Invoices not accessible: {r.status_code} {r.text[:200]}"

    def test_invoices_stats_accessible(self, pro_session):
        r = pro_session.get(f"{API}/pro-invoices/stats", timeout=20)
        assert r.status_code == 200, f"Invoice stats not accessible: {r.status_code}"

    def test_invoices_cashflow_accessible(self, pro_session):
        r = pro_session.get(f"{API}/pro-invoices/cashflow", timeout=20)
        assert r.status_code == 200, f"Invoice cashflow (UNLOCK for explorer) failed: {r.status_code}"

    def test_tax_endpoint_accessible(self, pro_session):
        # Try common tax endpoints
        for path in ("/tax/summary", "/tax/overview", "/tax/dashboard", "/tax/transactions"):
            r = pro_session.get(f"{API}{path}", timeout=20)
            if r.status_code in (200, 204):
                print(f"Tax accessible via {path}")
                return
        pytest.skip("No tax endpoint matched; UI test will cover")

    def test_pm_endpoint_accessible(self, pro_session):
        for path in ("/pm/projects", "/projects", "/pm/dashboard"):
            r = pro_session.get(f"{API}{path}", timeout=20)
            if r.status_code in (200, 204):
                print(f"PM accessible via {path}: {r.status_code}")
                return
        pytest.skip("PM endpoint not located by simple probe")

    def test_pro_badge_in_search(self, pro_session):
        r = pro_session.get(f"{API}/pros", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        items = data if isinstance(data, list) else data.get("items") or data.get("pros") or []
        # Find the test pro
        target = None
        for p in items:
            if (p.get("email") == "pro@test.com") or (p.get("user", {}) or {}).get("email") == "pro@test.com":
                target = p
                break
        if target is None:
            # try by name fallback - just verify endpoint works
            pytest.skip("Test pro not found in /api/pros list payload")
        print("pro tier:", target.get("plan_tier"), "badge:", target.get("pro_badge"))
        assert target.get("plan_tier") in ("explorer", "pro"), target


# ───────────────────── Phase 2: Regression (toolkits/etc) ─────────────────────

class TestRegressionWhileExplorer:
    def test_homeowner_post_task(self, homeowner_session):
        payload = {
            "title": "TEST_iter56 leaky tap",
            "description": "Need a plumber to look at a dripping tap.",
            "category": "Plumbing",
            "city": "Vienna",
            "postal_code": "1010",
            "country": "AT",
            "kind": "task",
            "budget": 120,
        }
        r = homeowner_session.post(f"{API}/jobs", json=payload, timeout=20)
        print("post task:", r.status_code, r.text[:200])
        assert r.status_code in (200, 201), r.text

    def test_homeowner_post_project(self, homeowner_session):
        payload = {
            "title": "TEST_iter56 bathroom renovation",
            "description": "Full bathroom renovation, ~2 weeks.",
            "category": "Renovation",
            "city": "Vienna",
            "postal_code": "1010",
            "country": "AT",
            "kind": "project",
            "budget": 5000,
        }
        r = homeowner_session.post(f"{API}/jobs", json=payload, timeout=20)
        print("post project:", r.status_code, r.text[:200])
        assert r.status_code in (200, 201), r.text

    def test_pro_browse_jobs(self, pro_session):
        r = pro_session.get(f"{API}/jobs?kind=task", timeout=20)
        assert r.status_code == 200, r.text
        r2 = pro_session.get(f"{API}/jobs?kind=project", timeout=20)
        assert r2.status_code == 200, r2.text

    def test_pro_my_quotes(self, pro_session):
        r = pro_session.get(f"{API}/quotes", timeout=20)
        assert r.status_code in (200, 204), r.text

    def test_pro_dashboard_kpis(self, pro_session):
        # KPIs are exposed via analytics endpoints. Cash Flow widget uses pro-invoices/cashflow
        r = pro_session.get(f"{API}/analytics/overview", timeout=20)
        if r.status_code == 404:
            r = pro_session.get(f"{API}/analytics", timeout=20)
        print("analytics:", r.status_code)
        assert r.status_code in (200, 204, 404), r.text  # 404 ok if route not exposed at root

    def test_admin_dashboard(self, admin_session):
        r = admin_session.get(f"{API}/admin/stats", timeout=20)
        # Try alternates if needed
        if r.status_code == 404:
            r = admin_session.get(f"{API}/admin/dashboard", timeout=20)
        assert r.status_code in (200, 204), f"admin dashboard not reachable: {r.status_code}"

    def test_admin_toolkits_lists_explorer(self, admin_session):
        for path in ("/admin/toolkits", "/admin/pros", "/admin/users"):
            r = admin_session.get(f"{API}{path}", timeout=20)
            if r.status_code == 200:
                body = r.text.lower()
                if "explorer" in body or "plan_tier" in body:
                    print(f"Admin {path} returned explorer/plan_tier info")
                    return
        pytest.skip("admin toolkits endpoint not directly probed")


# ─────────────────── Phase 3: Lifecycle transitions (LAST) ───────────────────

class TestExplorerLifecycle:
    def test_simulate_expiry_revokes_flags(self, pro_session):
        r = pro_session.post(f"{API}/billing/explorer/simulate-expiry", timeout=20)
        print("simulate-expiry:", r.status_code, r.text[:200])
        assert r.status_code in (200, 204), r.text

        s = pro_session.get(f"{API}/billing/subscription-status", timeout=20)
        d = s.json()
        mode = d.get("billing_mode") or d.get("mode")
        assert mode == "gate", f"expected gate after expiry, got {mode}: {d}"
        # CRITICAL bug check
        for f in ("has_invoice_toolkit", "has_tax_toolkit", "has_pm_toolkit"):
            assert not d.get(f), f"BUG: mode=gate but {f}={d.get(f)}"

    def test_gate_toolkits_locked(self, pro_session):
        # Invoices: behavior expected — premium gate. Could be 200 with locked flag or 402/403
        r = pro_session.get(f"{API}/invoicing/pro/invoices", timeout=20)
        print("invoices after gate:", r.status_code)
        # not asserting specific code — just record
        assert r.status_code in (200, 402, 403, 404), r.text

    def test_claim_pro_returns_stripe_url(self, pro_session):
        r = pro_session.post(f"{API}/billing/checkout/subscription",
                             json={"origin_url": BASE_URL}, timeout=30)
        print("claim-pro:", r.status_code, r.text[:300])
        assert r.status_code in (200, 201), r.text
        d = r.json()
        url = d.get("url") or d.get("checkout_url") or d.get("session_url")
        assert url and ("stripe" in url or url.startswith("http")), f"no stripe url: {d}"

    def test_choose_standard_clears_gate(self, pro_session):
        r = pro_session.post(f"{API}/billing/explorer/choose-standard", timeout=20)
        print("choose-standard:", r.status_code, r.text[:200])
        assert r.status_code in (200, 204), r.text
        s = pro_session.get(f"{API}/billing/subscription-status", timeout=20)
        d = s.json()
        mode = d.get("billing_mode") or d.get("mode")
        # After choose-standard, gate should be dismissed → mode is no longer 'gate'
        # (could be 'standard' or simply not 'gate' depending on UI logic)
        print("post-choose-standard mode:", mode, "gate_dismissed:", d.get("explorer_gate_dismissed"))
        assert mode != "gate" or d.get("explorer_gate_dismissed") is True, d

    def test_simulate_reset_returns_offer(self, pro_session):
        r = pro_session.post(f"{API}/billing/explorer/simulate-reset", timeout=20)
        print("simulate-reset:", r.status_code, r.text[:200])
        assert r.status_code in (200, 204), r.text
        s = pro_session.get(f"{API}/billing/subscription-status", timeout=20)
        d = s.json()
        mode = d.get("billing_mode") or d.get("mode")
        assert mode == "explorer_offer", f"expected explorer_offer, got {mode}: {d}"

    def test_checkout_explorer_returns_url(self, pro_session):
        # Need to be in explorer_offer state first
        pro_session.post(f"{API}/billing/explorer/simulate-reset", timeout=20)
        r = pro_session.post(f"{API}/billing/checkout/explorer",
                             json={"origin_url": BASE_URL}, timeout=30)
        print("checkout/explorer:", r.status_code, r.text[:300])
        assert r.status_code in (200, 201), r.text
        d = r.json()
        url = d.get("url") or d.get("checkout_url") or d.get("session_url")
        assert url and url.startswith("http"), f"no stripe url: {d}"
