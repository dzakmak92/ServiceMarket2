"""Quote (Angebot) PDF.

The customer-facing document the wedge depends on. It shares the invoice
renderer's layout so a customer who receives both sees one business, not two
tools, but the content differs in ways that matter legally and commercially:

  · An Angebot is not a Rechnung. It carries no invoice number, no
    Leistungszeitpunkt and no payment demand, because none of those exist yet
    — printing them would make a non-binding offer look like a due invoice.
  · Optional positions are shown and marked, with their value excluded from
    the total. A customer must be able to see what they are declining.
  · The assumptions block is printed in full. It is the difference between an
    estimate and a fixed-price trap when the substrate turns out to be
    rotten, and burying it would defeat the purpose of collecting it.
  · Validity is stated explicitly. §145 BGB / §862 ABGB bind an offer until
    it lapses, so an offer without a date stays open indefinitely.
"""
from __future__ import annotations

import json
import logging
from decimal import Decimal
from io import BytesIO
from typing import Any

logger = logging.getLogger(__name__)

TIER_LABELS = {"basic": "Basis", "standard": "Standard", "premium": "Premium"}
KIND_LABELS = {"labor": "Arbeit", "material": "Material",
               "travel": "Anfahrt", "other": "Sonstiges"}


def _d(v: Any) -> Decimal:
    return Decimal(str(v or 0))


def _eur(v: Any) -> str:
    """German formatting: 1.234,56 €"""
    return f"{_d(v):,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _snap(v: Any) -> dict:
    if isinstance(v, dict):
        return v
    if isinstance(v, str) and v.strip():
        try:
            return json.loads(v)
        except ValueError:
            return {}
    return {}


def totals_rows(quote: dict, lines: list) -> list[list[Any]]:
    """The rows under the position table.

    A pure function so it can be checked without rendering a PDF and reading
    the bytes back.

    The document discount gets its own row. The positions above print the
    amount before it and "Nettobetrag" printed the amount after it, with
    nothing in between to explain the gap: on a 20 % quote the single line
    read 1.000,00 € and the net read 800,00 €. A legally binding offer whose
    own figures do not add up is not a rounding complaint — it is a document
    the customer is entitled to query and the pro cannot defend.

    Optional positions are excluded from the subtotal for the same reason
    they are excluded from the total: they are not part of the offer unless
    the customer selects them.
    """
    disc_pct = _d(quote.get("discount_pct"))
    net = _d(quote.get("net_total"))
    rows: list[list[Any]] = []
    if disc_pct and disc_pct < Decimal("100"):
        subtotal = sum(
            (_d(l.get("net_amount")) for l in lines
             if not (l.get("is_optional") and not l.get("is_selected"))),
            Decimal("0"))
        if not subtotal:
            subtotal = (net / (Decimal("1") - disc_pct / Decimal("100"))
                        ).quantize(Decimal("0.01"))
        rows.append(["Zwischensumme", _eur(subtotal)])
        rows.append([f"Rabatt {disc_pct:.0f} %".replace(".", ","),
                     "-" + _eur(subtotal - net)])
    rows.append(["Nettobetrag", _eur(net)])
    if _d(quote.get("vat_total")):
        rows.append(["USt.", _eur(quote.get("vat_total"))])
    rows.append(["Gesamtbetrag", _eur(quote.get("gross_total"))])
    return rows


