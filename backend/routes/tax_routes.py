"""Tax Toolkit routes — dashboard, USt-VA, EÜR, mileage, SVS, ESt, CSV+PDF exports."""
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File
from datetime import datetime, timezone
from typing import Optional

from auth import get_current_user
from database import db
from services.tax_reports import (
    revenue_summary, expense_summary, mileage_book, svs_contribution,
    income_tax_at, revenue_csv, expenses_csv, datev_buchungsstapel,
    quarter_window, QUARTER_MONTHS,
)
from services.tax_pdf import render_tax_year_pdf
from services.pro_invoicing import get_pro_snapshot

router = APIRouter(prefix="/tax")


async def _require_tax_toolkit(user: dict) -> dict:
    if user["role"] != "tradesperson":
        raise HTTPException(status_code=403, detail="Pros only")
    pro = await db.pro_profiles.find_one({"user_id": user["_id"]})
    if not pro:
        raise HTTPException(status_code=404, detail="Pro profile not found")
    if not pro.get("has_tax_toolkit"):
        raise HTTPException(status_code=402, detail="Tax Toolkit not active for this pro")
    return pro


@router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user), year: Optional[int] = None):
    """Top-of-page 4-tile overview + USt-VA deadlines for the current year."""
    pro = await _require_tax_toolkit(user)
    pro_id = str(pro["_id"])
    yr = year or datetime.now(timezone.utc).year
    start = datetime(yr, 1, 1, tzinfo=timezone.utc)
    end = datetime(yr + 1, 1, 1, tzinfo=timezone.utc)

    rev = await revenue_summary(pro_id, start, end, paid_only=False)
    exp = await expense_summary(user["_id"], start, end)
    profit = round(rev["paid_brutto"] - exp["brutto"], 2)

    # Estimate USt liability for the current quarter
    now = datetime.now(timezone.utc)
    cur_q = "Q1" if now.month <= 3 else "Q2" if now.month <= 6 else "Q3" if now.month <= 9 else "Q4"
    qs, qe = quarter_window(now.year, cur_q)
    qrev = await revenue_summary(pro_id, qs, qe, paid_only=False)
    return {
        "year": yr,
        "revenue_brutto": rev["brutto"],
        "revenue_net": rev["net"],
        "outstanding_brutto": rev["pending_brutto"],
        "expenses_brutto": exp["brutto"],
        "profit_eur": profit,
        "current_quarter": cur_q,
        "ust_due_this_quarter": qrev["vat"],
        "is_kleinunternehmer": bool(pro.get("is_kleinunternehmer")),
    }


@router.get("/ust-va")
async def ust_va_preview(
    user: dict = Depends(get_current_user),
    year: int = datetime.now(timezone.utc).year,
    quarter: str = "Q1",
):
    pro = await _require_tax_toolkit(user)
    if quarter not in QUARTER_MONTHS:
        raise HTTPException(status_code=400, detail="quarter must be Q1..Q4")
    start, end = quarter_window(year, quarter)
    rev = await revenue_summary(str(pro["_id"]), start, end, paid_only=False)
    return {
        "year": year, "quarter": quarter,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        **rev,
    }


@router.get("/eur")
async def eur_yearly(user: dict = Depends(get_current_user), year: int = datetime.now(timezone.utc).year):
    """Annual Einnahmen-Ausgaben-Rechnung."""
    pro = await _require_tax_toolkit(user)
    pro_id = str(pro["_id"])
    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    rev = await revenue_summary(pro_id, start, end, paid_only=False)
    exp = await expense_summary(user["_id"], start, end)
    profit = round(rev["paid_brutto"] - exp["brutto"], 2)
    return {
        "year": year,
        "revenue": rev,
        "expenses": exp,
        "profit_eur": profit,
        "is_kleinunternehmer": bool(pro.get("is_kleinunternehmer")),
    }


@router.get("/mileage")
async def mileage(user: dict = Depends(get_current_user), year: int = datetime.now(timezone.utc).year):
    pro = await _require_tax_toolkit(user)
    return await mileage_book(str(pro["_id"]), year)


@router.get("/svs")
async def svs(user: dict = Depends(get_current_user), profit_eur: Optional[float] = None,
              year: int = datetime.now(timezone.utc).year):
    pro = await _require_tax_toolkit(user)
    if profit_eur is None:
        # Default: pull this year's profit
        pro_id = str(pro["_id"])
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        rev = await revenue_summary(pro_id, start, end, paid_only=False)
        exp = await expense_summary(user["_id"], start, end)
        profit_eur = max(rev["paid_brutto"] - exp["brutto"], 0)
    return svs_contribution(profit_eur)


