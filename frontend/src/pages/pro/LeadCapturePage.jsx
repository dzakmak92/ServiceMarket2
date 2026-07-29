import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import { Loader2, ClipboardPaste, AlertCircle, Check, Wand2 } from 'lucide-react';

const SOURCES = ['myhammer', 'phone', 'whatsapp', 'email', 'referral', 'walk_in', 'repeat', 'web', 'manual'];
const URGENCY = ['emergency', 'urgent', 'normal', 'scheduled'];

const EMPTY = {
  title: '', description: '', category: '', mode: 'simple',
  source: 'myhammer', urgency: 'normal',
  site_address: '', site_postal_code: '', site_city: '',
  customer: { name: '', email: '', phone: '', address: '', postal_code: '', city: '', type: 'private' },
};

// Austrian PLZ: four digits, first non-zero. Deliberately not a general
// postcode matcher — a loose one grabs house numbers and years.
const PLZ = /\b([1-9]\d{3})\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/;
// Austrian formats: +43…, 0043…, or a national 0-prefixed number. The
// separators are horizontal whitespace only — \s matches newlines, which made
// this run past the end of the line and swallow the postcode below it.
const PHONE = /(?:\+43|0043|0)[ \t]?\d{2,4}[ \t/-]?\d{3,}[\d \t/-]*/;

// A greeting is not a job title. Without this the first line of any polite
// message becomes the subject.
const SALUTATION = /^(sehr geehrte|hallo|guten (tag|morgen|abend)|liebe[rs]?\b|servus|grüß|hi\b)/i;

/**
 * Parse a pasted lead into a prefill.
 *
 * Rule-based on purpose. This runs on text a tradesperson pastes out of a
 * marketplace notification or a WhatsApp message, and it is a *prefill* —
 * every field stays editable and nothing is submitted without being seen.
 * A confidently-wrong extraction that is silently accepted is worse than no
 * extraction at all, so anything not recognised is simply left blank.
 */
export function parseLead(text) {
  const out = { customer: {} };
  const raw = (text || '').replace(/\r/g, '');
  if (!raw.trim()) return out;

  const email = raw.match(EMAIL);
  if (email) out.customer.email = email[0].toLowerCase();

  const phone = raw.match(PHONE);
  if (phone) out.customer.phone = phone[0].replace(/\s+/g, ' ').trim();

  const plz = raw.match(PLZ);
  if (plz) {
    out.customer.postal_code = plz[1];
    // The town usually trails the postcode on the same line.
    const line = raw.split('\n').find((l) => l.includes(plz[1])) || '';
    const after = line.slice(line.indexOf(plz[1]) + 4).trim().replace(/^[,\s]+/, '');
    if (after && after.length < 40) out.customer.city = after;
  }

  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  // Explicit "Label: value" pairs win over positional guessing.
  const labelled = (labels) => {
    for (const l of lines) {
      const m = l.match(/^([\wäöüÄÖÜß .-]{2,25})\s*[:：]\s*(.+)$/);
      if (m && labels.some((lb) => m[1].toLowerCase().includes(lb))) return m[2].trim();
    }
    return '';
  };

  const name = labelled(['name', 'kunde', 'auftraggeber', 'kontakt']);
  if (name) out.customer.name = name;

  const subject = labelled(['betreff', 'auftrag', 'projekt', 'leistung', 'titel']);
  if (subject) out.title = subject;
  else {
    // Otherwise the first line that is not contact detail reads as the subject.
    const first = lines.find(
      (l) => !EMAIL.test(l) && !PHONE.test(l) && !PLZ.test(l)
             && !SALUTATION.test(l) && l.length > 5 && l.length < 120
    );
    if (first) out.title = first;
  }

  const addr = labelled(['adresse', 'anschrift', 'strasse', 'straße', 'ort']);
  if (addr) out.customer.address = addr;

  out.description = raw.trim();
  return out;
}

