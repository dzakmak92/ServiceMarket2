import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * "We could not load your day" — which is not the same thing as "your day is
 * free", and used to look exactly like it.
 *
 * All three calendar views caught a failed fetch with `setAppts([])` and no
 * error state, so a 500, a 403 and an aborted request each rendered a calendar
 * with nothing in it. The screenshots were byte-identical to a genuinely empty
 * day. Two ways that hurts a tradesperson: one goes home believing the
 * afternoon is clear, and one books a customer into a twelve-hour hole that is
 * already full.
 *
 * There was also no way back — no retry anywhere on the page. Recovery
 * happened only by accident, if the pro happened to switch views and remount
 * the component.
 */
export default function LoadFailed({ onRetry, t }) {
  return (
    <div className="rounded-[12px] border-[1.5px] border-red-warn/35 bg-red-warn/[0.05]
                    px-3.5 py-3 mb-3 flex items-start gap-2.5"
         role="alert" data-testid="sched-load-failed">
      <AlertTriangle size={17} className="text-red-warn flex-none mt-px" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[0.75rem] text-ink leading-snug">{t('sched_load_failed')}</p>
        <p className="font-bold text-[0.65625rem] text-ink-muted mt-0.5 leading-snug">
          {t('sched_load_failed_hint')}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex-none min-h-[44px] px-3 rounded-[10px] bg-paper border border-sm-border
                   flex items-center gap-1.5 font-extrabold text-[0.71875rem] text-teal"
        data-testid="sched-retry"
      >
        <RotateCw size={13} /> {t('ui_retry')}
      </button>
    </div>
  );
}
