"""Admin "Payouts owed" tracker (no Stripe Connect).

Because online invoice payments are collected entirely into the PLATFORM Stripe
account (invoice amount + 1% fee), the platform owes each pro the invoice amount.
Every successful online payment writes a `pro_payouts` ledger entry (status
'owed'). This module lets an admin see what is owed per pro (with their IBAN) and
mark payouts as settled once they've been transferred manually (e.g. via SEPA).

This is the interim model until the operator provides their own Connect-enabled
Stripe key for automatic split payouts.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from bson import ObjectId

from database import db
from auth import require_admin
from utils import serialize_doc

router = APIRouter(prefix="/admin/payouts")


class SettleRequest(BaseModel):
    reference: Optional[str] = None


async def _get_user(uid):
    if not uid:
        return None
    try:
        return await db.users.find_one({"_id": ObjectId(uid)})
    except Exception:
        return await db.users.find_one({"_id": uid})


async def _pro_display(pro_id: str) -> dict:
    prof = None
    try:
        prof = await db.pro_profiles.find_one({"_id": ObjectId(pro_id)})
    except Exception:
        prof = None
    if not prof:
        return {"pro_name": "—", "business_name": "", "iban": "", "account_holder": "", "bic": "", "bank_name": ""}
    user = await _get_user(prof.get("user_id"))
    return {
        "pro_name": (user or {}).get("name") or prof.get("business_name") or prof.get("company_name") or "—",
        "business_name": prof.get("business_name") or prof.get("company_name") or "",
        "iban": prof.get("bank_iban") or "",
        "account_holder": prof.get("bank_account_holder") or (user or {}).get("name") or "",
        "bic": prof.get("bank_bic") or "",
        "bank_name": prof.get("bank_name") or "",
    }


@router.get("/summary")
async def summary(admin: dict = Depends(require_admin)):
    """Totals + amount owed grouped by pro (with bank details for the transfer)."""
    async def _sum(match, field):
        pipe = [{"$match": match}, {"$group": {"_id": None, "v": {"$sum": f"${field}"}}}]
        out = [c async for c in db.pro_payouts.aggregate(pipe)]
        return round(out[0]["v"], 2) if out else 0.0

    total_owed = await _sum({"status": "owed"}, "amount_eur")
    total_settled = await _sum({"status": "settled"}, "amount_eur")
    total_fees = await _sum({}, "fee_eur")
    total_gross = await _sum({}, "gross_eur")

    pipe = [
        {"$match": {"status": "owed"}},
        {"$group": {"_id": "$pro_id", "owed_eur": {"$sum": "$amount_eur"}, "count": {"$sum": 1},
                    "last_paid_at": {"$max": "$paid_at"}}},
        {"$sort": {"owed_eur": -1}},
    ]
    by_pro = []
    async for row in db.pro_payouts.aggregate(pipe):
        disp = await _pro_display(row["_id"])
        by_pro.append({
            "pro_id": row["_id"],
            "owed_eur": round(row["owed_eur"], 2),
            "count": row["count"],
            "last_paid_at": row.get("last_paid_at"),
            **disp,
        })

    return serialize_doc({
        "total_owed": total_owed,
        "total_settled": total_settled,
        "total_fees": total_fees,
        "total_gross": total_gross,
        "owed_by_pro": by_pro,
    })


@router.get("")
async def list_payouts(
    admin: dict = Depends(require_admin),
    status: str = "owed",
    pro_id: Optional[str] = None,
    page: int = 1,
    per_page: int = 50,
):
    query: dict = {}
    if status in ("owed", "settled"):
        query["status"] = status
    if pro_id:
        query["pro_id"] = pro_id
    per_page = max(1, min(per_page, 100))
    total = await db.pro_payouts.count_documents(query)
    docs = (
        await db.pro_payouts.find(query)
        .sort("paid_at", -1)
        .skip((page - 1) * per_page)
        .limit(per_page)
        .to_list(per_page)
    )
    # attach pro name (cache per pro_id)
    cache: dict = {}
    rows = []
    for d in docs:
        pid = d.get("pro_id")
        if pid not in cache:
            cache[pid] = await _pro_display(pid)
        s = serialize_doc(d)
        s["pro_name"] = cache[pid]["pro_name"]
        s["iban"] = cache[pid]["iban"]
        rows.append(s)
    return {"rows": rows, "total": total, "page": page, "per_page": per_page}


@router.post("/{payout_id}/settle")
async def settle_one(payout_id: str, body: SettleRequest, admin: dict = Depends(require_admin)):
    try:
        p = await db.pro_payouts.find_one({"_id": ObjectId(payout_id)})
    except Exception:
        p = None
    if not p:
        raise HTTPException(status_code=404, detail="Payout not found")
    if p.get("status") == "settled":
        raise HTTPException(status_code=400, detail="Already settled")
    await db.pro_payouts.update_one(
        {"_id": p["_id"]},
        {"$set": {
            "status": "settled",
            "settled_at": datetime.now(timezone.utc),
            "settled_by": str(admin["_id"]),
            "settled_ref": (body.reference or "").strip()[:120],
        }},
    )
    return {"ok": True}


@router.post("/settle-pro/{pro_id}")
async def settle_pro(pro_id: str, body: SettleRequest, admin: dict = Depends(require_admin)):
    """Mark ALL of a pro's owed payouts as settled (after a single bulk transfer)."""
    now = datetime.now(timezone.utc)
    res = await db.pro_payouts.update_many(
        {"pro_id": pro_id, "status": "owed"},
        {"$set": {
            "status": "settled",
            "settled_at": now,
            "settled_by": str(admin["_id"]),
            "settled_ref": (body.reference or "").strip()[:120],
        }},
    )
    return {"ok": True, "settled_count": res.modified_count}
