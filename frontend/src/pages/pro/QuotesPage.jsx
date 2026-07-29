import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  Loader2, Plus, X, Send, Check, Ban, FileText, AlertCircle, Trash2, Copy,
} from 'lucide-react';

const fmtEur = (v) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' })
    .format(Number(v || 0));

const STATUS_STYLE = {
  draft:      'bg-cream-dark text-ink-muted',
  sent:       'bg-teal/10 text-teal',
  viewed:     'bg-teal/20 text-teal',
  accepted:   'bg-green-pos/10 text-green-pos',
  rejected:   'bg-red-warn/10 text-red-warn',
  expired:    'bg-amber/10 text-amber',
  converted:  'bg-green-pos/20 text-green-pos',
  negotiating:'bg-amber/10 text-amber',
};

const BLANK_LINE = {
  kind: 'labor', description: '', qty: 1, unit: 'pcs',
  unit_price: 0, waste_factor: 0, discount_pct: 0,
};

/**
 * Quotes — the customer-facing document the whole product exists to produce.
 *
 * The engine (tiering, revisions, send/accept/reject, expiry, portal
 * acceptance) has been complete in the backend since Phase 3; this is the
 * first screen for it. Totals are computed locally purely as a preview — the
 * server recalculates on save, because VAT treatment depends on the customer
 * (Kleinunternehmer, §13b reverse charge, cross-border) and the client has no
 * business guessing at that.
 */
