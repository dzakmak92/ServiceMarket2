import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import api from '../api/client';
import { Briefcase, Building2, CalendarDays, Calculator, CreditCard, FileText, Home, Inbox, LayoutDashboard, ListChecks, MessageSquare, MoreHorizontal, PlusCircle, Receipt, Repeat, Search, Settings as SettingsIcon, Users, X } from 'lucide-react';

/**
 * Mobile bottom nav — always 4 anchors + 1 right-corner "More" button that
 * opens a slide-up sheet containing toolkit-level pages (My Quotes, My
 * Invoices, Billing, …). Keeps the footer slim no matter how many extras
 * we ship later.
 */
export default function MobileNav() {
  const { user } = useAuth();
  const { t } = useLang();
  const location = useLocation();
  const [hasToolkit, setHasToolkit] = useState(false);
  const [hasTax, setHasTax] = useState(false);
  const [hasPm, setHasPm] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (user?.role !== 'tradesperson') {
      setHasToolkit(false); setHasTax(false); setHasPm(false); return;
    }
    let cancelled = false;
    api.get('/api/profile/pro')
      .then((r) => {
        if (cancelled) return;
        setHasToolkit(!!r.data?.has_invoice_toolkit);
        setHasTax(!!r.data?.has_tax_toolkit);
        setHasPm(!!r.data?.has_pm_toolkit);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  // Close the More sheet whenever the route changes.
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  if (!user) return null;
  const isActive = (path) => location.pathname === path;

  // 4 most-used links per role + a "More" right-corner action.
  const primaryPro = [
    { to: '/', icon: Home, label: t('nav_home') },
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
    { to: '/customers', icon: Users, label: t('nav_customers') || 'Kunden' },
    { to: '/quotes', icon: FileText, label: t('nav_quotes') || 'Angebote' },
    { to: '/leads/new', icon: Inbox, label: t('nav_capture_lead') || 'Anfrage' },
    { to: '/recurring', icon: Repeat, label: t('nav_recurring') || 'Wartung' },
    { to: '/estimate', icon: Calculator, label: t('nav_estimate') || 'Kalkulation' },
    ...(hasPm ? [{ to: '/projects', icon: Briefcase, label: t('nav_projects') }] : []),
    { to: '/pro-calendar', icon: CalendarDays, label: t('nav_pro_calendar') || 'My Calendar' },
  ];
  const morePro = [
    ...(hasToolkit ? [{ to: '/my-invoices', icon: Receipt, label: t('nav_my_invoices') }] : []),
    ...(hasTax ? [{ to: '/tax', icon: ListChecks, label: t('nav_tax') }] : []),
    { to: '/schedule', icon: CalendarDays, label: t('nav_schedule') || 'Schedule' },
    { to: '/billing', icon: CreditCard, label: t('nav_billing') },
    { to: '/settings', icon: SettingsIcon, label: t('nav_settings') },
  ];

  const primary = user.role === 'tradesperson' ? primaryPro : [];
  const more = user.role === 'tradesperson' ? morePro : [];

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-paper border-t border-sm-border z-40 pb-safe"
        data-testid="mobile-nav"
      >
        <div className="flex items-stretch justify-around">
          {primary.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex-1 flex flex-col items-center justify-center py-2 px-1 transition-colors
                  ${active ? 'text-teal' : 'text-ink-muted'}`}
                data-testid={`mobile-nav-${link.to.replace(/\//g, '') || 'home'}`}
              >
                <Icon size={20} />
                <span className="text-[10px] mt-0.5 font-medium">{link.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center py-2 px-1 transition-colors
              ${moreOpen ? 'text-teal' : 'text-ink-muted'}`}
            data-testid="mobile-nav-more"
            aria-haspopup="dialog"
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] mt-0.5 font-medium">{t('nav_more')}</span>
          </button>
        </div>
      </nav>

      {/* Slide-up "More" sheet — z-60 sits above the cookie banner */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-[200] bg-black/40 flex items-end"
          onClick={() => setMoreOpen(false)}
          data-testid="mobile-nav-more-sheet"
        >
          <div
            className="w-full bg-paper rounded-t-[20px] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-headings font-bold text-ink">{t('nav_more')}</p>
              <button onClick={() => setMoreOpen(false)} className="p-1 text-ink-muted" aria-label="close">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {more.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-[12px] bg-cream-soft hover:bg-cream-deep transition-colors"
                    data-testid={`mobile-more-${link.to.replace(/\//g, '')}`}
                  >
                    <Icon size={20} className="text-teal" />
                    <span className="text-[11px] font-medium text-ink text-center leading-tight">{link.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="h-2" />
          </div>
        </div>
      )}
    </>
  );
}
