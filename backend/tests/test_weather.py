"""python3 tests/test_weather.py

Covers the pure half of the forecast: the WMO code table and the reshaping
of a third-party payload. The network call itself is one line and is not
exercised here — see the note at the bottom.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.weather import (  # noqa: E402
    HOUR_FROM, HOUR_TO, PARAMS, _num, condition, pick_place, shape,
)

passed = failed = 0


def ok(cond, msg):
    global passed, failed
    if cond:
        passed += 1
        print("  ok  ", msg)
    else:
        failed += 1
        print("  FAIL", msg)


def step(t):
    print(f"\n── {t} ──")


step("the WMO code table")
ok(condition(0) == "clear", "0 is a clear sky")
ok(condition(1) == "partly" and condition(2) == "partly", "1 and 2 are partly cloudy")
ok(condition(3) == "cloudy", "3 is overcast")
ok(condition(45) == "fog" and condition(48) == "fog", "45/48 are fog")
ok(condition(61) == "rain" and condition(65) == "rain", "61–65 is rain")
ok(condition(80) == "showers", "80 is showers, which is not the same as steady rain")
ok(condition(71) == "snow" and condition(86) == "snow", "snow, including the shower codes")
ok(condition(95) == "storm" and condition(99) == "storm", "thunderstorms")
# A code we have never seen must not take the calendar down with it.
ok(condition(4) == "cloudy", "an unmapped code falls back rather than raising")
ok(condition(None) == "cloudy", "and so does a missing one")

step("reshaping a full payload")
FULL = {
    "timezone": "Europe/Vienna",
    "current": {"temperature_2m": 24.3, "apparent_temperature": 25.1,
                "weather_code": 2, "wind_speed_10m": 11.2},
    "daily": {
        "time": ["2026-08-04", "2026-08-05", "2026-08-06"],
        "weather_code": [2, 61, 0],
        "temperature_2m_max": [26.0, 19.4, 28.1],
        "temperature_2m_min": [14.2, 12.0, 15.5],
        "precipitation_probability_max": [10, 80, 0],
        "wind_speed_10m_max": [14.0, 22.5, 9.1],
    },
}
s = shape(FULL, days=7)
ok(s["current"]["condition"] == "partly", "the current condition is mapped, not passed through")
ok(s["current"]["temp"] == 24.3 and s["current"]["wind"] == 11.2, "current values carried")
ok(s["current"]["rain_chance"] == 10,
   "today's rain chance is lifted onto the current block, where the card shows it")
ok(len(s["days"]) == 3, "one entry per day returned, not per day asked for")
ok(s["days"][1]["condition"] == "rain" and s["days"][1]["rain_chance"] == 80,
   "tomorrow is rain at 80 %")
ok(s["days"][0]["date"] == "2026-08-04", "dates are carried through untouched")

step("days is a cap, not a promise")
ok(len(shape(FULL, days=2)["days"]) == 2, "asking for two gives two")

step("third-party JSON is not trusted")
ok(shape({}, 7) == {"timezone": None, "current": None, "days": []},
   "an empty body yields an empty forecast rather than an exception")
ok(shape({"daily": {"time": ["2026-08-04"]}}, 7)["days"][0]["high"] is None,
   "a day with no temperatures still renders, with None where the number was")
ok(shape({"daily": {"time": ["2026-08-04"], "weather_code": [61]}}, 7)["days"][0]["condition"]
   == "rain", "and the parts that are present are still used")
ok(shape({"current": {"temperature_2m": "warm"}}, 7)["current"]["temp"] is None,
   "a string where a number belongs is dropped, not rendered")
ok(shape({"daily": {"time": ["a", "b", "c"], "weather_code": [0]}}, 7)["days"][2]["code"] is None,
   "short parallel arrays do not run off the end")

step("both of Open-Meteo's live spellings are read")
# The older generation answers with `current_weather`, `weathercode` and
# `windspeed`; the newer one with `current`, `weather_code`, `wind_speed_10m`.
# Which one replies cannot be checked from the build sandbox, so both are read.
OLD = {
    "timezone": "Europe/Vienna",
    "current_weather": {"temperature": 21.0, "weathercode": 61, "windspeed": 8.0},
    "daily": {
        "time": ["2026-08-04", "2026-08-05"],
        "weathercode": [61, 0],
        "temperature_2m_max": [19.0, 27.0],
        "temperature_2m_min": [12.0, 15.0],
    },
}
o = shape(OLD, 7)
ok(o["current"]["temp"] == 21.0, "`current_weather.temperature` is read as the temperature")
ok(o["current"]["condition"] == "rain", "`weathercode` without the underscore still maps")
ok(o["current"]["wind"] == 8.0, "and `windspeed` is the wind")
ok(o["days"][0]["condition"] == "rain" and o["days"][1]["condition"] == "clear",
   "the daily codes too")
ok(shape(FULL, 7)["current"]["temp"] == 24.3,
   "and the new spelling still works — reading both is not choosing one")

step("picking a place out of a geocoding result")
HITS = {"results": [
    {"name": "Vienna", "latitude": 38.90, "longitude": -77.26, "country_code": "US"},
    {"name": "Wien", "latitude": 48.21, "longitude": 16.37, "country_code": "AT"},
]}
ok(pick_place(HITS, "AT")["lat"] == 48.21,
   "the country wins over the order — a search for Wien must not land in Virginia")
ok(pick_place(HITS, "at")["lat"] == 48.21, "the country code is not case-sensitive")
ok(pick_place(HITS, None)["country_code"] == "US",
   "with no country asked for, the first result stands")
ok(pick_place(HITS, "DE")["country_code"] == "US",
   "and a country with no match falls back rather than returning nothing")
ok(pick_place({"results": []}, "AT") is None, "no results is None, not an exception")
ok(pick_place({}, "AT") is None, "and so is a body with no results key")
ok(pick_place({"results": [{"name": "X", "country_code": "AT"}]}, "AT") is None,
   "a hit with no coordinates is no hit")

step("numbers only")
ok(_num(True) is None, "a bool is not a temperature, even though Python says it is an int")
ok(_num(0) == 0, "but zero is")

step("the hourly strip the day view draws")

HOURLY = {
    "timezone": "Europe/Vienna",
    "current": {"temperature_2m": 24.3, "weather_code": 2, "wind_speed_10m": 11},
    "daily": {
        "time": ["2026-08-05", "2026-08-06"],
        "weather_code": [2, 61],
        "temperature_2m_max": [26, 19],
        "temperature_2m_min": [14, 12],
        "precipitation_probability_max": [10, 80],
        "wind_speed_10m_max": [14, 22],
    },
    "hourly": {
        # deliberately spans midnight and runs outside the working day
        "time": [f"2026-08-05T{h:02d}:00" for h in range(24)]
                + [f"2026-08-06T{h:02d}:00" for h in range(24)],
        "temperature_2m": list(range(24)) + list(range(100, 124)),
        "weather_code": [0] * 24 + [61] * 24,
        "precipitation_probability": [5] * 24 + [90] * 24,
    },
}


def _copy(extra=None):
    import copy
    p = copy.deepcopy(HOURLY)
    if extra:
        extra(p)
    return p


h = shape(HOURLY, days=2)["days"]
ok([x["hour"] for x in h[0]["hours"]] == list(range(HOUR_FROM, HOUR_TO + 1)),
   "every working hour of the day is present, in order")
ok(h[0]["hours"][0]["temp"] == 6 and h[1]["hours"][0]["temp"] == 106,
   "each day gets its own hours — the next day's values do not leak back")
ok(min(x["hour"] for x in h[0]["hours"]) == HOUR_FROM
   and max(x["hour"] for x in h[0]["hours"]) == HOUR_TO,
   "03:00 and 23:00 are dropped: nobody renders a facade at three in the morning")
ok({x["condition"] for x in h[0]["hours"]} == {"clear"}
   and {x["condition"] for x in h[1]["hours"]} == {"rain"},
   "hourly codes are folded to conditions, as the daily ones are")
ok(all(x["rain_chance"] == 5 for x in h[0]["hours"]),
   "rain probability rides along with each hour")

no_hourly = _copy(lambda p: p.pop("hourly"))
ok([d["hours"] for d in shape(no_hourly, days=2)["days"]] == [[], []],
   "an upstream with no hourly block gives empty hours, not a crash")

def _mangle(p):
    p["hourly"]["time"] = ["nonsense", None, "2026-08-05T09:00", "2026-08-05Txx:00"]
    p["hourly"]["temperature_2m"] = [1, 2, 21, 4]
    p["hourly"]["weather_code"] = [0, 0, 0, 0]
    p["hourly"]["precipitation_probability"] = [0, 0, 30, 0]
mangled = shape(_copy(_mangle), days=1)["days"][0]["hours"]
ok([x["hour"] for x in mangled] == [9] and mangled[0]["temp"] == 21,
   "a malformed timestamp is skipped on its own, not taken as the whole day")

short = shape(_copy(lambda p: p["hourly"].__setitem__("temperature_2m", [1, 2, 3])),
              days=1)["days"][0]["hours"]
ok(len(short) == HOUR_TO - HOUR_FROM + 1 and short[-1]["temp"] is None,
   "a series shorter than its own time array gives None, not an IndexError")

ok(all(k in PARAMS["hourly"] for k in
       ("temperature_2m", "weather_code", "precipitation_probability")),
   "the request asks for exactly the three series the strip draws")


print(f"\n{'%d FAILURE(S)' % failed if failed else 'ALL PASS'}  ({passed} checks)")
print("  note: services.weather.fetch() — the actual Open-Meteo request — is not")
print("        covered here. It could not be reached from the build sandbox, so")
print("        the live call needs one check against the deployed API.")
sys.exit(1 if failed else 0)
