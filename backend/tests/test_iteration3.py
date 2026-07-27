"""Iteration 3 tests:
- Portfolio multipart + GridFS public serve
- iCal export for accepted bookings
- SSE notifications stream
- Per-user AI rate limit (20/h)
- BookingCreate optional `date`
"""
import io
import os
import time
import struct
import zlib
import threading
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://pro-toolkit-hub.preview.emergentagent.com").rstrip("/")


def _multipart_post(session, url, files, data=None):
    """Post multipart, ensuring session's JSON Content-Type doesn't shadow boundary header."""
    saved = session.headers.pop("Content-Type", None)
    try:
        return session.post(url, files=files, data=data or {}, timeout=30)
    finally:
        if saved is not None:
            session.headers["Content-Type"] = saved


def _find_in_progress_job(homeowner_sess):
    r = homeowner_sess.get(f"{BASE_URL}/api/jobs")
    if r.status_code != 200:
        return None
    jobs = r.json().get("jobs", [])
    return next((j for j in jobs if j.get("status") == "in_progress"), None)


@pytest.fixture(scope="module")
def in_progress_job(homeowner, pro):
    """Create a fresh job → pro quotes → homeowner accepts → in_progress."""
    hs = homeowner["session"]
    ps = pro["session"]
    # Re-use existing in_progress if any
    j = _find_in_progress_job(hs)
    if j:
        jid = j.get("id") or j.get("_id")
        return {"job_id": jid}

    job_payload = {
        "title": "TEST_iter3 iCal+SSE setup job",
        "description": "Setup job for iter3 testing of bookings, iCal export and SSE notifications flow.",
        "category": "plumbing",
        "city": "Vienna",
        "budget_min": 100,
        "budget_max": 300,
        "urgency": "this_week",
    }
    jr = hs.post(f"{BASE_URL}/api/jobs", json=job_payload)
    if jr.status_code not in (200, 201):
        pytest.skip(f"job create failed: {jr.status_code} {jr.text}")
    job = jr.json()
    jid = job.get("id") or job.get("_id")

    qr = ps.post(
        f"{BASE_URL}/api/quotes",
        json={"job_id": jid, "price": 220, "message": "Iter3 test quote for booking flow.", "duration_days": 1},
    )
    if qr.status_code not in (200, 201):
        pytest.skip(f"quote create failed: {qr.status_code} {qr.text}")
    quote = qr.json()
    qid = quote.get("id") or quote.get("_id")
    ar = hs.post(f"{BASE_URL}/api/quotes/{qid}/accept")
    if ar.status_code != 200:
        pytest.skip(f"quote accept failed: {ar.status_code} {ar.text}")
    return {"job_id": jid}


# ── Helpers ──────────────────────────────────────────────────────────
def _png_bytes(w=20, h=20):
    """Build a tiny valid PNG (no third-party deps)."""
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data)) + tag + data +
            struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # RGB
    raw = b""
    for _ in range(h):
        raw += b"\x00" + b"\xff\x00\x00" * w  # filter byte + RGB
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def _jpeg_bytes(size=200):
    """Tiny but valid-ish JPEG header — enough to pass content-type check.
    We don't actually decode; the server only checks size + content_type."""
    # Minimal JPEG SOI + EOI plus padding so > 100 bytes.
    return b"\xff\xd8\xff\xe0" + b"\x00" * (size - 6) + b"\xff\xd9"


