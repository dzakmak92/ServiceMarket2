import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  Receipt, Plus, Trash2, Loader2, AlertCircle, ChevronLeft, CheckCircle2,
  FileText, Lock,
} from 'lucide-react';

/**
 * Raise an invoice for a job.
 *
 * This screen existed and could not work. It fetched
 * `/api/invoices/draft-from-project/{id}` and `/api/invoices/draft-from-job/{id}`
 * — neither is mounted — so the draft never loaded and the page rendered an
 * error card. Had it loaded, the create call sent `line_items` with
 * `unit_net`, `homeowner_id` and `payment_due_days` where the API takes
 * `lines` with `unit_price`, `customer_id` and `payment_terms_days`; Pydantic
 * drops unknown fields, so it would have created an empty, customer-less
 * draft and reported success. And nothing here — or anywhere else in the
 * frontend — ever called `/issue`, so no invoice could ever get a number.
 *
 * Two things it deliberately no longer does.
 *
 * **It does not compute VAT.** It used to apply a flat 20 % to every line.
 * That is exactly what the Postgres rewrite exists to stop: an invoice mixing
 * 20 % labour with 10 % material or a §13b position is defective if it shows
 * one rate. The server resolves the treatment per line and returns the
 * figures; this screen displays them.
 *
 * **It does not build the lines from scratch when there is a quote.**
 * `POST /jobs/{id}/draft-invoice` inherits every accepted position with its
 * `kind` and `tax_treatment` intact — which is what keeps the §35a split
 * honest — and pulls in approved Nachträge, flipping them to `invoiced` so
 * they cannot be billed twice. Re-typing that in the browser would throw all
 * of it away.
 */

const KINDS = ['labor', 'material', 'travel', 'other'];
const fmtEur = (v) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' })
    .format(Number(v || 0));

