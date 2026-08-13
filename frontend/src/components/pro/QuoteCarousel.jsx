import React, { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { fmtEur } from '../../utils/money';
import { daysSince } from '../../utils/jobSteps';

/**
 * The open quotes, one card at a time, at the top of the home screen.
 *
 * What it replaced picked one thing out of three by rank and showed it: the
 * worst overdue invoice, else the oldest quote, else a prompt. The quotes are
 * the pile a tradesperson works through in one sitting — chase, chase, chase —
 * and a single card could only ever name the first of them.
 *
 * "Open" is the same four statuses the quotes list rolls up under Offen and
 * the same four the Angebot tile counts. Anything narrower and the tile would
 * say 15 while the card carried 1, which reads as a bug and cannot be argued
 * away. A draft is in the pile for a reason: nobody is waiting on the
 * customer there, they are waiting on the pro, and that is the one most worth
 * a reminder. It is a different card though — a draft cannot be chased, so it
 * says "not sent yet" and offers to send.
 *
 * Three things about the way it is built:
 *
 *  - It is a scroll container with snap points, not a slider on a timer.
 *    Nothing moves on its own: a card that advances while you are reading it
 *    takes the thing you were about to tap out from under your thumb, and
 *    these CTAs write to a customer.
 *  - Every card leaves 30 px of the next one showing. That peek is the whole
 *    reason the second quote gets read — dots under a card say "there is
 *    more" to somebody who already knows what dots mean; the edge of the next
 *    card says it to everyone.
 *  - Longest wait first, and the counter says which of how many, so "3 / 15"
 *    is a statement about the backlog rather than only a position.
 */

const PEEK = 30;
const GAP = 10;

/** Sent, viewed or negotiating first — those are waiting on somebody else and
 *  age matters — then the drafts, which are waiting on you. Within a group,
 *  the longest wait leads. */
const OPEN = ['sent', 'viewed', 'negotiating', 'draft'];

export function openQuotes(quotes = []) {
  return quotes
    .filter((q) => OPEN.includes(q.status))
    .sort((a, b) => {
      const draft = (q) => (q.status === 'draft' ? 1 : 0);
      if (draft(a) !== draft(b)) return draft(a) - draft(b);
      const when = (q) => new Date(q.sent_at || q.created_at || 0);
      return when(a) - when(b);
    });
}

export default function QuoteCarousel({ quotes, t }) {
  const track = useRef(null);
  const [at, setAt] = useState(0);

  /* Read the index off the scroll position rather than tracking it through a
     gesture handler: the container can also be moved by a keyboard, a
     scrollbar or a trackpad, and every one of those has to move the counter
     too. */
  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const step = el.clientWidth - PEEK + GAP;
    const i = step > 0 ? Math.round(el.scrollLeft / step) : 0;
    setAt(Math.max(0, Math.min(quotes.length - 1, i)));
  }, [quotes.length]);

  if (!quotes.length) return null;

  return (
    <section aria-label={t('home_q_region', { n: quotes.length })} data-testid="home-quotes"
             className="relative mt-1">
      <div ref={track} onScroll={onScroll} data-testid="home-quotes-track"
           className="flex overflow-x-auto snap-x snap-mandatory
                      [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
           style={{ gap: GAP }}>
        {quotes.map((q, i) => (
          <QuoteSlide key={q.id} quote={q} i={i} n={quotes.length} t={t} />
        ))}
        {/* A tail the width of the peek, so the last card can still snap flush
            to the left edge. Padding on the track would do it too, but the
            slide width is a percentage of the same box and would shrink with
            it. */}
        <i aria-hidden="true" className="shrink-0 block" style={{ width: PEEK - GAP }} />
      </div>
      {quotes.length > 1 && (
        <p className="text-center text-[11px] font-bold text-ink-muted tabular-nums mt-2"
           data-testid="home-quotes-count" aria-live="polite">
          {at + 1} / {quotes.length}
        </p>
      )}
    </section>
  );
}

/* Who it is for. `quote_number` is null on everything written before the
   series existed and `customer_name` is null whenever the job was captured
   without one, so the line walks down to whatever the row does have rather
   than rendering empty — a blank line under the amount read as a fault. */
function who(quote) {
  return [quote.customer_name, quote.quote_number || quote.job_number
    || quote.title || quote.job_title].filter(Boolean).join(' · ');
}

function QuoteSlide({ quote, i, n, t }) {
  const draft = quote.status === 'draft';
  /* Waiting since it went out, not since it was drafted — a quote in drafts
     is not waiting on anybody. */
  const days = daysSince(draft ? quote.created_at : (quote.sent_at || quote.created_at));
  const when = draft
    ? t('home_q_draft')
    : days == null ? null
      : days <= 0 ? t('home_q_today')
        : t(days === 1 ? 'home_q_days_one' : 'home_q_days_many', { n: days });

  return (
    <Link to={`/quotes/${quote.id}`} data-testid={`home-quote-${i}`}
          aria-label={`${i + 1} / ${n}`} data-status={quote.status}
          className="snap-start shrink-0 block bg-teal-deep text-paper rounded-[18px] p-5
                     focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-deep/40"
          style={{ width: `calc(100% - ${PEEK}px)` }}>
      <p className="text-[10.5px] uppercase tracking-[.13em] font-bold text-teal-tint">
        {t(draft ? 'home_q_kicker_draft' : 'home_q_kicker')}
      </p>
      {when && (
        <p className="font-headings font-bold text-[15px] leading-tight mt-1.5"
           data-testid={`home-quote-${i}-when`}>{when}</p>
      )}
      {/* The amount at the size the thing it represents deserves. This is what
          the follow-up is worth, and on the row it replaced it was the
          smallest text on the tile. */}
      <p className="font-headings font-bold text-[34px] leading-none mt-2 tabular-nums">
        {fmtEur(quote.gross_total)}
      </p>
      <p className="text-[12.5px] text-teal-tint mt-1.5 truncate">{who(quote)}</p>
      <span className="mt-4 flex items-center justify-center gap-1.5 bg-amber
                       text-on-amber rounded-xl py-3 font-headings font-bold text-sm">
        {t(draft ? 'home_q_send' : 'home_focus_quotes_cta')} <ArrowRight size={15} />
      </span>
    </Link>
  );
}
