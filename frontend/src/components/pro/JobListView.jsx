import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Briefcase, Search, Check, CornerUpRight, Phone, FileText, Send, Play,
  CalendarClock, Calculator, Receipt, ExternalLink, MapPin, UserPlus, FilePlus2,
} from 'lucide-react';
import CompactRow, { MiniGroup, MiniBtn } from './CompactRow';
import { openQuotePdf } from '../../utils/openPdf';
import TradeMark from '../TradeMark';
import { tradeOf } from '../../utils/trade';
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

/* Kept as an export so older imports keep working; the logic lives in utils/trade. */
export const tradeOfCategory = (c, title) => tradeOf(c, title);

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
        <div className="rounded-2xl border border-dashed border-sm-border bg-cream-soft px-4 py-6
                        text-center" data-testid="jl-empty">
          <p className="text-[13px] text-ink-soft">{t(`ov_empty_${tab}`)}</p>
          {/* An empty tab says where the work is instead of stopping here. */}
          {tab === 'live' && counts.pipeline > 0 && (
            <button type="button" onClick={() => onTab('pipeline')} data-testid="jl-empty-go"
                    className="mt-3 min-h-[40px] px-4 rounded-xl border border-sm-border bg-paper
                               text-[13px] font-bold text-teal">
              {t('ov_show_pipeline', { n: counts.pipeline })}
            </button>
          )}
          {tab === 'pipeline' && (
            <button type="button" onClick={() => navigate('/estimate')} data-testid="jl-empty-go"
                    className="mt-3 min-h-[40px] px-4 rounded-xl border border-sm-border bg-paper
                               text-[13px] font-bold text-teal inline-flex items-center gap-1.5">
              <Calculator size={15} aria-hidden="true" />{t('ov_calculate')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2" data-testid={`jl-list-${tab}`}>
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
  const trade = tradeOf(j.category, j.title);
  const running = j.status === 'in_progress';
  const start = j.scheduled_start ? new Date(j.scheduled_start) : null;
  const late = tab === 'live' && !!start && !running && +start < Date.now();
  const open = `/projects/${j.id}`;
  /* The estimator writes the quote onto this job rather than a new one, so
     "Kalkulieren" from a lead does not leave a twin behind in the pipeline. */
  const calc = `${trade ? `/estimate/${trade}` : '/estimate'}?job=${j.id}`;

  /* What the card is waiting on, in days: the sent quote in Pipeline, the
     missing invoice in Fertig. Live jobs are judged by the clock instead. */
  const waited = tab === 'pipeline' ? daysSince(q?.sent_at || j.updated_at || j.created_at)
    : tab === 'done' ? daysSince(j.completed_at) : null;
  const aged = waited != null ? AGE.find((a) => waited >= a.after) : null;
  const skin = late ? 'bg-red-warn/[.07] border-red-warn/25'
    : aged ? aged.card : 'bg-paper border-sm-border';

  const amount = tab === 'pipeline' ? Number(q?.net_total || j.contract_amount || 0) : worth(j);

  let pill;
  if (tab === 'live') {
    if (running) pill = { tone: 'green', text: j.started_at ? t('ov_running_since', { t: hhmm(new Date(j.started_at)) }) : t('job_running') };
    else if (late) pill = { tone: 'red', text: t('ov_overdue') };
    else if (start) pill = { tone: 'teal', text: `${start.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })} ${hhmm(start)}` };
    else pill = { tone: 'amber', text: t('job_not_scheduled') };
  } else if (tab === 'pipeline') {
    pill = j.status === 'quoted'
      ? { tone: waited != null && waited >= 7 ? 'amber' : 'teal', text: waited != null ? `${t('pm_status_quoted')} · ${t('ov_days', { n: waited })}` : t('pm_status_quoted') }
      : { tone: 'muted', text: t('pm_status_lead') };
  } else {
    pill = { tone: waited != null && waited >= 3 ? 'amber' : 'green', text: waited != null ? t('ov_done_days', { n: waited }) : t('pm_status_completed') };
  }

  const pdf = async () => {
    try { await openQuotePdf(q.id); } catch { toast.error(t('generic_error')); }
  };

  /* No dead ends: every control does something. What used to be a greyed
     button — no address, no phone, not started yet, no quote — now goes to
     the place that fixes it. */
  const tel = telHref(j.customer_phone);
  const route = routeHref(j);
  let actions;
  if (tab === 'live') {
    actions = [
      route ? { key: 'route', label: t('day_route'), icon: CornerUpRight, href: route, external: true }
        : { key: 'route', label: t('ov_add_address'), icon: MapPin, to: open },
      tel ? { key: 'call', label: t('day_call'), icon: Phone, href: `tel:${tel}` }
        : { key: 'call', label: t('ov_add_phone'), icon: UserPlus, to: open },
      running
        ? { key: 'finish', label: t('job_finish_do'), icon: Check, primary: true,
            onClick: () => act({ id: j.id, status: j.status }, 'complete') }
        : { key: 'start', label: t('ov_start'), icon: Play, primary: true,
            onClick: () => act({ id: j.id, status: j.status }, 'start') },
    ];
  } else if (tab === 'pipeline' && j.status === 'quoted' && q) {
    actions = [
      { key: 'pdf', label: t('job_quote_pdf'), icon: FileText, onClick: pdf },
      { key: 'follow', label: t('ov_follow_up'), icon: Send, primary: true, to: `/quotes/${q.id}` },
    ];
  } else if (tab === 'pipeline' && j.status === 'quoted') {
    actions = [
      { key: 'quote', label: t('ov_make_quote'), icon: FilePlus2, primary: true, to: calc },
    ];
  } else if (tab === 'pipeline') {
    actions = [
      { key: 'visit', label: t('ov_site_visit'), icon: CalendarClock, to: open },
      { key: 'calc', label: t('ov_calculate'), icon: Calculator, primary: true, to: calc },
    ];
  } else {
    actions = [
      { key: 'bill', label: t('job_bill_create'), icon: Receipt, primary: true, to: `/jobs/${j.id}/invoice` },
    ];
  }

  return (
    <CompactRow
      testid="jl-row" data={{ 'data-status': j.status }} openTestid="jl-open"
      moreTestid="jl-more" menuTestid="jl-menu" menuLabel={t('ov_more')}
      style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
      skin={skin} washed={!!(aged || late)} metaClass={aged?.meta || 'text-ink-muted'}
      to={open}
      mark={<span data-testid="jl-mark" data-trade={trade || 'none'} className="contents">
        {trade ? <TradeMark trade={trade} size={24} /> : <Briefcase size={21} />}
      </span>}
      title={j.title || j.job_number || t('nav_jobs_one')}
      meta={[j.job_number, j.customer_name, j.site_city || j.customer_city].filter(Boolean).join(' · ')}
      pill={pill}
      amount={amount > 0 ? fmtEur(amount) : '—'}
      controls={(
        <MiniGroup label={t('ov_more')} testid="jl-actions">
          {actions.map((a) => (
            <MiniBtn key={a.key} icon={a.icon} label={a.label} on={a.primary}
                     onClick={a.onClick} href={a.href} to={a.to} external={a.external}
                     testid={`jl-act-${a.key}`} />
          ))}
        </MiniGroup>
      )}
      menu={[
        { key: 'open', label: t('ov_open'), icon: ExternalLink, to: open, testid: 'jl-menu-open' },
        ...actions.map((a) => ({ ...a, testid: `jl-menu-${a.key}` })),
      ]}
    />
  );
}
