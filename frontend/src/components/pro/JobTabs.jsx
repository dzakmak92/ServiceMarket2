import React from 'react';

/**
 * Live · Pipeline · Done, as three circles with the selected one in the middle.
 *
 * The pill row it replaces gave the three states equal weight, which is not
 * how they are read: a pro opens this screen to see what is running. Here the
 * selected tab is 112 px and centred and the other two are 78 px and stepped
 * back, so the first glance lands on the number that matters.
 *
 * The neighbours fade their **fill and their edge only** — the numeral and the
 * word keep full strength. Fading the whole element to 40 % takes the Pipeline
 * numeral to 1.96:1 and Done to 1.79:1, both far under the 4.5:1 floor, on
 * controls whose counts a pro is meant to read. Fill-only fading looks the
 * same and measures 8.87:1 and 6.15:1.
 *
 * All three keep their label. A bare "1" beside a bare "3" says nothing about
 * which pile is which, and the whole point of the row is to say that.
 */

/* Fill, edge and text per tab. The two unselected ones are drawn at 40 %
   through rgba rather than opacity, for the reason above. */
const SKIN = {
  pipeline: { fill: 'rgba(234,243,252,.4)', edge: 'rgba(92,143,187,.4)', text: '#2b4a63' },
  done: { fill: 'rgba(233,244,232,.4)', edge: 'rgba(94,148,89,.4)', text: '#2f6b28' },
  live: { fill: 'rgba(234,243,252,.4)', edge: 'rgba(92,143,187,.4)', text: '#2b4a63' },
};

export default function JobTabs({ tabs, tab, counts, onPick, accent, t }) {
  const at = Math.max(0, tabs.findIndex((x) => x.key === tab));
  /* Rotated so the selected one is the middle child — the row keeps its DOM
     order, so tab order for a keyboard is still Live, Pipeline, Done. */
  const order = [(at + tabs.length - 1) % tabs.length, at, (at + 1) % tabs.length];

  return (
    <>
      <div className="flex items-center justify-center gap-3" role="tablist" data-testid="ov-tabs">
        {order.map((i, slot) => {
          const tb = tabs[i];
          const on = slot === 1;
          const skin = SKIN[tb.key] || SKIN.live;
          return (
            <button key={tb.key} type="button" role="tab" aria-selected={on}
                    onClick={() => onPick(tb.key)} data-testid={`ov-tab-${tb.key}`}
                    data-slot={slot}
                    className={`shrink-0 rounded-full flex flex-col items-center justify-center
                                ${on ? 'w-[112px] h-[112px]' : 'w-[78px] h-[78px]'}`}
                    style={on
                      ? { background: accent, color: '#fff' }
                      : { background: skin.fill, color: skin.text,
                        boxShadow: `inset 0 0 0 2px ${skin.edge}` }}>
              <b className={`font-extrabold leading-none tabular-nums
                             ${on ? 'text-[31px]' : 'text-[20px]'}`}>{counts[tb.key]}</b>
              <span className={`font-bold ${on ? 'text-[11px] mt-0.5' : 'text-[9px] mt-px'}`}>
                {t(tb.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-center gap-[5px] mt-1.5 mb-3" aria-hidden="true">
        {tabs.map((tb, i) => (
          <i key={tb.key} className={`h-[6px] rounded-full ${i === at ? 'w-4' : 'w-[6px]'}`}
             style={{ background: i === at ? accent : '#c3d5e6' }} />
        ))}
      </div>
    </>
  );
}
