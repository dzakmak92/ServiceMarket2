"""Forecast for the pro's own patch.

Weather is not decoration on a trade calendar: whether a roofer, painter or
paver can work at all on Thursday is the single largest thing outside the
schedule that changes it. So the day and week views both carry it.

The upstream is Open-Meteo — free, no key, no per-request licence, and it
publishes the WMO code table this module maps from. Everything that turns
its response into ours is a pure function below, because that is the part
worth testing: the network call is one line and the mapping is thirty.
"""
from __future__ import annotations

from typing import Any, Optional

# WMO 4677 present-weather codes, as Open-Meteo documents them, folded into
# the handful of buckets the UI has an icon for. Folding here and not in the
# component means the frontend never has to know what a 96 is.
_WMO = [
    ((0,), "clear"),
    ((1, 2), "partly"),
    ((3,), "cloudy"),
    ((45, 48), "fog"),
    ((51, 53, 55, 56, 57), "drizzle"),
    ((61, 63, 65, 66, 67), "rain"),
    ((80, 81, 82), "showers"),
    ((71, 73, 75, 77, 85, 86), "snow"),
    ((95, 96, 99), "storm"),
]


def condition(code: Optional[int]) -> str:
    """One of our buckets for a WMO code. Unknown codes read as cloudy rather
    than raising: a forecast that renders the wrong icon is a smaller failure
    than a calendar that will not load."""
    if code is None:
        return "cloudy"
    for codes, name in _WMO:
        if code in codes:
            return name
    return "cloudy"


def _num(v: Any) -> Optional[float]:
    return v if isinstance(v, (int, float)) else None


def shape(payload: dict, days: int = 7) -> dict:
    """Open-Meteo's response, reduced to what the calendar draws.

    Defensive on purpose. This is third-party JSON reached over the network,
    and a missing key here would otherwise take out the whole schedule page —
    which would be a poor trade for an icon. Anything absent comes back None
    and the card renders without it.
    """
    cur = payload.get("current") or {}
    daily = payload.get("daily") or {}
    dates = daily.get("time") or []
    codes = daily.get("weather_code") or []
    highs = daily.get("temperature_2m_max") or []
    lows = daily.get("temperature_2m_min") or []
    rain = daily.get("precipitation_probability_max") or []
    wind = daily.get("wind_speed_10m_max") or []

    out_days = []
    for i, d in enumerate(dates[:days]):
        code = codes[i] if i < len(codes) else None
        out_days.append({
            "date": d,
            "code": code,
            "condition": condition(code),
            "high": _num(highs[i] if i < len(highs) else None),
            "low": _num(lows[i] if i < len(lows) else None),
            "rain_chance": _num(rain[i] if i < len(rain) else None),
            "wind_max": _num(wind[i] if i < len(wind) else None),
        })

    cur_code = cur.get("weather_code")
    return {
        "timezone": payload.get("timezone"),
        "current": {
            "temp": _num(cur.get("temperature_2m")),
            "feels_like": _num(cur.get("apparent_temperature")),
            "code": cur_code,
            "condition": condition(cur_code),
            "wind": _num(cur.get("wind_speed_10m")),
            "rain_chance": out_days[0]["rain_chance"] if out_days else None,
        } if cur else None,
        "days": out_days,
    }


URL = "https://api.open-meteo.com/v1/forecast"

PARAMS = {
    "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
    "daily": ("weather_code,temperature_2m_max,temperature_2m_min,"
              "precipitation_probability_max,wind_speed_10m_max"),
    "timezone": "auto",
}


async def fetch(lat: float, lng: float, days: int = 7) -> dict:
    """Ask Open-Meteo, and hand back `shape()` of what it says."""
    import httpx

    params = {**PARAMS, "latitude": lat, "longitude": lng, "forecast_days": days}
    async with httpx.AsyncClient(timeout=6.0) as client:
        r = await client.get(URL, params=params)
        r.raise_for_status()
        return shape(r.json(), days)