@router.get("/income-tax")
async def est_preview(user: dict = Depends(get_current_user), taxable_profit_eur: Optional[float] = None,
                      year: int = datetime.now(timezone.utc).year):
    pro = await _require_tax_toolkit(user)
    if taxable_profit_eur is None:
        pro_id = str(pro["_id"])
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        rev = await revenue_summary(pro_id, start, end, paid_only=False)
        exp = await expense_summary(user["_id"], start, end)
        # Subtract estimated SVS as deductible
        svs_dict = svs_contribution(max(rev["paid_brutto"] - exp["brutto"], 0))
        taxable_profit_eur = max(rev["paid_brutto"] - exp["brutto"] - svs_dict["total_eur"], 0)
    return income_tax_at(taxable_profit_eur)


@router.get("/exports/revenue.csv")
async def export_revenue_csv(user: dict = Depends(get_current_user),
                             year: int = datetime.now(timezone.utc).year,
                             quarter: Optional[str] = None):
    pro = await _require_tax_toolkit(user)
    body = await revenue_csv(str(pro["_id"]), year, quarter)
    name = f"revenue_{year}" + (f"_{quarter}" if quarter else "") + ".csv"
    return Response(
        content=body, media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/exports/expenses.csv")
async def export_expenses_csv(user: dict = Depends(get_current_user),
                              year: int = datetime.now(timezone.utc).year,
                              quarter: Optional[str] = None):
    await _require_tax_toolkit(user)
    body = await expenses_csv(user["_id"], year, quarter)
    name = f"expenses_{year}" + (f"_{quarter}" if quarter else "") + ".csv"
    return Response(
        content=body, media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/exports/datev-full.csv")
async def export_datev_full(user: dict = Depends(get_current_user),
                            year: int = datetime.now(timezone.utc).year,
                            quarter: Optional[str] = None):
    """Combined DATEV Buchungsstapel export (Einnahmen + Ausgaben).
    Follows DATEV EXTF v700 core field format for import into DATEV or
    compatible Austrian bookkeeping software."""
    if quarter and quarter not in ("Q1", "Q2", "Q3", "Q4"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid quarter '{quarter}'. Must be one of Q1, Q2, Q3, Q4 (uppercase).",
        )
    pro = await _require_tax_toolkit(user)
    body = await datev_buchungsstapel(str(pro["_id"]), user["_id"], year, quarter)
    period = f"_{quarter}" if quarter else ""
    name = f"datev_buchungsstapel_{year}{period}.csv"
    return Response(
        content=body.encode("utf-8-sig"),  # BOM so Excel opens with correct encoding
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/year-end.pdf")
async def year_end_pdf(user: dict = Depends(get_current_user), year: int = datetime.now(timezone.utc).year):
    pro = await _require_tax_toolkit(user)
    pro_id = str(pro["_id"])
    pro_snap = await get_pro_snapshot(pro_id)
    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    rev = await revenue_summary(pro_id, start, end, paid_only=False)
    exp = await expense_summary(user["_id"], start, end)
    mil = await mileage_book(pro_id, year)
    profit = max(rev["paid_brutto"] - exp["brutto"], 0)
    svs = svs_contribution(profit)
    est = income_tax_at(max(profit - svs["total_eur"], 0))
    # Quarterly USt-VA buckets
    q_buckets = {}
    for q in ("Q1", "Q2", "Q3", "Q4"):
        qs, qe = quarter_window(year, q)
        q_buckets[q] = await revenue_summary(pro_id, qs, qe, paid_only=False)
    pdf = render_tax_year_pdf(
        year=year, pro_snapshot=pro_snap, revenue=rev, expenses=exp,
        mileage=mil, svs=svs, est=est, ust_buckets_by_q=q_buckets,
    )
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="Steuer-Jahresbericht-{year}.pdf"'},
    )


# ──────────────────────────────────────────────
# Receipts (paper invoices the pro uploads — OCR via Emergent LLM)
# ──────────────────────────────────────────────
@router.get("/receipts")
async def list_receipts(user: dict = Depends(get_current_user),
                        year: Optional[int] = None):
    await _require_tax_toolkit(user)
    q = {"user_id": user["_id"]}
    if year:
        q["receipt_date"] = {
            "$gte": datetime(year, 1, 1, tzinfo=timezone.utc),
            "$lt": datetime(year + 1, 1, 1, tzinfo=timezone.utc),
        }
    items = []
    async for r in db.tax_receipts.find(q).sort("receipt_date", -1).limit(500):
        r["id"] = str(r.pop("_id"))
        items.append(r)
    return {"receipts": items}


@router.post("/receipts")
async def upload_receipt(
    user: dict = Depends(get_current_user),
    file: UploadFile = File(...),
):
    """Upload a paper receipt photo. We OCR via Emergent LLM (Vision) to extract
    vendor + date + amount + VAT rate. Saves to GridFS-backed `tax_receipts`."""
    await _require_tax_toolkit(user)
    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Receipt > 8 MB. Compress first.")
    # Persist to GridFS first (cheap; OCR fail won't lose the file)
    from io import BytesIO
    from database import fs_bucket
    file_id = await fs_bucket.upload_from_stream(
        file.filename or "receipt.jpg",
        BytesIO(raw),
        metadata={
            "user_id": user["_id"],
            "kind": "tax_receipt",
            "content_type": file.content_type or "image/jpeg",
        },
    )

    # OCR via Emergent LLM (best-effort — returns extracted dict or partial defaults)
    extracted = await _ocr_receipt(raw, file.content_type or "image/jpeg")

    doc = {
        "user_id": user["_id"],
        "file_id": str(file_id),
        "filename": file.filename or "receipt.jpg",
        "uploaded_at": datetime.now(timezone.utc),
        "receipt_date": extracted.get("receipt_date"),
        "vendor": extracted.get("vendor"),
        "amount_brutto": extracted.get("amount_brutto"),
        "amount_net": extracted.get("amount_net"),
        "vat_rate": extracted.get("vat_rate"),
        "vat_amount": extracted.get("vat_amount"),
        "category": extracted.get("category"),
        "currency": extracted.get("currency") or "EUR",
        "payment_method": extracted.get("payment_method"),
        "items": extracted.get("items") or [],
        "note": extracted.get("note"),
        "ocr_confidence": extracted.get("confidence", 0),
        "raw_text": (extracted.get("raw_text") or "")[:2000],
    }
    result = await db.tax_receipts.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc


async def _ocr_receipt(raw: bytes, content_type: str) -> dict:
    """Best-effort vision OCR via Emergent LLM. Never blocks the upload if
    the LLM call fails — caller still gets the file saved + empty fields.

    Returns: receipt_date, vendor, amount_brutto, amount_net (when derivable),
    vat_rate, vat_amount, category, currency, payment_method, items[] (free-text
    line items if visible), confidence (0–1), raw_text (truncated).
    """
    import base64, json, re
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        import os
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"tax-ocr-{datetime.now().timestamp()}",
            system_message=(
                "You are a senior Austrian bookkeeper assistant extracting data "
                "from a receipt photo (Beleg/Kassabon/Rechnung). Reply with "
                "STRICT JSON only — no prose, no markdown.\n\n"
                "Required keys:\n"
                "  receipt_date  — ISO YYYY-MM-DD (use the receipt date, NOT today)\n"
                "  vendor        — business name as printed on the receipt\n"
                "  amount_brutto — gross total in EUR as a number (e.g. 24.95)\n"
                "  amount_net    — net total (excluding VAT) if printed, else null\n"
                "  vat_rate      — primary VAT rate as an integer: 20, 13, 10, or 0\n"
                "  vat_amount    — total VAT amount in EUR or null\n"
                "  category      — best guess from: Material, Werkzeug, "
                "Werbung, Anlagen, Treibstoff, Bewirtung, Büro, Telefon, Sonstige\n"
                "  currency      — 3-letter ISO (default EUR)\n"
                "  payment_method— cash | card | transfer | other | null\n"
                "  items         — array of up to 8 strings, each a free-text line "
                "from the receipt (description + amount). Skip totals/headers/taxes.\n"
                "  confidence    — your honest confidence the parse is correct, 0.0–1.0\n\n"
                "Rules:\n"
                "  • If a field is unclear or missing on the receipt, set it to null.\n"
                "  • amount_brutto MUST be a number, never a string.\n"
                "  • For Austrian receipts: prefer 20%, 13% (hotel/Beherbergung), "
                "or 10% (groceries/books).\n"
                "  • If the photo is blurry/cropped, lower the confidence accordingly.\n"
                "  • Output the JSON object directly — no leading text, no fences."
            ),
        ).with_model("openai", "gpt-4o-mini")
        b64 = base64.b64encode(raw).decode()
        msg = UserMessage(
            text="Extract the receipt fields. Reply with JSON only.",
            file_contents=[ImageContent(image_base64=b64)],
        )
        ans = await chat.send_message(msg)
        s = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(ans).strip(), flags=re.M)
        # Sometimes the LLM adds explanatory text — grab the first {...} block
        m = re.search(r"\{.*\}", s, flags=re.S)
        if m:
            s = m.group(0)
        data = json.loads(s)

        # Normalise date
        if data.get("receipt_date"):
            try:
                data["receipt_date"] = datetime.fromisoformat(str(data["receipt_date"])[:10]).replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                data["receipt_date"] = None

        # Coerce numerics — LLM occasionally returns strings like "24,95 €"
        for k in ("amount_brutto", "amount_net", "vat_amount", "confidence"):
            v = data.get(k)
            if isinstance(v, str):
                cleaned = re.sub(r"[^\d.,\-]", "", v).replace(",", ".")
                try:
                    data[k] = float(cleaned) if cleaned else None
                except ValueError:
                    data[k] = None
        if isinstance(data.get("vat_rate"), str):
            try:
                data["vat_rate"] = int(re.sub(r"[^\d]", "", data["vat_rate"]) or 0)
            except (ValueError, TypeError):
                data["vat_rate"] = None
        # Sanity clamps
        if isinstance(data.get("confidence"), (int, float)):
            data["confidence"] = round(max(0.0, min(1.0, float(data["confidence"]))), 2)
        if isinstance(data.get("items"), list):
            data["items"] = [str(x)[:200] for x in data["items"][:8]]
        return data
    except Exception:
        return {}


