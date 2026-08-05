import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WeatherCard from '../../components/pro/WeatherCard';
import JobSheet from '../../components/pro/JobSheet';
import LoadFailed from '../../components/pro/LoadFailed';
import useWeather from '../../hooks/useWeather';
import useAppointments from '../../hooks/useAppointments';
import useJobAction from '../../hooks/useJobAction';
import {
  HALF_DAY_MIN, MIN, dayKey, durationLabel, halvesOf, hhmm, toMs,
} from '../../utils/schedule';
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

/* A full day, for the summary tile above the grid. The cells themselves are
   measured in halves — see HALF_DAY_MIN in utils/schedule. */
const FULL_DAY_MIN = 8 * 60;

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

export default function MonthScheduleView({
  monthStart, selectedDate, onSelectDate, onOpenDay, t, lang = 'de-AT',
}) {
  /* Declared before the fetch that reads it: a `const` referenced above
     its own declaration is a TDZ crash at render, not a warning. */
  const from = useMemo(() => gridStart(monthStart), [monthStart]);

  /* Shared, so the last request always wins — see useAppointments. */
  const { appointments: appts, loading, failed, reload: load } = useAppointments(from, CELLS);
  /* The selected day is the page's date, so the grid, the list under it and
     the URL can never disagree. The local state is only a fallback for a
     caller that does not control it. */
  const [ownSelected, setOwnSelected] = useState(() => startOfDay(new Date()));
  const selected = selectedDate ? startOfDay(selectedDate) : ownSelected;
  const setSelected = (d) => (onSelectDate ? onSelectDate(d) : setOwnSelected(d));
  const [openJob, setOpenJob] = useState(null);
  const selRef = useRef(null);
  const gridFocused = useRef(false);
  const { weather, status: wxStatus } = useWeather(7);
  /* Same handler the day view uses. Without it the sheet's Start /
     Finish button was inert here. */
  const runAction = useJobAction({ t, onChanged: () => load() });

  const cells = useMemo(() => Array.from({ length: CELLS }, (_, i) => {
    const d = new Date(from); d.setDate(from.getDate() + i);
    return d;
  }), [from]);

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
    /* When the caller owns the date, the month on screen is derived from it
       and the selection is inside it by construction — correcting it here
       would fight the URL. */
    if (onSelectDate) return;
    if (!cells.some((d) => sameDay(d, selected) && inMonth(d))) {
      const today = startOfDay(new Date());
      setOwnSelected(cells.some((d) => sameDay(d, today) && inMonth(d))
        ? today : monthDays[0] || cells[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, month, onSelectDate]);

  /* Move the browser's focus with the selection, but only when the grid
     already had it — otherwise arrowing on some other control would yank
     focus into the calendar. */
  useEffect(() => {
    if (gridFocused.current) selRef.current?.focus();
  }, [selected]);

  const selectedAppts = listOn(selected);
  const now = new Date();

  /* Arrow keys walk the grid the way they walk a calendar: a day sideways, a
     week up or down. Home and End reach the ends of the week. */
  const onGridKey = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const dow = (selected.getDay() + 6) % 7;
    const jump = e.key === 'Home' ? -dow : e.key === 'End' ? 6 - dow : null;
    if (step == null && jump == null) return;
    e.preventDefault();
    const next = new Date(selected);
    next.setDate(next.getDate() + (step ?? jump));
    /* Only inside the month on screen — stepping off the edge would select a
       day the grid is not showing. */
    if (cells.some((c) => sameDay(c, next) && c.getMonth() === month)) setSelected(next);
  };

  if (loading) {
    return (
      <div className="py-14 flex justify-center" data-testid="month-loading"
           role="status" aria-live="polite" aria-label={t('ui_loading')}>
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
      {failed && <LoadFailed onRetry={load} t={t} />}
      {/* The week and the month look ahead, so the card does too. The
          day view does not — it has a date navigator of its own, and two
          ways to change the day inside one screen can disagree. */}
      <WeatherCard weather={weather} status={wxStatus} t={t} lang={lang} outlook />

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

        <div className="grid grid-cols-7 gap-[3px]" role="grid"
             onFocus={() => { gridFocused.current = true; }}
             onBlur={(e) => {
               if (!e.currentTarget.contains(e.relatedTarget)) gridFocused.current = false;
             }}>
          {cells.map((d) => {
            const list = listOn(d);
            const mins = minutesOn(d);
            const out = !inMonth(d);
            const isToday = sameDay(d, now);
            const isSel = sameDay(d, selected);
            const urgent = list.some((a) => a.urgency === 'emergency');
            const { am, pm } = halvesOf(list, d);
            return (
              <button
                key={dayKey(d)}
                type="button"
                onClick={() => !out && setSelected(d)}
                disabled={out}
                /* One tab stop for the whole grid, arrows to move inside it.
                   Thirty-one consecutive tab stops stood between the top of
                   the page and the day list underneath. */
                tabIndex={out || !isSel ? -1 : 0}
                ref={isSel ? selRef : undefined}
                onKeyDown={onGridKey}
                /* The bar is the entire point of this view and it is pure
                   geometry — no text, no label, nothing for a screen reader.
                   The name carries the date and the load in words. */
                /* The bars are pure geometry — no text, nothing for a screen
                   reader — so the name says the same thing in words, and now
                   says it per half-day, because that is what the cell draws. */
                aria-label={(mins > 0
                  ? t('month_cell_label')
                      .replace('{hours}', durationLabel(mins * MIN))
                      .replace('{am}', durationLabel(am * MIN))
                      .replace('{pm}', durationLabel(pm * MIN))
                  : t('month_cell_free'))
                  .replace('{date}', d.toLocaleDateString(lang,
                    { weekday: 'long', day: 'numeric', month: 'long' }))}
                className={`relative rounded-[7px] h-[52px] flex flex-col items-center pt-[3px]
                  ${out ? 'bg-transparent' : isToday ? 'bg-teal/[0.12]' : 'bg-cream-soft'}
                  ${isToday ? 'ring-[1.5px] ring-teal' : ''}
                  ${isSel && !isToday ? 'ring-[1.5px] ring-teal-deep' : ''}`}
                data-testid={`month-cell-${dayKey(d)}`}
                data-minutes={out ? '' : mins}
                data-am={out ? '' : am}
                data-pm={out ? '' : pm}
                aria-pressed={isSel}
              >
                <span className={`font-extrabold text-[11px]
                  ${out ? 'text-ink-faint opacity-50' : 'text-ink'}`}>
                  {d.getDate()}
                </span>

                {!out && (
                  <span className="absolute left-[4px] right-[4px] bottom-[5px]
                                   flex flex-col gap-[3px]">
                    {/* Morning over afternoon, each full at four hours. Two
                        bars rather than one total, because "is Thursday
                        afternoon free" is a question asked out loud on the
                        phone and a single load bar cannot answer it. Always
                        drawn, even empty: a missing track would make a free
                        day look like a day with no data. */}
                    {[[am, urgent ? 'bg-red-warn' : 'bg-teal', 'am'],
                      [pm, urgent ? 'bg-red-warn' : 'bg-amber-deep', 'pm']].map(
                      ([v, tone, half]) => (
                        <span key={half}
                              className="h-[6px] rounded-[3px] bg-cream-deep overflow-hidden block">
                          <span
                            className={`block h-full rounded-[3px] ${tone}`}
                            style={{ width: `${Math.min(100, (v / HALF_DAY_MIN) * 100)}%` }}
                            data-testid={`month-${half}-${dayKey(d)}`}
                          />
                        </span>
                      ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Two bars mean nothing without saying which is which, or where
            they end — a half-full bar is two hours only if you know the top
            is four. */}
        <div className="flex items-center gap-2.5 mt-2 font-bold text-[9px] text-ink-muted flex-wrap"
             data-testid="month-legend">
          <span className="flex items-center gap-1">
            <i className="w-2.5 h-2.5 rounded-[3px] bg-teal inline-block" /> {t('month_morning')}
          </span>
          <span className="flex items-center gap-1">
            <i className="w-2.5 h-2.5 rounded-[3px] bg-amber-deep inline-block" /> {t('month_afternoon')}
          </span>
          <span className="flex items-center gap-1">
            <i className="w-2.5 h-2.5 rounded-[3px] bg-red-warn inline-block" /> {t('month_emergency')}
          </span>
          <span className="ml-auto">{t('month_half_scale')}</span>
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
                className="ml-auto font-bold text-[11px] text-teal min-h-[44px] px-2
                        flex items-center"
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
