import React from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, Calculator, CalendarPlus, Check, CornerUpRight, Phone, Play, Receipt,
} from 'lucide-react';
import TradeMark from '../TradeMark';
import { fmtEur } from '../../utils/money';
import { stepStates } from '../../utils/jobSteps';
import { routeHref } from '../../utils/maps';
import { telHref } from '../../utils/sms';
import { tradeOf } from '../../utils/trade';

/**
 * Startseite D1: the week, the chosen day and that day's jobs.
 *
 *   week strip  →  the chosen day opens like a tab into its schedule  →
 *   one slim card per appointment.
 *
 * Only the chosen day is framed. It and the schedule below share one 2 px
 * navy outline, so the eye reads "this day, and this is what is in it" as a
 * single shape. The other days stand free.
 */

const NAVY = '#1e5490';
const GRAD = 'radial-gradient(120% 200% at 100% 0%, #2f74b8 0%, #1e5490 55%, #173a5e 100%)';

export const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const hours = (d) => d.getHours() + d.getMinutes() / 60;

/** The end of an appointment: its own end, or an hour after it starts. */
export function endOf(j) {
  const s = new Date(j.scheduled_start);
  const e = j.scheduled_end ? new Date(j.scheduled_end) : null;
  return e && +e > +s ? e : new Date(+s + 3600000);
}

/** Where an appointment ends on its own day's ruler (24 if it runs past midnight). */
function endHour(j) {
  const s = new Date(j.scheduled_start);
  const e = endOf(j);
  return e.toDateString() === s.toDateString() ? hours(e) : 24;
}

/* ── the week strip ───────────────────────────────────────────────────── */

