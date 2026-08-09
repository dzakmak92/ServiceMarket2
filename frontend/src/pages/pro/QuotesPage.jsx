import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import NumberField from '../../components/NumberField';
import { useLang } from '../../contexts/LangContext';
import { fmtEur } from '../../utils/money';
import { fmtDate } from '../../utils/money';
import ConvertSheet from '../../components/pro/ConvertSheet';
import {
  Loader2, Plus, X, Send, Check, Ban, FileText, AlertCircle, Trash2, Copy,
  Calculator, ArrowRight, Layers, Hammer,
} from 'lucide-react';


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
  // Which quote is being turned into work. Null when the sheet is closed.
  const [converting, setConverting] = useState(null);
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
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [tier, setTier] = useState('standard');
  const [loadingTpl, setLoadingTpl] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const [{ data: q }, { data: j }, { data: tpl }] = await Promise.all([
        api.get('/api/quotes', { params }),
        api.get('/api/jobs', { params: { limit: 100 } }).catch(() => ({ data: { jobs: [] } })),
        api.get('/api/templates').catch(() => ({ data: { templates: [] } })),
      ]);
      setQuotes(q.quotes || []);
      setJobs(j.jobs || []);
      setTemplates(tpl.templates || []);
    } catch (e) {
      setError(e?.response?.data?.detail || t('quotes_err_load'));
    } finally {
      setLoading(false);
    }
    // `t` is read in the catch above. Leaving it out kept the closure built at
    // mount, so an error raised after a language switch was announced in the
    // old language.
  }, [statusFilter, t]);

  useEffect(() => { load(); }, [load]);

  // Preview into the form rather than calling /apply directly: the pro sees
  // and edits every line before anything is created. A template is a starting
  // point, not a finished offer — the substrate is always different.
  const applyTemplate = async (id, forTier) => {
    setTemplateId(id);
    if (!id) return;
    setLoadingTpl(true);
    setError('');
    try {
      const { data } = await api.get(`/api/templates/${id}/preview`, { params: { tier: forTier } });
      if ((data.lines || []).length) setLines(data.lines);
      const tpl = templates.find((x) => x.id === id);
      if (tpl) {
        if (!title) setTitle(tpl.name);
        if (tpl.assumptions) setAssumptions(tpl.assumptions);
      }
    } catch (e) {
      setError(e?.response?.data?.detail || t('quotes_err_template'));
    } finally {
      setLoadingTpl(false);
    }
  };

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
        tier,
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
      setTemplateId(''); setTier('standard');
      await load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || t('quotes_err_create'));
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
          {/* The members of the quote_status enum. `converted` is not one —
              filtering by it returned nothing — and `negotiating` and
              `superseded` are real states the picker could not select. */}
          {['draft', 'sent', 'viewed', 'negotiating', 'accepted', 'rejected', 'expired', 'superseded']
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

            {/* The way in for someone who does not yet know what to charge.
                Offered beside the template picker rather than buried in the
                nav, because this is the moment the question comes up. */}
            <Link to={`/estimate${jobId ? `?job=${jobId}` : ''}`}
                  className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink"
                  data-testid="quote-to-estimate">
              <Calculator size={13} />
              {t('quote_via_estimate')
                || 'Positionen aus der Schnellkalkulation berechnen lassen'}
            </Link>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select className="input" value={templateId}
                      onChange={(e) => applyTemplate(e.target.value, tier)}
                      data-testid="quote-template">
                <option value="">{t('no_template') || 'Ohne Vorlage'}</option>
                {templates.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.name}{tp.trade ? ` · ${tp.trade}` : ''}
                  </option>
                ))}
              </select>
              <select className="input" value={tier}
                      onChange={(e) => { setTier(e.target.value); if (templateId) applyTemplate(templateId, e.target.value); }}
                      data-testid="quote-tier">
                <option value="basic">{t('tier_basic') || 'Basis'}</option>
                <option value="standard">{t('tier_standard') || 'Standard'}</option>
                <option value="premium">{t('tier_premium') || 'Premium'}</option>
              </select>
            </div>
            {loadingTpl && (
              <p className="text-xs text-ink-muted flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />{t('loading_template') || 'Vorlage wird geladen…'}
              </p>
            )}
            {templateId && !loadingTpl && (
              <p className="text-xs text-ink-muted">
                {t('template_editable_note')
                  || 'Positionen aus der Vorlage — alles frei änderbar. Preise stammen aus Ihren eigenen Sätzen, sofern vorhanden.'}
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
                    {/* NumberField, not type=number: Chromium refuses the comma
                        and hands back the digits either side, so "2,5" arrived
                        as 25 — ten times the quantity, saved without a word. */}
                    <NumberField className="input text-sm" placeholder={t('qty') || 'Menge'}
                                 min={0}
                                 value={l.qty} onChange={(v) => setLine(i, 'qty', v ?? '')} />
                    <input className="input text-sm" placeholder={t('unit') || 'Einheit'}
                           value={l.unit} onChange={(e) => setLine(i, 'unit', e.target.value)} />
                    <NumberField className="input text-sm" placeholder={t('unit_price') || '€/Einheit'}
                                 min={0}
                                 value={l.unit_price}
                                 onChange={(v) => setLine(i, 'unit_price', v ?? '')} />
                    {/* Verschnitt: 0.10 = 10% extra material ordered. */}
                    <NumberField className="input text-sm" min={0} max={1}
                                 title={t('waste_factor') || 'Verschnitt (0.10 = 10%)'}
                                 placeholder={t('waste_short') || 'Verschnitt'}
                                 value={l.waste_factor}
                                 onChange={(v) => setLine(i, 'waste_factor', v ?? '')} />
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
          <div className="space-y-2.5" data-testid="quote-list">
            {quotes.map((q) => {
              /* The one action that matters on a quote the customer has seen
                 is what happens next. It leads, at full width and full size;
                 everything else is secondary and sits on one row beneath it.
                 A quote already converted says so instead of offering the
                 button again. */
              const answerable = ['sent', 'viewed', 'negotiating'].includes(q.status);
              const convertible = answerable || q.status === 'accepted';
              return (
              <div key={q.id} className="rounded-2xl border border-sm-border bg-paper p-3.5"
                   data-testid="quote-row">
                <div className="flex items-start justify-between gap-3">
                  {/* The whole row is the way in — opening a quote to read it,
                      change it, revise it or print it was not possible from
                      anywhere before this link existed. */}
                  {/* min-h-[44px]: this link is the way into the quote and it
                      measured 42 px, sized by its own two lines of text. Two
                      pixels under is still under. */}
                  <Link to={`/quotes/${q.id}`}
                        className="min-w-0 flex-1 group min-h-[44px] flex flex-col justify-center"
                        data-testid="quote-open">
                    <div className="font-headings font-bold text-[16px] text-ink leading-tight
                                    truncate group-hover:text-teal">
                      {q.title || q.job_title || (t('quote') || 'Angebot')}
                    </div>
                    <div className="text-[13px] text-ink-muted truncate mt-0.5">
                      {[q.quote_number, q.customer_name, q.job_number].filter(Boolean).join(' · ')}
                    </div>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="font-headings font-bold text-[17px] text-ink tabular-nums">
                      {fmtEur(q.gross_total)}
                    </div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[12px] font-semibold ${STATUS_STYLE[q.status] || 'bg-cream-dark text-ink-muted'}`}>
                      {t(`quote_status_${q.status}`) || q.status}
                    </span>
                  </div>
                </div>

                {q.valid_until && ['sent', 'viewed', 'draft'].includes(q.status) && (
                  <p className="text-[13px] text-ink-muted mt-1.5">
                    {t('valid_until') || 'Gültig bis'}: {fmtDate(q.valid_until)}
                  </p>
                )}

                {convertible && (
                  <button type="button" onClick={() => setConverting(q)}
                          data-testid="quote-convert"
                          className="w-full min-h-[50px] mt-3 rounded-xl bg-amber text-on-amber
                                     font-bold text-[15px] flex items-center justify-center gap-2">
                    {answerable ? <Check size={17} /> : <ArrowRight size={17} />}
                    {answerable ? t('conv_cta_accept') : t('conv_cta_plain')}
                  </button>
                )}

                <div className="flex flex-wrap gap-2 mt-2.5">
                  {q.status === 'draft' && (
                    <button className="min-h-[44px] px-3.5 rounded-xl border border-sm-border
                                       bg-paper text-[14px] font-semibold flex items-center gap-1.5"
                            disabled={busyId === q.id} onClick={() => act(q.id, 'send')}
                            data-testid="quote-send">
                      <Send size={15} />{t('send') || 'Senden'}
                    </button>
                  )}
                  {answerable && (
                    <button className="min-h-[44px] px-3.5 rounded-xl border border-sm-border
                                       bg-paper text-[14px] font-semibold flex items-center gap-1.5"
                            disabled={busyId === q.id}
                            onClick={() => act(q.id, 'reject', { reason: '' })}
                            data-testid="quote-reject">
                      <Ban size={15} />{t('mark_rejected') || 'Abgelehnt'}
                    </button>
                  )}
                  {q.share_token && (
                    <button className="min-h-[44px] px-3.5 rounded-xl border border-sm-border
                                       bg-paper text-[14px] font-semibold flex items-center gap-1.5"
                            onClick={() => navigator.clipboard?.writeText(
                              `${window.location.origin}/p/${q.share_token}`)}>
                      <Copy size={15} />{t('copy_link') || 'Link kopieren'}
                    </button>
                  )}
                  {busyId === q.id && <Loader2 size={16} className="animate-spin text-teal self-center" />}
                </div>
              </div>
            );})}
          </div>
        )}
      </div>

      {converting && (
        <ConvertSheet
          quote={converting}
          onClose={() => setConverting(null)}
          onDone={() => { setConverting(null); load(); }}
        />
      )}
    </div>
  );
}
