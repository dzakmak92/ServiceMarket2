import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GroupDial from './GroupDial';

/**
 * The dial, swipeable between trades.
 *
 * The seven trades are already a row of cards above this and the row stays;
 * this adds the gesture, because on a phone the dial is the biggest thing on
 * the screen and the thumb is already on it. Tapping a card and dragging the
 * ring do the same thing and stay in sync — the URL is what both of them set.
 *
 * **The geometry.** The open dial sits at 0.92 and its neighbours at half of
 * that, 0.46. Pitch is `195 - RO * 0.46`, the radius a ring actually occupies
 * at half size, so the rings just touch at rest and never overlap. Scale and
 * opacity both run off the same eased distance from centre, so the arriving
 * dial grows as the leaving one shrinks rather than one cutting to the other.
 *
 * **Why the neighbours are cropped.** The ring occupies x 49–305 of
 * GroupDial's 354-wide viewBox, so 49 px of either side is empty. An uncropped
 * neighbour peeking past the edge of the pane would show blank before it
 * showed any dial. `crop` narrows the box to the ink and is centred on the
 * same 177, which is what lets both be positioned identically.
 *
 * **Why the open one is opaque.** The dial's ground is transparent, which is
 * invisible until a second dial sits behind it — then the neighbour's wedges
 * read straight through the middle of the open one.
 *
 * **The hub travels with its own dial.** "Quote in 90 sec." is drawn inside
 * GroupDial's SVG, so it slides, scales and fades as part of the ring it
 * belongs to. Pinning a single hub to the centre instead breaks at the
 * midpoint of a swipe, where neither dial is the front one and the hub has
 * nothing under it. Neighbour hubs are faded out at rest — at 0.46 the lead
 * line renders around 4.8 px — and fade in as their dial arrives.
 *
 * Position is held in a ref and written straight to the DOM, because a drag
 * moves it every frame and re-rendering five dials at 60 Hz to move them a few
 * pixels is not what React is for. Only the *base* index is state, and that
 * changes once per trade rather than once per frame.
 */

const CENTRE = 1;
const HALF = CENTRE / 2;
const RO = 128;                             /* GroupDial's outer radius */
const W = 354;                              /* and its viewBox width */
const STAGE = 390;                          /* the pane the dial sits in */
/* Where a neighbour sits. Not "rings just touching" — the comment used to
   say that and it was never true: at 0.5 the neighbour's own radius is 64 and
   the open dial's is 128, so touching would need 192 px of pitch. This puts
   the neighbour's *outer edge* flush with the edge of the 390 px pane, which
   is what makes it read as the next one waiting rather than a decoration. The
   overlap behind the open dial is covered, because the open dial is opaque. */
const PITCH = 195 - RO * HALF;              /* 131 at CENTRE 1 */
const PITCH_PCT = (PITCH / STAGE) * 100;
const FRONT_PCT = (W / STAGE) * 100;        /* 90.8 */
const SIDE_PCT = (256 / STAGE) * 100;       /* the cropped box: 65.6 */
const THROW = 0.35;                         /* px per ms — a flick, not a drag */
const SLOTS = [-2, -1, 0, 1, 2];            /* one spare each way for a flick */

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const Chevron = ({ back }) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={back ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
);

