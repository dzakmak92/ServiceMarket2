"""Project-mode children of a job: tasks, materials, diary, timer, documents,
and Nachträge.

Everything is reached through the job, and the job is pro-scoped, so a
caller cannot address another tradesperson's task by guessing an id.
"""
from __future__ import annotations

from typing import Any, Optional

from db import pg


async def _own_job(pro_id: str, job_id: str) -> bool:
    return bool(await pg.fetchval(
        "select 1 from jobs where id = $1 and pro_id = $2 and deleted_at is null",
        job_id, pro_id))


async def _guard(pro_id: str, job_id: str) -> None:
    if not await _own_job(pro_id, job_id):
        raise LookupError("Job not found")


# ── Tasks ──────────────────────────────────────────────────────────────
TASK_FIELDS = {"title", "description", "column_key", "sort_order",
               "assignee", "due_date", "depends_on"}


async def list_tasks(pro_id: str, job_id: str) -> list[dict]:
    await _guard(pro_id, job_id)
    return await pg.fetch(
        "select * from job_tasks where job_id = $1 order by column_key, sort_order", job_id)


async def create_task(pro_id: str, job_id: str, data: dict) -> dict:
    await _guard(pro_id, job_id)
    payload = {k: v for k, v in data.items() if k in TASK_FIELDS and v is not None}
    payload["job_id"] = job_id
    if "sort_order" not in payload:
        payload["sort_order"] = int(await pg.fetchval(
            "select coalesce(max(sort_order), 0) + 1 from job_tasks "
            "where job_id = $1 and column_key = $2",
            job_id, payload.get("column_key", "todo")) or 1)
    sql, args = pg.build_insert("job_tasks", payload)
    return await pg.fetchrow(sql, *args)


async def update_task(pro_id: str, job_id: str, task_id: str, data: dict) -> Optional[dict]:
    await _guard(pro_id, job_id)
    payload = {k: v for k, v in data.items() if k in TASK_FIELDS and v is not None}
    if not payload:
        return await pg.fetchrow(
            "select * from job_tasks where id = $1 and job_id = $2", task_id, job_id)
    # Moving a card to Done stamps it; moving it back clears the stamp, so
    # "when was this finished" never lies after a card bounces.
    extra = ""
    if payload.get("column_key") == "done":
        extra = ", done_at = coalesce(done_at, now())"
    elif "column_key" in payload:
        extra = ", done_at = null"
    sql, args = pg.build_update("job_tasks", payload, "id = $1 and job_id = $2",
                                [task_id, job_id])
    sql = sql.replace(" where ", extra + " where ", 1)
    return await pg.fetchrow(sql, *args)


async def delete_task(pro_id: str, job_id: str, task_id: str) -> bool:
    await _guard(pro_id, job_id)
    return bool(await pg.fetchrow(
        "delete from job_tasks where id = $1 and job_id = $2 returning id", task_id, job_id))


# ── Materials ──────────────────────────────────────────────────────────
MATERIAL_FIELDS = {"name", "brand", "barcode", "qty", "unit", "planned_cost",
                   "actual_cost", "supplier", "ordered_at", "expected_at",
                   "received_at", "photos"}


async def list_materials(pro_id: str, job_id: str) -> list[dict]:
    await _guard(pro_id, job_id)
    return await pg.fetch(
        "select * from job_materials where job_id = $1 order by created_at", job_id)


async def create_material(pro_id: str, job_id: str, data: dict) -> dict:
    await _guard(pro_id, job_id)
    payload = {k: v for k, v in data.items() if k in MATERIAL_FIELDS and v is not None}
    payload["job_id"] = job_id
    sql, args = pg.build_insert("job_materials", payload)
    return await pg.fetchrow(sql, *args)


async def update_material(pro_id: str, job_id: str, material_id: str,
                          data: dict) -> Optional[dict]:
    await _guard(pro_id, job_id)
    payload = {k: v for k, v in data.items() if k in MATERIAL_FIELDS and v is not None}
    if not payload:
        return None
    sql, args = pg.build_update("job_materials", payload, "id = $1 and job_id = $2",
                                [material_id, job_id])
    return await pg.fetchrow(sql, *args)


async def delete_material(pro_id: str, job_id: str, material_id: str) -> bool:
    await _guard(pro_id, job_id)
    return bool(await pg.fetchrow(
        "delete from job_materials where id = $1 and job_id = $2 returning id",
        material_id, job_id))


# ── Diary ──────────────────────────────────────────────────────────────
async def list_diary(pro_id: str, job_id: str) -> list[dict]:
    await _guard(pro_id, job_id)
    return await pg.fetch(
        "select * from job_diary where job_id = $1 order by entry_date desc, created_at desc",
        job_id)


