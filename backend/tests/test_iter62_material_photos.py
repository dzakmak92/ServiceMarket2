"""Iter 62: Material photo upload + admin/toolkit responsiveness backend tests.

Tests:
- POST /api/uploads/file (image upload) returns url
- PATCH /api/pm/projects/<id>/materials/<mid> with photos[] persists
- GET /api/pm/projects/<id>/materials returns the photo URL in the material's photos[]
- Removing photo by PATCH with empty photos[]
"""
import io
import os
import requests
import pytest
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PROJECT_ID = "6a283c58573a159e6192ab8d"
PRO_EMAIL = "pro@test.com"
PRO_PASS = "Test123!"


def _make_png_bytes():
    img = Image.new("RGB", (16, 16), color=(120, 200, 50))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()


@pytest.fixture(scope="module")
def pro_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": PRO_EMAIL, "password": PRO_PASS})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


def test_uploads_file_returns_url(pro_session):
    png = _make_png_bytes()
    files = {"file": ("test_iter62.png", png, "image/png")}
    r = pro_session.post(f"{BASE_URL}/api/uploads/file", files=files)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert "url" in data
    assert data["url"].startswith("/api/uploads/")
    assert data["content_type"] == "image/png"


def test_material_photos_full_flow(pro_session):
    # 1) list materials, find 'Copper pipe 22mm' (or any existing material)
    r = pro_session.get(f"{BASE_URL}/api/pm/projects/{PROJECT_ID}/materials")
    if r.status_code == 402:
        pytest.skip("PM Toolkit not active (seed drift)")
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    payload = r.json()
    mats = payload.get("materials") if isinstance(payload, dict) else payload
    assert isinstance(mats, list)
    mat = next((m for m in mats if "Copper" in (m.get("name") or "")), None) or (mats[0] if mats else None)
    assert mat, "No material available on seeded project"
    mid = mat["id"]

    # 2) upload image
    png = _make_png_bytes()
    files = {"file": ("mat_photo.png", png, "image/png")}
    r = pro_session.post(f"{BASE_URL}/api/uploads/file", files=files)
    assert r.status_code == 200
    url = r.json()["url"]

    # 3) PATCH material photos
    r = pro_session.patch(
        f"{BASE_URL}/api/pm/projects/{PROJECT_ID}/materials/{mid}",
        json={"photos": [url]},
    )
    assert r.status_code == 200, f"PATCH failed: {r.status_code} {r.text}"

    # 4) GET materials -> photo present
    r = pro_session.get(f"{BASE_URL}/api/pm/projects/{PROJECT_ID}/materials")
    assert r.status_code == 200
    payload2 = r.json()
    mats2 = payload2.get("materials") if isinstance(payload2, dict) else payload2
    target = next((m for m in mats2 if m["id"] == mid), None)
    assert target, "material disappeared after patch"
    assert "photos" in target
    assert url in target["photos"], f"photo URL not persisted: {target.get('photos')}"

    # 5) Verify the image can be served
    r = pro_session.get(f"{BASE_URL}{url}")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/")

    # 6) Remove photo (set to [])
    r = pro_session.patch(
        f"{BASE_URL}/api/pm/projects/{PROJECT_ID}/materials/{mid}",
        json={"photos": []},
    )
    assert r.status_code == 200

    r = pro_session.get(f"{BASE_URL}/api/pm/projects/{PROJECT_ID}/materials")
    payload3 = r.json()
    mats3 = payload3.get("materials") if isinstance(payload3, dict) else payload3
    target = next((m for m in mats3 if m["id"] == mid), None)
    assert target
    assert target.get("photos", []) == [], f"photo not removed: {target.get('photos')}"


def test_upload_rejects_non_image_text(pro_session):
    files = {"file": ("bad.txt", b"hello world this is plain text payload" * 3, "text/plain")}
    r = pro_session.post(f"{BASE_URL}/api/uploads/file", files=files)
    assert r.status_code == 400
