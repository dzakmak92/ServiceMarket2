import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, Pencil, Search, Check, CornerUpRight, Phone, FileText, Send,
  CalendarClock, Calculator, Receipt,
} from 'lucide-react';
import TradeMark from '../TradeMark';
import { fmtEur } from '../../utils/money';
import { daysSince } from '../../utils/jobSteps';
import { routeHref } from '../../utils/maps';
import { telHref } from '../../utils/sms';

/**
 * Aufträge and Projekte drawn the way the Angebote list is drawn: one card per
 * job, the trade's mark on the left, title and number, the money on the right,
 * and a single row of what you do next. The Übersicht tab keeps the ring and
 * the spine; this one is for scanning a long list.
 *
 * Same three tabs as the overview — the rows are the parent's buckets, so the
 * two views can never disagree about what is running.
 */

/* `jobs.category` speaks the marketplace's words; the marks speak the
   estimator's. Anything without a drawn mark falls back to the briefcase. */
const TRADE_OF = {
  painting: 'maler', tiling: 'fliesen', flooring: 'fliesen', electrical: 'elektrik',
  plumbing: 'sanitaer', hvac: 'sanitaer', gardening: 'garten', home_cleaning: 'reinigung',
  handyman: 'montage', carpentry: 'montage', moving: 'montage', locksmith: 'montage',
  appliance_repair: 'montage', folierung: 'folierung',
};
export const tradeOfCategory = (c) => TRADE_OF[(c || '').toLowerCase()] || null;

const TAB_FILL = {
  live: 'bg-teal/[.14] text-teal',
  pipeline: 'bg-amber/15 text-amber-text',
  done: 'bg-green-pos/[.14] text-green-text',
};

/* Same wash as an open quote: one hue deepening with the days a job has been
   waiting on somebody. Late live jobs take the red tint a lost quote uses. */
