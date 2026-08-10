import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api, { formatError, apiBase } from '../../api/client';
import useEscapeKey from '../../hooks/useEscapeKey';
import { toast } from 'sonner';
import { useLang } from '../../contexts/LangContext';
import ScrollSnapTabStrip, { SwipeableTabPanel } from '../../components/ScrollSnapTabStrip';
import AdminPagination from '../../components/admin/AdminPagination';
import { dayKey } from '../../utils/schedule';
import { fmtEur, fmtDateLong as fmtDate, fmtDate as fmtDateShort, moneyLocale } from '../../utils/money';
import {
  Receipt, Loader2, Download, Share2, CheckCircle2, FileText, Eye, X,
  TrendingUp, Banknote, Hourglass, AlertCircle, Search,
  Plus, Ban, Trash2, FileX, CreditCard, ArrowUpDown, Globe, Trash, PlusCircle,
} from 'lucide-react';

/* Short month names in the interface language. They were an English array
   literal, so the month filter read Jan/Mar/May/Oct in all four. 2026 is
   arbitrary — only the month index matters.

   A function rather than a module constant: this file is imported before
   LangProvider has registered the locale, so a constant would freeze the
   names at the de-AT default. */
const monthNames = () => Array.from({ length: 12 }, (_, i) =>
  new Date(2026, i, 1).toLocaleDateString(moneyLocale(), { month: 'short' }));

const MYINV_TAB_KEYS = ['all', 'issued', 'partial', 'paid', 'storno', 'cancelled'];

/** The frozen counterparty, whatever shape the driver handed it back in. */
function snapshotName(row) {
  const snap = row.customer_snapshot;
  if (!snap) return '';
  if (typeof snap === 'string') {
    try { return JSON.parse(snap).name || ''; } catch { return ''; }
  }
  return snap.name || '';
}


