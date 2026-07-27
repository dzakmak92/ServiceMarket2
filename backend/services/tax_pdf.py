"""Year-end (UStE-Vorbereitung) PDF — Austrian-compliant Einnahmen-Ausgaben-Rechnung."""
from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)


def _fmt(v: float) -> str:
    return f"€{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def render_tax_year_pdf(*, year: int, pro_snapshot: dict, revenue: dict, expenses: dict,
                       mileage: dict, svs: dict, est: dict, ust_buckets_by_q: dict) -> bytes:
    """Builds a single multi-section PDF the pro hands to the accountant.
    Sections:
      1. Cover (pro details, year, scope note)
      2. Einnahmen-Ausgaben-Rechnung summary
      3. Quarterly USt-VA buckets
      4. Mileage book
      5. SVS + Einkommensteuer estimate
    """
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=15 * mm, bottomMargin=15 * mm,
        title=f"Steuer-Jahresbericht {year}",
        author=pro_snapshot.get("name", ""),
    )
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=12)
    small = ParagraphStyle("small", parent=body, fontSize=7, textColor=colors.HexColor("#666"))
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=22, leading=24, spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=14, leading=18, spaceBefore=8, spaceAfter=4)

    el: list = []
    el.append(Paragraph(f"Steuer-Jahresbericht {year}", h1))
    sub = " · ".join(filter(None, [
        pro_snapshot.get("business_name") or pro_snapshot.get("name", ""),
        pro_snapshot.get("city", ""),
        f"UID: {pro_snapshot['invoice_tax_id']}" if pro_snapshot.get("invoice_tax_id") else "",
    ]))
    el.append(Paragraph(sub, small))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph(
        "<i>Vorbereitende Aufstellung für die Einnahmen-Ausgaben-Rechnung (§4 Abs. 3 EStG). "
        "Keine Steuerberatung — bitte mit Ihrer Steuerberatung abstimmen.</i>", small))
    el.append(Spacer(1, 8 * mm))

    # ── 1. EÜR summary ──
    el.append(Paragraph("1. Einnahmen-Ausgaben-Rechnung", h2))
    profit = revenue["paid_brutto"] - expenses["brutto"]
    rev_rows = [
        ["Einnahmen (kassenwirksam)", _fmt(revenue["paid_brutto"])],
        ["Ausstehende Forderungen", _fmt(revenue["pending_brutto"])],
        ["Ausgaben (Betriebskosten)", _fmt(expenses["brutto"])],
        ["Ergebnis (Gewinn/Verlust)", _fmt(profit)],
    ]
    t = Table(rev_rows, colWidths=[110 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.black),
        ("ROWBACKGROUNDS", (0, 0), (-1, -2), [colors.HexColor("#FAFAF7"), colors.white]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    el.append(t)
    el.append(Spacer(1, 6 * mm))

    # ── 2. USt-VA quarters ──
    el.append(Paragraph("2. Umsatzsteuer-Voranmeldung (USt-VA)", h2))
    q_rows = [["Quartal", "Netto", "USt", "Brutto"]]
    for q in ("Q1", "Q2", "Q3", "Q4"):
        d = ust_buckets_by_q.get(q, {"net": 0, "vat": 0, "brutto": 0})
        q_rows.append([q, _fmt(d["net"]), _fmt(d["vat"]), _fmt(d["brutto"])])
    q_rows.append(["Jahressumme", _fmt(revenue["net"]), _fmt(revenue["vat"]), _fmt(revenue["brutto"])])
    qt = Table(q_rows, colWidths=[40 * mm, 40 * mm, 40 * mm, 40 * mm])
    qt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8F1F5")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#999")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CCC")),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.black),
    ]))
    el.append(qt)

    if pro_snapshot.get("is_kleinunternehmer"):
        el.append(Spacer(1, 3 * mm))
        el.append(Paragraph(
            "<i>Hinweis: Kleinunternehmer gemäß § 6 Abs. 1 Z. 27 UStG — keine USt ausgewiesen.</i>", small))

    el.append(Spacer(1, 6 * mm))

    # ── 3. Mileage ──
    el.append(Paragraph("3. Fahrtenbuch (Kilometergeld)", h2))
    if mileage["trip_count"]:
        el.append(Paragraph(
            f"{mileage['trip_count']} Fahrten · geschätzt {mileage['total_estimated_km']} km · "
            f"Kilometergeld kumuliert <b>{_fmt(mileage['total_eur'])}</b>", body))
    else:
        el.append(Paragraph("Keine Fahrten erfasst (kein travel_cost auf Quotes).", small))

    el.append(Spacer(1, 6 * mm))

    # ── 4. SVS + ESt ──
    el.append(Paragraph("4. SVS-Beiträge (Schätzung)", h2))
    el.append(Paragraph(
        f"Basis (Gewinn): {_fmt(svs['annual_profit_basis_eur'])} · "
        f"Pension: {_fmt(svs['pension_eur'])} · "
        f"Kranken: {_fmt(svs['health_eur'])} · "
        f"Unfall: {_fmt(svs['accident_eur'])} → "
        f"<b>{_fmt(svs['total_eur'])}/Jahr ({_fmt(svs['monthly_eur'])}/Monat)</b>", body))

    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph("5. Einkommensteuer (Schätzung)", h2))
    el.append(Paragraph(
        f"Steuerbarer Gewinn: {_fmt(est['taxable_profit_eur'])} · "
        f"Berechnete ESt: <b>{_fmt(est['estimated_tax_eur'])}</b> · "
        f"Effektivsteuersatz: {est['effective_rate_pct']}%", body))

    el.append(Spacer(1, 8 * mm))
    el.append(Paragraph(
        f"Erstellt: {datetime.now().strftime('%d.%m.%Y %H:%M')} · ServiceMarket Tax Toolkit", small))

    doc.build(el)
    return buf.getvalue()
