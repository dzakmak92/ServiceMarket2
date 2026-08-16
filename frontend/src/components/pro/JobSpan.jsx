import React, { useMemo } from 'react';

/**
 * The next six weeks, and this week's days under them.
 *
 * The list said what is in hand. It never said *when* — a pro reading it had
 * to open every card to find out whether the week ahead was full or empty.
 * This is that answer in one card: six equal weeks with a mark for every
 * booked job, a line for now, and the seven days of the current week beneath a
 * rule.
 *
 * The card is deliberately not a control. Tapping a day to filter the list
 * would be a second selector next to the tabs, and a screen with two ways to
 * narrow the same pile is the fastest way to make it untrustworthy.
 *
 * Its two halves follow the money card's split: context on the tint, detail
 * on the white.
 */

const DAY = 86400000;

/** The real ISO week number — "KW 33" is a thing people say to each other, so
 *  an approximation would be worse than no label. */
function kw(d) {
  const a = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  a.setUTCDate(a.getUTCDate() + 4 - (a.getUTCDay() || 7));
  return Math.ceil(((a - Date.UTC(a.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
}

/** Monday of the week `d` falls in, at midnight local. */
function monday(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export default function JobSpan({ jobs, accent, tint, t }) {
  /* The day, not the millisecond: without a stable key the memo recomputed on
     every render and the strip could not be compared frame to frame. */
  const dayKey = new Date().toDateString();

  const { weeks, marks, days, booked, emptyWeeks, nowPct } = useMemo(() => {
    const now = new Date(dayKey);
    const first = monday(now);
    const span = 42;

    const w = [];
    for (let i = 0; i < 6; i += 1) {
      const mon = new Date(first); mon.setDate(mon.getDate() + i * 7);
      w.push(kw(mon));
    }

    /* One mark per booked job, positioned by the day it starts. Jobs outside
       the window are not drawn and not counted — the caption under the strip
       is a claim about these six weeks only. */
    const m = [];
    const perWeek = [0, 0, 0, 0, 0, 0];
    const perDay = [0, 0, 0, 0, 0, 0, 0];
    for (const j of jobs || []) {
      if (!j.scheduled_start) continue;
      const d = new Date(j.scheduled_start);
      if (Number.isNaN(+d)) continue;
      const off = Math.floor((+new Date(d.getFullYear(), d.getMonth(), d.getDate()) - +first) / DAY);
      if (off < 0 || off >= span) continue;
      m.push({ id: j.id, pct: (off / span) * 100 });
      perWeek[Math.floor(off / 7)] += 1;
      if (off < 7) perDay[off] += 1;
    }

    const todayOff = Math.floor((+new Date(now.getFullYear(), now.getMonth(), now.getDate())
      - +first) / DAY);
    const dd = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(first); d.setDate(d.getDate() + i);
      dd.push({ n: d.getDate(), lbl: d.toLocaleDateString(undefined, { weekday: 'short' }),
        today: i === todayOff, busy: perDay[i] > 0 });
    }

    return {
      weeks: w, marks: m, days: dd, booked: m.length,
      emptyWeeks: perWeek.filter((c) => c === 0).length,
      nowPct: ((todayOff + 0.5) / span) * 100,
    };
  }, [jobs, dayKey]);

  return (
    <div className="rounded-[15px] overflow-hidden mb-2.5" data-testid="ov-span"
         style={{ border: `1px solid ${accent}`, background: tint }}>
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-baseline mb-1.5">
          <b className="text-[12px] font-extrabold text-ink">{t('ov_span_title')}</b>
          <span className="ml-auto text-[11px] text-ink-muted tabular-nums">
            {t('ov_span_kw', { a: weeks[0], b: weeks[5] })}
          </span>
        </div>
        <div className="flex mb-1" aria-hidden="true">
          {weeks.map((n, i) => (
            <span key={n} className={`flex-1 text-center text-[10px] tabular-nums
                                      ${i === 0 ? 'font-extrabold text-ink' : 'text-ink-muted'}`}>
              {n}
            </span>
          ))}
        </div>
        <div className="relative h-[30px] rounded-[7px] bg-paper" data-testid="ov-span-strip">
          <div className="absolute inset-0 flex pointer-events-none" aria-hidden="true">
            {weeks.map((n, i) => (
              <i key={n} className={`flex-1 ${i < 5 ? 'border-r' : ''}`}
                 style={{ borderColor: '#d3dfe9' }} />
            ))}
          </div>
          {marks.map((m) => (
            <i key={m.id} data-testid={`ov-span-mark-${m.id}`}
               className="absolute top-[5px] bottom-[5px] w-[9px] rounded-[3px]"
               style={{ left: `${m.pct}%`, background: accent }} />
          ))}
          <i aria-hidden="true" data-testid="ov-span-now"
             className="absolute -top-px -bottom-px w-[2px] bg-red-warn"
             style={{ left: `${nowPct}%` }} />
        </div>
        <p className="text-[10.5px] text-ink-faint text-center mt-1.5" data-testid="ov-span-cap">
          <b className="text-ink">{t('ov_span_count', { n: booked })}</b>
          {emptyWeeks > 0 && <> · <b className="text-red-text">{t('ov_span_empty', { n: emptyWeeks })}</b></>}
        </p>
      </div>
      <div className="bg-paper px-3 py-2" style={{ borderTop: `1px solid ${accent}` }}>
        <div className="flex gap-[3px]" data-testid="ov-span-days">
          {days.map((d) => (
            <div key={d.n} data-today={d.today ? 'yes' : 'no'}
                 className="flex-1 text-center rounded-[9px] py-1"
                 style={d.today ? { background: tint, boxShadow: `inset 0 0 0 2px ${accent}` } : undefined}>
              <p className="text-[8.5px] font-bold uppercase text-ink-muted">{d.lbl}</p>
              <p className="text-[13px] font-extrabold tabular-nums leading-[1.35] text-ink">{d.n}</p>
              <i className="block h-[3px] rounded-full mx-[5px] mt-[3px]"
                 style={{ background: d.busy ? accent : '#dde6ee' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
