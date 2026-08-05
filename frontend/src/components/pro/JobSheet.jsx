import React from 'react';
import { Link } from 'react-router-dom';
import {
  Check, ExternalLink, MapPin, Navigation, Phone, Play, Receipt, User, X,
} from 'lucide-react';
import { MIN, durationLabel, hhmm, toMs } from '../../utils/schedule';
import { telHref } from '../../utils/sms';

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
  if (!appt) return null;
  const phone = telHref(appt.customer_phone);
  const action = primaryAction(appt.status);
  const address = [appt.site_address || appt.customer_address,
                   appt.site_city || appt.customer_city].filter(Boolean).join(', ');
  const mins = (toMs(appt.end) - toMs(appt.start)) / MIN;
  const urgent = appt.urgency === 'emergency';

  return (
    <div className="fixed inset-0 z-[210] bg-black/40 flex items-end" onClick={onClose}
         data-testid="job-sheet">
      <div className="w-full bg-paper rounded-t-[20px] p-5 shadow-2xl max-h-[88vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-[13px] text-teal">
              {hhmm(appt.start)} – {hhmm(appt.end)}
              <span className="font-bold text-ink-muted"> · {durationLabel(mins * MIN)}</span>
            </p>
            <p className="font-headings font-bold text-[16px] text-ink mt-0.5 leading-tight"
               data-testid="job-sheet-title">
              {appt.title}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-ink-muted flex-none"
                  aria-label={t('ui_close')}>
            <X size={18} />
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
            href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`}
            target="_blank" rel="noreferrer"
            className={`flex-1 min-h-[46px] rounded-[12px] border border-sm-border bg-paper
                        flex items-center justify-center gap-1.5 font-bold text-[12px] text-teal
                        ${address ? '' : 'opacity-40 pointer-events-none'}`}
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
