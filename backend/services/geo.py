"""Lightweight city → (lat, lng) lookup table for the geo-fence MVP.
We don't currently geocode every job — instead we map the job's `city` field
to approximate coordinates at filter time. The pro draws their radius on the
Leaflet map, and any job whose city resolves to a point inside the circle
(via haversine) passes the filter.
"""
from math import radians, sin, cos, asin, sqrt
from typing import Optional, Tuple

# Major AT / DE / CH / ES / TR cities. Default fallback = none (job won't be
# filtered out if its city is unknown; we'd rather show too many than too few).
CITY_COORDS: dict[str, Tuple[float, float]] = {
    # Austria
    "wien": (48.2082, 16.3738), "vienna": (48.2082, 16.3738),
    "graz": (47.0707, 15.4395), "linz": (48.3069, 14.2858),
    "salzburg": (47.8095, 13.0550), "innsbruck": (47.2692, 11.4041),
    "klagenfurt": (46.6249, 14.3050), "villach": (46.6111, 13.8558),
    "wels": (48.1573, 14.0291), "sankt pölten": (48.2047, 15.6256),
    "st. pölten": (48.2047, 15.6256), "dornbirn": (47.4125, 9.7438),
    "steyr": (48.0394, 14.4231), "feldkirch": (47.2390, 9.5993),
    "bregenz": (47.5066, 9.7471), "leoben": (47.3833, 15.1000),
    "krems": (48.4108, 15.6147), "baden": (48.0042, 16.2358),
    # Germany
    "berlin": (52.5200, 13.4050), "münchen": (48.1351, 11.5820),
    "munich": (48.1351, 11.5820), "hamburg": (53.5511, 9.9937),
    "köln": (50.9375, 6.9603), "cologne": (50.9375, 6.9603),
    "frankfurt": (50.1109, 8.6821), "stuttgart": (48.7758, 9.1829),
    "düsseldorf": (51.2277, 6.7735),
    # Switzerland
    "zürich": (47.3769, 8.5417), "zurich": (47.3769, 8.5417),
    "bern": (46.9480, 7.4474), "geneva": (46.2044, 6.1432),
    "genève": (46.2044, 6.1432), "basel": (47.5596, 7.5886),
    # Spain
    "madrid": (40.4168, -3.7038), "barcelona": (41.3851, 2.1734),
    "valencia": (39.4699, -0.3763), "sevilla": (37.3891, -5.9845),
    # Turkey
    "istanbul": (41.0082, 28.9784), "ankara": (39.9334, 32.8597),
    "izmir": (38.4192, 27.1287),
}


def lookup_city(city: Optional[str]) -> Optional[Tuple[float, float]]:
    if not city:
        return None
    key = city.strip().lower().split(",")[0].strip()
    return CITY_COORDS.get(key)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two points, in kilometres."""
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c


def within_radius(job_city: Optional[str], center_lat: Optional[float], center_lng: Optional[float], radius_km: int) -> bool:
    """Returns True if the job (resolved by city) is within radius_km of the pro's center.
    If the city can't be resolved, defaults to True (show the job) so we don't hide jobs
    just because their city is missing from the lookup table.
    """
    if not center_lat or not center_lng or not radius_km or radius_km <= 0:
        return True
    coords = lookup_city(job_city)
    if not coords:
        return True
    return haversine_km(coords[0], coords[1], center_lat, center_lng) <= radius_km
