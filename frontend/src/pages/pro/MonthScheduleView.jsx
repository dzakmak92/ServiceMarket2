import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import WeatherCard from '../../components/pro/WeatherCard';
import JobSheet from '../../components/pro/JobSheet';
import useWeather from '../../hooks/useWeather';
import { MIN, dayKey, durationLabel, hhmm, toMs } from '../../utils/schedule';
import { Loader2, MapPin, User } from 'lucide-react';

/**
 * The month as a chart in the shape of a calendar.
 *
 * Every day is a bar of how full it is, so the month reads as workload
 * rather than as a list of dots to count. That is the question a
 * tradesperson actually brings to a month view — which weeks are heavy, and
 * where is there still room to sell — and a grid of identical dots answers
 * neither.
 */

/* A full day, against which every bar is measured. Eight hours is the bar's
   ceiling, not a limit on the day: ten hours simply fills it. */
const FULL_DAY_MIN = 8 * 60;
/* Past this the day reads as full rather than merely busy, and the bar
   darkens. Seven of eight hours booked leaves no room worth selling. */
const HEAVY_MIN = 7 * 60;

/* Six whole weeks, always. A grid that is five rows in one month and six in
   the next makes the list underneath it jump on every page turn. */
const WEEKS = 6;
const CELLS = WEEKS * 7;

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a, b) => dayKey(a) === dayKey(b);