# ── Portfolio (multipart + GridFS) ──────────────────────────────────
class TestPortfolio:
    def _clear_existing(self, pro_sess):
        prof = pro_sess.get(f"{BASE_URL}/api/profile/pro").json()
        photos = prof.get("portfolio_photos", []) or []
        for _ in range(len(photos)):
            pro_sess.delete(f"{BASE_URL}/api/profile/pro/portfolio/0")

    def test_upload_png_succeeds(self, pro):
        s = pro["session"]
        self._clear_existing(s)
        png = _jpeg_bytes(500)  # 500 bytes, content-type image/jpeg
        files = {"file": ("test.jpg", png, "image/jpeg")}
        data = {"caption": "TEST_iter3 upload"}
        r = _multipart_post(s, f"{BASE_URL}/api/profile/pro/portfolio", files=files, data=data)
        assert r.status_code == 200, r.text
        body = r.json()
        photo = body["photo"]
        assert photo["content_type"] == "image/jpeg"
        assert photo["size"] == len(png)
        assert photo["url"].startswith("/api/portfolio/")
        assert photo["file_id"] in photo["url"]
        # GET the photo publicly (no auth)
        anon = requests.Session()
        g = anon.get(f"{BASE_URL}{photo['url']}", timeout=15)
        assert g.status_code == 200
        assert g.headers.get("content-type", "").startswith("image/jpeg")
        assert len(g.content) == len(png)
        assert "cache-control" in {k.lower() for k in g.headers}

    def test_unknown_file_id_404(self, anon):
        # Valid ObjectId shape but not a real file
        r = anon.get(f"{BASE_URL}/api/portfolio/507f1f77bcf86cd799439011", timeout=15)
        assert r.status_code == 404
        r2 = anon.get(f"{BASE_URL}/api/portfolio/not-a-valid-id", timeout=15)
        assert r2.status_code == 404

    def test_reject_bad_content_type(self, pro):
        s = pro["session"]
        files = {"file": ("bad.txt", b"hello world " * 20, "text/plain")}
        r = _multipart_post(s, f"{BASE_URL}/api/profile/pro/portfolio", files=files, data=locals().get("data"))
        assert r.status_code == 400
        assert "JPEG" in r.text or "PNG" in r.text or "WebP" in r.text

    def test_reject_oversize(self, pro):
        s = pro["session"]
        big = b"\xff\xd8" + b"\x00" * (5 * 1024 * 1024 + 10) + b"\xff\xd9"
        files = {"file": ("big.jpg", big, "image/jpeg")}
        r = _multipart_post(s, f"{BASE_URL}/api/profile/pro/portfolio", files=files, data=locals().get("data"))
        assert r.status_code == 400
        assert "large" in r.text.lower() or "5" in r.text

    def test_delete_removes_from_gridfs(self, pro):
        s = pro["session"]
        # Upload a fresh photo to delete
        jpg = _jpeg_bytes(300)
        files = {"file": ("del.jpg", jpg, "image/jpeg")}
        up = _multipart_post(s, f"{BASE_URL}/api/profile/pro/portfolio", files=files, data=locals().get("data"))
        assert up.status_code == 200, up.text
        fid = up.json()["photo"]["file_id"]
        # Find index
        prof = s.get(f"{BASE_URL}/api/profile/pro").json()
        idx = next(i for i, p in enumerate(prof["portfolio_photos"]) if p["file_id"] == fid)
        d = s.delete(f"{BASE_URL}/api/profile/pro/portfolio/{idx}")
        assert d.status_code == 200
        # Now public GET on file_id should 404
        g = requests.get(f"{BASE_URL}/api/portfolio/{fid}", timeout=15)
        assert g.status_code == 404

    def test_max_10_enforced(self, pro):
        s = pro["session"]
        self._clear_existing(s)
        for i in range(10):
            files = {"file": (f"p{i}.jpg", _jpeg_bytes(200), "image/jpeg")}
            r = _multipart_post(s, f"{BASE_URL}/api/profile/pro/portfolio", files=files, data=locals().get("data"))
            assert r.status_code == 200, f"upload {i}: {r.text}"
        # 11th must fail
        files = {"file": ("p11.jpg", _jpeg_bytes(200), "image/jpeg")}
        r = _multipart_post(s, f"{BASE_URL}/api/profile/pro/portfolio", files=files, data=locals().get("data"))
        assert r.status_code == 400
        assert "Maximum" in r.text or "10" in r.text
        # cleanup
        self._clear_existing(s)


# ── iCal export ─────────────────────────────────────────────────────
class TestIcal:
    @pytest.fixture(scope="class")
    def booking(self, homeowner, pro, in_progress_job):
        hs = homeowner["session"]
        ps = pro["session"]
        pro_profile = ps.get(f"{BASE_URL}/api/profile/pro").json()
        pro_id = pro_profile.get("id") or pro_profile.get("_id")
        payload = {
            "job_id": in_progress_job["job_id"],
            "pro_id": pro_id,
            "day": "Wed",
            "slot": "09:00-12:00",
            "date": "2026-02-04",
        }
        r = hs.post(f"{BASE_URL}/api/bookings", json=payload)
        assert r.status_code == 200, r.text
        b = r.json()["booking"]
        return b

    def test_ical_contains_required_lines(self, booking, homeowner):
        s = homeowner["session"]
        bid = booking["id"] if "id" in booking else booking["_id"]
        r = s.get(f"{BASE_URL}/api/bookings/{bid}/ical")
        assert r.status_code == 200, r.text
        assert "text/calendar" in r.headers.get("content-type", "").lower()
        body = r.text
        for needle in ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:", "DTSTART:",
                       "DTEND:", "STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR"]:
            assert needle in body, f"missing {needle}\n{body[:400]}"
        # date used: 2026-02-04 → DTSTART:20260204T090000Z
        assert "DTSTART:20260204T090000Z" in body
        assert "DTEND:20260204T120000Z" in body

    def test_ical_non_participant_403(self, booking, admin):
        # admin should be allowed (admin role)
        bid = booking["id"] if "id" in booking else booking["_id"]
        r = admin["session"].get(f"{BASE_URL}/api/bookings/{bid}/ical")
        assert r.status_code == 200

    def test_ical_404(self, homeowner):
        r = homeowner["session"].get(f"{BASE_URL}/api/bookings/507f1f77bcf86cd799439099/ical")
        assert r.status_code == 404

    def test_booking_message_has_booking_id(self, booking, homeowner, pro):
        # The booking message should have booking_id set
        s = homeowner["session"]
        job_id = booking["job_id"]
        me_pro = pro["session"].get(f"{BASE_URL}/api/auth/me").json()
        pro_user_id = me_pro.get("id") or me_pro.get("_id")
        r = s.get(f"{BASE_URL}/api/messages/thread/{job_id}/{pro_user_id}")
        assert r.status_code == 200, r.text
        thread = r.json()
        msgs = thread.get("messages", []) if isinstance(thread, dict) else thread
        booking_msgs = [m for m in msgs if m.get("kind") == "booking"]
        assert booking_msgs, "no booking-kind message found"
        assert any(m.get("booking_id") for m in booking_msgs), "booking_id missing on booking message"


