import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  Briefcase, Loader2, Search, Square, Navigation, Phone, FileText, Send,
  CalendarClock, Calculator, Receipt, Plus,
} from 'lucide-react';
import { stepStates, daysSince } from '../../utils/jobSteps';
import { routeHref } from '../../utils/maps';
import { telHref } from '../../utils/sms';
import { moneyLocale } from '../../utils/money';
import JobRing from '../../components/pro/JobRing';
import JobCard from '../../components/pro/JobCard';
import useJobAction from '../../hooks/useJobAction';

/**
 * Every job, in the two states a business cares about: what is running and
 * what is still coming.
 *
 * What this replaces, measured at 390 px: 597 of the first 820 pixels — 73 %
 * of the screen — went on a title, a subtitle listing project tools, four KPI
 * tiles of which two read € 0,00, a search box and ten filter chips, four of
 * them off the right edge. The first job row began below all of it and said
 * "— · A-2026-0077": no customer, no date, no amount.
 *
 * Now: one ring that says how much work is in flight and where it is stuck,
 * three tabs, and cards that carry the customer, the place, the money and the
 * same five step dots the job page draws as five cards. The ring's slices map
 * exactly onto the tabs — two overlapping classifications of the same pile is
 * the fastest way to make an overview untrustworthy.
 */

const LIVE = ['accepted', 'scheduled', 'in_progress'];
const PIPE = ['lead', 'quoted'];
const DONE = ['completed'];

const TABS = [
  { key: 'live', statuses: LIVE, labelKey: 'ov_tab_live' },
  { key: 'pipeline', statuses: PIPE, labelKey: 'ov_tab_pipeline' },
  { key: 'done', statuses: DONE, labelKey: 'ov_tab_done' },
];

/* Above this many rows in one tab, the search box earns its 56 px. Below it,
   scrolling is faster than typing and the field is just chrome. */
const SEARCH_FROM = 8;

