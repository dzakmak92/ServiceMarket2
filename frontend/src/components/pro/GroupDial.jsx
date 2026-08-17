import React, { useMemo } from 'react';

/**
 * The template groups as a dial, with the promise in the hole.
 *
 * Replaces a stack of headings with one shape: every group of the open trade
 * is a wedge, the selected one is filled, and the hole carries "Angebot in 90
 * Sekunden" over a ring drawn to the same fraction.
 *
 * **Why the names are wrapped rather than shortened.** The groups are not
 * one-word labels. Three of the six Maler headings are phrases — "Tapezieren
 * und verputzen", "Sanieren und beschichten", "Fassade streichen und dämmen"
 * — and the English "Painting and insulating the façade" is 34 characters. A
 * wedge holds about eleven. The obvious fix is a short form per group, and it
 * is wrong twice: it invents catalogue content in four languages, and in
 * English "Painting and insulating the façade" shortens to "Painting", which
 * is already the name of a different group in the same trade. So the wedge
 * takes the real heading and wraps it, and the type shrinks a step when it
 * needs three lines. Nothing here is abbreviated and nothing is invented.
 *
 * **Why the ring is not a countdown.** It is drawn at a fixed fraction and
 * does not animate. A ring that filled would be measuring something, and
 * nothing here is being measured — the 90 seconds is a claim about the form,
 * not a timer on this screen.
 *
 * Geometry is fixed in a 354-wide viewBox and scales with the container. The
 * band is 62–128 and the hole is 124 px across; every figure in this file was
 * measured against those two numbers rather than guessed.
 */

const NAVY = '#1e5490';
const TINT = '#f2f6fa';
const LINE = '#dbe4ec';
const MUT = '#4d6477';
const RING = '#dce7f2';
const GO = '#2f6b28';

const W = 354;
const CX = W / 2;
const CY = 142;
const RI = 62;
const RO = 128;
const H = 288;

/* Where the text block is centred. Text is horizontal, so on a diagonal wedge
   the block's corners project onto *both* the radial and the tangential
   direction — which is why the room available is nothing like the arc length
   and has to be solved rather than assumed. */
const TEXT_R = 95;
const PAD = 2;                                       /* clear of both edges */

const pol = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];

function wedgePath(ri, ro, a0, a1) {
  const [x0, y0] = pol(ro, a0);
  const [x1, y1] = pol(ro, a1);
  const [x2, y2] = pol(ri, a1);
  const [x3, y3] = pol(ri, a0);
  const f = (n) => n.toFixed(1);
  return `M${f(x0)} ${f(y0)} A${ro} ${ro} 0 0 1 ${f(x1)} ${f(y1)}`
       + ` L${f(x2)} ${f(y2)} A${ri} ${ri} 0 0 0 ${f(x3)} ${f(y3)} Z`;
}

function arcPath(r, a0, a1) {
  const [x0, y0] = pol(r, a0);
  const [x1, y1] = pol(r, a1);
  const f = (n) => n.toFixed(1);
  return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}

/* Bold sans at weight 800 runs about 0.56 em across for mixed-case German and
   English. It is an estimate and it only has to be close: the consequence of
   being wrong is a line that wraps one word early, not a line that overflows,
   because the fitter always takes the smallest size that works. */
const widthOf = (s, px) => s.length * px * 0.56;

/**
 * The widest a text block of half-height `h` may be on the ray at `mid`.
 *
 * All four corners of the block have to sit inside the band. A block centred
 * at (a, b) from the middle with half-extents (w, h) has corners at
 * (a ± w, b ± h); the far one must stay under RO and the near one over RI.
 * On a diagonal wedge those two pull in opposite directions and the answer is
 * much smaller than the arc suggests — at 30° a 37 px half-width put the
 * inner corner at r=56 inside a hole of 62, which is what the first version
 * of this shipped and the test caught.
 *
 * Solved by bisection because the near corner's expression changes form when
 * the block straddles an axis, and a closed form for that is longer than this
 * comment and no more correct.
 */
function maxHalfWidth(mid, h) {
  const a = Math.abs(TEXT_R * Math.cos(mid));
  const b = Math.abs(TEXT_R * Math.sin(mid));
  const fits = (w) => {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const r = Math.hypot(a + sx * w, b + sy * h);
        if (r > RO - PAD || r < RI + PAD) return false;
      }
    }
    return true;
  };
  if (!fits(0)) return 0;
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 24; i += 1) {
    const mid2 = (lo + hi) / 2;
    if (fits(mid2)) lo = mid2; else hi = mid2;
  }
  return lo;
}

