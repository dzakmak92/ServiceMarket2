import { useEffect, useState } from 'react';
import api from '../api/client';

/* One fetch shared by every mount in a session. The day view and the week
   view both show the card, and switching between them should not ask again —
   the forecast changes hourly, the tab does not. */
let cache = null;
let inflight = null;

/**
 * `{ weather, status }` — the forecast, and why there isn't one.
 *
 * The status is the point. Swallowing the error and returning null meant the
 * card simply was not there, and nothing on screen distinguished "you have
 * not set a location" from "the forecast service is down" from "this build
 * has no /api/weather at all". All three looked identical: a calendar with
 * no weather on it and no way to find out why.
 *
 *   'ok'        — a forecast
 *   'no-location' (404) — the pro has no town or service centre on file
 *   'unavailable' (503) — upstream refused or timed out
 *   'missing'   (404 on the route itself, or a network error)
 *   'loading'
 */
export default function useWeather(days = 7) {
  const [state, setState] = useState(
    cache ? { weather: cache, status: 'ok' } : { weather: null, status: 'loading' });

  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    if (!inflight) {
      inflight = api.get('/api/weather', { params: { days } })
        .then((r) => { cache = r.data; return { weather: cache, status: 'ok' }; })
        .catch((err) => {
          const s = err?.response?.status;
          const detail = String(err?.response?.data?.detail || '');
          if (s === 404 && /location/i.test(detail)) return { weather: null, status: 'no-location' };
          if (s === 503) return { weather: null, status: 'unavailable' };
          return { weather: null, status: 'missing' };
        })
        .finally(() => { inflight = null; });
    }
    inflight.then((d) => { if (alive && d) setState(d); });
    return () => { alive = false; };
  }, [days]);

  return state;
}
