import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useLang } from '../contexts/LangContext';
import {
  Loader2, AlertCircle, ShieldCheck, CheckCircle2, CreditCard, Briefcase, Info, Lock,
} from 'lucide-react';

const fmtEur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));

export default function PayInvoicePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(`/api/pay-link/public/${token}`)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || 'Payment link unavailable'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const startCheckout = async () => {
    setSubmitting(true);
    try {
      const { data: cs } = await api.post(`/api/pay-link/public/${token}/checkout`, {
        origin_url: window.location.origin,
      });
      // Redirect customer to Stripe
      window.location.href = cs.checkout_url;
    } catch (e) {
      setError(e?.response?.data?.detail || 'Checkout could not be created');
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 size={28} className="text-teal animate-spin" /></div>;
  if (error) return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card-lg max-w-md text-center" data-testid="pay-page-error">
        <AlertCircle size={32} className="text-red-warn mx-auto mb-2" />
        <h1 className="font-headings font-bold text-ink text-xl">{t('pay_link_unavailable_title')}</h1>
        <p className="text-sm text-ink-muted mt-1">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12" data-testid="pay-page">
      <header className="bg-paper border-b border-sm-border py-3">
        <div className="page-container max-w-2xl flex items-center gap-2">
          <Briefcase size={18} className="text-teal" />
          <p className="text-sm font-headings font-bold text-ink">ServiceMarket · {t('pay_secure')}</p>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-ink-muted">
            <Lock size={11} /> Stripe
          </span>
        </div>
      </header>

      <main className="page-container py-6 max-w-2xl space-y-4">
        <div>
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">{t('pay_invoice_label')}</p>
          <h1 className="text-3xl font-headings font-bold text-ink">{data.invoice_number}</h1>
          <p className="text-sm text-ink-muted mt-1">{t('pay_from')} <span className="font-semibold text-ink">{data.pro.name}</span>{data.pro.city ? ` · ${data.pro.city}` : ''}</p>
        </div>

        {/* Amount summary */}
        <div className="card-lg" data-testid="pay-summary">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink-soft">{t('pay_invoice_amount')}</p>
              <p className="text-base font-mono text-ink" data-testid="pay-outstanding">{fmtEur(data.outstanding_eur)}</p>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <p className="text-sm text-ink-soft">{t('pay_service_fee').replace('{p}', data.service_fee_pct.toFixed(1))}</p>
                <button onClick={() => setConfirming('explain')} className="text-ink-muted hover:text-teal" data-testid="pay-fee-help" aria-label="info"><Info size={11} /></button>
              </div>
              <p className="text-base font-mono text-ink" data-testid="pay-service-fee">{fmtEur(data.service_fee_eur)}</p>
            </div>
            <div className="border-t border-sm-border pt-2.5 flex items-center justify-between">
              <p className="text-base font-headings font-bold text-ink">{t('pay_total')}</p>
              <p className="text-2xl font-headings font-bold text-teal" data-testid="pay-total">{fmtEur(data.total_eur)}</p>
            </div>
          </div>
        </div>

        {/* Trust strip */}
        <div className="grid grid-cols-3 gap-2">
          <div className="card-lg p-3 text-center">
            <Lock size={16} className="text-teal mx-auto mb-1" />
            <p className="text-[11px] font-semibold text-ink">{t('pay_trust_secure')}</p>
          </div>
          <div className="card-lg p-3 text-center">
            <ShieldCheck size={16} className="text-teal mx-auto mb-1" />
            <p className="text-[11px] font-semibold text-ink">{t('pay_trust_no_card')}</p>
          </div>
          <div className="card-lg p-3 text-center">
            <CheckCircle2 size={16} className="text-teal mx-auto mb-1" />
            <p className="text-[11px] font-semibold text-ink">{t('pay_trust_receipt')}</p>
          </div>
        </div>

        {/* Pay CTA */}
        <button
          onClick={() => setConfirming('go')}
          disabled={submitting}
          className="btn-primary w-full text-base py-3"
          data-testid="pay-confirm-btn"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
          {t('pay_continue')} {fmtEur(data.total_eur)}
        </button>

        <p className="text-[11px] text-center text-ink-muted">{t('pay_footer')}</p>
      </main>

      {/* Confirm modal */}
      {confirming && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !submitting && setConfirming(null)} data-testid="pay-confirm-modal">
          <div className="bg-paper rounded-[14px] shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Info size={18} className="text-teal" />
              <h3 className="font-headings font-bold text-ink">{t('pay_modal_title')}</h3>
            </div>
            <p className="text-sm text-ink leading-relaxed mb-3">{t('pay_modal_body')}</p>
            <div className="rounded-[10px] bg-cream-soft p-3 space-y-1.5 text-sm" data-testid="pay-confirm-breakdown">
              <div className="flex justify-between"><span className="text-ink-muted">{t('pay_invoice_amount')}</span><span className="font-mono text-ink">{fmtEur(data.outstanding_eur)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">{t('pay_service_fee').replace('{p}', data.service_fee_pct.toFixed(1))}</span><span className="font-mono text-ink">+{fmtEur(data.service_fee_eur)}</span></div>
              <div className="border-t border-sm-border pt-1.5 flex justify-between font-headings font-bold"><span className="text-ink">{t('pay_modal_total')}</span><span className="text-teal">{fmtEur(data.total_eur)}</span></div>
            </div>
            <p className="text-[11px] text-ink-muted mt-3">{t('pay_modal_fine_print')}</p>
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => setConfirming(null)} disabled={submitting} className="btn-ghost text-sm flex-1" data-testid="pay-modal-cancel">{t('btn_cancel')}</button>
              <button
                onClick={startCheckout}
                disabled={submitting}
                className="btn-primary text-sm flex-1"
                data-testid="pay-modal-confirm"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {t('pay_modal_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
