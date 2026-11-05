import React from 'react';
import useTweenNumber from '../../hooks/useTweenNumber';

/**
 * Ein Eurobetrag, der hochzählt, mit einem kurzen Plus- oder Minus-Chip.
 * `format` bekommt die laufende Zahl; `chip` schaltet den Chip ab.
 */
export default function AnimatedEur({ value, format, chip = true, className = '', onDark = false }) {
  const { value: v, delta, tick } = useTweenNumber(Math.round(Number(value) || 0));
  const fmt = (n) => `${Math.round(Math.abs(n)).toLocaleString('de-DE')} €`;
  return (
    <span className={`relative inline-block tabular-nums ${className}`}>
      {format ? format(v) : fmt(v)}
      {chip && tick > 0 && Math.abs(delta) >= 1 && (
        <span key={tick} aria-hidden="true"
              className={`absolute left-full top-0 ml-2 whitespace-nowrap rounded-full px-2 py-0.5
                          font-body text-[11px] font-extrabold opacity-0 animate-delta
                          ${onDark
                            ? (delta > 0 ? 'bg-[#7fd08f] text-[#0f3a1c]' : 'bg-[#ffb3bc] text-[#5a0f1a]')
                            : (delta > 0 ? 'bg-green-pos/15 text-green-text' : 'bg-red-warn/15 text-red-text')}`}>
          {delta > 0 ? '+' : '−'}{fmt(delta)}
        </span>
      )}
    </span>
  );
}
