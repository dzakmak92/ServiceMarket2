"""Invoice PDF templates — iter41 redesign + iter42 fixes.

Three pastel palettes, all using the same layout (derived from the user's
HTML reference):
    - pastel_mint     (soft sage/mint green)
    - pastel_rose     (soft blush/pink)
    - pastel_grey     (soft slate grey)

Iter42 fixes:
    - Logo loaded from GridFS via logo_file_id (was: silently missing)
    - EPC QR built inline from bank_iban (was: relied on non-existent qr_code_b64)
    - Bank footer reads canonical pro_snapshot keys (bank_iban/bank_bic/bank_name)
    - Line-item fields aligned to canonical names (qty/unit_net/line_net/etc)
    - Totals row no longer renders "Netto 0,00€" — uses net_total/vat_total
    - Accent band across the top + larger logo cell for a more "designed" feel
"""
from __future__ import annotations

import base64
import logging
from datetime import datetime, timedelta
from io import BytesIO
from typing import Any

from bson import ObjectId
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from database import db, fs_bucket

logger = logging.getLogger(__name__)


# ───────────────────────────── Palettes ─────────────────────────────
PALETTES: dict[str, dict[str, str]] = {
    "pastel_mint": {
        "name": "Pastel Mint",
        "bg_soft": "#EAF3EC",
        "bg_med": "#C9DECE",
        "accent": "#7FAE8F",
        "accent_dark": "#3F6B53",
        "ink": "#2D4636",
        "muted": "#6F8579",
    },
    "pastel_rose": {
        "name": "Pastel Rose",
        "bg_soft": "#F7EAE7",
        "bg_med": "#EBC9C3",
        "accent": "#D4988A",
        "accent_dark": "#9B5A4B",
        "ink": "#5C2E26",
        "muted": "#8F6F69",
    },
    "pastel_grey": {
        "name": "Pastel Grey",
        "bg_soft": "#F1F2F4",
        "bg_med": "#D9DCE0",
        "accent": "#8B919A",
        "accent_dark": "#4D525A",
        "ink": "#2D3138",
        "muted": "#7A7F88",
    },
}


def _fmt_money(v: Any) -> str:
    """Format as German Euro: 1.234,56 € (handles None / strings)."""
    try:
        n = float(v or 0)
    except (ValueError, TypeError):
        n = 0.0
    neg = n < 0
    n = abs(n)
    whole = int(n)
    frac = round((n - whole) * 100)
    if frac == 100:
        whole += 1
        frac = 0
    s = f"{whole:,}".replace(",", ".")
    out = f"{s},{frac:02d} €"
    return f"-{out}" if neg else out


def _fmt_date(s: Any) -> str:
    if not s:
        return ""
    if isinstance(s, datetime):
        return s.strftime("%d.%m.%Y")
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).strftime("%d.%m.%Y")
    except Exception:
        return str(s)[:10]


def _compute_due_date(invoice: dict) -> str:
    """Return due_date or invoice_date + payment_due_days."""
    if invoice.get("due_date"):
        return _fmt_date(invoice["due_date"])
    issue = invoice.get("invoice_date") or invoice.get("issue_date") or invoice.get("created_at")
    days = invoice.get("payment_due_days", 14)
    if not issue:
        return ""
    if isinstance(issue, str):
        try:
            issue = datetime.fromisoformat(issue.replace("Z", "+00:00"))
        except Exception:
            return ""
    return (issue + timedelta(days=int(days or 14))).strftime("%d.%m.%Y")


async def _load_logo_image(pro_snap: dict) -> Image | None:
    """Resolve the pro's logo to a ReportLab Image — from logo_b64 OR GridFS file id."""
    # 1. inline base64 (rare)
    raw = None
    b64 = pro_snap.get("logo_b64")
    if b64:
        try:
            raw = base64.b64decode(b64.split(",", 1)[-1])
        except Exception:
            raw = None
    # 2. GridFS via logo_file_id (canonical)
    if not raw:
        fid = pro_snap.get("logo_file_id")
        if fid:
            try:
                grid_out = await fs_bucket.open_download_stream(ObjectId(fid))
                raw = await grid_out.read()
            except Exception as e:
                logger.warning("logo GridFS read failed for %s: %s", fid, e)
    if not raw:
        return None
    try:
        # Cap to ~5MB
        if len(raw) > 5_000_000:
            return None
        # Normalise the colour mode — reportlab chokes on palette/grayscale PNGs
        from PIL import Image as PILImage
        pil = PILImage.open(BytesIO(raw))
        if pil.mode not in ("RGB", "RGBA"):
            pil = pil.convert("RGBA")
        norm_buf = BytesIO()
        pil.save(norm_buf, format="PNG")
        norm_buf.seek(0)
        return Image(norm_buf, width=60 * mm, height=40 * mm, kind="proportional")
    except Exception as e:
        logger.warning("logo Image() failed: %s", e)
        return None