export default function LeadCapturePage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [pasted, setPasted] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setCust = (k, v) => setForm((f) => ({ ...f, customer: { ...f.customer, [k]: v } }));

  const applyParse = () => {
    const p = parseLead(pasted);
    setForm((f) => ({
      ...f,
      title: p.title || f.title,
      description: p.description || f.description,
      site_postal_code: p.customer.postal_code || f.site_postal_code,
      site_city: p.customer.city || f.site_city,
      site_address: p.customer.address || f.site_address,
      customer: { ...f.customer, ...p.customer },
    }));
    setParsed(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.title.trim().length < 3 || !form.customer.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || undefined,
        category: form.category || undefined,
        mode: form.mode,
        source: form.source,
        urgency: form.urgency,
        site_address: form.site_address || undefined,
        site_postal_code: form.site_postal_code || undefined,
        site_city: form.site_city || undefined,
        customer: Object.fromEntries(
          Object.entries(form.customer).filter(([, v]) => v !== '' && v != null)
        ),
      };
      const { data } = await api.post('/api/jobs/from-lead', payload);
      const jobId = data?.job?.id || data?.id;
      navigate(jobId ? `/projects/${jobId}` : '/projects');
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not capture the lead');
    } finally {
      setSaving(false);
    }
  };

  const ready = form.title.trim().length >= 3 && form.customer.name.trim().length > 0;

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <h1 className="font-headings font-bold text-ink text-2xl">
          {t('capture_lead') || 'Anfrage erfassen'}
        </h1>
        <p className="text-sm text-ink-muted mb-4">
          {t('capture_lead_sub')
            || 'Anfrage aus MyHammer, WhatsApp oder E-Mail einfügen — Kunde und Auftrag entstehen in einem Schritt.'}
        </p>

        <div className="card-lg mb-4">
          <label className="text-sm font-medium text-ink flex items-center gap-2 mb-2">
            <ClipboardPaste size={16} className="text-teal" />
            {t('paste_lead') || 'Anfrage hier einfügen'}
          </label>
          <textarea className="input w-full" rows={5} value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder={'Name: Maria Gruber\nTel: +43 664 1112233\nBetreff: Bad sanieren\n1210 Wien'}
                    data-testid="lead-paste" />
          <button type="button" className="btn-secondary w-full mt-2 flex items-center justify-center gap-2"
                  onClick={applyParse} disabled={!pasted.trim()} data-testid="lead-parse">
            <Wand2 size={15} />{t('extract_fields') || 'Felder übernehmen'}
          </button>
          {parsed && (
            <p className="text-xs text-ink-muted mt-2 flex items-start gap-1">
              <Check size={13} className="mt-0.5 text-green-pos shrink-0" />
              {t('lead_parse_note')
                || 'Vorschlag — bitte prüfen. Nicht erkannte Felder bleiben leer.'}
            </p>
          )}
        </div>

        {error && (
          <div className="card mb-3 flex items-start gap-2 text-sm text-red-warn" data-testid="lead-error">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="card-lg space-y-3" data-testid="lead-form">
          <input className="input w-full" required minLength={3} value={form.title}
                 onChange={(e) => set('title', e.target.value)}
                 placeholder={`${t('job_title') || 'Auftrag'} *`} data-testid="lead-title" />

          <div className="grid grid-cols-2 gap-3">
            <select className="input" value={form.source} onChange={(e) => set('source', e.target.value)}>
              {SOURCES.map((s) => <option key={s} value={s}>{t(`source_${s}`) || s}</option>)}
            </select>
            <select className="input" value={form.urgency} onChange={(e) => set('urgency', e.target.value)}>
              {URGENCY.map((u) => <option key={u} value={u}>{t(`urgency_${u}`) || u}</option>)}
            </select>
          </div>

          <select className="input w-full" value={form.mode} onChange={(e) => set('mode', e.target.value)}>
            <option value="simple">{t('mode_simple') || 'Einfacher Auftrag'}</option>
            <option value="project">{t('mode_project') || 'Projekt (Aufgaben, Gantt)'}</option>
            <option value="recurring">{t('mode_recurring') || 'Wiederkehrend'}</option>
          </select>

          <div className="pt-2 border-t border-cream-dark">
            <p className="text-sm font-medium text-ink mb-2">{t('customer') || 'Kunde'}</p>
            <input className="input w-full mb-2" required value={form.customer.name}
                   onChange={(e) => setCust('name', e.target.value)}
                   placeholder={`${t('name') || 'Name'} *`} data-testid="lead-customer-name" />
            <div className="grid grid-cols-2 gap-3 mb-2">
              <input className="input" type="email" value={form.customer.email}
                     onChange={(e) => setCust('email', e.target.value)}
                     placeholder={t('email') || 'E-Mail'} />
              <input className="input" value={form.customer.phone}
                     onChange={(e) => setCust('phone', e.target.value)}
                     placeholder={t('phone') || 'Telefon'} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input className="input" value={form.customer.postal_code}
                     onChange={(e) => setCust('postal_code', e.target.value)}
                     placeholder={t('postal_code') || 'PLZ'} />
              <input className="input col-span-2" value={form.customer.city}
                     onChange={(e) => setCust('city', e.target.value)}
                     placeholder={t('city') || 'Ort'} />
            </div>
          </div>

          <textarea className="input w-full" rows={3} value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder={t('description') || 'Beschreibung'} />

          <button type="submit" className="btn-primary w-full" disabled={saving || !ready}
                  data-testid="lead-save">
            {saving ? <Loader2 size={16} className="animate-spin mx-auto" />
                    : (t('create_job') || 'Kunde und Auftrag anlegen')}
          </button>
          {/* The endpoint reuses an existing customer when one matches, so
              capturing a repeat lead does not fork the customer record. */}
          <p className="text-xs text-ink-muted text-center">
            {t('lead_dedupe_note') || 'Bestehende Kunden werden erkannt und nicht doppelt angelegt.'}
          </p>
        </form>
      </div>
    </div>
  );
}
