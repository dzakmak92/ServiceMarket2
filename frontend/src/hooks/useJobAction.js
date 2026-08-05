import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api, { formatError } from '../api/client';

/**
 * Start / Finish / Invoice, in one place.
 *
 * The day view owned this and the week and month views did not. Both of them
 * rendered `<JobSheet>` without an `onPrimary`, and `onPrimary?.(…)` swallowed
 * the tap — so two of the three calendars showed a full-width "Start" button
 * that made no request, gave no error, and left the sheet sitting there. A
 * button that does nothing is worse than no button, because the pro believes
 * the job has started.
 *
 * @param t          the translator
 * @param onChanged  (appt, nextStatus) after the server has agreed. Null as
 *                   the status means "the server refused — your copy of this
 *                   job is stale, refetch."
 */
export default function useJobAction({ t, onChanged }) {
  const navigate = useNavigate();

  return useCallback(async (appt, action) => {
    if (!appt) return;
    /* Invoicing is a different screen, not a status flip: the pro has lines
       to check and a total to agree before anything is issued. */
    if (action === 'invoice') { navigate(`/jobs/${appt.id}/invoice`); return; }

    const next = action === 'start' ? 'in_progress' : 'completed';
    try {
      await api.patch(`/api/jobs/${appt.id}/status`, { status: next });
      onChanged?.(appt, next);
    } catch (err) {
      /* A 409 means the sheet was offering a move the job had already moved
         past — someone finished it on another device, or it was cancelled
         while the sheet was open. Saying so is not enough: the calendar
         behind the sheet is still drawing the old status, so it has to be
         refetched or the same dead button is there to press again. */
      const stale = err?.response?.status === 409;
      toast.error(stale ? t('day_status_refused') : formatError(err));
      onChanged?.(appt, null);
    }
  }, [navigate, onChanged, t]);
}