def _build_epc_qr_image(invoice: dict, pro_snap: dict) -> Image | None:
    """Build an EPC069-12 GiroCode QR-PNG inline from the pro's bank data + invoice total."""
    iban = pro_snap.get("bank_iban") or pro_snap.get("iban")
    if not iban:
        return None
    amount = float(
        invoice.get("brutto_total")
        or invoice.get("net_total")
        or invoice.get("netto_total")
        or 0
    )
    if amount <= 0:
        return None
    # Lazy import (only when actually rendering) to avoid hard dep at import time.
    try:
        from services.pro_invoicing import build_epc_qr_png
    except Exception:
        return None
    try:
        png_bytes = build_epc_qr_png(
            name=(pro_snap.get("bank_account_holder")
                  or pro_snap.get("business_name")
                  or pro_snap.get("name") or "Empfänger")[:70],
            iban=iban,
            bic=pro_snap.get("bank_bic") or pro_snap.get("bic"),
            amount=amount,
            reference=invoice.get("invoice_number", "Rechnung")[:35],
            scale=4,
        )
        return Image(BytesIO(png_bytes), width=34 * mm, height=34 * mm)
    except Exception as e:
        logger.info("EPC QR generation skipped: %s", e)
        return None


# ─────────────────────────── Layout builders ───────────────────────────
def _accent_band(palette: dict) -> Table:
    """Thin colored rule at the top — matches the 1pt rule above the footer for symmetry."""
    band = Table([[""]], colWidths=[174 * mm], rowHeights=[0.7 * mm])
    band.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(palette["accent"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return band


def _header_band(invoice: dict, palette: dict, styles: dict, logo_img: Image | None) -> Table:
    pro = invoice.get("pro_snapshot", {}) or {}
    biz = pro.get("business_name") or pro.get("name", "")
    inv_no = invoice.get("invoice_number", "")

    # left = logo placeholder OR business name; right = "RECHNUNG"
    if logo_img:
        left_cell = logo_img
    else:
        # Fallback: show business name in a stylized box
        left_cell = Paragraph(f"<b>{biz}</b>", styles["pro_name_left"])

    right_cell = [
        Paragraph("RECHNUNG", styles["h_title"]),
        Paragraph(f"<font color='{palette['muted']}'>Nr. {inv_no}</font>", styles["body_right"]),
    ]
    tbl = Table([[left_cell, right_cell]], colWidths=[80 * mm, 94 * mm], rowHeights=[40 * mm])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tbl


def _address_block(invoice: dict, palette: dict, styles: dict) -> Table:
    cust = invoice.get("customer_snapshot", {}) or {}
    bill_lines = [
        f"<b>{cust.get('name', '')}</b>",
        cust.get("address") or cust.get("address_line1", ""),
        f"{cust.get('postal_code', '')} {cust.get('city', '')}".strip(),
        cust.get("country") or "",
    ]
    bill_html = "<br/>".join([ln for ln in bill_lines if ln])
    ship_src = cust.get("shipping_address") or cust
    ship_lines = [
        f"<b>{ship_src.get('name', cust.get('name', ''))}</b>",
        ship_src.get("address") or ship_src.get("address_line1") or cust.get("address", ""),
        (f"{ship_src.get('postal_code', cust.get('postal_code', ''))} "
         f"{ship_src.get('city', cust.get('city', ''))}").strip(),
        ship_src.get("country") or cust.get("country", ""),
    ]
    ship_html = "<br/>".join([ln for ln in ship_lines if ln])

    tbl = Table(
        [[
            [Paragraph("RECHNUNGSADRESSE", styles["section_label"]),
             Paragraph(bill_html, styles["body"])],
            [Paragraph("LIEFERADRESSE", styles["section_label"]),
             Paragraph(ship_html, styles["body"])],
        ]],
        colWidths=[87 * mm, 87 * mm],
    )
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tbl


def _details_block(invoice: dict, palette: dict, styles: dict) -> Table:
    cust = invoice.get("customer_snapshot", {}) or {}
    invoice_date = _fmt_date(
        invoice.get("invoice_date") or invoice.get("issue_date") or invoice.get("created_at")
    )
    due_date = _compute_due_date(invoice)
    period = invoice.get("service_period") or invoice.get("performance_period") or invoice_date
    rows_left = [
        ("Rechnungsnummer", invoice.get("invoice_number", "")),
        ("Datum", invoice_date),
        ("Leistungszeitraum", period),
    ]
    rows_right = [
        ("Kundennummer", cust.get("customer_id") or cust.get("id") or "—"),
        ("Zahlungsziel", due_date),
    ]

    def _pairs(rows):
        out = []
        for label, value in rows:
            out.append(
                Paragraph(
                    f"<font color='{palette['muted']}' size=7><b>{label.upper()}</b></font><br/>"
                    f"{value}",
                    styles["body"],
                )
            )
        return out

    tbl = Table(
        [[_pairs(rows_left), _pairs(rows_right)]],
        colWidths=[87 * mm, 87 * mm],
    )
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return tbl


def _line_items_table(invoice: dict, palette: dict, styles: dict) -> Table:
    items = invoice.get("line_items") or []
    headers = ["Pos.", "Leistung / Produkt", "Menge", "Einzelpreis", "Gesamt"]
    rows = [headers]
    for i, line in enumerate(items, start=1):
        qty = line.get("qty") or line.get("quantity") or 1
        unit = float(line.get("unit_net") or line.get("unit_price") or 0)
        total = float(
            line.get("line_net")
            or line.get("line_total")
            or line.get("line_total_brutto")
            or (qty * unit)
        )
        rows.append([
            str(i),
            Paragraph(str(line.get("description", "")), styles["body"]),
            f"{qty:g}",
            _fmt_money(unit),
            _fmt_money(total),
        ])

    tbl = Table(rows, colWidths=[14 * mm, 90 * mm, 16 * mm, 28 * mm, 28 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(palette["bg_med"])),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor(palette["accent_dark"])),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor(palette["ink"])),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (-1, 0), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 1), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(palette["bg_soft"])]),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor(palette["accent"])),
    ]))
    return tbl


