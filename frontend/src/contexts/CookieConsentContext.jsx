import { useLang } from './LangContext';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';

/**
 * Cookie / consent context.
 *
 * Categories:
 *   - essential  — always true (login, CSRF, language)
 *   - analytics  — optional
 *   - marketing  — optional
 *
 * Persisted to localStorage immediately so subsequent loads don't re-show the
 * banner. If the user is logged in, the choice is also mirrored to the server
 * via POST /api/me/consent for audit/GDPR purposes.
 */
const KEY = 'sm_cookie_consent_v1';
const POLICY_VERSION = '1.0-draft-2026-02-28';

const CookieConsentCtx = createContext({
  consent: null,
  policyVersion: POLICY_VERSION,
  bannerVisible: false,
  acceptAll: () => {},
  acceptEssential: () => {},
  savePreferences: () => {},
  openPreferences: () => {},
});

export function useCookieConsent() {
  return useContext(CookieConsentCtx);
}

function readStored() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function CookieConsentProvider({ children }) {
  const [consent, setConsent] = useState(readStored);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    if (!consent) {
      // Small delay so first paint isn't blocked by an overlay
      const t = setTimeout(() => setBannerVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [consent]);

  const persist = useCallback(async (next) => {
    const final = {
      ...next,
      cookies_essential: true,
      policy_version: POLICY_VERSION,
      recorded_at: new Date().toISOString(),
    };
    setConsent(final);
    setBannerVisible(false);
    setPreferencesOpen(false);
    try {
      localStorage.setItem(KEY, JSON.stringify(final));
    } catch { /* noop */ }
    // Best-effort server mirror (no-op if logged out — 401 silently ignored)
    try {
      await api.post('/api/me/consent', {
        cookies_essential: true,
        cookies_analytics: !!final.cookies_analytics,
        cookies_marketing: !!final.cookies_marketing,
        marketing_emails: !!final.marketing_emails,
        policy_version: POLICY_VERSION,
      }, { skipAuthRedirect: true });
    } catch { /* logged-out or network error — fine */ }
  }, []);

  const value = {
    consent,
    policyVersion: POLICY_VERSION,
    bannerVisible: bannerVisible || preferencesOpen,
    acceptAll: () => persist({ cookies_analytics: true, cookies_marketing: true, marketing_emails: false }),
    acceptEssential: () => persist({ cookies_analytics: false, cookies_marketing: false, marketing_emails: false }),
    savePreferences: (prefs) => persist(prefs),
    openPreferences: () => { setPreferencesOpen(true); setBannerVisible(true); },
  };

  // Hide on /admin/* routes (banner overlaps admin tabs, see iter35 testing report).
  const onAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

  return (
    <CookieConsentCtx.Provider value={value}>
      {children}
      {!onAdminRoute && (bannerVisible || preferencesOpen) && <CookieBanner preferencesOpen={preferencesOpen} setPreferencesOpen={setPreferencesOpen} />}
    </CookieConsentCtx.Provider>
  );
}

// ──────────────────────────────────────────────
// The visible banner / preferences modal
// ──────────────────────────────────────────────
function CookieBanner({ preferencesOpen, setPreferencesOpen }) {
  const ctx = useContext(CookieConsentCtx);
  // Art. 7(2) DSGVO wants the request for consent in clear, plain language.
  // This dialogue was English on a German-first product, and it is the first
  // thing a customer opening their tradesperson's link is shown.
  const { t } = useLang();
  const [analytics, setAnalytics] = useState(ctx.consent?.cookies_analytics ?? false);
  const [marketing, setMarketing] = useState(ctx.consent?.cookies_marketing ?? false);

  if (preferencesOpen) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm p-3 sm:p-6" data-testid="cookie-preferences-modal">
        <div className="bg-paper rounded-[18px] shadow-2xl w-full max-w-lg p-5 animate-slide-up">
          <h2 className="font-headings text-xl font-bold text-ink mb-1">{t('cookie_prefs_title')}</h2>
          <p className="text-xs text-ink-muted mb-4">
            {t('cookie_prefs_desc')}
          </p>

          <div className="space-y-3 mb-5">
            <PreferenceRow
              title={t('cookie_essential_title')}
              description={t('cookie_essential_desc')}
              checked
              disabled
              testid="cookie-pref-essential"
            />
            <PreferenceRow
              title={t('cookie_analytics_title')}
              description={t('cookie_analytics_desc')}
              checked={analytics}
              onChange={setAnalytics}
              testid="cookie-pref-analytics"
            />
            <PreferenceRow
              title={t('cookie_marketing_title')}
              description={t('cookie_marketing_desc')}
              checked={marketing}
              onChange={setMarketing}
              testid="cookie-pref-marketing"
            />
          </div>

          <div className="flex gap-2 flex-col sm:flex-row">
            <button
              onClick={() => ctx.acceptEssential()}
              className="btn-ghost flex-1 text-sm"
              data-testid="cookie-reject-all-btn"
            >
              {t('cookie_reject_all')}
            </button>
            <button
              onClick={() => ctx.savePreferences({ cookies_analytics: analytics, cookies_marketing: marketing })}
              className="btn-primary flex-1 text-sm"
              data-testid="cookie-save-preferences-btn"
            >
              {t('cookie_save_prefs')}
            </button>
          </div>
          <button
            onClick={() => setPreferencesOpen(false)}
            className="block mx-auto mt-3 text-xs text-ink-muted hover:text-ink"
          >
            {t('cookie_close')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 left-3 right-3 md:bottom-6 md:left-6 md:right-auto md:max-w-md z-50 bg-paper border border-sm-border rounded-[18px] shadow-2xl p-4 animate-slide-up" data-testid="cookie-banner">
      <h3 className="font-headings font-bold text-ink mb-1 text-base">{t('cookie_title')}</h3>
      <p className="text-xs text-ink-muted mb-3 leading-relaxed">
        {t('cookie_desc')}{' '}
        <a href="/privacy" className="text-teal hover:underline">{t('cookie_privacy_link')}</a>
      </p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => ctx.acceptEssential()}
          className="btn-ghost text-xs flex-1 min-w-[80px]"
          data-testid="cookie-essential-only-btn"
        >
          {t('cookie_essential')}
        </button>
        <button
          onClick={() => setPreferencesOpen(true)}
          className="btn-ghost text-xs flex-1 min-w-[80px]"
          data-testid="cookie-preferences-btn"
        >
          {t('cookie_customise')}
        </button>
        <button
          onClick={() => ctx.acceptAll()}
          className="btn-primary text-xs flex-1 min-w-[80px]"
          data-testid="cookie-accept-all-btn"
        >
          {t('cookie_accept')}
        </button>
      </div>
    </div>
  );
}

function PreferenceRow({ title, description, checked, onChange, disabled, testid }) {
  return (
    <div className="flex items-start gap-3 p-3 border border-sm-border rounded-[12px]">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-teal disabled:opacity-50"
        data-testid={testid}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-[11px] text-ink-muted mt-0.5">{description}</p>
      </div>
    </div>
  );
}
