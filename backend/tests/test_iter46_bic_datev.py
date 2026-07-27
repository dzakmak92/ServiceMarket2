"""
iter46 tests: BIC validation fix + DATEV Buchungsstapel export.

Covers:
  1. Unit test: build_epc_qr_png does NOT raise on 9-char BIC (drops it silently)
  2. Unit test: build_epc_qr_png works with valid 8-char BIC
  3. Unit test: build_epc_qr_png works with valid 11-char BIC
  4. API: PATCH /api/profile/pro with 9-char BIC returns 400
  5. API: PATCH /api/profile/pro with 8-char BIC is accepted (200)
  6. API: PATCH /api/profile/pro with 11-char BIC is accepted (200)
  7. API: GET /api/tax/exports/datev-full.csv?year=2026 returns 200, text/csv
  8. API: DATEV CSV first line contains EXTF, second line has German column headers
  9. API: GET /api/tax/exports/datev-full.csv?year=2026&quarter=Q1 returns 200
  10. API: DATEV endpoint requires auth (401 without token)
"""

import sys
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://pro-toolkit-hub.preview.emergentagent.com"
).rstrip("/")


# ──────────────────────────────────────────────
# Unit tests for build_epc_qr_png BIC handling
# ──────────────────────────────────────────────

class TestEpcQrBicUnit:
    """Unit tests for BIC sanitization in build_epc_qr_png()"""

    def test_9char_bic_does_not_raise(self):
        """9-char BIC 'BTSABAXXX' should be silently dropped, QR still generated."""
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from services.pro_invoicing import build_epc_qr_png
        # Should NOT raise; BIC is silently dropped when invalid length
        result = build_epc_qr_png(
            name="Test Pro",
            iban="AT611904300234573201",
            bic="BTSABAXXX",   # 9 chars — invalid for EPC
            amount=100.00,
            reference="INV-001",
        )
        assert isinstance(result, bytes), "Expected PNG bytes returned"
        assert len(result) > 100, "Expected non-trivial PNG data"
        # Verify it is a valid PNG by checking magic bytes
        assert result[:4] == b'\x89PNG', "Expected valid PNG magic bytes"
        print("PASS: 9-char BIC handled silently, valid PNG generated")

    def test_8char_bic_works(self):
        """Valid 8-char BIC 'BKAUATWW' should be used normally."""
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from services.pro_invoicing import build_epc_qr_png
        result = build_epc_qr_png(
            name="Test Pro",
            iban="AT611904300234573201",
            bic="BKAUATWW",   # 8 chars — valid
            amount=50.00,
            reference="INV-002",
        )
        assert isinstance(result, bytes)
        assert result[:4] == b'\x89PNG'
        print("PASS: 8-char BIC works correctly")

    def test_11char_bic_works(self):
        """Valid 11-char BIC 'BKAUATWWXXX' should be used normally."""
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from services.pro_invoicing import build_epc_qr_png
        result = build_epc_qr_png(
            name="Test Pro",
            iban="AT611904300234573201",
            bic="BKAUATWWXXX",   # 11 chars — valid
            amount=75.50,
            reference="INV-003",
        )
        assert isinstance(result, bytes)
        assert result[:4] == b'\x89PNG'
        print("PASS: 11-char BIC works correctly")

    def test_none_bic_works(self):
        """No BIC (None) should generate QR without BIC field."""
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from services.pro_invoicing import build_epc_qr_png
        result = build_epc_qr_png(
            name="Test Pro",
            iban="AT611904300234573201",
            bic=None,
            amount=25.00,
            reference="INV-004",
        )
        assert isinstance(result, bytes)
        assert result[:4] == b'\x89PNG'
        print("PASS: None BIC works correctly")

    def test_invalid_iban_raises(self):
        """Invalid IBAN should raise ValueError (existing validation)."""
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from services.pro_invoicing import build_epc_qr_png
        with pytest.raises(ValueError, match="Invalid IBAN"):
            build_epc_qr_png(
                name="Test Pro",
                iban="INVALIDIBAN",
                bic="BKAUATWW",
                amount=100.00,
                reference="INV-005",
            )
        print("PASS: Invalid IBAN raises ValueError as expected")


# ──────────────────────────────────────────────
# API tests for BIC validation on PATCH /profile/pro
# ──────────────────────────────────────────────

