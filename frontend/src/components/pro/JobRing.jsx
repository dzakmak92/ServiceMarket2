import React from 'react';
import { fmtEur0, fmtEurBare } from '../../utils/money';

/**
 * What is out there, as one figure and four slices.
 *
 * It replaces four KPI tiles of which two read € 0,00 — a grid that took a
 * third of the first screen to say nothing. The ring says the one thing a
 * business asks in the morning: how much work is in flight, and where it is
 * stuck.
 *
 * The slices are not a second grouping. They map exactly onto the three tabs
 * underneath — offered → Pipeline, booked and running → Live, finished →
 * Done — and tapping a share selects that tab. Two overlapping
 * classifications of the same pile is the fastest way to make an overview
 * untrustworthy, so there is only one.
 *
 * The four shares sit in a footer of equal fields rather than in a legend
 * list beside the ring. Four things worth reading:
 *
 *  - The total is a heading next to the ring, at 26 px, instead of a 20 px
 *    figure inside a 110 px hole. The hole set the size of the number and the
 *    number set the size of the ring; separating them let the ring shrink to
 *    88 px while the figure grew.
 *  - The footer fields are the selection. A second selector next to the tabs
 *    would be two controls for one state, so these carry the highlight — and
 *    under Live two of them light up, because Booked and In progress are the
 *    same tab.
 *  - The footer amounts drop the currency sign. Four fields across 340 px
 *    cannot hold "€ 7.650" without shrinking the digits; the sign is said
 *    once, large, in the total above.
 *  - The total carries a count. "€ 11.360 in flight" alone does not say what
 *    it is counting; "7 jobs, 1 project" turns the figure into a claim.
 */

export const RING_PARTS = [
  { key: 'offered', tab: 'pipeline', color: '#f9e9cf', labelKey: 'ov_seg_offered', shortKey: 'ov_seg_offered_s' },
  { key: 'booked', tab: 'live', color: '#2d6a7f', labelKey: 'ov_seg_booked', shortKey: 'ov_seg_booked_s' },
  { key: 'running', tab: 'live', color: '#f5a623', labelKey: 'ov_seg_running', shortKey: 'ov_seg_running_s' },
  { key: 'done', tab: 'done', color: '#4a8b3f', labelKey: 'ov_seg_done', shortKey: 'ov_seg_done_s' },
];

/** "in flight · 7 jobs, 1 project" — and no second clause when there are no
 *  projects, rather than "0 projects". Singular and plural are separate keys
 *  because `t` interpolates and does not decline. */
function subline({ jobs, projects, t }) {
  const parts = [t(jobs === 1 ? 'ov_ring_job_one' : 'ov_ring_job_many', { n: jobs })];
  if (projects > 0) {
    parts.push(t(projects === 1 ? 'ov_ring_proj_one' : 'ov_ring_proj_many', { n: projects }));
  }
  return `${t('ov_ring_sub')} · ${parts.join(', ')}`;
}

export default function JobRing({ amounts, total, counts, tab, onPick, t }) {
  /* Every slice gets a floor of 2 % once it has any money in it, so a job
     worth € 40 next to one worth € 6.400 is still a visible sliver rather
     than a hairline nobody can see or tap. The floors come out of the
     largest slice, which can afford them. */
  const sum = RING_PARTS.reduce((a, p) => a + Math.max(0, amounts[p.key] || 0), 0);
  const stops = [];
  let at = 0;
  if (sum > 0) {
    const raw = RING_PARTS.map((p) => ({ p, pct: (Math.max(0, amounts[p.key] || 0) / sum) * 100 }));
    const lifted = raw.map((r) => (r.pct > 0 && r.pct < 2 ? 2 - r.pct : 0)).reduce((a, b) => a + b, 0);
    const biggest = raw.reduce((m, r) => (r.pct > m.pct ? r : m), raw[0]);
    for (const r of raw) {
      let pct = r.pct;
      if (pct > 0 && pct < 2) pct = 2;
      if (r.p.key === biggest.p.key) pct = Math.max(2, pct - lifted);
      if (pct <= 0) continue;
      stops.push(`${r.p.color} ${at}% ${at + pct}%`);
      at += pct;
    }
  }
  /* An empty ring on day one, not a hidden one: a business with nothing in
     hand should not get a different layout that rearranges itself the moment
     the first quote goes out. */
  const bg = stops.length ? `conic-gradient(${stops.join(',')})` : '#f9e9cf';

  return (
    <div className="rounded-[18px] border border-sm-border bg-paper p-3.5 mb-3" data-testid="ov-ring">
      <div className="flex items-center gap-3.5">
        <div className="w-[88px] h-[88px] rounded-full shrink-0 grid place-items-center"
             style={{ background: bg }} aria-hidden="true">
          <div className="w-16 h-16 rounded-full bg-paper" />
        </div>
        <div className="min-w-0 flex-1">
          <b className="block text-[26px] font-extrabold tracking-[-0.025em] leading-none tabular-nums
                        text-ink" data-testid="ov-ring-total">{fmtEur0(total)}</b>
          <span className="block text-[11.5px] font-semibold text-ink-muted mt-1"
                data-testid="ov-ring-sub">
            {subline({ jobs: counts?.jobs || 0, projects: counts?.projects || 0, t })}
          </span>
        </div>
      </div>
      <div className="flex mt-2.5 border-t border-sm-border pt-2">
        {RING_PARTS.map((p) => (
          <button key={p.key} type="button" onClick={() => onPick?.(p.tab)}
                  data-testid={`ov-seg-${p.key}`} data-on={tab === p.tab ? 'yes' : 'no'}
                  aria-label={`${t(p.labelKey)} ${fmtEur0(amounts[p.key] || 0)}`}
                  className={`flex-1 min-w-0 min-h-[42px] rounded-[9px] px-0.5 py-1
                              border-r border-sm-border last:border-r-0
                              ${tab === p.tab ? 'bg-step-now-soft' : ''}`}>
            <span className="flex items-center justify-center gap-1 text-[9px] font-extrabold uppercase
                             tracking-[0.02em] text-ink-muted" aria-hidden="true">
              <i className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: p.color }} />
              <span className="truncate">{t(p.shortKey)}</span>
            </span>
            <b aria-hidden="true"
               className={`block text-[14.5px] font-extrabold tabular-nums mt-[3px]
                           ${tab === p.tab ? 'text-teal-deep' : 'text-ink'}`}>
              {fmtEurBare(amounts[p.key] || 0)}
            </b>
          </button>
        ))}
      </div>
    </div>
  );
}
