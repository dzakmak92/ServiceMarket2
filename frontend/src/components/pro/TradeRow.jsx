import React from 'react';
import TradeMark from '../TradeMark';

/**
 * All seven trades, on the screen at once, above the dial.
 *
 * The carousel this replaces showed three circles — the open trade and its two
 * neighbours — with dots underneath to say there were seven. That is a correct
 * control and the wrong one: picking a trade is the first thing you do on this
 * page, and a picker you have to scroll is a picker you have to think about.
 * Seven cards in four-then-three fit above the fold with the dial still
 * visible, so the whole choice is one glance and one tap.
 *
 * **Outlines, not fills.** The cards carry a 1 px edge on white rather than a
 * tint. It reads as seven separate things where seven pale tiles read as one
 * striped band, and — the reason it won — it leaves the entire contrast range
 * to the selected card: six hairline outlines and one solid navy block is a far
 * louder "you are here" than one dark tile among six pale ones. The navy is the
 * dial's `#1e5490`, not the brand teal, because the ring 24 px below uses it
 * for exactly the same meaning.
 *
 * **11 px, and that number is measured.** The German names fit at 13 px — but
 * the row renders in four languages, and the binding string is the Spanish
 * "Electricidad" in a 77.5 px card. Measured, 11.5 px is the ceiling and leaves
 * 1.0 px; 11 px leaves 4.3, which is the margin that survives Inter being
 * substituted for the platform face on a device that has neither. The old
 * carousel labels were 8.5 px and clamped to two lines, so this is both bigger
 * and, for the first time, one line in every language.
 *
 * The template count is not on the card. It was on the carousel circles, and it
 * is real information, but it costs a second text line on every card and the
 * count is not what you are choosing between — it stays in the accessible name
 * so a screen reader still hears "Maler, 19 templates".
 */
const NAVY = '#1e5490';
const EDGE = '#cfdeeb';

export default function TradeRow({ trades, value, onChange, label, unit }) {
  if (!trades.length) return null;

  /* Four then three. With fewer than five trades there is no second row and
     the first one simply holds them all; the split is by position, not by a
     hard-coded seven, so hiding a trade cannot leave a hole. */
  const rows = trades.length > 4 ? [trades.slice(0, 4), trades.slice(4)] : [trades];

  const Card = (tr) => {
    const on = tr.key === value;
    return (
      <button
        key={tr.key} type="button" onClick={() => onChange(tr.key)}
        data-testid={`estimate-trade-${tr.key}`}
        aria-pressed={on}
        aria-label={`${tr.label}, ${tr.count} ${unit}`}
        style={on
          ? { backgroundColor: NAVY, borderColor: NAVY, color: '#fff' }
          : { borderColor: EDGE, color: '#4d6477' }}
        className="flex-1 min-w-0 rounded-xl border bg-paper flex flex-col items-center
                   justify-center gap-1 px-0.5 py-2 transition
                   focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/40"
      >
        <TradeMark trade={tr.key} size={on ? 30 : 26} />
        {/* One line in every language at 11 px — see the note above. `break-words`
            is the safety net rather than the layout: if a face wider than the
            measured one ever pushes a name past its card, it wraps instead of
            bursting out of it. */}
        <b className="text-[11px] font-extrabold leading-[1.15] text-center break-words">
          {tr.label}
        </b>
      </button>
    );
  };

  return (
    <div data-testid="estimate-trade-row" role="group" aria-label={label}
         className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">{r.map(Card)}</div>
      ))}
    </div>
  );
}