class TestBicValidationApi:
    """API tests: BIC validation on PATCH /api/profile/pro"""

    def test_9char_bic_returns_400(self, pro):
        """PATCH with 9-char BIC 'BTSABAXXX' must return 400."""
        s = pro["session"]
        r = s.patch(f"{BASE_URL}/api/profile/pro", json={"bank_bic": "BTSABAXXX"})
        assert r.status_code == 400, (
            f"Expected 400 for 9-char BIC, got {r.status_code}: {r.text}"
        )
        data = r.json()
        detail = data.get("detail", "")
        # Helpful message should mention 8 or 11 chars
        assert "8" in detail or "11" in detail or "BIC" in detail.upper(), (
            f"Error detail should mention BIC length requirement, got: {detail}"
        )
        print(f"PASS: 9-char BIC returns 400. Detail: {detail}")

    def test_8char_bic_accepted(self, pro):
        """PATCH with 8-char BIC 'BKAUATWW' must return 200."""
        s = pro["session"]
        r = s.patch(f"{BASE_URL}/api/profile/pro", json={"bank_bic": "BKAUATWW"})
        assert r.status_code == 200, (
            f"Expected 200 for valid 8-char BIC, got {r.status_code}: {r.text}"
        )
        data = r.json()
        assert data.get("bank_bic") == "BKAUATWW", (
            f"Expected bank_bic='BKAUATWW' in response, got {data.get('bank_bic')}"
        )
        print("PASS: 8-char BIC accepted (200)")

    def test_11char_bic_accepted(self, pro):
        """PATCH with 11-char BIC 'BKAUATWWXXX' must return 200."""
        s = pro["session"]
        r = s.patch(f"{BASE_URL}/api/profile/pro", json={"bank_bic": "BKAUATWWXXX"})
        assert r.status_code == 200, (
            f"Expected 200 for valid 11-char BIC, got {r.status_code}: {r.text}"
        )
        data = r.json()
        assert data.get("bank_bic") == "BKAUATWWXXX", (
            f"Expected bank_bic='BKAUATWWXXX' in response, got {data.get('bank_bic')}"
        )
        print("PASS: 11-char BIC accepted (200)")

    def test_restore_original_bic(self, pro):
        """Restore BIC to original value after tests."""
        s = pro["session"]
        r = s.patch(f"{BASE_URL}/api/profile/pro", json={"bank_bic": "GIBAATWWXXX"})
        assert r.status_code == 200
        print("PASS: BIC restored to GIBAATWWXXX")

    def test_bic_validation_requires_auth(self, anon):
        """PATCH /profile/pro without auth should return 401 or 403."""
        r = anon.patch(f"{BASE_URL}/api/profile/pro", json={"bank_bic": "BKAUATWW"})
        assert r.status_code in (401, 403), (
            f"Expected 401/403 without auth, got {r.status_code}"
        )
        print(f"PASS: Unauthenticated PATCH /profile/pro returns {r.status_code}")


# ──────────────────────────────────────────────
# API tests for DATEV full export endpoint
# ──────────────────────────────────────────────

