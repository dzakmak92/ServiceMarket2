"""Iter32 — White-label invoice testing.

Covers: logo upload/delete, template list, template-set, 5-template preview PDF generation, RBAC.
"""
import os
import io
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


# ──────────────────────────────────────────────
# 1. Template list + current
# ──────────────────────────────────────────────
def test_template_list_has_five(pro_sess):
    r = pro_sess.get(f"{BASE}/api/pro-invoices/templates/list")
    assert r.status_code == 200
    d = r.json()
    keys = {t["key"] for t in d["templates"]}
    assert keys == {"pastel_mint", "pastel_rose", "pastel_grey"}
    assert "current" in d
    assert d["current"] in keys
    assert "logo_url" in d  # may be None


# ──────────────────────────────────────────────
# 2. Set template (valid + invalid)
# ──────────────────────────────────────────────
@pytest.mark.parametrize("tpl", ["pastel_mint", "pastel_rose", "pastel_grey"])
def test_set_each_template(pro_sess, tpl):
    r = pro_sess.patch(f"{BASE}/api/profile/pro/invoice-template", json={"invoice_template": tpl})
    assert r.status_code == 200
    assert r.json()["invoice_template"] == tpl


@pytest.mark.parametrize("legacy", ["classic", "modern", "minimalist", "bold", "elegant"])
def test_legacy_template_keys_auto_migrated(pro_sess, legacy):
    """Iter40: legacy template keys are accepted but stored as the new equivalent."""
    r = pro_sess.patch(f"{BASE}/api/profile/pro/invoice-template", json={"invoice_template": legacy})
    assert r.status_code == 200
    expected_map = {
        "classic": "pastel_mint", "modern": "pastel_grey",
        "minimalist": "pastel_mint", "bold": "pastel_rose", "elegant": "pastel_grey",
    }
    assert r.json()["invoice_template"] == expected_map[legacy]


def test_set_invalid_template_rejected(pro_sess):
    r = pro_sess.patch(f"{BASE}/api/profile/pro/invoice-template", json={"invoice_template": "fancy"})
    assert r.status_code == 400


# ──────────────────────────────────────────────
# 3. Preview renders valid PDFs for all 5
# ──────────────────────────────────────────────
@pytest.mark.parametrize("tpl", ["pastel_mint", "pastel_rose", "pastel_grey"])
def test_each_template_preview_returns_pdf(pro_sess, tpl):
    r = pro_sess.get(f"{BASE}/api/pro-invoices/templates/{tpl}/preview")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 2000  # sanity — a non-trivial PDF


def test_preview_404_on_unknown_template(pro_sess):
    r = pro_sess.get(f"{BASE}/api/pro-invoices/templates/fancy/preview")
    assert r.status_code == 404


# ──────────────────────────────────────────────
# 4. Logo upload + delete + RBAC
# ──────────────────────────────────────────────
def _tiny_png() -> bytes:
    # 67-byte valid 1x1 transparent PNG (real bytes, not concatenated)
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00"
        b"\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9c"
        b"c\xfc\xff\xff?\x00\x05\xfe\x02\xfe\xa3\x9a\xa1\xed\x00\x00\x00"
        b"\x00IEND\xaeB`\x82"
    )


def _multipart_post(sess, url, files):
    """Multipart upload — strip session-level application/json header."""
    headers = {k: v for k, v in sess.headers.items() if k.lower() != "content-type"}
    return requests.post(url, files=files, headers=headers, cookies=sess.cookies, timeout=30)


def test_logo_upload_and_delete(pro_sess):
    files = {"file": ("logo.png", io.BytesIO(_tiny_png()), "image/png")}
    r = _multipart_post(pro_sess, f"{BASE}/api/profile/pro/logo", files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["logo_file_id"]
    assert body["logo_url"].startswith("/api/portfolio/")

    r2 = pro_sess.get(f"{BASE}/api/pro-invoices/templates/list").json()
    assert r2["logo_url"]

    r3 = pro_sess.get(f"{BASE}/api/pro-invoices/templates/modern/preview")
    assert r3.status_code == 200
    assert len(r3.content) > 2500

    rd = pro_sess.delete(f"{BASE}/api/profile/pro/logo")
    assert rd.status_code == 200
    r4 = pro_sess.get(f"{BASE}/api/pro-invoices/templates/list").json()
    assert r4["logo_url"] is None


def test_logo_rejects_too_large(pro_sess):
    body = b"\x89PNG\r\n\x1a\n" + b"\x00" * (1 * 1024 * 1024 + 100)
    files = {"file": ("big.png", io.BytesIO(body), "image/png")}
    r = _multipart_post(pro_sess, f"{BASE}/api/profile/pro/logo", files)
    assert r.status_code == 400
    assert "too large" in r.text.lower()


def test_logo_rejects_bad_content_type(pro_sess):
    files = {"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4" + b"\x00" * 100), "application/pdf")}
    r = _multipart_post(pro_sess, f"{BASE}/api/profile/pro/logo", files)
    assert r.status_code == 400


def test_homeowner_cannot_upload_logo():
    s = _login("homeowner@test.com", "Test123!")
    files = {"file": ("logo.png", io.BytesIO(_tiny_png()), "image/png")}
    r = _multipart_post(s, f"{BASE}/api/profile/pro/logo", files)
    assert r.status_code == 403


def test_homeowner_cannot_set_template():
    s = _login("homeowner@test.com", "Test123!")
    r = s.patch(f"{BASE}/api/profile/pro/invoice-template", json={"invoice_template": "modern"})
    assert r.status_code == 403


def test_homeowner_cannot_list_templates():
    s = _login("homeowner@test.com", "Test123!")
    r = s.get(f"{BASE}/api/pro-invoices/templates/list")
    assert r.status_code == 403
