import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useLang } from '../../contexts/LangContext';
import { useAuth } from '../../contexts/AuthContext';
import api, { formatError, apiBase } from '../../api/client';
import { fmtDate } from '../../utils/money';
import {
  CheckCircle, Loader2, AlertCircle, Star, Receipt, XCircle,
  Calendar, ExternalLink, TrendingUp, Gift, ChevronDown,
  FileText, BarChart2, Briefcase, Package, RefreshCw,
  Rocket, BadgeCheck, Clock,
} from 'lucide-react';

/* ── Toolkit metadata ─────────────────────────────────────── */
const TOOLKIT_META = {
  invoice: {
    icon: FileText,
    color: 'teal',
    openLink: '/my-invoices',
    flagKey: 'has_invoice_toolkit',
    titleKey: 'toolkit_title',
    descKey: 'toolkit_desc',
    benefits: [
      'toolkit_benefit1','toolkit_benefit2','toolkit_benefit3',
      'toolkit_benefit4','toolkit_benefit5','toolkit_benefit6',
      'toolkit_benefit7','toolkit_benefit8','toolkit_benefit9',
    ],
  },
  tax: {
    icon: BarChart2,
    color: 'amber',
    openLink: '/tax',
    flagKey: 'has_tax_toolkit',
    titleKey: 'tax_toolkit_title',
    descKey: 'tax_toolkit_desc',
    benefits: [
      'tax_benefit1','tax_benefit2','tax_benefit3','tax_benefit4',
      'tax_benefit5','tax_benefit6','tax_benefit7','tax_benefit8','tax_benefit9',
    ],
  },
  pm: {
    icon: Briefcase,
    color: 'blue',
    openLink: '/projects',
    flagKey: 'has_pm_toolkit',
    titleKey: 'pm_toolkit_title',
    descKey: 'pm_toolkit_desc',
    benefits: [
      'pm_benefit1','pm_benefit2','pm_benefit3','pm_benefit4',
      'pm_benefit5','pm_benefit6','pm_benefit7','pm_benefit8',
    ],
  },
};

/* ── Colour helpers ───────────────────────────────────────── */
const COLOR = {
  teal:  { border: 'border-teal',  bg: 'bg-teal/8',   icon: 'text-teal',  badge: 'bg-teal text-paper',  btn: 'text-teal border-teal/30 hover:bg-teal/10' },
  amber: { border: 'border-amber', bg: 'bg-amber/8',  icon: 'text-amber', badge: 'bg-amber text-paper', btn: 'text-amber border-amber/30 hover:bg-amber/10' },
  blue:  { border: 'border-blue-400', bg: 'bg-blue-400/8', icon: 'text-blue-500', badge: 'bg-blue-500 text-paper', btn: 'text-blue-500 border-blue-300 hover:bg-blue-50' },
};