class TestDatevExportApi:
    """API tests: GET /api/tax/exports/datev-full.csv"""

    def test_datev_full_year_returns_200(self, pro):
        """GET /api/tax/exports/datev-full.csv?year=2026 returns 200."""
        s = pro["session"]
        r = s.get(f"{BASE_URL}/api/tax/exports/datev-full.csv?year=2026")
        assert r.status_code == 200, (
            f"Expected 200 for DATEV full export, got {r.status_code}: {r.text[:200]}"
        )
        print("PASS: DATEV full export returns 200")

    def test_datev_full_year_content_type_csv(self, pro):
        """Response content-type should be text/csv."""
        s = pro["session"]
        r = s.get(f"{BASE_URL}/api/tax/exports/datev-full.csv?year=2026")
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct, f"Expected text/csv content-type, got: {ct}"
        print(f"PASS: Content-Type is {ct}")

    def test_datev_full_year_first_line_extf(self, pro):
        """First line of DATEV CSV must start with 'EXTF'."""
        s = pro["session"]
        r = s.get(f"{BASE_URL}/api/tax/exports/datev-full.csv?year=2026")
        assert r.status_code == 200
        # Strip UTF-8 BOM if present
        content = r.content
        if content.startswith(b'\xef\xbb\xbf'):
            content = content[3:]
        text = content.decode("utf-8")
        lines = [l for l in text.splitlines() if l.strip()]
        assert len(lines) >= 1, "Expected at least 1 line in DATEV CSV"
        first_line = lines[0]
        assert first_line.startswith("EXTF"), (
            f"Expected first line to start with 'EXTF', got: {first_line[:80]}"
        )
        print(f"PASS: First line starts with EXTF: {first_line[:60]}")

    def test_datev_full_year_second_line_german_headers(self, pro):
        """Second line should have German column headers (Umsatz, Belegdatum, etc.)."""
        s = pro["session"]
        r = s.get(f"{BASE_URL}/api/tax/exports/datev-full.csv?year=2026")
        assert r.status_code == 200
        content = r.content
        if content.startswith(b'\xef\xbb\xbf'):
            content = content[3:]
        text = content.decode("utf-8")
        lines = [l for l in text.splitlines() if l.strip()]
        assert len(lines) >= 2, f"Expected at least 2 lines, got {len(lines)}"
        second_line = lines[1]
        # Should contain German accounting headers
        assert "Umsatz" in second_line, (
            f"Expected 'Umsatz' in second line, got: {second_line}"
        )
        assert "Belegdatum" in second_line, (
            f"Expected 'Belegdatum' in second line, got: {second_line}"
        )
        assert "Buchungstext" in second_line, (
            f"Expected 'Buchungstext' in second line, got: {second_line}"
        )
        print(f"PASS: Second line has German headers: {second_line[:80]}")

    def test_datev_quarter_q1_returns_200(self, pro):
        """GET /api/tax/exports/datev-full.csv?year=2026&quarter=Q1 returns 200."""
        s = pro["session"]
        r = s.get(f"{BASE_URL}/api/tax/exports/datev-full.csv?year=2026&quarter=Q1")
        assert r.status_code == 200, (
            f"Expected 200 for DATEV Q1 export, got {r.status_code}: {r.text[:200]}"
        )
        print("PASS: DATEV Q1 quarter export returns 200")

    def test_datev_quarter_q1_first_line_extf(self, pro):
        """DATEV Q1 export first line should also start with EXTF."""
        s = pro["session"]
        r = s.get(f"{BASE_URL}/api/tax/exports/datev-full.csv?year=2026&quarter=Q1")
        assert r.status_code == 200
        content = r.content
        if content.startswith(b'\xef\xbb\xbf'):
            content = content[3:]
        text = content.decode("utf-8")
        lines = [l for l in text.splitlines() if l.strip()]
        assert lines[0].startswith("EXTF"), (
            f"Q1 export first line should start with EXTF: {lines[0]}"
        )
        # Period should mention Q1 in the meta header
        assert "Q1" in lines[0], (
            f"Expected Q1 in meta header, got: {lines[0]}"
        )
        print(f"PASS: DATEV Q1 first line: {lines[0]}")

    def test_datev_export_requires_auth(self, anon):
        """GET /api/tax/exports/datev-full.csv without auth should return 401/403."""
        r = anon.get(f"{BASE_URL}/api/tax/exports/datev-full.csv?year=2026")
        assert r.status_code in (401, 403), (
            f"Expected 401/403 without auth, got {r.status_code}"
        )
        print(f"PASS: Unauthenticated DATEV export returns {r.status_code}")

    def test_datev_quarter_variants(self, pro):
        """Test all quarters Q1-Q4 return 200."""
        s = pro["session"]
        for q in ["Q1", "Q2", "Q3", "Q4"]:
            r = s.get(f"{BASE_URL}/api/tax/exports/datev-full.csv?year=2026&quarter={q}")
            assert r.status_code == 200, (
                f"Expected 200 for DATEV {q} export, got {r.status_code}"
            )
            print(f"PASS: DATEV {q} export returns 200")

    def test_datev_bom_encoding(self, pro):
        """DATEV CSV should have UTF-8 BOM so Excel opens correctly."""
        s = pro["session"]
        r = s.get(f"{BASE_URL}/api/tax/exports/datev-full.csv?year=2026")
        assert r.status_code == 200
        # UTF-8 BOM bytes: EF BB BF
        assert r.content[:3] == b'\xef\xbb\xbf', (
            "Expected UTF-8 BOM at start of DATEV CSV for Excel compatibility"
        )
        print("PASS: DATEV CSV has UTF-8 BOM")

    def test_datev_content_disposition(self, pro):
        """Response should have Content-Disposition attachment header."""
        s = pro["session"]
        r = s.get(f"{BASE_URL}/api/tax/exports/datev-full.csv?year=2026")
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower(), (
            f"Expected attachment in Content-Disposition, got: {cd}"
        )
        assert "datev_buchungsstapel" in cd.lower() or "datev" in cd.lower(), (
            f"Expected datev in filename, got: {cd}"
        )
        print(f"PASS: Content-Disposition: {cd}")
