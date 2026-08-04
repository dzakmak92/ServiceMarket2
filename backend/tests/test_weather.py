"""python3 tests/test_weather.py

Covers the pure half of the forecast: the WMO code table and the reshaping
of a third-party payload. The network call itself is one line and is not
exercised here — see the note at the bottom.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.weather import condition, shape  # noqa: E402

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

print(f"\n{'%d FAILURE(S)' % failed if failed else 'ALL PASS'}  ({passed} checks)")
print("  note: services.weather.fetch() — the actual Open-Meteo request — is not")
print("        covered here. It could not be reached from the build sandbox, so")
print("        the live call needs one check against the deployed API.")
sys.exit(1 if failed else 0)
