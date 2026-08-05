import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, ExternalLink, MapPin, Navigation, Phone, Play, Receipt, User, X,
} from 'lucide-react';
import { MIN, durationLabel, hhmm, toMs } from '../../utils/schedule';
import { telHref } from '../../utils/sms';
import { jobAddress, routeHref } from '../../utils/maps';

/**
 * One appointment, as the job it is.
 *
 * Tapping an appointment used to open /projects/:id — the project dashboard,
 * on its Overview tab, behind a strip of seven tabs for Kanban, Gantt,
 * materials, diary and billing. For a two-hour visit to somebody's bathroom
 * that is the wrong screen: the pro wants the address, the phone number and
 * the next step, and wants them in one tap rather than after picking a tab.
 *
 * So this is the job, and the project page is a link at the bottom for the
 * jobs that really are projects.
 */

/* The same transition table the API enforces, so the sheet never offers a
   move the server will refuse. */
export function primaryAction(status) {
  if (status === 'scheduled' || status === 'accepted') return 'start';
  if (status === 'in_progress') return 'complete';
  if (status === 'completed') return 'invoice';
  return null;
}

const STATUS_KEY = {
  lead: 'job_st_lead', quoted: 'job_st_quoted', accepted: 'job_st_accepted',
  scheduled: 'job_st_scheduled', in_progress: 'job_st_in_progress',
  completed: 'job_st_completed', invoiced: 'job_st_invoiced',
  closed: 'job_st_closed', cancelled: 'job_st_cancelled',
};

