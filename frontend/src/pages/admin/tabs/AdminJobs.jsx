import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import { Eye, Trash2, Loader2 } from 'lucide-react';
import AdminFilterBar from '../../../components/admin/AdminFilterBar';
import AdminPagination from '../../../components/admin/AdminPagination';

export default function AdminJobs({ flash }) {
  const { t, lang } = useLang();
  const [jobs, setJobs] = useState([]);
  const [cats, setCats] = useState({});
  const [catBuckets, setCatBuckets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'all', category: 'all' });
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(null);
  const [month, setMonth] = useState(null);
  const [acting, setActing] = useState(null);

  // Load categories once
  useEffect(() => {
    api.get('/api/categories').then((c) => {
      const cmap = {};
      (c.data.categories || []).forEach((x) => { cmap[x._id] = x; });
      setCats(cmap);
    });
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters.category && filters.category !== 'all') params.set('category', filters.category);
      if (search) params.set('q', search);
      if (year) params.set('year', year);
      if (month) params.set('month', month);
      params.set('page', page);
      params.set('per_page', perPage);
      const { data } = await api.get(`/api/admin/jobs?${params.toString()}`);
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
      setCatBuckets(data.category_buckets || []);
    } finally { setLoading(false); }
  }, [filters, search, year, month, page, perPage]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const remove = async (id, title) => {
    if (!window.confirm(t('admin_delete_job_confirm').replace('{title}', title || ''))) return;
    setActing(id);
    try {
      await api.delete(`/api/admin/jobs/${id}`);
      flash(t('admin_job_deleted'));
      await fetchJobs();
    } catch {
      flash(t('error_generic'));
    } finally { setActing(null); }
  };

  // Build per-category bucket options (sorted by count desc, top 8 + "all")
  const categoryOptions = [
    { value: 'all', label: 'All', count: total },
    ...catBuckets.slice(0, 12).map((b) => ({
      value: b.category,
      label: cats[b.category]?.[`name_${lang}`] || cats[b.category]?.name_en || (b.category || '').replace('_', ' '),
      count: b.count,
    })),
  ];

  return (
    <div className="space-y-4">
      <AdminFilterBar
        filters={[
          { key: 'status', label: 'Status', options: [
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ] },
          { key: 'category', label: 'Category', type: 'select', options: categoryOptions },
        ]}
        values={filters}
        onChange={(k, v) => { setFilters({ ...filters, [k]: v }); setPage(1); }}
        search={{ placeholder: 'Search title, description, city…', value: search, onChange: (v) => { setSearch(v); setPage(1); } }}
        showYear
        showMonth
        yearValue={year}
        onYearChange={(v) => { setYear(v); setPage(1); }}
        monthValue={month}
        onMonthChange={(v) => { setMonth(v); setPage(1); }}
        totalLabel={`${total} jobs`}
        onReset={() => { setFilters({ status: 'all', category: 'all' }); setSearch(''); setYear(null); setMonth(null); setPage(1); }}
      />

      {/* Category bucket chips below filter for quick navigation */}
      {catBuckets.length > 0 && filters.category === 'all' && (
        <div className="admin-panel py-3" data-testid="job-category-buckets">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">Quick jump by category</p>
          <div className="flex flex-wrap gap-2">
            {catBuckets.slice(0, 10).map((b) => {
              const c = cats[b.category] || {};
              return (
                <button
                  key={b.category}
                  onClick={() => { setFilters({ ...filters, category: b.category }); setPage(1); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cream-soft hover:bg-cream-deep text-xs font-bold transition-colors"
                  data-testid={`job-bucket-${b.category}`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: c.accent_color || '#cbd5e1' }} />
                  {c[`name_${lang}`] || c.name_en || (b.category || '').replace('_', ' ')}
                  <span className="text-ink-muted">{b.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="admin-panel" data-testid="jobs-panel">
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 size={24} className="text-teal animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('title_label')}</th>
                  <th>{t('category_label')}</th>
                  <th>{t('admin_th_country')}</th>
                  <th>{t('admin_th_quotes')}</th>
                  <th>{t('admin_th_status')}</th>
                  <th className="text-right">{t('admin_th_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr><td colSpan="6" className="text-center text-ink-muted py-8">{t('admin_no_jobs')}</td></tr>
                ) : jobs.map((j) => {
                  const c = cats[j.category] || {};
                  return (
                    <tr key={j.id} data-testid={`job-row-${j.id}`}>
                      <td className="font-medium text-ink truncate max-w-[260px]">{j.title}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft capitalize">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ background: c.accent_color || '#cbd5e1' }} />
                          {c[`name_${lang}`] || c.name_en || (j.category || '').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="text-ink-soft">{j.country || '—'}</td>
                      <td className="text-ink-soft">{j.quote_count ?? j.quote_count_cache ?? 0}</td>
                      <td><span className={`status-pill status-${j.status}`}>{t(`status_${j.status}`)}</span></td>
                      <td>
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            className="admin-btn admin-btn-ghost admin-btn-sm"
                            onClick={() => window.open(`/jobs/${j.id}`, '_blank')}
                            data-testid={`job-view-${j.id}`}
                          >
                            <Eye size={12} /> {t('btn_view_short')}
                          </button>
                          <button
                            onClick={() => remove(j.id, j.title)}
                            disabled={acting === j.id || j.status === 'cancelled'}
                            className="admin-btn admin-btn-danger admin-btn-sm"
                            data-testid={`job-delete-${j.id}`}
                          >
                            {acting === j.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            {t('btn_delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <AdminPagination page={page} perPage={perPage} total={total} onPageChange={setPage} onPerPageChange={setPerPage} />
          </div>
        )}
      </div>
    </div>
  );
}
