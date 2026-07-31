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
        "licence_file_id": "documents/placeholder-licence"})
    check(ok(r), f"onboarding creates the business -> {r.status_code}")

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

    step("the quote carries what it must")
    r = c.get(f"/api/quotes/{quote_id}")
    check(ok(r), "the quote reads back")
    q = r.json() if r.status_code < 400 else {}
    check(bool(q.get("assumptions")), "the notes became assumptions")
    check(any(l.get("rate_key") for l in q.get("lines", [])),
          "and every position kept its rate_key, so acceptance can learn from it")
    check(float(q.get("net_total") or 0) > 0, f"net total {q.get('net_total')}")

    r = c.get(f"/api/quotes/{quote_id}/pdf")
    check(ok(r) and r.content[:4] == b"%PDF", "the Angebot renders as a PDF")

    step("it is sent and the customer accepts")
    r = c.post(f"/api/quotes/{quote_id}/send")
    check(ok(r), "sending works")
    token = r.json().get("share_token") if r.status_code < 400 else None
    check(bool(token), "and returns the customer's link")

    if token:
        pr = c.get(f"/api/portal/{token}")
        check(ok(pr, 200, 404), f"the portal answers ({pr.status_code})")

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

    step("the invoice inherits the accepted quote")
    r = c.get(f"/api/jobs/{job_id}/invoice-preview")
    check(ok(r), "the preview answers")
    preview_lines = r.json().get("lines", []) if r.status_code < 400 else []
    check(len(preview_lines) > 1,
          f"and inherits {len(preview_lines)} positions, not one collapsed line")

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
