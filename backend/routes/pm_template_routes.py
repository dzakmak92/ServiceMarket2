"""Project templates, sub-contractor links and barcode lookup (Postgres).

Four endpoints the frontend has been calling since the project board shipped
and which only ever existed in the MongoDB module. That module is not mounted
on Vercel, so in production they have been 404s: the template dropdown on the
Kanban board loaded nothing, "save as template" failed silently, the
sub-contractor invite button did nothing, and scanning a barcode fell back to
storing the raw digits every time.

A project template is not a quote template. `quote_templates` is a
Leistungsverzeichnis — positions and prices for a customer-facing document.
This is the internal plan: what has to be done, in what order, what to buy. A
bathroom refit needs both, and confusing them is how a customer ends up
reading "Plumbing rough-in" as a line on their offer.
"""
from __future__ import annotations

import json
import logging
from secrets import token_urlsafe
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from auth import get_current_user
from db import pg
from routes._pro import require_pro_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pm", tags=["project-templates"])
job_router = APIRouter(prefix="/jobs", tags=["project-templates"])
public_router = APIRouter(prefix="/pm/public", tags=["sub-contractor"])


class TemplateTask(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    column: str = Field(default="todo", pattern="^(todo|doing|done)$")
    description: Optional[str] = None


class TemplateMaterial(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    qty: float = 1
    unit: str = "pcs"
    planned_cost: float = 0
    supplier: Optional[str] = None


class TemplateMilestone(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    # Either a share of the contract or a fixed sum. Percent is the useful one:
    # a template is written before anyone knows the contract value.
    percent: Optional[float] = None
    amount_eur: Optional[float] = None


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: Optional[str] = None
    tasks: list[TemplateTask] = Field(default_factory=list)
    materials: list[TemplateMaterial] = Field(default_factory=list)
    milestones: list[TemplateMilestone] = Field(default_factory=list)


class TemplateFromJob(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: Optional[str] = None


def _out(row: dict) -> dict:
    """JSONB comes back as text from asyncpg unless a codec is registered."""
    d = dict(row)
    d["id"] = str(d["id"])
    d["pro_id"] = str(d["pro_id"]) if d.get("pro_id") else None
    for k in ("tasks", "materials", "milestones"):
        if isinstance(d.get(k), str):
            try:
                d[k] = json.loads(d[k])
            except ValueError:
                d[k] = []
    d["builtin"] = bool(d.get("is_builtin"))
    return d


@router.get("/templates")
async def list_templates(user: dict = Depends(get_current_user)):
    """Built-ins plus the business's own, newest first."""
    pro_id = await require_pro_id(user)
    rows = await pg.fetch(
        "select * from project_templates where is_builtin or pro_id = $1 "
        "order by is_builtin desc, sort_order, created_at desc", pro_id)
    return {"templates": [_out(r) for r in rows]}


@router.post("/templates", status_code=201)
async def create_template(body: TemplateIn, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    row = await pg.fetchrow(
        """
        insert into project_templates (pro_id, name, category, tasks, materials, milestones)
        values ($1, $2, $3, $4, $5, $6) returning *
        """,
        pro_id, body.name.strip(), (body.category or "").strip() or None,
        json.dumps([t.model_dump() for t in body.tasks]),
        json.dumps([m.model_dump() for m in body.materials]),
        json.dumps([m.model_dump() for m in body.milestones]))
    return _out(row)


@router.post("/templates/from-project/{job_id}", status_code=201)
async def save_job_as_template(job_id: str, body: TemplateFromJob,
                               user: dict = Depends(get_current_user)):
    """Snapshot a job's current tasks and materials into a reusable template.

    A snapshot, not a link: editing the template later must not change the job
    it came from, and finishing the job must not change the template. The same
    reasoning as quote templates, for the same reason — a document that keeps
    editing itself after the fact is a liability.
    """
    pro_id = await require_pro_id(user)
    if not await pg.fetchval(
            "select 1 from jobs where id = $1 and pro_id = $2 and deleted_at is null",
            job_id, pro_id):
        raise HTTPException(404, "Job not found")

    tasks = await pg.fetch(
        "select title, column_key, description from job_tasks "
        "where job_id = $1 order by column_key, sort_order", job_id)
    materials = await pg.fetch(
        "select name, qty, unit, planned_cost, supplier from job_materials "
        "where job_id = $1 order by created_at", job_id)
    if not tasks and not materials:
        raise HTTPException(400, "Dieser Auftrag hat noch nichts, was sich als "
                                 "Vorlage speichern lässt.")

    row = await pg.fetchrow(
        """
        insert into project_templates (pro_id, name, category, tasks, materials)
        values ($1, $2, $3, $4, $5) returning *
        """,
        pro_id, body.name.strip(), (body.category or "").strip() or None,
        json.dumps([{"title": t["title"], "column": t["column_key"] or "todo",
                     "description": t["description"] or ""} for t in tasks]),
        json.dumps([{"name": m["name"], "qty": float(m["qty"] or 1),
                     "unit": m["unit"] or "pcs",
                     "planned_cost": float(m["planned_cost"] or 0),
                     "supplier": m["supplier"]} for m in materials]))
    return _out(row)


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    # Scoped to pro_id, so a built-in cannot be deleted by anyone: they have a
    # null pro_id and no business's id matches it.
    deleted = await pg.fetchval(
        "delete from project_templates where id = $1 and pro_id = $2 returning 1",
        template_id, pro_id)
    if not deleted:
        raise HTTPException(404, "Template not found")
    return {"deleted": True}


@router.post("/templates/{template_id}/apply/{job_id}", status_code=201)
async def apply_template(template_id: str, job_id: str,
                         base_amount: float = Query(default=0.0, ge=0),
                         user: dict = Depends(get_current_user)):
    """Create the template's tasks and materials on a job.

    Additive: existing tasks are left alone. A template applied to a job that
    already has a board should extend it, not silently replace work somebody
    has been moving between columns.
    """
    pro_id = await require_pro_id(user)
    if not await pg.fetchval(
            "select 1 from jobs where id = $1 and pro_id = $2 and deleted_at is null",
            job_id, pro_id):
        raise HTTPException(404, "Job not found")
    tpl = await pg.fetchrow(
        "select * from project_templates where id = $1 and (is_builtin or pro_id = $2)",
        template_id, pro_id)
    if not tpl:
        raise HTTPException(404, "Template not found")
    tpl = _out(tpl)

    # Appended after whatever is already on the board, per column.
    offsets = {r["column_key"]: int(r["n"]) for r in await pg.fetch(
        "select column_key, count(*) as n from job_tasks where job_id = $1 "
        "group by column_key", job_id)}

    created = {"tasks": 0, "materials": 0}
    async with pg.transaction() as con:
        for t in tpl["tasks"]:
            col = t.get("column") or "todo"
            offsets[col] = offsets.get(col, 0) + 1
            await con.execute(
                "insert into job_tasks (job_id, title, description, column_key, sort_order) "
                "values ($1, $2, $3, $4, $5)",
                job_id, t.get("title") or "", t.get("description") or "", col,
                offsets[col])
            created["tasks"] += 1
        for m in tpl["materials"]:
            await con.execute(
                "insert into job_materials (job_id, name, qty, unit, planned_cost, supplier) "
                "values ($1, $2, $3, $4, $5, $6)",
                job_id, m.get("name") or "", float(m.get("qty") or 1),
                m.get("unit") or "pcs", float(m.get("planned_cost") or 0),
                m.get("supplier"))
            created["materials"] += 1

    # Percent milestones need a contract value to become money. Returned rather
    # than written: the payment rail is deliberately the last phase, and
    # inventing payment rows before it exists would leave orphans behind.
    milestones = []
    for ms in tpl["milestones"]:
        amount = ms.get("amount_eur")
        if amount is None and ms.get("percent") and base_amount:
            amount = round(base_amount * float(ms["percent"]) / 100, 2)
        milestones.append({"label": ms.get("label") or "", "amount_eur": amount,
                           "percent": ms.get("percent")})

    return {"applied": created, "milestones": milestones}


# ── Sub-contractor magic link ──────────────────────────────────────────
@job_router.post("/{job_id}/sub-invite", status_code=201)
async def issue_sub_invite(job_id: str, user: dict = Depends(get_current_user)):
    """Mint a link that lets a sub see this job without an account.

    Rotating rather than reusing: issuing a new invite must invalidate the old
    one, because the reason to reissue is usually that the previous link went
    somewhere it should not have.
    """
    pro_id = await require_pro_id(user)
    token = token_urlsafe(20)
    row = await pg.fetchrow(
        "update jobs set sub_token = $3, updated_at = now() "
        "where id = $1 and pro_id = $2 and deleted_at is null "
        "returning sub_token", job_id, pro_id, token)
    if not row:
        raise HTTPException(404, "Job not found")
    return {"sub_token": row["sub_token"]}


@job_router.post("/{job_id}/sub-revoke")
async def revoke_sub_invite(job_id: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    found = await pg.fetchval(
        "update jobs set sub_token = null, updated_at = now() "
        "where id = $1 and pro_id = $2 and deleted_at is null returning 1",
        job_id, pro_id)
    if not found:
        raise HTTPException(404, "Job not found")
    return {"revoked": True}


# ── Barcode lookup ─────────────────────────────────────────────────────
@router.get("/barcode-lookup")
async def barcode_lookup(code: str, user: dict = Depends(get_current_user)):
    """Resolve an EAN/UPC to a product name via UPCitemdb's free trial API.

    Degrades rather than fails. A scanner in a merchant's aisle with no signal
    is the normal case, not the exception, and the caller falls back to storing
    the raw digits — so an outage here must look like "not found", never like a
    broken screen.
    """
    await require_pro_id(user)
    code = (code or "").strip()
    if not code.isdigit() or not 6 <= len(code) <= 14:
        raise HTTPException(400, "Invalid barcode")

    out: dict[str, Any] = {"found": False, "barcode": code,
                           "name": None, "brand": None, "category": None}
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get("https://api.upcitemdb.com/prod/trial/lookup",
                                 params={"upc": code})
        if r.status_code == 200:
            items = (r.json() or {}).get("items") or []
            if items:
                it = items[0]
                out.update({
                    "found": True,
                    "name": (it.get("title") or "").strip()[:200] or None,
                    "brand": (it.get("brand") or "").strip()[:120] or None,
                    "category": (it.get("category") or "").strip()[:120] or None,
                })
    except Exception as exc:  # noqa: BLE001 — a lookup failure is not an error
        logger.info("barcode lookup unavailable: %s", type(exc).__name__)
    return out


# ── Job File dossier ───────────────────────────────────────────────────
@job_router.get("/{job_id}/export-pdf")
async def export_job_file(job_id: str,
                          lang: str = Query(default="de", pattern="^(de|en|tr|es)$"),
                          user: dict = Depends(get_current_user)):
    """The archivable record of a finished job.

    §14b UStG keeps invoices for ten years and §634a BGB / §933 ABGB run defect
    liability for five, so the document proving what was built, agreed and
    handed over has to outlive every screen here. It is a file the pro can put
    somewhere else, which is the point.
    """
    pro_id = await require_pro_id(user)
    from services.job_file_pdf import generate
    try:
        pdf = await generate(pro_id, job_id, lang)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    safe = "".join(c for c in (job_id or "job") if c.isalnum() or c in "-_")[:40]
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Jobakte-{safe}.pdf"'})


# ── Sub-contractor portal ──────────────────────────────────────────────
#
# Token-scoped and account-free: a sub on site has a link, not a login. The
# link was mintable above and the page it opens has been a 404 in production,
# so the invite button produced a URL to nothing.
#
# What a sub may see is deliberately narrow — the board and nothing else. No
# quote, no invoice, no P&L, no customer contact details. A sub-contractor
# needs to know what to build; they have no business knowing the margin on it
# or being able to ring the client directly.


class SubTaskMove(BaseModel):
    column_key: str = Field(pattern="^(todo|doing|done)$")


class SubDiaryIn(BaseModel):
    note: str = Field(min_length=1, max_length=1000)
    hours: Optional[float] = Field(default=0, ge=0, le=24)
    # Free text: there is no account behind this, so the name is a claim, not
    # an identity. It is recorded verbatim and attributed as such.
    author_name: Optional[str] = Field(default=None, max_length=60)


async def _sub_job(sub_token: str) -> dict:
    job = await pg.fetchrow(
        "select id, title, category, site_city from jobs "
        "where sub_token = $1 and deleted_at is null", sub_token)
    if not job:
        # One message for a revoked token and an invented one alike. Telling
        # the difference would confirm which tokens once existed.
        raise HTTPException(404, "Invitation revoked or invalid")
    return job


@public_router.get("/sub/{sub_token}")
async def sub_view(sub_token: str):
    job = await _sub_job(sub_token)
    tasks = await pg.fetch(
        "select id, title, description, column_key, sort_order, due_date "
        "from job_tasks where job_id = $1 order by column_key, sort_order",
        job["id"])
    return {
        "project_id": str(job["id"]),
        "title": job["title"],
        "job_category": job["category"],
        "city": job["site_city"],
        "tasks": [{**dict(t), "id": str(t["id"])} for t in tasks],
    }


@public_router.patch("/sub/{sub_token}/tasks/{task_id}")
async def sub_move_task(sub_token: str, task_id: str, body: SubTaskMove):
    """A sub may move a card. Not rename it, not delete it, not add one.

    The narrow model is the enforcement: there is no field here that could
    carry a title or a deletion, so no amount of crafted payload does more
    than change a column.
    """
    job = await _sub_job(sub_token)
    row = await pg.fetchrow(
        "update job_tasks set column_key = $3, "
        "done_at = case when $3 = 'done' then coalesce(done_at, now()) else null end, "
        "updated_at = now() "
        "where id = $1 and job_id = $2 returning *",
        task_id, job["id"], body.column_key)
    if not row:
        raise HTTPException(404, "Task not found")
    return {**dict(row), "id": str(row["id"]), "job_id": str(row["job_id"])}


@public_router.post("/sub/{sub_token}/diary", status_code=201)
async def sub_add_diary(sub_token: str, body: SubDiaryIn):
    """A diary entry from someone with no account.

    Attributed in the text and flagged in `author`, so a pro reading the
    diary six months later can tell their own note from a sub's. An
    unattributed entry in a document that may end up in a defect claim is
    worse than no entry.
    """
    job = await _sub_job(sub_token)
    name = (body.author_name or "Subunternehmer").strip()[:60] or "Subunternehmer"
    row = await pg.fetchrow(
        "insert into job_diary (job_id, text, hours, author) "
        "values ($1, $2, $3, $4) returning *",
        job["id"], f"[{name}] {body.note.strip()}",
        float(body.hours or 0) or None, name)
    return {**dict(row), "id": str(row["id"]), "job_id": str(row["job_id"])}
