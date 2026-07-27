"""Project Management (PM) Toolkit routes — Kanban + materials + diary +
customer-facing read-only status page.

Each PM "Project" is bootstrapped from a Job the pro has won (accepted quote).
The customer status page is a public read-only view gated on the project's
share_token. Pros can revoke the token at any time.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List, Literal
from secrets import token_urlsafe

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from auth import get_current_user
from database import db

router = APIRouter(prefix="/pm")


# ── EPC-QR + notification helpers (shared by portal endpoints) ───────────────
def _mask_iban(iban: Optional[str]) -> Optional[str]:
    if not iban:
        return None
    s = iban.replace(" ", "")
    if len(s) <= 8:
        return s
    return f"{s[:4]} •••• {s[-4:]}"


def _portal_epc_b64(pro_doc: Optional[dict], amount: float, reference: str) -> Optional[str]:
    """Base64 PNG of an EPC069-12 'GiroCode' so the client scans → bank transfer."""
    if not pro_doc or not pro_doc.get("bank_iban") or amount <= 0:
        return None
    try:
        import base64
        from services.pro_invoicing import build_epc_qr_png
        png = build_epc_qr_png(
            name=(pro_doc.get("business_name") or "Tradesperson")[:70],
            iban=pro_doc.get("bank_iban"),
            bic=pro_doc.get("bank_bic"),
            amount=round(float(amount), 2),
            reference=(reference or "")[:140],
            scale=4,
        )
        return "data:image/png;base64," + base64.b64encode(png).decode()
    except Exception:
        return None


async def _notify_pro_co(proj: dict, co: dict, approved: bool, who: str) -> None:
    """Notify (+ push) the pro when a client approves/rejects a change order."""
    try:
        pro_doc = await db.pro_profiles.find_one({"_id": ObjectId(proj["pro_id"])})
        if not pro_doc:
            return
        uid = pro_doc["user_id"]
        verb = "approved" if approved else "declined"
        title = f"Nachtrag {verb}: {co.get('number')}"
        body = f"{who} {verb} '{co.get('title')}' (€{co.get('net_total', 0):.2f} net)."
        await db.notifications.insert_one({
            "user_id": uid, "kind": "pm_change_order", "title": title, "body": body,
            "link_to": f"/projects/{proj['_id']}", "is_read": False,
            "created_at": datetime.now(timezone.utc),
        })
        try:
            from push import send_push_to_user
            await send_push_to_user(uid, {"title": title, "body": body, "url": f"/projects/{proj['_id']}", "tag": f"co-{co.get('number')}"})
        except Exception:
            pass
    except Exception:
        pass


async def _notify_pro_payment(proj: dict, pay: dict) -> None:
    try:
        pro_doc = await db.pro_profiles.find_one({"_id": ObjectId(proj["pro_id"])})
        if not pro_doc:
            return
        uid = pro_doc["user_id"]
        title = f"Client marked {pay.get('reference')} as paid"
        body = f"{pay.get('label')} — €{pay.get('amount_eur', 0):.2f}. Confirm once the transfer lands."
        await db.notifications.insert_one({
            "user_id": uid, "kind": "pm_payment", "title": title, "body": body,
            "link_to": f"/projects/{proj['_id']}", "is_read": False,
            "created_at": datetime.now(timezone.utc),
        })
        try:
            from push import send_push_to_user
            await send_push_to_user(uid, {"title": title, "body": body, "url": f"/projects/{proj['_id']}", "tag": f"pay-{pay.get('reference')}"})
        except Exception:
            pass
    except Exception:
        pass



async def _notify_homeowner_co_sent(proj: dict, co: dict) -> None:
    """Notify (+ push) the homeowner when their pro sends a new change order."""
    try:
        hid = (proj.get("customer") or {}).get("homeowner_id")
        if not hid:
            return
        pro_doc = await db.pro_profiles.find_one({"_id": ObjectId(proj["pro_id"])})
        pro_name = (pro_doc or {}).get("business_name") or "Your tradesperson"
        title = f"New change order: {co.get('number')}"
        body = f"{pro_name} sent '{co.get('title')}' (€{co.get('net_total', 0):.2f} net) for your approval."
        link = f"/my-projects/{proj['_id']}"
        await db.notifications.insert_one({
            "user_id": hid, "kind": "pm_change_order", "title": title, "body": body,
            "link_to": link, "is_read": False, "created_at": datetime.now(timezone.utc),
        })
        try:
            from push import send_push_to_user
            await send_push_to_user(hid, {"title": title, "body": body, "url": link, "tag": f"co-{co.get('number')}"})
        except Exception:
            pass
    except Exception:
        pass


async def _notify_homeowner_payment_requested(proj: dict, pay: dict) -> None:
    """Notify (+ push) the homeowner when their pro requests a milestone payment."""
    try:
        hid = (proj.get("customer") or {}).get("homeowner_id")
        if not hid:
            return
        pro_doc = await db.pro_profiles.find_one({"_id": ObjectId(proj["pro_id"])})
        pro_name = (pro_doc or {}).get("business_name") or "Your tradesperson"
        title = f"Payment requested: {pay.get('reference')}"
        body = f"{pro_name} requested '{pay.get('label')}' — €{pay.get('amount_eur', 0):.2f}."
        link = f"/my-projects/{proj['_id']}"
        await db.notifications.insert_one({
            "user_id": hid, "kind": "pm_payment", "title": title, "body": body,
            "link_to": link, "is_read": False, "created_at": datetime.now(timezone.utc),
        })
        try:
            from push import send_push_to_user
            await send_push_to_user(hid, {"title": title, "body": body, "url": link, "tag": f"pay-{pay.get('reference')}"})
        except Exception:
            pass
    except Exception:
        pass



# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
async def _require_pm_toolkit(user: dict) -> dict:
    if user.get("role") != "tradesperson":
        raise HTTPException(status_code=403, detail="Pros only")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    if not pro.get("has_pm_toolkit"):
        raise HTTPException(status_code=402, detail="PM Toolkit not active for this pro")
    return pro


def _serialise(doc: dict) -> dict:
    if not doc:
        return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    for k, v in list(doc.items()):
        if isinstance(v, ObjectId):
            doc[k] = str(v)
        elif isinstance(v, datetime):
            # MongoDB returns naive UTC datetimes — always append Z so JS parses as UTC
            doc[k] = v.isoformat() + ("Z" if v.tzinfo is None else "")
    return doc


async def _get_project_or_404(project_id: str, pro_id: str) -> dict:
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad project id")
    proj = await db.pm_projects.find_one({"_id": oid, "pro_id": pro_id})
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj


# ──────────────────────────────────────────────
# Pydantic payloads
# ──────────────────────────────────────────────
class ProjectCreate(BaseModel):
    job_id: str
    title: Optional[str] = None
    notes: Optional[str] = None


class ProjectPatch(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[Literal["active", "on_hold", "done", "archived"]] = None
    customer_status_note: Optional[str] = None  # free-text shown on the public status page
    hourly_rate_eur: Optional[float] = None  # for P&L labour calc


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    column: Literal["todo", "doing", "done"] = "todo"
    start_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    assignee: Optional[str] = None
    depends_on: Optional[str] = None


class TaskPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    column: Optional[Literal["todo", "doing", "done"]] = None
    start_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    order: Optional[int] = None
    assignee: Optional[str] = None
    depends_on: Optional[str] = None


class TaskReorderItem(BaseModel):
    id: str
    column: Literal["todo", "doing", "done"]
    order: int


class TasksReorder(BaseModel):
    """Bulk reorder/move for drag-and-drop Kanban — sent as one payload after
    a drop so the UI stays consistent even if 10+ cards shifted."""
    tasks: List[TaskReorderItem]


class MaterialCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    qty: float = 1.0
    unit: Optional[str] = "pcs"
    planned_cost: float = 0.0
    actual_cost: Optional[float] = None
    supplier: Optional[str] = None
    barcode: Optional[str] = None
    brand: Optional[str] = None
    photos: List[str] = Field(default_factory=list)


class MaterialPatch(BaseModel):
    name: Optional[str] = None
    qty: Optional[float] = None
    unit: Optional[str] = None
    planned_cost: Optional[float] = None
    actual_cost: Optional[float] = None
    supplier: Optional[str] = None
    barcode: Optional[str] = None
    brand: Optional[str] = None
    photos: Optional[List[str]] = None


class DiaryCreate(BaseModel):
    note: str = Field(min_length=1, max_length=2000)
    hours: Optional[float] = 0.0  # time-tracker
    entry_date: Optional[datetime] = None


# ── Change Orders (Nachträge) + client-portal payments ───────────────────────
class ChangeOrderItem(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    qty: float = 1.0
    unit_net: float = 0.0


class ChangeOrderCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = ""
    items: List[ChangeOrderItem] = Field(default_factory=list)
    vat_rate: float = 20.0


class ChangeOrderPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    items: Optional[List[ChangeOrderItem]] = None
    vat_rate: Optional[float] = None


class PortalSignBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    note: Optional[str] = ""


class PaymentRequestCreate(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    amount_eur: float = Field(gt=0)
    source: Optional[str] = "custom"  # custom | milestone | change_order
    source_id: Optional[str] = None


# ──────────────────────────────────────────────
# Projects CRUD
# ──────────────────────────────────────────────
@router.get("/projects")
async def list_projects(
    user: dict = Depends(get_current_user),
    status: Optional[str] = None,
):
    pro = await _require_pm_toolkit(user)
    pro_id = str(pro["_id"])
    q: dict = {"pro_id": pro_id}
    if status:
        q["status"] = status
    items: List[dict] = []
    async for p in db.pm_projects.find(q).sort("created_at", -1).limit(500):
        items.append(_serialise(p))
    return {"projects": items}


@router.post("/projects")
async def create_project(payload: ProjectCreate, user: dict = Depends(get_current_user)):
    """Bootstrap a PM project from a job the pro has won.

    Enforces that the pro actually has an accepted quote on this job to prevent
    arbitrary project creation. Idempotent — re-creating a project for the same
    job returns the existing one."""
    pro = await _require_pm_toolkit(user)
    pro_id = str(pro["_id"])

    # Sanity: pro must have an accepted quote on this job
    quote = await db.quotes.find_one({"job_id": payload.job_id, "pro_id": pro_id, "status": "accepted"})
    if not quote:
        raise HTTPException(status_code=400, detail="You can only create a project for a job you've won.")

    # Idempotency — re-use existing project for this (pro, job)
    existing = await db.pm_projects.find_one({"pro_id": pro_id, "job_id": payload.job_id})
    if existing:
        return _serialise(existing)

    try:
        job_obj = await db.jobs.find_one({"_id": ObjectId(payload.job_id)})
    except Exception:
        job_obj = None
    if not job_obj:
        raise HTTPException(status_code=404, detail="Job not found")

    # Customer snapshot — owner of the job (homeowner)
    homeowner = await db.users.find_one({"_id": ObjectId(job_obj["posted_by_id"])}) if job_obj.get("posted_by_id") else None
    customer = {
        "homeowner_id": str(homeowner["_id"]) if homeowner else None,
        "name": (homeowner or {}).get("name") if homeowner else None,
        "city": job_obj.get("city"),
    }

    now = datetime.now(timezone.utc)
    doc = {
        "pro_id": pro_id,
        "job_id": payload.job_id,
        "job_title": job_obj.get("title", ""),
        "job_category": job_obj.get("category", ""),
        "quote_price_eur": float(quote.get("price") or 0),
        "quote_travel_cost_eur": float(quote.get("travel_cost") or 0),
        "title": payload.title or job_obj.get("title", "Project"),
        "notes": payload.notes or "",
        "status": "active",
        "customer": customer,
        "customer_status_note": "",
        "share_token": token_urlsafe(16),
        "share_enabled": True,
        "sub_token": None,  # sub-contractor magic-link, generated on demand
        "hourly_rate_eur": 65.0,  # AT trades benchmark — pro can override
        "created_at": now,
        "updated_at": now,
    }
    res = await db.pm_projects.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialise(doc)


@router.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    proj = await _get_project_or_404(project_id, str(pro["_id"]))
    # Eager-load tasks/materials/diary counts to power the dashboard
    tasks_count = await db.pm_tasks.count_documents({"project_id": project_id})
    done_count = await db.pm_tasks.count_documents({"project_id": project_id, "column": "done"})
    materials_count = await db.pm_materials.count_documents({"project_id": project_id})
    diary_count = await db.pm_diary.count_documents({"project_id": project_id})
    out = _serialise(proj)
    out.update({
        "tasks_total": tasks_count,
        "tasks_done": done_count,
        "materials_count": materials_count,
        "diary_count": diary_count,
    })
    return out


@router.patch("/projects/{project_id}")
async def patch_project(project_id: str, payload: ProjectPatch, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    upd = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if not upd:
        raise HTTPException(status_code=400, detail="Empty patch")
    upd["updated_at"] = datetime.now(timezone.utc)
    await db.pm_projects.update_one({"_id": ObjectId(project_id)}, {"$set": upd})
    proj = await db.pm_projects.find_one({"_id": ObjectId(project_id)})
    return _serialise(proj)


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    await db.pm_projects.delete_one({"_id": ObjectId(project_id)})
    await db.pm_tasks.delete_many({"project_id": project_id})
    await db.pm_materials.delete_many({"project_id": project_id})
    await db.pm_diary.delete_many({"project_id": project_id})
    return {"deleted": True}


@router.post("/projects/{project_id}/rotate-share-token")
async def rotate_share_token(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    new_token = token_urlsafe(16)
    await db.pm_projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"share_token": new_token, "share_enabled": True, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"share_token": new_token}


# ──────────────────────────────────────────────
# Tasks (Kanban)
# ──────────────────────────────────────────────
@router.get("/projects/{project_id}/tasks")
async def list_tasks(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    items: List[dict] = []
    async for t in db.pm_tasks.find({"project_id": project_id}).sort([("column", 1), ("order", 1)]):
        items.append(_serialise(t))
    return {"tasks": items}


@router.get("/schedule")
async def my_schedule(user: dict = Depends(get_current_user)):
    """Cross-project crew schedule: every scheduled task across the pro's active
    projects, plus distinct crew members and double-booking conflict flags."""
    pro = await _require_pm_toolkit(user)
    projects = {}
    async for p in db.pm_projects.find({"pro_id": str(pro["_id"]), "status": {"$ne": "archived"}}):
        projects[str(p["_id"])] = {"title": p.get("title") or p.get("job_title") or "Project"}
    if not projects:
        return {"tasks": [], "crew": [], "conflicts": []}

    def _iso(dt):
        if not dt:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    tasks = []
    async for t in db.pm_tasks.find({
        "project_id": {"$in": list(projects.keys())},
        "$or": [{"start_at": {"$ne": None}}, {"due_at": {"$ne": None}}],
    }):
        s = t.get("start_at"); d = t.get("due_at")
        if s and s.tzinfo is None: s = s.replace(tzinfo=timezone.utc)
        if d and d.tzinfo is None: d = d.replace(tzinfo=timezone.utc)
        tasks.append({
            "id": str(t["_id"]),
            "project_id": t["project_id"],
            "project_title": projects[t["project_id"]]["title"],
            "title": t.get("title"),
            "column": t.get("column"),
            "assignee": t.get("assignee"),
            "start_at": _iso(t.get("start_at")),
            "due_at": _iso(t.get("due_at")),
            "_s": s, "_d": d,
        })

    crew = sorted({t["assignee"] for t in tasks if t.get("assignee")})

    # Double-booking: same assignee, date ranges overlap, different tasks
    conflicts = []
    by_assignee = {}
    for t in tasks:
        if t.get("assignee") and t["_s"] and t["_d"]:
            by_assignee.setdefault(t["assignee"], []).append(t)
    for name, items in by_assignee.items():
        items.sort(key=lambda x: x["_s"])
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                a, b = items[i], items[j]
                if b["_s"] < a["_d"]:  # overlap
                    conflicts.append({"assignee": name, "task_a": a["id"], "task_b": b["id"]})
                else:
                    break

    conflict_ids = {c["task_a"] for c in conflicts} | {c["task_b"] for c in conflicts}
    for t in tasks:
        t["conflict"] = t["id"] in conflict_ids
        t.pop("_s", None); t.pop("_d", None)
    return {"tasks": tasks, "crew": crew, "conflicts": conflicts}



@router.post("/projects/{project_id}/tasks")
async def create_task(project_id: str, payload: TaskCreate, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    # Place new tasks at the END of the requested column
    last = await db.pm_tasks.find_one(
        {"project_id": project_id, "column": payload.column},
        sort=[("order", -1)],
    )
    order_val = (last["order"] + 1) if (last and last.get("order") is not None) else 0
    now = datetime.now(timezone.utc)
    doc = {
        "project_id": project_id,
        "title": payload.title,
        "description": payload.description or "",
        "column": payload.column,
        "order": order_val,
        "start_at": payload.start_at,
        "due_at": payload.due_at,
        "assignee": (payload.assignee or "").strip() or None,
        "depends_on": payload.depends_on or None,
        "created_at": now,
        "updated_at": now,
    }
    res = await db.pm_tasks.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialise(doc)


@router.patch("/projects/{project_id}/tasks/{task_id}")
async def patch_task(project_id: str, task_id: str, payload: TaskPatch, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    try:
        oid = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad task id")
    task = await db.pm_tasks.find_one({"_id": oid, "project_id": project_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    raw = payload.dict(exclude_unset=True)
    upd = {}
    for k, v in raw.items():
        if k in ("assignee", "depends_on"):
            upd[k] = (v.strip() if isinstance(v, str) else v) or None  # empty clears it
        elif v is not None:
            upd[k] = v
    if not upd:
        raise HTTPException(status_code=400, detail="Empty patch")
    upd["updated_at"] = datetime.now(timezone.utc)
    await db.pm_tasks.update_one({"_id": oid}, {"$set": upd})
    # Smart scheduling: if dates moved, push dependent tasks so they start after this one
    if "start_at" in upd or "due_at" in upd:
        await _cascade_shift_dependents(project_id, task_id)
    return _serialise(await db.pm_tasks.find_one({"_id": oid}))


async def _cascade_shift_dependents(project_id: str, task_id: str, _seen: set | None = None) -> None:
    """When a task's dates change, shift any task depending on it to start no
    earlier than the predecessor's due date (duration preserved). Recurses."""
    _seen = _seen or set()
    if task_id in _seen:
        return
    _seen.add(task_id)
    pred = await db.pm_tasks.find_one({"_id": ObjectId(task_id), "project_id": project_id})
    pred_due = pred.get("due_at") if pred else None
    if not pred_due:
        return
    if pred_due.tzinfo is None:
        pred_due = pred_due.replace(tzinfo=timezone.utc)
    async for dep in db.pm_tasks.find({"project_id": project_id, "depends_on": task_id}):
        d_start = dep.get("start_at")
        if d_start and d_start.tzinfo is None:
            d_start = d_start.replace(tzinfo=timezone.utc)
        if d_start and d_start >= pred_due:
            continue  # already after the predecessor
        # shift forward, preserving duration if a due date exists
        new_start = pred_due
        new_due = dep.get("due_at")
        if new_due:
            if new_due.tzinfo is None:
                new_due = new_due.replace(tzinfo=timezone.utc)
            if d_start:
                new_due = new_due + (new_start - d_start)
            elif new_due < new_start:
                new_due = new_start
        await db.pm_tasks.update_one(
            {"_id": dep["_id"]},
            {"$set": {"start_at": new_start, "due_at": new_due, "updated_at": datetime.now(timezone.utc)}},
        )
        await _cascade_shift_dependents(project_id, str(dep["_id"]), _seen)


