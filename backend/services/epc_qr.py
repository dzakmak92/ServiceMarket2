"""EPC069-12 "GiroCode" QR generation.

Extracted from services/pro_invoicing.py so the Postgres renderer and the
legacy Mongo one can share it without one importing the other.

The customer scans the code with their banking app and the SEPA transfer is
pre-filled — payee, IBAN, amount, reference. Worth keeping in view during
the payment-rail discussion: this already gets the tradesperson paid,
directly, with no PSP in the loop, which is why the Stripe work can safely
come last.
"""
from __future__ import annotations

import logging
from io import BytesIO
from typing import Optional

logger = logging.getLogger(__name__)


def normalize_iban(iban: str) -> str:
    return (iban or "").replace(" ", "").replace("-", "").upper()


def is_valid_iban(iban: str) -> bool:
    """ISO 13616 mod-97 check.

    Worth doing before rendering: an invalid IBAN produces a QR code that
    scans to nothing in the banking app, which is worse than showing no QR
    at all because the customer believes they have paid.
    """
    s = normalize_iban(iban)
    if len(s) < 15 or len(s) > 34:
        return False
    if not s[:2].isalpha() or not s[2:4].isdigit():
        return False
    rearranged = s[4:] + s[:4]
    digits = "".join(str(ord(c) - 55) if c.isalpha() else c for c in rearranged)
    try:
        return int(digits) % 97 == 1
    except ValueError:
        return False


def build_epc_qr_png(*, name: str, iban: str, bic: Optional[str], amount: float,
                     reference: str, scale: int = 5) -> bytes:
    """Render an EPC069-12 v2 GiroCode PNG.

    Raises ValueError on a malformed IBAN so the caller can omit the QR
    rather than print a dead one.
    """
    from segno import helpers

    name = (name or "").strip().replace("\n", " ").replace("\r", " ")[:70]
    iban_clean = normalize_iban(iban)
    if not is_valid_iban(iban_clean):
        raise ValueError(f"Invalid IBAN '{iban}' — failed checksum. EPC-QR not generated.")

    bic_clean = (bic or "").replace(" ", "").upper() if bic else None
    # segno requires exactly 8 or 11 characters; drop an invalid one rather
    # than fail, so the QR still renders without it.
    if bic_clean and len(bic_clean) not in (8, 11):
        bic_clean = None

    qr = helpers.make_epc_qr(
        name=name, iban=iban_clean, amount=round(float(amount), 2),
        reference=(reference or "")[:35], bic=bic_clean or None,
    )
    buf = BytesIO()
    qr.save(buf, kind="png", scale=scale, border=2)
    return buf.getvalue()