def _totals_with_qr(invoice: dict, palette: dict, styles: dict, qr_img: Image | None) -> Table:
    """QR-Code (left) + totals (right) on the same row."""
    netto = float(
        invoice.get("net_total")
        or invoice.get("netto_total")
        or sum(float(li.get("line_net") or li.get("line_total") or 0) for li in (invoice.get("line_items") or []))
    )
    vat = float(invoice.get("vat_total") or invoice.get("ust_total") or 0)
    brutto = float(invoice.get("brutto_total") or (netto + vat))
    vat_pct = invoice.get("vat_rate", 20 if vat else 0)

    totals_inner = Table(
        [
            ["Netto", _fmt_money(netto)],
            [f"USt. ({vat_pct}%)", _fmt_money(vat)],
            ["Gesamtbetrag", _fmt_money(brutto)],
        ],
        colWidths=[50 * mm, 38 * mm],
    )
    totals_inner.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, 1), 9.5),
        ("FONTSIZE", (0, 2), (-1, 2), 13),
        ("FONTNAME", (0, 0), (-1, 1), "Helvetica"),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (-1, 1), colors.HexColor(palette["muted"])),
        ("TEXTCOLOR", (-1, 0), (-1, 1), colors.HexColor(palette["ink"])),
        ("TEXTCOLOR", (0, 2), (-1, 2), colors.HexColor(palette["accent_dark"])),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor(palette["bg_soft"])),
        ("LINEABOVE", (0, 2), (-1, 2), 1.2, colors.HexColor(palette["accent"])),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 2), (-1, 2), 10),
        ("BOTTOMPADDING", (0, 2), (-1, 2), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))

    if qr_img:
        qr_cell = qr_img
        qr_caption = Paragraph(
            f"<font color='{palette['accent_dark']}' size=7><b>SCAN TO PAY</b></font><br/>"
            f"<font color='{palette['muted']}' size=6.5>EPC069-12 GiroCode</font>",
            styles["small"],
        )
    else:
        qr_cell = Paragraph(
            f"<font color='{palette['muted']}' size=7><i>Bankdaten siehe Fußzeile</i></font>",
            styles["small"],
        )
        qr_caption = ""

    outer = Table(
        [
            [qr_cell, "", totals_inner],
            [qr_caption, "", ""],
        ],
        colWidths=[38 * mm, 48 * mm, 88 * mm],
    )
    outer.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("SPAN", (2, 0), (2, 1)),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (0, 1), 2),
        ("TOPPADDING", (0, 1), (0, 1), 4),
    ]))
    return outer


