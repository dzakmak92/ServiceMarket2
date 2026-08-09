import React, { useCallback, useEffect, useState } from 'react';
import { useLang } from '../../../contexts/LangContext';
import api, { formatError } from '../../../api/client';
import {
  Loader2, Banknote, CheckCircle2, Percent, Building2, Copy, Check, X,
  Wallet, Clock,
} from 'lucide-react';

const eur = (n) => `€${(Number(n) || 0).toFixed(2)}`;

function StatCard({ icon: Icon, label, value, accent = 'text-teal', testid }) {
  return (
    <div className="card-lg flex items-center gap-3 py-4" data-testid={testid}>
      <div className={`w-10 h-10 rounded-[12px] bg-teal/10 flex items-center justify-center ${accent}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className={`text-xl font-headings font-bold ${accent}`}>{value}</p>
        <p className="text-[11px] text-ink-muted">{label}</p>
      </div>
    </div>
  );
}

function ProPayoutCard({ p, onSettle, busy }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState('');
  const [copied, setCopied] = useState(false);
  const copyIban = async () => {
    try { await navigator.clipboard.writeText(p.iban || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };
  return (
    <div className="bg-paper border border-sm-border rounded-[14px] p-4" data-testid={`payout-pro-${p.pro_id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-ink flex items-center gap-1.5">
            <Building2 size={14} className="text-teal flex-shrink-0" /> {p.pro_name}
            {p.business_name && <span className="text-ink-muted font-normal">· {p.business_name}</span>}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {p.iban ? (
              <button onClick={copyIban} className="text-[11px] font-mono text-ink-soft bg-cream-soft px-2 py-0.5 rounded-md flex items-center gap-1 hover:bg-cream-deep transition-colors" data-testid={`payout-iban-${p.pro_id}`}>
                {p.iban} {copied ? <Check size={11} className="text-green-pos" /> : <Copy size={11} />}
              </button>
            ) : (
              <span className="text-[11px] text-red-warn">⚠ {t('adm_no_iban')}</span>
            )}
            <span className="text-[11px] text-ink-muted">{p.count} payment{p.count === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-headings font-bold text-ink" data-testid={`payout-owed-${p.pro_id}`}>{eur(p.owed_eur)}</p>
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-1 text-xs font-semibold text-paper bg-teal px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity"
            data-testid={`payout-settle-toggle-${p.pro_id}`}
          >
            {t('adm_mark_settled')}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-sm-border flex items-end gap-2" data-testid={`payout-settle-form-${p.pro_id}`}>
          <div className="flex-1">
            <label className="text-[11px] font-semibold text-ink-soft">Transfer reference (optional)</label>
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t('adm_ref_example')} className="sm-input w-full text-sm" data-testid={`payout-ref-${p.pro_id}`} />
          </div>
          <button onClick={() => onSettle(p.pro_id, ref)} disabled={busy} className="btn-primary text-xs px-4 py-2 rounded-[10px] disabled:opacity-50" data-testid={`payout-confirm-${p.pro_id}`}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : `Confirm ${eur(p.owed_eur)}`}
          </button>
          <button onClick={() => setOpen(false)} className="p-2 text-ink-muted hover:text-ink"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}

export default function AdminPayouts({ flash }) {
  const { t } = useLang();
  const [summary, setSummary] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerStatus, setLedgerStatus] = useState('owed');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        api.get('/api/admin/payouts/summary'),
        api.get(`/api/admin/payouts?status=${ledgerStatus}`),
      ]);
      setSummary(sRes.data);
      setLedger(lRes.data.rows || []);
    } catch (e) { flash?.(formatError(e)); } finally { setLoading(false); }
  }, [flash, ledgerStatus]);

  useEffect(() => { load(); }, [load]);

  const settlePro = async (proId, reference) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/api/admin/payouts/settle-pro/${proId}`, { reference });
      flash?.(`Marked ${data.settled_count} payout(s) settled`);
      load();
    } catch (e) { flash?.(formatError(e)); } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-teal" /></div>;
  }

  const owedPros = summary?.owed_by_pro || [];

  return (
    <div className="space-y-5" data-testid="admin-payouts">
      <div>
        <h2 className="font-headings font-bold text-ink text-lg flex items-center gap-2">
          <Wallet size={18} className="text-teal" /> {t('adm_payouts_owed')}
        </h2>
        <p className="text-xs text-ink-muted">Online card payments are collected into your Stripe account (invoice + 1% fee). Transfer each pro their amount, then mark it settled here. (Auto-split arrives with your live Stripe Connect key.)</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={Banknote} label="Owed to pros" value={eur(summary?.total_owed)} accent="text-amber-deep" testid="payout-stat-owed" />
        <StatCard icon={CheckCircle2} label="Settled (paid out)" value={eur(summary?.total_settled)} accent="text-green-pos" testid="payout-stat-settled" />
        <StatCard icon={Percent} label="Your fees earned (1%)" value={eur(summary?.total_fees)} accent="text-teal" testid="payout-stat-fees" />
      </div>

      {/* Owed by pro */}
      <div>
        <h3 className="font-headings font-bold text-ink text-sm mb-3">{t('adm_outstanding_by')}</h3>
        {owedPros.length === 0 ? (
          <div className="card-lg text-center py-8 text-sm text-ink-muted flex flex-col items-center gap-2" data-testid="payout-none-owed">
            <CheckCircle2 size={22} className="text-green-pos" /> {t('adm_nothing_owed')}
          </div>
        ) : (
          <div className="space-y-2">
            {owedPros.map((p) => <ProPayoutCard key={p.pro_id} p={p} onSettle={settlePro} busy={busy} />)}
          </div>
        )}
      </div>

      {/* Ledger */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-headings font-bold text-ink text-sm">{t('adm_ledger')}</h3>
          <div className="flex gap-1.5">
            {['owed', 'settled', 'all'].map((s) => (
              <button
                key={s}
                onClick={() => setLedgerStatus(s)}
                className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-colors ${ledgerStatus === s ? 'bg-teal text-paper border-teal' : 'border-sm-border text-ink-soft hover:bg-cream-soft'}`}
                data-testid={`payout-ledger-${s}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {ledger.length === 0 ? (
          <p className="text-center py-8 text-sm text-ink-muted" data-testid="payout-ledger-empty">{t('adm_no_payments')}</p>
        ) : (
          <div className="space-y-1.5" data-testid="payout-ledger-list">
            {ledger.map((r) => (
              <div key={r.id} className="bg-paper border border-sm-border rounded-[12px] px-3 py-2.5 flex items-center gap-3" data-testid={`payout-ledger-row-${r.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">{r.invoice_number} · {r.pro_name}</p>
                  <p className="text-[11px] text-ink-muted flex items-center gap-1">
                    <Clock size={10} />{r.paid_at ? new Date(r.paid_at).toLocaleDateString() : '—'}
                    {r.settled_ref && <span className="ml-1">· {t('adm_ref')} {r.settled_ref}</span>}
                  </p>
                </div>
                <span className="text-sm font-semibold text-ink">{eur(r.amount_eur)}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === 'settled' ? 'bg-green-pos/10 text-green-pos' : 'bg-amber/15 text-amber-deep'}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
