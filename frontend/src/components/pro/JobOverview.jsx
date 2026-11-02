import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Briefcase, CornerUpRight, Phone, Play, Check, FileText, Send, Calculator,
  CalendarClock, Receipt, CalendarPlus, FilePlus2,
} from 'lucide-react';
import TradeMark from '../TradeMark';
import { fmtEur, fmtEur0, fmtEurBare, moneyLocale } from '../../utils/money';
import { stepStates, daysSince } from '../../utils/jobSteps';
import { routeHref } from '../../utils/maps';
import { telHref } from '../../utils/sms';
import { openQuotePdf } from '../../utils/openPdf';
import { tradeOfCategory } from './JobListView';

/**
 * The Aufträge / Projekte overview as it was signed off (P1):
 *
 *   blue total card  →  calendar card  →  three round status pills  →
 *   compact job cards with a blue head that carries the step timeline.
 *
 * Every figure comes from the same buckets the Liste tab uses, so the two
 * views of the page can never disagree. Aufträge is drawn in navy, Projekte
 * in petrol — the skin is the only difference between them.
 */

export const SKINS = {
  jobs: {
    accent: '#1e5490', tint: '#eaf2fa', soft: '#c8daed',
    grad: 'radial-gradient(120% 140% at 100% 0%, #2f74b8 0%, #1e5490 45%, #173a5e 100%)',
    head: 'radial-gradient(120% 200% at 100% 0%, #2f74b8 0%, #1e5490 55%, #173a5e 100%)',
  },
  projects: {
    accent: '#1f4d5e', tint: '#e6f1f3', soft: '#c3dde2',
    grad: 'radial-gradient(120% 140% at 100% 0%, #2d8597 0%, #1f5f70 45%, #163a47 100%)',
    head: 'radial-gradient(120% 200% at 100% 0%, #2d8597 0%, #1f5f70 55%, #163a47 100%)',
  },
};

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const shortDay = (d) => d.toLocaleDateString(moneyLocale(), { weekday: 'short', day: 'numeric', month: 'short' });

/* ── 1 · the blue total card ──────────────────────────────────────────── */

/* Which tab each share belongs to: offered → Pipeline, booked and running →
   Läuft, done → Fertig. Tapping a share selects its tab. */
const PARTS = [
  { key: 'offered', tab: 'pipeline', stroke: 'rgba(255,255,255,.45)', shortKey: 'ov_seg_offered_s' },
  { key: 'booked', tab: 'live', stroke: '#ffffff', shortKey: 'ov_seg_booked_s' },
  { key: 'running', tab: 'live', stroke: '#ffc76b', shortKey: 'ov_seg_running_s' },
  { key: 'done', tab: 'done', stroke: '#8fe0a0', shortKey: 'ov_seg_done_s' },
];

function subline({ jobs, projects, t }) {
  const parts = [t(jobs === 1 ? 'ov_ring_job_one' : 'ov_ring_job_many', { n: jobs })];
  if (projects > 0) parts.push(t(projects === 1 ? 'ov_ring_proj_one' : 'ov_ring_proj_many', { n: projects }));
  return `${t('ov_ring_sub')} · ${parts.join(', ')}`;
}

