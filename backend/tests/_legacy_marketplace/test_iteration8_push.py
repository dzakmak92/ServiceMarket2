"""Iteration 8 — Web Push subscription endpoints + job-match dispatcher tests.

Covers:
  - GET /api/push/public-key (public)
  - POST /api/push/subscribe (auth + upsert)
  - POST /api/push/unsubscribe
  - POST /api/push/test (zero subs -> delivered=0)
  - POST /api/jobs triggers notify_matching_pros -> in-app notification kind=new_job_match
"""
import time
import uuid
import pytest
import requests


# ── Endpoint: public key ──────────────────────────────────────────────
class TestPushPublicKey:
    def test_public_key_returns_base64url(self, anon, base_url):
        r = anon.get(f"{base_url}/api/push/public-key", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "public_key" in data
        key = data["public_key"]
        assert isinstance(key, str) and len(key) > 60
        # base64url: no +,/,= padding chars
        assert not any(c in key for c in "+/=")


# ── Endpoint: subscribe auth gate ─────────────────────────────────────
class TestPushSubscribeAuth:
    def test_subscribe_requires_auth(self, anon, base_url):
        r = anon.post(
            f"{base_url}/api/push/subscribe",
            json={"endpoint": "https://fcm.googleapis.com/fcm/send/abcDEF_anon-test",
                  "keys": {"p256dh": "x" * 60, "auth": "y" * 22}},
            timeout=20,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"


# ── Endpoint: subscribe + upsert + unsubscribe ────────────────────────
class TestPushSubscriptionLifecycle:
    @pytest.fixture(scope="class")
    def unique_endpoint(self):
        return f"https://fcm.googleapis.com/fcm/send/TEST_{uuid.uuid4().hex}"

    def test_subscribe_creates_row(self, pro, base_url, unique_endpoint):
        r = pro["session"].post(
            f"{base_url}/api/push/subscribe",
            json={"endpoint": unique_endpoint,
                  "keys": {"p256dh": "BPdummyP256dhKeyForTestingPurposesOnly" + "A" * 50,
                           "auth": "BDummyAuthKey1234567890"}},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("enabled") is True
        assert data.get("message") == "Subscribed"

    def test_subscribe_is_upsert(self, pro, base_url, unique_endpoint):
        """Second POST with same endpoint must NOT duplicate."""
        r = pro["session"].post(
            f"{base_url}/api/push/subscribe",
            json={"endpoint": unique_endpoint,
                  "keys": {"p256dh": "BPdummyP256dhKeyForTestingPurposesOnly" + "A" * 50,
                           "auth": "BDummyAuthKey1234567890"}},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        # No direct DB access from test — but a successful re-POST is the upsert proof
        # combined with the unsubscribe test below: deleted_count must be 1, not 2.

    def test_unsubscribe_removes_single_row(self, pro, base_url, unique_endpoint):
        r = pro["session"].post(
            f"{base_url}/api/push/unsubscribe",
            json={"endpoint": unique_endpoint},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Proves upsert — only ONE row should have been deleted
        assert data.get("deleted") == 1, f"expected 1 deleted row (upsert), got {data}"
        # `enabled` reflects whether ANY subscription remains for this user
        assert "enabled" in data


# ── Endpoint: push/test with zero subs ────────────────────────────────
class TestPushTestEndpoint:
    def test_push_test_zero_subs_does_not_error(self, pro, base_url):
        # Ensure no subs for this user
        pro["session"].post(f"{base_url}/api/push/unsubscribe", json={}, timeout=20)
        r = pro["session"].post(f"{base_url}/api/push/test", timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("delivered") == 0


# ── Matching dispatcher — POST /api/jobs triggers notification ────────
class TestJobMatchDispatcher:
    def test_post_job_creates_new_job_match_notification_for_pro(self, homeowner, pro, base_url):
        # Iter8 design (since msg 682): instant push is a Pro-plan benefit.
        # Standard pros get the notification after a 15-min delay.
        # Flip the test pro to plan_tier='pro' so we can verify instant dispatch within 8s.
        from dotenv import load_dotenv
        load_dotenv()
        import os
        from pymongo import MongoClient
        _mc = MongoClient(os.environ["MONGO_URL"])
        _db = _mc[os.environ["DB_NAME"]]
        _orig_tier = _db.pro_profiles.find_one({"user_id": pro["user"]["_id"]}).get("plan_tier", "standard")
        _db.pro_profiles.update_one({"user_id": pro["user"]["_id"]}, {"$set": {"plan_tier": "pro"}})
        try:
            title = f"TEST iter8 dispatcher {uuid.uuid4().hex[:8]}"
            payload = {
                "title": title,
                "category": "plumbing",
                "description": (
                    "Iteration 8 web push dispatcher test job — leaking kitchen sink "
                    "needs urgent attention from a registered plumber in Vienna."
                ),
                "city": "Vienna",
                "urgency": "medium",
            }
            t0 = time.time()
            r = homeowner["session"].post(f"{base_url}/api/jobs", json=payload, timeout=30)
            elapsed = time.time() - t0
            assert r.status_code in (200, 201), r.text
            # Regression: response must NOT be blocked by the dispatcher
            assert elapsed < 5.0, f"POST /api/jobs took {elapsed:.2f}s (dispatcher should be background)"
            job = r.json()
            job_id = job.get("id") or job.get("_id")
            assert job_id

            # Poll for the new_job_match notification on the pro side
            found = None
            deadline = time.time() + 8.0
            while time.time() < deadline:
                nr = pro["session"].get(f"{base_url}/api/notifications", timeout=20)
                if nr.status_code == 200:
                    body = nr.json()
                    notifs = body if isinstance(body, list) else body.get("notifications", [])
                    for n in notifs:
                        if (n.get("kind") == "new_job_match"
                                and (n.get("job_id") == job_id
                                     or (n.get("link_to") or "").endswith(f"/jobs/{job_id}"))):
                            found = n
                            break
                if found:
                    break
                time.sleep(0.5)

            assert found is not None, "new_job_match notification not delivered to pro within 8s"
            assert title in (found.get("body") or ""), f"title missing from body: {found}"
            assert "Vienna" in (found.get("body") or ""), f"city missing from body: {found}"
            assert (found.get("link_to") or "").endswith(f"/jobs/{job_id}")

            # Cleanup: cancel the test job (best-effort)
            homeowner["session"].delete(f"{base_url}/api/jobs/{job_id}", timeout=20)
        finally:
            # Restore the original plan_tier so other tests (and the app) see the seed default
            _db.pro_profiles.update_one(
                {"user_id": pro["user"]["_id"]}, {"$set": {"plan_tier": _orig_tier}}
            )
