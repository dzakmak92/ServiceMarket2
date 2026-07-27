import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import JobCard from '../../components/JobCard';
import ScrollSnapTabStrip, { SwipeableTabPanel } from '../../components/ScrollSnapTabStrip';
import { Plus, Briefcase, Building2 } from 'lucide-react';

export default function HomeownerDashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('open');
  const [listingFilter, setListingFilter] = useState('all');
  const [completingId, setCompletingId] = useState(null);

  useEffect(() => { fetchJobs(); }, []);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/jobs');
      setJobs(data.jobs || []);
    } catch {} finally { setLoading(false); }
  };

  const markComplete = async (jobId) => {
    setCompletingId(jobId);
    try {
      await api.patch(`/api/jobs/${jobId}/status`, { status: 'completed' });
      setJobs(j => j.map(job => job.id === jobId ? { ...job, status: 'completed' } : job));
    } catch {} finally { setCompletingId(null); }
  };

  const tasks = jobs.filter(j => j.listing_type !== 'project');
  const projects = jobs.filter(j => j.listing_type === 'project');

  const tabs = [
    { id: 'open', label: t('active_jobs'), count: jobs.filter(j => j.status === 'open').length },
    { id: 'in_progress', label: t('in_progress'), count: jobs.filter(j => j.status === 'in_progress').length },
    { id: 'completed', label: t('completed'), count: jobs.filter(j => j.status === 'completed').length },
  ];

  const filtered = jobs.filter(j => {
    if (j.status !== activeTab) return false;
    if (listingFilter === 'task') return j.listing_type !== 'project';
    if (listingFilter === 'project') return j.listing_type === 'project';
    return true;
  });

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8">
      <div className="page-container py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-headings font-bold text-ink">{t('my_jobs')}</h1>
            <p className="text-ink-muted mt-1">Hi {user?.name?.split(' ')[0]}, here are your listings</p>
          </div>
          <Link to="/post-job" className="btn-primary" data-testid="new-job-btn">
            <Plus size={16} /> {t('btn_post_job')}
          </Link>
        </div>

        {/* Stats — tasks + projects split */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: t('active_jobs'), count: jobs.filter(j => j.status === 'open').length, color: 'text-teal', bg: 'bg-teal/10' },
            { label: t('in_progress'), count: jobs.filter(j => j.status === 'in_progress').length, color: 'text-amber-deep', bg: 'bg-amber/10' },
            { label: t('dashboard_filter_tasks'), count: tasks.length, color: 'text-ink', bg: 'bg-cream-deep', icon: Briefcase },
            { label: t('dashboard_filter_projects'), count: projects.length, color: 'text-teal', bg: 'bg-teal/10', icon: Building2 },
          ].map(stat => (
            <div key={stat.label} className="card-md text-center">
              {stat.icon && <stat.icon size={16} className={`${stat.color} mx-auto mb-1`} />}
              <div className={`text-2xl font-headings font-bold ${stat.color}`}>{stat.count}</div>
              <div className="text-xs text-ink-muted mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Status tabs */}
        <ScrollSnapTabStrip
          tabs={tabs.map((tb) => ({ key: tb.id, label: tb.label, count: tb.count }))}
          activeKey={activeTab}
          onChange={(k) => { setActiveTab(k); setListingFilter('all'); }}
          testidPrefix="tab"
          variant="pills"
          className="mb-3"
        />

        {/* Listing type filter (Task / Project / All) */}
        <div className="flex items-center gap-1.5 mb-5 flex-wrap" data-testid="listing-type-filter">
          {[
            { v: 'all', label: t('dashboard_filter_all') },
            { v: 'task', label: t('dashboard_filter_tasks') },
            { v: 'project', label: t('dashboard_filter_projects') },
          ].map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setListingFilter(v)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${listingFilter === v ? 'bg-teal text-white' : 'bg-cream-deep text-ink-muted hover:bg-cream-soft'}`}
              data-testid={`listing-filter-${v}`}
            >
              {label}
            </button>
          ))}
        </div>

        <SwipeableTabPanel tabKeys={tabs.map((tb) => tb.id)} activeKey={activeTab} onChange={setActiveTab}>
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="card-md animate-pulse h-32 bg-cream-deep" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-cream-deep rounded-full flex items-center justify-center mx-auto mb-4">
              <Briefcase size={24} className="text-ink-muted" />
            </div>
            <p className="text-ink-muted mb-4">
              {activeTab === 'open' ? t('no_jobs') : `No ${activeTab.replace('_', ' ')} listings`}
            </p>
            {activeTab === 'open' && (
              <Link to="/post-job" className="btn-primary inline-flex">{t('post_first_job')}</Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(job => (
              <JobCard
                key={job.id}
                job={job}
                showActions
                onComplete={markComplete}
                actionLoading={completingId === job.id}
              />
            ))}
          </div>
        )}
        </SwipeableTabPanel>
      </div>
    </div>
  );
}