export default function PMProjectsPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  // `?mode=project` narrows this to jobs carrying the full PM toolkit,
  // `?mode=simple` to plain jobs. Without it the Projekt tile and the Auftrag
  // tile on the home screen landed on the identical screen.
  const [params] = useSearchParams();
  const mode = params.get('mode');
  const isProject = mode === 'project';

  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsToolkit, setNeedsToolkit] = useState(false);
  const [tab, setTab] = useState('live');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      /* Two requests, no new endpoint. The quotes are here because a job that
         has been quoted carries no `contract_amount` yet — the column is only
         filled on acceptance — so without them the offered slice of the ring
         would always be zero. */
      const [j, q] = await Promise.all([
        api.get('/api/jobs', { params: { limit: 200, ...(mode ? { mode } : {}) } }),
        api.get('/api/quotes', { params: { limit: 200 } }).catch(() => null),
      ]);
      setJobs(j.data.jobs || []);
      setQuotes(q?.data?.quotes || []);
    } catch (e) {
      if (e?.response?.status === 402) setNeedsToolkit(true);
    } finally { setLoading(false); }
  }, [mode]);

  useEffect(() => { load(); }, [load]);

  const act = useJobAction({ t, onChanged: () => load() });

  /* Two maps out of one list: the quote a pipeline job is waiting on, and the
     accepted one that says what a live job is worth. The second matters
     because `jobs.contract_amount` is only filled on acceptance — a job that
     was accepted through an older path can still be null there, and a ring
     that then reports € 0 for four booked jobs is worse than no ring. */
  /* Quotes are not filtered by mode, the job list is. Counting a quote whose
     job is not on this screen made the ring claim € 250 offered above a
     Pipeline tab that showed nothing — the one promise this ring makes is
     that its total is what the three tabs contain. */
  const mine = useMemo(() => new Set(jobs.map((j) => j.id)), [jobs]);
  const sentFor = useMemo(() => {
    const m = {};
    for (const q of quotes) {
      if (q.status === 'sent' && q.job_id && mine.has(q.job_id) && !m[q.job_id]) m[q.job_id] = q;
    }
    return m;
  }, [quotes, mine]);
  const wonFor = useMemo(() => {
    const m = {};
    for (const q of quotes) if (q.status === 'accepted' && q.job_id && !m[q.job_id]) m[q.job_id] = q;
    return m;
  }, [quotes]);
  const worth = useCallback(
    (j) => Number(j.contract_amount || wonFor[j.id]?.net_total || 0), [wonFor]);

  const amounts = useMemo(() => {
    const a = { offered: 0, booked: 0, running: 0, done: 0 };
    for (const q of quotes) {
      if (q.status === 'sent' && mine.has(q.job_id)) a.offered += Number(q.net_total || 0);
    }
    for (const j of jobs) {
      const v = worth(j);
      if (j.status === 'in_progress') a.running += v;
      else if (j.status === 'accepted' || j.status === 'scheduled') a.booked += v;
      else if (j.status === 'completed') a.done += v;
    }
    return a;
  }, [jobs, quotes, worth, mine]);
  const total = amounts.offered + amounts.booked + amounts.running + amounts.done;

  const buckets = useMemo(() => {
    const b = { live: [], pipeline: [], done: [] };
    for (const j of jobs) {
      if (LIVE.includes(j.status)) b.live.push(j);
      else if (PIPE.includes(j.status)) b.pipeline.push(j);
      else if (DONE.includes(j.status)) b.done.push(j);
    }
    /* Live sorted by when it happens — a job with no date sinks. Pipeline
       sorted by how long it has been waiting, oldest first, because that is
       the one to chase. Done by how long the money has been sitting. */
    b.live.sort((x, y) => (x.scheduled_start || '9999').localeCompare(y.scheduled_start || '9999'));
    b.pipeline.sort((x, y) => (x.created_at || '').localeCompare(y.created_at || ''));
    b.done.sort((x, y) => (x.completed_at || '').localeCompare(y.completed_at || ''));
    return b;
  }, [jobs]);

  const rows = useMemo(() => {
    const list = buckets[tab] || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((j) => [j.title, j.customer_name, j.job_number, j.category]
      .some((v) => (v || '').toLowerCase().includes(q)));
  }, [buckets, tab, search]);

  if (needsToolkit) {
    return (
      <div className="min-h-screen bg-cream pb-24 md:pb-12">
        <div className="page-container py-10 max-w-2xl text-center">
          <Briefcase size={48} className="mx-auto text-teal mb-3" />
          <h1 className="text-3xl font-headings font-bold text-ink">{t('pm_needs_toolkit_title')}</h1>
          <p className="text-ink-muted mt-2 mb-6">{t('pm_needs_toolkit_body')}</p>
          <Link to="/billing" className="btn-primary inline-flex" data-testid="pm-get-toolkit-btn">{t('pm_get_toolkit_btn')}</Link>
        </div>
      </div>
    );
  }

  /* The app's locale, not the machine's: `undefined` printed
     "Wednesday, August 12" on a German page. */
  const today = new Date().toLocaleDateString(moneyLocale(),
    { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen bg-cream pb-28 md:pb-12">
      <div className="page-container py-4 max-w-3xl">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-10 h-10 rounded-[14px] bg-teal text-paper grid place-items-center shrink-0"
                aria-hidden="true"><Briefcase size={19} /></span>
          <span className="min-w-0">
            <p className="text-[12px] text-ink-muted">{today}</p>
            <h1 className="text-[17px] font-headings font-bold text-ink truncate"
                data-testid="pm-list-title">
              {isProject ? t('nav_projects') : t('nav_jobs')}
            </h1>
          </span>
          <Link to="/schedule" className="ml-auto shrink-0 w-10 h-10 rounded-[13px] bg-paper
                     border border-sm-border grid place-items-center text-ink-muted"
                aria-label={t('pm_schedule_title')} data-testid="pm-open-schedule">
            <CalendarClock size={17} />
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-14" data-testid="ov-loading">
            <Loader2 size={24} className="text-teal animate-spin" />
          </div>
        ) : (
          <>
            <JobRing amounts={amounts} total={total} tab={tab} onPick={setTab} t={t} />

            <div className="flex gap-1 rounded-full bg-cream-deep p-1 mb-3" role="tablist"
                 data-testid="ov-tabs">
              {TABS.map((tb) => (
                <button key={tb.key} type="button" role="tab" aria-selected={tab === tb.key}
                        onClick={() => setTab(tb.key)} data-testid={`ov-tab-${tb.key}`}
                        className={`flex-1 min-h-[40px] rounded-full text-[12px] font-bold
                                    ${tab === tb.key
                          ? 'bg-paper text-teal-deep shadow-[0_1px_4px_rgba(26,58,82,.15)]'
                          : 'text-ink-muted'}`}>
                  {t(tb.labelKey)} · <b className="tabular-nums">{buckets[tb.key].length}</b>
                </button>
              ))}
            </div>

            {buckets[tab].length >= SEARCH_FROM && (
              <label className="flex items-center gap-2 rounded-xl border border-sm-border bg-paper
                                px-3 mb-3 min-h-[44px]">
                <Search size={15} className="text-ink-muted shrink-0" aria-hidden="true" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                       placeholder={t('pm_search_ph')} data-testid="ov-search"
                       className="flex-1 bg-transparent text-[13px] outline-none min-w-0" />
              </label>
            )}

            {tab === 'live' && <LiveList rows={rows} t={t} act={act} worth={worth} />}
            {tab === 'pipeline' && <PipeList rows={rows} sentFor={sentFor} t={t} navigate={navigate} />}
            {tab === 'done' && <DoneList rows={rows} t={t} navigate={navigate} worth={worth} />}
          </>
        )}
      </div>

      <Link to="/leads/new" data-testid="ov-new-job"
            className="fixed right-4 bottom-[76px] md:bottom-8 z-30 flex items-center gap-1.5
                       rounded-full bg-amber text-on-amber px-4 min-h-[48px] text-[13.5px]
                       font-extrabold shadow-[0_6px_16px_rgba(26,58,82,.2)]">
        <Plus size={17} /> {t('ov_new')}
      </Link>
    </div>
  );
}


