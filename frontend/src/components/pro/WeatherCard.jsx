import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow,
  CloudSun, CloudOff, Droplets, MapPin, Sun, Wind,
} from 'lucide-react';

/**
 * Today's weather, in detail — the same card on the day and week views.
 *
 * Deliberately today only, never a seven-day strip. A tradesperson deciding
 * whether to start an outdoor job needs the temperature, the wind and the
 * chance of rain for the hours they are about to work; a row of icons for
 * next Thursday answers a question nobody has while standing at a van.
 *
 * Blue, which appears nowhere else in the palette. That is the point: the
 * card can never be misread as an appointment.
 */
const ICON = {
  clear: Sun, partly: CloudSun, cloudy: Cloud, fog: CloudFog,
  drizzle: CloudDrizzle, rain: CloudRain, showers: CloudRain,
  snow: CloudSnow, storm: CloudLightning,
};

/* Named here rather than in the API so the label follows the interface
   language, and so a condition we have no word for still renders. */
const KEY = {
  clear: 'wx_clear', partly: 'wx_partly', cloudy: 'wx_cloudy', fog: 'wx_fog',
  drizzle: 'wx_drizzle', rain: 'wx_rain', showers: 'wx_showers',
  snow: 'wx_snow', storm: 'wx_storm',
};

const round = (v) => (typeof v === 'number' ? Math.round(v) : null);

/* A local calendar day as the forecast names it. `toISOString()` would be
   wrong here: it converts to UTC, and east of Greenwich local midnight is the
   previous day — the card would show Tuesday's weather all Wednesday
   morning. */
const keyOf = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* Every second hour across the working day: eight columns, which is what
   stays legible at 390 px without the labels touching. */
const HOUR_STEP = 2;
/* Below this a rain probability is not weather, and drawing it makes a dry
   day look busy. */
const RAIN_FLOOR = 20;

/**
 * The day's shape, under the headline.
 *
 * Hour and icon on top, the temperature curve in the middle, degrees
 * underneath — the numbers stay in their own straight rows rather than
 * riding the curve, where they collided with the rain band. Rain
 * probability sits behind the line as a soft column so the front coming in
 * at four is a shape rather than five separate numbers to compare.
 */
function HourStrip({ hours, t }) {
  const pts = hours.filter((_, i) => i % HOUR_STEP === 0);
  if (pts.length < 2) return null;

  /* The viewBox is sized to the card's real inner width rather than to a
     tidy 100, because `preserveAspectRatio="none"` scales x and y
     independently: on a 100-wide box the dots stretched into dashes. At 336
     the horizontal scale is ~1 on a phone, so a circle stays a circle. */
  const W = 336;
  const H = 40;
  const temps = pts.map((p) => p.temp).filter((v) => typeof v === 'number');
  if (temps.length < 2) return null;
  /* A flat day would divide by zero and a two-degree day would look like a
     mountain range, so the scale never spans less than six degrees. */
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const mid = (lo + hi) / 2;
  const span = Math.max(6, hi - lo);
  const min = mid - span / 2;

  const x = (i) => ((i + 0.5) * W) / pts.length;
  const y = (v) => H - 4 - ((v - min) / span) * (H - 14);
  const line = pts
    .map((p, i) => (typeof p.temp === 'number' ? `${x(i)},${y(p.temp)}` : null))
    .filter(Boolean).join(' ');

  return (
    <div className="mt-2.5 pt-2 border-t border-sky-tint" data-testid="wx-hours">
      <div className="flex gap-0.5">
        {pts.map((p) => {
          const HIcon = ICON[p.condition] || Cloud;
          return (
            <div key={p.hour} className="flex-1 min-w-0 text-center">
              <p className="font-bold text-[0.5625rem] text-ink-muted">
                {String(p.hour).padStart(2, '0')}
              </p>
              <HIcon size={15} className="mx-auto mt-0.5 text-sky-deep" strokeWidth={1.9} />
            </div>
          );
        })}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
           className="block w-full h-[40px] mt-0.5" aria-hidden="true">
        {pts.map((p, i) => {
          const r = p.rain_chance;
          if (typeof r !== 'number' || r < RAIN_FLOOR) return null;
          const bh = (r / 100) * H;
          return (
            <rect key={p.hour} x={x(i) - W / pts.length / 2.6} y={H - bh}
                  width={W / pts.length / 1.3} height={bh} rx="3"
                  fill="#5b8fb0" opacity={r >= 60 ? 0.30 : 0.15} />
          );
        })}
        <polyline points={line} fill="none" stroke="#3d6c8a" strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (typeof p.temp === 'number' ? (
          <circle key={p.hour} cx={x(i)} cy={y(p.temp)} r="2.2"
                  fill="#ffffff" stroke="#3d6c8a" strokeWidth="1.4"
                  vectorEffect="non-scaling-stroke" />
        ) : null))}
      </svg>

      <div className="flex gap-0.5">
        {pts.map((p) => (
          <div key={p.hour} className="flex-1 min-w-0 text-center">
            <p className="font-extrabold text-[0.625rem] text-ink-soft">
              {round(p.temp) != null ? `${round(p.temp)}°` : '–'}
            </p>
          </div>
        ))}
      </div>

      {/* The curve is a glance; this is the sentence a screen reader gets,
          and the only part of the strip that is not purely visual. */}
      <p className="sr-only" data-testid="wx-hours-text">
        {pts.map((p) => `${String(p.hour).padStart(2, '0')}: `
          + `${round(p.temp) != null ? `${round(p.temp)}°` : '–'}`
          + `${typeof p.rain_chance === 'number' ? `, ${round(p.rain_chance)}% ${t('wx_rain')}` : ''}`)
          .join('; ')}
      </p>
    </div>
  );
}

