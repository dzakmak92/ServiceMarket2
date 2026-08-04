"""GET /weather — the forecast where the pro actually works.

Proxied rather than called from the browser. Three reasons, in order of how
much they matter: the coordinates are the pro's business location and should
not be handed to a third party by every client that loads the calendar; one
server-side cache serves every device instead of each one asking again; and
the page keeps its strict connect-src instead of opening a hole for an
outside host.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user
from db import pg
from routes._pro import require_pro_id
from services import weather as wx

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/weather", tags=["weather"])

# A forecast that is half an hour old is still the same forecast — upstream
# only refreshes hourly. Keyed by rounded coordinates so two pros in the same
# town share an entry. Process-local, so on serverless it helps within a warm
# instance and costs nothing when there is not one.
_CACHE: dict[tuple, tuple[float, dict]] = {}
_TTL = 30 * 60


@router.get("")
async def forecast(days: int = Query(default=7, ge=1, le=14),
                   user: dict = Depends(get_current_user)):
    """The forecast for this pro's service centre.

    404 when there is no location on file rather than guessing a city: a
    forecast for the wrong place is worse than none, because nothing on the
    card says which place it is for.
    """
    pro_id = await require_pro_id(user)
    row = await pg.fetchrow(
        """
        select service_center_lat   as lat,
               service_center_lng   as lng,
               business_city        as city
          from pro_profiles
         where id = $1
        """,
        pro_id,
    )

    lat, lng = (row or {}).get("lat"), (row or {}).get("lng")
    if lat is None or lng is None:
        raise HTTPException(404, "No service centre on file — set one in your profile")

    key = (round(float(lat), 2), round(float(lng), 2), days)
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < _TTL:
        return {**hit[1], "place": (row or {}).get("city"), "cached": True}

    try:
        data = await wx.fetch(float(lat), float(lng), days)
    except Exception as exc:  # noqa: BLE001
        # The calendar must render without a forecast. Anything else makes an
        # outside service a hard dependency of the pro seeing their own day.
        logger.warning("weather upstream failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(503, "Forecast unavailable")

    _CACHE[key] = (time.time(), data)
    return {**data, "place": (row or {}).get("city"), "cached": False}
