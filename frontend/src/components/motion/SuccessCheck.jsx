import React from 'react';

/** Kreis und Häkchen, die sich zeichnen: der Abschluss einer Arbeit. */
export default function SuccessCheck({ size = 52 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="mx-auto mb-2" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="none" className="stroke-green-text" strokeWidth="3"
              strokeDasharray="176" strokeDashoffset="176"
              style={{ animation: 'draw 420ms cubic-bezier(.2,.8,.2,1) forwards' }} />
      <path d="M20 33l8 8 16-17" fill="none" className="stroke-green-text" strokeWidth="4"
            strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40" strokeDashoffset="40"
            style={{ animation: 'draw 300ms 360ms cubic-bezier(.2,.8,.2,1) forwards' }} />
    </svg>
  );
}
