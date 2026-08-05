import React, { useState, useEffect } from 'react';
import api from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import { Loader2, Banknote, TrendingUp, AlertTriangle, CreditCard } from 'lucide-react';
import { fmtDateTime } from '../../../utils/money';

function StatPill({ label, value, sub, icon: Icon }) {
  return (
    <div className="admin-stat">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={12} className="text-ink-muted" />}
        <span className="admin-stat-label">{label}</span>
      </div>
      <div className="admin-stat-value">{value}</div>
      {sub && <div className="admin-stat-trend">{sub}</div>}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try { return fmtDateTime(iso); } catch { return iso; }
}

export default function AdminPayNow() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/admin/pay-now/revenue')
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  const downloadCsv = () => {
    if (!data) return;
    const rows = [['Session', 'Invoice', 'Invoice amount (€)', 'Service fee (€)', 'Pro', 'Paid at']];
    data.recent.forEach((r) => {
      rows.push([
        r.session_id,
        r.invoice_number || '',
        r.invoice_amount_eur.toFixed(2),
        r.service_fee_eur.toFixed(2),
        r.pro_id || '',
        formatDate(r.paid_at),
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pay-now-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !data) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="text-teal animate-spin" /></div>;
  }

  const tot = data.totals;
  return (
    <div className="space-y-6" data-testid="admin-pay-now-panel">
      {/* KPI grid */}
      <div className="admin-stat-grid">
        <StatPill icon={Banknote} label="VOLUME · YTD" value={`€${tot.volume_ytd.toLocaleString()}`} sub={`${tot.count_ytd} payments`} />
        <StatPill icon={TrendingUp} label="FEE REVENUE · YTD" value={`€${tot.fees_ytd.toFixed(2)}`} sub="1% service fee" />
        <StatPill icon={CreditCard} label="VOLUME · MTD" value={`€${tot.volume_mtd.toLocaleString()}`} sub={`€${tot.fees_mtd.toFixed(2)} fees`} />
        <StatPill icon={AlertTriangle} label="FAILED · 30d" value={tot.failed_30d} sub="abandoned/expired" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top pros */}
        <div className="admin-panel" data-testid="pay-now-top-pros">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-headings font-bold text-ink text-lg">Top earners (1% fee)</h3>
            <span className="text-xs text-ink-muted">All-time, paid only</span>
          </div>
          {data.top_pros.length === 0 ? (
            <p className="text-center text-ink-muted text-sm py-6">No data yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wider text-ink-muted border-b border-sm-border">
                  <th className="py-2">Pro</th>
                  <th className="py-2 text-right">Volume</th>
                  <th className="py-2 text-right">Fees</th>
                  <th className="py-2 text-right">#</th>
                </tr>
              </thead>
              <tbody>
                {data.top_pros.map((p) => (
                  <tr key={p.pro_id} className="border-b border-sm-border/50">
                    <td className="py-2 text-ink">{p.pro_name || p.pro_id.slice(-6)}</td>
                    <td className="py-2 text-right font-mono">€{p.volume.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono font-bold text-teal">€{p.fees.toFixed(2)}</td>
                    <td className="py-2 text-right text-ink-muted">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent activity */}
        <div className="admin-panel" data-testid="pay-now-recent">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-headings font-bold text-ink text-lg">Latest 20 paid sessions</h3>
            <button
              onClick={downloadCsv}
              className="text-xs font-bold uppercase tracking-wider text-teal hover:underline"
              data-testid="pay-now-export-csv"
            >Export CSV</button>
          </div>
          {data.recent.length === 0 ? (
            <p className="text-center text-ink-muted text-sm py-6">No paid sessions yet</p>
          ) : (
            <ul className="divide-y divide-sm-border">
              {data.recent.map((r) => (
                <li key={r.session_id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ink-soft truncate">{r.invoice_number || r.session_id.slice(-12)}</span>
                    <span className="text-sm font-bold text-ink">€{r.invoice_amount_eur.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                    <span>{formatDate(r.paid_at)}</span>
                    <span className="text-teal font-mono">+€{r.service_fee_eur.toFixed(2)} fee</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
