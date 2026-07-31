import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import { statusLabel } from '../../utils/jobStatus';
import {
  ArrowLeft, Loader2, AlertCircle, Mail, Phone, MapPin, Building2, User,
  Save, Trash2, Briefcase, Receipt,
} from 'lucide-react';

const fmtEur = (v) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('de-AT') : '—');

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs text-ink-muted mb-1">{label}</span>
    {children}
  </label>
);

/**
 * One customer: the record, their history, and the ability to correct it.
 *
 * GET, PATCH and DELETE on /api/customers/{id} have all existed and none of
 * them was called from anywhere. A customer could be created and after that
 * never touched — a typo in a UID went in permanently, an address that
 * changed could not be updated, and a duplicate created before the dedupe
 * check was tightened could not be got rid of.
 *
 * The UID is the field that makes this more than tidiness: §13b reverse
 * charge on construction work turns on it, so a wrong one is a wrong invoice.
 *
 * Deletion is soft, and says so. Invoices hold a foreign key to this row and
 * carry a seven-to-ten year retention obligation, so "delete" here means
 * "stop showing me this customer", not "erase them" — and a user who is not
 * told that has been misled about what the button did.
 */
export default function CustomerDetailPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();

  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get(`/api/customers/${customerId}`);
      setCustomer(data);
      setForm({
        type: data.type || 'private',
        name: data.name || '',
        company_name: data.company_name || '',
        contact_person: data.contact_person || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        postal_code: data.postal_code || '',
        city: data.city || '',
        vat_id: data.vat_id || '',
        notes: data.notes || '',
      });
      // Their history, from the list endpoints that already filter by customer.
      const [j, i] = await Promise.all([
        api.get('/api/jobs', { params: { customer_id: customerId, limit: 100 } })
          .catch(() => ({ data: { jobs: [] } })),
        api.get('/api/invoices', { params: { customer_id: customerId, limit: 100 } })
          .catch(() => ({ data: { invoices: [] } })),
      ]);
      setJobs(j.data.jobs || []);
      setInvoices(i.data.invoices || []);
    } catch (e) {
      setError(e?.response?.data?.detail || t('generic_error'));
    } finally {
      setLoading(false);
    }
  }, [customerId, t]);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      // Empty strings are sent as null so a field can be cleared. Omitting
      // them would make "delete this phone number" impossible — PATCH drops
      // what it is not sent.
      const body = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));
      const { data } = await api.patch(`/api/customers/${customerId}`, body);
      setCustomer(data);
    } catch (e2) {
      setError(e2?.response?.data?.detail || t('generic_error'));
    } finally { setSaving(false); }
  };

  const remove = async () => {
    setSaving(true); setError('');
    try {
      await api.delete(`/api/customers/${customerId}`);
      navigate('/customers', { replace: true });
    } catch (e) {
      setError(e?.response?.data?.detail || t('generic_error'));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={26} className="text-teal animate-spin" />
      </div>
    );
  }
  if (!customer || !form) {
    return (
      <div className="min-h-screen bg-cream p-6">
        <div className="card-lg text-center" data-testid="customer-detail-missing">
          <AlertCircle size={26} className="text-red-warn mx-auto mb-2" />
          <p className="text-ink">{error || t('customer_not_found')}</p>
          <Link to="/customers" className="btn-secondary mt-4 inline-flex">
            <ArrowLeft size={14} /> {t('customers')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-28">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Link to="/customers"
              className="text-sm text-ink-muted hover:text-ink inline-flex items-center gap-1 mb-3">
          <ArrowLeft size={14} /> {t('customers')}
        </Link>

        <div className="card-lg mb-4">
          <div className="flex items-start gap-3">
            <div className="text-teal mt-0.5">
              {customer.type === 'business' ? <Building2 size={20} /> : <User size={20} />}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-headings font-bold text-ink text-xl truncate">
                {customer.company_name || customer.name}
              </h1>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-1 hover:text-teal">
                    <Mail size={13} /> {customer.email}
                  </a>
                )}
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="flex items-center gap-1 hover:text-teal">
                    <Phone size={13} /> {customer.phone}
                  </a>
                )}
                {(customer.city || customer.postal_code) && (
                  <span className="flex items-center gap-1">
                    <MapPin size={13} /> {[customer.postal_code, customer.city].filter(Boolean).join(' ')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-cream-dark text-center">
            <div>
              <div className="font-headings font-bold text-ink">{customer.jobs_count ?? jobs.length}</div>
              <div className="text-[11px] text-ink-muted">{t('cust_jobs')}</div>
            </div>
            <div>
              <div className="font-headings font-bold text-ink" data-testid="customer-ltv">
                {fmtEur(customer.lifetime_value)}
              </div>
              <div className="text-[11px] text-ink-muted">{t('cust_lifetime_value')}</div>
            </div>
            <div>
              <div className="font-headings font-bold text-ink">{fmtDate(customer.last_job_at)}</div>
              <div className="text-[11px] text-ink-muted">{t('cust_last_job')}</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="card mb-3 flex items-start gap-2 text-sm text-red-warn"
               data-testid="customer-detail-error">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        <form onSubmit={save} className="card-lg space-y-3 mb-4" data-testid="customer-edit-form">
          <div className="flex gap-2">
            {['private', 'business'].map((kind) => (
              <button key={kind} type="button" onClick={() => set('type', kind)}
                      className={form.type === kind ? 'chip-active' : 'chip'}>
                {kind === 'private' ? t('private') : t('business')}
              </button>
            ))}
          </div>

          {/* Labelled rather than placeholdered. A create form starts empty so
              a placeholder reads as a label; an edit form arrives full, the
              placeholder never renders, and the card becomes a column of
              unexplained values — a name, an email, a phone number, "1070",
              "Wien" — with nothing saying which box is which. */}
          <Field label={`${t('name')} *`}>
            <input className="input w-full" required value={form.name}
                   onChange={(e) => set('name', e.target.value)}
                   data-testid="customer-edit-name" />
          </Field>

          {form.type === 'business' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t('company_name')}>
                <input className="input w-full" value={form.company_name}
                       onChange={(e) => set('company_name', e.target.value)} />
              </Field>
              {/* The UID decides §13b reverse charge on construction work, so
                  a typo here is a wrong invoice, not an untidy record. */}
              <Field label={t('vat_id')}>
                <input className="input w-full" value={form.vat_id}
                       onChange={(e) => set('vat_id', e.target.value)}
                       data-testid="customer-edit-vat" />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('email')}>
              <input className="input w-full" type="email" value={form.email}
                     onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label={t('phone')}>
              <input className="input w-full" value={form.phone}
                     onChange={(e) => set('phone', e.target.value)} />
            </Field>
          </div>

          <Field label={t('address')}>
            <input className="input w-full" value={form.address}
                   onChange={(e) => set('address', e.target.value)} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label={t('postal_code')}>
              <input className="input w-full" value={form.postal_code}
                     onChange={(e) => set('postal_code', e.target.value)} />
            </Field>
            <div className="col-span-2">
              <Field label={t('city')}>
                <input className="input w-full" value={form.city}
                       onChange={(e) => set('city', e.target.value)} />
              </Field>
            </div>
          </div>

          <Field label={t('notes')}>
            <textarea className="input w-full" rows={2} value={form.notes}
                      onChange={(e) => set('notes', e.target.value)} />
          </Field>

          <button type="submit" className="btn-primary w-full" disabled={saving || !form.name.trim()}
                  data-testid="customer-edit-save">
            {saving ? <Loader2 size={16} className="animate-spin mx-auto" />
                    : <><Save size={16} className="inline mr-1" />{t('save')}</>}
          </button>
        </form>

        {jobs.length > 0 && (
          <div className="card-lg mb-4">
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2 flex items-center gap-1.5">
              <Briefcase size={12} /> {t('cust_jobs')}
            </p>
            <div className="divide-y divide-cream-dark" data-testid="customer-jobs">
              {jobs.map((j) => (
                <Link key={j.id} to={`/projects/${j.id}`}
                      className="flex items-center justify-between gap-3 py-2 group">
                  <span className="min-w-0 truncate text-sm text-ink group-hover:text-teal">
                    {j.job_number ? `${j.job_number} · ` : ''}{j.title}
                  </span>
                  <span className="text-xs text-ink-muted shrink-0">{statusLabel(j.status, t)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {invoices.length > 0 && (
          <div className="card-lg mb-4">
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2 flex items-center gap-1.5">
              <Receipt size={12} /> {t('invoices')}
            </p>
            <div className="divide-y divide-cream-dark" data-testid="customer-invoices">
              {invoices.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-sm text-ink">
                    {i.invoice_number || t('myinv_status_draft')} · {fmtDate(i.issue_date)}
                  </span>
                  <span className="text-sm text-ink shrink-0">{fmtEur(i.gross_total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card-lg">
          <p className="text-sm text-ink-muted">{t('cust_delete_help')}</p>
          {confirmDelete ? (
            <div className="flex gap-2 mt-3">
              <button type="button" className="btn-primary text-sm bg-red-warn"
                      disabled={saving} onClick={remove} data-testid="customer-delete-confirm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : t('cust_delete_confirm')}
              </button>
              <button type="button" className="btn-secondary text-sm"
                      onClick={() => setConfirmDelete(false)}>{t('cancel')}</button>
            </div>
          ) : (
            <button type="button" className="btn-ghost text-sm text-red-warn mt-2"
                    onClick={() => setConfirmDelete(true)} data-testid="customer-delete">
              <Trash2 size={14} className="inline mr-1" />{t('delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
