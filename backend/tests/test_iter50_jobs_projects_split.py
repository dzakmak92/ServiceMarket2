"""
Iteration 50: Jobs/Projects split feature tests
- listing_type filter on jobs API
- Project job creation (timeline_weeks, site_visit_required)
- Milestone quote creation
- Admin projects endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pro-toolkit-hub.preview.emergentagent.com').rstrip('/')


def make_session(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    return s


@pytest.fixture(scope="module")
def homeowner_session():
    return make_session("homeowner@test.com", "Test123!")


@pytest.fixture(scope="module")
def pro_session():
    return make_session("pro@test.com", "Test123!")


@pytest.fixture(scope="module")
def admin_session():
    return make_session("admin@servicemarket.eu", "Admin123!")


@pytest.fixture(scope="module")
def project_job_id(homeowner_session):
    """Create a project-type job for testing"""
    r = homeowner_session.post(f"{BASE_URL}/api/jobs", json={
        "title": "TEST_Full kitchen renovation project",
        "category": "plumbing",
        "description": "Complete kitchen renovation including plumbing and electrical work for a 3-bedroom house.",
        "city": "Vienna",
        "urgency": "medium",
        "listing_type": "project",
        "timeline_weeks": 4,
        "site_visit_required": True,
    })
    assert r.status_code == 200, f"Create project failed: {r.text}"
    return r.json()["id"]


class TestJobsListingTypeFilter:
    """Test listing_type filter on GET /api/jobs"""

    def test_filter_tasks(self, pro_session):
        r = pro_session.get(f"{BASE_URL}/api/jobs?status=open&listing_type=task")
        assert r.status_code == 200
        data = r.json()
        jobs = data.get("jobs", [])
        for j in jobs:
            assert j.get("listing_type") != "project", f"Task filter returned a project: {j['id']}"
        print(f"PASS: task filter returned {len(jobs)} task jobs")

    def test_filter_projects(self, pro_session):
        r = pro_session.get(f"{BASE_URL}/api/jobs?status=open&listing_type=project")
        assert r.status_code == 200
        data = r.json()
        jobs = data.get("jobs", [])
        for j in jobs:
            assert j.get("listing_type") == "project", f"Project filter returned a task: {j['id']}"
        print(f"PASS: project filter returned {len(jobs)} project jobs")


class TestProjectJobCreation:
    """Test creating a project-type job with extra fields"""

    def test_project_job_has_correct_fields(self, homeowner_session, project_job_id):
        r = homeowner_session.get(f"{BASE_URL}/api/jobs/{project_job_id}")
        assert r.status_code == 200
        job = r.json()
        assert job["listing_type"] == "project"
        assert job["timeline_weeks"] == 4
        assert job["site_visit_required"] == True
        print(f"PASS: project job has correct fields")

    def test_project_requires_description(self, homeowner_session):
        r = homeowner_session.post(f"{BASE_URL}/api/jobs", json={
            "title": "TEST_Project no desc",
            "category": "plumbing",
            "description": "",
            "city": "Vienna",
            "listing_type": "project",
        })
        assert r.status_code == 400, f"Expected 400 for project without description, got {r.status_code}"
        print("PASS: project without description returns 400")


class TestMilestoneQuote:
    """Test milestone quote creation for projects"""

    def test_send_milestone_quote(self, pro_session, project_job_id):
        payload = {
            "job_id": project_job_id,
            "price_type": "milestone",
            "amount": 5000,
            "travel_cost": 0,
            "parking_cost": 0,
            "message": "I can complete this kitchen renovation project with high quality work.",
            "milestones": [
                {"name": "Design & Planning", "amount": 1000, "order": 0},
                {"name": "Rough Work & Plumbing", "amount": 2500, "order": 1},
                {"name": "Finishing & Handover", "amount": 1500, "order": 2},
            ]
        }
        r = pro_session.post(f"{BASE_URL}/api/quotes", json=payload)
        assert r.status_code == 200, f"Milestone quote failed: {r.text}"
        data = r.json()
        assert data.get("price_type") == "milestone"
        milestones = data.get("milestones", [])
        assert len(milestones) == 3
        print(f"PASS: milestone quote created with {len(milestones)} phases")

    def test_milestone_quote_requires_2_phases(self, pro_session, homeowner_session):
        """Create a new project and try sending quote with 1 milestone"""
        r = homeowner_session.post(f"{BASE_URL}/api/jobs", json={
            "title": "TEST_Project for milestone validation",
            "category": "electrical",
            "description": "A project requiring milestone validation testing.",
            "city": "Graz",
            "listing_type": "project",
        })
        job_id = r.json()["id"]

        r2 = pro_session.post(f"{BASE_URL}/api/quotes", json={
            "job_id": job_id,
            "price_type": "milestone",
            "amount": 1000,
            "message": "Only one milestone provided.",
            "milestones": [{"name": "Phase 1", "amount": 1000, "order": 0}]
        })
        assert r2.status_code in [400, 422], f"Expected 400/422 for 1 milestone, got {r2.status_code}: {r2.text}"
        print("PASS: single-milestone quote rejected")


class TestAdminProjectsEndpoint:
    """Test admin jobs endpoint with listing_type=project"""

    def test_admin_projects_filter(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/jobs?listing_type=project")
        assert r.status_code == 200
        data = r.json()
        jobs = data.get("jobs", [])
        for j in jobs:
            assert j.get("listing_type") == "project"
        print(f"PASS: admin projects filter returned {len(jobs)} projects, total={data.get('total')}")
