import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/client';
import NumberField from '../../components/NumberField';
import { useLang } from '../../contexts/LangContext';
import { fmtEur, fmtEur0, fmtNum, fmtDate } from '../../utils/money';
import ConvertSheet from '../../components/pro/ConvertSheet';
import {
  ArrowLeft, Loader2, Plus, Trash2, Save, FileDown, Check, Ban,
  AlertCircle, CalendarPlus, Pencil,
} from 'lucide-react';


const BLANK_LINE = {
  kind: 'labor', description: '', qty: 1, unit: 'pcs',
  unit_price: 0, waste_factor: 0, discount_pct: 0, is_optional: false, is_selected: true,
};

// Which statuses `replace_lines` will accept, mirrored from the repository.
// Anything else has to go through a revision, because a document the customer
// has already decided on must not change under them.
const EDITABLE = ['draft', 'sent', 'viewed', 'negotiating'];

/* The document's own order. Labour first because it is what the customer
   argues about, then what it is made of, then getting there, then the rest —
   the order a written Angebot has used since before any of this was software.
   A line's kind is now chosen by which section it is added to, so this list is
   also the set of sections that can exist. */
const KINDS = ['labor', 'material', 'travel', 'other'];

/* The one button shape this screen uses below the document. Written once
   because there are seven of them and they must not drift apart. */
const CHIP = 'min-h-[38px] px-3 rounded-[10px] border text-[13px] font-semibold '
  + 'inline-flex items-center gap-1.5 disabled:opacity-50';
const CHIP_PLAIN = 'border-sm-border bg-paper text-ink';

/** What one line contributes. Deselected optional extras contribute nothing —
 *  they are on the document as an offer, not as part of the price. */
const lineNet = (l) => (l.is_optional && !l.is_selected ? 0
  : Number(l.qty || 0) * (1 + Number(l.waste_factor || 0)) * Number(l.unit_price || 0)
    * (1 - Number(l.discount_pct || 0) / 100));

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
 * **Save** replaces the lines in place, and is the only way this screen
 * changes a quote. It is allowed while the quote is still a conversation —
 * draft, sent, viewed, negotiating — and refused once the customer has
 * decided, because a document somebody has agreed to must not move under
 * them. Changing an accepted quote is a Nachtrag, on the job.
 *
 * The backend also has `revise`, which creates version N+1 and supersedes N so
 * both remain and "which version did they agree to" always has an answer. It
 * had a button here and no longer does; the endpoint and the versioning are
 * intact but nothing in the app reaches them.
 */
