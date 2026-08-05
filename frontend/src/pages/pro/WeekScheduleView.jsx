import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import WeatherCard from '../../components/pro/WeatherCard';
import JobSheet from '../../components/pro/JobSheet';
import useWeather from '../../hooks/useWeather';
import useJobAction from '../../hooks/useJobAction';
import {
  MIN, bookableRuns, dayKey, durationLabel, hhmm, toMs,
} from '../../utils/schedule';
import { Car, Loader2, MapPin, User } from 'lucide-react';

/* The same window the day view draws, so a block in the same place means the
   same time in both. Imported by value rather than shared with the day view
   on purpose: these are the two numbers most likely to want to differ later
   (a week overview can afford to compress where a day cannot). */
const DAY_FROM = 8;
const DAY_TO = 20;
const SPAN = DAY_TO - DAY_FROM;

/* 300 px of column for twelve hours is 25 px an hour: a half-hour job is a
   readable mark and a full day is not taller than the phone. The blocks carry
   an hour and nothing else at this width — the list underneath is where the
   detail lives. */
const GRID_H = 300;

/* The column header: weekday, date, and the day's high. Three lines at 9,
   11 and 8 px do not fit in 38 px once line-height is counted, and the
   temperature was landing on top of the 08:00 grid line. Measured, not
   guessed — the test asserts the header never overlaps the grid. */
const HEAD_H = 48;

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a, b) => dayKey(a) === dayKey(b);

/** Where in the column an instant falls, 0–1. Clamped, because an appointment
 *  that starts at 07:00 still has to be drawn somewhere. */
const frac = (v) => {
  const d = new Date(toMs(v));
  const h = d.getHours() + d.getMinutes() / 60;
  return Math.min(1, Math.max(0, (h - DAY_FROM) / SPAN));
};

