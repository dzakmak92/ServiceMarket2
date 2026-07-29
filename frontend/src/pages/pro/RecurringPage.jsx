import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  Loader2, Plus, X, Repeat, CalendarPlus, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

const fmtEur = (v) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));

const CADENCES = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'seasonal', 'on_demand'];
const NEEDS_WEEKDAY = new Set(['weekly', 'fortnightly']);
// The API generates nothing for these: they are triggered by conditions, not
// by a calendar, so the UI says so instead of offering a dead button.
const NO_SCHEDULE = new Set(['seasonal', 'on_demand']);
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const EMPTY = {
  customer_id: '', title: '', cadence: 'fortnightly', weekday: 2,
  price_per_visit: '', billing: 'per_visit',
  starts_on: new Date().toISOString().slice(0, 10), ends_on: '',
};

export default function RecurringPage() {
  const { t } = useLang();
  const [contracts, setContracts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [visits, setVisits] = useState({});
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: c }, { data: cu }] = await Promise.all([
        api.get('/api/recurring'),
        api.get('/api/customers', { params: { limit: 200 } }).catch(() => ({ data: { customers: [] } })),
      ]);
      setContracts(c.contracts || []);
      setCustomers(cu.customers || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load contracts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.customer_id || !form.title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        customer_id: form.customer_id,
        title: form.title.trim(),
        cadence: form.cadence,
        billing: form.billing,
        starts_on: form.starts_on,
      };
      if (NEEDS_WEEKDAY.has(form.cadence)) body.weekday = Number(form.weekday);
      if (form.price_per_visit !== '') body.price_per_visit = Number(form.price_per_visit);
      if (form.ends_on) body.ends_on = form.ends_on;
      await api.post('/api/recurring', body);
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not create the contract');
    } finally {
      setSaving(false);
    }
  };

  const generate = async (id) => {
    setBusyId(id);
    setNotice('');
    setError('');
    try {
      const { data } = await api.post(`/api/recurring/${id}/generate`, null, { params: { days: 90 } });
      // created and skipped are reported separately so a repeat press reads
      // as "already done" rather than as a failure.
      setNotice(data.created
        ? `${data.created} ${t('visits_created') || 'Termine angelegt'}`
        : (t('visits_already_current') || 'Alle Termine sind bereits angelegt'));
      await load();
      if (expanded === id) await openVisits(id, true);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not generate visits');
    } finally {
      setBusyId(null);
    }
  };

  const openVisits = async (id, force = false) => {
    if (expanded === id && !force) { setExpanded(null); return; }
    setExpanded(id);
    try {
      const { data } = await api.get(`/api/recurring/${id}/visits`, { params: { upcoming: true } });
      setVisits((v) => ({ ...v, [id]: data.visits || [] }));
    } catch {
      setVisits((v) => ({ ...v, [id]: [] }));
    }
  };

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="font-headings font-bold text-ink text-2xl">
              {t('recurring') || 'Wartungsverträge'}
            </h1>
            <p className="text-sm text-ink-muted">
              {contracts.length} {t('contracts') || 'Verträge'}
            </p>
          </div>
          <button type="button" onClick={() => setShowForm((s) => !s)}
                  className="btn-primary flex items-center gap-2" data-testid="contract-new-btn">
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? (t('cancel') || 'Abbrechen') : (t('new_contract') || 'Neuer Vertrag')}
          </button>
        </div>

        {notice && <div className="card mb-3 text-sm text-ink" data-testid="contract-notice">{notice}</div>}
        {error && (
          <div className="card mb-3 flex items-start gap-2 text-sm text-red-warn" data-testid="contract-error">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        {showForm && (
          <form onSubmit={submit} className="card-lg mb-4 space-y-3" data-testid="contract-form">
            <select className="input w-full" required value={form.customer_id}
                    onChange={(e) => set('customer_id', e.target.value)} data-testid="contract-customer">
              <option value="">{t('select_customer') || 'Kunde wählen…'} *</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
              ))}
            </select>

            <input className="input w-full" required value={form.title}
                   onChange={(e) => set('title', e.target.value)}
                   placeholder={`${t('contract_title') || 'Bezeichnung'} *`} />

            <div className="grid grid-cols-2 gap-3">
              <select className="input" value={form.cadence}
                      onChange={(e) => set('cadence', e.target.value)} data-testid="contract-cadence">
                {CADENCES.map((c) => <option key={c} value={c}>{t(`cadence_${c}`) || c}</option>)}
              </select>
              {NEEDS_WEEKDAY.has(form.cadence) ? (
                <select className="input" value={form.weekday}
                        onChange={(e) => set('weekday', e.target.value)}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              ) : <div />}
            </div>

            {NO_SCHEDULE.has(form.cadence) && (
              <p className="text-xs text-ink-muted">
                {t('cadence_no_schedule')
                  || 'Saisonal und auf Abruf erzeugen keine Termine automatisch — z. B. Winterdienst, der von Schnee abhängt und nicht vom Kalender.'}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <input className="input" type="number" step="0.01" min="0" value={form.price_per_visit}
                     onChange={(e) => set('price_per_visit', e.target.value)}
                     placeholder={t('price_per_visit') || '€ pro Termin'} />
              <select className="input" value={form.billing} onChange={(e) => set('billing', e.target.value)}>
                <option value="per_visit">{t('billing_per_visit') || 'pro Termin'}</option>
                <option value="monthly">{t('billing_monthly') || 'monatlich'}</option>
                <option value="quarterly">{t('billing_quarterly') || 'quartalsweise'}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-ink-muted">
                {t('starts_on') || 'Beginn'}
                <input className="input w-full" type="date" required value={form.starts_on}
                       onChange={(e) => set('starts_on', e.target.value)} />
              </label>
              <label className="text-xs text-ink-muted">
                {t('ends_on') || 'Ende (optional)'}
                <input className="input w-full" type="date" value={form.ends_on}
                       onChange={(e) => set('ends_on', e.target.value)} />
              </label>
            </div>

            <button type="submit" className="btn-primary w-full"
                    disabled={saving || !form.customer_id || !form.title.trim()}
                    data-testid="contract-save">
              {saving ? <Loader2 size={16} className="animate-spin mx-auto" />
                      : (t('create_contract') || 'Vertrag anlegen')}
            </button>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={26} className="text-teal animate-spin" /></div>
        ) : contracts.length === 0 ? (
          <div className="card-lg text-center py-10" data-testid="contract-empty">
            <Repeat size={30} className="text-ink-muted mx-auto mb-2" />
            <p className="font-headings font-bold text-ink">{t('no_contracts_yet') || 'Noch keine Verträge'}</p>
            <p className="text-sm text-ink-muted mt-1">
              {t('recurring_pitch')
                || 'Wiederkehrende Wartung ist der wertvollste Auftragstyp — hier anlegen und Termine automatisch erzeugen.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="contract-list">
            {contracts.map((c) => (
              <div key={c.id} className="card" data-testid="contract-row">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-headings font-bold text-ink truncate">{c.title}</div>
                    <div className="text-sm text-ink-muted truncate">
                      {[c.customer_name,
                        t(`cadence_${c.cadence}`) || c.cadence,
                        NEEDS_WEEKDAY.has(c.cadence) && c.weekday != null ? WEEKDAYS[c.weekday] : null,
                      ].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-xs text-ink-muted mt-1">
                      {c.visits_upcoming} {t('visits_upcoming') || 'anstehend'} · {c.visits_total} {t('visits_total') || 'gesamt'}
                      {!c.active && ` · ${t('inactive') || 'inaktiv'}`}
                    </div>
                  </div>
                  {c.price_per_visit != null && (
                    <div className="text-right shrink-0">
                      <div className="font-headings font-bold text-ink">{fmtEur(c.price_per_visit)}</div>
                      <div className="text-[11px] text-ink-muted">{t('per_visit') || 'pro Termin'}</div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {!NO_SCHEDULE.has(c.cadence) && c.active && (
                    <button className="btn-secondary text-sm flex items-center gap-1"
                            disabled={busyId === c.id} onClick={() => generate(c.id)}
                            data-testid="contract-generate">
                      <CalendarPlus size={14} />{t('generate_visits') || 'Termine erzeugen (90 Tage)'}
                    </button>
                  )}
                  <button className="btn-secondary text-sm flex items-center gap-1"
                          onClick={() => openVisits(c.id)} data-testid="contract-visits">
                    {expanded === c.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {t('show_visits') || 'Termine'}
                  </button>
                  {busyId === c.id && <Loader2 size={16} className="animate-spin text-teal self-center" />}
                </div>

                {expanded === c.id && (
                  <ul className="mt-3 border-t border-cream-dark pt-2 space-y-1" data-testid="contract-visit-list">
                    {(visits[c.id] || []).length === 0 ? (
                      <li className="text-sm text-ink-muted">
                        {NO_SCHEDULE.has(c.cadence)
                          ? (t('cadence_no_schedule_short') || 'Keine automatischen Termine.')
                          : (t('no_visits_yet') || 'Noch keine Termine erzeugt.')}
                      </li>
                    ) : visits[c.id].map((v) => (
                      <li key={v.id} className="flex justify-between text-sm">
                        <Link to={`/projects/${v.id}`} className="text-teal hover:underline">
                          {v.job_number || t('visit') || 'Termin'}
                        </Link>
                        <span className="text-ink-muted">
                          {new Date(v.visit_date).toLocaleDateString('de-AT', {
                            weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
