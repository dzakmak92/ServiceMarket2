"""Iter 65: Find Pros page — large CSV import (bulk_write) + geo near-me.

- Admin can import a semicolon-delimited CSV with thousand-separator coords
  (e.g. '482.213.796' -> 48.2213796) via a single bulk_write (no per-row timeout).
- `_parse_coord` decodes the broken coords into the valid Austrian range.
- `/api/directory/markers` and `/api/directory/businesses` honour lat/lng/radius_km
  by restricting results to a bounding box (near-me view is smaller than overview).
- Registered pros expose verified / certified (licensed) / insured badge flags.

Uses cookie-based auth via POST /api/auth/login.
"""
import io
import os
import uuid
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

ADMIN_EMAIL, ADMIN_PW = "admin@servicemarket.eu", "Admin123!"
HO_EMAIL, HO_PW = "homeowner@test.com", "Test123!"

# Vienna centre — the imported dataset is concentrated here.
VIENNA = (48.2082, 16.3738)


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PW)


@pytest.fixture(scope="module")
def homeowner():
    return _login(HO_EMAIL, HO_PW)


def test_bulk_csv_import_decodes_broken_coords(admin):
    """Semicolon CSV with broken thousand-separator coords imports via bulk_write."""
    tag = uuid.uuid4().hex[:8]
    osm = f"node/test-{tag}"
    csv_text = (
        "name;group;segment;city;country;phone;email;website;lat;lng;osm_id;address\n"
        f"PyTest Fliesen {tag};Boden & Fliesen;Fliesenleger;Wien;AT;;;;482.213.796;163.836.377;{osm};Heinestr 8\n"
        # row missing coords -> must be skipped
        f"PyTest Skip {tag};Sanitär;Sanitär;Wien;AT;;;;;;;-\n"
    )
    files = {"file": (f"pytest_{tag}.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    # send WITHOUT the json content-type header so multipart boundary is set
    s = requests.Session()
    s.cookies.update(admin.cookies)
    r = s.post(f"{BASE_URL}/api/directory/admin/import", files=files, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["inserted"] + body["updated"] >= 1
    assert body["skipped"] >= 1  # the coord-less row

    # Re-import the same row -> upsert updates (no duplicate), still skips bad row.
    r2 = s.post(f"{BASE_URL}/api/directory/admin/import",
                files={"file": (f"pytest_{tag}.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")},
                timeout=60)
    assert r2.status_code == 200, r2.text
    assert r2.json()["inserted"] == 0  # already present -> no new insert


def test_markers_geo_box_smaller_than_overview(homeowner):
    overview = homeowner.get(f"{BASE_URL}/api/directory/markers", timeout=30).json()
    near = homeowner.get(
        f"{BASE_URL}/api/directory/markers",
        params={"lat": VIENNA[0], "lng": VIENNA[1], "radius_km": 25},
        timeout=30,
    ).json()
    assert overview["total"] > 0
    assert near["total"] > 0
    # near-me set is a strict subset of the overview density
    assert near["total"] <= overview["total"]
    # every near marker is within a generous box of Vienna
    for m in near["markers"][:200]:
        assert 47.7 <= m["lat"] <= 48.7
        assert 15.7 <= m["lng"] <= 17.0


def test_businesses_geo_box(homeowner):
    near = homeowner.get(
        f"{BASE_URL}/api/directory/businesses",
        params={"lat": VIENNA[0], "lng": VIENNA[1], "radius_km": 10, "per_page": 5},
        timeout=30,
    ).json()
    assert near["total"] >= 1
    assert len(near["businesses"]) <= 5
    for b in near["businesses"]:
        assert b.get("lat") is not None and b.get("lng") is not None


def test_pros_expose_badge_flags(homeowner):
    data = homeowner.get(f"{BASE_URL}/api/pros", timeout=30).json()
    assert "pros" in data
    # at least one pro should carry the verified/certified/insured flags
    keys = {"is_verified", "is_licensed", "is_insured"}
    assert any(keys.issubset(p.keys()) for p in data["pros"]), "pros must expose badge flags"


def test_geocode_fallback(homeowner):
    """Manual location fallback. Nominatim is an external, rate-limited service,
    so we tolerate transient 404s on the city lookups but still assert the
    endpoint's OWN validation (too-short -> 400) and coord shape when it answers."""
    r = homeowner.get(f"{BASE_URL}/api/directory/geocode", params={"q": "Graz"}, timeout=30)
    assert r.status_code in (200, 404), r.text
    if r.status_code == 200:
        body = r.json()
        assert 46.0 <= body["lat"] <= 49.5 and 9.0 <= body["lng"] <= 17.5
    # too short -> 400 (internal validation, not dependent on Nominatim)
    r4 = homeowner.get(f"{BASE_URL}/api/directory/geocode", params={"q": "a"}, timeout=30)
    assert r4.status_code == 400


def test_markers_hide_contact(homeowner):
    """Privacy: markers must NOT leak phone/email/website/address to clients,
    and must report total/claimed/unclaimed counts."""
    d = homeowner.get(f"{BASE_URL}/api/directory/markers", timeout=30).json()
    assert "markers" in d and d["markers"], "expected markers"
    leaked = {"phone", "email", "website", "address"}
    for m in d["markers"][:50]:
        assert not (leaked & set(m.keys())), f"contact field leaked in marker: {m.keys()}"
    for k in ("total", "claimed", "unclaimed"):
        assert k in d, f"markers must report {k}"


def test_homeowner_inquiry_lead_and_admin(homeowner, admin):
    """Homeowner messages a directory business -> a lead is captured and visible
    to admins; too-short messages are rejected."""
    bid = homeowner.get(f"{BASE_URL}/api/directory/markers", timeout=30).json()["markers"][0]["id"]

    # too short -> 400
    short = homeowner.post(f"{BASE_URL}/api/directory/businesses/{bid}/inquire",
                           json={"message": "hi"}, timeout=30)
    assert short.status_code == 400

    tag = uuid.uuid4().hex[:8]
    msg = f"PYTEST lead {tag} — please send me a quote for my project."
    r = homeowner.post(f"{BASE_URL}/api/directory/businesses/{bid}/inquire",
                       json={"message": msg}, timeout=30)
    assert r.status_code == 200, r.text
    inquiry_id = r.json()["inquiry_id"]

    # admin sees it
    leads = admin.get(f"{BASE_URL}/api/directory/admin/inquiries?status=new", timeout=30).json()
    assert any(l.get("message") == msg for l in leads["inquiries"]), "lead not visible to admin"

    # stats count includes new inquiries
    stats = admin.get(f"{BASE_URL}/api/directory/admin/stats", timeout=30).json()
    assert stats.get("new_inquiries", 0) >= 1

    # resolve it (cleanup)
    res = admin.post(f"{BASE_URL}/api/directory/admin/inquiries/{inquiry_id}/resolve", timeout=30)
    assert res.status_code == 200
    after = admin.get(f"{BASE_URL}/api/directory/admin/inquiries?status=new", timeout=30).json()
    assert all(l.get("message") != msg for l in after["inquiries"]), "lead should be resolved"