export default function WeekScheduleView({ weekStart, onOpenDay, t, lang = 'de-AT' }) {
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [openJob, setOpenJob] = useState(null);
  const { weather, status: wxStatus } = useWeather(7);
  /* Same handler the day view uses. Without it the sheet's Start /
     Finish button was inert here. */
  const runAction = useJobAction({ t, onChanged: () => load() });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); d.setHours(0, 0, 0, 0);
    return d;
  }), [weekStart]);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/jobs/appointments', { params: { day: dayKey(weekStart), days: 7 } })
      .then((r) => setAppts((r.data?.appointments || []).map((a) => ({
        ...a,
        start: new Date(a.scheduled_start),
        end: new Date(a.scheduled_end || a.scheduled_start),
      }))))
      .catch(() => setAppts([]))
      .finally(() => setLoading(false));
  }, [weekStart]);

  useEffect(load, [load]);

  /* Keep the selection inside the week being looked at. Paging to next week
     and still showing last Tuesday's jobs underneath the grid would be a
     quiet lie about which day the list belongs to. */
  useEffect(() => {
    if (!days.some((d) => sameDay(d, selected))) {
      const today = startOfDay(new Date());
      setSelected(days.some((d) => sameDay(d, today)) ? today : days[0]);
    }
  }, [days, selected]);

  const byDay = useMemo(() => {
    const m = new Map(days.map((d) => [dayKey(d), []]));
    appts.forEach((a) => { const k = dayKey(a.start); if (m.has(k)) m.get(k).push(a); });
    m.forEach((list) => list.sort((x, y) => toMs(x.start) - toMs(y.start)));
    return m;
  }, [appts, days]);

  const minutesOn = (d) => (byDay.get(dayKey(d)) || [])
    .reduce((sum, a) => sum + (toMs(a.end) - toMs(a.start)) / MIN, 0);

  const totalMinutes = days.reduce((s, d) => s + minutesOn(d), 0);
  const freeDays = days.filter((d) => (byDay.get(dayKey(d)) || []).length === 0).length;

  /* Memoised because `|| []` mints a fresh array whenever the day is empty,
     which would make the runs below recompute on every render. */
  const selectedAppts = useMemo(
    () => byDay.get(dayKey(selected)) || [], [byDay, selected]);
  const selectedRuns = useMemo(() => {
    const from = new Date(selected); from.setHours(DAY_FROM, 0, 0, 0);
    const to = new Date(selected); to.setHours(DAY_TO, 0, 0, 0);
    return bookableRuns(selectedAppts, from, to);
  }, [selectedAppts, selected]);

  const now = new Date();

  if (loading) {
    return (
      <div className="py-14 flex justify-center" data-testid="week-loading">
        <Loader2 className="text-teal animate-spin" />
      </div>
    );
  }

  return (
    <div data-testid="week-view">
      {/* Today by default, with the next seven days a tap away. The card's
          day is deliberately independent of the day selected in the grid
          below: "will it rain on Thursday" is a question you ask while
          looking at Monday's work, and forcing the two to move together
          would mean losing your place in the week to find out. */}
      <WeatherCard weather={weather} status={wxStatus} t={t} lang={lang} outlook />

      <div className="flex gap-1.5 mb-3">
        {[[t('week_appointments'), appts.length, ''],
          [t('week_booked'), durationLabel(totalMinutes * MIN), 'text-teal'],
          [t('week_free_days'), freeDays, 'text-amber-deep']].map(([label, value, tone]) => (
          <div key={label} className="flex-1 rounded-[11px] border border-sm-border bg-paper px-2.5 py-2">
            <p className="font-bold text-[9px] uppercase tracking-wide text-ink-muted">{label}</p>
            <p className={`font-extrabold text-[15px] mt-px ${tone || 'text-ink'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── the grid ── */}
      <div className="flex rounded-[12px] border border-sm-border bg-paper p-2 pb-1.5"
           data-testid="week-grid">
        <div className="w-[24px] flex-none relative" style={{ height: HEAD_H + GRID_H }}>
          {Array.from({ length: SPAN / 2 + 1 }, (_, i) => DAY_FROM + i * 2).map((h) => (
            <span key={h} className="absolute right-[3px] font-bold text-[8.5px] text-ink-faint"
                  style={{ top: HEAD_H + ((h - DAY_FROM) / SPAN) * GRID_H, transform: 'translateY(-50%)' }}>
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>

        <div className="flex-1 flex gap-[3px]">
          {days.map((d) => {
            const list = byDay.get(dayKey(d)) || [];
            const isToday = sameDay(d, now);
            const isSel = sameDay(d, selected);
            const wxDay = weather?.days?.find((w) => w.date === dayKey(d));
            return (
              <button
                key={dayKey(d)}
                type="button"
                onClick={() => setSelected(d)}
                onDoubleClick={() => onOpenDay?.(d)}
                className="flex-1 relative text-left"
                style={{ height: HEAD_H + GRID_H }}
                data-testid={`week-col-${dayKey(d)}`}
                aria-pressed={isSel}
              >
                {/* Absolute, because a button centres its own content vertically
                    and `display: block` on the button does not stop it — the
                    weekday label was landing halfway down the column. */}
                <span className={`absolute left-0 right-0 top-0 text-center font-bold text-[9px]
                  h-[48px] ${isToday ? 'text-teal' : 'text-ink-muted'}`}>
                  {d.toLocaleDateString(lang, { weekday: 'short' })}
                  <b className={`block font-extrabold text-[11px] ${isToday ? 'text-teal' : 'text-ink'}`}>
                    {d.getDate()}
                  </b>
                  {wxDay && <b className="block text-[8px] font-bold text-sky-deep">
                    {Math.round(wxDay.high)}°
                  </b>}
                </span>

                <span
                  className={`absolute left-0 right-0 rounded-[4px] overflow-hidden block
                    ${isSel ? 'ring-[1.5px] ring-teal' : ''}
                    ${isToday ? 'bg-teal/10' : 'bg-cream-soft'}`}
                  style={{ top: HEAD_H, height: GRID_H }}
                >
                  {Array.from({ length: SPAN / 2 - 1 }, (_, i) => DAY_FROM + (i + 1) * 2).map((h) => (
                    <span key={h} className="absolute left-0 right-0 h-px bg-black/[0.05]"
                          style={{ top: ((h - DAY_FROM) / SPAN) * GRID_H }} />
                  ))}

                  {list.map((a) => {
                    const top = frac(a.start) * GRID_H;
                    const h = Math.max(4, (frac(a.end) - frac(a.start)) * GRID_H - 1.5);
                    return (
                      <span
                        key={a.id}
                        className={`absolute left-px right-px rounded-[3px] overflow-hidden
                                    font-extrabold text-[7.5px] text-paper pl-[2px] pt-px
                          ${a.urgency === 'emergency' ? 'bg-red-warn' : 'bg-teal'}`}
                        style={{ top, height: h }}
                        data-testid={`week-block-${a.id}`}
                        data-start={new Date(a.start).toISOString()}
                        data-end={new Date(a.end).toISOString()}
                      >
                        {h > 16 ? hhmm(a.start).slice(0, 2) : ''}
                      </span>
                    );
                  })}

                  {isToday && now.getHours() >= DAY_FROM && now.getHours() < DAY_TO && (
                    <span className="absolute left-0 right-0 h-[1.5px] bg-red-warn z-[3]"
                          style={{ top: frac(now) * GRID_H }} data-testid="week-now" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── the selected day, spelled out ──
          The grid says shape; forty-six pixels of column cannot say whose
          bathroom it is. Anything the blocks cannot carry goes here. */}
      <div className="flex items-baseline gap-2 mt-3.5 mb-1.5">
        <p className="font-headings font-bold text-[12.5px] text-ink" data-testid="week-sel-title">
          {selected.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
        {selectedAppts.length > 0 && (
          <span className="font-bold text-[10.5px] text-ink-muted">
            · {durationLabel(minutesOn(selected) * MIN)}
          </span>
        )}
        <button type="button" onClick={() => onOpenDay?.(selected)}
                className="ml-auto font-bold text-[11px] text-teal min-h-[32px] px-1"
                data-testid="week-open-day">
          {t('week_open_day')}
        </button>
      </div>

      {selectedAppts.length === 0 ? (
        <div className="rounded-[11px] border-[1.5px] border-dashed border-sm-border
                        bg-cream-soft py-3 text-center font-bold text-[11px] text-ink-muted"
             data-testid="week-sel-empty">
          {t('week_day_free')}
        </div>
      ) : selectedAppts.map((a, i) => (
        <React.Fragment key={a.id}>
          {/* The bookable window between two jobs, with the drive that comes
              out of it — the same arithmetic the day view books against, so
              the two screens can never offer different free time. */}
          {i > 0 && selectedRuns
            .filter((r) => toMs(r.start) >= toMs(selectedAppts[i - 1].end)
                        && toMs(r.end) <= toMs(a.start))
            .map((r) => (
              <div key={+r.start} className="flex items-center gap-2 ml-[53px] mb-1.5">
                <span className="flex items-center gap-1 font-bold text-[9.5px] text-ink-faint">
                  <Car size={10} /> {durationLabel(15 * MIN)}
                </span>
                <span className="flex-1 border-t-[1.5px] border-dashed border-teal-tint" />
                <span className="font-bold text-[9.5px] text-ink-faint" data-testid="week-gap">
                  {durationLabel(toMs(r.end) - toMs(r.start))} {t('day_free')}
                </span>
              </div>
            ))}
          <button
            type="button"
            onClick={() => setOpenJob(a)}
            className={`w-full text-left flex gap-2.5 rounded-[11px] border px-2.5 py-2 mb-1.5
              ${a.urgency === 'emergency'
                ? 'border-red-warn/35 bg-red-warn/[0.04]' : 'border-sm-border bg-paper'}`}
            data-testid={`week-sel-${a.id}`}
          >
            <span className="w-[44px] flex-none">
              <b className="block font-extrabold text-[11.5px] text-teal">{hhmm(a.start)}</b>
              <i className="block not-italic font-bold text-[9px] text-ink-faint mt-px">
                {durationLabel(toMs(a.end) - toMs(a.start))}
              </i>
            </span>
            <span className="flex-1 min-w-0">
              <b className="block font-extrabold text-[12px] text-ink truncate">{a.title}</b>
              <span className="flex items-center gap-1 font-bold text-[10px] text-ink-muted mt-0.5">
                {a.customer_name && <><User size={10} /> {a.customer_name}</>}
                {(a.site_city || a.customer_city) && (
                  <><MapPin size={10} className="ml-1" /> {a.site_city || a.customer_city}</>
                )}
              </span>
            </span>
          </button>
        </React.Fragment>
      ))}
      {openJob && (
        <JobSheet
          appt={openJob}
          onClose={() => setOpenJob(null)}
          onPrimary={(a, act) => { setOpenJob(null); runAction(a, act); }}
          t={t}
        />
      )}
    </div>
  );
}
