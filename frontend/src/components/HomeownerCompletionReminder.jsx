import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../contexts/LangContext';
import api from '../api/client';
import { Bell, CheckCircle2, X } from 'lucide-react';

const STORAGE_KEY = (uid) => `ho_completion_reminder_dismissed_${uid}`;

/**
 * Login-time nudge for homeowners who have accepted quotes on jobs still in
 * status='in_progress'. Encourages them to mark the job complete so the pro
 * can issue the invoice via Click-to-Invoice.
 *
 * Behaviour:
 *  - Only renders for role='homeowner'
 *  - Shows ONCE per session per user (sessionStorage), and only after the API
 *    confirms there's actually something to nudge them about (0 in-progress
 *    accepted quotes ⇒ silent)
 *  - "Later" sets the dismissed flag for the session
 *  - "Review" navigates to /dashboard?tab=active
 */
export default function HomeownerCompletionReminder({ user }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || user.role !== 'homeowner') return;
    // Skip if dismissed this session
    if (sessionStorage.getItem(STORAGE_KEY(user.id))) return;
    // Skip on routes where the modal would block primary UX (feedback form, etc.)
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      if (p.startsWith('/feedback') || p.startsWith('/admin') || p.startsWith('/auth')) return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/api/jobs?status=in_progress');
        const n = data.total ?? (data.jobs || []).length;   // use real total, not paginated slice
        if (!cancelled && n > 0) {
          setCount(n);
          setOpen(true);
        }
      } catch {
        /* noop */
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!open) return null;

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY(user.id), '1');
    setOpen(false);
  };

  const review = () => {
    sessionStorage.setItem(STORAGE_KEY(user.id), '1');
    setOpen(false);
    navigate('/dashboard?tab=active');
  };

  const sSuffix = count === 1 ? '' : 's';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" data-testid="ho-completion-reminder">
      <div className="bg-paper rounded-[14px] shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-sm-border flex items-center gap-2">
          <Bell size={18} className="text-amber" />
          <h3 className="font-headings font-bold text-ink text-lg flex-1">{t('ho_remind_title')}</h3>
          <button onClick={dismiss} className="p-1 text-ink-muted hover:text-ink" aria-label="close">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm text-ink-soft" data-testid="ho-completion-reminder-body">
            {t('ho_remind_body').replace('{n}', count).replace('{s}', sSuffix)}
          </p>
        </div>
        <div className="px-5 py-4 border-t border-sm-border flex items-center justify-end gap-2">
          <button onClick={dismiss} className="btn-ghost text-xs">
            {t('ho_remind_later')}
          </button>
          <button onClick={review} className="btn-primary text-xs" data-testid="ho-completion-reminder-cta">
            <CheckCircle2 size={12} /> {t('ho_remind_view')}
          </button>
        </div>
      </div>
    </div>
  );
}
