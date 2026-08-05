import React from 'react';
import { useLang } from '../contexts/LangContext';
import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useCookieConsent } from '../contexts/CookieConsentContext';

/**
 * Site-wide footer with legal links — GDPR / Austrian e-commerce law require
 * Imprint, Privacy and Terms links to be reachable from every page.
 */
export default function Footer() {
  const { t } = useLang();
  const consent = useCookieConsent();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-sm-border bg-paper mt-auto py-6" data-testid="site-footer">
      <div className="page-container">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2 text-ink-muted text-xs">
            <Shield size={12} className="text-teal" />
            <span>© {year} ServiceMarket · servicemarket.at</span>
          </div>
          <nav className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-ink-muted">
            <Link to="/privacy" className="hover:text-teal transition-colors" data-testid="footer-privacy-link">{t('ft_privacy')}</Link>
            <Link to="/terms" className="hover:text-teal transition-colors" data-testid="footer-terms-link">{t('ft_terms')}</Link>
            <Link to="/imprint" className="hover:text-teal transition-colors" data-testid="footer-imprint-link">{t('ft_imprint')}</Link>
            <Link to="/data-rights" className="hover:text-teal transition-colors" data-testid="footer-data-rights-link">{t('ft_data_rights')}</Link>
            <Link to="/remove" className="hover:text-teal transition-colors" data-testid="footer-removal-link">{t('ft_removal')}</Link>
            <button
              onClick={consent.openPreferences}
              className="hover:text-teal transition-colors"
              data-testid="footer-cookie-prefs-link"
            >
              Cookie preferences
            </button>
          </nav>
        </div>
      </div>
    </footer>
  );
}
