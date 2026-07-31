import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import { ArrowRight, CheckCircle, Briefcase, TrendingUp, Star } from 'lucide-react';
import { isPremiumTier } from '../../utils/tier';

export default function ProHomePage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [proProfile, setProProfile] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);

  useEffect(() => {
    api.get('/api/profile/pro').then(r => setProProfile(r.data)).catch(() => {});
    // TODO(Phase 3): repoint at the new quote model. The marketplace job feed
    // and bid list are gone; these widgets render empty until then.
  }, []);

  const isPro = isPremiumTier(proProfile?.plan_tier);
  const pendingQuotes = quotes.filter(q => q.status === 'pending').length;
  const acceptedQuotes = quotes.filter(q => q.status === 'accepted').length;

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8">
      {/* Hero */}
      <section className="bg-gradient-to-br from-teal-deep to-teal pt-12 pb-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="absolute rounded-full border border-paper/30"
              style={{ width:`${(i+1)*300}px`, height:`${(i+1)*300}px`, top:'-20%', right:'-10%' }} />
          ))}
        </div>
        <div className="page-container relative">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 bg-paper/20 rounded-[18px] flex items-center justify-center">
                <span className="text-paper font-headings font-bold text-2xl">
                  {user?.name?.[0]?.toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-paper/70 text-sm">Welcome back</p>
                <h1 className="text-paper font-headings font-bold text-2xl">
                  {proProfile?.business_name || user?.name}
                </h1>
              </div>
              {isPro && <span className="pro-badge ml-2 text-sm px-3 py-1">PRO</span>}
            </div>
            <p className="text-paper/80 text-lg">{t('pro_hero_subtitle')}</p>

            <div className="flex gap-4 mt-6 flex-wrap">
              {/* /browse-jobs was the marketplace, removed by the migration.
                  It is not a route any more, so the catch-all bounced the
                  most prominent button on the pro home screen back to the
                  home screen. Work now starts with a lead of your own. */}
              <Link to="/leads/new" className="btn-amber">
                {t('nav_capture_lead')} <ArrowRight size={16} />
              </Link>
              {!isPro && (
                <Link to="/billing" className="hero-secondary-btn">
                  {t('pro_plan_upgrade')} ✦
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="page-container py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Pending Quotes', value: pendingQuotes, color: 'text-amber-deep', bg: 'bg-amber/10' },
            { label: 'Accepted', value: acceptedQuotes, color: 'text-green-pos', bg: 'bg-green-pos/10' },
            { label: 'Jobs Done', value: proProfile?.completed_jobs_count || 0, color: 'text-teal', bg: 'bg-teal/10' },
            { label: 'Rating', value: proProfile?.rating_avg ? proProfile.rating_avg.toFixed(1) : '—', color: 'text-amber-deep', bg: 'bg-amber/10' },
          ].map(s => (
            <div key={s.label} className="card-lg text-center shadow-md">
              <div className={`text-2xl font-headings font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-ink-muted mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Upgrade banner if not pro */}
        {!isPro && (
          <div className="bg-amber/10 border border-amber/30 rounded-[18px] p-6 mb-8 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-headings font-bold text-ink text-lg">{t('pro_upgrade_banner_title')}</h3>
              <p className="text-ink-muted text-sm mt-1">No contact fees · Priority job access · PRO badge</p>
            </div>
            <Link to="/billing" className="btn-amber flex-shrink-0" data-testid="upgrade-pro-banner">
              {t('pro_plan_upgrade')} <ArrowRight size={16} />
            </Link>
          </div>
        )}

        {/* Recent open jobs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-headings font-bold text-ink">{t('nav_projects')}</h2>
            <Link to="/projects" className="text-teal text-sm font-medium hover:underline">{t('btn_view_all')}</Link>
          </div>
          {recentJobs.length === 0 ? (
            <div className="card-lg text-center py-10">
              <Briefcase size={32} className="text-ink-muted mx-auto mb-3" />
              <p className="text-ink-muted">{t('no_jobs_near')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {recentJobs.map(job => (
                <Link key={job.id} to={`/projects/${job.id}`} className="card-md hover:shadow-lg block">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs px-2 py-0.5 bg-cream-deep text-ink-soft rounded-full capitalize">
                        {job.category?.replace('_', ' ')}
                      </span>
                      <h3 className="font-semibold text-ink mt-2 text-sm line-clamp-2">{job.title}</h3>
                      <p className="text-xs text-ink-muted mt-1">{job.city}</p>
                    </div>
                    {job.budget_max && (
                      <p className="text-sm font-bold text-ink flex-shrink-0">€{job.budget_max}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
