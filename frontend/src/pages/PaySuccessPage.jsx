import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useLang } from '../contexts/LangContext';
import { Loader2, CheckCircle2, AlertCircle, Briefcase, ShieldCheck } from 'lucide-react';

const fmtEur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));

export default function PaySuccessPage() {
  const { token } = useParams();
  const [search] = useSearchParams();
  const { t } = useLang();
  const sessionId = search.get('session_id');
  const [phase, setPhase] = useState('polling'); // polling | success | failed | timeout
  const [data, setData] = useState(null);
  const pollCount = useRef(0);
  const stopped = useRef(false);

  useEffect(() => {
    if (!sessionId) { setPhase('failed'); return; }
    let timer;

    async function poll() {
      if (stopped.current) return;
      try {
        const { data: s } = await api.get(`/api/pay-link/public/checkout-status/${sessionId}`);
        setData(s);
        if (s.payment_status === 'paid' && s.status === 'complete') {
          stopped.current = true;
          setPhase('success');
          return;
        }
        if (s.status === 'expired') {
          stopped.current = true;
          setPhase('failed');
          return;
        }
      } catch {
        // ignore — retry
      }
      pollCount.current += 1;
      if (pollCount.current >= 15) {
        stopped.current = true;
        setPhase('timeout');
        return;
      }
      timer = setTimeout(poll, 2000);
    }
    poll();
    return () => { stopped.current = true; if (timer) clearTimeout(timer); };
  }, [sessionId, token]);

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12" data-testid="pay-success-page">
      <header className="bg-paper border-b border-sm-border py-3">
        <div className="page-container max-w-2xl flex items-center gap-2">
          <Briefcase size={18} className="text-teal" />
          <p className="text-sm font-headings font-bold text-ink">ServiceMarket</p>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-ink-muted">
            <ShieldCheck size={11} /> Stripe
          </span>
        </div>
      </header>

      <main className="page-container py-10 max-w-md text-center">
        {phase === 'polling' && (
          <div data-testid="pay-success-polling">
            <Loader2 size={40} className="text-teal animate-spin mx-auto mb-3" />
            <h1 className="font-headings font-bold text-ink text-xl">{t('pay_success_polling')}</h1>
            <p className="text-sm text-ink-muted mt-1">{t('pay_success_polling_help')}</p>
          </div>
        )}
        {phase === 'success' && (
          <div data-testid="pay-success-done">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-pos/15 flex items-center justify-center mb-3">
              <CheckCircle2 size={44} className="text-green-pos" />
            </div>
            <h1 className="font-headings font-bold text-ink text-2xl">{t('pay_success_title')}</h1>
            <p className="text-sm text-ink-muted mt-1">{t('pay_success_body')}</p>
            {data?.amount && (
              <div className="card-lg mt-5 inline-block">
                <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">{t('pay_success_amount')}</p>
                <p className="text-3xl font-headings font-bold text-teal">{fmtEur(Number(data.amount) / 100)}</p>
              </div>
            )}
            <Link to="/" className="btn-ghost mt-5 inline-flex text-xs">{t('pay_success_close')}</Link>
          </div>
        )}
        {phase === 'failed' && (
          <div data-testid="pay-success-failed">
            <AlertCircle size={40} className="text-red-warn mx-auto mb-3" />
            <h1 className="font-headings font-bold text-ink text-xl">{t('pay_failed_title')}</h1>
            <p className="text-sm text-ink-muted mt-1">{t('pay_failed_body')}</p>
            <Link to={`/pay/${token}`} className="btn-primary mt-5 inline-flex text-xs">{t('pay_failed_retry')}</Link>
          </div>
        )}
        {phase === 'timeout' && (
          <div data-testid="pay-success-timeout">
            <AlertCircle size={40} className="text-amber-deep mx-auto mb-3" />
            <h1 className="font-headings font-bold text-ink text-xl">{t('pay_timeout_title')}</h1>
            <p className="text-sm text-ink-muted mt-1">{t('pay_timeout_body')}</p>
          </div>
        )}
      </main>
    </div>
  );
}