@router.delete("/projects/{project_id}/tasks/{task_id}")
async def delete_task(project_id: str, task_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    try:
        oid = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad task id")
    await db.pm_tasks.delete_one({"_id": oid, "project_id": project_id})
    return {"deleted": True}


# ──────────────────────────────────────────────
# Materials
# ──────────────────────────────────────────────
@router.get("/projects/{project_id}/materials")
async def list_materials(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    items: List[dict] = []
    total_planned = 0.0
    total_actual = 0.0
    async for m in db.pm_materials.find({"project_id": project_id}).sort("created_at", 1):
        total_planned += float(m.get("planned_cost", 0))
        total_actual += float(m.get("actual_cost", 0) or 0)
        items.append(_serialise(m))
    return {
        "materials": items,
        "totals": {
            "planned": round(total_planned, 2),
            "actual": round(total_actual, 2),
            "variance": round(total_actual - total_planned, 2),
        },
    }


@router.post("/projects/{project_id}/materials")
async def create_material(project_id: str, payload: MaterialCreate, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    now = datetime.now(timezone.utc)
    doc = {
        "project_id": project_id,
        **payload.dict(),
        "created_at": now,
        "updated_at": now,
    }
    res = await db.pm_materials.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialise(doc)


@router.patch("/projects/{project_id}/materials/{material_id}")
async def patch_material(project_id: str, material_id: str, payload: MaterialPatch, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    try:
        oid = ObjectId(material_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad material id")
    upd = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if not upd:
        raise HTTPException(status_code=400, detail="Empty patch")
    upd["updated_at"] = datetime.now(timezone.utc)
    res = await db.pm_materials.update_one({"_id": oid, "project_id": project_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Material not found")
    return _serialise(await db.pm_materials.find_one({"_id": oid}))


@router.delete("/projects/{project_id}/materials/{material_id}")
async def delete_material(project_id: str, material_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    try:
        oid = ObjectId(material_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad material id")
    await db.pm_materials.delete_one({"_id": oid, "project_id": project_id})
    return {"deleted": True}


@router.get("/barcode-lookup")
async def barcode_lookup(code: str, user: dict = Depends(get_current_user)):
    """Resolve an EAN/UPC barcode to a product name/brand via UPCitemdb's free
    trial API. Always returns gracefully: {found, barcode, name, brand, category}.
    If the lookup fails or the product is unknown, found=False and the caller
    falls back to storing the raw barcode as the material SKU."""
    await _require_pm_toolkit(user)
    code = (code or "").strip()
    if not code or not code.isdigit() or not (6 <= len(code) <= 14):
        raise HTTPException(status_code=400, detail="Invalid barcode")
    result = {"found": False, "barcode": code, "name": None, "brand": None, "category": None}
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get("https://api.upcitemdb.com/prod/trial/lookup", params={"upc": code})
        if r.status_code == 200:
            items = (r.json() or {}).get("items") or []
            if items:
                it = items[0]
                result.update({
                    "found": True,
                    "name": (it.get("title") or "").strip()[:200] or None,
                    "brand": (it.get("brand") or "").strip()[:120] or None,
                    "category": (it.get("category") or "").strip()[:120] or None,
                })
    except Exception:
        pass
    return result


# ──────────────────────────────────────────────
# Diary (time-tracker + notes)
# ──────────────────────────────────────────────
@router.get("/projects/{project_id}/diary")
async def list_diary(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    items: List[dict] = []
    total_hours = 0.0
    async for d in db.pm_diary.find({"project_id": project_id}).sort("entry_date", -1):
        total_hours += float(d.get("hours", 0) or 0)
        items.append(_serialise(d))
    return {"entries": items, "total_hours": round(total_hours, 2)}


@router.post("/projects/{project_id}/diary")
async def create_diary(project_id: str, payload: DiaryCreate, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    now = datetime.now(timezone.utc)
    doc = {
        "project_id": project_id,
        "note": payload.note,
        "hours": float(payload.hours or 0),
        "entry_date": payload.entry_date or now,
        "created_at": now,
    }
    res = await db.pm_diary.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialise(doc)


@router.delete("/projects/{project_id}/diary/{entry_id}")
async def delete_diary(project_id: str, entry_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    try:
        oid = ObjectId(entry_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad entry id")
    await db.pm_diary.delete_one({"_id": oid, "project_id": project_id})
    return {"deleted": True}


# ──────────────────────────────────────────────
# P1: Bulk task reorder (Kanban drag-and-drop)
# ──────────────────────────────────────────────
@router.post("/projects/{project_id}/tasks/reorder")
async def reorder_tasks(project_id: str, payload: TasksReorder, user: dict = Depends(get_current_user)):
    """Apply a batch of {id, column, order} updates after a kanban drop.

    We expect the FE to compute the final desired order/column for every card
    touched by the drag (typically just the dragged card and its siblings),
    then ship them as one payload so partial failures don't corrupt the board.
    """
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    if not payload.tasks:
        return {"updated": 0}

    now = datetime.now(timezone.utc)
    updated = 0
    for item in payload.tasks:
        try:
            oid = ObjectId(item.id)
        except Exception:
            continue
        res = await db.pm_tasks.update_one(
            {"_id": oid, "project_id": project_id},
            {"$set": {"column": item.column, "order": item.order, "updated_at": now}},
        )
        updated += res.modified_count
    return {"updated": updated}


# ──────────────────────────────────────────────
# P1: Time-tracker timer (start/stop)
#
# A "timer" is a pm_timers doc with started_at + project_id + pro_id. Only ONE
# active timer per pro at a time — starting a new one stops the previous and
# auto-creates a diary entry from the elapsed hours.
# ──────────────────────────────────────────────
@router.get("/timer")
async def get_running_timer(user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    pro_id = str(pro["_id"])
    t = await db.pm_timers.find_one({"pro_id": pro_id, "stopped_at": None})
    if not t:
        return {"running": None}
    return {"running": _serialise(t)}


@router.post("/projects/{project_id}/timer/start")
async def start_timer(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    proj = await _get_project_or_404(project_id, str(pro["_id"]))
    pro_id = str(pro["_id"])
    now = datetime.now(timezone.utc)

    # Stop any existing timer for this pro first (auto-flush to diary)
    existing = await db.pm_timers.find_one({"pro_id": pro_id, "stopped_at": None})
    if existing:
        await _stop_timer_and_flush(existing, now)

    doc = {
        "pro_id": pro_id,
        "project_id": project_id,
        "project_title": proj.get("title", ""),
        "started_at": now,
        "stopped_at": None,
        "created_at": now,
    }
    res = await db.pm_timers.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialise(doc)


@router.post("/projects/{project_id}/timer/stop")
async def stop_timer(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    pro_id = str(pro["_id"])
    t = await db.pm_timers.find_one({"pro_id": pro_id, "project_id": project_id, "stopped_at": None})
    if not t:
        raise HTTPException(status_code=404, detail="No running timer for this project")
    diary_doc = await _stop_timer_and_flush(t, datetime.now(timezone.utc))
    return {"stopped": True, "diary": _serialise(diary_doc) if diary_doc else None}


async def _stop_timer_and_flush(timer: dict, now: datetime) -> Optional[dict]:
    """Mark timer stopped and roll the elapsed time into a diary entry. Idempotent."""
    started = timer["started_at"]
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    elapsed_sec = (now - started).total_seconds()
    hours = round(elapsed_sec / 3600.0, 2)
    await db.pm_timers.update_one(
        {"_id": timer["_id"]},
        {"$set": {"stopped_at": now, "elapsed_hours": hours}},
    )
    if hours < 0.01:
        return None  # too short — skip diary entry
    diary_doc = {
        "project_id": timer["project_id"],
        "note": f"⏱ Tracked time ({hours:.2f} h)",
        "hours": hours,
        "entry_date": started,
        "source": "timer",
        "timer_id": str(timer["_id"]),
        "created_at": now,
    }
    res = await db.pm_diary.insert_one(diary_doc)
    diary_doc["_id"] = res.inserted_id
    return diary_doc


# ──────────────────────────────────────────────
# P1: Project Templates (save & apply)
# ──────────────────────────────────────────────
class TemplateTask(BaseModel):
    title: str
    column: Literal["todo", "doing", "done"] = "todo"
    description: Optional[str] = None


class TemplateMaterial(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    qty: float = 1.0
    unit: Optional[str] = "pcs"
    planned_cost: float = 0.0
    supplier: Optional[str] = None


class TemplateMilestone(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    percent: Optional[float] = None        # % of contract base amount
    amount_eur: Optional[float] = None     # or a fixed amount


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: Optional[str] = None
    tasks: List[TemplateTask]
    materials: List[TemplateMaterial] = Field(default_factory=list)
    milestones: List[TemplateMilestone] = Field(default_factory=list)


class TemplateFromProject(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: Optional[str] = None


@router.get("/templates")
async def list_templates(user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    pro_id = str(pro["_id"])
    items: List[dict] = []
    # Pro-owned templates + curated built-ins
    async for tpl in db.pm_templates.find({"$or": [{"pro_id": pro_id}, {"pro_id": None}]}).sort("created_at", -1):
        items.append(_serialise(tpl))
    # If no pro-owned and no built-ins, surface the curated defaults (no DB write)
    if not items:
        for tpl in _BUILTIN_TEMPLATES:
            items.append({**tpl, "id": f"builtin-{tpl['name'].lower().replace(' ', '-')}", "builtin": True})
    return {"templates": items}


@router.post("/templates")
async def create_template(payload: TemplateCreate, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    pro_id = str(pro["_id"])
    now = datetime.now(timezone.utc)
    doc = {
        "pro_id": pro_id,
        "name": payload.name,
        "category": payload.category,
        "tasks": [t.dict() for t in payload.tasks],
        "materials": [m.dict() for m in payload.materials],
        "milestones": [ms.dict() for ms in payload.milestones],
        "created_at": now,
        "updated_at": now,
    }
    res = await db.pm_templates.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialise(doc)


@router.post("/templates/from-project/{project_id}")
async def save_project_as_template(project_id: str, payload: TemplateFromProject, user: dict = Depends(get_current_user)):
    """Snapshot a project's current tasks + materials into a reusable template."""
    pro = await _require_pm_toolkit(user)
    pro_id = str(pro["_id"])
    await _get_project_or_404(project_id, pro_id)
    now = datetime.now(timezone.utc)

    tasks = []
    async for tk in db.pm_tasks.find({"project_id": project_id}).sort([("column", 1), ("order", 1)]):
        tasks.append({"title": tk.get("title", ""), "column": tk.get("column", "todo"), "description": tk.get("description", "")})
    materials = []
    async for m in db.pm_materials.find({"project_id": project_id}).sort("created_at", 1):
        materials.append({
            "name": m.get("name", ""), "qty": float(m.get("qty", 1)), "unit": m.get("unit", "pcs"),
            "planned_cost": float(m.get("planned_cost", 0)), "supplier": m.get("supplier"),
        })
    milestones = []
    async for p in db.pm_payment_requests.find({"project_id": project_id}).sort("created_at", 1):
        milestones.append({"label": p.get("label", ""), "percent": None, "amount_eur": float(p.get("amount_eur", 0))})

    if not tasks and not materials:
        raise HTTPException(status_code=400, detail="Project has nothing to save as a template yet.")

    doc = {
        "pro_id": pro_id, "name": payload.name, "category": payload.category,
        "tasks": tasks, "materials": materials, "milestones": milestones,
        "created_at": now, "updated_at": now,
    }
    res = await db.pm_templates.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialise(doc)


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    pro_id = str(pro["_id"])
    try:
        oid = ObjectId(template_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad template id")
    res = await db.pm_templates.delete_one({"_id": oid, "pro_id": pro_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"deleted": True}


@router.post("/projects/{project_id}/apply-template")
async def apply_template(project_id: str, template_id: str, base_amount: float = 0.0, user: dict = Depends(get_current_user)):
    """Bulk-create tasks (+ optional materials & milestone payments) on a project
    from a saved template or built-in. `base_amount` is the contract value used to
    turn percent-based milestones into payment requests."""
    pro = await _require_pm_toolkit(user)
    proj = await _get_project_or_404(project_id, str(pro["_id"]))

    tasks_data: Optional[list] = None
    materials_data: list = []
    milestones_data: list = []
    if template_id.startswith("builtin-"):
        slug = template_id.replace("builtin-", "")
        for tpl in _BUILTIN_TEMPLATES:
            if tpl["name"].lower().replace(" ", "-") == slug:
                tasks_data = tpl["tasks"]
                materials_data = tpl.get("materials", [])
                milestones_data = tpl.get("milestones", [])
                break
    else:
        try:
            tpl_doc = await db.pm_templates.find_one({"_id": ObjectId(template_id)})
        except Exception:
            tpl_doc = None
        if not tpl_doc:
            raise HTTPException(status_code=404, detail="Template not found")
        tasks_data = tpl_doc.get("tasks", [])
        materials_data = tpl_doc.get("materials", [])
        milestones_data = tpl_doc.get("milestones", [])

    if not tasks_data:
        raise HTTPException(status_code=400, detail="Template has no tasks")

    now = datetime.now(timezone.utc)
    # Place new tasks at the END of each column they target
    last_by_col: dict = {}
    async for last in db.pm_tasks.find({"project_id": project_id}).sort([("column", 1), ("order", -1)]):
        last_by_col.setdefault(last["column"], last.get("order", -1))

    docs = []
    for tdef in tasks_data:
        col = tdef.get("column", "todo")
        order_val = last_by_col.get(col, -1) + 1
        last_by_col[col] = order_val
        docs.append({
            "project_id": project_id,
            "title": tdef["title"],
            "description": tdef.get("description", ""),
            "column": col,
            "order": order_val,
            "start_at": None,
            "due_at": None,
            "created_at": now,
            "updated_at": now,
        })
    if docs:
        await db.pm_tasks.insert_many(docs)

    # Materials
    mat_docs = []
    for m in materials_data:
        if not m.get("name"):
            continue
        mat_docs.append({
            "project_id": project_id, "name": m["name"], "qty": float(m.get("qty", 1)),
            "unit": m.get("unit", "pcs"), "planned_cost": float(m.get("planned_cost", 0)),
            "actual_cost": None, "supplier": m.get("supplier"), "barcode": None, "brand": None,
            "created_at": now, "updated_at": now,
        })
    if mat_docs:
        await db.pm_materials.insert_many(mat_docs)

    # Milestone payment requests (best-effort: needs IBAN + a resolvable amount)
    payments_created = 0
    milestone_skipped = bool(milestones_data) and not pro.get("bank_iban")
    if milestones_data and pro.get("bank_iban"):
        count = await db.pm_payment_requests.count_documents({"project_id": project_id})
        pay_docs = []
        for ms in milestones_data:
            amt = ms.get("amount_eur")
            if (amt is None or amt <= 0) and ms.get("percent") and base_amount > 0:
                amt = round(float(ms["percent"]) / 100.0 * float(base_amount), 2)
            if not amt or amt <= 0:
                continue
            count += 1
            pay_docs.append({
                "project_id": project_id, "pro_id": str(pro["_id"]),
                "reference": f"PAY-{count:03d}", "label": ms.get("label", "Milestone"),
                "amount_eur": round(float(amt), 2), "source": "milestone", "source_id": None,
                "status": "requested", "created_at": now, "client_marked_at": None, "paid_at": None,
            })
        if pay_docs:
            await db.pm_payment_requests.insert_many(pay_docs)
            payments_created = len(pay_docs)

    return {
        "created": len(docs),
        "tasks_created": len(docs),
        "materials_created": len(mat_docs),
        "payments_created": payments_created,
        "milestone_skipped_no_iban": milestone_skipped,
    }


# ──────────────────────────────────────────────
# P1: Sub-contractor magic-link
# ──────────────────────────────────────────────
@router.post("/projects/{project_id}/sub-invite")
async def issue_sub_invite(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    new_token = token_urlsafe(20)
    await db.pm_projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"sub_token": new_token, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"sub_token": new_token}


@router.post("/projects/{project_id}/sub-revoke")
async def revoke_sub_invite(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    await db.pm_projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"sub_token": None, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"revoked": True}


# ──────────────────────────────────────────────
# P1: Project Overview aggregation
# Returns Job/Customer/Quote/Invoices/P&L/Activity in ONE call so the new
# overview tab renders fast without N+1 client requests.
# ──────────────────────────────────────────────
@router.get("/projects/{project_id}/overview")
async def project_overview(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    proj = await _get_project_or_404(project_id, str(pro["_id"]))

    # ---- Job snapshot (description, photos, location)
    job = None
    try:
        job = await db.jobs.find_one({"_id": ObjectId(proj["job_id"])})
    except Exception:
        pass
    job_block = {}
    if job:
        photos = []
        for p in (job.get("photos") or [])[:8]:
            pid = p.get("file_id") if isinstance(p, dict) else None
            if pid:
                photos.append(f"/api/uploads/{pid}")
        job_block = {
            "title": job.get("title"),
            "description": job.get("description") or job.get("details", ""),
            "category": job.get("category"),
            "city": job.get("city"),
            "address": job.get("address"),
            "postal_code": job.get("postal_code"),
            "lat": job.get("lat"),
            "lng": job.get("lng"),
            "photos": photos,
            "created_at": job.get("created_at"),
        }

    # ---- Customer (homeowner)
    homeowner = None
    if proj.get("customer", {}).get("homeowner_id"):
        try:
            homeowner = await db.users.find_one({"_id": ObjectId(proj["customer"]["homeowner_id"])})
        except Exception:
            pass
    cust_block = {
        "name": (homeowner or {}).get("name") or proj.get("customer", {}).get("name"),
        "email": (homeowner or {}).get("email"),
        "phone": (homeowner or {}).get("phone"),
        "address": (homeowner or {}).get("address"),
        "city": (homeowner or {}).get("city") or proj.get("customer", {}).get("city"),
        "postal_code": (homeowner or {}).get("postal_code"),
    }

    # ---- Quote details (revenue baseline)
    quote = await db.quotes.find_one({"job_id": proj["job_id"], "pro_id": str(pro["_id"]), "status": "accepted"})
    quote_block = {
        "price_eur": float(quote.get("price")) if quote else float(proj.get("quote_price_eur", 0)),
        "travel_cost_eur": float(quote.get("travel_cost") or 0) if quote else float(proj.get("quote_travel_cost_eur", 0)),
        "message": (quote or {}).get("message", ""),
        "accepted_at": (quote or {}).get("accepted_at"),
    }

    # ---- Chat thread snippet (last 3 messages)
    chat_block = {"thread_id": None, "messages": []}
    if proj.get("customer", {}).get("homeowner_id"):
        thread = await db.threads.find_one({
            "job_id": proj["job_id"],
            "participants": {"$all": [str(pro["user_id"]), proj["customer"]["homeowner_id"]]},
        })
        if thread:
            chat_block["thread_id"] = str(thread["_id"])
            msgs = []
            async for m in db.messages.find({"thread_id": str(thread["_id"])}).sort("created_at", -1).limit(3):
                msgs.append({
                    "id": str(m["_id"]),
                    "body": m.get("body", "")[:160],
                    "sender_id": m.get("sender_id"),
                    "sent_by_me": m.get("sender_id") == str(pro["user_id"]),
                    "created_at": m.get("created_at"),
                })
            chat_block["messages"] = list(reversed(msgs))

    # ---- Invoices for this project
    inv_block = []
    async for inv in db.pro_invoices.find({"pro_id": str(pro["_id"]), "job_id": proj["job_id"]}).sort("invoice_date", -1):
        inv_block.append({
            "id": str(inv["_id"]),
            "invoice_number": inv.get("invoice_number"),
            "brutto_total": inv.get("brutto_total"),
            "status": inv.get("status"),
            "invoice_date": inv.get("invoice_date"),
        })

    # ---- P&L (Revenue - Materials.actual - Labour (hours × rate))
    materials_actual = 0.0
    materials_planned = 0.0
    async for m in db.pm_materials.find({"project_id": project_id}):
        materials_planned += float(m.get("planned_cost") or 0)
        materials_actual += float(m.get("actual_cost") or 0)

    total_hours = 0.0
    async for d in db.pm_diary.find({"project_id": project_id}):
        total_hours += float(d.get("hours") or 0)

    hourly_rate = float(proj.get("hourly_rate_eur", 65.0))
    revenue = quote_block["price_eur"]
    labour_cost = round(total_hours * hourly_rate, 2)
    profit = round(revenue - materials_actual - labour_cost, 2)

    pl_block = {
        "revenue_eur": revenue,
        "materials_actual_eur": round(materials_actual, 2),
        "materials_planned_eur": round(materials_planned, 2),
        "labour_hours": round(total_hours, 2),
        "labour_rate_eur": hourly_rate,
        "labour_cost_eur": labour_cost,
        "profit_eur": profit,
        "margin_pct": round(profit / revenue * 100, 1) if revenue > 0 else 0,
    }

    # ---- Progress
    tasks_total = await db.pm_tasks.count_documents({"project_id": project_id})
    tasks_done = await db.pm_tasks.count_documents({"project_id": project_id, "column": "done"})
    progress_pct = round((tasks_done / tasks_total) * 100, 1) if tasks_total else 0.0

    # ---- Activity timeline (derived, no writes)
    activity: List[dict] = []
    activity.append({
        "ts": proj.get("created_at"),
        "kind": "project_created",
        "label": "Project created from won job",
    })
    if quote_block["accepted_at"]:
        activity.append({"ts": quote_block["accepted_at"], "kind": "quote_accepted", "label": f"Quote accepted (€{quote_block['price_eur']:.2f})"})
    async for inv in db.pro_invoices.find({"pro_id": str(pro["_id"]), "job_id": proj["job_id"]}):
        activity.append({"ts": inv.get("invoice_date"), "kind": "invoice", "label": f"Invoice {inv.get('invoice_number')} issued (€{inv.get('brutto_total',0):.2f})"})
    # Recent diary
    async for d in db.pm_diary.find({"project_id": project_id}).sort("entry_date", -1).limit(5):
        activity.append({"ts": d.get("entry_date"), "kind": "diary", "label": d.get("note", "")[:80]})
    activity.sort(key=lambda a: a["ts"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    activity = activity[:12]

    return {
        "project": _serialise(proj),
        "job": job_block,
        "customer": cust_block,
        "quote": quote_block,
        "chat": chat_block,
        "invoices": inv_block,
        "pl": pl_block,
        "tasks_total": tasks_total,
        "tasks_done": tasks_done,
        "progress_pct": progress_pct,
        "activity": activity,
    }


def _safe_filename(name: str) -> str:
    """Slugify a project title for use in a Content-Disposition filename."""
    keep = "".join(c if (c.isalnum() or c in " -_") else "" for c in (name or "")).strip()
    return ("-".join(keep.split()) or "project")[:60]


@router.get("/projects/{project_id}/export-pdf")
async def export_project_job_file(
    project_id: str,
    lang: str = Query("en"),
    user: dict = Depends(get_current_user),
):
    """Generate a complete Job File PDF dossier for a COMPLETED project (pro)."""
    pro = await _require_pm_toolkit(user)
    proj = await _get_project_or_404(project_id, str(pro["_id"]))
    if proj.get("status") != "done":
        raise HTTPException(status_code=400, detail="Job File export is only available for completed projects.")
    from services.pm_pdf_export import generate_job_file_pdf
    pdf = await generate_job_file_pdf(proj, lang)
    fname = _safe_filename(proj.get("title") or proj.get("job_title") or "project")
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Jobfile-{fname}.pdf"'},
    )


# ──────────────────────────────────────────────
# P1: Convert project to invoice (auto-import line items)
# ──────────────────────────────────────────────
@router.post("/projects/{project_id}/to-invoice")
async def project_to_invoice_draft(project_id: str, user: dict = Depends(get_current_user)):
    """Returns a *draft* invoice payload — line items derived from materials.actual
    + labour (hours × hourly_rate). Frontend then opens the invoice editor with
    these prefilled so the pro can review before submitting.
    """
    pro = await _require_pm_toolkit(user)
    proj = await _get_project_or_404(project_id, str(pro["_id"]))

    line_items: list = []
    async for m in db.pm_materials.find({"project_id": project_id}):
        amt = float(m.get("actual_cost") or m.get("planned_cost") or 0)
        if amt > 0:
            line_items.append({
                "description": f"{m.get('name')} ({m.get('qty', 1)} {m.get('unit', 'pcs')})",
                "qty": 1,
                "unit_net": round(amt, 2),
            })
    total_hours = 0.0
    async for d in db.pm_diary.find({"project_id": project_id}):
        total_hours += float(d.get("hours") or 0)
    if total_hours > 0:
        rate = float(proj.get("hourly_rate_eur", 65.0))
        line_items.append({
            "description": f"Arbeitszeit / Labour ({total_hours:.2f} h × €{rate:.2f}/h)",
            "qty": round(total_hours, 2),
            "unit_net": round(rate, 2),
        })

    return {
        "job_id": proj["job_id"],
        "homeowner_id": proj.get("customer", {}).get("homeowner_id"),
        "line_items": line_items,
        "note": f"Projekt: {proj.get('title')}",
    }


# ──────────────────────────────────────────────
# Change Orders (Nachträge) — extra work approved by the client
# ──────────────────────────────────────────────
def _co_totals(items: List[dict], vat_rate: float) -> dict:
    net = round(sum(float(i.get("qty", 1)) * float(i.get("unit_net", 0)) for i in items), 2)
    brutto = round(net * (1 + float(vat_rate) / 100.0), 2)
    return {"net_total": net, "brutto_total": brutto}


async def _co_or_404(project_id: str, co_id: str, pro_id: str) -> dict:
    try:
        oid = ObjectId(co_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad change-order id")
    co = await db.pm_change_orders.find_one({"_id": oid, "project_id": project_id, "pro_id": pro_id})
    if not co:
        raise HTTPException(status_code=404, detail="Change order not found")
    return co


@router.get("/projects/{project_id}/change-orders")
async def list_change_orders(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    out = []
    async for co in db.pm_change_orders.find({"project_id": project_id, "pro_id": str(pro["_id"])}).sort("created_at", -1):
        out.append(_serialise(co))
    return out


@router.post("/projects/{project_id}/change-orders")
async def create_change_order(project_id: str, payload: ChangeOrderCreate, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    count = await db.pm_change_orders.count_documents({"project_id": project_id})
    items = [i.dict() for i in payload.items]
    totals = _co_totals(items, payload.vat_rate)
    now = datetime.now(timezone.utc)
    doc = {
        "project_id": project_id,
        "pro_id": str(pro["_id"]),
        "number": f"CO-{count + 1:03d}",
        "title": payload.title,
        "description": payload.description or "",
        "items": items,
        "vat_rate": float(payload.vat_rate),
        **totals,
        "status": "draft",
        "created_at": now,
        "updated_at": now,
    }
    res = await db.pm_change_orders.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialise(doc)


@router.patch("/projects/{project_id}/change-orders/{co_id}")
async def patch_change_order(project_id: str, co_id: str, payload: ChangeOrderPatch, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    co = await _co_or_404(project_id, co_id, str(pro["_id"]))
    if co.get("status") not in ("draft", "sent"):
        raise HTTPException(status_code=400, detail="Approved/invoiced change orders cannot be edited.")
    upd = payload.dict(exclude_unset=True)
    if "items" in upd and upd["items"] is not None:
        upd["items"] = [i if isinstance(i, dict) else i.dict() for i in upd["items"]]
    vat = upd.get("vat_rate", co.get("vat_rate", 20))
    items = upd.get("items", co.get("items", []))
    upd.update(_co_totals(items, vat))
    upd["updated_at"] = datetime.now(timezone.utc)
    await db.pm_change_orders.update_one({"_id": ObjectId(co_id)}, {"$set": upd})
    return _serialise(await db.pm_change_orders.find_one({"_id": ObjectId(co_id)}))


@router.delete("/projects/{project_id}/change-orders/{co_id}")
async def delete_change_order(project_id: str, co_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    co = await _co_or_404(project_id, co_id, str(pro["_id"]))
    if co.get("status") == "invoiced":
        raise HTTPException(status_code=400, detail="Invoiced change orders cannot be deleted.")
    await db.pm_change_orders.delete_one({"_id": ObjectId(co_id)})
    return {"deleted": True}


@router.post("/projects/{project_id}/change-orders/{co_id}/send")
async def send_change_order(project_id: str, co_id: str, user: dict = Depends(get_current_user)):
    """Publish the change order to the client portal for approval."""
    pro = await _require_pm_toolkit(user)
    proj = await _get_project_or_404(project_id, str(pro["_id"]))
    co = await _co_or_404(project_id, co_id, str(pro["_id"]))
    if not co.get("items"):
        raise HTTPException(status_code=400, detail="Add at least one line item before sending.")
    await db.pm_change_orders.update_one(
        {"_id": ObjectId(co_id)},
        {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc)}},
    )
    co_full = await db.pm_change_orders.find_one({"_id": ObjectId(co_id)})
    await _notify_homeowner_co_sent(proj, co_full)
    return _serialise(co_full)


@router.post("/projects/{project_id}/change-orders/{co_id}/to-invoice")
async def change_order_to_invoice(project_id: str, co_id: str, user: dict = Depends(get_current_user)):
    """Return a draft invoice payload from an APPROVED change order."""
    pro = await _require_pm_toolkit(user)
    proj = await _get_project_or_404(project_id, str(pro["_id"]))
    co = await _co_or_404(project_id, co_id, str(pro["_id"]))
    if co.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Only client-approved change orders can be invoiced.")
    line_items = [{
        "description": it.get("description"),
        "qty": float(it.get("qty", 1)),
        "unit_net": float(it.get("unit_net", 0)),
    } for it in co.get("items", [])]
    return {
        "job_id": proj["job_id"],
        "homeowner_id": proj.get("customer", {}).get("homeowner_id"),
        "line_items": line_items,
        "note": f"Nachtrag {co.get('number')}: {co.get('title')}",
        "change_order_id": co_id,
    }


# ──────────────────────────────────────────────
# Payment requests (milestone / change-order / custom) — bank-transfer (EPC-QR)
# ──────────────────────────────────────────────
@router.get("/projects/{project_id}/payments")
async def list_payment_requests(project_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    out = []
    async for p in db.pm_payment_requests.find({"project_id": project_id}).sort("created_at", -1):
        out.append(_serialise(p))
    return out


@router.post("/projects/{project_id}/payments")
async def create_payment_request(project_id: str, payload: PaymentRequestCreate, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    proj = await _get_project_or_404(project_id, str(pro["_id"]))
    if not pro.get("bank_iban"):
        raise HTTPException(status_code=400, detail="Add your IBAN in Settings → Invoicing before requesting payments.")
    now = datetime.now(timezone.utc)
    count = await db.pm_payment_requests.count_documents({"project_id": project_id})
    doc = {
        "project_id": project_id,
        "pro_id": str(pro["_id"]),
        "reference": f"PAY-{count + 1:03d}",
        "label": payload.label,
        "amount_eur": round(float(payload.amount_eur), 2),
        "source": payload.source or "custom",
        "source_id": payload.source_id,
        "status": "requested",       # requested | client_marked_paid | paid
        "created_at": now,
        "client_marked_at": None,
        "paid_at": None,
    }
    res = await db.pm_payment_requests.insert_one(doc)
    doc["_id"] = res.inserted_id
    await _notify_homeowner_payment_requested(proj, doc)
    return _serialise(doc)


@router.post("/projects/{project_id}/payments/{pay_id}/mark-paid")
async def mark_payment_paid(project_id: str, pay_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    try:
        oid = ObjectId(pay_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad id")
    res = await db.pm_payment_requests.update_one(
        {"_id": oid, "project_id": project_id, "pro_id": str(pro["_id"])},
        {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Payment request not found")
    return _serialise(await db.pm_payment_requests.find_one({"_id": oid}))


@router.delete("/projects/{project_id}/payments/{pay_id}")
async def delete_payment_request(project_id: str, pay_id: str, user: dict = Depends(get_current_user)):
    pro = await _require_pm_toolkit(user)
    await _get_project_or_404(project_id, str(pro["_id"]))
    try:
        oid = ObjectId(pay_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad id")
    await db.pm_payment_requests.delete_one({"_id": oid, "project_id": project_id, "pro_id": str(pro["_id"])})
    return {"deleted": True}



_BUILTIN_TEMPLATES = [
    {
        "name": "Kitchen renovation",
        "category": "renovation",
        "tasks": [
            {"title": "Site survey + measurements", "column": "todo"},
            {"title": "Order materials", "column": "todo"},
            {"title": "Demolish existing kitchen", "column": "todo"},
            {"title": "Plumbing rough-in", "column": "todo"},
            {"title": "Electrical rough-in", "column": "todo"},
            {"title": "Drywall & paint", "column": "todo"},
            {"title": "Install cabinets", "column": "todo"},
            {"title": "Install countertops", "column": "todo"},
            {"title": "Install appliances", "column": "todo"},
            {"title": "Final cleanup & walkthrough", "column": "todo"},
        ],
        "materials": [
            {"name": "Base & wall cabinets (set)", "qty": 1, "unit": "set", "planned_cost": 3500},
            {"name": "Worktop / countertop", "qty": 1, "unit": "pcs", "planned_cost": 900},
            {"name": "Sink + mixer tap", "qty": 1, "unit": "pcs", "planned_cost": 250},
            {"name": "Tiles (m²)", "qty": 12, "unit": "m²", "planned_cost": 30},
            {"name": "Paint (10L)", "qty": 1, "unit": "pcs", "planned_cost": 80},
        ],
        "milestones": [
            {"label": "Deposit (on order)", "percent": 30},
            {"label": "Mid-project (rough-in done)", "percent": 40},
            {"label": "Final (handover)", "percent": 30},
        ],
    },
    {
        "name": "Bathroom renovation",
        "category": "renovation",
        "tasks": [
            {"title": "Demolish old fixtures", "column": "todo"},
            {"title": "Waterproofing", "column": "todo"},
            {"title": "Tile floor & walls", "column": "todo"},
            {"title": "Install plumbing fixtures", "column": "todo"},
            {"title": "Install vanity & mirror", "column": "todo"},
            {"title": "Grout & seal", "column": "todo"},
            {"title": "Final cleanup", "column": "todo"},
        ],
        "materials": [
            {"name": "Wall & floor tiles (m²)", "qty": 25, "unit": "m²", "planned_cost": 28},
            {"name": "Waterproofing membrane kit", "qty": 1, "unit": "kit", "planned_cost": 120},
            {"name": "Toilet + cistern", "qty": 1, "unit": "pcs", "planned_cost": 220},
            {"name": "Shower set + mixer", "qty": 1, "unit": "pcs", "planned_cost": 300},
            {"name": "Vanity unit + basin", "qty": 1, "unit": "pcs", "planned_cost": 350},
        ],
        "milestones": [
            {"label": "Deposit (on order)", "percent": 40},
            {"label": "Final (handover)", "percent": 60},
        ],
    },
    {
        "name": "Painting job",
        "category": "painting",
        "tasks": [
            {"title": "Surface prep & masking", "column": "todo"},
            {"title": "Prime walls", "column": "todo"},
            {"title": "First coat", "column": "todo"},
            {"title": "Second coat", "column": "todo"},
            {"title": "Touch-ups & cleanup", "column": "todo"},
        ],
        "materials": [
            {"name": "Primer (10L)", "qty": 1, "unit": "pcs", "planned_cost": 60},
            {"name": "Wall paint (10L)", "qty": 2, "unit": "pcs", "planned_cost": 75},
            {"name": "Masking tape + sheeting", "qty": 1, "unit": "kit", "planned_cost": 25},
            {"name": "Rollers & brushes", "qty": 1, "unit": "kit", "planned_cost": 35},
        ],
        "milestones": [
            {"label": "Deposit", "percent": 30},
            {"label": "Final (handover)", "percent": 70},
        ],
    },
    {
        "name": "Boiler installation",
        "category": "heating",
        "tasks": [
            {"title": "Site inspection", "column": "todo"},
            {"title": "Decommission old boiler", "column": "todo"},
            {"title": "Install new unit", "column": "todo"},
            {"title": "Pressure test & commissioning", "column": "todo"},
            {"title": "Customer handover", "column": "todo"},
        ],
        "materials": [
            {"name": "Combi boiler unit", "qty": 1, "unit": "pcs", "planned_cost": 1200},
            {"name": "Flue kit", "qty": 1, "unit": "kit", "planned_cost": 120},
            {"name": "Pipework & fittings", "qty": 1, "unit": "kit", "planned_cost": 150},
            {"name": "Magnetic system filter", "qty": 1, "unit": "pcs", "planned_cost": 90},
        ],
        "milestones": [
            {"label": "Deposit (on order)", "percent": 50},
            {"label": "Final (commissioned)", "percent": 50},
        ],
    },
    {
        "name": "Electrical rewire",
        "category": "electrical",
        "tasks": [
            {"title": "Inspection & circuit plan", "column": "todo"},
            {"title": "Isolate & strip old wiring", "column": "todo"},
            {"title": "First fix (cables & back boxes)", "column": "todo"},
            {"title": "Consumer unit upgrade", "column": "todo"},
            {"title": "Second fix (sockets & switches)", "column": "todo"},
            {"title": "Testing & certification", "column": "todo"},
        ],
        "materials": [
            {"name": "Twin & earth cable (100m)", "qty": 2, "unit": "roll", "planned_cost": 95},
            {"name": "Consumer unit (board)", "qty": 1, "unit": "pcs", "planned_cost": 180},
            {"name": "Sockets & switches (set)", "qty": 1, "unit": "set", "planned_cost": 160},
            {"name": "Back boxes & accessories", "qty": 1, "unit": "kit", "planned_cost": 70},
        ],
        "milestones": [
            {"label": "Deposit", "percent": 40},
            {"label": "First fix complete", "percent": 30},
            {"label": "Final (certified)", "percent": 30},
        ],
    },
]



# ──────────────────────────────────────────────
# PUBLIC customer status page (no auth, share-token gated)
# ──────────────────────────────────────────────
public_router = APIRouter(prefix="/pm/public")


@public_router.get("/sub/{sub_token}")
async def sub_contractor_view(sub_token: str):
    """Sub-contractor scoped view (no account needed). Returns just enough to
    work on the Kanban + log diary entries — never exposes invoices, P&L,
    customer contact info."""
    proj = await db.pm_projects.find_one({"sub_token": sub_token})
    if not proj:
        raise HTTPException(status_code=404, detail="Invitation revoked or invalid")
    pid = str(proj["_id"])
    tasks: list = []
    async for t in db.pm_tasks.find({"project_id": pid}).sort([("column", 1), ("order", 1)]):
        tasks.append(_serialise(t))
    return {
        "project_id": pid,
        "title": proj.get("title"),
        "job_category": proj.get("job_category"),
        "city": proj.get("customer", {}).get("city"),
        "tasks": tasks,
    }


@public_router.patch("/sub/{sub_token}/tasks/{task_id}")
async def sub_patch_task(sub_token: str, task_id: str, payload: TaskPatch):
    """Sub can only move cards or tick them done — not delete, not rename."""
    proj = await db.pm_projects.find_one({"sub_token": sub_token})
    if not proj:
        raise HTTPException(status_code=404, detail="Invitation revoked or invalid")
    allowed = {k: v for k, v in payload.dict(exclude_unset=True).items() if k in ("column", "order") and v is not None}
    if not allowed:
        raise HTTPException(status_code=400, detail="Sub-contractors can only move cards.")
    try:
        oid = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad task id")
    allowed["updated_at"] = datetime.now(timezone.utc)
    res = await db.pm_tasks.update_one({"_id": oid, "project_id": str(proj["_id"])}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return _serialise(await db.pm_tasks.find_one({"_id": oid}))


class SubDiaryBody(BaseModel):
    note: str = Field(min_length=1, max_length=1000)
    hours: Optional[float] = 0.0
    author_name: Optional[str] = None  # who logged it (free-text since no account)


@public_router.post("/sub/{sub_token}/diary")
async def sub_add_diary(sub_token: str, body: SubDiaryBody):
    proj = await db.pm_projects.find_one({"sub_token": sub_token})
    if not proj:
        raise HTTPException(status_code=404, detail="Invitation revoked or invalid")
    now = datetime.now(timezone.utc)
    name = (body.author_name or "Sub-contractor").strip()[:60]
    doc = {
        "project_id": str(proj["_id"]),
        "note": f"[{name}] {body.note}",
        "hours": float(body.hours or 0),
        "entry_date": now,
        "source": "sub",
        "created_at": now,
    }
    res = await db.pm_diary.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialise(doc)


async def build_customer_project_payload(proj: dict) -> dict:
    """Rich customer-facing project payload (progress, diary, photos, change
    orders, payments + EPC-QR, financials, bank, pro snapshot). Shared by the
    public share-token page AND the authenticated homeowner 'My Projects' page."""
    pid = str(proj["_id"])
    tasks_total = await db.pm_tasks.count_documents({"project_id": pid})
    tasks_done = await db.pm_tasks.count_documents({"project_id": pid, "column": "done"})
    tasks_doing = await db.pm_tasks.count_documents({"project_id": pid, "column": "doing"})

    # Latest 5 diary notes — public but sanitised
    diary_items: list = []
    async for d in db.pm_diary.find({"project_id": pid}).sort("entry_date", -1).limit(5):
        diary_items.append({
            "id": str(d["_id"]),
            "note": d.get("note", ""),
            "entry_date": d.get("entry_date"),
        })

    # Pro snapshot (business name only — no contact details on public page)
    pro_doc = await db.pro_profiles.find_one({"_id": ObjectId(proj["pro_id"])})
    pro_user = await db.users.find_one({"_id": ObjectId(pro_doc["user_id"])}) if pro_doc else None
    pro_snap = {
        "name": (pro_doc or {}).get("business_name") or (pro_user or {}).get("name") or "Your Pro",
        "city": (pro_user or {}).get("city"),
    }

    progress_pct = round((tasks_done / tasks_total) * 100, 1) if tasks_total else 0.0

    # ── Progress photos (from the original job) ──────────────────────────────
    photos: list = []
    try:
        job = await db.jobs.find_one({"_id": ObjectId(proj["job_id"])})
    except Exception:
        job = None
    for p in ((job or {}).get("photos") or [])[:8]:
        pid_photo = p.get("file_id") if isinstance(p, dict) else None
        if pid_photo:
            photos.append(f"/api/uploads/{pid_photo}")

    # ── Change orders the client can act on (sent/approved/rejected) ─────────
    change_orders: list = []
    approved_extras = 0.0
    async for co in db.pm_change_orders.find(
        {"project_id": pid, "status": {"$in": ["sent", "approved", "rejected", "invoiced"]}}
    ).sort("created_at", -1):
        if co.get("status") in ("approved", "invoiced"):
            approved_extras += float(co.get("net_total") or 0)
        change_orders.append({
            "id": str(co["_id"]),
            "number": co.get("number"),
            "title": co.get("title"),
            "description": co.get("description", ""),
            "items": co.get("items", []),
            "net_total": co.get("net_total", 0),
            "brutto_total": co.get("brutto_total", 0),
            "vat_rate": co.get("vat_rate", 20),
            "status": co.get("status"),
            "sent_at": co.get("sent_at"),
            "approved_at": co.get("approved_at"),
            "approved_by_name": co.get("approved_by_name"),
        })

    # ── Payment requests + EPC-QR (bank transfer) ───────────────────────────
    payments: list = []
    async for pay in db.pm_payment_requests.find({"project_id": pid}).sort("created_at", 1):
        payments.append({
            "id": str(pay["_id"]),
            "reference": pay.get("reference"),
            "label": pay.get("label"),
            "amount_eur": pay.get("amount_eur", 0),
            "status": pay.get("status"),
            "epc_qr_base64": _portal_epc_b64(pro_doc, float(pay.get("amount_eur") or 0), pay.get("reference") or pay.get("label", "")),
        })

    quote_total = float(proj.get("quote_price_eur") or 0)
    financials = {
        "quote_net_eur": round(quote_total, 2),
        "approved_extras_net_eur": round(approved_extras, 2),
        "new_total_net_eur": round(quote_total + approved_extras, 2),
    }
    bank = {
        "name": (pro_doc or {}).get("business_name") or pro_snap["name"],
        "iban_masked": _mask_iban((pro_doc or {}).get("bank_iban")),
        "has_bank": bool((pro_doc or {}).get("bank_iban")),
    }

    return {
        "project_id": pid,
        "title": proj.get("title", proj.get("job_title", "Project")),
        "status": proj.get("status", "active"),
        "customer_status_note": proj.get("customer_status_note", ""),
        "progress_pct": progress_pct,
        "tasks_total": tasks_total,
        "tasks_done": tasks_done,
        "tasks_doing": tasks_doing,
        "diary_recent": diary_items,
        "photos": photos,
        "change_orders": change_orders,
        "payments": payments,
        "financials": financials,
        "bank": bank,
        "pro": pro_snap,
        "job_category": proj.get("job_category"),
        "created_at": proj.get("created_at"),
        "updated_at": proj.get("updated_at"),
    }


@public_router.get("/{share_token}")
async def public_project_view(share_token: str):
    """Read-only customer view — homeowner opens this from a shared link."""
    proj = await db.pm_projects.find_one({"share_token": share_token, "share_enabled": True})
    if not proj:
        raise HTTPException(status_code=404, detail="Status page not found or sharing was disabled")
    return await build_customer_project_payload(proj)


@public_router.post("/{share_token}/change-orders/{co_id}/approve")
async def portal_approve_change_order(share_token: str, co_id: str, body: PortalSignBody):
    """Client approves a change order with a typed-name e-signature."""
    proj = await db.pm_projects.find_one({"share_token": share_token, "share_enabled": True})
    if not proj:
        raise HTTPException(status_code=404, detail="Status page not found")
    co = await db.pm_change_orders.find_one({"_id": ObjectId(co_id), "project_id": str(proj["_id"])})
    if not co:
        raise HTTPException(status_code=404, detail="Change order not found")
    if co.get("status") != "sent":
        raise HTTPException(status_code=400, detail="This change order is no longer awaiting approval.")
    now = datetime.now(timezone.utc)
    await db.pm_change_orders.update_one(
        {"_id": co["_id"]},
        {"$set": {"status": "approved", "approved_at": now, "approved_by_name": body.name.strip()[:80]}},
    )
    await _notify_pro_co(proj, co, approved=True, who=body.name.strip()[:80])
    return {"ok": True, "status": "approved"}


@public_router.post("/{share_token}/change-orders/{co_id}/reject")
async def portal_reject_change_order(share_token: str, co_id: str, body: PortalSignBody):
    proj = await db.pm_projects.find_one({"share_token": share_token, "share_enabled": True})
    if not proj:
        raise HTTPException(status_code=404, detail="Status page not found")
    co = await db.pm_change_orders.find_one({"_id": ObjectId(co_id), "project_id": str(proj["_id"])})
    if not co:
        raise HTTPException(status_code=404, detail="Change order not found")
    if co.get("status") != "sent":
        raise HTTPException(status_code=400, detail="This change order is no longer awaiting approval.")
    now = datetime.now(timezone.utc)
    await db.pm_change_orders.update_one(
        {"_id": co["_id"]},
        {"$set": {"status": "rejected", "rejected_at": now, "client_note": (body.note or "")[:500], "approved_by_name": body.name.strip()[:80]}},
    )
    await _notify_pro_co(proj, co, approved=False, who=body.name.strip()[:80])
    return {"ok": True, "status": "rejected"}


@public_router.post("/{share_token}/payments/{pay_id}/client-paid")
async def portal_mark_client_paid(share_token: str, pay_id: str):
    """Client signals they've sent the bank transfer (pro then confirms)."""
    proj = await db.pm_projects.find_one({"share_token": share_token, "share_enabled": True})
    if not proj:
        raise HTTPException(status_code=404, detail="Status page not found")
    pay = await db.pm_payment_requests.find_one({"_id": ObjectId(pay_id), "project_id": str(proj["_id"])})
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    if pay.get("status") == "paid":
        return {"ok": True, "status": "paid"}
    await db.pm_payment_requests.update_one(
        {"_id": pay["_id"]},
        {"$set": {"status": "client_marked_paid", "client_marked_at": datetime.now(timezone.utc)}},
    )
    await _notify_pro_payment(proj, pay)
    return {"ok": True, "status": "client_marked_paid"}

