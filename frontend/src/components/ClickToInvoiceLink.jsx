import React from 'react';
import { Link } from 'react-router-dom';
import { Receipt, Lock } from 'lucide-react';

/**
 * Click-to-Invoice link/button used on the pro side (MyQuotes + Inbox job header).
 *
 * Rules per product spec:
 *  - Shown for the pro on any "won" or "completed" job they accepted.
 *  - Active (routes to /jobs/:id/invoice) ONLY when:
 *      1. The pro has the Invoice Toolkit (`hasToolkit`), AND
 *      2. The job is `completed` (homeowner marked it done).
 *  - Otherwise the button is greyed out with a tooltip explaining why:
 *      - if no toolkit → "Get the Invoice Toolkit first"  (links to /billing)
 *      - if job not completed yet → "Available once the homeowner marks the job complete"
 */
export default function ClickToInvoiceLink({ jobId, jobStatus, hasToolkit, t, testIdPrefix = 'click-to-invoice' }) {
  const completed = jobStatus === 'completed';
  const enabled = hasToolkit && completed;

  // Need-toolkit path: send the pro to /billing where they can subscribe
  if (!hasToolkit) {
    return (
      <Link
        to="/billing"
        className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-amber/40 bg-amber/10 text-amber-deep hover:bg-amber/15 transition-colors"
        title={t('cti_get_toolkit_hint')}
        data-testid={`${testIdPrefix}-needs-toolkit`}
      >
        <Lock size={11} /> {t('cti_invoice')}
      </Link>
    );
  }

  // Pro has toolkit but job not completed yet
  if (!completed) {
    return (
      <button
        type="button"
        disabled
        className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-sm-border bg-cream-soft text-ink-muted cursor-not-allowed opacity-70"
        title={t('cti_wait_completed_hint')}
        data-testid={`${testIdPrefix}-locked`}
      >
        <Lock size={11} /> {t('cti_invoice')}
      </button>
    );
  }

  // Active state
  return (
    <Link
      to={`/jobs/${jobId}/invoice`}
      className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-teal text-paper hover:bg-teal-deep transition-colors"
      title={t('cti_create_invoice_hint')}
      data-testid={`${testIdPrefix}-active`}
    >
      <Receipt size={11} /> {t('cti_invoice')}
    </Link>
  );
}
