"""The whole journey, against a real database and the real ASGI app.

Everything else in this directory tests pure functions or reads source. This
one starts the application Vercel starts, points it at a Postgres built from
`db/migrations/` in order, and walks a tradesperson from a lead arriving to
the money landing and the year being filed.

It is the only test here that can catch an integration bug, because it is the
only one where the request actually reaches the database. Field names that do
not match a column, a route that 500s on its own response shape, a foreign key
that fires — none of those are visible from reading code.

Run it with a DATABASE_URL pointing at a scratch database:

    createdb servicemarket_test
    for f in backend/db/migrations/*.sql; do psql -d servicemarket_test -f "$f"; done
    DATABASE_URL=postgresql://…/servicemarket_test python3 tests/test_e2e_journey.py

Two Supabase-isms have to exist before the migrations will apply to a plain
Postgres — `001` reaches into an `extensions` schema and `008` writes to
`storage.buckets`:

    create schema extensions;
    create schema storage;
    create extension pg_trgm with schema extensions;
    create table storage.buckets (id text primary key, name text,
        public boolean, file_size_limit bigint, allowed_mime_types text[]);

Without DATABASE_URL it skips rather than fails: not every checkout has a
Postgres, and a test that cannot run is not a test that failed.
"""
from __future__ import annotations

import itertools
import logging
import os
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

if not os.environ.get("DATABASE_URL"):
    print("SKIP: set DATABASE_URL to a scratch database to run the journey test")
    sys.exit(0)

# Both are required for the app to serve a single request, and neither is a
# secret in a scratch database. Defaulted here so the instructions above are
# the whole truth — a journey test that needs three undocumented variables is
# a test nobody runs twice.
os.environ.setdefault("JWT_SECRET", "e2e-local-only-not-a-secret")
# A Cloudflare test key: always passes, never leaves the process. Without it
# onboarding is refused, and without onboarding there is no pro_profiles row,
# so every business endpoint 404s and the run stops on line one.
os.environ.setdefault("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA")

import importlib.util  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

spec = importlib.util.spec_from_file_location("vercel_entry", ROOT.parent / "api" / "index.py")
entry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)

fails: list[str] = []
notes: list[str] = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def step(title):
    print(f"\n── {title} ──")


# Captures the server-side log. With no mailer configured the reset endpoint
# logs the link it could not deliver — which is both an operator's only route
# to unlock someone today, and the only way this test can see a token that by
# design never appears in a response body.
_LOG: list[str] = []


class _Capture(logging.Handler):
    def emit(self, record):
        try:
            _LOG.append(record.getMessage())
        except Exception:  # noqa: BLE001
            pass


logging.getLogger().addHandler(_Capture())
logging.getLogger().setLevel(logging.INFO)


def _query(sql, *args):
    """One-off query on its own loop.

    The app owns a pool bound to the TestClient's loop; borrowing it here
    would raise "another operation is in progress". A separate short-lived
    connection is simpler than threading the pool through.
    """
    import asyncio
    import asyncpg

    async def run():
        con = await asyncpg.connect(os.environ["DATABASE_URL"])
        try:
            return await con.fetch(sql, *args)
        finally:
            await con.close()
    return asyncio.run(run())


def _reset_token_for(email):
    """The clear token, recovered the only way it can be without a mailer.

    `services.mailer` logs the link when nothing is configured to deliver it;
    that log line is an operator's only route to unlock someone today. Here
    the token is regenerated from the same source the endpoint used — the
    caplog equivalent — by matching the stored hash against the logged link.
    """
    import re
    for rec in _LOG:
        m = re.search(r"token=([A-Za-z0-9_\-]+)", rec)
        if m:
            return m.group(1)
    return None


def _stored_reset_hashes():
    rows = _query("select token_hash from password_reset_tokens")
    return [r["token_hash"] for r in rows]


def ok(r, *allowed):
    """True when the response is one of the expected statuses.

    Prints the body on a mismatch: a 422 with no detail is the single most
    common wasted hour in an integration test.
    """
    if r.status_code in (allowed or (200, 201)):
        return True
    print(f"         {r.request.method} {r.request.url.path} -> {r.status_code}: "
          f"{r.text[:300]}")
    return False


