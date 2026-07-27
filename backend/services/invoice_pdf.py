"""Invoice PDF for the Postgres invoice shape.

Carries over what was good in the Mongo renderer — layout, German labels,
the EPC-QR — and adds what §11 UStG (AT) / §14 UStG (DE) require and the old
one omitted:

  · Leistungszeitpunkt / Leistungszeitraum, which was absent entirely from
    pro-issued invoices.
  · A VAT summary broken out PER RATE. The old renderer printed a single
    `USt ({invoice.vat_rate}%)` row, which silently understates or overstates
    tax on any invoice mixing 20% work with 10% material or a §13b line —
    and a mixed invoice showing one rate is defective.
  · The mandatory legal note for each non-standard treatment.
  · The §35a labour/material split, so a German private customer can claim
    the deduction.
  · Abschlag netting on a Schlussrechnung, so the amount actually due is the
    number the customer sees.
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from decimal import Decimal
from io import BytesIO
from typing import Any, Optional

from services.epc_qr import build_epc_qr_png

logger = logging.getLogger(__name__)

TYPE_TITLES = {
    "standard": "Rechnung",
    "abschlag": "Abschlagsrechnung",
    "schluss": "Schlussrechnung",
    "storno": "Stornorechnung",
    "correction": "Korrekturrechnung",
}


def _d(v: Any) -> Decimal:
    return Decimal(str(v or 0))


def _eur(v: Any) -> str:
    """German formatting: 1.234,56 €"""
    return f"{_d(v):,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _snap(v: Any) -> dict:
    """Snapshots come back from asyncpg as jsonb text."""
    if isinstance(v, dict):
        return v
    if isinstance(v, str) and v.strip():
        try:
            return json.loads(v)
        except ValueError:
            return {}
    return {}


def render_invoice_pdf(invoice: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (Image, Paragraph, SimpleDocTemplate, Spacer,
                                    Table, TableStyle)

    pro = _snap(invoice.get("pro_snapshot"))
    cust = _snap(invoice.get("customer_snapshot"))
    lines = invoice.get("lines") or []
    number = invoice.get("invoice_number") or "ENTWURF"

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
        title=number, author=pro.get("business_name") or pro.get("name", ""),
    )
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["Normal"], fontName="Helvetica",
                          fontSize=9, leading=11)
    small = ParagraphStyle("small", parent=body, fontSize=7,
                           textColor=colors.HexColor("#666"))
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=20, leading=23, spaceAfter=4)
    el: list[Any] = []

    # ── Sender line ────────────────────────────────────────────────────
    el.append(Paragraph(" · ".join(filter(None, [
        pro.get("business_name") or pro.get("name", ""),
        pro.get("business_address") or pro.get("address", ""),
        " ".join(filter(None, [pro.get("business_postal_code") or "",
                               pro.get("business_city") or ""])),
    ])), small))
    el.append(Spacer(1, 9 * mm))

    # ── Recipient + meta ───────────────────────────────────────────────
    cust_block = "<br/>".join(x for x in [
        cust.get("company_name") or cust.get("name", ""),
        cust.get("contact_person") or "",
        cust.get("address", ""),
        " ".join(filter(None, [cust.get("postal_code") or "", cust.get("city") or ""])),
        cust.get("country", ""),
    ] if x)

    meta = [f"<b>Rechnungs-Nr.:</b> {number}"]
    if invoice.get("issue_date"):
        meta.append(f"<b>Rechnungsdatum:</b> {invoice['issue_date'].strftime('%d.%m.%Y')}")

    # Leistungszeitpunkt — mandatory, and missing from the old renderer.
    s, e = invoice.get("service_date_start"), invoice.get("service_date_end")
    if s and e and s != e:
        meta.append(f"<b>Leistungszeitraum:</b> {s.strftime('%d.%m.%Y')} – {e.strftime('%d.%m.%Y')}")
    elif s:
        meta.append(f"<b>Leistungsdatum:</b> {s.strftime('%d.%m.%Y')}")

    if invoice.get("due_date"):
        meta.append(f"<b>Fällig am:</b> {invoice['due_date'].strftime('%d.%m.%Y')}")
    if pro.get("vat_id"):
        meta.append(f"<b>UID-Nr.:</b> {pro['vat_id']}")
    elif pro.get("tax_number"):
        meta.append(f"<b>Steuernummer:</b> {pro['tax_number']}")
    if cust.get("vat_id"):
        meta.append(f"<b>UID Kunde:</b> {cust['vat_id']}")

    t = Table([[Paragraph(cust_block, body), Paragraph("<br/>".join(meta), body)]],
              colWidths=[85 * mm, 85 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    el.extend([t, Spacer(1, 9 * mm)])

    el.append(Paragraph(
        f"<b>{TYPE_TITLES.get(invoice.get('type', 'standard'), 'Rechnung')} {number}</b>", h1))
    el.append(Spacer(1, 5 * mm))

    # ── Positions ──────────────────────────────────────────────────────
    rows = [["Pos.", "Bezeichnung", "Menge", "Einheit", "Einzelpreis", "USt", "Netto"]]
    for i, l in enumerate(lines, 1):
        rows.append([
            str(i), l.get("description", ""),
            f"{_d(l.get('qty')):g}", l.get("unit", ""),
            _eur(l.get("unit_price")),
            f"{_d(l.get('vat_rate')):g}%",
            _eur(l.get("net_amount")),
        ])
    tbl = Table(rows, colWidths=[11*mm, 66*mm, 16*mm, 15*mm, 24*mm, 13*mm, 25*mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8F1F5")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#999")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CCC")),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    el.extend([tbl, Spacer(1, 4 * mm)])

    # ── Totals, with VAT broken out per rate ───────────────────────────
    by_rate: dict[Decimal, dict[str, Decimal]] = defaultdict(
        lambda: {"net": Decimal(0), "vat": Decimal(0)})
    for l in lines:
        b = by_rate[_d(l.get("vat_rate"))]
        b["net"] += _d(l.get("net_amount"))
        b["vat"] += _d(l.get("vat_amount"))

    trows = [["Nettobetrag", _eur(invoice.get("net_total"))]]
    for rate in sorted(by_rate):
        b = by_rate[rate]
        # A 0% band still has to appear — it is what tells the reader which
        # positions carry no VAT and why.
        trows.append([f"zzgl. {rate:g}% USt auf {_eur(b['net'])}", _eur(b["vat"])])
    trows.append(["Gesamtbetrag (brutto)", _eur(invoice.get("gross_total"))])

    prior = _d(invoice.get("prior_payments_gross"))
    due = _d(invoice.get("gross_total"))
    if prior:
        trows.append(["abzüglich bisheriger Abschlagszahlungen", "-" + _eur(prior)])
        due = due - prior
        trows.append(["Restbetrag", _eur(due)])

    tt = Table(trows, colWidths=[70 * mm, 30 * mm])
    style = [
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.black),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, -1), (-1, -1), 4),
    ]
    if prior:
        style.append(("FONTNAME", (0, len(trows) - 3), (-1, len(trows) - 3), "Helvetica-Bold"))
    tt.setStyle(TableStyle(style))
    wrap = Table([["", tt]], colWidths=[70 * mm, 100 * mm])
    wrap.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "RIGHT")]))
    el.extend([wrap, Spacer(1, 5 * mm)])

    # ── §35a split ─────────────────────────────────────────────────────
    labor = _d(invoice.get("labor_net"))
    material = _d(invoice.get("material_net"))
    travel = _d(invoice.get("travel_net"))
    # § 35a covers Arbeits-, Maschinen- und Fahrtkosten; only material is
    # excluded. Showing labour alone understates what the customer can claim.
    deductible = labor + travel
    if deductible:
        el.append(Paragraph(
            f"<b>Aufteilung gemäß § 35a EStG</b> — Lohn- und Fahrtkosten: "
            f"{_eur(deductible)} · Materialanteil: {_eur(material)}", small))
        el.append(Paragraph(
            "Der ausgewiesene Lohnanteil ist steuerlich absetzbar. Voraussetzung "
            "ist die Zahlung per Überweisung (keine Barzahlung).", small))
        el.append(Spacer(1, 4 * mm))

    # ── Mandatory legal notes ──────────────────────────────────────────
    for note in (invoice.get("legal_notes") or []):
        el.append(Paragraph(f"<i>{note}</i>", small))
    if invoice.get("legal_notes"):
        el.append(Spacer(1, 4 * mm))

    if invoice.get("type") == "storno" and invoice.get("storno_reason"):
        el.append(Paragraph(f"<i>Stornogrund: {invoice['storno_reason']}</i>", small))
        el.append(Spacer(1, 3 * mm))

    # ── Payment block + GiroCode ───────────────────────────────────────
    iban = pro.get("bank_iban")
    if iban and due > 0:
        pay = [
            f"<b>Bitte überweisen Sie {_eur(due)} auf folgendes Konto:</b>",
            f"Empfänger: {pro.get('bank_account_holder') or pro.get('business_name') or pro.get('name','')}",
            f"IBAN: {iban}",
        ]
        if pro.get("bank_bic"):
            pay.append(f"BIC: {pro['bank_bic']}")
        if pro.get("bank_name"):
            pay.append(f"Bank: {pro['bank_name']}")
        pay.append(f"Verwendungszweck: {number}")

        qr_img = None
        try:
            png = build_epc_qr_png(
                name=pro.get("bank_account_holder") or pro.get("business_name") or "",
                iban=iban, bic=pro.get("bank_bic"),
                amount=float(due),          # the amount DUE, not the gross
                reference=number, scale=4)
            qr_img = Image(BytesIO(png), width=30 * mm, height=30 * mm)
        except ValueError as exc:
            logger.warning("EPC-QR skipped on %s: %s", number, exc)

        pt = Table([[Paragraph("<br/>".join(pay), body), qr_img or Paragraph("", body)]],
                   colWidths=[120 * mm, 35 * mm])
        pt.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCC")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FAFAF7")),
        ]))
        el.extend([pt, Spacer(1, 2 * mm)])
        if qr_img:
            el.append(Paragraph(
                "<i>QR-Code mit der Banking-App scannen — die Überweisung wird "
                "automatisch ausgefüllt.</i>", small))
        el.append(Spacer(1, 4 * mm))

    if invoice.get("note"):
        el.append(Paragraph(f"Anmerkung: {invoice['note']}", small))
    if pro.get("invoice_footer"):
        el.append(Spacer(1, 3 * mm))
        el.append(Paragraph(f"<i>{pro['invoice_footer']}</i>", small))

    doc.build(el)
    return buf.getvalue()
