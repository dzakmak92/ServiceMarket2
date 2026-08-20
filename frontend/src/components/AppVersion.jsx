import React from 'react';
import { APP_VERSION } from '../utils/build';

/**
 * The version, and nothing else.
 *
 * At the foot of the "More" sheet rather than inside Settings → Account:
 * somebody looking for a version number is not editing their account — they
 * are being asked for it, usually while something is wrong — so it sits two
 * taps from anywhere in the app.
 */
export default function AppVersion() {
  return (
    <p className="mt-4 pt-3 border-t border-sm-border text-center text-[12px]
                  font-bold text-ink-muted tabular-nums"
       data-testid="app-version">
      {APP_VERSION}
    </p>
  );
}
