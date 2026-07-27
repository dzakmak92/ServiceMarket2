"""Austrian/EU §11 UStG-compliant invoice generation.

Generates:
- Subscription invoices (Pro membership, €29.99/month, generated on the 15th)
- Aggregated contact-fee invoices (one per pro, all fees from previous month, on the 1st)
- Storno credit notes (referencing the original invoice they cancel)

Each invoice is a separate document in `invoices` collection with frozen
supplier + customer snapshots (so reissue / storno carry the exact data that
was on the original printed copy).
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone, timedelta
from typing import Any
from bson import ObjectId
from io import BytesIO

from database import db

logger = logging.getLogger(__name__)

PRO_SUBSCRIPTION_AMOUNT = 29.99  # EUR/month NET (VAT-exclusive). Brutto = net * (1 + vat_rate/100).


def _vat_rate(sup: dict) -> int:
    """Return effective VAT rate: 0 if Kleinunternehmer, else default_vat_rate (default 20)."""
    if sup.get("is_kleinunternehmer"):
        return 0
    try:
        return int(sup.get("default_vat_rate", 20))
    except (TypeError, ValueError):
        return 20


def _split_net(net_amount: float, vat_rate: int) -> tuple[float, float, float]:
    """Given a NET amount (VAT-exclusive), return (net, vat_amount, brutto), all rounded to cents."""
    net = round(float(net_amount), 2)
    vat_amount = round(net * vat_rate / 100.0, 2)
    brutto = round(net + vat_amount, 2)
    return net, vat_amount, brutto


# ──────────────────────────────────────────────
# Sequential invoice numbers (gap-free, per year — §11(1) Z 6 UStG)
# ──────────────────────────────────────────────
async def next_invoice_number(kind: str = "invoice") -> str:
    """Atomic counter increment → 'RG-2026-0001' / 'GUT-2026-0001'.

    NEVER reuse / skip numbers — required by Austrian tax law.
    """
    settings = await db.company_settings.find_one({"_id": "default"}) or {}
    prefix = settings.get("storno_prefix" if kind == "storno" else "invoice_prefix",
                          "GUT-" if kind == "storno" else "RG-")
    year = datetime.now(timezone.utc).year
    counter_id = f"invoice_seq_{year}_{kind}"
    doc = await db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,
    )
    n = (doc or {}).get("value", 1)
    return f"{prefix}{year}-{n:04d}"


# ──────────────────────────────────────────────
# Supplier / customer snapshots — frozen at issue time
# ──────────────────────────────────────────────
async def get_supplier_snapshot() -> dict:
    s = await db.company_settings.find_one({"_id": "default"})
    if not s:
        raise RuntimeError("Company settings not configured — admin must save them first.")
    return {
        "legal_name": s.get("legal_name", ""),
        "street": s.get("street", ""),
        "postal_code": s.get("postal_code", ""),
        "city": s.get("city", ""),
        "country": s.get("country", "AT"),
        "vat_id": s.get("vat_id"),
        "tax_id": s.get("tax_id"),
        "iban": s.get("iban"),
        "bic": s.get("bic"),
        "bank_name": s.get("bank_name"),
        "email": s.get("email"),
        "phone": s.get("phone"),
        "is_kleinunternehmer": s.get("is_kleinunternehmer", False),
    }


async def get_customer_snapshot(user_id: str) -> dict:
    u = await db.users.find_one({"_id": ObjectId(user_id)})
    if not u:
        raise RuntimeError(f"User {user_id} not found")
    pro = await db.pro_profiles.find_one({"user_id": user_id})
    return {
        "name": u.get("name", ""),
        "email": u.get("email", ""),
        "phone": u.get("phone", ""),
        "company_name": (pro or {}).get("company_name") or (pro or {}).get("business_name", ""),
        "address": u.get("address", ""),
        "postal_code": u.get("postal_code", ""),
        "city": u.get("city", ""),
        "country": u.get("country", "AT"),
    }


# ──────────────────────────────────────────────
# Build a single subscription invoice (one pro, one month)
# ──────────────────────────────────────────────
async def create_subscription_invoice(user_id: str, period_start: datetime, period_end: datetime) -> dict:
    sup = await get_supplier_snapshot()
    cust = await get_customer_snapshot(user_id)
    invoice_no = await next_invoice_number("invoice")
    issue_date = datetime.now(timezone.utc)

    net, vat_amt, brutto = _split_net(PRO_SUBSCRIPTION_AMOUNT, _vat_rate(sup))
    vat_rate = _vat_rate(sup)
    line = {
        "description": f"Pro-Mitgliedschaft {period_start.strftime('%m/%Y')}",
        "qty": 1,
        "unit_net": net,
        "vat_rate": vat_rate,
        "vat_amount": vat_amt,
        "line_total_brutto": brutto,
    }
    inv = {
        "invoice_number": invoice_no,
        "invoice_type": "subscription",
        "invoice_date": issue_date,
        "leistungsdatum_start": period_start,
        "leistungsdatum_end": period_end,
        "target_user_id": user_id,
        "supplier_snapshot": sup,
        "customer_snapshot": cust,
        "line_items": [line],
        "net_total": net,
        "vat_total": vat_amt,
        "brutto_total": brutto,
        "currency": "eur",
        "status": "issued",
        "kleinunternehmer_note": sup["is_kleinunternehmer"],
        "related_fee_ids": [],
        "related_invoice_id": None,
        "created_at": issue_date,
    }
    result = await db.invoices.insert_one(inv)
    inv["_id"] = result.inserted_id
    return inv


# ──────────────────────────────────────────────
# Build a single fees invoice (aggregated per pro, previous month)
# ──────────────────────────────────────────────
async def create_fees_invoice(pro_id: str, period_start: datetime, period_end: datetime) -> dict | None:
    fees = await db.fee_log.find({
        "pro_id": pro_id,
        "status": "pending",
        "incurred_at": {"$gte": period_start, "$lt": period_end},
    }).to_list(500)
    if not fees:
        return None

    pro_profile = await db.pro_profiles.find_one({"_id": ObjectId(pro_id)})
    if not pro_profile:
        return None
    user_id = pro_profile["user_id"]

    sup = await get_supplier_snapshot()
    cust = await get_customer_snapshot(user_id)
    invoice_no = await next_invoice_number("invoice")
    issue_date = datetime.now(timezone.utc)

    line_items = []
    net_total = 0.0
    vat_total = 0.0
    brutto_total = 0.0
    vat_rate = _vat_rate(sup)
    for f in fees:
        # fee_log.amount is stored as NET (VAT-exclusive)
        net, vat_amt, brutto = _split_net(float(f.get("amount", 0)), vat_rate)
        line_items.append({
            "description": f.get("description") or f"Contact fee — job {str(f.get('job_id') or '')[:8]}",
            "fee_id": str(f["_id"]),
            "qty": 1,
            "unit_net": net,
            "vat_rate": vat_rate,
            "vat_amount": vat_amt,
            "line_total_brutto": brutto,
        })
        net_total += net
        vat_total += vat_amt
        brutto_total += brutto

    net_total = round(net_total, 2)
    vat_total = round(vat_total, 2)
    brutto_total = round(brutto_total, 2)
    inv = {
        "invoice_number": invoice_no,
        "invoice_type": "fees",
        "invoice_date": issue_date,
        "leistungsdatum_start": period_start,
        "leistungsdatum_end": period_end,
        "target_user_id": user_id,
        "supplier_snapshot": sup,
        "customer_snapshot": cust,
        "line_items": line_items,
        "net_total": net_total,
        "vat_total": vat_total,
        "brutto_total": brutto_total,
        "currency": "eur",
        "status": "issued",
        "kleinunternehmer_note": sup["is_kleinunternehmer"],
        "related_fee_ids": [str(f["_id"]) for f in fees],
        "related_invoice_id": None,
        "created_at": issue_date,
    }
    result = await db.invoices.insert_one(inv)
    inv["_id"] = result.inserted_id
    # Mark fees as invoiced
    await db.fee_log.update_many(
        {"_id": {"$in": [f["_id"] for f in fees]}},
        {"$set": {"status": "invoiced", "invoice_id": str(result.inserted_id)}},
    )
    return inv


# ──────────────────────────────────────────────
# Storno (credit note) — § 11(2) UStG
# ──────────────────────────────────────────────
async def create_storno_invoice(original_invoice_id: str, reason: str) -> dict:
    orig = await db.invoices.find_one({"_id": ObjectId(original_invoice_id)})
    if not orig:
        raise RuntimeError("Original invoice not found")
    if orig["invoice_type"] == "storno":
        raise RuntimeError("Cannot storno a storno")

    storno_no = await next_invoice_number("storno")
    issue_date = datetime.now(timezone.utc)
    # Mirror line items with NEGATIVE amounts
    neg_lines = []
    for li in orig["line_items"]:
        neg_lines.append({**li,
                          "unit_net": -li["unit_net"],
                          "vat_amount": -li["vat_amount"],
                          "line_total_brutto": -li["line_total_brutto"]})
    inv = {
        "invoice_number": storno_no,
        "invoice_type": "storno",
        "invoice_date": issue_date,
        "leistungsdatum_start": orig.get("leistungsdatum_start"),
        "leistungsdatum_end": orig.get("leistungsdatum_end"),
        "target_user_id": orig["target_user_id"],
        "supplier_snapshot": orig["supplier_snapshot"],
        "customer_snapshot": orig["customer_snapshot"],
        "line_items": neg_lines,
        "net_total": -orig["net_total"],
        "vat_total": -orig["vat_total"],
        "brutto_total": -orig["brutto_total"],
        "currency": orig.get("currency", "eur"),
        "status": "issued",
        "storno_reason": reason,
        "related_invoice_id": str(orig["_id"]),
        "related_invoice_number": orig["invoice_number"],
        "created_at": issue_date,
    }
    result = await db.invoices.insert_one(inv)
    inv["_id"] = result.inserted_id
    # Mark original as cancelled + back-reference the storno
    await db.invoices.update_one(
        {"_id": orig["_id"]},
        {"$set": {"status": "cancelled", "storno_invoice_id": str(result.inserted_id)}},
    )
    # If it was a fees invoice → release the fees back to pending so they can
    # be re-invoiced (or admin can manually settle them).
    if orig["invoice_type"] == "fees" and orig.get("related_fee_ids"):
        await db.fee_log.update_many(
            {"_id": {"$in": [ObjectId(fid) for fid in orig["related_fee_ids"]]}},
            {"$set": {"status": "pending"}, "$unset": {"invoice_id": ""}},
        )
    return inv


# ──────────────────────────────────────────────
# PDF generation (ReportLab) — German layout, compliant with §11 UStG
# ──────────────────────────────────────────────
def _fmt_eur(v: float) -> str:
    return f"€{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def render_invoice_pdf(invoice: dict) -> bytes:
    """Render an Austrian-compliant A4 invoice / storno PDF, return raw bytes."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                     PageBreak)

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
        title=invoice["invoice_number"], author="ServiceMarket",
    )
    styles = getSampleStyleSheet()
    s_normal = ParagraphStyle("body", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=11)
    s_small = ParagraphStyle("small", parent=s_normal, fontSize=7, textColor=colors.HexColor("#666"))
    s_h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=22, leading=24, spaceAfter=4)

    sup = invoice["supplier_snapshot"]
    cust = invoice["customer_snapshot"]
    is_storno = invoice["invoice_type"] == "storno"
    title = "Gutschrift / Storno" if is_storno else "Rechnung"

    elements: list[Any] = []
    # Supplier header (top-left)
    sup_line = f"{sup.get('legal_name', '')} · {sup.get('street', '')} · {sup.get('postal_code', '')} {sup.get('city', '')}"
    elements.append(Paragraph(sup_line, s_small))
    elements.append(Spacer(1, 10 * mm))

    # Customer block (left)
    cust_block = [
        cust.get("company_name") or cust.get("name", ""),
        cust.get("name", "") if cust.get("company_name") else "",
        cust.get("address", ""),
        f"{cust.get('postal_code', '')} {cust.get('city', '')}",
        cust.get("country", ""),
    ]
    cust_text = "<br/>".join([x for x in cust_block if x])

    # Right-side metadata
    meta_lines = [
        f"<b>{title}-Nr:</b> {invoice['invoice_number']}",
        f"<b>Rechnungsdatum:</b> {invoice['invoice_date'].strftime('%d.%m.%Y')}",
    ]
    if invoice.get("leistungsdatum_start") and invoice.get("leistungsdatum_end"):
        meta_lines.append(
            f"<b>Leistungszeitraum:</b> {invoice['leistungsdatum_start'].strftime('%d.%m.%Y')} – "
            f"{invoice['leistungsdatum_end'].strftime('%d.%m.%Y')}"
        )
    if is_storno and invoice.get("related_invoice_number"):
        meta_lines.append(f"<b>Storno zu Rechnung:</b> {invoice['related_invoice_number']}")
    if sup.get("vat_id"):
        meta_lines.append(f"<b>UID:</b> {sup['vat_id']}")
    meta_text = "<br/>".join(meta_lines)

    header_table = Table([[Paragraph(cust_text, s_normal), Paragraph(meta_text, s_normal)]],
                         colWidths=[90 * mm, 80 * mm])
    header_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(header_table)
    elements.append(Spacer(1, 10 * mm))

    # Title
    elements.append(Paragraph(f"<b>{title} {invoice['invoice_number']}</b>", s_h1))
    if is_storno and invoice.get("storno_reason"):
        elements.append(Paragraph(f"<i>Stornogrund: {invoice['storno_reason']}</i>", s_small))
    elements.append(Spacer(1, 6 * mm))

    # Line-item table
    rows = [["#", "Beschreibung", "Menge", "Netto", "USt %", "USt", "Brutto"]]
    for i, li in enumerate(invoice["line_items"], 1):
        rows.append([
            str(i), li.get("description", ""),
            str(li.get("qty", 1)),
            _fmt_eur(li.get("unit_net", 0)),
            f"{li.get('vat_rate', 0)}%",
            _fmt_eur(li.get("vat_amount", 0)),
            _fmt_eur(li.get("line_total_brutto", 0)),
        ])
    line_tbl = Table(rows, colWidths=[10 * mm, 80 * mm, 14 * mm, 22 * mm, 12 * mm, 18 * mm, 22 * mm])
    line_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8F1F5")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#999")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CCC")),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(line_tbl)
    elements.append(Spacer(1, 4 * mm))

    # Totals
    totals_rows = [
        ["Netto", _fmt_eur(invoice["net_total"])],
        [f"USt ({invoice['line_items'][0].get('vat_rate', 0)}%)" if invoice["line_items"] else "USt",
         _fmt_eur(invoice["vat_total"])],
        ["Gesamt (brutto)", _fmt_eur(invoice["brutto_total"])],
    ]
    totals_tbl = Table(totals_rows, colWidths=[60 * mm, 30 * mm])
    totals_tbl.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.black),
        ("TOPPADDING", (0, -1), (-1, -1), 4),
    ]))
    totals_wrapper = Table([["", totals_tbl]], colWidths=[80 * mm, 90 * mm])
    totals_wrapper.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "RIGHT")]))
    elements.append(totals_wrapper)
    elements.append(Spacer(1, 8 * mm))

    # Kleinunternehmer or VAT note
    if sup.get("is_kleinunternehmer"):
        elements.append(Paragraph(
            "<i>Kein Ausweis der Umsatzsteuer aufgrund Kleinunternehmer-Regelung "
            "gemäß § 6 Abs. 1 Z. 27 UStG.</i>", s_small))
        elements.append(Spacer(1, 4 * mm))

    # Bank details + footer
    bank_lines = []
    if sup.get("iban"):
        bank_lines.append(f"IBAN: <b>{sup['iban']}</b>")
    if sup.get("bic"):
        bank_lines.append(f"BIC: <b>{sup['bic']}</b>")
    if sup.get("bank_name"):
        bank_lines.append(f"Bank: {sup['bank_name']}")
    if bank_lines:
        elements.append(Paragraph(" · ".join(bank_lines), s_normal))
        elements.append(Spacer(1, 3 * mm))

    contact_lines = [x for x in [sup.get("email"), sup.get("phone")] if x]
    if contact_lines:
        elements.append(Paragraph(" · ".join(contact_lines), s_small))

    elements.append(Spacer(1, 6 * mm))
    elements.append(Paragraph(
        f"<i>Aufbewahrungspflicht gemäß § 132 BAO: 7 Jahre. "
        f"Bei Fragen zu dieser {title} kontaktieren Sie uns bitte unter den oben angegebenen Daten.</i>",
        s_small))

    doc.build(elements)
    return buf.getvalue()
