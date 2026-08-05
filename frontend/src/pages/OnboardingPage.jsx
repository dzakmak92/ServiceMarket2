import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import api from '../api/client';
import Turnstile from 'react-turnstile';
import { COUNTRIES, isKnownCity, searchCities } from '../data/cities';
import {
  ChevronRight, ChevronLeft, CheckCircle2, Upload, FileText, Loader2,
  AlertCircle, MapPin, CloudSun, Award, Search, Plus, Check,
} from 'lucide-react';

const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

/* The four steps, and what the bar reads on each. The numbers are given
   rather than derived: a bar that starts at 25 % makes step one feel like
   nothing has happened, and the point of the first number is to say the
   account already exists — signing up was the first move, not this. */
const STEPS = [
  { key: 'lang', pct: 40 },
  { key: 'where', pct: 60 },
  { key: 'business', pct: 80 },
  { key: 'docs', pct: 100 },
];

/* Only the languages the app is actually translated into. Offering one it is
   not would be a promise the next screen breaks. */
const LANGUAGES = [
  { code: 'de', label: 'Deutsch', note: 'Österreich · Deutschland' },
  { code: 'en', label: 'English', note: 'International' },
  { code: 'tr', label: 'Türkçe', note: 'Türkiye' },
  { code: 'es', label: 'Español', note: 'España' },
];

