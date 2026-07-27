import React, { useState, useEffect } from 'react';
import api from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Users, Wrench, DollarSign, AlertTriangle, Loader2 } from 'lucide-react';

function StatCard({ label, value, trend, negative, icon: Icon, testid }) {
  return (
    <div className="admin-stat" data-testid={testid}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={12} className="text-ink-muted" />}
        <span className="admin-stat-label">{label}</span>
      </div>
      <div className="admin-stat-value">{value}</div>
      {trend && (
        <div className={`admin-stat-trend ${negative ? 'neg' : ''}`}>{trend}</div>
      )}
    </div>
  );
}

function relativeTime(iso, t) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const ms = Date.now() - d.getTime();
    const s = Math.max(1, Math.floor(ms / 1000));
    if (s < 60) return `${s}s ${t('time_ago')}`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${t('time_ago')}`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${t('time_ago')}`;
    const days = Math.floor(h / 24);
    return `${days}d ${t('time_ago')}`;
  } catch {
    return '';
  }
}

export default function AdminOverview() {
  const { t } = useLang();
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [catRev, setCatRev] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/stats'),
      api.get('/api/admin/revenue-timeseries'),
      api.get('/api/admin/category-revenue'),
      api.get('/api/admin/recent-activity'),
    ])
      .then(([s, r, c, a]) => {
        setStats(s.data);
        setRevenue(r.data.series || []);
        setCatRev((c.data.categories || []).slice(0, 6));
        setActivity(a.data.events || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 size={28} className="text-teal animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="admin-stat-grid">
        <StatCard
          label={t('admin_total_users')}
          value={stats?.total_users ?? 0}
          trend={`${stats?.total_pros ?? 0} ${t('admin_pros')}`}
          icon={Users}
          testid="stat-total-users"
        />
        <StatCard
          label={t('admin_active_pros')}
          value={stats?.total_pros ?? 0}
          trend={`${stats?.pending_verifications ?? 0} ${t('admin_pending')}`}
          icon={Wrench}
          testid="stat-active-pros"
        />
        <StatCard
          label={t('admin_mrr')}
          value={`€${(stats?.mrr ?? 0).toLocaleString()}`}
          trend={`€${(stats?.contact_revenue_month ?? 0).toLocaleString()} ${t('admin_contact_rev_short')}`}
          icon={DollarSign}
          testid="stat-mrr"
        />
        <StatCard
          label={t('admin_pending_v_short')}
          value={stats?.pending_verifications ?? 0}
          trend={`${stats?.active_jobs ?? 0} ${t('admin_active_jobs_short')}`}
          icon={AlertTriangle}
          negative={(stats?.pending_verifications ?? 0) > 0}
          testid="stat-pending"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="admin-panel" data-testid="overview-revenue-chart">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-headings font-bold text-ink text-lg">{t('admin_revenue')}</h3>
              <p className="text-xs text-ink-muted">{t('admin_last_6mo')}</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={revenue} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2d6a7f" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="#2d6a7f" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="feeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f5a623" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="#f5a623" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0e3c8" vertical={false} />
              <XAxis dataKey="month" stroke="#7d8a9a" fontSize={12} />
              <YAxis stroke="#7d8a9a" fontSize={12} />
              <Tooltip contentStyle={{ background: 'white', border: '1px solid #efe2c5', borderRadius: 12, fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="mrr" name={t('admin_pro_subs')} stroke="#2d6a7f" strokeWidth={2} fill="url(#mrrGradient)" />
              <Area type="monotone" dataKey="fees" name={t('admin_contact_fees')} stroke="#f5a623" strokeWidth={2} fill="url(#feeGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="admin-panel" data-testid="overview-cat-chart">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-headings font-bold text-ink text-lg">{t('admin_cat_revenue')}</h3>
              <p className="text-xs text-ink-muted">{t('admin_last_30d')}</p>
            </div>
          </div>
          {catRev.length === 0 ? (
            <p className="text-center text-ink-muted text-sm py-12">{t('admin_no_data_yet')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={catRev} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0e3c8" horizontal={false} />
                <XAxis type="number" stroke="#7d8a9a" fontSize={12} />
                <YAxis type="category" dataKey="label" stroke="#7d8a9a" fontSize={11} width={84} />
                <Tooltip contentStyle={{ background: 'white', border: '1px solid #efe2c5', borderRadius: 12, fontSize: 13 }} />
                <Bar dataKey="revenue" fill="#2d6a7f" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="admin-panel" data-testid="overview-activity">
        <h3 className="font-headings font-bold text-ink text-lg mb-3">{t('admin_recent_activity')}</h3>
        {activity.length === 0 ? (
          <p className="text-center text-ink-muted text-sm py-6">{t('admin_no_activity')}</p>
        ) : (
          <ul className="divide-y divide-sm-border">
            {activity.map((e, i) => (
              <li key={i} className="flex items-center justify-between py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink truncate">{e.title}</p>
                </div>
                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full
                  ${e.kind === 'verification' ? 'bg-teal/10 text-teal'
                    : e.kind === 'moderation' ? 'bg-red-50 text-red-warn'
                    : e.kind === 'billing' ? 'bg-amber/15 text-amber-deep'
                    : 'bg-cream-deep text-ink-soft'}`}>
                  {e.kind}
                </span>
                <span className="text-[11px] text-ink-muted flex-shrink-0 min-w-[60px] text-right">
                  {relativeTime(e.at, t)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
