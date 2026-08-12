import React from 'react';
import { fmtEur0 } from '../../utils/money';

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
 * Done — and tapping a legend row selects that tab. Two overlapping
 * classifications of the same pile is the fastest way to make an overview
 * untrustworthy, so there is only one.
 */

export const RING_PARTS = [
  { key: 'offered', tab: 'pipeline', color: '#f9e9cf', labelKey: 'ov_seg_offered' },
  { key: 'booked', tab: 'live', color: '#2d6a7f', labelKey: 'ov_seg_booked' },
  { key: 'running', tab: 'live', color: '#f5a623', labelKey: 'ov_seg_running' },
  { key: 'done', tab: 'done', color: '#4a8b3f', labelKey: 'ov_seg_done' },
];

export default function JobRing({ amounts, total, tab, onPick, t }) {
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
  const bg = stops.length ? `conic-gradient(${stops.join(',')})` : '#f9e9cf';

  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-sm-border bg-paper p-3.5
                    mb-3" data-testid="ov-ring">
      <div className="w-[110px] h-[110px] rounded-full shrink-0 grid place-items-center"
           style={{ background: bg }} aria-hidden="true">
        <div className="w-[80px] h-[80px] rounded-full bg-paper grid place-items-center">
          <b className="text-[20px] font-extrabold tracking-[-0.02em] leading-none tabular-nums text-ink"
             data-testid="ov-ring-total">{fmtEur0(total)}</b>
          <span className="text-[9px] font-bold uppercase tracking-[0.04em] text-ink-muted mt-[3px]">
            {t('ov_ring_sub')}
          </span>
        </div>
      </div>
      <ul className="flex-1 min-w-0">
        {RING_PARTS.map((p) => (
          <li key={p.key}>
            <button type="button" onClick={() => onPick?.(p.tab)}
                    data-testid={`ov-seg-${p.key}`} data-on={tab === p.tab ? 'yes' : 'no'}
                    className={`w-full flex items-center gap-2 text-[12.5px] rounded-lg
                                min-h-[30px] px-1.5 -mx-1.5 text-left
                                ${tab === p.tab ? 'bg-step-now-soft font-bold' : ''}`}>
              <i className="w-[10px] h-[10px] rounded-[3px] shrink-0" aria-hidden="true"
                 style={{ background: p.color }} />
              <span className="text-ink truncate">{t(p.labelKey)}</span>
              <span className="ml-auto font-extrabold tabular-nums text-ink shrink-0">
                {fmtEur0(amounts[p.key] || 0)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
