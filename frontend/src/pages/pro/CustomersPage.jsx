import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  Loader2, Plus, Search, Mail, Phone, MapPin, MessageCircle, X, AlertCircle,
} from 'lucide-react';

const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Two letters off the name that will be shown, so the ring matches the card. */
const initials = (c) => ((c.company_name || c.name || '?')
  .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();

const firstLetter = (c) => {
  const ch = (c.company_name || c.name || '').trim()[0];
  if (!ch) return '#';
  const up = ch.toUpperCase();
  return AZ.includes(up) ? up : '#';
};

/* The tax treatment the quote will resolve for this customer.
   `quotes_repo._tax_context` decides it from the record, and the two facts it
   turns on are on the row: a Bauleister, and whether the UID was validated —
   which the schema is explicit about ("A business customer without a validated
   UID is NOT eligible"). Anything unsettled is worth seeing before the tap. */
const taxOf = (c) => {
  if (c.is_bauleister) {
    return c.vat_id_validated_at
      ? { label: '§ 13b', warn: true } : { label: '§ 13b ?', warn: true };
  }
  if (c.type === 'business' && c.vat_id && !c.vat_id_validated_at) {
    return { label: 'UID ?', warn: true };
  }
  return { label: '20 %', warn: false };
};

const fmtEur = (n) => (Number(n) || 0).toLocaleString('de-AT',
  { maximumFractionDigits: 0 });

const ago = (iso, t) => {
  if (!iso) return t('contacts_never');
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 1) return t('contacts_today');
  if (days < 60) return t('contacts_days', { n: days });
  return t('contacts_months', { n: Math.round(days / 30) });
};

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
  /* Always A–Z. `search` returns `last_job_at desc nulls last, name asc`, so
     recency is what arrives and this re-sorts it — which is what makes the
     rail on the right honest: an alphabet index over a recency list points at
     letters that are not where it says. */
  const [plz, setPlz] = useState('');
  const navigate = useNavigate();

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

  /* Every postcode in the book with a count, commonest first. Derived rather
     than configured: a painter's districts are whatever their customers are
     in, and nobody should have to maintain a list of them. */
  const plzOptions = useMemo(() => {
    const counts = new Map();
    items.forEach((c) => {
      const p = (c.postal_code || '').trim();
      if (p) counts.set(p, (counts.get(p) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [items]);

  const shown = useMemo(() => {
    const list = plz ? items.filter((c) => (c.postal_code || '').trim() === plz) : items;
    return [...list].sort((a, b) => (a.company_name || a.name || '')
      .localeCompare(b.company_name || b.name || '', 'de'));
  }, [items, plz]);

  /* Which letters the rail can actually land on. */
  const letters = useMemo(() => new Set(shown.map(firstLetter)), [shown]);

  const toLetter = (l) => {
    const el = document.querySelector(`[data-letter="${l}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
      setError(e2?.response?.data?.detail || t('cust_err_save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    /* bg-paper, not bg-cream. Walking the paint chain on the running app:
       /estimate and /projects paint rgb(255,255,255) and this page painted
       rgb(253,243,227), so a pro arriving here from a calculation crossed into
       a different-coloured room for no reason. */
    <div className="min-h-screen bg-paper pb-24">
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

        <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-rule
                        bg-row pl-3 pr-2 h-[42px]">
          <Search size={15} className="shrink-0 text-ink-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search_customers') || 'Name, Firma, E-Mail, Telefon, Ort…'}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none"
            data-testid="customer-search"
          />
          <select
            value={plz}
            onChange={(e) => setPlz(e.target.value)}
            className="h-[30px] rounded-[8px] border border-navy-edge bg-paper px-1.5
                       text-[10.5px] font-extrabold text-ink"
            data-testid="customer-plz-filter"
          >
            <option value="">{t('contacts_plz_all')}</option>
            {plzOptions.map(([p, n]) => (
              <option key={p} value={p}>{p} · {n}</option>
            ))}
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
          <div className="flex gap-1.5" data-testid="customer-list">
            <div className="min-w-0 flex-1">
              {shown.map((c, i) => {
                const tax = taxOf(c);
                const letter = firstLetter(c);
                const heads = i === 0 || firstLetter(shown[i - 1]) !== letter;
                const title = c.company_name || c.name;
                return (
                  <React.Fragment key={c.id}>
                    {heads && (
                      <p data-letter={letter}
                         className="mb-1.5 ml-1 text-[10px] font-extrabold tracking-[.08em] text-teal">
                        {letter}
                      </p>
                    )}
                    <div data-testid="customer-row"
                         className="mb-3 overflow-hidden rounded-[14px] border-[1.5px]
                                    border-[#9dbcd8] bg-paper">
                      <div className="flex items-center gap-3 px-3 pb-2.5 pt-3">
                        {/* A closed ring, not a gauge. The colour is the tax
                            treatment and nothing else, so it reads as a state
                            rather than as a proportion of something. */}
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full
                                          border-2 bg-paper text-[12.5px] font-extrabold
                                          ${tax.warn ? 'border-amber-text text-amber-text'
                                                     : 'border-teal text-teal'}`}>
                          {initials(c)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link to={`/customers/${c.id}`} data-testid="customer-open"
                                  className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold
                                             text-ink hover:text-teal">
                              {title}
                            </Link>
                            <span className={`shrink-0 rounded-full px-1.5 py-[3px] text-[8.5px]
                                              font-extrabold
                                              ${tax.warn ? 'bg-amber/20 text-amber-text'
                                                         : 'bg-green-pos/15 text-green-text'}`}>
                              {tax.label}
                            </span>
                          </div>
                          <p className="truncate text-[10.5px] text-ink-muted">
                            {[t('contacts_jobs', { n: c.jobs_count ?? 0 }),
                              Number(c.lifetime_value) > 0
                                ? `${fmtEur(c.lifetime_value)} €` : null,
                              ago(c.last_job_at, t)].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>

                      {/* Four ways to reach them, then the reason this screen
                          exists. The washes are 14 % — the strength /quotes
                          already draws its tabs at — so the action at the end
                          stays the strongest thing in the strip. */}
                      <div className="flex items-center gap-1.5 border-t border-[#b9d0e4]
                                      bg-row px-3 py-2">
                        <a href={c.phone ? `tel:${c.phone}` : undefined}
                           aria-disabled={!c.phone} aria-label={t('phone')}
                           className={`grid h-8 w-8 place-items-center rounded-full
                                       bg-green-pos/[.14] text-green-text
                                       ${c.phone ? '' : 'pointer-events-none opacity-40'}`}>
                          <Phone size={14} />
                        </a>
                        <a href={c.phone ? `sms:${c.phone}` : undefined}
                           aria-disabled={!c.phone} aria-label={t('contacts_message')}
                           className={`grid h-8 w-8 place-items-center rounded-full
                                       bg-teal/[.14] text-teal-deep
                                       ${c.phone ? '' : 'pointer-events-none opacity-40'}`}>
                          <MessageCircle size={14} />
                        </a>
                        <a href={c.email ? `mailto:${c.email}` : undefined}
                           aria-disabled={!c.email} aria-label={t('email')}
                           className={`grid h-8 w-8 place-items-center rounded-full
                                       bg-navy/[.14] text-navy
                                       ${c.email ? '' : 'pointer-events-none opacity-40'}`}>
                          <Mail size={14} />
                        </a>
                        <a href={[c.address, c.postal_code, c.city].filter(Boolean).length
                              ? `https://www.google.com/maps/search/?api=1&query=${
                                encodeURIComponent([c.address, c.postal_code, c.city]
                                  .filter(Boolean).join(' '))}` : undefined}
                           target="_blank" rel="noreferrer"
                           aria-label={t('contacts_route')}
                           className={`grid h-8 w-8 place-items-center rounded-full
                                       bg-red-warn/[.14] text-[#8f2f3b]
                                       ${c.city || c.address ? '' : 'pointer-events-none opacity-40'}`}>
                          <MapPin size={14} />
                        </a>
                        <button type="button"
                                onClick={() => navigate(`/estimate?customer=${c.id}`)}
                                data-testid={`customer-to-estimate-${c.id}`}
                                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full
                                           bg-teal/[.14] px-3.5 text-[10.5px] font-extrabold
                                           text-teal">
                          <Plus size={13} /> {t('contacts_to_estimate')}
                        </button>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            <div className="flex w-[17px] shrink-0 flex-col items-center justify-between py-0.5"
                 data-testid="contacts-rail">
              {AZ.map((l) => (
                <button key={l} type="button" onClick={() => toLetter(l)}
                        disabled={!letters.has(l)}
                        className={`w-[17px] text-[9px] font-extrabold leading-none
                                    ${letters.has(l) ? 'text-teal' : 'text-ink-faint/40'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
