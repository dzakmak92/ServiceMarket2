import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  TrendingUp, Banknote, Hourglass, Calculator, FileSpreadsheet, FileDown,
  Receipt, Car, Loader2, AlertCircle, FileText, Upload, Calendar, Coins, Eye,
} from 'lucide-react';
import ScrollSnapTabStrip, { SwipeableTabPanel } from '../../components/ScrollSnapTabStrip';

const fmtEur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));
const TABS = [
  { key: 'dashboard', icon: TrendingUp, labelKey: 'tax_tab_dashboard' },
  { key: 'ustva', icon: Calculator, labelKey: 'tax_tab_ustva' },
  { key: 'eur', icon: FileSpreadsheet, labelKey: 'tax_tab_eur' },
  { key: 'mileage', icon: Car, labelKey: 'tax_tab_mileage' },
  { key: 'svs', icon: Coins, labelKey: 'tax_tab_svs' },
  { key: 'receipts', icon: Receipt, labelKey: 'tax_tab_receipts' },
  { key: 'reports', icon: FileDown, labelKey: 'tax_tab_reports' },
];

export default function TaxToolkitPage() {
  const { t } = useLang();
  const [tab, setTab] = useState('dashboard');
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState('');
  const [needsToolkit, setNeedsToolkit] = useState(false);

  useEffect(() => {
    api.get('/api/tax/dashboard?year=' + year)
      .catch((e) => {
        if (e?.response?.status === 402) setNeedsToolkit(true);
        else setError(e?.response?.data?.detail || t('error_generic'));
      });
  }, [year, t]);

  if (needsToolkit) {
    return (
      <div className="min-h-screen bg-cream pb-24 md:pb-12">
        <div className="page-container py-10 max-w-2xl text-center">
          <Calculator size={48} className="mx-auto text-teal mb-3" />
          <h1 className="text-3xl font-headings font-bold text-ink">{t('tax_needs_toolkit_title')}</h1>
          <p className="text-ink-muted mt-2 mb-6">{t('tax_needs_toolkit_body')}</p>
          <Link to="/billing" className="btn-primary inline-flex">{t('tax_get_toolkit_btn')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12">
      <div className="page-container py-8 max-w-5xl">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <Calculator size={26} className="text-teal" />
            <div>
              <h1 className="text-3xl font-headings font-bold text-ink">{t('tax_title')}</h1>
              <p className="text-ink-muted text-sm">{t('tax_subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-muted">{t('tax_year')}:</label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="sm-select text-sm"
              data-testid="tax-year-select"
            >
              {[year + 1, year, year - 1, year - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Tab strip — horizontally scrollable on mobile with scroll-snap */}
        <ScrollSnapTabStrip
          tabs={TABS.map(({ key, labelKey }) => ({ key, label: t(labelKey) }))}
          activeKey={tab}
          onChange={setTab}
          testidPrefix="tax-tab"
          variant="pills"
          className="mb-5"
        />

        {error && (
          <div className="rounded-[14px] border border-red-warn/40 bg-red-warn/10 p-3 mb-4 text-sm text-red-warn flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <SwipeableTabPanel tabKeys={TABS.map((t2) => t2.key)} activeKey={tab} onChange={setTab}>
          {tab === 'dashboard' && <DashboardTab year={year} t={t} />}
          {tab === 'ustva' && <UstvaTab year={year} t={t} />}
          {tab === 'eur' && <EurTab year={year} t={t} />}
          {tab === 'mileage' && <MileageTab year={year} t={t} />}
          {tab === 'svs' && <SvsTab year={year} t={t} />}
          {tab === 'receipts' && <ReceiptsTab year={year} t={t} />}
          {tab === 'reports' && <ReportsTab year={year} t={t} />}
        </SwipeableTabPanel>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Dashboard
// ──────────────────────────────────────────────
function DashboardTab({ year, t }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/api/tax/dashboard?year=${year}`).then((r) => setData(r.data)).catch(() => {});
  }, [year]);
  if (!data) return <div className="flex justify-center py-10"><Loader2 size={24} className="text-teal animate-spin" /></div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="tax-dashboard-grid">
        <Tile icon={TrendingUp} colour="text-teal" label={t('tax_tile_revenue')} value={fmtEur(data.revenue_brutto)} />
        <Tile icon={Banknote} colour="text-amber" label={t('tax_tile_outstanding')} value={fmtEur(data.outstanding_brutto)} />
        <Tile icon={Hourglass} colour="text-ink" label={t('tax_tile_expenses')} value={fmtEur(data.expenses_brutto)} />
        <Tile icon={Coins} colour="text-green-pos" label={t('tax_tile_profit')} value={fmtEur(data.profit_eur)} />
      </div>
      <div className="card-lg">
        <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2">{t('tax_card_ustva_current')}</p>
        <p className="text-3xl font-headings font-bold text-ink">{fmtEur(data.ust_due_this_quarter)}</p>
        <p className="text-sm text-ink-muted mt-1">
          {t('tax_card_ustva_current_help').replace('{q}', data.current_quarter)}
          {data.is_kleinunternehmer && <span className="ml-2 text-amber-deep font-semibold">· {t('tax_kleinunternehmer_pill')}</span>}
        </p>
      </div>
      <div className="card-lg text-sm text-ink-soft">
        <p>{t('tax_disclaimer')}</p>
      </div>
      <div className="flex justify-end">
        <a
          href={`${process.env.REACT_APP_BACKEND_URL}/api/tax/exports/datev-full.csv?year=${year}`}
          target="_blank" rel="noopener noreferrer"
          className="btn-ghost inline-flex items-center gap-1 text-xs"
          data-testid="tax-dashboard-datev-btn"
        >
          <FileDown size={12} /> DATEV {year}
        </a>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, colour, label, value }) {
  return (
    <div className="card-lg p-4" data-testid={`tax-tile-${label}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={colour} />
        <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">{label}</p>
      </div>
      <p className="text-xl font-headings font-bold text-ink">{value}</p>
    </div>
  );
}

// ──────────────────────────────────────────────
// USt-VA
// ──────────────────────────────────────────────
function UstvaTab({ year, t }) {
  const [quarter, setQuarter] = useState('Q1');
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/api/tax/ust-va?year=${year}&quarter=${quarter}`).then((r) => setData(r.data)).catch(() => {});
  }, [year, quarter]);
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
          <button
            key={q}
            onClick={() => setQuarter(q)}
            className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold ${quarter === q ? 'bg-teal text-paper' : 'bg-cream-soft text-ink-soft'}`}
            data-testid={`tax-ustva-q-${q}`}
          >{q}</button>
        ))}
      </div>
      {!data ? <Loader2 size={20} className="text-teal animate-spin" /> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Tile icon={TrendingUp} colour="text-teal" label={t('tax_net')} value={fmtEur(data.net)} />
            <Tile icon={Calculator} colour="text-amber" label={t('tax_vat')} value={fmtEur(data.vat)} />
            <Tile icon={Banknote} colour="text-ink" label={t('tax_brutto')} value={fmtEur(data.brutto)} />
          </div>
          <div className="card-lg">
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2">{t('tax_ustva_buckets')}</p>
            <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[340px] stack-table">
              <thead className="text-[10px] uppercase text-ink-muted">
                <tr><th className="text-left">{t('tax_rate')}</th><th className="text-right">{t('tax_net')}</th><th className="text-right">{t('tax_vat')}</th><th className="text-right">{t('tax_brutto')}</th><th className="text-right">#</th></tr>
              </thead>
              <tbody>
                {Object.entries(data.buckets).map(([rate, b]) => (
                  <tr key={rate} className="border-t border-sm-border">
                    <td className="py-2 font-mono" data-label={t('tax_rate')}>{rate}%</td>
                    <td className="text-right" data-label={t('tax_net')}>{fmtEur(b.net)}</td>
                    <td className="text-right" data-label={t('tax_vat')}>{fmtEur(b.vat)}</td>
                    <td className="text-right font-semibold" data-label={t('tax_brutto')}>{fmtEur(b.brutto)}</td>
                    <td className="text-right text-ink-muted" data-label="#">{b.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <a
            href={`${process.env.REACT_APP_BACKEND_URL}/api/tax/exports/revenue.csv?year=${year}&quarter=${quarter}`}
            target="_blank" rel="noopener noreferrer"
            className="btn-ghost text-xs inline-flex"
            data-testid="tax-ustva-export-csv"
          >
            <FileDown size={12} /> {t('tax_export_csv').replace('{kind}', 'DATEV')}
          </a>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// EÜR (annual P&L)
// ──────────────────────────────────────────────
function EurTab({ year, t }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/api/tax/eur?year=${year}`).then((r) => setData(r.data)).catch(() => {});
  }, [year]);
  if (!data) return <div className="flex justify-center py-10"><Loader2 size={20} className="text-teal animate-spin" /></div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Tile icon={TrendingUp} colour="text-green-pos" label={t('tax_revenue')} value={fmtEur(data.revenue.paid_brutto)} />
        <Tile icon={Hourglass} colour="text-red-warn" label={t('tax_expenses')} value={fmtEur(data.expenses.brutto)} />
        <Tile icon={Coins} colour="text-teal" label={t('tax_profit')} value={fmtEur(data.profit_eur)} />
      </div>
      <div className="card-lg">
        <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2">{t('tax_expenses_by_kind')}</p>
        <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[260px] stack-table">
          <thead className="text-[10px] uppercase text-ink-muted">
            <tr><th className="text-left">{t('tax_kind')}</th><th className="text-right">{t('tax_brutto')}</th><th className="text-right">#</th></tr>
          </thead>
          <tbody>
            {Object.entries(data.expenses.by_kind || {}).map(([k, b]) => (
              <tr key={k} className="border-t border-sm-border">
                <td className="py-2 capitalize" data-label={t('tax_kind')}>{k}</td>
                <td className="text-right" data-label={t('tax_brutto')}>{fmtEur(b.brutto)}</td>
                <td className="text-right text-ink-muted" data-label="#">{b.count}</td>
              </tr>
            ))}
            {Object.keys(data.expenses.by_kind || {}).length === 0 && (
              <tr><td colSpan="3" className="text-center text-ink-muted py-4 text-xs">{t('tax_no_expenses')}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <a
          href={`${process.env.REACT_APP_BACKEND_URL}/api/tax/exports/revenue.csv?year=${year}`}
          target="_blank" rel="noopener noreferrer"
          className="btn-ghost text-xs inline-flex"
          data-testid="tax-eur-export-revenue"
        ><FileDown size={12} /> {t('tax_export_revenue_csv')}</a>
        <a
          href={`${process.env.REACT_APP_BACKEND_URL}/api/tax/exports/expenses.csv?year=${year}`}
          target="_blank" rel="noopener noreferrer"
          className="btn-ghost text-xs inline-flex"
          data-testid="tax-eur-export-expenses"
        ><FileDown size={12} /> {t('tax_export_expenses_csv')}</a>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Mileage book
// ──────────────────────────────────────────────
function MileageTab({ year, t }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/api/tax/mileage?year=${year}`).then((r) => setData(r.data)).catch(() => {});
  }, [year]);
  if (!data) return <div className="flex justify-center py-10"><Loader2 size={20} className="text-teal animate-spin" /></div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Tile icon={Car} colour="text-teal" label={t('tax_trips')} value={data.trip_count} />
        <Tile icon={TrendingUp} colour="text-ink" label={t('tax_estimated_km')} value={data.total_estimated_km + ' km'} />
        <Tile icon={Coins} colour="text-green-pos" label={t('tax_mileage_total')} value={fmtEur(data.total_eur)} />
      </div>
      <div className="card-lg">
        <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[360px] stack-table">
          <thead className="text-[10px] uppercase text-ink-muted">
            <tr><th className="text-left">{t('tax_th_date')}</th><th className="text-left">{t('tax_th_job')}</th><th className="text-left">{t('tax_th_city')}</th><th className="text-right">km</th><th className="text-right">€</th></tr>
          </thead>
          <tbody>
            {data.trips.map((trip, i) => (
              <tr key={i} className="border-t border-sm-border">
                <td className="py-2 whitespace-nowrap" data-label={t('tax_th_date')}>{trip.date ? new Date(trip.date).toLocaleDateString('de-AT') : '—'}</td>
                <td className="text-ink-soft truncate max-w-[120px]" data-label={t('tax_th_job')}>{trip.job_title}</td>
                <td className="text-ink-soft whitespace-nowrap" data-label={t('tax_th_city')}>{trip.city}</td>
                <td className="text-right" data-label="km">{trip.estimated_km}</td>
                <td className="text-right font-semibold" data-label="€">{fmtEur(trip.travel_cost_eur)}</td>
              </tr>
            ))}
            {data.trips.length === 0 && (
              <tr><td colSpan="5" className="text-center text-ink-muted py-4 text-xs">{t('tax_no_trips')}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// SVS + Einkommensteuer simulator
// ──────────────────────────────────────────────
function SvsTab({ year, t }) {
  const [svs, setSvs] = useState(null);
  const [est, setEst] = useState(null);
  const [profitOverride, setProfitOverride] = useState('');
  useEffect(() => {
    const q = profitOverride ? `&profit_eur=${profitOverride}` : '';
    api.get(`/api/tax/svs?year=${year}${q}`).then((r) => setSvs(r.data)).catch(() => {});
    const qe = profitOverride ? `&taxable_profit_eur=${profitOverride}` : '';
    api.get(`/api/tax/income-tax?year=${year}${qe}`).then((r) => setEst(r.data)).catch(() => {});
  }, [year, profitOverride]);
  return (
    <div className="space-y-4">
      <div className="card-lg flex items-center gap-3 flex-wrap">
        <label className="text-sm text-ink-soft">{t('tax_profit_override')}:</label>
        <input
          type="number"
          step="100"
          value={profitOverride}
          onChange={(e) => setProfitOverride(e.target.value)}
          className="sm-input w-32 text-sm"
          placeholder={t('tax_profit_auto')}
          data-testid="tax-profit-override"
        />
      </div>
      {svs && (
        <div className="card-lg">
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2">{t('tax_svs_title')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-[10px] uppercase text-ink-muted">{t('tax_svs_pension')}</p><p className="font-bold text-ink">{fmtEur(svs.pension_eur)}</p></div>
            <div><p className="text-[10px] uppercase text-ink-muted">{t('tax_svs_health')}</p><p className="font-bold text-ink">{fmtEur(svs.health_eur)}</p></div>
            <div><p className="text-[10px] uppercase text-ink-muted">{t('tax_svs_accident')}</p><p className="font-bold text-ink">{fmtEur(svs.accident_eur)}</p></div>
            <div><p className="text-[10px] uppercase text-ink-muted">{t('tax_svs_total')}</p><p className="font-bold text-teal">{fmtEur(svs.total_eur)}/y · {fmtEur(svs.monthly_eur)}/m</p></div>
          </div>
        </div>
      )}
      {est && (
        <div className="card-lg">
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2">{t('tax_est_title')}</p>
          <div className="grid grid-cols-3 gap-3 text-sm mb-3">
            <div><p className="text-[10px] uppercase text-ink-muted">{t('tax_est_profit')}</p><p className="font-bold text-ink">{fmtEur(est.taxable_profit_eur)}</p></div>
            <div><p className="text-[10px] uppercase text-ink-muted">{t('tax_est_tax')}</p><p className="font-bold text-red-warn">{fmtEur(est.estimated_tax_eur)}</p></div>
            <div><p className="text-[10px] uppercase text-ink-muted">{t('tax_est_eff_rate')}</p><p className="font-bold text-ink">{est.effective_rate_pct}%</p></div>
          </div>
          <table className="w-full text-xs overflow-x-auto block" style={{display:'block', overflowX:'auto'}}>
            <thead className="text-[10px] uppercase text-ink-muted"><tr><th className="text-left">{t('tax_est_bracket')}</th><th className="text-right">{t('tax_est_rate')}</th><th className="text-right">{t('tax_est_slice')}</th><th className="text-right">{t('tax_est_owed')}</th></tr></thead>
            <tbody>
              {est.brackets.map((b, i) => (
                <tr key={i} className="border-t border-sm-border">
                  <td className="py-1.5">≤ €{Number.isFinite(b.upper) ? Math.round(b.upper).toLocaleString('de-AT') : '∞'}</td>
                  <td className="text-right">{b.rate_pct}%</td>
                  <td className="text-right">{fmtEur(b.slice_eur)}</td>
                  <td className="text-right font-semibold">{fmtEur(b.tax_eur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Receipts (with optional OCR upload)
// ──────────────────────────────────────────────
function ReceiptsTab({ year, t }) {
  const [receipts, setReceipts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const load = () => api.get(`/api/tax/receipts?year=${year}`).then((r) => setReceipts(r.data.receipts || [])).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post('/api/tax/receipts', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      e.target.value = '';
      load();
    } catch (ex) {
      setError(ex?.response?.data?.detail || t('error_generic'));
    } finally { setUploading(false); }
  };
  return (
    <div className="space-y-4">
      <div className="card-lg">
        <label className="block">
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2 flex items-center gap-2"><Upload size={12} /> {t('tax_upload_receipt')}</p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/heic,application/pdf"
            onChange={handleFile}
            disabled={uploading}
            className="block w-full text-xs"
            data-testid="tax-receipt-upload"
          />
          {uploading && <Loader2 size={14} className="animate-spin text-teal mt-2" />}
          {error && <p className="text-xs text-red-warn mt-2">{error}</p>}
          <p className="text-[11px] text-ink-muted mt-2">{t('tax_upload_help')}</p>
        </label>
      </div>
      <div className="space-y-2">
        {receipts.map((r) => (
          <div key={r.id} className="card-lg" data-testid={`tax-receipt-${r.id}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-semibold text-ink">{r.vendor || t('tax_unknown_vendor')}</p>
                <p className="text-xs text-ink-muted">
                  {r.receipt_date ? new Date(r.receipt_date).toLocaleDateString() : '—'}
                  {r.category && <span className="ml-2">· {r.category}</span>}
                  {r.vat_rate != null && <span className="ml-2">· {r.vat_rate}%</span>}
                </p>
              </div>
              {r.amount_brutto != null && <p className="font-bold text-ink">{fmtEur(r.amount_brutto)}</p>}
            </div>
          </div>
        ))}
        {receipts.length === 0 && <p className="text-center text-ink-muted py-6 text-sm">{t('tax_no_receipts')}</p>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Reports
// ──────────────────────────────────────────────
function ReportsTab({ year, t }) {
  const [accountantToken, setAccountantToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [datevQuarter, setDatevQuarter] = useState('');
  const BASE = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => {
    api.get('/api/tax/accountant-share').then((r) => setAccountantToken(r.data.accountant_token)).catch(() => {});
  }, []);

  const issue = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/api/tax/accountant-share');
      setAccountantToken(data.accountant_token);
    } finally { setBusy(false); }
  };
  const revoke = async () => {
    setBusy(true);
    try {
      await api.delete('/api/tax/accountant-share');
      setAccountantToken(null);
    } finally { setBusy(false); }
  };
  const copy = async () => {
    const url = `${window.location.origin}/accountant/${accountantToken}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const qParam = datevQuarter ? `&quarter=${datevQuarter}` : '';

  return (
    <div className="space-y-3">
      {/* Year-end PDF + basic CSVs */}
      <div className="card-lg">
        <p className="text-sm text-ink-soft mb-3">{t('tax_reports_help')}</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${BASE}/api/tax/year-end.pdf?year=${year}`}
            target="_blank" rel="noopener noreferrer"
            className="btn-primary inline-flex text-xs"
            data-testid="tax-year-pdf"
          ><FileText size={12} /> {t('tax_year_pdf').replace('{y}', year)}</a>
          <a
            href={`${BASE}/api/tax/exports/revenue.csv?year=${year}`}
            target="_blank" rel="noopener noreferrer"
            className="btn-ghost inline-flex text-xs"
          ><FileDown size={12} /> {t('tax_export_revenue_csv')}</a>
          <a
            href={`${BASE}/api/tax/exports/expenses.csv?year=${year}`}
            target="_blank" rel="noopener noreferrer"
            className="btn-ghost inline-flex text-xs"
          ><FileDown size={12} /> {t('tax_export_expenses_csv')}</a>
        </div>
      </div>

      {/* ── DATEV Export card ── */}
      <div className="card-lg border-l-4 border-teal" data-testid="datev-export-card">
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet size={14} className="text-teal" />
          <p className="text-sm font-headings font-bold text-ink">{t('tax_datev_title')}</p>
          <span className="ml-auto text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-teal/10 text-teal uppercase">DATEV EXTF v700</span>
        </div>
        <p className="text-xs text-ink-muted mb-3">{t('tax_datev_help')}</p>

        {/* Quarter filter */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-ink-muted">{t('tax_datev_period')}:</span>
          <button
            onClick={() => setDatevQuarter('')}
            className={`px-3 py-1 rounded-[8px] text-xs font-semibold transition-colors ${datevQuarter === '' ? 'bg-teal text-paper' : 'bg-cream-soft text-ink-soft hover:bg-cream'}`}
            data-testid="datev-period-full"
          >{t('tax_datev_full_year').replace('{y}', year)}</button>
          {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
            <button
              key={q}
              onClick={() => setDatevQuarter(q)}
              className={`px-3 py-1 rounded-[8px] text-xs font-semibold transition-colors ${datevQuarter === q ? 'bg-teal text-paper' : 'bg-cream-soft text-ink-soft hover:bg-cream'}`}
              data-testid={`datev-period-${q}`}
            >{q}</button>
          ))}
        </div>

        {/* Download buttons */}
        <div className="flex flex-wrap gap-2">
          <a
            href={`${BASE}/api/tax/exports/datev-full.csv?year=${year}${qParam}`}
            target="_blank" rel="noopener noreferrer"
            className="btn-primary inline-flex items-center gap-1 text-xs"
            data-testid="datev-full-export-btn"
          >
            <FileDown size={12} /> {t('tax_datev_btn_full')}
          </a>
          <a
            href={`${BASE}/api/tax/exports/revenue.csv?year=${year}${qParam}`}
            target="_blank" rel="noopener noreferrer"
            className="btn-ghost inline-flex items-center gap-1 text-xs"
            data-testid="datev-revenue-btn"
          >
            <FileDown size={12} /> {t('tax_datev_btn_revenue')}
          </a>
          <a
            href={`${BASE}/api/tax/exports/expenses.csv?year=${year}${qParam}`}
            target="_blank" rel="noopener noreferrer"
            className="btn-ghost inline-flex items-center gap-1 text-xs"
            data-testid="datev-expenses-btn"
          >
            <FileDown size={12} /> {t('tax_datev_btn_expenses')}
          </a>
        </div>

        <p className="text-[10px] text-ink-muted mt-3 leading-relaxed">{t('tax_datev_note')}</p>
      </div>

      {/* Accountant share */}
      <div className="card-lg" data-testid="tax-accountant-card">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={14} className="text-teal" />
          <p className="text-sm font-headings font-bold text-ink">{t('tax_accountant_title')}</p>
        </div>
        <p className="text-sm text-ink-muted mb-3">{t('tax_accountant_help')}</p>
        {accountantToken ? (
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs bg-cream-soft px-3 py-2 rounded-[10px] border border-sm-border flex-1 min-w-[260px] break-all" data-testid="tax-accountant-url">
              {window.location.origin}/accountant/{accountantToken}
            </code>
            <button onClick={copy} className="btn-ghost text-xs" data-testid="tax-accountant-copy">{copied ? '✓' : t('tax_accountant_copy')}</button>
            <a href={`/accountant/${accountantToken}`} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs"><Eye size={12} /> {t('tax_accountant_open')}</a>
            <button onClick={issue} disabled={busy} className="btn-ghost text-xs">{busy ? <Loader2 size={12} className="animate-spin" /> : '↺'} {t('tax_accountant_rotate')}</button>
            <button onClick={revoke} disabled={busy} className="btn-ghost text-xs text-red-warn" data-testid="tax-accountant-revoke">
              {busy ? <Loader2 size={12} className="animate-spin" /> : '✕'} {t('tax_accountant_revoke')}
            </button>
          </div>
        ) : (
          <button onClick={issue} disabled={busy} className="btn-primary text-xs" data-testid="tax-accountant-issue">
            {busy ? <Loader2 size={12} className="animate-spin" /> : '+'} {t('tax_accountant_issue')}
          </button>
        )}
      </div>

      <div className="card-lg">
        <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2 flex items-center gap-1"><Calendar size={12} /> {t('tax_ustva_deadlines')}</p>
        <ul className="text-sm space-y-1">
          <li>· Q1 (Jan–Mar) → <b>15. April</b></li>
          <li>· Q2 (Apr–Jun) → <b>15. Juli</b></li>
          <li>· Q3 (Jul–Sep) → <b>15. Oktober</b></li>
          <li>· Q4 (Okt–Dez) → <b>15. Januar</b> ({year + 1})</li>
        </ul>
        <p className="text-[11px] text-ink-muted mt-2">{t('tax_ustva_deadlines_help')}</p>
      </div>
    </div>
  );
}
