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
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

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


# ── Look ────────────────────────────────────────────────────────────────
#
# Helvetica, the PDF base font, only covers Western European letters, so a
# customer called Ilić or Kovačević got a black box in their own name on the
# first document they ever received from the pro. Liberation Sans (SIL OFL,
# metric-compatible with Arial) ships with the backend and covers all of
# Latin Extended. Hex colours are written in six digits: ReportLab reads
# "#666" as 0x000666, which is why every grey on the old Angebot was blue.
FONT_DIR = Path(__file__).resolve().parent.parent / "data" / "fonts"
ACCENT = "#1f5f70"        # petrol, the app's project colour
ACCENT_TINT = "#e8f1f3"
INK = "#1a2e3d"
MUTED = "#5c6f7d"
RULE = "#d5dee5"
ZEBRA = "#f6f8fa"

_FONTS_READY = False


def _fonts() -> tuple[str, str, str]:
    """Register the embedded font once; fall back to Helvetica if missing."""
    global _FONTS_READY
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    if not _FONTS_READY:
        try:
            pdfmetrics.registerFont(TTFont("SM", str(FONT_DIR / "LiberationSans-Regular.ttf")))
            pdfmetrics.registerFont(TTFont("SM-Bold", str(FONT_DIR / "LiberationSans-Bold.ttf")))
            pdfmetrics.registerFont(TTFont("SM-Italic", str(FONT_DIR / "LiberationSans-Italic.ttf")))
            from reportlab.lib.fonts import addMapping
            addMapping("SM", 0, 0, "SM")
            addMapping("SM", 1, 0, "SM-Bold")
            addMapping("SM", 0, 1, "SM-Italic")
            addMapping("SM", 1, 1, "SM-Bold")
            _FONTS_READY = True
        except Exception:  # pragma: no cover - a missing file must not stop the PDF
            logger.exception("quote pdf: embedded font missing, using Helvetica")
            return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"
    return "SM", "SM-Bold", "SM-Italic"


def _esc(v: Any) -> str:
    return escape(str(v or ""))


def _qty(v: Decimal) -> str:
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s[:-3] if s.endswith(",00") else s


def _date(v: Any) -> str:
    return v.strftime("%d.%m.%Y") if v else ""


def _initials(name: str) -> str:
    parts = [p for p in (name or "").replace("-", " ").split() if p[:1].isalpha()]
    return ("".join(p[0] for p in parts[:2]) or "SM").upper()


