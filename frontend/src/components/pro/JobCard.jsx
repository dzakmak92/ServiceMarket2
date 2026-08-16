import React from 'react';
import { Link } from 'react-router-dom';
import { fmtEur } from '../../utils/money';

/**
 * One job in the overview: a time spine on the left, a card on the right.
 *
 * Three things moved out of the old row and each of them was a cropped title.
 * The date badge sat beside the heading, the amount sat beside the date, and
 * "Interior walls, two coats" ended up as "Interior walls, two c…". Now the
 * spine carries when it happens, the status pill has moved to the footer, and
 * the title has the whole card width to itself.
 *
 * The three actions are icons. As words, "Report finished" wrapped to two
 * lines at this width; as a 44 px round button it is the tap minimum on
 * purpose. Every one carries an `aria-label`, because an icon has no
 * accessible name of its own — and the green check changes job state, so it
 * is the one that most needs saying out loud.
 */

/* Colours rather than classes: `now` is the page's accent, which changes
   between Aufträge and Projekte, so the row cannot be a static utility. */
const DOT = { done: '#4a8b3f', run: '#f5a623', wait: '#d9e2ec' };

export function StepDots({ states, accent, testid }) {
  return (
    <span className="flex gap-[4px] mt-2" data-testid={testid} aria-hidden="true">
      {states.map((s, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <i key={i} data-state={s} className="h-[5px] rounded-full flex-1"
           style={{ background: s === 'now' ? accent : (DOT[s] || DOT.wait) }} />
      ))}
    </span>
  );
}

/**
 * @param spine  { top, bottom, tone } — the two lines beside the card and the
 *               colour of its dot. `tone` is a colour, not a name, because the
 *               caller knows whether this row is late and the card does not.
 */
export default function JobCard({
  job, states, accent, spine, meta, badge, badgeTone = 'w', actions, testid, last,
}) {
  const pill = {
    r: { background: '#f6dade', color: '#a1303e' },
    a: { background: accent, color: '#fff' },
    t: { background: accent, color: '#fff' },
    g: { background: '#e9f4e8', color: '#2f6b28' },
    w: { background: '#eef3f8', color: '#2b4a63' },
  }[badgeTone] || { background: '#eef3f8', color: '#2b4a63' };

  return (
    <div className="flex gap-[9px] mb-[9px]" data-testid={testid} data-mode={job.mode}>
      {spine && (
        <div className="w-11 shrink-0 relative pt-[9px] text-center"
             data-testid={testid ? `${testid}-spine` : undefined}>
          <i aria-hidden="true" className="absolute left-[21px] top-0 w-[2px]"
             style={{ bottom: last ? '50%' : '-9px', background: '#d3dfe9' }} />
          <p className="relative z-[2] bg-paper py-0.5 text-[9px] leading-[1.35] text-ink-muted">
            {spine.top}
            {spine.bottom && (
              <><br /><b className="text-[11.5px] tabular-nums" style={{ color: accent }}>
                {spine.bottom}
              </b></>
            )}
          </p>
          <i aria-hidden="true"
             className="absolute left-4 top-[44px] w-3 h-3 rounded-full border-[2.5px] z-[2]"
             style={{ background: spine.tone || accent, borderColor: spine.tone || accent }} />
        </div>
      )}

      <div className="flex-1 min-w-0 rounded-[13px] bg-paper px-[11px] py-2.5"
           style={{ border: `1px solid ${accent}` }}>
        <Link to={`/projects/${job.id}`} className="block"
              data-testid={testid ? `${testid}-open` : undefined}>
          <b className="block text-[13.5px] font-extrabold text-ink truncate"
             data-testid={testid ? `${testid}-title` : undefined}>{job.title}</b>
          <span className="flex items-baseline gap-2">
            <span className="text-[11.5px] text-ink-soft truncate min-w-0">{meta}</span>
            <span className="ml-auto shrink-0 text-[12px] font-extrabold tabular-nums text-ink">
              {job.contract_amount ? fmtEur(job.contract_amount) : '—'}
            </span>
          </span>
          {states && <StepDots states={states} accent={accent}
                               testid={testid ? `${testid}-dots` : undefined} />}
        </Link>
        {(badge || actions?.length > 0) && (
          <div className="flex items-center gap-2 mt-2.5">
            {badge && (
              <span className="shrink-0 rounded-full px-2.5 py-1 text-[9.5px] font-extrabold
                               uppercase tracking-[0.04em]" style={pill}
                    data-testid={testid ? `${testid}-badge` : undefined}>{badge}</span>
            )}
            {actions?.length > 0 && (
              <span className="ml-auto flex gap-2 shrink-0">
                {actions.map((a) => (
                  <ActionButton key={a.key} {...a} accent={accent}
                                testid={testid ? `${testid}-${a.key}` : undefined} />
                ))}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* 44 × 44, round, no label. The name lives in `aria-label` and in the tooltip
   the title attribute gives a mouse — an icon-only control that changes state
   is the one place where "obvious to the designer" and "obvious to the user"
   usually part company.
 *
 * A control with nothing to point at is drawn rather than dropped, so the three
 * buttons stay in the same three places on every card. It is a real disabled
 * button: out of the tab order, announced as unavailable, and its label says
 * *why* — "Route — keine Adresse hinterlegt" is a thing a pro can act on,
 * where a missing button is just a card that looks different from the one
 * above it. */
function ActionButton({ label, why, icon: Icon, href, external, onClick, kind, accent,
  disabled, testid }) {
  const style = disabled
    ? { background: '#f7fafc', borderColor: '#dbe4ec', color: '#8aa4bb' }
    : kind === 'primary' || kind === 'amber'
      ? { background: '#2f6b28', borderColor: '#2f6b28', color: '#fff' }
      : { background: '#fff', borderColor: '#9dbcd8', color: accent };
  const cls = 'w-11 h-11 shrink-0 grid place-items-center rounded-full border-[1.5px]';
  const mark = Icon ? <Icon size={19} strokeWidth={1.9} aria-hidden="true" /> : null;
  const name = disabled && why ? `${label} — ${why}` : label;
  if (disabled) {
    return (
      <button type="button" disabled data-testid={testid} data-disabled="yes"
              className={cls} style={style} aria-label={name} title={name}>
        {mark}
      </button>
    );
  }
  if (href) {
    return (
      <a href={href} data-testid={testid} className={cls} style={style}
         aria-label={name} title={name}
         {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {mark}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} data-testid={testid} className={cls} style={style}
            aria-label={name} title={name}>
      {mark}
    </button>
  );
}
