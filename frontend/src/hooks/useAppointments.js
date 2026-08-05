import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { dayKey } from '../utils/schedule';

/**
 * The appointments for a window of days, with the last request winning.
 *
 * All three views used to load with a bare promise chain — no abort, no
 * sequence guard — and tapping "next" twice in quick succession fired two
 * requests whose order of arrival was the network's business, not ours.
 * Measured: a delayed response for the 6th painted the 6th's jobs under a
 * header reading the 7th, with no spinner and nothing on screen to say the
 * calendar was lying. Twenty rapid taps fired twenty requests.
 *
 * Two guards, because they fail differently:
 *
 *  · An AbortController per request, so a superseded fetch stops costing
 *    bandwidth on a van's mobile connection.
 *  · A monotonic sequence number, because aborting is best-effort — a
 *    response already in flight can still land, and `axios` may or may not
 *    reject in time. Only the newest sequence is allowed to write state.
 *
 * `loading` also belongs to the newest request only. Clearing it from a
 * stale response was what removed the spinner while the real request was
 * still running, which is how the wrong day looked settled.
 */
export default function useAppointments(from, days) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const seq = useRef(0);
  const inflight = useRef(null);
  const loadedOnce = useRef(false);

  const key = from ? dayKey(from) : null;

  const load = useCallback(() => {
    if (!key) return;
    const mine = ++seq.current;
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;

    /* Only the first fetch blanks the view. Every later one is a background
       refresh, and swapping the whole calendar for a spinner unmounts
       anything open on top of it. */
    if (!loadedOnce.current) setLoading(true);

    api.get('/api/jobs/appointments', { params: { day: key, days }, signal: ctrl.signal })
      .then((r) => {
        if (mine !== seq.current) return;              // a newer request won
        setAppointments((r.data?.appointments || []).map((a) => ({
          ...a,
          start: new Date(a.scheduled_start),
          end: new Date(a.scheduled_end || a.scheduled_start),
        })));
        setFailed(false);
      })
      .catch((err) => {
        if (mine !== seq.current) return;
        /* An abort is not a failure — it is this hook doing its job, and
           showing "could not be loaded" for it would make every fast tap
           look like an outage. */
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
        setAppointments([]);
        setFailed(true);
      })
      .finally(() => {
        if (mine !== seq.current) return;
        loadedOnce.current = true;
        setLoading(false);
      });
  }, [key, days]);

  useEffect(load, [load]);
  useEffect(() => () => inflight.current?.abort(), []);

  return { appointments, setAppointments, loading, failed, reload: load };
}
