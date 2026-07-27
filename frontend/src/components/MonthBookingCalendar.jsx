import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2, Clock } from 'lucide-react';
import { useLang } from '../contexts/LangContext';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDERED_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function parseSlotHours(slot) {
  const m = (slot || '').match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[3], 10)];
}

/**
 * Compact two-column booking calendar — date picker (left) + hourly slots (right).
 * Auto-selects today on mount (or the next available date if today has no slots).
 * Designed to live inside a parent grid so its width can be constrained externally.
 */
export default function MonthBookingCalendar({ availability = [], bookings = [], onConfirm, disabled = false, readOnly = false }) {
  const { t } = useLang();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [busy, setBusy] = useState(false);

  const slotsByWeekday = useMemo(() => {
    const map = {};
    for (const a of availability) {
      if (!map[a.day]) map[a.day] = new Set();
      map[a.day].add(a.slot);
    }
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v].sort()]));
  }, [availability]);

  // Booked map: "YYYY-MM-DD|HH:MM-HH:MM" -> true.
  // Multi-hour bookings (e.g. 09:00-11:00) are exploded into individual 1-hour slot keys
  // so each row in the slots list paints red.
  const bookedMap = useMemo(() => {
    const out = {};
    for (const b of bookings) {
      const dateKey = b.date;
      const slot = b.slot;
      if (!dateKey || !slot) continue;
      const m = (slot || '').match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
      if (!m) continue;
      const sh = parseInt(m[1], 10);
      const eh = parseInt(m[3], 10);
      for (let h = sh; h < eh; h++) {
        const oneHour = `${String(h).padStart(2, '0')}:00-${String(h + 1).padStart(2, '0')}:00`;
        out[`${dateKey}|${oneHour}`] = true;
      }
    }
    return out;
  }, [bookings]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Auto-select today on first render once availability data is in.
  useEffect(() => {
    if (selectedDate || availability.length === 0) return;
    const todayDow = WEEKDAYS[today.getDay()];
    if ((slotsByWeekday[todayDow] || []).length > 0) {
      setSelectedDate(today);
      return;
    }
    // Otherwise pick the next 14 days that has slots
    for (let i = 1; i < 14; i++) {
      const cand = new Date(today);
      cand.setDate(today.getDate() + i);
      const dow = WEEKDAYS[cand.getDay()];
      if ((slotsByWeekday[dow] || []).length > 0) {
        setSelectedDate(cand);
        setCursor(new Date(cand.getFullYear(), cand.getMonth(), 1));
        break;
      }
    }
  }, [availability, slotsByWeekday, today, selectedDate]);

  const grid = useMemo(() => {
    const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const jsDow = firstDay.getDay();
    const colIndex = (jsDow + 6) % 7;
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - colIndex);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const weekdayLabel = WEEKDAYS[d.getDay()];
      const inMonth = d.getMonth() === cursor.getMonth();
      const isPast = d < today;
      const hasSlots = !isPast && (slotsByWeekday[weekdayLabel]?.length || 0) > 0;
      cells.push({ date: d, weekdayLabel, inMonth, isPast, hasSlots });
    }
    return cells;
  }, [cursor, slotsByWeekday, today]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  const goPrev = () => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() - 1);
    setCursor(d);
  };
  const goNext = () => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + 1);
    setCursor(d);
  };

  const pickDay = (cell) => {
    if (!cell.hasSlots || disabled) return;
    setSelectedDate(cell.date);
    setSelectedSlots([]);
  };

  const toggleSlot = (slot) => {
    const ordered = [...selectedSlots];
    const idx = ordered.indexOf(slot);
    if (idx !== -1) ordered.splice(idx, 1);
    else ordered.push(slot);
    ordered.sort((a, b) => (parseSlotHours(a)?.[0] ?? 0) - (parseSlotHours(b)?.[0] ?? 0));
    let isContiguous = true;
    for (let i = 1; i < ordered.length; i++) {
      if (parseSlotHours(ordered[i - 1])?.[1] !== parseSlotHours(ordered[i])?.[0]) {
        isContiguous = false;
        break;
      }
    }
    setSelectedSlots(isContiguous ? ordered : [slot]);
  };

  const compositeSlot = useMemo(() => {
    if (selectedSlots.length === 0) return null;
    const first = parseSlotHours(selectedSlots[0]);
    const last = parseSlotHours(selectedSlots[selectedSlots.length - 1]);
    if (!first || !last) return null;
    return `${String(first[0]).padStart(2, '0')}:00-${String(last[1]).padStart(2, '0')}:00`;
  }, [selectedSlots]);

  const handleConfirm = async () => {
    if (!selectedDate || !compositeSlot) return;
    const weekday = WEEKDAYS[selectedDate.getDay()];
    setBusy(true);
    try {
      await onConfirm(weekday, compositeSlot, selectedDate);
      setSelectedSlots([]);
    } finally {
      setBusy(false);
    }
  };

  const isSameDay = (a, b) =>
    a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const hasAnyAvailability = Object.keys(slotsByWeekday).length > 0;
  const daySlots = selectedDate ? slotsByWeekday[WEEKDAYS[selectedDate.getDay()]] || [] : [];

  return (
    <div className="bg-paper border border-sm-border rounded-[14px] p-2.5 grid grid-cols-2 gap-2.5 min-w-0" data-testid="calendar-booking">
      {/* LEFT — month grid */}
      <div className="min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <button
            onClick={goPrev}
            className="p-1 rounded-full hover:bg-cream-soft transition-colors"
            data-testid="cal-prev"
            aria-label="previous month"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="flex items-center gap-1 text-[11px] font-bold text-ink capitalize">
            <CalendarIcon size={11} className="text-teal" />
            {monthLabel}
          </span>
          <button
            onClick={goNext}
            className="p-1 rounded-full hover:bg-cream-soft transition-colors"
            data-testid="cal-next"
            aria-label="next month"
          >
            <ChevronRight size={13} />
          </button>
        </div>

        {!hasAnyAvailability ? (
          <p className="text-center text-ink-muted text-[10px] py-4">{t('booking_no_avail')}</p>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-0.5 mb-0.5">
              {ORDERED_WEEKDAYS.map((w) => (
                <div key={w} className="text-[9px] font-semibold text-ink-muted text-center uppercase">
                  {w[0]}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((cell, i) => {
                const selected = isSameDay(cell.date, selectedDate);
                const isToday = isSameDay(cell.date, today);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickDay(cell)}
                    disabled={!cell.hasSlots || disabled}
                    className={`relative h-7 rounded-md text-[10px] transition-colors
                      ${!cell.inMonth ? 'text-ink-faint/60 opacity-40' : 'text-ink'}
                      ${cell.isPast ? 'cursor-default opacity-40' : ''}
                      ${selected ? 'bg-teal text-paper font-bold shadow-sm'
                        : cell.hasSlots ? 'hover:bg-teal/10 cursor-pointer'
                        : cell.inMonth && !cell.isPast ? 'bg-red-100 text-red-400 cursor-not-allowed'
                        : 'cursor-default'}
                      ${isToday && !selected ? 'ring-1 ring-teal' : ''}
                    `}
                    data-testid={`cal-day-${cell.date.toISOString().slice(0, 10)}`}
                    data-has-slots={cell.hasSlots ? 'true' : 'false'}
                  >
                    {cell.date.getDate()}
                    {cell.hasSlots && !selected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-teal rounded-full" />
                    )}
                    {!cell.hasSlots && cell.inMonth && !cell.isPast && (
                      <span className="absolute inset-0 flex items-end justify-end pr-0.5 pb-0.5 text-[7px] text-red-300 leading-none">✕</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* RIGHT — slot picker */}
      <div className="min-w-0 border-l border-sm-border pl-2.5 flex flex-col">
        {!selectedDate ? (
          <div className="flex-1 flex items-center justify-center py-4">
            <p className="text-ink-muted text-[10px] text-center">{t('booking_pick_date')}</p>
          </div>
        ) : daySlots.length === 0 ? (
          <p className="text-center text-ink-muted text-[10px] py-4">{t('booking_no_slots')}</p>
        ) : (
          <>
            <p className="text-[10px] text-ink-soft font-semibold mb-1 truncate" data-testid="booking-day-label">
              {selectedDate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            {compositeSlot && (
              <div
                className="text-[10px] font-bold text-teal bg-teal/10 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 mb-1 self-start"
                data-testid="booking-selected-range"
              >
                {compositeSlot} · {selectedSlots.length}h
              </div>
            )}
            <div className="flex-1 overflow-y-auto pr-0.5 space-y-1 mb-1.5 max-h-44">
              {daySlots.map((s) => {
                const isSel = selectedSlots.includes(s);
                const dateKey = selectedDate
                  ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
                  : '';
                const isBooked = bookedMap[`${dateKey}|${s}`];
                if (isBooked) {
                  return (
                    <div
                      key={s}
                      className="w-full flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[10px] bg-red-warn/15 text-red-warn font-semibold line-through cursor-not-allowed"
                      data-testid={`cal-slot-${s}`}
                      data-booked="true"
                      title={t('booking_booked_short') || 'Booked'}
                    >
                      <Clock size={9} /> {s} ✕
                    </div>
                  );
                }
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => !readOnly && toggleSlot(s)}
                    disabled={readOnly}
                    className={`w-full flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[10px] border transition-colors
                      ${isSel
                        ? 'border-teal bg-teal text-paper font-semibold'
                        : 'border-sm-border bg-paper text-ink hover:bg-cream-soft'}
                      ${readOnly ? 'cursor-default opacity-90' : ''}`}
                    data-testid={`cal-slot-${s}`}
                    data-selected={isSel ? 'true' : 'false'}
                  >
                    <Clock size={9} /> {s}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleConfirm}
              disabled={!compositeSlot || busy || disabled || readOnly}
              className={`btn-primary w-full text-[10px] py-1.5 ${readOnly ? 'hidden' : ''}`}
              data-testid="confirm-booking-btn"
            >
              {busy ? <Loader2 size={10} className="animate-spin" /> : null}
              {busy ? t('booking_confirming') : t('booking_confirm')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
