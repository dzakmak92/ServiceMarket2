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

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtEur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));

// ─── KPI tile ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, bg }) {
  return (
    <div className="card-lg flex flex-col gap-2" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g,'-')}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">{label}</span>
        <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center flex-shrink-0`}>
          <Icon size={15} className={color} />
        </div>
      </div>
      <p className={`text-2xl font-headings font-bold leading-none ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-muted">{sub}</p>}
    </div>
  );
}

// ─── Pro-only locked upsell card ─────────────────────────────────────────────
function LockedFeature({ title, desc }) {
  return (
    <div className="card-lg border-dashed opacity-60 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="text-center">
          <Lock size={20} className="text-ink-muted mx-auto mb-1" />
          <p className="text-xs font-semibold text-ink-muted">PRO only</p>
          <Link to="/billing" className="text-[11px] text-teal underline mt-0.5 inline-block">Upgrade →</Link>
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
      api.get('/api/quotes'),
      api.get('/api/pro-invoices/stats').catch(() => ({ data: null })),
      api.get('/api/pro-invoices/cashflow').catch(() => ({ data: null })),
    ]).then(([p, q, s, cf]) => {
      setProProfile(p.data);
      setQuotes(q.data.quotes || []);
      setInvStats(s.data);
      setCashflow(cf.data);
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
      <div className="animate-pulse text-ink-muted text-sm">Loading dashboard…</div>
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
            label="Revenue this month"
            value={fmtEur(invStats?.this_month_brutto || 0)}
            sub={`${invStats?.issued_count || 0} invoices YTD`}
            icon={Euro}
            color="text-teal"
            bg="bg-teal/10"
          />
          <KpiCard
            label="Outstanding"
            value={fmtEur(invStats?.pending_brutto || 0)}
            sub={`${invStats?.pending_count || 0} unpaid`}
            icon={AlertCircle}
            color={invStats?.pending_brutto > 0 ? 'text-amber-deep' : 'text-ink-muted'}
            bg="bg-amber/10"
          />
          <KpiCard
            label="Quote win rate"
            value={`${successRate}%`}
            sub={`${acceptedQuotes} of ${totalQuotes} won`}
            icon={TrendingUp}
            color="text-green-pos"
            bg="bg-green-pos/10"
          />
          <KpiCard
            label="Avg rating"
            value={proProfile?.rating_avg ? proProfile.rating_avg.toFixed(1) : '—'}
            sub={`${proProfile?.completed_jobs_count || 0} jobs done`}
            icon={Star}
            color="text-amber-deep"
            bg="bg-amber/10"
          />
        </div>

        {/* ── Paid YTD highlight ───────────────────────────── */}
        {invStats && invStats.paid_brutto > 0 && (
          <div className="card-lg bg-teal/5 border-teal/20 flex items-center gap-4" data-testid="revenue-ytd-banner">
            <div className="w-10 h-10 rounded-full bg-teal/15 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={18} className="text-teal" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink-muted uppercase font-bold tracking-wide">Total paid revenue YTD</p>
              <p className="text-2xl font-headings font-bold text-teal">{fmtEur(invStats.paid_brutto)}</p>
            </div>
            <Link to="/my-invoices" className="btn-ghost text-xs flex-shrink-0">
              View invoices <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {/* ── Monthly Activity chart ───────────────────────── */}
        <div className="card-lg">
          <h2 className="font-headings font-bold text-ink mb-1 text-base">Monthly activity</h2>
          <p className="text-xs text-ink-muted mb-4">Quotes sent vs won this year</p>
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
              <Area type="monotone" dataKey="quotes" stroke="#2d6a7f" fill="url(#gTeal)" strokeWidth={2} name="Sent" />
              <Area type="monotone" dataKey="won" stroke="#f5a623" fill="none" strokeWidth={2} strokeDasharray="4 4" name="Won" />
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
                <h2 className="font-headings font-bold text-ink text-base">Cash flow timeline</h2>
                <span className="pro-badge text-[9px] px-1.5 py-0.5">PRO</span>
              </div>
              <p className="text-xs text-ink-muted mb-3">Expected payments by invoice due date (next 12 weeks)</p>
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
                <h2 className="font-headings font-bold text-ink text-base">Win rate by category</h2>
                <span className="pro-badge text-[9px] px-1.5 py-0.5">PRO</span>
              </div>
              <p className="text-xs text-ink-muted mb-3">Focus on what you win most</p>
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
              title="Cash flow timeline"
              desc="See expected payments week by week based on invoice due dates."
            />
            <LockedFeature
              title="Win rate by category"
              desc="Discover which trade categories you win most and optimise your focus."
            />
          </div>
        )}

        {/* ── Recent Quotes ────────────────────────────────── */}
        <div className="card-lg">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-headings font-bold text-ink text-base">Recent quotes</h2>
            <Link to="/my-quotes" className="text-teal text-xs hover:underline">{t('btn_view_all')}</Link>
          </div>
          {recentQuotes.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase size={28} className="text-ink-muted mx-auto mb-2" />
              <p className="text-ink-muted text-sm">No quotes yet — browse open jobs</p>
              <Link to="/browse-jobs" className="btn-primary text-xs mt-3 inline-flex">Browse jobs</Link>
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
              <p className="text-ink-muted text-sm mt-0.5">Cash flow timeline · Win rate analytics · Priority job access</p>
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
