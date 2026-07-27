import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../api/client';
import MonthBookingCalendar from '../../../components/MonthBookingCalendar';
import { ChevronDown, ChevronUp, Calendar, Image as ImageIcon, CalendarDays, CheckCircle2, XCircle } from 'lucide-react';

const LS_KEY = 'sm_inbox_top_panel_expanded';
const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Combined top-area panel: booking calendar (left) + job context (right).
 * Now collapsible — preference persists across the session in localStorage.
 *
 * Default: expanded on desktop (≥ lg), collapsed on small screens so the
 * message thread is reachable without scrolling.
 *
 * Props:
 *  - activeThread, job, userRole, avail, proBookings, scheduleDisabled
 *  - onBook(weekday, slot, dateObj)
 *  - t: translator
 */
export default function ConversationTopPanel({
  activeThread, job, userRole, avail, proBookings, scheduleDisabled, onBook, t,
}) {
  const [expanded, setExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    } catch { /* noop */ }
    return typeof window !== 'undefined' && window.innerWidth >= 1024;
  });
  const navigate = useNavigate();
  const [respondingId, setRespondingId] = useState(null);
  const [localBookings, setLocalBookings] = useState(proBookings || []);

  useEffect(() => { setLocalBookings(proBookings || []); }, [proBookings]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, expanded ? 'true' : 'false');
    } catch { /* noop */ }
  }, [expanded]);

  const pendingReschedules = localBookings.filter(
    b => b.reschedule_status === 'pending' && userRole === 'homeowner'
  );

  const respondReschedule = async (bookingId, accept) => {
    setRespondingId(bookingId);
    try {
      const endpoint = accept ? 'accept-reschedule' : 'reject-reschedule';
      await api.patch(`/api/bookings/${bookingId}/${endpoint}`);
      setLocalBookings(prev => prev.map(b =>
        b.id === bookingId
          ? accept
            ? { ...b, date: b.proposed_date, slot: b.proposed_slot, reschedule_status: 'accepted' }
            : { ...b, reschedule_status: 'rejected' }
          : b
      ));
    } catch { /* noop */ } finally { setRespondingId(null); }
  };

  const hasCalendar = !!activeThread.other_pro_id;
  const imageCount = (job?.attachments || []).filter((a) => (a.content_type || '').startsWith('image/')).length;

  if (!hasCalendar && !job) return null;

  return (
    <div className="border-b border-sm-border bg-[#E8F1F5] flex-shrink-0 min-w-0 overflow-x-hidden" data-testid="conversation-top-panel">
      {/* Collapsible header bar */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#dce8ee] transition-colors text-left"
        data-testid="top-panel-toggle"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 text-xs text-ink-soft flex-1 min-w-0">
          {hasCalendar && userRole === 'homeowner' && (
              <span className="flex items-center gap-1.5">
                <Calendar size={12} className="text-teal" />
                {t('booking_panel_title')}
              </span>
            )}
          {job?.job_number && (
            <span className="text-[10px] font-mono font-bold text-teal bg-teal/20 px-1.5 py-0.5 rounded">
              {job.job_number}
            </span>
          )}
          {imageCount > 0 && (
            <span className="flex items-center gap-1.5 text-ink-muted">
              <ImageIcon size={12} />
              <span className="text-[10px]">({imageCount} {imageCount === 1 ? 'photo' : 'photos'})</span>
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[11px] text-ink-muted flex-shrink-0">
          {expanded ? <>Hide <ChevronUp size={12} /></> : <>Show <ChevronDown size={12} /></>}
        </span>
      </button>

      {/* Pending reschedule proposals — HO confirmation banner */}
      {pendingReschedules.map(b => (
        <div key={b.id} className="mx-4 mt-1.5 mb-1 p-3 rounded-[12px] bg-purple-50 border border-purple-200 flex items-start gap-3" data-testid="reschedule-banner">
          <CalendarDays size={14} className="text-purple-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-purple-700">Reschedule request</p>
            <p className="text-[10px] text-purple-600 mt-0.5">
              Pro wants to reschedule <span className="font-semibold">{b.job_title || 'appointment'}</span> to{' '}
              <span className="font-semibold">{b.proposed_date} · {b.proposed_slot}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => respondReschedule(b.id, true)}
              disabled={!!respondingId}
              className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-[8px] bg-green-pos text-paper font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              data-testid="accept-reschedule-btn"
            >
              <CheckCircle2 size={11} /> Accept
            </button>
            <button
              onClick={() => respondReschedule(b.id, false)}
              disabled={!!respondingId}
              className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-[8px] bg-red-warn/80 text-paper font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              data-testid="reject-reschedule-btn"
            >
              <XCircle size={11} /> Decline
            </button>
          </div>
        </div>
      ))}

      {expanded && (
        <div className="px-4 pb-3 pt-1">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {hasCalendar ? (
              <div>
                <MonthBookingCalendar
                  availability={avail}
                  bookings={proBookings}
                  onConfirm={userRole === 'homeowner' ? onBook : undefined}
                  disabled={scheduleDisabled}
                  readOnly={userRole !== 'homeowner'}
                />
                {/* Go to My Calendar — visible only to pros */}
                {userRole === 'tradesperson' && (
                  <button
                    onClick={() => navigate('/pro-calendar')}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-teal font-semibold
                      border border-teal/40 rounded-[10px] py-2 hover:bg-teal/10 transition-colors"
                    data-testid="go-to-pro-calendar-btn"
                  >
                    <CalendarDays size={12} /> {t('nav_pro_calendar') || 'My Calendar'}
                  </button>
                )}
              </div>
            ) : <div />}
            <JobImagesPanel job={job} t={t} />
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Job context (title + description + image grid)
// ──────────────────────────────────────────────
function JobImagesPanel({ job, t }) {
  const all = job?.attachments || [];
  const images = all.filter((a) => (a.content_type || '').startsWith('image/')).slice(0, 10);
  return (
    <div className="bg-paper border border-sm-border rounded-[14px] p-2.5 min-w-0 flex flex-col" data-testid="job-images-panel">
      {job && (
        <div className="mb-2">
          {job.title && (
            <p className="text-[11px] font-bold text-ink truncate" data-testid="job-panel-title" title={job.title}>
              {job.title}
            </p>
          )}
          {job.description && (
            <p className="text-[10px] text-ink-soft mt-0.5 line-clamp-3 whitespace-pre-wrap leading-snug" data-testid="job-panel-description">
              {job.description}
            </p>
          )}
        </div>
      )}
      <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wide mb-1 flex items-center gap-1">
        <span>{t('inbox_job_photos')}</span>
        {images.length > 0 && <span className="font-normal text-ink-muted">({images.length})</span>}
      </p>
      {images.length === 0 ? (
        <p className="text-[10px] text-ink-muted text-center py-3">{t('inbox_no_job_photos')}</p>
      ) : (
        <div className="grid grid-cols-5 gap-1">
          {images.map((a) => {
            const href = (a.url || '').startsWith('http') ? a.url : `${backendUrl}${a.url}`;
            return (
              <a
                key={a.file_id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square rounded-md overflow-hidden border border-sm-border hover:opacity-90 transition-opacity"
                title={a.name}
                data-testid={`job-image-${a.file_id}`}
              >
                <img src={href} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
