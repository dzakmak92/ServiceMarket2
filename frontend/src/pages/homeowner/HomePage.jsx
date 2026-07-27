import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import {
  Droplet, Zap, PaintBucket, Sparkles, Hammer, Leaf, TreePine,
  Wind, Package, Bug, KeyRound, Settings2, Grid3x3, Layers,
  ArrowRight, Shield, Star, Users
} from 'lucide-react';

const ICON_MAP = {
  Droplet, Zap, PaintBucket, Sparkles, Hammer, Leaf, TreePine,
  Wind, Package, Bug, KeyRound, Settings2, Grid3x3, Layers
};

export default function HomeownerHome() {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [recentJobs, setRecentJobs] = useState([]);
  const [search, setSearch] = useState('');

  const catName = (cat) =>
    cat[`name_${lang}`] || cat.name_en || cat._id.replace('_', ' ');

  useEffect(() => {
    api.get('/api/categories').then(r => setCategories(r.data.categories || [])).catch(() => {});
    api.get('/api/jobs?status=open').then(r => setRecentJobs((r.data.jobs || []).slice(0, 6))).catch(() => {});
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) navigate(`/search?q=${encodeURIComponent(search)}`);
  };

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-0">
      {/* Hero */}
      <section className="relative overflow-hidden bg-teal-deep pt-16 pb-24">
        <div className="absolute inset-0 opacity-10">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="absolute rounded-full border border-paper/30"
              style={{ width: `${(i+1)*200}px`, height: `${(i+1)*200}px`, bottom: '-50%', right: '-5%', transform: 'translate(0, 50%)' }} />
          ))}
        </div>
        <div className="page-container relative">
          <div className="max-w-2xl">
            <h1 className="text-4xl sm:text-5xl font-headings font-bold text-paper leading-tight">
              {t('home_hero_title')}
            </h1>
            <p className="text-paper/80 mt-4 text-lg">{t('home_hero_subtitle')}</p>

            <form onSubmit={handleSearch} className="flex gap-3 mt-8 max-w-xl">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('home_search_placeholder')}
                className="sm-input flex-1 bg-paper/95"
                data-testid="hero-search-input"
              />
              <button type="submit" className="btn-amber px-6" data-testid="hero-search-btn">
                {t('home_search_btn')}
              </button>
            </form>

            <div className="flex gap-4 mt-8 flex-wrap">
              <Link to="/post-job" className="btn-amber" data-testid="hero-post-job">
                {t('btn_post_job')} <ArrowRight size={16} />
              </Link>
              <Link to="/find-pros" className="hero-secondary-btn" data-testid="hero-find-pros">
                {t('btn_find_pros')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="page-container py-16">
        <h2 className="text-2xl font-headings font-bold text-ink mb-8">{t('home_categories')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {categories.map(cat => {
            const Icon = ICON_MAP[cat.icon] || Hammer;
            return (
              <Link
                key={cat._id}
                to={`/find-pros?category=${cat._id}`}
                className="flex flex-col items-center gap-2 p-4 rounded-[18px] border border-sm-border bg-paper hover:shadow-md hover:border-teal/30 transition-all duration-200 group"
                style={{ background: `${cat.tile_color}40` }}
                data-testid={`category-${cat._id}`}
              >
                <div className="w-10 h-10 rounded-[14px] flex items-center justify-center" style={{ background: cat.tile_color }}>
                  <Icon size={20} style={{ color: cat.accent_color }} />
                </div>
                <span className="text-xs font-medium text-ink text-center leading-tight">
                  {catName(cat)}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-cream-deep py-16">
        <div className="page-container">
          <h2 className="text-2xl font-headings font-bold text-ink mb-10 text-center">{t('home_how_works')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { step: '1', title: t('home_step1_title'), desc: t('home_step1_desc'), color: 'bg-teal/10 text-teal' },
              { step: '2', title: t('home_step2_title'), desc: t('home_step2_desc'), color: 'bg-amber/10 text-amber-deep' },
              { step: '3', title: t('home_step3_title'), desc: t('home_step3_desc'), color: 'bg-green-pos/10 text-green-pos' },
            ].map(item => (
              <div key={item.step} className="card-lg text-center">
                <div className={`w-12 h-12 rounded-full ${item.color} flex items-center justify-center mx-auto mb-4`}>
                  <span className="font-headings font-bold text-lg">{item.step}</span>
                </div>
                <h3 className="font-headings font-bold text-ink mb-2">{item.title}</h3>
                <p className="text-ink-muted text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent jobs */}
      {recentJobs.length > 0 && (
        <section className="page-container py-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-headings font-bold text-ink">{t('home_recent_jobs')}</h2>
            <Link to="/dashboard" className="text-teal text-sm font-medium hover:underline">{t('btn_view_all')}</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentJobs.map(job => (
              <Link key={job.id} to={`/jobs/${job.id}`} className="card-md hover:shadow-lg block">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs px-2 py-0.5 bg-cream-deep text-ink-soft rounded-full capitalize">{job.category?.replace('_', ' ')}</span>
                    <h3 className="font-semibold text-ink mt-2 text-sm line-clamp-2">{job.title}</h3>
                    <p className="text-xs text-ink-muted mt-1">{job.city}</p>
                  </div>
                  {job.budget_max && <p className="text-sm font-bold text-ink flex-shrink-0">€{job.budget_max}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Trust row */}
      <section className="bg-teal-deep py-12">
        <div className="page-container">
          <h2 className="text-paper font-headings font-bold text-2xl text-center mb-8">{t('home_trust_title')}</h2>
          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto text-center">
            {[
              { icon: Shield, label: t('home_trust_verified') },
              { icon: Star, label: t('home_trust_reviews') },
              { icon: Users, label: t('home_trust_free') },
            ].map(item => (
              <div key={item.label}>
                <item.icon size={28} className="text-paper/80 mx-auto mb-2" />
                <p className="text-paper/80 text-sm font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