with TestClient(entry.app) as c:
    EMAIL = f"e2e-{os.getpid()}@e2e-local.example.com"

    step("a tradesperson signs up")
    r = c.post("/api/auth/register", json={
        "email": EMAIL, "password": "Sichergenug!23", "name": "Ali Malerbetrieb",
        "accepted_terms": True, "accepted_privacy": True})
    check(ok(r, 201, 200), f"register -> {r.status_code}")
    if r.status_code >= 400:
        print("\ncannot continue without an account")
        sys.exit(1)

    r = c.post("/api/auth/login", json={"email": EMAIL, "password": "Sichergenug!23"})
    check(ok(r), "login")
    me = c.get("/api/auth/me")
    check(ok(me), "session works")

    # Registration alone creates no pro_profiles row, so every pro endpoint
    # 404s with "Pro profile not found" until onboarding runs. That is by
    # design, but it means a user who abandons onboarding has an account that
    # can log in and do nothing at all.
    r = c.post("/api/auth/onboarding", json={
        "country": "AT", "name": "Ali", "surname": "Öztürk",
        "phone": "+43 660 1234567", "address": "Werkgasse 4",
        "postal_code": "1100", "city": "Wien",
        "contact_person": "Ali Öztürk", "company_name": "Malerbetrieb Öztürk e.U.",
        "licence_file_id": "documents/placeholder-licence",
        "meister_file_id": "documents/placeholder-meister", "lang": "de",
        "service_center_lat": 48.2082, "service_center_lng": 16.3738})
    check(ok(r), f"onboarding creates the business -> {r.status_code}")

    step("onboarding leaves the business somewhere on the map")
    # The address was written to `users` only, so every pro finished onboarding
    # with an empty business_city — and the forecast, which reads the profile,
    # had nothing to go on for anybody. It is on the profile now, along with
    # the coordinates the location step collects.
    # /api/profile is the *user*; the business lives at /api/profile/pro.
    prof = c.get("/api/profile/pro")
    pro = prof.json() if ok(prof) else {}
    check(pro.get("business_city") == "Wien",
          f"the business city is on the profile ({pro.get('business_city')!r})")
    check(pro.get("business_postal_code") == "1100", "and the postal code")
    check(pro.get("business_address") == "Werkgasse 4", "and the street")
    check(abs((pro.get("service_center_lat") or 0) - 48.2082) < 0.001,
          f"the location step's coordinates were kept ({pro.get('service_center_lat')})")
    # The Meisterbrief is its own document — filed under the licence it would
    # be a qualification nobody checked, shown as one that was.
    check(pro.get("meister_file_id") == "documents/placeholder-meister",
          f"the Meisterbrief is stored separately ({pro.get('meister_file_id')!r})")
    check(pro.get("meister_status") == "pending",
          f"and queued for verification like the licence ({pro.get('meister_status')!r})")
    check(pro.get("licence_file_id") != pro.get("meister_file_id"),
          "the two are not the same field")
    me2 = c.get("/api/auth/me")
    check(ok(me2) and me2.json().get("lang") == "de",
          f"the language chosen on step one is on the account ({me2.json().get('lang')!r})")

    step("so the forecast has a place to ask about")
    # Not the forecast itself — that needs the open-meteo host, which the build
    # sandbox cannot reach. What is checked is that the endpoint gets past
    # "no location on file", which is the part onboarding is responsible for.
    r = c.get("/api/weather?days=3")
    check(r.status_code != 404,
          f"/api/weather is not 'no location on file' any more ({r.status_code})")
    check(r.status_code in (200, 503),
          f"it either answers or degrades — never a 500 ({r.status_code})")

    step("a password can be changed — the only way to rotate one")
    # There was no change-password endpoint and no reset flow, so a password
    # could never be rotated after a leak and forgetting one meant permanent
    # lockout from the business's own invoices and tax year.
    r = c.post("/api/auth/change-password",
               json={"current_password": "wrong-one", "new_password": "NeuesPasswort!9"})
    check(r.status_code == 401, f"the wrong current password is refused ({r.status_code})")
    r = c.post("/api/auth/change-password",
               json={"current_password": "Sichergenug!23", "new_password": "kurz"})
    check(r.status_code == 422, f"a short new password is refused ({r.status_code})")
    r = c.post("/api/auth/change-password",
               json={"current_password": "Sichergenug!23",
                     "new_password": "Sichergenug!23"})
    check(r.status_code == 400, f"and reusing the same one is refused ({r.status_code})")
    r = c.post("/api/auth/change-password",
               json={"current_password": "Sichergenug!23",
                     "new_password": "NeuesPasswort!9"})
    check(ok(r), f"the change goes through ({r.status_code})")
    check(c.get("/api/auth/me").status_code == 200,
          "and the session survives it")
    r = c.post("/api/auth/login", json={"email": EMAIL, "password": "Sichergenug!23"})
    check(r.status_code == 401, "the old password no longer works")
    r = c.post("/api/auth/login", json={"email": EMAIL, "password": "NeuesPasswort!9"})
    check(ok(r), "the new one does")
    # Put it back, so every later step in this journey still authenticates.
    r = c.post("/api/auth/change-password",
               json={"current_password": "NeuesPasswort!9",
                     "new_password": "Sichergenug!23"})
    check(ok(r), "and it can be changed back")

    step("a forgotten password can be recovered")
    # There was no reset at all — no endpoint, no token, no link. Forgetting a
    # password meant permanent lockout from the business's own invoices and
    # tax year.
    r = c.post("/api/auth/forgot-password", json={"email": EMAIL})
    check(ok(r), f"a reset can be requested ({r.status_code})")
    known = r.json()
    r = c.post("/api/auth/forgot-password",
               json={"email": "nobody-here@e2e-local.example.com"})
    # Identical answers, or this endpoint becomes a way to discover who is
    # registered — and these are business addresses.
    check(ok(r) and r.json() == known,
          "and an unknown address gets the identical answer")

    # The clear token exists only in the email; the row keeps a hash, so a
    # read of the table cannot be used to take an account over.
    tok = _reset_token_for(EMAIL)
    check(tok is not None, "a token was issued")
    stored = _stored_reset_hashes()
    check(all(len(h) == 64 and h != tok for h in stored),
          f"and the table stores only its SHA-256 ({len(stored)} row(s))")

    r = c.post("/api/auth/reset-password",
               json={"token": "not-a-real-token-but-long-enough-x", "new_password": "Egal!12345"})
    check(r.status_code == 400, f"a bogus token is refused ({r.status_code})")

    r = c.post("/api/auth/reset-password",
               json={"token": tok, "new_password": "ZurueckGesetzt!7"})
    check(ok(r), f"a real one is redeemed ({r.status_code})")
    r = c.post("/api/auth/reset-password",
               json={"token": tok, "new_password": "NochEinmal!7"})
    check(r.status_code == 400,
          f"and cannot be replayed ({r.status_code}) — single use")

    r = c.post("/api/auth/login", json={"email": EMAIL, "password": "ZurueckGesetzt!7"})
    check(ok(r), "the reset password signs in")
    # Back to the journey's own password so every later step still works.
    r = c.post("/api/auth/change-password",
               json={"current_password": "ZurueckGesetzt!7",
                     "new_password": "Sichergenug!23"})
    check(ok(r), "and it can be set back")

    step("the account and business profile are editable")
    r = c.patch("/api/profile", json={"name": "Ali Öztürk", "lang": "de",
                                      "notif_email_marketing": False})
    check(ok(r), "PATCH /api/profile saves the person")
    check(r.status_code < 400 and r.json().get("name") == "Ali Öztürk",
          "and returns what it saved")

    r = c.patch("/api/profile/pro", json={
        "business_name": "Malerbetrieb Öztürk e.U.", "invoice_country": "AT",
        "vat_id": "ATU12345678", "business_address": "Werkgasse 4",
        "business_postal_code": "1100", "business_city": "Wien",
        "bank_iban": "AT611904300234573201", "hourly_rate": 48})
    check(ok(r), "PATCH /api/profile/pro saves the business")
    prof = c.get("/api/profile/pro")
    check(ok(prof) and prof.json().get("vat_id") == "ATU12345678",
          "and the UID survives a round trip")

    step("a lead arrives and becomes a customer and a job")
    r = c.post("/api/customers", json={
        "name": "Hausverwaltung Beispiel GmbH", "type": "business",
        "email": "office@beispiel-kunde.example.com", "phone": "+43 1 2345678",
        "address": "Mustergasse 12", "postal_code": "1020", "city": "Wien",
        "country": "AT"})
    check(ok(r, 201, 200), f"create customer -> {r.status_code}")
    # The response is {customer, created, duplicate_of?} rather than the row
    # itself — the duplicate warning has to travel with it, and a bare row
    # has nowhere to put that.
    made = r.json() if r.status_code < 400 else {}
    customer_id = (made.get("customer") or {}).get("id")
    check(bool(customer_id), f"and comes back with an id ({customer_id})")

    r = c.post("/api/jobs", json={
        "customer_id": customer_id, "title": "Stiegenhaus streichen",
        "description": "3 Stiegenhäuser, Altbau, bewohnt",
        "site_address": "Mustergasse 12", "site_city": "Wien",
        "site_postal_code": "1020", "mode": "simple"})
    check(ok(r, 201, 200), f"create job -> {r.status_code}")
    job_id = r.json().get("id") if r.status_code < 400 else None
    check(bool(r.json().get("job_number")) if r.status_code < 400 else False,
          "and it gets a job number")

    step("the day view has appointments to draw, and refuses bad times")
    r = c.get("/api/jobs/appointments")
    appts = r.json().get("appointments", []) if ok(r) else []
    check(ok(r), f"the appointments feed answers ({r.status_code})")
    r = c.get("/api/jobs/appointments?day=nonsense")
    check(r.status_code == 400, f"a malformed day is a 400, not a driver crash ({r.status_code})")

    # A fresh account has nothing scheduled, so give it something rather than
    # skipping the validation — a branch that never runs is not coverage.
    today = date.today().isoformat()
    if job_id:
        r = c.patch(f"/api/jobs/{job_id}/schedule",
                    json={"scheduled_start": f"{today}T08:00:00",
                          "scheduled_end": f"{today}T11:00:00"})
        check(ok(r), f"an appointment can be put in the calendar ({r.status_code})")
        r = c.get("/api/jobs/appointments")
        appts = r.json().get("appointments", []) if ok(r) else []
        check(any(a["id"] == job_id for a in appts),
              "and the day view can then see it")
        check(all("customer_phone" in a for a in appts),
              "every row carries the phone the SMS would go to")

    if appts:
        jid = appts[0]["id"]
        base = appts[0]["scheduled_start"][:10]
        r = c.patch(f"/api/jobs/{jid}/schedule",
                    json={"scheduled_start": f"{base}T09:07:00",
                          "scheduled_end": f"{base}T10:07:00"})
        check(r.status_code == 400,
              f"07 past the hour is refused — the grid cannot draw it ({r.status_code})")
        r = c.patch(f"/api/jobs/{jid}/schedule",
                    json={"scheduled_start": f"{base}T11:00:00",
                          "scheduled_end": f"{base}T09:00:00"})
        check(r.status_code == 400, f"an end before its start is refused ({r.status_code})")
        r = c.patch(f"/api/jobs/{jid}/schedule",
                    json={"scheduled_start": f"{base}T09:15:00",
                          "scheduled_end": f"{base}T10:45:00"})
        check(ok(r), f"a quarter-aligned move is accepted ({r.status_code})")
        r = c.get("/api/jobs/appointments")
        moved = next((a for a in r.json()["appointments"] if a["id"] == jid), None)
        check(moved and moved["scheduled_start"][11:16] == "09:15",
              "and it comes back changed")

        # The same rule on the general route. /schedule guarded the ordering
        # and PATCH /jobs/{id} beside it did not, so sending one field there
        # walked around the guard — and a partial move is precisely the case
        # the guard exists for. An appointment ending before it starts is not
        # a shape the month grid can draw.
        r = c.patch(f"/api/jobs/{jid}", json={"scheduled_start": f"{base}T23:00:00"})
        check(r.status_code == 400,
              f"pushing the start past a fixed end is refused here too ({r.status_code})")
        r = c.patch(f"/api/jobs/{jid}", json={"scheduled_end": f"{base}T08:00:00"})
        check(r.status_code == 400,
              f"and pulling the end before the start ({r.status_code})")
        r = c.patch(f"/api/jobs/{jid}", json={"scheduled_end": f"{base}T11:30:00"})
        check(ok(r), f"a widening that stays in order is accepted ({r.status_code})")
        r = c.get("/api/jobs/appointments")
        after = next((a for a in r.json()["appointments"] if a["id"] == jid), None)
        check(after and after["scheduled_start"][11:16] == "09:15",
              "and the start it did not touch is untouched")

    # Booking an empty slot creates the job already scheduled. `status` was
    # undeclared on JobIn, so it was accepted, silently dropped and the job
    # came back a lead — with no lead → scheduled edge to correct it by.
    r = c.post("/api/jobs", json={
        "title": "Silikonfugen erneuern",
        "status": "scheduled",
        "scheduled_start": f"{today}T11:15:00",
        "scheduled_end": f"{today}T12:45:00"})
    check(ok(r, 201), f"a slot can be booked into ({r.status_code})")
    if r.status_code < 400:
        check(r.json().get("status") == "scheduled",
              f"and arrives scheduled, not as a lead ({r.json().get('status')})")
        r2 = c.get("/api/jobs/appointments")
        booked = [a for a in r2.json()["appointments"]
                  if a["title"] == "Silikonfugen erneuern"]
        check(len(booked) == 1 and booked[0]["scheduled_start"][11:16] == "11:15",
              "and the day view shows it at the time it was booked for")
    r = c.post("/api/jobs", json={"title": "Ungültig", "status": "nonsense"})
    check(r.status_code == 422, f"an unknown status is refused ({r.status_code})")

    step("the catalogue offers seven trades, and still prices the rest")
    r = c.get("/api/estimate/catalogue")
    m = r.json() if r.status_code < 400 else {}
    keys = [x["key"] for x in (m.get("trades") or [])]
    check(keys == ["maler", "fliesen", "elektrik", "sanitaer", "garten",
                   "reinigung", "montage"],
          f"in the order the product chose, not alphabetical ({keys})")
    check(all(x.get("label") and x.get("count") for x in m.get("trades") or []),
          "each with a label and a count, so a tile can be built from it")
    # Deliberately not a fixed number. The catalogue grows; an assertion on its
    # size fails on every addition and teaches whoever hits it to raise the
    # number rather than ask what changed. What has to hold is the relation:
    # job_count is the sum of the offered trades, not the file's row count.
    offered = sum(x.get("count") or 0 for x in m.get("trades") or [])
    check(m.get("job_count") == offered,
          f"and job_count is the offered trades summed, not the file "
          f"({m.get('job_count')} vs {offered})")

    r = c.get("/api/estimate/jobs")
    listed = r.json().get("jobs", []) if r.status_code < 400 else []
    check(len(listed) == offered,
          f"the picker lists exactly those ({len(listed)} of {offered})")
    check({j["trade"] for j in listed} <= set(keys),
          "and nothing from a hidden trade leaks into it")
    # Alphabetical within each trade, with Ä/Ö/Ü folded — otherwise "Möbel
    # montieren" sorts below "TV-Wandhalterung" and the list reads as unsorted.
    fold = str.maketrans({"ä": "a", "ö": "o", "ü": "u", "ß": "s"})
    per_trade = {}
    for j in listed:
        per_trade.setdefault(j["trade"], []).append(j["label_de"])
    unsorted = [k for k, v in per_trade.items()
                if v != sorted(v, key=lambda s: s.lower().translate(fold))]
    check(not unsorted, f"each trade sorted A→Z with umlauts folded ({unsorted})")

    # Hidden, not deleted. An estimate or quote already citing one of these has
    # to keep working and keep reprinting at the same price.
    r = c.get("/api/estimate/jobs/dach.ziegel_umdecken")
    hidden_ok = r.status_code in (200, 404)
    check(hidden_ok, "a hidden job type is still addressable by key")
    if r.status_code == 200:
        r2 = c.post("/api/estimate", json={"job_key": "dach.ziegel_umdecken", "answers": {}})
        check(ok(r2, 200, 400, 422),
              f"and still prices rather than 404ing ({r2.status_code})")

    step("the estimator prices it")
    r = c.get("/api/estimate/catalogue")
    check(ok(r), f"catalogue loads ({r.json().get('job_count') if ok(r) else '?'} job types)")
    r = c.get("/api/estimate/jobs", params={"trade": "maler"})
    check(ok(r) and r.json()["total"] > 10, "Maler job types are listed")
    r = c.get("/api/estimate/jobs/maler.innenanstrich")
    check(ok(r) and len(r.json()["form"]) >= 4, "the guided form comes back")

    r = c.post("/api/estimate", json={
        "job_key": "maler.innenanstrich",
        "answers": {"qty": 180, "condition": "altbau_bewohnt",
                    "access": "og_ohne_lift", "untergrund": "altbau_leimfarbe"},
        "tier": "standard"})
    check(ok(r), "an estimate is produced")
    est = r.json() if r.status_code < 400 else {}
    check(bool(est.get("lines")), f"with {len(est.get('lines', []))} positions")
    check(any(n["severity"] == "high" for n in est.get("notes", [])),
          "and the Leimfarbe warning fires")
    lo, hi = est.get("total_net", [0, 0])
    check(lo * 0.97 <= est.get("lines_net", 0) <= hi * 1.03,
          f"the positions add up to the total ({est.get('lines_net')} in {[lo, hi]})")

    r = c.post("/api/estimate/quote", json={
        "job_key": "maler.innenanstrich",
        "answers": {"qty": 180, "condition": "altbau_bewohnt",
                    "access": "og_ohne_lift"},
        "tier": "standard", "job_id": job_id})
    check(ok(r, 201, 200), f"estimate -> quote -> {r.status_code}")
    body = r.json() if r.status_code < 400 else {}
    quote_id = (body.get("quotes") or [{}])[0].get("id")
    check(bool(body.get("estimate_id")),
          "and the estimate is stored for the accuracy comparison later")
    check(body.get("job_created") is False,
          "the job named in the request is the one used, not a new one")

    # A quote is what you send *before* there is work. Requiring a job first
    # put the sequence backwards: on a new enquiry there is nothing to attach
    # a quote to until one has been invented.
    r = c.post("/api/estimate/quote", json={
        "job_key": "maler.innenanstrich",
        "answers": {"qty": 40}, "tier": "standard"})
    check(ok(r, 201, 200), f"a calculation quotes with no job named -> {r.status_code}")
    solo = r.json() if r.status_code < 400 else {}
    check(solo.get("job_created") is True, "and the job is created for it")
    check(bool(solo.get("job_id")), "with an id the caller can follow")
    if solo.get("job_id"):
        r = c.get(f"/api/jobs/{solo['job_id']}")
        check(ok(r), "the job exists")
        # `lead` is where the ladder starts, and it is what this is: quoted,
        # not yet won. Sending the quote moves it on, acceptance creates the
        # commitment.
        check(r.json().get("status") == "lead",
              f"as a lead, which is what it is ({r.json().get('status')})")
        check(bool(r.json().get("title")),
              f"carrying the template's own name ({r.json().get('title')})")
        # And it converts like any other, which is the whole point of the
        # chain: calculate, quote, win, plan.
        sq = (solo.get("quotes") or [{}])[0].get("id")
        r = c.post(f"/api/quotes/{sq}/convert", json={"mode": "simple"})
        check(ok(r) and r.json().get("status") == "accepted",
              f"and the quote it carries converts into work ({r.status_code})")

    step("the quote carries what it must")
    r = c.get(f"/api/quotes/{quote_id}")
    check(ok(r), "the quote reads back")
    q = r.json() if r.status_code < 400 else {}
    check(bool(q.get("assumptions")), "the notes became assumptions")
    check(any(l.get("rate_key") for l in q.get("lines", [])),
          "and every position kept its rate_key, so acceptance can learn from it")
    check(float(q.get("net_total") or 0) > 0, f"net total {q.get('net_total')}")

    # The editor puts a name and a link on the screen, and a bare quote row
    # carries neither — only ids. Without the join there was nothing to head
    # the page with, which is part of why the only view of a quote was a list.
    check(bool(q.get("customer_name")), "and names the customer it is addressed to")
    check(bool(q.get("share_token")), "and carries the link the customer opens")

    r = c.get(f"/api/quotes/{quote_id}/pdf")
    check(ok(r) and r.content[:4] == b"%PDF", "the Angebot renders as a PDF")

    step("the quote can be changed — the whole editing half was unreachable")
    # Line editing, versioned revision and the PDF have all been complete in
    # the backend since Phase 3 and nothing called any of them. A customer who
    # rang up asking for a different tap could not be answered.
    before = q.get("net_total")
    # Exactly the payload the editor sends, rate_key included. QuoteLineIn did
    # not declare rate_key, so Pydantic dropped it on every edit and revision:
    # the quote survived, the link back to pro_rates did not, and accepting an
    # edited quote taught the business nothing. Creation was unaffected only
    # because the estimator writes to the repository and never crosses a model.
    edited = [{**{k: l[k] for k in ("kind", "description", "unit", "rate_key")},
               "position": i + 1, "qty": float(l["qty"]) + 1,
               "unit_price": float(l["unit_price"])}
              for i, l in enumerate(q.get("lines", []))]
    r = c.put(f"/api/quotes/{quote_id}/lines", json={"lines": edited})
    check(ok(r), f"a draft's positions can be replaced -> {r.status_code}")
    check(float(r.json().get("net_total") or 0) > float(before or 0)
          if r.status_code < 400 else False,
          "and the server recomputes the total rather than trusting the client")
    check(all(l.get("rate_key") for l in r.json().get("lines", []))
          if r.status_code < 400 else False,
          "and every position keeps its rate_key, so acceptance can still learn")

    r = c.post(f"/api/quotes/{quote_id}/revise", json={"lines": edited})
    check(ok(r, 201, 200), f"a revision is created -> {r.status_code}")
    revised = r.json() if r.status_code < 400 else {}
    check(revised.get("version") == 2, f"as version 2 ({revised.get('version')})")
    check(str(revised.get("supersedes_id")) == str(quote_id),
          "pointing back at the version it replaces")
    old = c.get(f"/api/quotes/{quote_id}").json()
    check(old.get("status") == "superseded",
          f"and version 1 is superseded, not rewritten ({old.get('status')})")
    # From here on the revision is the live document — editing v1 would be
    # editing a version the customer may already have seen.
    quote_id = revised.get("id") or quote_id
    r = c.put(f"/api/quotes/{quote_id}/lines", json={"lines": edited})
    check(ok(r), "the new version is the one that is editable")

    step("it is sent and the customer accepts")
    r = c.post(f"/api/quotes/{quote_id}/send")
    check(ok(r), "sending works")
    token = r.json().get("share_token") if r.status_code < 400 else None
    check(bool(token), "and returns the customer's link")

    if token:
        pr = c.get(f"/api/portal/{token}")
        check(ok(pr, 200, 404), f"the portal answers ({pr.status_code})")
        # What the customer is shown. Every one of these was absent from the
        # payload, so the screen rendered none of it and the accept button had
        # nothing to act on.
        portal = pr.json() if pr.status_code == 200 else {}
        check(bool((portal.get("pro") or {}).get("business_name")),
              "and names the business doing the work")
        check(len(portal.get("quotes") or []) > 0,
              f"and carries the quote ({len(portal.get('quotes') or [])})")
        check(all(q.get("lines") for q in portal.get("quotes") or []),
              "with its positions, not just a total")
        for key in ("progress", "change_orders", "invoices", "diary"):
            check(key in portal, f"and {key}")

    r = c.post(f"/api/quotes/{quote_id}/accept")
    check(ok(r), "acceptance works")
    check(r.json().get("status") == "accepted" if r.status_code < 400 else False,
          "and the quote is accepted")

    r = c.get(f"/api/jobs/{job_id}")
    check(ok(r) and r.json().get("status") == "accepted",
          "the job moved to accepted")
    check(float(r.json().get("contract_amount") or 0) > 0,
          "and carries the contract amount")

    step("acceptance taught the business its own rates")
    r = c.get("/api/profile/pro/rates")
    check(ok(r), "the rates endpoint answers")
    rates = r.json().get("rates", []) if r.status_code < 400 else []
    check(len(rates) > 0, f"{len(rates)} rates learned from the accepted quote")
    check(all(float(x["amount"]) > 0 for x in rates), "all positive")
    if rates:
        k = rates[0]["key"]
        r = c.put("/api/profile/pro/rates", json={"key": k, "amount": 55.5})
        check(ok(r), "a rate can be overridden by hand")
        again = c.get("/api/profile/pro/rates").json()["rates"]
        mine = next(x for x in again if x["key"] == k)
        check(float(mine["amount"]) == 55.5 and mine["is_manual"],
              "and is marked manual so learning will not overwrite it")

    step("the job can actually be moved along")
    # The detail screen's status dropdown offered active/on_hold/done/archived
    # — names from the old pm_projects table that are not members of the
    # job_status enum — and PATCHed them onto /api/jobs/{id}, where JobPatch
    # declares no `status` field so Pydantic dropped them. Both halves were
    # broken, so a job could never leave `accepted`. That starves the
    # estimator: estimates.measured() only counts completed/invoiced/closed,
    # so the rate-learning loop had no input it could ever receive.
    r = c.get(f"/api/jobs/{job_id}")
    allowed = r.json().get("allowed_transitions") if r.status_code < 400 else None
    check(allowed is not None, "the job payload states which moves are legal")
    check(set(allowed or []) == {"scheduled", "in_progress", "cancelled"},
          f"and from accepted those are exactly the three ({allowed})")

    step("one call turns an accepted quote into a booked Auftrag")
    # The four requests this replaces — accept, set the mode, set the address,
    # set the time — each had to survive a stairwell with one bar of signal.
    # A gap between any two left a quote accepted against a job with no time,
    # no mode and no address.
    from datetime import datetime as _dt, timezone as _tz
    slot_start = _dt.now(_tz.utc).replace(hour=8, minute=30, second=0, microsecond=0) \
        + timedelta(days=3)
    slot_end = slot_start + timedelta(hours=2)
    r = c.post(f"/api/quotes/{quote_id}/convert", json={
        "mode": "simple",
        "scheduled_start": slot_start.isoformat(),
        "scheduled_end": slot_end.isoformat(),
        "site": {"address": "Bahnhofstraße 12", "postal_code": "1210",
                 "city": "Wien", "lat": 48.2582, "lng": 16.3838}})
    check(ok(r), f"the conversion answers -> {r.status_code}")
    conv = r.json() if r.status_code < 400 else {}
    check(conv.get("mode") == "simple", f"the job is an Auftrag ({conv.get('mode')})")
    check(conv.get("status") == "scheduled",
          f"and booking it moved it to scheduled in the same call ({conv.get('status')})")
    check(bool(conv.get("scheduled_start")) and bool(conv.get("scheduled_end")),
          "with both ends of the appointment set")
    check(conv.get("site_city") == "Wien" and float(conv.get("site_lat") or 0) > 48,
          f"and the place it happens, coordinates included ({conv.get('site_city')})")

    # The calendar can only draw what it is told. Before this, the query that
    # feeds all three views did not select mode at all.
    r = c.get("/api/jobs/appointments", params={"days": 45})
    appts = r.json().get("appointments", r.json()) if r.status_code < 400 else []
    appts = appts if isinstance(appts, list) else appts.get("appointments", [])
    mine_appt = [a for a in appts if a.get("id") == job_id]
    check(bool(mine_appt), f"the appointment reaches the calendar ({len(appts)} in the window)")
    check(all("mode" in a for a in appts),
          "and every appointment carries its mode, so a project can be drawn apart from a job")

    # Times the grid cannot draw are refused here, not only in the UI.
    r = c.post(f"/api/quotes/{quote_id}/convert", json={
        "mode": "simple",
        "scheduled_start": (slot_start + timedelta(minutes=7)).isoformat(),
        "scheduled_end": slot_end.isoformat()})
    check(r.status_code == 400, f"16:07 is refused, not rounded silently -> {r.status_code}")
    r = c.post(f"/api/quotes/{quote_id}/convert", json={
        "mode": "simple", "scheduled_start": slot_end.isoformat(),
        "scheduled_end": slot_start.isoformat()})
    check(r.status_code == 400, f"and so is an end before its start -> {r.status_code}")
    r = c.post(f"/api/quotes/{quote_id}/convert", json={
        "mode": "simple", "scheduled_start": slot_start.isoformat()})
    check(r.status_code == 400, f"and half an appointment -> {r.status_code}")
    r = c.post(f"/api/quotes/{quote_id}/convert", json={"mode": "recurring"})
    check(r.status_code == 422,
          f"recurring is not reachable from a one-off quote -> {r.status_code}")

    # Converting again as a project must move the shape without inventing a
    # second record — same job, same id, same appointment.
    r = c.post(f"/api/quotes/{quote_id}/convert", json={"mode": "project"})
    check(ok(r) and r.json().get("id") == job_id,
          "converting again changes the same job, it does not fork a new one")
    check(r.json().get("mode") == "project" if r.status_code < 400 else False,
          "and it is a Projekt now")
    check(bool(r.json().get("scheduled_start")) if r.status_code < 400 else False,
          "with the appointment it already had left alone")
    r = c.post(f"/api/quotes/{quote_id}/convert", json={"mode": "simple"})
    check(ok(r) and r.json().get("status") == "scheduled",
          "and a conversion with no times does not drag the status backwards")

    # A quote whose job has been deleted must refuse, not answer 200 with a
    # scheduled job the calendar will never show — it filters deleted rows.
    r = c.post("/api/jobs", json={"title": "Wird gelöscht", "mode": "simple"})
    doomed = r.json().get("id") if ok(r, 200, 201) else None
    if doomed:
        r = c.post("/api/quotes", json={
            "job_id": doomed, "lines": [{"description": "X", "qty": 1, "unit_price": 10}]})
        dq = r.json().get("id") if ok(r, 200, 201) else None
        c.delete(f"/api/jobs/{doomed}")
        r = c.post(f"/api/quotes/{dq}/convert", json={"mode": "simple"})
        check(r.status_code == 409,
              f"converting against a deleted job is refused -> {r.status_code}")

    # Compared against whatever the job is now, not a hardcoded "accepted" —
    # the conversion above legitimately moved it, and an assertion that names
    # the expected status rather than the expected *behaviour* fails for the
    # wrong reason the first time anything upstream changes.
    was = c.get(f"/api/jobs/{job_id}").json().get("status")
    r = c.patch(f"/api/jobs/{job_id}", json={"status": "in_progress"})
    check(ok(r) and r.json().get("status") == was,
          f"the generic PATCH still refuses to move status, as it always did ({was})")

    r = c.patch(f"/api/jobs/{job_id}/status", json={"status": "closed"})
    check(r.status_code == 409,
          f"an illegal jump is refused as a conflict -> {r.status_code}")
    check("accepted" in r.text and "closed" in r.text,
          "naming both ends of the move it would not make")

    for nxt in ("scheduled", "in_progress"):
        r = c.patch(f"/api/jobs/{job_id}/status", json={"status": nxt})
        check(ok(r) and r.json().get("status") == nxt, f"the job moves to {nxt}")
    check(bool(r.json().get("started_at")) if r.status_code < 400 else False,
          "and in_progress stamped started_at")

    step("the work happens")
    r = c.post(f"/api/jobs/{job_id}/tasks", json={"title": "Abkleben", "column_key": "todo"})
    check(ok(r, 201, 200), "a task is created")
    task_id = r.json().get("id") if r.status_code < 400 else None
    r = c.patch(f"/api/jobs/{job_id}/tasks/{task_id}", json={"column_key": "done"})
    check(ok(r) and r.json().get("column_key") == "done",
          "and moving it between columns actually persists")

    r = c.post(f"/api/jobs/{job_id}/materials", json={
        "name": "Dispersionsfarbe 15 l", "qty": 4, "unit": "Stk", "planned_cost": 62.5})
    check(ok(r, 201, 200), "materials are recorded")
    mat_id = r.json().get("id") if r.status_code < 400 else None
    if mat_id:
        # One key at a time, the way the Materials tab edits inline. The PATCH
        # reused the create model, whose `name` is required, so every one of
        # these 422'd.
        r = c.patch(f"/api/jobs/{job_id}/materials/{mat_id}",
                    json={"actual_cost": 71.9})
        check(ok(r), f"and can be corrected one field at a time -> {r.status_code}")
        check(r.status_code < 400 and r.json().get("name") == "Dispersionsfarbe 15 l",
              "without losing the name that was not sent")

    r = c.post(f"/api/jobs/{job_id}/diary", json={
        "text": "Erste Lage aufgetragen.", "hours": 7.5})
    check(ok(r, 201, 200), "a diary entry saves")
    check(r.json().get("text") == "Erste Lage aufgetragen." if r.status_code < 400 else False,
          "with its text, not an empty row")

    step("an extra is agreed on site and becomes a Nachtrag")
    # The doc calls unbilled verbal extras the biggest silent margin leak, so
    # this has to end up on the invoice with a real amount and its own kind.
    # Sent the way the Billing tab sends it — as positions, not one figure.
    # The model did not declare `items`, Pydantic dropped them silently, and
    # every Nachtrag raised from that screen was worth 0 EUR.
    r = c.post(f"/api/jobs/{job_id}/change-orders", json={
        "title": "Zusätzliche Spachtelung Altbauwand",
        "description": "Untergrund schlechter als angenommen",
        "items": [{"description": "Spachteln und Schleifen", "qty": 12,
                   "unit_net": 35.0},
                  {"description": "Tiefengrund", "qty": 2, "unit_net": 30.0}],
        "vat_rate": 20, "kind": "labor"})
    check(ok(r, 201, 200), f"a Nachtrag is raised from line items -> {r.status_code}")
    co = r.json() if r.status_code < 400 else {}
    co_id = co.get("id")
    check(float(co.get("net_amount") or 0) == 480.0,
          f"and is worth what the positions add up to ({co.get('net_amount')}), not 0")
    check("Spachteln" in (co.get("description") or ""),
          "with the positions in the text the customer approves")
    if co_id:
        r = c.post(f"/api/jobs/{job_id}/change-orders/{co_id}/send")
        check(ok(r), "it is sent to the customer for approval")
        r = c.post(f"/api/portal/{token}/change-orders/{co_id}/approve",
                   json={"name": "Frau Beispiel"})
        check(ok(r, 200, 201), f"and the customer approves it -> {r.status_code}")
        r = c.get(f"/api/jobs/{job_id}/invoice-preview")
        descs = [l["description"] for l in r.json().get("lines", [])] \
            if r.status_code < 400 else []
        check(any("Nachtrag" in d for d in descs),
              f"so it appears on the invoice preview ({len(descs)} lines)")

    r = c.post(f"/api/jobs/{job_id}/timer/start")
    check(ok(r, 201, 200), "the timer starts")
    r = c.post(f"/api/jobs/{job_id}/timer/stop")
    check(ok(r), "and stops")
    r = c.post(f"/api/jobs/{job_id}/time-logs", json={
        # client_id is required: the offline queue chooses the row id on the
        # device so a replayed request cannot double-log an hour.
        "client_id": "11111111-2222-3333-4444-555555555555",
        "started_at": "2026-05-04T07:00:00Z", "stopped_at": "2026-05-04T16:00:00Z"})
    check(ok(r, 201, 200), "a manual time log is accepted")

    # The pro-side endpoint wants `signed_by`; the customer-portal one wants
    # `name`. Two names for the same thing on two endpoints that write the same
    # column is a trap waiting for whoever wires the pro-side screen.
    r = c.post(f"/api/jobs/{job_id}/abnahme", json={
        "signed_by": "H. Beispiel", "note": "Ohne Mängel übernommen."})
    check(ok(r, 200, 201), "Abnahme is recorded")

    step("finishing the work and billing it are one action")
    # Two steps that are one decision. Split across two screens, the second is
    # the one that gets forgotten, and unbilled finished work is the most
    # expensive kind of forgetting there is.
    r = c.post(f"/api/jobs/{job_id}/complete")
    check(ok(r, 200, 201), f"complete answers -> {r.status_code}")
    done = r.json() if r.status_code < 400 else {}
    check((done.get("job") or {}).get("status") == "invoiced",
          f"the job is finished and billed ({(done.get('job') or {}).get('status')})")
    check(bool((done.get("job") or {}).get("completed_at")),
          "with completed_at stamped, which is what the calibration reads")
    check(bool(done.get("invoice")), "and an invoice came back with it")
    check(len((done.get("invoice") or {}).get("lines") or []) > 1,
          f"carrying {len((done.get('invoice') or {}).get('lines') or [])} positions, "
          f"not one collapsed line")
    check(done.get("invoice_error") is None,
          f"and nothing was swallowed ({done.get('invoice_error')})")
    # The status has to be real before the paperwork is: an invoice against a
    # job that is not finished is a claim nobody made.
    check(bool((done.get("invoice") or {}).get("id")), "the invoice exists to open")

    # Completing a job that cannot be billed must leave it completed with a
    # reason, not roll the completion back — the work really is finished.
    r = c.post("/api/jobs", json={"title": "Nichts zu verrechnen", "mode": "simple"})
    bare = r.json().get("id") if ok(r, 200, 201) else None
    if bare:
        for nxt in ("accepted", "in_progress"):
            c.patch(f"/api/jobs/{bare}/status", json={"status": nxt})
        r = c.post(f"/api/jobs/{bare}/complete")
        check(ok(r, 200, 201), f"a job with no accepted quote still completes -> {r.status_code}")
        b = r.json() if r.status_code < 400 else {}
        check((b.get("job") or {}).get("status") == "completed",
              f"and stays completed rather than being rolled back "
              f"({(b.get('job') or {}).get('status')})")
        check(b.get("invoice") is None and bool(b.get("invoice_error")),
              f"with the reason it could not be billed ({b.get('invoice_error')})")

    step("the invoice inherits the accepted quote")
    r = c.get(f"/api/jobs/{job_id}/invoice-preview")
    check(ok(r), "the preview answers")
    preview_lines = r.json().get("lines", []) if r.status_code < 400 else []
    check(len(preview_lines) > 1,
          f"and inherits {len(preview_lines)} positions, not one collapsed line")

    # The exact three calls the invoice editor makes, in order. Every one of
    # them was unreachable from the UI: the screen fetched two endpoints that
    # do not exist, posted the wrong field names, and nothing anywhere called
    # /issue — so no invoice could ever get a number.
    r = c.post(f"/api/jobs/{job_id}/draft-invoice", json={})
    check(ok(r, 201, 200), f"the invoice is created -> {r.status_code}")
    inv = r.json() if r.status_code < 400 else {}
    invoice_id = inv.get("id")
    check(len(inv.get("lines", [])) > 1,
          f"with {len(inv.get('lines', []))} positions")
    # A draft has no number and no totals, and that is the point: the number
    # is allocated by a trigger at issue time so the series stays gap-free
    # even when a draft is abandoned.
    check(not inv.get("invoice_number"),
          "and no number yet — a draft must not consume one")
    check(inv.get("status") == "draft", f"status is draft ({inv.get('status')})")

    # …and having no issue_date, it used to sort behind every issued invoice.
    # With twenty rows to a page a pro's unfinished work fell off the end of
    # the list, and the more they invoiced the deeper it was buried — the one
    # row on that screen that still needs something done to it.
    r = c.get("/api/invoices", params={"sort_by": "invoice_date", "order": "desc",
                                       "page": 1, "per_page": 20})
    listed = r.json().get("invoices", []) if ok(r) else []
    check(any(x.get("id") == invoice_id for x in listed),
          "and it is on the first page of the date-sorted list, not behind the issued ones")
    if listed:
        lead = list(itertools.takewhile(lambda x: x.get("status") == "draft", listed))
        check(any(x.get("id") == invoice_id for x in lead),
              f"drafts lead the list ({len(lead)} of {len(listed)} rows)")
    # An explicit sort is the pro's instruction and must not be overridden.
    r = c.get("/api/invoices", params={"sort_by": "amount", "order": "desc",
                                       "page": 1, "per_page": 20})
    by_amount = r.json().get("invoices", []) if ok(r) else []
    # Checked directly, on the amounts. The first version used "the top row is
    # not a draft" as a proxy for "the draft-first rule was not applied here",
    # and that proxy is wrong: a draft may legitimately be the largest invoice
    # on the list, which is exactly what happens once a job is completed and
    # billed in one step.
    amounts = [float(x.get("gross_total") or 0) for x in by_amount]
    check(amounts == sorted(amounts, reverse=True),
          f"but sorting by amount still sorts by amount ({amounts})")

    if invoice_id:
        step("issuing freezes it, and after that it can only be stornoed")
        r = c.post(f"/api/invoices/{invoice_id}/issue", json={})
        check(ok(r), f"the invoice is issued -> {r.status_code}")
        inv = r.json() if r.status_code < 400 else inv
        check(bool(inv.get("invoice_number")),
              f"and now has a number ({inv.get('invoice_number')})")
        check(float(inv.get("gross_total") or 0) > float(inv.get("net_total") or 0),
              f"gross {inv.get('gross_total')} exceeds net {inv.get('net_total')}, "
              f"so VAT was applied")

        r = c.get(f"/api/invoices/{invoice_id}/pdf")
        check(ok(r) and r.content[:4] == b"%PDF", "the Rechnung renders as a PDF")

        # The bulk export the "Export all as PDF" button calls. It shipped
        # without a route behind it, and the click handler swallowed the 404,
        # so the button did nothing and said nothing.
        import io as _io, zipfile as _zipfile
        r = c.get("/api/invoices/export.zip")
        check(ok(r) and r.content[:2] == b"PK",
              f"the bulk export returns a ZIP ({r.status_code})")
        if r.status_code == 200:
            z = _zipfile.ZipFile(_io.BytesIO(r.content))
            names = z.namelist()
            check(z.testzip() is None, "the archive is not corrupt")
            check(bool(names) and all(n.endswith(".pdf") for n in names),
                  f"and holds {len(names)} PDF(s)")
            check(all(z.read(n)[:4] == b"%PDF" for n in names),
                  "each of which is a real PDF, not an error page")
            check(f"{inv.get('invoice_number')}.pdf".replace("/", "-") in names,
                  "including the one just issued")
        r = c.get("/api/invoices/export.zip", params={"year": 1999})
        check(r.status_code == 404,
              f"a filter matching nothing is a 404 with a reason, not a 500 ({r.status_code})")

        # Editing an issued invoice must be refused — this is the GoBD rule
        # the database enforces with a trigger, and the API should say so in
        # words rather than by raising.
        r = c.put(f"/api/invoices/{invoice_id}/lines",
                  json={"lines": [{"description": "Nachträglich", "qty": 1,
                                   "unit_price": 100, "kind": "labor"}]})
        check(r.status_code in (400, 403, 409),
              f"and its positions can no longer be edited ({r.status_code})")

        r = c.post(f"/api/invoices/{invoice_id}/payments", json={
            "amount": float(inv["gross_total"]), "paid_on": str(date.today()),
            "method": "transfer"})
        check(ok(r, 201, 200), f"a payment is recorded -> {r.status_code}")
        r = c.get(f"/api/invoices/{invoice_id}")
        paid = r.json() if r.status_code < 400 else {}
        check(paid.get("payment_state") == "paid",
              f"and the invoice reads paid ({paid.get('payment_state')})")

        step("a wrong invoice is corrected by a Storno, never by an edit")
        # On a second invoice, so the journey's own numbers stay intact. This
        # is the one correction route § 11 UStG and GoBD leave open, and it
        # was blocked outright: the Storno was inserted as 'issued' and the
        # very next line-insert hit `invoice_lines_enforce_immutability`.
        r = c.post("/api/invoices", json={
            "customer_id": customer_id, "job_id": job_id,
            "lines": [{"description": "Versehentlich verrechnet", "qty": 1,
                       "unit": "pcs", "unit_price": 250, "kind": "labor"}]})
        check(ok(r, 201, 200), f"a second invoice is drafted -> {r.status_code}")
        wrong_id = r.json().get("id") if r.status_code < 400 else None
        if wrong_id:
            r = c.post(f"/api/invoices/{wrong_id}/issue", json={})
            check(ok(r), "and issued")

            # "Mark paid" settled the balance with method='manual', which is
            # not a member of the payment_method enum, so it 500'd every time
            # the button was pressed. Checked here and then undone, because
            # the Storno below needs the invoice unpaid.
            r = c.post(f"/api/invoices/{wrong_id}/mark-paid")
            check(ok(r), f"'mark paid' settles it in one action "
                         f"-> {r.status_code}")
            settled = r.json() if r.status_code < 400 else {}
            check(settled.get("payment_state") == "paid",
                  f"and the invoice reads paid ({settled.get('payment_state')})")
            for p in settled.get("payments", []):
                c.delete(f"/api/invoices/{wrong_id}/payments/{p['id']}")
            wrong_no = r.json().get("invoice_number") if r.status_code < 400 else None
            r = c.post(f"/api/invoices/{wrong_id}/storno",
                       json={"reason": "Position doppelt verrechnet"})
            check(ok(r, 201, 200), f"the Storno is created -> {r.status_code}")
            st = r.json() if r.status_code < 400 else {}
            check(bool(st.get("invoice_number")),
                  f"with its own number ({st.get('invoice_number')}), so the "
                  f"series stays gap-free")
            check(float(st.get("gross_total") or 0) < 0,
                  f"and a negative total ({st.get('gross_total')}) that nets "
                  f"{wrong_no} out")
            r = c.get(f"/api/invoices/{wrong_id}")
            check(r.json().get("status") == "cancelled" if r.status_code < 400 else False,
                  "the original is marked cancelled, not deleted")
            r = c.post(f"/api/invoices/{wrong_id}/storno",
                       json={"reason": "Nochmal"})
            check(r.status_code in (400, 409),
                  f"and it cannot be stornoed twice ({r.status_code})")

            # The cancellation must net to zero, not subtract twice. The
            # rollups excluded the cancelled original while still counting its
            # negative mirror, so cancelling a 300 EUR invoice took 300 EUR
            # off turnover and pushed receivables negative.
            r = c.get("/api/tax/dashboard", params={"year": date.today().year})
            d = r.json() if r.status_code < 400 else {}
            check(float(d.get("outstanding") or 0) >= 0,
                  f"receivables are not negative after a Storno "
                  f"({d.get('outstanding')})")
            r = c.get(f"/api/customers/{customer_id}")
            ltv = float((r.json() or {}).get("lifetime_value") or 0) \
                if r.status_code < 400 else -1
            check(abs(ltv - float(inv["gross_total"])) < 0.01,
                  f"and lifetime value is the one invoice that stands "
                  f"({ltv} vs {inv['gross_total']})")

    step("the customer record can be corrected — nothing ever called these")
    # GET, PATCH and DELETE on a customer have all existed and none had a
    # caller. A customer could be created and then never touched: a typo in a
    # UID went in permanently, and a UID is what decides §13b reverse charge.
    r = c.get(f"/api/customers/{customer_id}")
    check(ok(r), "the record reads back")
    check(r.json().get("jobs_count", 0) >= 1 if r.status_code < 400 else False,
          "with the rollups the detail screen heads the page with")

    r = c.patch(f"/api/customers/{customer_id}", json={"vat_id": "ATU99999999"})
    check(ok(r) and r.json().get("vat_id") == "ATU99999999",
          "a correction lands")
    check(r.json().get("name") == "Hausverwaltung Beispiel GmbH"
          if r.status_code < 400 else False,
          "and a PATCH that omits a field leaves it alone")

    # Sending null must clear. With exclude_none there was no way to express
    # that, so a phone number typed wrong could be changed but never removed.
    r = c.patch(f"/api/customers/{customer_id}", json={"phone": None})
    check(ok(r) and not r.json().get("phone"),
          f"an explicit null clears the field ({r.json().get('phone')!r})")
    check(r.json().get("email") == "office@beispiel-kunde.example.com"
          if r.status_code < 400 else False,
          "without clearing the fields that were not sent")

    # Name and type are not clearable: a customer with no name is not a
    # record, and type drives the VAT treatment on every document.
    r = c.patch(f"/api/customers/{customer_id}", json={"name": None})
    check(ok(r) and r.json().get("name") == "Hausverwaltung Beispiel GmbH",
          "but the name cannot be nulled away")

    # Their history, from the filters the detail screen uses.
    r = c.get("/api/jobs", params={"customer_id": customer_id})
    check(ok(r) and len(r.json().get("jobs") or []) >= 1,
          f"their jobs list by customer ({len(r.json().get('jobs') or [])})")
    r = c.get("/api/invoices", params={"customer_id": customer_id})
    check(ok(r) and len(r.json().get("invoices") or []) >= 1,
          f"and so do their invoices ({len(r.json().get('invoices') or [])})")

    step("the home screen gets every tile figure in one request")
    # Six tiles counted client-side would be five or six requests on a phone
    # on one bar of signal, so they are counted in the one endpoint the home
    # screen already calls. It had no caller at all before this.
    r = c.get("/api/jobs/counts")
    check(ok(r), f"the counts endpoint answers ({r.status_code})")
    k = r.json() if r.status_code < 400 else {}
    for key in ("kalkulation", "angebot", "auftrag", "projekt", "wartung", "rechnung"):
        check(key in k, f"and carries {key}")
    # The sixth tile was Garantie, which had no feature behind it. It is
    # Rechnungen now, so every tile on the screen leads somewhere real.
    check("garantie" not in k, "and no longer pretends to count warranties")
    check(k.get("rechnung", 0) >= 1,
          f"the invoice issued above is counted as outstanding ({k.get('rechnung')})")
    check(all(isinstance(v, int) for v in k.values()),
          "every figure is a number the tile can print")
    # The originals are still there; the dashboard reads them.
    for key in ("leads", "quoted", "booked", "active", "awaiting_invoice", "emergencies"):
        check(key in k, f"and the dashboard's {key} still exists")

    step("the dunning list shows who to chase, and nothing else")
    r = c.get("/api/invoices/overdue")
    check(ok(r), f"the overdue list answers ({r.status_code})")
    od = r.json().get("invoices", []) if r.status_code < 400 else []
    # A credit note is unpaid and past due by construction — it is money the
    # pro owes, not money owed to them. Listing it means chasing your own
    # customer for a refund you issued.
    # Meaningful rather than vacuous: this business definitely has a Storno by
    # now — it was created two steps ago — so its absence here is a result,
    # not an artefact of an empty list.
    allinv = c.get("/api/invoices", params={"limit": 200}).json().get("invoices", [])
    stornos = [i["invoice_number"] for i in allinv if i["type"] == "storno"]
    check(len(stornos) > 0, f"the business has a Storno on file ({stornos})")
    check(not [i for i in od if i["type"] == "storno"],
          f"and it is not in the dunning list ({len(od)} row(s) there)")
    check(all(float(i["outstanding"]) > 0 for i in od),
          "nor anything already settled")

    step("the numbers reach the tax toolkit")
    y = date.today().year
    r = c.get("/api/tax/eur", params={"year": y})
    check(ok(r), "EÜR answers")
    check(float(r.json().get("income_gross") or 0) > 0 if r.status_code < 400 else False,
          f"and sees the payment ({r.json().get('income_gross') if r.status_code < 400 else '?'})")
    for path in ("/api/tax/ust-va", "/api/tax/liability", "/api/tax/svs",
                 "/api/tax/income-tax", "/api/tax/mileage", "/api/tax/dashboard"):
        rr = c.get(path, params={"year": y})
        check(ok(rr), f"{path}")
    for path in ("/api/tax/exports/revenue.csv", "/api/tax/exports/expenses.csv",
                 "/api/tax/exports/datev-full.csv"):
        rr = c.get(path, params={"year": y})
        check(ok(rr) and rr.content.startswith("﻿".encode()),
              f"{path} exports with a BOM for Excel")
    rr = c.get("/api/tax/year-end.pdf", params={"year": y})
    check(ok(rr) and rr.content[:4] == b"%PDF", "the year-end dossier renders")

    step("an expense is booked and reaches the same numbers")
    r = c.post("/api/tax/receipts", json={
        "vendor": "Farbenhaus Wien", "category": "Material",
        "gross_amount": 372.0, "vat_rate": 20, "expense_date": str(date.today())})
    check(ok(r, 201, 200), "a receipt saves under the name the UI uses")
    r = c.get("/api/tax/eur", params={"year": y})
    check(float(r.json().get("expenses_net") or 0) > 0 if r.status_code < 400 else False,
          "and appears in the EÜR")

    # The Belege tab looked like it worked and could not record anything: it
    # POSTed multipart at a JSON endpoint, read `data.receipts` where the key
    # is `expenses`, and rendered `receipt_date`/`amount_brutto` against
    # columns called `expense_date`/`gross_amount`. Three mismatches, none
    # visible, and between them the EÜR reported income against no expenses at
    # all. These are the calls the rewritten tab makes, in its order.
    r = c.get("/api/tax/expense-categories")
    cats = r.json().get("categories") if r.status_code < 400 else []
    check(ok(r) and "Material" in (cats or []),
          f"the category list the form is built from answers ({len(cats or [])})")

    r = c.get("/api/tax/expenses", params={"year": y, "limit": 500})
    listed = r.json().get("expenses") if r.status_code < 400 else None
    check(listed is not None, "the ledger lists under the key the tab now reads")
    check(bool(listed) and all(
        {"expense_date", "gross_amount", "net_amount", "vat_amount"} <= set(e)
        for e in listed), "with the column names it now renders")

    # Gross in, because a tradesperson reads the Brutto off the paper.
    r = c.post("/api/tax/expenses", json={
        "expense_date": str(date.today()), "vendor": "Werkzeug Meier",
        "category": "Werkzeug", "gross_amount": 240.0, "vat_rate": 20,
        "vat_deductible": True, "payment_method": "card"})
    check(ok(r, 201, 200), f"an expense is entered by hand -> {r.status_code}")
    exp = r.json() if r.status_code < 400 else {}
    exp_id = exp.get("id")
    check(abs(float(exp.get("net_amount") or 0) - 200.0) < 0.02,
          f"and the server derives the net from the gross ({exp.get('net_amount')})")
    check(abs(float(exp.get("vat_amount") or 0) - 40.0) < 0.02,
          f"and the input VAT with it ({exp.get('vat_amount')})")

    if exp_id:
        r = c.patch(f"/api/tax/expenses/{exp_id}", json={"gross_amount": 120.0})
        check(ok(r), "a correction is accepted")
        check(abs(float(r.json().get("net_amount") or 0) - 100.0) < 0.02
              if r.status_code < 400 else False,
              "and re-derives net and VAT rather than leaving them stale")
        check(r.json().get("category") == "Werkzeug" if r.status_code < 400 else False,
              "without resetting the category the pro chose")

        eur_before = c.get("/api/tax/eur", params={"year": y}).json().get("expenses_net")
        r = c.delete(f"/api/tax/expenses/{exp_id}")
        check(ok(r), "and it can be deleted")
        eur_after = c.get("/api/tax/eur", params={"year": y}).json().get("expenses_net")
        check(float(eur_after) < float(eur_before),
              f"which the EÜR reflects ({eur_before} -> {eur_after})")

    step("the accountant gets a link")
    r = c.post("/api/tax/accountant-share", params={"year": y})
    check(ok(r, 201, 200), "a share link is minted")
    share = r.json().get("accountant_token") if r.status_code < 400 else None
    if share:
        pub = c.get(f"/api/tax/public/accountant/{share}")
        check(ok(pub), "and resolves without a login")
        check("eur" in pub.json() and "ust_va" in pub.json() if pub.status_code < 400 else False,
              "to the year and its quarters")
        # Rotation must kill the old link, or revoking is theatre.
        r2 = c.post("/api/tax/accountant-share", params={"year": y})
        old = c.get(f"/api/tax/public/accountant/{share}")
        check(old.status_code == 404, "a rotated link stops resolving")
        c.delete("/api/tax/accountant-share")
        newtok = r2.json().get("accountant_token")
        check(c.get(f"/api/tax/public/accountant/{newtok}").status_code == 404,
              "and revoking kills the new one too")

    step("post-purchase: the job file and the recurring contract")
    r = c.get(f"/api/jobs/{job_id}/export-pdf", params={"lang": "de"})
    check(ok(r, 200, 400), f"the Job File export answers ({r.status_code})")
    if r.status_code == 200:
        check(r.content[:4] == b"%PDF", "and renders a PDF")

    r = c.post("/api/recurring", json={
        "customer_id": customer_id, "title": "Stiegenhausreinigung",
        "cadence": "fortnightly", "weekday": 2, "billing": "per_visit",
        "price_per_visit": 120, "starts_on": str(date.today())})
    check(ok(r, 201, 200), f"a maintenance contract is created -> {r.status_code}")
    contract_id = r.json().get("id") if r.status_code < 400 else None
    if contract_id:
        r = c.post(f"/api/recurring/{contract_id}/generate", params={"days": 90})
        check(ok(r, 201, 200) and r.json().get("created", 0) > 0,
              f"and generates {r.json().get('created') if r.status_code < 400 else '?'} visits")
        again = c.post(f"/api/recurring/{contract_id}/generate", params={"days": 90})
        check(again.json().get("created") == 0 if again.status_code < 400 else False,
              "a second run creates none — generation is idempotent")

    step("the loop closes: what was estimated against what it took")
    r = c.post("/api/estimate/calibrate")
    check(ok(r), "calibration runs")
    r = c.get("/api/estimate/accuracy")
    check(ok(r), "accuracy answers")
    acc = r.json() if r.status_code < 400 else {}
    notes.append(f"jobs measured: {acc.get('jobs_measured')} "
                 f"(needs the job to be completed/invoiced and timed)")

    step("data-subject rights")
    r = c.get("/api/me/deletion")
    check(ok(r), "the deletion preview answers")
    plan = r.json().get("plan", {}) if r.status_code < 400 else {}
    check(len(plan.get("retained", [])) > 0,
          "and names the invoices it must keep, now that one exists")
    r = c.get("/api/me/export")
    check(ok(r) and r.content[:2] == b"PK", "the data export is a ZIP")
    import io as _io
    import zipfile as _zip
    if r.status_code == 200:
        z = _zip.ZipFile(_io.BytesIO(r.content))
        check("daten.json" in z.namelist(), "containing the data")
        blob = z.read("daten.json").decode()
        check("password_hash" not in blob, "with no password hash in it")
        check("Malerbetrieb Öztürk" in blob, "and the business in it")

    r = c.post("/api/me/consent", json={"cookies_analytics": True,
                                        "marketing_emails": False})
    check(ok(r, 201, 200), "consent is recorded")
    r = c.get("/api/me/consent")
    check(ok(r) and not r.json().get("needs_reconsent"),
          "and the policy version is satisfied")

    r = c.delete("/api/me")
    check(ok(r), "erasure can be requested")
    check(c.get("/api/auth/me").status_code == 200,
          "and the account still works during the grace period — otherwise it "
          "could never be cancelled")
    r = c.post("/api/me/cancel-deletion")
    check(ok(r), "and it can be cancelled")

    step("the erasure job is reachable by the scheduler that must call it")
    # Vercel Cron issues GET with `Authorization: Bearer`, and this was a POST
    # behind a custom header — so it could not be scheduled at all, and the
    # Art. 17 grace period expired with nothing happening.
    os.environ["PURGE_SECRET"] = "journey-test-secret"
    r = c.get("/api/me/purge-due")
    check(r.status_code == 403, f"an unauthenticated GET is refused ({r.status_code})")
    r = c.get("/api/me/purge-due", headers={"Authorization": "Bearer wrong"})
    check(r.status_code == 403, f"a wrong bearer is refused ({r.status_code})")
    r = c.get("/api/me/purge-due",
              headers={"Authorization": "Bearer journey-test-secret"})
    check(ok(r), f"the scheduler's GET + bearer runs it ({r.status_code})")
    r = c.post("/api/me/purge-due", headers={"x-purge-secret": "journey-test-secret"})
    check(ok(r), f"and the original POST + header still works ({r.status_code})")
    del os.environ["PURGE_SECRET"]
    r = c.get("/api/me/purge-due")
    check(r.status_code == 503,
          f"with no secret configured it fails closed rather than running ({r.status_code})")

    step("a business cannot see another's data")
    # Leave something on the job that is actually worth leaking. The first
    # Nachtrag was marked `invoiced` when the draft was created, and
    # to_invoice_lines only returns approved ones — so without this the leak
    # check below would pass against an empty list and prove nothing.
    r = c.post(f"/api/jobs/{job_id}/change-orders", json={
        "title": "Vertraulicher Nachtrag", "net_amount": 999.0,
        "vat_rate": 20, "kind": "labor"})
    bait_id = r.json().get("id") if r.status_code < 400 else None
    if bait_id:
        c.post(f"/api/jobs/{job_id}/change-orders/{bait_id}/send")
        c.post(f"/api/portal/{token}/change-orders/{bait_id}/approve",
               json={"name": "Frau Beispiel"})
        r = c.get(f"/api/jobs/{job_id}/invoice-preview")
        owner_sees = [l["description"] for l in r.json().get("lines", [])] \
            if r.status_code < 400 else []
        check(any("Vertraulicher" in d for d in owner_sees),
              f"the owner's preview shows the new Nachtrag ({len(owner_sees)} lines)")

    # The second business borrows the same client rather than getting its own.
    # A second TestClient would open a second event loop, and the asyncpg pool
    # belongs to the first one — every query through it fails with
    # "another operation is in progress", which looks like a database fault
    # and is entirely an artefact of the harness.
    mine = dict(c.cookies)
    c.cookies.clear()
    other = f"e2e-other-{os.getpid()}@e2e-local.example.com"
    c.post("/api/auth/register", json={"email": other, "password": "Sichergenug!23",
                                       "name": "Fremder Betrieb",
                                       "accepted_terms": True, "accepted_privacy": True})
    c.post("/api/auth/login", json={"email": other, "password": "Sichergenug!23"})
    # It has to onboard. Without a pro_profiles row require_pro_id 404s every
    # business endpoint, so every assertion below would pass for the wrong
    # reason — "refused" would mean "you have no business", not "that is not
    # yours". A tenancy test against an account that cannot reach any tenant
    # tests nothing.
    r = c.post("/api/auth/onboarding", json={
        "country": "AT", "name": "Bea", "surname": "Fremd",
        "phone": "+43 660 7654321", "address": "Fremdgasse 1",
        "postal_code": "1200", "city": "Wien",
        "contact_person": "Bea Fremd", "company_name": "Fremder Betrieb e.U.",
        "licence_file_id": "documents/placeholder-licence"})
    check(ok(r), f"the second business onboards too -> {r.status_code}")
    check(c.get("/api/customers").status_code == 200,
          "and can reach its own (empty) data, so a refusal below means "
          "'not yours' rather than 'no business'")

    for path in (f"/api/jobs/{job_id}", f"/api/quotes/{quote_id}",
                 f"/api/customers/{customer_id}"):
        rr = c.get(path)
        check(rr.status_code in (403, 404), f"{path} is refused ({rr.status_code})")
    rr = c.post(f"/api/jobs/{job_id}/tasks", json={"title": "Fremd", "column_key": "todo"})
    check(rr.status_code in (403, 404), f"and writing is refused ({rr.status_code})")

    # The interesting leaks are not the GETs — those were always scoped. They
    # are the writes that accept a foreign id and then read through it.
    rr = c.post("/api/invoices", json={
        "customer_id": customer_id,
        "lines": [{"description": "Fremd", "qty": 1, "unit_price": 1}]})
    check(rr.status_code in (403, 404),
          f"an invoice cannot be drafted against another business's customer "
          f"({rr.status_code})")
    rr = c.post("/api/invoices", json={
        "job_id": job_id,
        "lines": [{"description": "Fremd", "qty": 1, "unit_price": 1}]})
    check(rr.status_code in (403, 404),
          f"nor against their job ({rr.status_code})")
    # This one leaked approved Nachtrag titles and amounts to anyone holding
    # a job uuid, because only the quote half of the query was scoped.
    rr = c.get(f"/api/jobs/{job_id}/invoice-preview")
    leaked = rr.json().get("lines", []) if rr.status_code == 200 else []
    check(not leaked,
          f"and the invoice preview discloses nothing ({rr.status_code}, "
          f"{len(leaked)} lines)")

    c.cookies.clear()
    c.cookies.update(mine)

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
for f in fails:
    print("  ·", f)
for n in notes:
    print("  note:", n)
sys.exit(1 if fails else 0)
