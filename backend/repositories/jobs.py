"""The Job spine.

Replaces both the marketplace `jobs` collection and `pm_projects`. `mode`
decides how much surface a job shows:

  simple     customer + quote + invoice. The Montage/emergency loop.
  project    the full PM toolkit — tasks, materials, diary, milestones.
  recurring  a visit generated from a service contract.

Like customers, every accessor is pro-scoped by construction.
"""
from __future__ import annotations

import secrets
from typing import Any, Optional

from db import pg
from repositories import customers as customers_repo

WRITABLE = {
    "customer_id", "mode", "status", "title", "description", "category",
    "site_address", "site_postal_code", "site_city", "site_country",
    "site_lat", "site_lng", "site_access_note",
    "source", "source_ref", "lead_captured_at", "urgency",
    "scheduled_start", "scheduled_end", "contract_amount", "notes",
    "recurring_contract_id", "visit_date",
}

# Which statuses may follow which. Enforced here rather than in the DB so the
# API can return a useful message instead of a constraint violation.
TRANSITIONS: dict[str, set[str]] = {
    "lead":        {"quoted", "accepted", "cancelled"},
    "quoted":      {"accepted", "cancelled", "lead"},
    "accepted":    {"scheduled", "in_progress", "cancelled"},
    "scheduled":   {"in_progress", "cancelled", "accepted"},
    "in_progress": {"completed", "cancelled"},
    "completed":   {"invoiced", "in_progress"},
    "invoiced":    {"closed"},
    "closed":      set(),
    "cancelled":   set(),
}


def _clean(data: dict) -> dict:
    out = {k: v for k, v in data.items() if k in WRITABLE and v is not None}
    if "title" in out:
        out["title"] = out["title"].strip()
    return out


def new_token() -> str:
    return secrets.token_urlsafe(24)


async def create(pro_id: str, data: dict) -> dict:
    payload = _clean(data)
    if not payload.get("title"):
        raise ValueError("Job title is required")
    payload["pro_id"] = pro_id
    payload.setdefault("share_token", new_token())

    sql, args = pg.build_insert("jobs", payload)
    job = await pg.fetchrow(sql, *args)
    if job.get("customer_id"):
        await customers_repo.refresh_rollups(str(job["customer_id"]))
    return job


async def create_from_lead(pro_id: str, lead: dict) -> dict:
    """Capture a lead in one step: resolve or create the customer, then the job.

    This is the operational meaning of riding the marketplace rather than
    competing with it. There is no MyHammer API and scraping is off the table
    (GDPR, §7 UWG, Austrian TKG), so the pro forwards, pastes or types what
    they already received and the app takes it from there.
    """
    customer_data = lead.get("customer") or {}
    customer = None
    created = False
    if customer_data.get("name"):
        customer, created = await customers_repo.get_or_create(pro_id, customer_data)

    job_data = {k: v for k, v in lead.items() if k != "customer"}
    if customer:
        job_data["customer_id"] = customer["id"]
    job_data.setdefault("status", "lead")

    job = await create(pro_id, job_data)
    job = await pg.fetchrow(
        "update jobs set lead_captured_at = now() where id = $1 returning *", job["id"])
    return {"job": job, "customer": customer, "customer_created": created}


async def get(pro_id: str, job_id: str) -> Optional[dict]:
    return await pg.fetchrow(
        "select * from jobs where id = $1 and pro_id = $2 and deleted_at is null",
        job_id, pro_id,
    )


async def get_by_share_token(token: str) -> Optional[dict]:
    """Customer portal lookup. Deliberately NOT pro-scoped: the token is the
    credential. Callers must never expose margin, P&L or other customers."""
    return await pg.fetchrow(
        "select * from jobs where share_token = $1 and deleted_at is null", token)


async def update(pro_id: str, job_id: str, data: dict) -> Optional[dict]:
    payload = _clean(data)
    payload.pop("status", None)          # status moves through set_status()
    if not payload:
        return await get(pro_id, job_id)
    sql, args = pg.build_update(
        "jobs", payload, "id = $1 and pro_id = $2 and deleted_at is null", [job_id, pro_id])
    job = await pg.fetchrow(sql, *args)
    if job and job.get("customer_id"):
        await customers_repo.refresh_rollups(str(job["customer_id"]))
    return job


async def set_status(pro_id: str, job_id: str, status: str) -> dict:
    job = await get(pro_id, job_id)
    if not job:
        raise LookupError("Job not found")

    current = job["status"]
    if status == current:
        return job
    if status not in TRANSITIONS.get(current, set()):
        allowed = ", ".join(sorted(TRANSITIONS.get(current, set()))) or "nothing"
        raise ValueError(f"Cannot move a job from '{current}' to '{status}'. Allowed: {allowed}.")

    # Stamp the milestone timestamps the first time each is reached.
    sets = "status = $3::job_status"
    if status == "in_progress" and not job.get("started_at"):
        sets += ", started_at = now()"
    if status == "completed" and not job.get("completed_at"):
        sets += ", completed_at = now()"

    updated = await pg.fetchrow(
        f"update jobs set {sets} where id = $1 and pro_id = $2 and deleted_at is null returning *",
        job_id, pro_id, status,
    )
    if updated and updated.get("customer_id"):
        await customers_repo.refresh_rollups(str(updated["customer_id"]))
    return updated