export default function DialSwipe({
  order, value, onChange, dials, group, onGroup, label, promise, seconds, swipeLabel,
  prevLabel, nextLabel,
}) {
  const n = order.length;
  const index = Math.max(0, order.indexOf(value));

  const pos = useRef(index);                /* measured in trades: 5.5 is halfway */
  const target = useRef(index);
  const raf = useRef(0);
  const drag = useRef(null);
  const stage = useRef(null);
  const slotRefs = useRef([]);
  const [base, setBase] = useState(index);
  const baseRef = useRef(index);

  const paint = useCallback(() => {
    const b = Math.round(pos.current);
    let nearest = 0;
    let best = Infinity;
    SLOTS.forEach((d, i) => {
      const off = b + d - pos.current;
      if (Math.abs(off) < best) { best = Math.abs(off); nearest = i; }
    });
    SLOTS.forEach((d, i) => {
      const el = slotRefs.current[i];
      if (!el) return;
      const off = b + d - pos.current;
      const e = smooth(clamp01(1 - Math.abs(off)));
      el.style.left = `${50 + off * PITCH_PCT}%`;
      el.style.transform =
        `translate(-50%,-50%) scale(${(HALF + (CENTRE - HALF) * e).toFixed(4)})`;
      el.style.opacity = (0.16 + 0.84 * e).toFixed(3);
      el.style.zIndex = i === nearest ? 3 : 1;
      el.style.visibility = Math.abs(off) > 1.9 ? 'hidden' : 'visible';
      const hub = el.querySelector('[data-dial-hub]');
      if (hub) hub.setAttribute('opacity', Math.pow(e, 0.7).toFixed(3));
    });
    if (b !== baseRef.current) { baseRef.current = b; setBase(b); }
  }, []);

  const run = useCallback(() => {
    if (raf.current) return;
    const settle = () => {
      const gap = target.current - pos.current;
      if (Math.abs(gap) < 0.003) {
        pos.current = target.current;
        raf.current = 0;
        paint();
        const key = order[((Math.round(pos.current) % n) + n) % n];
        if (key && key !== value) onChange(key);
        return;
      }
      pos.current += gap * 0.22;
      paint();
      raf.current = requestAnimationFrame(settle);
    };
    raf.current = requestAnimationFrame(settle);
  }, [order, n, value, onChange, paint]);

  /* `pos` counts trades, so it is an index into `order` — and `order` grows as
     the neighbouring layouts arrive, which moves every index under it. The
     first render has only the open trade in the list; by the time all seven
     are in, the same trade is at a different index and an un-anchored `pos`
     would animate to a trade nobody asked for. So whenever the list itself
     changes, the position is re-seated on the trade the URL names, without
     animating. */
  const orderKey = order.join('|');
  const seated = useRef(orderKey);
  useEffect(() => {
    if (seated.current === orderKey) return;
    seated.current = orderKey;
    if (drag.current) return;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    pos.current = index;
    target.current = index;
    followed.current = index;
    baseRef.current = index;
    setBase(index);
    paint();
  }, [orderKey, index, paint]);

  /* The URL is the source of truth. When a card is tapped, or the back button
     is used, the dial animates to whatever the address now says. Nothing moves
     while a finger is down. */
  const followed = useRef(index);
  useEffect(() => {
    if (followed.current === index) return;
    followed.current = index;
    if (drag.current) return;
    const here = ((Math.round(pos.current) % n) + n) % n;
    if (here === index) return;
    let step = index - here;
    if (step > n / 2) step -= n;
    if (step < -n / 2) step += n;
    target.current = Math.round(pos.current) + step;
    run();
  }, [index, n, run]);

  /* Lay the slots out on mount, and again whenever a neighbour's layout
     arrives and gives a slot something to draw. */
  useEffect(() => { paint(); }, [paint, dials, base]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    /* No pointer capture here. Capturing on pointerdown retargets every later
       event to this element, and the wedge under the finger never gets its
       click — which is how tapping a group on the open dial stopped working.
       Capture is taken in onMove, once the gesture is actually a drag. */
    drag.current = {
      x: e.clientX, y: e.clientY, t: e.timeStamp, v: 0, moved: false, id: e.pointerId,
    };
  };

  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    /* Until it has moved 6 px sideways this could still be the page
       scrolling, and 10 px of vertical settles it — the gesture is handed
       back and the dial does not move. Once horizontal, it stays horizontal. */
    if (!d.moved) {
      if (Math.abs(e.clientY - d.y) > 10) { drag.current = null; return; }
      if (Math.abs(dx) < 6) return;
      d.moved = true;
      /* Now it is a drag, so take the pointer: the finger can leave the dial
         and the gesture still finishes here. */
      if (stage.current) stage.current.setPointerCapture(d.id);
      /* The wedge under the finger took focus on pointerdown, which is right
         for a tap and wrong for a drag — it would otherwise be left outlined
         after a swipe it had nothing to do with. */
      const a = document.activeElement;
      if (a && a !== stage.current && stage.current?.contains(a)) a.blur?.();
    }
    const dt = Math.max(1, e.timeStamp - d.t);
    d.v = dx / dt;
    pos.current -= dx / PITCH;
    d.x = e.clientX;
    d.t = e.timeStamp;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    paint();
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    /* Past a quarter of a pitch, or thrown, it goes on; otherwise back. */
    if (d.v < -THROW) target.current = Math.floor(pos.current) + 1;
    else if (d.v > THROW) target.current = Math.ceil(pos.current) - 1;
    else target.current = Math.round(pos.current);
    run();
  };

  const step = (by) => { target.current = Math.round(pos.current) + by; run(); };

  const keys = useMemo(
    () => SLOTS.map((d) => order[((base + d) % n + n) % n]),
    [base, order, n],
  );

  if (n < 2) return null;

  return (
    <div ref={stage}
         className="relative w-full aspect-[390/300] overflow-hidden touch-pan-y select-none
                    cursor-grab active:cursor-grabbing
                    focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/40"
         data-testid="dial-swipe"
         role="group" aria-roledescription="carousel" aria-label={swipeLabel}
         tabIndex={0}
         onPointerDown={onDown} onPointerMove={onMove}
         onPointerUp={onUp} onPointerCancel={onUp}
         onKeyDown={(e) => {
           if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
           if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
         }}>
      {SLOTS.map((d, i) => {
        const key = keys[i];
        const front = d === 0;
        const wedges = dials[key];
        return (
          /* The slot is the identity, not the trade: there are always five of
             them and the trade in each one changes as the dial turns. Keying
             by trade collides while fewer than five layouts have arrived, when
             two slots legitimately name the same one.
             eslint-disable-next-line react/no-array-index-key */
          <div key={i}
               ref={(el) => { slotRefs.current[i] = el; }}
               className={`absolute top-1/2 origin-center will-change-transform
                           ${front ? '' : 'pointer-events-none'}`}
               style={{ width: `${front ? FRONT_PCT : SIDE_PCT}%` }}
               aria-hidden={front ? undefined : true}>
            {wedges ? (
              <GroupDial groups={wedges}
                         value={front ? group : wedges[0].key}
                         onChange={front ? onGroup : undefined}
                         label={label} promise={promise} seconds={seconds}
                         opaque={front} crop={!front} />
            ) : null}
          </div>
        );
      })}

      {/* Nothing about a dial says it can be dragged, so the arrows say it.
          They are real buttons — the same step the keyboard takes — and they
          sit in the margin the rings leave empty: at rest a neighbour reaches
          about 77 px in from either edge of a 390-wide pane.
          `onPointerDown` is stopped so pressing one never starts a drag. */}
      {[true, false].map((back) => (
        <button key={back ? 'p' : 'n'} type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => step(back ? -1 : 1)}
                aria-label={back ? prevLabel : nextLabel}
                data-testid={back ? 'dial-prev' : 'dial-next'}
                className={`absolute top-1/2 -translate-y-1/2 z-10 grid place-items-center
                            w-9 h-9 rounded-full bg-paper/90 backdrop-blur-[2px]
                            border border-line text-navy shadow-sm
                            transition hover:bg-paper active:scale-95
                            focus-visible:outline-none focus-visible:ring-4
                            focus-visible:ring-teal/40 ${back ? 'left-1' : 'right-1'}`}>
          <Chevron back={back} />
        </button>
      ))}
    </div>
  );
}