export default function JobSheet({ appt, onClose, onPrimary, t }) {
  const panel = useRef(null);
  const closeBtn = useRef(null);

  /* It looked like a modal and behaved like a decorated div: Escape did
     nothing, focus stayed on the calendar button behind the overlay, and Tab
     walked seventeen controls underneath before reaching anything inside. */
  useEffect(() => {
    if (!appt) return undefined;
    closeBtn.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      /* Wrap at both ends, so the sheet is a room rather than a doorway. */
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    /* The page behind a bottom sheet must not scroll: on a phone a gesture
       that starts on the backdrop otherwise drags the calendar around
       underneath the sheet. */
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
    };
  }, [appt, onClose]);

  if (!appt) return null;
  const phone = telHref(appt.customer_phone);
  const action = primaryAction(appt.status);
  const address = jobAddress(appt);
  const route = routeHref(appt);
  /* An appointment with no end is an appointment of unknown length, not a
     zero-minute one. The views map `end: scheduled_end || scheduled_start`,
     so a null end arrived here as "14:00 – 14:00 · 0 min" — a made-up fact
     presented with the same confidence as a real one. */
  const mins = (toMs(appt.end) - toMs(appt.start)) / MIN;
  const openEnded = !(mins > 0);
  /* Spanning midnight, hhmm() prints time-of-day with no date, so a job
     running to Friday read "16:00 – 17:00 · 49 h" — the range contradicting
     the duration beside it. Name the end day when it is not this one. */
  const spansDays = !openEnded
    && new Date(toMs(appt.start)).toDateString() !== new Date(toMs(appt.end)).toDateString();
  const urgent = appt.urgency === 'emergency';

  return (
    <div className="fixed inset-0 z-[210] bg-black/40 flex items-end" onClick={onClose}
         data-testid="job-sheet" role="dialog" aria-modal="true"
         aria-label={appt.title || t('job_sheet_label')}>
      <div ref={panel}
           className="w-full bg-paper rounded-t-[20px] p-5 shadow-2xl max-h-[88vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-[13px] text-teal" data-testid="job-sheet-when">
              {hhmm(appt.start)}
              {!openEnded && <> – {hhmm(appt.end)}</>}
              {spansDays && (
                <span className="font-bold">
                  {' '}({new Date(toMs(appt.end)).toLocaleDateString(undefined,
                    { weekday: 'short', day: 'numeric', month: 'short' })})
                </span>
              )}
              <span className="font-bold text-ink-muted">
                {openEnded ? ` · ${t('job_open_ended')}` : ` · ${durationLabel(mins * MIN)}`}
              </span>
            </p>
            <p className="font-headings font-bold text-[16px] text-ink mt-0.5 leading-tight"
               data-testid="job-sheet-title">
              {appt.title}
            </p>
          </div>
          <button type="button" onClick={onClose} ref={closeBtn}
                  className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center
                             text-ink-muted flex-none"
                  data-testid="job-sheet-close"
                  aria-label={t('ui_close')}>
            <X size={19} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 mb-4">
          {appt.status && (
            <span className="rounded-full bg-cream-deep px-2.5 py-1 font-bold text-[10.5px] text-ink-soft"
                  data-testid="job-sheet-status">
              {t(STATUS_KEY[appt.status] || 'job_st_scheduled')}
            </span>
          )}
          {urgent && (
            <span className="rounded-full bg-red-warn/15 px-2.5 py-1 font-bold text-[10.5px] text-red-warn">
              {t('job_emergency')}
            </span>
          )}
          {appt.job_number && (
            <span className="ml-auto font-bold text-[10.5px] text-ink-faint">#{appt.job_number}</span>
          )}
        </div>

        {(appt.customer_name || address) && (
          <div className="rounded-[12px] border border-sm-border bg-cream-soft p-3 mb-4 space-y-2">
            {appt.customer_name && (
              <p className="flex items-center gap-2 font-bold text-[12.5px] text-ink">
                <User size={14} className="text-ink-muted flex-none" /> {appt.customer_name}
              </p>
            )}
            {address && (
              <p className="flex items-start gap-2 text-[12.5px] text-ink-soft">
                <MapPin size={14} className="text-ink-muted flex-none mt-px" /> {address}
              </p>
            )}
          </div>
        )}

        {/* Route and phone first: on the way to a job they are the only two
            things that matter, and they are one tap rather than two. */}
        <div className="flex gap-2 mb-2.5">
          <a
            href={route || undefined}
            target="_blank" rel="noreferrer"
            className={`flex-1 min-h-[46px] rounded-[12px] border border-sm-border bg-paper
                        flex items-center justify-center gap-1.5 font-bold text-[12px] text-teal
                        ${route ? '' : 'opacity-40 pointer-events-none'}`}
            aria-disabled={!route}
            data-testid="job-sheet-route"
          >
            <Navigation size={14} /> {t('day_route')}
          </a>
          <a
            href={phone ? `tel:${phone}` : undefined}
            className={`flex-1 min-h-[46px] rounded-[12px] border border-sm-border bg-paper
                        flex items-center justify-center gap-1.5 font-bold text-[12px] text-teal
                        ${phone ? '' : 'opacity-40 pointer-events-none'}`}
            data-testid="job-sheet-call"
          >
            <Phone size={14} /> {t('day_call')}
          </a>
        </div>

        {action && (
          <button
            type="button"
            onClick={() => onPrimary?.(appt, action)}
            className={`w-full min-h-[48px] rounded-[12px] font-extrabold text-[13px]
                        flex items-center justify-center gap-2 mb-2.5
              ${action === 'invoice' ? 'bg-amber text-on-amber' : 'bg-teal text-paper'}`}
            data-testid="job-sheet-primary"
          >
            {action === 'start' && <><Play size={14} /> {t('day_start')}</>}
            {action === 'complete' && <><Check size={15} /> {t('day_complete')}</>}
            {action === 'invoice' && <><Receipt size={15} /> {t('day_invoice')}</>}
          </button>
        )}

        {/* The project page still exists, for the jobs that are projects. */}
        <Link
          to={`/projects/${appt.id}`}
          className="w-full min-h-[44px] rounded-[12px] border border-sm-border bg-paper
                     flex items-center justify-center gap-1.5 font-bold text-[12px] text-ink-soft"
          data-testid="job-sheet-open-project"
        >
          <ExternalLink size={13} /> {t('job_open_project')}
        </Link>
      </div>
    </div>
  );
}