export default function QuoteEditorPage() {
  const { quoteId } = useParams();
  const { t } = useLang();

  const [quote, setQuote] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  // Turning the quote into work. This used to live on the quotes list as a
  // full-width amber bar on every row; the row is a summary now, so the sheet
  // opens from here — the page you are on when you decide the work is real.
  const [converting, setConverting] = useState(false);
  // Index of the one line whose fields are open. One at a time on purpose:
  // every line open at once is what made this screen a wall of inputs.
  const [editing, setEditing] = useState(null);

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

  // A new line lands in the section it was added from, and opens straight
  // away — it has no description yet, so there is nothing to read and every
  // reason to be typing.
  const addLine = (kind) => {
    setLines((ls) => {
      setEditing(ls.length);
      return [...ls, { ...BLANK_LINE, kind }];
    });
    setDirty(true);
  };

  // Preview only, and net only. VAT depends on the customer — Kleinunternehmer,
  // §13b reverse charge, cross-border — and the client has no business
  // guessing at that, so the server's figures are shown once it has recomputed.
  const previewNet = useMemo(
    () => {
      const net = lines.reduce((sum, l) => sum + lineNet(l), 0);
      /* The document discount belongs here too. Without it this screen showed
         the pro € 2.000,00 on a quote the customer would receive for
         € 1.600,00 — the two numbers that must never disagree, disagreeing by
         the size of the discount. */
      return net * (1 - Number(quote?.discount_pct || 0) / 100);
    },
    [lines, quote],
  );

  /* The sections, in KINDS order, carrying the indices into `lines` so an edit
     still writes to the right row. Only kinds with lines get a section: an
     empty "MATERIAL — € 0,00" heading is a subtotal of nothing. */
  const sections = useMemo(() => KINDS
    .map((kind) => ({
      kind,
      rows: lines.map((l, i) => [l, i]).filter(([l]) => (l.kind || 'labor') === kind),
    }))
    .filter((s) => s.rows.length), [lines]);

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

  /* `revise` used to live here — POST /revise, which creates version N+1 and
     supersedes N so an already-sent quote can be changed without overwriting
     what the customer saw. Its button is gone, so the call is gone with it
     rather than sitting unreachable. The endpoint and the versioning behind it
     are untouched; nothing in the app reaches them now. */

  const act = (path, body) => run(path, async () => {
    await api.post(`/api/quotes/${quoteId}/${path}`, body || {});
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

  return (
    <div className="min-h-screen bg-cream pb-28">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Link to="/quotes" className="text-sm text-ink-muted hover:text-ink inline-flex items-center gap-1 mb-3">
          <ArrowLeft size={14} /> {t('quotes')}
        </Link>

        <div className="card-lg mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-headings font-bold text-ink text-xl leading-tight">
                {quote.title || quote.job_title || t('quote')}
              </h1>
              {/* `job_number` too, and it is the one that is usually there:
                  `quote_number` is null on every quote in the database, so
                  this line read "v1" and nothing else. The list has always
                  shown all three for exactly this reason. */}
              <p className="text-sm text-ink-muted">
                {[quote.quote_number, quote.job_number, quote.customer_name,
                  `v${quote.version || 1}`].filter(Boolean).join(' · ')}
              </p>
              {/* When it was written and when it went out. The list has carried
                  the created date since the dashboard work; opening the quote
                  used to lose it, which is the wrong way round — this is the
                  screen where "have they had it a fortnight?" gets asked. */}
              <p className="text-sm text-ink-muted">
                {t('quote_created_on', { d: fmtDate(quote.created_at) })}
                {quote.sent_at ? ` · ${t('quote_sent_on', { d: fmtDate(quote.sent_at) })}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="font-headings font-bold text-ink text-lg">
                {fmtEur0(quote.gross_total)}
              </div>
              <div className="text-xs text-ink-muted">
                {t('net')} {fmtEur0(quote.net_total)}
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

        {/* The document, grouped the way a written Angebot is grouped, and one
            line at a time under the pen.

            Every line used to be open at once: five stacked cards of five
            inputs each, so a three-position quote was a wall of twenty-odd
            fields and the amounts — the thing anybody actually opens a quote
            to check — were not on the screen at all, only their factors. Now a
            line reads as a sentence with its own total, and editing is a
            deliberate act on one row. */}
        <div data-testid="quote-editor-lines">
          {sections.map((sec) => (
            <div key={sec.kind}>
              <div className="flex items-baseline justify-between px-1 mt-4 mb-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[.12em]
                                 text-ink-muted">{t(sec.kind)}</span>
                {/* The subtotal is why the grouping is worth having: "wie viel
                    davon ist Material" is a question with an answer now. */}
                <span className="text-[13px] font-bold text-ink tabular-nums"
                      data-testid={`quote-editor-subtotal-${sec.kind}`}>
                  {fmtEur(sec.rows.reduce((s, [l]) => s + lineNet(l), 0))}
                </span>
              </div>

              <div className="card !p-0 overflow-hidden">
                {sec.rows.map(([l, i]) => {
                  const open = editing === i;
                  return (
                    <div key={l.id || i} data-testid="quote-editor-line"
                         className="border-b border-sm-border last:border-b-0">
                      <div className="flex items-start gap-2.5 px-3.5 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-bold text-ink leading-snug">
                            {(l.description || '').trim() || t('description')}
                          </div>
                          {/* How the amount was arrived at, in the notation a
                              quote is read in. Waste and discount only appear
                              when they are not zero — a row of "0 %" on every
                              line teaches nobody anything. */}
                          <div className="text-[12px] text-ink-muted mt-0.5">
                            {fmtNum(l.qty, 2)} {l.unit} × {fmtEur(l.unit_price)}
                            {Number(l.waste_factor) > 0
                              && ` · +${fmtNum(Number(l.waste_factor) * 100, 0)} % ${t('waste_short')}`}
                            {Number(l.discount_pct) > 0
                              && ` · −${fmtNum(l.discount_pct, 0)} %`}
                          </div>
                          {l.is_optional && (
                            <div className="text-[11px] font-bold text-amber-text mt-0.5">
                              {t('quote_line_optional')}
                            </div>
                          )}
                        </div>
                        <div className="text-[14px] font-bold text-ink tabular-nums shrink-0
                                        pt-0.5">
                          {fmtEur(lineNet(l))}
                        </div>
                        {editable && (
                          <button type="button"
                                  onClick={() => setEditing(open ? null : i)}
                                  aria-expanded={open}
                                  aria-label={t('quote_line_edit')}
                                  title={t('quote_line_edit')}
                                  data-testid={`quote-editor-pen-${i}`}
                                  /* Tinted whether or not it is open, as the
                                     mockup draws it. A white square with a
                                     hairline reads as one more cell in a row
                                     of numbers; the wash is what says "this
                                     one is a control". Open just deepens it. */
                                  className={`shrink-0 min-h-[38px] min-w-[38px] rounded-[10px]
                                              border text-teal flex items-center justify-center
                                              ${open ? 'bg-teal/[.16] border-teal/45'
                                                     : 'bg-teal/[.07] border-teal/25'}`}>
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      {open && (
                        /* The fields sit on a tint of the brand teal so it is
                           visible at a glance which parts of the row are the
                           editable ones — the amount and the sentence above
                           are computed, these five are typed. */
                        <div className="px-3.5 pb-3.5 pt-1 space-y-2.5"
                             data-testid={`quote-editor-fields-${i}`}>
                          <label className="block">
                            <span className="block text-[10px] font-extrabold uppercase
                                             tracking-[.1em] text-ink-muted mb-1">
                              {t('description')}
                            </span>
                            <input className="input text-sm w-full bg-teal/[.06] border-teal/25"
                                   value={l.description || ''}
                                   onChange={(e) => setLine(i, 'description', e.target.value)} />
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <label className="block">
                              <span className="block text-[10px] font-extrabold uppercase
                                               tracking-[.1em] text-ink-muted mb-1">{t('qty')}</span>
                              <NumberField className="input text-sm w-full bg-teal/[.06] border-teal/25"
                                           min={0} value={l.qty}
                                           onChange={(v) => setLine(i, 'qty', v ?? '')} />
                            </label>
                            <label className="block">
                              <span className="block text-[10px] font-extrabold uppercase
                                               tracking-[.1em] text-ink-muted mb-1">{t('unit')}</span>
                              <input className="input text-sm w-full bg-teal/[.06] border-teal/25"
                                     value={l.unit || ''}
                                     onChange={(e) => setLine(i, 'unit', e.target.value)} />
                            </label>
                            <label className="block">
                              <span className="block text-[10px] font-extrabold uppercase
                                               tracking-[.1em] text-ink-muted mb-1">
                                {t('unit_price')}
                              </span>
                              <NumberField className="input text-sm w-full bg-teal/[.06] border-teal/25"
                                           min={0} value={l.unit_price}
                                           onChange={(v) => setLine(i, 'unit_price', v ?? '')} />
                            </label>
                            {/* The line discount had no control anywhere in the
                                app before it had one here: it was in the blank
                                line, in the preview arithmetic and in the save
                                payload, so a quote could carry one and the pro
                                could neither see why the figures did not
                                multiply out nor remove it. */}
                            <label className="block">
                              <span className="block text-[10px] font-extrabold uppercase
                                               tracking-[.1em] text-ink-muted mb-1">
                                {t('line_discount_short')}
                              </span>
                              <NumberField className="input text-sm w-full bg-teal/[.06] border-teal/25"
                                           min={0} max={100} title={t('line_discount')}
                                           value={l.discount_pct}
                                           data-testid={`quote-line-discount-${i}`}
                                           onChange={(v) => setLine(i, 'discount_pct', v ?? '')} />
                            </label>
                          </div>
                          {/* Verschnitt: 0.10 = 10 % extra material ordered.
                              Below the four, because it is the one of the five
                              that only some trades ever touch. */}
                          <label className="block sm:w-1/4">
                            <span className="block text-[10px] font-extrabold uppercase
                                             tracking-[.1em] text-ink-muted mb-1">
                              {t('waste_short')}
                            </span>
                            <NumberField className="input text-sm w-full bg-teal/[.06] border-teal/25"
                                         min={0} max={1} title={t('waste_factor')}
                                         value={l.waste_factor}
                                         onChange={(v) => setLine(i, 'waste_factor', v ?? '')} />
                          </label>
                          <div className="flex items-center justify-between gap-3 pt-0.5">
                            <label className="flex items-center gap-2 text-xs text-ink-muted">
                              <input type="checkbox" checked={!!l.is_optional}
                                     onChange={(e) => setLine(i, 'is_optional', e.target.checked)} />
                              {t('quote_line_optional')}
                            </label>
                            {lines.length > 1 && (
                              <button type="button"
                                      className="text-xs font-semibold text-ink-muted
                                                 hover:text-red-text flex items-center gap-1"
                                      data-testid={`quote-editor-remove-${i}`}
                                      onClick={() => {
                                        setLines((ls) => ls.filter((_, x) => x !== i));
                                        setEditing(null); setDirty(true);
                                      }}>
                                <Trash2 size={13} />{t('remove')}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {editable && (
                  <button type="button"
                          data-testid={`quote-editor-add-${sec.kind}`}
                          onClick={() => addLine(sec.kind)}
                          className="w-full min-h-[42px] text-[13px] font-bold text-teal
                                     border-t border-sm-border flex items-center
                                     justify-center gap-1.5">
                    <Plus size={14} />{t('add_line')}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* There is deliberately nothing here for a kind the quote has no
              section for. Four "+ Anfahrt / + Sonstiges" chips sat under every
              document for the sake of the rare quote that needs a kind it does
              not already have, and they were noise on all the others. The
              consequence, stated because it is a real one: a quote written with
              only labour cannot gain a material line from this screen. Adding
              such a line means calculating the position, which is where the
              lines come from in the first place. */}
        </div>

        {/* A document discount was invisible on this screen: it is set when
            the quote is created and there is no field for it anywhere, so a
            pro could neither see it nor remove it, while the customer's copy
            was reduced by it. Shown here at least — an editable field needs
            an endpoint that does not exist yet. */}
        {Number(quote.discount_pct || 0) > 0 && (
          <div className="card mt-4 flex items-center justify-between text-sm">
            <span className="text-ink-muted">
              {t('quote_doc_discount').replace('{pct}',
                String(Number(quote.discount_pct).toFixed(0)))}
            </span>
            <span className="font-bold text-amber-text" data-testid="quote-editor-discount">
              −{fmtEur((dirty ? previewNet : Number(quote.net_total))
                / (1 - Number(quote.discount_pct) / 100)
                - (dirty ? previewNet : Number(quote.net_total)))}
            </span>
          </div>
        )}

        {/* What is done to the document, as chips rather than pills.
            `btn-secondary` is a full 48 px rounded-full button, and five of
            them wrap into four rows on a phone — a block of shouting under a
            document whose loudest thing should be its total. Same size and
            shape as the "+ Anfahrt / + Sonstiges" chips above, because these
            are the same weight of action. */}
        <div className="flex flex-wrap gap-2 mt-4">
          {/* Accepting and planning are one decision — the sheet asks whether
              it is a job or a project and books it — so this is the one chip
              that is filled, wherever a quote can still be won, and the way to
              schedule one that already was. */}
          {['sent', 'viewed', 'negotiating', 'accepted'].includes(quote.status) && (
            <button type="button" className={`${CHIP} bg-teal text-paper border-teal`}
                    disabled={!!busy} onClick={() => setConverting(true)}
                    data-testid="quote-editor-convert">
              {quote.status === 'accepted' ? <CalendarPlus size={14} /> : <Check size={14} />}
              {quote.status === 'accepted' ? t('conv_cta_plain') : t('conv_cta_accept')}
            </button>
          )}
          {['sent', 'viewed', 'negotiating'].includes(quote.status) && (
            <>
              <button type="button" className={`${CHIP} ${CHIP_PLAIN}`}
                      disabled={!!busy} onClick={() => act('accept')} data-testid="quote-editor-accept">
                <Check size={14} />{t('mark_accepted')}
              </button>
              <button type="button" className={`${CHIP} ${CHIP_PLAIN}`}
                      disabled={!!busy} onClick={() => act('reject', { reason: '' })}
                      data-testid="quote-editor-reject">
                <Ban size={14} />{t('mark_rejected')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* The total and the two things done to a finished document, on a rail
          that does not scroll away. The net figure used to be a card halfway
          down a page of inputs, so on a five-position quote the number the
          edits were being made *for* was off-screen while they were made.

          Lifted clear of the mobile tab bar rather than sticking to the
          viewport bottom, which would have put Speichern underneath it. */}
      <div className="sticky bottom-[calc(56px+env(safe-area-inset-bottom))] md:bottom-0 z-30"
           data-testid="quote-editor-bar">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center justify-between gap-3 rounded-t-[16px]
                          border border-b-0 border-sm-border bg-paper px-4 py-2.5
                          shadow-[0_-3px_14px_rgba(26,58,82,.09)]">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-ink-muted">
                {t('net_preview')}
              </p>
              <p className="font-headings text-[19px] font-extrabold text-ink tabular-nums"
                 data-testid="quote-editor-net">
                {fmtEur(dirty ? previewNet : quote.net_total)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={openPdf} disabled={!!busy}
                      data-testid="quote-editor-pdf"
                      className="min-h-[42px] px-3.5 rounded-xl border border-sm-border
                                 bg-paper text-[13px] font-bold text-ink flex items-center gap-1.5">
                {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" />
                                : <FileDown size={14} />}
                {t('quote_pdf')}
              </button>
              {editable && (
                /* Amber, and only here. This is the one action on the screen
                   that is genuinely urgent — unsaved edits are lost edits —
                   and it greys out the moment there is nothing to save. */
                <button type="button" onClick={save} disabled={!!busy || !dirty}
                        data-testid="quote-editor-save"
                        className="min-h-[42px] px-4 rounded-xl bg-amber text-on-amber
                                   text-[13px] font-bold flex items-center gap-1.5
                                   disabled:opacity-45">
                  {busy === 'save' ? <Loader2 size={14} className="animate-spin" />
                                   : <Save size={14} />}
                  {t('save')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {converting && (
        <ConvertSheet
          quote={quote}
          onClose={() => setConverting(false)}
          onDone={() => { setConverting(false); load(); }}
        />
      )}
    </div>
  );
}
