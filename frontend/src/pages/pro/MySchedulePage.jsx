import React, { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLang } from '../../contexts/LangContext';
import { useAuth } from '../../contexts/AuthContext';
import DayScheduleView from './DayScheduleView';
import WeekScheduleView from './WeekScheduleView';
import MonthScheduleView from './MonthScheduleView';
import { dateLocale, dayKey } from '../../utils/schedule';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * The calendar's state lives in the URL.
 *
 * It used to live in three separate `useState`s — `day`, `weekStart`,
 * `monthStart` — and that one decision caused four separate defects:
 *
 *  · There was no URL that meant "27 August", so a day could not be
 *    bookmarked, shared, or reopened. With no date picker either, reaching a
 *    date a year out took six hundred taps on the arrow.
 *  · One browser Back left the calendar entirely and landed on the
 *    dashboard, because none of the navigation had pushed a history entry.
 *    Forward came back to /schedule reset to today.
 *  · Opening a job's project page and returning lost the date.
 *  · The three views each remembered their own date and never agreed. Paging
 *    to March in the month view and tapping "Day" dropped you seven months
 *    back onto whatever day you last looked at.
 *
 * One `date` in the query string fixes all four: the day view shows that
 * date, the week view the week holding it, the month view the month holding
 * it. Switching views cannot disagree with itself because there is only one
 * date to disagree about.
 */

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (d) => {
  const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x;
};
const startOfMonth = (d) => { const x = startOfDay(d); x.setDate(1); return x; };

const VIEWS = ['day', 'week', 'month'];

/** A YYYY-MM-DD from the query string as a *local* midnight.
 *  `new Date('2026-08-27')` parses as UTC, which is the previous day
 *  anywhere west of Greenwich — the same trap `dayKey` exists to avoid. */
function parseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function MySchedulePage() {
  const { t, lang } = useLang();
  const loc = dateLocale(lang);
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const view = VIEWS.includes(params.get('view')) ? params.get('view') : 'day';
  const date = useMemo(() => parseDate(params.get('date')) || startOfDay(new Date()),
    [params]);

  /* `replace` for corrections that are not navigation — landing on the page,
     or a view switch that keeps the same date — so Back does not have to
     walk through states the pro never chose. Moving the date is real
     navigation and pushes. */
  const go = useCallback((next, { replace = false } = {}) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next.view) p.set('view', next.view);
      if (next.date) p.set('date', dayKey(next.date));
      return p;
    }, { replace });
  }, [setParams]);

  const setView = (v) => go({ view: v, date }, { replace: true });
  const setDate = (d) => go({ view, date: d });
  const shift = (n, unit) => {
    const x = new Date(date);
    if (unit === 'day') x.setDate(x.getDate() + n);
    if (unit === 'week') x.setDate(x.getDate() + n * 7);
    /* Clamp to the last day of the shorter month rather than letting
       31 January + 1 month roll into March. */
    if (unit === 'month') {
      const day = x.getDate();
      x.setDate(1);
      x.setMonth(x.getMonth() + n);
      x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
    }
    setDate(x);
  };

  const today = startOfDay(new Date());
  const weekStart = startOfWeek(date);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const monthStart = startOfMonth(date);

  const isNow = view === 'day' ? dayKey(date) === dayKey(today)
    : view === 'week' ? weekStart.getTime() === startOfWeek(today).getTime()
      : monthStart.getTime() === startOfMonth(today).getTime();

  const subtitle = view === 'day'
    ? date.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })
    : view === 'month'
      ? monthStart.toLocaleDateString(loc, { month: 'long', year: 'numeric' })
      : `${weekStart.toLocaleDateString(loc, { day: 'numeric', month: 'short' })} – `
        + `${weekEnd.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' })}`;

  const navLabel = view === 'day'
    ? date.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' })
    : view === 'month'
      ? monthStart.toLocaleDateString(loc, { month: 'long', year: 'numeric' })
      : `${weekStart.toLocaleDateString(loc, { day: 'numeric', month: 'short' })} – `
        + `${weekEnd.toLocaleDateString(loc, { day: 'numeric', month: 'short' })}`;

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12" data-testid="pm-schedule-page">
      <div className="page-container py-6 max-w-2xl">
        <div className="mb-4">
          <h1 className="text-2xl font-headings font-bold text-ink flex items-center gap-2">
            <CalendarDays size={22} className="text-teal" /> {t('nav_schedule')}
          </h1>
          <p className="text-sm text-ink-muted" data-testid="schedule-subtitle">{subtitle}</p>
        </div>

        {/* The segmented switch is the only way between the three, so it is
            rendered before anything that can be in a loading state — a
            control that vanishes while data arrives cannot be used to leave
            the view that is loading. */}
        <div className="flex bg-cream-deep rounded-[11px] p-[3px] gap-[3px] mb-3"
             data-testid="schedule-switch">
          {VIEWS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              className={`flex-1 min-h-[44px] rounded-[9px] font-bold text-[0.75rem] transition-colors
                ${view === k ? 'bg-paper text-teal shadow-sm' : 'text-ink-muted'}`}
              data-testid={`schedule-switch-${k}`}
              aria-pressed={view === k}
            >
              {t(`sched_${k}`)}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-1 mb-3">
          <button onClick={() => shift(-1, view)}
                  className="btn-ghost text-xs min-h-[44px] min-w-[44px] px-3 flex-none"
                  data-testid={`${view}-prev`} aria-label={t(`nav_prev_${view}`)}>
            <ChevronLeft size={15} />
          </button>

          {/* The label is the date picker. There was no way to reach a far
              date but the arrow — one agent needed six hundred taps to get to
              March 2028 — and a native date input is keyboard-accessible and
              localised by the platform for free. */}
          <label className="relative flex-1 min-w-0 flex items-center justify-center
                            min-h-[44px] cursor-pointer">
            <span className="text-sm font-headings font-bold text-ink truncate px-1"
                  data-testid="schedule-nav-label">
              {navLabel}
            </span>
            <input
              type="date"
              value={dayKey(date)}
              onChange={(e) => { const d = parseDate(e.target.value); if (d) setDate(d); }}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label={t('sched_pick_date')}
              data-testid="schedule-date-input"
            />
          </label>

          <div className="flex gap-1 flex-none">
            {!isNow && (
              <button onClick={() => setDate(today)}
                      className="btn-ghost text-xs min-h-[44px] px-3" data-testid={`${view}-today`}>
                {t('pm_schedule_today')}
              </button>
            )}
            <button onClick={() => shift(1, view)}
                    className="btn-ghost text-xs min-h-[44px] min-w-[44px] px-3"
                    data-testid={`${view}-next`} aria-label={t(`nav_next_${view}`)}>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {view === 'day' && (
          <DayScheduleView date={date} onDateChange={setDate} proName={user?.name || ''} />
        )}
        {view === 'week' && (
          <WeekScheduleView
            weekStart={weekStart}
            selectedDate={date}
            /* Selecting a day inside the grid replaces rather than pushes —
               it is choosing where to look, not navigating, and a history
               entry per tap would bury the way back. */
            onSelectDate={(d) => go({ view, date: d }, { replace: true })}
            onOpenDay={(d) => go({ view: 'day', date: d })}
            t={t}
            lang={loc}
          />
        )}
        {view === 'month' && (
          <MonthScheduleView
            monthStart={monthStart}
            selectedDate={date}
            onSelectDate={(d) => go({ view, date: d }, { replace: true })}
            onOpenDay={(d) => go({ view: 'day', date: d })}
            t={t}
            lang={loc}
          />
        )}
      </div>
    </div>
  );
}
