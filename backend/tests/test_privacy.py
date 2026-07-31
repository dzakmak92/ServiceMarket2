"""Data-subject rights — the parts that can be checked without a database.

The scenario behind the SQL assertions here was run against the real Supabase
schema in a rolled-back transaction: a business with one issued invoice, one
invoiced job, one uninvoiced job, one customer and one time log, put through
the whole purge. What survived was the invoice, the customer it names and the
job it bills. What went was everything else, including the email address.

That is the shape the law requires and it is the shape most implementations
get wrong in one of two directions — deleting the invoices, which breaks
§ 132 BAO, or deleting nothing and setting a flag, which tells the user their
data is gone while it sits there.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from repositories import privacy as P  # noqa: E402

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


print("── the export names every table, and reviews them ──")
# Discovered-at-runtime would be worse in both directions: a table added later
# and silently exported may disclose something nobody reviewed, and one
# silently missed is a failed Art. 15 response.
names = [n for n, _ in P.EXPORT_BY_USER + P.EXPORT_BY_PRO]
check(len(names) == len(set(names)), "no section is exported twice")
check(len(names) >= 25, f"{len(names)} sections")
for must in ("account", "invoices", "customers", "quotes", "expenses",
             "consent_history", "job_diary", "estimates", "rates"):
    check(must in names, f"{must} is in the export")

print("\n── secrets never leave, whatever the table holds ──")
check("password_hash" in P.REDACT, "password hashes are redacted")
for t in ("token", "sub_token", "share_token"):
    check(t in P.REDACT, f"{t} is redacted")
# The queries that select * must be covered by REDACT rather than by hope.
star = [n for n, sql in P.EXPORT_BY_USER + P.EXPORT_BY_PRO if "select *" in sql]
check("account" in star, "the account row is a select *, so REDACT is what protects it")
redacted = P._clean([{"id": 1, "email": "a@b.c", "password_hash": "$2b$xx",
                      "token": "secret", "name": "Ada"}])
check("password_hash" not in redacted[0] and "token" not in redacted[0],
      "and it does the redacting")
check(redacted[0]["email"] == "a@b.c", "while keeping what the person asked for")

print("\n── documents are listed, not attached ──")
docs = dict(P.EXPORT_BY_PRO)["job_documents"]
check("storage_ref" not in docs,
      "the storage key is not exported — it is a capability, not information")
check("filename" in docs and "caption" in docs,
      "but the filename and caption are, so the person knows what exists")

print("\n── retention is stated as data, not buried in code ──")
# The disclosure to the user and the behaviour of the purge read the same
# table, so they cannot drift apart.
check(len(P.RETENTION) >= 3, f"{len(P.RETENTION)} retention rules")
for rule in P.RETENTION:
    check(rule["years"] in (7, 10), f"{rule['what']}: {rule['years']} years")
    check(rule["basis_at"].startswith("§") and rule["basis_de"].startswith("§"),
          f"{rule['what']} cites a paragraph for both countries")
    check(len(rule["de"]) > 20, f"{rule['what']} has German text for the user")
check(any("14b UStG" in r["basis_at"] for r in P.RETENTION),
      "the ten-year invoice-copy duty is § 14b UStG")
check(any("132 BAO" in r["basis_at"] for r in P.RETENTION), "AT cites § 132 BAO")
check(any("147 AO" in r["basis_de"] for r in P.RETENTION), "DE cites § 147 AO")

print("\n── the purge keeps what the law requires and drops the rest ──")
sql = " ".join(P.PURGE_BY_PRO)
check("delete from invoices" not in sql, "invoices are never deleted")
check("delete from invoice_lines" not in sql, "nor their positions")
check("delete from invoice_payments" not in sql, "nor the payments against them")
check("delete from expenses" not in sql, "nor the expense receipts behind the EÜR")
# Jobs and customers go only where nothing bills them. An invoice whose
# customer row was deleted is not a record anyone can defend to a tax office.
jobs_stmt = next(s for s in P.PURGE_BY_PRO if s.strip().startswith("delete from jobs"))
cust_stmt = next(s for s in P.PURGE_BY_PRO if s.strip().startswith("delete from customers"))
check("not exists" in jobs_stmt and "invoices" in jobs_stmt,
      "jobs go only where no invoice references them")
check("not exists" in cust_stmt and "invoices" in cust_stmt,
      "customers likewise")
for gone in ("job_diary", "job_time_logs", "job_documents", "job_materials",
             "job_tasks", "quotes", "pro_rates", "pro_calibration",
             "job_estimates", "accountant_shares"):
    check(gone in sql, f"{gone} is purged")

print("\n── the account row is anonymised, not dropped ──")
# Deleting it would cascade into the invoices the law says to keep.
import inspect  # noqa: E402

purge_src = inspect.getsource(P.purge_due)
check("delete from users" not in purge_src, "the user row is never deleted")
check("update users set" in purge_src and "deleted_at = now()" in purge_src,
      "it is anonymised and marked deleted")
for field in ("password_hash", "phone", "address", "given_name", "family_name"):
    check(field in purge_src, f"{field} is cleared")
check("geloescht+" in purge_src,
      "and the email becomes an unroutable placeholder, so the unique index "
      "still holds and nobody is contactable through it")

print("\n── the grace period can actually be used ──")
# The first version set deleted_at on request. auth.load_user filters on it,
# so the user would have been locked out of the account they might want to
# keep, with no way back in to cancel.
req_src = inspect.getsource(P.request_deletion)
check("deleted_at = now()" not in req_src,
      "requesting deletion does not mark the row deleted")
check("deletion_scheduled_for" in req_src, "it sets the schedule instead")
auth_src = (Path(__file__).resolve().parent.parent / "auth.py").read_text()
check("deleted_at is null" in auth_src,
      "because load_user filters deleted_at — which is why the above matters")
cancel_src = inspect.getsource(P.cancel_deletion)
check("deletion_scheduled_for > now()" in cancel_src,
      "cancelling works only while the period is still open")
check("deleted_at is null" in cancel_src,
      "and never resurrects an account the purge already ran on")
check(1 <= P.DELETE_GRACE_DAYS <= 30,
      f"the grace period is {P.DELETE_GRACE_DAYS} days — inside the month "
      f"Art. 12(3) allows to act")

print("\n── the purge is safe to run twice ──")
check("deleted_at is null" in purge_src,
      "it only picks up accounts it has not already done")
check("deletion_scheduled_for <= now()" in purge_src,
      "and only ones whose period has expired")
check("limit" in purge_src, "batched, so one enormous account cannot time out the rest")

print("\n── consent is append-only ──")
consent_src = inspect.getsource(P.record_consent)
check("insert into consent_records" in consent_src, "every change is an insert")
check("update consent_records" not in consent_src, "records are never edited")
check("policy_version" in consent_src,
      "and each carries the version of the text that was agreed to")

print("\n── the request register carries the statutory deadline ──")
mig = (Path(__file__).resolve().parent.parent / "db" / "migrations"
       / "015_dsgvo.sql").read_text()
check("interval '30 days'" in mig, "one month, per Art. 12(3)")
check("due_at" in mig and "default" in mig,
      "stored rather than derived, so it cannot move when the code changes")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
for f in fails:
    print("  ·", f)
sys.exit(1 if fails else 0)
