import React from 'react';
import { Link } from 'react-router-dom';
import {
  FileDown, Share2, Send, Briefcase, ExternalLink, ChevronRight, FileText,
} from 'lucide-react';
import { fmtEur, fmtEur0, fmtEurBare, moneyLocale } from '../../utils/money';
import { daysSince } from '../../utils/jobSteps';
import { tradeOf } from '../../utils/trade';
import { StatusPills, TileCard, toneFor, SKINS } from './JobOverview';

/**
 * The Angebote overview, built from the same parts as Aufträge: a blue total
 * card, round status pills, and cards whose colour is their section —
 * Offen blue, Gewonnen green, Verloren red. The Liste tab keeps the verdict
 * switches; this view is for reading the pile at a glance.
 */

const OPEN = ['draft', 'sent', 'viewed', 'negotiating'];
const PARTS = [
  { key: 'draft', tab: 'open', stroke: 'rgba(255,255,255,.45)', label: 'quote_status_draft' },
  { key: 'out', tab: 'open', stroke: '#ffffff', label: 'quote_status_sent' },
  { key: 'won', tab: 'won', stroke: '#8fe0a0', label: 'quote_verdict_won' },
  { key: 'lost', tab: 'lost', stroke: '#ff9aa6', label: 'quote_verdict_lost' },
];
const QUOTE_PILLS = {
  open: { circle: null, bg: '#fff', border: '#d3dee8', fg: '#1a3a52' },
  won: { circle: '#3f8a4f', bg: '#eef8ef', border: '#c5e2ca', fg: '#2c6b39' },
  lost: { circle: '#c14655', bg: '#fdeef0', border: '#efc3c9', fg: '#8e2b38' },
};
const TABS = [
  { key: 'open', labelKey: 'quote_verdict_open' },
  { key: 'won', labelKey: 'quote_verdict_won' },
  { key: 'lost', labelKey: 'quote_verdict_lost' },
];
const SORT = { open: 'qv_sort_open', won: 'qv_sort_won', lost: 'qv_sort_lost' };

