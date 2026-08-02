import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import api from '../api/client';
import { STAGES } from '../utils/workflow';
import { CalendarDays, Home, LayoutDashboard, ListChecks,
  MoreHorizontal, Plus, Settings as SettingsIcon, Users, X } from 'lucide-react';

/**
 * Mobile bottom nav — four anchors and a "More" sheet.
 *
 * Neither the bar nor the sheet repeats the home screen's stage tiles. Those
 * are the job's lifecycle: large, counted and colour-coded on Start. A second
 * smaller copy of them here is navigation competing with itself, and it gives
 * every destination two routes.
 *
 * The exclusion is computed from STAGES rather than maintained by hand. That
 * is the whole point — this list has drifted out of agreement with the tiles
 * twice already, and a derived rule cannot drift. Add or remove a tile and
 * the menu follows on its own.
 */
const STAGE_ROUTES = new Set(STAGES.map((s) => s.to).filter(Boolean));
const notAStage = (link) => !STAGE_ROUTES.has(link.to);

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

  // What a tile cannot be: the way back to the grid, the two records you look
  // things up in, and the one thing you create from nothing. `Neu` is the only
  // verb here, which is why it is the only entry that carries colour.
  const primaryPro = [
    { to: '/', icon: Home, label: t('nav_home') },
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
    { to: '/leads/new', icon: Plus, label: t('nav_new'), accent: true },
    { to: '/schedule', icon: CalendarDays, label: t('nav_schedule') },
  ];
  // What is left once the tiles are taken out. Overdue is gone from here: the
  // home screen already surfaces the worst unpaid invoice in its focus card
  // and again in the Überfällig row, so a third route to the same money was
  // the menu repeating the front page.
  const morePro = [
    { to: '/customers', icon: Users, label: t('nav_customers') },
    ...(hasTax ? [{ to: '/tax', icon: ListChecks, label: t('nav_tax') }] : []),
    { to: '/settings', icon: SettingsIcon, label: t('nav_settings') },
  ].filter(notAStage);

  const primary = user.role === 'tradesperson' ? primaryPro.filter(notAStage) : [];
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