async def add_diary(pro_id: str, job_id: str, data: dict) -> dict:
    """Insert a diary entry, idempotently when the caller names the row.

    Field capture happens where the signal does not reach — Sanitaer cellars,
    new-build sites — so a write is retried by the offline queue and the same
    entry can arrive twice. When the client supplies the id it chose before
    going offline, a replay is a no-op returning the row that already exists.
    Without it a retry is indistinguishable from a genuine second entry.
    """
    await _guard(pro_id, job_id)
    payload = {k: v for k, v in data.items()
               if k in {"entry_date", "text", "hours", "weather", "author", "photos"}
               and v is not None}
    payload["job_id"] = job_id

    client_id = data.get("client_id")
    if not client_id:
        sql, args = pg.build_insert("job_diary", payload)
        return await pg.fetchrow(sql, *args)

    payload["id"] = client_id
    cols = list(payload)
    sql = (f"insert into job_diary ({', '.join(cols)}) "
           f"values ({pg.placeholders(len(cols))}) "
           f"on conflict (id) do nothing returning *")
    row = await pg.fetchrow(sql, *payload.values())
    if row:
        return row
    # Already stored by an earlier attempt — scoped to this job so a guessed
    # id cannot read someone else's entry.
    return await pg.fetchrow(
        "select * from job_diary where id = $1 and job_id = $2", client_id, job_id)


async def delete_diary(pro_id: str, job_id: str, entry_id: str) -> bool:
    await _guard(pro_id, job_id)
    return bool(await pg.fetchrow(
        "delete from job_diary where id = $1 and job_id = $2 returning id", entry_id, job_id))


# ── Timer ──────────────────────────────────────────────────────────────
async def running_timer(pro_id: str) -> Optional[dict]:
    return await pg.fetchrow(
        """
        select t.*, j.title as job_title, j.job_number
          from job_time_logs t join jobs j on j.id = t.job_id
         where j.pro_id = $1 and t.stopped_at is null
         limit 1
        """, pro_id)


async def start_timer(pro_id: str, job_id: str, *, note: Optional[str] = None) -> dict:
    await _guard(pro_id, job_id)
    # A partial unique index enforces one running timer per job; stopping any
    # other running timer first is what makes "start" idempotent from the
    # tradesperson's point of view — they tap start on the next job without
    # remembering to stop the last one.
    async with pg.transaction() as con:
        await con.execute(
            """
            update job_time_logs t set stopped_at = now()
              from jobs j
             where j.id = t.job_id and j.pro_id = $1 and t.stopped_at is null
            """, pro_id)
        row = await con.fetchrow(
            "insert into job_time_logs (job_id, started_at, note) "
            "values ($1, now(), $2) returning *", job_id, note)
    return dict(row)


async def stop_timer(pro_id: str, job_id: str) -> Optional[dict]:
    await _guard(pro_id, job_id)
    return await pg.fetchrow(
        "update job_time_logs set stopped_at = now() "
        "where job_id = $1 and stopped_at is null returning *", job_id)


async def list_time_logs(pro_id: str, job_id: str) -> dict:
    await _guard(pro_id, job_id)
    rows = await pg.fetch(
        "select * from job_time_logs where job_id = $1 order by started_at desc", job_id)
    total = sum(int(r["seconds"] or 0) for r in rows)
    billable = sum(int(r["seconds"] or 0) for r in rows if r["billable"])
    return {"logs": rows, "total_seconds": total, "billable_seconds": billable,
            "total_hours": round(total / 3600, 2), "billable_hours": round(billable / 3600, 2)}


# ── Documents ──────────────────────────────────────────────────────────
async def add_document(pro_id: str, job_id: str, data: dict) -> dict:
    await _guard(pro_id, job_id)
    payload = {k: v for k, v in data.items()
               if k in {"kind", "storage_ref", "filename", "content_type",
                        "size_bytes", "caption", "taken_at", "customer_visible"}
               and v is not None}
    payload["job_id"] = job_id
    sql, args = pg.build_insert("job_documents", payload)
    return await pg.fetchrow(sql, *args)


async def list_documents(pro_id: str, job_id: str) -> list[dict]:
    await _guard(pro_id, job_id)
    return await pg.fetch(
        "select * from job_documents where job_id = $1 order by created_at", job_id)


async def delete_document(pro_id: str, job_id: str, doc_id: str) -> bool:
    await _guard(pro_id, job_id)
    return bool(await pg.fetchrow(
        "delete from job_documents where id = $1 and job_id = $2 returning id", doc_id, job_id))


# ── Change orders (Nachträge) ──────────────────────────────────────────
CO_FIELDS = {"title", "description", "net_amount", "vat_rate", "kind"}


