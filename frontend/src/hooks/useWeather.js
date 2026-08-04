import { useEffect, useState } from 'react';
import api from '../api/client';

/* One fetch shared by every mount in a session. The day view and the week
   view both show the card, and switching between them should not ask again —
   the forecast changes hourly, the tab does not. */
let cache = null;
let inflight = null;

/**
 * Today's forecast, or null.
 *
 * Never throws and never surfaces an error. A missing service centre (404)
 * and an upstream that is down (503) are both "no card", because neither is
 * something the pro can act on from a calendar screen, and neither should
 * cost them the schedule they came for.
 */
export default function useWeather(days = 7) {
  const [weather, setWeather] = useState(cache);

  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    if (!inflight) {
      inflight = api.get('/api/weather', { params: { days } })
        .then((r) => { cache = r.data; return cache; })
        .catch(() => null)
        .finally(() => { inflight = null; });
    }
    inflight.then((d) => { if (alive && d) setWeather(d); });
    return () => { alive = false; };
  }, [days]);

  return weather;
}