/**
 * @param outlook  when true, the card grows a row of the next seven days and
 *                 the pro can look ahead. Off by default, and off on the day
 *                 view: that view already has a date navigator above it, and
 *                 a second way to change the day inside the card would let
 *                 the two disagree — a forecast for Thursday sitting on top
 *                 of Monday's appointments.
 */
export default function WeatherCard({
  weather, status = 'ok', t, compact = false, lang = 'de-AT',
  outlook = false, hours = false, date = null,
}) {
  /* Today, always, on every arrival. The pro opens the calendar to work out
     today; looking ahead is the deliberate second act.
     Ignored entirely when `date` is given: the calendar's own selection then
     drives the card, and a second picker inside it could disagree with the
     grid behind it. */
  const [sel, setSel] = useState(0);
  const dayCount = weather?.days?.length || 0;
  useEffect(() => { setSel(0); }, [weather?.place, dayCount]);

  const empty = !weather?.current && !weather?.days?.length;

  /* Nothing while it is still being fetched — a placeholder that flashes for
     200 ms is worse than a card that simply appears. */
  if (empty && status === 'loading') return null;

  /* But once it has failed, say so. Rendering nothing meant a pro with no
     town on file, a pro behind a broken upstream and a pro on a build with
     no weather endpoint all saw exactly the same thing — a calendar with no
     weather and no way to find out why. Only the first of those is
     actionable, so only the first gets a link. */
  if (empty) {
    const canFix = status === 'no-location';
    return (
      <div className={`rounded-[14px] border border-sm-border bg-cream-soft flex items-center gap-2.5
                       ${compact ? 'px-3 py-2 mb-2.5' : 'px-3.5 py-2.5 mb-3'}`}
           data-testid="wx-empty" data-status={status}>
        {canFix ? <MapPin size={16} className="text-ink-muted flex-none" />
                : <CloudOff size={16} className="text-ink-muted flex-none" />}
        <p className="flex-1 font-bold text-[0.71875rem] text-ink-muted leading-snug">
          {canFix ? t('wx_no_location') : t('wx_unavailable')}
        </p>
        {canFix && (
          <Link to="/settings" className="font-extrabold text-[0.71875rem] text-teal whitespace-nowrap
                                          underline min-h-[32px] flex items-center"
                data-testid="wx-set-location">
            {t('wx_set_location')}
          </Link>
        )}
      </div>
    );
  }

  const list = weather.days || [];

  /* Which day the card is showing.
   *
   * When the calendar passes a date, that is the answer and there is nothing
   * to negotiate: the card is a read-out of the day the pro selected, not a
   * separate control. When it does not, the card keeps its own selection, as
   * it always has.
   *
   * A date past the end of the forecast is its own state, not the nearest
   * day. Falling back to the last one would put Thursday's temperature under
   * a heading that says the 20th, which is worse than saying nothing —
   * a pro plans an outdoor job on that number. */
  const wanted = date ? keyOf(date) : null;
  const found = wanted ? list.findIndex((d) => d.date === wanted) : -1;
  const beyond = !!wanted && found < 0;
  /* A selection can outlive the forecast it was made against — a refresh
     that comes back with fewer days must not leave the card reading an
     index that no longer exists. */
  const idx = wanted ? found : Math.min(sel, Math.max(0, list.length - 1));
  const day = list[idx];
  const isToday = !beyond && day?.date === keyOf(new Date());

  if (beyond) {
    const last = list[list.length - 1];
    return (
      <div className={`rounded-[14px] border border-sky-tint bg-sky-pale flex items-center gap-2.5
                       ${compact ? 'px-3 py-2 mb-2.5' : 'px-3.5 py-2.5 mb-3'}`}
           data-testid="wx-beyond" data-day={wanted}>
        <CloudOff size={16} className="text-sky-deep flex-none" />
        <p className="flex-1 font-bold text-[0.71875rem] text-ink-muted leading-snug">
          {t('wx_beyond', {
            date: last?.date
              ? new Date(`${last.date}T12:00:00`).toLocaleDateString(lang,
                  { weekday: 'long', day: 'numeric', month: 'long' })
              : '',
          })}
        </p>
      </div>
    );
  }

  /* "Now" only means anything today. On Thursday the honest headline number
     is Thursday's high, not this minute's temperature. */
  const cur = isToday ? (weather.current || {}) : {};
  const cond = (isToday ? cur.condition : null) || day?.condition || 'cloudy';
  const Icon = ICON[cond] || Cloud;
  const temp = isToday ? round(cur.temp) : round(day?.high);
  const high = round(day?.high);
  const low = round(day?.low);
  const rain = round((isToday ? cur.rain_chance : null) ?? day?.rain_chance);
  const wind = round((isToday ? cur.wind : null) ?? day?.wind_max);

  const dateOf = (d) => (d?.date ? new Date(`${d.date}T12:00:00`) : null);
  const label = (d, i) => (i === 0 ? t('wx_today')
    : dateOf(d)?.toLocaleDateString(lang, { weekday: 'short' }) || '');

  return (
    <div
      className={`rounded-[14px] border border-sky-tint bg-sky-pale
                  ${compact ? 'px-3 py-2 mb-2.5' : 'px-3.5 py-3 mb-3'}`}
      data-testid="wx-card"
      data-day={day?.date || ''}
    >
      <div className="flex items-center gap-3">
        <Icon size={compact ? 26 : 32} className="text-sky-deep flex-none" strokeWidth={1.8} />

        <div className="flex-1 min-w-0">
          <p className="flex items-baseline gap-1.5">
            {temp != null && (
              <span className={`font-extrabold text-ink ${compact ? 'text-[1.0625rem]' : 'text-[1.3125rem]'}`}
                    data-testid="wx-temp">
                {temp}°
              </span>
            )}
            <span className="font-bold text-[0.71875rem] text-ink-soft truncate">
              {t(KEY[cond] || 'wx_cloudy')}
            </span>
          </p>
          <p className="font-bold text-[0.65625rem] text-ink-muted mt-0.5 truncate">
            {/* The chosen day is named whenever it is not today, so the card
                can never be read as "now" while showing Thursday. */}
            {!isToday && day && (
              <span className="text-sky-deep">
                {dateOf(day)?.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'short' })}
                {' · '}
              </span>
            )}
            {high != null && low != null && `${high}° / ${low}°`}
            {weather.place ? ` · ${weather.place}` : ''}
          </p>
        </div>

        {/* Rain and wind, because those are the two that stop work. */}
        <div className="flex flex-col gap-1 flex-none items-end">
          {rain != null && (
            <span className="flex items-center gap-1 font-bold text-[0.65625rem] text-sky-deep"
                  data-testid="wx-rain">
              <Droplets size={12} /> {rain}%
            </span>
          )}
          {wind != null && (
            <span className="flex items-center gap-1 font-bold text-[0.65625rem] text-ink-muted">
              <Wind size={12} /> {wind} km/h
            </span>
          )}
        </div>
      </div>

      {hours && <HourStrip hours={day?.hours || []} t={t} />}

      {outlook && list.length > 1 && (
        <div className="flex gap-1 mt-2.5 pt-2 border-t border-sky-tint overflow-x-auto
                        [-ms-overflow-style:none] [scrollbar-width:none]
                        [&::-webkit-scrollbar]:hidden" data-testid="wx-outlook">
          {list.map((d, i) => {
            const DIcon = ICON[d.condition] || Cloud;
            const on = i === idx;
            return (
              <button
                key={d.date || i}
                type="button"
                onClick={() => setSel(i)}
                /* min-w-0 let seven chips squeeze to 43px wide at 390 and
                   33px at 320 — under the 44px target, four pixels apart, on
                   a control whose whole job is being tapped. Below 44 each
                   the row scrolls rather than shrinking further. */
                className={`flex-1 min-w-[44px] min-h-[46px] rounded-[8px] py-1 flex flex-col
                            items-center justify-center gap-px
                            ${on ? 'bg-paper shadow-sm ring-1 ring-sky/30' : ''}`}
                data-testid={`wx-day-${i}`}
                data-date={d.date || ''}
                aria-pressed={on}
              >
                <span className={`font-bold text-[0.5625rem] truncate max-w-full px-0.5
                                  ${on ? 'text-sky-deep' : 'text-ink-muted'}`}>
                  {label(d, i)}
                </span>
                <DIcon size={14} className={on ? 'text-sky-deep' : 'text-sky'} strokeWidth={1.9} />
                <span className={`font-extrabold text-[0.59375rem] ${on ? 'text-ink' : 'text-ink-soft'}`}>
                  {round(d.high) != null ? `${round(d.high)}°` : '–'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