async def list_change_orders(pro_id: str, job_id: str) -> list[dict]:
    await _guard(pro_id, job_id)
    return await pg.fetch(
        "select * from change_orders where job_id = $1 order by created_at", job_id)


async def create_change_order(pro_id: str, job_id: str, data: dict) -> dict:
    await _guard(pro_id, job_id)
    payload = {k: v for k, v in data.items() if k in CO_FIELDS and v is not None}
    payload["job_id"] = job_id
    n = int(await pg.fetchval(
        "select count(*) from change_orders where job_id = $1", job_id) or 0)
    payload["co_number"] = f"CO-{n + 1:02d}"
    sql, args = pg.build_insert("change_orders", payload)
    return await pg.fetchrow(sql, *args)


async def update_change_order(pro_id: str, job_id: str, co_id: str,
                              data: dict) -> Optional[dict]:
    await _guard(pro_id, job_id)
    payload = {k: v for k, v in data.items() if k in CO_FIELDS and v is not None}
    if not payload:
        return None
    # An invoiced Nachtrag is part of an issued invoice; changing its amount
    # afterwards would silently desync the two.
    sql, args = pg.build_update(
        "change_orders", payload,
        "id = $1 and job_id = $2 and status in ('draft','sent')", [co_id, job_id])
    return await pg.fetchrow(sql, *args)


async def send_change_order(pro_id: str, job_id: str, co_id: str) -> Optional[dict]:
    await _guard(pro_id, job_id)
    return await pg.fetchrow(
        "update change_orders set status = 'sent', sent_at = now() "
        "where id = $1 and job_id = $2 and status = 'draft' returning *", co_id, job_id)


async def decide_change_order(co_id: str, *, approve: bool, signed_by: str = "",
                              signature_ref: Optional[str] = None) -> Optional[dict]:
    """Customer decision, taken from the portal — hence no pro scope.

    The signature is what turns a verbal "yes, go ahead" into something that
    survives a later dispute about whether the extra was ever agreed.
    """
    return await pg.fetchrow(
        """
        update change_orders
           set status = $2, decided_at = now(), approved_by = $3, signature_ref = $4
         where id = $1 and status = 'sent'
        returning *
        """,
        co_id, "approved" if approve else "rejected",
        (signed_by or "").strip()[:200] or None, signature_ref)


# ── Project overview ───────────────────────────────────────────────────
async def overview(pro_id: str, job_id: str) -> dict:
    """Progress plus a live P&L, which is what makes the project view worth
    opening rather than just a task list."""
    await _guard(pro_id, job_id)

    tasks = await pg.fetchrow(
        """
        select count(*) as total,
               count(*) filter (where column_key = 'done') as done
          from job_tasks where job_id = $1
        """, job_id)
    mat = await pg.fetchrow(
        """
        select coalesce(sum(planned_cost * qty), 0) as planned,
               coalesce(sum(coalesce(actual_cost, planned_cost) * qty), 0) as actual
          from job_materials where job_id = $1
        """, job_id)
    time = await pg.fetchrow(
        "select coalesce(sum(seconds), 0) as s from job_time_logs "
        "where job_id = $1 and billable", job_id)
    co = await pg.fetchrow(
        """
        select coalesce(sum(net_amount) filter (where status = 'approved'), 0) as approved,
               coalesce(sum(net_amount) filter (where status = 'invoiced'), 0) as invoiced,
               count(*) filter (where status = 'sent') as pending
          from change_orders where job_id = $1
        """, job_id)
    inv = await pg.fetchrow(
        """
        select coalesce(sum(net_total), 0) as invoiced_net,
               coalesce(sum(paid_total), 0) as paid,
               coalesce(sum(outstanding), 0) as outstanding
          from invoices
         where job_id = $1 and status <> 'draft' and cancelled_at is null
        """, job_id)

    total, done = int(tasks["total"] or 0), int(tasks["done"] or 0)
    return {
        "tasks": {"total": total, "done": done,
                  "progress_pct": round(done / total * 100) if total else 0},
        "materials": {"planned": float(mat["planned"]), "actual": float(mat["actual"])},
        "time": {"billable_seconds": int(time["s"] or 0),
                 "billable_hours": round(int(time["s"] or 0) / 3600, 2)},
        "change_orders": {"approved_net": float(co["approved"]),
                          "invoiced_net": float(co["invoiced"]),
                          "pending": int(co["pending"])},
        "financials": {
            "invoiced_net": float(inv["invoiced_net"]),
            "paid": float(inv["paid"]),
            "outstanding": float(inv["outstanding"]),
            "material_cost": float(mat["actual"]),
            "margin_net": float(inv["invoiced_net"] or 0) - float(mat["actual"] or 0),
        },
    }