export default function MyInvoicesPage() {
  const { t, lang } = useLang();
  const MONTHS = useMemo(monthNames, [lang]);
  const location = useLocation();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [preview, setPreview] = useState(null);
  const [share, setShare] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [showExternal, setShowExternal] = useState(false);
  /* Seeded from ?q= so "View invoice" elsewhere in the app can land here
     showing the one invoice it meant. */
  const [search, setSearch] = useState(
    () => new URLSearchParams(window.location.search).get('q') || '');
  const [year, setYear] = useState(null);
  const [month, setMonth] = useState(null);
  const [sortBy, setSortBy] = useState('invoice_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [stats, setStats] = useState({
    issued_brutto: 0, paid_brutto: 0, pending_brutto: 0, this_month_brutto: 0,
    issued_count: 0, paid_count: 0, pending_count: 0,
  });

  const load = async () => {
    setLoading(true);
    try {
      // The tab strip mixes three different columns — document status,
      // payment state and document type — so each tab has to be sent as the
      // filter it actually is. `payment_status` was none of them, and the API
      // dropped it, which is why every tab showed the same list.
      const params = new URLSearchParams();
      if (statusFilter === 'issued') params.set('status', 'issued');
      else if (statusFilter === 'cancelled') params.set('status', 'cancelled');
      else if (statusFilter === 'storno') params.set('type', 'storno');
      else if (statusFilter !== 'all') params.set('payment_state', statusFilter);
      if (search) params.set('q', search);
      if (year) params.set('year', year);
      if (month) params.set('month', month);
      params.set('sort_by', sortBy);
      params.set('order', sortOrder);
      params.set('page', page);
      params.set('per_page', perPage);
      const { data } = await api.get(`/api/invoices?${params.toString()}`);
      // Normalised once here rather than at thirty call sites. This page was
      // written against the Mongo shape and reads brutto_total, invoice_date,
      // payment_due_days, payment_status, is_storno and
      // customer_snapshot.name — the Postgres list returns gross_total,
      // issue_date, payment_terms_days, payment_state, type and
      // customer_name. Every row therefore rendered "€ 0,00", "—" and
      // "fällig in undefined Tagen" while the totals above them were right.
      setRows((data.invoices || []).map((r) => ({
        ...r,
        brutto_total: Number(r.gross_total || 0),
        netto_total: Number(r.net_total || 0),
        invoice_date: r.issue_date,
        payment_due_days: r.payment_terms_days,
        payment_status: r.payment_state,
        is_storno: r.type === 'storno',
        // The join's `customer_name` wins over the frozen snapshot. asyncpg
        // hands jsonb back as a *string* unless a codec is registered, so
        // `customer_snapshot.name` was reading a property off a string and
        // every row showed "—" even for issued invoices that carry the whole
        // customer record.
        customer_snapshot: { name: r.customer_name || snapshotName(r) },
      })));
      setTotal(data.total ?? (data.invoices || []).length);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sourceFilter, search, year, month, page, perPage, sortBy, sortOrder]);

  // Fetch aggregated KPI stats once + whenever the year filter changes
  /* Keyed on `rows`, not `rows.length`. Marking an invoice paid reloads the
     same page with the same number of rows, so the length never changed and
     the four tiles above kept showing the pre-payment figures until a filter
     was touched. `load` builds a fresh array every time, so this fires. */
  useEffect(() => {
    const params = year ? `?year=${year}` : '';
    api.get(`/api/invoices/stats${params}`)
      .then((r) => setStats(r.data))
      .catch(() => {});
  }, [year, rows]);

  /* Server-side filtering — `rows` already contains the page after filters.
     Except the source tabs: `sourceFilter` drove a re-fetch but was never put
     in the query string, and the API has no `source` column to filter on
     anyway, so the three tabs all showed the same list. An invoice with no
     job behind it is what "external" means here, and that is decided on the
     rows we already have rather than by a request that would be ignored. */
  const filtered = useMemo(() => (
    sourceFilter === 'external' ? rows.filter((r) => !r.job_id)
      : sourceFilter === 'servicemarket' ? rows.filter((r) => !!r.job_id)
        : rows
  ), [rows, sourceFilter]);

  // ── Actions ──────────────────────────────────────────────
  const pdfUrl = (inv) =>
    `${apiBase}/api/invoices/${inv.id}/pdf`;

  const openPreview = (inv) => {
    // On mobile browsers, iframes can't render PDFs — open in a new tab instead
    if (window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent)) {
      window.open(pdfUrl(inv), '_blank', 'noopener');
      return;
    }
    setPreview({ invoice: inv, url: pdfUrl(inv) });
  };
  const closePreview = () => setPreview(null);
  const downloadPdf = async (inv) => {
    setBusy(inv.id);
    try {
      const r = await api.get(`/api/invoices/${inv.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([r.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${inv.invoice_number}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } finally { setBusy(null); }
  };
  const markPaid = async (inv) => {
    setBusy(inv.id);
    try { await api.post(`/api/invoices/${inv.id}/mark-paid`); await load(); }
    finally { setBusy(null); }
  };

  const [exporting, setExporting] = useState(false);

  /* Every invoice in the current filter, as PDFs in one archive.

     The old inline handler sent `statusFilter` as `payment_status` whatever
     it was, so the three tabs that are not payment states — issued, cancelled,
     storno — filtered on a value the API does not know, and it caught its own
     failure into `console.error`. A pro pressing this saw nothing happen and
     had no way to tell a broken export from an empty one. */
  const exportZip = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (year) params.set('year', year);
      if (month) params.set('month', month);
      if (statusFilter === 'issued' || statusFilter === 'cancelled') params.set('status', statusFilter);
      else if (statusFilter !== 'all' && statusFilter !== 'storno') params.set('payment_status', statusFilter);
      const r = await api.get(`/api/invoices/export.zip?${params.toString()}`, { responseType: 'blob' });
      const blob = new Blob([r.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoices-${year || 'all'}${month ? `-${String(month).padStart(2, '0')}` : ''}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      /* responseType 'blob' means the error body is a Blob too, so the usual
         `detail` read comes back undefined. 404 here means the filter matched
         no issued invoice, which is a sentence, not an error. */
      toast.error(e?.response?.status === 404
        ? t('myinv_export_empty')
        : formatError(e));
    } finally { setExporting(false); }
  };

  // ── Payments + Storno state ──────────────────────────────
  const [payDialog, setPayDialog] = useState(null);    // invoice obj
  const [stornoDialog, setStornoDialog] = useState(null); // invoice obj

  const justCreatedId = new URLSearchParams(location.search).get('new');

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12">
      <div className="page-container py-8 max-w-5xl">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <Receipt size={26} className="text-teal" />
            <div>
              <h1 className="text-3xl font-headings font-bold text-ink">{t('myinv_title')}</h1>
              <p className="text-ink-muted text-sm">{t('myinv_subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => setShowExternal(true)}
            className="btn-primary text-sm px-4 py-2 rounded-full flex items-center gap-2"
            data-testid="myinv-new-external-btn"
          >
            <Plus size={16} /> {t('myinv_new_external')}
          </button>
        </div>

        {justCreatedId && (
          <div className="rounded-[14px] border border-green-pos/40 bg-green-pos/10 p-3 mb-4 flex items-center gap-2 text-sm text-green-text" data-testid="myinv-created-banner">
            <CheckCircle2 size={14} /> {t('myinv_created')}
          </div>
        )}

        {/* ── Overview stats ────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-testid="myinv-stats-grid">
          <StatCard icon={TrendingUp} colour="text-teal" label={t('myinv_stat_issued_ytd')} value={fmtEur(stats.issued_brutto)} sub={`${stats.issued_count} ${t('myinv_invoices_short')}`} />
          <StatCard icon={Banknote}   colour="text-green-text" label={t('myinv_stat_paid_ytd')} value={fmtEur(stats.paid_brutto)} sub={`${stats.paid_count} ${t('myinv_invoices_short')}`} />
          <StatCard icon={Hourglass}  colour="text-amber" label={t('myinv_stat_pending')} value={fmtEur(stats.pending_brutto)} sub={`${stats.pending_count} ${t('myinv_invoices_short')}`} />
          <StatCard icon={Receipt}    colour="text-ink"   label={t('myinv_stat_this_month')} value={fmtEur(stats.this_month_brutto)} sub={t('myinv_stat_this_month_sub')} />
        </div>

        {/* ── Filter + search row ────────────────────────
            Stack on mobile (search below tabs), side-by-side on md+. */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 mb-4">
          <div className="min-w-0 md:flex-1">
            <ScrollSnapTabStrip
              tabs={[
                { key: 'all', label: t('myinv_filter_all') },
                { key: 'issued', label: t('myinv_status_issued') },
                { key: 'partial', label: t('myinv_status_partial') },
                { key: 'paid', label: t('myinv_status_paid') },
                { key: 'storno', label: t('myinv_status_storno') },
                { key: 'cancelled', label: t('myinv_status_cancelled') },
              ]}
              activeKey={statusFilter}
              onChange={setStatusFilter}
              testidPrefix="myinv-filter"
              variant="pills"
            />
          </div>
          <div className="relative md:w-72 w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('myinv_search_ph')}
              className="sm-input pl-9 text-sm w-full"
              data-testid="myinv-search"
            />
          </div>
        </div>

        {/* ── Source filter: ServiceMarket vs external (off-platform) ── */}
        <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="myinv-source-filter">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{t('myinv_source_label')}:</span>
          {[
            { key: 'all', label: t('myinv_source_all') },
            { key: 'servicemarket', label: t('myinv_source_sm') },
            { key: 'external', label: t('myinv_source_external') },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => { setSourceFilter(s.key); setPage(1); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${sourceFilter === s.key ? 'bg-teal text-paper border-teal' : 'border-sm-border text-ink-soft hover:bg-cream-soft'}`}
              data-testid={`myinv-source-${s.key}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Year + Month filter row */}
        <div className="flex items-center flex-wrap gap-2 mb-4" data-testid="myinv-period-filter">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{t('period')}</span>
          <select
            value={year || ''}
            onChange={(e) => { setYear(e.target.value ? parseInt(e.target.value, 10) : null); setMonth(null); setPage(1); }}
            className="sm-input text-xs h-8 py-0 max-w-[120px]"
            data-testid="myinv-filter-year"
          >
            <option value="">{t('all_years')}</option>
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {year && (
            <select
              value={month || ''}
              onChange={(e) => { setMonth(e.target.value ? parseInt(e.target.value, 10) : null); setPage(1); }}
              className="sm-input text-xs h-8 py-0 max-w-[140px]"
              data-testid="myinv-filter-month"
            >
              <option value="">{t('inv_all_months')}</option>
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          )}
          <button
            onClick={exportZip}
            disabled={exporting}
            className="btn-ghost text-xs disabled:opacity-40"
            data-testid="myinv-export-all-pdf"
          >
            <Download size={12} /> {t('myinv_export_all_pdf') || 'Export all as PDF'}
          </button>
          <span className="ml-auto text-xs text-ink-muted" data-testid="myinv-total-count">{t('myinv_count', { n: total })}</span>
        </div>

        {/* Sort row */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <ArrowUpDown size={13} className="text-ink-muted flex-shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{t('sort')}</span>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            className="sm-input text-xs h-8 py-0"
            data-testid="myinv-sort-by"
          >
            <option value="invoice_date">{t('sort_date')}</option>
            <option value="total_brutto">{t('sort_amount')}</option>
            <option value="invoice_number">{t('sort_number')}</option>
          </select>
          <button
            onClick={() => { setSortOrder((o) => o === 'desc' ? 'asc' : 'desc'); setPage(1); }}
            className="sm-input text-xs h-8 px-3 flex items-center gap-1"
            data-testid="myinv-sort-order"
            title={sortOrder === 'desc' ? 'Newest / Highest first' : 'Oldest / Lowest first'}
          >
            {sortOrder === 'desc' ? `↓ ${t('sort_desc')}` : `↑ ${t('sort_asc')}`}
          </button>
        </div>

        {/* ── List ─────────────────────────────────────── */}
        <SwipeableTabPanel tabKeys={MYINV_TAB_KEYS} activeKey={statusFilter} onChange={setStatusFilter}>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={24} className="text-teal animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="card-lg text-center py-10" data-testid="myinv-empty">
              <FileText size={36} className="mx-auto text-ink-muted mb-2" />
              <p className="text-ink font-medium">{t('myinv_empty_title')}</p>
              <p className="text-ink-muted text-sm mt-1">{t('myinv_empty_help')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((inv) => (
                <InvoiceCard
                  key={inv.id}
                  inv={inv}
                  busy={busy === inv.id}
                  t={t}
                  onPreview={() => openPreview(inv)}
                  onDownload={() => downloadPdf(inv)}
                  onShare={() => setShare(inv)}
                  onMarkPaid={() => markPaid(inv)}
                  onAddPayment={() => setPayDialog(inv)}
                  onStorno={() => setStornoDialog(inv)}
                />
              ))}
              <AdminPagination
                page={page}
                perPage={perPage}
                total={total}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
                sizes={[20, 50, 100]}
              />
            </div>
          )}
        </SwipeableTabPanel>

        <Link to="/billing" className="block text-center text-xs text-ink-muted hover:text-teal mt-6 underline">
          {t('myinv_manage_toolkit')}
        </Link>
      </div>

      {preview && (
        <PreviewModal preview={preview} onClose={closePreview} onDownload={() => downloadPdf(preview.invoice)} onShare={() => setShare(preview.invoice)} t={t} />
      )}

      {share && (
        <ShareModal invoice={share} onClose={() => setShare(null)} onDownload={downloadPdf} t={t} />
      )}

      {payDialog && (
        <PaymentsModal
          invoice={payDialog}
          onClose={() => setPayDialog(null)}
          reload={async () => { await load(); }}
          t={t}
        />
      )}

      {stornoDialog && (
        <StornoModal
          invoice={stornoDialog}
          onClose={() => setStornoDialog(null)}
          reload={async () => { await load(); }}
          t={t}
        />
      )}

      {showExternal && (
        <ExternalInvoiceModal
          onClose={() => setShowExternal(false)}
          onCreated={async () => { setShowExternal(false); setSourceFilter('external'); await load(); }}
          t={t}
        />
      )}
    </div>
  );
}


function ExternalInvoiceModal({ onClose, onCreated, t }) {
  /* Escape closes it — nothing on this page did before. */
  useEscapeKey(true, onClose);

  const [customer, setCustomer] = useState({ name: '', address: '', postal_code: '', city: '', country: 'AT', email: '' });
  const [items, setItems] = useState([{ description: '', qty: 1, unit_net: 0 }]);
  const [dueDays, setDueDays] = useState(14);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, { description: '', qty: 1, unit_net: 0 }]);
  const removeItem = (i) => setItems((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));

  const netTotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_net) || 0), 0);

  /* This posted `{source, customer, line_items:[{unit_net}], payment_due_days}`.
     The API takes `{customer_id, lines:[{unit_price}], payment_terms_days}`
     and Pydantic drops what it was not told about, so every field of this
     form was discarded: the call returned 201, the invoice had no customer,
     no lines and a total of 0.00, and the UI said it had been created. The
     exact trap the invoice editor's own docstring says was fixed there.

     There is also no `source` column anywhere in the backend — an invoice
     with no job is what "external" means here, and the list filter now says
     the same thing. */
  const submit = async () => {
    if (!customer.name.trim()) { toast.error(t('myinv_ext_err_name')); return; }
    const lines = items
      .filter((it) => it.description.trim() && Number(it.unit_net) > 0)
      .map((it, i) => ({
        position: i + 1,
        kind: 'other',
        description: it.description.trim(),
        qty: Number(it.qty) || 1,
        unit: 'pcs',
        unit_price: Number(it.unit_net),
      }));
    if (lines.length === 0) { toast.error(t('myinv_ext_err_items')); return; }
    setSaving(true);
    try {
      /* The invoice needs a customer row: `customer_id` is a foreign key and
         the issued invoice freezes that record into its snapshot. */
      const { data: made } = await api.post('/api/customers', {
        name: customer.name.trim(),
        address: customer.address || undefined,
        postal_code: customer.postal_code || undefined,
        city: customer.city || undefined,
        country: customer.country || undefined,
        email: customer.email || undefined,
      });
      const customerId = made?.customer?.id || made?.id;
      if (!customerId) throw new Error('customer');
      const { data: inv } = await api.post('/api/invoices', {
        customer_id: customerId,
        lines,
        payment_terms_days: Number(dueDays) || 14,
        note: note.trim() || null,
      });
      /* A 201 is not proof — but a draft's header totals are always 0.00:
         they are computed by issue(), and there is no rollup trigger on
         invoice_lines. Guarding on net_total therefore rejected every
         invoice it had just created, leaving an orphan customer and an
         orphan draft behind on each attempt. Check the lines instead, which
         is what "did this actually save" means here. */
      const created = inv?.invoice || inv;
      if (!created?.id || !(created.lines || []).length) {
        toast.error(t('myinv_ext_err_generic'));
        return;
      }
      toast.success(t('myinv_ext_created'));
      onCreated();
    } catch (e) {
      toast.error(formatError(e) || t('myinv_ext_err_generic'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4" data-testid="external-modal">
      <div className="bg-paper rounded-[20px] shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-sm-border flex items-center justify-between sticky top-0 bg-paper z-10">
          <h3 className="font-headings font-bold text-ink text-base flex items-center gap-2">
            <Globe size={16} className="text-[#4f46e5]" /> {t('myinv_new_external')}
          </h3>
          <button onClick={onClose} className="p-1 text-ink-muted hover:text-ink" data-testid="ext-close"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-ink-muted">{t('myinv_ext_help')}</p>

          {/* Customer */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">{t('myinv_ext_customer')}</p>
            <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder={t('myinv_ext_name')} className="sm-input w-full mb-2 text-sm" data-testid="ext-customer-name" />
            <input value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder={t('myinv_ext_address')} className="sm-input w-full mb-2 text-sm" data-testid="ext-customer-address" />
            <div className="grid grid-cols-3 gap-2 mb-2">
              <input value={customer.postal_code} onChange={(e) => setCustomer({ ...customer, postal_code: e.target.value })} placeholder={t('myinv_ext_zip')} className="sm-input text-sm" data-testid="ext-customer-postal" />
              <input value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} placeholder={t('myinv_ext_city')} className="sm-input text-sm col-span-2" data-testid="ext-customer-city" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={customer.country} onChange={(e) => setCustomer({ ...customer, country: e.target.value })} placeholder="AT" className="sm-input text-sm" data-testid="ext-customer-country" />
              <input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder={t('myinv_ext_email')} className="sm-input text-sm" data-testid="ext-customer-email" />
            </div>
          </div>

          {/* Line items */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">{t('myinv_ext_items')}</p>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-end gap-2" data-testid={`ext-li-${i}`}>
                  <div className="flex-1">
                    <input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder={t('myinv_ext_li_desc')} className="sm-input w-full text-sm" data-testid={`ext-li-desc-${i}`} />
                  </div>
                  <div className="w-14">
                    <input type="number" min="0" step="1" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} placeholder={t('inv_qty')} className="sm-input w-full text-sm" data-testid={`ext-li-qty-${i}`} />
                  </div>
                  <div className="w-24">
                    <input type="number" min="0" step="0.01" value={it.unit_net} onChange={(e) => setItem(i, { unit_net: e.target.value })} placeholder={t('inv_net')} className="sm-input w-full text-sm" data-testid={`ext-li-price-${i}`} />
                  </div>
                  <button onClick={() => removeItem(i)} className="p-2 text-ink-muted hover:text-red-warn" data-testid={`ext-remove-line-${i}`}><Trash size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="mt-2 text-xs font-semibold text-teal flex items-center gap-1 hover:underline" data-testid="ext-add-line">
              <PlusCircle size={14} /> {t('myinv_ext_add_line')}
            </button>
          </div>

          {/* Due + note */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-ink-soft">{t('myinv_ext_due_days')}</label>
              <input type="number" min="0" max="90" value={dueDays} onChange={(e) => setDueDays(e.target.value)} className="sm-input w-full text-sm" data-testid="ext-due-days" />
            </div>
            <div className="flex items-end">
              <div className="w-full text-right">
                <p className="text-[11px] text-ink-muted">{t('myinv_ext_net_total')}</p>
                <p className="text-lg font-headings font-bold text-ink" data-testid="ext-net-total">{netTotal.toFixed(2)} €</p>
              </div>
            </div>
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t('myinv_ext_note')} className="sm-input w-full text-sm resize-none" data-testid="ext-note" />
          <p className="text-[10px] text-ink-muted">{t('myinv_ext_vat_note')}</p>
        </div>

        <div className="px-5 py-3 border-t border-sm-border flex gap-2 sticky bottom-0 bg-paper">
          <button onClick={onClose} className="flex-1 border border-sm-border text-ink-soft text-sm py-2 rounded-[10px] hover:bg-cream-soft transition-colors" data-testid="ext-cancel">{t('btn_cancel') || 'Cancel'}</button>
          <button onClick={submit} disabled={saving} className="flex-1 btn-primary text-sm py-2 rounded-[10px] disabled:opacity-50" data-testid="ext-submit">
            {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('myinv_ext_create')}
          </button>
        </div>
      </div>
    </div>
  );
}


function StatCard({ icon: Icon, colour, label, value, sub }) {
  return (
    <div className="card-lg p-4" data-testid={`myinv-stat-${label}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={colour} />
        <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">{label}</p>
      </div>
      <p className="text-xl font-headings font-bold text-ink">{value}</p>
      <p className="text-[11px] text-ink-muted">{sub}</p>
    </div>
  );
}


function InvoiceCard({ inv, busy, t, onPreview, onDownload, onShare, onMarkPaid, onAddPayment, onStorno }) {
  const isStorno = !!inv.is_storno;
  const isCancelled = !!inv.cancelled_by_storno_id;
  /* "External" is an invoice with no job behind it — a paper invoice typed
     in by hand. There is no `source` column in the backend, so this read
     undefined on every row and the badge never appeared. */
  const isExternal = !inv.job_id;
  /* A draft has no invoice number, no issue date and no totals — those are
     computed when it is issued. It was rendered with the full action row
     anyway: "Mark paid" settled an outstanding balance of zero and returned
     quietly, Share offered a link to a document that does not exist yet, and
     Storno cancelled an invoice that was never issued. The only thing there
     is to do with a draft is finish it. */
  const isDraft = inv.status === 'draft';
  const brutto = Number(inv.brutto_total || 0);
  const paid = Number(inv.paid_total || 0);
  const outstanding = Number(inv.outstanding ?? Math.max(0, brutto - paid));
  const isPartial = !isStorno && !isCancelled && paid > 0 && outstanding > 0.01;
  const isFullyPaid = !isStorno && !isCancelled && outstanding < 0.01 && brutto > 0;
  const paidPct = brutto > 0 ? Math.min(100, Math.round((paid / brutto) * 100)) : 0;

  const status = isDraft ? 'draft'
    : isCancelled ? 'cancelled' : isStorno ? 'storno' : (inv.payment_status || inv.status || 'issued');
  const pillCls = {
    paid: 'status-done',
    issued: 'status-pending',
    partial: 'bg-amber/15 text-amber-deep border border-amber/40',
    storno: 'bg-red-warn/10 text-red-text border border-red-warn/30',
    cancelled: 'bg-ink-muted/15 text-ink-muted border border-ink-muted/30 line-through',
    draft: 'bg-ink-muted/15 text-ink-muted border border-ink-muted/30',
  }[status] || 'status-pending';

  return (
    <div
      className={`card-lg ${isCancelled ? 'opacity-60' : ''} ${isStorno ? 'border-l-4 border-red-warn' : isExternal ? 'border-l-4 border-[#6366f1]' : ''}`}
      data-testid={`myinv-row-${inv.id}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className={`font-mono text-sm ${isCancelled ? 'line-through text-ink-muted' : 'text-ink'}`}>
              {inv.invoice_number || t('myinv_no_number_yet')}
            </p>
            <span className={`status-pill ${pillCls}`}>
              {t(`myinv_status_${status}`) || status}
            </span>
            {isExternal && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#6366f1]/12 text-[#4f46e5] border border-[#6366f1]/30" data-testid={`myinv-external-badge-${inv.id}`}>
                <Globe size={10} /> {t('myinv_external_badge')}
              </span>
            )}
            {isStorno && (
              <span className="text-[10px] text-ink-muted">↺ {inv.storno_of_invoice_number}</span>
            )}
            {isCancelled && (
              <span className="text-[10px] text-ink-muted">→ {inv.cancelled_by_storno_number}</span>
            )}
          </div>
          <p className="text-sm text-ink-soft">{inv.customer_snapshot?.name || '—'}</p>
          <p className="text-xs text-ink-muted">
            {isDraft ? t('myinv_draft_hint')
              : <>{fmtDate(inv.invoice_date)} · {t('myinv_due_in').replace('{n}', inv.payment_due_days)}</>}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-xl font-headings font-bold ${isStorno ? 'text-red-warn' : 'text-ink'}`}>{fmtEur(brutto)}</p>
          {isPartial && (
            <p className="text-[11px] text-ink-muted mt-0.5">
              {t('myinv_paid_of').replace('{p}', fmtEur(paid)).replace('{t}', fmtEur(brutto))}
            </p>
          )}
        </div>
      </div>

      {/* Payment progress bar (only when partial) */}
      {isPartial && (
        <div className="mt-2" data-testid={`myinv-progress-${inv.id}`}>
          <div className="h-1.5 bg-cream-deep rounded-full overflow-hidden">
            <div className="h-full bg-amber transition-all" style={{ width: `${paidPct}%` }} />
          </div>
          <p className="text-[10px] text-ink-muted mt-1">{t('myinv_outstanding')}: <span className="font-bold text-red-warn">{fmtEur(outstanding)}</span></p>
        </div>
      )}

      {/* Action row — compact icon-only primary actions + dropdown for destructive */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-sm-border" data-testid={`myinv-actions-${inv.id}`}>
        {/* LEFT: read-only icons (Preview, Download, Share) */}
        <div className="flex items-center gap-1">
          {isDraft && inv.job_id && (
            <Link to={`/jobs/${inv.job_id}/invoice`} className="btn-secondary text-xs"
                  data-testid={`myinv-continue-${inv.id}`}>
              <FileText size={12} className="inline mr-1" />{t('myinv_continue_draft')}
            </Link>
          )}
          {!isDraft && (<>
          <button
            onClick={onPreview}
            disabled={busy}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink-soft hover:bg-cream-deep hover:text-ink transition-colors disabled:opacity-50"
            title={t('myinv_btn_preview')}
            data-testid={`myinv-preview-${inv.id}`}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
          </button>
          <button
            onClick={onDownload}
            disabled={busy}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink-soft hover:bg-cream-deep hover:text-ink transition-colors disabled:opacity-50"
            title={t('myinv_btn_download')}
            data-testid={`myinv-download-${inv.id}`}
          >
            <Download size={14} />
          </button>
          <button
            onClick={onShare}
            disabled={busy}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink-soft hover:bg-cream-deep hover:text-ink transition-colors disabled:opacity-50"
            title={t('myinv_btn_share')}
            data-testid={`myinv-share-${inv.id}`}
          >
            <Share2 size={14} />
          </button>
          </>)}
        </div>

        {/* RIGHT: payment-state actions */}
        <div className="flex items-center gap-1.5">
          {!isDraft && !isStorno && !isCancelled && !isFullyPaid && (
            <>
              <button
                onClick={onAddPayment}
                disabled={busy}
                className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md text-xs font-bold border border-amber/40 bg-amber/5 text-amber-deep hover:bg-amber/15 transition-colors"
                data-testid={`myinv-online-payment-${inv.id}`}
                title={t('myinv_btn_online_payment')}
              >
                <CreditCard size={12} />
                <span className="hidden xs:inline sm:inline">{t('myinv_btn_online_payment')}</span>
              </button>
              <button
                onClick={onMarkPaid}
                disabled={busy}
                className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md text-xs font-bold border border-green-pos/40 bg-green-pos/5 text-green-text hover:bg-green-pos/15 transition-colors"
                data-testid={`myinv-paid-${inv.id}`}
              >
                <CheckCircle2 size={12} /> {t('myinv_btn_paid')}
              </button>
            </>
          )}
          {!isDraft && isFullyPaid && (
            <span className="inline-flex items-center gap-1 px-2.5 h-8 text-xs font-bold text-green-text">
              <CheckCircle2 size={12} /> {t('myinv_status_paid')}
            </span>
          )}
          {!isDraft && !isStorno && !isCancelled && (
            <button
              onClick={onStorno}
              disabled={busy}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-red-text hover:bg-red-warn/10 transition-colors"
              title={t('myinv_btn_storno')}
              data-testid={`myinv-storno-${inv.id}`}
            >
              <Ban size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


function PreviewModal({ preview, onClose, onDownload, onShare, t }) {
  /* Escape closes it — nothing on this page did before. */
  useEscapeKey(true, onClose);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 md:p-4" onClick={onClose} data-testid="myinv-preview-modal">
      <div className="bg-paper rounded-[14px] shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-sm-border flex items-center justify-between">
          <p className="font-mono text-sm text-ink">{preview.invoice.invoice_number}</p>
          <div className="flex items-center gap-1.5">
            <button onClick={onDownload} className="btn-ghost text-xs"><Download size={12} /> {t('myinv_btn_download')}</button>
            <button onClick={onShare} className="btn-primary text-xs"><Share2 size={12} /> {t('myinv_btn_share')}</button>
            <button onClick={onClose} className="p-1.5 text-ink-muted hover:text-ink" aria-label="close"><X size={16} /></button>
          </div>
        </div>
        <iframe
          title={preview.invoice.invoice_number}
          src={preview.url}
          className="w-full flex-1 min-h-[60vh]"
          style={{ border: 'none' }}
        />
      </div>
    </div>
  );
}


function ShareModal({ invoice, onClose, onDownload, t }) {
  /* Escape closes it — nothing on this page did before. */
  useEscapeKey(true, onClose);

  const [sending, setSending] = useState(false);

  const shareWhatsapp = async () => {
    setSending(true);
    try {
      const r = await api.get(`/api/invoices/${invoice.id}/pdf`, { responseType: 'blob' });
      const file = new File([r.data], `${invoice.invoice_number}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: invoice.invoice_number,
          text: `${invoice.invoice_number} — €${invoice.brutto_total.toFixed(2)}`,
          files: [file],
        });
      } else {
        // mobile fallback — open WhatsApp web with prefilled text + invoice URL
        const txt = encodeURIComponent(`${invoice.invoice_number} — €${invoice.brutto_total.toFixed(2)}`);
        window.open(`https://wa.me/?text=${txt}`, '_blank');
      }
      onClose();
    } catch (e) {
      // user cancelled native share — silent
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose} data-testid="myinv-share-modal">
      <div className="bg-paper rounded-[14px] shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-sm-border flex items-center justify-between">
          <h3 className="font-headings font-bold text-ink text-lg">{t('myinv_share_title')}</h3>
          <button onClick={onClose} className="p-1 text-ink-muted hover:text-ink" aria-label="close"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-soft">{invoice.invoice_number} · €{invoice.brutto_total.toFixed(2)}</p>

          {/* WhatsApp / native share */}
          <button
            onClick={shareWhatsapp}
            disabled={sending}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-[12px] bg-[#25D366] text-white font-semibold hover:opacity-90"
            data-testid="myinv-share-whatsapp"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />} {t('myinv_share_whatsapp')}
          </button>

          {/* Download the PDF and send it however the pro likes */}
          <button
            onClick={() => { onDownload(invoice); onClose(); }}
            className="w-full btn-secondary"
            data-testid="myinv-share-download"
          >
            <Download size={14} /> {t('myinv_download') || 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────
// Payments modal — list/add/delete payments per invoice
// ──────────────────────────────────────────────
function PaymentsModal({ invoice, onClose, reload, t }) {
  /* Escape closes it — nothing on this page did before. */
  useEscapeKey(true, onClose);

  const [busy, setBusy] = useState(false);
  const [payments, setPayments] = useState(invoice.payments || []);
  const [paidTotal, setPaidTotal] = useState(Number(invoice.paid_total || 0));
  const [outstanding, setOutstanding] = useState(
    Number(invoice.outstanding ?? Math.max(0, Number(invoice.brutto_total || 0) - Number(invoice.paid_total || 0))),
  );
  const [amount, setAmount] = useState(outstanding > 0 ? outstanding : '');
  const [method, setMethod] = useState('transfer');
  const [note, setNote] = useState('');
  const [paidOn, setPaidOn] = useState(dayKey(new Date()));
  const [payLink, setPayLink] = useState({
    enabled: !!invoice.pay_link_enabled,
    token: invoice.pay_link_token || null,
  });
  const [linkCopied, setLinkCopied] = useState(false);

  const publicPayUrl = payLink.token ? `${window.location.origin}/pay/${payLink.token}` : '';

  const refresh = (updated) => {
    setPayments(updated.payments || []);
    setPaidTotal(Number(updated.paid_total || 0));
    setOutstanding(Number(updated.outstanding ?? 0));
    setAmount(Number(updated.outstanding ?? 0) > 0 ? Number(updated.outstanding) : '');
    setPayLink({
      enabled: !!updated.pay_link_enabled,
      token: updated.pay_link_token || null,
    });
  };

  const togglePayLink = async () => {
    setBusy(true);
    try {
      if (payLink.enabled) {
        await api.post(`/api/pay-link/${invoice.id}/disable`);
        setPayLink((p) => ({ ...p, enabled: false }));
      } else {
        const { data } = await api.post(`/api/pay-link/${invoice.id}/enable`);
        setPayLink({ enabled: true, token: data.pay_link_token });
      }
      if (reload) await reload();
    } catch (e) {
      window.alert(e?.response?.data?.detail || t('myinv_err_paylink'));
    } finally { setBusy(false); }
  };

  const copyPayUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicPayUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch { /* noop */ }
  };

  const add = async () => {
    if (!amount || Number(amount) <= 0) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/api/invoices/${invoice.id}/payments`, {
        amount_eur: Number(amount),
        method,
        note,
        paid_on: paidOn ? new Date(paidOn).toISOString() : null,
      });
      refresh(data);
      setNote('');
      if (reload) await reload();
    } finally { setBusy(false); }
  };

  const remove = async (pid) => {
    setBusy(true);
    try {
      await api.delete(`/api/invoices/${invoice.id}/payments/${pid}`);
      const { data } = await api.get(`/api/invoices/${invoice.id}`);
      refresh(data);
      if (reload) await reload();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose} data-testid="myinv-payments-modal">
      <div className="bg-paper rounded-[14px] shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-sm-border flex items-center justify-between">
          <p className="font-mono text-sm text-ink">{invoice.invoice_number} · {t('myinv_payments_title')}</p>
          <button onClick={onClose} className="p-1.5 text-ink-muted hover:text-ink"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Status summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[10px] bg-cream-soft p-3"><p className="text-[10px] uppercase font-bold text-ink-muted">{t('myinv_brutto')}</p><p className="text-lg font-headings font-bold text-ink">{fmtEur(invoice.brutto_total)}</p></div>
            <div className="rounded-[10px] bg-green-pos/10 p-3"><p className="text-[10px] uppercase font-bold text-ink-muted">{t('myinv_paid')}</p><p className="text-lg font-headings font-bold text-green-text">{fmtEur(paidTotal)}</p></div>
            <div className={`rounded-[10px] p-3 ${outstanding > 0 ? 'bg-amber/10' : 'bg-cream-soft'}`}><p className="text-[10px] uppercase font-bold text-ink-muted">{t('myinv_outstanding')}</p><p className={`text-lg font-headings font-bold ${outstanding > 0 ? 'text-amber-deep' : 'text-ink-muted'}`}>{fmtEur(outstanding)}</p></div>
          </div>

          {/* Pay-Now link (Stripe-hosted, 1% service fee added) */}
          {outstanding > 0 && (
            <div className="rounded-[10px] border border-teal/30 bg-teal/5 p-3" data-testid="myinv-paylink-section">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CreditCard size={14} className="text-teal flex-shrink-0" />
                  <p className="text-sm font-headings font-bold text-ink truncate">{t('myinv_paylink_title')}</p>
                </div>
                <button
                  onClick={togglePayLink}
                  disabled={busy}
                  className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full transition-colors ${payLink.enabled ? 'bg-green-pos/15 text-green-text' : 'bg-cream-deep text-ink-muted hover:bg-cream-deep/70'}`}
                  data-testid="myinv-paylink-toggle"
                >
                  {busy ? <Loader2 size={10} className="animate-spin" /> : (payLink.enabled ? t('myinv_paylink_enabled') : t('myinv_paylink_disabled'))}
                </button>
              </div>
              {payLink.enabled && payLink.token ? (
                <>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <code className="text-[10px] bg-paper px-2 py-1.5 rounded-[8px] border border-sm-border flex-1 min-w-[200px] break-all" data-testid="myinv-paylink-url">{publicPayUrl}</code>
                    <button onClick={copyPayUrl} className="btn-ghost text-[10px] px-2 py-1" data-testid="myinv-paylink-copy">{linkCopied ? '✓' : t('myinv_paylink_copy')}</button>
                    <a href={publicPayUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost text-[10px] px-2 py-1">↗</a>
                  </div>
                  <p className="text-[10px] text-ink-muted mt-1.5 leading-tight">{t('myinv_paylink_help')}</p>
                </>
              ) : (
                <p className="text-[11px] text-ink-muted leading-tight">{t('myinv_paylink_off_help')}</p>
              )}
            </div>
          )}

          {/* Existing payments */}
          {payments.length > 0 && (
            <div>
              <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider mb-2">{t('myinv_payment_history')}</p>
              <ul className="space-y-1.5">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-[8px] bg-cream-soft px-2.5 py-1.5 text-sm" data-testid={`myinv-payment-${p.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink">{fmtEur(p.amount_eur)} <span className="text-[10px] text-ink-muted uppercase ml-1">{p.method}</span></p>
                      <p className="text-[11px] text-ink-muted">{p.paid_on ? fmtDateShort(p.paid_on) : ''} {p.note ? `· ${p.note}` : ''}</p>
                    </div>
                    <button onClick={() => remove(p.id)} disabled={busy} className="text-ink-muted hover:text-red-warn" data-testid={`myinv-payment-delete-${p.id}`}><Trash2 size={12} /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Add payment form */}
          {outstanding > 0 && (
            <div className="border-t border-sm-border pt-4 space-y-2">
              <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">{t('myinv_payment_add')}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] text-ink-muted">{t('myinv_payment_amount')}</span>
                  <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="sm-input text-sm w-full" data-testid="myinv-payment-amount" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-ink-muted">{t('myinv_payment_method')}</span>
                  <select value={method} onChange={(e) => setMethod(e.target.value)} className="sm-select text-sm w-full" data-testid="myinv-payment-method">
                    <option value="transfer">{t('myinv_method_transfer')}</option>
                    <option value="cash">{t('myinv_method_cash')}</option>
                    <option value="card">{t('myinv_method_card')}</option>
                    <option value="other">{t('myinv_method_other')}</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] text-ink-muted">{t('myinv_payment_date')}</span>
                <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="sm-input text-sm w-full" />
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('myinv_payment_note_ph')}
                className="sm-input text-sm w-full"
                data-testid="myinv-payment-note"
              />
              <button onClick={add} disabled={busy || !amount || Number(amount) <= 0} className="btn-primary text-sm w-full" data-testid="myinv-payment-save">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t('myinv_payment_save')}
              </button>
            </div>
          )}
          {outstanding < 0.01 && (
            <div className="rounded-[10px] bg-green-pos/10 border border-green-pos/30 p-3 text-center">
              <CheckCircle2 size={18} className="text-green-text mx-auto mb-1" />
              <p className="text-sm font-semibold text-green-text">{t('myinv_fully_paid')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────
// Storno confirmation modal — Austrian compliance
// ──────────────────────────────────────────────
function StornoModal({ invoice, onClose, reload, t }) {
  /* Escape closes it — nothing on this page did before. */
  useEscapeKey(true, onClose);

  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);  // storno invoice number when complete

  const issue = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/api/invoices/${invoice.id}/storno`, { reason });
      setDone(data.invoice_number);
      if (reload) await reload();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose} data-testid="myinv-storno-modal">
      <div className="bg-paper rounded-[14px] shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-2">
          <FileX size={18} className="text-red-warn" />
          <h3 className="font-headings font-bold text-ink">{t('myinv_storno_title')}</h3>
        </div>
        {done ? (
          <>
            <div className="rounded-[10px] bg-green-pos/10 border border-green-pos/30 p-3 mb-3">
              <p className="text-sm font-semibold text-green-text">{t('myinv_storno_issued')}</p>
              <p className="text-xs text-ink-muted mt-1">{t('myinv_storno_issued_help').replace('{n}', done)}</p>
            </div>
            <button onClick={onClose} className="btn-primary text-sm w-full">{t('myinv_storno_close')}</button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-muted mb-3">{t('myinv_storno_explainer')}</p>
            <div className="rounded-[10px] bg-amber/10 border border-amber/30 p-3 mb-3">
              <p className="text-xs text-ink leading-relaxed">{t('myinv_storno_warning')}</p>
            </div>
            <label className="block mb-3">
              <span className="text-[11px] text-ink-muted uppercase font-bold tracking-wider">{t('myinv_storno_reason')}</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                className="sm-textarea text-sm w-full mt-1"
                placeholder={t('myinv_storno_reason_ph')}
                data-testid="myinv-storno-reason"
              />
            </label>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="btn-ghost text-sm flex-1">{t('btn_cancel')}</button>
              <button onClick={issue} disabled={busy} className="btn-primary text-sm flex-1 bg-red-warn hover:bg-red-warn/90" data-testid="myinv-storno-confirm">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />} {t('myinv_storno_confirm_btn')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
