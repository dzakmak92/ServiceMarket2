import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, Building2, Calculator, CalendarDays, CreditCard, Euro, FileText,
  Landmark, Receipt, Settings as SettingsIcon, Tag, Users, Wrench,
} from 'lucide-react';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import { fmtEur0 } from '../../utils/money';
import { planLabel } from '../../utils/tier';
import { useCalcDrafts } from '../../components/pro/CalcDraftList';
import SkeletonList from '../../components/motion/SkeletonList';

/**
 * Werkzeuge, design E2.
 *
 *   where the money sits (the blue card) → the six steps of the work in three
 *   pairs (before, during, after the job) → the office.
 *
 * Every step card is the same shape: a coloured column naming the step and
 * the money in it, two figures, and one "Öffnen". The two cards of a pair
 * share a colour family; the first is lighter so the pair reads as a pair
 * without the two looking alike.
 */

const DAY = 86400000;
const LIVE = ['accepted', 'scheduled', 'in_progress'];
const UNBILLED = [...LIVE, 'completed'];
const OPEN_Q = ['sent', 'viewed', 'negotiating'];
const WAIT_DAYS = 7;
const NAVY_CARD = 'radial-gradient(120% 140% at 100% 0%, #2f74b8 0%, #1e5490 45%, #173a5e 100%)';

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
const lighten = (h, f) => toHex(hexRgb(h).map((x) => x + (255 - x) * f));
const darken = (h, f) => toHex(hexRgb(h).map((x) => x * f));
/* `p` of the colour over white: the tints the cards use on their light side. */
const tint = (h, p) => toHex(hexRgb(h).map((x) => 255 + (x - 255) * p));

const isToday = (iso) => !!iso && new Date(iso).toDateString() === new Date().toDateString();
const daysSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / DAY : 0);
const sum = (arr, f) => arr.reduce((s, x) => s + Number(f(x) || 0), 0);


/* The page's measurements in one place. Thinner than the first version: the
   coloured column carries icon and name side by side, the money card shows
   its bars two by two, and the office tiles are flat. */
const D = {
  gap: 14, hero: '12px 13px 11px', heroGap: 6, total: 22, barH: 7, barGrid: 2, hintPad: 7, hintIcon: 24,
  groupGap: 16, cardGap: 9, leftW: 124, leftPad: '8px 8px 9px 11px', icon: 18, iconRow: true,
  rightPad: '7px 9px 8px 11px', num: 19, secondW: 58, btnW: 66, btnH: 32, base: 2, offH: 50, offRow: true,
};

function StepCard({ step, first, t }) {
  const base = step.color;
  const top = first ? lighten(base, 0.28) : base;
  const dk = darken(top, 0.8);
  const Icon = step.icon;
  return (
    <Link to={step.to} data-testid={`tools-step-${step.key}`}
          className="grid rounded-[16px] overflow-hidden bg-paper"
          style={{ gridTemplateColumns: `${D.leftW}px minmax(0,1fr)`, boxShadow: `0 0 0 1px ${base}, 0 4px 12px rgba(26,58,82,.06)` }}>
      <span className={`grid content-center text-paper min-w-0 ${D.iconRow ? 'grid-cols-[auto_minmax(0,1fr)] gap-x-2 items-center' : 'justify-items-start gap-px'}`}
            style={{ background: `linear-gradient(150deg, ${top}, ${dk})`, padding: D.leftPad,
                     boxShadow: `inset 0 -${D.base}px 0 ${dk}` }}>
        <Icon size={D.icon} strokeWidth={1.9} className={D.iconRow ? 'row-span-2' : 'mb-1.5'} aria-hidden="true" />
        <b className={`font-bold leading-tight truncate ${D.iconRow ? "text-[12.5px]" : "text-[13px]"}`}>{step.label}</b>
        <small className="text-[11.5px] opacity-90 tabular-nums whitespace-nowrap">{fmtEur0(step.amount)}</small>
      </span>
      <span className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 items-center min-w-0"
            style={{ background: tint(base, 0.05), padding: D.rightPad,
                     boxShadow: `inset 0 -${D.base}px 0 ${tint(base, 0.45)}` }}>
        {/* A fixed second column, so the divider and the second number sit at
            the same place on every card instead of moving with the digits. */}
        <span className="grid items-center min-w-0" style={{ gridTemplateColumns: `minmax(0,1fr) ${D.secondW}px` }}>
          {step.values.map((v, i) => (
            <span key={v.label} className="grid min-w-0"
                  style={i ? { paddingLeft: 9, boxShadow: `inset 1.5px 0 0 ${tint(base, 0.25)}` } : { paddingRight: 9 }}
                  data-testid={`tools-step-${step.key}-v${i}`}>
              <b className="font-headings font-bold leading-[1.05] tabular-nums tracking-[-.01em]"
                 style={{ fontSize: D.num, color: v.hot ? '#c27712' : '#1a3a52' }}>{v.n}</b>
              <small className="text-[11.5px] font-medium text-ink-muted whitespace-nowrap overflow-hidden text-ellipsis">
                {v.label}
              </small>
            </span>
          ))}
        </span>
        <span className="rounded-[10px] grid place-items-center bg-paper text-ink text-[12.5px] font-bold"
              style={{ width: D.btnW, height: D.btnH, boxShadow: '0 0 0 1px rgba(26,58,82,.12), 0 2px 5px rgba(26,58,82,.07)' }}>
          {t('tools_open')}
        </span>
      </span>
    </Link>
  );
}

