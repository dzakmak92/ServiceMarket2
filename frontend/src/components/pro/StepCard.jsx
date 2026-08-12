import React from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * One step of the job, closed until it is asked for.
 *
 * Closed is the resting state — the page opens showing five headers and a
 * customer, not five expanded panels — and exactly one card is open at a
 * time, which is the caller's job to enforce.
 *
 * The colour is the state, at two strengths: 25 % for the closed card and for
 * the header of an open one, 12 % for the opened body. The body is not white:
 * white read as "this card is inactive" next to the tinted ones, which is the
 * opposite of what an open card means. What stays white is only what can be
 * touched or counted — input fields and the isles the figures sit on.
 */

export const STEP_STATE = ['done', 'now', 'run', 'wait'];

const SKIN = {
  done: {
    shut: 'bg-step-done border-step-done-line',
    open: 'bg-step-done-soft border-step-done-line',
    head: 'bg-step-done border-b-step-done-line',
    knot: 'bg-green-pos text-paper border-cream',
  },
  now: {
    shut: 'bg-step-now border-step-now-line',
    open: 'bg-step-now-soft border-step-now-line',
    head: 'bg-step-now border-b-step-now-line',
    knot: 'bg-teal text-paper border-cream ring-4 ring-step-now',
  },
  run: {
    shut: 'bg-step-run border-step-run-line',
    open: 'bg-step-run-soft border-step-run-line',
    head: 'bg-step-run border-b-step-run-line',
    knot: 'bg-amber text-on-amber border-cream ring-4 ring-step-run',
  },
  wait: {
    shut: 'bg-paper border-sm-border',
    open: 'bg-paper border-sm-border',
    head: 'bg-paper border-b-sm-border',
    knot: 'bg-cream-deep text-ink-muted border-cream',
  },
};

/** The knot on the spine. It carries the number, and the card header does
 *  not — with the knot sitting right beside it, printing "3" twice was just
 *  noise. A finished step shows a tick instead of its number, because by then
 *  the number is the least interesting thing about it. */
export function Knot({ state, n, label }) {
  const skin = SKIN[state] || SKIN.wait;
  return (
    <span aria-hidden="true"
          className={`absolute -left-[34px] top-3 w-[25px] h-[25px] rounded-full border-[3px]
                      grid place-items-center text-[11px] font-extrabold z-[2] ${skin.knot}`}
          data-testid={label ? `${label}-knot` : undefined}
          data-state={state}>
      {state === 'done' ? <Check size={13} strokeWidth={3} /> : n}
    </span>
  );
}

export default function StepCard({
  state = 'wait', n, title, value, open, onToggle, children, testid,
}) {
  const skin = SKIN[state] || SKIN.wait;
  return (
    <div className={`rounded-[13px] border overflow-hidden ${open ? skin.open : skin.shut}`}
         data-testid={testid} data-state={state} data-open={open ? 'yes' : 'no'}>
      <button type="button" onClick={onToggle} aria-expanded={open}
              data-testid={testid ? `${testid}-toggle` : undefined}
              className={`w-full min-h-[48px] flex items-center gap-2.5 px-3.5 py-3 text-left
                          ${open ? `border-b ${skin.head}` : ''}`}>
        <span className="text-[14px] font-bold text-ink">{title}</span>
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-[12.5px] font-bold tabular-nums text-ink-muted">{value}</span>
          <ChevronDown size={15} aria-hidden="true"
                       className={`text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {/* Mounted only when open: the quote's lines are fetched by the body,
          and five closed cards must not fire five requests on load. */}
      {open && <div className="px-3.5 py-3">{children}</div>}
    </div>
  );
}

/** The piece of spine that hangs under a knot, coloured by the step the knot
 *  belongs to. Drawn per step rather than as one gradient down the whole
 *  chain: the cards are of unequal height — an open one is five times a shut
 *  one — so a percentage-based gradient put the colour change wherever it
 *  liked instead of on a knot. */
export function Segment({ state }) {
  const line = { done: 'bg-green-pos', now: 'bg-teal', run: 'bg-amber' }[state] || 'bg-cream-deep';
  return (
    <span aria-hidden="true" data-testid="job-seg" data-state={state}
          className={`absolute -left-[23px] top-[28px] w-[3px] h-[calc(100%_-_3px)] rounded-full
                      ${line}`} />
  );
}

/** A white island inside a tinted body — where figures go, so they are read
 *  on paper rather than on a wash. */
export function Isle({ children, testid }) {
  return (
    <div className="rounded-[11px] border border-ink/10 bg-paper px-3 py-2.5 mb-2.5"
         data-testid={testid}>{children}</div>
  );
}
