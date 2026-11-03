import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, ChevronRight, Plus, Calculator, FileText, Handshake, Building2, Receipt,
  Wrench, Users, CalendarDays, Send,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import { fmtEur, fmtEur0, moneyLocale } from '../../utils/money';
import { daysSince } from '../../utils/jobSteps';
import useJobAction from '../../hooks/useJobAction';
import { useCalcDrafts } from '../../components/pro/CalcDraftList';
import SkeletonList from '../../components/motion/SkeletonList';
import { JobTile, TileCard, toneFor, SKINS } from '../../components/pro/JobOverview';
import { tradeOf } from '../../utils/trade';

/**
 * Startseite, design A1 "Prozesslinie".
 *
 *   greeting → search → "Als Nächstes" (one card, the job to do now) →
 *   the six steps of the work in the order they happen, joined by a line:
 *   Kalkulation → Angebote → Aufträge → Projekte → Rechnungen → Wartung →
 *   tools that belong to every step: Kunden, Termine.
 *
 * Each step row carries its count and, where something needs attention, one
 * coloured word saying what ("2 überfällig", "ältestes 16 Tage"). The colours
 * are the ones the step uses on its own page, so a row and the page it opens
 * look like the same thing.
 */

const LIVE = ['accepted', 'scheduled', 'in_progress'];
const OPEN_Q = ['draft', 'sent', 'viewed', 'negotiating'];

const STEP_BG = {
  violet: 'linear-gradient(135deg,#8c6be0,#6d4bc2 55%,#4f3399)',
  orange: 'linear-gradient(135deg,#f5b452,#e0951f 55%,#b8700f)',
  blue: 'radial-gradient(120% 140% at 100% 0%,#2f74b8 0%,#1e5490 45%,#173a5e 100%)',
  petrol: 'linear-gradient(135deg,#2d8597,#1f5f70 55%,#163a47)',
  green: 'linear-gradient(135deg,#62c176,#3f8a4f 55%,#2c6b39)',
  slate: 'linear-gradient(135deg,#6f8295,#4d6477 55%,#34495a)',
  red: 'linear-gradient(135deg,#e27984,#c14655 55%,#93303c)',
};
const DOT = { red: '#c14655', orange: '#e0951f' };

function greetingKey() {
  const h = new Date().getHours();
  if (h < 11) return 'home_hi_morning';
  if (h < 18) return 'home_hi_day';
  return 'home_hi_evening';
}

