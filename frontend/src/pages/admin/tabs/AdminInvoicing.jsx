import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import {
  FileText, RefreshCw, Loader2, Download, Eye, Plus, Settings as SettingsIcon,
  XCircle, AlertTriangle, Building2, CreditCard, Receipt, FileX2, Palette,
} from 'lucide-react';
import ScrollSnapTabStrip from '../../../components/ScrollSnapTabStrip';
import AdminFilterBar from '../../../components/admin/AdminFilterBar';
import AdminPagination from '../../../components/admin/AdminPagination';

const SUB_TABS = ['subscriptions', 'fees', 'online_payments', 'invoice_data', 'storno', 'settings'];
const SUB_LABELS = {
  subscriptions: 'invoicing_subs',
  fees: 'invoicing_fees',
  online_payments: 'invoicing_online_payments',
  invoice_data: 'invoicing_data',
  storno: 'invoicing_storno',
  settings: 'invoicing_settings',
};

const fmtEur = (v) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—');

export default function AdminInvoicing({ flash }) {
  const { t } = useLang();
  const [sub, setSub] = useState('subscriptions');

  return (
    <div className="space-y-4" data-testid="admin-invoicing-root">
      {/* Sub-tab strip — redesigned with ScrollSnapTabStrip for better look on mobile + horizontal scroll */}
      <ScrollSnapTabStrip
        tabs={SUB_TABS.map((k) => ({ key: k, label: t(SUB_LABELS[k]) }))}
        activeKey={sub}
        onChange={setSub}
        testidPrefix="invoicing-subtab"
        variant="pills"
      />

      {sub === 'subscriptions' && <SubscriptionsTab flash={flash} />}
      {sub === 'fees' && <FeesTab flash={flash} />}
      {sub === 'online_payments' && <OnlinePaymentsTab flash={flash} t={t} />}
      {sub === 'invoice_data' && <InvoiceDataTab flash={flash} t={t} />}
      {sub === 'storno' && <StornoTab flash={flash} />}
      {sub === 'settings' && <CompanySettingsTab flash={flash} />}
    </div>
  );
}