export function OverviewHero({ amounts, total, counts, tab, onPick, skin, t }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = PARTS.map((p) => {
    const v = amounts[p.key] || 0;
    const len = total > 0 ? (v / total) * C : 0;
    const arc = { ...p, len, off: acc };
    acc += len;
    return arc;
  }).filter((a) => a.len > 0);

  return (
    <div className="rounded-[22px] p-[18px] text-paper grid gap-4"
         style={{ background: skin.grad, boxShadow: '0 14px 28px rgba(23,58,94,.26)' }}
         data-testid="ov-hero">
      <div className="flex items-center gap-4">
        <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0" aria-hidden="true">
          <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="7" />
          {arcs.map((a) => (
            <circle key={a.key} cx="38" cy="38" r={R} fill="none" stroke={a.stroke} strokeWidth="7"
                    strokeDasharray={`${Math.max(a.len - 2, 1)} ${C}`} strokeDashoffset={-a.off}
                    transform="rotate(-90 38 38)" strokeLinecap="round" />
          ))}
        </svg>
        <div className="min-w-0">
          <p className="font-headings font-bold text-[32px] leading-none tabular-nums"
             data-testid="ov-hero-total">{fmtEur0(total)}</p>
          <p className="text-[12.5px] mt-1.5 truncate" style={{ color: skin.soft }}>
            {subline({ ...counts, t })}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {PARTS.map((p) => {
          const on = p.tab === tab;
          return (
            <button key={p.key} type="button" onClick={() => onPick(p.tab)}
                    data-testid={`ov-hero-${p.key}`} aria-pressed={on}
                    className="rounded-xl px-2 py-[7px] text-left min-w-0 transition-colors duration-ui"
                    style={on
                      ? { background: '#fff', color: skin.accent }
                      : { background: 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.14)', color: skin.soft }}>
              <span className="block text-[9.5px] font-bold uppercase tracking-[0.07em] truncate">
                {t(p.shortKey)}
              </span>
              <span className="block text-[15px] font-bold tabular-nums truncate"
                    style={{ color: on ? skin.accent : '#fff' }}>
                {fmtEurBare(amounts[p.key] || 0)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── 2 · the calendar card ────────────────────────────────────────────── */

const DAY = 86400000;
function kw(d) {
  const a = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  a.setUTCDate(a.getUTCDate() + 4 - (a.getUTCDay() || 7));
  return Math.ceil(((a - Date.UTC(a.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
}
function monday(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export function WeekCalendar({ jobs, skin, t }) {
  const dayKey = new Date().toDateString();
  const { weeks, days, booked } = useMemo(() => {
    const now = new Date(dayKey);
    const first = monday(now);
    const perWeek = [0, 0, 0, 0, 0, 0];
    const firstAt = {};
    let n = 0;
    for (const j of jobs || []) {
      if (!j.scheduled_start) continue;
      const d = new Date(j.scheduled_start);
      if (Number.isNaN(+d)) continue;
      const off = Math.floor((+new Date(d.getFullYear(), d.getMonth(), d.getDate()) - +first) / DAY);
      if (off < 0 || off >= 42) continue;
      n += 1;
      perWeek[Math.floor(off / 7)] += 1;
      if (off < 7 && (!firstAt[off] || d < firstAt[off])) firstAt[off] = d;
    }
    const todayOff = Math.floor((+now - +first) / DAY);
    const w = perWeek.map((c, i) => {
      const mon = new Date(first); mon.setDate(mon.getDate() + i * 7);
      return { kw: kw(mon), count: c, cur: i === 0 };
    });
    const dd = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(first); d.setDate(d.getDate() + i);
      dd.push({
        key: i, n: d.getDate(), today: i === todayOff, at: firstAt[i] || null,
        lbl: d.toLocaleDateString(moneyLocale(), { weekday: 'short' }).replace('.', ''),
      });
    }
    return { weeks: w, days: dd, booked: n };
  }, [jobs, dayKey]);

  return (
    <div className="rounded-[20px] bg-paper p-4 grid gap-3.5"
         style={{ border: '1px solid #e3e9ee', boxShadow: '0 6px 18px rgba(20,50,80,.06)' }}
         data-testid="ov-cal">
      <div className="flex items-baseline justify-between gap-3">
        <b className="text-[13.5px] font-bold text-ink">{t('ov_span_title')}</b>
        <span className="text-[12px] text-ink-muted tabular-nums">{t('ov_span_count', { n: booked })}</span>
      </div>
      <div className="grid grid-cols-6 gap-[5px]" aria-hidden="true">
        {weeks.map((w) => (
          <div key={w.kw} className="grid gap-[5px] text-center">
            <i className="h-2 rounded bg-[#eef2f5] relative overflow-hidden">
              {w.count > 0 && (
                <u className="absolute inset-y-0 left-0 rounded"
                   style={{ width: `${Math.min(100, 18 + w.count * 16)}%`, background: skin.grad }} />
              )}
            </i>
            <span className="text-[10.5px] tabular-nums"
                  style={w.cur ? { color: skin.accent, fontWeight: 700 } : { color: '#8b9aa7' }}>
              {w.cur ? `KW ${w.kw}` : w.kw}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center pt-3" style={{ borderTop: '1px solid #eef2f5' }}
           data-testid="ov-cal-days">
        {days.map((d) => (
          <div key={d.key} className="grid justify-items-center gap-[3px]" data-today={d.today ? 'yes' : 'no'}>
            <span className="text-[10px] font-semibold uppercase text-ink-faint">{d.lbl}</span>
            <b className="grid place-items-center w-[34px] h-[34px] rounded-xl text-[15px] font-semibold tabular-nums"
               style={d.today
                 ? { background: skin.accent, color: '#fff', boxShadow: '0 6px 12px rgba(30,84,144,.28)' }
                 : d.at ? { background: skin.tint, color: skin.accent } : { color: '#1a3a52' }}>
              {d.n}
            </b>
            <small className="text-[9.5px] font-bold h-3 tabular-nums" style={{ color: skin.accent }}>
              {d.at ? hhmm(d.at) : ''}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 3 · the three status pills (P1) ──────────────────────────────────── */

const PILL = {
  live: { circle: null, bg: '#fff', border: '#d3dee8', fg: '#1a3a52' },
  pipeline: { circle: '#e0951f', bg: '#fff6e6', border: '#f0d5a6', fg: '#7a4a0c' },
  done: { circle: '#3f8a4f', bg: '#eef8ef', border: '#c5e2ca', fg: '#2c6b39' },
};

export function StatusPills({ tabs, tab, counts, onPick, lead, skin, t }) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-[5px] min-[400px]:gap-2" role="tablist" data-testid="ov-pills">
        {tabs.map(({ key, labelKey }) => {
          const on = key === tab;
          const p = PILL[key];
          return (
            <button key={key} type="button" role="tab" aria-selected={on}
                    onClick={() => onPick(key)} data-testid={`ov-pill-${key}`}
                    className="flex items-center justify-center gap-[5px] min-[400px]:gap-2 rounded-full min-w-0
                               py-1 pl-1 pr-2 min-[400px]:py-1.5 min-[400px]:pl-1.5 min-[400px]:pr-2.5
                               text-[12.5px] min-[400px]:text-[13px] font-bold transition-[background,box-shadow] duration-ui"
                    style={on
                      ? { background: skin.grad, color: '#fff', border: '1.5px solid transparent', boxShadow: '0 6px 14px rgba(30,84,144,.26)' }
                      : { background: p.bg, color: p.fg, border: `1.5px solid ${p.border}` }}>
              <em className="not-italic grid place-items-center rounded-full shrink-0 w-[26px] h-[26px]
                             min-[400px]:w-[30px] min-[400px]:h-[30px] font-headings text-[13.5px] min-[400px]:text-[15px] tabular-nums"
                  style={on ? { background: '#fff', color: skin.accent }
                    : { background: p.circle || skin.accent, color: '#fff' }}>
                {counts[key]}
              </em>
              <span className="truncate">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>
      {lead && (
        <div className="flex items-baseline justify-between gap-3 text-[12px] text-ink-muted -mb-1"
             data-testid="ov-lead">
          <span className="truncate">{lead.text}</span>
          <b className="text-[13.5px] text-ink tabular-nums shrink-0">{lead.amount}</b>
        </div>
      )}
    </div>
  );
}

/* ── 4 · the compact job card (C2 / V3) ───────────────────────────────── */

const STEP_LABELS = ['ov_step_quote', 'ov_step_sched', 'ov_step_work', 'ov_step_finish', 'ov_step_bill'];

function Timeline({ states, warm, t }) {
  const doneC = warm ? '#3f8a4f' : '#7fd08f';
  const line = warm ? '#ecd3a5' : 'rgba(255,255,255,.25)';
  const ring = warm ? '#e8c98f' : 'rgba(255,255,255,.35)';
  const lab = warm ? '#b98a45' : '#a9c3dc';
  const labOn = warm ? '#7a4a0c' : '#fff';
  return (
    <div className="grid gap-[5px]" aria-hidden="true">
      <div className="flex items-center">
        {states.map((s, i) => {
          const done = s === 'done';
          const now = s === 'now' || s === 'run';
          /* Work under way is amber, like the running share in the ring;
             "next" is the white dot. One job never shows two white dots. */
          return (
            <React.Fragment key={STEP_LABELS[i]}>
              <i className="w-2.5 h-2.5 rounded-full shrink-0 border-2"
                 style={done ? { background: doneC, borderColor: doneC }
                   : s === 'run' ? { background: '#ffc76b', borderColor: '#ffc76b', boxShadow: '0 0 0 3px rgba(255,199,107,.28)' }
                   : now ? (warm
                     ? { background: '#e0951f', borderColor: '#e0951f', boxShadow: '0 0 0 3px rgba(224,149,31,.2)' }
                     : { background: '#fff', borderColor: '#fff', boxShadow: '0 0 0 3px rgba(255,255,255,.22)' })
                     : { borderColor: ring }} />
              {i < 4 && <u className="flex-1 h-[2px] min-w-2" style={{ background: done ? doneC : line }} />}
            </React.Fragment>
          );
        })}
      </div>
      <div className="flex text-[9.5px] font-semibold">
        {states.map((s, i) => (
          <span key={STEP_LABELS[i]}
                className={`flex-1 ${i === 0 ? 'text-left' : i === 4 ? 'text-right' : 'text-center'}`}
                style={{ color: s === 'now' || s === 'run' ? labOn : lab, fontWeight: s === 'now' || s === 'run' ? 700 : 600 }}>
            {t(STEP_LABELS[i])}
          </span>
        ))}
      </div>
    </div>
  );
}

export function JobTile({ j, tab, q, worth, t, act, navigate, skin }) {
  const trade = tradeOfCategory(j.category);
  const running = j.status === 'in_progress';
  const start = j.scheduled_start ? new Date(j.scheduled_start) : null;
  const warm = tab === 'live' && !start && !running;
  const open = `/projects/${j.id}`;
  const calc = `${trade ? `/estimate/${trade}` : '/estimate'}?job=${j.id}`;
  const states = stepStates(j, q);

  const amount = tab === 'pipeline' ? Number(q?.net_total || j.contract_amount || 0) : worth(j);
  const sub = [j.customer_name, j.site_city || j.customer_city].filter(Boolean).join(' · ')
    || (warm ? t('ov_waits_date') : j.job_number);

  /* What the right side of the head says: when it happens, how long the quote
     has been out, or how long the finished job has been waiting for a bill. */
  let when;
  if (tab === 'live') {
    if (running) when = { big: j.started_at ? hhmm(new Date(j.started_at)) : '●', small: t('job_running') };
    else if (start && +start < Date.now() - 3600000) when = { big: hhmm(start), small: t('ov_overdue'), late: true };
    else if (start) when = { big: hhmm(start), small: shortDay(start) };
    else when = { big: '—', small: t('ov_no_date') };
  } else if (tab === 'pipeline') {
    const d = daysSince(q?.sent_at || j.created_at);
    when = { big: d != null ? t('ov_days', { n: d }) : '—', small: q ? (q.quote_number || t('pm_status_quoted')) : t('pm_status_lead') };
  } else {
    const d = daysSince(j.completed_at);
    when = { big: j.completed_at ? shortDay(new Date(j.completed_at)) : '—', small: d != null ? t('ov_done_days', { n: d }) : '' };
  }

  const pdf = async () => {
    try { await openQuotePdf(q.id); } catch { toast.error(t('generic_error')); }
  };
  const tel = telHref(j.customer_phone);
  const route = routeHref(j);

  /* Small icon buttons first, then the one labelled button that moves the job
     on. Nothing is ever greyed: a missing address or phone opens the job so
     it can be filled in. */
  let icons = [];
  let primary;
  if (tab === 'live') {
    icons = [
      route ? { key: 'route', icon: CornerUpRight, label: t('day_route'), href: route, external: true }
        : { key: 'route', icon: CornerUpRight, label: t('ov_add_address'), to: open },
      tel ? { key: 'call', icon: Phone, label: t('day_call'), href: `tel:${tel}` }
        : { key: 'call', icon: Phone, label: t('ov_add_phone'), to: open },
    ];
    if (warm) primary = { key: 'plan', icon: CalendarPlus, label: t('ov_plan'), to: open, warm: true };
    else if (running) primary = { key: 'finish', icon: Check, label: t('ov_tab_done'), onClick: () => act({ id: j.id, status: j.status }, 'complete') };
    else primary = { key: 'start', icon: Play, label: t('ov_start'), onClick: () => act({ id: j.id, status: j.status }, 'start') };
  } else if (tab === 'pipeline' && j.status === 'quoted' && q) {
    icons = [{ key: 'pdf', icon: FileText, label: t('job_quote_pdf'), onClick: pdf }];
    primary = { key: 'follow', icon: Send, label: t('ov_follow_up'), to: `/quotes/${q.id}` };
  } else if (tab === 'pipeline' && j.status === 'quoted') {
    primary = { key: 'quote', icon: FilePlus2, label: t('ov_make_quote'), to: calc };
  } else if (tab === 'pipeline') {
    icons = [{ key: 'visit', icon: CalendarClock, label: t('ov_site_visit'), to: open }];
    primary = { key: 'calc', icon: Calculator, label: t('ov_calculate'), to: calc };
  } else {
    primary = { key: 'bill', icon: Receipt, label: t('job_bill_create'), to: `/jobs/${j.id}/invoice` };
  }

  return (
    <div className="rounded-2xl overflow-hidden bg-paper"
         style={{ border: `1.5px solid ${warm ? '#ecd2a3' : '#c6d4e1'}`, boxShadow: '0 4px 12px rgba(20,50,80,.08)' }}
         data-testid={`ov-job-${j.id}`} data-status={j.status}>
      <Link to={open} className="px-[13px] py-[11px] grid gap-2.5"
            style={warm ? { background: 'linear-gradient(135deg,#fdf3e1,#fbe6c2)', color: '#7a4a0c' }
              : { background: skin.head, color: '#fff' }}
            data-testid="ov-job-open">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 items-center">
          <span className="w-[34px] h-[34px] rounded-[10px] grid place-items-center shrink-0"
                style={warm ? { background: '#fff', color: '#a8680f' } : { background: 'rgba(255,255,255,.16)' }}
                data-trade={trade || 'none'}>
            {trade ? <TradeMark trade={trade} size={24} /> : <Briefcase size={20} aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block font-headings font-bold text-[15px] leading-[1.2] truncate">
              {j.title || j.job_number || t('nav_jobs_one')}
            </span>
            <span className="block text-[11px] mt-0.5 truncate" style={{ color: warm ? '#a8680f' : skin.soft }}>
              {sub}
            </span>
          </span>
          <span className="text-right pl-2">
            <span className="block font-headings font-bold text-[15.5px] leading-[1.05] tabular-nums whitespace-nowrap">
              {when.big}
            </span>
            <span className="block text-[10px] mt-0.5 whitespace-nowrap"
                  style={{ color: warm ? '#a8680f' : when.late ? '#ffb3bd' : skin.soft, fontWeight: when.late ? 700 : 400 }}>
              {when.small}
            </span>
          </span>
        </div>
        <Timeline states={states} warm={warm} t={t} />
      </Link>
      <div className="flex items-center justify-between gap-3 px-[13px] py-2"
           style={{ borderTop: '1px solid #dfe7ee' }}>
        <span className="font-bold text-[14px] text-ink tabular-nums truncate">
          {amount > 0 ? fmtEur(amount) : '—'}
          {amount > 0 && <small className="font-medium text-[11px] text-ink-faint ml-1">{t('ov_net')}</small>}
        </span>
        <span className="flex items-center gap-[7px] shrink-0">
          {icons.map((a) => <TileBtn key={a.key} a={a} />)}
          {primary && <TileBtn a={primary} primary skin={skin} />}
        </span>
      </div>
    </div>
  );
}

function TileBtn({ a, primary, skin }) {
  const Icon = a.icon;
  const cls = primary
    ? 'h-8 px-[13px] rounded-[10px] inline-flex items-center gap-1.5 text-[12px] font-bold text-paper'
    : 'w-8 h-8 rounded-[10px] grid place-items-center text-ink bg-paper border border-[#e3e9ee]';
  const style = primary
    ? (a.warm ? { background: '#e0951f' } : { background: skin.accent, boxShadow: '0 3px 8px rgba(30,84,144,.25)' })
    : undefined;
  const body = (<><Icon size={primary ? 12 : 14} aria-hidden="true" />{primary && <span>{a.label}</span>}</>);
  const common = { className: cls, style, 'aria-label': a.label, title: a.label, 'data-testid': `ov-act-${a.key}` };
  if (a.to) return <Link to={a.to} {...common}>{body}</Link>;
  if (a.href) {
    return <a href={a.href} {...common} {...(a.external ? { target: '_blank', rel: 'noreferrer' } : {})}>{body}</a>;
  }
  return <button type="button" onClick={a.onClick} {...common}>{body}</button>;
}
