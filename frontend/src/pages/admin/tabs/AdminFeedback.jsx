import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../api/client';
import AdminFilterBar from '../../../components/admin/AdminFilterBar';
import AdminPagination from '../../../components/admin/AdminPagination';
import { Loader2, MessageSquare, Lightbulb, AlertOctagon, CheckCircle, X } from 'lucide-react';

const KIND_META = {
  feedback: { icon: MessageSquare, label: 'Feedback', accent: '#2d6a7f' },
  feature:  { icon: Lightbulb, label: 'Feature', accent: '#f5a623' },
  issue:    { icon: AlertOctagon, label: 'Issue', accent: '#c0392b' },
};

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

function DetailDrawer({ item, onClose, onUpdate }) {
  const [status, setStatus] = useState(item.status);
  const [response, setResponse] = useState(item.admin_response || '');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await onUpdate(item.id, { status, admin_response: response });
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-testid="feedback-detail">
      <div className="bg-paper rounded-2xl max-w-2xl w-full p-5 shadow-2xl max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-headings font-bold text-ink text-lg">{item.subject}</h3>
            <StatusPill status={item.status} />
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-cream-deep" data-testid="feedback-detail-close">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-ink-muted mb-3">
          {item.user_name} · {item.user_email} · {item.kind}
          {item.rating && ` · ${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}`}
        </p>
        <p className="text-sm text-ink-soft whitespace-pre-wrap mb-4 bg-cream-soft p-3 rounded-lg">{item.message}</p>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="admin-input w-full"
              data-testid="feedback-status-select"
            >
              {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">Admin response</label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={4}
              className="admin-input w-full"
              placeholder="Your response will be visible to the user."
              data-testid="feedback-response"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 rounded-lg border border-sm-border text-sm">Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-teal text-paper text-sm font-bold disabled:opacity-50"
            data-testid="feedback-save"
          >{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminFeedback({ flash }) {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const [filters, setFilters] = useState({ kind: 'all', status: 'all' });
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.kind && filters.kind !== 'all') params.set('kind', filters.kind);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (search) params.set('q', search);
    if (year) params.set('year', year);
    params.set('page', page);
    params.set('per_page', perPage);
    api.get(`/api/admin/feedback?${params.toString()}`)
      .then((r) => {
        setItems(r.data.items || []);
        setCounts(r.data.counts || {});
        setTotal(r.data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [filters, search, year, page, perPage]);

  useEffect(() => { load(); }, [load]);

  const update = async (id, payload) => {
    await api.patch(`/api/admin/feedback/${id}`, payload);
    flash?.('Feedback updated');
    load();
  };

  return (
    <div className="space-y-4">
      <AdminFilterBar
        filters={[
          { key: 'kind', label: 'Kind', options: [
            { value: 'all', label: 'All', count: counts.all },
            { value: 'feedback', label: 'Feedback', count: counts.feedback },
            { value: 'feature', label: 'Feature', count: counts.feature },
            { value: 'issue', label: 'Issue', count: counts.issue },
          ] },
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
        search={{ placeholder: 'Search subject, message, user…', value: search, onChange: (v) => { setSearch(v); setPage(1); } }}
        showYear
        yearValue={year}
        onYearChange={(v) => { setYear(v); setPage(1); }}
        totalLabel={`${total} results`}
        onReset={() => { setFilters({ kind: 'all', status: 'all' }); setSearch(''); setYear(null); setPage(1); }}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="text-teal animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="admin-panel text-center py-12 text-ink-muted">
          <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
          No feedback yet
        </div>
      ) : (
        <div className="admin-panel">
          <ul className="divide-y divide-sm-border">
            {items.map((i) => {
              const meta = KIND_META[i.kind] || KIND_META.feedback;
              const Icon = meta.icon;
              return (
                <li key={i.id} className="py-3 flex items-start gap-3 cursor-pointer hover:bg-cream-soft/50 px-2 -mx-2 rounded-lg transition-colors" onClick={() => setSelected(i)} data-testid={`feedback-row-${i.id}`}>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-paper flex-shrink-0" style={{ background: meta.accent }}>
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-ink text-sm truncate">{i.subject}</span>
                      <StatusPill status={i.status} />
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5 truncate">{i.user_name} · {new Date(i.created_at).toLocaleDateString()}</p>
                    <p className="text-sm text-ink-soft mt-1 line-clamp-2">{i.message}</p>
                  </div>
                  {i.admin_response && <CheckCircle size={14} className="text-green-pos flex-shrink-0 mt-1" />}
                </li>
              );
            })}
          </ul>
          <AdminPagination
            page={page}
            perPage={perPage}
            total={total}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        </div>
      )}

      {selected && <DetailDrawer item={selected} onClose={() => setSelected(null)} onUpdate={update} />}
    </div>
  );
}
