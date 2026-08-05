"""Job spine endpoints (Postgres).

Replaces the deleted marketplace job_routes.py. Nothing here posts a job to a
public board — the pro creates jobs for their own customers, or captures a
lead they already received elsewhere.
"""
from __future__ import annotations

from datetime import date as date_cls, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from db import pg
from repositories import jobs as repo
from routes._pro import require_pro_id

router = APIRouter(prefix="/jobs", tags=["jobs"])

SOURCES = "^(manual|myhammer|phone|whatsapp|email|walk_in|referral|repeat|web)$"


class JobIn(BaseModel):
    customer_id: Optional[str] = None
    mode: str = Field(default="simple", pattern="^(simple|project|recurring)$")
    title: str = Field(min_length=3, max_length=200)
    description: Optional[str] = None
    category: Optional[str] = None
    site_address: Optional[str] = None
    site_postal_code: Optional[str] = None
    site_city: Optional[str] = None
    site_country: Optional[str] = None
    site_lat: Optional[float] = None
    site_lng: Optional[float] = None
    site_access_note: Optional[str] = None
    source: str = Field(default="manual", pattern=SOURCES)
    source_ref: Optional[str] = None
    urgency: str = Field(default="normal", pattern="^(emergency|urgent|normal|scheduled)$")
    # Declared, because Pydantic drops what it has not been told about. The
    # repository has always accepted `status` on create; without this field the
    # value arrived, was silently discarded, and every job booked straight into
    # the calendar came back as a lead — with no error to say why.
    status: Optional[str] = Field(
        default=None,
        pattern="^(lead|quoted|accepted|scheduled|in_progress|completed|invoiced|closed|cancelled)$")
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    contract_amount: Optional[float] = None
    notes: Optional[str] = None


class JobPatch(JobIn):
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    mode: Optional[str] = Field(default=None, pattern="^(simple|project|recurring)$")
    source: Optional[str] = Field(default=None, pattern=SOURCES)
    urgency: Optional[str] = Field(default=None, pattern="^(emergency|urgent|normal|scheduled)$")


