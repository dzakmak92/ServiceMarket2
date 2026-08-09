import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import { Sparkles, Clock, TrendingUp, Lock, Star } from 'lucide-react';

/**
 * Pro-only Advanced Analytics widget for the Pro Dashboard.
 * - When the pro is on Standard plan, renders a tasteful upgrade card.
 * - When on Pro plan, fetches /api/analytics/pro-insights and renders 4 sub-widgets.
 */
export default function AdvancedAnalytics({ t, planTier }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Standard pros: skip the fetch entirely — render the locked upgrade card.
  const isPro = planTier === 'pro';

  useEffect(() => {
    if (!isPro) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.get('/api/analytics/pro-insights')
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isPro]);

  if (loading && isPro) {
    return (
      <div className="card-lg mb-8" data-testid="adv-analytics-loading">
        <div className="h-40 flex items-center justify-center text-ink-muted text-sm">
          {t('analytics_loading')}
        </div>
      </div>
    );
  }

  if (!isPro) {
    return (
      <div
        className="card-lg mb-8 relative overflow-hidden border-2 border-amber/30 bg-gradient-to-br from-amber/5 to-teal/5"
        data-testid="adv-analytics-locked"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-full bg-amber/20 flex items-center justify-center">
                <Sparkles size={18} className="text-amber-deep" />
              </div>
              <h2 className="font-headings font-bold text-ink text-lg">{t('adv_analytics_title')}</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber/20 text-amber-deep px-2 py-0.5 rounded-full flex items-center gap-1">
                <Lock size={10} /> {t('adv_analytics_pro_only')}
              </span>
            </div>
            <p className="text-sm text-ink-muted mb-4">{t('adv_analytics_subtitle')}</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-ink mb-4">
              <li className="flex items-center gap-2"><Star size={12} className="text-amber" /> {t('adv_earnings_6m')}</li>
              <li className="flex items-center gap-2"><Star size={12} className="text-amber" /> {t('adv_funnel')}</li>
              <li className="flex items-center gap-2"><Star size={12} className="text-amber" /> {t('adv_response_time')}</li>
              <li className="flex items-center gap-2"><Star size={12} className="text-amber" /> {t('adv_top_categories')}</li>
            </ul>
            <Link
              to="/billing"
              className="btn-amber inline-flex items-center gap-2 py-2.5 px-5 text-sm"
              data-testid="adv-analytics-upgrade-link"
            >
              <Sparkles size={14} /> {t('adv_analytics_upgrade_cta')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Pro view — render full insights
  return (
    <div className="mb-8" data-testid="adv-analytics-pro">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-full bg-amber/20 flex items-center justify-center">
          <Sparkles size={18} className="text-amber-deep" />
        </div>
        <h2 className="font-headings font-bold text-ink text-lg">{t('adv_analytics_title')}</h2>
        <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber text-paper px-2 py-0.5 rounded-full">PRO</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Earnings - 6 month chart */}
        <div className="card-lg lg:col-span-2" data-testid="adv-earnings-card">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="font-headings font-bold text-ink">{t('adv_earnings_6m')}</h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-ink-muted">{t('adv_net')}:</span>
              <span className="font-bold text-teal text-base" data-testid="adv-net-6m">
                €{(data.totals?.net_6m || 0).toFixed(2)}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.earnings_6m}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0e3c8" />
              <XAxis dataKey="month" tick={{ fill: '#7d8a9a', fontSize: 11 }} />
              <YAxis tick={{ fill: '#7d8a9a', fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: '14px', border: '1px solid #f0e3c8', background: '#fff' }} formatter={(v) => `€${v}`} />
              <Bar dataKey="earned" fill="#2d6a7f" radius={[6, 6, 0, 0]} name={t('adv_earned')} />
              <Bar dataKey="fees" fill="#f5a623" radius={[6, 6, 0, 0]} name={t('adv_fees')} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Response time card */}
        <div className="card-lg flex flex-col" data-testid="adv-response-card">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-teal" />
            <h3 className="font-headings font-bold text-ink text-sm">{t('adv_response_time')}</h3>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            {data.avg_response_minutes != null ? (
              <>
                <div className="text-5xl font-headings font-bold text-teal" data-testid="adv-response-value">
                  {data.avg_response_minutes}
                </div>
                <div className="text-sm text-ink-muted mt-1">{t('adv_response_minutes')}</div>
                <p className="text-xs text-ink-muted mt-3 max-w-[200px]">{t('adv_response_time_help')}</p>
              </>
            ) : (
              <p className="text-sm text-ink-muted">{t('adv_no_data')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel */}
        <div className="card-lg" data-testid="adv-funnel-card">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-teal" />
            <h3 className="font-headings font-bold text-ink text-sm">{t('adv_funnel')}</h3>
          </div>
          {data.funnel.quotes_sent === 0 ? (
            <p className="text-sm text-ink-muted text-center py-6">{t('adv_no_data')}</p>
          ) : (
            <div className="space-y-3">
              <FunnelBar label={t('adv_funnel_sent')} value={data.funnel.quotes_sent} max={data.funnel.quotes_sent} />
              <FunnelBar
                label={`${t('adv_funnel_accepted')} · ${data.funnel.rate_accept_pct}%`}
                value={data.funnel.accepted}
                max={data.funnel.quotes_sent}
                color="bg-amber"
              />
              <FunnelBar
                label={`${t('adv_funnel_completed')} · ${data.funnel.rate_complete_pct}%`}
                value={data.funnel.completed}
                max={data.funnel.quotes_sent}
                color="bg-green-pos"
              />
            </div>
          )}
        </div>

        {/* Top categories */}
        <div className="card-lg" data-testid="adv-categories-card">
          <h3 className="font-headings font-bold text-ink text-sm mb-3">{t('adv_top_categories')}</h3>
          {data.category_conversion.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-6">{t('adv_no_data')}</p>
          ) : (
            <div className="space-y-2">
              {data.category_conversion.map((c) => (
                <div key={c.category} className="flex items-center gap-3" data-testid={`adv-cat-${c.category}`}>
                  <div className="w-24 text-xs font-medium text-ink capitalize">{c.category.replace('_', ' ')}</div>
                  <div className="flex-1 h-3 bg-cream-deep rounded-full overflow-hidden">
                    <div className="h-full bg-teal rounded-full" style={{ width: `${Math.max(2, c.rate_pct)}%` }} />
                  </div>
                  <div className="w-20 text-right text-xs">
                    <span className="font-bold text-ink">{c.rate_pct}%</span>
                    <span className="text-ink-muted ml-1">({c.accepted}/{c.sent})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Peak hours - full width */}
      <div className="card-lg mt-4" data-testid="adv-peak-hours-card">
        <h3 className="font-headings font-bold text-ink text-sm mb-2">{t('adv_peak_hours')}</h3>
        {data.peak_hours.every((v) => v === 0) ? (
          <p className="text-sm text-ink-muted text-center py-6">{t('adv_no_data')}</p>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data.peak_hours.map((v, i) => ({ hour: `${i.toString().padStart(2, '0')}:00`, jobs: v }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0e3c8" />
              <XAxis dataKey="hour" tick={{ fill: '#7d8a9a', fontSize: 10 }} interval={1} />
              <YAxis tick={{ fill: '#7d8a9a', fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: '14px', border: '1px solid #f0e3c8', background: '#fff' }} />
              <Line type="monotone" dataKey="jobs" stroke="#2d6a7f" strokeWidth={2} dot={{ r: 3, fill: '#2d6a7f' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function FunnelBar({ label, value, max, color = 'bg-teal' }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-ink">{label}</span>
        <span className="font-bold text-ink">{value}</span>
      </div>
      <div className="h-3 bg-cream-deep rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}