def _hinweis_block(invoice: dict, palette: dict, styles: dict) -> Table | None:
    pro = invoice.get("pro_snapshot", {}) or {}
    notes: list[str] = []
    if pro.get("is_kleinunternehmer"):
        notes.append(
            "<b>Hinweis:</b> Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung "
            "(§ 6 Abs. 1 Z 27 UStG)."
        )
    elif pro.get("is_medical_exempt"):
        notes.append(
            "<b>Hinweis:</b> Umsatzsteuerbefreit gemäß § 6 Abs. 1 Z 19 UStG."
        )
    due = _compute_due_date(invoice)
    if due:
        notes.append(
            f"Bitte überweisen Sie den Betrag bis zum <b>{due}</b> auf das unten "
            "angegebene Konto. Vielen Dank für Ihren Auftrag!"
        )
    if not notes:
        return None
    tbl = Table(
        [[Paragraph("<br/><br/>".join(notes), styles["note"])]],
        colWidths=[174 * mm],
    )
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(palette["bg_soft"])),
        ("LINEBEFORE", (0, 0), (0, -1), 3, colors.HexColor(palette["accent"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 11),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
    ]))
    return tbl


def _footer_bank(invoice: dict, palette: dict, styles: dict) -> Table:
    pro = invoice.get("pro_snapshot", {}) or {}
    business = pro.get("business_name") or pro.get("name", "")
    address_line = " · ".join([s for s in [
        pro.get("address"),
        f"{pro.get('postal_code', '')} {pro.get('city', '')}".strip(),
        pro.get("country"),
    ] if s])
    contact_line = " · ".join([s for s in [
        pro.get("email"), pro.get("phone"), pro.get("website"),
    ] if s])
    tax_line = " · ".join([s for s in [
        f"UID: {pro['invoice_tax_id']}" if pro.get("invoice_tax_id") else None,
        f"Firmenbuchnr.: {pro['firmenbuch_no']}" if pro.get("firmenbuch_no") else None,
        f"Steuernr.: {pro['tax_no']}" if pro.get("tax_no") else None,
    ] if s])

    # Bank line — primary requirement of iter41
    bank_parts = []
    holder = pro.get("bank_account_holder")
    if holder:
        bank_parts.append(f"Inhaber: {holder}")
    if pro.get("bank_name"):
        bank_parts.append(f"Bank: {pro['bank_name']}")
    if pro.get("bank_iban") or pro.get("iban"):
        bank_parts.append(f"IBAN: {pro.get('bank_iban') or pro.get('iban')}")
    if pro.get("bank_bic") or pro.get("bic"):
        bank_parts.append(f"BIC: {pro.get('bank_bic') or pro.get('bic')}")
    bank_line = " · ".join(bank_parts)

    blocks = [Paragraph(f"<b>{business}</b>", styles["footer_strong"])]
    for line in (address_line, contact_line, tax_line):
        if line:
            blocks.append(Paragraph(line, styles["footer"]))
    if bank_line:
        blocks.append(Spacer(1, 2 * mm))
        blocks.append(Paragraph(
            f"<font color='{palette['accent_dark']}'><b>BANKVERBINDUNG</b></font>  &nbsp;{bank_line}",
            styles["footer"],
        ))
    if pro.get("invoice_footer"):
        blocks.append(Spacer(1, 2 * mm))
        blocks.append(Paragraph(str(pro["invoice_footer"])[:400], styles["footer"]))

    tbl = Table([[blocks]], colWidths=[174 * mm])
    tbl.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 1.2, colors.HexColor(palette["accent"])),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return tbl


