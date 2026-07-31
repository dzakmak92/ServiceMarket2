"""Tax toolkit endpoints (Postgres).

USt-VA, EÜR, DATEV, expenses — and, added when an audit found them 404ing in
production, the Fahrtenbuch, the SVS and Einkommensteuer estimates, the CSV
exports, the year-end PDF and the accountant share link.

Two things this is careful about.

**Receipts and expenses are the same table.** The UI has always called
/api/tax/receipts and the Postgres API served /api/tax/expenses, so the whole
receipt screen 404'd. Aliased rather than renamed, for the same reason as the
upload path: a browser holding the old bundle should not break.

**Every estimate says it is one.** SVS reconciles years later and income tax
depends on allowances this does not know about. A figure presented as final is
one a tradesperson budgets against and is then short of.
"""
from __future__ import annotations

from datetime import date, timedelta
from secrets import token_urlsafe
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from auth import get_current_user
from db import pg
from repositories import tax as repo
from routes._pro import require_pro_id
from services import tax_at

router = APIRouter(prefix="/tax", tags=["tax"])


class ExpenseIn(BaseModel):
    expense_date: Optional[date] = None
    vendor: Optional[str] = None
    category: str = "Sonstige"
    description: Optional[str] = None
    net_amount: Optional[float] = None
    gross_amount: Optional[float] = None
    vat_rate: float = 20
    payment_method: Optional[str] = Field(
        default=None, pattern="^(transfer|card|sepa|sofort|cash|other)$")
    # Input VAT is only reclaimable against a valid supplier invoice.
    vat_deductible: bool = True
    job_id: Optional[str] = None
    storage_ref: Optional[str] = None
    filename: Optional[str] = None
    ocr_confidence: Optional[float] = None