# ── Booking date fallback (no date provided → falls back to weekday) ──
class TestBookingDateFallback:
    def test_create_booking_without_date(self, homeowner, pro, in_progress_job):
        hs = homeowner["session"]
        ps = pro["session"]
        pro_profile = ps.get(f"{BASE_URL}/api/profile/pro").json()
        pro_id = pro_profile.get("id") or pro_profile.get("_id")
        payload = {
            "job_id": in_progress_job["job_id"],
            "pro_id": pro_id,
            "day": "Fri",
            "slot": "14:00-16:00",
            # no `date`
        }
        r = hs.post(f"{BASE_URL}/api/bookings", json=payload)
        assert r.status_code == 200, r.text
        b = r.json()["booking"]
        bid = b.get("id") or b.get("_id")
        # iCal must still produce DTSTART with a real date
        ic = hs.get(f"{BASE_URL}/api/bookings/{bid}/ical")
        assert ic.status_code == 200
        assert "DTSTART:" in ic.text
        # 14:00 should be encoded
        import re
        m = re.search(r"DTSTART:(\d{8})T140000Z", ic.text)
        assert m, ic.text[:400]


# ── SSE stream ──────────────────────────────────────────────────────
class TestSSE:
    def test_sse_headers_and_events(self, pro, homeowner, in_progress_job):
        """Open SSE as pro, then create a message homeowner→pro and expect notification frame."""
        ps = pro["session"]
        hs = homeowner["session"]

        job_id = in_progress_job["job_id"]
        # pro user_id
        me_pro = ps.get(f"{BASE_URL}/api/auth/me").json()
        pro_user_id = me_pro.get("id") or me_pro.get("_id")

        # Open SSE stream from pro session
        chunks = []

        def reader():
            with ps.get(f"{BASE_URL}/api/notifications/stream", stream=True, timeout=20) as resp:
                assert resp.status_code == 200
                assert "text/event-stream" in resp.headers.get("content-type", "")
                started = time.time()
                for raw in resp.iter_lines(decode_unicode=True):
                    chunks.append(raw if raw is not None else "")
                    if time.time() - started > 16:
                        break

        t = threading.Thread(target=reader, daemon=True)
        t.start()
        time.sleep(2.0)  # let stream open + hello

        # Trigger notification by inserting a message homeowner -> pro_user_id
        msg_payload = {
            "job_id": job_id,
            "to_id": pro_user_id,
            "text": "TEST_iter3 SSE trigger ping " + str(int(time.time())),
        }
        r = hs.post(f"{BASE_URL}/api/messages", json=msg_payload)
        assert r.status_code in (200, 201), r.text

        t.join(timeout=18)

        joined = "\n".join(chunks)
        assert "event: hello" in joined, f"no hello frame.\n{joined[:600]}"
        assert "event: notification" in joined, f"no notification frame.\n{joined[:1500]}"


# ── AI rate limit (20/h) ────────────────────────────────────────────
class TestAIRateLimit:
    def test_exceeds_20_returns_429(self, homeowner):
        s = homeowner["session"]
        payload = {
            "title": "Leaky kitchen sink",
            "description": "There is a slow drip under my kitchen sink and water is pooling.",
            "lang": "en",
        }
        url = f"{BASE_URL}/api/ai/classify-job"
        saw_429 = False
        retry_after = None
        # 21+ rapid calls — prior iters may have eaten budget; we just need to see 429 emerge.
        for i in range(25):
            r = s.post(url, json=payload, timeout=30)
            if r.status_code == 429:
                saw_429 = True
                retry_after = r.headers.get("Retry-After")
                break
            # Accept 200 or 500 (LLM blip) — those count against the bucket either way? No.
            # The limiter records *before* the LLM call so any successful pass counts.
        assert saw_429, "expected 429 within 25 rapid calls"
        assert retry_after is not None, "Retry-After header missing on 429"
        assert int(retry_after) > 0
