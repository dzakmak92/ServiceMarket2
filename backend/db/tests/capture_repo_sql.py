"""Capture every SQL statement the repositories emit, without a database.

Stubs the pg helpers so each repository function records its query instead of
running it. Pipe the output into Postgres with PREPARE to check that every
table, column, cast and join actually exists:

    python backend/db/tests/capture_repo_sql.py > /tmp/repo.sql
    # then wrap each line in `prepare _c as ...; deallocate _c;`

Cheap coverage for the layer that is hardest to test without live data.
"""
import asyncio, sys, types
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parents[2]))

captured = []
import db.pg as pg
async def _cap(sql, *a):
    captured.append((sql, a)); return None
async def _cap_row(sql, *a):
    captured.append((sql, a))
    if "count(*) filter" in sql:          # dashboard_counts
        return {"leads": 1, "quoted": 0, "booked": 0, "active": 0,
                "awaiting_invoice": 0, "emergencies": 0}
    return {"id": "00000000-0000-0000-0000-000000000001", "customer_id": None,
            "status": "lead", "mode": "simple", "started_at": None, "completed_at": None}
async def _cap_list(sql, *a):
    captured.append((sql, a)); return []
async def _cap_val(sql, *a):
    captured.append((sql, a)); return 0
pg.fetch, pg.fetchrow, pg.fetchval, pg.execute = _cap_list, _cap_row, _cap_val, _cap

from repositories import customers as C, jobs as J
PRO = "22222222-2222-2222-2222-222222222222"
CID = "33333333-3333-3333-3333-333333333333"

async def main():
    await C.create(PRO, {"name": "Gruber", "email": "A@B.at", "city": "Wien", "junk": "ignored"})
    await C.get(PRO, CID)
    await C.update(PRO, CID, {"phone": "+4366412345"})
    await C.soft_delete(PRO, CID)
    await C.search(PRO, q="grub", customer_type="private", limit=10, offset=0)
    await C.search(PRO)
    await C.find_duplicate(PRO, email="a@b.at", phone="+43 664 1234567", name="Gruber")
    await C.refresh_rollups(CID)

    await J.create(PRO, {"title": "Bad sanieren", "customer_id": CID, "mode": "project"})
    await J.get(PRO, "x"); await J.get_by_share_token("tok")
    await J.update(PRO, "x", {"notes": "n", "status": "ignored"})
    await J.set_status(PRO, "x", "quoted")
    await J.soft_delete(PRO, "x"); await J.rotate_share_token(PRO, "x")
    await J.list_for_pro(PRO, status="open", mode="simple", customer_id=CID, q="bad")
    await J.list_for_pro(PRO)
    await J.detail(PRO, "x")
    await J.dashboard_counts(PRO)
    await J.create_from_lead(PRO, {"title": "Rohrbruch", "source": "myhammer",
                                   "customer": {"name": "Neu", "phone": "0664111"}})

asyncio.run(main())
print(f"# {len(captured)} statements captured\n")
for sql, args in captured:
    print("─" * 70)
    print(" ".join(sql.split()))
