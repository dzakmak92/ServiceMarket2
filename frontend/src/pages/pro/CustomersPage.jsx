import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  Loader2, Plus, Search, User, Building2, Mail, Phone, MapPin, X, AlertCircle,
} from 'lucide-react';

const EMPTY = {
  type: 'private', name: '', company_name: '', contact_person: '',
  email: '', phone: '', address: '', postal_code: '', city: '',
  vat_id: '', notes: '',
};

/**
 * Customer CRM.
 *
 * The backend has owned customers since the re-spine; this is the first screen
 * for them. Search is server-side because a tradesperson with a few hundred
 * customers searches by half-remembered fragments, and the repository already
 * matches across name, company, email, phone and city.
 */
export default function CustomersPage() {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { q, limit: 100 };
      if (typeFilter) params.type = typeFilter;
      const { data } = await api.get('/api/customers', { params });
      setItems(data.customers || data.items || []);
      setTotal(data.total ?? (data.customers || []).length);
    } catch (e) {
      setError(e?.response?.data?.detail || t('generic_error') || 'Could not load customers');
    } finally {
      setLoading(false);
    }
  }, [q, typeFilter, t]);

  // Debounced so typing a search does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== '' && v !== null)
      );
      const { data } = await api.post('/api/customers', payload);
      // The API reports a likely duplicate instead of silently creating a
      // second record — say so rather than pretending a new one was made.
      setNotice(data.created ? t('customer_created') || 'Customer created'
                             : t('customer_duplicate') || 'An existing customer matched — opened that one instead');
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not save customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="font-headings font-bold text-ink text-2xl">
              {t('customers') || 'Kunden'}
            </h1>
            <p className="text-sm text-ink-muted">
              {total} {total === 1 ? (t('customer') || 'Kunde') : (t('customers') || 'Kunden')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowForm((s) => !s); setNotice(''); }}
            className="btn-primary flex items-center gap-2"
            data-testid="customer-new-btn"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? (t('cancel') || 'Abbrechen') : (t('new_customer') || 'Neuer Kunde')}
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('search_customers') || 'Name, Firma, E-Mail, Telefon, Ort…'}
              className="input pl-9 w-full"
              data-testid="customer-search"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input w-40"
            data-testid="customer-type-filter"
          >
            <option value="">{t('all') || 'Alle'}</option>
            <option value="private">{t('private') || 'Privat'}</option>
            <option value="business">{t('business') || 'Firma'}</option>
          </select>
        </div>

        {notice && (
          <div className="card mb-3 text-sm text-ink" data-testid="customer-notice">{notice}</div>
        )}
        {error && (
          <div className="card mb-3 flex items-start gap-2 text-sm text-red-warn" data-testid="customer-error">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {showForm && (
          <form onSubmit={submit} className="card-lg mb-4 space-y-3" data-testid="customer-form">
            <div className="flex gap-2">
              {['private', 'business'].map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => set('type', kind)}
                  className={form.type === kind ? 'chip-active' : 'chip'}
                >
                  {kind === 'private' ? (t('private') || 'Privat') : (t('business') || 'Firma')}
                </button>
              ))}
            </div>

            <input className="input w-full" required placeholder={`${t('name') || 'Name'} *`}
                   value={form.name} onChange={(e) => set('name', e.target.value)} />

            {form.type === 'business' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className="input" placeholder={t('company_name') || 'Firmenname'}
                       value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
                {/* UID matters for §13b reverse charge on construction work. */}
                <input className="input" placeholder={t('vat_id') || 'UID-Nummer'}
                       value={form.vat_id} onChange={(e) => set('vat_id', e.target.value)} />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="input" type="email" placeholder={t('email') || 'E-Mail'}
                     value={form.email} onChange={(e) => set('email', e.target.value)} />
              <input className="input" placeholder={t('phone') || 'Telefon'}
                     value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>

            <input className="input w-full" placeholder={t('address') || 'Adresse'}
                   value={form.address} onChange={(e) => set('address', e.target.value)} />

            <div className="grid grid-cols-3 gap-3">
              <input className="input" placeholder={t('postal_code') || 'PLZ'}
                     value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
              <input className="input col-span-2" placeholder={t('city') || 'Ort'}
                     value={form.city} onChange={(e) => set('city', e.target.value)} />
            </div>

            <textarea className="input w-full" rows={2} placeholder={t('notes') || 'Notizen'}
                      value={form.notes} onChange={(e) => set('notes', e.target.value)} />

            <button type="submit" disabled={saving || !form.name.trim()}
                    className="btn-primary w-full" data-testid="customer-save">
              {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : (t('save') || 'Speichern')}
            </button>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={26} className="text-teal animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="card-lg text-center py-10" data-testid="customer-empty">
            <User size={30} className="text-ink-muted mx-auto mb-2" />
            <p className="font-headings font-bold text-ink">
              {q ? (t('no_results') || 'Keine Treffer') : (t('no_customers_yet') || 'Noch keine Kunden')}
            </p>
            <p className="text-sm text-ink-muted mt-1">
              {q ? (t('try_another_search') || 'Andere Suche versuchen')
                 : (t('add_first_customer') || 'Legen Sie Ihren ersten Kunden an.')}
            </p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="customer-list">
            {items.map((c) => (
              <div key={c.id} className="card flex items-start gap-3" data-testid="customer-row">
                <div className="mt-0.5 text-teal">
                  {c.type === 'business' ? <Building2 size={18} /> : <User size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  {/* The name is the way into the record — the detail, edit
                      and delete endpoints had no caller at all before it.
                      Only the name, not the whole row: the row already
                      contains mailto: and tel: links, and an anchor inside an
                      anchor is invalid and behaves unpredictably on tap. */}
                  <Link to={`/customers/${c.id}`} data-testid="customer-open"
                        className="block font-headings font-bold text-ink truncate hover:text-teal">
                    {c.company_name || c.name}
                  </Link>
                  {c.company_name && c.name && (
                    <div className="text-sm text-ink-muted truncate">{c.name}</div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-teal">
                        <Mail size={13} /> {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-teal">
                        <Phone size={13} /> {c.phone}
                      </a>
                    )}
                    {(c.city || c.postal_code) && (
                      <span className="flex items-center gap-1">
                        <MapPin size={13} /> {[c.postal_code, c.city].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
