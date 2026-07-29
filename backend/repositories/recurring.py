"""Recurring service contracts and the visits they generate.

The plan calls this the highest-LTV scenario in all five trades: a
Hausverwaltung with twelve fortnightly sites is worth more than any single
renovation, and it is the case a quote-and-invoice tool without a schedule
cannot serve at all.

A contract is not a job. It is the rule that produces jobs — one per visit,
each a normal row on the spine, so a visit carries tasks, photos, a timer and
an invoice exactly like any other work. Nothing downstream needs to know it
came from a contract.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

from db import pg

# Cadences that produce dates on their own. Seasonal and on-demand do not:
# Winterdienst is triggered by snow, not by the calendar, and inventing dates
# for it would fill the planner with visits nobody will make.
AUTOMATIC = {"weekly": 7, "fortnightly": 14}
MONTHLY_STEP = {"monthly": 1, "quarterly": 3}


def _add_months(d: date, months: int) -> date:
    """Same day next month, clamped to the month's length.

    A contract starting on the 31st visits on the 30th in April and the 28th
    in February. Clamping rather than rolling into the next month keeps a
    monthly visit inside the month it belongs to, which is what the invoice
    period assumes.
    """
    total = (d.year * 12 + d.month - 1) + months
    year, month = divmod(total, 12)
    month += 1
    last = (date(year + (month == 12), (month % 12) + 1, 1) - timedelta(days=1)).day
    return date(year, month, min(d.day, last))


def visit_dates(contract: dict, until: date, *, start_from: Optional[date] = None) -> list[date]:
    """Dates this contract is due, up to and including `until`.

    Pure, so it can be reasoned about and tested without a database.
    """
    cadence = contract["cadence"]
    starts_on: date = contract["starts_on"]
    ends_on: Optional[date] = contract.get("ends_on")

    horizon = min(until, ends_on) if ends_on else until
    cursor = starts_on
    weekday = contract.get("weekday")

    if cadence in AUTOMATIC and weekday is not None:
        # Shift the first visit forward to the contracted weekday. Monday is 0
        # in both Python and the column, so no translation is needed.
        cursor += timedelta(days=(weekday - cursor.weekday()) % 7)

    out: list[date] = []

    if cadence in AUTOMATIC:
        step = AUTOMATIC[cadence]
        if start_from and cursor < start_from:
            gap = (start_from - cursor).days
            cursor += timedelta(days=((gap + step - 1) // step) * step)
        delta = timedelta(days=step)
        while cursor <= horizon:
            out.append(cursor)
            cursor += delta

    elif cadence in MONTHLY_STEP:
        # Every date is measured from the anchor, never from the previous
        # visit. Stepping month by month makes clamping stick: a contract
        # starting on the 31st clamps to 28 February and then stays on the
        # 28th for the rest of the year instead of returning to the 31st.
        months = MONTHLY_STEP[cadence]
        n = 0
        while True:
            visit = _add_months(cursor, n * months)
            if visit > horizon:
                break
            if not start_from or visit >= start_from:
                out.append(visit)
            n += 1

    # seasonal / on_demand intentionally produce nothing.
    return out


async def list_for_pro(pro_id: str, *, active: Optional[bool] = None) -> dict:
    where = ["c.pro_id = $1"]
    args: list[Any] = [pro_id]
    if active is not None:
        args.append(active)
        where.append(f"c.active = ${len(args)}")
    rows = await pg.fetch(
        f"""
        select c.*, cu.name as customer_name,
               (select count(*) from jobs j
                 where j.recurring_contract_id = c.id and j.deleted_at is null) as visits_total,
               (select count(*) from jobs j
                 where j.recurring_contract_id = c.id and j.deleted_at is null
                   and j.visit_date >= current_date) as visits_upcoming
          from recurring_contracts c
          join customers cu on cu.id = c.customer_id
         where {' and '.join(where)}
         order by c.active desc, c.title
        """, *args)
    return {"contracts": rows, "total": len(rows)}


async def get(pro_id: str, contract_id: str) -> Optional[dict]:
    return await pg.fetchrow(
        "select * from recurring_contracts where id = $1 and pro_id = $2",
        contract_id, pro_id)


async def create(pro_id: str, data: dict) -> dict:
    payload = {k: v for k, v in data.items() if v is not None}
    payload["pro_id"] = pro_id
    sql, args = pg.build_insert("recurring_contracts", payload)
    return await pg.fetchrow(sql, *args)


async def update(pro_id: str, contract_id: str, data: dict) -> Optional[dict]:
    payload = {k: v for k, v in data.items() if v is not None}
    if not payload:
        return await get(pro_id, contract_id)
    sql, args = pg.build_update("recurring_contracts", payload,
                                "id = $1 and pro_id = $2", [contract_id, pro_id])
    return await pg.fetchrow(sql, *args)


async def generate(pro_id: str, contract_id: str, until: date) -> dict:
    """Materialise visits up to `until`. Safe to run repeatedly.

    Idempotence comes from a unique index on (recurring_contract_id,
    visit_date) rather than from checking first: two runs racing each other —
    a cron and a pro pressing the button — would both pass a check and both
    insert. `on conflict do nothing` cannot.

    Past dates are skipped. Generating a visit for last Tuesday would put work
    in the planner that nobody is going to do, and would bill for it.
    """
    contract = await get(pro_id, contract_id)
    if not contract:
        raise LookupError("Contract not found")
    if not contract["active"]:
        return {"created": 0, "skipped": 0, "dates": [], "reason": "contract is inactive"}

    today = date.today()
    wanted = [d for d in visit_dates(dict(contract), until, start_from=today)]
    created: list[str] = []
    for visit in wanted:
        row = await pg.fetchrow(
            """
            insert into jobs (pro_id, customer_id, mode, status, title,
                              description, recurring_contract_id, visit_date, source)
            values ($1, $2, 'recurring', 'scheduled', $3, $4, $5, $6, 'repeat')
            on conflict do nothing
            returning id::text
            """,
            pro_id, contract["customer_id"], contract["title"],
            contract.get("description") or "", contract_id, visit)
        if row:
            created.append(visit.isoformat())

    return {"created": len(created), "skipped": len(wanted) - len(created),
            "dates": created, "horizon": until.isoformat()}


async def visits(pro_id: str, contract_id: str, *, upcoming_only: bool = False) -> list[dict]:
    clause = "and j.visit_date >= current_date" if upcoming_only else ""
    return await pg.fetch(
        f"""
        select j.id::text, j.job_number, j.visit_date, j.status, j.completed_at
          from jobs j
          join recurring_contracts c on c.id = j.recurring_contract_id
         where c.id = $1 and c.pro_id = $2 and j.deleted_at is null {clause}
         order by j.visit_date
        """, contract_id, pro_id)
