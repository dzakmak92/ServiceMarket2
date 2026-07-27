import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function jsDayToLabel(jsDay) {
  return WEEKDAY_LABELS[(jsDay + 6) % 7];
}

/**
 * Local YYYY-MM-DD string (NO UTC shift).
 * Using toISOString() converts to UTC, which moves local midnight backward a
 * day for positive UTC offsets (e.g. UTC+2), so a booking on the 16th would be
 * matched against the 15th and the booked slot would wrongly stay "available".
 */
export function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

/**
 * Dated weekly availability matrix — used in BOTH:
 *  - Pro public profile (read-only, shows others' confirmed bookings in red)
 *  - Pro Settings (editable; clicking a non-past, non-booked cell toggles the
 *    underlying day-of-week template via onToggle)
 *
 * Props:
 *  - rows: array of slot strings, e.g., ['09:00-12:00', ...]
 *  - days: array of weekday labels in display order, e.g., ['Mon', ..., 'Sun']
 *  - getActive(day, slot): boolean — is this template slot active for the pro?
 *  - bookings: [{ date: '2026-05-27', day: 'Mon', slot: '09:00-12:00' }]
 *  - editable: when true, clicking a cell calls onToggle(day, slot)
 *  - onToggle(day, slot): async — only called when editable=true
 *  - t: translation function
 *  - title, description: localised strings
 *  - testidPrefix: 'pro-avail' (public) or 'settings-avail' (editable)
 */
