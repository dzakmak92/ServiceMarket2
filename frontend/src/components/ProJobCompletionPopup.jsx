import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../contexts/LangContext';
import api from '../api/client';
import { Bell, FileText, X } from 'lucide-react';

const STORAGE_KEY = (uid) => `pro_job_completed_dismissed_${uid}`;

/**
 * Login-time nudge for pros when homeowner has marked one or more jobs complete.
 * Encourages them to create an invoice via the Invoice Toolkit.
 *
 * Behaviour:
 *  - Only renders for role='tradesperson'
 *  - Shows ONCE per session per user (sessionStorage)
 *  - Checks for unread notifications of type='job_completed'
 *  - "Create Invoice" marks notifications read + navigates to /my-invoices
 *  - "Remind me later" dismisses for the session only
 */
export default function ProJobCompletionPopup({ user }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [notifIds, setNotifIds] = useState([]);

  useEffect(() => {
    if (!user || user.role !== 'tradesperson') return;
    const uid = user.id || user._id;
    if (sessionStorage.getItem(STORAGE_KEY(uid))) return;

    const p = typeof window !== 'undefined' ? window.location.pathname : '';
    if (p.startsWith('/admin') || p.startsWith('/auth')) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/api/notifications');
        const completed = (data.notifications || []).filter(
          (n) => n.type === 'job_completed' && !n.is_read
        );
        if (!cancelled && completed.length > 0) {
          setCount(completed.length);
          setNotifIds(completed.map((n) => n.id));
          setOpen(true);
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!open) return null;

  const markRead = async () => {
    for (const nid of notifIds) {
      try { await api.patch(`/api/notifications/${nid}/read`); } catch { /* noop */ }
    }
  };

  const dismiss = () => {
    const uid = user.id || user._id;
    sessionStorage.setItem(STORAGE_KEY(uid), '1');
    setOpen(false);
  };

  const goToInvoices = async () => {
    await markRead();
    dismiss();
    navigate('/my-invoices');
  };

  const sSuffix = count === 1 ? '' : 's';

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      data-testid="pro-job-completed-popup"
    >
      <div className="bg-paper rounded-[14px] shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-sm-border flex items-center gap-2">
          <Bell size={18} className="text-teal" />
          <h3 className="font-headings font-bold text-ink text-lg flex-1">
            {t('pro_job_completed_title')}
          </h3>
          <button onClick={dismiss} className="p-1 text-ink-muted hover:text-ink" aria-label="close">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm text-ink-soft" data-testid="pro-job-completed-body">
            {(t('pro_job_completed_body') || '').replace('{n}', count).replace('{s}', sSuffix)}
          </p>
        </div>
        <div className="px-5 py-4 border-t border-sm-border flex items-center justify-end gap-2">
          <button
            onClick={dismiss}
            className="btn-ghost text-xs"
            data-testid="pro-job-completed-dismiss"
          >
            {t('pro_job_completed_later')}
          </button>
          <button
            onClick={goToInvoices}
            className="btn-primary text-xs flex items-center gap-1.5"
            data-testid="pro-job-completed-cta"
          >
            <FileText size={12} /> {t('pro_job_completed_cta')}
          </button>
        </div>
      </div>
    </div>
  );
}
