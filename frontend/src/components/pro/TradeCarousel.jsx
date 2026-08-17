import React from 'react';
import TradeMark from '../TradeMark';

/**
 * The trade you are in, with the one either side of it.
 *
 * The calculation page used to name the open trade in a subtitle — "Maler ·
 * 19 Vorlagen" — and changing it meant going back to a grid of seven cards
 * and coming forward again. That is three taps to answer "what does tiling
 * cost", and the seven never fit on one screen anyway.
 *
 * Here the trade is the control. The open one is a filled circle carrying its
 * mark and its count; its neighbours sit either side, tappable, and the row
 * wraps round so every trade is two taps from any other. The dots below say
 * how many there are and where you are in them, which the three circles alone
 * cannot.
 *
 * The marks are `TradeMark`'s — drawn at 32 px and checked at 19, because the
 * lucide icons this page uses at 64 px behind a heading are the same grey
 * smudge as each other at circle size.
 *
 * **The navy is the dial's, not the app's teal.** The circle sits 24 px above
 * a ring whose selected wedge is #1e5490, and two different blues meaning
 * "this is the one you have open" on one screen is worse than one blue that
 * is not the brand's. It matches the accent the jobs list already uses.
 */
const NAVY = '#1e5490';
export default function TradeCarousel({ trades, value, onChange, label, unit }) {
  const at = Math.max(0, trades.findIndex((x) => x.key === value));
  const n = trades.length;
  if (!n) return null;

  /* Previous and next by position, wrapping. With one trade there are no
     neighbours; with two, both sides are the same one, and drawing it twice
     would be two buttons that do the same thing. */
  const sides = n > 2
    ? [trades[(at + n - 1) % n], trades[(at + 1) % n]]
    : n === 2 ? [null, trades[(at + 1) % n]] : [null, null];
  const here = trades[at];

  const Side = ({ tr, side }) => {
    if (!tr) return <span className="w-[72px] shrink-0" aria-hidden="true" />;
    return (
      <button
        type="button" onClick={() => onChange(tr.key)}
        data-testid={`estimate-trade-${side}`}
        aria-label={`${tr.label}, ${tr.count} ${unit}`}
        style={{ backgroundColor: '#eaf3fc', boxShadow: 'inset 0 0 0 2px rgba(92,143,187,.45)',
                 color: '#2b4a63' }}
        className="w-[72px] h-[72px] shrink-0 rounded-full flex flex-col items-center
                   justify-center text-center px-1.5 transition
                   focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/40"
      >
        <TradeMark trade={tr.key} size={19} />
        {/* Wrapped, not truncated. "Montage / Allround" is a real trade name
            and "Montage / Al…" is not one. Two lines at 8.5 px clear the
            circle; a third would not, so it clamps there. */}
        <b className="text-[8.5px] font-extrabold mt-[3px] leading-[1.15] line-clamp-2">
          {tr.label}
        </b>
        <span className="text-[8.5px] opacity-80 leading-none mt-[2px]">{tr.count}</span>
      </button>
    );
  };

  return (
    <div data-testid="estimate-trade-carousel">
      <div className="flex items-center justify-center gap-3" role="group" aria-label={label}>
        <Side tr={sides[0]} side="prev" />
        <div className="w-[104px] h-[104px] shrink-0 rounded-full text-paper px-2
                        flex flex-col items-center justify-center text-center"
             style={{ backgroundColor: NAVY }}
             data-testid="estimate-trade-current" aria-current="true">
          <TradeMark trade={here.key} size={28} />
          <b className="font-headings text-[12.5px] font-extrabold mt-1 leading-[1.1]
                        line-clamp-2">{here.label}</b>
          <span className="text-[10px] opacity-90 leading-none mt-[3px]">
            {here.count} {unit}
          </span>
        </div>
        <Side tr={sides[1]} side="next" />
      </div>

      {/* One dot per trade. Three circles cannot say there are seven. */}
      <div className="flex justify-center items-center gap-[5px] mt-2" aria-hidden="true">
        {trades.map((tr, i) => (
          <span key={tr.key}
                style={{ backgroundColor: i === at ? NAVY : '#c3d5e6' }}
                className={`h-[6px] rounded-full transition-all ${
                  i === at ? 'w-4' : 'w-[6px]'}`} />
        ))}
      </div>
    </div>
  );
}
