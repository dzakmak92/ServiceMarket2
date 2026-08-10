import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  Briefcase, Loader2, Plus, ChevronRight, CheckCircle, Clock,
  TrendingUp, AlertTriangle, Search, Filter, Calendar as CalendarIcon,
} from 'lucide-react';
import { STATUS_META, OPEN, EARNED } from '../../utils/jobStatus';
import { fmtEur } from '../../utils/money';


export default function PMProjectsPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  // `?mode=project` narrows this to jobs carrying the full PM toolkit. Without
  // it the Projekt tile and the Auftrag tile on the home screen landed on the
  // identical screen — two of six cards leading to the same place.
  const [params] = useSearchParams();
  const mode = params.get('mode');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsToolkit, setNeedsToolkit] = useState(false);

  const [wonQuotes, setWonQuotes] = useState([]);
  const [creating, setCreating] = useState(false);
  const [pickJob, setPickJob] = useState('');

  // Filter / search state
  const [statusFilter, setStatusFilter] = useState('open');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      // `jobs`, not `projects`. GET /api/jobs returns {jobs, total}; reading
      // the wrong key made this list permanently empty regardless of filter.
      // Filtered server-side: the endpoint has always accepted `mode` and
      // nothing ever sent it.
      const { data } = await api.get('/api/jobs', {
        params: { limit: 200, ...(mode ? { mode } : {}) } });
      setProjects(data.jobs || []);
    } catch (e) {
      if (e?.response?.status === 402) setNeedsToolkit(true);
    } finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [mode]);

  useEffect(() => {
    if (needsToolkit) return;
    // TODO(Phase 2): projects were seeded from won marketplace bids. The spine
    // consolidation replaces this with "create a job for a customer" — until
    // then the picker is empty.
  }, [needsToolkit]);

  const eligibleJobs = useMemo(() => {
    const existing = new Set(projects.map((p) => p.job_id));
    return wonQuotes.filter((q) => !existing.has(q.job_id));
  }, [wonQuotes, projects]);

  const createProject = async () => {
    if (!pickJob) return;
    setCreating(true);
    try {
      const { data } = await api.post('/api/jobs', { job_id: pickJob });
      setPickJob('');
      await load();
      if (data?.id) navigate(`/projects/${data.id}`);
    } catch (e) {
      console.error(e);
    } finally { setCreating(false); }
  };

  // ─── Aggregate stats across all visible projects ───
  const stats = useMemo(() => {
    const acc = { open: 0, done: 0, totalRevenue: 0, totalPotential: 0 };
    for (const p of projects) {
      const rev = Number(p.contract_amount || 0);
      if (EARNED.includes(p.status)) { acc.done += 1; acc.totalRevenue += rev; }
      else if (OPEN.includes(p.status)) { acc.open += 1; acc.totalPotential += rev; }
    }
    return acc;
  }, [projects]);

  const filtered = useMemo(() => {
    let arr = projects;
    if (statusFilter === 'open') arr = arr.filter((p) => OPEN.includes(p.status));
    else if (statusFilter === 'done') arr = arr.filter((p) => EARNED.includes(p.status));
    else if (statusFilter !== 'all') arr = arr.filter((p) => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter((p) =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.customer_name || '').toLowerCase().includes(q) ||
        (p.job_number || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q),
      );
    }
    return arr;
  }, [projects, statusFilter, search]);

  if (needsToolkit) {
    return (
      <div className="min-h-screen bg-cream pb-24 md:pb-12">
        <div className="page-container py-10 max-w-2xl text-center">
          <Briefcase size={48} className="mx-auto text-teal mb-3" />
          <h1 className="text-3xl font-headings font-bold text-ink">{t('pm_needs_toolkit_title')}</h1>
          <p className="text-ink-muted mt-2 mb-6">{t('pm_needs_toolkit_body')}</p>
          <Link to="/billing" className="btn-primary inline-flex" data-testid="pm-get-toolkit-btn">{t('pm_get_toolkit_btn')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12">
      <div className="page-container py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <Briefcase size={26} className="text-teal" />
            <div>
              <h1 className="text-3xl font-headings font-bold text-ink">
                {mode === 'project' ? t('nav_projects') : t('nav_jobs')}
              </h1>
              <p className="text-ink-muted text-sm">
                {mode === 'project' ? t('pm_only_projects') : t('pm_subtitle')}
              </p>
            </div>
          </div>
          <Link to="/schedule" className="btn-ghost text-sm" data-testid="pm-open-schedule">
            <CalendarIcon size={15} /> {t('pm_schedule_title')}
          </Link>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <StatTile
            icon={Clock}
            iconCls="text-amber-deep"
            label={t('pm_stat_active')}
            value={stats.open}
            data-testid="pm-stat-active"
          />
          <StatTile
            icon={CheckCircle}
            iconCls="text-green-text"
            label={t('pm_stat_done')}
            value={stats.done}
            data-testid="pm-stat-done"
          />
          <StatTile
            icon={TrendingUp}
            iconCls="text-teal"
            label={t('pm_stat_revenue')}
            value={fmtEur(stats.totalRevenue)}
            sub={t('pm_stat_revenue_sub')}
            data-testid="pm-stat-revenue"
          />
          <StatTile
            icon={AlertTriangle}
            iconCls="text-amber"
            label={t('pm_stat_pipeline')}
            value={fmtEur(stats.totalPotential)}
            sub={t('pm_stat_pipeline_sub')}
            data-testid="pm-stat-pipeline"
          />
        </div>

        {/* Bootstrap row */}
        <div className="card-lg mb-5 border-l-4 border-teal" data-testid="pm-bootstrap">
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2 flex items-center gap-2"><Plus size={12} /> {t('pm_create_from_job')}</p>
          {eligibleJobs.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('pm_pick_job_none')}</p>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={pickJob}
                onChange={(e) => setPickJob(e.target.value)}
                className="sm-select text-sm flex-1 min-w-[240px]"
                data-testid="pm-pick-job"
              >
                <option value="">{t('pm_pick_job')}</option>
                {eligibleJobs.map((q) => (
                  <option key={q.job_id} value={q.job_id}>
                    {q.job_title || `Job ${q.job_id.slice(-6)}`} · €{q.price}
                  </option>
                ))}
              </select>
              <button
                onClick={createProject}
                disabled={!pickJob || creating}
                className="btn-primary text-sm"
                data-testid="pm-create-project"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t('pm_create_btn')}
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="pm-filters">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('pm_search_ph')}
              className="sm-input text-xs pl-8 w-full md:w-80"
              data-testid="pm-search"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-hide flex-nowrap">
            <Filter size={12} className="text-ink-muted flex-shrink-0" />
            {['open', 'done', 'all', 'lead', 'quoted', 'accepted', 'scheduled', 'in_progress', 'invoiced', 'cancelled'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-[11px] px-2 py-1 rounded-[8px] transition-colors capitalize flex-shrink-0 whitespace-nowrap ${statusFilter === s ? 'bg-teal text-paper' : 'text-ink-muted hover:bg-cream-deep'}`}
                data-testid={`pm-filter-${s}`}
              >
                {s === 'all' ? t('pm_filter_all') : s === 'open' ? t('pm_stat_active') : s === 'done' ? t('pm_stat_done') : t(`pm_status_${s}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Projects list */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={24} className="text-teal animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="card-lg text-center py-10" data-testid="pm-empty">
            <Briefcase size={36} className="mx-auto text-ink-muted mb-2" />
            <p className="text-ink font-medium">{projects.length === 0 ? t('pm_empty_title') : t('pm_no_match_title')}</p>
            <p className="text-ink-muted text-sm mt-1">{projects.length === 0 ? t('pm_empty_help') : t('pm_no_match_help')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="pm-project-list">
            {filtered.map((p) => <ProjectCard key={p.id} p={p} t={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, iconCls, label, value, sub, ...rest }) {
  return (
    <div className="card-lg p-4" {...rest}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={iconCls} />
        <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-headings font-bold text-ink">{value}</p>
      {sub && <p className="text-[10px] text-ink-muted">{sub}</p>}
    </div>
  );
}

function ProjectCard({ p, t }) {
  const meta = STATUS_META[p.status] || STATUS_META.lead;
  const Icon = meta.i;
  const revenue = Number(p.contract_amount || 0);
  return (
    <Link
      to={`/projects/${p.id}`}
      className="card-lg flex flex-col gap-3 hover:shadow-md hover:border-teal/40 transition-all relative"
      data-testid={`pm-project-${p.id}`}
    >
      <div className="flex items-start gap-2">
        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-headings font-bold text-ink text-base truncate">{p.title}</h3>
            <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${meta.cls}`}>
              <Icon size={10} /> {t(meta.key)}
            </span>
          </div>
          <p className="text-xs text-ink-muted truncate mt-0.5">
            {p.customer_name || '—'} · {p.job_number || p.category || '—'}
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2 border-t border-sm-border pt-3">
        <div>
          {revenue > 0 && (
            <>
              <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">{t('pm_overview_revenue')}</p>
              <p className="text-lg font-headings font-bold text-ink">{fmtEur(revenue)}</p>
            </>
          )}
          {(p.site_city || p.customer_city) && (
            <p className="text-[11px] text-ink-muted mt-1 inline-flex items-center gap-1">
              <CalendarIcon size={10} /> {p.site_city || p.customer_city}
            </p>
          )}
        </div>
        <ChevronRight size={16} className="text-ink-muted flex-shrink-0" />
      </div>
    </Link>
  );
}
