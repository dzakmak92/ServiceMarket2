import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import { Loader2, ArrowRight } from 'lucide-react';
import { STAGES } from '../../utils/workflow';
import { fmtEur, fmtDate } from '../../utils/money';


/**
 * The home screen, rebuilt around the job's own lifecycle.
 *
 * What it replaced showed four marketplace statistics — open quotes, accepted
 * quotes, jobs done, star rating — above a list of "recent jobs" that read
 * `job.city` and `job.budget_max`. Those columns are called `site_city` and
 * `contract_amount`, so the location and the amount were blank on every card.
 * The rating tile came from a directory that no longer exists.
 *
 * Now: one hero that names the single most urgent thing, then the six stages
 * of a job. The grid flows column-first, so the left column is winning the
 * work and the right is delivering it; that split is what the two colour
 * families encode.
 */
export default function ProHomePage() {
  const { user } = useAuth();
  const { t } = useLang();

  const [profile, setProfile] = useState(null);
  const [counts, setCounts] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Every tile figure comes from one endpoint. Counting them client-side
    // would be five requests on a phone that is often on one bar of signal.
    const [p, c, o, q] = await Promise.all([
      api.get('/api/profile/pro').catch(() => null),
      api.get('/api/jobs/counts').catch(() => null),
      api.get('/api/invoices/overdue').catch(() => null),
      api.get('/api/quotes', { params: { status: 'sent', limit: 50 } }).catch(() => null),
    ]);
    setProfile(p?.data || null);
    setCounts(c?.data || {});
    setOverdue(o?.data?.invoices || []);
    setQuotes(q?.data?.quotes || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * What the hero says.
   *
   * Money that is late outranks a quote that is waiting, because one is owed
   * and the other is only hoped for. If neither exists the hero must not sit
   * there as a large empty box — it becomes a plain prompt to capture the
   * next lead, which is the useful thing to do on a quiet morning.
   */
  const focus = useMemo(() => {
    const worst = [...overdue].sort(
      (a, b) => (b.days_overdue || 0) - (a.days_overdue || 0))[0];
    if (worst) {
      return {
        kind: 'overdue',
        title: t('home_focus_overdue').replace('{days}', worst.days_overdue ?? 0),
        amount: fmtEur(worst.outstanding ?? worst.gross_total),
        sub: [worst.customer_name, worst.invoice_number].filter(Boolean).join(' · '),
        cta: t('home_focus_overdue_cta'),
        to: '/overdue',
      };
    }
    if (quotes.length) {
      const oldest = [...quotes].sort(
        (a, b) => new Date(a.sent_at || 0) - new Date(b.sent_at || 0))[0];
      const days = oldest?.sent_at
        ? Math.floor((Date.now() - new Date(oldest.sent_at)) / 86400000) : null;
      return {
        kind: 'quotes',
        title: t('home_focus_quotes')
          .replace('{n}', quotes.length)
          .replace('{days}', days ?? 0),
        amount: oldest?.gross_total ? fmtEur(oldest.gross_total) : null,
        sub: [oldest?.customer_name, oldest?.title].filter(Boolean).join(' · '),
        cta: t('home_focus_quotes_cta'),
        to: `/quotes/${oldest?.id || ''}`,
      };
    }
    return {
      kind: 'idle',
      title: t('home_focus_idle'),
      sub: t('home_focus_idle_sub'),
      cta: t('home_focus_idle_cta'),
      to: '/leads/new',
    };
  }, [overdue, quotes, t]);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={26} className="text-teal animate-spin" />
      </div>
    );
  }

  const worst = [...overdue].sort(
    (a, b) => (b.days_overdue || 0) - (a.days_overdue || 0))[0];

  return (
    <div className="min-h-screen bg-cream pb-28 md:pb-10">
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <header className="py-3">
          <div>
            <p className="text-xs text-ink-muted">{t('pro_welcome_back')}</p>
            <h1 className="font-headings font-bold text-ink text-xl truncate">
              {profile?.business_name || user?.name}
            </h1>
          </div>
        </header>

        {/* ── Als Nächstes ───────────────────────────────────────── */}
        <Link
          to={focus.to}
          className="block bg-teal-deep text-paper rounded-[18px] p-5 mt-1
                     focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-deep/40"
          data-testid="home-focus"
        >
          <p className="text-[10.5px] uppercase tracking-[.13em] font-bold text-teal-tint">
            {t('home_focus_kicker')}
          </p>
          <p className="font-headings font-bold text-[15px] leading-tight mt-1.5">
            {focus.title}
          </p>
          {/* The amount, at the size the thing it represents deserves.
              An overdue card is about a sum of money, and that sum used to be
              the smallest text on it — third in a run-on line, behind the
              customer and the invoice number. */}
          {focus.amount && (
            <p className="font-headings font-bold text-[34px] leading-none mt-2 tabular-nums">
              {focus.amount}
            </p>
          )}
          {focus.sub && <p className="text-[12.5px] text-teal-tint mt-1.5">{focus.sub}</p>}
          <span className="mt-4 flex items-center justify-center gap-1.5 bg-amber
                           text-on-amber rounded-xl py-3 font-headings font-bold text-sm">
            {focus.cta} <ArrowRight size={15} />
          </span>
        </Link>

        {/* ── Auftragslauf ───────────────────────────────────────── */}
        <h2 className="text-[10.5px] uppercase tracking-[.12em] font-bold text-ink-muted
                       mt-6 mb-2.5">
          {t('home_workflow')}
        </h2>
        {/* Column-first: Kalkulation/Angebot/Auftrag down the left, then
            Projekt/Wartung/Rechnung down the right. DOM order matches, so
            keyboard and screen-reader order follow the same path. */}
        <div className="grid grid-cols-2 grid-rows-3 grid-flow-col gap-2.5"
             data-testid="home-stages">
          {STAGES.map((s) => {
            const Icon = s.icon;
            const n = counts?.[s.key];
            const body = (
              <>
                {/* A badge, not a watermark. At 50 px and 40 % opacity the icon
                    was a texture behind the label — it read as noise on a solid
                    fill and would read as dirt on a white one. The dashboard's
                    stat cards have always put the icon in a tinted circle, which
                    is what makes the tint legible at this size: 10-15 % of a hue
                    is invisible as a card fill and unmistakable as a 44 px disc. */}
                <span
                  aria-hidden="true"
                  className={`absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full
                              flex items-center justify-center pointer-events-none ${s.badge}`}
                >
                  <Icon size={21} strokeWidth={1.9} />
                </span>
                <span className="relative font-headings font-bold text-[14.5px]
                                 leading-tight tracking-[-.022em]">
                  {t(s.labelKey)}
                </span>
                {/* A count, an invitation, or "coming soon" — in that order of
                    preference, and never a count this tile cannot have. The
                    invitation is teal and bold rather than muted grey, because
                    it is the only line on the grid that is a thing to press
                    rather than a thing to read. */}
                {s.action ? (
                  <span className="relative text-[11px] font-bold text-teal leading-snug
                                   inline-flex items-center gap-1">
                    {t(s.action)}<ArrowRight size={12} strokeWidth={2.6} aria-hidden="true" />
                  </span>
                ) : (
                  <span className="relative text-[11px] text-ink-muted leading-snug">
                    {s.to ? `${n ?? 0} ${t(s.unitKey)}` : t('stage_soon')}
                  </span>
                )}
              </>
            );
            const shell = `${s.fill} relative overflow-hidden rounded-2xl px-3.5 py-3
                           min-h-[94px] flex flex-col justify-center gap-0.5`;
            // A stage with nowhere to go is not a link. Rendering it as one
            // would put a focusable, tappable control on the screen that does
            // nothing when pressed.
            return s.to ? (
              <Link key={s.key} to={s.to} data-testid={`stage-${s.key}`}
                    className={`${shell} focus-visible:outline-none focus-visible:ring-4
                                focus-visible:ring-teal/40`}>
                {body}
              </Link>
            ) : (
              <div key={s.key} data-testid={`stage-${s.key}`}
                   className={shell} aria-disabled="true">
                {body}
              </div>
            );
          })}
        </div>

        {/* ── Überfällig ─────────────────────────────────────────── */}
        {worst && (
          <>
            <h2 className="text-[10.5px] uppercase tracking-[.12em] font-bold text-ink-muted
                           mt-6 mb-2.5">
              {t('home_overdue')}
            </h2>
            <Link to="/overdue" data-testid="home-overdue"
                  className="flex items-center justify-between gap-3 bg-paper rounded-2xl p-3.5
                             focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/40">
              <span className="min-w-0">
                <span className="block font-bold text-[13.5px] text-ink truncate">
                  {worst.invoice_number || t('myinv_status_draft')}
                </span>
                <span className="block text-[11.5px] text-ink-muted tabular-nums truncate">
                  {[worst.customer_name, `${t('due')} ${fmtDate(worst.due_date)}`]
                    .filter(Boolean).join(' · ')}
                </span>
                <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full
                                 bg-red-warn/10 text-red-text">
                  {worst.days_overdue} {t('days')}
                </span>
              </span>
              <span className="font-headings font-bold text-base tabular-nums text-ink shrink-0">
                {fmtEur(worst.outstanding ?? worst.gross_total)}
              </span>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
