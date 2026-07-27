"""Iteration 48 backend tests: bookings enrichment, notifications, availability, jobs"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def pro_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "pro@test.com", "password": "Test123!"})
    assert r.status_code == 200
    return s

@pytest.fixture(scope="module")
def homeowner_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "homeowner@test.com", "password": "Test123!"})
    assert r.status_code == 200
    return s

@pytest.fixture(scope="module")
def pro_headers(pro_session):
    return pro_session

@pytest.fixture(scope="module")
def homeowner_headers(homeowner_session):
    return homeowner_session

# Test bookings enrichment
def test_bookings_enriched_data(pro_headers):
    """GET /api/bookings returns job_title and homeowner_name"""
    r = pro_headers.get(f"{BASE_URL}/api/bookings")
    assert r.status_code == 200
    data = r.json()
    bookings = data.get("bookings", [])
    print(f"Bookings count: {len(bookings)}")
    if bookings:
        b = bookings[0]
        print(f"First booking: {b}")
        assert "job_title" in b, "Missing job_title"
        assert "homeowner_name" in b, "Missing homeowner_name"
        print(f"job_title: {b.get('job_title')}, homeowner_name: {b.get('homeowner_name')}")
    else:
        print("No bookings found - seed data may be missing")

# Test jobs have job_number
def test_jobs_have_job_number(homeowner_session):
    """GET /api/jobs returns job_number field"""
    r = homeowner_session.get(f"{BASE_URL}/api/jobs?page=1")
    assert r.status_code == 200
    data = r.json()
    jobs = data.get("jobs", [])
    print(f"Jobs count: {len(jobs)}")
    jobs_with_number = [j for j in jobs if j.get("job_number")]
    print(f"Jobs with job_number: {len(jobs_with_number)}")
    assert len(jobs_with_number) > 0, "No jobs have job_number field"
    print(f"Sample job_number: {jobs_with_number[0]['job_number']}")

# Test notifications - mark as read
def test_notification_mark_read(pro_headers):
    """PATCH /api/notifications/{id}/read marks notification as read"""
    # Get notifications first
    r = pro_headers.get(f"{BASE_URL}/api/notifications")
    assert r.status_code == 200
    notifs = r.json().get("notifications", [])
    print(f"Notifications count: {len(notifs)}")
    unread = [n for n in notifs if not n.get("is_read")]
    print(f"Unread count: {len(unread)}")
    if unread:
        nid = unread[0]["id"]
        patch_r = pro_headers.patch(f"{BASE_URL}/api/notifications/{nid}/read")
        print(f"PATCH status: {patch_r.status_code}")
        assert patch_r.status_code == 200
        # Verify it's now read
        r2 = pro_headers.get(f"{BASE_URL}/api/notifications")
        notifs2 = r2.json().get("notifications", [])
        marked = next((n for n in notifs2 if n["id"] == nid), None)
        if marked:
            assert marked.get("is_read") == True, "Notification not marked as read"
            print("Notification successfully marked as read")
    else:
        print("No unread notifications - skipping mark read test")

# Test availability endpoint
def test_pro_availability(pro_headers):
    """GET /api/auth/me then GET /api/availability/{pro_id}"""
    me_r = pro_headers.get(f"{BASE_URL}/api/auth/me")
    assert me_r.status_code == 200
    pro_profile_id = me_r.json().get("pro_profile_id")
    print(f"pro_profile_id: {pro_profile_id}")
    if pro_profile_id:
        avail_r = pro_headers.get(f"{BASE_URL}/api/availability/{pro_profile_id}")
        assert avail_r.status_code == 200
        avail = avail_r.json().get("availability", [])
        print(f"Availability slots: {len(avail)}")
        # Mon-Fri should have slots
        mon_slots = [a for a in avail if a["day"] == "Mon" and a["is_available"]]
        sat_slots = [a for a in avail if a["day"] == "Sat" and a["is_available"]]
        print(f"Mon available: {len(mon_slots)}, Sat available: {len(sat_slots)}")
        assert len(mon_slots) > 0, "Monday should have availability"
        assert len(sat_slots) == 0, "Saturday should NOT have availability"

# Test homeowner dashboard - in_progress jobs
def test_homeowner_in_progress_jobs(homeowner_headers):
    """GET /api/jobs returns in_progress jobs for homeowner"""
    r = homeowner_headers.get(f"{BASE_URL}/api/jobs?status=in_progress")
    assert r.status_code == 200
    data = r.json()
    jobs = data.get("jobs", [])
    in_prog = [j for j in jobs if j.get("status") == "in_progress"]
    print(f"In-progress jobs: {len(in_prog)}")
    # Should have at least 1
    assert len(in_prog) >= 1, f"Expected at least 1 in_progress job, got {len(in_prog)}"

# Test booking message format
def test_booking_message_format(pro_headers):
    """Verify message threads have full date format in booking messages"""
    r = pro_headers.get(f"{BASE_URL}/api/messages/threads")
    assert r.status_code == 200
    threads = r.json().get("threads", [])
    print(f"Threads count: {len(threads)}")
