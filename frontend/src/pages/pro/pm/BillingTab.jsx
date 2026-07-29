import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../api/client';
import {
  Loader2, Plus, Trash2, Send, FileSignature, Receipt, Check, AlertCircle, ArrowRight, Clock,
} from 'lucide-react';

const fmtEur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));

const CO_BADGE = {
  draft: 'bg-ink-muted/15 text-ink-muted',
  sent: 'bg-amber/15 text-amber-deep',
  approved: 'bg-green-pos/15 text-green-pos',
  rejected: 'bg-red-warn/15 text-red-warn',
  invoiced: 'bg-teal/15 text-teal',
};
const PAY_BADGE = {
  requested: 'bg-amber/15 text-amber-deep',
  client_marked_paid: 'bg-teal/15 text-teal',
  paid: 'bg-green-pos/15 text-green-pos',
};

export default function BillingTab({ projectId, t }) {
  const [cos, setCos] = useState([]);
  const [pays, setPays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        api.get(`/api/jobs/${projectId}/change-orders`),
        api.get(`/api/jobs/${projectId}/payments`),
      ]);
      setCos(c.data || []);
      setPays(p.data || []);
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="text-teal animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="pm-billing-tab">
      {err && <div className="card-lg bg-red-warn/5 border border-red-warn/30 text-red-warn text-sm flex items-center gap-2"><AlertCircle size={14} /> {err}</div>}
      <ChangeOrdersSection projectId={projectId} cos={cos} reload={load} setErr={setErr} t={t} />
      <PaymentsSection projectId={projectId} pays={pays} reload={load} setErr={setErr} t={t} />
    </div>
  );
}