const AGE = [
  { after: 14, card: 'bg-age-hot border-age-hot-edge', meta: 'text-age-hot-meta' },
  { after: 7, card: 'bg-age-warm border-age-warm-edge', meta: 'text-ink-muted' },
];

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function JobListView({
  tabs, tab, onTab, buckets, counts, sentFor, worth, t, act, navigate, locale,
}) {
  const [search, setSearch] = useState('');
  const list = useMemo(() => buckets[tab] || [], [buckets, tab]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((j) => [j.title, j.customer_name, j.job_number, j.category, j.site_city]
      .some((v) => (v || '').toLowerCase().includes(q)));
  }, [list, search]);

  return (
    <div data-testid="job-list-view">
      <div className="flex rounded-xl border border-sm-border bg-paper overflow-hidden mb-3"
           role="tablist" data-testid="jl-tabs">
        {tabs.map(({ key, labelKey }) => {
          const on = key === tab;
          return (
            <button key={key} type="button" role="tab" aria-selected={on}
                    onClick={() => onTab(key)} data-testid={`jl-tab-${key}`}
                    className={`flex-1 min-h-[52px] px-2 text-[13px] font-bold leading-tight
                                border-r border-sm-border last:border-r-0 transition-colors
                                duration-ui ease-out ${on ? TAB_FILL[key] : 'text-ink-muted'}`}>
              {t(labelKey)}
              <span className="block text-[11px] font-semibold opacity-90">{counts[key]}</span>
            </button>
          );
        })}
      </div>

      {list.length >= 8 && (
        <label className="flex items-center gap-2 rounded-xl border border-sm-border bg-paper
                          px-3 mb-3 min-h-[44px]">
          <Search size={15} className="text-ink-muted shrink-0" aria-hidden="true" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder={t('pm_search_ph')} data-testid="jl-search"
                 className="flex-1 bg-transparent text-[13px] outline-none min-w-0" />
        </label>
      )}

      {!rows.length ? (
        <p className="rounded-2xl border border-dashed border-sm-border bg-cream-soft px-4 py-6
                      text-center text-[13px] text-ink-soft" data-testid="jl-empty">
          {t(`ov_empty_${tab}`)}
        </p>
      ) : (
        <div className="space-y-2.5" data-testid={`jl-list-${tab}`}>
          {rows.map((j, i) => (
            <JobRow key={j.id} j={j} i={i} tab={tab} q={sentFor[j.id]} worth={worth}
                    t={t} act={act} navigate={navigate} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobRow({ j, i, tab, q, worth, t, act, navigate, locale }) {
  const trade = tradeOfCategory(j.category);
  const running = j.status === 'in_progress';
  const start = j.scheduled_start ? new Date(j.scheduled_start) : null;
  const late = tab === 'live' && !!start && !running && +start < Date.now();

  /* What the card is waiting on, in days: the sent quote in Pipeline, the
     missing invoice in Fertig. Live jobs are judged by the clock instead. */
  const waited = tab === 'pipeline' ? daysSince(q?.sent_at || j.updated_at || j.created_at)
    : tab === 'done' ? daysSince(j.completed_at) : null;
  const aged = waited != null ? AGE.find((a) => waited >= a.after) : null;
  const skin = late ? 'bg-red-warn/[.07] border-red-warn/25'
    : aged ? aged.card : 'bg-paper border-sm-border';
  const meta = aged?.meta || 'text-ink-muted';

  const amount = tab === 'pipeline' ? Number(q?.net_total || j.contract_amount || 0) : worth(j);

  /* The second line under the amount: when, for live work; the fine status
     otherwise. One line, so the card stays as short as a quote card. */
  let sub = t(`pm_status_${j.status}`);
  if (tab === 'live') {
    if (running) sub = j.started_at ? t('ov_running_since', { t: hhmm(new Date(j.started_at)) }) : t('job_running');
    else if (late) sub = t('ov_overdue');
    else if (start) sub = `${start.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })} ${hhmm(start)}`;
    else sub = t('job_not_scheduled');
  }

  const tel = telHref(j.customer_phone);
  const route = routeHref(j);
  let actions;
  if (tab === 'live') {
    actions = [
      { key: 'route', label: t('day_route'), icon: CornerUpRight, external: true,
        ...(route ? { href: route } : { disabled: true, why: t('ov_no_address') }) },
      { key: 'call', label: t('day_call'), icon: Phone,
        ...(tel ? { href: `tel:${tel}` } : { disabled: true, why: t('ov_no_phone') }) },
      { key: 'finish', label: t('ov_tab_done'), icon: Check, primary: true,
        ...(running ? { onClick: () => act({ id: j.id, status: j.status }, 'complete') }
          : { disabled: true, why: t('ov_not_started') }) },
    ];
  } else if (tab === 'pipeline' && j.status === 'quoted') {
    actions = [
      { key: 'pdf', label: t('job_quote_pdf'), icon: FileText, external: true,
        ...(q ? { href: `/api/quotes/${q.id}/pdf` } : { disabled: true }) },
      { key: 'follow', label: t('ov_follow_up'), icon: Send, primary: true,
        ...(q ? { onClick: () => navigate(`/quotes/${q.id}`) } : { disabled: true }) },
    ];
  } else if (tab === 'pipeline') {
    actions = [
      { key: 'visit', label: t('ov_site_visit'), icon: CalendarClock,
        onClick: () => navigate(`/projects/${j.id}`) },
      { key: 'calc', label: t('ov_calculate'), icon: Calculator, primary: true,
        onClick: () => navigate(trade ? `/estimate/${trade}` : '/estimate') },
    ];
  } else {
    actions = [
      { key: 'bill', label: t('job_bill_create'), icon: Receipt, primary: true,
        onClick: () => navigate(`/jobs/${j.id}/invoice`) },
    ];
  }

  return (
    <div className={`rounded-2xl border p-3.5 animate-rise ${skin}`}
         style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
         data-testid="jl-row" data-status={j.status}>
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-xl text-navy flex items-center justify-center shrink-0
                          ${aged || late ? 'bg-white/70' : 'bg-navy-wedge'}`}
              aria-hidden="true" data-testid="jl-mark" data-trade={trade || 'none'}>
          {trade ? <TradeMark trade={trade} size={22} /> : <Briefcase size={19} />}
        </span>
        <Link to={`/projects/${j.id}`}
              className="min-w-0 flex-1 group min-h-[44px] flex flex-col justify-center"
              data-testid="jl-open">
          <div className="font-headings font-bold text-[16px] text-ink leading-tight truncate
                          group-hover:text-teal">
            {j.title || j.job_number || t('nav_jobs_one')}
          </div>
          <div className={`text-[13px] truncate mt-0.5 ${meta}`}>
            {[j.job_number, j.customer_name, j.site_city || j.customer_city].filter(Boolean).join(' · ')}
          </div>
        </Link>
        <div className="text-right shrink-0">
          <div className="font-headings font-bold text-[17px] text-ink tabular-nums">
            {amount > 0 ? fmtEur(amount) : '—'}
          </div>
          <div className={`text-[12px] mt-0.5 ${late ? 'text-red-text font-semibold' : meta}`}>
            {sub}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1 flex rounded-xl border border-sm-border bg-paper overflow-hidden min-w-0">
          {actions.map((a) => <Action key={a.key} a={a} testid={`jl-act-${a.key}`} />)}
        </div>
        <Link to={`/projects/${j.id}`} data-testid="jl-edit"
              title={t('nav_jobs_one')} aria-label={t('nav_jobs_one')}
              className="shrink-0 min-h-[44px] min-w-[44px] rounded-xl border border-sm-border
                         bg-paper text-ink flex items-center justify-center">
          <Pencil size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function Action({ a, testid }) {
  const Icon = a.icon;
  const cls = `flex-1 min-w-0 min-h-[44px] px-1.5 flex items-center justify-center gap-1.5
               text-[12.5px] font-bold border-r border-sm-border last:border-r-0
               ${a.disabled ? 'text-ink-faint' : a.primary ? 'bg-teal/[.12] text-teal' : 'text-ink'}`;
  const inner = (<><Icon size={15} className="shrink-0" aria-hidden="true" /><span className="truncate">{a.label}</span></>);
  if (a.disabled) {
    return <span className={cls} title={a.why} aria-disabled="true" data-testid={testid}>{inner}</span>;
  }
  if (a.href) {
    return (
      <a href={a.href} className={cls} data-testid={testid}
         {...(a.external ? { target: '_blank', rel: 'noreferrer' } : {})}>{inner}</a>
    );
  }
  return <button type="button" onClick={a.onClick} className={cls} data-testid={testid}>{inner}</button>;
}
