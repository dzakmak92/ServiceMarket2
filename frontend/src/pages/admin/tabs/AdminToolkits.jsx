import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import {
  Loader2, FileText, Calculator, FolderKanban, Sparkles, Users, TrendingUp, RotateCcw, X, Rocket,
} from 'lucide-react';
import { Switch } from '../../../components/ui/switch';

function ExplorerToggleCard({ t }) {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const reload = useCallback(() => {
    api.get('/api/admin/platform-settings').then(r => setCfg(r.data)).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);
  if (!cfg) return null;
  const toggle = async (val) => {
    setSaving(true);
    try {
      const { data } = await api.patch('/api/admin/platform-settings', { explorer_enabled: val });
      setCfg(c => ({ ...c, explorer_enabled: data.explorer_enabled }));
    } finally { setSaving(false); }
  };
  return (
    <div className="admin-panel" data-testid="admin-explorer-toggle">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center text-paper flex-shrink-0" style={{ background: '#2d6a7f' }}>
            <Rocket size={16} />
          </span>
          <div>
            <h3 className="font-headings font-bold text-ink text-base">{t('admin_explorer_title')}</h3>
            <p className="text-xs text-ink-muted mt-1 max-w-xl">{t('admin_explorer_desc')}</p>
          </div>
        </div>
        <Switch
          checked={!!cfg.explorer_enabled}
          onCheckedChange={toggle}
          disabled={saving}
          data-testid="admin-explorer-switch"
        />
      </div>
      <div className="flex items-center gap-4 mt-4 flex-wrap">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.explorer_enabled ? 'bg-green-pos/15 text-green-pos' : 'bg-ink-muted/15 text-ink-muted'}`}
              data-testid="admin-explorer-status">
          {cfg.explorer_enabled ? t('admin_explorer_on') : t('admin_explorer_off')}
        </span>
        <span className="text-xs text-ink-muted">{t('adm_new_pros_30')} <strong className="text-ink">{cfg.new_pros_30d}</strong></span>
        <span className="text-xs text-ink-muted">{t('adm_new_pros_7')} <strong className="text-ink">{cfg.new_pros_7d}</strong></span>
        <span className="text-xs text-ink-muted">{t('adm_on_explorer')} <strong className="text-ink">{cfg.explorer_active_count}</strong></span>
      </div>
    </div>
  );
}

function StatPill({ label, value, sub }) {
  return (
    <div className="admin-stat">
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value}</div>
      {sub && <div className="admin-stat-trend">{sub}</div>}
    </div>
  );
}

function ToolkitCard({ icon: Icon, name, data, accent, bundleSubs }) {
  const { t } = useLang();
  if (!data) return null;
  const fullyBundled = bundleSubs != null && bundleSubs > 0 && bundleSubs === data.subs && name !== 'Bundle';
  return (
    <div className="admin-panel" data-testid={`toolkit-card-${name.toLowerCase()}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-paper`}
                style={{ background: accent }}>
            <Icon size={16} />
          </span>
          <h3 className="font-headings font-bold text-ink text-base">{name}</h3>
          {fullyBundled && (
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-green-pos/15 text-green-pos"
                  title={t('adm_bundled_hint')}
                  data-testid={`toolkit-card-${name.toLowerCase()}-bundled`}>
              {t('adm_bundled')}
            </span>
          )}
        </div>
        <span className="text-xs font-bold text-ink-muted">{t('adm_adoption', { p: data.conversion_pct })}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{t('adm_subs')}</p>
          <p className="font-headings font-bold text-2xl text-ink">{data.subs}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">MRR</p>
          <p className="font-headings font-bold text-2xl text-ink">€{data.mrr.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Std / Pro</p>
          <p className="font-headings font-bold text-2xl text-ink">{data.standard_tier}/{data.pro_tier}</p>
        </div>
      </div>
      {fullyBundled && (
        <p className="text-xs text-ink-muted mt-2">{t('adm_all_bundled', { n: data.subs })}</p>
      )}
    </div>
  );
}

function OcrPanel() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/api/admin/tax/ocr-audit').then(r => setData(r.data)).catch(() => {});
  }, []);
  if (!data) return null;
  // Renamed from `t`: that is the translator's name everywhere else in the
  // file, and a local one here would be called as a function on first render.
  const tot = data.totals;
  return (
    <div className="admin-panel" data-testid="admin-ocr-panel">
      <h3 className="font-headings font-bold text-ink text-lg mb-1">{t('adm_ocr_title')}</h3>
      <p className="text-xs text-ink-muted mb-4">{t('adm_ocr_sub', { c: data.per_receipt_cost_eur })}</p>
      <div className="admin-stat-grid mb-4">
        <StatPill label="ALL RECEIPTS" value={tot.all_receipts} sub={`€${tot.est_cost_all_eur.toFixed(2)} est. cost`} />
        <StatPill label="THIS MONTH" value={tot.mtd_receipts} sub={`€${tot.est_cost_mtd_eur.toFixed(2)} est. cost`} />
        <StatPill label="AVG CONFIDENCE" value={`${(tot.avg_confidence * 100).toFixed(0)}%`} sub="across all scans" />
        <StatPill label="TOP USERS" value={data.top_users.length} sub="active uploaders" />
      </div>
      {data.top_users.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-sm" data-testid="admin-ocr-top-users">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-ink-muted border-b border-sm-border">
                <th className="py-2">Pro</th>
                <th className="py-2 text-right">{t('adm_receipts')}</th>
                <th className="py-2 text-right">{t('adm_est_cost')}</th>
              </tr>
            </thead>
            <tbody>
              {data.top_users.map(u => (
                <tr key={u.user_id} className="border-b border-sm-border/50">
                  <td className="py-2 text-ink">{u.name}</td>
                  <td className="py-2 text-right font-mono">{u.count}</td>
                  <td className="py-2 text-right font-mono">€{u.est_cost_eur.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RefundModal({ pro, toolkit, onClose, onDone }) {
  const { t } = useLang();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/admin/toolkits/refund', {
        pro_id: pro.pro_id, toolkit, reason,
      });
      onDone(r.data);
    } catch (e) {
      onDone({ error: e?.response?.data?.detail || 'Failed' });
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-testid="refund-modal">
      <div className="bg-paper rounded-2xl max-w-md w-full p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-headings font-bold text-ink text-lg">{t('adm_refund_title', { t: toolkit })}</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <p className="text-sm text-ink-soft mb-3">
          {t('adm_refund_body', { name: pro.pro_name })}
        </p>
        <textarea
          className="admin-input w-full"
          rows={3}
          placeholder="Reason (mandatory for audit log)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          data-testid="refund-reason-input"
        />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-sm-border text-sm" disabled={busy}>{t('btn_cancel')}</button>
          <button
            onClick={submit}
            disabled={busy || reason.length < 3}
            className="px-4 py-1.5 rounded-lg bg-red-warn text-paper text-sm font-bold disabled:opacity-50"
            data-testid="refund-confirm-btn"
          >
            {busy ? 'Refunding…' : 'Refund + disable'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminToolkits({ flash }) {
  const { t } = useLang();
  const [dashboard, setDashboard] = useState(null);
  const [shareTokens, setShareTokens] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refundTarget, setRefundTarget] = useState(null); // {pro, toolkit}
  const [subscribers, setSubscribers] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/admin/toolkits/dashboard'),
      api.get('/api/admin/share-tokens/audit'),
      api.get('/api/admin/pros?has_toolkit=1').catch(() => ({ data: { items: [] } })),
    ])
      .then(([d, st, sub]) => {
        setDashboard(d.data);
        setShareTokens(st.data);
        setSubscribers(sub.data?.items || []);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading || !dashboard) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="text-teal animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <ExplorerToggleCard t={t} />

      <div className="admin-stat-grid">
        <StatPill label="TOTAL PROS" value={dashboard.total_pros} sub="all tradespeople" />
        <StatPill label="TOTAL TOOLKIT MRR" value={`€${dashboard.total_mrr.toFixed(2)}`} sub="recurring net" />
        <StatPill label="NEW SUBS · 30d" value={dashboard.new_subs_30d} sub="recent acquisitions" />
        <StatPill label="BUNDLE SUBSCRIBERS" value={dashboard.toolkits.bundle.subs} sub="all-3 toolkit pros" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ToolkitCard icon={FileText} name="Invoice" data={dashboard.toolkits.invoice} accent="#2d6a7f" bundleSubs={dashboard.toolkits.bundle.subs} />
        <ToolkitCard icon={Calculator} name="Tax" data={dashboard.toolkits.tax} accent="#9c6f1a" bundleSubs={dashboard.toolkits.bundle.subs} />
        <ToolkitCard icon={FolderKanban} name="PM" data={dashboard.toolkits.pm} accent="#5a3d8a" bundleSubs={dashboard.toolkits.bundle.subs} />
        <ToolkitCard icon={Sparkles} name="Bundle" data={dashboard.toolkits.bundle} accent="#2f7a4a" />
      </div>

      <OcrPanel />

      {/* Share tokens audit */}
      <div className="admin-panel" data-testid="admin-share-tokens">
        <h3 className="font-headings font-bold text-ink text-lg mb-3">{t('adm_tokens_title')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatPill label="PM CUSTOMER" value={shareTokens.totals.pm_customer} />
          <StatPill label="PM SUB-CONTRACTOR" value={shareTokens.totals.pm_sub} />
          <StatPill label="TAX ACCOUNTANT" value={shareTokens.totals.tax_accountant} />
          <StatPill label="PAY-LINK" value={shareTokens.totals.pay_link} />
        </div>
        {shareTokens.pay_links.length > 0 && (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wider text-ink-muted border-b border-sm-border">
                  <th className="py-2">{t('adm_kind')}</th>
                  <th className="py-2">{t('adm_reference')}</th>
                  <th className="py-2 text-right">{t('adm_outstanding')}</th>
                  <th className="py-2 text-right">{t('adm_action')}</th>
                </tr>
              </thead>
              <tbody>
                {shareTokens.pay_links.map((p) => (
                  <tr key={p.invoice_id} className="border-b border-sm-border/50" data-testid={`pay-link-row-${p.invoice_id}`}>
                    <td className="py-2 text-ink-muted text-xs font-bold uppercase">PAY-LINK</td>
                    <td className="py-2 text-ink font-mono">{p.invoice_number}</td>
                    <td className="py-2 text-right font-mono">€{p.outstanding_eur.toFixed(2)}</td>
                    <td className="py-2 text-right">
                      <button
                        className="text-red-warn text-xs font-bold uppercase tracking-wider hover:underline"
                        data-testid={`revoke-pay-link-${p.invoice_id}`}
                        onClick={async () => {
                          if (!window.confirm(t('adm_revoke_confirm'))) return;
                          await api.post('/api/admin/share-tokens/revoke', { kind: 'pay_link', invoice_id: p.invoice_id });
                          flash?.('Pay-link revoked');
                          load();
                        }}
                      >{t('adm_revoke')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Subscribers list with force-disable / refund */}
      {subscribers.length > 0 && (
        <div className="admin-panel" data-testid="admin-toolkit-subscribers">
          <h3 className="font-headings font-bold text-ink text-lg mb-1">{t('adm_subscribers')}</h3>
          <p className="text-xs text-ink-muted mb-3">Force-disable a toolkit + refund the latest cycle. Audited.</p>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wider text-ink-muted border-b border-sm-border">
                  <th className="py-2">Pro</th>
                  <th className="py-2">{t('admin_th_invoice')}</th>
                  <th className="py-2">{t('nav_tax')}</th>
                  <th className="py-2">PM</th>
                  <th className="py-2 text-right">{t('admin_th_plan')}</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((p) => (
                  <tr key={p.pro_id} className="border-b border-sm-border/50">
                    <td className="py-2 text-ink">{p.pro_name}</td>
                    <td className="py-2">{p.has_invoice_toolkit ? <button onClick={() => setRefundTarget({ pro: p, toolkit: 'invoice' })} className="text-red-warn font-bold text-xs" data-testid={`refund-invoice-${p.pro_id}`}>{t('adm_refund')}</button> : '—'}</td>
                    <td className="py-2">{p.has_tax_toolkit ? <button onClick={() => setRefundTarget({ pro: p, toolkit: 'tax' })} className="text-red-warn font-bold text-xs" data-testid={`refund-tax-${p.pro_id}`}>{t('adm_refund')}</button> : '—'}</td>
                    <td className="py-2">{p.has_pm_toolkit ? <button onClick={() => setRefundTarget({ pro: p, toolkit: 'pm' })} className="text-red-warn font-bold text-xs" data-testid={`refund-pm-${p.pro_id}`}>{t('adm_refund')}</button> : '—'}</td>
                    <td className="py-2 text-right text-xs font-bold uppercase">{p.plan_tier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {refundTarget && (
        <RefundModal
          pro={refundTarget.pro}
          toolkit={refundTarget.toolkit}
          onClose={() => setRefundTarget(null)}
          onDone={(res) => {
            setRefundTarget(null);
            if (res.error) flash?.(`Refund failed: ${res.error}`);
            else flash?.(`Refunded (Stripe: ${res.refund_status})`);
            load();
          }}
        />
      )}
    </div>
  );
}
