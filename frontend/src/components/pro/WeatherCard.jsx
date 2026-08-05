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

/**
 * @param outlook  when true, the card grows a row of the next seven days and
 *                 the pro can look ahead. Off by default, and off on the day
 *                 view: that view already has a date navigator above it, and
 *                 a second way to change the day inside the card would let
 *                 the two disagree — a forecast for Thursday sitting on top
 *                 of Monday's appointments.
 */
export default function WeatherCard({
  weather, status = 'ok', t, compact = false, lang = 'de-AT', outlook = false,
}) {
  /* Today, always, on every arrival. The pro opens the calendar to work out
     today; looking ahead is the deliberate second act. */
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
        <p className="flex-1 font-bold text-[11.5px] text-ink-muted leading-snug">
          {canFix ? t('wx_no_location') : t('wx_unavailable')}
        </p>
        {canFix && (
          <Link to="/settings" className="font-extrabold text-[11.5px] text-teal whitespace-nowrap
                                          underline min-h-[32px] flex items-center"
                data-testid="wx-set-location">
            {t('wx_set_location')}
          </Link>
        )}
      </div>
    );
  }

  const list = weather.days || [];
  /* A selection can outlive the forecast it was made against — a refresh
     that comes back with fewer days must not leave the card reading an
     index that no longer exists. */
  const idx = Math.min(sel, Math.max(0, list.length - 1));
  const day = list[idx];
  const isToday = idx === 0;

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
              <span className={`font-extrabold text-ink ${compact ? 'text-[17px]' : 'text-[21px]'}`}
                    data-testid="wx-temp">
                {temp}°
              </span>
            )}
            <span className="font-bold text-[11.5px] text-ink-soft truncate">
              {t(KEY[cond] || 'wx_cloudy')}
            </span>
          </p>
          <p className="font-bold text-[10.5px] text-ink-muted mt-0.5 truncate">
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
            <span className="flex items-center gap-1 font-bold text-[10.5px] text-sky-deep"
                  data-testid="wx-rain">
              <Droplets size={12} /> {rain}%
            </span>
          )}
          {wind != null && (
            <span className="flex items-center gap-1 font-bold text-[10.5px] text-ink-muted">
              <Wind size={12} /> {wind} km/h
            </span>
          )}
        </div>
      </div>

      {outlook && list.length > 1 && (
        <div className="flex gap-1 mt-2.5 pt-2 border-t border-sky-tint" data-testid="wx-outlook">
          {list.map((d, i) => {
            const DIcon = ICON[d.condition] || Cloud;
            const on = i === idx;
            return (
              <button
                key={d.date || i}
                type="button"
                onClick={() => setSel(i)}
                className={`flex-1 min-w-0 min-h-[46px] rounded-[8px] py-1 flex flex-col
                            items-center justify-center gap-px
                            ${on ? 'bg-paper shadow-sm ring-1 ring-sky/30' : ''}`}
                data-testid={`wx-day-${i}`}
                data-date={d.date || ''}
                aria-pressed={on}
              >
                <span className={`font-bold text-[9px] truncate max-w-full px-0.5
                                  ${on ? 'text-sky-deep' : 'text-ink-muted'}`}>
                  {label(d, i)}
                </span>
                <DIcon size={14} className={on ? 'text-sky-deep' : 'text-sky'} strokeWidth={1.9} />
                <span className={`font-extrabold text-[9.5px] ${on ? 'text-ink' : 'text-ink-soft'}`}>
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
