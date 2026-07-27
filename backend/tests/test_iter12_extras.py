"""Iter12 extras — coverage for items not in test_iter12_attachments.py:
- GET /api/uploads/{id} Cache-Control header
- POST /api/messages rejects >5 attachments
- POST /api/bookings accepts multi-hour slot string (e.g. 09:00-12:00)
- GET /api/availability/{pro_id} returns only 1-hour slots
"""
import os
import base64
import re
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


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=90)
    assert r.status_code == 200, r.text
    return s


def _upload(session, content, filename, ct):
    return session.post(
        f"{BASE}/api/uploads/file",
        files={"file": (filename, content, ct)},
        timeout=20,
    )


class TestUploadServe:
    def test_serve_has_cache_control(self):
        s = _login("homeowner@test.com", "Test123!")
        up = _upload(s, TINY_JPEG, "cc.jpg", "image/jpeg").json()
        r = requests.get(f"{BASE}{up['url']}", timeout=10)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/jpeg")
        cc = r.headers.get("cache-control", "")
        assert cc != "", "expected Cache-Control header to be set"


class TestMessageTooManyAttachments:
    def test_rejects_more_than_five(self):
        ho = _login("homeowner@test.com", "Test123!")
        tr = ho.get(f"{BASE}/api/messages/threads", timeout=20).json()
        threads = tr.get("threads", tr) if isinstance(tr, dict) else tr
        if not threads:
            pytest.skip("No threads available")
        thr = threads[0]
        att = _upload(ho, TINY_JPEG, "a.jpg", "image/jpeg").json()
        r = ho.post(
            f"{BASE}/api/messages",
            json={
                "job_id": thr["job_id"],
                "to_id": thr["other_user_id"],
                "text": "too many",
                "kind": "text",
                "attachments": [att] * 6,
            },
            timeout=20,
        )
        assert r.status_code == 400
        assert "5" in r.json().get("detail", "")


class TestAvailability1Hour:
    def test_get_availability_returns_only_one_hour_slots(self):
        # Find a pro id
        s = _login("homeowner@test.com", "Test123!")
        pros = s.get(f"{BASE}/api/pros?country=AT", timeout=20).json()
        pro_list = pros.get("pros", pros) if isinstance(pros, dict) else pros
        assert pro_list, "no pros returned"
        pro_id = pro_list[0].get("user_id") or pro_list[0].get("id") or pro_list[0].get("_id")
        r = s.get(f"{BASE}/api/availability/{pro_id}", timeout=20)
        assert r.status_code == 200
        data = r.json()
        slots = data if isinstance(data, list) else data.get("availability", data.get("slots", []))
        legacy = {"09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-20:00"}
        for row in slots:
            slot = row.get("slot") if isinstance(row, dict) else row
            assert slot not in legacy, f"Legacy slot found: {slot}"
            m = re.match(r"^(\d{1,2}):00-(\d{1,2}):00$", slot)
            assert m, f"Unexpected slot format: {slot}"
            assert int(m[2]) - int(m[1]) == 1, f"Slot not 1h wide: {slot}"


class TestMultiHourBooking:
    def test_post_booking_with_multi_hour_slot(self):
        ho = _login("homeowner@test.com", "Test123!")
        # Find existing thread (gives us a real job_id + pro user_id)
        tr = ho.get(f"{BASE}/api/messages/threads", timeout=20).json()
        threads = tr.get("threads", tr) if isinstance(tr, dict) else tr
        if not threads:
            pytest.skip("No threads available")
        thr = threads[0]
        from datetime import date, timedelta
        # Find a future weekday matching what the pro has (just use +60d Monday)
        d = date.today() + timedelta(days=60)
        # day field is the weekday short form per seed.py — try ISO date first, fallback to weekday name
        for day_val in (d.isoformat(), d.strftime("%a"), d.strftime("%A")):
            r = ho.post(
                f"{BASE}/api/bookings",
                json={
                    "job_id": thr["job_id"],
                    "pro_id": thr["other_user_id"],
                    "day": day_val,
                    "slot": "09:00-11:00",
                    "date": d.isoformat(),
                },
                timeout=20,
            )
            if r.status_code in (200, 201):
                break
        assert r.status_code in (200, 201), r.text
        body = r.json()
        b = body.get("booking", body) if isinstance(body, dict) else body
        assert b.get("slot") == "09:00-11:00", b
        bid = b.get("id") or b.get("_id")
        if bid:
            ho.delete(f"{BASE}/api/bookings/{bid}", timeout=10)
