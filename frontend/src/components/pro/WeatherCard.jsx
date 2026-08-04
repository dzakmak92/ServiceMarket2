import React from 'react';
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow,
  CloudSun, Droplets, Sun, Wind,
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

export default function WeatherCard({ weather, t, compact = false }) {
  /* No forecast is a normal state, not an error worth a slot on the screen:
     a pro with no service centre set, an upstream that is down, an offline
     phone. The calendar is the page — the card simply is not there. */
  if (!weather?.current && !weather?.days?.length) return null;

  const today = weather.days?.[0];
  const cur = weather.current || {};
  const cond = cur.condition || today?.condition || 'cloudy';
  const Icon = ICON[cond] || Cloud;
  const temp = round(cur.temp);
  const high = round(today?.high);
  const low = round(today?.low);
  const rain = round(cur.rain_chance ?? today?.rain_chance);
  const wind = round(cur.wind ?? today?.wind_max);

  return (
    <div
      className={`rounded-[14px] border border-sky/25 bg-sky/[0.08] flex items-center gap-3
                  ${compact ? 'px-3 py-2 mb-2.5' : 'px-3.5 py-3 mb-3'}`}
      data-testid="wx-card"
    >
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
  );
}
