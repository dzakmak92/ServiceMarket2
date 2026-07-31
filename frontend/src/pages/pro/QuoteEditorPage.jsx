import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  ArrowLeft, Loader2, Plus, Trash2, Save, FileDown, Send, Check, Ban,
  AlertCircle, GitBranch, Copy,
} from 'lucide-react';

const fmtEur = (v) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));

const BLANK_LINE = {
  kind: 'labor', description: '', qty: 1, unit: 'pcs',
  unit_price: 0, waste_factor: 0, discount_pct: 0, is_optional: false, is_selected: true,
};

// Which statuses `replace_lines` will accept, mirrored from the repository.
// Anything else has to go through a revision, because a document the customer
// has already decided on must not change under them.
const EDITABLE = ['draft', 'sent', 'viewed', 'negotiating'];

/**
 * One quote, editable.
 *
 * The quote engine — line editing, versioned revisions, the branded PDF —
 * has been complete in the backend since Phase 3 and none of it was reachable.
 * The list page could create a quote and send it, and after that the document
 * was frozen from the pro's side: a customer who rang up asking for a
 * different tap could not be answered without starting over, and nobody could
 * see the Angebot the customer was looking at.
 *
 * Two ways to change a quote, and the difference is the point:
 *
 *   · **Save** replaces the lines in place. Fine while the quote is still a
 *     conversation (draft, sent, viewed, negotiating).
 *   · **Revise** creates version N+1 and supersedes N. Both stay, so "which
 *     version did they agree to" always has an answer.
 *
 * An accepted quote allows neither — that is a Nachtrag, on the job.
 */