@router.get("/dashboard")
async def dashboard(year: int = Query(default=None), user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    return await repo.dashboard(pro_id, year or date.today().year)


@router.get("/ust-va")
async def ust_va(year: int, month: Optional[int] = Query(default=None, ge=1, le=12),
                 quarter: Optional[int] = Query(default=None, ge=1, le=4),
                 user: dict = Depends(get_current_user)):
    """Umsatzsteuer-Voranmeldung, computed from invoice LINES.

    The Mongo build inferred one rate per invoice; here a mixed invoice
    reports each band correctly and §13b turnover gets its own figure
    instead of being folded into the standard band.
    """
    pro_id = await require_pro_id(user)
    return await repo.ust_va(pro_id, year, month=month, quarter=quarter)


@router.get("/eur")
async def eur(year: int = Query(default=None), user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    return await repo.eur(pro_id, year or date.today().year)


@router.get("/exports/datev.csv")
async def datev(year: int = Query(default=None), user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    y = year or date.today().year
    csv_text = await repo.datev_csv(pro_id, y)
    return Response(
        content=csv_text.encode("utf-8-sig"),   # BOM: Excel/DATEV expect it
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="datev-{y}.csv"'},
    )


@router.get("/expenses")
async def list_expenses(year: Optional[int] = None, category: Optional[str] = None,
                        needs_review: Optional[bool] = None,
                        limit: int = Query(default=100, le=500), offset: int = 0,
                        user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    return await repo.list_expenses(pro_id, year=year, category=category,
                                    needs_review=needs_review, limit=limit, offset=offset)


@router.get("/expense-categories")
async def categories():
    return {"categories": repo.EXPENSE_CATEGORIES}


@router.post("/expenses", status_code=201)
async def create_expense(body: ExpenseIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    if not (body.net_amount or body.gross_amount):
        raise HTTPException(400, "Provide net_amount or gross_amount")
    return await repo.create_expense(pro_id, body.model_dump(exclude_none=True))


@router.patch("/expenses/{expense_id}")
async def update_expense(expense_id: str, body: ExpenseIn,
                         user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    row = await repo.update_expense(pro_id, expense_id, body.model_dump(exclude_none=True))
    if not row:
        raise HTTPException(404, "Expense not found")
    return row


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    if not await repo.delete_expense(pro_id, expense_id):
        raise HTTPException(404, "Expense not found")
    return {"deleted": True}


# ── Belege: the same table under the name the UI uses ──────────────────
router.add_api_route("/receipts", list_expenses, methods=["GET"])
router.add_api_route("/receipts", create_expense, methods=["POST"], status_code=201)
router.add_api_route("/receipts/{expense_id}", update_expense, methods=["PATCH"])
router.add_api_route("/receipts/{expense_id}", delete_expense, methods=["DELETE"])


# ── Fahrtenbuch ────────────────────────────────────────────────────────
@router.get("/mileage")
async def mileage(year: int = Query(default=None), user: dict = Depends(get_current_user)):
    """Travel billed on work finished this year.

    Derived from the Anfahrt positions on accepted quotes rather than from a
    separate log, because a separate log is a thing nobody fills in.
    """
    pro_id = await require_pro_id(user)
    return await repo.mileage(pro_id, year or date.today().year)


# ── SVS and Einkommensteuer ────────────────────────────────────────────
@router.get("/svs")
async def svs(year: int = Query(default=None),
              profit_eur: Optional[float] = Query(default=None),
              user: dict = Depends(get_current_user)):
    """What SVS will provisionally ask for.

    `profit_eur` overrides the computed figure, because a pro often knows
    something the books do not yet — a big January invoice, a quiet autumn —
    and being able to ask "what if" is the point of showing this at all.
    """
    pro_id = await require_pro_id(user)
    if profit_eur is None:
        profit_eur = (await repo.eur(pro_id, year or date.today().year))["profit"]
    return tax_at.svs_contribution(profit_eur)


@router.get("/income-tax")
async def income_tax(year: int = Query(default=None),
                     taxable_profit_eur: Optional[float] = Query(default=None),
                     user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    if taxable_profit_eur is None:
        eur = await repo.eur(pro_id, year or date.today().year)
        # SVS is deductible from the income-tax base, so it comes off first.
        # Running both against the same profit — the obvious thing to do —
        # overstates income tax by about a quarter of the SVS bill: 6.130 EUR
        # on a 60.000 EUR profit.
        svs_due = tax_at.svs_contribution(eur["profit"])["total_eur"]
        taxable_profit_eur = max(eur["profit"] - svs_due, 0)
    return tax_at.income_tax(taxable_profit_eur)


@router.get("/liability")
async def liability(year: int = Query(default=None),
                    user: dict = Depends(get_current_user)):
    """Both, in the order they apply, plus what to set aside per euro earned.

    The last figure is the useful one. A tradesperson who knows 35 % of every
    euro is spoken for prices differently from one who finds out in February.
    """
    pro_id = await require_pro_id(user)
    eur = await repo.eur(pro_id, year or date.today().year)
    out = tax_at.liability(eur["income_net"], eur["expenses_net"])
    out["year"] = year or date.today().year
    return out


# ── Exports ────────────────────────────────────────────────────────────
def _csv_response(body: str, filename: str) -> Response:
    return Response(
        content=body.encode("utf-8"),
        # charset in the type as well as the BOM: some Excel builds honour one
        # and some the other, and a mangled umlaut reads as a broken export.
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/exports/revenue.csv")
async def export_revenue(year: int = Query(default=None),
                         user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    y = year or date.today().year
    return _csv_response(await repo.revenue_csv(pro_id, y), f"Erloese-{y}.csv")


@router.get("/exports/expenses.csv")
async def export_expenses(year: int = Query(default=None),
                          user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    y = year or date.today().year
    return _csv_response(await repo.expenses_csv(pro_id, y), f"Ausgaben-{y}.csv")


@router.get("/exports/datev-full.csv")
async def export_datev_full(year: int = Query(default=None),
                            user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    y = year or date.today().year
    return _csv_response(await repo.datev_csv(pro_id, y), f"DATEV-{y}.csv")


@router.get("/year-end.pdf")
async def year_end_pdf(year: int = Query(default=None),
                       user: dict = Depends(get_current_user)):
    """The dossier the accountant actually wants, in one file."""
    pro_id = await require_pro_id(user)
    y = year or date.today().year
    from services.tax_pdf import render_tax_year_pdf

    # Every dict goes to the renderer exactly as its producer returned it.
    # The reshaping this used to do invented five keys the renderer then read
    # and the producers never had, so the endpoint raised KeyError on every
    # request. `dashboard` is `eur` plus the receivables the PDF needs, so it
    # replaces the separate `eur` call rather than adding a query.
    data = await repo.dashboard(pro_id, y)
    pro = await pg.fetchrow(
        "select * from pro_profiles where id = $1", pro_id) or {}
    pdf = render_tax_year_pdf(
        year=y,
        pro_snapshot={
            "name": pro.get("business_name") or "",
            "business_name": pro.get("business_name") or "",
            "address": pro.get("business_address") or "",
            "city": pro.get("business_city") or "",
            # The renderer's key for the UID; the column is `vat_id`.
            "invoice_tax_id": pro.get("vat_id") or "",
            "tax_number": pro.get("tax_number") or "",
            "is_kleinunternehmer": bool(pro.get("is_kleinunternehmer")),
        },
        eur=data,
        outstanding=data["outstanding"],
        ust_by_quarter={f"Q{q}": await repo.ust_va(pro_id, y, quarter=q)
                        for q in (1, 2, 3, 4)},
        mileage=await repo.mileage(pro_id, y),
        liability=tax_at.liability(data["income_net"], data["expenses_net"]))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition":
                             f'attachment; filename="Steuer-{y}.pdf"'})


# ── Accountant share link ──────────────────────────────────────────────
#
# A read-only window for the Steuerberater, without giving them an account.
# The plan calls a clean export a strong retention feature: an accountant who
# can pull the year themselves stops asking the tradesperson for it, and a
# tool the accountant likes is a tool that does not get switched.
#
# Scoped by construction. The link resolves to summaries and CSVs for one
# business and one year — no customer contact details, no job diaries, no
# ability to change anything. A token that leaks costs the pro a disclosure of
# their own turnover, which is bad; a token that could edit would be worse.

# Long enough that guessing is not a strategy, short enough to read down a
# phone. Expiry is a year by default because that is the unit the work comes
# in, and an accountant asked to re-request a link every month will ask for
# the password instead.
SHARE_TTL_DAYS = 365


@router.get("/accountant-share")
async def get_share(user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    row = await pg.fetchrow(
        "select token, label, year, expires_at, last_seen_at, created_at "
        "from accountant_shares where pro_id = $1 and revoked_at is null "
        "and (expires_at is null or expires_at > now()) "
        "order by created_at desc limit 1", pro_id)
    return {"accountant_token": row["token"] if row else None,
            "share": dict(row) if row else None}


@router.post("/accountant-share", status_code=201)
async def create_share(year: int = Query(default=None),
                       label: Optional[str] = Query(default=None),
                       user: dict = Depends(get_current_user)):
    """Mint a link, revoking any earlier one.

    Rotating rather than accumulating: the reason to issue a new link is
    usually that the old one went somewhere it should not have, and leaving it
    live would make the new one pointless.
    """
    pro_id = await require_pro_id(user)
    token = token_urlsafe(24)
    async with pg.transaction() as con:
        await con.execute(
            "update accountant_shares set revoked_at = now() "
            "where pro_id = $1 and revoked_at is null", pro_id)
        row = await con.fetchrow(
            "insert into accountant_shares (pro_id, token, label, year, expires_at) "
            "values ($1, $2, $3, $4, now() + ($5 || ' days')::interval) returning *",
            pro_id, token, label, year or date.today().year, str(SHARE_TTL_DAYS))
    return {"accountant_token": row["token"], "share": dict(row)}


@router.delete("/accountant-share")
async def revoke_share(user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    n = await pg.fetchval(
        "with r as (update accountant_shares set revoked_at = now() "
        "where pro_id = $1 and revoked_at is null returning 1) "
        "select count(*) from r", pro_id)
    return {"revoked": int(n or 0)}


# ── What the accountant sees ───────────────────────────────────────────
public_router = APIRouter(prefix="/tax/public", tags=["tax"])


async def _share(token: str) -> dict:
    row = await pg.fetchrow(
        "select * from accountant_shares where token = $1 and revoked_at is null "
        "and (expires_at is null or expires_at > now())", token)
    if not row:
        # One message for revoked, expired and invented alike. Distinguishing
        # them would confirm which tokens once existed.
        raise HTTPException(404, "Dieser Link ist nicht mehr gültig.")
    await pg.execute(
        "update accountant_shares set last_seen_at = now() where id = $1", row["id"])
    return row


@public_router.get("/accountant/{token}")
async def accountant_view(token: str, year: Optional[int] = None):
    """The year, as an accountant needs it: EÜR, four USt-VA buckets, mileage.

    No auth, and deliberately no customer names — an accountant needs the
    numbers and the paperwork, not the client list.
    """
    share = await _share(token)
    pro_id = str(share["pro_id"])
    y = year or share["year"] or date.today().year
    pro = await pg.fetchrow(
        "select business_name, business_address, business_postal_code, "
        "business_city, vat_id, tax_number, invoice_country, is_kleinunternehmer "
        "from pro_profiles where id = $1", pro_id) or {}
    eur = await repo.eur(pro_id, y)
    return {
        "business": dict(pro),
        "year": y,
        "eur": eur,
        "ust_va": {f"Q{q}": await repo.ust_va(pro_id, y, quarter=q) for q in (1, 2, 3, 4)},
        "mileage": await repo.mileage(pro_id, y),
        "liability": tax_at.liability(eur["income_net"], eur["expenses_net"]),
        "downloads": [
            {"label": "DATEV", "href": f"/api/tax/public/accountant/{token}/datev.csv"},
            {"label": "Erlöse", "href": f"/api/tax/public/accountant/{token}/revenue.csv"},
            {"label": "Ausgaben", "href": f"/api/tax/public/accountant/{token}/expenses.csv"},
        ],
    }


@public_router.get("/accountant/{token}/{kind}.csv")
async def accountant_csv(token: str, kind: str, year: Optional[int] = None):
    share = await _share(token)
    pro_id = str(share["pro_id"])
    y = year or share["year"] or date.today().year
    builder = {"datev": repo.datev_csv, "revenue": repo.revenue_csv,
               "expenses": repo.expenses_csv}.get(kind)
    if not builder:
        raise HTTPException(404, "Unknown export")
    return _csv_response(await builder(pro_id, y), f"{kind}-{y}.csv")
