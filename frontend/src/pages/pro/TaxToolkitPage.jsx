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
// Belege — the expense ledger the EÜR is computed from
// ──────────────────────────────────────────────
/**
 * Entering an expense.
 *
 * This tab existed and did nothing. It POSTed multipart/form-data at
 * /api/tax/receipts, which is a JSON endpoint taking an ExpenseIn — every
 * upload 422'd. It read `data.receipts`, and the payload key is `expenses` —
 * so the list was empty even when rows existed. It rendered `receipt_date`
 * and `amount_brutto`, and the columns are `expense_date` and `gross_amount`
 * — so a row that did arrive showed a blank date and no figure. Three
 * independent mismatches, all invisible, and between them no expense could
 * ever be recorded from the UI.
 *
 * The consequence was not a broken tab. It was that the EÜR reported income
 * against zero expenses and the USt-VA claimed no input VAT — numbers that
 * are confidently wrong rather than obviously missing, on the screen a
 * tradesperson hands to their accountant.
 *
 * There is no OCR endpoint in this deployment and photo estimation is out of
 * scope, so the form is typed. The receipt image is uploaded separately and
 * attached by `storage_ref`: §132 BAO wants the document kept for seven
 * years, and that is served by storing it, not by reading it.
 */
function ReceiptsTab({ year, t }) {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const blank = () => ({
    expense_date: new Date().toISOString().slice(0, 10),
    vendor: '', category: 'Material', description: '',
    gross_amount: '', vat_rate: 20, vat_deductible: true,
    payment_method: 'card', job_id: '',
    storage_ref: null, filename: null,
  });
  const [form, setForm] = useState(blank());

  const load = async () => {
    setLoading(true);
    try {
      const [{ data }, { data: cats }] = await Promise.all([
        api.get(`/api/tax/expenses?year=${year}&limit=500`),
        api.get('/api/tax/expense-categories').catch(() => ({ data: { categories: [] } })),
      ]);
      setRows(data.expenses || []);
      setCategories(cats.categories || []);
    } catch (e) {
      setError(e?.response?.data?.detail || t('error_generic'));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    api.get('/api/jobs', { params: { limit: 100 } })
      .then((r) => setJobs(r.data.jobs || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // The image goes through the generic upload route, which is what stores a
  // file in this application. Only the ref is kept — a row holding a signed
  // URL renders a broken image an hour later.
  const attach = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'receipt');
      const { data } = await api.post('/api/uploads', fd,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm((f) => ({ ...f, storage_ref: data.storage_ref, filename: data.filename }));
    } catch (ex) {
      setError(ex?.response?.data?.detail || t('error_generic'));
    } finally { e.target.value = ''; }
  };

  const startEdit = (r) => {
    setEditing(r.id);
    setForm({
      expense_date: (r.expense_date || '').slice(0, 10),
      vendor: r.vendor || '', category: r.category || 'Sonstige',
      description: r.description || '',
      gross_amount: r.gross_amount ?? '', vat_rate: r.vat_rate ?? 20,
      vat_deductible: r.vat_deductible !== false,
      payment_method: r.payment_method || 'card',
      job_id: r.job_id || '',
      storage_ref: r.storage_ref || null, filename: r.filename || null,
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.gross_amount) return;
    setSaving(true); setError('');
    // gross, not net: a tradesperson reads the Brutto off the paper in their
    // hand. The server derives net and VAT from it.
    const body = {
      expense_date: form.expense_date,
      vendor: form.vendor.trim() || undefined,
      category: form.category,
      description: form.description.trim() || undefined,
      gross_amount: Number(form.gross_amount),
      vat_rate: Number(form.vat_rate),
      vat_deductible: !!form.vat_deductible,
      payment_method: form.payment_method || undefined,
      job_id: form.job_id || undefined,
      storage_ref: form.storage_ref || undefined,
      filename: form.filename || undefined,
    };
    try {
      if (editing) await api.patch(`/api/tax/expenses/${editing}`, body);
      else await api.post('/api/tax/expenses', body);
      setOpen(false); setEditing(null); setForm(blank());
      await load();
    } catch (ex) {
      setError(ex?.response?.data?.detail || t('error_generic'));
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    setBusyId(id); setError('');
    try {
      await api.delete(`/api/tax/expenses/${id}`);
      await load();
    } catch (ex) {
      setError(ex?.response?.data?.detail || t('error_generic'));
    } finally { setBusyId(null); }
  };

  const total = useMemo(
    () => rows.reduce((s, r) => s + Number(r.gross_amount || 0), 0), [rows]);
  const deductibleVat = useMemo(
    () => rows.reduce((s, r) => s + (r.vat_deductible === false ? 0 : Number(r.vat_amount || 0)), 0),
    [rows]);

  return (
    <div className="space-y-4">
      <div className="card-lg flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">
            {t('tax_expenses_total')} {year}
          </p>
          <p className="font-headings font-bold text-ink text-xl" data-testid="tax-expense-total">
            {fmtEur(total)}
          </p>
          <p className="text-[11px] text-ink-muted">
            {t('tax_expenses_input_vat')}: {fmtEur(deductibleVat)} · {rows.length} {t('tax_tab_receipts')}
          </p>
        </div>
        <button type="button" className="btn-primary text-sm"
                onClick={() => { setEditing(null); setForm(blank()); setOpen((o) => !o); }}
                data-testid="tax-expense-new">
          {open ? t('cancel') : t('tax_expense_add')}
        </button>
      </div>

      {error && (
        <div className="card flex items-start gap-2 text-sm text-red-warn" data-testid="tax-expense-error">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="card-lg space-y-3" data-testid="tax-expense-form">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-ink-muted">{t('date')}</span>
              <input type="date" required className="input w-full" value={form.expense_date}
                     onChange={(e) => set('expense_date', e.target.value)}
                     data-testid="tax-expense-date" />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">{t('tax_expense_vendor')}</span>
              <input className="input w-full" value={form.vendor}
                     placeholder="Baumarkt" onChange={(e) => set('vendor', e.target.value)}
                     data-testid="tax-expense-vendor" />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-ink-muted">{t('tax_expense_gross')} *</span>
              <input type="number" step="0.01" min="0" required className="input w-full"
                     value={form.gross_amount}
                     onChange={(e) => set('gross_amount', e.target.value)}
                     data-testid="tax-expense-gross" />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">{t('vat')} %</span>
              <select className="input w-full" value={form.vat_rate}
                      onChange={(e) => set('vat_rate', e.target.value)}
                      data-testid="tax-expense-vat">
                {[20, 13, 10, 0].map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">{t('category')}</span>
              <select className="input w-full" value={form.category}
                      onChange={(e) => set('category', e.target.value)}
                      data-testid="tax-expense-category">
                {categories.map((cx) => <option key={cx} value={cx}>{cx}</option>)}
              </select>
            </label>
          </div>

          <input className="input w-full" placeholder={t('description')} value={form.description}
                 onChange={(e) => set('description', e.target.value)} />

          <div className="grid grid-cols-2 gap-3">
            <select className="input" value={form.payment_method}
                    onChange={(e) => set('payment_method', e.target.value)}>
              {['card', 'transfer', 'sepa', 'cash', 'sofort', 'other'].map((m) => (
                <option key={m} value={m}>{t(`pay_${m}`)}</option>
              ))}
            </select>
            <select className="input" value={form.job_id}
                    onChange={(e) => set('job_id', e.target.value)}
                    data-testid="tax-expense-job">
              <option value="">{t('tax_expense_no_job')}</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_number ? `${j.job_number} · ` : ''}{j.title}
                </option>
              ))}
            </select>
          </div>

          {/* Input VAT is only reclaimable against a valid supplier invoice —
              a Kassabon without a UID above the small-amount threshold is not
              one, and claiming it is the pro's exposure, not ours. */}
          <label className="flex items-start gap-2 text-xs text-ink-muted">
            <input type="checkbox" checked={form.vat_deductible} className="mt-0.5"
                   onChange={(e) => set('vat_deductible', e.target.checked)}
                   data-testid="tax-expense-deductible" />
            <span>{t('tax_expense_vat_deductible')}</span>
          </label>

          <label className="block">
            <span className="text-xs text-ink-muted flex items-center gap-1.5">
              <Upload size={12} /> {t('tax_upload_receipt')}
            </span>
            <input type="file" accept="image/jpeg,image/png,image/heic,application/pdf"
                   onChange={attach} className="block w-full text-xs mt-1"
                   data-testid="tax-receipt-upload" />
            {form.filename && (
              <span className="text-[11px] text-green-pos">✓ {form.filename}</span>
            )}
            <span className="block text-[11px] text-ink-muted mt-1">{t('tax_upload_help')}</span>
          </label>

          <button type="submit" className="btn-primary w-full" disabled={saving || !form.gross_amount}
                  data-testid="tax-expense-save">
            {saving ? <Loader2 size={16} className="animate-spin mx-auto" />
                    : (editing ? t('save') : t('tax_expense_add'))}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={22} className="text-teal animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="card-lg" data-testid="tax-expense-row">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">
                    {r.vendor || t('tax_unknown_vendor')}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {r.expense_date ? new Date(r.expense_date).toLocaleDateString('de-AT') : '—'}
                    {r.category && <span className="ml-2">· {r.category}</span>}
                    {r.vat_rate != null && <span className="ml-2">· {r.vat_rate}%</span>}
                    {r.vat_deductible === false && (
                      <span className="ml-2 text-amber-deep">· {t('tax_expense_no_vat')}</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-ink">{fmtEur(r.gross_amount)}</p>
                  <p className="text-[11px] text-ink-muted">{t('net')} {fmtEur(r.net_amount)}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn-ghost text-xs" onClick={() => startEdit(r)}
                        data-testid="tax-expense-edit">{t('edit')}</button>
                <button type="button" className="btn-ghost text-xs text-red-warn"
                        disabled={busyId === r.id} onClick={() => remove(r.id)}
                        data-testid="tax-expense-delete">{t('delete')}</button>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-center text-ink-muted py-6 text-sm" data-testid="tax-expense-empty">
              {t('tax_no_receipts')}
            </p>
          )}
        </div>
      )}
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
          <li>· {t('tax_q1')} → <b>{t('tax_d_apr')}</b></li>
          <li>· {t('tax_q2')} → <b>{t('tax_d_jul')}</b></li>
          <li>· {t('tax_q3')} → <b>{t('tax_d_oct')}</b></li>
          <li>· {t('tax_q4')} → <b>{t('tax_d_jan')}</b> ({year + 1})</li>
        </ul>
        <p className="text-[11px] text-ink-muted mt-2">{t('tax_ustva_deadlines_help')}</p>
      </div>
    </div>
  );
}