def render_quote_pdf(quote: dict, *, pro: dict, customer: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer,
                                    Table, TableStyle)

    pro = _snap(pro)
    customer = _snap(customer)
    lines = quote.get("lines") or []
    number = quote.get("quote_number") or "ENTWURF"

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
        title=f"Angebot {number}",
        author=pro.get("business_name") or pro.get("name", ""),
    )
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["Normal"], fontName="Helvetica",
                          fontSize=9, leading=11)
    small = ParagraphStyle("small", parent=body, fontSize=7,
                           textColor=colors.HexColor("#666"))
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=20, leading=23, spaceAfter=4)
    el: list[Any] = []

    el.append(Paragraph(" · ".join(filter(None, [
        pro.get("business_name") or pro.get("name", ""),
        pro.get("business_address") or "",
        " ".join(filter(None, [pro.get("business_postal_code") or "",
                               pro.get("business_city") or ""])),
    ])), small))
    el.append(Spacer(1, 9 * mm))

    cust_block = "<br/>".join(x for x in [
        customer.get("company_name") or customer.get("name", ""),
        customer.get("contact_person") or "",
        customer.get("address", ""),
        " ".join(filter(None, [customer.get("postal_code") or "",
                               customer.get("city") or ""])),
    ] if x)

    meta = [f"<b>Angebots-Nr.:</b> {number}"]
    if quote.get("created_at"):
        meta.append(f"<b>Datum:</b> {quote['created_at'].strftime('%d.%m.%Y')}")
    if quote.get("tier"):
        meta.append(f"<b>Variante:</b> {TIER_LABELS.get(quote['tier'], quote['tier'])}")
    # Stated explicitly: an offer without a lapse date stays binding.
    if quote.get("valid_until"):
        meta.append(f"<b>Gültig bis:</b> {quote['valid_until'].strftime('%d.%m.%Y')}")
    if quote.get("version") and int(quote["version"]) > 1:
        meta.append(f"<b>Version:</b> {quote['version']}")

    el.append(Table(
        [[Paragraph(cust_block, body), Paragraph("<br/>".join(meta), body)]],
        colWidths=[95 * mm, 75 * mm],
        style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                          ("LEFTPADDING", (0, 0), (-1, -1), 0)]),
    ))
    el.append(Spacer(1, 8 * mm))

    el.append(Paragraph("Angebot", h1))
    if quote.get("title"):
        el.append(Paragraph(f"<b>{quote['title']}</b>", body))
    if quote.get("intro"):
        el.append(Spacer(1, 2 * mm))
        el.append(Paragraph(quote["intro"], body))
    el.append(Spacer(1, 5 * mm))

    # ── Positions ──────────────────────────────────────────────────────
    head = ["Pos.", "Leistung", "Menge", "Einheit", "Einzelpreis", "Betrag"]
    rows: list[list[Any]] = [head]
    optional_total = Decimal("0")

    for i, ln in enumerate(lines, start=1):
        qty = _d(ln.get("qty"))
        waste = _d(ln.get("waste_factor"))
        effective_qty = qty * (Decimal("1") + waste)
        # `net_amount` is the generated column on quote_lines. This read
        # `line_net`, a key that exists nowhere in the codebase, so the
        # fallback recomputation ran on every line of every quote ever
        # rendered — silently, and only correct by luck.
        amount = _d(ln.get("net_amount"))
        if not amount:
            amount = effective_qty * _d(ln.get("unit_price"))
            amount -= amount * _d(ln.get("discount_pct")) / Decimal("100")

        desc = ln.get("description") or ""
        extras = []
        if ln.get("kind") and ln["kind"] != "labor":
            extras.append(KIND_LABELS.get(ln["kind"], ln["kind"]))
        # Verschnitt is stated, not folded silently into the quantity — the
        # customer is paying for it and can ask why.
        if waste:
            extras.append(f"inkl. {waste * 100:.0f} % Verschnitt")
        if ln.get("is_optional"):
            extras.append("<b>optional</b>")
            optional_total += amount
        if extras:
            desc += f"<br/><font size=7 color='#666'>{' · '.join(extras)}</font>"
        if ln.get("detail"):
            desc += f"<br/><font size=7 color='#666'>{ln['detail']}</font>"

        rows.append([
            str(i), Paragraph(desc, body),
            f"{effective_qty:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
            ln.get("unit") or "", _eur(ln.get("unit_price")), _eur(amount),
        ])

    el.append(Table(rows, colWidths=[10 * mm, 75 * mm, 18 * mm, 16 * mm, 25 * mm, 26 * mm],
                    style=TableStyle([
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 8),
                        ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.HexColor("#333")),
                        ("LINEBELOW", (0, 1), (-1, -2), 0.2, colors.HexColor("#ddd")),
                        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("TOPPADDING", (0, 0), (-1, -1), 3),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ])))
    el.append(Spacer(1, 4 * mm))

    # ── Totals ─────────────────────────────────────────────────────────
    #
    # The document discount gets its own row. The positions above print the
    # amount before it and "Nettobetrag" printed the amount after it, with
    # nothing in between to explain the gap: on a 20 % quote the single line
    # read 1.000,00 € and the net read 800,00 €. A legally binding offer whose
    # own figures do not add up is not a rounding complaint — it is a document
    # the customer is entitled to query and the pro cannot defend.
    totals = totals_rows(quote, lines)

    el.append(Table(totals, colWidths=[120 * mm, 50 * mm], hAlign="RIGHT",
                    style=TableStyle([
                        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
                        ("FONTSIZE", (0, 0), (-1, -1), 9),
                        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                        ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.HexColor("#333")),
                        ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ])))

    if optional_total:
        el.append(Spacer(1, 2 * mm))
        el.append(Paragraph(
            f"Optionale Positionen in Höhe von {_eur(optional_total)} sind im "
            f"Gesamtbetrag <b>nicht</b> enthalten.", small))

    # ── Assumptions ────────────────────────────────────────────────────
    if quote.get("assumptions"):
        el.append(Spacer(1, 6 * mm))
        el.append(Paragraph("<b>Annahmen und Vorbehalte</b>", body))
        el.append(Spacer(1, 1 * mm))
        el.append(Paragraph(quote["assumptions"].replace("\n", "<br/>"), small))

    el.append(Spacer(1, 6 * mm))
    footer = []
    if quote.get("valid_until"):
        footer.append(f"Dieses Angebot ist bis {quote['valid_until'].strftime('%d.%m.%Y')} gültig.")
    if pro.get("vat_id"):
        footer.append(f"UID: {pro['vat_id']}")
    if pro.get("invoice_footer"):
        footer.append(pro["invoice_footer"])
    if footer:
        el.append(Paragraph(" · ".join(footer), small))

    doc.build(el)
    return buf.getvalue()
