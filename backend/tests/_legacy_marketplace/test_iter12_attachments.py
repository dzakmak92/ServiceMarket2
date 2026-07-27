"""Iter12 — File attachments (jobs + messages) and 1-hour slot regression."""
import os
import base64
import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()
BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
_MC = MongoClient(os.environ["MONGO_URL"])
_DB = _MC[os.environ["DB_NAME"]]


TINY_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh"
    "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR"
    "CAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAA"
    "AAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAM"
    "AwEAAhEDEQA/AKqgAH//2Q=="
)
TINY_PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/Resources<<>>/MediaBox[0 0 100 100]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    return s


def _upload(session, content, filename, content_type):
    r = session.post(
        f"{BASE}/api/uploads/file",
        files={"file": (filename, content, content_type)},
        timeout=20,
    )
    return r


class TestGenericUpload:
    def test_upload_jpeg_works(self):
        s = _login("homeowner@test.com", "Test123!")
        r = _upload(s, TINY_JPEG, "test.jpg", "image/jpeg")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["content_type"] == "image/jpeg"
        assert d["file_id"]
        assert d["url"].startswith("/api/uploads/")
        assert d["size"] == len(TINY_JPEG)
        # Serve back
        download_url = f"{BASE}{d['url']}"
        dr = requests.get(download_url, timeout=10)
        assert dr.status_code == 200
        assert dr.content == TINY_JPEG

    def test_upload_pdf_works(self):
        s = _login("homeowner@test.com", "Test123!")
        r = _upload(s, TINY_PDF, "test.pdf", "application/pdf")
        assert r.status_code == 200, r.text
        assert r.json()["content_type"] == "application/pdf"

    def test_upload_rejects_disallowed_mime(self):
        s = _login("homeowner@test.com", "Test123!")
        r = _upload(s, b"GIF89a\x01\x00\x01\x00\x00\x00\x00\x00", "test.gif", "image/gif")
        assert r.status_code == 400
        assert "allowed" in r.json()["detail"].lower()

    def test_upload_rejects_oversize(self):
        s = _login("homeowner@test.com", "Test123!")
        big = b"\xff\xd8\xff\xe0" + (b"\x00" * (10 * 1024 * 1024 + 1))
        r = _upload(s, big, "big.jpg", "image/jpeg")
        assert r.status_code == 400
        assert "large" in r.json()["detail"].lower()

    def test_upload_requires_auth(self):
        r = requests.post(
            f"{BASE}/api/uploads/file",
            files={"file": ("test.jpg", TINY_JPEG, "image/jpeg")},
            timeout=10,
        )
        assert r.status_code in (401, 403)


class TestJobAttachments:
    def test_post_job_with_attachments(self):
        s = _login("homeowner@test.com", "Test123!")
        att = _upload(s, TINY_JPEG, "drainpipe.jpg", "image/jpeg").json()
        r = s.post(
            f"{BASE}/api/jobs",
            json={
                "title": "TEST iter12 with image",
                "category": "plumbing",
                "description": "Test job created with one photo attachment. " * 3,
                "city": "Vienna",
                "urgency": "medium",
                "attachments": [att],
            },
            timeout=20,
        )
        assert r.status_code in (200, 201), r.text
        job = r.json()
        job_id = job.get("id") or job.get("_id")
        assert job.get("attachments") == [att]
        # Cleanup
        s.delete(f"{BASE}/api/jobs/{job_id}", timeout=10)

    def test_post_job_rejects_too_many_attachments(self):
        s = _login("homeowner@test.com", "Test123!")
        att = _upload(s, TINY_JPEG, "x.jpg", "image/jpeg").json()
        r = s.post(
            f"{BASE}/api/jobs",
            json={
                "title": "TEST iter12 too many",
                "category": "plumbing",
                "description": "Test job with too many attachments. " * 5,
                "city": "Vienna",
                "urgency": "medium",
                "attachments": [att] * 6,
            },
            timeout=20,
        )
        assert r.status_code == 400
        assert "5" in r.json()["detail"]


class TestMessageAttachments:
    def test_send_message_with_image_attachment(self):
        ho = _login("homeowner@test.com", "Test123!")
        pro = _login("pro@test.com", "Test123!")
        # Find an existing job between them
        tr = ho.get(f"{BASE}/api/messages/threads", timeout=20).json()
        threads = tr.get("threads", tr) if isinstance(tr, dict) else tr
        if not threads:
            pytest.skip("No existing message threads to test against")
        thr = threads[0]
        att = _upload(ho, TINY_JPEG, "fixme.jpg", "image/jpeg").json()
        r = ho.post(
            f"{BASE}/api/messages",
            json={
                "job_id": thr["job_id"],
                "to_id": thr["other_user_id"],
                "text": "Photo of the issue",
                "kind": "text",
                "attachments": [att],
            },
            timeout=20,
        )
        assert r.status_code in (200, 201), r.text
        assert r.json().get("attachments") == [att]


class TestOneHourSlotMigration:
    def test_seed_uses_one_hour_slots(self):
        """After startup, pro_availability should contain 1-hour slots (08:00-09:00 etc.)
        and zero rows with a 3-hour 'HH:00-HH+3:00' format."""
        slots = {a["slot"] for a in _DB.pro_availability.find({}, {"slot": 1})}
        if not slots:
            pytest.skip("No availability rows yet")
        # No legacy 3-hour ranges should remain
        legacy = {s for s in slots if s in {"09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-20:00"}}
        assert legacy == set(), f"Legacy 3-hour slots still present: {legacy}"
        # Every remaining slot should span exactly 1 hour
        import re
        for s in slots:
            m = re.match(r"^(\d{1,2}):00-(\d{1,2}):00$", s)
            assert m, f"Slot '{s}' has unexpected format"
            assert int(m[2]) - int(m[1]) == 1, f"Slot '{s}' is not 1 hour wide"
