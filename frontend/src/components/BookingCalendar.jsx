import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useLang } from '../contexts/LangContext';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function jsDayToLabel(jsDay) { return WEEKDAY_LABELS[(jsDay + 6) % 7]; }
function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

/**
 * Dated 7-day booking calendar used inside the conversation. Same visual
 * language as the public profile availability matrix — Available (teal), Booked
 * (red ✕), Off (cream), Past (dim). Clicking a free slot selects it; the
 * "Confirm Booking" button calls onConfirm(weekday, slot, dateObj).
 *
 * Props:
 *  - availability: [{day, slot}]
 *  - bookings: [{date, day, slot}]  (used to mark already-booked cells red)
 *  - disabled: boolean
 *  - disabledReason: string
 *  - onConfirm: async (weekday, slot, dateObj) => void
 */
export default function BookingCalendar({
  availability = [],
  bookings = [],
  disabled = false,
  disabledReason = '',
  onConfirm,
}) {
  const { t } = useLang();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState(null); // { date, slot, weekday }
  const [busy, setBusy] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const weekStart = useMemo(() => {
    const s = startOfWeek(today);
    s.setDate(s.getDate() + weekOffset * 7);
    return s;
  }, [today, weekOffset]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  }), [weekStart]);

  const { rows, cellMap } = useMemo(() => {
    const rowSet = new Map();
    const map = {};
    for (const a of availability) {
      const m = (a.slot || '').match(/^\s*(\d{1,2}):\d{2}/);
      if (!m) continue;
      const hour = m[1].padStart(2, '0') + ':00';
      rowSet.set(hour, true);
      map[`${hour}|${a.day}`] = a.slot;
    }
    return { rows: [...rowSet.keys()].sort(), cellMap: map };
  }, [availability]);

  const bookedMap = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (b.date && b.slot) map[`${b.date}|${b.slot}`] = true;
    }
    return map;
  }, [bookings]);

  const isBooked = (date, slot) => bookedMap[`${date.toISOString().slice(0, 10)}|${slot}`];

  const pick = (date, slot, weekday) => {
    if (disabled || date < today) return;
    setSelected({ date, slot, weekday });
  };

  const confirm = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await onConfirm(selected.weekday, selected.slot, selected.date);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  const weekLabel = `${weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  const hasAny = rows.length > 0;

  return (
    <div className="card-lg bg-paper" data-testid="booking-calendar">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h3 className="font-headings font-bold text-ink text-lg flex items-center gap-2">
          <CalendarIcon size={16} className="text-teal" />
          {t('booking_panel_title')}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="p-1.5 rounded-full hover:bg-cream-soft transition-colors"
            data-testid="booking-cal-prev"
            aria-label="previous week"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-semibold text-ink min-w-[140px] text-center">{weekLabel}</span>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="p-1.5 rounded-full hover:bg-cream-soft transition-colors"
            data-testid="booking-cal-next"
            aria-label="next week"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {disabled && disabledReason && (
        <p className="text-xs text-ink-muted mb-3">{disabledReason}</p>
      )}

      {!hasAny ? (
        <p className="text-ink-muted text-sm text-center py-6">{t('booking_no_avail')}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[60px_repeat(7,minmax(64px,1fr))] gap-2 min-w-[520px]">
              <div></div>
              {days.map((d) => {
                const isToday = d.getTime() === today.getTime();
                const isPast = d < today;
                return (
                  <div
                    key={d.toISOString()}
                    className={`text-center ${isPast ? 'opacity-40' : ''}`}
                  >
                    <div className={`text-[10px] font-semibold uppercase tracking-wide ${isToday ? 'text-teal' : 'text-ink-muted'}`}>
                      {jsDayToLabel(d.getDay())}
                    </div>
                    <div className={`text-sm font-bold ${isToday ? 'text-teal' : 'text-ink'}`}>
                      {d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                );
              })}

              {rows.map((row) => (
                <React.Fragment key={row}>
                  <div className="text-xs font-semibold text-ink-muted self-center">{row}</div>
                  {days.map((d) => {
                    const weekday = jsDayToLabel(d.getDay());
                    const slot = cellMap[`${row}|${weekday}`];
                    const isPast = d < today;
                    const isSel = selected && selected.date.getTime() === d.getTime() && selected.slot === slot;
                    const booked = slot && isBooked(d, slot);

                    let cls = 'h-14 rounded-[14px] flex items-center justify-center text-[11px] font-semibold transition-all';
                    let content = '';
                    if (!slot) {
                      cls += ' bg-cream-deep text-ink-faint';
                      content = '·';
                    } else if (isPast) {
                      cls += ' bg-cream-deep text-ink-faint opacity-60';
                      content = slot;
                    } else if (booked) {
                      cls += ' bg-red-warn text-paper';
                      content = '✕';
                    } else if (isSel) {
                      cls += ' bg-amber text-paper shadow-md shadow-amber/40 scale-[1.03]';
                      content = slot;
                    } else {
                      cls += ' bg-teal text-paper cursor-pointer hover:bg-teal-deep';
                      content = slot;
                    }
                    return (
                      <button
                        key={`${row}-${d.toISOString()}`}
                        type="button"
                        onClick={() => slot && !booked && !isPast && pick(d, slot, weekday)}
                        disabled={!slot || isPast || booked || disabled}
                        className={cls}
                        title={booked ? t('booking_booked_short') : (slot || '')}
                        data-testid={`bcal-${row}-${d.toISOString().slice(0, 10)}`}
                        data-state={booked ? 'booked' : isSel ? 'selected' : slot ? 'available' : 'off'}
                      >
                        {content}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Legend + confirm row */}
          <div className="flex items-center justify-between gap-4 mt-4 pt-3 border-t border-sm-border flex-wrap">
            <div className="flex items-center gap-3 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-teal inline-block"></span>{t('booking_avail')}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-warn inline-block"></span>{t('booking_booked')}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-cream-deep inline-block"></span>{t('booking_unavail')}</span>
            </div>
            {selected && !disabled && (
              <div className="flex items-center gap-3 animate-fade-in">
                <span className="text-xs text-ink">
                  <strong>{selected.weekday}</strong> · {selected.slot} ·{' '}
                  <span className="text-ink-muted">{selected.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                </span>
                <button
                  onClick={confirm}
                  disabled={busy}
                  className="btn-primary text-xs px-3 py-1.5"
                  data-testid="confirm-booking-btn"
                >
                  {busy ? <Loader2 size={11} className="animate-spin" /> : null}
                  {busy ? t('booking_confirming') : t('booking_confirm')}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