export default function ProInvoiceEditorPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [search] = useSearchParams();

  const [job, setJob] = useState(null);
  const [lines, setLines] = useState([]);
  const [invoice, setInvoice] = useState(null);   // the draft, once created
  const [terms, setTerms] = useState(14);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [{ data: j }, { data: pv }] = await Promise.all([
          api.get(`/api/jobs/${jobId}`),
          api.get(`/api/jobs/${jobId}/invoice-preview`),
        ]);
        setJob(j);
        setLines((pv.lines || []).map((l, i) => ({
          key: `p${i}`,
          description: l.description || '',
          qty: Number(l.qty ?? 1),
          unit: l.unit || 'pcs',
          unit_price: Number(l.unit_price ?? 0),
          kind: l.kind || 'labor',
          inherited: true,
        })));
      } catch (e) {
        setError(e?.response?.data?.detail || t('proinv_load_failed'));
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Net only. The VAT depends on the treatment the server resolves per line —
  // country, customer type, Bauleistung — and guessing it here would put a
  // number on the screen that the issued invoice then contradicts.
  const net = useMemo(
    /* The line discount belongs in the preview: without it this screen read
       "Net total 1.325,11" for an invoice the server put at 1.175,11 —
       the pro confirming a number the customer would never see. */
    () => lines.reduce((s, l) => s
      + (Number(l.qty) || 0) * (Number(l.unit_price) || 0)
        * (1 - (Number(l.discount_pct) || 0) / 100), 0),
    [lines]);

  // A draft's `net_total`/`gross_total` are zero in the database — they are
  // computed by `issue()`, which is correct, but it meant this screen asked
  // the pro to confirm "€ 0,00" against five positions that plainly are not.
  // The per-line figures are real (generated columns), so the draft total is
  // summed from them and the server's own totals are used once issued.
  const totals = useMemo(() => {
    if (!invoice) return { net, gross: null };
    if (invoice.status !== 'draft') {
      return { net: Number(invoice.net_total), gross: Number(invoice.gross_total) };
    }
    const ls = invoice.lines || [];
    return {
      net: ls.reduce((s2, l) => s2 + Number(l.net_amount || 0), 0),
      gross: ls.reduce((s2, l) => s2 + Number(l.net_amount || 0) + Number(l.vat_amount || 0), 0),
    };
  }, [invoice, net]);

  const setLine = (i, key, val) =>
    setLines((arr) => arr.map((l, ix) => (ix === i ? { ...l, [key]: val } : l)));
  const addLine = () =>
    setLines((arr) => [...arr, {
      key: `n${arr.length}${Date.now()}`, description: '', qty: 1,
      unit: 'pcs', unit_price: 0, kind: 'labor',
    }]);
  const removeLine = (i) => setLines((arr) => arr.filter((_, ix) => ix !== i));

  /* Everything the line carries, not only the fields this screen edits.
     A PUT replaces the whole set, so any field left out of the payload was
     silently reset to its default: adding one line to an invoice inherited
     from an accepted quote wiped every per-line discount (a 15% line went
     back to full price), re-taxed the 10% material positions at 20%, and
     dropped every `source_quote_line_id`, which is the audit link back to
     the offer the customer signed. */
  const payload = () => lines
    .filter((l) => l.description.trim())
    .map((l, i) => {
      const out = {
        position: i + 1,
        description: l.description.trim(),
        qty: Number(l.qty) || 1,
        unit: l.unit || 'pcs',
        unit_price: Number(l.unit_price) || 0,
        kind: l.kind,
        discount_pct: Number(l.discount_pct) || 0,
      };
      /* Only sent when the line has one: null would ask the server to
         re-resolve, and undefined leaves its own decision alone. */
      if (l.tax_treatment) out.tax_treatment = l.tax_treatment;
      if (l.vat_rate != null && l.vat_rate !== '') out.vat_rate = Number(l.vat_rate);
      if (l.source_quote_line_id) out.source_quote_line_id = l.source_quote_line_id;
      if (l.source_change_order_id) out.source_change_order_id = l.source_change_order_id;
      return out;
    });

  /** Create the draft, inheriting from the accepted quote where there is one. */
  const createDraft = async () => {
    setBusy('draft'); setError('');
    try {
      const { data } = await api.post(`/api/jobs/${jobId}/draft-invoice`);
      // Only replace the positions when the pro actually changed them —
      // otherwise the server's inherited lines, which carry tax_treatment and
      // source_quote_line_id, would be thrown away and rebuilt without them.
      const edited = lines.some((l) => !l.inherited)
        || lines.length !== (data.lines || []).length;
      let inv = data;
      if (edited) {
        const { data: replaced } =
          await api.put(`/api/invoices/${data.id}/lines`, { lines: payload() });
        inv = replaced;
      }
      setInvoice(inv);
    } catch (e) {
      setError(e?.response?.data?.detail || t('proinv_draft_failed'));
    } finally { setBusy(''); }
  };

  /** Freeze it. The number is allocated here and the lines become immutable. */
  const issue = async () => {
    setBusy('issue'); setError('');
    try {
      const { data } = await api.post(`/api/invoices/${invoice.id}/issue`, {
        payment_terms_days: parseInt(terms, 10) || 14,
      });
      navigate(`/my-invoices?new=${data.id}`);
    } catch (e) {
      setError(e?.response?.data?.detail || t('proinv_issue_failed'));
    } finally { setBusy(''); }
  };

  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <Loader2 size={28} className="text-teal animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="page-container py-8 max-w-3xl">
        <button onClick={() => navigate(-1)} className="btn-ghost mb-4">
          <ChevronLeft size={14} /> {t('btn_back')}
        </button>

        <div className="flex items-start gap-3 mb-6">
          <Receipt size={28} className="text-teal" />
          <div>
            <h1 className="text-3xl font-headings font-bold text-ink">
              {t('proinv_create_title')}
            </h1>
            <p className="text-ink-muted text-sm">{job?.title} · {job?.job_number}</p>
          </div>
        </div>

        {error && (
          <div className="card-lg mb-4 flex items-start gap-3 border-red-warn/40"
               data-testid="proinv-error-card">
            <AlertCircle size={18} className="text-red-warn mt-0.5 flex-shrink-0" />
            <p className="text-sm text-ink">{error}</p>
          </div>
        )}

        {/* ── Step 1: the positions ─────────────────────────────────── */}
        <div className="card-lg mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">
              {t('proinv_lines')}
            </p>
            {!invoice && (
              <button onClick={addLine} className="btn-ghost text-xs"
                      data-testid="proinv-add-line">
                <Plus size={12} /> {t('proinv_add_line')}
              </button>
            )}
          </div>

          {lines.length === 0 && !invoice && (
            <p className="text-sm text-ink-muted py-3">{t('proinv_no_lines')}</p>
          )}

          <div className="space-y-3">
            {(invoice ? invoice.lines : lines).map((l, i) => (
              invoice ? (
                <div key={l.id} className="flex items-start justify-between gap-3 text-sm
                                           border-b border-sm-border pb-2 last:border-0">
                  <span className="text-ink min-w-0">
                    {l.description}
                    <span className="block text-[11px] text-ink-muted">
                      {Number(l.qty)} {l.unit} × {fmtEur(l.unit_price)} · {t(`kind_${l.kind}`)}
                      {' · '}{Number(l.vat_rate)}% USt
                    </span>
                  </span>
                  <span className="text-ink whitespace-nowrap">{fmtEur(l.net_amount)}</span>
                </div>
              ) : (
                <div key={l.key} className="space-y-2 border-b border-sm-border pb-3 last:border-0">
                  <div className="flex items-center gap-2">
                    <input
                      className="input flex-1"
                      value={l.description}
                      onChange={(e) => setLine(i, 'description', e.target.value)}
                      placeholder={t('description')}
                      aria-label={t('description')}
                      data-testid={`proinv-desc-${i}`}
                    />
                    <button onClick={() => removeLine(i)}
                            className="p-2 text-ink-muted hover:text-red-warn"
                            aria-label={t('remove')} title={t('remove')}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label className="text-[11px] text-ink-muted">
                      {t('qty')}
                      <input type="number" min="0" step="0.01" className="input w-full mt-0.5"
                             value={l.qty}
                             onChange={(e) => setLine(i, 'qty', e.target.value)} />
                    </label>
                    <label className="text-[11px] text-ink-muted">
                      {t('unit')}
                      <input className="input w-full mt-0.5" value={l.unit}
                             onChange={(e) => setLine(i, 'unit', e.target.value)} />
                    </label>
                    <label className="text-[11px] text-ink-muted">
                      {t('unit_price')}
                      <input type="number" min="0" step="0.01" className="input w-full mt-0.5"
                             value={l.unit_price}
                             onChange={(e) => setLine(i, 'unit_price', e.target.value)} />
                    </label>
                    {/* `kind` drives the §35a labour/material split on the
                        printed invoice. It defaulted to labour everywhere,
                        which overstates what a German customer may deduct —
                        so it is an explicit choice here. */}
                    <label className="text-[11px] text-ink-muted">
                      {t('proinv_kind')}
                      <select className="input w-full mt-0.5" value={l.kind}
                              onChange={(e) => setLine(i, 'kind', e.target.value)}>
                        {KINDS.map((k) => <option key={k} value={k}>{t(`kind_${k}`)}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-sm-border">
            <span className="text-sm text-ink-muted">{t('proinv_net_total')}</span>
            <span className="text-xl font-headings font-bold text-ink">
              {fmtEur(totals.net)}
            </span>
          </div>
          {invoice && totals.gross !== null && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm text-ink-muted">{t('proinv_gross_total')}</span>
              <span className="text-xl font-headings font-bold text-ink">
                {fmtEur(totals.gross)}
              </span>
            </div>
          )}
          {!invoice && (
            <p className="text-[11px] text-ink-muted mt-2">{t('proinv_vat_note')}</p>
          )}
        </div>

        {/* ── Step 2: terms, then draft ─────────────────────────────── */}
        {!invoice ? (
          <>
            <div className="card-lg mb-4">
              <label htmlFor="proinv-terms"
                     className="block text-[10px] uppercase tracking-wider font-bold text-ink-muted mb-1">
                {t('proinv_terms_days')}
              </label>
              <input id="proinv-terms" type="number" min="0" max="180"
                     className="input w-full sm:w-40" value={terms}
                     onChange={(e) => setTerms(e.target.value)} />
              <label htmlFor="proinv-note"
                     className="block text-[10px] uppercase tracking-wider font-bold text-ink-muted mb-1 mt-3">
                {t('notes')}
              </label>
              <textarea id="proinv-note" rows={2} className="input w-full"
                        value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button
              onClick={createDraft}
              disabled={busy === 'draft' || !payload().length}
              className="btn-primary w-full"
              data-testid="proinv-create-draft"
            >
              {busy === 'draft'
                ? <Loader2 size={16} className="animate-spin" />
                : <><FileText size={16} /> {t('proinv_create_draft')}</>}
            </button>
          </>
        ) : (
          <>
            {/* A draft has no number and no legal effect. Say so, because the
                difference decides whether the customer can be sent it. */}
            <div className="card-lg mb-4 border-amber/40 bg-amber/5 flex items-start gap-3"
                 data-testid="proinv-draft-notice">
              <AlertCircle size={16} className="text-amber-deep mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-ink">{t('proinv_draft_title')}</p>
                <p className="text-xs text-ink-muted mt-0.5">{t('proinv_draft_help')}</p>
              </div>
            </div>
            <button
              onClick={issue}
              disabled={busy === 'issue'}
              className="btn-primary w-full"
              data-testid="proinv-issue"
            >
              {busy === 'issue'
                ? <Loader2 size={16} className="animate-spin" />
                : <><Lock size={16} /> {t('proinv_issue')}</>}
            </button>
            <p className="text-[11px] text-ink-muted text-center mt-2 inline-flex items-center gap-1 w-full justify-center">
              <CheckCircle2 size={11} /> {t('proinv_issue_help')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
