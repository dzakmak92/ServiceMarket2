import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLang } from '../../contexts/LangContext';
import { useAuth } from '../../contexts/AuthContext';
import api, { apiBase } from '../../api/client';
import ServiceRadiusPicker from '../../components/ServiceRadiusPicker';
import PrivacySettings from '../../components/PrivacySettings';
import ScrollSnapTabStrip, { SwipeableTabPanel } from '../../components/ScrollSnapTabStrip';
import { lookupBankFromIban, isValidIban } from '../../utils/ibanBicLookup';
import { isPremiumTier, planLabel } from '../../utils/tier';
import { BUILD, buildLabel, runningAsset } from '../../utils/build';
import {
  User, Bell, Briefcase, Settings as SettingsIcon, Image as ImageIcon,
  Globe, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, Star, Eye, Shield,
  KeyRound, Info, Copy,
  MessageSquare, Pencil, MapPin, Receipt, Building2, Banknote, Sparkles, Check,
} from 'lucide-react';

const TABS = ['about_me', 'services_areas', 'portfolio', 'invoice_details', 'notifications', 'account', 'privacy'];
const APP_LANG_OPTIONS = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'es', name: 'Español' },
];
const SPOKEN_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'pl', label: 'Polski' },
  { code: 'sr', label: 'Srpski / Hrvatski' },
  { code: 'ro', label: 'Română' },
  { code: 'ar', label: 'العربية' },
];
const ALL_CATS = [
  'plumbing', 'electrical', 'painting', 'home_cleaning', 'handyman',
  'gardening', 'carpentry', 'hvac', 'moving', 'pest_control',
  'locksmith', 'appliance_repair', 'tiling', 'flooring',
];