function OfficeTile({ tile }) {
  const Icon = tile.icon;
  return (
    <Link to={tile.to} data-testid={`tools-office-${tile.key}`}
          className={`rounded-2xl bg-paper min-w-0 ${D.offRow ? 'grid grid-cols-[30px_minmax(0,1fr)] gap-x-2 items-center p-2' : 'grid justify-items-start content-start gap-px p-2 min-[380px]:p-2.5'}`}
          style={{ minHeight: D.offH, boxShadow: '0 0 0 1px rgba(26,58,82,.06), 0 1px 2px rgba(26,58,82,.06), 0 4px 12px rgba(26,58,82,.05)' }}>
      <span className={`rounded-[10px] grid place-items-center text-paper ${D.offRow ? 'w-[30px] h-[30px] row-span-2' : 'w-[30px] h-[30px] mb-1'}`}
            style={{ background: tile.color }}>
        <Icon size={16} aria-hidden="true" />
      </span>
      <b className="text-[12px] min-[380px]:text-[12.5px] font-bold text-ink truncate max-w-full leading-tight">{tile.label}</b>
      <small className="text-[10.5px] text-ink-muted truncate max-w-full leading-tight">{tile.sub}</small>
    </Link>
  );
}

export default function ToolsPage() {
  const { t } = useLang();
  const drafts = useCalcDrafts();
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      api.get('/api/profile/pro').catch(() => null),
      api.get('/api/jobs/counts').catch(() => null),
      api.get('/api/jobs', { params: { limit: 200 } }).catch(() => null),
      api.get('/api/quotes', { params: { limit: 200 } }).catch(() => null),
      api.get('/api/invoices/stats').catch(() => null),
      api.get('/api/invoices/overdue').catch(() => null),
      api.get('/api/customers', { params: { limit: 1 } }).catch(() => null),
    ]).then(([p, c, j, q, s, o, cu]) => {
      if (!live) return;
      setData({
        profile: p?.data || {},
        counts: c?.data || {},
        jobs: j?.data?.jobs || [],
        quotes: q?.data?.quotes || [],
        stats: s?.data || {},
        overdue: o?.data?.invoices || [],
        customers: cu?.data?.total ?? (cu?.data?.customers || []).length,
      });
    });
    return () => { live = false; };
  }, []);

  const m = useMemo(() => {
    if (!data) return null;
    const { jobs, quotes, counts, stats } = data;
    const notRecurring = jobs.filter((j) => j.mode !== 'recurring' && j.status !== 'cancelled');
    const simpleLive = notRecurring.filter((j) => j.mode !== 'project' && LIVE.includes(j.status));
    const projects = notRecurring.filter((j) => j.mode === 'project' && !['closed', 'invoiced'].includes(j.status));
    const unbilled = notRecurring.filter((j) => UNBILLED.includes(j.status));
    const done = notRecurring.filter((j) => j.status === 'completed');
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const visits = jobs.filter((j) => j.mode === 'recurring' && !['closed', 'cancelled'].includes(j.status)
      && (j.visit_date || j.scheduled_start) && +new Date(j.visit_date || j.scheduled_start) >= +today0);
    const soon = visits.filter((j) => +new Date(j.visit_date || j.scheduled_start) < +today0 + 7 * DAY);
    const openQ = quotes.filter((q) => OPEN_Q.includes(q.status));
    const waiting = openQ.filter((q) => daysSince(q.sent_at || q.created_at) > WAIT_DAYS);
    const freshDrafts = drafts.filter((d) => daysSince(d.updatedAt) <= 7);
    return {
      calc: sum(drafts, (d) => d.net),
      offered: sum(openQ, (q) => q.gross_total),
      booked: sum(unbilled, (j) => j.contract_amount),
      billed: Number(stats.pending_brutto || 0),
      doneSum: sum(done, (j) => j.contract_amount),
      openQ, waiting, freshDrafts, simpleLive, projects, visits, soon,
      simpleToday: simpleLive.filter((j) => isToday(j.scheduled_start)).length,
      projRunning: projects.filter((j) => j.status === 'in_progress').length,
      unpaid: Number(counts.rechnung ?? stats.pending_count ?? 0),
      ready: Number(counts.awaiting_invoice ?? done.length),
      apptToday: jobs.filter((j) => j.status !== 'cancelled' && isToday(j.scheduled_start || j.visit_date)).length,
    };
  }, [data, drafts]);

  if (!m) {
    return (
      <div className="min-h-screen bg-paper pb-28">
        <div className="page-container max-w-3xl py-6"><SkeletonList rows={6} /></div>
      </div>
    );
  }

  const bars = [
    { key: 'calc', label: t('tools_bar_calc'), v: m.calc, color: '#a68af0' },
    { key: 'offered', label: t('tools_bar_offered'), v: m.offered, color: '#f5b452' },
    { key: 'booked', label: t('tools_bar_booked'), v: m.booked, color: '#8cc0f0' },
    { key: 'billed', label: t('tools_bar_billed'), v: m.billed, color: '#7fd08f' },
  ];
  const total = bars.reduce((s, b) => s + b.v, 0);
  const peak = Math.max(...bars.map((b) => b.v), 1);

  /* One sentence on where the money is stuck, and only when it is. */
  let hint = null;
  if (m.doneSum > 0) hint = { b: t('tools_hint_done', { v: fmtEur0(m.doneSum) }), s: t('tools_hint_done_sub') };
  else if (data.overdue.length) hint = { b: t('tools_hint_overdue', { n: data.overdue.length }), s: t('tools_hint_overdue_sub') };
  else if (m.waiting.length) hint = { b: t('tools_hint_waiting', { n: m.waiting.length }), s: t('tools_hint_waiting_sub') };
  else if (!total) hint = { b: t('tools_hint_empty'), s: t('tools_hint_empty_sub') };

  const steps = [
    { key: 'kalkulation', to: '/estimate', icon: Calculator, color: '#7d68c9', label: t('stage_kalkulation'),
      amount: m.calc, values: [{ n: drafts.length, label: t('tools_v_active') }, { n: m.freshDrafts.length, label: t('tools_v_new') }] },
    { key: 'angebote', to: '/quotes', icon: FileText, color: '#5b48a6', label: t('home_step_quotes'),
      amount: m.offered, values: [{ n: m.openQ.length, label: t('tools_v_open') }, { n: m.waiting.length, label: t('tools_v_waiting'), hot: m.waiting.length > 0 }] },
    { key: 'auftraege', to: '/projects?mode=simple', icon: Briefcase, color: '#3d7fc0', label: t('home_step_jobs'),
      amount: sum(m.simpleLive, (j) => j.contract_amount), values: [{ n: m.simpleLive.length, label: t('tools_v_total') }, { n: m.simpleToday, label: t('tools_v_today') }] },
    { key: 'projekte', to: '/projects?mode=project', icon: Building2, color: '#2b5f99', label: t('home_step_projects'),
      amount: sum(m.projects, (j) => j.contract_amount), values: [{ n: m.projects.length, label: t('tools_v_active') }, { n: m.projRunning, label: t('tools_v_running') }] },
    { key: 'rechnungen', to: data.overdue.length ? '/overdue' : '/my-invoices', icon: Receipt, color: '#4f9a6c', label: t('stage_rechnung'),
      amount: m.billed, values: [{ n: m.unpaid, label: t('tools_v_open') }, { n: m.ready, label: t('tools_v_ready'), hot: m.ready > 0 }] },
    { key: 'wartung', to: '/recurring', icon: Wrench, color: '#367a52', label: t('stage_wartung'),
      amount: sum(m.visits, (j) => j.contract_amount), values: [{ n: Number(data.counts.wartung ?? m.visits.length), label: t('tools_v_planned') }, { n: m.soon.length, label: t('tools_v_soon') }] },
  ];
  const groups = [
    { title: t('tools_group_before'), steps: steps.slice(0, 2) },
    { title: t('tools_group_during'), steps: steps.slice(2, 4) },
    { title: t('tools_group_after'), steps: steps.slice(4, 6) },
  ];

  const office = [
    { key: 'customers', to: '/customers', icon: Users, color: '#4d6477', label: t('nav_customers'), sub: t('home_contacts', { n: data.customers || 0 }) },
    { key: 'schedule', to: '/schedule', icon: CalendarDays, color: '#c14655', label: t('nav_schedule'), sub: t('home_today', { n: m.apptToday }) },
    { key: 'tax', to: '/tax', icon: Landmark, color: '#1f5f70', label: t('nav_tax'), sub: t('tools_tax_sub') },
    { key: 'prices', to: '/estimate/folierung?preise=1', icon: Tag, color: '#6d4bc2', label: t('tools_prices'), sub: t('tools_prices_sub') },
    { key: 'settings', to: '/settings', icon: SettingsIcon, color: '#2a8a7e', label: t('nav_settings'), sub: t('tools_settings_sub') },
    { key: 'billing', to: '/billing', icon: CreditCard, color: '#c97a10', label: t('tools_plan'), sub: planLabel(data.profile.plan_tier, t) },
  ];

  return (
    <div className="min-h-screen bg-paper pb-28 md:pb-10" data-testid="tools-page">
      <div className="page-container max-w-3xl py-4 grid" style={{ gap: D.gap }}>
        <header>
          <p className="text-[13px] text-ink-muted">{t('tools_sub')}</p>
          <h1 className="font-headings font-bold text-ink text-[26px] leading-tight tracking-[-.01em]">{t('nav_tools')}</h1>
        </header>

        {/* ── where the money sits ───────────────────────────────── */}
        <section className="grid rounded-[20px] text-paper"
                 style={{ gap: D.heroGap, background: NAVY_CARD, padding: D.hero, boxShadow: '0 12px 24px rgba(23,58,94,.22)' }}
                 data-testid="tools-hero">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-[13px]" style={{ color: '#c8daed' }}>{t('tools_in_flow')}</span>
            <b className="font-headings font-bold tabular-nums" style={{ fontSize: D.total }} data-testid="tools-total">{fmtEur0(total)}</b>
          </div>
          <div className="grid gap-x-3" style={{ gridTemplateColumns: `repeat(${D.barGrid}, minmax(0,1fr))`, rowGap: D.heroGap }}>
          {bars.map((b) => (
            <div key={b.key} className={`grid gap-2 items-center text-[12px] ${D.barGrid > 1 ? 'grid-cols-[minmax(0,1fr)_auto] gap-y-1' : 'grid-cols-[76px_minmax(0,1fr)_auto]'}`}>
              <span className="truncate" style={{ color: '#c8daed' }}>{b.label}</span>
              <span className={`rounded-md overflow-hidden ${D.barGrid > 1 ? 'col-span-2 row-start-2' : ''}`} style={{ height: D.barH, background: 'rgba(255,255,255,.12)' }}>
                <i className="block h-full rounded-md"
                   style={{ width: `${b.v ? Math.max(3, (b.v / peak) * 100) : 0}%`, background: b.color }} />
              </span>
              <b className={`text-right text-[12.5px] tabular-nums whitespace-nowrap ${D.barGrid > 1 ? 'row-start-1 col-start-2' : 'min-w-[58px]'}`}>{fmtEur0(b.v)}</b>
            </div>
          ))}
          </div>
          {hint && (
            <p className="mt-1 grid gap-2.5 items-center rounded-[12px] text-[12px] leading-snug"
               style={{ gridTemplateColumns: `${D.hintIcon}px minmax(0,1fr)`, padding: D.hintPad, background: 'rgba(255,255,255,.1)', color: '#dce8f4' }} data-testid="tools-hint">
              <span className="rounded-[8px] grid place-items-center" style={{ width: D.hintIcon, height: D.hintIcon, background: '#f5b452', color: '#3b2500' }}>
                <Euro size={Math.round(D.hintIcon * 0.55)} aria-hidden="true" />
              </span>
              <span><b className="text-paper">{hint.b}</b> {hint.s}</span>
            </p>
          )}
        </section>

        {/* ── the six steps, in three pairs ──────────────────────── */}
        <section className="grid" style={{ gap: D.groupGap }} data-testid="tools-steps">
          {groups.map((g, gi) => (
            <div key={g.title} className="grid" style={{ gap: D.cardGap + 2 }}>
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink mx-0.5">
                <i className="not-italic w-[20px] h-[20px] rounded-full grid place-items-center text-[11.5px] font-bold text-paper"
                   style={{ background: '#1a3a52' }}>{gi + 1}</i>
                {g.title}
              </h2>
              <div className="grid" style={{ gap: D.cardGap }}>
                {g.steps.map((s, i) => <StepCard key={s.key} step={s} first={i === 0} t={t} />)}
              </div>
            </div>
          ))}
        </section>

        {/* ── the office ─────────────────────────────────────────── */}
        <section className="grid gap-2" data-testid="tools-office">
          <h2 className="font-headings font-bold text-[16px] text-ink">{t('tools_office')}</h2>
          <div className="grid grid-cols-3 gap-2">
            {office.map((tile) => <OfficeTile key={tile.key} tile={tile} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
