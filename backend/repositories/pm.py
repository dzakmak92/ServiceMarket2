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


async def list_materials(pro_id: str, job_id: str) -> dict:
    """The positions and what they add up to.

    The totals used to be absent and the screen showed three tiles reading
    € 0,00 above five priced positions — the route returned `{materials}` and
    nothing else, so the client's `data.totals || {planned: 0, …}` fallback
    was the only thing that ever ran. They are summed here rather than in the
    browser because the same three figures belong on the chain, on the billing
    step and in an export, and three places summing the same column is three
    chances to disagree.

    `actual_cost` is null until something is actually bought, which is not the
    same as zero: `variance` therefore compares against what has been bought,
    and `planned_open` says how much of the plan is still ahead. A single
    "actual" figure without that split reads as a saving when it is only an
    errand not yet run.
    """
    await _guard(pro_id, job_id)
    rows = await pg.fetch(
        "select * from job_materials where job_id = $1 order by created_at", job_id)
    planned = actual = planned_bought = 0.0
    bought = 0
    for r in rows:
        qty = float(r["qty"] or 0)
        p = float(r["planned_cost"] or 0) * qty
        planned += p
        if r["actual_cost"] is not None:
            actual += float(r["actual_cost"]) * qty
            planned_bought += p
            bought += 1
    return {
        "materials": rows,
        "totals": {
            "planned": round(planned, 2),
            "actual": round(actual, 2),
            # Against the plan for what is bought, so the number means
            # "over or under on what I have actually paid for".
            "variance": round(actual - planned_bought, 2),
            "planned_open": round(planned - planned_bought, 2),
            "count": len(rows),
            "bought": bought,
        },
    }


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
async def list_diary(pro_id: str, job_id: str) -> dict:
    """The entries and the hours they add up to.

    Same shape of hole as the materials totals: the route returned `{entries}`
    with no `total_hours`, so the screen printed "Stunden gesamt 0.0 h" above
    entries of 4.5 h and 7.5 h. Summed here for the same reason — the figure
    is wanted on the chain and in the export as well.
    """
    await _guard(pro_id, job_id)
    rows = await pg.fetch(
        "select * from job_diary where job_id = $1 order by entry_date desc, created_at desc",
        job_id)
    return {
        "entries": rows,
        "total_hours": round(sum(float(r["hours"] or 0) for r in rows), 2),
    }


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
               coalesce(sum(coalesce(actual_cost, planned_cost) * qty), 0) as actual,
               -- Counted here as well as summed, so the shut step card on the
               -- chain can say "3 of 5 bought" without mounting the whole
               -- material list to find out.
               count(*) as count,
               count(*) filter (where actual_cost is not null) as bought
          from job_materials where job_id = $1
        """, job_id)
    time = await pg.fetchrow(
        "select coalesce(sum(seconds), 0) as s from job_time_logs "
        "where job_id = $1 and billable", job_id)
    # Diary hours are not timer hours: one is what somebody wrote down at the
    # end of a day, the other what a stopwatch measured. The chain shows the
    # first on the notes step, so it has to come back separately rather than
    # be read off `pl.labour_hours`.
    diary = await pg.fetchrow(
        "select coalesce(sum(hours), 0) as h, count(*) as n "
        "from job_diary where job_id = $1", job_id)
    co = await pg.fetchrow(
        """
        select coalesce(sum(net_amount) filter (where status = 'approved'), 0) as approved,
               coalesce(sum(net_amount) filter (where status = 'invoiced'), 0) as invoiced,
               count(*) filter (where status = 'sent') as pending,
               count(*) as n
          from change_orders where job_id = $1
        """, job_id)
    inv = await pg.fetchrow(
        """
        -- Two different predicates on purpose. What was invoiced and paid
        -- includes cancelled documents, because the Storno that cancels one
        -- is already in the sum with a negative total and the pair has to
        -- net to zero — excluding the original subtracted the amount twice.
        -- Outstanding is a receivable, and neither a cancelled invoice nor a
        -- credit note is one.
        select coalesce(sum(net_total), 0) as invoiced_net,
               coalesce(sum(paid_total), 0) as paid,
               coalesce(sum(outstanding) filter (
                   where cancelled_at is null and type <> 'storno'), 0) as outstanding
          from invoices
         where job_id = $1 and status <> 'draft'
        """, job_id)

    # The job, its customer, the accepted quote and the invoices raised
    # against it. All four were already on the screen and none of them were in
    # this response — the Overview tab read `data.pl`, `data.job`,
    # `data.customer`, `data.quote` and `data.invoices`, got undefined for
    # every one, and threw on render. Since it is the default tab of the job
    # detail page, every route into a job landed on a blank screen.
    job = await pg.fetchrow(
        "select id, job_number, title, description, status::text as status, "
        "category, site_address, site_postal_code, site_city, site_lat, "
        "site_lng, urgency, scheduled_start, scheduled_end, started_at, "
        "completed_at, abnahme_at, contract_amount, share_token, created_at "
        "from jobs where id = $1", job_id)
    customer = None
    cust_id = await pg.fetchval("select customer_id from jobs where id = $1", job_id)
    if cust_id:
        customer = await pg.fetchrow(
            "select id, name, email, phone, address, postal_code, city, country "
            "from customers where id = $1", cust_id)
    quote = await pg.fetchrow(
        "select id, quote_number, title, intro, net_total, gross_total, "
        "status::text as status, decided_at, sent_at, valid_until "
        "from quotes where job_id = $1 and status = 'accepted' "
        "order by decided_at desc nulls last limit 1", job_id)
    # `cancelled_at` and `net_total` are on the list because the billing step
    # settles the contract against what has already been invoiced: without the
    # first, a cancelled Abschlag still counts as paid-for and locks the part
    # of the contract it was meant to cover.
    invoices = await pg.fetch(
        "select id, invoice_number, type::text as type, status::text as status, "
        "payment_state::text as payment_state, net_total, gross_total, outstanding, "
        "cancelled_at, issue_date, due_date from invoices "
        "where job_id = $1 and status <> 'draft' order by issue_date, invoice_number",
        job_id)

    total, done = int(tasks["total"] or 0), int(tasks["done"] or 0)
    # Labour is valued at the business's own hourly rate. Stated on the
    # response rather than assumed by the screen, so a pro who has not set one
    # sees a zero labour cost they can explain instead of a silent default.
    rate = float(await pg.fetchval(
        "select hourly_rate from pro_profiles where id = $1", pro_id) or 0)
    hours = round(int(time["s"] or 0) / 3600, 2)
    revenue = float(inv["invoiced_net"] or 0) or float(quote["net_total"] if quote else 0)
    labour_cost = round(hours * rate, 2)
    profit = round(revenue - float(mat["actual"] or 0) - labour_cost, 2)
    return {
        "job": dict(job) if job else {},
        "customer": dict(customer) if customer else {},
        "quote": dict(quote) if quote else {},
        "invoices": [dict(i) for i in invoices],
        # The single number the project view exists for: what this job is
        # actually earning once the hours and the material are counted. It is
        # a live figure, not a forecast — the hours come from the timer.
        "pl": {
            "revenue_eur": revenue,
            "revenue_basis": "invoiced" if float(inv["invoiced_net"] or 0) else "quoted",
            "materials_planned_eur": float(mat["planned"]),
            "materials_actual_eur": float(mat["actual"]),
            "labour_hours": hours,
            "labour_rate_eur": rate,
            "labour_cost_eur": labour_cost,
            "profit_eur": profit,
            "margin_pct": round(profit / revenue * 100, 1) if revenue else 0.0,
        },
        "progress_pct": round(done / total * 100) if total else 0,
        "materials_count": int(mat["count"] or 0),
        "materials_bought": int(mat["bought"] or 0),
        "diary_hours": float(diary["h"] or 0),
        "diary_entries": int(diary["n"] or 0),
        "tasks_total": total,
        "tasks_done": done,
        "tasks": {"total": total, "done": done,
                  "progress_pct": round(done / total * 100) if total else 0},
        "materials": {"planned": float(mat["planned"]), "actual": float(mat["actual"])},
        "time": {"billable_seconds": int(time["s"] or 0),
                 "billable_hours": round(int(time["s"] or 0) / 3600, 2)},
        "change_orders_count": int(co["n"] or 0),
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


async def add_time_log(pro_id: str, job_id: str, data: dict) -> dict:
    """Insert a device-timed interval, idempotently on the client's id.

    seconds is not sent: the column is generated from the two timestamps, so
    the database derives it. That is the right place for it — this figure
    reaches an invoice, and a device with a drifted clock cannot inflate it
    independently of the interval it claims to have worked.
    """
    await _guard(pro_id, job_id)
    started, stopped = data["started_at"], data["stopped_at"]
    payload = {
        "id": data["client_id"],
        "job_id": job_id,
        "started_at": started,
        "stopped_at": stopped,
        "note": data.get("note"),
        "billable": data.get("billable", True),
    }
    cols = [k for k, v in payload.items() if v is not None]
    vals = [payload[k] for k in cols]
    row = await pg.fetchrow(
        f"insert into job_time_logs ({', '.join(cols)}) "
        f"values ({pg.placeholders(len(cols))}) "
        f"on conflict (id) do nothing returning *", *vals)
    if row:
        return row
    return await pg.fetchrow(
        "select * from job_time_logs where id = $1 and job_id = $2",
        data["client_id"], job_id)
