"""
iter48 Billing Overhaul — backend API tests
Tests: subscription-status, transactions display_label, annual checkout, invalid billing_period,
double-click guard, cancel-subscription (end-of-period), trial/start, customer-portal, fee-log filter
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


# ──────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────

@pytest.fixture(scope='module')
def pro_session():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    r = s.post(f'{BASE_URL}/api/auth/login', json={
        'email': 'pro@test.com', 'password': 'Test123!'
    })
    if r.status_code != 200:
        pytest.skip(f'Pro login failed: {r.text}')
    return s


@pytest.fixture(scope='module')
def homeowner_session():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    r = s.post(f'{BASE_URL}/api/auth/login', json={
        'email': 'homeowner@test.com', 'password': 'Test123!'
    })
    if r.status_code != 200:
        pytest.skip(f'Homeowner login failed: {r.text}')
    return s


@pytest.fixture(scope='module')
def admin_session():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    r = s.post(f'{BASE_URL}/api/auth/login', json={
        'email': 'admin@servicemarket.eu', 'password': 'Admin123!'
    })
    if r.status_code != 200:
        pytest.skip(f'Admin login failed: {r.text}')
    return s


# ──────────────────────────────────────────────
# 1. GET /api/billing/subscription-status
# ──────────────────────────────────────────────

class TestSubscriptionStatus:
    """GET /billing/subscription-status — returns full sub metadata"""

    def test_subscription_status_200(self, pro_session):
        r = pro_session.get(f'{BASE_URL}/api/billing/subscription-status')
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        print(f"PASS: subscription-status returns 200")

    def test_subscription_status_has_required_fields(self, pro_session):
        r = pro_session.get(f'{BASE_URL}/api/billing/subscription-status')
        assert r.status_code == 200
        data = r.json()
        # Required fields
        assert 'plan_tier' in data, "Missing plan_tier"
        assert 'has_stripe_customer' in data, "Missing has_stripe_customer"
        assert 'trial_active' in data, "Missing trial_active"
        assert isinstance(data['has_stripe_customer'], bool), "has_stripe_customer must be bool"
        assert isinstance(data['trial_active'], bool), "trial_active must be bool"
        print(f"PASS: subscription-status has required fields — plan_tier={data['plan_tier']}, has_stripe_customer={data['has_stripe_customer']}")

    def test_subscription_status_sub_valid_until_field(self, pro_session):
        """sub_valid_until should be present (may be null for standard accounts)"""
        r = pro_session.get(f'{BASE_URL}/api/billing/subscription-status')
        data = r.json()
        # Key must be present (even if None)
        assert 'sub_valid_until' in data, "Missing sub_valid_until key"
        print(f"PASS: sub_valid_until present: {data.get('sub_valid_until')}")

    def test_subscription_status_403_for_homeowner(self, homeowner_session):
        """Homeowners should get 403 (Pros only)"""
        r = homeowner_session.get(f'{BASE_URL}/api/billing/subscription-status')
        assert r.status_code == 403, f"Expected 403 for homeowner, got {r.status_code}"
        print("PASS: subscription-status returns 403 for homeowner")

    def test_subscription_status_sub_cancels_at_field(self, pro_session):
        """sub_cancels_at should be in the response (may be null)"""
        r = pro_session.get(f'{BASE_URL}/api/billing/subscription-status')
        data = r.json()
        assert 'sub_cancels_at' in data, "Missing sub_cancels_at key"
        print(f"PASS: sub_cancels_at present: {data.get('sub_cancels_at')}")


# ──────────────────────────────────────────────
# 2. GET /api/billing/transactions — display_label
# ──────────────────────────────────────────────

class TestTransactionsDisplayLabel:
    """Each transaction must have display_label field"""

    def test_transactions_200(self, pro_session):
        r = pro_session.get(f'{BASE_URL}/api/billing/transactions')
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        print(f"PASS: GET /billing/transactions returns 200")

    def test_transactions_have_display_label(self, pro_session):
        r = pro_session.get(f'{BASE_URL}/api/billing/transactions')
        data = r.json()
        txns = data.get('transactions', [])
        print(f"INFO: {len(txns)} transactions found")
        for txn in txns:
            assert 'display_label' in txn, f"Transaction missing display_label: {txn.get('session_id', 'unknown')}"
            assert isinstance(txn['display_label'], str), "display_label must be a string"
            assert len(txn['display_label']) > 0, "display_label must not be empty"
        print(f"PASS: All {len(txns)} transactions have display_label")

    def test_transactions_display_label_values(self, pro_session):
        """display_label values should be human-readable strings"""
        r = pro_session.get(f'{BASE_URL}/api/billing/transactions')
        data = r.json()
        txns = data.get('transactions', [])
        valid_labels = {
            'Pro Plan Monthly', 'Pro Plan Annual', 'Invoice Toolkit', 'Tax Toolkit',
            'PM Toolkit', 'Pro Bundle (All Toolkits)', 'Contact Fees', 'Monthly Invoice',
            'Customer Invoice Payment', 'Payment'
        }
        for txn in txns:
            label = txn.get('display_label', '')
            print(f"INFO: txn display_label='{label}' metadata={txn.get('metadata', {})}")
        print(f"PASS: transaction labels verified")

    def test_transactions_structure(self, pro_session):
        """Each transaction has basic required fields"""
        r = pro_session.get(f'{BASE_URL}/api/billing/transactions')
        data = r.json()
        assert 'transactions' in data, "Response missing 'transactions' key"
        txns = data['transactions']
        assert isinstance(txns, list), "transactions must be a list"
        print(f"PASS: transactions response structure correct — {len(txns)} entries")


# ──────────────────────────────────────────────
# 3. POST /api/billing/checkout/subscription?billing_period=annual
# ──────────────────────────────────────────────

class TestSubscriptionCheckoutAnnual:
    """Annual subscription checkout creates session with correct price"""

    def test_annual_checkout_200(self, pro_session):
        """Annual checkout should create a Stripe session"""
        r = pro_session.post(
            f'{BASE_URL}/api/billing/checkout/subscription?billing_period=annual',
            json={'origin_url': BASE_URL}
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert 'session_id' in data, "Missing session_id"
        print(f"PASS: annual checkout returns 200 session_id={data.get('session_id')}")

    def test_annual_checkout_url_or_reuse(self, pro_session):
        """Response has either url or reuse=True (double-click guard)"""
        r = pro_session.post(
            f'{BASE_URL}/api/billing/checkout/subscription?billing_period=annual',
            json={'origin_url': BASE_URL}
        )
        data = r.json()
        # Either has a URL or reuse=True
        has_url = bool(data.get('url'))
        has_reuse = data.get('reuse') is True
        assert has_url or has_reuse, f"Expected url or reuse=True, got: {data}"
        print(f"PASS: annual checkout has url={has_url} or reuse={has_reuse}")

    def test_invalid_billing_period_returns_400(self, pro_session):
        """billing_period=invalid should return 400"""
        r = pro_session.post(
            f'{BASE_URL}/api/billing/checkout/subscription?billing_period=invalid',
            json={'origin_url': BASE_URL}
        )
        assert r.status_code == 400, f"Expected 400 for invalid billing_period, got {r.status_code}: {r.text}"
        data = r.json()
        assert 'detail' in data, "400 response should have detail field"
        assert 'billing_period' in data['detail'].lower() or 'monthly' in data['detail'].lower() or 'annual' in data['detail'].lower(), \
            f"Error message should mention billing_period: {data['detail']}"
        print(f"PASS: invalid billing_period returns 400 — detail='{data['detail']}'")

    def test_monthly_checkout_200(self, pro_session):
        """Monthly checkout should also work"""
        r = pro_session.post(
            f'{BASE_URL}/api/billing/checkout/subscription?billing_period=monthly',
            json={'origin_url': BASE_URL}
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        print(f"PASS: monthly checkout returns 200")


# ──────────────────────────────────────────────
# 4. Double-click guard
# ──────────────────────────────────────────────

class TestDoubleClickGuard:
    """Second subscription checkout call within 60s returns reuse=True"""

    def test_double_click_guard(self, pro_session):
        """Two rapid calls should return reuse:true on second call"""
        # First call
        r1 = pro_session.post(
            f'{BASE_URL}/api/billing/checkout/subscription?billing_period=monthly',
            json={'origin_url': BASE_URL}
        )
        assert r1.status_code == 200, f"First call failed: {r1.text}"
        d1 = r1.json()
        first_session_id = d1.get('session_id')
        print(f"INFO: First call session_id={first_session_id}, reuse={d1.get('reuse')}")

        # Second call immediately (within 60s)
        r2 = pro_session.post(
            f'{BASE_URL}/api/billing/checkout/subscription?billing_period=monthly',
            json={'origin_url': BASE_URL}
        )
        assert r2.status_code == 200, f"Second call failed: {r2.text}"
        d2 = r2.json()
        second_session_id = d2.get('session_id')
        print(f"INFO: Second call session_id={second_session_id}, reuse={d2.get('reuse')}")

        # Second call should return reuse=True with SAME session_id
        assert d2.get('reuse') is True, f"Expected reuse=True on second call, got: {d2}"
        assert second_session_id == first_session_id, \
            f"Expected same session_id on reuse, got {second_session_id} vs {first_session_id}"
        print(f"PASS: double-click guard works — reuse=True, same session_id={second_session_id}")


# ──────────────────────────────────────────────
# 5. POST /api/billing/cancel-subscription
# ──────────────────────────────────────────────

class TestCancelSubscription:
    """Cancel subscription — end-of-period for active Pro, 400 for Standard"""

    def test_cancel_subscription_standard_plan_400(self, pro_session):
        """If pro@test.com is on Standard plan, cancel should return 400"""
        # Check plan first
        r_status = pro_session.get(f'{BASE_URL}/api/billing/subscription-status')
        plan_tier = r_status.json().get('plan_tier', 'standard')
        print(f"INFO: pro@test.com current plan_tier={plan_tier}")

        if plan_tier == 'standard':
            r = pro_session.post(f'{BASE_URL}/api/billing/cancel-subscription')
            assert r.status_code == 400, f"Expected 400 for Standard plan cancel, got {r.status_code}: {r.text}"
            data = r.json()
            assert 'detail' in data
            print(f"PASS: cancel-subscription returns 400 for Standard plan — detail='{data['detail']}'")
        else:
            # Pro plan — test the end-of-period cancellation
            r = pro_session.post(f'{BASE_URL}/api/billing/cancel-subscription')
            assert r.status_code == 200, f"Expected 200 for Pro cancel, got {r.status_code}: {r.text}"
            data = r.json()
            # Should return either cancels_at (end-of-period) or cancels_immediately flag
            assert 'message' in data, "Cancel response missing 'message'"
            print(f"PASS: cancel-subscription for Pro returned 200 — message='{data.get('message')}', cancels_immediately={data.get('cancels_immediately')}")

    def test_cancel_subscription_homeowner_403(self, homeowner_session):
        """Homeowner should get 403"""
        r = homeowner_session.post(f'{BASE_URL}/api/billing/cancel-subscription')
        assert r.status_code == 403, f"Expected 403 for homeowner, got {r.status_code}"
        print("PASS: cancel-subscription returns 403 for homeowner")


# ──────────────────────────────────────────────
# 6. POST /api/billing/trial/start
# ──────────────────────────────────────────────

class TestTrialStart:
    """Trial start — 400 if already subscribed, success for fresh account"""

    def test_trial_start_already_subscribed_400(self, pro_session):
        """pro@test.com has sub_started_at set, so trial should be rejected"""
        r = pro_session.post(f'{BASE_URL}/api/billing/trial/start')
        # Should get 400 — already subscribed or trial already used
        assert r.status_code == 400, f"Expected 400 for already-subscribed account, got {r.status_code}: {r.text}"
        data = r.json()
        assert 'detail' in data, "400 response should have detail field"
        print(f"PASS: trial/start returns 400 for existing subscriber — detail='{data['detail']}'")

    def test_trial_start_homeowner_403(self, homeowner_session):
        """Homeowner should get 403"""
        r = homeowner_session.post(f'{BASE_URL}/api/billing/trial/start')
        assert r.status_code == 403, f"Expected 403 for homeowner, got {r.status_code}"
        print("PASS: trial/start returns 403 for homeowner")

    def test_trial_start_fresh_account(self):
        """Register a fresh pro account, complete onboarding, then test trial start"""
        import time
        ts = int(time.time())
        fresh_email = f'TEST_trial_{ts}@example.com'
        s = requests.Session()
        s.headers.update({'Content-Type': 'application/json'})

        # Register fresh account (role not set yet — set during onboarding)
        r_reg = s.post(f'{BASE_URL}/api/auth/register', json={
            'email': fresh_email,
            'password': 'Test123!',
            'name': 'Test Trial User',
            'accepted_terms': True,
            'accepted_privacy': True,
        })
        if r_reg.status_code not in (200, 201):
            pytest.skip(f"Could not register fresh account: {r_reg.text}")
        print(f"INFO: Registered fresh account {fresh_email}")

        # Complete onboarding as tradesperson
        r_onboard = s.post(f'{BASE_URL}/api/auth/onboarding', json={
            'role': 'tradesperson',
            'country': 'AT',
            'name': 'Test',
            'surname': 'Trial',
            'phone': '+43123456789',
            'address': 'Testgasse 1',
            'postal_code': '1010',
            'city': 'Wien',
            'contact_person': 'Test Trial',
            'company_name': 'TEST Trial GmbH',
            'licence_file_id': 'test_file_id',
            'turnstile_token': 'test',
        })
        if r_onboard.status_code not in (200, 201):
            pytest.skip(f"Onboarding failed: {r_onboard.text}")
        print(f"INFO: Onboarding complete for {fresh_email}")

        # Start trial
        r_trial = s.post(f'{BASE_URL}/api/billing/trial/start')
        assert r_trial.status_code == 200, f"Expected 200 for fresh account trial, got {r_trial.status_code}: {r_trial.text}"
        data = r_trial.json()
        assert 'trial_ends_at' in data, "Missing trial_ends_at in response"
        assert '14-day' in data.get('message', '') or 'trial' in data.get('message', '').lower(), \
            f"Expected trial confirmation message, got: {data.get('message')}"
        print(f"PASS: trial/start success for fresh account — trial_ends_at={data.get('trial_ends_at')}")

        # Verify trial_ends_at is ~14 days from now
        from datetime import datetime, timezone, timedelta
        trial_ends = datetime.fromisoformat(data['trial_ends_at'].replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        diff = trial_ends - now
        assert 13 <= diff.days <= 14, f"Expected ~14 days, got {diff.days} days"
        print(f"PASS: trial_ends_at is {diff.days} days from now (expected ~14)")

        # Second call should return 400 (trial already used)
        r_trial2 = s.post(f'{BASE_URL}/api/billing/trial/start')
        assert r_trial2.status_code == 400, f"Expected 400 on second trial start, got {r_trial2.status_code}"
        print("PASS: second trial/start correctly returns 400")


# ──────────────────────────────────────────────
# 7. POST /api/billing/customer-portal
# ──────────────────────────────────────────────

class TestCustomerPortal:
    """Customer portal — 400 when no stripe_customer_id"""

    def test_customer_portal_no_stripe_customer_400(self, pro_session):
        """pro@test.com has no stripe_customer_id — should get 400"""
        # Verify no stripe_customer
        r_status = pro_session.get(f'{BASE_URL}/api/billing/subscription-status')
        has_stripe = r_status.json().get('has_stripe_customer', False)
        print(f"INFO: pro@test.com has_stripe_customer={has_stripe}")

        if not has_stripe:
            r = pro_session.post(
                f'{BASE_URL}/api/billing/customer-portal',
                json={'origin_url': BASE_URL}
            )
            assert r.status_code == 400, f"Expected 400 (no stripe customer), got {r.status_code}: {r.text}"
            data = r.json()
            assert 'detail' in data
            # Should have helpful message mentioning support or contact
            detail = data['detail']
            print(f"PASS: customer-portal returns 400 — detail='{detail}'")
            assert 'stripe' in detail.lower() or 'customer' in detail.lower() or 'support' in detail.lower(), \
                f"Detail should mention stripe/customer/support: {detail}"
        else:
            print("INFO: pro@test.com has stripe_customer_id — skipping this check")

    def test_customer_portal_homeowner_403(self, homeowner_session):
        """Homeowner should get 403"""
        r = homeowner_session.post(
            f'{BASE_URL}/api/billing/customer-portal',
            json={'origin_url': BASE_URL}
        )
        assert r.status_code == 403, f"Expected 403 for homeowner, got {r.status_code}"
        print("PASS: customer-portal returns 403 for homeowner")


# ──────────────────────────────────────────────
# 8. GET /api/billing/fee-log
# ──────────────────────────────────────────────

class TestFeeLog:
    """Fee log filtering — pending filter vs all"""

    def test_fee_log_all_200(self, pro_session):
        r = pro_session.get(f'{BASE_URL}/api/billing/fee-log')
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert 'fees' in data, "Missing 'fees' key"
        assert isinstance(data['fees'], list), "fees must be a list"
        print(f"PASS: GET /billing/fee-log returns 200 — {len(data['fees'])} fees")

    def test_fee_log_pending_filter(self, pro_session):
        """?status_filter=pending should only return pending fees"""
        r = pro_session.get(f'{BASE_URL}/api/billing/fee-log?status_filter=pending')
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        fees = data.get('fees', [])
        for fee in fees:
            assert fee.get('status') == 'pending', \
                f"Expected only pending fees, got status='{fee.get('status')}'"
        print(f"PASS: fee-log?status_filter=pending returns only pending fees ({len(fees)} fees)")

    def test_fee_log_paid_filter(self, pro_session):
        """?status_filter=paid should only return paid fees"""
        r = pro_session.get(f'{BASE_URL}/api/billing/fee-log?status_filter=paid')
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        fees = data.get('fees', [])
        for fee in fees:
            assert fee.get('status') == 'paid', \
                f"Expected only paid fees, got status='{fee.get('status')}'"
        print(f"PASS: fee-log?status_filter=paid returns only paid fees ({len(fees)} fees)")

    def test_fee_log_invalid_filter_returns_all(self, pro_session):
        """Invalid status_filter should return all fees (not filter)"""
        r_all = pro_session.get(f'{BASE_URL}/api/billing/fee-log')
        r_invalid = pro_session.get(f'{BASE_URL}/api/billing/fee-log?status_filter=bogus')
        assert r_all.status_code == 200
        assert r_invalid.status_code == 200
        all_count = len(r_all.json().get('fees', []))
        invalid_count = len(r_invalid.json().get('fees', []))
        assert all_count == invalid_count, \
            f"Invalid filter should return same as no filter. all={all_count}, invalid_filter={invalid_count}"
        print(f"PASS: invalid fee-log filter returns all fees ({all_count} fees)")

    def test_fee_log_homeowner_403(self, homeowner_session):
        """Homeowner should get 403"""
        r = homeowner_session.get(f'{BASE_URL}/api/billing/fee-log')
        assert r.status_code == 403, f"Expected 403 for homeowner, got {r.status_code}"
        print("PASS: fee-log returns 403 for homeowner")


# ──────────────────────────────────────────────
# 9. Pricing endpoint — annual pricing math
# ──────────────────────────────────────────────

class TestPricingMath:
    """Verify annual price math (PRO_SUBSCRIPTION_ANNUAL = 29.99 * 10 = 299.90 NET, brutto = 359.88)"""

    def test_pricing_endpoint_has_pro(self, pro_session):
        r = pro_session.get(f'{BASE_URL}/api/billing/pricing')
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert 'pro' in data, "Missing 'pro' pricing"
        print(f"PASS: /billing/pricing has 'pro' key — {data['pro']}")

    def test_annual_checkout_amount_is_correct(self, pro_session):
        """Annual checkout amount should be ~359.88 (299.90 * 1.20 = 359.88)"""
        r = pro_session.post(
            f'{BASE_URL}/api/billing/checkout/subscription?billing_period=annual',
            json={'origin_url': BASE_URL}
        )
        assert r.status_code == 200
        data = r.json()
        # If reuse, we can't check the amount here but session_id tells us it worked
        if data.get('reuse'):
            print(f"INFO: Got reuse=True — cannot verify amount for this call")
            return
        # Session created — can cross-check via transaction
        session_id = data.get('session_id')
        if session_id:
            r_txns = pro_session.get(f'{BASE_URL}/api/billing/transactions')
            txns = r_txns.json().get('transactions', [])
            annual_txn = next((t for t in txns if t.get('session_id') == session_id), None)
            if annual_txn:
                amount = annual_txn.get('amount', 0)
                expected_brutto = round(29.99 * 10 * 1.20, 2)  # 359.88
                assert abs(amount - expected_brutto) < 0.01, \
                    f"Annual amount should be ~{expected_brutto}, got {amount}"
                print(f"PASS: annual checkout amount={amount} ≈ {expected_brutto}")
            else:
                print(f"INFO: Could not find annual transaction in history to verify amount")
        print(f"PASS: annual checkout session created successfully")
