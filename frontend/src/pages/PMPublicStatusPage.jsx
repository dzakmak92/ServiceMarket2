import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useLang } from '../contexts/LangContext';
import { fmtEur, fmtDateLong as fmtDate } from '../utils/money';
import {
  Loader2, AlertCircle, CheckCircle2, Clock, BookOpen, ShieldCheck,
  FileSignature, Receipt, Hammer, MapPin, Mail, Phone, Check, X,
} from 'lucide-react';

/**
 * What the customer sees.
 *
 * The only screen in the product addressed to the person paying, reached by a
 * link with no login. It was written against the marketplace's payload and
 * read `data.title`, `data.progress_pct`, `data.pro`, `data.change_orders`,
 * `data.payments`, `data.financials` and `data.diary_recent` — none of which
 * the API returned — and never touched `data.quotes` at all. So the customer
 * could not see who was doing their work, what it would cost, or say yes:
 * `POST /api/portal/{token}/quotes/{id}/accept` was mounted, correct, and had
 * no caller anywhere in the frontend. Acceptance could only be recorded by the
 * tradesperson on the customer's behalf.
 *
 * Everything below reads the shape `get_by_share_token` actually returns.
 */


const TIER_LABEL = { basic: 'tier_basic', standard: 'tier_standard', premium: 'tier_premium' };

