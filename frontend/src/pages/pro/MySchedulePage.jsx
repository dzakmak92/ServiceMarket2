import React, { useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import { useAuth } from '../../contexts/AuthContext';
import DayScheduleView from './DayScheduleView';
import WeekScheduleView from './WeekScheduleView';
import MonthScheduleView from './MonthScheduleView';
import { dateLocale } from '../../utils/schedule';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const startOfWeek = (d) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x; };
const startOfMonth = (d) => { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; };

export default function MySchedulePage() {
  const { t, lang } = useLang();
  const loc = dateLocale(lang);
  const { user } = useAuth();
  const [view, setView] = useState('day');
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));

  const shiftDay = (n) => setDay((d) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; });
  const isToday = day.toDateString() === new Date().toDateString();

  /* The segmented switch is the only way between the three, so it is rendered
     before anything that can be in a loading state — a control that vanishes
     while data arrives cannot be used to leave the view that is loading. */
  const switcher = (
    <div className="flex bg-cream-deep rounded-[11px] p-[3px] gap-[3px] mb-3" data-testid="schedule-switch">
      {[['day', t('sched_day')], ['week', t('sched_week')], ['month', t('sched_month')]].map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => setView(k)}
          className={`flex-1 min-h-[44px] rounded-[9px] font-bold text-[12px] transition-colors
            ${view === k ? 'bg-paper text-teal shadow-sm' : 'text-ink-muted'}`}
          data-testid={`schedule-switch-${k}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (view === 'day') {
    return (
      <div className="min-h-screen bg-cream pb-24 md:pb-12" data-testid="pm-schedule-page">
        <div className="page-container py-6 max-w-2xl">
          <div className="mb-4">
            <h1 className="text-2xl font-headings font-bold text-ink flex items-center gap-2">
              <CalendarDays size={22} className="text-teal" /> {t('nav_schedule')}
            </h1>
            <p className="text-sm text-ink-muted">
              {day.toLocaleDateString(loc,
                { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          {switcher}
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => shiftDay(-1)} className="btn-ghost text-xs min-h-[44px] min-w-[44px] px-3"
                    data-testid="day-prev" aria-label={t('nav_prev_day')}><ChevronLeft size={15} /></button>
            <p className="text-sm font-headings font-bold text-ink">
              {day.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <div className="flex gap-1">
              {!isToday && (
                <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDay(d); }}
                        className="btn-ghost text-xs min-h-[44px] min-w-[44px] px-3" data-testid="day-today">
                  {t('pm_schedule_today')}
                </button>
              )}
              <button onClick={() => shiftDay(1)} className="btn-ghost text-xs min-h-[44px] min-w-[44px] px-3"
                      data-testid="day-next" aria-label={t('nav_next_day')}><ChevronRight size={15} /></button>
            </div>
          </div>
          <DayScheduleView date={day} onDateChange={setDay} proName={user?.name || ''} />
        </div>
      </div>
    );
  }

  if (view === 'month') {
    const shiftMonth = (n) => setMonthStart((m) => {
      const x = new Date(m); x.setMonth(x.getMonth() + n); return x;
    });
    const thisMonth = monthStart.getTime() === startOfMonth(new Date()).getTime();
    const monthLabel = monthStart.toLocaleDateString(loc, { month: 'long', year: 'numeric' });

    return (
      <div className="min-h-screen bg-cream pb-24 md:pb-12" data-testid="pm-schedule-page">
        <div className="page-container py-6 max-w-2xl">
          <div className="mb-4">
            <h1 className="text-2xl font-headings font-bold text-ink flex items-center gap-2">
              <CalendarDays size={22} className="text-teal" /> {t('nav_schedule')}
            </h1>
            <p className="text-sm text-ink-muted">{monthLabel}</p>
          </div>
          {switcher}
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => shiftMonth(-1)} className="btn-ghost text-xs min-h-[44px] min-w-[44px] px-3"
                    data-testid="month-prev" aria-label={t('nav_prev_month')}><ChevronLeft size={15} /></button>
            <p className="text-sm font-headings font-bold text-ink">{monthLabel}</p>
            <div className="flex gap-1">
              {!thisMonth && (
                <button onClick={() => setMonthStart(startOfMonth(new Date()))}
                        className="btn-ghost text-xs min-h-[44px] min-w-[44px] px-3" data-testid="month-today">
                  {t('pm_schedule_today')}
                </button>
              )}
              <button onClick={() => shiftMonth(1)} className="btn-ghost text-xs min-h-[44px] min-w-[44px] px-3"
                      data-testid="month-next" aria-label={t('nav_next_month')}><ChevronRight size={15} /></button>
            </div>
          </div>
          <MonthScheduleView
            monthStart={monthStart}
            onOpenDay={(d) => { setDay(d); setView('day'); }}
            t={t}
            lang={loc}
          />
        </div>
      </div>
    );
  }

  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const shiftWeek = (n) => setWeekStart((w) => { const x = new Date(w); x.setDate(x.getDate() + n * 7); return x; });
  const thisWeek = weekStart.getTime() === startOfWeek(new Date()).getTime();

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12" data-testid="pm-schedule-page">
      <div className="page-container py-6 max-w-2xl">
        <div className="mb-4">
          <h1 className="text-2xl font-headings font-bold text-ink flex items-center gap-2">
            <CalendarDays size={22} className="text-teal" /> {t('nav_schedule')}
          </h1>
          <p className="text-sm text-ink-muted">
            {weekStart.toLocaleDateString(loc, { day: 'numeric', month: 'short' })} –{' '}
            {weekEnd.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {switcher}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => shiftWeek(-1)} className="btn-ghost text-xs min-h-[44px] min-w-[44px] px-3"
                  data-testid="week-prev" aria-label={t('nav_prev_week')}><ChevronLeft size={15} /></button>
          <p className="text-sm font-headings font-bold text-ink">
            {weekStart.toLocaleDateString(loc, { day: 'numeric', month: 'short' })} –{' '}
            {weekEnd.toLocaleDateString(loc, { day: 'numeric', month: 'short' })}
          </p>
          <div className="flex gap-1">
            {!thisWeek && (
              <button onClick={() => setWeekStart(startOfWeek(new Date()))}
                      className="btn-ghost text-xs min-h-[44px] min-w-[44px] px-3" data-testid="week-today">
                {t('pm_schedule_today')}
              </button>
            )}
            <button onClick={() => shiftWeek(1)} className="btn-ghost text-xs min-h-[44px] min-w-[44px] px-3"
                    data-testid="week-next" aria-label={t('nav_next_week')}><ChevronRight size={15} /></button>
          </div>
        </div>
        <WeekScheduleView
          weekStart={weekStart}
          onOpenDay={(d) => { setDay(d); setView('day'); }}
          t={t}
          lang={loc}
        />
      </div>
    </div>
  );
}
