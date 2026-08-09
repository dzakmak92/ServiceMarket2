import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../../../contexts/LangContext';
import api from '../../../api/client';
import AdminFilterBar from '../../../components/admin/AdminFilterBar';
import AdminPagination from '../../../components/admin/AdminPagination';
import { Loader2, HeartHandshake, AlertTriangle, CheckCircle, X, ExternalLink, Banknote, Ban, Pencil, Briefcase, MapPin } from 'lucide-react';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'no_show', label: 'No-show' },
  { value: 'quality', label: 'Quality' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'communication', label: 'Communication' },
  { value: 'other', label: 'Other' },
];

const STATUS_META = {
  open:         { label: 'Open', color: 'bg-amber/15 text-amber-deep' },
  in_progress:  { label: 'In Progress', color: 'bg-teal/15 text-teal' },
  resolved:     { label: 'Resolved', color: 'bg-green-pos/15 text-green-pos' },
  closed:       { label: 'Closed', color: 'bg-cream-deep text-ink-muted' },
};

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.open;
  return <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${m.color}`}>{m.label}</span>;
}

function FeePanel({ jobId, flash }) {
  const { t } = useLang();
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editReason, setEditReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/api/admin/jobs/${jobId}/fees`)
      .then((r) => setFees(r.data.items || []))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const beginEdit = (f) => {
    setEditingId(f.id);
    setEditAmount(String(f.amount));
    setEditReason('');
  };
  const cancel = () => { setEditingId(null); setEditReason(''); };

  const apply = async (fee, action) => {
    if (!editReason || editReason.length < 3) {
      flash?.('Reason (3+ chars) required');
      return;
    }
    setBusy(true);
    try {
      const payload = { reason: editReason };
      if (action === 'edit') payload.amount = parseFloat(editAmount) || 0;
      if (action === 'cancel') payload.status = 'cancelled';
      await api.patch(`/api/admin/fees/${fee.id}`, payload);
      flash?.(action === 'cancel' ? 'Fee cancelled' : 'Fee updated');
      setEditingId(null);
      setEditReason('');
      load();
    } catch (e) {
      flash?.(e?.response?.data?.detail || 'Update failed');
    } finally { setBusy(false); }
  };

  if (loading) return <div className="text-xs text-ink-muted py-2">{t('adm_loading_fees')}</div>;
  if (fees.length === 0) {
    return <div className="text-xs text-ink-muted py-2" data-testid="fee-panel-empty">{t('adm_no_fees')}</div>;
  }

  return (
    <div className="bg-cream-soft rounded-lg p-3 space-y-2" data-testid="fee-panel">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted inline-flex items-center gap-1.5">
          <Banknote size={12} /> {t('adm_fees_on_job')}
        </h4>
        <span className="text-[10px] text-ink-muted">{fees.length} record(s)</span>
      </div>
      <ul className="space-y-2">
        {fees.map((f) => (
          <li key={f.id} className="bg-paper rounded p-2 border border-sm-border" data-testid={`fee-row-${f.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  <span className="font-bold">€{f.amount?.toFixed(2)}</span>
                  <span className="text-ink-muted"> · {f.kind === 'contact_fee' ? 'Contact fee' : 'Pay-Now 1% fee'}</span>
                </p>
                <p className="text-xs text-ink-muted truncate">{f.pro_name || f.pro_id}</p>
                <p className="text-[10px] text-ink-muted">{f.incurred_at ? new Date(f.incurred_at).toLocaleString() : '—'}</p>
              </div>
              <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full
                ${f.status === 'paid' ? 'bg-green-pos/15 text-green-pos'
                  : f.status === 'cancelled' ? 'bg-red-warn/15 text-red-warn'
                  : 'bg-amber/15 text-amber-deep'}`}>{f.status}</span>
            </div>
            {f.kind === 'contact_fee' && f.status !== 'cancelled' && editingId !== f.id && (
              <div className="flex gap-1 mt-2">
                <button
                  onClick={() => beginEdit(f)}
                  className="text-xs font-bold uppercase tracking-wider text-teal hover:underline inline-flex items-center gap-1"
                  data-testid={`fee-edit-${f.id}`}
                ><Pencil size={10} /> {t('adm_edit_amount')}</button>
                <button
                  onClick={() => { beginEdit(f); setTimeout(() => apply(f, 'cancel'), 50); }}
                  className="text-xs font-bold uppercase tracking-wider text-red-warn hover:underline inline-flex items-center gap-1 ml-auto"
                  data-testid={`fee-cancel-${f.id}`}
                ><Ban size={10} /> {t('adm_cancel_fee')}</button>
              </div>
            )}
            {editingId === f.id && (
              <div className="mt-2 pt-2 border-t border-sm-border space-y-2">
                <div className="flex gap-2 items-center">
                  <label className="text-[10px] uppercase font-bold text-ink-muted">€</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="admin-input text-xs h-8 flex-1"
                    data-testid={`fee-edit-amount-${f.id}`}
                  />
                </div>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Reason (audit log)"
                  className="admin-input text-xs h-8 w-full"
                  data-testid={`fee-edit-reason-${f.id}`}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={cancel} className="text-xs text-ink-muted hover:underline">{t('btn_cancel')}</button>
                  <button
                    onClick={() => apply(f, 'cancel')}
                    disabled={busy}
                    className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded bg-red-warn/10 text-red-warn hover:bg-red-warn/20 disabled:opacity-50"
                    data-testid={`fee-confirm-cancel-${f.id}`}
                  >{t('adm_cancel_fee')}</button>
                  <button
                    onClick={() => apply(f, 'edit')}
                    disabled={busy}
                    className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded bg-teal text-paper hover:bg-teal/90 disabled:opacity-50"
                    data-testid={`fee-confirm-edit-${f.id}`}
                  >{busy ? 'Saving…' : 'Save amount'}</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobDetailsPanel({ jobId, flash, onJobCancelled }) {
  const { t } = useLang();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/admin/jobs/${jobId}`)
      .then((r) => setJob(r.data))
      .catch(() => setJob(null))
      .finally(() => setLoading(false));
  }, [jobId]);

  const cancelJob = async () => {
    if (!window.confirm('Cancel this job (admin override)?')) return;
    setCancelling(true);
    try {
      await api.delete(`/api/admin/jobs/${jobId}`);
      flash?.('Job cancelled');
      const r = await api.get(`/api/admin/jobs/${jobId}`);
      setJob(r.data);
      onJobCancelled?.();
    } catch (e) {
      flash?.(e?.response?.data?.detail || 'Failed to cancel job');
    } finally { setCancelling(false); }
  };

  if (loading) return <div className="text-xs text-ink-muted py-2">{t('adm_loading_job')}</div>;
  if (!job) return null;

  return (
    <div className="bg-cream-soft rounded-lg p-3 mb-4" data-testid="admin-support-job-panel">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted inline-flex items-center gap-1.5">
          <Briefcase size={12} /> {t('adm_job_details')}
        </h4>
        <a href={`/jobs/${jobId}`} target="_blank" rel="noreferrer"
           className="text-[10px] uppercase tracking-wider font-bold text-teal hover:underline inline-flex items-center gap-1">
          <ExternalLink size={10} /> {t('adm_open')}
        </a>
      </div>
      <div className="bg-paper rounded p-3 border border-sm-border space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-bold text-ink text-sm">{job.title}</p>
          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full
            ${job.status === 'cancelled' ? 'bg-red-warn/15 text-red-warn'
              : job.status === 'completed' ? 'bg-green-pos/15 text-green-pos'
              : 'bg-teal/15 text-teal'}`}>{job.status}</span>
        </div>
        <p className="text-xs text-ink-soft flex items-center gap-1">
          <MapPin size={10} /> {job.city || '—'} · {t('adm_category')} <span className="capitalize">{(job.category || '').replace('_', ' ')}</span>
        </p>
        <p className="text-xs text-ink-muted line-clamp-2">{job.description}</p>
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-sm-border">
          <div>
            <p className="text-[9px] uppercase font-bold text-ink-muted">{t('adm_customer')}</p>
            <p className="text-xs text-ink truncate">{job.homeowner?.name || '—'}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold text-ink-muted">{t('adm_accepted_pro')}</p>
            <p className="text-xs text-ink truncate">{job.accepted_pro?.business_name || job.accepted_pro?.name || '—'}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold text-ink-muted">{t('adm_quotes')}</p>
            <p className="text-xs text-ink">{job.quote_count} received</p>
          </div>
        </div>
        {job.status !== 'cancelled' && (
          <div className="flex justify-end pt-2">
            <button
              onClick={cancelJob}
              disabled={cancelling}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider bg-red-warn/10 text-red-warn hover:bg-red-warn/20 disabled:opacity-50"
              data-testid="admin-support-cancel-job"
            >
              {cancelling ? <Loader2 size={10} className="animate-spin" /> : <Ban size={10} />} {t('adm_cancel_job')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailDrawer({ item, onClose, onUpdate, flash }) {
  const [status, setStatus] = useState(item.status);
  const [response, setResponse] = useState(item.admin_response || '');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onUpdate(item.id, { status, admin_response: response }); onClose(); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-testid="support-detail">
      <div className="bg-paper rounded-2xl max-w-2xl w-full p-5 shadow-2xl max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-headings font-bold text-ink text-lg">{item.subject}</h3>
            <StatusPill status={item.status} />
            <span className="text-[10px] uppercase tracking-wider font-bold bg-red-warn/15 text-red-warn px-2 py-0.5 rounded-full">{item.category}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-cream-deep" data-testid="support-detail-close"><X size={16} /></button>
        </div>
        <p className="text-xs text-ink-muted mb-2">
          {item.user_name} · {item.user_email} · {item.user_role}
        </p>
        {item.job_id && (
          <a href={`/jobs/${item.job_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-teal font-bold hover:underline mb-3">
            <ExternalLink size={11} /> {t('adm_open_job')} {item.job_title || item.job_id}
          </a>
        )}
        <p className="text-sm text-ink-soft whitespace-pre-wrap mb-4 bg-cream-soft p-3 rounded-lg">{item.message}</p>

        {/* {t('adm_job_details')} — only when ticket is bound to a job */}
        {item.job_id && <JobDetailsPanel jobId={item.job_id} flash={flash} />}

        {/* Fee panel — only when ticket is bound to a job */}
        {item.job_id && (
          <div className="mb-4">
            <FeePanel jobId={item.job_id} flash={flash} />
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">{t('admin_th_status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="admin-input w-full" data-testid="support-status-select">
              {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">{t('adm_response')}</label>
            <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={4} className="admin-input w-full" data-testid="support-response" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 rounded-lg border border-sm-border text-sm">{t('btn_cancel')}</button>
          <button onClick={submit} disabled={busy} className="px-4 py-1.5 rounded-lg bg-teal text-paper text-sm font-bold disabled:opacity-50" data-testid="support-save">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSupport({ flash }) {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const [filters, setFilters] = useState({ category: 'all', status: 'all' });
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.category && filters.category !== 'all') params.set('category', filters.category);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (search) params.set('q', search);
    if (year) params.set('year', year);
    params.set('page', page);
    params.set('per_page', perPage);
    api.get(`/api/admin/support?${params.toString()}`)
      .then((r) => {
        setItems(r.data.items || []);
        setCounts(r.data.counts || {});
        setTotal(r.data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [filters, search, year, page, perPage]);

  useEffect(() => { load(); }, [load]);

  const update = async (id, payload) => {
    await api.patch(`/api/admin/support/${id}`, payload);
    flash?.('Ticket updated');
    load();
  };

  return (
    <div className="space-y-4">
      <AdminFilterBar
        filters={[
          { key: 'category', label: 'Category', options: CATEGORIES.map(c => ({ ...c, count: c.value === 'all' ? counts.all : counts[c.value] })) },
          { key: 'status', label: 'Status', options: [
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Open', count: counts.status_open },
            { value: 'in_progress', label: 'In Progress', count: counts.status_in_progress },
            { value: 'resolved', label: 'Resolved', count: counts.status_resolved },
            { value: 'closed', label: 'Closed', count: counts.status_closed },
          ] },
        ]}
        values={filters}
        onChange={(k, v) => { setFilters({ ...filters, [k]: v }); setPage(1); }}
        search={{ placeholder: 'Search ticket, user, job…', value: search, onChange: (v) => { setSearch(v); setPage(1); } }}
        showYear
        yearValue={year}
        onYearChange={(v) => { setYear(v); setPage(1); }}
        totalLabel={`${total} tickets`}
        onReset={() => { setFilters({ category: 'all', status: 'all' }); setSearch(''); setYear(null); setPage(1); }}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="text-teal animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="admin-panel text-center py-12 text-ink-muted">
          <HeartHandshake size={32} className="mx-auto mb-2 opacity-50" />
          {t('adm_no_tickets')}
        </div>
      ) : (
        <div className="admin-panel">
          <ul className="divide-y divide-sm-border">
            {items.map((i) => (
              <li key={i.id} className="py-3 flex items-start gap-3 cursor-pointer hover:bg-cream-soft/50 px-2 -mx-2 rounded-lg transition-colors" onClick={() => setSelected(i)} data-testid={`support-row-${i.id}`}>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-warn text-paper flex-shrink-0">
                  <AlertTriangle size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-ink text-sm truncate">{i.subject}</span>
                    <StatusPill status={i.status} />
                    <span className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">{i.category}</span>
                  </div>
                  <p className="text-xs text-ink-muted mt-0.5 truncate">
                    {i.user_name} · {new Date(i.created_at).toLocaleDateString()}
                    {i.job_title && ` · ${i.job_title}`}
                  </p>
                  <p className="text-sm text-ink-soft mt-1 line-clamp-2">{i.message}</p>
                </div>
                {i.admin_response && <CheckCircle size={14} className="text-green-pos flex-shrink-0 mt-1" />}
              </li>
            ))}
          </ul>
          <AdminPagination page={page} perPage={perPage} total={total} onPageChange={setPage} onPerPageChange={setPerPage} />
        </div>
      )}

      {selected && <DetailDrawer item={selected} onClose={() => setSelected(null)} onUpdate={update} flash={flash} />}
    </div>
  );
}