export default function QuotesPage() {
  const { t } = useLang();
  const [quotes, setQuotes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [jobId, setJobId] = useState('');
  const [title, setTitle] = useState('');
  const [assumptions, setAssumptions] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [lines, setLines] = useState([{ ...BLANK_LINE }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const [{ data: q }, { data: j }] = await Promise.all([
        api.get('/api/quotes', { params }),
        api.get('/api/jobs', { params: { limit: 100 } }).catch(() => ({ data: { jobs: [] } })),
      ]);
      setQuotes(q.quotes || []);
      setJobs(j.jobs || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load quotes');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const setLine = (i, k, v) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  // Preview only. Net of waste and line discount; VAT is deliberately absent
  // because only the server knows the treatment for this customer.
  const previewNet = useMemo(
    () => lines.reduce((sum, l) => {
      const qty = Number(l.qty || 0) * (1 + Number(l.waste_factor || 0));
      const gross = qty * Number(l.unit_price || 0);
      return sum + gross * (1 - Number(l.discount_pct || 0) / 100);
    }, 0),
    [lines]
  );

  const submit = async (e) => {
    e.preventDefault();
    const usable = lines.filter((l) => l.description.trim());
    if (!jobId || usable.length === 0) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/api/quotes', {
        job_id: jobId,
        title: title || undefined,
        assumptions: assumptions || undefined,
        valid_until: validUntil || undefined,
        lines: usable.map((l, i) => ({
          ...l,
          position: i + 1,
          qty: Number(l.qty) || 0,
          unit_price: Number(l.unit_price) || 0,
          waste_factor: Number(l.waste_factor) || 0,
          discount_pct: Number(l.discount_pct) || 0,
        })),
      });
      setShowForm(false);
      setJobId(''); setTitle(''); setAssumptions(''); setValidUntil('');
      setLines([{ ...BLANK_LINE }]);
      await load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not create the quote');
    } finally {
      setSaving(false);
    }
  };

  const act = async (id, path, body) => {
    setBusyId(id);
    setError('');
    try {
      const { data } = await api.post(`/api/quotes/${id}/${path}`, body || {});
      // Sending returns the job's share token — the link the customer opens.
      if (path === 'send' && data?.share_token) {
        const url = `${window.location.origin}/p/${data.share_token}`;
        try { await navigator.clipboard.writeText(url); } catch { /* not fatal */ }
      }
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || `Could not ${path} the quote`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="font-headings font-bold text-ink text-2xl">
              {t('quotes') || 'Angebote'}
            </h1>
            <p className="text-sm text-ink-muted">{quotes.length} {t('quotes') || 'Angebote'}</p>
          </div>
          <button type="button" onClick={() => setShowForm((s) => !s)}
                  className="btn-primary flex items-center gap-2" data-testid="quote-new-btn">
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? (t('cancel') || 'Abbrechen') : (t('new_quote') || 'Neues Angebot')}
          </button>
        </div>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="input w-full mb-4" data-testid="quote-status-filter">
          <option value="">{t('all_statuses') || 'Alle Status'}</option>
          {['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted']
            .map((s) => <option key={s} value={s}>{t(`quote_status_${s}`) || s}</option>)}
        </select>

        {error && (
          <div className="card mb-3 flex items-start gap-2 text-sm text-red-warn" data-testid="quote-error">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        {showForm && (
          <form onSubmit={submit} className="card-lg mb-4 space-y-3" data-testid="quote-form">
            <select className="input w-full" required value={jobId}
                    onChange={(e) => setJobId(e.target.value)} data-testid="quote-job">
              <option value="">{t('select_job') || 'Auftrag wählen…'} *</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_number ? `${j.job_number} · ` : ''}{j.title}
                  {j.customer_name ? ` — ${j.customer_name}` : ''}
                </option>
              ))}
            </select>
            {jobs.length === 0 && (
              <p className="text-xs text-ink-muted">
                {t('no_jobs_for_quote') || 'Sie brauchen zuerst einen Auftrag.'}
              </p>
            )}

            <input className="input w-full" placeholder={t('quote_title') || 'Titel'}
                   value={title} onChange={(e) => setTitle(e.target.value)} />

            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="rounded-lg border border-cream-dark p-2 space-y-2">
                  <div className="flex gap-2">
                    <select className="input w-28 text-sm" value={l.kind}
                            onChange={(e) => setLine(i, 'kind', e.target.value)}>
                      <option value="labor">{t('labor') || 'Arbeit'}</option>
                      <option value="material">{t('material') || 'Material'}</option>
                      <option value="travel">{t('travel') || 'Anfahrt'}</option>
                      <option value="other">{t('other') || 'Sonstiges'}</option>
                    </select>
                    <input className="input flex-1 text-sm" placeholder={t('description') || 'Beschreibung'}
                           value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} />
                    {lines.length > 1 && (
                      <button type="button" className="p-2 text-ink-muted hover:text-red-warn"
                              onClick={() => setLines((ls) => ls.filter((_, x) => x !== i))}
                              aria-label={t('remove') || 'Entfernen'}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <input className="input text-sm" type="number" step="any" placeholder={t('qty') || 'Menge'}
                           value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
                    <input className="input text-sm" placeholder={t('unit') || 'Einheit'}
                           value={l.unit} onChange={(e) => setLine(i, 'unit', e.target.value)} />
                    <input className="input text-sm" type="number" step="any" placeholder={t('unit_price') || '€/Einheit'}
                           value={l.unit_price} onChange={(e) => setLine(i, 'unit_price', e.target.value)} />
                    {/* Verschnitt: 0.10 = 10% extra material ordered. */}
                    <input className="input text-sm" type="number" step="0.01" min="0" max="1"
                           title={t('waste_factor') || 'Verschnitt (0.10 = 10%)'}
                           placeholder={t('waste_short') || 'Verschnitt'}
                           value={l.waste_factor} onChange={(e) => setLine(i, 'waste_factor', e.target.value)} />
                  </div>
                </div>
              ))}
              <button type="button" className="btn-secondary w-full text-sm"
                      onClick={() => setLines((ls) => [...ls, { ...BLANK_LINE }])}
                      data-testid="quote-add-line">
                <Plus size={14} className="inline mr-1" />{t('add_line') || 'Position hinzufügen'}
              </button>
            </div>

            {/* The caveat block that stops an optimistic estimate becoming a
                fixed-price trap when the substrate turns out to be rotten. */}
            <textarea className="input w-full" rows={2} value={assumptions}
                      onChange={(e) => setAssumptions(e.target.value)}
                      placeholder={t('assumptions') || 'Annahmen und Vorbehalte'} />

            <div className="flex items-center gap-3">
              <input className="input flex-1" type="date" value={validUntil}
                     onChange={(e) => setValidUntil(e.target.value)}
                     title={t('valid_until') || 'Gültig bis'} />
              <div className="text-right">
                <div className="text-xs text-ink-muted">{t('net_preview') || 'Netto (Vorschau)'}</div>
                <div className="font-headings font-bold text-ink">{fmtEur(previewNet)}</div>
              </div>
            </div>

            <button type="submit" className="btn-primary w-full"
                    disabled={saving || !jobId || !lines.some((l) => l.description.trim())}
                    data-testid="quote-save">
              {saving ? <Loader2 size={16} className="animate-spin mx-auto" />
                      : (t('create_quote') || 'Angebot erstellen')}
            </button>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={26} className="text-teal animate-spin" />
          </div>
        ) : quotes.length === 0 ? (
          <div className="card-lg text-center py-10" data-testid="quote-empty">
            <FileText size={30} className="text-ink-muted mx-auto mb-2" />
            <p className="font-headings font-bold text-ink">{t('no_quotes_yet') || 'Noch keine Angebote'}</p>
            <p className="text-sm text-ink-muted mt-1">
              {t('create_first_quote') || 'Erstellen Sie Ihr erstes Angebot.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="quote-list">
            {quotes.map((q) => (
              <div key={q.id} className="card" data-testid="quote-row">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-headings font-bold text-ink truncate">
                      {q.title || q.job_title || (t('quote') || 'Angebot')}
                    </div>
                    <div className="text-sm text-ink-muted truncate">
                      {[q.quote_number, q.customer_name, q.job_number].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-headings font-bold text-ink">{fmtEur(q.gross_total)}</div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] ${STATUS_STYLE[q.status] || 'bg-cream-dark text-ink-muted'}`}>
                      {t(`quote_status_${q.status}`) || q.status}
                    </span>
                  </div>
                </div>

                {q.valid_until && ['sent', 'viewed', 'draft'].includes(q.status) && (
                  <p className="text-xs text-ink-muted mt-1">
                    {t('valid_until') || 'Gültig bis'}: {new Date(q.valid_until).toLocaleDateString('de-AT')}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mt-3">
                  {q.status === 'draft' && (
                    <button className="btn-secondary text-sm flex items-center gap-1"
                            disabled={busyId === q.id} onClick={() => act(q.id, 'send')}
                            data-testid="quote-send">
                      <Send size={14} />{t('send') || 'Senden'}
                    </button>
                  )}
                  {['sent', 'viewed'].includes(q.status) && (
                    <>
                      <button className="btn-secondary text-sm flex items-center gap-1"
                              disabled={busyId === q.id} onClick={() => act(q.id, 'accept')}
                              data-testid="quote-accept">
                        <Check size={14} />{t('mark_accepted') || 'Angenommen'}
                      </button>
                      <button className="btn-secondary text-sm flex items-center gap-1"
                              disabled={busyId === q.id}
                              onClick={() => act(q.id, 'reject', { reason: '' })}
                              data-testid="quote-reject">
                        <Ban size={14} />{t('mark_rejected') || 'Abgelehnt'}
                      </button>
                    </>
                  )}
                  {q.share_token && (
                    <button className="btn-secondary text-sm flex items-center gap-1"
                            onClick={() => navigator.clipboard?.writeText(
                              `${window.location.origin}/p/${q.share_token}`)}>
                      <Copy size={14} />{t('copy_link') || 'Link kopieren'}
                    </button>
                  )}
                  {busyId === q.id && <Loader2 size={16} className="animate-spin text-teal self-center" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
