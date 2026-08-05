"""Invoice endpoints (Postgres).

Mounted at /api/invoices. The legacy /api/pro-invoices routes stay live until
the MongoDB import has run and been verified; both can coexist because they
serve different stores and different prefixes.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

import asyncio
import io
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from auth import get_current_user
from db import pg
from repositories import invoices as repo
from services import tax_rules
from routes._pro import require_pro_id
from services.invoice_pdf import render_invoice_pdf

router = APIRouter(prefix="/invoices", tags=["invoices"])

# A whole year of invoices is a legitimate export; a whole account is a way
# to make the server render PDFs until it falls over.
MAX_EXPORT = 500


class InvoiceLineIn(BaseModel):
    position: Optional[int] = None
    kind: str = Field(default="labor", pattern="^(labor|material|travel|other)$")
    description: str = Field(min_length=1, max_length=300)
    # Bounded. Both were unconstrained floats, so a quantity of -5 produced a
    # quote totalling -468.00 which the list rendered and the Send button was
    # happy to mail to a customer. The upper bound is the numeric(12,2)
    # column: 999999999 x 100 overflowed it and surfaced as a bare 500 with
    # an English message inside a German UI.
    qty: float = Field(default=1, ge=0, le=1_000_000)
    unit: str = "pcs"
    unit_price: float = Field(default=0, ge=0, le=10_000_000)
    discount_pct: float = Field(default=0, ge=0, le=100)
    # Constrained to the values the Postgres enum actually has. It was a free
    # string, so `tax_treatment: "reverse_charge_13b"` — or a typo — was
    # accepted, silently resolved to `standard`, and billed at 20 %.
    tax_treatment: Optional[str] = Field(
        default=None,
        pattern="^(standard|reduced|reduced_alt|zero|kleinunternehmer"
                "|reverse_charge_13b|intra_eu|export)$")
    vat_rate: Optional[float] = Field(default=None, ge=0, le=100)
    # Declared so an edit keeps the audit link back to the quote line or the
    # change order the position came from. Pydantic drops what it has not been
    # told about, so a PUT that replaced the lines was severing it.
    source_quote_line_id: Optional[str] = None
    source_change_order_id: Optional[str] = None


class InvoiceIn(BaseModel):
    job_id: Optional[str] = None
    customer_id: Optional[str] = None
    type: str = Field(default="standard", pattern="^(standard|abschlag|schluss)$")
    service_date_start: Optional[date] = None
    service_date_end: Optional[date] = None
    payment_terms_days: int = Field(default=14, ge=0, le=180)
    note: Optional[str] = None
    lines: list[InvoiceLineIn] = []


class LinesIn(BaseModel):
    lines: list[InvoiceLineIn]


class IssueIn(BaseModel):
    service_date_start: Optional[date] = None
    service_date_end: Optional[date] = None
    payment_terms_days: Optional[int] = Field(default=None, ge=0, le=180)


class StornoIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class PaymentIn(BaseModel):
    amount: float
    method: str = Field(default="transfer",
                        pattern="^(transfer|card|sepa|sofort|cash|other)$")
    paid_on: Optional[date] = None
    reference: Optional[str] = None
    note: Optional[str] = None
    # Austrian Belegerteilungspflicht: a cash payment still owes the customer
    # a receipt. From 1 Oct 2026 a digital Beleg counts the same as paper.
    beleg_ref: Optional[str] = None


def _lines(items) -> list[dict]:
    return [i.model_dump(exclude_none=True) for i in (items or [])]


@router.get("")
async def list_invoices(status: Optional[str] = None, payment_state: Optional[str] = None,
                        job_id: Optional[str] = None, customer_id: Optional[str] = None,
                        type: Optional[str] = Query(
                            default=None, pattern="^(standard|abschlag|schluss|storno)$"),
                        q: Optional[str] = None,
                        year: Optional[int] = None,
                        month: Optional[int] = Query(default=None, ge=1, le=12),
                        sort_by: str = Query(default="date"),
                        order: str = Query(default="desc", pattern="^(asc|desc)$"),
                        page: Optional[int] = Query(default=None, ge=1),
                        per_page: Optional[int] = Query(default=None, ge=1, le=200),
                        limit: int = Query(default=50, le=200), offset: int = 0,
                        user: dict = Depends(get_current_user)):
    """The invoice list.

    `page`/`per_page` are accepted alongside `limit`/`offset` because that is
    what the screen sends. Dropping them meant the pager moved and the list
    did not.
    """
    pro_id = await require_pro_id(user)
    if per_page:
        limit = per_page
        offset = (page - 1) * per_page if page else offset
    return await repo.list_for_pro(pro_id, status=status, payment_state=payment_state,
                                   job_id=job_id, customer_id=customer_id,
                                   type=type, q=q, year=year, month=month,
                                   sort_by=sort_by, order=order,
                                   limit=limit, offset=offset)


@router.get("/overdue")
async def overdue(user: dict = Depends(get_current_user)):
    """Feeds the dunning ladder. Needs no PSP — a reminder carrying the
    existing GiroCode PDF is already actionable."""
    return {"invoices": await repo.overdue_for_pro(await require_pro_id(user))}


@router.post("", status_code=201)
async def create_invoice(body: InvoiceIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    data = body.model_dump(exclude={"lines", "type"}, exclude_none=True)
    try:
        inv = await repo.create_draft(pro_id, invoice_type=body.type,
                                      lines=_lines(body.lines), **data)
    except LookupError as exc:
        # A customer_id or job_id belonging to another business — answered the
        # same way a nonexistent one is, so the 404 discloses nothing.
        raise HTTPException(404, str(exc)) from exc
    except tax_rules.TreatmentRefused as exc:
        # A tax treatment the customer's country and status cannot support.
        # The quote route already answered this with a 400; here it escaped as
        # a bare 500, so the pro was told "Internal Server Error" about a
        # decision they can actually correct.
        raise HTTPException(400, str(exc)) from exc
    return await repo.get(pro_id, str(inv["id"]))


@router.get("/stats")
async def stats(year: Optional[int] = None, user: dict = Depends(get_current_user)):
    """Headline figures for the invoice list.

    Declared before /{invoice_id} — FastAPI matches in declaration order, and
    the dynamic route would otherwise swallow "stats" and try to read it as an
    id.

    Gross, not net: these sit next to a bank balance, and a tradesperson
    reconciles against what actually arrives.
    """
    pro_id = await require_pro_id(user)
    row = await pg.fetchrow(
        """
        with scope as (
          select * from invoices
           where pro_id = $1
             and status <> 'draft'
             and extract(year from issue_date) = coalesce($2, extract(year from current_date))
        )
        select
          coalesce(sum(gross_total), 0)                                   as issued_brutto,
          count(*)                                                        as issued_count,
          coalesce(sum(paid_total), 0)                                    as paid_brutto,
          count(*) filter (where payment_state = 'paid')                  as paid_count,
          -- Receivables, so a cancelled invoice and the credit note that
          -- cancelled it are both out. Without the exclusion the dashboard
          -- told a tradesperson they were owed money on an invoice they had
          -- themselves cancelled, and it is the one figure on the screen
          -- they would act on.
          coalesce(sum(outstanding) filter (
            where outstanding > 0 and cancelled_at is null
              and type <> 'storno'), 0)                                   as pending_brutto,
          count(*) filter (
            where outstanding > 0 and cancelled_at is null
              and type <> 'storno')                                       as pending_count,
          coalesce(sum(gross_total) filter (
            where date_trunc('month', issue_date) = date_trunc('month', current_date)
          ), 0)                                                           as this_month_brutto
        from scope
        """,
        pro_id, year,
    )
    return {k: float(v) if isinstance(v, Decimal) else v for k, v in (row or {}).items()}


@router.get("/cashflow")
async def cashflow(user: dict = Depends(get_current_user)):
    """Expected receipts by due date over the next twelve weeks.

    Keyed off what is still outstanding rather than what was invoiced, so an
    invoice already paid early stops occupying a future week it will not
    actually land in.
    """
    pro_id = await require_pro_id(user)
    rows = await pg.fetch(
        """
        with weeks as (
          select generate_series(
                   date_trunc('week', current_date),
                   date_trunc('week', current_date) + interval '11 weeks',
                   interval '1 week')::date as week_start
        )
        select w.week_start,
               coalesce(sum(i.outstanding), 0) as amount
          from weeks w
          left join invoices i
            on i.pro_id = $1
           and i.status <> 'draft'
           and i.outstanding > 0
           and date_trunc('week', i.due_date) = w.week_start
         group by w.week_start
         order by w.week_start
        """,
        pro_id,
    )
    overdue = await pg.fetchval(
        "select coalesce(sum(outstanding), 0) from invoices "
        "where pro_id = $1 and status <> 'draft' and outstanding > 0 "
        "and due_date < current_date",
        pro_id,
    )
    return {
        "weeks": [{"label": r["week_start"].strftime("%d.%m"),
                   "amount": float(r["amount"])} for r in rows],
        "overdue": float(overdue or 0),
    }


# Mounted above the /{invoice_id} routes on purpose: "export.zip" would
# otherwise be captured as an invoice id and answered with a 404.
@router.get("/export.zip")
async def export_zip(year: Optional[int] = None,
                     month: Optional[int] = Query(default=None, ge=1, le=12),
                     payment_status: Optional[str] = None,
                     status: Optional[str] = None,
                     user: dict = Depends(get_current_user)):
    """Every invoice in the current filter, as PDFs in one archive.

    The button for this shipped without the route behind it — the request
    404'd, the click handler logged to the console and swallowed it, so
    "Export all as PDF" did nothing at all and said nothing about it. An
    accountant asking for the year's invoices is the whole reason the button
    is there.

    Drafts are excluded. A draft carries no invoice number and no issue date;
    handing one to a Steuerberater in a folder of real invoices is worse than
    leaving it out.
    """
    pro_id = await require_pro_id(user)
    listing = await repo.list_for_pro(
        pro_id, status=status, payment_state=payment_status,
        year=year, month=month, sort_by="date", order="asc",
        limit=MAX_EXPORT, offset=0)
    rows = [r for r in (listing.get("invoices") or []) if r.get("status") != "draft"]
    if not rows:
        raise HTTPException(404, "No issued invoices match this filter")

    buf = io.BytesIO()
    used: set[str] = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for row in rows:
            inv = await repo.get(pro_id, row["id"])
            if not inv:
                continue
            number = (inv.get("invoice_number") or str(inv["id"]))
            # Slashes are legal in an Austrian invoice number (RG/2026/0007)
            # and would silently create directories inside the archive.
            name = number.replace("/", "-").replace("\\", "-")
            if name in used:
                name = f"{name}-{inv['id'][:8]}"
            used.add(name)
            # Off the event loop: rendering a PDF is CPU-bound, and five
            # hundred of them in a row would stall every other request on
            # the worker for the duration.
            pdf = await asyncio.to_thread(render_invoice_pdf, inv)
            z.writestr(f"{name}.pdf", pdf)

    label = f"{year}" if year else "alle"
    if year and month:
        label = f"{year}-{month:02d}"
    return Response(
        content=buf.getvalue(), media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="rechnungen-{label}.zip"'},
    )


@router.post("/{invoice_id}/mark-paid")
async def mark_paid(invoice_id: str, user: dict = Depends(get_current_user)):
    """Settle the remaining balance in one action.

    Records a real payment for exactly what is outstanding rather than
    flipping a status flag, so the payment ledger stays the single source of
    truth and the rollup trigger derives the state as it does for every other
    payment.
    """
    pro_id = await require_pro_id(user)
    inv = await repo.get(pro_id, invoice_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    outstanding = Decimal(str(inv.get("outstanding") or 0))
    if outstanding <= 0:
        return inv
    try:
        # "transfer", not "manual": `invoice_payments.method` is the
        # payment_method enum (transfer, card, sepa, sofort, cash, other) and
        # 'manual' is not a member, so this raised 22P02 and the button 500'd
        # every time it was pressed. Bank transfer is what a tradesperson
        # ticking off a settled invoice by hand almost always means; the note
        # records that nobody chose it explicitly.
        await repo.record_payment(
            pro_id, invoice_id,
            {"amount": outstanding, "method": "transfer",
             "note": "Als bezahlt markiert (Zahlungsart nicht erfasst)"})
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        # An unissued invoice has nothing to settle — say which, not "500".
        raise HTTPException(400, str(exc)) from exc
    return await repo.get(pro_id, invoice_id)


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    inv = await repo.get(await require_pro_id(user), invoice_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv


@router.put("/{invoice_id}/lines")
async def replace_lines(invoice_id: str, body: LinesIn,
                        user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    try:
        return await repo.replace_lines(pro_id, invoice_id, _lines(body.lines))
    except tax_rules.TreatmentRefused as exc:
        raise HTTPException(400, str(exc)) from exc
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(409, str(e))


@router.post("/{invoice_id}/issue")
async def issue_invoice(invoice_id: str, body: IssueIn = IssueIn(),
                        user: dict = Depends(get_current_user)):
    """Freeze and issue.

    One transaction: the number is allocated by a database trigger in the
    same statement, so a failure anywhere rolls the counter back and the
    series stays gap-free (GoBD / RKSV).
    """
    pro_id = await require_pro_id(user)
    try:
        await repo.issue(pro_id, invoice_id,
                         service_date_start=body.service_date_start,
                         service_date_end=body.service_date_end,
                         payment_terms_days=body.payment_terms_days)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return await repo.get(pro_id, invoice_id)


@router.post("/{invoice_id}/storno", status_code=201)
async def storno_invoice(invoice_id: str, body: StornoIn,
                         user: dict = Depends(get_current_user)):
    """Cancel by credit note. An issued invoice is never edited or deleted —
    both it and its Storno stay in the series."""
    pro_id = await require_pro_id(user)
    try:
        st = await repo.storno(pro_id, invoice_id, body.reason)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))
    return await repo.get(pro_id, str(st["id"]))


@router.post("/{invoice_id}/payments", status_code=201)
async def record_payment(invoice_id: str, body: PaymentIn,
                         user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    try:
        await repo.record_payment(pro_id, invoice_id, body.model_dump(exclude_none=True))
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return await repo.get(pro_id, invoice_id)


@router.delete("/{invoice_id}/payments/{payment_id}")
async def delete_payment(invoice_id: str, payment_id: str,
                         user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    if not await repo.delete_payment(pro_id, invoice_id, payment_id):
        raise HTTPException(404, "Payment not found")
    return await repo.get(pro_id, invoice_id)


@router.get("/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    inv = await repo.get(pro_id, invoice_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    pdf = render_invoice_pdf(inv)
    name = (inv.get("invoice_number") or "entwurf").replace("/", "-")
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{name}.pdf"'},
    )