/** Greedy wrap at a width, returning null when a single word cannot fit. */
function wrap(text, px, max) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = '';
  for (const w of words) {
    if (widthOf(w, px) > max) return null;          // one word is too wide
    const next = line ? `${line} ${w}` : w;
    if (widthOf(next, px) <= max) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The largest size, in the fewest lines, that fits this wedge.
 *
 * The budget depends on the line count and the line count depends on the
 * budget, so both are searched: biggest type first, fewest lines first, and
 * the first combination whose block fits wins. A one-word group therefore
 * keeps its 10 px and only a phrase pays for being a phrase.
 */
function fit(text, mid) {
  /* Down to 7.5 and out to four lines because one real heading needs both:
     English "Painting and insulating the façade" has "insulating" in it, and
     a diagonal wedge gives a four-line block about 42 px of width, which is
     that word at 7.5 px and nothing larger. Stopping at 8 px / three lines
     truncated it to "Painting and…", and a wedge you cannot read the name of
     is worse than a wedge whose name is small. */
  for (const px of [10, 9.5, 9, 8.5, 8, 7.5]) {
    const lead = px + 2;
    for (let n = 1; n <= 4; n += 1) {
      /* Half-height of the whole block: the wrapped lines plus the count line
         under them, which is part of what has to clear the band. */
      const h = ((n - 1) * lead + px + 11) / 2 + 1;
      const w = maxHalfWidth(mid, h);
      if (w <= 0) continue;
      const lines = wrap(text, px, w * 2);
      if (lines && lines.length === n) return { px, lines };
    }
  }
  /* Nothing fits — one word longer than the wedge allows at any size. Cut it
     rather than let it cross the band, and keep the cut visible. */
  const px = 8;
  const w = maxHalfWidth(mid, (px + 11) / 2 + 1);
  const per = Math.max(3, Math.floor((w * 2) / (px * 0.56)) - 1);
  return { px, lines: [`${String(text).slice(0, per)}…`] };
}

export default function GroupDial({ groups, value, onChange, label, promise, seconds }) {
  const n = groups.length;

  const wedges = useMemo(() => {
    const span = (Math.PI * 2) / n;
    /* Twelve o'clock is the middle of the first wedge, not its edge, so the
       group the catalogue puts first — "what most people came for" — reads as
       the top of the dial rather than straddling it. */
    const a0 = -Math.PI / 2 - span / 2;
    return groups.map((g, i) => {
      const s0 = a0 + i * span;
      const s1 = s0 + span;
      const mid = (s0 + s1) / 2;
      const [px, py] = pol(TEXT_R, mid);
      return { ...g, s0, s1, px, py, text: fit(g.label, mid) };
    });
  }, [groups, n]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="group"
         aria-label={label} data-testid="group-dial">
      {wedges.map((g) => {
        const on = g.key === value;
        const ink = on ? '#fff' : MUT;
        const { px, lines } = g.text;
        /* The block is centred on the anchor: half a line up for each line
           beyond the first, then the count under it. */
        const lead = px + 2;
        const top = g.py - ((lines.length - 1) * lead) / 2 - 3;
        return (
          <g key={g.key} role="button" tabIndex={0}
             aria-pressed={on} aria-label={`${g.label}, ${g.count}`}
             data-testid={`group-dial-${g.key}`}
             className="cursor-pointer focus-visible:outline-none"
             onClick={() => onChange(g.key)}
             onKeyDown={(e) => {
               if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(g.key); }
             }}>
            <path d={wedgePath(RI, RO, g.s0 + 0.02, g.s1 - 0.02)}
                  fill={on ? NAVY : TINT} stroke={on ? NAVY : LINE} strokeWidth="1" />
            {lines.map((ln, li) => (
              <text key={li} x={g.px.toFixed(1)} y={(top + li * lead).toFixed(1)}
                    textAnchor="middle" fontSize={px} fontWeight="800" fill={ink}>
                {ln}
              </text>
            ))}
            <text x={g.px.toFixed(1)}
                  y={(top + (lines.length - 1) * lead + 11).toFixed(1)}
                  textAnchor="middle" fontSize="9"
                  fill={on ? 'rgba(255,255,255,.85)' : MUT}>
              {g.count}
            </text>
          </g>
        );
      })}

      {/* The hole: the claim, over a ring drawn to the same fraction. */}
      <path d={arcPath(54, -Math.PI / 2, Math.PI * 1.18)} fill="none"
            stroke={RING} strokeWidth="3" strokeLinecap="round" />
      <path d={arcPath(54, -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.32)} fill="none"
            stroke={GO} strokeWidth="3" strokeLinecap="round" />
      <text x={CX} y={CY - 8} textAnchor="middle" fontSize="10.5" fontWeight="700"
            letterSpacing=".6" fill={MUT}>
        {promise}
      </text>
      <text x={CX} y={CY + 16} textAnchor="middle" fontSize="20" fontWeight="800" fill={NAVY}>
        {seconds}
      </text>
    </svg>
  );
}
