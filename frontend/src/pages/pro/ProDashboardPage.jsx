import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, ChevronRight, Lock, Receipt, FileText } from 'lucide-react';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import { isPremiumTier } from '../../utils/tier';
import { fmtEur, fmtEur0, moneyLocale } from '../../utils/money';
import { tradeOf } from '../../utils/trade';
import TradeMark from '../../components/TradeMark';
import SkeletonList from '../../components/motion/SkeletonList';
import { SKINS } from '../../components/pro/JobOverview';

/**
 * Dashboard, design D1 "Monatsbericht".
 *
 * One blue card that answers "how is this month going" — what was won, how
 * that compares with last month, and twelve months of quotes sent and won.
 * Under it three figures, the path from quote to money, what is still owed,
 * and the latest quotes with their trade and real title.
 *
 * What it replaced: four KPI tiles of which two were usually empty
 * ("€ 0,00", a rating dash), a smoothed line chart whose axis read 0.75 and
 * 2.25 quotes, two blurred Pro panels, and a recent-quotes list where every
 * row said "Job" and amounts read "€4180".
 */

const WON = ['accepted', 'converted'];
const SEEN = ['viewed', 'negotiating', 'accepted', 'converted', 'rejected', 'expired'];

const when = (q) => new Date(q.sent_at || q.created_at);
const wonAt = (q) => new Date(q.decided_at || q.updated_at || q.sent_at || q.created_at);

const STATUS_DOT = {
  draft: '#8b9aa7', sent: '#e0951f', viewed: '#2f74b8', negotiating: '#2f74b8',
  accepted: '#3f8a4f', converted: '#3f8a4f', rejected: '#c14655', expired: '#c14655', superseded: '#8b9aa7',
};

