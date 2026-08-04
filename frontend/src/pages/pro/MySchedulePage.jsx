import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import { useAuth } from '../../contexts/AuthContext';
import DayScheduleView from './DayScheduleView';
import {
  Loader2, CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Users, CheckCircle2,
} from 'lucide-react';

const PROJECT_COLORS = ['#18a999', '#f5b942', '#7c6cf0', '#e8615a', '#3b9ad9', '#d97aa6', '#5aa469'];
const dayKey = (d) => d.toISOString().slice(0, 10);
const startOfWeek = (d) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x; };

export default function MySchedulePage() {
  const { t } = useLang();
  const { user } = useAuth();
  const [view, setView] = useState('day');
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [crewFilter, setCrewFilter] = useState('all');

  useEffect(() => {
    if (view !== 'week') { setLoading(false); return; }
    api.get('/api/jobs/schedule').then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [view]);

  const colorFor = useMemo(() => {
    const map = {};
    (data?.tasks || []).forEach((tk) => {
      if (!(tk.project_id in map)) map[tk.project_id] = PROJECT_COLORS[Object.keys(map).length % PROJECT_COLORS.length];
    });
    return map;
  }, [data]);

  const shiftDay = (n) => setDay((d) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; });
  const isToday = day.toDateString() === new Date().toDateString();

  /* The segmented switch is the only way between the two, so it is rendered
     before anything that can be in a loading state — a control that vanishes
     while data arrives cannot be used to leave the view that is loading. */
  const switcher = (
    <div className="flex bg-cream-deep rounded-[11px] p-[3px] gap-[3px] mb-3" data-testid="schedule-switch">
      {[['day', t('sched_day')], ['week', t('sched_week')]].map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => setView(k)}
          className={`flex-1 min-h-[38px] rounded-[9px] font-bold text-[12px] transition-colors
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
              {day.toLocaleDateString('de-AT',
                { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          {switcher}
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => shiftDay(-1)} className="btn-ghost text-xs min-h-[38px] px-3"
                    data-testid="day-prev" aria-label="prev"><ChevronLeft size={15} /></button>
            <p className="text-sm font-headings font-bold text-ink">
              {day.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <div className="flex gap-1">
              {!isToday && (
                <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDay(d); }}
                        className="btn-ghost text-xs min-h-[38px] px-3" data-testid="day-today">
                  {t('pm_schedule_today')}
                </button>
              )}
              <button onClick={() => shiftDay(1)} className="btn-ghost text-xs min-h-[38px] px-3"
                      data-testid="day-next" aria-label="next"><ChevronRight size={15} /></button>
            </div>
          </div>
          <DayScheduleView date={day} onDateChange={setDay} proName={user?.name || ''} />
        </div>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 className="text-teal animate-spin" /></div>;

  const allTasks = data?.tasks || [];
  const filtered = allTasks.filter((tk) => {
    if (crewFilter === 'all') return true;
    if (crewFilter === '__none') return !tk.assignee;
    return tk.assignee === crewFilter;
  });

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);

  const tasksForDay = (day) => {
    const ds = new Date(day); ds.setHours(0, 0, 0, 0);
    const de = new Date(day); de.setHours(23, 59, 59, 999);
    return filtered.filter((tk) => {
      const s = tk.start_at ? new Date(tk.start_at) : (tk.due_at ? new Date(tk.due_at) : null);
      const e = tk.due_at ? new Date(tk.due_at) : s;
      if (!s) return false;
      return s <= de && e >= ds;
    });
  };

  const todayKey = dayKey(new Date());
  const conflictCount = data?.conflicts?.length || 0;

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12" data-testid="pm-schedule-page">
      <div className="page-container py-6 max-w-5xl">
        {switcher}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h1 className="text-2xl font-headings font-bold text-ink flex items-center gap-2"><CalendarDays size={22} className="text-teal" /> {t('pm_schedule_title')}</h1>
            <p className="text-sm text-ink-muted">{t('pm_schedule_sub')}</p>
          </div>
          {conflictCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-red-warn/15 text-red-warn" data-testid="pm-schedule-conflicts">
              <AlertTriangle size={13} /> {conflictCount} {t('pm_schedule_conflicts')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-green-pos/15 text-green-pos" data-testid="pm-schedule-noconflicts">
              <CheckCircle2 size={13} /> {t('pm_schedule_no_conflicts')}
            </span>
          )}
        </div>

        {/* Crew filter */}
        {data?.crew?.length > 0 && (
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1" data-testid="pm-schedule-crew">
            <Users size={14} className="text-ink-muted flex-shrink-0" />
            {['all', ...data.crew, '__none'].map((c) => (
              <button
                key={c}
                onClick={() => setCrewFilter(c)}
                className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition-colors ${crewFilter === c ? 'bg-teal text-paper' : 'bg-paper border border-sm-border text-ink-muted hover:bg-cream-deep'}`}
                data-testid={`pm-schedule-crew-${c}`}
              >
                {c === 'all' ? t('pm_schedule_all') : c === '__none' ? t('pm_schedule_unassigned') : c}
              </button>
            ))}
          </div>
        )}

        {/* Week nav */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }} className="btn-ghost text-xs" data-testid="pm-schedule-prev"><ChevronLeft size={14} /></button>
          <p className="text-sm font-headings font-bold text-ink">{weekStart.toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })} – {new Date(weekEnd - 1).toLocaleDateString('de-AT', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          <div className="flex gap-1">
            <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="btn-ghost text-xs" data-testid="pm-schedule-today">{t('pm_schedule_today')}</button>
            <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }} className="btn-ghost text-xs" data-testid="pm-schedule-next"><ChevronRight size={14} /></button>
          </div>
        </div>

        {allTasks.length === 0 ? (
          <div className="card-lg text-center py-10" data-testid="pm-schedule-empty">
            <CalendarDays size={28} className="text-ink-muted mx-auto mb-2" />
            <p className="text-sm text-ink-muted">{t('pm_schedule_empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
            {days.map((day) => {
              const dayTasks = tasksForDay(day);
              const isToday = dayKey(day) === todayKey;
              return (
                <div key={dayKey(day)} className={`rounded-[12px] border p-2 min-h-[120px] ${isToday ? 'border-teal bg-teal/5' : 'border-sm-border bg-paper'}`} data-testid={`pm-schedule-day-${dayKey(day)}`}>
                  <p className={`text-[11px] font-bold mb-2 ${isToday ? 'text-teal' : 'text-ink-muted'}`}>
                    {day.toLocaleDateString('de-AT', { weekday: 'short' })} {day.getDate()}
                  </p>
                  <div className="space-y-1.5">
                    {dayTasks.map((tk) => (
                      <Link
                        key={tk.id + dayKey(day)}
                        to={`/projects/${tk.project_id}`}
                        className="block rounded-[8px] px-2 py-1.5 text-paper text-[11px] leading-tight relative"
                        style={{ background: colorFor[tk.project_id] }}
                        data-testid={`pm-schedule-task-${tk.id}`}
                        title={`${tk.project_title} · ${tk.title}`}
                      >
                        <span className="block font-semibold truncate">{tk.title}</span>
                        <span className="block opacity-80 truncate">{tk.assignee || tk.project_title}</span>
                        {tk.conflict && (
                          <span className="absolute -top-1 -right-1 bg-red-warn text-paper rounded-full w-4 h-4 flex items-center justify-center" title={t('pm_schedule_conflict_badge')}>
                            <AlertTriangle size={9} />
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
