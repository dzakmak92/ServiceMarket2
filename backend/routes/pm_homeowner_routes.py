"""Authenticated homeowner "My Projects" routes.

Lets a logged-in customer see the managed projects their tradesperson runs
(progress, change orders / Nachträge, milestone payments) and act on them —
approve/decline COs and mark milestone payments — without needing a per-project
public share link. Scoped strictly to projects where the project's
`customer.homeowner_id` equals the authenticated user.
"""
from __future__ import annotations
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from auth import get_current_user
from database import db
from routes.pm_routes import (
    build_customer_project_payload,
    _notify_pro_co,
    _notify_pro_payment,
    _safe_filename,
    PortalSignBody,
)

router = APIRouter(prefix="/pm/my-projects")


def _require_homeowner(user: dict) -> str:
    if user.get("role") != "homeowner":
        raise HTTPException(status_code=403, detail="Homeowners only")
    return str(user["_id"])


async def _ho_project_or_404(project_id: str, homeowner_id: str) -> dict:
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Project not found")
    proj = await db.pm_projects.find_one({"_id": oid, "customer.homeowner_id": homeowner_id})
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj


@router.get("")
async def list_my_projects(user: dict = Depends(get_current_user)):
    """List every managed project where the logged-in user is the customer."""
    hid = _require_homeowner(user)
    out: list = []
    async for proj in db.pm_projects.find({"customer.homeowner_id": hid}).sort("updated_at", -1):
        pid = str(proj["_id"])
        total = await db.pm_tasks.count_documents({"project_id": pid})
        done = await db.pm_tasks.count_documents({"project_id": pid, "column": "done"})
        pending_cos = await db.pm_change_orders.count_documents({"project_id": pid, "status": "sent"})
        due_payments = await db.pm_payment_requests.count_documents(
            {"project_id": pid, "status": {"$in": ["requested", "client_marked_paid"]}}
        )
        pro_doc = await db.pro_profiles.find_one({"_id": ObjectId(proj["pro_id"])})
        pro_user = await db.users.find_one({"_id": ObjectId(pro_doc["user_id"])}) if pro_doc else None
        out.append({
            "id": pid,
            "title": proj.get("title") or proj.get("job_title") or "Project",
            "status": proj.get("status", "active"),
            "job_category": proj.get("job_category"),
            "progress_pct": round((done / total) * 100, 1) if total else 0.0,
            "tasks_total": total,
            "tasks_done": done,
            "pending_change_orders": pending_cos,
            "due_payments": due_payments,
            "pro_name": (pro_doc or {}).get("business_name") or (pro_user or {}).get("name") or "Your Pro",
            "created_at": proj.get("created_at"),
            "updated_at": proj.get("updated_at"),
        })
    return {"projects": out}


@router.get("/{project_id}")
async def get_my_project(project_id: str, user: dict = Depends(get_current_user)):
    """Full customer-facing project detail for the logged-in homeowner."""
    hid = _require_homeowner(user)
    proj = await _ho_project_or_404(project_id, hid)
    payload = await build_customer_project_payload(proj)
    # Extra fields the authenticated homeowner needs (e.g. to message the pro).
    pro_doc = await db.pro_profiles.find_one({"_id": ObjectId(proj["pro_id"])})
    payload["job_id"] = proj.get("job_id")
    payload["pro_user_id"] = (pro_doc or {}).get("user_id")
    return payload


@router.get("/{project_id}/export-pdf")
async def ho_export_project_job_file(
    project_id: str,
    lang: str = Query("en"),
    user: dict = Depends(get_current_user),
):
    """Generate a complete Job File PDF dossier for a COMPLETED project (homeowner)."""
    hid = _require_homeowner(user)
    proj = await _ho_project_or_404(project_id, hid)
    if proj.get("status") != "done":
        raise HTTPException(status_code=400, detail="Job File export is only available for completed projects.")
    from services.pm_pdf_export import generate_job_file_pdf
    pdf = await generate_job_file_pdf(proj, lang)
    fname = _safe_filename(proj.get("title") or proj.get("job_title") or "project")
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Jobfile-{fname}.pdf"'},
    )


@router.post("/{project_id}/change-orders/{co_id}/approve")
async def ho_approve_change_order(
    project_id: str, co_id: str, body: PortalSignBody, user: dict = Depends(get_current_user)
):
    hid = _require_homeowner(user)
    proj = await _ho_project_or_404(project_id, hid)
    try:
        co = await db.pm_change_orders.find_one({"_id": ObjectId(co_id), "project_id": project_id})
    except Exception:
        raise HTTPException(status_code=404, detail="Change order not found")
    if not co:
        raise HTTPException(status_code=404, detail="Change order not found")
    if co.get("status") != "sent":
        raise HTTPException(status_code=400, detail="This change order is no longer awaiting approval.")
    who = (body.name or user.get("name") or "").strip()[:80]
    now = datetime.now(timezone.utc)
    await db.pm_change_orders.update_one(
        {"_id": co["_id"]},
        {"$set": {"status": "approved", "approved_at": now, "approved_by_name": who}},
    )
    await _notify_pro_co(proj, co, approved=True, who=who)
    return {"ok": True, "status": "approved"}


@router.post("/{project_id}/change-orders/{co_id}/reject")
async def ho_reject_change_order(
    project_id: str, co_id: str, body: PortalSignBody, user: dict = Depends(get_current_user)
):
    hid = _require_homeowner(user)
    proj = await _ho_project_or_404(project_id, hid)
    try:
        co = await db.pm_change_orders.find_one({"_id": ObjectId(co_id), "project_id": project_id})
    except Exception:
        raise HTTPException(status_code=404, detail="Change order not found")
    if not co:
        raise HTTPException(status_code=404, detail="Change order not found")
    if co.get("status") != "sent":
        raise HTTPException(status_code=400, detail="This change order is no longer awaiting approval.")
    who = (body.name or user.get("name") or "").strip()[:80]
    now = datetime.now(timezone.utc)
    await db.pm_change_orders.update_one(
        {"_id": co["_id"]},
        {"$set": {"status": "rejected", "rejected_at": now, "client_note": (body.note or "")[:500], "approved_by_name": who}},
    )
    await _notify_pro_co(proj, co, approved=False, who=who)
    return {"ok": True, "status": "rejected"}


@router.post("/{project_id}/payments/{pay_id}/client-paid")
async def ho_mark_payment_paid(project_id: str, pay_id: str, user: dict = Depends(get_current_user)):
    """Homeowner signals they've sent the bank transfer (pro then confirms)."""
    hid = _require_homeowner(user)
    proj = await _ho_project_or_404(project_id, hid)
    try:
        pay = await db.pm_payment_requests.find_one({"_id": ObjectId(pay_id), "project_id": project_id})
    except Exception:
        raise HTTPException(status_code=404, detail="Payment not found")
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