export default function PMPublicStatusPage() {
  const { shareToken } = useParams();
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(() => (
    api.get(`/api/portal/${shareToken}`)
      .then((r) => { setData(r.data); setError(''); })
      .catch((e) => setError(e?.response?.data?.detail || t('portal_link_invalid')))
      .finally(() => setLoading(false))
  ), [shareToken, t]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn, key) => {
    setBusy(key);
    try { await fn(); await load(); }
    catch (e) { setError(e?.response?.data?.detail || t('generic_error')); }
    finally { setBusy(null); }
  };

  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <Loader2 size={28} className="text-teal animate-spin" />
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card-lg max-w-md text-center" data-testid="pm-public-not-found">
        <AlertCircle size={32} className="text-red-warn mx-auto mb-2" />
        <h1 className="font-headings font-bold text-ink text-xl">{t('portal_link_invalid_title')}</h1>
        <p className="text-sm text-ink-muted mt-1">{error}</p>
      </div>
    </div>
  );

  const job = data.job || {};
  const pro = data.pro || {};
  const progress = data.progress || {};
  const quotes = data.quotes || [];
  const cos = data.change_orders || [];
  const invoices = data.invoices || [];
  const diary = data.diary || [];

  const accepted = quotes.find((q) => q.status === 'accepted');
  const openQuotes = quotes.filter((q) => q.status !== 'accepted');
  const pendingCos = cos.filter((c) => c.status === 'sent');
  const decidedCos = cos.filter((c) => c.status !== 'sent');
  const outstanding = invoices.reduce((s, i) => s + Number(i.outstanding || 0), 0);

  return (
    <div className="min-h-screen bg-cream pb-16" data-testid="pm-public-page">
      <header className="bg-paper border-b border-sm-border py-3">
        <div className="page-container max-w-3xl flex items-center gap-2">
          <Hammer size={18} className="text-teal" />
          <p className="text-sm font-headings font-bold text-ink truncate">
            {pro.business_name || 'ServiceMarket'}
          </p>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-ink-muted flex-shrink-0">
            <ShieldCheck size={11} /> {t('portal_secure')}
          </span>
        </div>
      </header>

      <main className="page-container py-6 max-w-3xl space-y-4">
        <div>
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">
            {job.job_number}
          </p>
          <h1 className="text-3xl font-headings font-bold text-ink mt-1">{job.title}</h1>
          {(job.site_address || job.site_city) && (
            <p className="text-sm text-ink-muted mt-1 inline-flex items-center gap-1">
              <MapPin size={12} /> {job.site_address} {job.site_postal_code} {job.site_city}
            </p>
          )}
        </div>

        {/* Who is doing the work. A customer asked to approve money should not
            have to guess who is asking. */}
        <section className="card-lg" data-testid="portal-pro">
          <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider mb-2">
            {t('portal_your_pro')}
          </p>
          <p className="font-headings font-bold text-ink">{pro.business_name || '—'}</p>
          <p className="text-sm text-ink-soft">
            {pro.business_address} {pro.business_postal_code} {pro.business_city}
          </p>
          {pro.vat_id && <p className="text-xs text-ink-muted mt-0.5">UID: {pro.vat_id}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {pro.email && (
              <a href={`mailto:${pro.email}`} className="btn-ghost text-xs">
                <Mail size={11} /> {pro.email}
              </a>
            )}
            {pro.phone && (
              <a href={`tel:${pro.phone}`} className="btn-ghost text-xs">
                <Phone size={11} /> {pro.phone}
              </a>
            )}
          </div>
        </section>

        <section className="card-lg" data-testid="portal-progress">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">
              {t('portal_progress')}
            </p>
            <p className="text-2xl font-headings font-bold text-ink">{progress.pct || 0}%</p>
          </div>
          <div className="h-2 bg-cream-deep rounded-full overflow-hidden mt-2">
            <div className="h-full bg-teal transition-all" style={{ width: `${progress.pct || 0}%` }} />
          </div>
          <p className="text-xs text-ink-muted mt-2">
            {progress.tasks_done || 0}/{progress.tasks_total || 0} {t('portal_steps_done')}
            {job.scheduled_start && ` · ${t('starts_on')} ${fmtDate(job.scheduled_start)}`}
          </p>
        </section>

        {(openQuotes.length > 0 || accepted) && (
          <section className="space-y-3" data-testid="portal-quotes">
            <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">
              {t('portal_your_quote')}
            </p>
            {accepted && <QuoteCard q={accepted} t={t} accepted />}
            {openQuotes.map((q) => (
              <QuoteCard
                key={q.id}
                q={q}
                t={t}
                busy={busy === `q${q.id}`}
                disabled={!!accepted}
                onAccept={() => act(
                  () => api.post(`/api/portal/${shareToken}/quotes/${q.id}/accept`),
                  `q${q.id}`)}
                onReject={() => act(
                  () => api.post(`/api/portal/${shareToken}/quotes/${q.id}/reject`, { reason: '' }),
                  `q${q.id}`)}
              />
            ))}
          </section>
        )}

        {pendingCos.length > 0 && (
          <section className="space-y-2" data-testid="portal-change-orders">
            <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">
              {t('portal_extras_pending')}
            </p>
            {pendingCos.map((c) => (
              <div key={c.id} className="card-lg border-amber/40 bg-amber/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{c.co_number} · {c.title}</p>
                    {c.description && (
                      <p className="text-sm text-ink-soft whitespace-pre-wrap mt-1">{c.description}</p>
                    )}
                  </div>
                  <p className="font-headings font-bold text-ink whitespace-nowrap text-right">
                    {fmtEur(c.net_amount)}
                    <span className="block text-[10px] font-normal text-ink-muted">{t('portal_net')}</span>
                  </p>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    className="btn-primary text-sm flex-1"
                    disabled={busy === `c${c.id}`}
                    onClick={() => act(
                      () => api.post(`/api/portal/${shareToken}/change-orders/${c.id}/approve`,
                                     { name: name.trim() || t('portal_customer') }),
                      `c${c.id}`)}
                    data-testid={`portal-co-approve-${c.id}`}
                  >
                    <Check size={14} /> {t('portal_approve')}
                  </button>
                  <button
                    className="btn-ghost text-sm"
                    disabled={busy === `c${c.id}`}
                    onClick={() => act(
                      () => api.post(`/api/portal/${shareToken}/change-orders/${c.id}/reject`,
                                     { name: name.trim() || t('portal_customer') }),
                      `c${c.id}`)}
                  >
                    <X size={14} /> {t('portal_decline')}
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {decidedCos.length > 0 && (
          <section className="card-lg" data-testid="portal-extras-decided">
            <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider mb-2">
              {t('portal_extras_decided')}
            </p>
            <ul className="space-y-1.5">
              {decidedCos.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink-soft truncate">{c.co_number} · {c.title}</span>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span className="text-ink">{fmtEur(c.net_amount)}</span>
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full ${
                      c.status === 'rejected'
                        ? 'bg-red-warn/15 text-red-text'
                        : 'bg-green-pos/15 text-green-text'}`}>
                      {t(`pm_co_status_${c.status}`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {invoices.length > 0 && (
          <section className="card-lg" data-testid="portal-invoices">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Receipt size={14} className="text-teal" />
              <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">
                {t('portal_invoices')}
              </p>
              {outstanding > 0 && (
                <span className="ml-auto text-xs text-amber-deep font-semibold">
                  {t('portal_outstanding')}: {fmtEur(outstanding)}
                </span>
              )}
            </div>
            <ul className="space-y-1.5">
              {invoices.map((i) => (
                <li key={i.invoice_number} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-mono text-xs text-ink-soft truncate">
                    {i.invoice_number}
                    <span className="ml-2 font-sans text-ink-muted">{fmtDate(i.issue_date)}</span>
                  </span>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span className="text-ink font-medium">{fmtEur(i.gross_total)}</span>
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full ${
                      i.payment_state === 'paid'
                        ? 'bg-green-pos/15 text-green-text'
                        : 'bg-amber/15 text-amber-deep'}`}>
                      {t(`myinv_status_${i.payment_state}`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {diary.length > 0 && (
          <section className="card-lg" data-testid="portal-diary">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen size={14} className="text-teal" />
              <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">
                {t('portal_diary')}
              </p>
            </div>
            <ul className="space-y-2.5">
              {diary.map((d, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-[11px] text-ink-muted whitespace-nowrap mt-0.5 w-20 flex-shrink-0">
                    {fmtDate(d.entry_date)}
                  </span>
                  <span className="text-sm text-ink">{d.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card-lg" data-testid="portal-abnahme">
          <div className="flex items-center gap-2 mb-2">
            <FileSignature size={14} className="text-teal" />
            <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">
              {t('portal_abnahme_title')}
            </p>
          </div>
          {job.abnahme_at ? (
            <p className="text-sm text-green-text inline-flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              {t('portal_abnahme_signed')} {fmtDate(job.abnahme_at)}
              {job.abnahme_signed_by && ` · ${job.abnahme_signed_by}`}
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-soft mb-3">{t('portal_abnahme_hint')}</p>
              <label htmlFor="portal-name" className="block text-xs font-medium text-ink-soft mb-1">
                {t('portal_your_name')}<span className="text-red-warn ml-0.5" aria-hidden="true">*</span>
              </label>
              <input
                id="portal-name"
                className="input w-full mb-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="portal-abnahme-name"
              />
              <label htmlFor="portal-note" className="block text-xs font-medium text-ink-soft mb-1">
                {t('portal_abnahme_note')}
              </label>
              <textarea
                id="portal-note"
                className="input w-full mb-3"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                className="btn-primary w-full"
                disabled={name.trim().length < 2 || busy === 'abnahme'}
                onClick={() => act(
                  () => api.post(`/api/portal/${shareToken}/abnahme`,
                                 { name: name.trim(), note: note.trim() || undefined }),
                  'abnahme')}
                data-testid="portal-abnahme-submit"
              >
                {busy === 'abnahme'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <><Check size={14} /> {t('portal_abnahme_confirm')}</>}
              </button>
            </>
          )}
        </section>

        {error && (
          <p className="text-sm text-red-warn text-center" data-testid="portal-error">{error}</p>
        )}
      </main>
    </div>
  );
}

/** One quote with its positions, so the customer sees what they are agreeing
    to rather than a single number at the bottom of a page. */
function QuoteCard({ q, t, accepted, disabled, busy, onAccept, onReject }) {
  const lines = (q.lines || []).filter((l) => l.is_selected || !l.is_optional);
  return (
    <div
      className={`card-lg ${accepted ? 'border-green-pos/40 bg-green-pos/5' : ''}`}
      data-testid={`portal-quote-${q.id}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="font-headings font-bold text-ink">
            {q.title || t('quote')}
            {q.tier && (
              <span className="ml-2 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-cream-deep text-ink-soft">
                {t(TIER_LABEL[q.tier] || 'tier_standard')}
              </span>
            )}
          </p>
          {q.quote_number && <p className="text-xs text-ink-muted font-mono">{q.quote_number}</p>}
        </div>
        <div className="text-right whitespace-nowrap">
          <p className="text-2xl font-headings font-bold text-ink">{fmtEur(q.gross_total)}</p>
          <p className="text-[10px] text-ink-muted">
            {t('portal_incl_vat')} · {fmtEur(q.net_total)} {t('portal_net')}
          </p>
        </div>
      </div>

      {q.intro && <p className="text-sm text-ink-soft mb-3">{q.intro}</p>}

      {lines.length > 0 && (
        <ul className="divide-y divide-sm-border border-y border-sm-border mb-3">
          {lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <span className="text-ink min-w-0">
                {l.description}
                <span className="block text-[11px] text-ink-muted">
                  {Number(l.qty)} {l.unit} × {fmtEur(l.unit_price)}
                </span>
              </span>
              <span className="text-ink whitespace-nowrap">{fmtEur(l.net_amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* The assumptions travel with the price. They are the difference
          between an estimate and a fixed-price trap when the substrate turns
          out to be rotten, and the customer is the one who needs to read
          them before saying yes. */}
      {q.assumptions && (
        <div className="bg-cream-soft rounded-[10px] p-3 mb-3">
          <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider mb-1">
            {t('assumptions')}
          </p>
          <p className="text-xs text-ink-soft whitespace-pre-wrap">{q.assumptions}</p>
        </div>
      )}

      {q.valid_until && (
        <p className="text-xs text-ink-muted mb-3 inline-flex items-center gap-1">
          <Clock size={11} /> {t('valid_until')} {fmtDate(q.valid_until)}
        </p>
      )}

      {accepted ? (
        <p className="text-sm text-green-text inline-flex items-center gap-1.5">
          <CheckCircle2 size={14} /> {t('portal_quote_accepted')}
        </p>
      ) : (
        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            disabled={disabled || busy}
            onClick={onAccept}
            data-testid={`portal-accept-${q.id}`}
          >
            {busy ? <Loader2 size={14} className="animate-spin" />
                  : <><Check size={14} /> {t('portal_accept_quote')}</>}
          </button>
          <button className="btn-ghost" disabled={disabled || busy} onClick={onReject}>
            <X size={14} /> {t('portal_decline')}
          </button>
        </div>
      )}
    </div>
  );
}