export default function OnboardingPage() {
  const { completeOnboarding, refreshUser } = useAuth();
  const { t, lang, changeLang } = useLang();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);   // 0=language 1=where 2=business 3=documents
  const [country, setCountry] = useState('AT');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  const [form, setForm] = useState({
    name: '', surname: '', phone: '', address: '', postal_code: '', city: '',
    contact_person: '', company_name: '',
    licence_file_id: '', insurance_file_id: '', meister_file_id: '',
    licence_filename: '', insurance_filename: '', meister_filename: '',
  });
  const [uploading, setUploading] = useState({ licence: false, insurance: false, meister: false });

  /* Where the business is. `coords` is set only if the pro accepts the
     browser prompt; the town they pick is what everything falls back to. */
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const [cityQuery, setCityQuery] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const completion = STEPS[step].pct;
  const totalSteps = STEPS.length;
  const lastStep = STEPS.length - 1;

  const whereValid = () => !!country && !!form.city.trim();
  const businessValid = () => ['contact_person', 'company_name', 'name', 'surname',
    'phone', 'address', 'postal_code'].every((k) => form[k].trim());
  const docsValid = () => !!form.licence_file_id;
  const allValid = () => whereValid() && businessValid() && docsValid() && !!turnstileToken;

  const stepValid = (i) => (i === 1 ? whereValid() : i === 2 ? businessValid() : true);

  // ──────────────────────────────────────────────
  // File upload (Gewerbeschein, Versicherung, Meisterbrief)
  // ──────────────────────────────────────────────
  const uploadDoc = async (kind, file) => {
    if (!['application/pdf'].includes(file.type) && !file.type.startsWith('image/')) {
      setError(t('onboarding_doc_type_error')); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('onboarding_doc_size_error')); return;
    }
    setUploading((u) => ({ ...u, [kind]: true }));
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/api/uploads', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      set(`${kind}_file_id`, data.storage_ref);
      set(`${kind}_filename`, file.name);
    } catch {
      setError(t('onboarding_upload_failed'));
    } finally {
      setUploading((u) => ({ ...u, [kind]: false }));
    }
  };

  /* Straight from the browser, so no address ever leaves the device to be
     looked up. The town below is enough for a forecast; this is for the
     service radius, where a pin beats a town centre. */
  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocError(t('onboarding_loc_unsupported')); return; }
    setLocating(true);
    setLocError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: +pos.coords.latitude.toFixed(5),
                    lng: +pos.coords.longitude.toFixed(5) });
        setLocating(false);
      },
      () => { setLocError(t('onboarding_loc_denied')); setLocating(false); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  const submit = async () => {
    if (!allValid()) { setError(t('onboarding_incomplete')); return; }
    setSubmitting(true);
    setError('');
    try {
      await completeOnboarding({
        role: 'tradesperson', country, lang,
        name: form.name.trim(),
        surname: form.surname.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        postal_code: form.postal_code.trim(),
        city: form.city.trim(),
        contact_person: form.contact_person.trim(),
        company_name: form.company_name.trim(),
        licence_file_id: form.licence_file_id || undefined,
        insurance_file_id: form.insurance_file_id || undefined,
        meister_file_id: form.meister_file_id || undefined,
        service_center_lat: coords?.lat,
        service_center_lng: coords?.lng,
        turnstile_token: turnstileToken,
      });
      await refreshUser();
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setError(e.response?.data?.detail || t('error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const matches = searchCities(country, cityQuery);
  const canAddOwn = cityQuery.trim().length >= 2 && !isKnownCity(country, cityQuery);

  return (
    <div className="min-h-screen bg-cream py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="font-headings font-bold text-ink text-2xl">{t('onboarding_title')}</h1>
            <span className="text-sm font-semibold text-teal" data-testid="onboarding-completion">
              {completion}%
            </span>
          </div>
          <div className="w-full h-2 bg-cream-soft rounded-full overflow-hidden">
            <div className="h-full bg-teal transition-all duration-500"
                 style={{ width: `${completion}%` }} data-testid="onboarding-progress-bar" />
          </div>
          <p className="text-xs text-ink-muted mt-2" data-testid="onboarding-step-label">
            {t('onboarding_step_label').replace('{i}', step + 1).replace('{n}', totalSteps)}
          </p>
        </div>

        <div className="card-lg space-y-5 animate-fade-in">
          {/* ── STEP 1 — language ─────────────────────────────────────
              First because everything after it is written in whatever is
              chosen here. Asking later would mean the pro reads three
              screens in a language they did not pick. */}
          {step === 0 && (
            <>
              <h2 className="font-headings font-bold text-ink text-lg">{t('onboarding_lang_title')}</h2>
              <p className="text-ink-muted text-sm">{t('onboarding_lang_subtitle')}</p>
              <div className="grid grid-cols-2 gap-2.5" data-testid="onboarding-langs">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => changeLang(l.code)}
                    className={`min-h-[64px] rounded-[14px] border-[1.5px] px-3 py-2.5 text-left
                      ${lang === l.code ? 'border-teal bg-teal/[0.07]' : 'border-sm-border bg-paper'}`}
                    data-testid={`onboarding-lang-${l.code}`}
                    aria-pressed={lang === l.code}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="font-bold text-[14px] text-ink">{l.label}</span>
                      {lang === l.code && <Check size={14} className="text-teal" />}
                    </span>
                    <span className="block text-[11px] text-ink-muted mt-0.5">{l.note}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── STEP 2 — where the work is ──────────────────────────── */}
          {step === 1 && (
            <>
              <h2 className="font-headings font-bold text-ink text-lg">{t('onboarding_where_title')}</h2>
              <p className="text-ink-muted text-sm">{t('onboarding_where_subtitle')}</p>

              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">{t('onboarding_country')}</label>
                <div className="grid grid-cols-2 gap-2.5" data-testid="onboarding-countries">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => { setCountry(c.code); set('city', ''); setCityQuery(''); }}
                      className={`min-h-[56px] rounded-[14px] border-[1.5px] px-3 flex items-center gap-2.5
                        ${country === c.code ? 'border-teal bg-teal/[0.07]' : 'border-sm-border bg-paper'}`}
                      data-testid={`onboarding-country-${c.code}`}
                      aria-pressed={country === c.code}
                    >
                      <span className="text-[22px] leading-none">{c.flag}</span>
                      <span className="font-bold text-[14px] text-ink flex-1 text-left">{c.name}</span>
                      {country === c.code && <Check size={15} className="text-teal" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  {t('onboarding_city')} *
                </label>

                {form.city ? (
                  <div className="flex items-center gap-2 rounded-[12px] border-[1.5px] border-teal
                                  bg-teal/[0.07] px-3 min-h-[48px]" data-testid="onboarding-city-chosen">
                    <MapPin size={16} className="text-teal flex-none" />
                    <span className="font-bold text-[14px] text-ink flex-1">{form.city}</span>
                    <button type="button" className="text-[12px] font-bold text-teal underline"
                            onClick={() => { set('city', ''); setCityQuery(''); }}
                            data-testid="onboarding-city-change">
                      {t('btn_change')}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                      <input
                        value={cityQuery}
                        onChange={(e) => setCityQuery(e.target.value)}
                        placeholder={t('onboarding_city_search')}
                        className="sm-input pl-9"
                        data-testid="onboarding-city-search"
                      />
                    </div>

                    <div className="mt-2 space-y-1.5" data-testid="onboarding-city-list">
                      {matches.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => { set('city', c); setCityQuery(''); }}
                          className="w-full min-h-[44px] rounded-[11px] border border-sm-border bg-paper
                                     px-3 text-left font-semibold text-[13.5px] text-ink
                                     flex items-center gap-2"
                          data-testid={`onboarding-city-opt-${c}`}
                        >
                          <MapPin size={14} className="text-ink-muted flex-none" /> {c}
                        </button>
                      ))}

                      {/* Not a fallback for a broken list — most of Austria and
                          Germany is small towns, and a pro in one must not have
                          to pick the nearest big city and live with it. */}
                      {canAddOwn && (
                        <button
                          type="button"
                          onClick={() => { set('city', cityQuery.trim()); setCityQuery(''); }}
                          className="w-full min-h-[44px] rounded-[11px] border-[1.5px] border-dashed
                                     border-teal bg-teal/[0.05] px-3 text-left font-bold text-[13px]
                                     text-teal-deep flex items-center gap-2"
                          data-testid="onboarding-city-add"
                        >
                          <Plus size={14} /> {t('onboarding_city_add').replace('{name}', cityQuery.trim())}
                        </button>
                      )}
                      {!matches.length && !canAddOwn && (
                        <p className="text-[12px] text-ink-muted py-2">{t('onboarding_city_type_more')}</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-[12px] bg-cream-soft border border-sm-border p-3">
                <p className="flex items-start gap-2 text-[12px] text-ink-soft leading-relaxed">
                  <CloudSun size={14} className="text-sky flex-none mt-px" />
                  <span>{t('onboarding_why_city')}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className={`w-full min-h-[48px] rounded-[12px] font-bold text-sm flex items-center
                            justify-center gap-2 ${coords
                              ? 'bg-teal/10 border-[1.5px] border-teal text-teal-deep'
                              : 'bg-paper border border-sm-border text-ink'}`}
                data-testid="onboarding-loc-btn"
              >
                <MapPin size={16} />
                {locating ? t('onboarding_loc_locating')
                  : coords ? t('onboarding_loc_set') : t('onboarding_loc_use')}
              </button>
              {coords && (
                <p className="text-[12px] text-ink-muted text-center" data-testid="onboarding-loc-coords">
                  {coords.lat.toFixed(3)}, {coords.lng.toFixed(3)}{' · '}
                  <button type="button" className="text-teal font-bold underline"
                          onClick={() => { setCoords(null); setLocError(''); }}
                          data-testid="onboarding-loc-clear">
                    {t('onboarding_loc_clear')}
                  </button>
                </p>
              )}
              {locError && (
                <p className="text-[12px] text-red-warn text-center" data-testid="onboarding-loc-error">
                  {locError}
                </p>
              )}
              <p className="text-[11.5px] text-ink-muted leading-relaxed">
                {t('onboarding_loc_optional_note')}
              </p>
            </>
          )}

          {/* ── STEP 3 — the business ───────────────────────────────── */}
          {step === 2 && (
            <>
              <h2 className="font-headings font-bold text-ink text-lg">
                {t('onboarding_pro_details_title')}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_contact_person')} *</label>
                  <input value={form.contact_person} onChange={(e) => set('contact_person', e.target.value)}
                         placeholder="Markus Weber" className="sm-input"
                         data-testid="onboarding-contact-person" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_company_name')} *</label>
                  <input value={form.company_name} onChange={(e) => set('company_name', e.target.value)}
                         placeholder="Weber Installations GmbH" className="sm-input"
                         data-testid="onboarding-company-name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_first_name')} *</label>
                  <input value={form.name} onChange={(e) => set('name', e.target.value)}
                         placeholder="Markus" className="sm-input" data-testid="onboarding-name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_surname')} *</label>
                  <input value={form.surname} onChange={(e) => set('surname', e.target.value)}
                         placeholder="Weber" className="sm-input" data-testid="onboarding-surname" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_phone')} *</label>
                  <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                         placeholder="+43 660 1234567" className="sm-input" data-testid="onboarding-phone" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_postal_code')} *</label>
                  <input value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)}
                         placeholder="1070" className="sm-input" data-testid="onboarding-postal" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_address')} *</label>
                  <input value={form.address} onChange={(e) => set('address', e.target.value)}
                         placeholder="Mariahilfer Straße 12" className="sm-input"
                         data-testid="onboarding-address" />
                </div>
              </div>

              {/* The address is the one thing on this step with a legal
                  consequence, so it is the one thing explained. */}
              <div className="rounded-[12px] bg-cream-soft border border-sm-border p-3"
                   data-testid="onboarding-why">
                <p className="flex items-start gap-2 text-[12px] text-ink-soft leading-relaxed">
                  <FileText size={14} className="text-teal flex-none mt-px" />
                  <span>{t('onboarding_why_address').replace('{city}', form.city || t('onboarding_city'))}</span>
                </p>
              </div>
            </>
          )}

          {/* ── STEP 4 — documents, and the security check ──────────── */}
          {step === 3 && (
            <>
              <h2 className="font-headings font-bold text-ink text-lg">{t('onboarding_docs_title')}</h2>
              <p className="text-ink-muted text-sm">{t('onboarding_docs_subtitle')}</p>

              <DocUploader
                kind="licence"
                label={t('onboarding_licence_label') + ' *'}
                help={t('onboarding_licence_help')}
                fileId={form.licence_file_id} filename={form.licence_filename}
                uploading={uploading.licence}
                onUpload={(f) => uploadDoc('licence', f)}
                onRemove={() => { set('licence_file_id', ''); set('licence_filename', ''); }}
                t={t}
              />

              {/* Separate from the licence on purpose: the Gewerbeschein says
                  the business may trade, the Meisterbrief says the person is
                  qualified to. For a regulated trade they are not
                  interchangeable, and one filed as the other is a claim
                  nobody checked. */}
              <DocUploader
                kind="meister"
                icon={Award}
                label={t('onboarding_meister_label') + ' (' + t('btn_optional') + ')'}
                help={t('onboarding_meister_help')}
                fileId={form.meister_file_id} filename={form.meister_filename}
                uploading={uploading.meister}
                onUpload={(f) => uploadDoc('meister', f)}
                onRemove={() => { set('meister_file_id', ''); set('meister_filename', ''); }}
                t={t}
              />

              <DocUploader
                kind="insurance"
                label={t('onboarding_insurance_label') + ' (' + t('btn_optional') + ')'}
                help={t('onboarding_insurance_help')}
                fileId={form.insurance_file_id} filename={form.insurance_filename}
                uploading={uploading.insurance}
                onUpload={(f) => uploadDoc('insurance', f)}
                onRemove={() => { set('insurance_file_id', ''); set('insurance_filename', ''); }}
                t={t}
              />

              <div className="border-t border-sm-border pt-4">
                <p className="font-bold text-sm text-ink mb-1">{t('onboarding_security_title')}</p>
                <p className="text-ink-muted text-[12px] mb-2">{t('onboarding_security_subtitle')}</p>
                {TURNSTILE_SITE_KEY ? (
                  <div className="flex justify-center py-1" data-testid="onboarding-turnstile-wrap">
                    <Turnstile
                      sitekey={TURNSTILE_SITE_KEY}
                      onVerify={(token) => setTurnstileToken(token)}
                      onExpire={() => setTurnstileToken('')}
                      onError={() => setTurnstileToken('')}
                      theme="light"
                      retry="auto"
                    />
                  </div>
                ) : (
                  <div className="text-xs text-amber-deep italic">
                    Turnstile site key not configured — security check skipped in dev.
                  </div>
                )}
                {turnstileToken && (
                  <p className="text-xs text-green-pos flex items-center gap-1.5 mt-1">
                    <CheckCircle2 size={12} /> {t('onboarding_security_passed')}
                  </p>
                )}
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-warn bg-red-50 rounded-[14px] p-3 text-sm"
                 data-testid="onboarding-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-sm-border">
            <button
              onClick={() => setStep((x) => Math.max(0, x - 1))}
              disabled={step === 0}
              className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
              data-testid="onboarding-back"
            >
              <ChevronLeft size={14} /> {t('btn_back')}
            </button>

            {step < lastStep ? (
              <button
                onClick={() => {
                  if (!stepValid(step)) {
                    return setError(step === 1 ? t('onboarding_pick_city')
                                               : t('onboarding_fill_required'));
                  }
                  setError(''); setStep((x) => x + 1);
                }}
                disabled={!stepValid(step)}
                className="btn-primary"
                data-testid="onboarding-next"
              >
                {t('btn_continue')} <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!allValid() || submitting}
                className="btn-primary"
                data-testid="onboarding-finish"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {t('onboarding_finish_btn')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Document uploader sub-component
// ──────────────────────────────────────────────
function DocUploader({ kind, label, help, fileId, filename, uploading, onUpload,
                      onRemove, icon: Icon = FileText, t }) {
  return (
    <div data-testid={`onboarding-doc-${kind}`}>
      <label className="flex items-center gap-1.5 text-sm font-medium text-ink mb-1.5">
        <Icon size={14} className="text-teal" /> {label}
      </label>
      <p className="text-[11px] text-ink-muted mb-2 leading-relaxed">{help}</p>
      {fileId ? (
        <div className="flex items-center gap-2 p-3 bg-teal/5 border border-teal/30 rounded-[12px]">
          <Icon size={18} className="text-teal" />
          <span className="text-sm text-ink flex-1 truncate">{filename || 'Uploaded'}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal uppercase tracking-wide">
            <CheckCircle2 size={11} /> {t('onboarding_doc_uploaded')}
          </span>
          <button onClick={onRemove} className="text-xs text-red-warn hover:opacity-70" data-testid={`onboarding-doc-${kind}-remove`}>
            {t('btn_remove')}
          </button>
        </div>
      ) : (
        <label className={`flex items-center justify-center gap-2 p-4 border-2 border-dashed border-sm-border rounded-[14px] cursor-pointer hover:bg-cream-soft transition-colors ${uploading ? 'opacity-50' : ''}`}>
          {uploading ? <Loader2 size={18} className="text-teal animate-spin" /> : <Upload size={18} className="text-teal" />}
          <span className="text-sm text-ink">{uploading ? t('onboarding_uploading') : t('onboarding_choose_file')}</span>
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            data-testid={`onboarding-doc-${kind}-input`}
          />
        </label>
      )}
    </div>
  );
}