async def soft_delete(pro_id: str, job_id: str) -> bool:
    row = await pg.fetchrow(
        "update jobs set deleted_at = now() "
        "where id = $1 and pro_id = $2 and deleted_at is null returning customer_id",
        job_id, pro_id,
    )
    if row and row.get("customer_id"):
        await customers_repo.refresh_rollups(str(row["customer_id"]))
    return row is not None


async def rotate_share_token(pro_id: str, job_id: str) -> Optional[str]:
    return await pg.fetchval(
        "update jobs set share_token = $3 where id = $1 and pro_id = $2 "
        "and deleted_at is null returning share_token",
        job_id, pro_id, new_token(),
    )


async def list_for_pro(pro_id: str, *, status: Optional[str] = None,
                       mode: Optional[str] = None, customer_id: Optional[str] = None,
                       q: str = "", limit: int = 50, offset: int = 0) -> dict:
    where = ["j.pro_id = $1", "j.deleted_at is null"]
    args: list[Any] = [pro_id]

    if status:
        # 'open' is a UI convenience meaning "not finished".
        if status == "open":
            where.append("j.status not in ('closed','cancelled')")
        else:
            args.append(status)
            where.append(f"j.status = ${len(args)}::job_status")
    if mode:
        args.append(mode)
        where.append(f"j.mode = ${len(args)}::job_mode")
    if customer_id:
        args.append(customer_id)
        where.append(f"j.customer_id = ${len(args)}")
    if q:
        args.append(f"%{q.strip()}%")
        i = len(args)
        where.append(f"(j.title ilike ${i} or j.job_number ilike ${i} or c.name ilike ${i})")

    clause = " and ".join(where)
    total = await pg.fetchval(
        f"select count(*) from jobs j left join customers c on c.id = j.customer_id "
        f"where {clause}", *args)

    args.extend([limit, offset])
    rows = await pg.fetch(
        f"""
        select j.*,
               c.name  as customer_name,
               c.phone as customer_phone,
               c.city  as customer_city
          from jobs j
          left join customers c on c.id = j.customer_id
         where {clause}
         order by
           case j.urgency when 'emergency' then 0 when 'urgent' then 1 else 2 end,
           coalesce(j.scheduled_start, j.created_at) desc
         limit ${len(args)-1} offset ${len(args)}
        """,
        *args,
    )
    return {"jobs": rows, "total": total}


async def detail(pro_id: str, job_id: str) -> Optional[dict]:
    """Job plus its children, in one round trip."""
    job = await pg.fetchrow(
        """
        select j.*, row_to_json(c.*) as customer
          from jobs j
          left join customers c on c.id = j.customer_id
         where j.id = $1 and j.pro_id = $2 and j.deleted_at is null
        """,
        job_id, pro_id,
    )
    if not job:
        return None

    job["quotes"] = await pg.fetch(
        "select id, quote_number, tier, version, status, net_total, gross_total, "
        "valid_until, sent_at, decided_at from quotes where job_id = $1 "
        "order by created_at desc", job_id)
    job["change_orders"] = await pg.fetch(
        "select * from change_orders where job_id = $1 order by created_at", job_id)
    job["invoices"] = await pg.fetch(
        "select id, invoice_number, type, status, issue_date, gross_total, "
        "paid_total, outstanding, payment_state from invoices where job_id = $1 "
        "order by issue_date desc nulls last, created_at desc", job_id)
    job["documents"] = await pg.fetch(
        "select * from job_documents where job_id = $1 order by created_at", job_id)

    if job["mode"] == "project":
        job["tasks"] = await pg.fetch(
            "select * from job_tasks where job_id = $1 order by column_key, sort_order", job_id)
        job["materials"] = await pg.fetch(
            "select * from job_materials where job_id = $1 order by created_at", job_id)
        job["diary"] = await pg.fetch(
            "select * from job_diary where job_id = $1 order by entry_date desc", job_id)

    return job


async def dashboard_counts(pro_id: str) -> dict:
    row = await pg.fetchrow(
        """
        select
          count(*) filter (where status = 'lead')        as leads,
          count(*) filter (where status = 'quoted')      as quoted,
          count(*) filter (where status in ('accepted','scheduled')) as booked,
          count(*) filter (where status = 'in_progress') as active,
          count(*) filter (where status = 'completed')   as awaiting_invoice,
          count(*) filter (where urgency = 'emergency'
                             and status not in ('closed','cancelled')) as emergencies
          from jobs where pro_id = $1 and deleted_at is null
        """,
        pro_id,
    )
    return {k: int(v or 0) for k, v in row.items()}
