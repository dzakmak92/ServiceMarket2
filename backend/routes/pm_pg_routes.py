"""Project-mode endpoints (Postgres): tasks, materials, diary, timer,
documents and Nachträge — all hung off a job."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import pg
from repositories import pm as repo
from routes._pro import require_pro_id

router = APIRouter(prefix="/jobs", tags=["project"])


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    column_key: str = Field(default="todo", pattern="^(todo|doing|done)$")
    sort_order: Optional[int] = None
    assignee: Optional[str] = None
    due_date: Optional[date] = None


class TaskPatch(TaskIn):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    column_key: Optional[str] = Field(default=None, pattern="^(todo|doing|done)$")


class MaterialIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    brand: Optional[str] = None
    barcode: Optional[str] = None
    qty: float = 1
    unit: str = "pcs"
    planned_cost: float = 0
    actual_cost: Optional[float] = None
    supplier: Optional[str] = None
    # Lead time drives the customer-facing order timeline, which is what
    # stops the weekly "where are my tiles?" call.
    expected_at: Optional[date] = None
    ordered_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    photos: Optional[list[str]] = None


class DiaryIn(BaseModel):
    # Supplied by the offline queue so a replayed entry lands once. Without an
    # id chosen before the request leaves the device, a retry after a flaky
    # cellar connection cannot be told apart from a genuine second entry.
    client_id: Optional[str] = Field(default=None, pattern=r"^[0-9a-fA-F-]{36}$")
    entry_date: Optional[date] = None
    text: str = ""
    hours: Optional[float] = None
    weather: Optional[str] = None
    author: Optional[str] = None
    photos: Optional[list[str]] = None


class DocumentIn(BaseModel):
    kind: str = Field(default="photo",
                      pattern="^(photo_before|photo_after|photo|receipt|plan|signature|abnahme|other)$")
    storage_ref: str
    filename: Optional[str] = None
    content_type: Optional[str] = None
    size_bytes: Optional[int] = None
    caption: Optional[str] = None
    customer_visible: bool = False


class ChangeOrderIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    net_amount: float = 0
    vat_rate: float = 20
    kind: str = Field(default="labor", pattern="^(labor|material|travel|other)$")


class TimerIn(BaseModel):
    note: Optional[str] = None


def _nf(e):        # LookupError -> 404
    return HTTPException(404, str(e))


# ── Tasks ──────────────────────────────────────────────────────────────
@router.get("/{job_id}/tasks")
async def tasks(job_id: str, user: dict = Depends(get_current_user)):
    try:
        return {"tasks": await repo.list_tasks(await require_pro_id(user), job_id)}
    except LookupError as e:
        raise _nf(e)


@router.post("/{job_id}/tasks", status_code=201)
async def add_task(job_id: str, body: TaskIn, user: dict = Depends(get_current_user)):
    try:
        return await repo.create_task(await require_pro_id(user), job_id,
                                      body.model_dump(exclude_none=True))
    except LookupError as e:
        raise _nf(e)


@router.patch("/{job_id}/tasks/{task_id}")
async def patch_task(job_id: str, task_id: str, body: TaskPatch,
                     user: dict = Depends(get_current_user)):
    try:
        row = await repo.update_task(await require_pro_id(user), job_id, task_id,
                                     body.model_dump(exclude_none=True))
    except LookupError as e:
        raise _nf(e)
    if not row:
        raise HTTPException(404, "Task not found")
    return row


@router.delete("/{job_id}/tasks/{task_id}")
async def remove_task(job_id: str, task_id: str, user: dict = Depends(get_current_user)):
    try:
        if not await repo.delete_task(await require_pro_id(user), job_id, task_id):
            raise HTTPException(404, "Task not found")
    except LookupError as e:
        raise _nf(e)
    return {"deleted": True}


# ── Materials ──────────────────────────────────────────────────────────
@router.get("/{job_id}/materials")
async def materials(job_id: str, user: dict = Depends(get_current_user)):
    try:
        return {"materials": await repo.list_materials(await require_pro_id(user), job_id)}
    except LookupError as e:
        raise _nf(e)


@router.post("/{job_id}/materials", status_code=201)
async def add_material(job_id: str, body: MaterialIn, user: dict = Depends(get_current_user)):
    try:
        return await repo.create_material(await require_pro_id(user), job_id,
                                          body.model_dump(exclude_none=True))
    except LookupError as e:
        raise _nf(e)


@router.patch("/{job_id}/materials/{material_id}")
async def patch_material(job_id: str, material_id: str, body: MaterialIn,
                         user: dict = Depends(get_current_user)):
    try:
        row = await repo.update_material(await require_pro_id(user), job_id, material_id,
                                         body.model_dump(exclude_none=True))
    except LookupError as e:
        raise _nf(e)
    if not row:
        raise HTTPException(404, "Material not found")
    return row


@router.delete("/{job_id}/materials/{material_id}")
async def remove_material(job_id: str, material_id: str, user: dict = Depends(get_current_user)):
    try:
        if not await repo.delete_material(await require_pro_id(user), job_id, material_id):
            raise HTTPException(404, "Material not found")
    except LookupError as e:
        raise _nf(e)
    return {"deleted": True}


# ── Diary ──────────────────────────────────────────────────────────────
@router.get("/{job_id}/diary")
async def diary(job_id: str, user: dict = Depends(get_current_user)):
    try:
        return {"entries": await repo.list_diary(await require_pro_id(user), job_id)}
    except LookupError as e:
        raise _nf(e)


@router.post("/{job_id}/diary", status_code=201)
async def add_diary(job_id: str, body: DiaryIn, user: dict = Depends(get_current_user)):
    try:
        return await repo.add_diary(await require_pro_id(user), job_id,
                                    body.model_dump(exclude_none=True))
    except LookupError as e:
        raise _nf(e)


@router.delete("/{job_id}/diary/{entry_id}")
async def remove_diary(job_id: str, entry_id: str, user: dict = Depends(get_current_user)):
    try:
        if not await repo.delete_diary(await require_pro_id(user), job_id, entry_id):
            raise HTTPException(404, "Entry not found")
    except LookupError as e:
        raise _nf(e)
    return {"deleted": True}


# ── Timer ──────────────────────────────────────────────────────────────
timer_router = APIRouter(prefix="/timer", tags=["project"])


@timer_router.get("")
async def current_timer(user: dict = Depends(get_current_user)):
    return {"running": await repo.running_timer(await require_pro_id(user))}


@router.post("/{job_id}/timer/start", status_code=201)
async def start_timer(job_id: str, body: TimerIn = TimerIn(),
                      user: dict = Depends(get_current_user)):
    """Starting a timer stops any other running one, so the tradesperson can
    tap start on the next job without remembering to stop the last."""
    try:
        return await repo.start_timer(await require_pro_id(user), job_id, note=body.note)
    except LookupError as e:
        raise _nf(e)


@router.post("/{job_id}/timer/stop")
async def stop_timer(job_id: str, user: dict = Depends(get_current_user)):
    try:
        row = await repo.stop_timer(await require_pro_id(user), job_id)
    except LookupError as e:
        raise _nf(e)
    if not row:
        raise HTTPException(404, "No running timer on this job")
    return row


@router.get("/{job_id}/time-logs")
async def time_logs(job_id: str, user: dict = Depends(get_current_user)):
    try:
        return await repo.list_time_logs(await require_pro_id(user), job_id)
    except LookupError as e:
        raise _nf(e)


# ── Documents ──────────────────────────────────────────────────────────
@router.get("/{job_id}/documents")
async def documents(job_id: str, user: dict = Depends(get_current_user)):
    try:
        return {"documents": await repo.list_documents(await require_pro_id(user), job_id)}
    except LookupError as e:
        raise _nf(e)


@router.post("/{job_id}/documents", status_code=201)
async def add_document(job_id: str, body: DocumentIn, user: dict = Depends(get_current_user)):
    try:
        return await repo.add_document(await require_pro_id(user), job_id,
                                       body.model_dump(exclude_none=True))
    except LookupError as e:
        raise _nf(e)


@router.delete("/{job_id}/documents/{doc_id}")
async def remove_document(job_id: str, doc_id: str, user: dict = Depends(get_current_user)):
    try:
        if not await repo.delete_document(await require_pro_id(user), job_id, doc_id):
            raise HTTPException(404, "Document not found")
    except LookupError as e:
        raise _nf(e)
    return {"deleted": True}


# ── Change orders ──────────────────────────────────────────────────────
@router.get("/{job_id}/change-orders")
async def change_orders(job_id: str, user: dict = Depends(get_current_user)):
    try:
        return {"change_orders": await repo.list_change_orders(await require_pro_id(user), job_id)}
    except LookupError as e:
        raise _nf(e)


@router.post("/{job_id}/change-orders", status_code=201)
async def add_change_order(job_id: str, body: ChangeOrderIn,
                           user: dict = Depends(get_current_user)):
    try:
        return await repo.create_change_order(await require_pro_id(user), job_id,
                                              body.model_dump(exclude_none=True))
    except LookupError as e:
        raise _nf(e)


@router.patch("/{job_id}/change-orders/{co_id}")
async def patch_change_order(job_id: str, co_id: str, body: ChangeOrderIn,
                             user: dict = Depends(get_current_user)):
    try:
        row = await repo.update_change_order(await require_pro_id(user), job_id, co_id,
                                             body.model_dump(exclude_none=True))
    except LookupError as e:
        raise _nf(e)
    if not row:
        raise HTTPException(409, "Change order not found, or already sent/invoiced")
    return row


@router.post("/{job_id}/change-orders/{co_id}/send")
async def send_change_order(job_id: str, co_id: str, user: dict = Depends(get_current_user)):
    try:
        row = await repo.send_change_order(await require_pro_id(user), job_id, co_id)
    except LookupError as e:
        raise _nf(e)
    if not row:
        raise HTTPException(409, "Change order not found or already sent")
    return row


# ── Overview ───────────────────────────────────────────────────────────
class AbnahmeIn(BaseModel):
    """Formal handover. §634 BGB / §1167 ABGB start running from acceptance,
    and a dispute two years later turns on whether it happened and who said
    so — which is why the name is required rather than optional."""
    signed_by: str = Field(min_length=2, max_length=200)
    note: Optional[str] = None
    signature_ref: Optional[str] = None


@router.post("/{job_id}/abnahme")
async def record_abnahme(job_id: str, body: AbnahmeIn,
                         user: dict = Depends(get_current_user)):
    """Pro-side record of an on-site handover."""
    pro_id = await require_pro_id(user)
    row = await pg.fetchrow(
        """
        update jobs
           set abnahme_at = coalesce(abnahme_at, now()),
               abnahme_signed_by = $3,
               abnahme_note = $4,
               abnahme_signature_ref = coalesce($5, abnahme_signature_ref),
               status = case when status in ('closed','cancelled','invoiced')
                             then status else 'completed'::job_status end,
               completed_at = coalesce(completed_at, now()),
               updated_at = now()
         where id = $1 and pro_id = $2 and deleted_at is null
        returning id::text, abnahme_at, abnahme_signed_by, abnahme_note, status
        """,
        job_id, pro_id, body.signed_by.strip(), body.note, body.signature_ref)
    if not row:
        raise HTTPException(404, "Job not found")
    return row


@router.get("/{job_id}/overview")
async def overview(job_id: str, user: dict = Depends(get_current_user)):
    try:
        return await repo.overview(await require_pro_id(user), job_id)
    except LookupError as e:
        raise _nf(e)


# ══════════════════════════════════════════════════════════════════════
# Customer portal — Nachtrag approval, no account required
# ══════════════════════════════════════════════════════════════════════
portal_router = APIRouter(prefix="/portal", tags=["customer-portal"])


class CoDecisionIn(BaseModel):
    # A typed name is the e-signature. It is what turns a verbal "yes, go
    # ahead" into something that survives a later dispute about whether the
    # extra was ever agreed.
    name: str = Field(min_length=2, max_length=200)


async def _co_in_job(share_token: str, co_id: str) -> bool:
    from db import pg
    return bool(await pg.fetchval(
        """
        select 1 from change_orders co
          join jobs j on j.id = co.job_id
         where co.id = $1 and j.share_token = $2 and j.deleted_at is null
        """, co_id, share_token))


@portal_router.get("/{share_token}/change-orders")
async def portal_change_orders(share_token: str):
    from db import pg
    rows = await pg.fetch(
        """
        select co.id, co.co_number, co.title, co.description, co.net_amount,
               co.vat_rate, co.status, co.sent_at, co.decided_at
          from change_orders co
          join jobs j on j.id = co.job_id
         where j.share_token = $1 and j.deleted_at is null
           and co.status in ('sent','approved','rejected','invoiced')
         order by co.created_at
        """, share_token)
    return {"change_orders": rows}


@portal_router.post("/{share_token}/change-orders/{co_id}/approve")
async def portal_approve_co(share_token: str, co_id: str, body: CoDecisionIn):
    if not await _co_in_job(share_token, co_id):
        raise HTTPException(404, "This link is no longer valid.")
    row = await repo.decide_change_order(co_id, approve=True, signed_by=body.name)
    if not row:
        raise HTTPException(409, "This change order has already been decided.")
    return row


@portal_router.post("/{share_token}/change-orders/{co_id}/reject")
async def portal_reject_co(share_token: str, co_id: str, body: CoDecisionIn):
    if not await _co_in_job(share_token, co_id):
        raise HTTPException(404, "This link is no longer valid.")
    row = await repo.decide_change_order(co_id, approve=False, signed_by=body.name)
    if not row:
        raise HTTPException(409, "This change order has already been decided.")
    return row


class PortalAbnahmeIn(BaseModel):
    """The customer's own sign-off. A typed name is the e-signature."""
    name: str = Field(min_length=2, max_length=200)
    note: Optional[str] = None


@portal_router.post("/{share_token}/abnahme")
async def portal_abnahme(share_token: str, body: PortalAbnahmeIn):
    """Customer signs off completion from the share link.

    Recorded once and never overwritten: a second submission returns the
    existing record rather than moving the date. The acceptance date starts
    the warranty period, so letting a later click push it forward would
    quietly extend the pro's liability.
    """
    row = await pg.fetchrow(
        """
        update jobs
           set abnahme_at = now(),
               abnahme_signed_by = $2,
               abnahme_note = $3,
               status = case when status in ('closed','cancelled','invoiced')
                             then status else 'completed'::job_status end,
               completed_at = coalesce(completed_at, now()),
               updated_at = now()
         where share_token = $1 and deleted_at is null and abnahme_at is null
        returning id::text, abnahme_at, abnahme_signed_by
        """,
        share_token, body.name.strip(), body.note)
    if row:
        return {"abnahme": row, "recorded": True}

    existing = await pg.fetchrow(
        "select id::text, abnahme_at, abnahme_signed_by from jobs "
        "where share_token = $1 and deleted_at is null", share_token)
    if not existing:
        raise HTTPException(404, "Not found")
    return {"abnahme": existing, "recorded": False}