export default function BillingPage() {
  const { refreshUser } = useAuth();
  const { t } = useLang();
  const location = useLocation();

  const [proProfile, setProProfile]   = useState(null);
  const [subStatus, setSubStatus]     = useState(null);
  const [pricing, setPricing]         = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [sessionChecked, setSessionChecked] = useState(false);

  /* loading flags */
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [toolkitLoading, setToolkitLoading]   = useState({ invoice: false, tax: false, pm: false });
  const [cancelTkLoading, setCancelTkLoading] = useState({ invoice: false, tax: false, pm: false });
  const [bundleLoading, setBundleLoading]     = useState(false);
  const [cancelLoading, setCancelLoading]     = useState(false);
  const [undoCancelLoading, setUndoCancelLoading] = useState(false);
  const [portalLoading, setPortalLoading]     = useState(false);
  const [trialLoading, setTrialLoading]       = useState(false);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [chooseStdLoading, setChooseStdLoading] = useState(false);
  const [devLoading, setDevLoading]           = useState(false);

  /* accordion state */
  const [historyOpen, setHistoryOpen]         = useState(false);
  const [selectedToolkit, setSelectedToolkit] = useState('invoice');

  const [error, setError] = useState('');
  const [info, setInfo]   = useState('');

  /* ── data fetching ─────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, txns, pr, ss] = await Promise.all([
        api.get('/api/profile/pro'),
        // Caught like its two neighbours. Without this the whole Promise.all
        // rejected on a 404 and threw an uncaught AxiosError on every visit.
        api.get('/api/billing/transactions').catch(() => ({ data: null })),
        api.get('/api/billing/pricing').catch(() => ({ data: null })),
        api.get('/api/billing/subscription-status').catch(() => ({ data: null })),
      ]);
      setProProfile(p.data);
      setTransactions(txns.data.transactions || []);
      setPricing(pr.data);
      setSubStatus(ss.data);
      if (ss.data?.sub_billing_period) setBillingPeriod(ss.data.sub_billing_period);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sid = params.get('session_id');
    if (sid && !sessionChecked) {
      setSessionChecked(true);
      api.get(`/api/billing/checkout/status/${sid}`)
        .then(({ data }) => {
          if (data.payment_status === 'paid') {
            setInfo(t('billing_upgrade_success') || 'Payment confirmed — plan activated!');
            refreshUser();
            fetchData();
          }
        })
        .catch(() => {});
    }
  }, [location, sessionChecked, t, refreshUser, fetchData]);

  const origin = apiBase || window.location.origin;

  /* ── action handlers ───────────────────────────────────── */
  const handleUpgrade = async () => {
    setCheckoutLoading(true); setError('');
    try {
      const { data } = await api.post(
        `/api/billing/checkout/subscription?billing_period=${billingPeriod}`,
        { origin_url: origin }
      );
      if (data.url) window.location.href = data.url;
    } catch (e) { setError(formatError(e)); }
    finally { setCheckoutLoading(false); }
  };

  const handleToolkitUpgrade = async (kind) => {
    setToolkitLoading(l => ({ ...l, [kind]: true })); setError('');
    try {
      const { data } = await api.post(`/api/billing/checkout/toolkit?kind=${kind}`, { origin_url: origin });
      if (data.url) window.location.href = data.url;
    } catch (e) { setError(formatError(e)); }
    finally { setToolkitLoading(l => ({ ...l, [kind]: false })); }
  };

  const handleCancelToolkit = async (kind) => {
    if (!window.confirm(t('toolkit_cancel_confirm'))) return;
    setCancelTkLoading(l => ({ ...l, [kind]: true })); setError('');
    try {
      const { data } = await api.post(`/api/billing/cancel-toolkit?kind=${kind}`);
      setInfo(data.message || t('toolkit_cancelled_ok'));
      await refreshUser(); await fetchData();
    } catch (e) { setError(formatError(e)); }
    finally { setCancelTkLoading(l => ({ ...l, [kind]: false })); }
  };

  const handleBundleUpgrade = async () => {
    setBundleLoading(true); setError('');
    try {
      const { data } = await api.post('/api/billing/checkout/bundle', { origin_url: origin });
      if (data.url) window.location.href = data.url;
    } catch (e) { setError(formatError(e)); }
    finally { setBundleLoading(false); }
  };

  const handleCancelSub = async () => {
    if (!window.confirm(t('billing_cancel_confirm'))) return;
    setCancelLoading(true); setError(''); setInfo('');
    try {
      const { data } = await api.post('/api/billing/cancel-subscription');
      setInfo(data.message || t('billing_cancelled_ok'));
      await refreshUser(); await fetchData();
    } catch (e) { setError(formatError(e)); }
    finally { setCancelLoading(false); }
  };

  const handleUndoCancel = async () => {
    setUndoCancelLoading(true); setError(''); setInfo('');
    try {
      const { data } = await api.post('/api/billing/undo-cancel-subscription');
      setInfo(data.message || t('billing_undo_cancel_ok'));
      await refreshUser(); await fetchData();
    } catch (e) { setError(e.response?.data?.detail || t('billing_err_restore')); }
    finally { setUndoCancelLoading(false); }
  };

  const handlePortal = async () => {
    setPortalLoading(true); setError('');
    try {
      const { data } = await api.post('/api/billing/customer-portal', { origin_url: origin });
      if (data.url) window.open(data.url, '_blank');
    } catch (e) { setError(e.response?.data?.detail || t('billing_err_portal')); }
    finally { setPortalLoading(false); }
  };

  const handleStartTrial = async () => {
    setTrialLoading(true); setError('');
    try {
      const { data } = await api.post('/api/billing/trial/start');
      setInfo(data.message || '14-day Pro trial started!');
      await refreshUser(); await fetchData();
    } catch (e) { setError(e.response?.data?.detail || t('billing_err_trial')); }
    finally { setTrialLoading(false); }
  };

  /* ── Explorer intro plan handlers ──────────────────────── */
  const handleExplorerCheckout = async () => {
    setExplorerLoading(true); setError('');
    try {
      const { data } = await api.post('/api/billing/checkout/explorer', { origin_url: origin });
      if (data.url) window.location.href = data.url;
    } catch (e) { setError(formatError(e)); }
    finally { setExplorerLoading(false); }
  };

  const handleChooseStandard = async () => {
    setChooseStdLoading(true); setError(''); setInfo('');
    try {
      const { data } = await api.post('/api/billing/explorer/choose-standard');
      setInfo(data.message || t('gate_standard_chosen'));
      await refreshUser(); await fetchData();
    } catch (e) { setError(e.response?.data?.detail || t('err_generic')); }
    finally { setChooseStdLoading(false); }
  };

  const handleSimulateExpiry = async () => {
    setDevLoading(true); setError(''); setInfo('');
    try {
      const { data } = await api.post('/api/billing/explorer/simulate-expiry');
      setInfo(data.message || t('billing_info_expired'));
      await refreshUser(); await fetchData();
    } catch (e) { setError(e.response?.data?.detail || t('err_generic')); }
    finally { setDevLoading(false); }
  };

  const handleSimulateReset = async () => {
    setDevLoading(true); setError(''); setInfo('');
    try {
      const { data } = await api.post('/api/billing/explorer/simulate-reset');
      setInfo(data.message || t('billing_info_reset'));
      await refreshUser(); await fetchData();
    } catch (e) { setError(e.response?.data?.detail || t('err_generic')); }
    finally { setDevLoading(false); }
  };

  /* ── derived state ─────────────────────────────────────── */
  const isPro          = proProfile?.plan_tier === 'pro';
  const isTrial        = subStatus?.trial_active;
  const billingModeVal = subStatus?.billing_mode || pricing?.billing_mode || 'gate';
  const gateDismissed  = Boolean(subStatus?.explorer_gate_dismissed);
  const isExplorerOffer  = billingModeVal === 'explorer_offer';
  const isExplorerActive = billingModeVal === 'explorer_active';
  const showGate         = (billingModeVal === 'gate' || billingModeVal === 'choose_plan') && !gateDismissed && !isPro;
  const gateReason       = billingModeVal === 'choose_plan' ? 'choose' : 'ended';
  const explorerInfo     = pricing?.explorer;
  const isTrialElig    = !isTrial && !isPro && !subStatus?.trial_ends_at && !subStatus?.sub_started_at;
  const subCancelsAt   = subStatus?.sub_cancels_at   ? new Date(subStatus.sub_cancels_at)   : null;
  const subValidUntil  = subStatus?.sub_valid_until  ? new Date(subStatus.sub_valid_until)  : null;
  const daysLeft       = subStatus?.days_remaining;
  const annualNet      = 29.99 * 10;
  const annualSaving   = Math.round((29.99 * 12 - annualNet) / (29.99 * 12) * 100);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={32} className="text-teal animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8">
      <div className="page-container py-8 max-w-2xl">

        <h1 className="text-3xl font-headings font-bold text-ink mb-6" data-testid="billing-page-title">
          {t('billing_plan')}
        </h1>

        {/* Global messages */}
        {info && (
          <div className="flex items-center gap-2 text-green-pos bg-green-pos/10 rounded-[14px] p-3 mb-4 text-sm" data-testid="billing-info">
            <CheckCircle size={14} /> {info}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-red-warn bg-red-50 rounded-[14px] p-3 mb-4 text-sm" data-testid="billing-error">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {isExplorerOffer && (
          <ExplorerOfferCard
            explorer={explorerInfo}
            loading={explorerLoading}
            onActivate={handleExplorerCheckout}
            t={t}
          />
        )}

        {isExplorerActive && (
          <ExplorerActiveCard subStatus={subStatus} proProfile={proProfile} t={t} />
        )}

        {!isExplorerOffer && !isExplorerActive && (
          <>
        {/* ─── Section 1a: My Current Plan ───────────────────── */}
        <CurrentPlanCard
          isPro={isPro}
          isTrial={isTrial}
          subStatus={subStatus}
          subValidUntil={subValidUntil}
          subCancelsAt={subCancelsAt}
          daysLeft={daysLeft}
          cancelLoading={cancelLoading}
          undoCancelLoading={undoCancelLoading}
          portalLoading={portalLoading}
          onCancel={handleCancelSub}
          onUndoCancel={handleUndoCancel}
          onPortal={handlePortal}
          t={t}
        />

        {/* ─── Upgrade gate — shown after the 3-month Explorer ends ─ */}
        {showGate && (
          <UpgradeGateCard
            reason={gateReason}
            billingPeriod={billingPeriod}
            setBillingPeriod={setBillingPeriod}
            annualNet={annualNet}
            checkoutLoading={checkoutLoading}
            chooseStdLoading={chooseStdLoading}
            onClaimPro={handleUpgrade}
            onStayStandard={handleChooseStandard}
            t={t}
          />
        )}

        {/* ─── Section 1b: Upgrade to Pro (Standard users only) ─ */}
        {!isPro && !isTrial && !showGate && (
          <UpgradeSection
            isTrialElig={isTrialElig}
            billingPeriod={billingPeriod}
            setBillingPeriod={setBillingPeriod}
            annualNet={annualNet}
            annualSaving={annualSaving}
            checkoutLoading={checkoutLoading}
            trialLoading={trialLoading}
            onUpgrade={handleUpgrade}
            onStartTrial={handleStartTrial}
            t={t}
          />
        )}

        {isTrial && (
          <div className="card-lg mb-6 border border-amber/40 bg-amber/5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold text-ink text-sm">{t('bill_trial_q')}</p>
              <p className="text-xs text-ink-muted">{t('bill_trial_cta')}</p>
            </div>
            <button onClick={handleUpgrade} disabled={checkoutLoading} className="btn-amber text-sm flex-shrink-0" data-testid="trial-upgrade-btn">
              {checkoutLoading ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />} {t('billing_subscribe_now')}
            </button>
          </div>
        )}

        {/* ─── Section 2: My Toolkits ─────────────────────────── */}
        <div className="mb-6">
          <h2 className="font-headings font-bold text-ink text-lg mb-3">{t('billing_my_toolkits')}</h2>

          {/* Compact selector row */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            {['invoice', 'tax', 'pm'].map((kind) => {
              const meta        = TOOLKIT_META[kind];
              const active      = Boolean(proProfile?.[meta.flagKey]);
              const wasCancelled = !active && Boolean(proProfile?.[`${kind}_toolkit_cancelled_at`]);
              return (
                <ToolkitTab
                  key={kind}
                  kind={kind}
                  meta={meta}
                  active={active}
                  wasCancelled={wasCancelled}
                  selected={selectedToolkit === kind}
                  onClick={() => setSelectedToolkit(kind)}
                  t={t}
                />
              );
            })}
          </div>

          {/* Detail panel for selected toolkit */}
          {(() => {
            const kind         = selectedToolkit;
            const meta         = TOOLKIT_META[kind];
            const active       = Boolean(proProfile?.[meta.flagKey]);
            const wasCancelled = !active && Boolean(proProfile?.[`${kind}_toolkit_cancelled_at`]);
            const tk           = pricing?.toolkits?.[kind];
            return (
              <ToolkitDetail
                kind={kind}
                meta={meta}
                active={active}
                wasCancelled={wasCancelled}
                tk={tk}
                isPro={pricing?.is_pro}
                loading={toolkitLoading[kind]}
                cancelLoading={cancelTkLoading[kind]}
                onUpgrade={() => handleToolkitUpgrade(kind)}
                onCancel={() => handleCancelToolkit(kind)}
                needsBank={kind === 'invoice' && active && !proProfile?.bank_iban}
                t={t}
              />
            );
          })()}
        </div>

        {/* ─── Section 3: All-in-One Bundle ───────────────────── */}
        {pricing?.bundle && (
          <BundleCallout
            bundle={pricing.bundle}
            loading={bundleLoading}
            onUpgrade={handleBundleUpgrade}
            t={t}
          />
        )}
          </>
        )}

        {/* ─── Section 4: Payment history accordion ───────────── */}
        {transactions.length > 0 && (
          <Accordion
            open={historyOpen}
            onToggle={() => setHistoryOpen(o => !o)}
            label={t('billing_payment_history')}
            badge={`${transactions.length}`}
            badgeColor="teal"
            testId="history-accordion"
          >
            <div className="space-y-1">
              {transactions.map((txn) => (
                <div
                  key={txn.id || txn.session_id}
                  className="flex items-center justify-between py-2 border-b border-sm-border text-sm last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <Receipt size={13} className="text-ink-muted flex-shrink-0" />
                    <div>
                      <p className="font-medium text-ink capitalize" data-testid="txn-label">
                        {txn.display_label || 'Payment'}
                      </p>
                      <p className="text-xs text-ink-muted">{fmtDate(txn.created_at)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-ink">€{Number(txn.amount || 0).toFixed(2).replace('.', ',')}</p>
                    <span className={`text-xs font-medium ${txn.payment_status === 'paid' ? 'text-green-pos' : txn.payment_status === 'unpaid' ? 'text-amber' : 'text-ink-muted'}`}>
                      {txn.payment_status === 'paid' ? '✓ Paid' : txn.payment_status === 'unpaid' ? 'Pending' : txn.payment_status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Accordion>
        )}

        {/* Developer / test controls — never in production. A panel headed
            "🧪 TEST CONTROLS" with a "Reset to Explorer offer" button was
            rendering on the real billing page for every paying customer.
            CRA inlines NODE_ENV at build time, so this compiles out entirely
            rather than shipping behind a runtime check. */}
        {process.env.NODE_ENV !== 'production' && (
        <ExplorerDevControls
          mode={billingModeVal}
          loading={devLoading}
          onReset={handleSimulateReset}
          onExpire={handleSimulateExpiry}
          t={t}
        />
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   ExplorerOfferCard — the ONLY plan a new pro sees for 3 months
──────────────────────────────────────────────────────────── */
function ExplorerOfferCard({ explorer, loading, onActivate, t }) {
  const perMonth = (explorer?.per_month ?? 1).toFixed(2).replace('.', ',');
  const total    = (explorer?.total ?? 3).toFixed(2).replace('.', ',');
  const months   = explorer?.months ?? 3;
  const BENEFITS = ['explorer_benefit1', 'explorer_benefit2', 'explorer_benefit3', 'explorer_benefit4'];
  return (
    <div className="card-lg mb-6 border-2 border-teal/50 bg-teal/5 relative overflow-hidden" data-testid="explorer-offer-card">
      <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-teal/10 pointer-events-none" />
      <div className="flex items-center gap-2 mb-1">
        <Rocket size={18} className="text-teal" />
        <h2 className="text-2xl font-headings font-bold text-ink">{t('explorer_plan_name')}</h2>
        <span className="pro-badge bg-teal text-paper text-[10px]">{t('explorer_intro_badge')}</span>
      </div>
      <p className="text-sm text-ink-muted mb-4">{t('explorer_offer_subtitle')}</p>

      <div className="flex items-end gap-2 mb-4">
        <span className="text-4xl font-headings font-bold text-ink leading-none">€{perMonth}</span>
        <span className="text-sm text-ink-muted mb-1">/ {t('billing_per_month_short')}</span>
      </div>
      <div className="rounded-[12px] bg-teal/10 border border-teal/30 px-3 py-2 mb-4 text-sm text-teal font-semibold flex items-center gap-2">
        <Gift size={14} /> {t('explorer_billed_once', { total, months })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        {BENEFITS.map((key) => (
          <div key={key} className="flex items-start gap-2">
            <CheckCircle size={14} className="text-teal flex-shrink-0 mt-[2px]" />
            <span className="text-sm text-ink">{t(key)}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onActivate}
        disabled={loading}
        className="btn-primary w-full py-3.5"
        data-testid="explorer-activate-btn"
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> {t('btn_processing')}</>
          : <><Rocket size={16} /> {t('explorer_activate_btn', { total })}</>}
      </button>
      <p className="text-[10px] text-center text-ink-muted mt-2">{t('explorer_after_note')} · {t('billing_secure_stripe')}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   ExplorerActiveCard — current Explorer plan with all toolkits live
──────────────────────────────────────────────────────────── */
function ExplorerActiveCard({ subStatus, proProfile, t }) {
  const days = subStatus?.explorer_days_remaining;
  const endsAt = subStatus?.explorer_ends_at ? new Date(subStatus.explorer_ends_at) : null;
  const TOOLKITS = [
    { icon: FileText,  label: t('toolkit_title'),     link: '/my-invoices' },
    { icon: BarChart2, label: t('tax_toolkit_title'), link: '/tax' },
    { icon: Briefcase, label: t('pm_toolkit_title'),  link: '/projects' },
  ];
  return (
    <div className="card-lg mb-6 border-2 border-teal/50 bg-teal/5" data-testid="explorer-active-card">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-2">{t('billing_my_plan')}</p>
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-2xl font-headings font-bold text-ink flex items-center gap-2">
            <Rocket size={20} className="text-teal" /> {t('explorer_plan_name')}
          </h2>
          <span className="pro-badge bg-teal text-paper text-xs" data-testid="explorer-active-badge">{t('billing_active')}</span>
        </div>
      </div>

      <div className="flex items-start gap-2 text-sm mb-4 p-2.5 rounded-[10px] bg-cream">
        <Calendar size={13} className="flex-shrink-0 mt-[2px] text-ink-muted" />
        <span className="text-ink-muted">
          {t('explorer_all_unlocked')}
          {endsAt && (
            <> · {t('explorer_ends_on')} <strong className="text-ink">{fmtDate(endsAt)}</strong></>
          )}
          {days != null && (
            <span className={`ml-2 font-semibold ${days < 7 ? 'text-red-500' : 'text-teal'}`}>· {days} {t('billing_days_left')}</span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TOOLKITS.map(({ icon: Icon, label, link }) => (
          <a
            key={link}
            href={link}
            className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-[12px] border border-teal/30 bg-paper hover:bg-teal/10 transition-colors text-center"
            data-testid={`explorer-open-${link.replace('/', '')}`}
          >
            <Icon size={16} className="text-teal" />
            <span className="text-[11px] font-semibold text-ink leading-tight">{label}</span>
          </a>
        ))}
      </div>
      <p className="text-[10px] text-ink-muted mt-3 pt-2 border-t border-sm-border">{t('explorer_active_footnote')}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   UpgradeGateCard — shown after Explorer ends: claim Pro OR stay Standard
──────────────────────────────────────────────────────────── */
function UpgradeGateCard({ reason = 'ended', billingPeriod, setBillingPeriod, annualNet, checkoutLoading, chooseStdLoading, onClaimPro, onStayStandard, t }) {
  const monthlyNet = 29.99;
  const isChoose = reason === 'choose';
  return (
    <div className="card-lg mb-6 border-2 border-amber/50 bg-amber/5" data-testid="upgrade-gate-card">
      <div className="flex items-center gap-2 mb-1">
        <Star size={18} className="text-amber" />
        <h2 className="text-xl font-headings font-bold text-ink">{isChoose ? t('choose_plan_title') : t('gate_title')}</h2>
      </div>
      <p className="text-sm text-ink-muted mb-5">{isChoose ? t('choose_plan_subtitle') : t('gate_subtitle')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Claim Pro */}
        <div className="rounded-[14px] border-2 border-teal/50 bg-teal/8 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <BadgeCheck size={16} className="text-teal" />
            <h3 className="font-headings font-bold text-ink">{t('gate_claim_badge')}</h3>
          </div>
          <p className="text-2xl font-headings font-bold text-ink leading-tight mb-0.5">€{monthlyNet.toFixed(2).replace('.', ',')}</p>
          <p className="text-[11px] text-ink-muted mb-2">/ {t('billing_per_month_short')} · {t('billing_excl_vat')}</p>
          <p className="text-sm text-ink mb-4 flex-1">{t('gate_pro_desc')}</p>
          <button
            onClick={onClaimPro}
            disabled={checkoutLoading}
            className="btn-primary w-full py-2.5 mt-auto"
            data-testid="gate-claim-pro-btn"
          >
            {checkoutLoading ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
            {t('gate_claim_badge')}
          </button>
        </div>

        {/* Stay Standard */}
        <div className="rounded-[14px] border border-sm-border bg-paper p-4 flex flex-col">
          <h3 className="font-headings font-bold text-ink mb-1">{isChoose ? t('choose_standard_title') : t('gate_stay_standard')}</h3>
          <p className="text-2xl font-headings font-bold text-ink leading-tight mb-0.5">{t('billing_free')}</p>
          <p className="text-[11px] text-ink-muted mb-2">{t('billing_standard_note')}</p>
          <p className="text-sm text-ink mb-4 flex-1">{t('gate_standard_desc')}</p>
          <button
            onClick={onStayStandard}
            disabled={chooseStdLoading}
            className="btn-ghost w-full py-2.5 mt-auto"
            data-testid="gate-stay-standard-btn"
          >
            {chooseStdLoading ? <Loader2 size={14} className="animate-spin" /> : null}
            {isChoose ? t('choose_standard_title') : t('gate_stay_standard')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   ExplorerDevControls — test helpers to walk the lifecycle
──────────────────────────────────────────────────────────── */
function ExplorerDevControls({ mode, loading, onReset, onExpire, t }) {
  return (
    <div className="card-lg mb-4 border border-dashed border-ink-muted/40" data-testid="explorer-dev-controls">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-2">
        🧪 {t('explorer_dev_title')}
      </p>
      <p className="text-[11px] text-ink-muted mb-3">{t('explorer_dev_help')} <span className="font-semibold">({mode})</span></p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={onReset}
          disabled={loading}
          className="btn-ghost text-xs"
          data-testid="explorer-dev-reset"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {t('explorer_dev_reset')}
        </button>
        {mode === 'explorer_active' && (
          <button
            onClick={onExpire}
            disabled={loading}
            className="btn-ghost text-xs text-amber-deep border-amber/30 hover:bg-amber/10"
            data-testid="explorer-dev-expire"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
            {t('explorer_dev_expire')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   CurrentPlanCard — shows ONLY what the user has right now
──────────────────────────────────────────────────────────── */
function CurrentPlanCard({
  isPro, isTrial, subStatus, subValidUntil, subCancelsAt, daysLeft,
  cancelLoading, undoCancelLoading, portalLoading,
  onCancel, onUndoCancel, onPortal, t,
}) {
  const isAnnual     = subStatus?.sub_billing_period === 'annual';
  const isCancelling = Boolean(subCancelsAt);

  return (
    <div
      className={`card-lg mb-4 ${isPro && !isCancelling ? 'border-teal/50' : isCancelling ? 'border-red-warn/40' : isTrial ? 'border-amber/50' : ''}`}
      data-testid="plan-card"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-2">
        {t('billing_my_plan')}
      </p>

      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-2xl font-headings font-bold text-ink">
            {isPro || isTrial ? t('pro_plan_pro') : t('pro_plan_standard')}
          </h2>
          {isCancelling ? (
            <span className="pro-badge bg-red-warn text-paper text-xs" data-testid="plan-cancelling-badge">
              {t('billing_cancelling')}
            </span>
          ) : isTrial ? (
            <span className="pro-badge bg-amber text-paper text-xs" data-testid="plan-active-badge">{t('bill_trial')}</span>
          ) : isPro ? (
            <span className="pro-badge bg-teal text-paper text-xs" data-testid="plan-active-badge">
              {t('billing_active')}
            </span>
          ) : null}
          {isAnnual && !isCancelling && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber bg-amber/10 px-2 py-0.5 rounded-full">
              <TrendingUp size={10} /> {t('billing_annual')}
            </span>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {isPro || isTrial ? (
            <>
              <p className="text-2xl font-headings font-bold text-ink leading-tight">€29,99</p>
              <p className="text-[10px] text-ink-muted">/ {t('billing_per_month_short')}</p>
            </>
          ) : (
            <p className="text-2xl font-headings font-bold text-ink">{t('billing_free')}</p>
          )}
        </div>
      </div>

      {/* Status strip */}
      {(isPro || isTrial) && (
        <div className={`flex items-start gap-2 text-sm mb-3 p-2.5 rounded-[10px] ${isCancelling ? 'bg-red-warn/8 border border-red-warn/20' : 'bg-cream'}`}>
          <Calendar size={13} className={`flex-shrink-0 mt-[2px] ${isCancelling ? 'text-red-warn' : 'text-ink-muted'}`} />
          {isTrial ? (
            <span className="text-ink-muted">
              {subStatus.trial_days_remaining === 1
                ? t('billing_trial_ends_one')
                : t('billing_trial_ends_many', { n: subStatus.trial_days_remaining })}
            </span>
          ) : isCancelling ? (
            <div>
              <p className="font-semibold text-red-warn">
                {t('billing_cancels_on')} {fmtDate(subCancelsAt)}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">{t('billing_cancelling_note')}</p>
            </div>
          ) : subValidUntil ? (
            <span className="text-ink-muted">
              {t('billing_renews_on')} <strong className="text-ink">{fmtDate(subValidUntil)}</strong>
              {daysLeft !== null && (
                <span className={`ml-2 font-semibold ${daysLeft < 7 ? 'text-red-500' : 'text-teal'}`}>
                  · {daysLeft} {t('billing_days_left')}
                </span>
              )}
            </span>
          ) : null}
        </div>
      )}

      {!isPro && !isTrial && (
        <p className="text-sm text-ink-muted mb-2">{t('billing_standard_note')}</p>
      )}

      {/* Actions */}
      {(isPro || isTrial) && (
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-sm-border flex-wrap">
          <div className="flex items-center gap-2">
            {isCancelling ? (
              <button
                onClick={onUndoCancel}
                disabled={undoCancelLoading}
                className="btn-ghost text-sm text-teal border-teal/40 hover:bg-teal/10 font-semibold"
                data-testid="undo-cancel-btn"
              >
                {undoCancelLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {t('billing_undo_cancel')}
              </button>
            ) : (
              subStatus?.has_stripe_customer && (
                <button onClick={onPortal} disabled={portalLoading} className="btn-ghost text-xs" data-testid="stripe-portal-btn">
                  {portalLoading ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                  {t('billing_manage')}
                </button>
              )
            )}
          </div>
          {!isCancelling && isPro && (
            <button
              onClick={onCancel}
              disabled={cancelLoading}
              className="btn-ghost text-xs text-red-warn border-red-warn/30 hover:bg-red-50"
              data-testid="cancel-subscription-btn"
            >
              {cancelLoading ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
              {t('billing_cancel')}
            </button>
          )}
        </div>
      )}
      {(isPro || isTrial) && (
        <p className="text-[10px] text-ink-muted mt-3 pt-2 border-t border-sm-border">
          {t('billing_excl_vat')}
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   UpgradeSection — shown below plan card for Standard users
──────────────────────────────────────────────────────────── */
function UpgradeSection({
  isTrialElig, billingPeriod, setBillingPeriod, annualNet, annualSaving,
  checkoutLoading, trialLoading, onUpgrade, onStartTrial, t,
}) {
  const monthlyNet    = 29.99;
  const annualPerMo   = (annualNet / 12).toFixed(2).replace('.', ',');   // ~24,99

  const PRO_BENEFITS = [
    'pro_plan_benefit1','pro_plan_benefit2','pro_plan_benefit3','pro_plan_benefit4',
    'pro_plan_benefit5','pro_plan_benefit6','pro_plan_benefit7',
  ];

  return (
    <div className="card-lg mb-6 border-amber/40" data-testid="upgrade-section">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber">{t('billing_upgrade_to_pro')}</p>
        <span className="flex items-center gap-1 text-xs font-bold text-teal">
          <Star size={11} /> {t('billing_pro_plan')}
        </span>
      </div>

      {/* Trial CTA */}
      {isTrialElig && (
        <div className="flex items-center justify-between gap-3 bg-amber/8 rounded-[12px] p-3 mb-4 border border-amber/30" data-testid="trial-cta">
          <div className="flex items-center gap-2">
            <Gift size={14} className="text-amber flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-ink">{t('bill_trial_14')}</p>
              <p className="text-xs text-ink-muted">{t('bill_trial_desc')}</p>
            </div>
          </div>
          <button onClick={onStartTrial} disabled={trialLoading} className="btn-amber text-xs flex-shrink-0" data-testid="start-trial-btn">
            {trialLoading ? <Loader2 size={12} className="animate-spin" /> : <Gift size={12} />} {t('billing_start_trial')}
          </button>
        </div>
      )}

      {/* Pro features detail card */}
      <div className="rounded-[14px] border border-amber/30 bg-amber/5 p-4 mb-4" data-testid="pro-features-card">
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber mb-3">
          {t('billing_upgrade_to_pro')} — {t('billing_includes') || "What's included"}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
          {PRO_BENEFITS.map((key) => (
            <div key={key} className="flex items-start gap-2">
              <CheckCircle size={13} className="text-teal flex-shrink-0 mt-[2px]" />
              <span className="text-sm text-ink">{t(key)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Billing period toggle — teal on both sides when selected */}
      <div className="flex items-stretch gap-2 p-1 bg-cream rounded-[12px] border border-sm-border mb-4" data-testid="billing-period-toggle">
        <button
          onClick={() => setBillingPeriod('monthly')}
          className={`flex-1 text-sm font-semibold py-2.5 rounded-[10px] transition-all flex flex-col items-center gap-0.5
            ${billingPeriod === 'monthly'
              ? 'bg-teal text-paper shadow-sm'
              : 'text-ink-muted hover:text-ink'}`}
          data-testid="period-monthly"
        >
          {t('billing_monthly')}
          <span className={`text-[10px] font-semibold ${billingPeriod === 'monthly' ? 'text-paper/80' : 'text-ink-muted'}`}>
            €{monthlyNet.toFixed(2).replace('.', ',')}
          </span>
        </button>
        <button
          onClick={() => setBillingPeriod('annual')}
          className={`flex-1 text-sm font-semibold py-2.5 rounded-[10px] transition-all flex flex-col items-center gap-0.5
            ${billingPeriod === 'annual'
              ? 'bg-teal text-paper shadow-sm'
              : 'text-ink-muted hover:text-ink'}`}
          data-testid="period-annual"
        >
          {t('billing_annual')}
          <span className={`text-[10px] font-semibold ${billingPeriod === 'annual' ? 'text-paper/80' : 'text-ink-muted'}`}>
            €{annualPerMo}
          </span>
        </button>
      </div>

      {/* CTA button — both modes show NET excl. VAT */}
      <button
        onClick={onUpgrade}
        disabled={checkoutLoading}
        className="btn-amber w-full py-3.5"
        data-testid="upgrade-btn"
      >
        {checkoutLoading ? (
          <><Loader2 size={16} className="animate-spin" /> {t('btn_processing')}</>
        ) : billingPeriod === 'annual' ? (
          <><Star size={16} /> {t('billing_upgrade')} {t('billing_annual')} — €{annualNet.toFixed(2).replace('.', ',')} / {t('billing_per_year_short') || 'yr'}</>
        ) : (
          <><Star size={16} /> {t('billing_upgrade')} — €{monthlyNet.toFixed(2).replace('.', ',')} / {t('billing_per_month_short')}</>
        )}
      </button>
      <p className="text-[10px] text-center text-ink-muted mt-2">
        {t('billing_excl_vat')} · {t('billing_secure_stripe')}
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   ToolkitTab — compact selector card in the top row
──────────────────────────────────────────────────────────── */
function ToolkitTab({ kind, meta, active, wasCancelled, selected, onClick, t }) {
  const Icon = meta.icon;
  const c    = COLOR[meta.color] || COLOR.teal;

  return (
    <button
      onClick={onClick}
      className={`card-lg flex flex-col items-center gap-2 py-4 cursor-pointer transition-all text-center focus:outline-none
        ${selected ? `border-2 ${c.border} ${c.bg}` : 'hover:border-ink-muted/40 border border-sm-border'}`}
      data-testid={`toolkit-tab-${kind}`}
    >
      <div className={`p-2 rounded-[10px] border transition-colors
        ${active ? `${c.bg} ${c.border}` : selected ? `${c.bg} ${c.border}` : 'bg-cream border-sm-border'}`}
      >
        <Icon size={16} className={active || selected ? c.icon : 'text-ink-muted'} />
      </div>
      <p className={`font-headings font-bold text-xs leading-tight text-center ${selected ? 'text-ink' : 'text-ink-muted'}`}>
        {t(meta.titleKey)}
      </p>
      {active ? (
        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${c.badge}`}
          data-testid={`toolkit-active-${kind}`}>
          {t('billing_active')}
        </span>
      ) : wasCancelled ? (
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-ink-muted/15 text-ink-muted">
          {t('billing_cancelled_badge')}
        </span>
      ) : (
        <span className="text-[9px] text-ink-muted/60 font-medium uppercase tracking-wider">{t('bill_inactive')}</span>
      )}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────
   ToolkitDetail — wide detail panel for the selected toolkit
──────────────────────────────────────────────────────────── */
function ToolkitDetail({ kind, meta, active, wasCancelled, tk, isPro, loading, cancelLoading, onUpgrade, onCancel, needsBank, t }) {
  const Icon  = meta.icon;
  const c     = COLOR[meta.color] || COLOR.teal;
  const price = tk ? (isPro ? tk.pro_net : tk.standard_net) : null;

  return (
    <div
      className={`card-lg border-2 transition-all ${active ? `${c.border} ${c.bg}` : wasCancelled ? 'border-ink-muted/30' : 'border-sm-border'}`}
      data-testid={`toolkit-detail-${kind}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-[12px] border ${c.bg} ${c.border}`}>
            <Icon size={20} className={c.icon} />
          </div>
          <h3 className="font-headings font-bold text-ink text-xl leading-tight">{t(meta.titleKey)}</h3>
        </div>
        {active ? (
          <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full flex-shrink-0 ${c.badge}`}>
            {t('billing_active')}
          </span>
        ) : wasCancelled ? (
          <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full flex-shrink-0 bg-ink-muted/15 text-ink-muted">
            {t('billing_cancelled_badge')}
          </span>
        ) : null}
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        {meta.benefits.map((key) => (
          <div key={key} className="flex items-start gap-2">
            <CheckCircle size={13} className={`${c.icon} flex-shrink-0 mt-[3px]`} />
            <span className="text-sm text-ink">{t(key)}</span>
          </div>
        ))}
      </div>

      {/* Pricing tiles */}
      {tk && (
        <div className="grid grid-cols-2 gap-3 mb-1">
          <div className={`rounded-[14px] border p-3 text-center transition-opacity
            ${!isPro ? `${c.border} ${c.bg}` : 'border-sm-border bg-cream opacity-50'}`}>
            <p className="text-[10px] font-bold uppercase text-ink-muted tracking-wider mb-1">
              {t('toolkit_tier_standard')}
            </p>
            <p className="text-2xl font-headings font-bold text-ink leading-tight">
              €{tk.standard_net.toFixed(2).replace('.', ',')}
            </p>
            <p className="text-[10px] text-ink-muted mt-0.5">/ {t('billing_per_month_short')}</p>
          </div>
          <div className={`rounded-[14px] border p-3 text-center transition-opacity
            ${isPro ? 'border-teal bg-teal/10' : 'border-sm-border bg-cream opacity-50'}`}>
            <p className="text-[10px] font-bold uppercase text-teal tracking-wider mb-1">★ {t('toolkit_tier_pro')}</p>
            <p className="text-2xl font-headings font-bold text-ink leading-tight">
              €{tk.pro_net.toFixed(2).replace('.', ',')}
            </p>
            <p className="text-[10px] text-ink-muted mt-0.5">/ {t('billing_per_month_short')}</p>
          </div>
        </div>
      )}
      {tk && (
        <p className="text-[10px] text-ink-muted mb-4">{t('billing_excl_vat')}</p>
      )}

      {/* Bank warning */}
      {needsBank && (
        <div className="mb-4 rounded-[10px] border border-amber/40 bg-amber/10 p-3 text-sm text-amber-deep flex items-center gap-2"
          data-testid="toolkit-needs-bank">
          <AlertCircle size={13} />
          <span>{t('toolkit_bank_required')} <a href="/settings?tab=invoice_details" className="underline font-semibold">{t('toolkit_set_bank_link')}</a></span>
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-3 pt-4 border-t border-sm-border">
        {active ? (
          <>
            <a
              href={meta.openLink}
              className="btn-ghost flex-1 justify-center py-2.5"
              data-testid={`toolkit-open-${kind}`}
            >
              {t('billing_open')} →
            </a>
            <button
              onClick={onCancel}
              disabled={cancelLoading}
              className="text-sm text-red-warn border border-red-warn/25 hover:bg-red-50 px-4 py-2.5 rounded-[12px] transition-colors flex items-center gap-1.5"
              data-testid={`toolkit-cancel-${kind}`}
            >
              {cancelLoading ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
              {t('toolkit_cancel_btn')}
            </button>
          </>
        ) : wasCancelled ? (
          <button
            onClick={onUpgrade}
            disabled={loading}
            className="flex-1 py-2.5 text-sm flex items-center justify-center gap-2 rounded-[12px] border-2 border-teal text-teal font-semibold hover:bg-teal/10 transition-colors"
            data-testid={`toolkit-reactivate-${kind}`}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t('billing_reactivate')} — €{price?.toFixed(2).replace('.', ',')} / {t('billing_per_month_short')}
          </button>
        ) : (
          <button
            onClick={onUpgrade}
            disabled={loading}
            className="btn-primary flex-1 py-2.5"
            data-testid={`toolkit-upgrade-${kind}`}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('billing_get_it')} — €{price?.toFixed(2).replace('.', ',')} / {t('billing_per_month_short')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   BundleCallout — All-in-One bundle card with toolkit chips
──────────────────────────────────────────────────────────── */
const BUNDLE_CHIPS = [
  { Icon: FileText,  label: 'Invoice', color: 'text-teal',      bg: 'bg-teal/10',      border: 'border-teal/30'      },
  { Icon: BarChart2, label: 'Tax',     color: 'text-amber',     bg: 'bg-amber/10',     border: 'border-amber/30'     },
  { Icon: Briefcase, label: 'PM',      color: 'text-blue-500',  bg: 'bg-blue-400/10',  border: 'border-blue-300/50'  },
];

function BundleCallout({ bundle, loading, onUpgrade, t }) {
  const savings = bundle.alacarte_net > bundle.net
    ? (bundle.alacarte_net - bundle.net).toFixed(2).replace('.', ',')
    : null;

  return (
    <div
      className={`card-lg mb-6 border-2 ${bundle.active ? 'border-teal/50 bg-teal/5' : 'border-teal/40'}`}
      data-testid="toolkit-card-bundle"
    >
      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <Package size={16} className="text-teal" />
            <h3 className="font-headings font-bold text-ink text-base">{t('bundle_title')}</h3>
            {bundle.active ? (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal text-paper">
                {t('billing_active')}
              </span>
            ) : savings ? (
              <span className="text-[10px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                {t('billing_save_label')} €{savings}/mo
              </span>
            ) : null}
          </div>
          <p className="text-xs text-ink-muted">{t('bundle_all_three')}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-headings font-bold text-ink leading-tight">
            €{bundle.net.toFixed(2).replace('.', ',')}
          </p>
          <p className="text-[10px] text-ink-muted">/ {t('billing_per_month_short')}</p>
        </div>
      </div>

      {/* ── Toolkit chips ── */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {BUNDLE_CHIPS.map(({ Icon, label, color, bg, border }) => (
          <div
            key={label}
            className={`flex items-center gap-2 px-3 py-2 rounded-[12px] border ${bg} ${border}`}
          >
            <Icon size={14} className={`${color} flex-shrink-0`} />
            <span className={`text-xs font-semibold ${color}`}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── CTA (upsell only) ── */}
      {!bundle.active && (
        <button
          onClick={onUpgrade}
          disabled={loading}
          className="btn-primary w-full py-2.5"
          data-testid="bundle-upgrade-btn"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
          {t('bundle_get_btn')}
        </button>
      )}
      <p className="text-[10px] text-ink-muted mt-3">{t('billing_excl_vat')}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Accordion — collapsible section (Fees / History)
──────────────────────────────────────────────────────────── */
function Accordion({ open, onToggle, label, badge, badgeColor, children, testId }) {
  const badgeCls = badgeColor === 'amber'
    ? 'bg-amber/15 text-amber-deep'
    : 'bg-teal/15 text-teal';
  return (
    <div className="card-lg mb-4" data-testid={testId}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-1 text-left"
      >
        <div className="flex items-center gap-2">
          <h2 className="font-headings font-bold text-ink text-base">{label}</h2>
          {badge && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeCls}`}>{badge}</span>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`text-ink-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="mt-4 border-t border-sm-border pt-4">{children}</div>}
    </div>
  );
}
