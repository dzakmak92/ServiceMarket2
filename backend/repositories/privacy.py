"""Data-subject rights against the Postgres spine.

Three jobs: hand somebody everything held about them, record what they
consented to, and delete what can lawfully be deleted.

The third is the one with a real decision in it.

**Erasure and retention are both legal obligations and they contradict each
other.** A tradesperson's issued invoices must be kept seven years (§ 132 BAO
in AT, § 147 AO in DE) and the invoice copies ten (§ 14b UStG). Art. 17(3)(b)
exempts precisely that processing, so "delete my account" cannot mean "delete
the invoices".

There are three ways to implement that and two of them are wrong. Deleting
everything breaks the law the user is still subject to. Deleting nothing and
setting a flag — which is what the previous implementation did — tells the
user their data is gone while it sits there, and a user who believes that
stops watching. What is left is to delete what can go, keep what must stay,
and say exactly which is which. That is what `plan_deletion` returns and what
the user is shown.

**The pro is not the only data subject here.** This app is single-sided: the
account holder is the tradesperson. But their customers' names and addresses
are on every invoice, and for that data the tradesperson is the controller and
this app the processor. A pro's erasure request cannot erase their customers'
invoices, and the export must not pretend the customer rows are the pro's own
personal data to take away — they are business records that happen to contain
someone else's.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from db import pg

logger = logging.getLogger(__name__)

# Bump when the policy text changes; users are then asked to accept again.
CURRENT_POLICY_VERSION = "1.0-2026-02-28"

# Long enough to undo a misclick at eleven at night, short enough that the
# right to erasure is not theoretical. Art. 12(3) allows a month to *act*; this
# is a grace period inside that, not an extension of it.
DELETE_GRACE_DAYS = 7

# What the law requires be kept, and for how long from the end of the year the
# record belongs to. Stated as data so the disclosure to the user and the
# behaviour of the deletion job cannot drift apart.
RETENTION = [
    {"what": "invoices", "table": "invoices", "years": 7,
     "basis_at": "§ 132 BAO", "basis_de": "§ 147 AO",
     "de": "Ausgestellte Rechnungen samt Positionen und Zahlungen "
           "(Aufbewahrungspflicht 7 Jahre)"},
    {"what": "invoice_copies", "table": "invoices", "years": 10,
     "basis_at": "§ 14b UStG", "basis_de": "§ 14b UStG",
     "de": "Rechnungsdoppel zur Umsatzsteuer (Aufbewahrungspflicht 10 Jahre)"},
    {"what": "expenses", "table": "expenses", "years": 7,
     "basis_at": "§ 132 BAO", "basis_de": "§ 147 AO",
     "de": "Belege und Ausgaben (Aufbewahrungspflicht 7 Jahre)"},
]


# ── Consent ────────────────────────────────────────────────────────────
async def record_consent(user_id: str, *, kind: str = "consent",
                         cookies_analytics: bool = False,
                         cookies_marketing: bool = False,
                         marketing_emails: bool = False,
                         policy_version: Optional[str] = None,
                         ip: Optional[str] = None,
                         user_agent: Optional[str] = None,
                         detail: Optional[dict] = None) -> dict:
    """Append one record. Never updates: the history is the evidence.

    The marketing flag is mirrored onto `users` so the send path does not have
    to reconstruct consent from a log every time it wants to know. The log
    stays authoritative — the mirror is a cache, and if they ever disagree the
    log is what a regulator reads.
    """
    async with pg.transaction() as con:
        row = await con.fetchrow(
            """
            insert into consent_records
                   (user_id, kind, cookies_analytics, cookies_marketing,
                    marketing_emails, policy_version, ip, user_agent, detail)
            values ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9) returning *
            """,
            user_id, kind, cookies_analytics, cookies_marketing,
            marketing_emails, policy_version or CURRENT_POLICY_VERSION,
            ip or None, (user_agent or "")[:400], json.dumps(detail or {}))
        if kind in ("consent", "marketing_change"):
            await con.execute(
                "update users set notif_email_marketing = $2, "
                "policy_version_accepted = $3, policy_accepted_at = now(), "
                "updated_at = now() where id = $1",
                user_id, marketing_emails, policy_version or CURRENT_POLICY_VERSION)
    return dict(row)


async def latest_consent(user_id: str) -> Optional[dict]:
    return await pg.fetchrow(
        "select * from consent_records where user_id = $1 and kind = 'consent' "
        "order by recorded_at desc limit 1", user_id)


async def consent_history(user_id: str, limit: int = 200) -> list[dict]:
    return await pg.fetch(
        "select * from consent_records where user_id = $1 "
        "order by recorded_at desc limit $2", user_id, limit)


# ── Export ─────────────────────────────────────────────────────────────
# Every table holding something about this account, and how to reach it.
# Written out rather than discovered, so a table added later is absent from
# the export until somebody decides what it is — an export that silently
# misses a table is a failed Art. 15 response, and one that silently includes
# a new one may disclose something nobody reviewed.
EXPORT_BY_USER = [
    ("account", "select * from users where id = $1"),
    ("consent_history", "select * from consent_records where user_id = $1 "
                        "order by recorded_at desc"),
    ("notifications", "select * from notifications where user_id = $1 "
                      "order by created_at desc"),
    ("push_subscriptions", "select endpoint, created_at from push_subscriptions "
                           "where user_id = $1"),
]

EXPORT_BY_PRO = [
    ("business_profile", "select * from pro_profiles where id = $1"),
    ("customers", "select * from customers where pro_id = $1"),
    ("jobs", "select * from jobs where pro_id = $1"),
    ("quotes", "select * from quotes where pro_id = $1"),
    ("quote_lines", "select l.* from quote_lines l join quotes q on q.id = l.quote_id "
                    "where q.pro_id = $1"),
    ("invoices", "select * from invoices where pro_id = $1"),
    ("invoice_lines", "select l.* from invoice_lines l join invoices i on i.id = l.invoice_id "
                      "where i.pro_id = $1"),
    ("invoice_payments", "select p.* from invoice_payments p join invoices i on i.id = p.invoice_id "
                         "where i.pro_id = $1"),
    ("expenses", "select * from expenses where pro_id = $1"),
    ("job_tasks", "select t.* from job_tasks t join jobs j on j.id = t.job_id where j.pro_id = $1"),
    ("job_materials", "select m.* from job_materials m join jobs j on j.id = m.job_id where j.pro_id = $1"),
    ("job_diary", "select d.* from job_diary d join jobs j on j.id = d.job_id where j.pro_id = $1"),
    ("job_time_logs", "select l.* from job_time_logs l join jobs j on j.id = l.job_id where j.pro_id = $1"),
    ("job_documents", "select d.id, d.job_id, d.kind, d.filename, d.caption, d.created_at "
                      "from job_documents d join jobs j on j.id = d.job_id where j.pro_id = $1"),
    ("change_orders", "select c.* from change_orders c join jobs j on j.id = c.job_id where j.pro_id = $1"),
    ("recurring_contracts", "select * from recurring_contracts where pro_id = $1"),
    ("quote_templates", "select * from quote_templates where pro_id = $1"),
    ("project_templates", "select * from project_templates where pro_id = $1"),
    ("rates", "select * from pro_rates where pro_id = $1"),
    ("rate_samples", "select * from pro_rate_samples where pro_id = $1"),
    ("estimates", "select * from job_estimates where pro_id = $1"),
    ("calibration", "select * from pro_calibration where pro_id = $1"),
    ("accountant_shares", "select id, label, year, created_at, revoked_at "
                          "from accountant_shares where pro_id = $1"),
]

# Never exported, whatever the table holds.
REDACT = {"password_hash", "token", "sub_token", "share_token"}


def _clean(rows: list) -> list[dict]:
    out = []
    for r in rows:
        d = {k: v for k, v in dict(r).items() if k not in REDACT}
        out.append(d)
    return out


async def export(user: dict) -> dict:
    """Everything held about this account, as structured data.

    Art. 20 wants a "structured, commonly used and machine-readable format",
    which is JSON. Art. 15 wants completeness, which is why the table list is
    written out and reviewed rather than discovered at runtime.
    """
    user_id = str(user["id"])
    data: dict[str, Any] = {}
    for name, sql in EXPORT_BY_USER:
        data[name] = _clean(await pg.fetch(sql, user_id))

    pro_id = await pg.fetchval(
        "select id from pro_profiles where user_id = $1", user_id)
    if pro_id:
        for name, sql in EXPORT_BY_PRO:
            data[name] = _clean(await pg.fetch(sql, str(pro_id)))

    # The account row comes back as a list of one; flatten it, because a
    # person opening this file is looking for their own details, not a table.
    if data.get("account"):
        data["account"] = data["account"][0]
    if data.get("business_profile"):
        data["business_profile"] = data["business_profile"][0]

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "exported_for": user.get("email"),
        "policy_version": CURRENT_POLICY_VERSION,
        "legal_basis": "DSGVO Art. 15 (Auskunft) und Art. 20 (Datenübertragbarkeit)",
        # Said plainly, because it is the part people misread. Customer rows
        # appear here because the business holds them, not because they are
        # the account holder's own personal data to take elsewhere.
        "note": ("Enthält auch Geschäftsdaten Ihres Betriebs, einschließlich "
                 "personenbezogener Daten Ihrer Kundinnen und Kunden. Für "
                 "diese sind Sie selbst Verantwortlicher im Sinne der DSGVO; "
                 "sie sind hier enthalten, weil Ihr Betrieb sie führt."),
        "data": data,
    }


# ── Erasure ────────────────────────────────────────────────────────────
async def plan_deletion(user_id: str) -> dict:
    """What would go, what must stay, and until when.

    Computed before anything is scheduled and shown to the user, because a
    retention they were not told about is one they find out about by accident.
    """
    pro_id = await pg.fetchval(
        "select id from pro_profiles where user_id = $1", user_id)

    retained = []
    if pro_id:
        country = await pg.fetchval(
            "select invoice_country from pro_profiles where id = $1", pro_id) or "AT"
        for rule in RETENTION:
            if rule["table"] == "invoices":
                row = await pg.fetchrow(
                    "select count(*) as n, max(issue_date) as newest from invoices "
                    "where pro_id = $1 and status <> 'draft'", pro_id)
            else:
                row = await pg.fetchrow(
                    "select count(*) as n, max(expense_date) as newest from expenses "
                    "where pro_id = $1", pro_id)
            if not row or not row["n"]:
                continue
            # The clock runs from the end of the calendar year the record
            # belongs to, not from its own date — which is why a January
            # invoice and a December one expire together.
            newest: date = row["newest"]
            until = date(newest.year + rule["years"], 12, 31)
            retained.append({
                "what": rule["what"],
                "count": int(row["n"]),
                "until": until.isoformat(),
                "basis": rule["basis_de"] if country == "DE" else rule["basis_at"],
                "de": rule["de"],
            })

    return {
        "grace_days": DELETE_GRACE_DAYS,
        "deletes": [
            "Zugangsdaten und Anmeldung",
            "Profil, Einstellungen und Benachrichtigungen",
            "Angebote, Aufträge, Fotos, Bautagebuch und Zeiterfassung",
            "Gelernte Sätze, Schätzungen und Kalibrierung",
            "Kundendaten ohne Rechnungsbezug",
        ],
        "retained": retained,
        "retained_note": (
            "Diese Unterlagen bleiben aufgrund gesetzlicher "
            "Aufbewahrungspflichten erhalten (DSGVO Art. 17 Abs. 3 lit. b). "
            "Sie werden nach Ablauf der Frist automatisch gelöscht und in der "
            "Zwischenzeit nicht mehr für den Betrieb der App verwendet."
            if retained else
            "Es bestehen keine gesetzlichen Aufbewahrungspflichten für Ihr "
            "Konto; es wird vollständig gelöscht."),
    }


async def request_deletion(user_id: str, *, ip: Optional[str] = None) -> dict:
    """Schedule erasure and disclose what will survive it.

    Deliberately does NOT set `deleted_at`. The first version did, on the
    reasoning that an immediate lock makes the restriction real — and it would
    have made the grace period unusable, because `auth.load_user` filters
    `deleted_at is null`. The user would have been logged out of the account
    they might want to keep, with no way back in to say so.

    A grace period exists to be undone. Locking the door on the way out
    defeats the only thing it is for. `deletion_scheduled_for` marks the
    account; `deleted_at` is set by `purge_due` when the period actually
    expires.
    """
    plan = await plan_deletion(user_id)
    scheduled = datetime.now(timezone.utc) + timedelta(days=DELETE_GRACE_DAYS)

    async with pg.transaction() as con:
        await con.execute(
            "update users set deletion_requested_at = now(), "
            "deletion_scheduled_for = $2, deletion_retained = $3, "
            "updated_at = now() where id = $1",
            user_id, scheduled, json.dumps(plan["retained"]))
        await con.execute(
            "insert into consent_records (user_id, kind, ip, detail) "
            "values ($1, 'deletion_requested', $2::inet, $3)",
            user_id, ip or None, json.dumps({"scheduled_for": scheduled.isoformat(),
                                             "retained": plan["retained"]}))
    return {"scheduled_for": scheduled.isoformat(), **plan}


async def cancel_deletion(user_id: str) -> bool:
    row = await pg.fetchrow(
        "update users set deletion_requested_at = null, "
        "deletion_scheduled_for = null, deletion_retained = null, "
        "updated_at = now() "
        "where id = $1 and deletion_scheduled_for is not null "
        "and deletion_scheduled_for > now() and deleted_at is null returning id",
        user_id)
    if row:
        await pg.execute(
            "insert into consent_records (user_id, kind) values ($1, 'deletion_cancelled')",
            user_id)
    return bool(row)


async def deletion_status(user_id: str) -> Optional[dict]:
    row = await pg.fetchrow(
        "select deletion_requested_at, deletion_scheduled_for, deletion_retained "
        "from users where id = $1", user_id)
    if not row or not row["deletion_scheduled_for"]:
        return None
    retained = row["deletion_retained"]
    if isinstance(retained, str):
        retained = json.loads(retained)
    return {"requested_at": row["deletion_requested_at"],
            "scheduled_for": row["deletion_scheduled_for"],
            "retained": retained or []}


# ── Requests from people without an account ────────────────────────────
async def log_request(**fields) -> dict:
    cols = [k for k, v in fields.items() if v is not None]
    vals = [fields[k] for k in cols]
    placeholders = ", ".join(
        f"${i + 1}::inet" if c == "ip" else f"${i + 1}" for i, c in enumerate(cols))
    return await pg.fetchrow(
        f"insert into data_rights_requests ({', '.join(cols)}) "
        f"values ({placeholders}) returning *", *vals)


# ── Executing the deletion ─────────────────────────────────────────────
# Ordered so a foreign key never blocks the row in front of it, and so the
# things a person would most want gone go first: if this is interrupted
# halfway, what survives should be the paperwork, not the photographs.
PURGE_BY_PRO = [
    "delete from pro_rate_samples where pro_id = $1",
    "delete from pro_rates where pro_id = $1",
    "delete from pro_calibration where pro_id = $1",
    "delete from job_estimates where pro_id = $1",
    "delete from accountant_shares where pro_id = $1",
    "delete from project_templates where pro_id = $1",
    "delete from quote_templates where pro_id = $1",
    "delete from job_documents d using jobs j where j.id = d.job_id and j.pro_id = $1",
    "delete from job_diary d using jobs j where j.id = d.job_id and j.pro_id = $1",
    "delete from job_time_logs l using jobs j where j.id = l.job_id and j.pro_id = $1",
    "delete from job_materials m using jobs j where j.id = m.job_id and j.pro_id = $1",
    "delete from job_tasks t using jobs j where j.id = t.job_id and j.pro_id = $1",
    "delete from change_orders c using jobs j where j.id = c.job_id and j.pro_id = $1",
    "delete from quotes where pro_id = $1",
    "delete from recurring_contracts where pro_id = $1",
    # Jobs and customers only where no invoice depends on them. An invoice
    # without its customer is not a record anyone can defend to a tax office.
    """delete from jobs j where j.pro_id = $1
         and not exists (select 1 from invoices i where i.job_id = j.id)""",
    """delete from customers c where c.pro_id = $1
         and not exists (select 1 from invoices i where i.customer_id = c.id)""",
]


async def purge_due(*, limit: int = 50) -> dict:
    """Carry out every deletion whose grace period has expired.

    Invoices, their lines and payments, the expenses behind them and the
    customers and jobs they reference are left alone: § 132 BAO and § 14b UStG
    require them, and Art. 17(3)(b) is what makes keeping them lawful. The
    account row is anonymised rather than removed, because deleting it would
    cascade into exactly those invoices.

    Idempotent. A cron that fires twice, or a retry after a timeout, finds
    nothing left to do on the second pass.
    """
    due = await pg.fetch(
        "select id, email from users "
        "where deletion_scheduled_for is not null and deletion_scheduled_for <= now() "
        "and deleted_at is null limit $1", limit)

    done = []
    for u in due:
        user_id = str(u["id"])
        pro_id = await pg.fetchval(
            "select id from pro_profiles where user_id = $1", user_id)
        async with pg.transaction() as con:
            if pro_id:
                for sql in PURGE_BY_PRO:
                    await con.execute(sql, str(pro_id))
                # The business profile keeps only what an invoice must show:
                # who issued it, from where, under which tax number.
                await con.execute(
                    """
                    update pro_profiles set
                        tagline = null, description = null, logo_file_id = null,
                        service_categories = '{}', service_areas = '{}',
                        languages_spoken = '{}', bank_iban = null, bank_bic = null,
                        bank_account_holder = null, bank_name = null,
                        service_center_lat = null, service_center_lng = null,
                        updated_at = now()
                     where id = $1
                    """, str(pro_id))
            await con.execute("delete from push_subscriptions where user_id = $1", user_id)
            await con.execute("delete from notifications where user_id = $1", user_id)
            # Anonymised, not deleted: the row is the anchor every retained
            # invoice hangs from. What is left cannot identify anybody.
            await con.execute(
                """
                update users set
                    email = 'geloescht+' || id::text || '@invalid',
                    password_hash = '', name = 'Gelöschtes Konto',
                    given_name = null, family_name = null, phone = null,
                    address = null, postal_code = null, city = null,
                    deleted_at = now(), updated_at = now()
                 where id = $1
                """, user_id)
        done.append(user_id)
        logger.info("account %s deleted after its grace period", user_id)

    return {"deleted": len(done), "user_ids": done}