/** The Monday on or before the first of the month. */
function gridStart(monthStart) {
  const d = startOfDay(monthStart);
  d.setDate(1);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export default function MonthScheduleView({ monthStart, onOpenDay, t, lang = 'de-AT' }) {
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [openJob, setOpenJob] = useState(null);
  const { weather, status: wxStatus } = useWeather(7);

  const from = useMemo(() => gridStart(monthStart), [monthStart]);
  const cells = useMemo(() => Array.from({ length: CELLS }, (_, i) => {
    const d = new Date(from); d.setDate(from.getDate() + i);
    return d;
  }), [from]);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/jobs/appointments', { params: { day: dayKey(from), days: CELLS } })
      .then((r) => setAppts((r.data?.appointments || []).map((a) => ({
        ...a,
        start: new Date(a.scheduled_start),
        end: new Date(a.scheduled_end || a.scheduled_start),
      }))))
      .catch(() => setAppts([]))
      .finally(() => setLoading(false));
  }, [from]);

  useEffect(load, [load]);

  const byDay = useMemo(() => {
    const m = new Map();
    appts.forEach((a) => {
      const k = dayKey(a.start);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    });
    m.forEach((list) => list.sort((x, y) => toMs(x.start) - toMs(y.start)));
    return m;
  }, [appts]);

  const listOn = useCallback((d) => byDay.get(dayKey(d)) || [], [byDay]);
  const minutesOn = useCallback((d) => listOn(d)
    .reduce((s, a) => s + (toMs(a.end) - toMs(a.start)) / MIN, 0), [listOn]);

  const month = monthStart.getMonth();
  const inMonth = (d) => d.getMonth() === month;
  const monthDays = cells.filter(inMonth);
  const totalMinutes = monthDays.reduce((s, d) => s + minutesOn(d), 0);
  const freeDays = monthDays.filter((d) => listOn(d).length === 0).length;
  const apptCount = appts.filter((a) => inMonth(new Date(a.start))).length;

  /* Keep the selection inside the month on screen — a list under the grid
     belonging to a day the grid is not showing is a quiet lie. */
  useEffect(() => {
    if (!cells.some((d) => sameDay(d, selected) && inMonth(d))) {
      const today = startOfDay(new Date());
      setSelected(cells.some((d) => sameDay(d, today) && inMonth(d))
        ? today : monthDays[0] || cells[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, month]);

  const selectedAppts = listOn(selected);
  const now = new Date();

  if (loading) {
    return (
      <div className="py-14 flex justify-center" data-testid="month-loading">
        <Loader2 className="text-teal animate-spin" />
      </div>
    );
  }

  const dowNames = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 1 + i);            // 1 Jan 2024 was a Monday
    return d.toLocaleDateString(lang, { weekday: 'short' });
  });

  return (
    <div data-testid="month-view">
      <WeatherCard weather={weather} status={wxStatus} t={t} />

      <div className="flex gap-1.5 mb-3">
        {[[t('week_appointments'), apptCount, ''],
          [t('week_booked'), durationLabel(totalMinutes * MIN), 'text-teal'],
          [t('week_free_days'), freeDays, 'text-amber-deep']].map(([label, value, tone]) => (
          <div key={label} className="flex-1 rounded-[11px] border border-sm-border bg-paper px-2.5 py-2">
            <p className="font-bold text-[9px] uppercase tracking-wide text-ink-muted">{label}</p>
            <p className={`font-extrabold text-[15px] mt-px ${tone || 'text-ink'}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[12px] border border-sm-border bg-paper p-2" data-testid="month-grid">
        <div className="grid grid-cols-7 gap-[3px] mb-1">
          {dowNames.map((d) => (
            <span key={d} className="text-center font-bold text-[9px] text-ink-faint">{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-[3px]">
          {cells.map((d) => {
            const list = listOn(d);
            const mins = minutesOn(d);
            const out = !inMonth(d);
            const isToday = sameDay(d, now);
            const isSel = sameDay(d, selected);
            const urgent = list.some((a) => a.urgency === 'emergency');
            const pct = Math.min(100, (mins / FULL_DAY_MIN) * 100);
            return (
              <button
                key={dayKey(d)}
                type="button"
                onClick={() => !out && setSelected(d)}
                disabled={out}
                className={`relative rounded-[7px] h-[52px] flex flex-col items-center pt-[3px]
                  ${out ? 'bg-transparent' : isToday ? 'bg-teal/[0.12]' : 'bg-cream-soft'}
                  ${isToday ? 'ring-[1.5px] ring-teal' : ''}
                  ${isSel && !isToday ? 'ring-[1.5px] ring-teal-deep' : ''}`}
                data-testid={`month-cell-${dayKey(d)}`}
                data-minutes={out ? '' : mins}
                aria-pressed={isSel}
              >
                <span className={`font-extrabold text-[11px]
                  ${out ? 'text-ink-faint opacity-50' : 'text-ink'}`}>
                  {d.getDate()}
                </span>

                {!out && mins > 0 && (
                  <>
                    <span className="absolute left-0 right-0 bottom-[25px] text-center
                                     font-extrabold text-[8px] text-ink-soft">
                      {durationLabel(mins * MIN).replace(' min', "'")}
                    </span>
                    <span className="absolute left-[3px] right-[3px] bottom-[3px] h-[20px]
                                     rounded-[3px] bg-cream-deep overflow-hidden flex items-end">
                      <span
                        className={`w-full rounded-[3px] ${urgent ? 'bg-red-warn'
                          : mins >= HEAVY_MIN ? 'bg-teal-deep' : 'bg-teal'}`}
                        style={{ height: `${pct}%` }}
                        data-testid={`month-bar-${dayKey(d)}`}
                      />
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* The bar means nothing without its ceiling — a day at half height
            is four hours only if you know the top is eight. */}
        <div className="flex items-center gap-2.5 mt-2 font-bold text-[9px] text-ink-muted flex-wrap"
             data-testid="month-legend">
          <span className="flex items-center gap-1">
            <i className="w-2.5 h-2.5 rounded-[3px] bg-teal inline-block" /> {t('month_booked')}
          </span>
          <span className="flex items-center gap-1">
            <i className="w-2.5 h-2.5 rounded-[3px] bg-teal-deep inline-block" /> {t('month_full')}
          </span>
          <span className="flex items-center gap-1">
            <i className="w-2.5 h-2.5 rounded-[3px] bg-red-warn inline-block" /> {t('month_emergency')}
          </span>
          <span className="ml-auto">{t('month_scale')}</span>
        </div>
      </div>

      <div className="flex items-baseline gap-2 mt-3.5 mb-1.5">
        <p className="font-headings font-bold text-[12.5px] text-ink" data-testid="month-sel-title">
          {selected.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
        {selectedAppts.length > 0 && (
          <span className="font-bold text-[10.5px] text-ink-muted">
            · {durationLabel(minutesOn(selected) * MIN)}
          </span>
        )}
        <button type="button" onClick={() => onOpenDay?.(selected)}
                className="ml-auto font-bold text-[11px] text-teal min-h-[32px] px-1"
                data-testid="month-open-day">
          {t('week_open_day')}
        </button>
      </div>

      {selectedAppts.length === 0 ? (
        <div className="rounded-[11px] border-[1.5px] border-dashed border-sm-border
                        bg-cream-soft py-3 text-center font-bold text-[11px] text-ink-muted"
             data-testid="month-sel-empty">
          {t('week_day_free')}
        </div>
      ) : selectedAppts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => setOpenJob(a)}
          className={`w-full text-left flex gap-2.5 rounded-[11px] border px-2.5 py-2 mb-1.5
            ${a.urgency === 'emergency'
              ? 'border-red-warn/35 bg-red-warn/[0.04]' : 'border-sm-border bg-paper'}`}
          data-testid={`month-sel-${a.id}`}
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
      ))}

      {openJob && <JobSheet appt={openJob} onClose={() => setOpenJob(null)} t={t} />}
    </div>
  );
}
