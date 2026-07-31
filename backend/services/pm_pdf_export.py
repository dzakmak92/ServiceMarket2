"""Job File PDF export for completed PM projects.

Generates a complete, archivable PDF dossier of a finished project — header
(with the pro's logo if set), summary, Kanban tasks, materials, work diary,
change orders (Nachträge), milestone payments, financials/P&L and an embedded
photo gallery (job progress photos + material photos pulled from GridFS).

Available to both the Pro (own projects) and the Homeowner (their projects),
ONLY when the project status == "done". The caller passes a `lang` code
(en/de/tr/es) which localises every label in the document.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Optional

from bson import ObjectId

from database import db, fs_bucket
from services.pro_invoicing import get_pro_snapshot, _fmt_eur

logger = logging.getLogger(__name__)

# Labels, helpers and the reportlab layout now live in
# services.job_file_layout, shared with the Postgres export so both produce
# an identical document and the layout is written once. This module keeps
# only the MongoDB gathering.
from services.job_file_layout import (  # noqa: E402,F401
    LABELS, MAX_PHOTOS, SUPPORTED_LANGS, _extract_file_id, _fmt_date,
    _img_flowable, _L, render as _render,
)


# ──────────────────────────────────────────────
# Main entry — gather (MongoDB) + render
# ──────────────────────────────────────────────
async def generate_job_file_pdf(proj: dict, lang: str = "en") -> bytes:
    lang = lang if lang in SUPPORTED_LANGS else "en"
    L = _L(lang)
    pid = str(proj["_id"])
    pro_id = proj["pro_id"]

    # ── Pro + customer snapshots ─────────────────────────────────────────
    try:
        pro_snap = await get_pro_snapshot(pro_id)
    except Exception:
        pro_snap = {}
    homeowner = None
    if (proj.get("customer") or {}).get("homeowner_id"):
        try:
            homeowner = await db.users.find_one({"_id": ObjectId(proj["customer"]["homeowner_id"])})
        except Exception:
            homeowner = None
    cust = {
        "name": (homeowner or {}).get("name") or (proj.get("customer") or {}).get("name") or L["none"],
        "city": (homeowner or {}).get("city") or (proj.get("customer") or {}).get("city") or "",
        "address": (homeowner or {}).get("address") or "",
    }

    # ── Tasks grouped by column ──────────────────────────────────────────
    tasks_by_col: dict[str, list] = {"todo": [], "doing": [], "done": []}
    async for tdoc in db.pm_tasks.find({"project_id": pid}).sort([("column", 1), ("order", 1)]):
        col = tdoc.get("column", "todo")
        tasks_by_col.setdefault(col, []).append(tdoc)

    # ── Materials (+ collect their photo file ids) ───────────────────────
    materials: list = []
    material_photo_ids: list = []
    async for m in db.pm_materials.find({"project_id": pid}).sort("created_at", 1):
        materials.append(m)
        for ph in (m.get("photos") or []):
            fid = _extract_file_id(ph)
            if fid:
                material_photo_ids.append(fid)

    # ── Diary ────────────────────────────────────────────────────────────
    diary: list = []
    total_hours = 0.0
    async for d in db.pm_diary.find({"project_id": pid}).sort("entry_date", -1):
        diary.append(d)
        total_hours += float(d.get("hours") or 0)

    # ── Change orders ────────────────────────────────────────────────────
    change_orders: list = []
    approved_extras = 0.0
    async for co in db.pm_change_orders.find(
        {"project_id": pid, "status": {"$in": ["sent", "approved", "rejected", "invoiced"]}}
    ).sort("created_at", 1):
        if co.get("status") in ("approved", "invoiced"):
            approved_extras += float(co.get("net_total") or 0)
        change_orders.append(co)

    # ── Payments ─────────────────────────────────────────────────────────
    payments: list = []
    async for pay in db.pm_payment_requests.find({"project_id": pid}).sort("created_at", 1):
        payments.append(pay)

    # ── Financials / P&L ─────────────────────────────────────────────────
    materials_actual = sum(float(m.get("actual_cost") or m.get("planned_cost") or 0) for m in materials)
    quote_total = float(proj.get("quote_price_eur") or 0)
    hourly_rate = float(proj.get("hourly_rate_eur", 65.0))
    labour_cost = round(total_hours * hourly_rate, 2)
    new_total = round(quote_total + approved_extras, 2)
    profit = round(new_total - materials_actual - labour_cost, 2)
    margin = round(profit / new_total * 100, 1) if new_total > 0 else 0.0

    # ── Photos: job progress photos + material photos ────────────────────
    photo_ids: list = []
    try:
        job = await db.jobs.find_one({"_id": ObjectId(proj["job_id"])})
    except Exception:
        job = None
    for p in ((job or {}).get("photos") or []):
        fid = _extract_file_id(p)
        if fid:
            photo_ids.append(fid)
    photo_ids.extend(material_photo_ids)
    # de-dupe preserving order, cap
    seen = set()
    photo_ids = [x for x in photo_ids if not (x in seen or seen.add(x))][:MAX_PHOTOS]
    photo_flowables = []
    for fid in photo_ids:
        raw = await _fetch_image_bytes(fid)
        if raw:
            fl = _img_flowable(raw, 55, 42)
            if fl is not None:
                photo_flowables.append(fl)

    logo_bytes = None
    if pro_snap.get("logo_file_id"):
        logo_bytes = await _fetch_image_bytes(_extract_file_id(pro_snap["logo_file_id"]))

    return _render(
        lang=lang, L=L, proj=proj, pro_snap=pro_snap, cust=cust,
        tasks_by_col=tasks_by_col, materials=materials, diary=diary,
        total_hours=round(total_hours, 2), change_orders=change_orders,
        payments=payments, hourly_rate=hourly_rate, quote_total=quote_total,
        approved_extras=round(approved_extras, 2), new_total=new_total,
        materials_actual=round(materials_actual, 2), labour_cost=labour_cost,
        profit=profit, margin=margin, photo_flowables=photo_flowables,
        logo_bytes=logo_bytes,
    )


