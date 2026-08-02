import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import api from '../api/client';
import { AlertTriangle, Building2, CalendarDays, Calculator, FileText,
  Handshake, Home, LayoutDashboard, ListChecks, MoreHorizontal, Plus, Receipt, Settings as SettingsIcon, Users, Wrench, X } from 'lucide-react';

/**
 * Mobile bottom nav — four anchors and a "More" sheet.
 *
 * It does not repeat the home screen's six stage tiles. Those are the job's
 * lifecycle and they are large, counted and colour-coded on Start; a second,
 * smaller copy of three of them down here was navigation competing with
 * itself. The bar carries what a tile cannot: the way back, the records, and
 * the single create action.
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

  // The bar deliberately does not repeat the home screen.
  //
  // Kalkulation, Angebot, Auftrag, Projekt, Wartung and Garantie are the six
  // tiles on Start. Carrying three of them down here gave the same
  // destination two routes and had the bar doing the grid's job badly — five
  // small targets duplicating six large ones.
  //
  // What is left is what a tile cannot be: the way back to the grid, the two
  // records you look things up in, and the one thing you create from nothing.
  // `Neu` is the only verb in the bar, which is why it is the only one that
  // carries colour.
  const primaryPro = [
    { to: '/', icon: Home, label: t('nav_home') },
    { to: '/customers', icon: Users, label: t('nav_customers') },
    { to: '/leads/new', icon: Plus, label: t('nav_new'), accent: true },
    ...(hasToolkit
      ? [{ to: '/my-invoices', icon: Receipt, label: t('nav_invoices_short') }]
      : [{ to: '/schedule', icon: CalendarDays, label: t('nav_schedule') }]),
  ];
  // Everything the grid covers stays reachable from here too, for anyone deep
  // in the app who does not want to go via Start.
  const morePro = [
    { to: '/estimate', icon: Calculator, label: t('nav_estimate') },
    { to: '/quotes', icon: FileText, label: t('nav_quotes') },
    { to: '/projects', icon: Handshake, label: t('nav_jobs') },
    ...(hasPm ? [{ to: '/projects?mode=project', icon: Building2, label: t('nav_projects') }] : []),
    { to: '/recurring', icon: Wrench, label: t('nav_recurring') },
    ...(hasToolkit ? [{ to: '/overdue', icon: AlertTriangle, label: t('nav_overdue') }] : []),
    ...(hasTax ? [{ to: '/tax', icon: ListChecks, label: t('nav_tax') }] : []),
    ...(hasToolkit ? [{ to: '/schedule', icon: CalendarDays, label: t('nav_schedule') }] : []),
    ...(hasToolkit ? [{ to: '/my-invoices', icon: Receipt, label: t('nav_my_invoices') }] : []),
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
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
                className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] py-2.5 px-1
                  transition-colors focus-visible:outline-none focus-visible:ring-4
                  focus-visible:ring-teal/30 ${active ? 'text-teal' : 'text-ink-muted'}`}
                data-testid={`mobile-nav-${link.to.replace(/\//g, '') || 'home'}`}
              >
                {link.accent ? (
                  <span className="w-9 h-9 -mt-1 rounded-full bg-amber text-on-amber
                                   grid place-items-center shadow-sm">
                    <Icon size={20} strokeWidth={2.4} />
                  </span>
                ) : (
                  <Icon size={20} />
                )}
                <span className={`text-[10.5px] font-semibold
                  ${link.accent ? 'text-ink' : ''}`}>{link.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] py-2.5 px-1
              transition-colors focus-visible:outline-none focus-visible:ring-4
              focus-visible:ring-teal/30 ${moreOpen ? 'text-teal' : 'text-ink-muted'}`}
            data-testid="mobile-nav-more"
            aria-haspopup="dialog"
          >
            <MoreHorizontal size={20} />
            <span className="text-[10.5px] font-semibold">{t('nav_more')}</span>
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
