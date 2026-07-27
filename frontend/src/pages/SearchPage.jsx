import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useLang } from '../contexts/LangContext';
import api from '../api/client';
import StatusPill from '../components/StatusPill';
import { Search as SearchIcon, MapPin, Star, CheckCircle2, Loader2 } from 'lucide-react';
import { isPremiumTier } from '../utils/tier';

export default function SearchPage() {
  const { t } = useLang();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQ = searchParams.get('q') || '';
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState({ jobs: [], pros: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = searchParams.get('q') || '';
    setQ(term);
    if (term.length >= 2) doSearch(term);
    else setResults({ jobs: [], pros: [] });
  }, [searchParams]);

  const doSearch = async (term) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/search?q=${encodeURIComponent(term)}`);
      setResults({ jobs: data.jobs || [], pros: data.pros || [] });
    } catch {
      setResults({ jobs: [], pros: [] });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (q.trim().length >= 2) setSearchParams({ q: q.trim() });
  };

  const totalCount = results.jobs.length + results.pros.length;

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8" data-testid="search-page">
      <div className="page-container py-8 max-w-4xl">
        <h1 className="text-3xl font-headings font-bold text-ink mb-6">{t('search_title')}</h1>

        <form onSubmit={onSubmit} className="relative mb-8">
          <SearchIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="sm-input pl-10"
            placeholder={t('search_placeholder')}
            data-testid="search-input"
            autoFocus
          />
        </form>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={28} className="text-teal animate-spin" />
          </div>
        ) : q.trim().length < 2 ? (
          <p className="text-ink-muted text-center py-12" data-testid="search-min-chars">
            {t('search_min_chars')}
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-muted mb-6">
              {totalCount} {t('search_results')} <strong className="text-ink">"{q}"</strong>
            </p>

            {/* Jobs */}
            <section className="mb-10">
              <h2 className="font-headings font-bold text-ink text-lg mb-3">
                {t('search_jobs')} <span className="text-ink-muted text-sm">({results.jobs.length})</span>
              </h2>
              {results.jobs.length === 0 ? (
                <p className="text-ink-muted text-sm">{t('search_no_jobs')}</p>
              ) : (
                <div className="space-y-3" data-testid="search-jobs-list">
                  {results.jobs.map((job) => (
                    <Link
                      key={job.id}
                      to={`/jobs/${job.id}`}
                      className="card-md flex items-start justify-between gap-4 hover:shadow-lg block"
                      data-testid={`search-job-${job.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <StatusPill status={job.status} />
                          <span className="text-xs px-2 py-0.5 bg-cream-deep text-ink-soft rounded-full capitalize">
                            {job.category?.replace('_', ' ')}
                          </span>
                          {job.city && (
                            <span className="text-xs text-ink-muted flex items-center gap-1">
                              <MapPin size={10} /> {job.city}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-ink text-sm">{job.title}</h3>
                        <p className="text-xs text-ink-muted mt-1 line-clamp-2">{job.description}</p>
                      </div>
                      {job.budget_max && (
                        <p className="text-sm font-bold text-ink flex-shrink-0">€{job.budget_max}</p>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Pros */}
            <section>
              <h2 className="font-headings font-bold text-ink text-lg mb-3">
                {t('search_pros')} <span className="text-ink-muted text-sm">({results.pros.length})</span>
              </h2>
              {results.pros.length === 0 ? (
                <p className="text-ink-muted text-sm">{t('search_no_pros')}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="search-pros-list">
                  {results.pros.map((pro) => (
                    <button
                      key={pro.id}
                      onClick={() => navigate(`/pros/${pro.id}`)}
                      className="card-md text-left hover:shadow-lg"
                      data-testid={`search-pro-${pro.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 bg-teal/10 rounded-[14px] flex items-center justify-center flex-shrink-0">
                          <span className="text-teal font-bold text-lg">
                            {(pro.business_name || pro.name || '?')[0]?.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-ink text-sm truncate">
                              {pro.business_name || pro.name}
                            </p>
                            {isPremiumTier(pro.plan_tier) && <span className="pro-badge text-[10px]">PRO</span>}
                            {pro.is_verified && <CheckCircle2 size={12} className="text-teal" />}
                          </div>
                          {pro.tagline && (
                            <p className="text-xs text-ink-muted truncate mt-0.5">{pro.tagline}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-xs">
                            {pro.rating_avg > 0 && (
                              <span className="flex items-center gap-0.5 text-ink">
                                <Star size={10} className="text-amber fill-amber" />
                                {pro.rating_avg.toFixed(1)}
                              </span>
                            )}
                            {pro.city && <span className="text-ink-muted">{pro.city}</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