/* ── Change Orders ─────────────────────────────────────────── */
function ChangeOrdersSection({ projectId, cos, reload, setErr, t }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [items, setItems] = useState([{ description: '', qty: 1, unit_net: '' }]);
  const [busy, setBusy] = useState(false);

  const net = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.unit_net) || 0), 0);

  const addItem = () => setItems((a) => [...a, { description: '', qty: 1, unit_net: '' }]);
  const setItem = (i, k, v) => setItems((a) => a.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const rmItem = (i) => setItems((a) => a.filter((_, idx) => idx !== i));

  const create = async () => {
    setErr('');
    if (!title.trim()) { setErr(t('pm_co_need_title')); return; }
    const clean = items.filter((it) => it.description.trim() && (parseFloat(it.unit_net) || 0) > 0)
      .map((it) => ({ description: it.description.trim(), qty: parseFloat(it.qty) || 1, unit_net: parseFloat(it.unit_net) || 0 }));
    if (!clean.length) { setErr(t('pm_co_need_item')); return; }
    setBusy(true);
    try {
      await api.post(`/api/jobs/${projectId}/change-orders`, { title: title.trim(), description: desc.trim(), items: clean, vat_rate: 20 });
      setTitle(''); setDesc(''); setItems([{ description: '', qty: 1, unit_net: '' }]); setOpen(false);
      await reload();
    } catch (e) { setErr(e?.response?.data?.detail || 'Failed'); }
    finally { setBusy(false); }
  };

  const send = async (id) => { setErr(''); try { await api.post(`/api/jobs/${projectId}/change-orders/${id}/send`); await reload(); } catch (e) { setErr(e?.response?.data?.detail || 'Failed'); } };
  const del = async (id) => { try { await api.delete(`/api/jobs/${projectId}/change-orders/${id}`); await reload(); } catch (e) { setErr(e?.response?.data?.detail || 'Failed'); } };

  return (
    <div className="card-lg" data-testid="pm-changeorders">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="font-headings font-bold text-ink text-base flex items-center gap-2"><FileSignature size={16} className="text-teal" /> {t('pm_co_title')}</h3>
        <button onClick={() => setOpen((o) => !o)} className="btn-primary text-xs" data-testid="pm-co-new-toggle"><Plus size={12} /> {t('pm_co_new')}</button>
      </div>
      <p className="text-sm text-ink-muted mb-4">{t('pm_co_help')}</p>

      {open && (
        <div className="rounded-[12px] border border-sm-border bg-cream-soft p-3 mb-4 space-y-2" data-testid="pm-co-form">
          <input className="sm-input text-sm w-full" placeholder={t('pm_co_title_ph')} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="pm-co-title" />
          <textarea rows={2} className="sm-textarea text-sm w-full" placeholder={t('pm_co_desc_ph')} value={desc} onChange={(e) => setDesc(e.target.value)} data-testid="pm-co-desc" />
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
              <input className="sm-input text-xs col-span-6" placeholder={t('pm_co_item_desc')} value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} data-testid={`pm-co-item-desc-${i}`} />
              <input type="number" step="0.5" className="sm-input text-xs col-span-2" placeholder={t('pm_co_item_qty')} value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} data-testid={`pm-co-item-qty-${i}`} />
              <input type="number" step="0.01" className="sm-input text-xs col-span-3" placeholder={t('pm_co_item_price')} value={it.unit_net} onChange={(e) => setItem(i, 'unit_net', e.target.value)} data-testid={`pm-co-item-price-${i}`} />
              <button onClick={() => rmItem(i)} className="text-ink-muted hover:text-red-warn col-span-1 flex justify-center" data-testid={`pm-co-item-rm-${i}`}><Trash2 size={13} /></button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button onClick={addItem} className="btn-ghost text-xs" data-testid="pm-co-add-item"><Plus size={11} /> {t('pm_co_add_item')}</button>
            <p className="text-sm font-headings font-bold text-ink">{t('pm_co_net')}: {fmtEur(net)}</p>
          </div>
          <div className="flex justify-end">
            <button onClick={create} disabled={busy} className="btn-primary text-xs" data-testid="pm-co-create">{busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {t('pm_co_create')}</button>
          </div>
        </div>
      )}

      {cos.length === 0 ? (
        <p className="text-xs text-ink-muted italic py-2">{t('pm_co_empty')}</p>
      ) : (
        <div className="space-y-2">
          {cos.map((co) => (
            <div key={co.id} className="rounded-[10px] border border-sm-border p-3" data-testid={`pm-co-${co.id}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="font-headings font-bold text-ink text-sm truncate">{co.number} · {co.title}</p>
                  <p className="text-xs text-ink-muted">{fmtEur(co.net_total)} {t('pm_co_net').toLowerCase()} · {fmtEur(co.brutto_total)} {t('billing_incl_vat') || 'incl. VAT'}</p>
                </div>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${CO_BADGE[co.status] || ''}`} data-testid={`pm-co-status-${co.id}`}>{t(`pm_co_status_${co.status}`)}</span>
              </div>
              {co.status === 'rejected' && co.client_note && <p className="text-[11px] text-red-warn mt-1">"{co.client_note}"</p>}
              <div className="flex gap-2 mt-2 flex-wrap">
                {co.status === 'draft' && (
                  <>
                    <button onClick={() => send(co.id)} className="btn-primary text-xs py-1.5" data-testid={`pm-co-send-${co.id}`}><Send size={11} /> {t('pm_co_send')}</button>
                    <button onClick={() => del(co.id)} className="btn-ghost text-xs py-1.5 text-red-warn" data-testid={`pm-co-delete-${co.id}`}><Trash2 size={11} /> {t('pm_co_delete')}</button>
                  </>
                )}
                {co.status === 'sent' && <span className="text-[11px] text-amber-deep inline-flex items-center gap-1 py-1.5"><Clock size={11} /> {t('pm_co_waiting')}</span>}
                {co.status === 'approved' && (
                  <Link to={`/invoice-from-project/${projectId}?co=${co.id}`} className="btn-primary text-xs py-1.5" data-testid={`pm-co-invoice-${co.id}`}><Receipt size={11} /> {t('pm_co_to_invoice')} <ArrowRight size={11} /></Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Payment requests ──────────────────────────────────────── */
function PaymentsSection({ projectId, pays, reload, setErr, t }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setErr('');
    if (!label.trim() || !(parseFloat(amount) > 0)) { setErr(t('pm_pay_need')); return; }
    setBusy(true);
    try {
      await api.post(`/api/jobs/${projectId}/payments`, { label: label.trim(), amount_eur: parseFloat(amount), source: 'milestone' });
      setLabel(''); setAmount(''); await reload();
    } catch (e) { setErr(e?.response?.data?.detail || 'Failed'); }
    finally { setBusy(false); }
  };
  const markPaid = async (id) => { try { await api.post(`/api/jobs/${projectId}/payments/${id}/mark-paid`); await reload(); } catch (e) { setErr(e?.response?.data?.detail || 'Failed'); } };
  const del = async (id) => { try { await api.delete(`/api/jobs/${projectId}/payments/${id}`); await reload(); } catch (e) { setErr(e?.response?.data?.detail || 'Failed'); } };

  return (
    <div className="card-lg" data-testid="pm-payments">
      <h3 className="font-headings font-bold text-ink text-base flex items-center gap-2 mb-1"><Receipt size={16} className="text-teal" /> {t('pm_pay_title')}</h3>
      <p className="text-sm text-ink-muted mb-3">{t('pm_pay_help')}</p>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input className="sm-input text-sm flex-1 min-w-[180px]" placeholder={t('pm_pay_label_ph')} value={label} onChange={(e) => setLabel(e.target.value)} data-testid="pm-pay-label" />
        <input type="number" step="0.01" className="sm-input text-sm w-28" placeholder={t('pm_pay_amount_ph')} value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="pm-pay-amount" />
        <button onClick={create} disabled={busy} className="btn-primary text-xs" data-testid="pm-pay-create">{busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} {t('pm_pay_create')}</button>
      </div>
      {pays.length === 0 ? (
        <p className="text-xs text-ink-muted italic py-2">{t('pm_pay_empty')}</p>
      ) : (
        <div className="space-y-2">
          {pays.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-[10px] border border-sm-border p-3" data-testid={`pm-pay-${p.id}`}>
              <div className="min-w-0">
                <p className="font-headings font-bold text-ink text-sm truncate">{p.label}</p>
                <p className="text-xs text-ink-muted">{p.reference} · {fmtEur(p.amount_eur)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${PAY_BADGE[p.status] || ''}`} data-testid={`pm-pay-status-${p.id}`}>{t(`pm_pay_status_${p.status}`)}</span>
                {p.status !== 'paid' && <button onClick={() => markPaid(p.id)} className="btn-ghost text-xs py-1.5" data-testid={`pm-pay-markpaid-${p.id}`}><Check size={11} /> {t('pm_pay_markpaid')}</button>}
                <button onClick={() => del(p.id)} className="text-ink-muted hover:text-red-warn" data-testid={`pm-pay-delete-${p.id}`}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
