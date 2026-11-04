import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import { moneyLocale } from '../../utils/money';
import useJobAction from '../../hooks/useJobAction';
import SkeletonList from '../../components/motion/SkeletonList';
import { SKINS } from '../../components/pro/JobOverview';
import { WeekStrip, DayPanel, DayCard, EmptyDay } from '../../components/pro/HomeDay';

/**
 * Startseite, design D1 (H1c base, only the chosen day framed).
 *
 *   greeting → this week, Mon to Sun → the chosen day (today by default)
 *   opens like a tab into its schedule → one slim card per appointment.
 *
 * Tapping another day swaps the schedule and the cards. The six steps of the
 * work live on Werkzeuge, the second tab of the bottom bar.
 */

const DAY = 86400000;
const LIVE = ['accepted', 'scheduled', 'in_progress'];

function greetingKey() {
  const h = new Date().getHours();
  if (h < 11) return 'home_hi_morning';
  if (h < 18) return 'home_hi_day';
  return 'home_hi_evening';
}

function mondayOf(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export default function ProHomePage() {
  const { user } = useAuth();
  const { t } = useLang();

  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const todayKey = new Date().toDateString();
  const todayIdx = (new Date().getDay() + 6) % 7;
  const [sel, setSel] = useState(todayIdx);

  const load = useCallback(async () => {
    const [p, j] = await Promise.all([
      api.get('/api/profile/pro').catch(() => null),
      api.get('/api/jobs', { params: { limit: 200 } }).catch(() => null),
    ]);
    setProfile(p?.data || null);
    setJobs(j?.data?.jobs || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const act = useJobAction({ t, onChanged: () => load() });

  /* The week, Monday first, each day with its appointments in time order. */
  const week = useMemo(() => {
    const first = mondayOf(new Date(todayKey));
    const lists = [[], [], [], [], [], [], []];
    for (const j of jobs) {
      if (!j.scheduled_start || j.status === 'cancelled') continue;
      const d = new Date(j.scheduled_start);
      if (Number.isNaN(+d)) continue;
      const off = Math.floor((+new Date(d.getFullYear(), d.getMonth(), d.getDate()) - +first) / DAY);
      if (off >= 0 && off < 7) lists[off].push(j);
    }
    lists.forEach((l) => l.sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start)));
    const loc = moneyLocale();
    return lists.map((list, i) => {
      const d = new Date(first); d.setDate(d.getDate() + i);
      return {
        key: d.toDateString(), n: d.getDate(), count: list.length, list,
        today: i === todayIdx, past: i < todayIdx,
        lbl: d.toLocaleDateString(loc, { weekday: 'short' }).replace('.', ''),
        long: d.toLocaleDateString(loc, { weekday: 'long' }),
      };
    });
  }, [jobs, todayKey, todayIdx]);

  /* A job that is running belongs on today's list even when it was booked
     for another day: it is the thing the pro is doing now. */
  const running = useMemo(() => jobs.filter((j) => j.status === 'in_progress'), [jobs]);
  const late = useMemo(() => jobs.filter((j) => LIVE.includes(j.status) && j.status !== 'in_progress'
    && j.scheduled_start && +new Date(j.scheduled_start) < Date.now() - 3600000
    && new Date(j.scheduled_start).toDateString() !== todayKey), [jobs, todayKey]);
  const unplanned = useMemo(() => jobs.filter((j) => LIVE.includes(j.status) && !j.scheduled_start).length, [jobs]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper pb-28">
        <div className="page-container max-w-3xl py-6"><SkeletonList rows={5} /></div>
      </div>
    );
  }

  const name = profile?.business_name || user?.name || '';
  const day = week[sel];
  const isToday = sel === todayIdx;
  const extra = isToday ? running.filter((r) => !day.list.some((j) => j.id === r.id)) : [];
  const cards = [...extra, ...day.list];

  return (
    <div className="min-h-screen bg-paper pb-28 md:pb-10">
      <div className="page-container max-w-3xl py-4 grid gap-4">
        {/* ── greeting ─────────────────────────────────────────── */}
        <header className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-[15px] grid place-items-center text-paper font-headings font-bold text-[18px] shrink-0"
                style={{ background: SKINS.jobs.grad, boxShadow: '0 6px 14px rgba(30,84,144,.3)' }} aria-hidden="true">
            {(name || '?').trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-ink-muted truncate">
              {new Date().toLocaleDateString(moneyLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="font-headings font-bold text-ink text-[21px] leading-tight truncate" data-testid="home-hi">
              {t(greetingKey())}
            </h1>
          </div>
          <Link to="/schedule" data-testid="home-calendar" aria-label={t('home_calendar')} title={t('home_calendar')}
                className="w-10 h-10 rounded-xl grid place-items-center shrink-0 text-ink"
                style={{ background: '#f3f6f9' }}>
            <CalendarDays size={18} aria-hidden="true" />
          </Link>
        </header>

        {/* ── the week, the chosen day opening into its schedule ─ */}
        <section className="grid" data-testid="home-weekday">
          <WeekStrip days={week} sel={sel} onPick={setSel} t={t} />
          <DayPanel day={day} jobs={day.list} sel={sel} isToday={isToday} t={t} />
        </section>

        {/* ── the day's appointments ───────────────────────────── */}
        <section className="grid gap-2" data-testid="home-day-list">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-baseline gap-2 font-headings font-bold text-[16px] text-ink min-w-0">
              {isToday ? t('home_day_list_today') : t('home_day_list', { d: day.long })}
              {cards.length > 0 && <span className="text-[13px] font-semibold text-ink-muted tabular-nums">{cards.length}</span>}
            </h2>
            {/* Appointments from earlier days that never started: they no
                longer sit under any day you would look at, so say so here. */}
            {late.length > 0 && (
              <Link to="/projects?mode=simple" data-testid="home-late"
                    className="text-[11.5px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap shrink-0"
                    style={{ background: '#fdeef0', color: '#c14655', border: '1px solid #efc3c9' }}>
                {t('home_late_before', { n: late.length })}
              </Link>
            )}
          </div>
          {cards.length ? (
            <div className="grid gap-2">
              {cards.map((j) => <DayCard key={j.id} j={j} t={t} act={act} />)}
            </div>
          ) : (
            <EmptyDay isToday={isToday} unplanned={unplanned} t={t} />
          )}
        </section>
      </div>
    </div>
  );
}
