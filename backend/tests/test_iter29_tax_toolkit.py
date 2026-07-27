"""Iteration 29 — 3-toolkit pricing + Tax Toolkit P0/P1 (no PM yet)."""
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


# ── 1. Pricing returns 3 toolkits + bundle ──

def test_pricing_includes_all_toolkits_and_bundle(pro_sess):
    p = pro_sess.get(f"{BASE}/api/billing/pricing").json()
    # Three toolkits with std + pro prices
    for k in ("invoice", "tax", "pm"):
        assert k in p["toolkits"], f"missing toolkit {k}"
        tk = p["toolkits"][k]
        assert tk["standard_net"] > 0
        assert tk["pro_net"] > 0
        assert tk["standard_net"] >= tk["pro_net"]
    # Bundle
    assert p["bundle"]["standard_net"] == 39.99
    assert p["bundle"]["pro_net"] == 24.99
    assert p["bundle"]["alacarte_net"] > 0


# ── 2. Tax Toolkit endpoints ──

def test_tax_dashboard(pro_sess):
    r = pro_sess.get(f"{BASE}/api/tax/dashboard?year=2026")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "revenue_brutto" in d
    assert "current_quarter" in d
    assert d["current_quarter"] in ("Q1", "Q2", "Q3", "Q4")


def test_tax_ustva_quarters(pro_sess):
    for q in ("Q1", "Q2", "Q3", "Q4"):
        r = pro_sess.get(f"{BASE}/api/tax/ust-va?year=2026&quarter={q}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "buckets" in d
        # Each rate bucket has the 4 expected sub-keys
        for rate, b in d["buckets"].items():
            assert all(k in b for k in ("net", "vat", "brutto", "count")), b


def test_tax_eur_yearly(pro_sess):
    r = pro_sess.get(f"{BASE}/api/tax/eur?year=2026")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "revenue" in d and "expenses" in d and "profit_eur" in d


def test_tax_mileage(pro_sess):
    r = pro_sess.get(f"{BASE}/api/tax/mileage?year=2026")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "km_rate_eur" in d
    assert d["km_rate_eur"] == 0.42


def test_tax_svs_simulator(pro_sess):
    r = pro_sess.get(f"{BASE}/api/tax/svs?profit_eur=50000")
    assert r.status_code == 200, r.text
    d = r.json()
    # 50k profit · 18.5% pension ≈ 9250
    assert abs(d["pension_eur"] - 50000 * 0.185) < 1


def test_tax_income_tax_brackets(pro_sess):
    r = pro_sess.get(f"{BASE}/api/tax/income-tax?taxable_profit_eur=30000")
    assert r.status_code == 200, r.text
    d = r.json()
    # 30k profit yields > €3k tax under AT brackets
    assert d["estimated_tax_eur"] > 3000


def test_tax_revenue_csv_export(pro_sess):
    r = pro_sess.get(f"{BASE}/api/tax/exports/revenue.csv?year=2026")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    head = r.text.split("\n", 1)[0]
    # DATEV-shaped semicolon-separated header
    for h in ("Belegdatum", "Belegnummer", "Betrag_Brutto", "USt_Prozent"):
        assert h in head, f"missing column {h} in header: {head}"


def test_tax_expenses_csv_export(pro_sess):
    r = pro_sess.get(f"{BASE}/api/tax/exports/expenses.csv?year=2026")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "Belegdatum" in r.text.split("\n", 1)[0]


def test_tax_year_end_pdf(pro_sess):
    r = pro_sess.get(f"{BASE}/api/tax/year-end.pdf?year=2026")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 1500


# ── 3. RBAC: tax routes are 403 for non-pros ──

def test_homeowner_blocked_from_tax():
    s = _login("homeowner@test.com", "Test123!")
    r = s.get(f"{BASE}/api/tax/dashboard")
    assert r.status_code == 403
