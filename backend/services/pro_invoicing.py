"""Pro-side Invoice Toolkit (B2C invoices issued by pros to homeowners).

Separate from the operator's §11 UStG invoices in services/invoicing.py. Each
pro has their own gap-free invoice sequence (RG- prefix + their own UID),
their own Kleinunternehmer flag (set on pro_profiles), and embeds an
EPC-QR ("GiroCode") on the PDF so the customer's banking app scans it for
instant SEPA payment.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Optional

from bson import ObjectId
from database import db

logger = logging.getLogger(__name__)

VAT_RATE_DEFAULT = 20  # AT standard


# ──────────────────────────────────────────────
# Per-pro sequential numbering (RG-YYYY-NNNN scoped per pro)
# ──────────────────────────────────────────────
async def next_pro_invoice_number(pro_id: str) -> str:
    year = datetime.now(timezone.utc).year
    counter_id = f"pro_invoice_seq_{pro_id}_{year}"
    doc = await db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,
    )
    n = (doc or {}).get("value", 1)
    return f"RG-{year}-{n:04d}"


# ──────────────────────────────────────────────
# Snapshots
# ──────────────────────────────────────────────
async def get_pro_snapshot(pro_id: str) -> dict:
    pro = await db.pro_profiles.find_one({"_id": ObjectId(pro_id)})
    if not pro:
        raise RuntimeError("Pro profile not found")
    u = await db.users.find_one({"_id": ObjectId(pro["user_id"])}) or {}
    return {
        "pro_id": pro_id,
        "name": u.get("name", ""),
        "email": u.get("email", ""),
        "phone": u.get("phone", ""),
        "business_name": pro.get("business_name") or pro.get("company_name", ""),
        "invoice_tax_id": pro.get("invoice_tax_id"),
        "is_kleinunternehmer": bool(pro.get("is_kleinunternehmer", False)),
        # Bank details for EPC-QR / SEPA
        "bank_account_holder": pro.get("bank_account_holder") or u.get("name", ""),
        "bank_iban": pro.get("bank_iban"),
        "bank_bic": pro.get("bank_bic"),
        "bank_name": pro.get("bank_name"),
        "invoice_footer": pro.get("invoice_footer"),
        # Business address: prefer pro-profile field, fall back to user.address
        "address": pro.get("business_address") or u.get("address", ""),
        "postal_code": pro.get("business_postal_code") or u.get("postal_code", ""),
        "city": pro.get("business_city") or u.get("city", ""),
        "country": pro.get("business_country") or u.get("country", "AT"),
        # White-labeling
        "logo_file_id": pro.get("logo_file_id"),
        "logo_content_type": pro.get("logo_content_type"),
        "invoice_template": pro.get("invoice_template", "classic"),
    }


def homeowner_snapshot_from_user_and_job(u: dict, job: dict) -> dict:
    return {
        "name": u.get("name", ""),
        "email": u.get("email", ""),
        "phone": u.get("phone", ""),
        "city": u.get("city", "") or (job or {}).get("city", ""),
        "address": u.get("address", ""),
        "postal_code": u.get("postal_code", ""),
        "country": u.get("country", "AT"),
    }


# ──────────────────────────────────────────────
# Invoice document creation
# ──────────────────────────────────────────────
def _split_lines(net_lines: list[dict], vat_rate: int) -> tuple[float, float, float, list[dict]]:
    """Compute net/vat/brutto for a list of {description, qty, unit_net} line items."""
    enriched = []
    net_total = 0.0
    vat_total = 0.0
    brutto_total = 0.0
    for li in net_lines:
        qty = float(li.get("qty") or 1)
        unit_net = round(float(li.get("unit_net") or 0), 2)
        line_net = round(unit_net * qty, 2)
        line_vat = round(line_net * vat_rate / 100.0, 2)
        line_brutto = round(line_net + line_vat, 2)
        enriched.append({
            "description": li.get("description", ""),
            "qty": qty,
            "unit_net": unit_net,
            "line_net": line_net,
            "vat_rate": vat_rate,
            "vat_amount": line_vat,
            "line_total_brutto": line_brutto,
        })
        net_total += line_net
        vat_total += line_vat
        brutto_total += line_brutto
    return round(net_total, 2), round(vat_total, 2), round(brutto_total, 2), enriched


async def create_pro_invoice(
    pro_id: str,
    job_id: Optional[str],
    homeowner_user_id: Optional[str],
    line_items: list[dict],
    note: Optional[str] = None,
    payment_due_days: int = 14,
    source: str = "servicemarket",
    customer_override: Optional[dict] = None,
) -> dict:
    pro_snap = await get_pro_snapshot(pro_id)
    if not pro_snap["bank_iban"]:
        raise RuntimeError("Pro is missing bank details — fill them in Settings → Invoice details first.")

    # ── Duplicate guard: one invoice per completed job per pro ──────
    if job_id:
        existing = await db.pro_invoices.find_one({
            "pro_id": pro_id,
            "job_id": job_id,
            "invoice_type": {"$ne": "storno"},
            "status": {"$nin": ["cancelled"]},
        })
        if existing:
            raise RuntimeError(
                f"Invoice #{existing.get('invoice_number', '')} already exists for this job. "
                "Only one invoice per completed job is allowed."
            )
    # ───────────────────────────────────────────────────────────────
    if homeowner_user_id:
        u = await db.users.find_one({"_id": ObjectId(homeowner_user_id)}) or {}
    else:
        u = {}
    job = None
    if job_id:
        try:
            job = await db.jobs.find_one({"_id": ObjectId(job_id)})
        except Exception:
            job = None
    if customer_override:
        # Off-platform customer entered manually by the pro.
        cust_snap = {
            "name": (customer_override.get("name") or "").strip(),
            "email": (customer_override.get("email") or ""),
            "phone": (customer_override.get("phone") or ""),
            "city": (customer_override.get("city") or ""),
            "address": (customer_override.get("address") or ""),
            "postal_code": (customer_override.get("postal_code") or ""),
            "country": (customer_override.get("country") or "AT"),
        }
    else:
        cust_snap = homeowner_snapshot_from_user_and_job(u, job or {})

    vat_rate = 0 if pro_snap["is_kleinunternehmer"] else VAT_RATE_DEFAULT
    net_total, vat_total, brutto_total, enriched_lines = _split_lines(line_items, vat_rate)

    invoice_no = await next_pro_invoice_number(pro_id)
    issue_date = datetime.now(timezone.utc)
    inv = {
        "invoice_number": invoice_no,
        "pro_id": pro_id,
        "job_id": job_id,
        "homeowner_id": homeowner_user_id,
        "pro_snapshot": pro_snap,
        "customer_snapshot": cust_snap,
        "line_items": enriched_lines,
        "net_total": net_total,
        "vat_total": vat_total,
        "vat_rate": vat_rate,
        "brutto_total": brutto_total,
        "currency": "eur",
        "status": "issued",
        "payment_status": "issued",
        "source": source,
        "kleinunternehmer_note": pro_snap["is_kleinunternehmer"],
        "note": note or "",
        "payment_due_days": payment_due_days,
        "invoice_date": issue_date,
        "created_at": issue_date,
    }
    result = await db.pro_invoices.insert_one(inv)
    inv["_id"] = result.inserted_id
    return inv


# ──────────────────────────────────────────────
# EPC-QR / GiroCode payload
# ──────────────────────────────────────────────
def _normalize_iban(iban: str) -> str:
    return (iban or "").replace(" ", "").replace("-", "").upper()


def _is_valid_iban(iban: str) -> bool:
    """ISO 13616 mod-97 check. Returns False for empty / wrong-shape / failing checksum."""
    s = _normalize_iban(iban)
    if len(s) < 15 or len(s) > 34:
        return False
    if not s[:2].isalpha() or not s[2:4].isdigit():
        return False
    rearranged = s[4:] + s[:4]
    # Convert letters: A=10..Z=35
    digits = "".join(str(ord(c) - 55) if c.isalpha() else c for c in rearranged)
    try:
        return int(digits) % 97 == 1
    except ValueError:
        return False


def build_epc_qr_png(*, name: str, iban: str, bic: Optional[str], amount: float, reference: str, scale: int = 5) -> bytes:
    """Generate an EPC069-12 v2 "GiroCode" PNG via segno's official helper.
    Most EU banking apps (Sparkasse, Raiffeisen, Erste, N26, ING, ...) scan
    these and pre-fill the SEPA payment.

    Raises ValueError if the IBAN is malformed (checksum fails) — saves us
    from generating QR codes that silently parse to nothing in the banking app.
    """
    from segno import helpers
    name = (name or "").strip().replace("\n", " ").replace("\r", " ")[:70]
    iban_clean = _normalize_iban(iban)
    if not _is_valid_iban(iban_clean):
        raise ValueError(f"Invalid IBAN '{iban}' — failed checksum validation. EPC-QR cannot be generated.")
    bic_clean = (bic or "").replace(" ", "").upper() if bic else None
    # segno requires BIC to be exactly 8 or 11 chars — drop invalid lengths
    # rather than raising, so the QR still renders without a BIC.
    if bic_clean and len(bic_clean) not in (8, 11):
        bic_clean = None
    reference = (reference or "")[:35]
    qr = helpers.make_epc_qr(
        name=name,
        iban=iban_clean,
        amount=round(float(amount), 2),
        reference=reference,
        bic=bic_clean if bic_clean else None,
    )
    buf = BytesIO()
    qr.save(buf, kind="png", scale=scale, border=2)
    return buf.getvalue()


# Legacy aliases kept so any direct callers don't break.
def build_epc_payload(*, name: str, iban: str, bic: Optional[str], amount: float, reference: str) -> str:
    """Deprecated — kept for tests. Real PDF rendering uses build_epc_qr_png()."""
    name = (name or "").strip().replace("\n", " ").replace("\r", " ")[:70]
    iban = _normalize_iban(iban)
    bic = (bic or "").replace(" ", "").upper() if bic else ""
    amt = f"EUR{round(float(amount), 2):.2f}"
    reference = (reference or "")[:35]
    return "\n".join(["BCD", "002", "1", "SCT", bic, name, iban, amt, "", reference, "", ""])


def epc_qr_png_bytes(payload: str, scale: int = 5) -> bytes:
    """Deprecated wrapper — encodes an already-built payload string. Real PDF
    rendering now goes through build_epc_qr_png() with the segno EPC helper."""
    import segno
    buf = BytesIO()
    segno.make(payload, error="m").save(buf, kind="png", scale=scale, border=2)
    return buf.getvalue()


# ──────────────────────────────────────────────
# PDF rendering (B2C invoice with EPC-QR)
# ──────────────────────────────────────────────
def _fmt_eur(v: float) -> str:
    return f"€{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def render_pro_invoice_pdf(invoice: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image)

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
        title=invoice["invoice_number"], author=invoice["pro_snapshot"].get("name", ""),
    )
    styles = getSampleStyleSheet()
    s_normal = ParagraphStyle("body", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=11)
    s_small = ParagraphStyle("small", parent=s_normal, fontSize=7, textColor=colors.HexColor("#666"))
    s_h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=22, leading=24, spaceAfter=4)

    pro = invoice["pro_snapshot"]
    cust = invoice["customer_snapshot"]
    elements: list[Any] = []

    # Pro header
    sup_line = " · ".join(filter(None, [
        pro.get("business_name") or pro.get("name", ""),
        pro.get("address", ""),
        " ".join(filter(None, [pro.get("postal_code", ""), pro.get("city", "")])),
    ]))
    elements.append(Paragraph(sup_line, s_small))
    elements.append(Spacer(1, 10 * mm))

    # Customer block + meta
    cust_block = [
        cust.get("name", ""),
        cust.get("address", ""),
        " ".join(filter(None, [cust.get("postal_code", ""), cust.get("city", "")])),
        cust.get("country", ""),
    ]
    cust_text = "<br/>".join([x for x in cust_block if x])
    meta_lines = [
        f"<b>Rechnungs-Nr:</b> {invoice['invoice_number']}",
        f"<b>Rechnungsdatum:</b> {invoice['invoice_date'].strftime('%d.%m.%Y')}",
        f"<b>Fälligkeit:</b> {invoice['payment_due_days']} Tage",
    ]
    if pro.get("invoice_tax_id"):
        meta_lines.append(f"<b>Steuernummer:</b> {pro['invoice_tax_id']}")
    if invoice.get("job_id"):
        meta_lines.append(f"<b>Auftrags-ID:</b> {str(invoice['job_id'])[-8:]}")
    meta_text = "<br/>".join(meta_lines)

    header_table = Table([[Paragraph(cust_text, s_normal), Paragraph(meta_text, s_normal)]],
                         colWidths=[90 * mm, 80 * mm])
    header_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(header_table)
    elements.append(Spacer(1, 10 * mm))

    # Title
    elements.append(Paragraph(f"<b>Rechnung {invoice['invoice_number']}</b>", s_h1))
    elements.append(Spacer(1, 6 * mm))

    # Line items
    rows = [["#", "Beschreibung", "Menge", "Einzelpreis", "USt %", "Gesamt"]]
    for i, li in enumerate(invoice["line_items"], 1):
        rows.append([
            str(i), li.get("description", ""),
            f"{li.get('qty', 1):g}",
            _fmt_eur(li.get("unit_net", 0)),
            f"{li.get('vat_rate', 0)}%",
            _fmt_eur(li.get("line_total_brutto", 0)),
        ])
    line_tbl = Table(rows, colWidths=[10 * mm, 86 * mm, 18 * mm, 24 * mm, 14 * mm, 26 * mm])
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
        [f"USt ({invoice['vat_rate']}%)", _fmt_eur(invoice["vat_total"])],
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
    elements.append(Spacer(1, 6 * mm))

    # Kleinunternehmer note
    if pro.get("is_kleinunternehmer"):
        elements.append(Paragraph(
            "<i>Hinweis: Gemäß § 6 Abs. 1 Z. 27 UStG wird keine Umsatzsteuer ausgewiesen "
            "(Kleinunternehmer-Regelung).</i>", s_small))
        elements.append(Spacer(1, 4 * mm))

    # Bank details + EPC-QR for instant payment
    bank_lines = []
    if pro.get("bank_iban"):
        bank_lines.append(f"<b>Bitte überweisen Sie {_fmt_eur(invoice['brutto_total'])} auf folgendes Konto:</b>")
        bank_lines.append(f"Empfänger: {pro.get('bank_account_holder') or pro.get('name', '')}")
        bank_lines.append(f"IBAN: {pro['bank_iban']}")
        if pro.get("bank_bic"):
            bank_lines.append(f"BIC: {pro['bank_bic']}")
        if pro.get("bank_name"):
            bank_lines.append(f"Bank: {pro['bank_name']}")
        bank_lines.append(f"Verwendungszweck: {invoice['invoice_number']}")
    if bank_lines:
        # QR code (right side) — with graceful fallback if the IBAN is invalid
        qr_img = None
        try:
            qr_png = build_epc_qr_png(
                name=pro.get("bank_account_holder") or pro.get("name", ""),
                iban=pro.get("bank_iban", ""),
                bic=pro.get("bank_bic", ""),
                amount=invoice["brutto_total"],
                reference=invoice["invoice_number"],
                scale=4,
            )
            qr_img = Image(BytesIO(qr_png), width=30 * mm, height=30 * mm)
        except ValueError as exc:
            logger.warning("EPC-QR skipped on invoice %s: %s", invoice["invoice_number"], exc)
        bank_text = "<br/>".join(bank_lines)
        pay_table = Table(
            [[Paragraph(bank_text, s_normal), qr_img or Paragraph("", s_normal)]],
            colWidths=[120 * mm, 35 * mm],
        )
        pay_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCC")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FAFAF7")),
        ]))
        elements.append(pay_table)
        elements.append(Spacer(1, 3 * mm))
        elements.append(Paragraph(
            "<i>Scannen Sie den QR-Code mit Ihrer Banking-App, um die Überweisung auszufüllen.</i>", s_small))
        elements.append(Spacer(1, 6 * mm))

    # Custom footer (pro's own boilerplate)
    if pro.get("invoice_footer"):
        elements.append(Paragraph(f"<i>{pro['invoice_footer']}</i>", s_small))

    if invoice.get("note"):
        elements.append(Spacer(1, 3 * mm))
        elements.append(Paragraph(f"Anmerkung: {invoice['note']}", s_small))

    doc.build(elements)
    return buf.getvalue()