export default function QuoteOverview({
  quotes, byTab, tab, setTab, drafts, draftList, t, share, openPdf, shared, busyId,
}) {
  const skin = SKINS.jobs;
  const amounts = { draft: 0, out: 0, won: 0, lost: 0 };
  const n = { draft: 0, out: 0 };
  for (const q of quotes) {
    const v = Number(q.gross_total || 0);
    if (q.status === 'draft') { amounts.draft += v; n.draft += 1; }
    else if (OPEN.includes(q.status)) { amounts.out += v; n.out += 1; }
  }
  for (const q of byTab.won) amounts.won += Number(q.gross_total || 0);
  for (const q of byTab.lost) amounts.lost += Number(q.gross_total || 0);
  const openTotal = amounts.draft + amounts.out;
  const ringTotal = openTotal + amounts.won + amounts.lost;
  const R = 30; const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = PARTS.map((p) => {
    const len = ringTotal > 0 ? (amounts[p.key] / ringTotal) * C : 0;
    const a = { ...p, len, off: acc }; acc += len; return a;
  }).filter((a) => a.len > 0);

  const rows = tab === 'drafts' ? [] : (byTab[tab] || []);
  const leadSum = rows.reduce((s, q) => s + Number(q.gross_total || 0), 0);

  return (
    <div className="grid gap-4" data-testid="qv">
      <div className="rounded-[22px] p-[18px] text-paper grid gap-4"
           style={{ background: skin.grad, boxShadow: '0 14px 28px rgba(23,58,94,.26)' }} data-testid="qv-hero">
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
            <p className="font-headings font-bold text-[32px] leading-none tabular-nums" data-testid="qv-total">
              {fmtEur0(openTotal)}
            </p>
            <p className="text-[12.5px] mt-1.5 truncate" style={{ color: skin.soft }}>
              {t('qv_sub', { n: n.draft + n.out })}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {PARTS.map((p) => {
            const on = p.tab === tab;
            return (
              <button key={p.key} type="button" onClick={() => setTab(p.tab)} aria-pressed={on}
                      data-testid={`qv-hero-${p.key}`}
                      className="rounded-xl px-1.5 min-[400px]:px-2 py-[7px] text-left min-w-0 transition-colors duration-ui"
                      style={on ? { background: '#fff', color: skin.accent }
                        : { background: 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.14)', color: skin.soft }}>
                <span className="block text-[8.5px] min-[400px]:text-[9.5px] font-bold uppercase tracking-[0.02em] min-[400px]:tracking-[0.02em] truncate">{t(p.label)}</span>
                <span className="block text-[13.5px] min-[400px]:text-[15px] font-bold tabular-nums truncate" style={{ color: on ? skin.accent : '#fff' }}>
                  {fmtEurBare(amounts[p.key])}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Calculations someone started but never turned into a quote. A row,
          not a fourth pill: it is a different kind of thing from a quote. */}
      {drafts.length > 0 && (
        <button type="button" onClick={() => setTab(tab === 'drafts' ? 'open' : 'drafts')}
                data-testid="qv-drafts"
                className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left"
                style={{ background: tab === 'drafts' ? '#fff6e6' : '#fff', border: '1.5px solid #f0d5a6' }}>
          <span className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0"
                style={{ background: '#e0951f', color: '#fff' }}>
            <FileText size={16} aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13.5px] font-bold text-ink">{t('qv_drafts', { n: drafts.length })}</span>
            <span className="block text-[11.5px] text-ink-muted truncate">{t('qv_drafts_sub')}</span>
          </span>
          <ChevronRight size={18} className="text-ink-faint shrink-0"
                        style={{ transform: tab === 'drafts' ? 'rotate(90deg)' : 'none' }} aria-hidden="true" />
        </button>
      )}

      {tab === 'drafts' ? draftList : (
        <>
          <StatusPills tabs={TABS} tab={tab} counts={{ open: byTab.open.length, won: byTab.won.length, lost: byTab.lost.length }}
                       onPick={setTab} skin={skin} t={t} styles={QUOTE_PILLS}
                       lead={rows.length ? { text: `${t(`quote_verdict_${tab}`)} · ${t(SORT[tab])}`, amount: fmtEur(leadSum) } : null} />
          {rows.length ? (
            <div className="grid gap-3" data-testid={`qv-list-${tab}`}>
              {rows.map((q) => (
                <QuoteTile key={q.id} q={q} tab={tab} t={t} share={share} openPdf={openPdf}
                           shared={shared === q.id} busy={busyId === q.id} skin={skin} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-sm-border bg-cream-soft px-4 py-6 text-center"
                 data-testid="qv-empty">
              <p className="text-[13px] text-ink-soft">{t(`quote_empty_${tab}`)}</p>
              {tab === 'open' && (
                <Link to="/estimate" className="inline-block mt-3 min-h-[40px] leading-[40px] px-4 rounded-xl border border-sm-border bg-paper text-[13px] font-bold text-teal">
                  {t('ov_calculate')}
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const Q_STEPS = ['qv_step_created', 'qv_step_sent', 'qv_step_viewed', 'qv_step_answer'];

function quoteStates(q) {
  const decided = ['accepted', 'converted', 'rejected', 'expired'].includes(q.status);
  const done = [
    true,
    q.status !== 'draft' || !!q.sent_at,
    !!q.first_viewed_at || Number(q.viewed_count || 0) > 0 || q.status === 'viewed' || q.status === 'negotiating' || decided,
    decided,
  ];
  const last = done.reduce((a, d, i) => (d ? i : a), -1);
  return done.map((d, i) => (d ? 'done' : i === last + 1 ? 'now' : 'wait'));
}

function QuoteTile({ q, tab, t, share, openPdf, shared, busy, skin }) {
  const trade = tradeOf(q.job_category || q.category, q.title || q.job_title);
  const tone = toneFor(tab === 'won' ? 'green' : tab === 'lost' ? 'red' : 'blue', skin);
  const open = `/quotes/${q.id}`;
  const age = daysSince(q.sent_at || q.created_at);
  const decidedOn = q.decided_at ? new Date(q.decided_at) : null;
  const big = tab === 'open'
    ? (age != null ? t('ov_days', { n: age }) : '—')
    : decidedOn ? decidedOn.toLocaleDateString(moneyLocale(), { day: 'numeric', month: 'short' }) : '—';
  const sub = [q.customer_name, q.quote_number].filter(Boolean).join(' · ') || q.job_number || '';

  const icons = [
    { key: 'pdf', icon: FileDown, label: t('quote_pdf'), onClick: () => openPdf(q.id), disabled: busy },
  ];
  if (tab === 'open' && q.status !== 'draft' && q.share_token) {
    icons.push({ key: 'share', icon: Share2, label: t('quote_row_share'), onClick: () => share(q), disabled: busy });
  }
  let primary;
  if (tab === 'open' && q.status === 'draft') primary = { key: 'send', icon: Send, label: t('qv_send'), onClick: () => share(q), disabled: busy };
  else if (tab === 'open') primary = { key: 'follow', icon: Send, label: t('ov_follow_up'), to: open };
  else if (tab === 'won' && q.job_id) primary = { key: 'job', icon: Briefcase, label: t('nav_jobs_one'), to: `/projects/${q.job_id}` };
  else primary = { key: 'open', icon: ExternalLink, label: t('ov_open'), to: open };

  return (
    <div className="grid gap-1.5">
      <TileCard tone={tone} to={open} trade={trade} testid={`qv-q-${q.id}`} status={q.status}
                title={q.title || q.job_title || t('quote')} sub={sub}
                big={big} small={t(`quote_status_${q.status}`) || q.status}
                states={quoteStates(q)} labels={Q_STEPS.map((k) => t(k))}
                amount={fmtEur(q.gross_total)} note={t('qv_gross')}
                icons={icons} primary={primary} />
      {shared && (
        <p className="text-[12px] text-teal font-semibold px-1" role="status" data-testid="quote-shared">
          {t('quote_row_shared')}
        </p>
      )}
    </div>
  );
}
