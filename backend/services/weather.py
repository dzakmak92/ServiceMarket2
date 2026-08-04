"""Forecast for the pro's own patch.

Weather is not decoration on a trade calendar: whether a roofer, painter or
paver can work at all on Thursday is the single largest thing outside the
schedule that changes it. So the day and week views both carry it.

The upstream is Open-Meteo — free, no key, no per-request licence, and it
publishes the WMO code table this module maps from. Everything that turns
its response into ours is a pure function below, because that is the part
worth testing: the network calls are two lines and the mapping is a hundred.
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
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _first(d: dict, *names, default=None):
    """The first of `names` that `d` actually has.

    Open-Meteo has two live spellings for most of this — `weather_code` and
    `weathercode`, `current` and `current_weather`, `wind_speed_10m` and
    `windspeed` — depending on which generation of the API answers. Since the
    call cannot be exercised from the build sandbox, reading both is not
    belt-and-braces; it is the difference between a card that works on deploy
    and one that silently renders nothing.
    """
    for n in names:
        if isinstance(d, dict) and d.get(n) is not None:
            return d[n]
    return default


def shape(payload: dict, days: int = 7) -> dict:
    """Open-Meteo's response, reduced to what the calendar draws.

    Defensive on purpose. This is third-party JSON reached over the network,
    and a missing key here would otherwise take out the whole schedule page —
    which would be a poor trade for an icon. Anything absent comes back None
    and the card renders without it.
    """
    cur = _first(payload, "current", "current_weather", default={}) or {}
    daily = payload.get("daily") or {}
    dates = daily.get("time") or []
    codes = _first(daily, "weather_code", "weathercode", default=[]) or []
    highs = _first(daily, "temperature_2m_max", "temperature_max", default=[]) or []
    lows = _first(daily, "temperature_2m_min", "temperature_min", default=[]) or []
    rain = _first(daily, "precipitation_probability_max", default=[]) or []
    wind = _first(daily, "wind_speed_10m_max", "windspeed_10m_max", default=[]) or []

    def at(seq, i):
        return seq[i] if isinstance(seq, list) and i < len(seq) else None

    out_days = []
    for i, d in enumerate(dates[:days]):
        code = at(codes, i)
        out_days.append({
            "date": d,
            "code": code,
            "condition": condition(code),
            "high": _num(at(highs, i)),
            "low": _num(at(lows, i)),
            "rain_chance": _num(at(rain, i)),
            "wind_max": _num(at(wind, i)),
        })

    cur_code = _first(cur, "weather_code", "weathercode")
    return {
        "timezone": payload.get("timezone"),
        "current": {
            "temp": _num(_first(cur, "temperature_2m", "temperature")),
            "feels_like": _num(_first(cur, "apparent_temperature")),
            "code": cur_code,
            "condition": condition(cur_code),
            "wind": _num(_first(cur, "wind_speed_10m", "windspeed")),
            "rain_chance": out_days[0]["rain_chance"] if out_days else None,
        } if cur else None,
        "days": out_days,
    }


URL = "https://api.open-meteo.com/v1/forecast"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"

PARAMS = {
    "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
    "daily": ("weather_code,temperature_2m_max,temperature_2m_min,"
              "precipitation_probability_max,wind_speed_10m_max"),
    "timezone": "auto",
}


def pick_place(payload: dict, country: Optional[str] = None) -> Optional[dict]:
    """The best hit from a geocoding search, or None.

    Prefers a result in the country we asked about. Without that a search for
    "Wien" can land in Virginia, and the pro would get a forecast for the
    right name in the wrong hemisphere with nothing on screen to say so.
    """
    results = payload.get("results") or []
    if not results:
        return None
    if country:
        cc = country.strip().upper()[:2]
        results = [r for r in results if str(r.get("country_code", "")).upper() == cc] or results
    top = results[0]
    lat, lng = _num(top.get("latitude")), _num(top.get("longitude"))
    if lat is None or lng is None:
        return None
    return {"lat": lat, "lng": lng, "name": top.get("name"),
            "country_code": top.get("country_code")}


async def geocode(city: Optional[str], postal_code: Optional[str],
                  country: Optional[str]) -> Optional[dict]:
    """Coordinates for a business address, near enough for a forecast.

    A town is the right precision here — weather does not change across a
    postcode, and asking a tradesperson to drop a pin before they can see
    whether it will rain is a worse deal than a forecast for the middle of
    their town. City first because the geocoder indexes names, not postcodes;
    the postcode is only worth a try if there is no city at all.
    """
    import httpx

    for term in [t for t in (city, postal_code) if t and str(t).strip()]:
        params = {"name": str(term).strip(), "count": 10, "format": "json"}
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(GEOCODE_URL, params=params)
            r.raise_for_status()
            hit = pick_place(r.json(), country)
        if hit:
            return hit
    return None


async def fetch(lat: float, lng: float, days: int = 7) -> dict:
    """Ask Open-Meteo, and hand back `shape()` of what it says."""
    import httpx

    params = {**PARAMS, "latitude": lat, "longitude": lng, "forecast_days": days}
    async with httpx.AsyncClient(timeout=6.0) as client:
        r = await client.get(URL, params=params)
        r.raise_for_status()
        return shape(r.json(), days)
