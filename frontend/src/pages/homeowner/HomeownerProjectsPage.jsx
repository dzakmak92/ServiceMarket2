import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import { Building2, Loader2, ChevronRight, FileSignature, Receipt, AlertCircle } from 'lucide-react';

const STATUS_BADGE = {
  active: 'bg-teal/10 text-teal',
  on_hold: 'bg-amber/15 text-amber-deep',
  done: 'bg-green-pos/15 text-green-pos',
  archived: 'bg-cream-deep text-ink-muted',
};

export default function HomeownerProjectsPage() {
  const { t } = useLang();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/pm/my-projects')
      .then((r) => setProjects(r.data.projects || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12">
      <div className="page-container py-8 max-w-3xl">
        <div className="flex items-start gap-3 mb-6">
          <Building2 size={28} className="text-teal mt-0.5" />
          <div>
            <h1 className="text-3xl font-headings font-bold text-ink">{t('ho_projects_title')}</h1>
            <p className="text-ink-muted text-sm mt-1">{t('ho_projects_subtitle')}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={26} className="text-teal animate-spin" /></div>
        ) : projects.length === 0 ? (
          <div className="card-lg text-center py-12" data-testid="ho-projects-empty">
            <div className="w-14 h-14 bg-cream-deep rounded-full flex items-center justify-center mx-auto mb-3">
              <Building2 size={22} className="text-ink-muted" />
            </div>
            <p className="text-sm text-ink-muted max-w-sm mx-auto">{t('ho_projects_empty')}</p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="ho-projects-list">
            {projects.map((p) => (
              <ProjectCard key={p.id} p={p} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ p, t }) {
  const pct = p.progress_pct || 0;
  const needsAction = (p.pending_change_orders || 0) > 0 || (p.due_payments || 0) > 0;
  return (
    <Link
      to={`/my-projects/${p.id}`}
      className="card-lg block hover:border-teal/40 transition-colors group"
      data-testid={`ho-project-${p.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status] || 'bg-cream-deep text-ink-muted'}`}>
              {t(`pm_status_${p.status}`) || p.status}
            </span>
            {p.job_category && <span className="text-[11px] text-ink-muted">{p.job_category}</span>}
          </div>
          <h3 className="font-headings font-bold text-ink text-base mt-1 truncate">{p.title}</h3>
          <p className="text-xs text-ink-muted">{p.pro_name}</p>
        </div>
        <ChevronRight size={18} className="text-ink-muted group-hover:text-teal flex-shrink-0 mt-1 transition-colors" />
      </div>

      {/* progress */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-ink-muted">{t('pm_progress')}</span>
          <span className="text-[11px] font-bold text-ink">{pct}% · {p.tasks_done}/{p.tasks_total}</span>
        </div>
        <div className="h-1.5 bg-cream-deep rounded-full overflow-hidden">
          <div className="h-full bg-teal transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* action badges */}
      {needsAction && (
        <div className="flex items-center gap-2 mt-3 flex-wrap" data-testid={`ho-project-actions-${p.id}`}>
          <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-amber-deep">
            <AlertCircle size={11} /> {t('ho_proj_action_needed')}
          </span>
          {p.pending_change_orders > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink bg-amber/10 px-2 py-0.5 rounded-full">
              <FileSignature size={11} className="text-amber-deep" /> {p.pending_change_orders} {t('ho_proj_co_to_review')}
            </span>
          )}
          {p.due_payments > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink bg-teal/10 px-2 py-0.5 rounded-full">
              <Receipt size={11} className="text-teal" /> {p.due_payments} {t('ho_proj_pay_due')}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