# ─────────────────────────── Master renderer ───────────────────────────
def _build_styles(palette: dict) -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()["Normal"]
    return {
        "body": ParagraphStyle(
            "body", parent=base, fontName="Helvetica", fontSize=9, leading=12,
            textColor=colors.HexColor(palette["ink"]),
        ),
        "body_right": ParagraphStyle(
            "br", parent=base, fontName="Helvetica", fontSize=9.5, leading=12,
            textColor=colors.HexColor(palette["muted"]), alignment=2,
        ),
        "small": ParagraphStyle(
            "small", parent=base, fontName="Helvetica", fontSize=7.5, leading=10,
            textColor=colors.HexColor(palette["muted"]),
        ),
        "h_title": ParagraphStyle(
            "ht", parent=base, fontName="Helvetica-Bold", fontSize=30, leading=34,
            textColor=colors.HexColor(palette["accent_dark"]), alignment=2,
            spaceBefore=2, spaceAfter=4,
        ),
        "pro_name_left": ParagraphStyle(
            "pnl", parent=base, fontName="Helvetica-Bold", fontSize=16, leading=20,
            textColor=colors.HexColor(palette["accent_dark"]),
        ),
        "section_label": ParagraphStyle(
            "sl", parent=base, fontName="Helvetica-Bold", fontSize=7, leading=9,
            textColor=colors.HexColor(palette["accent_dark"]), spaceAfter=4,
        ),
        "note": ParagraphStyle(
            "note", parent=base, fontName="Helvetica", fontSize=8.5, leading=12,
            textColor=colors.HexColor(palette["ink"]),
        ),
        "footer": ParagraphStyle(
            "ft", parent=base, fontName="Helvetica", fontSize=7.5, leading=10,
            textColor=colors.HexColor(palette["muted"]),
        ),
        "footer_strong": ParagraphStyle(
            "fts", parent=base, fontName="Helvetica-Bold", fontSize=9, leading=11,
            textColor=colors.HexColor(palette["accent_dark"]),
        ),
    }


async def _render(invoice: dict, palette_key: str) -> bytes:
    palette = PALETTES[palette_key]
    styles = _build_styles(palette)
    pro_snap = invoice.get("pro_snapshot", {}) or {}

    # Preload async resources
    logo_img = await _load_logo_image(pro_snap)
    qr_img = _build_epc_qr_image(invoice, pro_snap)

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=12 * mm, bottomMargin=15 * mm,
        title=invoice.get("invoice_number", "Rechnung"),
    )
    elements: list[Any] = []
    elements.append(_accent_band(palette))
    elements.append(Spacer(1, 6 * mm))
    elements.append(_header_band(invoice, palette, styles, logo_img))
    elements.append(Spacer(1, 8 * mm))
    elements.append(_address_block(invoice, palette, styles))
    elements.append(Spacer(1, 8 * mm))
    elements.append(_details_block(invoice, palette, styles))
    elements.append(Spacer(1, 4 * mm))
    elements.append(_line_items_table(invoice, palette, styles))
    elements.append(Spacer(1, 8 * mm))
    elements.append(_totals_with_qr(invoice, palette, styles, qr_img))
    elements.append(Spacer(1, 8 * mm))
    hinweis = _hinweis_block(invoice, palette, styles)
    if hinweis:
        elements.append(hinweis)
        elements.append(Spacer(1, 6 * mm))
    elements.append(Spacer(1, 1))
    elements.append(_footer_bank(invoice, palette, styles))

    doc.build(elements)
    return buf.getvalue()


# Public renderers (one per palette)
async def render_pastel_mint(invoice: dict) -> bytes:
    return await _render(invoice, "pastel_mint")


async def render_pastel_rose(invoice: dict) -> bytes:
    return await _render(invoice, "pastel_rose")


async def render_pastel_grey(invoice: dict) -> bytes:
    return await _render(invoice, "pastel_grey")


# ─────────────────────── Public registry & migration ───────────────────────
_RENDERERS = {
    "pastel_mint": render_pastel_mint,
    "pastel_rose": render_pastel_rose,
    "pastel_grey": render_pastel_grey,
}


_LEGACY_TEMPLATE_MAP = {
    "classic": "pastel_mint",
    "modern": "pastel_grey",
    "minimalist": "pastel_mint",
    "bold": "pastel_rose",
    "elegant": "pastel_grey",
    "minimal_artisan": "pastel_mint",
    "creative_bold": "pastel_grey",
    "small_business": "pastel_rose",
    "medical": "pastel_mint",
    # Iter43: lavender retired → grey
    "pastel_lavender": "pastel_grey",
}


def migrate_template_key(key: str | None) -> str:
    if not key:
        return "pastel_mint"
    if key in _RENDERERS:
        return key
    return _LEGACY_TEMPLATE_MAP.get(key) or ""


def is_known_template_key(key: str | None) -> bool:
    if not key:
        return False
    return key in _RENDERERS or key in _LEGACY_TEMPLATE_MAP


async def render_with_template(invoice: dict) -> bytes:
    tpl_raw = (invoice.get("pro_snapshot", {}) or {}).get("invoice_template") or "pastel_mint"
    tpl = migrate_template_key(tpl_raw) or "pastel_mint"
    return await _RENDERERS[tpl](invoice)


TEMPLATE_OPTIONS = [
    {"key": "pastel_mint", "name": "Pastel Mint"},
    {"key": "pastel_rose", "name": "Pastel Rose"},
    {"key": "pastel_grey", "name": "Pastel Grey"},
]
