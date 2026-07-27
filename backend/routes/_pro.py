"""Shared pro-scoping helper for the Postgres routes.

Every tenant query is scoped by `pro_profiles.id`. Resolving it in one place
means a route can never accidentally skip the check.
"""
from __future__ import annotations

from fastapi import HTTPException

from db import pg


async def require_pro_id(user: dict) -> str:
    """Resolve the caller's pro_profiles.id, or refuse.

    During the Mongo→Postgres transition the JWT still carries the legacy
    Mongo user id, so we fall back to matching on `legacy_id`. That fallback
    is removed once the import is verified and the legacy columns are dropped.
    """
    if user.get("role") != "tradesperson":
        raise HTTPException(403, "Tradesperson account required")

    uid = str(user["_id"])
    pro_id = await pg.fetchval(
        """
        select p.id from pro_profiles p
          join users u on u.id = p.user_id
         where u.id::text = $1 or u.legacy_id = $1
         limit 1
        """,
        uid,
    )
    if not pro_id:
        raise HTTPException(404, "Pro profile not found")
    return str(pro_id)