export function WeekStrip({ days, sel, onPick, t }) {
  return (
    <div className="grid grid-cols-7 gap-1 relative z-[1]" role="tablist" aria-label={t('home_week_aria')}
         data-testid="home-week">
      {days.map((d, i) => {
        const on = i === sel;
        const past = d.past && !on;
        return (
          <button key={d.key} type="button" role="tab" aria-selected={on} onClick={() => onPick(i)}
                  data-testid={`home-day-${i}`} data-today={d.today ? 'yes' : 'no'}
                  aria-label={`${d.long}, ${d.n}. ${d.count ? t(d.count === 1 ? 'home_day_n_one' : 'home_day_n', { n: d.count }) : t('home_day_free')}`}
                  className="grid justify-items-center content-center gap-[3px] min-h-[64px] transition-colors duration-ui"
                  style={on
                    ? { background: '#fff', border: `2px solid ${NAVY}`, borderBottom: 0,
                        borderRadius: '14px 14px 0 0', marginBottom: -2, paddingBottom: 12 }
                    : { borderRadius: 14 }}>
            <span className="text-[10.5px] font-semibold"
                  style={{ color: on ? NAVY : past ? '#9aa8b4' : '#6f8090' }}>{d.lbl}</span>
            <b className="font-headings text-[17px] font-semibold leading-none tabular-nums"
               style={{ color: on ? NAVY : past ? '#9aa8b4' : d.today ? NAVY : '#1a3a52' }}>
              {d.n}
            </b>
            <span className="flex gap-[2px] h-1" aria-hidden="true">
              {Array.from({ length: Math.min(d.count, 5) }, (_, k) => (
                <i key={k} className="w-1 h-1 rounded-[2px]"
                   style={{ background: on ? NAVY : past ? '#c2d2e2' : '#7aa9d8' }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── the day's schedule ───────────────────────────────────────────────── */

export function DayPanel({ day, jobs, sel, isToday, t }) {
  /* 07:00–19:00 unless the day starts earlier or runs later. */
  let from = 7;
  let to = 19;
  for (const j of jobs) {
    from = Math.min(from, Math.floor(hours(new Date(j.scheduled_start))));
    to = Math.max(to, Math.ceil(endHour(j)));
  }
  if ((to - from) % 2) { if (to < 24) to += 1; else from -= 1; }
  const span = to - from;
  const pos = (h) => `${((Math.min(Math.max(h, from), to) - from) / span) * 100}%`;
  const now = new Date();
  const nowH = hours(now);
  const ticks = [];
  for (let h = from; h <= to; h += 2) ticks.push(h);

  const first = jobs[0] ? hhmm(new Date(jobs[0].scheduled_start)) : '';
  const last = jobs.length ? hhmm(jobs.reduce((m, j) => (+endOf(j) > +m ? endOf(j) : m), endOf(jobs[0]))) : '';

  return (
    <div className="bg-paper px-3.5 pt-3 pb-2.5 relative" data-testid="home-panel"
         style={{ border: `2px solid ${NAVY}`, borderRadius: 18,
                  borderTopLeftRadius: sel === 0 ? 0 : 18, borderTopRightRadius: sel === 6 ? 0 : 18 }}>
      <div className="flex items-baseline justify-between gap-3 mb-6">
        <b className="font-headings text-[15px] text-ink" data-testid="home-panel-day">{day.long}</b>
        <span className="text-[12px] text-ink-muted tabular-nums truncate">
          {jobs.length
            ? t(jobs.length === 1 ? 'home_day_sum_one' : 'home_day_sum', { n: jobs.length, a: first, b: last })
            : ''}
        </span>
      </div>
      <div className="relative h-11 rounded-[10px]"
           style={{ background: `repeating-linear-gradient(90deg,#f3f6f9 0 calc(100%/${span} - 1px),#e2e8ee calc(100%/${span} - 1px) calc(100%/${span}))` }}>
        {jobs.map((j) => {
          const s = new Date(j.scheduled_start);
          const run = j.status === 'in_progress';
          const trade = tradeOf(j.category, j.title);
          const endH = endHour(j);
          return (
            <Link key={j.id} to={`/projects/${j.id}`} data-testid={`home-blk-${j.id}`}
                  aria-label={`${hhmm(s)} ${j.title || ''}`}
                  className="absolute top-1.5 bottom-1.5 rounded-lg grid place-items-center min-w-[24px] overflow-hidden"
                  style={{ left: pos(hours(s)), width: `calc(${pos(endH)} - ${pos(hours(s))})`,
                           background: run ? 'linear-gradient(160deg,#2f74b8,#173a5e)' : '#cfe0f1',
                           color: run ? '#fff' : NAVY }}>
              {trade ? <TradeMark trade={trade} size={16} /> : <Briefcase size={14} aria-hidden="true" />}
            </Link>
          );
        })}
        {!jobs.length && (
          <span className="absolute inset-0 grid place-items-center text-[12px] text-ink-faint">
            {t(isToday ? 'home_day_empty_today' : 'home_day_empty')}
          </span>
        )}
        {isToday && nowH >= from && nowH <= to && (
          <span className="absolute -top-1.5 -bottom-1.5 w-[2px] rounded-[1px] bg-[#c14655] pointer-events-none"
                style={{ left: pos(nowH) }} data-testid="home-now">
            <em className="absolute -top-4 left-1/2 -translate-x-1/2 not-italic text-[10.5px] font-bold text-[#c14655] tabular-nums">
              {hhmm(now)}
            </em>
          </span>
        )}
      </div>
      <div className="relative h-4 mt-1.5" aria-hidden="true">
        {ticks.map((h) => (
          <i key={h} className="absolute top-0 not-italic text-[10.5px] text-ink-faint -translate-x-1/2 tabular-nums"
             style={{ left: pos(h) }}>{h}</i>
        ))}
      </div>
    </div>
  );
}

/* ── one appointment ──────────────────────────────────────────────────── */

const STEP_LABELS = ['ov_step_quote', 'ov_step_sched', 'ov_step_work', 'ov_step_finish', 'ov_step_bill'];

function Steps({ states, labels, run }) {
  const n = states.length;
  const doneN = states.filter((s) => s === 'done').length;
  return (
    <ol className="relative grid grid-cols-5 m-0 p-0 list-none" aria-hidden="true">
      <i className="absolute left-[10%] right-[10%] top-1 h-[2px]"
         style={{ background: run ? 'rgba(255,255,255,.22)' : '#e6ecf1' }} />
      {doneN > 0 && (
        <i className="absolute left-[10%] top-1 h-[2px] bg-[#7fd08f]"
           style={{ width: `${(Math.min(doneN, n - 1) / (n - 1)) * 80}%` }} />
      )}
      {states.map((s, i) => {
        let dot = { background: run ? '#173a5e' : '#fff', boxShadow: `inset 0 0 0 2px ${run ? 'rgba(255,255,255,.4)' : '#cfd9e2'}` };
        if (s === 'done') dot = { background: '#7fd08f' };
        else if (s === 'run') dot = { background: '#ffc76b', boxShadow: '0 0 0 3px rgba(255,199,107,.25)' };
        else if (s === 'now') dot = { background: run ? '#173a5e' : '#fff', boxShadow: `inset 0 0 0 3px ${run ? '#fff' : NAVY}` };
        const on = s === 'now' || s === 'run';
        return (
          <li key={labels[i]} className="relative grid justify-items-center gap-1 text-[10px] min-w-0">
            <span className="relative z-[1] w-2.5 h-2.5 rounded-full" style={dot} />
            <span className="truncate max-w-full"
                  style={{ color: on ? (run ? '#fff' : NAVY) : (run ? '#a9c3dc' : '#8b9aa7'), fontWeight: on ? 700 : 500 }}>
              {labels[i]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Btn({ a, run }) {
  const Icon = a.icon;
  const cls = 'w-9 h-9 rounded-[10px] grid place-items-center text-ink relative';
  const style = { background: run ? '#f3f6f9' : '#fff' };
  const common = { className: cls, style, 'aria-label': a.label, title: a.label, 'data-testid': `home-act-${a.key}` };
  const body = <Icon size={16} aria-hidden="true" />;
  if (a.to) return <Link to={a.to} {...common}>{body}</Link>;
  return <a href={a.href} {...common} {...(a.external ? { target: '_blank', rel: 'noreferrer' } : {})}>{body}</a>;
}

export function DayCard({ j, t, act }) {
  const run = j.status === 'in_progress';
  const s = j.scheduled_start ? new Date(j.scheduled_start) : null;
  const trade = tradeOf(j.category, j.title);
  const open = `/projects/${j.id}`;
  const rank = ['completed', 'invoiced', 'closed'].indexOf(j.status);
  const finished = rank >= 0;
  const late = !run && !finished && s && +s < Date.now() - 3600000;
  const sub = [j.customer_name, j.site_city || j.customer_city].filter(Boolean).join(', ') || j.job_number || '';
  const amount = Number(j.contract_amount || 0);
  const tel = telHref(j.customer_phone);
  const route = routeHref(j);

  let when = '';
  let whenColor;
  if (run) { when = t('job_running'); whenColor = '#ffd28a'; }
  else if (finished) { when = t('ov_step_finish'); whenColor = '#3f8a4f'; }
  else if (late) { when = t('ov_overdue'); whenColor = '#c14655'; }
  else if (s) when = t('home_until', { t: hhmm(endOf(j)) });

  let primary = null;
  if (run) primary = { key: 'finish', icon: Check, label: t('ov_tab_done'), onClick: () => act({ id: j.id, status: j.status }, 'complete') };
  else if (j.status === 'completed') primary = { key: 'bill', icon: Receipt, label: t('home_bill'), to: `/jobs/${j.id}/invoice` };
  else if (!finished) primary = { key: 'start', icon: Play, label: t('ov_start'), onClick: () => act({ id: j.id, status: j.status }, 'start') };

  const PIcon = primary?.icon;
  const pCls = 'h-9 px-3 rounded-[10px] inline-flex items-center gap-1.5 text-[12.5px] font-bold text-paper whitespace-nowrap';
  const pStyle = { background: primary?.key === 'bill' ? '#3f8a4f' : NAVY };

  return (
    <article className="rounded-[18px] px-2.5 pt-2.5 pb-2 grid gap-2"
             data-testid={`home-job-${j.id}`} data-status={j.status}
             style={run
               ? { background: GRAD, color: '#fff', boxShadow: '0 12px 24px rgba(23,58,94,.24)' }
               : { background: '#fff', boxShadow: '0 0 0 1px rgba(26,58,82,.08),0 1px 2px rgba(26,58,82,.06),0 4px 12px rgba(26,58,82,.05)' }}>
      <Link to={open} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2.5 items-center px-0.5"
            data-testid={`home-job-${j.id}-open`}>
        <span className="w-[34px] h-[34px] rounded-[10px] grid place-items-center shrink-0"
              style={run ? { background: 'rgba(255,255,255,.16)', color: '#fff' } : { background: '#eaf2fa', color: NAVY }}>
          {trade ? <TradeMark trade={trade} size={21} /> : <Briefcase size={18} aria-hidden="true" />}
        </span>
        <span className="min-w-0">
          <span className="block font-headings font-bold text-[15px] leading-[1.2] truncate">
            {j.title || j.job_number || t('nav_jobs_one')}
          </span>
          <span className="block text-[12px] mt-px truncate" style={{ color: run ? '#c8daed' : '#5f7383' }}>{sub}</span>
        </span>
        <span className="text-right pl-1">
          <b className="block font-headings text-[16px] leading-[1.1] tabular-nums whitespace-nowrap">
            {s ? hhmm(s) : '—'}
          </b>
          <span className="block text-[11px] whitespace-nowrap"
                style={{ color: whenColor || (run ? '#c8daed' : '#93a2af'), fontWeight: whenColor ? 600 : 400 }}>
            {when}
          </span>
        </span>
      </Link>
      <div className="px-0.5">
        <Steps states={stepStates(j, null)} labels={STEP_LABELS.map((k) => t(k))} run={run} />
      </div>
      <div className="flex items-center justify-between gap-2 rounded-[10px] py-1 pr-1 pl-2.5"
           style={{ background: run ? '#fff' : '#f3f6f9', color: '#1a3a52' }}>
        <span className="text-[14px] font-bold tabular-nums truncate">
          {amount > 0 ? fmtEur(amount) : '—'}
          {amount > 0 && <small className="font-medium text-[11px] text-ink-faint ml-1">{t('ov_net')}</small>}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <Btn run={run} a={route ? { key: 'route', icon: CornerUpRight, label: t('day_route'), href: route, external: true }
            : { key: 'route', icon: CornerUpRight, label: t('ov_add_address'), to: open }} />
          <Btn run={run} a={tel ? { key: 'call', icon: Phone, label: t('day_call'), href: `tel:${tel}` }
            : { key: 'call', icon: Phone, label: t('ov_add_phone'), to: open }} />
          {primary && (primary.to ? (
            <Link to={primary.to} className={pCls} style={pStyle} data-testid={`home-act-${primary.key}`}>
              <PIcon size={12} aria-hidden="true" />{primary.label}
            </Link>
          ) : (
            <button type="button" onClick={primary.onClick} className={pCls} style={pStyle}
                    data-testid={`home-act-${primary.key}`}>
              <PIcon size={12} aria-hidden="true" />{primary.label}
            </button>
          ))}
        </span>
      </div>
    </article>
  );
}

/* ── a day with nothing in it ─────────────────────────────────────────── */

export function EmptyDay({ isToday, unplanned, t }) {
  return (
    <div className="rounded-[18px] p-4 grid gap-3 bg-[#f3f6f9]" data-testid="home-empty">
      <div>
        <b className="block font-headings text-[15px] text-ink">
          {t(isToday ? 'home_empty_today_title' : 'home_empty_title')}
        </b>
        <p className="text-[12.5px] text-ink-muted mt-0.5">
          {unplanned > 0 ? t(unplanned === 1 ? 'home_empty_unplanned_one' : 'home_empty_unplanned', { n: unplanned }) : t('home_empty_sub')}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link to={unplanned > 0 ? '/projects?mode=simple' : '/schedule'} data-testid="home-empty-plan"
              className="min-h-[42px] rounded-xl inline-flex items-center justify-center gap-1.5 text-[13px] font-bold text-paper"
              style={{ background: NAVY }}>
          <CalendarPlus size={15} aria-hidden="true" />{t('home_plan_date')}
        </Link>
        <Link to="/estimate" data-testid="home-empty-calc"
              className="min-h-[42px] rounded-xl inline-flex items-center justify-center gap-1.5 text-[13px] font-bold bg-paper"
              style={{ color: '#6d4bc2', boxShadow: 'inset 0 0 0 1.5px #ddd3f5' }}>
          <Calculator size={15} aria-hidden="true" />{t('ov_calculate')}
        </Link>
      </div>
    </div>
  );
}
