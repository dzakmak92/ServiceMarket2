import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLang } from '../../contexts/LangContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/client';
import {
  Shield, Hammer, ChevronDown, LogOut, Globe, Check, Bell,
} from 'lucide-react';

import AdminOverview from './tabs/AdminOverview';
import AdminVerifications from './tabs/AdminVerifications';
import AdminUsers from './tabs/AdminUsers';
import AdminJobs from './tabs/AdminJobs';
import AdminBilling from './tabs/AdminBilling';
import AdminInvoicing from './tabs/AdminInvoicing';
import AdminFees from './tabs/AdminFees';
import AdminFeedback from './tabs/AdminFeedback';
import AdminSupport from './tabs/AdminSupport';
import AdminToolkits from './tabs/AdminToolkits';
import AdminPayNow from './tabs/AdminPayNow';
import AdminProjects from './tabs/AdminProjects';
import AdminInsights from './tabs/AdminInsights';
import AdminHeatmap from './tabs/AdminHeatmap';
import AdminPayouts from './tabs/AdminPayouts';
import ScrollSnapTabStrip from '../../components/ScrollSnapTabStrip';

const TAB_KEYS = ['overview', 'heatmap', 'verifications', 'users', 'jobs', 'projects', 'billing', 'payouts', 'invoicing', 'fees', 'feedback', 'insights', 'support', 'toolkits', 'paynow'];
const TAB_LABELS = {
  overview: 'admin_overview',
  heatmap: 'admin_heatmap',
  verifications: 'admin_verifications',
  users: 'admin_users',
  jobs: 'admin_jobs',
  projects: 'admin_projects',
  billing: 'admin_billing',
  payouts: 'admin_payouts',
  invoicing: 'admin_invoicing',
  fees: 'admin_fees',
  feedback: 'admin_feedback',
  insights: 'admin_insights_tab',
  support: 'admin_support',
  toolkits: 'admin_toolkits',
  paynow: 'admin_paynow',
};

const LANGS = [
  { code: 'en', name: 'EN' },
  { code: 'de', name: 'DE' },
  { code: 'tr', name: 'TR' },
  { code: 'es', name: 'ES' },
];

