import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import {
  Download, Eye, RefreshCw, Loader2, DollarSign, Star, CreditCard, AlertTriangle,
} from 'lucide-react';
import AdminFilterBar from '../../../components/admin/AdminFilterBar';
import AdminPagination from '../../../components/admin/AdminPagination';

export default function AdminBilling({ flash }) {
  const { t } = useLang();
  const [stats, setStats] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [filters, setFilters] = useState({ status: 'all' });
  const [year, setYear] = useState(null);

  const fetchStats = useCallback(() => {
    api.get('/api/admin/billing-stats').then((r) => setStats(r.data)).catch(() => {});
  }, []);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== 'all') params.set('status', filters.status);
      if (year) params.set('year', year);
      params.set('page', page);
      params.set('per_page', perPage);
      const { data } = await api.get(`/api/admin/invoices?${params.toString()}`);
      setInvoices(data.invoices || []);
      setTotal(data.total || 0);
    } finally { setLoading(false); }
  }, [filters, year, page, perPage]);
  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const exportCSV = async () => {
    try {
      const res = await api.get('/api/admin/invoices/export.csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      flash(t('admin_csv_exported'));
    } catch { flash(t('error_generic')); }
  };

  const retry = async (txnId) => {
    setActing(txnId);
    try {
      await api.post(`/api/admin/invoices/${txnId}/retry`);
      flash(t('admin_retry_requested'));
      await fetchInvoices();
    } catch { flash(t('error_generic')); }
    finally { setActing(null); }
  };

  const statusClass = (ps) =>
    ps === 'paid' ? 'status-done'
    : ps === 'failed' ? 'status-cancelled'
    : 'status-pending';

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="admin-stat-grid">
        <div className="admin-stat" data-testid="billing-stat-mrr">
          <div className="flex items-center gap-2 mb-2"><DollarSign size={12} className="text-ink-muted" /><span className="admin-stat-label">{t('admin_mrr')}</span></div>
          <div className="admin-stat-value">€{(stats?.mrr ?? 0).toLocaleString()}</div>
          <div className="admin-stat-trend">{t('admin_recurring_revenue')}</div>
        </div>
        <div className="admin-stat" data-testid="billing-stat-subs">
          <div className="flex items-center gap-2 mb-2"><Star size={12} className="text-ink-muted" /><span className="admin-stat-label">{t('admin_pro_subs')}</span></div>
          <div className="admin-stat-value">{stats?.pro_subscriptions ?? 0}</div>
          <div className="admin-stat-trend">{t('admin_pros_on_plan')}</div>
        </div>
        <div className="admin-stat" data-testid="billing-stat-fees">
          <div className="flex items-center gap-2 mb-2"><CreditCard size={12} className="text-ink-muted" /><span className="admin-stat-label">{t('admin_contact_rev_month')}</span></div>
          <div className="admin-stat-value">€{(stats?.contact_revenue_month ?? 0).toLocaleString()}</div>
          <div className="admin-stat-trend">{t('admin_this_month')}</div>
        </div>
        <div className="admin-stat" data-testid="billing-stat-failed">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={12} className="text-ink-muted" /><span className="admin-stat-label">{t('admin_failed_payments')}</span></div>
          <div className="admin-stat-value">{stats?.failed_payments ?? 0}</div>
          <div className="admin-stat-trend neg">{t('admin_need_review')}</div>
        </div>
      </div>

      {/* Filters */}
      <AdminFilterBar
        filters={[
          { key: 'status', label: 'Status', options: [
            { value: 'all', label: 'All' },
            { value: 'paid', label: 'Paid' },
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'failed', label: 'Failed' },
          ] },
        ]}
        values={filters}
        onChange={(k, v) => { setFilters({ ...filters, [k]: v }); setPage(1); }}
        showYear
        yearValue={year}
        onYearChange={(v) => { setYear(v); setPage(1); }}
        totalLabel={`${total} invoices`}
        onReset={() => { setFilters({ status: 'all' }); setYear(null); setPage(1); }}
      />

      {/* Table */}
      <div className="admin-panel" data-testid="billing-invoices-panel">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headings font-bold text-ink text-xl">{t('admin_invoices')}</h2>
          <button onClick={exportCSV} className="admin-btn admin-btn-ghost admin-btn-sm" data-testid="billing-export-csv">
            <Download size={12} /> {t('admin_export_csv')}
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 size={20} className="text-teal animate-spin" /></div>
        ) : invoices.length === 0 ? (
          <p className="text-center text-ink-muted py-8">{t('admin_no_invoices')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin_th_invoice')}</th>
                  <th>{t('admin_th_user')}</th>
                  <th>{t('admin_th_plan')}</th>
                  <th>{t('admin_th_amount')}</th>
                  <th>{t('admin_th_date')}</th>
                  <th>{t('admin_th_status')}</th>
                  <th className="text-right">{t('admin_th_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} data-testid={`invoice-row-${inv.id}`}>
                    <td className="font-mono text-xs text-ink" data-label={t('admin_th_invoice')}>{inv.invoice_no}</td>
                    <td data-label={t('admin_th_user')}>
                      <p className="font-medium text-ink text-sm">{inv.user_name || '—'}</p>
                      <p className="text-xs text-ink-muted truncate max-w-[200px]">{inv.user_email}</p>
                    </td>
                    <td data-label={t('admin_th_plan')}><span className="admin-tag capitalize">{inv.plan}</span></td>
                    <td className="font-bold text-ink" data-label={t('admin_th_amount')}>€{inv.amount.toFixed(2)}</td>
                    <td className="text-ink-soft text-xs" data-label={t('admin_th_date')}>{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}</td>
                    <td data-label={t('admin_th_status')}><span className={`status-pill ${statusClass(inv.payment_status)}`}>{inv.payment_status}</span></td>
                    <td>
                      <div className="flex items-center gap-2 justify-end">
                        {inv.payment_status === 'paid' ? (
                          inv.hosted_invoice_url ? (
                            <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="admin-btn admin-btn-ghost admin-btn-sm" data-testid={`invoice-view-${inv.id}`}>
                              <Eye size={12} /> {t('admin_view_invoice')}
                            </a>
                          ) : (
                            <button className="admin-btn admin-btn-ghost admin-btn-sm opacity-60 cursor-not-allowed" disabled title={t('admin_no_hosted_url')} data-testid={`invoice-view-${inv.id}`}>
                              <Eye size={12} /> {t('admin_view_invoice')}
                            </button>
                          )
                        ) : (
                          <button onClick={() => retry(inv.id)} disabled={acting === inv.id} className="admin-btn admin-btn-primary admin-btn-sm" data-testid={`invoice-retry-${inv.id}`}>
                            {acting === inv.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            {t('admin_retry')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <AdminPagination
              page={page}
              perPage={perPage}
              total={total}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              sizes={[20, 50, 100]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
