import React, { useState, useEffect } from 'react';
import { useLang } from '../../contexts/LangContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import {
  TrendingUp, Star, Briefcase, Euro, Clock, AlertCircle,
  CheckCircle2, Lock, ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusPill from '../../components/StatusPill';
import { isPremiumTier } from '../../utils/tier';
import { fmtEur } from '../../utils/money';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── KPI tile ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, bg, to }) {
  // A figure a pro is meant to act on should be the thing they can press.
  // "Offene Forderungen" was a number with nowhere to go.
  const Wrap = to ? Link : 'div';
  const props = to ? { to, className: 'card-lg flex flex-col gap-2 hover:border-teal/40 transition-colors' }
                   : { className: 'card-lg flex flex-col gap-2' };
  return (
    <Wrap {...props} data-testid={`kpi-${label.toLowerCase().replace(/\s+/g,'-')}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">{label}</span>
        <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center flex-shrink-0`}>
          <Icon size={15} className={color} />
        </div>
      </div>
      <p className={`text-2xl font-headings font-bold leading-none ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-muted">{sub}</p>}
    </Wrap>
  );
}

// ─── Pro-only locked upsell card ─────────────────────────────────────────────
function LockedFeature({ title, desc, t }) {
  return (
    <div className="card-lg border-dashed opacity-60 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="text-center">
          <Lock size={20} className="text-ink-muted mx-auto mb-1" />
          <p className="text-xs font-semibold text-ink-muted">{t('pro_only')}</p>
          <Link to="/billing" className="text-[11px] text-teal underline mt-0.5 inline-block">
            {t('pro_upgrade')} →
          </Link>
        </div>
      </div>
      <div className="blur-sm pointer-events-none select-none">
        <p className="font-headings font-bold text-ink mb-1">{title}</p>
        <p className="text-xs text-ink-muted">{desc}</p>
        <div className="h-28 bg-cream-deep rounded-xl mt-2" />
      </div>
    </div>
  );
}

export default function ProDashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [proProfile, setProProfile] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [invStats, setInvStats] = useState(null);
  const [cashflow, setCashflow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/profile/pro'),
      api.get('/api/invoices/stats').catch(() => ({ data: null })),
      api.get('/api/invoices/cashflow').catch(() => ({ data: null })),
      // `quotes` was initialised to [] and never fetched, so the win rate,
      // the monthly-activity chart, the category breakdown and the recent-
      // quotes list were all permanently empty no matter how many quotes the
      // business had sent. Four panels of the landing screen showing zero.
      api.get('/api/quotes', { params: { limit: 200 } }).catch(() => ({ data: null })),
    ]).then(([p, s, cf, q]) => {
      setProProfile(p.data);
      setInvStats(s.data);
      setCashflow(cf.data);
      setQuotes((q.data?.quotes || []).map((row) => ({
        ...row,
        // The chart buckets by the month a quote went out; a draft that was
        // never sent has no date and should not count as this month's work.
        sent_at: row.sent_at || row.created_at,
        price: Number(row.gross_total || 0),
        job_category: row.job_title || row.title || 'other',
      })));
    }).finally(() => setLoading(false));
  }, []);

  const isPro = isPremiumTier(proProfile?.plan_tier);

  // ── Quote metrics ──
  const totalQuotes = quotes.length;
  const acceptedQuotes = quotes.filter(q => q.status === 'accepted').length;
  const successRate = totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 100) : 0;

  // ── Monthly activity (quotes) ──
  const monthlyData = MONTH_LABELS.map((month, i) => {
    const mq = quotes.filter(q => new Date(q.sent_at).getMonth() === i && new Date(q.sent_at).getFullYear() === new Date().getFullYear());
    return {
      month,
      quotes: mq.length,
      won: mq.filter(q => q.status === 'accepted').length,
      revenue: mq.filter(q => q.status === 'accepted').reduce((s, q) => s + (q.price || 0), 0),
    };
  });

  // ── Win rate by category (Pro feature b) ──
  const categoryMap = {};
  quotes.forEach(q => {
    const cat = (q.job_category || 'other').replace('_', ' ');
    if (!categoryMap[cat]) categoryMap[cat] = { total: 0, won: 0 };
    categoryMap[cat].total++;
    if (q.status === 'accepted') categoryMap[cat].won++;
  });
  const categoryData = Object.entries(categoryMap)
    .map(([cat, v]) => ({ cat, rate: Math.round((v.won / v.total) * 100), total: v.total, won: v.won }))
    .filter(c => c.total >= 2)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8);

  const recentQuotes = [...quotes].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)).slice(0, 5);

  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="animate-pulse text-ink-muted text-sm">{t('dash_loading')}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8">
      <div className="page-container py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-3xl font-headings font-bold text-ink">{t('nav_dashboard')}</h1>
          {isPro && <span className="pro-badge px-3 py-1 text-sm">PRO</span>}
        </div>

        {/* ── Revenue KPIs ─────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label={t('dash_revenue_month')}
            value={fmtEur(invStats?.this_month_brutto || 0)}
            sub={t('dash_invoices_ytd', { n: invStats?.issued_count || 0 })}
            icon={Euro}
            color="text-teal"
            bg="bg-teal/10"
          />
          <KpiCard
            label={t('dash_outstanding')}
            value={fmtEur(invStats?.pending_brutto || 0)}
            sub={t('dash_unpaid', { n: invStats?.pending_count || 0 })}
            icon={AlertCircle}
            color={invStats?.pending_brutto > 0 ? 'text-amber-deep' : 'text-ink-muted'}
            bg="bg-amber/10"
            to={invStats?.pending_count > 0 ? '/overdue' : undefined}
          />
          <KpiCard
            label={t('dash_win_rate')}
            value={`${successRate}%`}
            sub={t('dash_won_of', { won: acceptedQuotes, total: totalQuotes })}
            icon={TrendingUp}
            color="text-green-pos"
            bg="bg-green-pos/10"
          />
          <KpiCard
            label={t('dash_avg_rating')}
            value={proProfile?.rating_avg ? proProfile.rating_avg.toFixed(1) : '—'}
            sub={t('dash_jobs_done', { n: proProfile?.completed_jobs_count || 0 })}
            icon={Star}
            color="text-amber-deep"
            bg="bg-amber/10"
          />
        </div>

        {/* ── Paid YTD highlight ───────────────────────────── */}
        {/* Wraps below 640px. As a single flex row the label wrapped onto
            three lines and the amount ran under the button on a 390px phone —
            the device this is meant to be read on. */}
        {invStats && invStats.paid_brutto > 0 && (
          <div className="card-lg bg-teal/5 border-teal/20 flex flex-wrap items-center gap-3 sm:gap-4" data-testid="revenue-ytd-banner">
            <div className="w-10 h-10 rounded-full bg-teal/15 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={18} className="text-teal" />
            </div>
            <div className="flex-1 min-w-[8rem]">
              <p className="text-xs text-ink-muted uppercase font-bold tracking-wide">{t('dash_paid_ytd')}</p>
              <p className="text-2xl font-headings font-bold text-teal">{fmtEur(invStats.paid_brutto)}</p>
            </div>
            <Link to="/my-invoices" className="btn-ghost text-xs flex-shrink-0 w-full sm:w-auto justify-center">
              {t('dash_view_invoices')} <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {/* ── Monthly Activity chart ───────────────────────── */}
        <div className="card-lg">
          <h2 className="font-headings font-bold text-ink mb-1 text-base">{t('dash_monthly_activity')}</h2>
          <p className="text-xs text-ink-muted mb-4">{t('dash_sent_vs_won')}</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="gTeal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2d6a7f" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#2d6a7f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0e3c8" />
              <XAxis dataKey="month" tick={{ fill: '#7d8a9a', fontSize: 11 }} />
              <YAxis tick={{ fill: '#7d8a9a', fontSize: 11 }} width={28} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #f0e3c8', fontSize: 12 }} />
              <Area type="monotone" dataKey="quotes" stroke="#2d6a7f" fill="url(#gTeal)" strokeWidth={2} name={t('dash_sent')} />
              <Area type="monotone" dataKey="won" stroke="#f5a623" fill="none" strokeWidth={2} strokeDasharray="4 4" name={t('dash_won')} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── PRO: Cash Flow + Win Rate by Category ───────── */}
        {isPro ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cash Flow Timeline */}
            <div className="card-lg" data-testid="cashflow-chart">
              <div className="flex items-center gap-2 mb-1">
                <Euro size={15} className="text-teal" />
                <h2 className="font-headings font-bold text-ink text-base">{t('dash_cashflow_title')}</h2>
                <span className="pro-badge text-[9px] px-1.5 py-0.5">PRO</span>
              </div>
              <p className="text-xs text-ink-muted mb-3">{t('dash_cashflow_desc')}</p>
              {cashflow?.overdue > 0 && (
                <div className="flex items-center gap-2 bg-red-warn/10 border border-red-warn/20 rounded-xl px-3 py-1.5 mb-3 text-xs text-red-warn font-semibold">
                  <AlertCircle size={12} /> {fmtEur(cashflow.overdue)} overdue — follow up now
                </div>
              )}
              {cashflow?.weeks?.some(w => w.amount > 0) ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={cashflow.weeks} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0e3c8" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#7d8a9a', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#7d8a9a', fontSize: 10 }} width={40} tickFormatter={v => `€${v}`} />
                    <Tooltip
                      formatter={(v) => [fmtEur(v), 'Expected']}
                      contentStyle={{ borderRadius: '10px', border: '1px solid #f0e3c8', fontSize: 11 }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {cashflow.weeks.map((w, i) => (
                        <Cell key={i} fill={w.amount > 0 ? '#2d6a7f' : '#e8ddd0'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-32 text-ink-muted text-sm">
                  No outstanding invoices
                </div>
              )}
            </div>

            {/* Win Rate by Category */}
            <div className="card-lg" data-testid="winrate-chart">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={15} className="text-teal" />
                <h2 className="font-headings font-bold text-ink text-base">{t('dash_winrate_cat')}</h2>
                <span className="pro-badge text-[9px] px-1.5 py-0.5">PRO</span>
              </div>
              <p className="text-xs text-ink-muted mb-3">{t('dash_winrate_focus')}</p>
              {categoryData.length > 0 ? (
                <div className="space-y-2">
                  {categoryData.map(c => (
                    <div key={c.cat} className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-ink-soft w-28 truncate flex-shrink-0 capitalize">{c.cat}</span>
                      <div className="flex-1 h-2 bg-cream-deep rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${c.rate}%`,
                            background: c.rate >= 60 ? '#2d6a7f' : c.rate >= 30 ? '#f5a623' : '#e5534b',
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-ink w-10 text-right flex-shrink-0">{c.rate}%</span>
                      <span className="text-[10px] text-ink-muted flex-shrink-0">{c.won}/{c.total}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-ink-muted text-sm text-center">
                  Quote at least 2 jobs in the same category to see win rates
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Upsell locked cards */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LockedFeature
              title={t('dash_cashflow_title')}
              desc={t('dash_cashflow_desc')}
              t={t}
            />
            <LockedFeature
              title={t('dash_winrate_title')}
              desc={t('dash_winrate_desc')}
              t={t}
            />
          </div>
        )}

        {/* ── Recent Quotes ────────────────────────────────── */}
        <div className="card-lg">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-headings font-bold text-ink text-base">{t('dash_recent_quotes')}</h2>
            <Link to="/quotes" className="text-teal text-xs hover:underline">{t('btn_view_all')}</Link>
          </div>
          {recentQuotes.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase size={28} className="text-ink-muted mx-auto mb-2" />
              <p className="text-ink-muted text-sm">{t('quotes_empty_hint')}</p>
              <Link to="/leads/new" className="btn-primary text-xs mt-3 inline-flex">{t('nav_capture_lead')}</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentQuotes.map(q => (
                <div key={q.id} className="flex items-center justify-between py-2 border-b border-sm-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{q.job_title || 'Job'}</p>
                    <p className="text-[11px] text-ink-muted">{q.job_city || ''}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-bold text-ink">€{q.price}</span>
                    <StatusPill status={q.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Upgrade CTA (non-pro) ────────────────────────── */}
        {!isPro && (
          <div className="bg-teal/5 border border-teal/20 rounded-[18px] p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-headings font-bold text-ink text-base">{t('pro_upgrade_banner_title')}</h3>
              <p className="text-ink-muted text-sm mt-0.5">{t('pro_upgrade_banner_desc')}</p>
            </div>
            <Link to="/billing" className="btn-primary flex-shrink-0 text-sm" data-testid="dashboard-upgrade-cta">
              {t('pro_plan_upgrade')} <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
