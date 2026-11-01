import { useEffect, useRef, useState } from 'react';

/**
 * Eine Zahl, die zum neuen Wert hinläuft statt zu springen.
 *
 * 420 ms, auslaufend. Bei reduzierter Bewegung sofort. Gibt zusätzlich die
 * letzte Änderung zurück (`delta`), damit ein Chip "+120 €" zeigen kann, und
 * einen Zähler (`tick`), der sich bei jeder Änderung erhöht und als `key`
 * die Chip-Animation neu startet.
 */
const reduced = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function useTweenNumber(target, ms = 420, initial = target) {
  const [value, setValue] = useState(initial);
  const [delta, setDelta] = useState({ d: 0, tick: 0 });
  const from = useRef(initial);
  const raf = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (start === target) return undefined;
    // Hochzählen beim ersten Zeichnen ist keine Änderung, also kein Chip.
    if (start !== initial || target === initial) setDelta((x) => ({ d: target - start, tick: x.tick + 1 }));
    if (reduced()) { from.current = target; setValue(target); return undefined; }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - (1 - p) ** 3;
      const v = start + (target - start) * e;
      from.current = v;
      setValue(v);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else from.current = target;
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms, initial]);

  return { value, delta: delta.d, tick: delta.tick };
}
