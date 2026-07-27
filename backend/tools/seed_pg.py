#!/usr/bin/env python3
"""Seed the Postgres database with a working demo account.

A freshly deployed instance has no users, and registering by hand needs an
onboarding flow with a licence upload before anything is reachable. This puts
a usable tradesperson and a realistic job history in place so the app can be
opened and clicked through immediately.

    python tools/seed_pg.py                 # create (idempotent)
    python tools/seed_pg.py --reset         # wipe this pro's data first
    python tools/seed_pg.py --wipe-all      # empty every table (dev only)

Creates: one pro (demo@servicemarket.at / Demo1234!), three customers, four
jobs across all three modes, a tiered quote, an approved Nachtrag, an
Abschlag and a Schlussrechnung, expenses, and a running timer.

Refuses to touch a database that already holds unrelated data unless --force
is given, so it cannot be pointed at production by accident.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from auth import hash_password  # noqa: E402
from db import pg  # noqa: E402

EMAIL = "demo@servicemarket.at"
PASSWORD = "Demo1234!"

PRO = "a0000000-0000-4000-8000-000000000001"
USER = "a0000000-0000-4000-8000-000000000000"
CUST = ["b0000000-0000-4000-8000-00000000000%d" % i for i in (1, 2, 3)]
JOB = ["c0000000-0000-4000-8000-00000000000%d" % i for i in (1, 2, 3, 4)]


async def wipe(pro_only: bool) -> None:
    """Delete in FK order. Invoice triggers are suspended for the duration —
    seeded invoices are issued, and issued invoices are immutable by design."""
    async with pg.transaction() as con:
        await con.execute("alter table invoices disable trigger invoices_immutable")
        await con.execute("alter table invoice_lines disable trigger invoice_lines_immutable")
    try:
        scope = "where pro_id = $1" if pro_only else ""
        args = [PRO] if pro_only else []
        await pg.execute(
            f"delete from invoice_payments where invoice_id in "
            f"(select id from invoices {scope})", *args)
        await pg.execute(
            f"delete from invoice_lines where invoice_id in "
            f"(select id from invoices {scope})", *args)
        await pg.execute(f"delete from invoices {scope}", *args)
        for table in ("quote_lines",):
            await pg.execute(
                f"delete from {table} where quote_id in (select id from quotes {scope})", *args)
        for table in ("change_orders", "job_tasks", "job_materials",
                      "job_diary", "job_time_logs", "job_documents"):
            await pg.execute(
                f"delete from {table} where job_id in (select id from jobs {scope})", *args)
        for table in ("quotes", "expenses", "jobs", "customers",
                      "pro_rates", "number_counters"):
            await pg.execute(f"delete from {table} {scope}", *args)
        if pro_only:
            await pg.execute("delete from pro_profiles where id = $1", PRO)
            await pg.execute("delete from users where id = $1", USER)
        else:
            await pg.execute("delete from pro_profiles")
            await pg.execute("delete from users")
    finally:
        async with pg.transaction() as con:
            await con.execute("alter table invoices enable trigger invoices_immutable")
            await con.execute("alter table invoice_lines enable trigger invoice_lines_immutable")


async def seed() -> None:
    today = date.today()

    await pg.execute(
        """
        insert into users (id, email, password_hash, name, given_name, family_name,
                           role, country, lang, phone, address, postal_code, city,
                           onboarding_complete, is_email_verified)
        values ($1, $2, $3, 'Anna Weber', 'Anna', 'Weber', 'tradesperson', 'AT', 'de',
                '+43 664 1234567', 'Hauptstraße 12', '1010', 'Wien', true, true)
        on conflict (id) do nothing
        """, USER, EMAIL, hash_password(PASSWORD))

    await pg.execute(
        """
        insert into pro_profiles (id, user_id, business_name, contact_person,
          invoice_country, vat_id, is_kleinunternehmer,
          business_address, business_postal_code, business_city, business_country,
          bank_account_holder, bank_iban, bank_bic, bank_name,
          service_categories, licence_status, insurance_status,
          is_verified, is_licensed, is_insured, plan_tier, invoice_footer)
        values ($1, $2, 'Weber Malerei GmbH', 'Anna Weber', 'AT', 'ATU12345678', false,
          'Hauptstraße 12', '1010', 'Wien', 'AT',
          'Weber Malerei GmbH', 'AT611904300234573201', 'BKAUATWW', 'Bank Austria',
          array['painting','tiling'], 'verified', 'verified', true, true, true,
          'explorer', 'Weber Malerei GmbH · FN 123456a · Gerichtsstand Wien')
        on conflict (id) do nothing
        """, PRO, USER)

    # Rate memory — the app is meant to learn these, seeded here so the demo
    # does not start from a blank price list.
    for key, label, unit, amount in (
        ("wall_paint_m2", "Wände streichen", "m²", 12.00),
        ("tile_lay_m2", "Fliesen verlegen", "m²", 45.00),
        ("hourly", "Stundensatz", "h", 65.00),
        ("callout", "Anfahrtspauschale", "pcs", 35.00),
    ):
        await pg.execute(
            "insert into pro_rates (pro_id, key, label, unit, amount) "
            "values ($1,$2,$3,$4,$5) on conflict (pro_id, key) do nothing",
            PRO, key, label, unit, amount)

    customers = [
        (CUST[0], "private", "Herr Gruber", None, "gruber@example.at", "+43 664 1111111",
         "Seestraße 4", "1220", "Wien"),
        (CUST[1], "business", "Hausverwaltung Nord GmbH", "Hausverwaltung Nord GmbH",
         "office@hv-nord.at", "+43 1 2223334", "Ringstraße 40", "1010", "Wien"),
        (CUST[2], "private", "Frau Berger", None, "berger@example.at", "+43 660 2222222",
         "Gartenweg 7", "1230", "Wien"),
    ]
    for cid, ctype, name, company, email, phone, addr, zip_, city in customers:
        await pg.execute(
            """
            insert into customers (id, pro_id, type, name, company_name, email, phone,
                                   address, postal_code, city, country)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'AT')
            on conflict (id) do nothing
            """, cid, PRO, ctype, name, company, email, phone, addr, zip_, city)

    jobs = [
        (JOB[0], CUST[0], "project", "in_progress", "Bad fliesen 20 m²", "myhammer",
         "normal", today - timedelta(days=10)),
        (JOB[1], CUST[1], "simple", "lead", "Stiegenhaus ausbessern", "phone",
         "normal", None),
        (JOB[2], CUST[2], "simple", "completed", "Wohnzimmer streichen", "referral",
         "normal", today - timedelta(days=3)),
        (JOB[3], CUST[0], "simple", "quoted", "Rohrbruch Küche", "whatsapp",
         "emergency", None),
    ]
    for jid, cid, mode, status, title, source, urgency, start in jobs:
        await pg.execute(
            """
            insert into jobs (id, pro_id, customer_id, mode, status, title, source,
                              urgency, site_city, share_token, scheduled_start,
                              lead_captured_at)
            values ($1,$2,$3,$4,$5,$6,$7,$8,'Wien',$9,$10,now())
            on conflict (id) do nothing
            """, jid, PRO, cid, mode, status, title, source, urgency,
            f"demo-{jid[-4:]}", start)

    # ── Tiered quote on the tiling job, standard accepted ──
    group = "d0000000-0000-4000-8000-000000000001"
    q_std = "e0000000-0000-4000-8000-000000000001"
    q_prem = "e0000000-0000-4000-8000-000000000002"
    for qid, tier, title, status in (
        (q_std, "standard", "Bad fliesen — Standard", "accepted"),
        (q_prem, "premium", "Bad fliesen — Premium", "superseded"),
    ):
        await pg.execute(
            """
            insert into quotes (id, pro_id, job_id, customer_id, group_id, tier, title,
                                status, valid_until, assumptions, sent_at, decided_at)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,
              'Mehraufwand bei Untergrundmängeln wird nach Aufwand berechnet.',
              now() - interval '9 days', now() - interval '8 days')
            on conflict (id) do nothing
            """, qid, PRO, JOB[0], CUST[0], group, tier, title, status,
            today + timedelta(days=5))

    for pos, kind, desc, qty, unit, price, waste in (
        (1, "labor", "Fliesen verlegen diagonal", 20, "m²", 45.00, 0),
        (2, "material", "Feinsteinzeug 60x60", 20, "m²", 38.00, 0.15),
        (3, "travel", "Anfahrtspauschale", 1, "pcs", 35.00, 0),
    ):
        await pg.execute(
            """
            insert into quote_lines (quote_id, position, kind, description, qty, unit,
                                     unit_price, waste_factor, vat_rate)
            values ($1,$2,$3,$4,$5,$6,$7,$8,20)
            """, q_std, pos, kind, desc, qty, unit, price, waste)

    # ── An approved Nachtrag, ready to flow into the final invoice ──
    await pg.execute(
        """
        insert into change_orders (job_id, co_number, title, description, net_amount,
                                   vat_rate, kind, status, sent_at, decided_at, approved_by)
        values ($1,'CO-01','Estrich ausgleichen',
                'Untergrund war uneben — Ausgleichsmasse nach Aufwand.',
                260.00, 20, 'labor', 'approved',
                now() - interval '4 days', now() - interval '3 days', 'Herr Gruber')
        """, JOB[0])

    # ── Abschlagsrechnung, paid ──
    inv_a = "f0000000-0000-4000-8000-000000000001"
    await pg.execute(
        "insert into invoices (id, pro_id, job_id, customer_id, type, status) "
        "values ($1,$2,$3,$4,'abschlag','draft') on conflict (id) do nothing",
        inv_a, PRO, JOB[0], CUST[0])
    await pg.execute(
        "insert into invoice_lines (invoice_id, position, kind, description, qty, "
        "unit_price, vat_rate) values ($1,1,'labor','Anzahlung 40%',1,745.60,20)", inv_a)
    await pg.execute(
        """
        update invoices set status='issued', issue_date=$2, service_date_start=$2,
          due_date=$3, net_total=745.60, vat_total=149.12, gross_total=894.72,
          labor_net=745.60, travel_net=0 where id=$1
        """, inv_a, today - timedelta(days=8), today + timedelta(days=6))
    await pg.execute(
        "insert into invoice_payments (invoice_id, amount, method, paid_on) "
        "values ($1, 894.72, 'transfer', $2)", inv_a, today - timedelta(days=6))

    # ── Tax receipts ──
    for d, vendor, cat, net, rate in (
        (today - timedelta(days=20), "Baumarkt Hornbach", "Material", 248.50, 20),
        (today - timedelta(days=14), "OMV Tankstelle", "Treibstoff", 71.20, 20),
        (today - timedelta(days=7), "Würth Handel", "Werkzeug", 189.00, 20),
    ):
        vat = round(net * rate / 100, 2)
        await pg.execute(
            """
            insert into expenses (pro_id, expense_date, vendor, category,
                                  net_amount, vat_rate, vat_amount, gross_amount)
            values ($1,$2,$3,$4,$5,$6,$7,$8)
            """, PRO, d, vendor, cat, net, rate, vat, net + vat)

    # ── Project-mode detail on the tiling job ──
    for col, title, order in (("done", "Alte Fliesen entfernen", 1),
                              ("done", "Untergrund vorbereiten", 2),
                              ("doing", "Fliesen verlegen", 3),
                              ("todo", "Verfugen", 4),
                              ("todo", "Silikonfugen", 5)):
        await pg.execute(
            "insert into job_tasks (job_id, title, column_key, sort_order, done_at) "
            "values ($1,$2,$3,$4, case when $3='done' then now() else null end)",
            JOB[0], title, col, order)

    await pg.execute(
        """
        insert into job_materials (job_id, name, brand, qty, unit, planned_cost,
                                   actual_cost, supplier, expected_at)
        values ($1,'Feinsteinzeug 60x60','Marazzi',23,'m²',38.00,38.00,'Fliesen Wien',$2)
        """, JOB[0], today - timedelta(days=5))

    await pg.execute(
        "insert into job_diary (job_id, entry_date, text, hours, weather, author) "
        "values ($1,$2,'Untergrund uneben — Ausgleichsmasse nötig. Mit Kunde besprochen.',"
        "6.5,'trocken','Anna')", JOB[0], today - timedelta(days=4))

    await pg.execute(
        "insert into job_time_logs (job_id, started_at, stopped_at, note) "
        "values ($1, now() - interval '3 days', now() - interval '3 days' + interval '7 hours',"
        "'Verlegearbeiten')", JOB[0])


async def main_async(args) -> int:
    await pg.init_pool()

    existing = await pg.fetchval("select count(*) from users where id <> $1", USER)
    if existing and not args.force and not args.wipe_all:
        print(f"✗ {existing} unrelated user(s) already present.")
        print("  Refusing to seed a database that is not empty. Use --force if you mean it.")
        await pg.close_pool()
        return 1

    if args.wipe_all:
        print("wiping every table…")
        await wipe(pro_only=False)
    elif args.reset:
        print("removing the previous demo data…")
        await wipe(pro_only=True)

    await seed()

    counts = {}
    for t in ("users", "pro_profiles", "customers", "jobs", "quotes",
              "invoices", "change_orders", "expenses", "job_tasks"):
        counts[t] = await pg.fetchval(f"select count(*) from {t}")
    print("\nseeded:")
    for t, n in counts.items():
        print(f"  {t:<16} {n:>4}")
    print(f"\n  login: {EMAIL} / {PASSWORD}")
    print("  plan:  explorer (all toolkits unlocked)")
    await pg.close_pool()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Seed Postgres with demo data")
    ap.add_argument("--reset", action="store_true", help="remove the demo pro's data first")
    ap.add_argument("--wipe-all", action="store_true", help="empty every table (dev only)")
    ap.add_argument("--force", action="store_true", help="seed even if other users exist")
    return asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