/* ── the three lists ──────────────────────────────────────────────────── */

function Empty({ text, testid }) {
  return (
    <p className="rounded-2xl border border-dashed border-sm-border bg-cream-soft px-4 py-6
                  text-center text-[13px] text-ink-soft" data-testid={testid}>{text}</p>
  );
}

/** When it happens, in the fewest words that are still true. */
function whenLabel(job, t) {
  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (job.status === 'in_progress') {
    const since = job.started_at ? new Date(job.started_at) : null;
    return since ? t('ov_running_since', { t: hhmm(since) }) : t('job_running');
  }
  if (!job.scheduled_start) return t('job_not_scheduled');
  const d = new Date(job.scheduled_start);
  const days = -daysSince(d);
  if (days === 0) return `${t('job_rel_today')} ${hhmm(d)}`;
  if (days === 1) return `${t('job_rel_tomorrow')} ${hhmm(d)}`;
  /* Built from 24-hour parts rather than toLocaleTimeString: the badge is
     narrow, and "08:00 AM" in an English locale on a German page was both
     wrong and two characters too long. */
  return `${d.toLocaleDateString(moneyLocale(), { weekday: 'short', day: 'numeric', month: 'short' })} ${hhmm(d)}`;
}

/* Who and where. A job with no customer yet falls back to what it does have
   — its number and trade — rather than leaving the line blank, which read as
   a rendering fault. */
function place(job) {
  const who = [job.customer_name, job.site_city || job.customer_city].filter(Boolean).join(' · ');
  return who || [job.job_number, job.category].filter(Boolean).join(' · ');
}

function LiveList({ rows, t, act, worth }) {
  if (!rows.length) return <Empty text={t('ov_empty_live')} testid="ov-empty-live" />;
  return (
    <div data-testid="ov-list-live">
      {rows.map((j) => {
        const running = j.status === 'in_progress';
        const tel = telHref(j.customer_phone);
        const route = routeHref(j);
        /* Only a running job has a next move worth a button here. For the
           rest the card is a row to tap — the moves live on the job page,
           where the server's transition table is known. */
        const actions = running ? [
          route && { key: 'route', label: t('day_route'), icon: Navigation, href: route, external: true },
          tel && { key: 'call', label: t('day_call'), icon: Phone, href: `tel:${tel}` },
          { key: 'finish', label: t('job_finish_do'), icon: Square, kind: 'amber',
            onClick: () => act({ id: j.id, status: j.status }, 'complete') },
        ].filter(Boolean) : [];
        return (
          <JobCard key={j.id} job={{ ...j, contract_amount: worth(j) }} states={stepStates(j)}
                   tone={running ? 'run' : 'live'}
                   meta={place(j)} badge={whenLabel(j, t)} badgeTone={running ? 'a' : 't'}
                   actions={actions} testid={`ov-job-${j.id}`} />
        );
      })}
    </div>
  );
}

