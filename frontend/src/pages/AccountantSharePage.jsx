import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useLang } from '../contexts/LangContext';
import {
  Loader2, AlertCircle, FileSpreadsheet, FileText, ShieldCheck, Briefcase, TrendingUp, ArrowDownToLine,
} from 'lucide-react';

const fmtEur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));

export default function AccountantSharePage() {
  const { token } = useParams();
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  const load = async (yr) => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/api/tax/public/accountant/${token}?year=${yr}`);
      setData(d);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Not found');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, year]);

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 size={28} className="text-teal animate-spin" /></div>;
  if (error) return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card-lg max-w-md text-center" data-testid="accountant-revoked">
        <AlertCircle size={32} className="text-red-warn mx-auto mb-2" />
        <h1 className="font-headings font-bold text-ink text-xl">{t('accountant_revoked_title')}</h1>
        <p className="text-sm text-ink-muted mt-1">{t('accountant_revoked_body')}</p>
      </div>
    </div>
  );

  const apiBase = process.env.REACT_APP_BACKEND_URL;
  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12" data-testid="accountant-page">
      <header className="bg-paper border-b border-sm-border py-3">
        <div className="page-container max-w-4xl flex items-center gap-2 flex-wrap">
          <Briefcase size={18} className="text-teal" />
          <p className="text-sm font-headings font-bold text-ink">ServiceMarket · {t('accountant_title')}</p>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-ink-muted">
            <ShieldCheck size={11} /> {t('accountant_readonly')}
          </span>
        </div>
      </header>

      <main className="page-container py-6 max-w-4xl space-y-4">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">{t('accountant_subject')}</p>
            <h1 className="text-2xl font-headings font-bold text-ink">{data.pro.business_name || data.pro.name}</h1>
            <p className="text-sm text-ink-muted">
              {data.pro.uid && <>UID: {data.pro.uid} · </>}
              {data.pro.city || ''}
              {data.pro.is_kleinunternehmer && <span className="ml-2 inline-block bg-amber/15 text-amber-deep text-[10px] uppercase px-1.5 py-0.5 rounded-full">Kleinunternehmer</span>}
            </p>
          </div>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="sm-select text-sm" data-testid="accountant-year">
            {[year, year - 1, year - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* P&L summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card-lg p-4">
            <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">{t('accountant_revenue')}</p>
            <p className="text-2xl font-headings font-bold text-ink">{fmtEur(data.revenue.brutto)}</p>
            <p className="text-[11px] text-ink-muted">{t('accountant_paid')}: {fmtEur(data.revenue.paid_brutto)}</p>
          </div>
          <div className="card-lg p-4">
            <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">{t('accountant_expenses')}</p>
            <p className="text-2xl font-headings font-bold text-ink">{fmtEur(data.expenses.brutto)}</p>
          </div>
          <div className={`card-lg p-4 ${data.profit >= 0 ? 'bg-green-pos/5 border-green-pos/30' : 'bg-red-warn/5 border-red-warn/30'}`}>
            <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider flex items-center gap-1"><TrendingUp size={10} /> {t('accountant_profit')}</p>
            <p className={`text-2xl font-headings font-bold ${data.profit >= 0 ? 'text-green-pos' : 'text-red-warn'}`}>{fmtEur(data.profit)}</p>
          </div>
        </div>

        {/* Quarterly USt-VA */}
        <div className="card-lg" data-testid="accountant-quarters">
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-3">{t('accountant_ustva_title')}</p>
          <table className="w-full text-sm stack-table">
            <thead className="text-[10px] uppercase text-ink-muted">
              <tr>
                <th className="text-left p-2">{t('accountant_quarter')}</th>
                <th className="text-right p-2">{t('accountant_net')}</th>
                <th className="text-right p-2">{t('accountant_vat')}</th>
                <th className="text-right p-2">{t('accountant_brutto')}</th>
                <th className="text-right p-2">{t('accountant_invoices')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.quarters).map(([q, r]) => {
                const totalCount = Object.values(r.buckets).reduce((s, b) => s + (b.count || 0), 0);
                return (
                  <tr key={q} className="border-t border-sm-border">
                    <td className="p-2 font-mono font-bold text-ink" data-label={t('accountant_quarter')}>{q}</td>
                    <td className="p-2 text-right" data-label={t('accountant_net')}>{fmtEur(r.net)}</td>
                    <td className="p-2 text-right" data-label={t('accountant_vat')}>{fmtEur(r.vat)}</td>
                    <td className="p-2 text-right font-semibold" data-label={t('accountant_brutto')}>{fmtEur(r.brutto)}</td>
                    <td className="p-2 text-right text-ink-muted" data-label={t('accountant_invoices')}>{totalCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Downloads */}
        <div className="card-lg" data-testid="accountant-downloads">
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-3 flex items-center gap-1"><ArrowDownToLine size={12} /> {t('accountant_downloads')}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <a href={`${apiBase}${data.downloads.revenue_csv}`} className="btn-ghost text-xs" data-testid="accountant-dl-revenue"><FileSpreadsheet size={12} /> Revenue CSV</a>
            <a href={`${apiBase}${data.downloads.expenses_csv}`} className="btn-ghost text-xs" data-testid="accountant-dl-expenses"><FileSpreadsheet size={12} /> Expenses CSV</a>
            <a href={`${apiBase}${data.downloads.year_pdf}`} className="btn-ghost text-xs" data-testid="accountant-dl-pdf"><FileText size={12} /> Year-end PDF</a>
          </div>
        </div>

        <p className="text-[11px] text-center text-ink-muted">{t('accountant_footer')} <Link to="/" className="text-teal hover:underline">ServiceMarket</Link></p>
      </main>
    </div>
  );
}
