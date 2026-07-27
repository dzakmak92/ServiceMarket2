"""Customer CRM.

The marketplace had no such thing: a customer was either a platform account
(`users` with role homeowner) or an unstructured blob embedded on a PM
project. Neither survives the pivot — customers never log in here, and the
pro owns the record.

Every read is scoped by `pro_id`. There is no unscoped accessor on purpose:
one tradesperson must never be able to reach another's customer list, and
the cheapest way to guarantee that is to make it impossible to ask.
"""
from __future__ import annotations

from typing import Any, Optional

from db import pg

# Columns a caller may set. Anything else in the payload is ignored rather
# than trusted — this is the write boundary for user input.
WRITABLE = {
    "type", "name", "company_name", "contact_person", "email", "phone",
    "address", "postal_code", "city", "country", "lat", "lng",
    "vat_id", "is_bauleister", "notes", "tags",
}


def _clean(data: dict) -> dict:
    out = {k: v for k, v in data.items() if k in WRITABLE and v is not None}
    if "name" in out:
        out["name"] = out["name"].strip()
    if "email" in out and out["email"]:
        out["email"] = out["email"].strip().lower()
    return out


async def create(pro_id: str, data: dict) -> dict:
    payload = _clean(data)
    if not payload.get("name"):
        raise ValueError("Customer name is required")
    payload["pro_id"] = pro_id
    sql, args = pg.build_insert("customers", payload)
    return await pg.fetchrow(sql, *args)


async def get(pro_id: str, customer_id: str) -> Optional[dict]:
    return await pg.fetchrow(
        "select * from customers where id = $1 and pro_id = $2 and deleted_at is null",
        customer_id, pro_id,
    )


async def update(pro_id: str, customer_id: str, data: dict) -> Optional[dict]:
    payload = _clean(data)
    if not payload:
        return await get(pro_id, customer_id)
    sql, args = pg.build_update(
        "customers", payload,
        "id = $1 and pro_id = $2 and deleted_at is null", [customer_id, pro_id],
    )
    return await pg.fetchrow(sql, *args)


async def soft_delete(pro_id: str, customer_id: str) -> bool:
    """Soft delete. A customer with invoices must survive: those invoices are
    legally retained for 7 years (DE: up to 10) and carry a foreign key."""
    row = await pg.fetchrow(
        "update customers set deleted_at = now() "
        "where id = $1 and pro_id = $2 and deleted_at is null returning id",
        customer_id, pro_id,
    )
    return row is not None


async def search(pro_id: str, *, q: str = "", limit: int = 50, offset: int = 0,
                 customer_type: Optional[str] = None) -> dict:
    """Trigram search over name, plus exact-ish matching on email/phone/city.

    Tradespeople search by half-remembered fragments ("that Gruber job in
    Floridsdorf"), so partial matching matters more than precision here.
    """
    where = ["pro_id = $1", "deleted_at is null"]
    args: list[Any] = [pro_id]

    if q:
        args.append(f"%{q.strip()}%")
        i = len(args)
        where.append(
            f"(name ilike ${i} or company_name ilike ${i} "
            f"or email ilike ${i} or phone ilike ${i} or city ilike ${i})"
        )
    if customer_type:
        args.append(customer_type)
        where.append(f"type = ${len(args)}::customer_type")

    clause = " and ".join(where)
    total = await pg.fetchval(f"select count(*) from customers where {clause}", *args)

    args.extend([limit, offset])
    rows = await pg.fetch(
        f"select * from customers where {clause} "
        f"order by last_job_at desc nulls last, name asc "
        f"limit ${len(args)-1} offset ${len(args)}",
        *args,
    )
    return {"customers": rows, "total": total}


async def find_duplicate(pro_id: str, *, email: str = "", phone: str = "",
                         name: str = "") -> Optional[dict]:
    """Best-effort duplicate detection before creating from a captured lead.

    The same customer arrives repeatedly through different channels — a
    MyHammer lead this month, a phone call the next. Silently accumulating
    three records for one person destroys the repeat-customer view that makes
    the CRM worth having.
    """
    if email:
        row = await pg.fetchrow(
            "select * from customers where pro_id = $1 and lower(email) = lower($2) "
            "and deleted_at is null limit 1", pro_id, email.strip())
        if row:
            return row
    if phone:
        digits = "".join(ch for ch in phone if ch.isdigit())
        if len(digits) >= 7:
            row = await pg.fetchrow(
                "select * from customers where pro_id = $1 and deleted_at is null "
                "and regexp_replace(coalesce(phone,''), '\\D', '', 'g') like $2 limit 1",
                pro_id, f"%{digits[-7:]}")
            if row:
                return row
    if name:
        row = await pg.fetchrow(
            "select * from customers where pro_id = $1 and deleted_at is null "
            "and lower(name) = lower($2) limit 1", pro_id, name.strip())
        if row:
            return row
    return None


async def get_or_create(pro_id: str, data: dict) -> tuple[dict, bool]:
    """Returns (customer, created). Used by lead intake."""
    existing = await find_duplicate(
        pro_id,
        email=data.get("email") or "",
        phone=data.get("phone") or "",
        name=data.get("name") or "",
    )
    if existing:
        return existing, False
    return await create(pro_id, data), True


async def refresh_rollups(customer_id: str) -> None:
    """Recompute jobs_count / lifetime_value / last_job_at.

    Lifetime value counts only issued, non-cancelled invoices — a draft is
    not revenue, and a stornoed invoice nets itself out via its negative
    mirror.
    """
    await pg.execute(
        """
        update customers c set
          jobs_count = (
            select count(*) from jobs j
             where j.customer_id = c.id and j.deleted_at is null),
          last_job_at = (
            select max(coalesce(j.completed_at, j.created_at)) from jobs j
             where j.customer_id = c.id and j.deleted_at is null),
          lifetime_value = coalesce((
            select sum(i.gross_total) from invoices i
             where i.customer_id = c.id
               and i.status <> 'draft'
               and i.cancelled_at is null), 0)
        where c.id = $1
        """,
        customer_id,
    )
