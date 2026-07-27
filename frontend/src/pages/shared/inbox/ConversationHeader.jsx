import React from 'react';
import { Eye, XCircle } from 'lucide-react';
import ClickToInvoiceLink from '../../../components/ClickToInvoiceLink';
import ReportProblemButton from '../../../components/ReportProblemButton';

/**
 * Top of an active conversation: back-arrow (mobile), avatar, name + job status,
 * View-profile button (pro threads only).
 *
 * Props:
 *  - otherUser, activeThread, job, t
 *  - onBack: mobile back-button click
 *  - onViewProfile: opens the pro's public page
 *  - userRole, hasToolkit: drives the Click-to-Invoice button (pro side only)
 *  - myQuoteStatus: 'pending' | 'accepted' | 'declined' | 'lost' — drives the
 *    "Mark as lost" button visibility (pro side only)
 *  - onMarkLost(): handler when the pro clicks "Mark as Lost"
 */
export default function ConversationHeader({ otherUser, activeThread, job, t, onBack, onViewProfile, userRole, hasToolkit, myQuoteStatus, onMarkLost }) {
  const canMarkLost = userRole === 'tradesperson'
    && myQuoteStatus && !['accepted', 'lost'].includes(myQuoteStatus)
    && job?.status !== 'completed';
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-sm-border bg-paper flex-shrink-0 min-w-0" data-testid="conversation-header">
      <button onClick={onBack} className="md:hidden p-1 text-ink-muted hover:text-ink flex-shrink-0" aria-label="back" data-testid="conversation-back">
        ←
      </button>
      <div className="w-7 h-7 bg-cream-deep rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-ink font-bold text-xs">{(otherUser?.name || '?')[0]?.toUpperCase()}</span>
      </div>
      {/* Name + job title + status — all in one compact block */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="font-semibold text-ink text-sm truncate leading-tight">{otherUser?.name || activeThread.other_name}</p>
          {otherUser?.role === 'tradesperson' && <span className="pro-badge flex-shrink-0">PRO</span>}
          {job && (
            <span className={`text-[9px] uppercase font-bold tracking-wide px-1.5 py-0.5 rounded flex-shrink-0
              ${job.status === 'completed' ? 'bg-teal/15 text-teal'
                : job.status === 'in_progress' ? 'bg-amber/15 text-amber-deep'
                : 'bg-cream-deep text-ink-soft'}`}>
              {job.status === 'completed' ? t('status_completed')
                : job.status === 'in_progress' ? t('status_in_progress')
                : t('status_open')}
            </span>
          )}
          {myQuoteStatus === 'lost' && (
            <span className="text-[9px] uppercase font-bold tracking-wide px-1.5 py-0.5 rounded bg-red-warn/15 text-red-warn flex-shrink-0" data-testid="header-lost-pill">
              {t('inbox_thread_lost')}
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink-muted truncate leading-tight">{job?.title || activeThread.job_title}</p>
      </div>
      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {userRole === 'tradesperson' && job?.id && (job.status === 'in_progress' || job.status === 'completed') && (
          <ClickToInvoiceLink
            jobId={job.id}
            jobStatus={job.status}
            hasToolkit={hasToolkit}
            t={t}
            testIdPrefix={`inbox-cti-${job.id}`}
          />
        )}
        {canMarkLost && (
          <button
            onClick={onMarkLost}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-red-warn/40 bg-red-warn/10 text-red-warn text-[10px] hover:bg-red-warn/15 transition-colors"
            title={t('my_quotes_mark_lost_hint')}
            data-testid="header-mark-lost"
          >
            <XCircle size={11} /> {t('my_quotes_mark_lost')}
          </button>
        )}
        {userRole === 'tradesperson' && job?.id && (
          <ReportProblemButton
            jobId={job.id}
            jobTitle={job.title || activeThread.job_title}
            variant="icon"
            testidPrefix="inbox-report-problem"
          />
        )}
        {otherUser?.role === 'tradesperson' && (
          <button
            onClick={onViewProfile}
            className="inline-flex items-center justify-center rounded-full border border-sm-border bg-paper text-ink-muted w-7 h-7 hover:bg-cream-soft transition-colors"
            data-testid="header-view-profile"
            title={t('btn_view_profile')}
            aria-label={t('btn_view_profile')}
          >
            <Eye size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