export default function AdminPage() {
  const { user, logout } = useAuth();
  const { t, lang, changeLang } = useLang();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [notice, setNotice] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [adminNotifs, setAdminNotifs] = useState([]);
  const menuRef = useRef(null);
  const bellRef = useRef(null);
  const flashTimer = useRef(null);

  // Fetch admin-targeted notifications (issues, feedback, reported reviews)
  const fetchAdminNotifs = useCallback(async () => {
    try {
      const { data } = await api.get('/api/notifications');
      const relevant = (data.notifications || []).filter(
        (n) => ['new_issue', 'new_feedback', 'review_reported', 'new_report'].includes(n.type)
      );
      setAdminNotifs(relevant);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { fetchAdminNotifs(); }, [fetchAdminNotifs]);

  const unreadAdminCount = adminNotifs.filter((n) => !n.is_read).length;

  const handleBellNotifClick = async (notif) => {
    try { await api.patch(`/api/notifications/${notif.id}/read`); } catch { /* noop */ }
    setBellOpen(false);
    // Navigate to the right tab
    if (notif.link_to?.includes('feedback')) setTab('feedback');
    else if (notif.link_to?.includes('support')) setTab('support');
    else setTab('feedback');
    fetchAdminNotifs();
  };

  const flash = useCallback((msg) => {
    setNotice(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  return (
    <div className="admin-shell min-h-screen bg-cream">
      {/* Admin sticky header */}
      <header className="admin-header" data-testid="admin-header">
        <div className="admin-header-inner">
          <Link to="/admin" className="flex items-center gap-2 hover:opacity-90">
            <span className="admin-logo-mark"><Hammer size={18} strokeWidth={1.5} /></span>
            <span className="hidden sm:inline font-headings font-bold text-ink text-lg">ServiceMarket</span>
            <span className="admin-badge">{t('admin')}</span>
          </Link>
          <div className="flex items-center gap-2" ref={menuRef}>
            {/* Admin notification bell */}
            <div className="relative" ref={bellRef}>
              <button
                className="admin-icon-btn admin-icon-btn-dark relative"
                onClick={() => setBellOpen((o) => !o)}
                aria-label="Notifications"
                data-testid="admin-bell-btn"
              >
                <Bell size={16} />
                {unreadAdminCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-warn text-paper text-[9px] font-bold flex items-center justify-center" data-testid="admin-bell-count">
                    {unreadAdminCount > 9 ? '9+' : unreadAdminCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-paper rounded-[16px] shadow-2xl border border-sm-border z-50 overflow-hidden" data-testid="admin-bell-dropdown">
                  <div className="px-4 py-3 border-b border-sm-border flex items-center justify-between">
                    <span className="font-semibold text-ink text-sm">Platform Alerts</span>
                    <button onClick={() => setBellOpen(false)} className="text-ink-muted hover:text-ink text-xs">✕</button>
                  </div>
                  {adminNotifs.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-ink-muted">No new alerts</div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-sm-border">
                      {adminNotifs.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleBellNotifClick(n)}
                          className={`w-full px-4 py-3 text-left hover:bg-cream-soft transition-colors ${!n.is_read ? 'bg-amber/5' : ''}`}
                          data-testid={`admin-notif-${n.id}`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.is_read && <span className="w-2 h-2 rounded-full bg-red-warn mt-1.5 flex-shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-ink truncate">{n.title}</p>
                              <p className="text-[11px] text-ink-muted mt-0.5 line-clamp-2">{n.body}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button className="admin-icon-btn admin-icon-btn-dark" aria-label="security">
              <Shield size={16} />
            </button>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="admin-user-chip relative"
              data-testid="admin-user-chip"
            >
              <div className="w-7 h-7 rounded-full bg-cream-deep flex items-center justify-center text-xs font-bold text-ink">
                {(user?.name || 'A')[0]?.toUpperCase()}
              </div>
              <span className="hidden sm:inline text-xs font-medium text-ink-soft">{user?.name || 'Admin'}</span>
              <ChevronDown size={12} className="text-ink-muted" />
            </button>
            {menuOpen && (
              <div className="absolute right-4 top-12 w-56 bg-paper border border-sm-border rounded-[14px] shadow-xl overflow-hidden z-40 animate-fade-in" data-testid="admin-user-menu">
                <div className="px-4 py-3 border-b border-sm-border">
                  <p className="text-sm font-semibold text-ink truncate">{user?.name || 'Admin'}</p>
                  <p className="text-xs text-ink-muted truncate">{user?.email}</p>
                </div>
                <div className="px-3 py-2 border-b border-sm-border">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-ink-muted mb-1.5">
                    <Globe size={10} /> {t('change_language')}
                  </p>
                  <div className="flex gap-1">
                    {LANGS.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => changeLang(l.code)}
                        className={`flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-semibold transition-colors
                          ${lang === l.code ? 'bg-teal text-paper' : 'bg-cream-soft text-ink-soft hover:bg-cream-deep'}`}
                        data-testid={`admin-lang-${l.code}`}
                      >
                        {lang === l.code && <Check size={10} />}
                        {l.name}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-warn hover:bg-red-50 transition-colors"
                  data-testid="admin-sign-out"
                >
                  <LogOut size={14} /> {t('nav_sign_out')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="admin-container">
        {/* Section header */}
        <div className="admin-sec-head">
          <div>
            <h1 className="admin-sec-title">{t('admin_panel')}</h1>
            <p className="admin-sec-sub">{t('admin_subtitle')}</p>
          </div>
        </div>

        {/* Tabs — horizontally scrollable on mobile with scroll-snap auto-centering active tab */}
        <ScrollSnapTabStrip
          tabs={TAB_KEYS.map((key) => ({ key, label: t(TAB_LABELS[key]) }))}
          activeKey={tab}
          onChange={setTab}
          testidPrefix="admin-tab"
          variant="underline"
        />

        {/* Tab content — swipe-to-change disabled so wide tables scroll/stack freely on mobile */}
        <div className="animate-fade-in mt-4">
          {tab === 'overview' && <AdminOverview flash={flash} />}
          {tab === 'heatmap' && <AdminHeatmap flash={flash} />}
          {tab === 'verifications' && <AdminVerifications flash={flash} />}
          {tab === 'users' && <AdminUsers flash={flash} />}
          {tab === 'jobs' && <AdminJobs flash={flash} />}
          {tab === 'projects' && <AdminProjects flash={flash} />}
          {tab === 'billing' && <AdminBilling flash={flash} />}
          {tab === 'payouts' && <AdminPayouts flash={flash} />}
          {tab === 'invoicing' && <AdminInvoicing flash={flash} />}
          {tab === 'fees' && <AdminFees flash={flash} />}
          {tab === 'feedback' && <AdminFeedback flash={flash} />}
          {tab === 'insights' && <AdminInsights flash={flash} />}
          {tab === 'support' && <AdminSupport flash={flash} />}
          {tab === 'toolkits' && <AdminToolkits flash={flash} />}
          {tab === 'paynow' && <AdminPayNow flash={flash} />}
        </div>
      </div>

      {/* Toast */}
      {notice && (
        <div className="admin-toast" role="status" data-testid="admin-toast">{notice}</div>
      )}
    </div>
  );
}
