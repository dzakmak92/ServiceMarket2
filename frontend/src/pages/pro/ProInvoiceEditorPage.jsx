import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  Receipt, Plus, Trash2, Loader2, AlertCircle, Download, Send, FileText,
  ChevronLeft, Share2, CheckCircle2,
} from 'lucide-react';

const VAT_RATE = 20;
const fmtEur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));

export default function ProInvoiceEditorPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [search] = useSearchParams();
  const fromProject = search.get('from_project');
  const fromCo = search.get('from_co');
  const [draft, setDraft] = useState(null);
  const [items, setItems] = useState([]);
  const [note, setNote] = useState('');
  const [dueDays, setDueDays] = useState(14);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // When invoicing from a PM project (incl. Nachträge / change orders) we
        // load a job-independent draft so it works even if the original Job was
        // removed/archived. Otherwise fall back to the job-based draft.
        const draftUrl = fromProject
          ? `/api/invoices/draft-from-project/${fromProject}`
          : `/api/invoices/draft-from-job/${jobId}`;
        const { data } = await api.get(draftUrl);
        setDraft(data);
        let prefilled = data.line_items;
        // Optional pre-fill from PM project (materials + labour) or a change order
        if (fromProject && fromCo) {
          try {
            const { data: co } = await api.post(`/api/jobs/${fromProject}/change-orders/${fromCo}/draft-invoice`);
            if (co.line_items && co.line_items.length) {
              prefilled = co.line_items;
              if (co.note) setNote(co.note);
            }
          } catch (e) {
            console.warn('change-order prefill failed, using job draft', e);
          }
        } else if (fromProject) {
          try {
            const { data: pj } = await api.post(`/api/jobs/${fromProject}/draft-invoice`);
            if (pj.line_items && pj.line_items.length) {
              prefilled = pj.line_items;
              if (pj.note) setNote(pj.note);
            }
          } catch (e) {
            console.warn('project prefill failed, using job draft', e);
          }
        }
        setItems(prefilled);
      } catch (e) {
        setError(e?.response?.data?.detail || t('error_generic'));
      } finally { setLoading(false); }
    })();
  }, [jobId, fromProject, fromCo, t]);

  const totals = useMemo(() => {
    const vat = draft?.is_kleinunternehmer ? 0 : VAT_RATE;
    let net = 0, vatAmt = 0, brutto = 0;
    items.forEach((li) => {
      const qty = parseFloat(li.qty) || 0;
      const unit = parseFloat(li.unit_net) || 0;
      const ln = Math.round(qty * unit * 100) / 100;
      const lv = Math.round(ln * vat) / 100;
      net += ln;
      vatAmt += lv;
      brutto += ln + lv;
    });
    return { net: Math.round(net * 100) / 100, vat: Math.round(vatAmt * 100) / 100, brutto: Math.round(brutto * 100) / 100, vatRate: vat };
  }, [items, draft?.is_kleinunternehmer]);

  const updateItem = (i, key, val) => setItems((arr) => arr.map((it, ix) => ix === i ? { ...it, [key]: val } : it));
  const removeItem = (i) => setItems((arr) => arr.filter((_, ix) => ix !== i));
  const addItem = () => setItems((arr) => [...arr, { description: '', qty: 1, unit_net: 0 }]);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      if (items.some((it) => !it.description?.trim())) throw new Error(t('proinv_err_desc'));
      const payload = {
        job_id: fromProject ? (draft?.job?.id || null) : jobId,
        homeowner_id: draft?.homeowner?.id || null,
        change_order_id: fromCo || null,
        project_id: fromProject || null,
        line_items: items.map((it) => ({
          description: it.description,
          qty: parseFloat(it.qty) || 1,
          unit_net: parseFloat(it.unit_net) || 0,
        })),
        note: note || null,
        payment_due_days: parseInt(dueDays, 10) || 14,
      };
      const { data } = await api.post('/api/invoices', payload);
      navigate(`/my-invoices?new=${data.id}`);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || t('error_generic'));
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 size={28} className="text-teal animate-spin" /></div>;
  }
  if (error && !draft) {
    return (
      <div className="min-h-screen bg-cream pb-12">
        <div className="page-container py-8 max-w-2xl">
          <button onClick={() => navigate(-1)} className="btn-ghost mb-4"><ChevronLeft size={14} /> {t('btn_back')}</button>
          <div className="card-lg flex items-start gap-3" data-testid="proinv-error-card">
            <AlertCircle size={18} className="text-red-warn mt-0.5" />
            <p className="text-sm text-ink">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="page-container py-8 max-w-3xl">
        <button onClick={() => navigate(-1)} className="btn-ghost mb-4">
          <ChevronLeft size={14} /> {t('btn_back')}
        </button>

        <div className="flex items-start gap-3 mb-6">
          <Receipt size={28} className="text-teal" />
          <div>
            <h1 className="text-3xl font-headings font-bold text-ink">{t('proinv_create_title')}</h1>
            <p className="text-ink-muted text-sm">{t('proinv_create_subtitle')}</p>
          </div>
        </div>

        {/* Already-invoiced warning */}
        {draft?.already_invoiced && (
          <div className="card-lg mb-4 border-amber/50 bg-amber/8 flex items-start gap-3" data-testid="already-invoiced-warning">
            <AlertCircle size={16} className="text-amber flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-ink text-sm">Invoice already exists</p>
              <p className="text-xs text-ink-muted mt-0.5">
                This job already has invoice <strong>{draft.existing_invoice_number}</strong>.
                Only one invoice per completed job is allowed. View or edit the existing invoice instead.
              </p>
              <a href="/my-invoices" className="btn-ghost text-xs mt-2 inline-flex">View invoices →</a>
            </div>
          </div>
        )}

        {/* Customer block */}
        <div className="card-lg mb-4" data-testid="proinv-customer">
          <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted mb-2">{t('proinv_customer')}</p>
          <p className="font-semibold text-ink">{draft?.homeowner?.name || '—'}</p>
          <p className="text-sm text-ink-soft">{draft?.homeowner?.address || ''}</p>
          <p className="text-sm text-ink-soft">{draft?.homeowner?.postal_code} {draft?.homeowner?.city}</p>
          <p className="text-[11px] text-ink-muted mt-2 italic">{t('proinv_job_ref')}: {draft?.job?.title} ({draft?.job?.category})</p>
        </div>

        {/* Line items */}
        <div className="card-lg mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">{t('proinv_lines')}</p>
            <button onClick={addItem} className="btn-ghost text-xs" data-testid="proinv-add-line">
              <Plus size={12} /> {t('proinv_add_line')}
            </button>
          </div>
          <div className="space-y-2">
            {/* Column headers */}
            <div className="grid grid-cols-12 gap-2 px-1">
              <span className="col-span-6 text-[10px] uppercase font-bold text-ink-muted tracking-wide">{t('proinv_col_description') || 'Description'}</span>
              <span className="col-span-2 text-[10px] uppercase font-bold text-ink-muted tracking-wide text-center">{t('proinv_col_qty') || 'Qty'}</span>
              <span className="col-span-3 text-[10px] uppercase font-bold text-ink-muted tracking-wide text-right">{t('proinv_col_unit_price') || 'Unit Price'}</span>
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`proinv-line-${i}`}>
                <input
                  value={it.description}
                  onChange={(e) => updateItem(i, 'description', e.target.value)}
                  className="sm-input col-span-6 text-sm"
                  placeholder={t('proinv_desc_ph')}
                />
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={it.qty}
                  onChange={(e) => updateItem(i, 'qty', e.target.value)}
                  className="sm-input col-span-2 text-sm"
                  placeholder="1"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={it.unit_net}
                  onChange={(e) => updateItem(i, 'unit_net', e.target.value)}
                  className="sm-input col-span-3 text-sm"
                  placeholder="0.00"
                />
                <button onClick={() => removeItem(i)} className="text-ink-muted hover:text-red-warn col-span-1" aria-label="remove">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-center text-ink-muted py-4 text-sm">{t('proinv_no_lines')}</p>
            )}
          </div>
        </div>

        {/* Totals */}
        <div className="card-lg mb-4" data-testid="proinv-totals">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-ink-soft">{t('proinv_net')}</span><span className="text-ink">{fmtEur(totals.net)}</span></div>
            <div className="flex justify-between">
              <span className="text-ink-soft">{t('proinv_vat')} ({totals.vatRate}%)</span>
              <span className="text-ink">{fmtEur(totals.vat)}</span>
            </div>
            <div className="flex justify-between border-t border-sm-border pt-2 mt-2">
              <span className="font-bold text-ink">{t('proinv_total')}</span>
              <span className="font-bold text-ink text-lg" data-testid="proinv-brutto">{fmtEur(totals.brutto)}</span>
            </div>
          </div>
          {draft?.is_kleinunternehmer && (
            <p className="text-[11px] text-ink-muted mt-3 italic">{t('proinv_kleinunternehmer_note')}</p>
          )}
        </div>

        <div className="card-lg mb-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">{t('proinv_due_days')}</label>
            <input
              type="number"
              min="0"
              max="90"
              value={dueDays}
              onChange={(e) => setDueDays(e.target.value)}
              className="sm-input w-32"
              data-testid="proinv-due-days"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">{t('proinv_note')}</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="sm-textarea"
              rows={2}
              placeholder={t('proinv_note_ph')}
              data-testid="proinv-note"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-warn bg-red-50 rounded-[14px] p-3 mb-4 text-sm">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting || items.length === 0 || draft?.already_invoiced}
          className="btn-primary w-full py-3"
          data-testid="proinv-submit"
        >
          {submitting ? (
            <><Loader2 size={16} className="animate-spin" /> {t('btn_processing')}</>
          ) : (
            <><FileText size={16} /> {t('proinv_create_btn')}</>
          )}
        </button>
        <p className="text-xs text-center text-ink-muted mt-2">{t('proinv_create_help')}</p>
      </div>
    </div>
  );
}
