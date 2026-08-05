"""The seam between the frontend and the API it actually reaches.

This exists because an audit found 120 of 173 endpoints the UI calls were not
mounted in production, and because the two bugs behind that audit were both
silent: the Kanban board sent `column` at an API expecting `column_key`, and
every file upload posted to `/api/uploads/file` at an API serving
`/api/uploads`. Neither produced an error anywhere. The board looked like it
worked and moved nothing; the uploader looked like it worked and stored
nothing.

Nothing in the type system spans this seam — the frontend is JavaScript, the
API is Python, and Pydantic drops unknown fields without complaint. So the
seam gets a test.

Two things are checked.

**Every path the frontend calls resolves to a mounted route.** Anything that
should not — a marketplace remnant, a feature parked behind a later phase —
must be listed in EXPECTED_MISSING with a reason. That makes the gap a
decision somebody wrote down rather than a surprise a user finds.

**The mounted set does not shrink silently.** A route removed from the API
while the UI still calls it fails here rather than in production.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


# ── What the API serves ────────────────────────────────────────────────
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("vercel_entry", ROOT / "api" / "index.py")
entry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)

_PARAM = re.compile(r"\{[^}]+\}")
mounted = {_PARAM.sub("{}", getattr(r, "path", "")) for r in entry.app.routes}


# ── What the frontend calls ────────────────────────────────────────────
CALL = re.compile(r"""api\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)""")
_INTERP = re.compile(r"\$\{[^}]*\}")

calls: dict[str, set[str]] = {}
for f in (ROOT / "frontend" / "src").rglob("*.js*"):
    for m in CALL.finditer(f.read_text(encoding="utf-8")):
        url = _INTERP.sub("{}", m.group(2).split("?")[0].rstrip("/"))
        if url.startswith("/api"):
            calls.setdefault(url, set()).add(str(f.relative_to(ROOT / "frontend" / "src")))

# Paths built by concatenation, where the literal in the source is a prefix
# and the real path is decided at runtime. Checking these would test the
# regex, not the seam.
DYNAMIC_TAIL = {
    "/api/quotes/{}/{}",            # act(id, 'send'|'accept'|'reject')
    "/api/portal/{}/change-orders/{}/{}",   # …/approve | …/reject
    "/api/invoices/stats{}",        # a query string, not a segment
}

# Deliberately absent, each with the reason it is absent. A gap that is a
# decision belongs here; a gap that is a bug belongs in the failure list.
EXPECTED_MISSING = {
    # ── The marketplace, removed by the migration ──────────────────────
    **{p: "marketplace removed" for p in calls
       if p.startswith(("/api/admin/", "/api/directory/", "/api/bookings",
                        "/api/availability", "/api/feedback"))},
    # ── Phase 8: the payment rail is deliberately last ─────────────────
    # Narrow on purpose. A blanket "/payments" match also swallowed
    # /api/invoices/{}/payments, which exists and works — recording a
    # manual bank transfer against an invoice needs no PSP. The rot check
    # below is what caught that.
    **{p: "payments deferred to phase 8" for p in calls
       if p.startswith(("/api/billing/", "/api/pay-link/", "/api/payouts"))
       or "/jobs/" in p and "/payments" in p
       or "/portal/" in p and "/payments" in p},
    # ── Not yet ported, each still on the list ─────────────────────────
    "/api/notifications": "notifications not ported",
    "/api/notifications/read-all": "notifications not ported",
    "/api/notifications/{}/read": "notifications not ported",
    "/api/push/subscribe": "web push not ported",
    "/api/push/unsubscribe": "web push not ported",
    "/api/push/test": "web push not ported",
    "/api/push/public-key": "web push not ported",
    "/api/profile/pro/portfolio": "portfolio not ported",
    "/api/profile/pro/portfolio/{}": "portfolio not ported",
    "/api/analytics/pro-insights": "analytics not ported",
    "/api/invoices/templates/list": "template picker not ported",
    # Nachtrag→invoice needed no endpoint of its own in the end:
    # POST /jobs/{id}/draft-invoice already inherits every approved change
    # order and flips it to `invoiced`, so the rewritten editor gets it for
    # free and nothing calls a separate path any more.
}

print("── every endpoint the UI calls is either mounted or a written-down gap ──")
unexplained = []
for url, files in sorted(calls.items()):
    if url in DYNAMIC_TAIL or _PARAM.sub("{}", url) in mounted:
        continue
    if url in EXPECTED_MISSING:
        continue
    unexplained.append(f"{url}  ← {', '.join(sorted(files))}")

check(not unexplained,
      f"{len(unexplained)} unexplained 404(s)"
      + ("".join("\n         " + u for u in unexplained) if unexplained else ""))

print("\n── the endpoints this audit was written for ──")
# Each of these was a live, silent failure. Named individually so a
# regression says which one rather than only that the count changed.
for path, what in [
    ("/api/uploads", "file upload"),
    ("/api/uploads/file", "file upload, legacy path still honoured"),
    ("/api/uploads/signed", "signed download"),
    ("/api/profile", "account and notification settings"),
    ("/api/pm/public/sub/{}", "sub-contractor portal"),
    ("/api/pm/public/sub/{}/diary", "sub-contractor diary"),
    ("/api/pm/public/sub/{}/tasks/{}", "sub-contractor task move"),
    ("/api/pm/templates", "project templates"),
    ("/api/pm/barcode-lookup", "barcode lookup"),
    ("/api/jobs/{}/sub-invite", "sub-contractor invite"),
    ("/api/jobs/{}/export-pdf", "Job File export"),
    ("/api/estimate", "estimation"),
    ("/api/estimate/accuracy", "estimate accuracy"),
    ("/api/tax/receipts", "receipts, under the name the UI uses"),
    ("/api/tax/mileage", "Fahrtenbuch"),
    ("/api/tax/svs", "SVS estimate"),
    ("/api/tax/income-tax", "Einkommensteuer estimate"),
    ("/api/tax/exports/revenue.csv", "revenue export"),
    ("/api/tax/exports/expenses.csv", "expense export"),
    ("/api/tax/exports/datev-full.csv", "DATEV export"),
    ("/api/tax/year-end.pdf", "year-end dossier"),
    ("/api/tax/accountant-share", "accountant link"),
    ("/api/tax/public/accountant/{}", "what the accountant sees"),
    ("/api/me/export", "Art. 15 / 20 data export"),
    ("/api/me", "Art. 17 erasure"),
    ("/api/me/cancel-deletion", "undoing it inside the grace period"),
    ("/api/me/deletion", "what erasure would and would not delete"),
    ("/api/me/consent", "Art. 7 consent trail"),
    ("/api/me/marketing-prefs", "Art. 7(3) withdrawal"),
    ("/api/privacy/data-rights-request", "Art. 12-22 request register"),
    ("/api/privacy/removal-request", "Art. 21 objection"),
]:
    check(path in mounted, f"{what}: {path}")

print("\n── the exemption list does not rot ──")
# An entry that names a route which now exists is a lie the next reader
# believes. Porting something must delete its exemption, and this is what
# makes that mandatory rather than tidy.
stale = sorted(p for p in EXPECTED_MISSING if _PARAM.sub("{}", p) in mounted)
check(not stale, f"{len(stale)} exemption(s) for endpoints that now exist: {stale}")
# And an exemption for a path nobody calls any more is dead weight.
orphan = sorted(p for p in EXPECTED_MISSING if p not in calls)
check(not orphan, f"{len(orphan)} exemption(s) for endpoints nobody calls: {orphan}")

print("\n── field names agree across the seam ──")
# The Kanban bug: Pydantic drops unknown fields silently, so a frontend
# sending the wrong name gets a 200 and no effect. These are the names the
# Postgres schema actually uses.
board = (ROOT / "frontend" / "src" / "pages" / "pro" / "pm").glob("*.jsx")
sub = ROOT / "frontend" / "src" / "pages" / "SubContractorPage.jsx"
for f in list(board) + [sub]:
    src = f.read_text(encoding="utf-8")
    stale = [n for n in ("tk.column ", "tk.column)", "task.column ", "task.column)",
                         "{ column:", "a.order ", ".order ??")
             if n in src]
    check(not stale, f"{f.name} uses the API's field names ({stale or 'clean'})")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S)"))
for f in fails:
    print("  ·", f)
sys.exit(1 if fails else 0)