# ──────────────────────────────────────────────
# Tax P1: Receipt PATCH (manual correction after OCR) + DELETE
# ──────────────────────────────────────────────
from pydantic import BaseModel  # noqa: E402


class ReceiptPatch(BaseModel):
    vendor: Optional[str] = None
    receipt_date: Optional[datetime] = None
    amount_brutto: Optional[float] = None
    amount_net: Optional[float] = None
    vat_rate: Optional[int] = None
    vat_amount: Optional[float] = None
    category: Optional[str] = None
    payment_method: Optional[str] = None
    note: Optional[str] = None


@router.patch("/receipts/{receipt_id}")
async def patch_receipt(receipt_id: str, payload: ReceiptPatch, user: dict = Depends(get_current_user)):
    """Pro corrects OCR-extracted values before posting the receipt to expenses."""
    await _require_tax_toolkit(user)
    from bson import ObjectId
    try:
        oid = ObjectId(receipt_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad id")
    upd = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if not upd:
        raise HTTPException(status_code=400, detail="Empty patch")
    upd["edited_at"] = datetime.now(timezone.utc)
    res = await db.tax_receipts.update_one({"_id": oid, "user_id": user["_id"]}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Receipt not found")
    doc = await db.tax_receipts.find_one({"_id": oid})
    if doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


@router.delete("/receipts/{receipt_id}")
async def delete_receipt(receipt_id: str, user: dict = Depends(get_current_user)):
    await _require_tax_toolkit(user)
    from bson import ObjectId
    try:
        oid = ObjectId(receipt_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad id")
    res = await db.tax_receipts.delete_one({"_id": oid, "user_id": user["_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return {"deleted": True}


# ──────────────────────────────────────────────
# Tax P1: Accountant share-view (token-gated, read-only, no auth)
# Pro can hand a magic link to their Steuerberater so they can pull figures
# without needing a user account.
# ──────────────────────────────────────────────
from secrets import token_urlsafe  # noqa: E402


@router.post("/accountant-share")
async def create_accountant_share(user: dict = Depends(get_current_user)):
    """Generate (or rotate) the accountant share-token for this pro."""
    pro = await _require_tax_toolkit(user)
    new_token = token_urlsafe(20)
    await db.pro_profiles.update_one(
        {"_id": pro["_id"]},
        {"$set": {"tax_accountant_token": new_token, "tax_accountant_token_created_at": datetime.now(timezone.utc)}},
    )
    return {"accountant_token": new_token}


@router.delete("/accountant-share")
async def revoke_accountant_share(user: dict = Depends(get_current_user)):
    pro = await _require_tax_toolkit(user)
    await db.pro_profiles.update_one(
        {"_id": pro["_id"]},
        {"$unset": {"tax_accountant_token": "", "tax_accountant_token_created_at": ""}},
    )
    return {"revoked": True}


@router.get("/accountant-share")
async def get_accountant_share(user: dict = Depends(get_current_user)):
    pro = await _require_tax_toolkit(user)
    return {"accountant_token": pro.get("tax_accountant_token")}


# Public router for accountant (no auth)
public_tax_router = APIRouter(prefix="/tax/public")


@public_tax_router.get("/accountant/{token}")
async def accountant_view(token: str, year: Optional[int] = None):
    """Read-only summary for an accountant: yearly EÜR + 4 quarterly USt-VA
    buckets + downloadable DATEV CSVs. The accountant accesses this WITHOUT
    a ServiceMarket account; the pro hands out the magic link.
    """
    pro = await db.pro_profiles.find_one({"tax_accountant_token": token})
    if not pro:
        raise HTTPException(status_code=404, detail="Invalid or revoked accountant link")
    pro_id = str(pro["_id"])
    from bson import ObjectId as _OID
    user_lookup_id = pro["user_id"] if not isinstance(pro.get("user_id"), str) else _OID(pro["user_id"])
    user_doc = await db.users.find_one({"_id": user_lookup_id})
    yr = year or datetime.now(timezone.utc).year
    start = datetime(yr, 1, 1, tzinfo=timezone.utc)
    end = datetime(yr + 1, 1, 1, tzinfo=timezone.utc)

    rev = await revenue_summary(pro_id, start, end, paid_only=False)
    exp = await expense_summary(pro["user_id"], start, end)

    quarters = {}
    for q in ("Q1", "Q2", "Q3", "Q4"):
        qs, qe = quarter_window(yr, q)
        quarters[q] = await revenue_summary(pro_id, qs, qe, paid_only=False)

    return {
        "year": yr,
        "pro": {
            "name": (user_doc or {}).get("name"),
            "business_name": pro.get("business_name") or pro.get("company_name"),
            "uid": pro.get("invoice_tax_id"),
            "is_kleinunternehmer": bool(pro.get("is_kleinunternehmer")),
            "city": (user_doc or {}).get("city"),
        },
        "revenue": rev,
        "expenses": exp,
        "profit": round(rev["paid_brutto"] - exp["brutto"], 2),
        "quarters": quarters,
        # Pre-signed CSV / PDF endpoints (still public-token-gated)
        "downloads": {
            "revenue_csv": f"/api/tax/public/accountant/{token}/revenue.csv?year={yr}",
            "expenses_csv": f"/api/tax/public/accountant/{token}/expenses.csv?year={yr}",
            "year_pdf": f"/api/tax/public/accountant/{token}/year-end.pdf?year={yr}",
        },
    }


@public_tax_router.get("/accountant/{token}/revenue.csv")
async def public_revenue_csv(token: str, year: Optional[int] = None, quarter: Optional[str] = None):
    pro = await db.pro_profiles.find_one({"tax_accountant_token": token})
    if not pro:
        raise HTTPException(status_code=404, detail="Invalid or revoked link")
    pro_id = str(pro["_id"])
    yr = year or datetime.now(timezone.utc).year
    csv = await revenue_csv(pro_id, yr, quarter)
    fname = f"revenue-{yr}{(' ' + quarter) if quarter else ''}.csv".replace(" ", "-")
    return Response(content=csv, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@public_tax_router.get("/accountant/{token}/expenses.csv")
async def public_expenses_csv(token: str, year: Optional[int] = None):
    pro = await db.pro_profiles.find_one({"tax_accountant_token": token})
    if not pro:
        raise HTTPException(status_code=404, detail="Invalid or revoked link")
    yr = year or datetime.now(timezone.utc).year
    csv = await expenses_csv(pro["user_id"], yr)
    return Response(content=csv, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="expenses-{yr}.csv"'})


@public_tax_router.get("/accountant/{token}/year-end.pdf")
async def public_year_pdf(token: str, year: Optional[int] = None):
    pro = await db.pro_profiles.find_one({"tax_accountant_token": token})
    if not pro:
        raise HTTPException(status_code=404, detail="Invalid or revoked link")
    pro_id = str(pro["_id"])
    yr = year or datetime.now(timezone.utc).year
    pro_snap = await get_pro_snapshot(pro_id)
    start = datetime(yr, 1, 1, tzinfo=timezone.utc)
    end = datetime(yr + 1, 1, 1, tzinfo=timezone.utc)
    rev = await revenue_summary(pro_id, start, end, paid_only=False)
    exp = await expense_summary(pro["user_id"], start, end)
    mil = await mileage_book(pro_id, yr)
    profit = max(rev["paid_brutto"] - exp["brutto"], 0)
    svs = svs_contribution(profit)
    est = income_tax_at(max(profit - svs["total_eur"], 0))
    q_buckets = {}
    for q in ("Q1", "Q2", "Q3", "Q4"):
        qs, qe = quarter_window(yr, q)
        q_buckets[q] = await revenue_summary(pro_id, qs, qe, paid_only=False)
    pdf = render_tax_year_pdf(
        year=yr, pro_snapshot=pro_snap, revenue=rev, expenses=exp,
        mileage=mil, svs=svs, est=est, ust_buckets_by_q=q_buckets,
    )
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="tax-{yr}.pdf"'})

