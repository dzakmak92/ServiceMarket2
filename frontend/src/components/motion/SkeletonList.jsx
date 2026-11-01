import React from 'react';

/**
 * Platzhalter in der Form der Liste, die gleich kommt. Ersetzt den Spinner
 * mitten auf leerer Fläche: die Seite wirkt schneller, obwohl sie gleich
 * schnell lädt, und springt nicht, wenn die Zeilen da sind.
 */
const bar = 'rounded-md bg-[length:300%_100%] animate-shimmer '
  + 'bg-[linear-gradient(90deg,#f9e9cf_0%,#fef7ea_40%,#f9e9cf_80%)]';

export default function SkeletonList({ rows = 4, testId = 'skeleton-list' }) {
  return (
    <div className="grid gap-2" aria-busy="true" aria-live="polite" data-testid={testId}>
      <span className="sr-only">Lädt…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-sm-border bg-paper p-3.5">
          <div className={`w-10 h-10 shrink-0 rounded-xl ${bar}`} />
          <div className="flex-1 grid gap-2">
            <div className={`h-3 ${bar}`} style={{ width: `${70 - i * 7}%` }} />
            <div className={`h-2.5 ${bar}`} style={{ width: `${44 - i * 4}%` }} />
          </div>
          <div className={`w-14 h-3 ${bar}`} />
        </div>
      ))}
    </div>
  );
}
