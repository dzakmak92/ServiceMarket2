import React from 'react';

/**
 * One mark per trade, drawn rather than imported.
 *
 * The estimator's tiles carry a lucide icon each, which is fine at 64 px behind
 * a heading and wrong at 19 px inside a 30 px tile: a paintbrush and a wrench
 * are the same grey smudge at that size. These are drawn on a 32 px box at
 * stroke 2 and checked at 19 px, which is the only size the onboarding row
 * ever renders them at.
 *
 * `reinigung` is soap bubbles rather than the spray bottle the first draft
 * used — a bottle at 19 px reads as a bottle of something, and the trade two
 * rows away is Sanitär.
 */
const PATHS = {
  maler: (
    <>
      <rect x="3" y="5" width="17" height="8" rx="2.5" />
      <path d="M20 9h4a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-8v4" />
      <rect x="13" y="20" width="6" height="9" rx="2" />
    </>
  ),
  fliesen: (
    <>
      <rect x="4" y="4" width="10" height="10" rx="1" />
      <rect x="18" y="4" width="10" height="10" rx="1" />
      <rect x="4" y="18" width="10" height="10" rx="1" />
      <rect x="18" y="18" width="10" height="10" rx="1" />
    </>
  ),
  elektrik: <path d="M18 3 7 18h7l-2 11 11-15h-7z" />,
  sanitaer: <path d="M16 3s9 9.5 9 15a9 9 0 0 1-18 0c0-5.5 9-15 9-15z" />,
  garten: (
    <>
      <path d="M16 29c0-8 5-14 12-15 0 8-5 14-12 15z" />
      <path d="M16 29C16 21 11 15 4 14c0 8 5 14 12 15z" />
      <path d="M16 29V17" />
    </>
  ),
  reinigung: (
    <>
      <circle cx="11" cy="20" r="8" />
      <circle cx="23" cy="12" r="5" />
      <circle cx="25" cy="24" r="3.5" />
      <path d="M8 18a3 3 0 0 1 3-3" />
    </>
  ),
  montage: (
    <path d="M22 4a7 7 0 0 0-8.6 9.3L4 22.7 9.3 28l9.4-9.4A7 7 0 0 0 28 10l-4 4-4-4 4-4a7 7 0
             0 0-2-2z" />
  ),
};

export default function TradeMark({ trade, size = 19, className = '' }) {
  const d = PATHS[trade];
  if (!d) return null;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true"
         className={className} fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}
