import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import { fmtEur, fmtDateLong as fmtDate } from '../../utils/money';
import {
  AlertTriangle, Loader2, Copy, Check, Eye, CheckCircle2, Mail, Phone,
} from 'lucide-react';

/**
 * Who owes money, and how late.
 *
 * `GET /api/invoices/overdue` was mounted, correct and called by nothing, so
 * the one screen a small business actually needs — a list of people to chase
 * — did not exist. There is no email rail yet and no PSP, and neither is
 * required: what a tradesperson needs is to know who to ring, and to have
 * the words ready. So the useful artefact here is a reminder they can paste
 * into WhatsApp or an email client, with the invoice number, the amount, the
 * due date and their own IBAN already in it.
 *
 * The stage ladder is descriptive, not legal advice. It reflects normal DACH
 * practice — a friendly reminder first, then a formal one — and deliberately
 * stops short of computing Verzugszinsen or Mahnspesen, which depend on
 * whether the customer is a business (§ 456 UGB / § 288 BGB) and on terms
 * this app does not know.
 */


/** Days overdue → which reminder is the natural next one to send. */
function stage(days) {
  if (days <= 14) return { key: 'reminder', tone: 'bg-amber/15 text-amber-deep' };
  if (days <= 30) return { key: 'first', tone: 'bg-amber/25 text-amber-deep' };
  return { key: 'second', tone: 'bg-red-warn/15 text-red-warn' };
}

export default function OverduePage() {
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [pro, setPro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, { data: p }] = await Promise.all([
        api.get('/api/invoices/overdue'),
        api.get('/api/profile/pro').catch(() => ({ data: null })),
      ]);
      setRows(data.invoices || []);
      setPro(p);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = rows.reduce((s, r) => s + Number(r.outstanding || 0), 0);

  const reminderText = (r) => {
    const s = stage(r.days_overdue);
    const lines = [
      `${t(`overdue_subject_${s.key}`)}: ${r.invoice_number}`,
      '',
      `${t('overdue_greeting')} ${r.customer_name || ''},`.trim(),
      '',
      t(`overdue_body_${s.key}`)
        .replace('{number}', r.invoice_number)
        .replace('{amount}', fmtEur(r.outstanding))
        .replace('{due}', fmtDate(r.due_date))
        .replace('{days}', String(r.days_overdue)),
    ];
    if (pro?.bank_iban) {
      lines.push('', `${t('overdue_bank')}: ${pro.bank_iban}`
        + (pro.bank_account_holder ? ` (${pro.bank_account_holder})` : ''),
        `${t('overdue_reference')}: ${r.invoice_number}`);
    }
    lines.push('', t('overdue_signoff'), pro?.business_name || '');
    return lines.filter((l) => l !== undefined).join('\n');
  };

  const copy = async (r) => {
    try {
      await navigator.clipboard.writeText(reminderText(r));
      setCopied(r.id);
      setTimeout(() => setCopied((c) => (c === r.id ? null : c)), 2500);
    } catch { /* clipboard blocked — the text is still on screen below */ }
  };

  const markPaid = async (r) => {
    setBusy(r.id);
    try { await api.post(`/api/invoices/${r.id}/mark-paid`); await load(); }
    finally { setBusy(null); }
  };

  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <Loader2 size={28} className="text-teal animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12">
      <div className="page-container py-8 max-w-3xl">
        <div className="flex items-start gap-3 mb-6">
          <AlertTriangle size={26} className="text-amber-deep mt-1" />
          <div>
            <h1 className="text-3xl font-headings font-bold text-ink">{t('overdue_title')}</h1>
            <p className="text-ink-muted text-sm">{t('overdue_subtitle')}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="card-lg text-center py-12" data-testid="overdue-empty">
            <CheckCircle2 size={36} className="mx-auto text-green-pos mb-2" />
            <p className="text-ink font-medium">{t('overdue_none_title')}</p>
            <p className="text-ink-muted text-sm mt-1">{t('overdue_none_help')}</p>
            <Link to="/my-invoices" className="btn-ghost text-sm mt-4 inline-flex">
              {t('dash_view_invoices')}
            </Link>
          </div>
        ) : (
          <>
            <div className="card-lg mb-4 bg-amber/5 border-amber/25 flex flex-wrap items-center gap-3"
                 data-testid="overdue-total">
              <div className="flex-1 min-w-[8rem]">
                <p className="text-[10px] uppercase font-bold tracking-wider text-ink-muted">
                  {t('overdue_total')}
                </p>
                <p className="text-2xl font-headings font-bold text-amber-deep">{fmtEur(total)}</p>
              </div>
              <p className="text-sm text-ink-muted">
                {t('overdue_count', { n: rows.length })}
              </p>
            </div>

            <div className="space-y-3">
              {rows.map((r) => {
                const s = stage(r.days_overdue);
                return (
                  <div key={r.id} className="card-lg" data-testid={`overdue-row-${r.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm text-ink">{r.invoice_number}</p>
                        <p className="text-sm text-ink-soft truncate">{r.customer_name || '—'}</p>
                        <p className="text-[11px] text-ink-muted mt-0.5">
                          {t('overdue_due_on')} {fmtDate(r.due_date)}
                        </p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <p className="text-xl font-headings font-bold text-ink">
                          {fmtEur(r.outstanding)}
                        </p>
                        <span className={`inline-block text-[9px] uppercase font-bold
                                          px-2 py-0.5 rounded-full mt-1 ${s.tone}`}>
                          {t('overdue_days', { n: r.days_overdue })}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-ink-muted mt-2">
                      {t('overdue_next')}: <strong>{t(`overdue_stage_${s.key}`)}</strong>
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3
                                    border-t border-sm-border">
                      <button onClick={() => copy(r)} className="btn-primary text-xs"
                              data-testid={`overdue-copy-${r.id}`}>
                        {copied === r.id ? <Check size={12} /> : <Copy size={12} />}
                        {copied === r.id ? t('overdue_copied') : t('overdue_copy')}
                      </button>
                      {r.customer_email && (
                        <a href={`mailto:${r.customer_email}`
                            + `?subject=${encodeURIComponent(`${t(`overdue_subject_${s.key}`)}: ${r.invoice_number}`)}`
                            + `&body=${encodeURIComponent(reminderText(r))}`}
                           className="btn-ghost text-xs">
                          <Mail size={12} /> {t('overdue_email')}
                        </a>
                      )}
                      {r.customer_phone && (
                        <a href={`tel:${r.customer_phone}`} className="btn-ghost text-xs">
                          <Phone size={12} /> {t('overdue_call')}
                        </a>
                      )}
                      <Link to={`/my-invoices?q=${encodeURIComponent(r.invoice_number)}`} className="btn-ghost text-xs">
                        <Eye size={12} /> {t('overdue_view')}
                      </Link>
                      <button onClick={() => markPaid(r)} disabled={busy === r.id}
                              className="btn-ghost text-xs ml-auto text-green-pos"
                              data-testid={`overdue-paid-${r.id}`}>
                        {busy === r.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <CheckCircle2 size={12} />}
                        {t('overdue_mark_paid')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-ink-muted mt-4">{t('overdue_legal_note')}</p>
          </>
        )}
      </div>
    </div>
  );
}
