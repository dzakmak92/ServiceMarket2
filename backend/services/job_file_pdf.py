"""Job File dossier from Postgres.

The archivable record of a finished job: summary, board, materials, diary,
Nachträge, financials and the photos. §14b UStG wants invoices kept for ten
years and §634a BGB / §933 ABGB run defect liability for five, so the document
that proves what was actually built, agreed and handed over outlives every
screen in this application. It has to be a file the pro can put somewhere else.

The layout lives in `job_file_layout` and is shared with the MongoDB version,
so both render an identical document. This module only gathers.

Two deliberate differences from the Mongo original.

**Photos come from Supabase Storage, not GridFS**, and a storage outage
degrades to a dossier without pictures rather than to a 500. The tables and
the money are the part with legal weight; the gallery is evidence that is nice
to have and not worth failing the export for.

**Labour cost is measured, not estimated.** The Mongo version multiplied diary
hours by a rate stored on the project. Here the hours come from `job_time_logs`
— the same stopped-timer entries the estimate calibration uses — so the P&L on
this page and the accuracy figure on the estimation screen can never disagree.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from db import pg
from services import job_file_layout as layout

logger = logging.getLogger(__name__)

# Jobs whose hours are final. Exporting a dossier for work still in progress
# would produce a document that contradicts itself a week later.
EXPORTABLE = ("completed", "invoiced", "closed")


async def _raw(ref: Optional[str]) -> Optional[bytes]:
    """One stored object, or None. Never raises: see `_photo_bytes`."""
    from services import storage
    bucket, _, key = (ref or "").partition("/")
    if not (bucket and key and storage.is_configured()):
        return None
    try:
        return await storage.download(bucket, key)
    except Exception as exc:  # noqa: BLE001 — best effort by design
        logger.info("job file: %s unavailable (%s)", ref, type(exc).__name__)
        return None


async def _photo_bytes(refs: list[str]) -> list:
    """Fetch and normalise images, skipping anything that will not decode.

    Best effort throughout. A missing object, an expired bucket or a HEIC the
    imaging library cannot open must cost that one picture, not the export.
    """
    out = []
    for ref in refs[:layout.MAX_PHOTOS]:
        raw = await _raw(ref)
        if raw is None:
            continue
        fl = layout._img_flowable(raw, 55, 42)
        if fl is not None:
            out.append(fl)
    return out


async def generate(pro_id: str, job_id: str, lang: str = "de") -> bytes:
    """The dossier for one finished job.

    Raises LookupError if the job is not this business's, and ValueError if the
    work is not finished.
    """
    lang = lang if lang in layout.SUPPORTED_LANGS else "de"
    L = layout._L(lang)

    job = await pg.fetchrow(
        "select * from jobs where id = $1 and pro_id = $2 and deleted_at is null",
        job_id, pro_id)
    if not job:
        raise LookupError("Job not found")
    if str(job["status"]) not in EXPORTABLE:
        raise ValueError("Die Jobakte kann erst nach Abschluss des Auftrags "
                         "exportiert werden.")

    pro = await pg.fetchrow("select * from pro_profiles where id = $1", pro_id) or {}
    customer = ({} if not job["customer_id"] else
                await pg.fetchrow("select * from customers where id = $1",
                                  job["customer_id"]) or {})

    tasks = await pg.fetch(
        "select * from job_tasks where job_id = $1 order by column_key, sort_order",
        job_id)
    materials = await pg.fetch(
        "select * from job_materials where job_id = $1 order by created_at", job_id)
    diary = await pg.fetch(
        "select * from job_diary where job_id = $1 order by entry_date desc", job_id)
    change_orders = await pg.fetch(
        "select * from change_orders where job_id = $1 "
        "and status in ('sent','approved','rejected','invoiced') order by created_at",
        job_id)

    tasks_by_col: dict[str, list] = {"todo": [], "doing": [], "done": []}
    for t in tasks:
        row = dict(t)
        # The layout was written against the Mongo field names. Mapping here
        # keeps one renderer rather than two.
        row["due_at"] = row.get("due_date")
        tasks_by_col.setdefault(row.get("column_key") or "todo", []).append(row)

    diary_rows = [{**dict(d), "note": d["text"]} for d in diary]
    co_rows = [{**dict(c), "number": c["co_number"],
                "net_total": float(c["net_amount"] or 0),
                "brutto_total": round(float(c["net_amount"] or 0)
                                      * (1 + float(c["vat_rate"] or 0) / 100), 2)}
               for c in change_orders]

    # Hours from the timer, not from the diary. The diary is a narrative a pro
    # writes at the end of the day; job_time_logs is what the clock recorded,
    # and it is the same source the estimate calibration measures against.
    seconds = await pg.fetchval(
        "select coalesce(sum(seconds), 0) from job_time_logs "
        "where job_id = $1 and stopped_at is not null", job_id) or 0
    total_hours = round(float(seconds) / 3600.0, 2)

    approved_extras = round(sum(float(c["net_amount"] or 0) for c in change_orders
                                if c["status"] in ("approved", "invoiced")), 2)
    materials_actual = round(sum(float(m["actual_cost"] if m["actual_cost"] is not None
                                       else m["planned_cost"] or 0)
                                 for m in materials), 2)

    # The contract value, then the accepted quote, then nothing. Guessing a
    # number here would put an invented margin on an archival document.
    quote_total = float(job["contract_amount"] or 0)
    if not quote_total:
        quote_total = float(await pg.fetchval(
            "select net_total from quotes where job_id = $1 and status = 'accepted' "
            "order by version desc limit 1", job_id) or 0)

    hourly_rate = float(await pg.fetchval(
        "select amount from pro_rates where pro_id = $1 and key like '%.stundensatz' "
        "order by times_used desc limit 1", pro_id) or 0)
    labour_cost = round(total_hours * hourly_rate, 2)
    new_total = round(quote_total + approved_extras, 2)
    profit = round(new_total - materials_actual - labour_cost, 2)
    margin = round(profit / new_total * 100, 1) if new_total > 0 else 0.0

    refs = [d["storage_ref"] for d in await pg.fetch(
        "select storage_ref from job_documents where job_id = $1 "
        "and kind in ('photo','photo_before','photo_after') order by created_at",
        job_id)]
    photos = await _photo_bytes(refs)

    # The renderer wants raw bytes for the logo, not a flowable, so this does
    # not go through _photo_bytes.
    logo = await _raw(pro.get("logo_file_id"))

    proj = {
        "title": job["title"], "job_title": job["title"],
        "status": "done", "job_category": job["category"],
        "created_at": job["created_at"], "updated_at": job["completed_at"] or job["updated_at"],
    }
    pro_snap = {
        "business_name": pro.get("business_name"), "name": pro.get("business_name"),
        "address": pro.get("business_address"),
        "postal_code": pro.get("business_postal_code"), "city": pro.get("business_city"),
    }
    cust = {
        "name": customer.get("company_name") or customer.get("name") or L["none"],
        "city": customer.get("city") or "",
        "address": customer.get("address") or "",
    }

    return layout.render(
        lang=lang, L=L, proj=proj, pro_snap=pro_snap, cust=cust,
        tasks_by_col=tasks_by_col, materials=[dict(m) for m in materials],
        diary=diary_rows, total_hours=total_hours, change_orders=co_rows,
        # Milestone payments are the payment rail, which is deliberately the
        # last phase. Empty rather than fabricated.
        payments=[], hourly_rate=hourly_rate, quote_total=quote_total,
        approved_extras=approved_extras, new_total=new_total,
        materials_actual=materials_actual, labour_cost=labour_cost,
        profit=profit, margin=margin, photo_flowables=photos, logo_bytes=logo)
