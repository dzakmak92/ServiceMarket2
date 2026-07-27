import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import { useAuth } from '../../contexts/AuthContext';
import ExportJobFileModal from '../../components/ExportJobFileModal';
import {
  Loader2, AlertCircle, CheckCircle2, Clock, BookOpen, FileSignature, Receipt,
  QrCode, Image as ImageIcon, X, Check, ChevronLeft, MessageSquare, FileDown,
} from 'lucide-react';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';
const fmtEur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));

export default function HomeownerProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);

  const load = useCallback(() => {
    return api.get(`/api/pm/my-projects/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.detail || 'Not found'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 size={28} className="text-teal animate-spin" /></div>
  );

  if (error) return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card-lg max-w-md text-center" data-testid="ho-project-not-found">
        <AlertCircle size={32} className="text-red-warn mx-auto mb-2" />
        <p className="text-sm text-ink-muted mt-1">{error}</p>
        <button onClick={() => navigate('/my-projects')} className="btn-ghost text-xs mt-3 inline-flex">{t('ho_back_to_projects')}</button>
      </div>
    </div>
  );

  const pct = data.progress_pct || 0;
  const pendingCOs = (data.change_orders || []).filter((c) => c.status === 'sent');
  const decidedCOs = (data.change_orders || []).filter((c) => c.status !== 'sent');
  const messageHref = data.job_id && data.pro_user_id ? `/messages?job=${data.job_id}&to=${data.pro_user_id}` : null;

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12" data-testid="ho-project-detail">
      <main className="page-container py-6 max-w-3xl space-y-4">
        <button onClick={() => navigate('/my-projects')} className="btn-ghost text-xs" data-testid="ho-project-back">
          <ChevronLeft size={14} /> {t('ho_back_to_projects')}
        </button>

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">{data.job_category}</p>
            <h1 className="text-3xl font-headings font-bold text-ink mt-1">{data.title}</h1>
          </div>
          {data.status === 'done' && (
            <button
              onClick={() => setExportOpen(true)}
              className="btn-ghost text-xs flex-shrink-0 mt-1"
              data-testid="ho-export-jobfile-btn"
            >
              <FileDown size={14} /> {t('pm_export_jobfile')}
            </button>
          )}
        </div>

        {/* Pro snapshot + message CTA */}
        <div className="card-lg flex items-center gap-3" data-testid="ho-project-pro">
          <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center text-teal font-headings font-bold">
            {(data.pro?.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase font-bold text-ink-muted">{t('pm_pro')}</p>
            <p className="font-headings font-bold text-ink truncate">{data.pro?.name}</p>
            {data.pro?.city && <p className="text-xs text-ink-muted">{data.pro.city}</p>}
          </div>
          {messageHref && (
            <button
              onClick={() => navigate(messageHref)}
              className="btn-primary text-xs flex-shrink-0"
              data-testid="ho-message-pro"
            >
              <MessageSquare size={13} /> {t('ho_message_pro')}
            </button>
          )}
        </div>

        {data.customer_status_note && (
          <div className="card-lg border-l-4 border-teal" data-testid="ho-project-status-note">
            <p className="text-sm text-ink whitespace-pre-wrap">{data.customer_status_note}</p>
          </div>
        )}

        {/* Progress */}
        <div className="card-lg" data-testid="ho-project-progress">
          <div className="flex items-end justify-between mb-2">
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">{t('pm_progress')}</p>
            <p className="text-2xl font-headings font-bold text-ink">{pct}%</p>
          </div>
          <div className="h-2 bg-cream-deep rounded-full overflow-hidden">
            <div className="h-full bg-teal transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center gap-3 mt-3 text-xs text-ink-muted flex-wrap">
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={11} className="text-green-pos" /> {data.tasks_done} / {data.tasks_total}</span>
            {data.tasks_doing > 0 && <span className="inline-flex items-center gap-1"><Clock size={11} className="text-amber-deep" /> {data.tasks_doing} {t('portal_in_progress')}</span>}
          </div>
        </div>

        {/* Photos */}
        {data.photos && data.photos.length > 0 && (
          <div className="card-lg" data-testid="ho-project-photos">
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-3 flex items-center gap-2"><ImageIcon size={12} /> {t('portal_photos')}</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {data.photos.map((src, i) => (
                <a key={i} href={`${BACKEND}${src}`} target="_blank" rel="noreferrer" className="block aspect-square rounded-[10px] overflow-hidden bg-cream-deep">
                  <img src={`${BACKEND}${src}`} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Change orders */}
        {(pendingCOs.length > 0 || decidedCOs.length > 0) && (
          <div className="card-lg" data-testid="ho-project-changeorders">
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-3 flex items-center gap-2"><FileSignature size={12} /> {t('portal_extras_title')}</p>
            <div className="space-y-3">
              {pendingCOs.map((co) => (
                <ChangeOrderApproval key={co.id} co={co} projectId={id} defaultName={user?.name || ''} onDone={load} t={t} />
              ))}
              {decidedCOs.map((co) => (
                <DecidedChangeOrder key={co.id} co={co} t={t} />
              ))}
            </div>
          </div>
        )}

        {/* Payments */}
        {data.payments && data.payments.length > 0 && (
          <div className="card-lg" data-testid="ho-project-payments">
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-1 flex items-center gap-2"><Receipt size={12} /> {t('portal_payments_title')}</p>
            {data.bank?.iban_masked && (
              <p className="text-[11px] text-ink-muted mb-3">{t('portal_bank')}: <strong className="text-ink">{data.bank.name}</strong> · {data.bank.iban_masked}</p>
            )}
            <div className="space-y-3">
              {data.payments.map((p) => (
                <PaymentRow key={p.id} pay={p} projectId={id} onDone={load} t={t} />
              ))}
            </div>
          </div>
        )}

        {/* Financials */}
        {data.financials && (data.financials.approved_extras_net_eur > 0 || data.financials.quote_net_eur > 0) && (
          <div className="card-lg" data-testid="ho-project-financials">
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-3">{t('portal_financials_title')}</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">{t('portal_quote')}</span><span className="text-ink">{fmtEur(data.financials.quote_net_eur)}</span></div>
              {data.financials.approved_extras_net_eur > 0 && (
                <div className="flex justify-between"><span className="text-ink-muted">{t('portal_extras')}</span><span className="text-ink">+ {fmtEur(data.financials.approved_extras_net_eur)}</span></div>
              )}
              <div className="flex justify-between border-t border-sm-border pt-1.5 font-headings font-bold">
                <span className="text-ink">{t('portal_new_total')}</span><span className="text-teal">{fmtEur(data.financials.new_total_net_eur)}</span>
              </div>
              <p className="text-[10px] text-ink-muted">{t('billing_excl_vat')}</p>
            </div>
          </div>
        )}

        {/* Diary */}
        {data.diary_recent && data.diary_recent.length > 0 && (
          <div className="card-lg" data-testid="ho-project-diary">
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-3 flex items-center gap-2"><BookOpen size={12} /> {t('portal_recent_updates')}</p>
            <ul className="space-y-3">
              {data.diary_recent.map((d) => (
                <li key={d.id} className="border-l-2 border-cream-deep pl-3">
                  <p className="text-sm text-ink whitespace-pre-wrap">{d.note}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">{new Date(d.entry_date).toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <ExportJobFileModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        exportPath={`/api/pm/my-projects/${id}/export-pdf`}
        fileName={data.title}
      />
    </div>
  );
}

/* ── Change order awaiting approval ──────────────────────────── */
function ChangeOrderApproval({ co, projectId, defaultName, onDone, t }) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const act = async (decision) => {
    if (name.trim().length < 2) { setErr(t('portal_co_sign_hint')); return; }
    setBusy(true); setErr('');
    try {
      await api.post(`/api/pm/my-projects/${projectId}/change-orders/${co.id}/${decision}`, { name: name.trim() });
      await onDone();
    } catch (e) { setErr(e?.response?.data?.detail || 'Failed'); setBusy(false); }
  };
  return (
    <div className="rounded-[12px] border-2 border-amber/40 bg-amber/5 p-3" data-testid={`ho-co-${co.id}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="font-headings font-bold text-ink text-sm">{co.number} · {co.title}</p>
        <span className="text-[10px] uppercase font-bold text-amber-deep">{t('portal_co_pending')}</span>
      </div>
      {co.description && <p className="text-xs text-ink-muted mb-2">{co.description}</p>}
      <ul className="text-xs text-ink space-y-1 mb-2">
        {(co.items || []).map((it, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span>{it.description} <span className="text-ink-muted">×{it.qty}</span></span>
            <span>{fmtEur(it.qty * it.unit_net)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-sm font-headings font-bold border-t border-amber/30 pt-1.5 mb-3">
        <span className="text-ink">{t('portal_new_total')} (net)</span><span className="text-ink">{fmtEur(co.net_total)}</span>
      </div>
      <input
        className="sm-input text-sm w-full mb-2"
        placeholder={t('portal_co_sign_hint')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        data-testid={`ho-co-name-${co.id}`}
      />
      {err && <p className="text-[11px] text-red-warn mb-2">{err}</p>}
      <div className="flex gap-2">
        <button onClick={() => act('approve')} disabled={busy} className="btn-primary text-xs flex-1 py-2" data-testid={`ho-co-approve-${co.id}`}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {t('portal_co_approve')}
        </button>
        <button onClick={() => act('reject')} disabled={busy} className="btn-ghost text-xs flex-1 py-2" data-testid={`ho-co-reject-${co.id}`}>
          <X size={12} /> {t('portal_co_decline')}
        </button>
      </div>
    </div>
  );
}

function DecidedChangeOrder({ co, t }) {
  const approved = co.status === 'approved' || co.status === 'invoiced';
  return (
    <div className={`rounded-[12px] border p-3 ${approved ? 'border-green-pos/30 bg-green-pos/5' : 'border-sm-border bg-cream opacity-80'}`} data-testid={`ho-co-decided-${co.id}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-headings font-bold text-ink text-sm">{co.number} · {co.title}</p>
        <span className="text-sm font-bold text-ink">{fmtEur(co.net_total)}</span>
      </div>
      <p className={`text-[11px] mt-0.5 ${approved ? 'text-green-pos' : 'text-ink-muted'}`}>
        {approved ? <><Check size={11} className="inline" /> {t('portal_co_approved_by')} {co.approved_by_name}</> : t('portal_co_declined')}
      </p>
    </div>
  );
}

/* ── Payment row with QR + I've paid ─────────────────────────── */
function PaymentRow({ pay, projectId, onDone, t }) {
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const paid = pay.status === 'paid';
  const marked = pay.status === 'client_marked_paid';
  const markPaid = async () => {
    setBusy(true);
    try { await api.post(`/api/pm/my-projects/${projectId}/payments/${pay.id}/client-paid`); await onDone(); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-[12px] border border-sm-border bg-paper p-3" data-testid={`ho-pay-${pay.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-headings font-bold text-ink text-sm">{pay.label}</p>
          <p className="text-[11px] text-ink-muted">{pay.reference}</p>
        </div>
        <p className="text-lg font-headings font-bold text-ink">{fmtEur(pay.amount_eur)}</p>
      </div>
      {paid ? (
        <p className="text-[11px] text-green-pos mt-2 font-semibold"><Check size={11} className="inline" /> {t('portal_pay_paid')}</p>
      ) : marked ? (
        <p className="text-[11px] text-amber-deep mt-2 font-semibold">{t('portal_pay_client_marked')}</p>
      ) : (
        <div className="flex gap-2 mt-2 flex-wrap">
          {pay.epc_qr_base64 && (
            <button onClick={() => setShowQr((s) => !s)} className="btn-ghost text-xs py-2" data-testid={`ho-pay-qr-${pay.id}`}>
              <QrCode size={12} /> {t('portal_pay_qr')}
            </button>
          )}
          <button onClick={markPaid} disabled={busy} className="btn-primary text-xs py-2" data-testid={`ho-pay-ivepaid-${pay.id}`}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {t('portal_pay_ive_paid')}
          </button>
        </div>
      )}
      {showQr && pay.epc_qr_base64 && (
        <div className="mt-3 flex flex-col items-center">
          <img src={pay.epc_qr_base64} alt="EPC QR" className="w-40 h-40" data-testid={`ho-pay-qrimg-${pay.id}`} />
          <p className="text-[10px] text-ink-muted mt-1 text-center">{t('portal_pay_qr_hint')}</p>
        </div>
      )}
    </div>
  );
}
