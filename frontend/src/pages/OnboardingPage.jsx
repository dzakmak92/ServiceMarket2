import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import api from '../api/client';
import Turnstile from 'react-turnstile';
import OnboardingClaimStep from '../components/OnboardingClaimStep';
import {
  Hammer, ChevronRight, ChevronLeft, CheckCircle2,
  Upload, FileText, Loader2, AlertCircle,
} from 'lucide-react';

const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

const COUNTRIES = [
  { code: 'AT', name: 'Austria' }, { code: 'DE', name: 'Germany' }, { code: 'ES', name: 'Spain' },
  { code: 'CH', name: 'Switzerland' }, { code: 'FR', name: 'France' }, { code: 'TR', name: 'Türkiye' },
];

const PRO_REQUIRED = ['contact_person', 'company_name', 'phone', 'address', 'postal_code', 'city', 'licence_file_id'];

export default function OnboardingPage() {
  const { user, completeOnboarding, refreshUser } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [step, setStep] = useState(0); // 0=country, 1=details, 2=docs, 3=claim, 4=security
  const [role] = useState('tradesperson');
  const [country, setCountry] = useState('AT');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  const [form, setForm] = useState({
    username: '', name: '', surname: '',
    phone: '', address: '', postal_code: '', city: '',
    contact_person: '', company_name: '',
    licence_file_id: '', insurance_file_id: '',
    licence_filename: '', insurance_filename: '',
  });
  const [uploading, setUploading] = useState({ licence: false, insurance: false });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ──────────────────────────────────────────────
  // Completion percentage
  // ──────────────────────────────────────────────
  const completion = useMemo(() => {
    const req = PRO_REQUIRED;
    const filled = req.filter((k) => (form[k] || '').toString().trim()).length;
    // Last 10% reserved for Turnstile pass
    return Math.round(10 + (filled / req.length) * (turnstileToken ? 90 : 80));
  }, [role, form, turnstileToken]);

  const detailsValid = () => {
    const req = PRO_REQUIRED.filter(k => k !== 'licence_file_id');
    return req.every((k) => (form[k] || '').toString().trim());
  };

  const docsValid = () => !!form.licence_file_id;
  const allValid = () => detailsValid() && docsValid() && !!turnstileToken;

  // ──────────────────────────────────────────────
  // File upload (Gewerbeschein, Gewerbeversicherung)
  // ──────────────────────────────────────────────
  const uploadDoc = async (kind, file) => {
    if (!file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
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
      const { data } = await api.post('/api/uploads/file', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      set(`${kind}_file_id`, data.file_id);
      set(`${kind}_filename`, file.name);
    } catch {
      setError(t('onboarding_upload_failed'));
    } finally {
      setUploading((u) => ({ ...u, [kind]: false }));
    }
  };

  // ──────────────────────────────────────────────
  // Submit (final step)
  // ──────────────────────────────────────────────
  const submit = async () => {
    if (!allValid()) {
      setError(t('onboarding_incomplete'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await completeOnboarding({
        role, country,
        name: form.name.trim(),
        surname: form.surname.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        postal_code: form.postal_code.trim(),
        city: form.city.trim(),
        contact_person: role === 'tradesperson' ? form.contact_person.trim() : undefined,
        company_name: role === 'tradesperson' ? form.company_name.trim() : undefined,
        licence_file_id: role === 'tradesperson' ? form.licence_file_id || undefined : undefined,
        insurance_file_id: role === 'tradesperson' ? form.insurance_file_id || undefined : undefined,
        turnstile_token: turnstileToken,
      });
      await refreshUser();
      navigate(role === 'tradesperson' ? '/dashboard' : '/', { replace: true });
    } catch (e) {
      setError(e.response?.data?.detail || t('error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  const totalSteps = role === 'tradesperson' ? 5 : 3;
  const securityStep = role === 'tradesperson' ? 4 : 2;
  const stepIndex = step;

  return (
    <div className="min-h-screen bg-cream py-6 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Top: completion bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="font-headings font-bold text-ink text-2xl">{t('onboarding_title')}</h1>
            <span className="text-sm font-semibold text-teal" data-testid="onboarding-completion">{completion}%</span>
          </div>
          <div className="w-full h-2 bg-cream-soft rounded-full overflow-hidden">
            <div
              className="h-full bg-teal transition-all duration-500"
              style={{ width: `${completion}%` }}
              data-testid="onboarding-progress-bar"
            />
          </div>
          <p className="text-xs text-ink-muted mt-2">
            {t('onboarding_step_label').replace('{i}', stepIndex + 1).replace('{n}', totalSteps)}
          </p>
        </div>

        <div className="card-lg space-y-5 animate-fade-in">
          {/* STEP 0 — Country */}
          {step === 0 && (
            <>
              <h2 className="font-headings font-bold text-ink text-lg">{t('onboarding_role_title')}</h2>
              <p className="text-ink-muted text-sm">{t('onboarding_role_subtitle')}</p>
              {/* Country selector */}
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">{t('onboarding_country')}</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="sm-input"
                  data-testid="onboarding-country-select"
                >
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            </>
          )}

          {/* STEP 1 — Personal / company details */}
          {step === 1 && (
            <>
              <h2 className="font-headings font-bold text-ink text-lg">
                {t('onboarding_pro_details_title')}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {role === 'tradesperson' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('field_contact_person')} *</label>
                      <input
                        value={form.contact_person}
                        onChange={(e) => set('contact_person', e.target.value)}
                        placeholder="Markus Weber"
                        className="sm-input"
                        data-testid="onboarding-contact-person"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('field_company_name')} *</label>
                      <input
                        value={form.company_name}
                        onChange={(e) => set('company_name', e.target.value)}
                        placeholder="Weber Installations GmbH"
                        className="sm-input"
                        data-testid="onboarding-company-name"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_first_name')} *</label>
                  <input
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Anna"
                    className="sm-input"
                    data-testid="onboarding-name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_surname')} *</label>
                  <input
                    value={form.surname}
                    onChange={(e) => set('surname', e.target.value)}
                    placeholder="Müller"
                    className="sm-input"
                    data-testid="onboarding-surname"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_phone')} *</label>
                  <input
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    placeholder="+43 1 234 56 78"
                    className="sm-input"
                    data-testid="onboarding-phone"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_address')} *</label>
                  <input
                    value={form.address}
                    onChange={(e) => set('address', e.target.value)}
                    placeholder="Mariahilfer Straße 12"
                    className="sm-input"
                    data-testid="onboarding-address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_postal_code')} *</label>
                  <input
                    value={form.postal_code}
                    onChange={(e) => set('postal_code', e.target.value)}
                    placeholder="1070"
                    className="sm-input"
                    data-testid="onboarding-postal"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('field_city')} *</label>
                  <input
                    value={form.city}
                    onChange={(e) => set('city', e.target.value)}
                    placeholder="Vienna"
                    className="sm-input"
                    data-testid="onboarding-city"
                  />
                </div>
              </div>
            </>
          )}

          {/* STEP 2 — Documents (PRO ONLY) */}
          {step === 2 && (
            <>
              <h2 className="font-headings font-bold text-ink text-lg">{t('onboarding_docs_title')}</h2>
              <p className="text-ink-muted text-sm">{t('onboarding_docs_subtitle')}</p>

              <DocUploader
                kind="licence"
                label={t('onboarding_licence_label') + ' *'}
                help={t('onboarding_licence_help')}
                fileId={form.licence_file_id}
                filename={form.licence_filename}
                uploading={uploading.licence}
                onUpload={(f) => uploadDoc('licence', f)}
                onRemove={() => { set('licence_file_id', ''); set('licence_filename', ''); }}
                t={t}
              />

              <DocUploader
                kind="insurance"
                label={t('onboarding_insurance_label') + ' (' + t('btn_optional') + ')'}
                help={t('onboarding_insurance_help')}
                fileId={form.insurance_file_id}
                filename={form.insurance_filename}
                uploading={uploading.insurance}
                onUpload={(f) => uploadDoc('insurance', f)}
                onRemove={() => { set('insurance_file_id', ''); set('insurance_filename', ''); }}
                t={t}
              />
            </>
          )}

          {/* STEP 3 — Claim business / join the family (PRO ONLY) */}
          {step === 3 && (
            <OnboardingClaimStep defaultQuery={form.company_name} t={t} />
          )}

          {/* STEP 4 — Security check & finish */}
          {step === securityStep && (
            <>
              <h2 className="font-headings font-bold text-ink text-lg">{t('onboarding_security_title')}</h2>
              <p className="text-ink-muted text-sm">{t('onboarding_security_subtitle')}</p>
              {TURNSTILE_SITE_KEY ? (
                <div className="flex justify-center py-2" data-testid="onboarding-turnstile-wrap">
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
                <div className="text-xs text-amber-deep italic">Turnstile site key not configured — security check skipped in dev.</div>
              )}
              {turnstileToken && (
                <p className="text-xs text-green-pos flex items-center gap-1.5">
                  <CheckCircle2 size={12} /> {t('onboarding_security_passed')}
                </p>
              )}
              <p className="text-[11px] text-ink-muted leading-relaxed">{t('onboarding_security_disclaimer')}</p>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-warn bg-red-50 rounded-[14px] p-3 text-sm" data-testid="onboarding-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* Footer nav */}
          <div className="flex items-center justify-between pt-3 border-t border-sm-border">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
              data-testid="onboarding-back"
            >
              <ChevronLeft size={14} /> {t('btn_back')}
            </button>

            {step < securityStep ? (
              <button
                onClick={() => {
                  if (step === 1 && !detailsValid()) return setError(t('onboarding_fill_required'));
                  if (step === 2 && !docsValid()) return setError(t('onboarding_licence_required'));
                  setError(''); setStep((s) => s + 1);
                }}
                disabled={
                  (step === 1 && !detailsValid()) ||
                  (step === 2 && !docsValid())
                }
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
function DocUploader({ kind, label, help, fileId, filename, uploading, onUpload, onRemove, t }) {
  return (
    <div data-testid={`onboarding-doc-${kind}`}>
      <label className="block text-sm font-medium text-ink mb-1.5">{label}</label>
      <p className="text-[11px] text-ink-muted mb-2 leading-relaxed">{help}</p>
      {fileId ? (
        <div className="flex items-center gap-2 p-3 bg-teal/5 border border-teal/30 rounded-[12px]">
          <FileText size={18} className="text-teal" />
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
