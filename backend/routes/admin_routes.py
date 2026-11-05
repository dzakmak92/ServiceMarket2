"""Admin: users, bans and which calculators each pro may use.

The admin panel (frontend/src/pages/admin) called /api/admin/users and
/api/admin/users/{id}/ban long before anything answered them. This router
answers those two, plus the per-pro calculator switch: the admin enables the
Gewerke a pro holds a trade licence (Gewerbeschein) for.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import require_admin
from db import pg
from services import trades

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/trades")
async def list_trades(_: dict = Depends(require_admin)):
    """The switchable calculators, in display order, with the default set."""
    return {
        "trades": [{"key": k, "label": trades.LABELS.get(k, k)} for k in trades.ALL_TRADES],
        "default": list(trades.DEFAULT_TRADES),
    }


@router.get("/users")
async def list_users(role: Optional[str] = Query(default=None, pattern="^(tradesperson|customer|admin)$"),
                     q: Optional[str] = None,
                     year: Optional[int] = None,
                     page: int = Query(default=1, ge=1),
                     per_page: int = Query(default=25, ge=1, le=200),
                     _: dict = Depends(require_admin)):
    where = ["u.deleted_at is null"]
    args: list = []
    if role:
        args.append(role)
        where.append(f"u.role::text = ${len(args)}")
    if q:
        args.append(f"%{q.strip()}%")
        n = len(args)
        where.append(f"(u.name ilike ${n} or u.email::text ilike ${n} or coalesce(u.city, '') ilike ${n}"
                     f" or coalesce(p.business_name, '') ilike ${n})")
    if year:
        args.append(year)
        where.append(f"extract(year from u.created_at) = ${len(args)}")
    cond = " and ".join(where)

    total = await pg.fetchval(
        f"select count(*) from users u left join pro_profiles p on p.user_id = u.id where {cond}", *args)
    args += [per_page, (page - 1) * per_page]
    rows = await pg.fetch(
        f"""
        select u.id::text as id, u.name, u.email::text as email, u.role::text as role, u.country,
               u.city, u.phone, u.lang, u.created_at, u.onboarding_complete, u.is_email_verified,
               coalesce(u.banned, false) as banned,
               p.id::text as pro_id, p.business_name, p.licence_status, p.enabled_trades
          from users u
          left join pro_profiles p on p.user_id = u.id
         where {cond}
         order by u.created_at desc
         limit ${len(args) - 1} offset ${len(args)}
        """, *args)
    users = []
    for r in rows:
        r = dict(r)
        stored = r.pop("enabled_trades")
        r["enabled_trades"] = trades.effective(stored) if r["pro_id"] else None
        r["trades_custom"] = stored is not None
        users.append(r)
    return {"users": users, "total": total, "page": page, "per_page": per_page}


class BanIn(BaseModel):
    banned: bool


@router.patch("/users/{user_id}/ban")
async def set_ban(user_id: str, body: BanIn, admin: dict = Depends(require_admin)):
    if str(admin.get("id") or admin.get("_id")) == user_id:
        raise HTTPException(400, "You cannot ban yourself")
    done = await pg.fetchval(
        "update users set banned = $2, updated_at = now() where id::text = $1 returning id::text",
        user_id, body.banned)
    if not done:
        raise HTTPException(404, "User not found")
    return {"id": done, "banned": body.banned}


class TradesIn(BaseModel):
    trades: list[str]


@router.patch("/users/{user_id}/trades")
async def set_trades(user_id: str, body: TradesIn, _: dict = Depends(require_admin)):
    """Switch a pro's calculators. Takes the full list of enabled trades."""
    chosen = trades.clean(body.trades)
    done = await pg.fetchval(
        "update pro_profiles set enabled_trades = $2, updated_at = now() "
        "where user_id::text = $1 returning id::text",
        user_id, chosen)
    if not done:
        raise HTTPException(404, "Pro profile not found")
    return {"enabled_trades": chosen, "trades_custom": True}
