import React from 'react';
import { Link } from 'react-router-dom';
import { fmtEur } from '../../utils/money';

/**
 * One job in the overview.
 *
 * The row it replaces was 133 px tall and said "— · A-2026-0077": no
 * customer, no date, no amount, and a blank line under it. This one carries
 * what somebody scanning a list is actually looking for, plus the same five
 * dots the job page draws as five cards — green done, teal current, amber
 * running. A list that disagreed with the page it links to would be worse
 * than no list, so the states come from the one `stepStates`.
 *
 * The action row appears only when there is something to press. A card with
 * no next move is just a row to tap.
 */

const DOT = {
  done: 'bg-green-pos', now: 'bg-teal', run: 'bg-amber', wait: 'bg-cream-deep',
};

/** Filled for a job, hollow for a project — the rule the calendar already
 *  uses, so a bar means the same thing in both places. */
const EDGE = {
  run: 'bg-amber', live: 'bg-teal', pipe: 'bg-cream-deep', done: 'bg-green-pos',
};

export function StepDots({ states, testid }) {
  return (
    <span className="flex gap-[3px] flex-1" data-testid={testid} aria-hidden="true">
      {states.map((s, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <i key={i} data-state={s} className={`h-[5px] rounded-full flex-1 ${DOT[s] || DOT.wait}`} />
      ))}
    </span>
  );
}

export default function JobCard({
  job, states, tone = 'live', meta, badge, badgeTone = 'w', actions, testid,
}) {
  const isProject = job.mode === 'project';
  const pill = {
    a: 'bg-step-run text-amber-text', t: 'bg-step-now text-teal-deep',
    g: 'bg-step-done text-green-text', w: 'bg-cream-deep text-ink-muted',
    r: 'bg-red-warn/10 text-red-text border border-red-warn/25',
  }[badgeTone] || 'bg-cream-deep text-ink-muted';

  return (
    <div className={`relative overflow-hidden rounded-2xl border mb-2
                     ${isProject ? 'border-step-now-line bg-step-now-soft' : 'border-sm-border bg-paper'}`}
         data-testid={testid} data-tone={tone} data-mode={job.mode}>
      <span aria-hidden="true" data-testid={testid ? `${testid}-edge` : undefined}
            className={`absolute left-0 top-0 bottom-0 w-[5px]
                        ${isProject ? 'bg-step-now-soft border-r-2 border-teal' : (EDGE[tone] || EDGE.live)}`} />
      <Link to={`/projects/${job.id}`} className="block px-3 py-2.5 pl-3.5"
            data-testid={testid ? `${testid}-open` : undefined}>
        <span className="flex items-baseline gap-2">
          <b className="text-[14px] font-extrabold text-ink truncate min-w-0">{job.title}</b>
          <span className="ml-auto shrink-0 text-[13.5px] font-extrabold tabular-nums text-ink">
            {job.contract_amount ? fmtEur(job.contract_amount) : '—'}
          </span>
        </span>
        <span className="block text-[12px] text-ink-soft mt-px truncate">{meta}</span>
        {(states || badge) && (
          <span className="flex items-center gap-2.5 mt-2">
            {states && <StepDots states={states} testid={testid ? `${testid}-dots` : undefined} />}
            {badge && (
              <span className={`shrink-0 rounded-full px-2 py-[3px] text-[9.5px] font-extrabold
                                uppercase tracking-[0.04em] ${pill}`}
                    data-testid={testid ? `${testid}-badge` : undefined}>{badge}</span>
            )}
          </span>
        )}
      </Link>
      {actions?.length > 0 && (
        <div className="flex gap-[7px] px-3 pb-3 pl-3.5">
          {actions.map((a) => (
            <ActionButton key={a.key} {...a} testid={testid ? `${testid}-${a.key}` : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

/* 16 px at stroke 1.9 — the same optical weight as the 12 px extrabold label
   beside it. At 14 px and the default stroke the mark read as a smudge next to
   the word rather than as its equal. */
function ActionButton({ label, icon: Icon, href, external, onClick, kind, testid }) {
  const cls = `flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl
               text-[12px] font-extrabold border-[1.5px]
               ${kind === 'primary' ? 'bg-teal text-paper border-teal'
      : kind === 'amber' ? 'bg-amber text-on-amber border-amber'
        : 'bg-paper text-teal-deep border-step-now-line'}`;
  const mark = Icon
    ? <Icon size={16} strokeWidth={1.9} aria-hidden="true" className="shrink-0" />
    : null;
  if (href) {
    return (
      <a href={href} data-testid={testid} className={cls}
         {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {mark} {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} data-testid={testid} className={cls}>
      {mark} {label}
    </button>
  );
}
