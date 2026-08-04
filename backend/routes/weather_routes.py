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
    """The forecast where this pro works.

    A pinned service centre if there is one, otherwise the business town,
    resolved once and written back. 404 only when there is neither — a
    forecast for a guessed place is worse than none, because nothing on the
    card would say which place it is for.
    """
    pro_id = await require_pro_id(user)
    row = await pg.fetchrow(
        """
        select service_center_lat   as lat,
               service_center_lng   as lng,
               business_city        as city,
               business_postal_code as postal_code,
               business_country     as country
          from pro_profiles
         where id = $1
        """,
        pro_id,
    )

    lat, lng = (row or {}).get("lat"), (row or {}).get("lng")
    place = (row or {}).get("city")

    if (lat is None or lng is None) and row:
        # Most pros never open the service-radius map, so requiring a pinned
        # centre would mean the forecast never appears for almost anyone. The
        # business address is already on file and a town is the right precision
        # for weather, so resolve that instead — once, and write it back, so
        # this costs one request per business rather than one per calendar load.
        try:
            hit = await wx.geocode(row.get("city"), row.get("postal_code"),
                                   row.get("country"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("geocode failed: %s: %s", type(exc).__name__, exc)
            hit = None
        if hit:
            lat, lng = hit["lat"], hit["lng"]
            place = place or hit.get("name")
            await pg.execute(
                """
                update pro_profiles
                   set service_center_lat = coalesce(service_center_lat, $2),
                       service_center_lng = coalesce(service_center_lng, $3),
                       updated_at = now()
                 where id = $1
                """,
                pro_id, lat, lng,
            )

    if lat is None or lng is None:
        raise HTTPException(
            404, "No location on file — add your business city or set a service centre")

    key = (round(float(lat), 2), round(float(lng), 2), days)
    cached = _CACHE.get(key)
    if cached and time.time() - cached[0] < _TTL:
        return {**cached[1], "place": place, "cached": True}

    try:
        data = await wx.fetch(float(lat), float(lng), days)
    except Exception as exc:  # noqa: BLE001
        # The calendar must render without a forecast. Anything else makes an
        # outside service a hard dependency of the pro seeing their own day.
        logger.warning("weather upstream failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(503, "Forecast unavailable")

    _CACHE[key] = (time.time(), data)
    return {**data, "place": place, "cached": False}