// ──────────────────────────────────────────────
// Shared: invoice rows (subscription / fees / storno)
// ──────────────────────────────────────────────
function InvoiceTable({ rows, onPdf, onStorno, busy, t, allowStorno = true }) {
  if (!rows.length) {
    return <p className="text-center text-ink-muted py-10">{t('invoicing_no_invoices')}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="admin-table" data-testid="invoicing-table">
        <thead>
          <tr>
            <th>{t('invoicing_th_number')}</th>
            <th>{t('invoicing_th_customer')}</th>
            <th>{t('invoicing_th_period')}</th>
            <th>{t('invoicing_th_net')}</th>
            <th>{t('invoicing_th_vat')}</th>
            <th>{t('invoicing_th_brutto')}</th>
            <th>{t('invoicing_th_status')}</th>
            <th className="text-right">{t('admin_th_actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inv) => {
            const cust = inv.customer_snapshot || {};
            const periodFrom = inv.leistungsdatum_start || inv.invoice_date;
            const periodTo = inv.leistungsdatum_end || inv.invoice_date;
            const cancelled = inv.status === 'cancelled';
            return (
              <tr key={inv.id} data-testid={`invoicing-row-${inv.id}`}>
                <td className="font-mono text-xs text-ink whitespace-nowrap">{inv.invoice_number}</td>
                <td>
                  <p className="font-medium text-ink text-sm">{cust.company_name || cust.name || '—'}</p>
                  <p className="text-xs text-ink-muted truncate max-w-[200px]">{cust.email}</p>
                </td>
                <td className="text-xs text-ink-soft whitespace-nowrap">
                  {fmtDate(periodFrom)} → {fmtDate(periodTo)}
                </td>
                <td className="text-ink whitespace-nowrap">{fmtEur(inv.net_total)}</td>
                <td className="text-ink-soft whitespace-nowrap">{fmtEur(inv.vat_total)}</td>
                <td className="font-bold text-ink whitespace-nowrap">{fmtEur(inv.brutto_total)}</td>
                <td>
                  <span className={`status-pill ${cancelled ? 'status-cancelled' : inv.invoice_type === 'storno' ? 'status-pending' : 'status-done'}`}>
                    {cancelled ? t('invoicing_status_cancelled')
                      : inv.invoice_type === 'storno' ? t('invoicing_status_storno')
                      : t('invoicing_status_issued')}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      className="admin-btn admin-btn-ghost admin-btn-sm"
                      onClick={() => onPdf(inv)}
                      data-testid={`invoicing-pdf-${inv.id}`}
                    >
                      <Download size={12} /> PDF
                    </button>
                    {allowStorno && !cancelled && inv.invoice_type !== 'storno' && (
                      <button
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        onClick={() => onStorno(inv)}
                        disabled={busy === inv.id}
                        data-testid={`invoicing-storno-${inv.id}`}
                      >
                        {busy === inv.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        {t('invoicing_btn_storno')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────────────────────
// Subscriptions sub-tab
// ──────────────────────────────────────────────
function SubscriptionsTab({ flash }) {
  const { t } = useLang();
  return <InvoiceListPanel kind="subscription" flash={flash} t={t}
    title={t('invoicing_subs_title')}
    description={t('invoicing_subs_help')}
    generateEndpoint="/api/admin/billing/invoices/generate-subscriptions"
    generateLabel={t('invoicing_generate_subs')}
  />;
}

// ──────────────────────────────────────────────
// Fees sub-tab — list + pending fees by pro
// ──────────────────────────────────────────────
function FeesTab({ flash }) {
  const { t } = useLang();
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [editReason, setEditReason] = useState('');

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const r = await api.get('/api/admin/billing/fees/grouped');
      setGroups(r.data.groups || []);
    } finally { setGroupsLoading(false); }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const saveFee = async (feeId) => {
    try {
      await api.patch(`/api/admin/billing/fees/${feeId}`, {
        amount: Number(draft),
        reason: editReason || null,
      });
      setEditing(null); setDraft(''); setEditReason('');
      flash(t('invoicing_fee_saved'));
      await loadGroups();
    } catch {
      flash(t('error_generic'));
    }
  };

  return (
    <div className="space-y-6">
      <InvoiceListPanel kind="fees" flash={flash} t={t}
        title={t('invoicing_fees_title')}
        description={t('invoicing_fees_help')}
        generateEndpoint="/api/admin/billing/invoices/generate-fees"
        generateLabel={t('invoicing_generate_fees')}
      />

      <div className="admin-panel" data-testid="invoicing-pending-fees-panel">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-headings font-bold text-ink text-xl">{t('invoicing_pending_fees_title')}</h2>
            <p className="text-xs text-ink-soft">{t('invoicing_pending_fees_help')}</p>
          </div>
          <button onClick={loadGroups} className="admin-btn admin-btn-ghost admin-btn-sm">
            <RefreshCw size={12} /> {t('admin_refresh')}
          </button>
        </div>

        {groupsLoading ? (
          <div className="flex justify-center py-10"><Loader2 size={24} className="text-teal animate-spin" /></div>
        ) : !groups.length ? (
          <p className="text-center text-ink-muted py-8">{t('invoicing_no_pending_fees')}</p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <details key={g.pro_id} className="admin-card" data-testid={`pending-fee-group-${g.pro_id}`}>
                <summary className="cursor-pointer flex items-center justify-between p-3">
                  <div>
                    <p className="font-medium text-ink text-sm">{g.company_name || g.name || g.email}</p>
                    <p className="text-xs text-ink-muted">{g.email}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="admin-tag">{g.fee_count} {t('invoicing_fees_word')}</span>
                    <span className="font-bold text-ink">{fmtEur(g.total_eur)}</span>
                  </div>
                </summary>
                <div className="px-3 pb-3 pt-1">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t('invoicing_th_date')}</th>
                        <th>{t('invoicing_th_description')}</th>
                        <th>{t('invoicing_th_amount')}</th>
                        <th className="text-right">{t('admin_th_actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.fees.map((f) => (
                        <tr key={f.id}>
                          <td className="text-xs text-ink-soft whitespace-nowrap">{fmtDate(f.incurred_at)}</td>
                          <td className="text-sm text-ink truncate max-w-[260px]">{f.description || '—'}</td>
                          <td className="text-sm text-ink whitespace-nowrap">
                            {editing === f.id ? (
                              <input
                                type="number"
                                step="0.01"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                className="admin-input w-24"
                                data-testid={`fee-edit-amount-${f.id}`}
                              />
                            ) : fmtEur(f.amount)}
                          </td>
                          <td>
                            <div className="flex items-center gap-2 justify-end">
                              {editing === f.id ? (
                                <>
                                  <input
                                    placeholder={t('invoicing_edit_reason_ph')}
                                    value={editReason}
                                    onChange={(e) => setEditReason(e.target.value)}
                                    className="admin-input w-36"
                                  />
                                  <button onClick={() => saveFee(f.id)} className="admin-btn admin-btn-primary admin-btn-sm">
                                    {t('btn_save')}
                                  </button>
                                  <button onClick={() => { setEditing(null); setEditReason(''); }} className="admin-btn admin-btn-ghost admin-btn-sm">
                                    {t('btn_cancel')}
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => { setEditing(f.id); setDraft(String(f.amount)); setEditReason(''); }}
                                  className="admin-btn admin-btn-ghost admin-btn-sm"
                                  data-testid={`fee-edit-${f.id}`}
                                >
                                  {t('btn_edit')}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Storno sub-tab — list of credit notes
// ──────────────────────────────────────────────
function StornoTab({ flash }) {
  const { t } = useLang();
  return <InvoiceListPanel kind="storno" flash={flash} t={t}
    title={t('invoicing_storno_title')}
    description={t('invoicing_storno_help')}
    generateEndpoint={null}
    generateLabel={null}
    allowStorno={false}
  />;
}

// ──────────────────────────────────────────────
// Generic invoice-list panel used by Subs / Fees / Storno
// ──────────────────────────────────────────────
function InvoiceListPanel({ kind, flash, t, title, description, generateEndpoint, generateLabel, allowStorno = true }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [stornoFor, setStornoFor] = useState(null);   // invoice obj
  const [stornoReason, setStornoReason] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/api/admin/billing/invoices?invoice_type=${kind}`);
      setRows(r.data.invoices || []);
    } finally { setLoading(false); }
  }, [kind]);

  useEffect(() => { load(); }, [load]);

  const onPdf = async (inv) => {
    try {
      const r = await api.get(`/api/admin/billing/invoices/${inv.id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      // Revoke after 60s — give the new tab time to load
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch {
      flash(t('error_generic'));
    }
  };

  const runGenerate = async () => {
    if (!generateEndpoint) return;
    setGenerating(true);
    try {
      const r = await api.post(generateEndpoint);
      const created = r.data?.created ?? 0;
      const skipped = r.data?.skipped ?? 0;
      flash(t('invoicing_generated_msg').replace('{created}', created).replace('{skipped}', skipped));
      await load();
    } catch (e) {
      flash(e?.response?.data?.detail || t('error_generic'));
    } finally { setGenerating(false); }
  };

  const submitStorno = async () => {
    if (!stornoFor || !stornoReason.trim() || stornoReason.trim().length < 3) {
      flash(t('invoicing_storno_reason_required'));
      return;
    }
    setBusy(stornoFor.id);
    try {
      await api.post(`/api/admin/billing/invoices/${stornoFor.id}/storno`, {
        reason: stornoReason.trim(),
      });
      flash(t('invoicing_storno_created'));
      setStornoFor(null); setStornoReason('');
      await load();
    } catch (e) {
      flash(e?.response?.data?.detail || t('error_generic'));
    } finally { setBusy(null); }
  };

  return (
    <div className="admin-panel" data-testid={`invoicing-panel-${kind}`}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="font-headings font-bold text-ink text-xl">{title}</h2>
          <p className="text-xs text-ink-soft mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="admin-btn admin-btn-ghost admin-btn-sm" data-testid={`invoicing-${kind}-refresh`}>
            <RefreshCw size={12} /> {t('admin_refresh')}
          </button>
          {generateEndpoint && (
            <button
              onClick={runGenerate}
              disabled={generating}
              className="admin-btn admin-btn-primary admin-btn-sm"
              data-testid={`invoicing-${kind}-generate`}
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {generateLabel}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={24} className="text-teal animate-spin" /></div>
      ) : (
        <InvoiceTable
          rows={rows}
          onPdf={onPdf}
          onStorno={(inv) => { setStornoFor(inv); setStornoReason(''); }}
          busy={busy}
          allowStorno={allowStorno}
          t={t}
        />
      )}

      {stornoFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="storno-modal">
          <div className="bg-paper rounded-[14px] shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-sm-border flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-warn" />
              <h3 className="font-headings font-bold text-ink text-lg">{t('invoicing_storno_modal_title')}</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-ink-soft">
                {t('invoicing_storno_modal_body').replace('{no}', stornoFor.invoice_number)}
              </p>
              <textarea
                className="admin-input w-full"
                rows={3}
                placeholder={t('invoicing_storno_reason_ph')}
                value={stornoReason}
                onChange={(e) => setStornoReason(e.target.value)}
                data-testid="storno-reason-input"
              />
            </div>
            <div className="px-5 py-4 border-t border-sm-border flex items-center justify-end gap-2">
              <button onClick={() => { setStornoFor(null); setStornoReason(''); }} className="admin-btn admin-btn-ghost admin-btn-sm">
                {t('btn_cancel')}
              </button>
              <button onClick={submitStorno} disabled={busy === stornoFor.id} className="admin-btn admin-btn-danger admin-btn-sm" data-testid="storno-confirm">
                {busy === stornoFor.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                {t('invoicing_storno_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Company-settings sub-tab — required before any invoice can be generated
// ──────────────────────────────────────────────
const SETTINGS_FIELDS = [
  { key: 'legal_name', label_key: 'cs_legal_name', required: true },
  { key: 'street', label_key: 'cs_street', required: true },
  { key: 'postal_code', label_key: 'cs_postal_code', required: true, w: 'w-32' },
  { key: 'city', label_key: 'cs_city', required: true },
  { key: 'country', label_key: 'cs_country', required: true, w: 'w-20' },
  { key: 'vat_id', label_key: 'cs_vat_id' },
  { key: 'tax_id', label_key: 'cs_tax_id' },
  { key: 'iban', label_key: 'cs_iban' },
  { key: 'bic', label_key: 'cs_bic' },
  { key: 'bank_name', label_key: 'cs_bank_name' },
  { key: 'email', label_key: 'cs_email' },
  { key: 'phone', label_key: 'cs_phone' },
  { key: 'invoice_prefix', label_key: 'cs_invoice_prefix' },
  { key: 'storno_prefix', label_key: 'cs_storno_prefix' },
];

function CompanySettingsTab({ flash }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    legal_name: '', street: '', postal_code: '', city: '', country: 'AT',
    vat_id: '', tax_id: '', iban: '', bic: '', bank_name: '', email: '', phone: '',
    invoice_footer_text: '',
    is_kleinunternehmer: false,
    default_vat_rate: 20,
    invoice_prefix: 'RG-',
    storno_prefix: 'GUT-',
  });
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/api/admin/billing/company-settings');
        if (r.data.configured && r.data.settings) {
          setForm((f) => ({ ...f, ...r.data.settings }));
          setConfigured(true);
        }
      } finally { setLoading(false); }
    })();
  }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    // Basic client-side validation
    for (const f of SETTINGS_FIELDS) {
      if (f.required && !String(form[f.key] || '').trim()) {
        flash(t('invoicing_settings_required').replace('{field}', t(f.label_key)));
        return;
      }
    }
    setSaving(true);
    try {
      const payload = { ...form };
      // strip ids/timestamps that came from the GET
      delete payload.id; delete payload._id; delete payload.updated_at;
      await api.put('/api/admin/billing/company-settings', payload);
      flash(t('invoicing_settings_saved'));
      setConfigured(true);
    } catch (e) {
      flash(e?.response?.data?.detail || t('error_generic'));
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="text-teal animate-spin" /></div>;
  }

  return (
    <div className="admin-panel" data-testid="invoicing-settings-panel">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-headings font-bold text-ink text-xl">{t('invoicing_settings_title')}</h2>
          <p className="text-xs text-ink-soft mt-1">{t('invoicing_settings_help')}</p>
        </div>
        {!configured && (
          <span className="status-pill status-pending"><AlertTriangle size={11} /> {t('invoicing_settings_warn_unconfigured')}</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SETTINGS_FIELDS.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
              {t(f.label_key)}{f.required && <span className="text-red-warn">*</span>}
            </span>
            <input
              type="text"
              value={form[f.key] || ''}
              onChange={(e) => setField(f.key, e.target.value)}
              className={`admin-input ${f.w || 'w-full'}`}
              data-testid={`cs-input-${f.key}`}
            />
          </label>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-sm-border">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={!!form.is_kleinunternehmer}
            onChange={(e) => setField('is_kleinunternehmer', e.target.checked)}
            className="h-4 w-4"
            data-testid="cs-input-is_kleinunternehmer"
          />
          <div>
            <p className="text-sm font-semibold text-ink">{t('cs_kleinunternehmer')}</p>
            <p className="text-xs text-ink-muted">{t('cs_kleinunternehmer_help')}</p>
          </div>
        </label>

        <label className="block text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
            {t('cs_default_vat_rate')}
          </span>
          <select
            value={form.default_vat_rate}
            onChange={(e) => setField('default_vat_rate', Number(e.target.value))}
            disabled={!!form.is_kleinunternehmer}
            className="admin-input w-full"
            data-testid="cs-input-default_vat_rate"
          >
            <option value={20}>20% (Standard)</option>
            <option value={10}>10% (Ermäßigt)</option>
            <option value={0}>0%</option>
          </select>
        </label>

        <label className="block text-sm md:col-span-2">
          <span className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
            {t('cs_footer_text')}
          </span>
          <textarea
            rows={3}
            value={form.invoice_footer_text || ''}
            onChange={(e) => setField('invoice_footer_text', e.target.value)}
            className="admin-input w-full"
            data-testid="cs-input-footer"
            placeholder={t('cs_footer_ph')}
          />
        </label>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        <button onClick={save} disabled={saving} className="admin-btn admin-btn-primary" data-testid="cs-save">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <SettingsIcon size={14} />}
          {t('invoicing_settings_save')}
        </button>
      </div>
    </div>
  );
}



/* ─────────────────────────── Online Payments tab (iter45) ─────────────────────────── */
function OnlinePaymentsTab({ flash, t }) {
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ paid_invoice_volume: 0, paid_fee_revenue: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [filters, setFilters] = useState({ status: 'all' });
  const [year, setYear] = useState(null);
  const [month, setMonth] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status !== 'all') params.set('status', filters.status);
    if (year) params.set('year', year);
    if (month) params.set('month', month);
    params.set('page', page);
    params.set('per_page', perPage);
    api.get(`/api/admin/online-payments?${params.toString()}`)
      .then((r) => {
        setItems(r.data.items || []);
        setTotals(r.data.totals || { paid_invoice_volume: 0, paid_fee_revenue: 0 });
        setTotal(r.data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [filters, year, month, page, perPage]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4" data-testid="online-payments-tab">
      <div className="admin-stat-grid">
        <div className="admin-stat">
          <div className="admin-stat-label">{t('admin_paid_volume')}</div>
          <div className="admin-stat-value">{fmtEur(totals.paid_invoice_volume)}</div>
          <div className="admin-stat-trend">{t('admin_total_invoice_volume')}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">{t('admin_fee_revenue')}</div>
          <div className="admin-stat-value">{fmtEur(totals.paid_fee_revenue)}</div>
          <div className="admin-stat-trend">{t('admin_1_pct_fee_collected')}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">{t('admin_transactions')}</div>
          <div className="admin-stat-value">{total}</div>
          <div className="admin-stat-trend">{t('admin_matched_filter')}</div>
        </div>
      </div>

      <AdminFilterBar
        filters={[
          { key: 'status', label: 'Status', options: [
            { value: 'all', label: 'All' },
            { value: 'paid', label: 'Paid' },
            { value: 'unpaid', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
          ] },
        ]}
        values={filters}
        onChange={(k, v) => { setFilters({ ...filters, [k]: v }); setPage(1); }}
        showYear
        showMonth
        yearValue={year}
        onYearChange={(v) => { setYear(v); setMonth(null); setPage(1); }}
        monthValue={month}
        onMonthChange={(v) => { setMonth(v); setPage(1); }}
        totalLabel={`${total} transactions`}
        onReset={() => { setFilters({ status: 'all' }); setYear(null); setMonth(null); setPage(1); }}
      />

      <div className="admin-panel">
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 size={20} className="text-teal animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-ink-muted py-8">{t('admin_no_data')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin_th_date')}</th>
                  <th>{t('admin_th_invoice')}</th>
                  <th>{t('admin_th_pro')}</th>
                  <th className="text-right">{t('admin_th_amount')}</th>
                  <th className="text-right">{t('admin_th_fee')}</th>
                  <th>{t('admin_th_status')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} data-testid={`online-payment-row-${i.id}`}>
                    <td className="text-ink-soft text-xs">{fmtDate(i.created_at)}</td>
                    <td className="font-mono text-xs">{i.invoice_number || '—'}</td>
                    <td className="text-ink">{i.pro_name || i.pro_id?.slice(-6) || '—'}</td>
                    <td className="text-right font-mono">{fmtEur(i.invoice_amount_eur)}</td>
                    <td className="text-right font-mono font-bold text-teal">{fmtEur(i.service_fee_eur)}</td>
                    <td>
                      <span className={`status-pill ${i.payment_status === 'paid' ? 'status-done' : i.payment_status === 'failed' ? 'status-cancelled' : 'status-pending'}`}>
                        {i.payment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <AdminPagination page={page} perPage={perPage} total={total} onPageChange={setPage} onPerPageChange={setPerPage} sizes={[20, 50, 100]} />
          </div>
        )}
      </div>
    </div>
  );
}


/* ─────────────────────────── Invoice Data tab (iter45) ─────────────────────────── */
function InvoiceDataTab({ flash, t }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openTpl, setOpenTpl] = useState(null);
  const [year, setYear] = useState(null);
  const [month, setMonth] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/api/admin/invoice-templates')
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  const exportAllPdf = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (year) params.set('year', year);
      if (month) params.set('month', month);
      const r = await api.get(`/api/admin/invoices/export.zip?${params.toString()}`, { responseType: 'blob' });
      const blob = new Blob([r.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin-invoices-${year || 'all'}${month ? `-${String(month).padStart(2, '0')}` : ''}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      flash?.('Export complete');
    } catch (e) {
      flash?.('Export failed');
    } finally { setExporting(false); }
  };

  if (loading || !data) return <div className="flex items-center justify-center py-10"><Loader2 size={20} className="text-teal animate-spin" /></div>;

  return (
    <div className="space-y-4" data-testid="invoice-data-tab">
      <div className="admin-panel">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <h3 className="font-headings font-bold text-ink text-lg inline-flex items-center gap-2">
              <Palette size={16} className="text-teal" />
              {t('admin_invoice_templates_title') || 'Invoice templates in use'}
            </h3>
            <p className="text-xs text-ink-muted">{t('admin_invoice_templates_help') || 'Adoption per template across all pros.'}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={year || ''}
              onChange={(e) => { setYear(e.target.value ? parseInt(e.target.value, 10) : null); setMonth(null); }}
              className="admin-input text-xs h-8 py-0"
              data-testid="invoice-data-filter-year"
            >
              <option value="">All years</option>
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {year && (
              <select
                value={month || ''}
                onChange={(e) => setMonth(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="admin-input text-xs h-8 py-0"
                data-testid="invoice-data-filter-month"
              >
                <option value="">All months</option>
                {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            )}
            <button
              onClick={exportAllPdf}
              disabled={exporting}
              className="admin-btn admin-btn-primary admin-btn-sm"
              data-testid="invoice-data-export-all-pdf"
            >
              {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {t('admin_export_all_pdf') || 'Export all as PDF'}
            </button>
          </div>
        </div>

        <p className="text-sm text-ink-muted mb-3">{t('admin_total_pros') || 'Total pros'}: <span className="font-bold text-ink">{data.total_pros}</span></p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.templates.map((tpl) => (
            <div
              key={tpl.key}
              className="bg-cream-soft rounded-lg p-3 border border-sm-border cursor-pointer hover:border-teal/40 transition-colors"
              onClick={() => setOpenTpl(openTpl === tpl.key ? null : tpl.key)}
              data-testid={`invoice-template-card-${tpl.key}`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-ink text-sm capitalize">{tpl.name}</p>
                <span className="text-[10px] uppercase tracking-wider font-bold bg-teal/15 text-teal px-2 py-0.5 rounded-full">{tpl.pct}%</span>
              </div>
              <p className="text-xs text-ink-muted">{tpl.count} {tpl.count === 1 ? 'pro' : 'pros'}</p>
              <div className="h-1.5 bg-cream-deep rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-teal" style={{ width: `${tpl.pct}%` }} />
              </div>
            </div>
          ))}
        </div>

        {openTpl && (
          <div className="mt-4 bg-cream-soft rounded-lg p-3" data-testid={`invoice-template-pros-${openTpl}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">
              Pros using <span className="text-teal">{(data.templates.find(t2 => t2.key === openTpl) || {}).name}</span>
            </p>
            {(data.templates.find(t2 => t2.key === openTpl) || { pros: [] }).pros.length === 0 ? (
              <p className="text-xs text-ink-muted">No pros yet</p>
            ) : (
              <ul className="space-y-1">
                {(data.templates.find(t2 => t2.key === openTpl) || {}).pros.map((p) => (
                  <li key={p.pro_id} className="text-sm text-ink">
                    {p.business_name || p.pro_name} <span className="text-ink-muted text-xs">({p.pro_id.slice(-6)})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