function PipeList({ rows, sentFor, t, navigate }) {
  if (!rows.length) return <Empty text={t('ov_empty_pipeline')} testid="ov-empty-pipeline" />;
  const quoted = rows.filter((j) => j.status === 'quoted');
  const leads = rows.filter((j) => j.status === 'lead');
  return (
    <div data-testid="ov-list-pipeline">
      {quoted.length > 0 && (
        <>
          <Head text={t('ov_head_waiting')} n={quoted.length} testid="ov-head-waiting" />
          {quoted.map((j) => {
            const q = sentFor[j.id];
            const age = daysSince(q?.sent_at || j.updated_at || j.created_at);
            return (
              <JobCard key={j.id} job={{ ...j, contract_amount: q?.net_total || j.contract_amount }}
                       states={stepStates(j)} tone="pipe"
                       meta={[place(j), q?.quote_number].filter(Boolean).join(' · ')}
                       badge={age != null ? t('ov_days', { n: age }) : null}
                       badgeTone={age != null && age >= 7 ? 'r' : 'w'}
                       actions={[
                         q && { key: 'pdf', label: t('job_quote_pdf'), icon: FileText,
                                href: `/api/quotes/${q.id}/pdf`, external: true },
                         q && { key: 'follow', label: t('ov_follow_up'), icon: Send, kind: 'primary',
                                onClick: () => navigate(`/quotes/${q.id}`) },
                       ].filter(Boolean)}
                       testid={`ov-job-${j.id}`} />
            );
          })}
        </>
      )}
      {leads.length > 0 && (
        <>
          <Head text={t('ov_head_noquote')} n={leads.length} testid="ov-head-noquote" />
          {leads.map((j) => (
            <JobCard key={j.id} job={j} states={stepStates(j)} tone="pipe"
                     meta={[place(j), t('ov_asked', { n: daysSince(j.created_at) ?? 0 })]
                       .filter(Boolean).join(' · ')}
                     actions={[
                       { key: 'visit', label: t('ov_site_visit'), icon: CalendarClock,
                         onClick: () => navigate(`/projects/${j.id}`) },
                       { key: 'calc', label: t('ov_calculate'), icon: Calculator, kind: 'primary',
                         onClick: () => navigate('/estimate') },
                     ]}
                     testid={`ov-job-${j.id}`} />
          ))}
        </>
      )}
    </div>
  );
}

function DoneList({ rows, t, navigate, worth }) {
  if (!rows.length) return <Empty text={t('ov_empty_done')} testid="ov-empty-done" />;
  return (
    <div data-testid="ov-list-done">
      {rows.map((j) => {
        const age = daysSince(j.completed_at);
        return (
          <JobCard key={j.id} job={{ ...j, contract_amount: worth(j) }} states={stepStates(j)}
                   tone="done" meta={place(j)}
                   badge={age != null ? t('ov_done_days', { n: age }) : null}
                   badgeTone={age != null && age >= 3 ? 'r' : 'g'}
                   actions={[{ key: 'bill', label: t('job_bill_create'), icon: Receipt,
                               kind: 'primary', onClick: () => navigate(`/jobs/${j.id}/invoice`) }]}
                   testid={`ov-job-${j.id}`} />
        );
      })}
      <p className="text-[11.5px] text-ink-faint leading-relaxed text-center mt-3">
        {t('ov_done_note')}
      </p>
    </div>
  );
}

function Head({ text, n, testid }) {
  return (
    <p className="flex items-baseline gap-2 mt-3.5 mb-2 ml-0.5" data-testid={testid}>
      <b className="text-[12px] font-extrabold uppercase tracking-[0.05em] text-ink-muted">{text}</b>
      <span className="text-[12px] text-ink-faint tabular-nums">{n}</span>
    </p>
  );
}