export default function ProHomePage() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const drafts = useCalcDrafts();

  const [profile, setProfile] = useState(null);
  const [counts, setCounts] = useState({});
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [inv, setInv] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const [p, c, j, qs, o, s, cu] = await Promise.all([
      api.get('/api/profile/pro').catch(() => null),
      api.get('/api/jobs/counts').catch(() => null),
      api.get('/api/jobs', { params: { limit: 200 } }).catch(() => null),
      api.get('/api/quotes', { params: { limit: 200 } }).catch(() => null),
      api.get('/api/invoices/overdue').catch(() => null),
      api.get('/api/invoices/stats').catch(() => null),
      api.get('/api/customers', { params: { limit: 1 } }).catch(() => null),
    ]);
    setProfile(p?.data || null);
    setCounts(c?.data || {});
    setJobs(j?.data?.jobs || []);
    setQuotes(qs?.data?.quotes || []);
    setOverdue(o?.data?.invoices || []);
    setInv(s?.data || null);
    setCustomers(cu?.data?.total ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const act = useJobAction({ t, onChanged: () => load() });

  const d = useMemo(() => {
    const now = Date.now();
    const live = jobs.filter((j) => LIVE.includes(j.status));
    const late = live.filter((j) => j.status !== 'in_progress' && j.scheduled_start
      && +new Date(j.scheduled_start) < now - 3600000);
    /* What to do now: the job that is running, else the next booked one
       (overdue first, because they sort earliest), else nothing. */
    const running = live.filter((j) => j.status === 'in_progress');
    const booked = live.filter((j) => j.status !== 'in_progress' && j.scheduled_start)
      .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
    const next = running[0] || booked[0] || null;

    const openQ = quotes.filter((x) => OPEN_Q.includes(x.status));
    const openSum = openQ.reduce((s, x) => s + Number(x.gross_total || 0), 0);
    const waiting = openQ.filter((x) => x.status !== 'draft')
      .sort((a, b) => new Date(a.sent_at || a.created_at) - new Date(b.sent_at || b.created_at));
    const oldest = waiting[0] || null;
    const oldestDays = oldest ? daysSince(oldest.sent_at || oldest.created_at) : null;

    const todayKey = new Date().toDateString();
    const today = jobs.filter((j) => j.scheduled_start
      && new Date(j.scheduled_start).toDateString() === todayKey).length;

    return { live, late, next, openSum, oldest, oldestDays, today, running: running.length };
  }, [jobs, quotes]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper pb-28">
        <div className="page-container max-w-3xl py-6"><SkeletonList rows={5} /></div>
      </div>
    );
  }

  const name = profile?.business_name || user?.name || '';
  const pending = Number(inv?.pending_brutto || 0);
  const pendingN = Number(inv?.pending_count || 0);
  const skin = SKINS.jobs;

  /* The six steps, in the order the work happens. `warn` is the one thing on
     the row worth a colour; everything else is grey. */
  const steps = [
    {
      key: 'kalkulation', to: '/estimate', icon: Calculator, color: 'violet', label: t('stage_kalkulation'),
      sub: t(drafts.length === 1 ? 'home_drafts_one' : 'home_drafts', { n: drafts.length })
        + (counts.kalkulation ? ` · ${t(counts.kalkulation === 1 ? 'home_leads_one' : 'home_leads', { n: counts.kalkulation })}` : ''),
      add: true,
    },
    {
      key: 'angebot', to: '/quotes', icon: FileText, color: 'orange', label: t('home_step_quotes'),
      n: counts.angebot ?? 0,
      sub: d.openSum > 0 ? t('home_open_sum', { v: fmtEur0(d.openSum) }) : t('home_none_open'),
      warn: d.oldestDays != null && d.oldestDays >= 7 ? { c: 'orange', text: t('home_oldest', { n: d.oldestDays }) } : null,
    },
    {
      key: 'auftrag', to: '/projects?mode=simple', icon: Handshake, color: 'blue', label: t('home_step_jobs'),
      n: counts.auftrag ?? 0,
      sub: d.running ? t('home_running', { n: d.running }) : t('home_booked', { n: counts.auftrag ?? 0 }),
      warn: d.late.length ? { c: 'red', text: t('home_late', { n: d.late.length }) } : null,
    },
    {
      key: 'projekt', to: '/projects?mode=project', icon: Building2, color: 'petrol', label: t('home_step_projects'),
      n: counts.projekt ?? 0,
      sub: counts.projekt ? t('home_active', { n: counts.projekt }) : t('home_none_active'),
    },
    {
      key: 'rechnung', to: overdue.length ? '/overdue' : '/my-invoices', icon: Receipt, color: 'green',
      label: t('stage_rechnung'),
      value: pending > 0 ? fmtEur0(pending) : null,
      n: pendingN,
      sub: pendingN ? t('home_inv_open', { n: pendingN }) : t('home_all_paid'),
      warn: overdue.length ? { c: 'red', text: t('home_inv_late', { n: overdue.length }) } : null,
    },
    {
      key: 'wartung', to: '/recurring', icon: Wrench, color: 'slate', label: t('stage_wartung'),
      n: counts.wartung ?? 0,
      sub: counts.wartung ? t('home_visits', { n: counts.wartung }) : t('home_no_visits'),
    },
  ];

  const lateN = d.late.length;
  const waitingQuote = !d.next && d.oldest;

  return (
    <div className="min-h-screen bg-paper pb-28 md:pb-10">
      <div className="page-container max-w-3xl py-4 grid gap-4">
        {/* ── greeting ─────────────────────────────────────────── */}
        <header className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-[15px] grid place-items-center text-paper font-headings font-bold text-[18px] shrink-0"
                style={{ background: skin.grad, boxShadow: '0 6px 14px rgba(30,84,144,.3)' }} aria-hidden="true">
            {(name || '?').trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-[12px] text-ink-muted">
              {new Date().toLocaleDateString(moneyLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="font-headings font-bold text-ink text-[21px] leading-tight truncate" data-testid="home-hi">
              {t(greetingKey())}
            </h1>
          </div>
        </header>

        {/* ── search ───────────────────────────────────────────── */}
        <form role="search" data-testid="home-search"
              onSubmit={(e) => { e.preventDefault(); navigate(`/customers${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); }}
              className="flex items-center gap-2.5 rounded-[14px] px-3 min-h-[46px] bg-[#f3f6f9]"
              style={{ border: '1.5px solid #e3e9ee' }}>
          <Search size={17} className="text-ink-faint shrink-0" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('home_search_ph')}
                 aria-label={t('home_search_ph')} data-testid="home-search-input"
                 className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-ink placeholder:text-ink-faint" />
        </form>

        {/* ── next ─────────────────────────────────────────────── */}
        <section className="grid gap-2" data-testid="home-next">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] uppercase tracking-[.11em] font-bold text-ink-faint">{t('home_next')}</p>
            {lateN > 0 && (
              <span className="text-[11px] font-bold rounded-full px-2.5 py-[3px]"
                    style={{ background: '#fdeef0', color: '#c14655', border: '1px solid #efc3c9' }}>
                {t('home_late', { n: lateN })}
              </span>
            )}
          </div>
          {d.next ? (
            <JobTile j={d.next} tab="live" q={null} worth={(j) => Number(j.contract_amount || 0)}
                     t={t} act={act} skin={skin} />
          ) : waitingQuote ? (
            <TileCard tone={toneFor('orange', skin)} to={`/quotes/${d.oldest.id}`} testid="home-next-quote"
                      trade={tradeOf(d.oldest.job_category, d.oldest.title || d.oldest.job_title)}
                      title={d.oldest.title || d.oldest.job_title || t('quote')}
                      sub={[d.oldest.customer_name, d.oldest.quote_number].filter(Boolean).join(' · ')}
                      big={t('ov_days', { n: d.oldestDays ?? 0 })} small={t(`quote_status_${d.oldest.status}`)}
                      amount={fmtEur(d.oldest.gross_total)} note={t('qv_gross')}
                      primary={{ key: 'follow', icon: Send, label: t('ov_follow_up'), to: `/quotes/${d.oldest.id}` }} />
          ) : (
            <Link to="/estimate" data-testid="home-next-idle"
                  className="flex items-center gap-3 rounded-2xl p-4 text-paper"
                  style={{ background: STEP_BG.violet, boxShadow: '0 10px 22px rgba(79,51,153,.25)' }}>
              <span className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'rgba(255,255,255,.18)' }}>
                <Calculator size={20} aria-hidden="true" />
              </span>
              <span className="flex-1 min-w-0">
                <b className="block font-headings text-[15px]">{t('home_idle_title')}</b>
                <small className="block text-[12px] opacity-90">{t('home_idle_sub')}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          )}
        </section>

        {/* ── the work, in the order it happens ────────────────── */}
        <section className="grid gap-2" data-testid="home-steps">
          <p className="text-[10.5px] uppercase tracking-[.11em] font-bold text-ink-faint">{t('home_flow')}</p>
          <div className="rounded-[18px] bg-paper overflow-hidden" style={{ border: '1.5px solid #dfe6ec' }}>
            {steps.map((s, i) => {
              const Icon = s.icon;
              const empty = !s.add && !s.n && !s.value;
              return (
                <Link key={s.key} to={s.to} data-testid={`home-step-${s.key}`}
                      className="relative grid grid-cols-[30px_auto_minmax(0,1fr)_auto] gap-2.5 items-center pl-1.5 pr-2.5 py-2.5"
                      style={{ borderTop: i ? '1px solid #eef2f5' : 0 }}>
                  {/* the line through the numbers */}
                  <i aria-hidden="true" className="absolute left-[20px] w-[2px] bg-[#e3e9ee]"
                     style={{ top: i === 0 ? '50%' : 0, bottom: i === steps.length - 1 ? '50%' : 0 }} />
                  <span className="relative z-[1] justify-self-center w-5 h-5 rounded-full grid place-items-center text-[10.5px] font-extrabold text-paper"
                        style={{ background: STEP_BG[s.color], boxShadow: '0 0 0 3px #fff' }}>
                    {i + 1}
                  </span>
                  <span className="w-[34px] h-[34px] rounded-[11px] grid place-items-center text-paper"
                        style={{ background: STEP_BG[s.color], opacity: empty ? 0.55 : 1 }}>
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <b className={`block text-[14.5px] ${empty ? 'text-ink-muted' : 'text-ink'}`}>{s.label}</b>
                    <small className="flex items-center gap-1.5 text-[11.5px] text-ink-muted truncate">
                      {s.warn && <i className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: DOT[s.warn.c] }} />}
                      <span className="truncate" style={s.warn ? { color: DOT[s.warn.c], fontWeight: 700 } : undefined}>
                        {s.warn ? s.warn.text : s.sub}
                      </span>
                    </small>
                  </span>
                  <span className="flex items-center gap-1">
                    {s.add ? (
                      <span className="w-7 h-7 rounded-[9px] grid place-items-center"
                            style={{ background: '#efeaff', color: '#6d4bc2' }} aria-label={t('stage_kalkulation_go')}>
                        <Plus size={15} aria-hidden="true" />
                      </span>
                    ) : (
                      <b className={`font-headings text-[19px] tabular-nums min-w-[22px] text-right ${empty ? 'text-[#b6c3ce]' : 'text-ink'}`}>
                        {s.value || s.n}
                      </b>
                    )}
                    <ChevronRight size={16} className="text-[#b6c3ce]" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── tools that belong to every step ──────────────────── */}
        <section className="grid gap-2" data-testid="home-tools">
          <p className="text-[10.5px] uppercase tracking-[.11em] font-bold text-ink-faint">{t('home_tools')}</p>
          <div className="rounded-[18px] bg-paper overflow-hidden" style={{ border: '1.5px solid #dfe6ec' }}>
            {[
              { key: 'kunden', to: '/customers', icon: Users, color: 'slate', label: t('home_customers'),
                sub: customers != null ? t('home_contacts', { n: customers }) : '', n: customers },
              { key: 'termine', to: '/schedule', icon: CalendarDays, color: 'red', label: t('home_dates'),
                sub: t('home_today', { n: d.today }), n: d.today },
            ].map((x, i) => {
              const Icon = x.icon;
              return (
                <Link key={x.key} to={x.to} data-testid={`home-tool-${x.key}`}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2.5 items-center px-3 py-2.5"
                      style={{ borderTop: i ? '1px solid #eef2f5' : 0 }}>
                  <span className="w-[34px] h-[34px] rounded-[11px] grid place-items-center text-paper"
                        style={{ background: STEP_BG[x.color] }}>
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <b className="block text-[14.5px] text-ink">{x.label}</b>
                    <small className="block text-[11.5px] text-ink-muted truncate">{x.sub}</small>
                  </span>
                  <span className="flex items-center gap-1">
                    {x.n != null && <b className="font-headings text-[19px] tabular-nums text-ink">{x.n}</b>}
                    <ChevronRight size={16} className="text-[#b6c3ce]" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
