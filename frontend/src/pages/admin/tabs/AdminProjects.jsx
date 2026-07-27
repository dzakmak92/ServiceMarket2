import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import { Eye, Trash2, Loader2, Building2, CalendarRange } from 'lucide-react';
import AdminFilterBar from '../../../components/admin/AdminFilterBar';
import AdminPagination from '../../../components/admin/AdminPagination';

export default function AdminProjects({ flash }) {
  const { t } = useLang();
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'all' });
  const [search, setSearch] = useState('');
  const [acting, setActing] = useState(null);
  const [kpis, setKpis] = useState({ total: 0, active: 0, avg_value: 0, total_value: 0 });

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('listing_type', 'project');
      if (filters.status && filters.status !== 'all') params.set('status', filters.status);
      if (search) params.set('q', search);
      params.set('page', page);
      params.set('per_page', perPage);
      const { data } = await api.get(`/api/admin/jobs?${params.toString()}`);
      const jobs = data.jobs || [];
      setProjects(jobs);
      setTotal(data.total || 0);

      // Compute KPIs client-side from this page
      const active = jobs.filter(j => j.status === 'open' || j.status === 'in_progress').length;
      const vals = jobs.filter(j => j.budget_max || j.budget_min).map(j => j.budget_max || j.budget_min || 0);
      const avg = vals.length ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : 0;
      const tot = vals.reduce((a, v) => a + v, 0);
      setKpis({ total: data.total || 0, active, avg_value: avg, total_value: tot });
    } finally { setLoading(false); }
  }, [filters, search, page, perPage]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const remove = async (id, title) => {
    if (!window.confirm(`Delete project "${title}"?`)) return;
    setActing(id);
    try {
      await api.delete(`/api/admin/jobs/${id}`);
      flash(t('admin_job_deleted'));
      await fetchProjects();
    } catch { flash(t('error_generic')); }
    finally { setActing(null); }
  };

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('admin_projects_total'),   value: kpis.total,              suffix: '' },
          { label: t('admin_projects_active'),  value: kpis.active,             suffix: '' },
          { label: t('admin_projects_avg'),     value: `€${kpis.avg_value.toLocaleString()}`,   suffix: '' },
          { label: t('admin_projects_value'),   value: `€${kpis.total_value.toLocaleString()}`, suffix: '' },
        ].map(({ label, value }) => (
          <div key={label} className="card-md text-center">
            <p className="text-2xl font-headings font-bold text-teal">{value}</p>
            <p className="text-xs text-ink-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      <AdminFilterBar
        filters={[
          { key: 'status', label: 'Status', options: [
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'completed', label: 'Completed' },
          ]},
        ]}
        values={filters}
        onChange={(k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); }}
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search projects..."
      />

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={24} className="text-teal animate-spin" /></div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-ink-muted">No projects found</div>
      ) : (
        <div className="overflow-x-auto rounded-[16px] border border-sm-border">
          <table className="w-full text-sm">
            <thead className="bg-cream-soft">
              <tr>
                {['ID', 'Title', 'Category', 'City', 'Budget', 'Timeline', 'Quotes', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sm-border">
              {projects.map((proj) => (
                <tr key={proj.id} className="hover:bg-cream-soft transition-colors" data-testid={`admin-project-row-${proj.id}`}>
                  <td className="px-4 py-3 font-mono text-[10px] text-teal">{proj.job_number || proj.id?.slice(-6)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 size={13} className="text-teal flex-shrink-0" />
                      <span className="font-medium text-ink truncate max-w-[200px]">{proj.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-muted capitalize">{(proj.category || '').replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-ink-muted">{proj.city}</td>
                  <td className="px-4 py-3 font-semibold text-ink">
                    {proj.budget_min || proj.budget_max
                      ? `€${proj.budget_min || '?'}–€${proj.budget_max || '?'}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {proj.timeline_weeks ? (
                      <span className="flex items-center gap-1 text-xs">
                        <CalendarRange size={11} className="text-teal" />
                        {proj.timeline_weeks}w
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{proj.quote_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      proj.status === 'open' ? 'bg-green-pos/10 text-green-pos' :
                      proj.status === 'in_progress' ? 'bg-amber/10 text-amber-deep' :
                      proj.status === 'completed' ? 'bg-teal/10 text-teal' : 'bg-cream-deep text-ink-muted'
                    }`}>{proj.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/jobs/${proj.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-ink-muted hover:text-teal"
                        title="View"
                        data-testid={`admin-project-view-${proj.id}`}
                      >
                        <Eye size={15} />
                      </a>
                      <button
                        onClick={() => remove(proj.id, proj.title)}
                        disabled={acting === proj.id}
                        className="p-1 text-ink-muted hover:text-red-warn disabled:opacity-40"
                        title="Delete"
                        data-testid={`admin-project-delete-${proj.id}`}
                      >
                        {acting === proj.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination
        total={total}
        page={page}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={(v) => { setPerPage(v); setPage(1); }}
      />
    </div>
  );
}
