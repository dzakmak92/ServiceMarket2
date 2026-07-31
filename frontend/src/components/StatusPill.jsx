import React from 'react';
import { useLang } from '../contexts/LangContext';

/**
 * A status badge, in the reader's language.
 *
 * The label map was English-only and keyed on `open|pending|declined` — a
 * vocabulary from the marketplace's job board. The quote statuses it is
 * actually handed are `draft|sent|viewed|negotiating|accepted|rejected|
 * expired|superseded`, so it fell through to `|| status` and printed the raw
 * enum value in capitals: a German dashboard showing VIEWED and ACCEPTED.
 */
const STATUS_CLASSES = {
  draft: 'status-pending',
  sent: 'status-pending',
  viewed: 'status-in_progress',
  negotiating: 'status-in_progress',
  accepted: 'status-accepted',
  rejected: 'status-declined',
  expired: 'status-cancelled',
  superseded: 'status-cancelled',
  // Job statuses, for the same pill used on a job.
  lead: 'status-pending',
  quoted: 'status-in_progress',
  scheduled: 'status-in_progress',
  in_progress: 'status-in_progress',
  completed: 'status-completed',
  invoiced: 'status-completed',
  closed: 'status-completed',
  cancelled: 'status-cancelled',
};

// Which translation namespace a value belongs to. Quote statuses win because
// this pill is used on quotes far more often, and the two sets overlap only
// on `cancelled`, which reads the same either way.
const KEYS = {
  draft: 'quote_status_draft', sent: 'quote_status_sent', viewed: 'quote_status_viewed',
  negotiating: 'quote_status_negotiating', accepted: 'quote_status_accepted',
  rejected: 'quote_status_rejected', expired: 'quote_status_expired',
  superseded: 'quote_status_superseded',
  lead: 'pm_status_lead', quoted: 'pm_status_quoted', scheduled: 'pm_status_scheduled',
  in_progress: 'pm_status_in_progress', completed: 'pm_status_completed',
  invoiced: 'pm_status_invoiced', closed: 'pm_status_closed',
  cancelled: 'pm_status_cancelled',
};

export default function StatusPill({ status, className = '' }) {
  const { t } = useLang();
  const cls = STATUS_CLASSES[status] || 'status-pending';
  const key = KEYS[status];
  // t() returns the key when a translation is missing, which would be worse
  // than the raw status — so fall back to the status itself.
  const label = key ? (t(key) === key ? status : t(key)) : status;
  return <span className={`${cls} ${className}`}>{label}</span>;
}