export default function ProSettingsPage() {
  const { user, refreshUser } = useAuth();
  const { t, lang, changeLang } = useLang();
  const location = useLocation();
  const [tab, setTab] = useState('about_me');

  // Deep-link: ?tab=<key> opens the matching sub-tab (with friendly aliases).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('tab');
    if (!raw) return;
    const alias = { services: 'services_areas', area: 'services_areas', invoice: 'invoice_details', bank: 'invoice_details' };
    const t0 = TABS.includes(raw) ? raw : alias[raw];
    if (t0 && t0 !== tab) setTab(t0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  const [proProfile, setProProfile] = useState(null);
  const [userForm, setUserForm] = useState({ name: '', phone: '', city: '', lang: 'en' });
  const [proForm, setProForm] = useState({
    business_name: '', tagline: '', description: '', hourly_rate: '',
    years_experience: '', service_areas: '',
    is_kleinunternehmer: false,
    bank_account_holder: '', bank_iban: '', bank_bic: '', bank_name: '',
    invoice_tax_id: '', invoice_footer: '',
    business_address: '', business_postal_code: '', business_city: '', business_country: 'AT',
    service_center_lat: null, service_center_lng: null, service_radius_km: 0,
  });
  const [selectedCats, setSelectedCats] = useState([]);
  const [spokenLangs, setSpokenLangs] = useState([]);
  const [notifForm, setNotifForm] = useState({
    notif_email: true, notif_sms: false,
    notif_new_message: true, notif_new_review: true, notif_new_job_match: true,
    notif_quote_accepted: true, notif_booking_confirmed: true,
    notif_job_status: true, notif_payment_receipt: true,
  });
  const [saving, setSaving] = useState(false);
  /* Whether the pro touched the language select on this visit — see save(). */
  const [langTouched, setLangTouched] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setUserForm({ name: user.name || '', phone: user.phone || '', city: user.city || '', lang: user.lang || 'en' });
      setNotifForm({
        notif_email: user.notif_email ?? true,
        notif_sms: user.notif_sms ?? false,
        notif_new_message: user.notif_new_message ?? true,
        notif_new_review: user.notif_new_review ?? true,
        notif_new_job_match: user.notif_new_job_match ?? true,
        notif_quote_accepted: user.notif_quote_accepted ?? true,
        notif_booking_confirmed: user.notif_booking_confirmed ?? true,
        notif_job_status: user.notif_job_status ?? true,
        notif_payment_receipt: user.notif_payment_receipt ?? true,
      });
    }
  }, [user]);

  const fetchProProfile = React.useCallback(() => {
    api.get('/api/profile/pro').then((r) => {
      const p = r.data;
      setProProfile(p);
      setProForm({
        business_name: p.business_name || '',
        tagline: p.tagline || '',
        description: p.description || '',
        hourly_rate: p.hourly_rate || '',
        years_experience: p.years_experience || '',
        service_areas: (p.service_areas || []).join(', '),
        is_kleinunternehmer: !!p.is_kleinunternehmer,
        bank_account_holder: p.bank_account_holder || '',
        bank_iban: p.bank_iban || '',
        bank_bic: p.bank_bic || '',
        bank_name: p.bank_name || '',
        invoice_tax_id: p.invoice_tax_id || '',
        invoice_footer: p.invoice_footer || '',
        business_address: p.business_address || '',
        business_postal_code: p.business_postal_code || '',
        business_city: p.business_city || '',
        business_country: p.business_country || 'AT',
        service_center_lat: p.service_center_lat ?? null,
        service_center_lng: p.service_center_lng ?? null,
        service_radius_km: p.service_radius_km || 0,
      });
      setSelectedCats(p.service_categories || []);
      setSpokenLangs(p.languages_spoken || [user?.lang || 'en']);
    }).catch(() => {});
  }, [user]);

  useEffect(() => { fetchProProfile(); }, [fetchProProfile]);

  const toggleCat = (cat) => {
    setSelectedCats((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  };
  const toggleSpokenLang = (code) => {
    setSpokenLangs((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.patch('/api/profile', { ...userForm, ...notifForm });
      await api.patch('/api/profile/pro', {
        business_name: proForm.business_name,
        tagline: proForm.tagline,
        description: proForm.description,
        hourly_rate: proForm.hourly_rate ? parseInt(proForm.hourly_rate) : 0,
        years_experience: proForm.years_experience ? parseInt(proForm.years_experience) : 0,
        service_categories: selectedCats,
        service_areas: proForm.service_areas.split(',').map((s) => s.trim()).filter(Boolean),
        languages_spoken: spokenLangs,
        is_kleinunternehmer: !!proForm.is_kleinunternehmer,
        bank_account_holder: proForm.bank_account_holder,
        bank_iban: proForm.bank_iban,
        bank_bic: proForm.bank_bic,
        bank_name: proForm.bank_name,
        invoice_tax_id: proForm.invoice_tax_id,
        invoice_footer: proForm.invoice_footer,
        business_address: proForm.business_address,
        business_postal_code: proForm.business_postal_code,
        business_city: proForm.business_city,
        business_country: proForm.business_country,
        service_center_lat: proForm.service_center_lat,
        service_center_lng: proForm.service_center_lng,
        service_radius_km: proForm.service_radius_km ? parseInt(proForm.service_radius_km) : 0,
      });
      /* Only when the pro actually touched the language field.
         `userForm.lang` is seeded from `users.lang` in the database, which
         can differ from the language the app is currently rendering in —
         the header switcher writes localStorage and never the server. So
         saving a phone number or an hourly rate silently flipped the whole
         interface to whatever the DB happened to hold, and the two stores
         stayed permanently out of step. `langTouched` is set by the select's
         own onChange and by nothing else. */
      if (langTouched && userForm.lang !== lang) changeLang(userForm.lang);
      await refreshUser();
      const { data } = await api.get('/api/profile/pro');
      setProProfile(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* noop */ } finally { setSaving(false); }
  };

  const isPro = isPremiumTier(proProfile?.plan_tier);
  // Number(): the API is the source of these and it has already sent a
  // list where a figure was expected. A settings page that cannot be
  // opened is worse than one showing 0.
  const rating = Number(proProfile?.rating_avg) || 0;
  const reviewsCount = proProfile?.reviews_count || 0;
  const jobsDone = proProfile?.completed_jobs_count || 0;
  const yrs = proProfile?.years_experience || 0;
  const hr = proProfile?.hourly_rate || 0;
  const monthlyFees = Number(proProfile?.monthly_fees) || 0;

  const ICONS = {
    about_me: User, services_areas: Briefcase, notifications: Bell, portfolio: ImageIcon, account: SettingsIcon, privacy: Shield, invoice_details: Receipt,
  };

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12">
      <div className="page-container py-6">
        {/* Top bar */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-headings font-bold text-ink">{t('settings_pro_title')}</h1>
            <p className="text-ink-muted text-sm mt-1">{t('settings_pro_subtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          {/* LEFT — Profile card + Plan card */}
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            {/* Profile card */}
            <div className="card-lg" data-testid="settings-profile-card">
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-cream-deep rounded-[20px] flex items-center justify-center mb-3">
                  <span className="text-ink font-headings font-bold text-3xl">
                    {(proForm.business_name || user?.name || '?')[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <p className="font-headings font-bold text-ink">
                    {proForm.business_name || user?.name || 'Your Business'}
                  </p>
                  {isPro && <span className="pro-badge">PRO</span>}
                </div>
                <p className="text-xs text-ink-muted mt-0.5">
                  {selectedCats[0] ? selectedCats[0].replace('_', ' ') : ''}{selectedCats[0] && user?.name ? ' · ' : ''}{user?.name || ''}
                </p>

                {rating > 0 && (
                  <div className="flex items-center gap-1 mt-2">
                    <Star size={13} className="text-amber fill-amber" />
                    <span className="font-semibold text-ink text-sm">{rating.toFixed(1)}</span>
                    <span className="text-xs text-ink-muted">({reviewsCount} {t('reviews_word')})</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 mt-3 flex-wrap justify-center">
                  {proProfile?.is_verified && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal text-paper text-xs font-semibold rounded-full">
                      <CheckCircle2 size={11} /> {t('pro_verified')}
                    </span>
                  )}
                  {proProfile?.is_licensed && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber text-paper text-xs font-semibold rounded-full">
                      🪪 {t('pro_licensed')}
                    </span>
                  )}
                  {proProfile?.is_insured && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-ink text-paper text-xs font-semibold rounded-full">
                      🛡️ {t('pro_insured')}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-sm-border text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-muted">{t('done_short')}</p>
                  <p className="text-base font-bold text-ink">{jobsDone}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-muted">{t('exp_short')}</p>
                  <p className="text-base font-bold text-ink">{yrs} y</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-muted">{t('hr_short')}</p>
                  <p className="text-base font-bold text-ink">€{hr}</p>
                </div>
              </div>
            </div>

            {/* Plan card */}
            <div className={`card-lg ${isPro ? 'border border-amber bg-amber/5' : ''}`} data-testid="settings-plan-card">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('pro_plan_current')}</span>
                {isPro && <span className="pro-badge">PRO</span>}
              </div>
              <p className="font-headings font-bold text-ink text-lg mt-1">
                {planLabel(proProfile?.plan_tier, t)}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                {isPro ? `${planLabel(proProfile?.plan_tier, t)} ${t('billing_active')}` : `€${monthlyFees.toFixed(2)} ${t('billing_fees_this_month')}`}
              </p>
              <Link
                to="/billing"
                className="btn-primary w-full text-xs py-2 mt-3"
                data-testid="settings-manage-billing"
              >
                {t('billing_manage')}
              </Link>
            </div>
          </div>

          {/* RIGHT — Tabs + content */}
          <div className="min-w-0">
            {/* Tabs — horizontally scrollable on mobile with scroll-snap */}
            <ScrollSnapTabStrip
              tabs={TABS.map((tabId) => ({ key: tabId, label: t(tabId) }))}
              activeKey={tab}
              onChange={setTab}
              testidPrefix="pro-settings-tab"
              variant="underline"
              className="mb-5"
            />

            <SwipeableTabPanel tabKeys={TABS} activeKey={tab} onChange={setTab} className="animate-fade-in space-y-4">
              {tab === 'about_me' && (
                <>
                  <div className="card-lg space-y-4">
                    <h2 className="font-headings font-bold text-ink text-lg">{t('about_me')}</h2>

                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('name')}</label>
                      <input value={userForm.name} onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))} className="sm-input" data-testid="pro-name-input" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_business_name')}</label>
                      <input value={proForm.business_name} onChange={(e) => setProForm((f) => ({ ...f, business_name: e.target.value }))} className="sm-input" placeholder="Weber Installations" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_tagline')}</label>
                      <input value={proForm.tagline} onChange={(e) => setProForm((f) => ({ ...f, tagline: e.target.value }))} className="sm-input" placeholder={t('settings_tagline_placeholder')} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_about_me')}</label>
                      <textarea value={proForm.description} onChange={(e) => setProForm((f) => ({ ...f, description: e.target.value }))} className="sm-textarea" rows={4} placeholder={t('settings_about_me_placeholder')} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_hourly_rate')}</label>
                        <input type="number" value={proForm.hourly_rate} onChange={(e) => setProForm((f) => ({ ...f, hourly_rate: e.target.value }))} className="sm-input" min="0" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_years_exp')}</label>
                        <input type="number" value={proForm.years_experience} onChange={(e) => setProForm((f) => ({ ...f, years_experience: e.target.value }))} className="sm-input" min="0" />
                      </div>
                    </div>

                    {/* App language */}
                    <div>
                      <label className="text-sm font-medium text-ink mb-1.5 flex items-center gap-1.5"><Globe size={14} />{t('change_language')}</label>
                      <select value={userForm.lang}
                              onChange={(e) => {
                                setLangTouched(true);
                                setUserForm((f) => ({ ...f, lang: e.target.value }));
                              }}
                              className="sm-select" data-testid="pro-lang-select">
                        {APP_LANG_OPTIONS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                      </select>
                    </div>

                    {/* Kleinunternehmer status (Austrian tax) */}
                    <div className="rounded-[12px] border border-sm-border bg-cream-soft p-3" data-testid="kleinunternehmer-row">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!proForm.is_kleinunternehmer}
                          onChange={(e) => setProForm((f) => ({ ...f, is_kleinunternehmer: e.target.checked }))}
                          className="h-4 w-4 mt-0.5"
                          data-testid="kleinunternehmer-toggle"
                        />
                        <div>
                          <p className="text-sm font-semibold text-ink">{t('settings_kleinunternehmer')}</p>
                          <p className="text-xs text-ink-muted">{t('settings_kleinunternehmer_help')}</p>
                        </div>
                      </label>
                    </div>

                    {/* Languages spoken */}
                    <div data-testid="languages-spoken-section">
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_languages_spoken')}</label>
                      <p className="text-xs text-ink-muted mb-2">{t('settings_languages_spoken_help')}</p>
                      <div className="flex flex-wrap gap-2">
                        {SPOKEN_OPTIONS.map((l) => (
                          <button
                            key={l.code}
                            type="button"
                            onClick={() => toggleSpokenLang(l.code)}
                            className={`px-3 py-1.5 rounded-full text-sm border transition-all
                              ${spokenLangs.includes(l.code)
                                ? 'border-teal bg-teal/10 text-teal font-medium'
                                : 'border-sm-border bg-paper text-ink-soft hover:bg-cream-soft'}`}
                            data-testid={`lang-spoken-${l.code}`}
                          >
                            {l.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button onClick={saveProfile} disabled={saving} className="btn-primary w-full" data-testid="pro-save-btn">
                      {saving ? t('btn_saving') : saved ? t('settings_saved_check') : t('btn_save_changes')}
                    </button>
                  </div>
                </>
              )}

              {tab === 'services_areas' && (
                <>
                  <div className="card-lg">
                    <h2 className="font-headings font-bold text-ink text-lg mb-4">{t('settings_services')}</h2>
                    <div className="flex flex-wrap gap-2">
                      {ALL_CATS.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => toggleCat(cat)}
                          className={`px-3 py-1.5 rounded-full text-sm border transition-all capitalize
                            ${selectedCats.includes(cat) ? 'border-teal bg-teal/10 text-teal font-medium' : 'border-sm-border bg-paper text-ink-soft hover:bg-cream-soft'}`}
                          data-testid={`service-cat-${cat}`}
                        >
                          {cat.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="card-lg">
                    <h2 className="font-headings font-bold text-ink text-lg mb-2">{t('settings_service_areas')}</h2>
                    <p className="text-xs text-ink-muted mb-3">{t('settings_areas_help')}</p>
                    <input
                      value={proForm.service_areas}
                      onChange={(e) => setProForm((f) => ({ ...f, service_areas: e.target.value }))}
                      className="sm-input"
                      placeholder="Vienna 1010, Vienna 1020, ..."
                    />
                  </div>

                  <div className="card-lg" data-testid="geo-fence-card">
                    <h2 className="font-headings font-bold text-ink text-lg mb-1 flex items-center gap-2">
                      <MapPin size={16} className="text-teal" /> {t('settings_geo_fence_title')}
                    </h2>
                    <p className="text-xs text-ink-muted mb-4">{t('settings_geo_fence_help')}</p>
                    <ServiceRadiusPicker
                      proForm={proForm}
                      setProForm={setProForm}
                      user={user}
                      t={t}
                    />
                  </div>
                  <button onClick={saveProfile} disabled={saving} className="btn-primary w-full">
                    {saving ? t('btn_saving') : t('btn_save_changes')}
                  </button>
                </>
              )}

              {tab === 'invoice_details' && (
                <div className="card-lg space-y-4" data-testid="invoice-details-tab">
                  <div className="flex items-start gap-3">
                    <Banknote size={22} className="text-teal flex-shrink-0 mt-1" />
                    <div>
                      <h2 className="font-headings font-bold text-ink text-lg">{t('settings_invoice_details_title')}</h2>
                      <p className="text-xs text-ink-muted">{t('settings_invoice_details_help')}</p>
                    </div>
                  </div>

                  {/* Business address — appears on every issued invoice */}
                  <div className="border-t border-sm-border pt-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-ink-muted mb-3">
                      {t('settings_business_address_title') || 'Business address'}
                    </h3>
                    <p className="text-xs text-ink-muted mb-3">
                      {t('settings_business_address_help') || 'Shown on every invoice you issue. If empty, your personal account address is used.'}
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_address_street') || 'Street + Number'}</label>
                      <input
                        value={proForm.business_address}
                        onChange={(e) => setProForm((f) => ({ ...f, business_address: e.target.value }))}
                        className="sm-input"
                        placeholder="Hauptstraße 12"
                        data-testid="business-address-input"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_postal_code') || 'ZIP / Postal code'}</label>
                        <input
                          value={proForm.business_postal_code}
                          onChange={(e) => setProForm((f) => ({ ...f, business_postal_code: e.target.value }))}
                          className="sm-input"
                          placeholder="1010"
                          data-testid="business-postal-input"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_city') || 'City'}</label>
                        <input
                          value={proForm.business_city}
                          onChange={(e) => setProForm((f) => ({ ...f, business_city: e.target.value }))}
                          className="sm-input"
                          placeholder="Wien"
                          data-testid="business-city-input"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_country') || 'Country'}</label>
                      <select
                        value={proForm.business_country || 'AT'}
                        onChange={(e) => setProForm((f) => ({ ...f, business_country: e.target.value }))}
                        className="sm-input max-w-[200px]"
                        data-testid="business-country-input"
                      >
                        <option value="AT">{t('co_at')}</option>
                        <option value="DE">{t('co_de')}</option>
                        <option value="CH">{t('co_ch')}</option>
                        <option value="IT">{t('co_it')}</option>
                        <option value="SI">{t('co_si')}</option>
                        <option value="SK">{t('co_sk')}</option>
                        <option value="CZ">{t('co_cz')}</option>
                        <option value="HU">{t('co_hu')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="border-t border-sm-border pt-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-ink-muted mb-3">
                      {t('settings_bank_section_title') || 'Bank details (for payments)'}
                    </h3>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_bank_account_holder')}</label>
                    <input
                      value={proForm.bank_account_holder}
                      onChange={(e) => setProForm((f) => ({ ...f, bank_account_holder: e.target.value }))}
                      className="sm-input"
                      placeholder="Max Mustermann"
                      data-testid="bank-holder-input"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_iban')}</label>
                      <input
                        value={proForm.bank_iban}
                        onChange={(e) => {
                          const raw = e.target.value.toUpperCase();
                          const clean = raw.replace(/\s/g, '');
                          setProForm((f) => ({ ...f, bank_iban: raw }));
                          // Auto-detect BIC + bank name when IBAN is structurally valid
                          if (isValidIban(clean)) {
                            const match = lookupBankFromIban(clean);
                            if (match) {
                              setProForm((f) => ({
                                ...f,
                                bank_iban: raw,
                                // Only auto-fill BIC if field is empty and we have a result
                                bank_bic: (!f.bank_bic && match.bic) ? match.bic : f.bank_bic,
                                bank_name: !f.bank_name ? match.name : f.bank_name,
                              }));
                            }
                          }
                        }}
                        className="sm-input font-mono text-sm"
                        placeholder="AT12 3456 7890 1234 5678"
                        data-testid="bank-iban-input"
                      />
                      {(() => {
                        const clean = proForm.bank_iban.replace(/\s/g, '');
                        if (clean.length >= 15 && isValidIban(clean)) {
                          const match = lookupBankFromIban(clean);
                          return match ? (
                            <p className="text-xs text-teal mt-1 flex items-center gap-1" data-testid="bank-detect-hint">
                              <CheckCircle2 size={11} /> {match.name} detected
                            </p>
                          ) : (
                            <p className="text-xs text-green-text mt-1 flex items-center gap-1">
                              <CheckCircle2 size={11} /> {t('set_valid_iban')}
                            </p>
                          );
                        }
                        if (clean.length > 10 && !isValidIban(clean)) {
                          return <p className="text-xs text-red-500 mt-1">{t('set_invalid_iban')}</p>;
                        }
                        return null;
                      })()}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_bic')}</label>
                      <input
                        value={proForm.bank_bic}
                        onChange={(e) => setProForm((f) => ({ ...f, bank_bic: e.target.value.replace(/\s/g, '').toUpperCase() }))}
                        className={`sm-input font-mono text-sm ${proForm.bank_bic && ![8, 11].includes(proForm.bank_bic.replace(/\s/g, '').length) ? 'border-red-400' : ''}`}
                        placeholder="BKAUATWWXXX"
                        data-testid="bank-bic-input"
                      />
                      {proForm.bank_bic && ![8, 11].includes(proForm.bank_bic.replace(/\s/g, '').length) && (
                        <p className="text-xs text-red-500 mt-1">{t('set_bic_format')}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_bank_name')}</label>
                    <input
                      value={proForm.bank_name}
                      onChange={(e) => setProForm((f) => ({ ...f, bank_name: e.target.value }))}
                      className="sm-input"
                      placeholder="Erste Bank"
                      data-testid="bank-name-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_invoice_tax_id')}</label>
                    <input
                      value={proForm.invoice_tax_id}
                      onChange={(e) => setProForm((f) => ({ ...f, invoice_tax_id: e.target.value }))}
                      className="sm-input"
                      placeholder="123/4567"
                      data-testid="invoice-tax-id-input"
                    />
                    <p className="text-[11px] text-ink-muted mt-1">{t('settings_invoice_tax_id_help')}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_invoice_footer')}</label>
                    <textarea
                      value={proForm.invoice_footer}
                      onChange={(e) => setProForm((f) => ({ ...f, invoice_footer: e.target.value }))}
                      className="sm-textarea"
                      rows={2}
                      placeholder={t('settings_invoice_footer_ph')}
                      data-testid="invoice-footer-input"
                    />
                  </div>

                  {/* ─── White-label: logo + template ─── */}
                  <WhiteLabelSection t={t} proProfile={proProfile} reload={fetchProProfile} />

                  <button onClick={saveProfile} disabled={saving} className="btn-primary w-full" data-testid="invoice-details-save">
                    {saving ? t('btn_saving') : saved ? t('settings_saved_check') : t('btn_save_changes')}
                  </button>
                  {!proProfile?.has_invoice_toolkit && (
                    <div className="rounded-[12px] border border-amber/40 bg-amber/10 p-3 text-sm text-amber-deep flex items-center gap-2">
                      <AlertCircle size={14} />
                      <span>{t('settings_invoice_needs_toolkit')} <Link to="/billing" className="underline font-semibold">{t('settings_get_toolkit_link')}</Link></span>
                    </div>
                  )}
                </div>
              )}

              {tab === 'notifications' && (
                <div className="card-lg space-y-4">
                  <h2 className="font-headings font-bold text-ink text-lg">{t('notifications')}</h2>

                  {/* Master channels */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">{t('settings_notif_channels')}</p>
                    {[
                      { key: 'notif_email', label: t('settings_email_notif'), desc: t('settings_email_notif_desc') },
                      { key: 'notif_sms',   label: t('settings_sms_notif'),   desc: t('settings_sms_notif_desc') },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between py-3 border-b border-sm-border last:border-b-0">
                        <div>
                          <p className="text-sm font-medium text-ink">{item.label}</p>
                          <p className="text-xs text-ink-muted">{item.desc}</p>
                        </div>
                        <button
                          data-testid={`notif-toggle-${item.key}`}
                          onClick={() => setNotifForm((f) => ({ ...f, [item.key]: !f[item.key] }))}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notifForm[item.key] ? 'bg-teal' : 'bg-ink-faint'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform ${notifForm[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Per-event preferences (grouped) */}
                  <div className="pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">{t('settings_notif_events')}</p>
                    {[
                      { key: 'notif_new_job_match',     label: t('settings_notif_new_job_match'),     desc: t('settings_notif_new_job_match_desc') },
                      { key: 'notif_new_message',       label: t('settings_notif_new_message'),       desc: t('settings_notif_new_message_desc') },
                      { key: 'notif_quote_accepted',    label: t('settings_notif_quote_accepted'),    desc: t('settings_notif_quote_accepted_desc') },
                      { key: 'notif_new_review',        label: t('settings_notif_new_review'),        desc: t('settings_notif_new_review_desc') },
                      { key: 'notif_booking_confirmed', label: t('settings_notif_booking_confirmed'), desc: t('settings_notif_booking_confirmed_desc') },
                      { key: 'notif_job_status',        label: t('settings_notif_job_status'),        desc: t('settings_notif_job_status_desc') },
                      { key: 'notif_payment_receipt',   label: t('settings_notif_payment_receipt'),   desc: t('settings_notif_payment_receipt_desc') },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between py-3 border-b border-sm-border last:border-b-0">
                        <div className="pr-4">
                          <p className="text-sm font-medium text-ink">{item.label}</p>
                          <p className="text-xs text-ink-muted">{item.desc}</p>
                        </div>
                        <button
                          data-testid={`notif-toggle-${item.key}`}
                          onClick={() => setNotifForm((f) => ({ ...f, [item.key]: !f[item.key] }))}
                          disabled={!notifForm.notif_email}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0
                            ${notifForm[item.key] && notifForm.notif_email ? 'bg-teal' : 'bg-ink-faint'}
                            ${!notifForm.notif_email ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform ${notifForm[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    ))}
                    {!notifForm.notif_email && (
                      <p className="text-[11px] text-amber-deep mt-2 italic">{t('settings_notif_master_off')}</p>
                    )}
                  </div>

                  <button onClick={saveProfile} disabled={saving} className="btn-primary w-full" data-testid="notif-save-btn">{t('btn_save_changes')}</button>
                </div>
              )}

              {tab === 'portfolio' && (
                <PortfolioTab proProfile={proProfile} onChange={setProProfile} t={t} />
              )}

              {tab === 'account' && (
                <div className="card-lg space-y-4">
                  <h2 className="font-headings font-bold text-ink text-lg">{t('account')}</h2>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">{t('email')}</label>
                    <input value={user?.email} disabled className="sm-input opacity-60" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">{t('phone')}</label>
                    <input value={userForm.phone} onChange={(e) => setUserForm((f) => ({ ...f, phone: e.target.value }))} className="sm-input" placeholder="+43 ..." />
                  </div>
                  <button onClick={saveProfile} disabled={saving} className="btn-primary w-full">{t('btn_save_changes')}</button>

                  <ChangePassword t={t} />

                  <AppVersion t={t} />

                  <div className="pt-4 border-t border-sm-border">
                    <button
                      className="btn-danger w-full"
                      data-testid="pro-delete-account-btn"
                      onClick={() => setTab('privacy')}
                    >
                      {t('settings_delete_account')}
                    </button>
                    <p className="text-[11px] text-ink-muted mt-2 text-center">{t('settings_delete_redirect_help')}</p>
                  </div>
                </div>
              )}

              {tab === 'privacy' && <PrivacySettings />}
            </SwipeableTabPanel>
          </div>
        </div>
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────
// Portfolio tab (Standard: 10 photos, Pro: 30 photos via GridFS)
// ──────────────────────────────────────────────
function PortfolioTab({ proProfile, onChange, t }) {
  const photos = proProfile?.portfolio_photos || [];
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const isPro = isPremiumTier(proProfile?.plan_tier);
  const MAX = isPro ? 30 : 10;

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photos.length >= MAX) {
      setError(`Max ${MAX} photos`);
      return;
    }
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post('/api/profile/pro/portfolio', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { data: pp } = await api.get('/api/profile/pro');
      onChange(pp);
    } catch (err) {
      setError(err.response?.data?.detail || t('err_upload_failed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDelete = async (idx) => {
    if (!window.confirm(t('btn_delete') + '?')) return;
    try {
      await api.delete(`/api/profile/pro/portfolio/${idx}`);
      const { data: pp } = await api.get('/api/profile/pro');
      onChange(pp);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="card-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-headings font-bold text-ink text-lg">{t('portfolio')}</h2>
        <span className="text-xs text-ink-muted" data-testid="portfolio-count">
          {t('settings_portfolio_count').replace('{n}', photos.length)}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-warn bg-red-50 rounded-[14px] p-3 mb-4 text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((p, i) => {
          const isFull = (p.url || '').startsWith('http') || (p.url || '').startsWith('data:');
          const src = isFull ? p.url : `${apiBase}${p.url}`;
          return (
            <div key={p.file_id || i} className="relative group rounded-[14px] overflow-hidden border border-sm-border aspect-square bg-cream-soft">
              <img
                src={src}
                alt={p.caption || `Portfolio ${i + 1}`}
                className="w-full h-full object-cover"
                data-testid={`portfolio-photo-${i}`}
              />
              <button
                onClick={() => onDelete(i)}
                className="absolute top-1.5 right-1.5 bg-red-warn text-paper rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`portfolio-delete-${i}`}
                aria-label="delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        {photos.length < MAX && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-[14px] border-2 border-dashed border-sm-border flex flex-col items-center justify-center gap-2 hover:border-teal hover:bg-teal/5 transition-colors disabled:opacity-50"
            data-testid="portfolio-add-btn"
          >
            {uploading ? (
              <>
                <Loader2 size={20} className="text-teal animate-spin" />
                <span className="text-xs text-ink-muted">{t('settings_portfolio_uploading')}</span>
              </>
            ) : (
              <>
                <Plus size={20} className="text-teal" />
                <span className="text-xs text-ink font-medium">{t('settings_portfolio_add')}</span>
                <span className="text-[10px] text-ink-muted">{t('settings_portfolio_max').replace('{n}', MAX)}</span>
              </>
            )}
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPick}
          data-testid="portfolio-file-input"
        />
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────
function WhiteLabelSection({ t, proProfile, reload }) {
  const [tplList, setTplList] = useState([]);
  const [currentTpl, setCurrentTpl] = useState(proProfile?.invoice_template || 'classic');
  const [logoUrl, setLogoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [switching, setSwitching] = useState(null);
  const [previewKey, setPreviewKey] = useState(null);

  useEffect(() => {
    api.get('/api/invoices/templates/list').then((r) => {
      setTplList(r.data.templates || []);
      setCurrentTpl(r.data.current || 'classic');
      setLogoUrl(r.data.logo_url || null);
    }).catch(() => {});
  }, []);

  const onLogoUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1024 * 1024) { window.alert(t('settings_logo_too_large')); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const { data } = await api.post('/api/profile/pro/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setLogoUrl(data.logo_url);
      if (reload) reload();
    } catch (err) {
      window.alert(err?.response?.data?.detail || t('err_upload_failed'));
    } finally { setUploading(false); }
  };

  const removeLogo = async () => {
    if (!window.confirm(t('settings_logo_remove_confirm'))) return;
    await api.delete('/api/profile/pro/logo');
    setLogoUrl(null);
    if (reload) reload();
  };

  const pickTemplate = async (key) => {
    setSwitching(key);
    try {
      await api.patch('/api/profile/pro/invoice-template', { invoice_template: key });
      setCurrentTpl(key);
      if (reload) reload();
    } finally { setSwitching(null); }
  };

  return (
    <div className="border-t border-sm-border pt-4 mt-2" data-testid="white-label-section">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={16} className="text-teal" />
        <h3 className="font-headings font-bold text-ink text-base">{t('settings_white_label_title')}</h3>
        <span className="text-[10px] uppercase font-bold tracking-wider bg-teal/10 text-teal px-2 py-0.5 rounded-full">{t('settings_pro_perk')}</span>
      </div>
      <p className="text-xs text-ink-muted mb-4">{t('settings_white_label_help')}</p>

      {/* Logo upload */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-ink mb-2">{t('settings_logo_label')}</label>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-24 h-24 rounded-[12px] border-2 border-dashed border-sm-border bg-cream-soft flex items-center justify-center overflow-hidden flex-shrink-0" data-testid="logo-preview">
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <ImageIcon size={28} className="text-ink-muted" />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="btn-primary text-xs cursor-pointer inline-flex">
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
              {logoUrl ? t('settings_logo_replace') : t('settings_logo_upload')}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogoUpload} disabled={uploading} className="hidden" data-testid="logo-input" />
            </label>
            {logoUrl && (
              <button onClick={removeLogo} className="btn-ghost text-xs text-red-warn" data-testid="logo-remove">
                <Trash2 size={12} /> {t('settings_logo_remove')}
              </button>
            )}
            <p className="text-[11px] text-ink-muted max-w-xs">{t('settings_logo_help')}</p>
          </div>
        </div>
      </div>

      {/* Template picker */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">{t('settings_template_label')}</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2" data-testid="template-grid">
          {tplList.map((tpl) => {
            const active = currentTpl === tpl.key;
            return (
              <div
                key={tpl.key}
                className={`rounded-[10px] border-2 p-3 cursor-pointer transition-all relative ${active ? 'border-teal bg-teal/5' : 'border-sm-border hover:border-teal/40'}`}
                onClick={() => !active && pickTemplate(tpl.key)}
                data-testid={`template-${tpl.key}`}
              >
                {active && (
                  <span className="absolute top-2 right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal text-paper">
                    <Check size={10} />
                  </span>
                )}
                <p className="font-headings font-bold text-ink text-sm capitalize">{tpl.name}</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPreviewKey(tpl.key); }}
                  className="text-[11px] text-teal hover:underline mt-2 inline-flex items-center gap-1"
                  data-testid={`template-preview-${tpl.key}`}
                >
                  <Eye size={10} /> {t('settings_template_preview')}
                </button>
                {switching === tpl.key && <Loader2 size={12} className="absolute bottom-2 right-2 text-teal animate-spin" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview modal */}
      {previewKey && (
        <div
          className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewKey(null)}
          data-testid="template-preview-modal"
        >
          <div className="bg-paper rounded-[14px] max-w-3xl w-full h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-sm-border">
              <p className="font-headings font-bold text-ink capitalize">{previewKey} {t('settings_template_preview_title')}</p>
              <button onClick={() => setPreviewKey(null)} className="btn-ghost text-xs">✕</button>
            </div>
            <iframe
              src={`${apiBase}/api/invoices/templates/${previewKey}/preview`}
              title="preview"
              className="flex-1 w-full"
              data-testid="template-preview-iframe"
            />
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * Change your own password.
 *
 * There was no way to do this and no way to reset a forgotten one: no
 * endpoint, no token, nothing on any screen. A password could never be
 * rotated after a leak, and forgetting it meant permanent lockout from your
 * own invoices, tax year and customers.
 *
 * Password reset still does not exist, because it needs an email rail to
 * deliver the token and there is not one yet. This covers the case that can
 * be covered today: you are logged in and want a different password.
 */
function ChangePassword({ t }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async () => {
    setMsg(null);
    if (next.length < 8) return setMsg({ bad: true, text: t('pw_too_short') });
    if (next !== again) return setMsg({ bad: true, text: t('pw_mismatch') });
    setBusy(true);
    try {
      const { data } = await api.post('/api/auth/change-password', {
        current_password: current, new_password: next,
      });
      setMsg({ bad: false, text: `${t('pw_changed')} ${data.note || ''}`.trim() });
      setCurrent(''); setNext(''); setAgain('');
    } catch (e) {
      setMsg({ bad: true, text: e?.response?.data?.detail || t('generic_error') });
    } finally { setBusy(false); }
  };

  return (
    <div className="pt-4 border-t border-sm-border" data-testid="change-password">
      {!open ? (
        <button className="btn-ghost w-full" onClick={() => setOpen(true)}
                data-testid="change-password-open">
          <KeyRound size={14} /> {t('pw_change')}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">{t('pw_change')}</p>
          {[['pw-current', t('pw_current'), current, setCurrent, 'current-password'],
            ['pw-new', t('pw_new'), next, setNext, 'new-password'],
            ['pw-again', t('pw_repeat'), again, setAgain, 'new-password']].map(
            ([id, label, val, set, ac]) => (
              <div key={id}>
                <label htmlFor={id} className="block text-xs font-medium text-ink-soft mb-1">
                  {label}
                </label>
                <input id={id} type="password" autoComplete={ac} className="sm-input w-full"
                       value={val} onChange={(e) => set(e.target.value)}
                       data-testid={id} />
              </div>
            ))}
          {msg && (
            <p className={`text-xs ${msg.bad ? 'text-red-warn' : 'text-green-text'}`}
               data-testid="change-password-msg">{msg.text}</p>
          )}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy || !current || !next}
                    onClick={submit} data-testid="change-password-submit">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              {t('btn_save')}
            </button>
            <button className="btn-ghost" onClick={() => { setOpen(false); setMsg(null); }}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Which build this phone is running.
 *
 * There was no answer to this anywhere in the app, which made every support
 * conversation start from nothing: a pro reporting a bug that was fixed on
 * Tuesday and a pro whose tab has not reloaded since Monday say exactly the
 * same sentence. The commit is what makes those two different.
 *
 * The running asset hash is shown beside it when it can be read, because they
 * can disagree — a tab open for days is executing an older bundle than the one
 * the server is handing out, and that disagreement is the diagnosis rather
 * than a detail to tidy away. `UpdatePrompt` is what offers the reload.
 *
 * One tap copies the lot, so it can be pasted into a message instead of read
 * out digit by digit.
 */
function AppVersion({ t }) {
  const [copied, setCopied] = useState(false);
  const asset = runningAsset();
  const built = BUILD.at ? new Date(BUILD.at) : null;
  const line = `ServiceMarket ${buildLabel()}${asset ? ` · ${asset}` : ''}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* No clipboard permission, or an insecure origin. The text is on screen
         and selectable either way — this button is a convenience, not the
         only way to get at it. */
    }
  };

  return (
    <div className="pt-4 border-t border-sm-border" data-testid="app-version">
      <div className="flex items-start gap-2.5 rounded-[12px] border border-sm-border
                      bg-cream-soft px-3 py-2.5">
        <Info size={14} className="mt-[3px] shrink-0 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[.05em] text-ink-muted">
            {t('settings_version')}
          </p>
          <p className="mt-[2px] font-bold text-[14px] text-ink tabular-nums"
             data-testid="app-version-value">{buildLabel()}</p>
          <p className="mt-[2px] text-[11px] text-ink-muted leading-relaxed">
            {built ? t('settings_version_built', { d: built.toLocaleString() }) : null}
            {asset ? ` · ${t('settings_version_running', { a: asset })}` : ''}
          </p>
        </div>
        <button type="button" onClick={copy} data-testid="app-version-copy"
                aria-label={t('settings_version_copy')}
                className="shrink-0 rounded-[9px] border border-sm-border bg-paper px-2 py-1.5
                           text-[11px] font-bold text-teal">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}
