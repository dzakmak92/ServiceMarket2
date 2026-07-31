import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import { useNotifications } from '../hooks/useNotifications';
import { useWebPush } from '../hooks/useWebPush';
import { isPremiumTier } from '../utils/tier';
import {
  Bell, ChevronDown, Hammer, LogOut, Settings, LayoutDashboard, MessageSquare,
  BellRing, BellOff, Zap, Globe, Check,
} from 'lucide-react';

const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'de', label: 'DE', name: 'Deutsch' },
  { code: 'tr', label: 'TR', name: 'Türkçe' },
  { code: 'es', label: 'ES', name: 'Español' },
];

export default function Header() {
  const { user, logout } = useAuth();
  const { t, lang, changeLang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langSubOpen, setLangSubOpen] = useState(false);

  const {
    notifications, unreadCount, permission, requestPermission, markOneRead, markAllRead, clearAll, refresh,
  } = useNotifications(user);
  const push = useWebPush(user);
  const notifRef = useRef(null);
  const userMenuRef = useRef(null);
  const moreMenuRef = useRef(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hasToolkit, setHasToolkit] = useState(false);
  const [hasTaxToolkit, setHasTaxToolkit] = useState(false);
  const [hasPmToolkit, setHasPmToolkit] = useState(false);

  // Fetch pro_profile when a tradesperson signs in so we can show toolkit pages in nav.
  useEffect(() => {
    if (user?.role !== 'tradesperson') {
      setHasToolkit(false); setHasTaxToolkit(false); setHasPmToolkit(false); return;
    }
    let cancelled = false;
    import('../api/client').then(({ default: api }) => {
      api.get('/api/profile/pro')
        .then((r) => {
          if (cancelled) return;
          setHasToolkit(!!r.data?.has_invoice_toolkit);
          setHasTaxToolkit(!!r.data?.has_tax_toolkit);
          setHasPmToolkit(!!r.data?.has_pm_toolkit);
        })
        .catch(() => { /* noop */ });
    });
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  // Close pop-overs on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
        setLangSubOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  const isActive = (path) => location.pathname === path;

  // Desktop-only horizontal nav. Less-used pro links (My Quotes, My Invoices,
  // Billing) are collapsed under a "More" dropdown in DesktopHeaderMore.jsx so
  // the bar doesn't keep growing as we ship more toolkits.
  const navLinks = user?.role === 'tradesperson'
    ? [
        { to: '/', label: t('nav_home') },
        { to: '/dashboard', label: t('nav_dashboard') },
        ...(hasPmToolkit ? [{ to: '/projects', label: t('nav_projects') }] : []),
      ]
    : [];

  // Customers, Quotes, lead capture, Recurring, the Estimator and the
  // Schedule are routed, working pages that appeared only in MobileNav —
  // which is `md:hidden`. On a laptop they were reachable only by typing the
  // URL, which for six of the product's core screens is the same as not
  // shipping them.
  const moreLinks = user?.role === 'tradesperson'
    ? [
        { to: '/leads/new', label: t('nav_capture_lead') },
        { to: '/customers', label: t('nav_customers') },
        { to: '/quotes', label: t('nav_quotes') },
        { to: '/estimate', label: t('nav_estimate') },
        ...(hasToolkit ? [{ to: '/my-invoices', label: t('nav_my_invoices') }] : []),
        ...(hasTaxToolkit ? [{ to: '/tax', label: t('nav_tax') }] : []),
        { to: '/recurring', label: t('nav_recurring') },
        { to: '/schedule', label: t('nav_schedule') },
        // /pro-calendar is the marketplace booking calendar. Every endpoint
        // it calls — /api/bookings, /api/availability — belongs to a router
        // that is not mounted, so the page loads and does nothing. Unlinked
        // rather than deleted: the route still exists, and the scheduling it
        // was meant to do is now /schedule.
        { to: '/billing', label: t('nav_billing') },
      ]
    : [];

  const currentLang = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-xl bg-cream/90 border-b border-sm-border transition-all duration-300">
      <div className="page-container">
        <div className="flex h-16 items-center justify-between gap-2">
          {/* Logo + brand — visible on BOTH mobile and desktop */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0" data-testid="logo">
            <div className="w-8 h-8 bg-teal rounded-[14px] flex items-center justify-center">
              <Hammer size={16} className="text-paper" strokeWidth={1.5} />
            </div>
            <span className="font-headings font-bold text-base sm:text-lg text-ink whitespace-nowrap">
              Service<span className="text-teal">Market</span>
            </span>
          </Link>

          {/* Desktop inline nav (≥ md) */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center" data-testid="desktop-nav">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2 rounded-full text-sm font-medium transition-colors
                  ${isActive(link.to) ? 'bg-teal/10 text-teal' : 'text-ink-soft hover:text-ink hover:bg-cream-deep'}`}
              >
                {link.label}
              </Link>
            ))}
            {moreLinks.length > 0 && (
              <div className="relative" ref={moreMenuRef}>
                <button
                  onClick={() => setMoreOpen(!moreOpen)}
                  className={`flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium transition-colors
                    ${moreLinks.some((l) => isActive(l.to)) ? 'bg-teal/10 text-teal' : 'text-ink-soft hover:text-ink hover:bg-cream-deep'}`}
                  data-testid="desktop-nav-more"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                >
                  {t('nav_more')} <ChevronDown size={12} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                </button>
                {moreOpen && (
                  <div className="absolute right-0 top-full mt-1 min-w-[160px] bg-paper border border-sm-border rounded-[12px] shadow-lg py-1.5 z-50">
                    {moreLinks.map((l) => (
                      <Link
                        key={l.to}
                        to={l.to}
                        onClick={() => setMoreOpen(false)}
                        className={`block px-3 py-2 text-sm transition-colors
                          ${isActive(l.to) ? 'bg-teal/10 text-teal' : 'text-ink-soft hover:bg-cream-deep'}`}
                        data-testid={`desktop-more-link-${l.to.replace(/\//g, '')}`}
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Right side: bell + avatar only */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {user && (
              <>
                {/* Notification bell */}
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) refresh(); }}
                    className="relative p-2 rounded-full hover:bg-cream-deep transition-colors"
                    data-testid="notification-bell"
                    aria-label="notifications"
                  >
                    <Bell size={20} className="text-ink-soft" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-red-warn text-paper text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="fixed top-[4.5rem] left-2 right-2 sm:absolute sm:top-full sm:mt-2 sm:left-auto sm:right-0 sm:w-80 bg-paper border border-sm-border rounded-[18px] shadow-xl overflow-hidden animate-fade-in" data-testid="notification-panel">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-sm-border">
                        <span className="font-headings font-bold text-ink text-sm">{t('notif_panel_title')}</span>
                        <div className="flex items-center gap-3">
                          {unreadCount > 0 && (
                            <button onClick={markAllRead} className="text-xs text-teal hover:underline" data-testid="notif-mark-all-read">
                              {t('notif_mark_all_read')}
                            </button>
                          )}
                          {notifications.length > 0 && (
                            <button onClick={clearAll} className="text-xs text-red-warn hover:underline" data-testid="notif-clear-all">
                              {t('notif_clear_all')}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="px-4 py-2 border-b border-sm-border bg-cream-soft">
                        {permission === 'granted' ? (
                          <span className="text-xs text-green-pos flex items-center gap-1.5">
                            <BellRing size={12} /> {t('notif_browser_enabled')}
                          </span>
                        ) : permission === 'denied' ? (
                          <span className="text-xs text-ink-muted flex items-center gap-1.5">
                            <BellOff size={12} /> {t('notif_browser_denied')}
                          </span>
                        ) : (
                          <button
                            onClick={requestPermission}
                            className="text-xs text-teal font-medium flex items-center gap-1.5 hover:underline"
                            data-testid="enable-browser-notif"
                          >
                            <BellRing size={12} /> {t('notif_browser_enable')}
                          </button>
                        )}
                      </div>
                      {user.role === 'tradesperson' && push.supported && (
                        <div className="px-4 py-2.5 border-b border-sm-border bg-amber/5 flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-amber-deep flex items-center gap-1.5">
                              <Zap size={11} /> {t('push_instant_alerts')}
                              {!isPremiumTier(user.plan_tier) && (
                                <span className="ml-1 inline-flex items-center px-1.5 py-[1px] rounded-full bg-amber text-paper text-[9px] font-bold uppercase tracking-wide">
                                  Pro
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-ink-muted truncate">
                              {isPremiumTier(user.plan_tier)
                                ? t('push_instant_alerts_help')
                                : t('push_instant_alerts_pro_locked')}
                            </p>
                          </div>
                          {!isPremiumTier(user.plan_tier) ? (
                            <Link
                              to="/billing"
                              onClick={() => setNotifOpen(false)}
                              className="text-[11px] text-paper font-medium px-2.5 py-1 rounded-full bg-amber hover:bg-amber-deep transition-colors whitespace-nowrap flex-shrink-0"
                              data-testid="push-upgrade-cta"
                            >
                              {t('btn_upgrade')}
                            </Link>
                          ) : push.enabled ? (
                            <button
                              onClick={push.unsubscribe}
                              disabled={push.busy}
                              className="text-[11px] text-ink-soft font-medium px-2 py-1 rounded-full border border-sm-border hover:bg-cream-soft transition-colors"
                              data-testid="push-disable"
                            >
                              {t('push_disable')}
                            </button>
                          ) : (
                            <button
                              onClick={push.subscribe}
                              disabled={push.busy}
                              className="text-[11px] text-paper font-medium px-2.5 py-1 rounded-full bg-amber hover:bg-amber-deep transition-colors"
                              data-testid="push-enable"
                            >
                              {t('push_enable')}
                            </button>
                          )}
                        </div>
                      )}
                      <div className="max-h-72 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="text-center py-6 text-ink-muted text-sm">{t('notif_none')}</p>
                        ) : notifications.slice(0, 10).map(n => (
                          <div
                            key={n.id}
                            onClick={() => {
                              if (!n.is_read) markOneRead(n.id);
                              setNotifOpen(false);
                              navigate(n.link_to || '/dashboard');
                            }}
                            className={`px-4 py-3 border-b border-sm-border cursor-pointer hover:bg-cream-soft transition-colors
                              ${!n.is_read ? 'bg-teal/5' : ''}`}
                          >
                            <p className={`text-sm ${!n.is_read ? 'font-semibold text-ink' : 'text-ink-soft'}`}>{n.title}</p>
                            <p className="text-xs text-ink-muted mt-0.5">{n.body}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* User menu (avatar) — language now lives inside this dropdown */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => { setUserMenuOpen(!userMenuOpen); setLangSubOpen(false); }}
                    className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-sm-border bg-paper hover:bg-cream-soft transition-colors"
                    data-testid="user-menu-button"
                    aria-label="user menu"
                  >
                    <div className="w-7 h-7 bg-teal/10 rounded-full flex items-center justify-center">
                      <span className="text-teal text-xs font-bold">{user.name?.[0]?.toUpperCase()}</span>
                    </div>
                    <ChevronDown size={12} className="text-ink-muted" />
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-paper border border-sm-border rounded-[14px] shadow-lg overflow-hidden animate-fade-in" data-testid="user-dropdown">
                      {/* Identity row */}
                      <div className="px-4 py-3 border-b border-sm-border">
                        <p className="text-sm font-bold text-ink truncate">{user.name}</p>
                        <p className="text-[11px] text-ink-muted truncate">{user.email}</p>
                        <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider bg-cream-deep text-ink-soft px-2 py-0.5 rounded-full">
                          {user.role}
                        </span>
                      </div>

                      {user.role === 'admin' && (
                        <Link to="/admin" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-cream-soft">
                          <LayoutDashboard size={14} /> Admin Panel
                        </Link>
                      )}
                      <Link to="/settings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-cream-soft" data-testid="user-menu-settings">
                        <Settings size={14} /> {t('nav_settings')}
                      </Link>
                      <Link to="/feedback" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-cream-soft" data-testid="user-menu-feedback">
                        <MessageSquare size={14} /> {t('nav_feedback') || 'Feedback & support'}
                      </Link>

                      {/* Language submenu */}
                      <button
                        onClick={() => setLangSubOpen((o) => !o)}
                        className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-ink hover:bg-cream-soft transition-colors"
                        data-testid="user-menu-language"
                      >
                        <span className="flex items-center gap-2">
                          <Globe size={14} /> {t('lang_label') || 'Language'}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-ink-muted">
                          {currentLang.label}
                          <ChevronDown size={12} className={`transition-transform ${langSubOpen ? 'rotate-180' : ''}`} />
                        </span>
                      </button>
                      {langSubOpen && (
                        <div className="bg-cream-soft border-t border-sm-border" data-testid="user-menu-language-submenu">
                          {LANGUAGES.map((l) => (
                            <button
                              key={l.code}
                              onClick={() => { changeLang(l.code); setLangSubOpen(false); setUserMenuOpen(false); }}
                              className={`flex items-center justify-between w-full px-6 py-2 text-sm transition-colors hover:bg-paper
                                ${lang === l.code ? 'text-teal font-semibold' : 'text-ink'}`}
                              data-testid={`lang-${l.code}`}
                            >
                              <span>{l.name}</span>
                              {lang === l.code && <Check size={12} />}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="border-t border-sm-border" />
                      <button onClick={handleLogout} className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-red-warn hover:bg-red-50 transition-colors" data-testid="sign-out-btn">
                        <LogOut size={14} /> {t('nav_sign_out')}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