export default function DatedAvailabilityMatrix({
  rows,
  days,
  getActive,
  bookings = [],
  editable = false,
  onToggle,
  t,
  title,
  description,
  testidPrefix = 'pro-avail',
  focusDate,
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  // Mobile: which weekday (0=Mon … 6=Sun) is expanded. Default to today.
  const [mobileDayIdx, setMobileDayIdx] = useState(() => (new Date().getDay() + 6) % 7);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Keep the displayed week + selected mobile day in sync with an external
  // focus date (e.g. the calendar's selected day) so schedule & availability match.
  useEffect(() => {
    if (!focusDate) return;
    const fMon = startOfWeek(focusDate);
    const tMon = startOfWeek(today);
    setWeekOffset(Math.round((fMon - tMon) / (7 * 86400000)));
    setMobileDayIdx((new Date(focusDate).getDay() + 6) % 7);
  }, [focusDate, today]);

  const weekStart = useMemo(() => {
    const start = startOfWeek(today);
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [today, weekOffset]);

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const bookedMap = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (!b.slot || !b.date) continue;
      if (b.status === 'cancelled') continue;
      map[`${b.date}|${b.slot}`] = true;
    }
    return map;
  }, [bookings]);

  const isBookedOn = (date, slot) => {
    const iso = toLocalDateStr(date);
    return Boolean(bookedMap[`${iso}|${slot}`]);
  };

  const fmtDate = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const weekLabel = `${weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${weekDates[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  return (
    <div data-testid={`${testidPrefix}-container`}>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        {title && (
          <h3 className="font-headings font-bold text-ink flex items-center gap-2">
            <Calendar size={16} className="text-teal" />
            {title}
          </h3>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="p-1.5 rounded-full hover:bg-cream-soft transition-colors"
            aria-label="previous week"
            data-testid={`${testidPrefix}-prev`}
            type="button"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-semibold text-ink min-w-[140px] text-center" data-testid={`${testidPrefix}-week-label`}>
            {weekLabel}
          </span>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="p-1.5 rounded-full hover:bg-cream-soft transition-colors"
            aria-label="next week"
            data-testid={`${testidPrefix}-next`}
            type="button"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      {description && (
        <p className="text-xs text-ink-muted mb-3">{description}</p>
      )}

      <div className="overflow-x-auto hidden md:block">
        <div className="grid grid-cols-[60px_repeat(7,minmax(56px,1fr))] gap-1.5 min-w-[480px]">
          <div></div>
          {weekDates.map((d, i) => {
            const isToday = d.getTime() === today.getTime();
            const isPast = d < today;
            return (
              <div
                key={i}
                className={`text-center ${isPast ? 'opacity-40' : ''}`}
              >
                <div className={`text-[10px] font-semibold uppercase tracking-wide ${isToday ? 'text-teal' : 'text-ink-muted'}`}>
                  {jsDayToLabel(d.getDay())}
                </div>
                <div className={`text-sm font-bold ${isToday ? 'text-teal' : 'text-ink'}`}>
                  {fmtDate(d)}
                </div>
              </div>
            );
          })}

          {rows.map((slot) => (
            <React.Fragment key={slot}>
              <div className="text-[10px] font-medium text-ink-muted self-center">{slot}</div>
              {weekDates.map((d) => {
                const weekday = jsDayToLabel(d.getDay());
                const past = d < today;
                const active = getActive(weekday, slot);
                const booked = active && isBookedOn(d, slot);

                let cls = 'h-10 rounded-[10px] flex items-center justify-center text-[10px] font-semibold transition-colors';
                let content = '·';
                let disabled = false;
                let title2 = `${weekday} ${slot}`;

                if (past) {
                  cls += ' bg-cream-deep text-ink-faint opacity-50';
                  content = active ? slot : '·';
                  disabled = true;
                } else if (booked) {
                  cls += ' bg-red-warn text-paper line-through';
                  content = '✕';
                  disabled = true;
                  title2 = t ? t('booking_booked_short') : 'Booked';
                } else if (active) {
                  cls += ' bg-teal text-paper';
                  cls += editable ? ' hover:bg-teal-dark cursor-pointer' : '';
                  content = '✓';
                } else {
                  cls += ' bg-cream-deep text-ink-faint';
                  cls += editable ? ' hover:bg-cream-soft cursor-pointer' : '';
                }

                const testid = `${testidPrefix}-${weekday}-${slot}-${toLocalDateStr(d)}`;

                if (editable) {
                  return (
                    <button
                      key={`${slot}-${toLocalDateStr(d)}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => onToggle && onToggle(weekday, slot)}
                      className={cls + (disabled ? ' cursor-not-allowed' : '')}
                      title={title2}
                      data-testid={testid}
                      data-booked={booked ? 'true' : 'false'}
                    >
                      {content}
                    </button>
                  );
                }
                return (
                  <div
                    key={`${slot}-${toLocalDateStr(d)}`}
                    className={cls}
                    title={title2}
                    data-testid={testid}
                    data-booked={booked ? 'true' : 'false'}
                  >
                    {content}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Mobile: pick a day, then toggle its time slots (no horizontal scroll) */}
      <div className="md:hidden">
        <div className="grid grid-cols-7 gap-1 mb-3">
          {weekDates.map((d, i) => {
            const isToday = d.getTime() === today.getTime();
            const isPast = d < today;
            const isSel = i === mobileDayIdx;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setMobileDayIdx(i)}
                className={`flex flex-col items-center py-1.5 rounded-[10px] border transition-colors
                  ${isSel ? 'border-teal bg-teal/10' : 'border-sm-border'} ${isPast ? 'opacity-50' : ''}`}
                data-testid={`${testidPrefix}-mday-${i}`}
              >
                <span className={`text-[9px] uppercase font-bold ${isToday || isSel ? 'text-teal' : 'text-ink-muted'}`}>
                  {jsDayToLabel(d.getDay())}
                </span>
                <span className={`text-sm font-bold leading-none mt-0.5 ${isToday || isSel ? 'text-teal' : 'text-ink'}`}>
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-1.5" data-testid={`${testidPrefix}-mobile-slots`}>
          {rows.map((slot) => {
            const d = weekDates[mobileDayIdx];
            const weekday = jsDayToLabel(d.getDay());
            const past = d < today;
            const active = getActive(weekday, slot);
            const booked = active && isBookedOn(d, slot);

            let cls = 'py-2.5 px-2 rounded-[10px] border text-xs font-semibold flex items-center justify-center gap-1 transition-colors';
            let disabled = false;
            let icon = null;
            if (past) {
              cls += ' bg-cream-deep border-sm-border text-ink-faint opacity-50';
              disabled = true;
            } else if (booked) {
              cls += ' bg-red-warn border-red-warn text-paper';
              disabled = true;
              icon = <X size={12} />;
            } else if (active) {
              cls += ' bg-teal border-teal text-paper' + (editable ? ' active:scale-95' : '');
              icon = <Check size={12} />;
            } else {
              cls += ' bg-cream-deep border-sm-border text-ink-muted' + (editable ? ' hover:bg-cream-soft' : '');
            }

            const testid = `${testidPrefix}-m-${weekday}-${slot}-${toLocalDateStr(d)}`;
            const inner = <>{icon}{slot}</>;

            if (editable) {
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle && onToggle(weekday, slot)}
                  className={cls + (disabled ? ' cursor-not-allowed' : '')}
                  data-testid={testid}
                  data-booked={booked ? 'true' : 'false'}
                >
                  {inner}
                </button>
              );
            }
            return (
              <div key={slot} className={cls} data-testid={testid} data-booked={booked ? 'true' : 'false'}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[11px] text-ink-muted flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-teal inline-block"></span>{t ? t('booking_avail') : 'Available'}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-warn inline-block"></span>{t ? t('booking_booked') : 'Booked'}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-cream-deep inline-block"></span>{t ? t('booking_unavail') : 'Off'}</span>
      </div>
    </div>
  );
}