class LeadCustomer(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    type: str = Field(default="private", pattern="^(private|business)$")


class LeadIn(JobIn):
    """One call captures the customer and the job together.

    The doc is explicit that there is no MyHammer partner API to rely on and
    that scraping is off the table, so the design is to sit on top: the pro
    forwards, pastes or types the lead they already have.
    """
    title: str = Field(min_length=3, max_length=200)
    customer: Optional[LeadCustomer] = None


class StatusIn(BaseModel):
    status: str = Field(pattern="^(lead|quoted|accepted|scheduled|in_progress|completed|invoiced|closed|cancelled)$")


@router.get("")
async def list_jobs(
    status: Optional[str] = None,
    mode: Optional[str] = Query(default=None, pattern="^(simple|project|recurring)$"),
    customer_id: Optional[str] = None,
    q: str = "",
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user: dict = Depends(get_current_user),
):
    pro_id = await require_pro_id(user)
    return await repo.list_for_pro(
        pro_id, status=status, mode=mode, customer_id=customer_id,
        q=q, limit=limit, offset=offset)


@router.get("/counts")
async def job_counts(user: dict = Depends(get_current_user)):
    """Dashboard tiles. Declared before /{job_id} so it is not swallowed."""
    return await repo.dashboard_counts(await require_pro_id(user))


@router.get("/schedule")
async def schedule(days: int = Query(default=60, ge=1, le=365),
                   user: dict = Depends(get_current_user)):
    """Every dated task across open jobs, for the week planner.

    Declared before /{job_id} for the same reason as /counts — FastAPI matches
    in declaration order and the dynamic route would read "schedule" as an id.

    Closed, cancelled and deleted jobs are excluded: a planner showing work
    that is already finished is worse than one showing nothing, because it
    hides the rows that still need doing.
    """
    pro_id = await require_pro_id(user)
    rows = await pg.fetch(
        """
        select t.id::text          as id,
               t.job_id::text      as project_id,
               j.title             as project_title,
               j.job_number,
               t.title,
               t.assignee,
               t.due_date          as due_at,
               t.done_at,
               t.column_key
          from job_tasks t
          join jobs j on j.id = t.job_id
         where j.pro_id = $1
           and j.deleted_at is null
           and j.status not in ('closed', 'cancelled')
           and t.due_date is not null
           and t.due_date between current_date - interval '7 days'
                              and current_date + ($2 || ' days')::interval
         order by t.due_date, j.job_number nulls last, t.sort_order
        """,
        pro_id, str(days),
    )
    return {"tasks": rows}


@router.get("/appointments")
async def appointments(day: Optional[str] = Query(default=None),
                       # 45, not 31: a month grid is six whole weeks — 42 days —
                       # because a calendar that grows a row in one month and
                       # loses it the next makes everything under it jump.
                       days: int = Query(default=1, ge=1, le=45),
                       user: dict = Depends(get_current_user)):
    """The pro's own appointments — jobs with a scheduled_start.

    Separate from /schedule on purpose. That one returns PM sub-task due
    dates, which only exist if the pro uses the project toolkit and fills
    them in. This returns the thing every trade has: a time they said they
    would be at an address. The day view is built on this.

    Declared before /{job_id} so the dynamic route does not read
    "appointments" as an id.
    """
    pro_id = await require_pro_id(user)
    # asyncpg types the parameter from the query, so `$2::date` makes it a date
    # parameter and a string is rejected outright. Parse it here — a bad `day`
    # should be a 400, not a 500 from the driver.
    try:
        from_day = date_cls.fromisoformat(day) if day else datetime.now(timezone.utc).date()
    except ValueError:
        raise HTTPException(400, "day must be YYYY-MM-DD")
    rows = await pg.fetch(
        """
        select j.id::text            as id,
               j.job_number,
               j.title,
               j.status,
               j.urgency,
               j.scheduled_start,
               j.scheduled_end,
               j.site_address,
               j.site_postal_code,
               j.site_city,
               c.id::text            as customer_id,
               c.name                as customer_name,
               c.phone               as customer_phone,
               c.address             as customer_address,
               c.postal_code         as customer_postal_code,
               c.city                as customer_city
          from jobs j
          left join customers c on c.id = j.customer_id
         where j.pro_id = $1
           and j.deleted_at is null
           and j.status not in ('closed', 'cancelled')
           and j.scheduled_start is not null
           and j.scheduled_start >= $2
           and j.scheduled_start <  $2 + ($3 || ' days')::interval
         order by j.scheduled_start
        """,
        pro_id, from_day, str(days),
    )
    return {"appointments": rows}


class SchedulePatch(BaseModel):
    """Both ends, always. A partial move is how an appointment ends up with a
    start after its end — the caller sends what the appointment now is."""
    scheduled_start: datetime
    scheduled_end: datetime


def _quarter_aligned(t: datetime) -> bool:
    return t.minute % 15 == 0 and t.second == 0 and t.microsecond == 0


@router.patch("/{job_id}/schedule")
async def set_schedule(job_id: str, body: SchedulePatch,
                       user: dict = Depends(get_current_user)):
    """Move or resize one appointment.

    Quarter-hour alignment is enforced here and not only in the UI. The day
    view snaps to quarters, but an endpoint that accepts 16:07 because the
    caller asked nicely leaves rows the grid cannot draw.
    """
    pro_id = await require_pro_id(user)
    if body.scheduled_end <= body.scheduled_start:
        raise HTTPException(400, "scheduled_end must be after scheduled_start")
    if not (_quarter_aligned(body.scheduled_start) and _quarter_aligned(body.scheduled_end)):
        raise HTTPException(400, "times must fall on a quarter hour")
    job = await repo.update(pro_id, job_id, {
        "scheduled_start": body.scheduled_start,
        "scheduled_end": body.scheduled_end,
    })
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.post("", status_code=201)
async def create_job(body: JobIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    try:
        return await repo.create(pro_id, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/from-lead", status_code=201)
async def create_from_lead(body: LeadIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    payload = body.model_dump(exclude_none=True)
    try:
        return await repo.create_from_lead(pro_id, payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/{job_id}")
async def get_job(job_id: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    job = await repo.detail(pro_id, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.patch("/{job_id}")
async def update_job(job_id: str, body: JobPatch, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    job = await repo.update(pro_id, job_id, body.model_dump(exclude_none=True))
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.patch("/{job_id}/status")
async def set_status(job_id: str, body: StatusIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    try:
        return await repo.set_status(pro_id, job_id, body.status)
    except LookupError:
        raise HTTPException(404, "Job not found")
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.delete("/{job_id}")
async def delete_job(job_id: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    if not await repo.soft_delete(pro_id, job_id):
        raise HTTPException(404, "Job not found")
    return {"deleted": True, "soft": True}


@router.post("/{job_id}/rotate-share-token")
async def rotate_share_token(job_id: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    token = await repo.rotate_share_token(pro_id, job_id)
    if not token:
        raise HTTPException(404, "Job not found")
    return {"share_token": token}