def render_quote_pdf(quote: dict, *, pro: dict, customer: dict,
                     portal_url: str | None = None) -> bytes:
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.platypus import (KeepTogether, Paragraph, SimpleDocTemplate,
                                    Spacer, Table, TableStyle)

    REG, BOLD, ITAL = _fonts()
    C = colors.HexColor
    pro = _snap(pro)
    customer = _snap(customer)
    lines = quote.get("lines") or []
    number = quote.get("quote_number") or "Entwurf"
    business = pro.get("business_name") or pro.get("name") or ""
    contact = pro.get("contact_person") or pro.get("name") or ""
    phone = pro.get("phone") or ""
    email = pro.get("email") or ""
    street = pro.get("business_address") or ""
    town = " ".join(filter(None, [pro.get("business_postal_code") or "",
                                  pro.get("business_city") or ""]))

    W, H = A4
    LM, RM = 20 * mm, 18 * mm
    TW = W - LM - RM

    def st(name, **kw):
        base = dict(fontName=REG, fontSize=9.2, leading=12.4, textColor=C(INK))
        base.update(kw)
        return ParagraphStyle(name, **base)

    body = st("body")
    small = st("small", fontSize=7.6, leading=10, textColor=C(MUTED))
    label = st("label", fontName=BOLD, fontSize=7, leading=9, textColor=C(MUTED))
    title = st("title", fontName=BOLD, fontSize=19, leading=23)
    subject = st("subject", fontName=BOLD, fontSize=11, leading=14, textColor=C(ACCENT))
    cell = st("cell", fontSize=8.8, leading=11.4)
    cell_r = st("cell_r", fontSize=8.8, leading=11.4, alignment=2)
    cell_b = st("cell_b", fontName=BOLD, fontSize=8.8, leading=11.4, alignment=2)
    head = st("head", fontName=BOLD, fontSize=7.4, leading=9, textColor=C(ACCENT))
    head_r = st("head_r", fontName=BOLD, fontSize=7.4, leading=9, textColor=C(ACCENT), alignment=2)
    sect = st("sect", fontName=BOLD, fontSize=8.4, leading=11, textColor=C(ACCENT))

    # ── page furniture: drawn on every page ──────────────────────────────
    footer_cols = [
        [business, street, town],
        [x for x in [f"Tel. {phone}" if phone else "", email,
                     f"UID {pro['vat_id']}" if pro.get("vat_id") else
                     (f"St.-Nr. {pro['tax_number']}" if pro.get("tax_number") else "")] if x],
        [x for x in [pro.get("bank_name") or "",
                     f"IBAN {pro['bank_iban']}" if pro.get("bank_iban") else "",
                     f"BIC {pro['bank_bic']}" if pro.get("bank_bic") else ""] if x],
    ]

    class Paged(rl_canvas.Canvas):
        """Two passes, so the footer can say "Seite 1 von 2"."""
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self._furniture(total)
                super().showPage()
            super().save()

        def _furniture(self, total):
            c = self
            # accent band and letterhead
            c.setFillColor(C(ACCENT))
            c.rect(0, H - 4 * mm, W, 4 * mm, stroke=0, fill=1)
            y = H - 19 * mm
            c.roundRect(LM, y - 3 * mm, 11 * mm, 11 * mm, 2.4 * mm, stroke=0, fill=1)
            c.setFillColor(colors.white)
            c.setFont(BOLD, 10.5)
            c.drawCentredString(LM + 5.5 * mm, y + 0.6 * mm, _initials(business))
            c.setFillColor(C(INK))
            c.setFont(BOLD, 13)
            c.drawString(LM + 14 * mm, y + 2.6 * mm, business[:60])
            c.setFillColor(C(MUTED))
            c.setFont(REG, 7.8)
            c.drawString(LM + 14 * mm, y - 1.6 * mm,
                         "  ·  ".join(x for x in [street, town, phone, email] if x)[:120])
            c.setFont(BOLD, 8)
            c.setFillColor(C(ACCENT))
            c.drawRightString(W - RM, y + 2.6 * mm, "ANGEBOT")
            c.setFont(REG, 7.8)
            c.setFillColor(C(MUTED))
            c.drawRightString(W - RM, y - 1.6 * mm, number)
            # footer
            fy = 16 * mm
            c.setStrokeColor(C(RULE))
            c.setLineWidth(0.6)
            c.line(LM, fy + 6 * mm, W - RM, fy + 6 * mm)
            colw = TW / 3
            c.setFont(REG, 6.9)
            c.setFillColor(C(MUTED))
            for i, col in enumerate(footer_cols):
                for j, txt in enumerate(col[:3]):
                    c.drawString(LM + i * colw, fy + 2.6 * mm - j * 3.2 * mm, str(txt)[:52])
            c.drawRightString(W - RM, fy - 6.6 * mm, f"Seite {self._pageNumber} von {total}")

    buf = BytesIO()
    doc = SimpleDocTemplate(
        # The frame pads its content by 6 pt; the margins absorb that so a
        # full-width table lines up with the letterhead instead of spilling.
        buf, pagesize=A4, leftMargin=LM - 6, rightMargin=RM - 6,
        topMargin=30 * mm, bottomMargin=30 * mm,
        title=f"Angebot {number}", author=business, subject=quote.get("title") or "",
    )
    el: list[Any] = []

    # ── address and facts ────────────────────────────────────────────────
    sender = " · ".join(x for x in [business, street, town] if x)
    is_business = customer.get("type") == "business" or bool(customer.get("company_name"))
    recip = [customer.get("company_name") or customer.get("name") or "",
             customer.get("contact_person") or "" if is_business else "",
             customer.get("address") or "",
             " ".join(filter(None, [customer.get("postal_code") or "", customer.get("city") or ""]))]
    addr = [Paragraph(f'<u>{_esc(sender)}</u>', st("snd", fontSize=6.6, leading=9, textColor=C(MUTED))),
            Spacer(1, 2.2 * mm),
            Paragraph("<br/>".join(_esc(x) for x in recip if x), st("rcp", fontSize=10, leading=13.5))]

    facts = [["Angebot Nr.", number]]
    if quote.get("created_at"):
        facts.append(["Datum", _date(quote["created_at"])])
    if quote.get("valid_until"):
        facts.append(["Gültig bis", _date(quote["valid_until"])])
    if quote.get("tier") and quote.get("tier") != "standard":
        facts.append(["Variante", TIER_LABELS.get(quote["tier"], quote["tier"])])
    if quote.get("version") and int(quote["version"]) > 1:
        facts.append(["Version", str(quote["version"])])
    if contact:
        facts.append(["Ansprechpartner", contact])
    if phone:
        facts.append(["Telefon", phone])
    fact_tbl = Table([[Paragraph(_esc(k), small), Paragraph(_esc(v), st("fv", fontSize=8.6, leading=11))]
                      for k, v in facts],
                     colWidths=[28 * mm, 42 * mm],
                     style=TableStyle([
                         ("BACKGROUND", (0, 0), (-1, -1), C(ACCENT_TINT)),
                         ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                         ("LEFTPADDING", (0, 0), (-1, -1), 7),
                         ("TOPPADDING", (0, 0), (-1, -1), 2.2),
                         ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2),
                         ("TOPPADDING", (0, 0), (-1, 0), 6),
                         ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
                     ]))
    el.append(Table([[addr, fact_tbl]], colWidths=[TW - 70 * mm, 70 * mm],
                    style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                      ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                      ("RIGHTPADDING", (0, 0), (-1, -1), 0)])))
    el.append(Spacer(1, 11 * mm))

    # ── title, greeting, intro ───────────────────────────────────────────
    el.append(Paragraph(f"Angebot {_esc(number)}", title))
    if quote.get("title"):
        el.append(Paragraph(_esc(quote["title"]), subject))
    el.append(Spacer(1, 5 * mm))
    if is_business:
        greet = "Sehr geehrte Damen und Herren,"
    else:
        greet = f"Guten Tag {_esc(customer.get('name'))}," if customer.get("name") else "Guten Tag,"
    el.append(Paragraph(greet, body))
    el.append(Spacer(1, 2 * mm))
    intro = quote.get("intro") or ("vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen die "
                                   "folgenden Leistungen zu den angeführten Preisen an.")
    el.append(Paragraph(_esc(intro).replace("\n", "<br/>"), body))
    el.append(Spacer(1, 6 * mm))

    # ── positions, grouped by kind ───────────────────────────────────────
    def amount_of(ln) -> tuple[Decimal, Decimal]:
        qty = _d(ln.get("qty"))
        eff = qty * (Decimal("1") + _d(ln.get("waste_factor")))
        amt = _d(ln.get("net_amount"))
        if not amt:
            amt = eff * _d(ln.get("unit_price"))
            amt -= amt * _d(ln.get("discount_pct")) / Decimal("100")
        return eff, amt

    def is_opt(ln) -> bool:
        return bool(ln.get("is_optional") and not ln.get("is_selected"))

    order = ["labor", "material", "travel", "other"]
    main = [l for l in lines if not is_opt(l)]
    opts = [l for l in lines if is_opt(l)]
    kinds = [k for k in order if any((l.get("kind") or "other") == k for l in main)]
    kinds += sorted({(l.get("kind") or "other") for l in main} - set(order))

    widths = [10 * mm, TW - 10 * mm - 24 * mm - 25 * mm - 26 * mm, 24 * mm, 25 * mm, 26 * mm]
    rows: list[list[Any]] = [[Paragraph("POS.", head), Paragraph("LEISTUNG", head),
                              Paragraph("MENGE", head_r), Paragraph("EINZELPREIS", head_r),
                              Paragraph("GESAMT", head_r)]]
    style: list[Any] = [
        ("LINEBELOW", (0, 0), (-1, 0), 1, C(ACCENT)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.2),
        ("FONTNAME", (0, 0), (-1, -1), REG),
        ("FONTSIZE", (0, 0), (-1, -1), 8.8),
        ("TEXTCOLOR", (0, 0), (-1, -1), C(INK)),
    ]

    def desc_of(ln) -> str:
        d = f"<b>{_esc(ln.get('description'))}</b>"
        extra = []
        if ln.get("detail"):
            extra.append(_esc(ln["detail"]))
        waste = _d(ln.get("waste_factor"))
        # Verschnitt is stated, not folded silently into the quantity — the
        # customer is paying for it and can ask why.
        if waste:
            extra.append(f"inkl. {waste * 100:.0f} % Verschnitt")
        if extra:
            d += f"<br/><font size=7.6 color='{MUTED}'>{' · '.join(extra)}</font>"
        return d

    pos = 0
    multi = len(kinds) > 1
    for k in kinds:
        group = [l for l in main if (l.get("kind") or "other") == k]
        if multi:
            rows.append(["", Paragraph(KIND_LABELS.get(k, k).upper(), sect), "", "", ""])
            style += [("SPAN", (1, len(rows) - 1), (-1, len(rows) - 1)),
                      ("TOPPADDING", (0, len(rows) - 1), (-1, len(rows) - 1), 8),
                      ("BOTTOMPADDING", (0, len(rows) - 1), (-1, len(rows) - 1), 2)]
        sub = Decimal("0")
        for ln in group:
            pos += 1
            eff, amt = amount_of(ln)
            sub += amt
            rows.append([str(pos), Paragraph(desc_of(ln), cell),
                         Paragraph(f"{_qty(eff)} {_esc(ln.get('unit'))}", cell_r),
                         Paragraph(_eur(ln.get("unit_price")), cell_r),
                         Paragraph(_eur(amt), cell_r)])
            if pos % 2 == 0:
                style.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), C(ZEBRA)))
        if multi:
            rows.append(["", Paragraph(f"Summe {KIND_LABELS.get(k, k)}", st("sl", fontSize=8, leading=10, textColor=C(MUTED), alignment=2)),
                         "", "", Paragraph(_eur(sub), cell_b)])
            r = len(rows) - 1
            style += [("SPAN", (1, r), (3, r)), ("LINEABOVE", (1, r), (-1, r), 0.5, C(RULE))]
    el.append(Table(rows, colWidths=widths, repeatRows=1, style=TableStyle(style)))
    el.append(Spacer(1, 4 * mm))

    # ── totals ───────────────────────────────────────────────────────────
    #
    # The document discount gets its own row (see totals_rows): a legally
    # binding offer whose own figures do not add up is a document the
    # customer is entitled to query and the pro cannot defend.
    rates = {_d(l.get("vat_rate")) for l in main if l.get("vat_rate") is not None}
    trows = totals_rows(quote, lines)
    shown = []
    for k, v in trows:
        if k == "USt." and len(rates) == 1:
            k = f"USt. {next(iter(rates)):.0f} %"
        shown.append([Paragraph(k, st("tk", fontSize=9, leading=12, alignment=2, textColor=C(MUTED))),
                      Paragraph(v, st("tv", fontSize=9, leading=12, alignment=2))])
    shown[-1] = [Paragraph("Gesamtbetrag", st("gk", fontName=BOLD, fontSize=10.5, leading=13, alignment=2, textColor=colors.white)),
                 Paragraph(trows[-1][1], st("gv", fontName=BOLD, fontSize=12, leading=14, alignment=2, textColor=colors.white))]
    tot = Table(shown, colWidths=[46 * mm, 32 * mm], hAlign="RIGHT",
                style=TableStyle([
                    ("BACKGROUND", (0, -1), (-1, -1), C(ACCENT)),
                    ("LINEABOVE", (0, -2), (-1, -2), 0.5, C(RULE)) if len(shown) > 2 else ("LEFTPADDING", (0, 0), (0, 0), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 2.4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2.4),
                    ("TOPPADDING", (0, -1), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]))
    if quote.get("is_kleinunternehmer") or pro.get("is_kleinunternehmer"):
        el.append(KeepTogether([tot, Spacer(1, 1.5 * mm), Paragraph(
            "Umsatzsteuerbefreit – Kleinunternehmer gem. § 6 Abs. 1 Z 27 UStG.",
            st("ku", fontSize=7.6, leading=10, textColor=C(MUTED), alignment=2))]))
    else:
        el.append(tot)

    # ── optional positions ───────────────────────────────────────────────
    if opts:
        el.append(Spacer(1, 7 * mm))
        orows = [[Paragraph("OPTIONAL – NICHT IM GESAMTBETRAG ENTHALTEN", head), "", "", "", ""]]
        ostyle: list[Any] = [("SPAN", (0, 0), (-1, 0)), ("LINEBELOW", (0, 0), (-1, 0), 0.6, C(RULE)),
                             ("FONTNAME", (0, 0), (-1, -1), REG), ("FONTSIZE", (0, 0), (-1, -1), 8.8),
                             ("TEXTCOLOR", (0, 0), (-1, -1), C(MUTED)),
                             ("VALIGN", (0, 0), (-1, -1), "TOP"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                             ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
        opt_sum = Decimal("0")
        for n, ln in enumerate(opts, start=1):
            eff, amt = amount_of(ln)
            opt_sum += amt
            orows.append([f"O{n}", Paragraph(desc_of(ln), cell),
                          Paragraph(f"{_qty(eff)} {_esc(ln.get('unit'))}", cell_r),
                          Paragraph(_eur(ln.get("unit_price")), cell_r),
                          Paragraph(_eur(amt), cell_r)])
        el.append(Table(orows, colWidths=widths, style=TableStyle(ostyle)))
        el.append(Paragraph(f"Auf Wunsch zusätzlich beauftragbar, zusammen {_eur(opt_sum)} netto.", small))

    # ── conditions and assumptions ───────────────────────────────────────
    el.append(Spacer(1, 8 * mm))
    cond = []
    if quote.get("valid_until"):
        cond.append(f"Dieses Angebot gilt bis <b>{_date(quote['valid_until'])}</b>.")
    cond.append("Ausführung nach Terminvereinbarung.")
    days = pro.get("payment_terms_days") or 14
    cond.append(f"Zahlung innerhalb von {days} Tagen nach Rechnungserhalt ohne Abzug.")
    left = [Paragraph("KONDITIONEN", label), Spacer(1, 1.6 * mm)]
    left += [Paragraph(f"• {c}", st("c", fontSize=8.4, leading=11.6)) for c in cond]
    right: list[Any] = []
    if quote.get("assumptions"):
        right = [Paragraph("ANNAHMEN UND VORBEHALTE", label), Spacer(1, 1.6 * mm)]
        right += [Paragraph(f"• {_esc(a.strip().lstrip('-•').strip())}", st("a", fontSize=8.4, leading=11.6))
                  for a in str(quote["assumptions"]).splitlines() if a.strip()]
    el.append(Table([[left, right]], colWidths=[TW / 2, TW / 2],
                    style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                      ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                      ("RIGHTPADDING", (0, 0), (0, -1), 8)])))

    # ── acceptance ───────────────────────────────────────────────────────
    el.append(Spacer(1, 8 * mm))
    sign_lines = Table(
        [["", "", ""], [Paragraph("Ort, Datum", small), "", Paragraph("Unterschrift Auftraggeber", small)]],
        colWidths=[48 * mm, 6 * mm, 52 * mm], rowHeights=[12 * mm, None], hAlign="LEFT",
        style=TableStyle([("LINEBELOW", (0, 0), (0, 0), 0.6, C(INK)),
                          ("LINEBELOW", (2, 0), (2, 0), 0.6, C(INK)),
                          ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    acc_text = [Paragraph("AUFTRAG ERTEILEN", st("al", fontName=BOLD, fontSize=8, leading=10, textColor=C(ACCENT))),
                Spacer(1, 1.5 * mm),
                Paragraph("Mit Ihrer Unterschrift beauftragen Sie die oben angeführten Leistungen "
                          "zu den genannten Preisen." + (" Oder nehmen Sie das Angebot direkt online an."
                                                          if portal_url else ""),
                          st("at", fontSize=8.4, leading=11.4)),
                Spacer(1, 2 * mm), sign_lines]
    if portal_url:
        qr = QrCodeWidget(portal_url)
        b = qr.getBounds()
        size = 24 * mm
        d = Drawing(size, size, transform=[size / (b[2] - b[0]), 0, 0, size / (b[3] - b[1]), 0, 0])
        d.add(qr)
        qr_cell = [d, Paragraph("Online ansehen<br/>und annehmen",
                                st("qc", fontSize=7, leading=8.6, textColor=C(MUTED), alignment=1))]
        acc = Table([[acc_text, qr_cell]], colWidths=[TW - 36 * mm, 36 * mm])
    else:
        acc = Table([[acc_text]], colWidths=[TW])
    acc.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, C(RULE)),
                             ("VALIGN", (0, 0), (-1, -1), "TOP"),
                             ("ALIGN", (-1, 0), (-1, 0), "CENTER"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 9),
                             ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                             ("TOPPADDING", (0, 0), (-1, -1), 8),
                             ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    closing = [Spacer(1, 7 * mm),
               Paragraph("Wir freuen uns auf Ihren Auftrag.", body),
               Spacer(1, 3 * mm),
               Paragraph("Mit freundlichen Grüßen", body),
               Spacer(1, 1.2 * mm),
               Paragraph(f"<b>{_esc(contact or business)}</b>", body)]
    if contact and business and contact != business:
        closing.append(Paragraph(_esc(business), small))
    if pro.get("invoice_footer"):
        closing += [Spacer(1, 3 * mm), Paragraph(_esc(pro["invoice_footer"]), small)]
    el.append(KeepTogether([acc] + closing))

    doc.build(el, canvasmaker=Paged)
    return buf.getvalue()