export default function QuoteEditorPage() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();

  const [quote, setQuote] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get(`/api/quotes/${quoteId}`);
      setQuote(data);
      setLines((data.lines || []).map((l) => ({
        ...l,
        qty: Number(l.qty ?? 1),
        unit_price: Number(l.unit_price ?? 0),
        waste_factor: Number(l.waste_factor ?? 0),
        discount_pct: Number(l.discount_pct ?? 0),
      })));
      setDirty(false);
    } catch (e) {
      setError(e?.response?.data?.detail || t('generic_error'));
    } finally {
      setLoading(false);
    }
  }, [quoteId, t]);

  useEffect(() => { load(); }, [load]);

  const setLine = (i, k, v) => {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
    setDirty(true);
  };

  // Preview only, and net only. VAT depends on the customer — Kleinunternehmer,
  // §13b reverse charge, cross-border — and the client has no business
  // guessing at that, so the server's figures are shown once it has recomputed.
  const previewNet = useMemo(
    () => lines.reduce((sum, l) => {
      if (l.is_optional && !l.is_selected) return sum;
      const qty = Number(l.qty || 0) * (1 + Number(l.waste_factor || 0));
      return sum + qty * Number(l.unit_price || 0) * (1 - Number(l.discount_pct || 0) / 100);
    }, 0),
    [lines],
  );

  const payload = () => lines
    .filter((l) => (l.description || '').trim())
    .map((l, i) => ({
      position: i + 1,
      kind: l.kind || 'labor',
      description: l.description.trim(),
      detail: l.detail || undefined,
      qty: Number(l.qty) || 0,
      unit: l.unit || 'pcs',
      unit_price: Number(l.unit_price) || 0,
      waste_factor: Number(l.waste_factor) || 0,
      discount_pct: Number(l.discount_pct) || 0,
      is_optional: !!l.is_optional,
      is_selected: l.is_optional ? !!l.is_selected : true,
      // Carried through untouched. It is the join back to the business's own
      // rates, so dropping it on an edit would mean accepting the quote taught
      // the estimator nothing — silently, and only for quotes that were edited.
      rate_key: l.rate_key || undefined,
    }));

  const run = async (what, fn) => {
    setBusy(what); setError('');
    try { await fn(); } catch (e) {
      setError(e?.response?.data?.detail || t('generic_error'));
    } finally { setBusy(''); }
  };

  const save = () => run('save', async () => {
    const { data } = await api.put(`/api/quotes/${quoteId}/lines`, { lines: payload() });
    setQuote(data); setDirty(false);
  });

  // The new version has a new id, so this navigates rather than reloading —
  // staying put would leave the pro editing the superseded document.
  const revise = () => run('revise', async () => {
    const { data } = await api.post(`/api/quotes/${quoteId}/revise`, { lines: payload() });
    navigate(`/quotes/${data.id}`, { replace: true });
  });

  const act = (path, body) => run(path, async () => {
    const { data } = await api.post(`/api/quotes/${quoteId}/${path}`, body || {});
    if (path === 'send' && data?.share_token) {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/p/${data.share_token}`);
      } catch { /* clipboard is a convenience, not the operation */ }
    }
    await load();
  });

  const openPdf = () => run('pdf', async () => {
    const r = await api.get(`/api/quotes/${quoteId}/pdf`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
    // A new tab rather than a download: the pro checks it on the phone before
    // it goes out, and a forced download makes that two taps and a file
    // manager. Revoked late so the tab has had time to fetch it.
    window.open(url, '_blank', 'noopener');
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={26} className="text-teal animate-spin" />
      </div>
    );
  }
  if (!quote) {
    return (
      <div className="min-h-screen bg-cream p-6">
        <div className="card-lg text-center" data-testid="quote-editor-missing">
          <AlertCircle size={26} className="text-red-warn mx-auto mb-2" />
          <p className="text-ink">{error || t('quote_not_found')}</p>
          <Link to="/quotes" className="btn-secondary mt-4 inline-flex">
            <ArrowLeft size={14} /> {t('quotes')}
          </Link>
        </div>
      </div>
    );
  }

  const editable = EDITABLE.includes(quote.status);
  const revisable = quote.status !== 'accepted' && quote.status !== 'superseded';

  return (
    <div className="min-h-screen bg-cream pb-28">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Link to="/quotes" className="text-sm text-ink-muted hover:text-ink inline-flex items-center gap-1 mb-3">
          <ArrowLeft size={14} /> {t('quotes')}
        </Link>

        <div className="card-lg mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-headings font-bold text-ink text-xl truncate">
                {quote.title || quote.job_title || t('quote')}
              </h1>
              <p className="text-sm text-ink-muted truncate">
                {[quote.quote_number, quote.customer_name,
                  quote.version > 1 ? `v${quote.version}` : null]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="font-headings font-bold text-ink text-lg">
                {fmtEur(quote.gross_total)}
              </div>
              <div className="text-xs text-ink-muted">
                {t('net')} {fmtEur(quote.net_total)}
              </div>
            </div>
          </div>

          {!editable && (
            <p className="text-xs text-ink-muted mt-3 flex items-start gap-1.5"
               data-testid="quote-frozen-note">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {quote.status === 'accepted' ? t('quote_accepted_note') : t('quote_frozen_note')}
            </p>
          )}
        </div>

        {error && (
          <div className="card mb-3 flex items-start gap-2 text-sm text-red-warn"
               data-testid="quote-editor-error">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        <div className="space-y-2" data-testid="quote-editor-lines">
          {lines.map((l, i) => (
            <div key={l.id || i} className="card space-y-2" data-testid="quote-editor-line">
              <div className="flex gap-2">
                <select className="input w-28 text-sm" value={l.kind} disabled={!editable}
                        onChange={(e) => setLine(i, 'kind', e.target.value)}>
                  <option value="labor">{t('labor')}</option>
                  <option value="material">{t('material')}</option>
                  <option value="travel">{t('travel')}</option>
                  <option value="other">{t('other')}</option>
                </select>
                <input className="input flex-1 text-sm" placeholder={t('description')}
                       value={l.description || ''} disabled={!editable}
                       onChange={(e) => setLine(i, 'description', e.target.value)} />
                {editable && lines.length > 1 && (
                  <button type="button" className="p-2 text-ink-muted hover:text-red-warn"
                          aria-label={t('remove')}
                          onClick={() => { setLines((ls) => ls.filter((_, x) => x !== i)); setDirty(true); }}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              {/* Labelled, not placeholdered. On the create form these fields
                  start empty so the placeholder reads as a label; here they
                  arrive full, the placeholder never shows, and the row would
                  be four unexplained numbers — 24, m2, 8.63, 0. */}
              <div className="grid grid-cols-4 gap-2">
                <label className="block">
                  <span className="block text-[11px] text-ink-muted mb-0.5">{t('qty')}</span>
                  <input className="input text-sm w-full" type="number" step="any"
                         value={l.qty} disabled={!editable}
                         onChange={(e) => setLine(i, 'qty', e.target.value)} />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-ink-muted mb-0.5">{t('unit')}</span>
                  <input className="input text-sm w-full" value={l.unit || ''} disabled={!editable}
                         onChange={(e) => setLine(i, 'unit', e.target.value)} />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-ink-muted mb-0.5">{t('unit_price')}</span>
                  <input className="input text-sm w-full" type="number" step="any"
                         value={l.unit_price} disabled={!editable}
                         onChange={(e) => setLine(i, 'unit_price', e.target.value)} />
                </label>
                {/* Verschnitt: 0.10 = 10% extra material ordered. */}
                <label className="block">
                  <span className="block text-[11px] text-ink-muted mb-0.5">{t('waste_short')}</span>
                  <input className="input text-sm w-full" type="number" step="0.01" min="0" max="1"
                         title={t('waste_factor')} value={l.waste_factor} disabled={!editable}
                         onChange={(e) => setLine(i, 'waste_factor', e.target.value)} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                <input type="checkbox" checked={!!l.is_optional} disabled={!editable}
                       onChange={(e) => setLine(i, 'is_optional', e.target.checked)} />
                {t('quote_line_optional')}
              </label>
            </div>
          ))}

          {editable && (
            <button type="button" className="btn-secondary w-full text-sm"
                    onClick={() => { setLines((ls) => [...ls, { ...BLANK_LINE }]); setDirty(true); }}
                    data-testid="quote-editor-add-line">
              <Plus size={14} className="inline mr-1" />{t('add_line')}
            </button>
          )}
        </div>

        <div className="card mt-4 flex items-center justify-between">
          <span className="text-sm text-ink-muted">{t('net_preview')}</span>
          <span className="font-headings font-bold text-ink" data-testid="quote-editor-net">
            {fmtEur(dirty ? previewNet : quote.net_total)}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {editable && (
            <button type="button" className="btn-primary text-sm flex items-center gap-1"
                    disabled={!!busy || !dirty} onClick={save} data-testid="quote-editor-save">
              {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t('save')}
            </button>
          )}
          {revisable && (
            <button type="button" className="btn-secondary text-sm flex items-center gap-1"
                    disabled={!!busy} onClick={revise} data-testid="quote-editor-revise">
              {busy === 'revise' ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
              {t('quote_revise')}
            </button>
          )}
          <button type="button" className="btn-secondary text-sm flex items-center gap-1"
                  disabled={!!busy} onClick={openPdf} data-testid="quote-editor-pdf">
            {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {t('quote_pdf')}
          </button>
          {quote.status === 'draft' && (
            <button type="button" className="btn-secondary text-sm flex items-center gap-1"
                    disabled={!!busy} onClick={() => act('send')} data-testid="quote-editor-send">
              <Send size={14} />{t('send')}
            </button>
          )}
          {['sent', 'viewed', 'negotiating'].includes(quote.status) && (
            <>
              <button type="button" className="btn-secondary text-sm flex items-center gap-1"
                      disabled={!!busy} onClick={() => act('accept')} data-testid="quote-editor-accept">
                <Check size={14} />{t('mark_accepted')}
              </button>
              <button type="button" className="btn-secondary text-sm flex items-center gap-1"
                      disabled={!!busy} onClick={() => act('reject', { reason: '' })}
                      data-testid="quote-editor-reject">
                <Ban size={14} />{t('mark_rejected')}
              </button>
            </>
          )}
          {quote.share_token && (
            <button type="button" className="btn-secondary text-sm flex items-center gap-1"
                    onClick={() => navigator.clipboard?.writeText(
                      `${window.location.origin}/p/${quote.share_token}`)}>
              <Copy size={14} />{t('copy_link')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