export default function ProDashboard() {
  const { t } = useLang();
  const [profile, setProfile] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [inv, setInv] = useState(null);
  const [cash, setCash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScopeState] = useState(() => {
    try { return localStorage.getItem('sm_dash_scope') === 'year' ? 'year' : 'month'; } catch { return 'month'; }
  });
  const setScope = (s) => {
    setScopeState(s);
    try { localStorage.setItem('sm_dash_scope', s); } catch { /* private mode */ }
  };

  useEffect(() => {
    Promise.all([
      api.get('/api/profile/pro').catch(() => null),
      api.get('/api/invoices/stats').catch(() => null),
      api.get('/api/invoices/cashflow').catch(() => null),
      api.get('/api/quotes', { params: { limit: 200 } }).catch(() => null),
    ]).then(([p, s, cf, q]) => {
      setProfile(p?.data || null);
      setInv(s?.data || null);
      setCash(cf?.data || null);
      setQuotes(q?.data?.quotes || []);
    }).finally(() => setLoading(false));
  }, []);

  const isPro = isPremiumTier(profile?.plan_tier);
  const skin = SKINS.jobs;

  const d = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const inMonth = (dt, yy, mm) => dt.getFullYear() === yy && dt.getMonth() === mm;
    const inPeriod = (dt) => (scope === 'year' ? dt.getFullYear() === y : inMonth(dt, y, m));
    const inPrev = (dt) => (scope === 'year'
      ? dt.getFullYear() === y - 1
      : inMonth(dt, m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1));

    const won = quotes.filter((q) => WON.includes(q.status));
    const wonNow = won.filter((q) => inPeriod(wonAt(q)));
    const wonPrev = won.filter((q) => inPrev(wonAt(q)));
    const sum = (arr) => arr.reduce((s, q) => s + Number(q.gross_total || 0), 0);
    const booked = sum(wonNow);
    const bookedPrev = sum(wonPrev);

    const sent = quotes.filter((q) => q.status !== 'draft' && q.status !== 'superseded');
    const sentNow = sent.filter((q) => inPeriod(when(q)));
    const decidedNow = sentNow.filter((q) => ['accepted', 'converted', 'rejected', 'expired'].includes(q.status));
    const wonOfSent = sentNow.filter((q) => WON.includes(q.status)).length;
    const rate = sentNow.length ? Math.round((wonOfSent / sentNow.length) * 100) : null;
    const avg = wonNow.length ? booked / wonNow.length : (won.length ? sum(won) / won.length : 0);

    /* Twelve months of the current year: how many went out, how many of
       those were won. Counts, so the axis is whole quotes — never 0.75. */
    const bars = Array.from({ length: 12 }, (_, i) => {
      const ms = sent.filter((q) => inMonth(when(q), y, i));
      return { i, sent: ms.length, won: ms.filter((q) => WON.includes(q.status)).length, cur: i === m, future: i > m };
    });
    const maxBar = Math.max(1, ...bars.map((b) => b.sent));

    const yearSent = sent.filter((q) => when(q).getFullYear() === y);
    // Every step is a subset of the one above it: the same quotes, followed
    // through. "Paid" used to be the paid-invoice count, a different set, so
    // the funnel could get wider at the bottom.
    const yearWon = yearSent.filter((q) => WON.includes(q.status));
    const funnel = [
      { key: 'sent', n: yearSent.length },
      { key: 'viewed', n: yearSent.filter((q) => SEEN.includes(q.status) || q.first_viewed_at).length },
      { key: 'won', n: yearWon.length },
      { key: 'paid', n: yearWon.filter((q) => q.job_paid).length },
    ];

    const recent = [...quotes].sort((a, b) => when(b) - when(a)).slice(0, 5);
    const label = scope === 'year'
      ? String(y)
      : now.toLocaleDateString(moneyLocale(), { month: 'long' });
    const prevLabel = scope === 'year'
      ? String(y - 1)
      : new Date(y, m - 1, 1).toLocaleDateString(moneyLocale(), { month: 'short' });
    return {
      booked, bookedPrev, nWon: wonNow.length, sentNow: sentNow.length, decided: decidedNow.length,
      rate, avg, bars, maxBar, funnel, recent, label, prevLabel,
    };
  }, [quotes, scope]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper pb-24">
        <div className="page-container max-w-3xl py-6"><SkeletonList rows={4} /></div>
      </div>
    );
  }

  const delta = d.booked - d.bookedPrev;
  /* Three letters, not one: J, J, J and M, M under the bars were guesswork.
     The locale gives "Jän" in Austria and "Jan" in Germany. */
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(2026, i, 1).toLocaleDateString(moneyLocale(), { month: 'short' }).replace('.', '').slice(0, 3));
  const pending = Number(inv?.pending_brutto || 0);
  const funnelMax = Math.max(1, ...d.funnel.map((f) => f.n));
  const FUNNEL_BG = {
    sent: skin.grad,
    viewed: 'linear-gradient(135deg,#4f8fc9,#2f74b8)',
    won: 'linear-gradient(135deg,#62c176,#3f8a4f 55%,#2c6b39)',
    paid: 'linear-gradient(135deg,#2d8597,#1f5f70 55%,#163a47)',
  };
  const cashWeeks = (cash?.weeks || []).slice(0, 6);
  const cashMax = Math.max(1, ...cashWeeks.map((w) => Number(w.amount || 0)));

  return (
    <div className="min-h-screen bg-paper pb-28 md:pb-10">
      <div className="page-container max-w-3xl py-5 grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-headings font-bold text-ink text-[24px]">{t('nav_dashboard')}</h1>
          <div className="flex bg-[#eef2f5] rounded-[10px] p-[3px] text-[12px] font-semibold" role="tablist"
               data-testid="db-scope">
            {['month', 'year'].map((s) => (
              <button key={s} type="button" role="tab" aria-selected={scope === s} onClick={() => setScope(s)}
                      data-testid={`db-scope-${s}`}
                      className={`px-3 py-[5px] rounded-lg transition-colors duration-ui
                                  ${scope === s ? 'bg-paper text-[#1e5490] shadow-sm' : 'text-ink-muted'}`}>
                {t(s === 'month' ? 'db_month' : 'db_year')}
              </button>
            ))}
          </div>
        </div>

        {/* ── the month (or year) ─────────────────────────────── */}
        <div className="rounded-[22px] p-4 text-paper grid gap-2.5"
             style={{ background: skin.grad, boxShadow: '0 14px 28px rgba(23,58,94,.26)' }} data-testid="db-hero">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: skin.soft }}>
              {t('db_so_far', { p: d.label })}
            </span>
            {(d.booked > 0 || d.bookedPrev > 0) && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-[3px]"
                    style={{ background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.2)' }}
                    data-testid="db-delta">
                {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {`${delta >= 0 ? '+' : '−'}${fmtEur0(Math.abs(delta))} ${t('db_vs', { p: d.prevLabel })}`}
              </span>
            )}
          </div>
          <p className="font-headings font-bold text-[32px] leading-none tabular-nums" data-testid="db-booked">
            {fmtEur(d.booked)}
          </p>
          <p className="text-[12px]" style={{ color: skin.soft }}>
            {t(d.nWon === 1 ? 'db_booked_one' : 'db_booked_many', { n: d.nWon })}
          </p>
          <div className="grid grid-cols-12 gap-1 h-[96px] items-end mt-1" aria-hidden="true">
            {d.bars.map((b) => (
              <div key={b.i} className="relative flex flex-col justify-end gap-[3px] h-full">
                {/* A faint line before each quarter, so the year reads in four parts. */}
                {b.i % 3 === 0 && b.i > 0 && (
                  <i className="absolute -left-[2.5px] top-3.5 bottom-4 w-px" style={{ background: 'rgba(255,255,255,.16)' }} />
                )}
                <span className="text-[9.5px] text-center font-bold tabular-nums whitespace-nowrap min-h-[12px]"
                      data-testid={b.cur ? 'db-bar-cur' : undefined}>
                  {b.cur && b.sent ? `${b.sent}/${b.won}` : ''}
                </span>
                <i className="block rounded-t-[4px] rounded-b-[2px] relative overflow-hidden"
                   style={{ height: `${Math.max(4, (b.sent / d.maxBar) * 56)}px`,
                            background: b.future ? 'rgba(255,255,255,.10)' : b.cur ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.28)' }}>
                  <u className="absolute inset-x-0 bottom-0 bg-paper"
                     style={{ height: b.sent ? `${(b.won / b.sent) * 100}%` : 0 }} />
                </i>
                <span className="text-[9.5px] text-center tracking-[-0.02em]" style={{ color: b.cur ? '#fff' : '#a9c3dc', fontWeight: b.cur ? 700 : 400 }}>
                  {months[b.i]}
                </span>
              </div>
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-[10.5px]" style={{ color: skin.soft }}>
            <i className="w-2 h-2 rounded-sm" style={{ background: 'rgba(255,255,255,.35)' }} />{t('db_bar_sent')}
            <i className="w-2 h-2 rounded-sm bg-paper ml-2" />{t('db_bar_won')}
          </p>
        </div>

        {/* ── three figures ───────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-1.5" data-testid="db-kpis">
          {[
            { k: 'sent', v: String(d.sentNow), l: t('db_kp_sent') },
            { k: 'rate', v: d.rate == null ? '—' : `${d.rate} %`, l: t('db_kp_rate'), c: '#3f8a4f' },
            { k: 'avg', v: d.avg ? fmtEur0(d.avg) : '—', l: t('db_kp_avg') },
          ].map((x) => (
            <div key={x.k} className="rounded-[14px] px-2.5 py-2 grid gap-px min-w-0"
                 style={{ border: '1.5px solid #e3e9ee' }} data-testid={`db-kp-${x.k}`}>
              <b className="font-headings text-[18px] tabular-nums truncate" style={{ color: x.c || '#1a3a52' }}>{x.v}</b>
              <span className="text-[10.5px] text-ink-muted truncate">{x.l}</span>
            </div>
          ))}
        </div>

        {/* ── from quote to money ─────────────────────────────── */}
        <div className="rounded-[18px] p-[13px] grid gap-2.5 bg-paper" style={{ border: '1.5px solid #e3e9ee' }}
             data-testid="db-funnel">
          <p className="flex items-baseline justify-between text-[13.5px] font-bold text-ink">
            {t('db_funnel')}
            <span className="text-[11.5px] font-medium text-ink-muted">{new Date().getFullYear()}</span>
          </p>
          <div className="grid gap-[5px]">
            {d.funnel.map((f) => (
              <div key={f.key} className="flex items-center justify-between rounded-[9px] px-2.5 py-1.5 text-paper text-[11.5px] font-semibold min-w-[110px]"
                   style={{ width: `${Math.max(32, (f.n / funnelMax) * 100)}%`, background: FUNNEL_BG[f.key] }}>
                <span className="truncate">{t(`db_f_${f.key}`)}</span>
                <b className="font-headings tabular-nums ml-2">{f.n}</b>
              </div>
            ))}
          </div>
        </div>

        {/* ── what is still owed ──────────────────────────────── */}
        {pending > 0 && (
          <Link to="/my-invoices" data-testid="db-pending"
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 items-center rounded-[18px] p-[13px]"
                style={{ background: '#fff8ec', border: '1.5px solid #f0d5a6' }}>
            <span className="w-9 h-9 rounded-[11px] grid place-items-center text-paper"
                  style={{ background: 'linear-gradient(135deg,#f5b452,#e0951f 55%,#b8700f)' }}>
              <Receipt size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14px] text-ink tabular-nums">{t('db_open', { v: fmtEur(pending) })}</b>
              <small className="block text-[11.5px] text-ink-muted truncate">
                {t(Number(inv?.pending_count) === 1 ? 'db_open_one' : 'db_open_many', { n: inv?.pending_count || 0 })}
              </small>
            </span>
            <ChevronRight size={18} className="text-ink-faint" aria-hidden="true" />
          </Link>
        )}

        {/* ── money coming in (Pro) ───────────────────────────── */}
        {isPro && cashWeeks.length > 0 && (
          <div className="rounded-[18px] p-[13px] grid gap-2.5 bg-paper" style={{ border: '1.5px solid #e3e9ee' }}
               data-testid="db-cash">
            <p className="text-[13.5px] font-bold text-ink">{t('db_cash')}</p>
            <div className="grid grid-cols-6 gap-2 items-end h-[92px]">
              {cashWeeks.map((w) => {
                const a = Number(w.amount || 0);
                return (
                  <div key={w.label} className="grid justify-items-center content-end gap-[3px] h-full">
                    <small className="text-[10px] font-bold text-[#3f8a4f] h-3 tabular-nums">{a ? fmtEur0(a) : ''}</small>
                    <span className="w-full max-w-[40px] rounded-[7px]"
                          style={{ height: `${Math.max(6, (a / cashMax) * 56)}px`,
                                   background: a ? 'linear-gradient(135deg,#62c176,#3f8a4f 55%,#2c6b39)' : '#eef2f5' }} />
                    <em className="not-italic text-[10px] text-ink-faint">{w.label}</em>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── latest quotes ───────────────────────────────────── */}
        <div className="rounded-[18px] p-[13px] grid gap-2 bg-paper" style={{ border: '1.5px solid #e3e9ee' }}
             data-testid="db-recent">
          <p className="flex items-baseline justify-between text-[13.5px] font-bold text-ink">
            {t('dash_recent_quotes')}
            <Link to="/quotes" className="text-[11.5px] font-semibold text-teal">{t('btn_view_all')}</Link>
          </p>
          {d.recent.length === 0 ? (
            <div className="text-center py-6">
              <FileText size={26} className="text-ink-muted mx-auto mb-2" aria-hidden="true" />
              <p className="text-ink-muted text-sm">{t('quotes_empty_hint')}</p>
              <Link to="/estimate" className="btn-primary text-xs mt-3 inline-flex">{t('ov_calculate')}</Link>
            </div>
          ) : d.recent.map((q) => {
            const trade = tradeOf(q.job_category || q.category, q.title || q.job_title);
            const won = WON.includes(q.status);
            return (
              <Link key={q.id} to={`/quotes/${q.id}`} data-testid="db-recent-row"
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2.5 items-center pt-2"
                    style={{ borderTop: '1px solid #eef2f5' }}>
                <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-paper"
                      style={{ background: won ? 'linear-gradient(135deg,#62c176,#3f8a4f 55%,#2c6b39)' : skin.grad }}>
                  {trade ? <TradeMark trade={trade} size={17} /> : <FileText size={15} aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <b className="block text-[13px] text-ink truncate">{q.title || q.job_title || t('quote')}</b>
                  <small className="flex items-center gap-1.5 text-[11px] text-ink-muted truncate">
                    <i className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_DOT[q.status] || '#8b9aa7' }} />
                    {[q.quote_number, t(`quote_status_${q.status}`)].filter(Boolean).join(' · ')}
                  </small>
                </span>
                <em className="not-italic font-bold text-[13px] text-ink tabular-nums">{fmtEur(q.gross_total)}</em>
              </Link>
            );
          })}
        </div>

        {/* ── Pro, as one line instead of three blurred panels ─── */}
        {!isPro && (
          <Link to="/billing" data-testid="dashboard-upgrade-cta"
                className="flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-[12px] text-ink-muted"
                style={{ border: '1.5px dashed #cfdae4' }}>
            <Lock size={16} className="shrink-0" aria-hidden="true" />
            <span className="flex-1">{t('db_pro_row')}</span>
            <b className="text-[#1e5490]">{t('db_pro_see')}</b>
          </Link>
        )}
      </div>
    </div>
  );
}
