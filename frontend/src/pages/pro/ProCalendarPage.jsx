import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import DatedAvailabilityMatrix, { startOfWeek } from '../../components/DatedAvailabilityMatrix';
import {
  Calendar, ChevronLeft, ChevronRight, Clock, Briefcase, User,
  XCircle, Loader2, CalendarDays, List, MessageSquare,
  GripVertical, ArrowRight, CalendarCheck,
} from 'lucide-react';

/* ─── constants ─────────────────────────────────────────────────────────── */
const WEEKDAYS_JS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// 1-hour slots from 08:00 to 20:00 — 12 slots (matches the availability editor)
const SLOTS = [
  '08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00',
  '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00',
  '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00',
];

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function sameDay(a, b) { return a && b && isoDate(a) === isoDate(b); }
function dowLabel(d) { return WEEKDAYS_JS[d.getDay()]; }

/**
 * Status-based color mapping:
 *   Blue    = Quoted       (booking exists, job still open)
 *   Yellow  = Booked       (job in_progress, booking date is in the future)
 *   Orange  = In Progress  (job in_progress, booking date is today or past)
 *   Green   = Completed    (job completed)
 *   Red     = Cancelled
 */
function getBookingStyle(booking, today) {
  if (booking.status === 'cancelled') {
    return 'bg-red-400/15 border-red-400/40 text-red-600 line-through opacity-60';
  }
  if (booking.reschedule_status === 'pending') {
    return 'bg-purple-400/15 border-purple-400/50 text-purple-700 border-dashed';
  }
  switch (booking.job_status) {
    case 'completed':
      return 'bg-green-pos/15 border-green-pos/40 text-green-700';
    case 'in_progress': {
      const bookingDate = booking.date ? new Date(booking.date + 'T00:00:00') : null;
      const isPastOrToday = bookingDate && bookingDate <= today;
      return isPastOrToday
        ? 'bg-amber-500/15 border-amber-500/40 text-amber-700'   // Orange = In Progress
        : 'bg-yellow-400/15 border-yellow-500/40 text-yellow-700'; // Yellow = Booked (future)
    }
    case 'open':
    default:
      return 'bg-blue-400/15 border-blue-400/40 text-blue-700'; // Blue = Quoted
  }
}

function getDotColor(booking, today) {
  if (booking.status === 'cancelled') return 'bg-red-500';
  if (booking.reschedule_status === 'pending') return 'bg-purple-500 animate-pulse';
  switch (booking.job_status) {
    case 'completed':   return 'bg-green-pos';
    case 'in_progress': {
      const bd = booking.date ? new Date(booking.date + 'T00:00:00') : null;
      return (bd && bd <= today) ? 'bg-amber-500' : 'bg-yellow-500';
    }
    default:            return 'bg-blue-500';
  }
}

const COFFEE_IMG = 'https://images.unsplash.com/photo-1518057111178-44a106bad636?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwxfHxyZWxheGluZyUyMGNvZmZlZSUyMG1vcm5pbmd8ZW58MHx8fHwxNzgxMTE4ODUxfDA&ixlib=rb-4.1.0&q=85';

function relativeDayLabel(d, today) {
  const diff = Math.round((d - today) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return `In ${diff} days`;
  if (diff < 14) return 'Next week';
  return null;
}

function buildGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const colIndex = (firstDay.getDay() + 6) % 7; // Mon=0 offset
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - colIndex);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/* ─── BookingPill (draggable) ─────────────────────────────────────────────── */
function BookingPill({ booking, onClick, onDragStart, today }) {
  const style = getBookingStyle(booking, today);
  const dot   = getDotColor(booking, today);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={booking.status !== 'cancelled'}
      onDragStart={booking.status !== 'cancelled' ? onDragStart : undefined}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick(e)}
      className={`w-full text-left text-[9px] font-semibold px-1.5 py-0.5 rounded border truncate cursor-grab active:cursor-grabbing flex items-center gap-1 ${style}`}
      title={`${booking.job_title || 'Job'} · ${booking.slot}${booking.reschedule_status === 'pending' ? ' (reschedule pending)' : ''}`}
      data-testid={`booking-pill-${booking.id}`}
    >
      <GripVertical size={7} className="flex-shrink-0 opacity-40" />
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {booking.slot?.split('-')[0]} {booking.homeowner_name?.split(' ')[0] || ''}
    </div>
  );
}

/* ─── DayCell (drop target) ───────────────────────────────────────────────── */
function DayCell({ date, today, cursorMonth, bookings, availability, selected, onClick, onDrop }) {
  const [dragOver, setDragOver] = useState(false);
  const inMonth   = date.getMonth() === cursorMonth;
  const isPast    = date < today;
  const isToday   = sameDay(date, today);
  const isSel     = sameDay(date, selected);
  const dow       = dowLabel(date);
  const hasAvail  = availability.some(a => a.day === dow && a.is_available);
  const dayBookings = bookings.filter(b => b.date === isoDate(date) && b.status !== 'cancelled');

  return (
    <div
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(date); }}
      className={`relative min-h-[44px] md:min-h-[64px] p-0.5 md:p-1 rounded-[8px] md:rounded-[10px] text-left border transition-all cursor-pointer
        ${!inMonth ? 'opacity-30' : ''}
        ${isPast ? 'opacity-50' : ''}
        ${dragOver ? 'border-teal bg-teal/10 scale-[1.02]' : ''}
        ${isSel
          ? 'border-teal bg-teal/10 shadow-sm'
          : isToday
          ? 'border-teal/40 bg-teal/5'
          : hasAvail
          ? 'border-sm-border hover:border-teal/40 hover:bg-cream-soft'
          : 'border-sm-border/50 bg-cream-soft/30 hover:bg-cream-soft'
        }
      `}
      data-testid={`pro-cal-day-${isoDate(date)}`}
    >
      <span className={`text-[11px] font-bold block mb-0.5
        ${isToday ? 'text-teal' : isSel ? 'text-teal' : 'text-ink'}`}
      >
        {date.getDate()}
      </span>
      <div className="space-y-0.5">
        {dayBookings.slice(0, 2).map((b, idx) => (
          <div key={b.id} className={idx === 1 ? 'hidden md:block' : ''}>
            <BookingPill
              booking={b}
              today={today}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData('bookingId', b.id);
              }}
              onClick={(e) => { e.stopPropagation(); onClick(); }}
            />
          </div>
        ))}
        {dayBookings.length > 1 && (
          <span className="text-[8px] text-ink-muted pl-1 md:hidden">+{dayBookings.length - 1}</span>
        )}
        {dayBookings.length > 2 && (
          <span className="text-[8px] text-ink-muted pl-1 hidden md:block">+{dayBookings.length - 2} more</span>
        )}
      </div>
    </div>
  );
}

/* ─── AgendaRow (compact booking row used in the 7-day schedule) ──────────── */
function AgendaRow({ b, today, onCancel, navigate }) {
  const style = getBookingStyle(b, today);
  return (
    <div className={`flex items-center gap-2 p-2 rounded-[10px] border mb-1 ${style}`} data-testid={`pro-cal-agenda-booking-${b.id}`}>
      <span className="flex items-center gap-1 text-[11px] font-semibold flex-shrink-0">
        <Clock size={10} /> {b.slot}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink truncate">{b.job_title || 'Appointment'}</p>
        {(b.homeowner_name || b.reschedule_status === 'pending') && (
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            {b.homeowner_name && (
              <span className="flex items-center gap-0.5 text-[10px] text-ink-muted"><User size={9} />{b.homeowner_name}</span>
            )}
            {b.reschedule_status === 'pending' && (
              <span className="text-[8px] bg-purple-100 text-purple-600 px-1 py-0.5 rounded-full border border-purple-200">reschedule</span>
            )}
          </div>
        )}
      </div>
      <button onClick={() => navigate('/messages')} className="flex-shrink-0 p-1 text-ink-muted hover:text-teal transition-colors" title="Message">
        <MessageSquare size={13} />
      </button>
      {b.status !== 'cancelled' && (
        <button onClick={() => onCancel(b.id)} className="flex-shrink-0 p-1 text-ink-muted hover:text-red-500 transition-colors" title="Cancel" data-testid={`agenda-cancel-${b.id}`}>
          <XCircle size={13} />
        </button>
      )}
    </div>
  );
}

/* ─── WeekAgenda (weekly schedule — day-strip + selected day, mirrors Availability) ── */
function WeekAgenda({ selected, onSelectDay, today, bookings, onCancel, navigate, t }) {
  const weekStart = useMemo(() => startOfWeek(selected), [selected]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
  }), [weekStart]);
  const rangeLabel = `${weekDays[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  const selIso = isoDate(selected);
  const selBookings = bookings
    .filter(b => b.date === selIso && b.status !== 'cancelled')
    .sort((a, b) => ((a.slot || '') > (b.slot || '') ? 1 : -1));
  const weekHasAny = bookings.some(b => b.status !== 'cancelled' && weekDays.some(d => isoDate(d) === b.date));
  const shiftWeek = (delta) => { const d = new Date(selected); d.setDate(d.getDate() + delta * 7); onSelectDay(d); };

  return (
    <div className="card-lg" data-testid="pro-cal-week-agenda">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-headings font-bold text-ink text-sm flex items-center gap-2">
          <CalendarDays size={16} className="text-teal" /> {t('cal_schedule')}
        </h3>
        {!sameDay(selected, today) && (
          <button onClick={() => onSelectDay(today)} className="text-[11px] text-teal font-semibold hover:underline" data-testid="pro-cal-agenda-today">
            {t('cal_today')}
          </button>
        )}
      </div>

      {/* week nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => shiftWeek(-1)} className="p-1.5 rounded-full hover:bg-cream-soft text-ink-muted transition-colors" data-testid="pro-cal-agenda-prev-week"><ChevronLeft size={16} /></button>
        <span className="text-sm font-bold text-ink">{rangeLabel}</span>
        <button onClick={() => shiftWeek(1)} className="p-1.5 rounded-full hover:bg-cream-soft text-ink-muted transition-colors" data-testid="pro-cal-agenda-next-week"><ChevronRight size={16} /></button>
      </div>

      {/* day strip — same pattern as the availability picker */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {weekDays.map((d, i) => {
          const iso = isoDate(d);
          const isSel = iso === selIso;
          const isToday = sameDay(d, today);
          const cnt = bookings.filter(b => b.date === iso && b.status !== 'cancelled').length;
          return (
            <button
              key={iso}
              onClick={() => onSelectDay(d)}
              className={`relative flex flex-col items-center py-1.5 rounded-[10px] border transition-colors
                ${isSel ? 'border-teal bg-teal/10' : 'border-sm-border hover:border-teal/40'}`}
              data-testid={`pro-cal-agenda-mday-${iso}`}
            >
              <span className={`text-[9px] uppercase font-bold ${isToday || isSel ? 'text-teal' : 'text-ink-muted'}`}>{WEEKDAYS_MON[i]}</span>
              <span className={`text-sm font-bold leading-none mt-0.5 ${isToday || isSel ? 'text-teal' : 'text-ink'}`}>{d.getDate()}</span>
              {cnt > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-teal" title={`${cnt}`}></span>}
            </button>
          );
        })}
      </div>

      {/* selected day's appointments */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-ink">
          {selected.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        {sameDay(selected, today) && (
          <span className="text-[8px] uppercase font-bold bg-teal/10 text-teal px-1.5 py-0.5 rounded-full">{t('cal_today')}</span>
        )}
        {selBookings.length > 0 && <span className="ml-auto text-[10px] font-semibold text-ink-muted">{selBookings.length}</span>}
      </div>

      {selBookings.length > 0 ? (
        <div className="space-y-1" data-testid="pro-cal-agenda-day-bookings">
          {selBookings.map(b => <AgendaRow key={b.id} b={b} today={today} onCancel={onCancel} navigate={navigate} />)}
        </div>
      ) : weekHasAny ? (
        <p className="text-xs text-ink-muted text-center py-6" data-testid="pro-cal-agenda-day-empty">{t('cal_day_free')}</p>
      ) : (
        <div className="flex flex-col items-center text-center py-6 px-4" data-testid="pro-cal-agenda-empty">
          <img src={COFFEE_IMG} alt="" className="w-16 h-16 rounded-full object-cover mb-3 opacity-90 shadow-sm" loading="lazy" />
          <p className="font-headings font-bold text-ink text-sm">{t('cal_clear_title')}</p>
          <p className="text-xs text-ink-muted mt-1 max-w-xs">{t('cal_clear_sub')}</p>
        </div>
      )}
    </div>
  );
}

/* ─── UpNextWidget (jump-to-next-booking shortcut) ────────────────────────── */
function UpNextWidget({ booking, today, onJump }) {
  if (!booking) {
    return (
      <div className="rounded-[16px] bg-teal text-paper p-5" data-testid="pro-cal-upnext">
        <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-paper/70 mb-1.5">Up next</p>
        <p className="font-headings font-bold text-base leading-snug">You're all caught up</p>
        <p className="text-xs text-paper/80 mt-1">No upcoming appointments — enjoy the calm.</p>
      </div>
    );
  }
  const d = new Date(booking.date + 'T00:00:00');
  const dateLabel = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const rel = relativeDayLabel(d, today);
  return (
    <div className="rounded-[16px] bg-teal text-paper p-5 shadow-md" data-testid="pro-cal-upnext">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-paper/70">Up next</p>
        {rel && <span className="text-[10px] font-semibold bg-paper/15 px-2 py-0.5 rounded-full">{rel}</span>}
      </div>
      <p className="font-headings font-bold text-base leading-snug truncate" data-testid="pro-cal-upnext-title">
        {booking.job_title || 'Appointment'}
      </p>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-paper/85 flex-wrap">
        <span className="flex items-center gap-1"><CalendarCheck size={11} />{dateLabel}</span>
        <span className="flex items-center gap-1"><Clock size={11} />{booking.slot}</span>
      </div>
      {booking.homeowner_name && (
        <div className="flex items-center gap-1 mt-0.5 text-xs text-paper/85">
          <User size={11} />{booking.homeowner_name}
        </div>
      )}
      <button
        onClick={() => onJump(booking)}
        className="mt-3 w-full bg-paper text-teal text-xs font-semibold rounded-full py-2 hover:bg-cream-soft transition-colors flex items-center justify-center gap-1.5"
        data-testid="jump-next-booking-btn"
      >
        Jump to date <ArrowRight size={13} />
      </button>
    </div>
  );
}

/* ─── main page ─────────────────────────────────────────────────────────── */
export default function ProCalendarPage() {
  const { t } = useLang();
  const navigate = useNavigate();

  const [view, setView]     = useState('month');
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d;
  });

  const [bookings, setBookings]     = useState([]);
  const [availability, setAvail]    = useState([]);
  const [activeJobs, setActiveJobs] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [proId, setProId]           = useState(null);

  // Reschedule drag-and-drop state
  const [draggedBookingId, setDraggedBookingId] = useState(null);
  const [toast, setToast] = useState('');

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  /* ── fetch all data ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, profileRes] = await Promise.all([
        api.get('/api/bookings'),
        api.get('/api/profile/pro'),
      ]);
      setBookings(bRes.data.bookings || []);
      // TODO(Phase 2): the "Active jobs" sidebar repoints at the Job spine.
      const pid = profileRes.data?.id;
      setProId(pid);
      if (pid) {
        const aRes = await api.get(`/api/availability/${pid}`);
        setAvail(aRes.data.availability || []);
      }
    } catch {/* noop */} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grid = useMemo(() => buildGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const upcoming = useMemo(() => {
    const limit = new Date(today); limit.setDate(today.getDate() + 6);
    return bookings
      .filter(b => b.status !== 'cancelled' && b.date && b.date >= isoDate(today) && b.date <= isoDate(limit))
      .sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [bookings, today]);

  const nextBooking = useMemo(() => {
    const iso = isoDate(today);
    return bookings
      .filter(b => b.status !== 'cancelled' && b.reschedule_status !== 'pending' && b.date && b.date >= iso)
      .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : (a.slot || '') > (b.slot || '') ? 1 : -1))[0] || null;
  }, [bookings, today]);

  /* ── jump calendar + agenda to a specific booking ── */
  const jumpToBooking = (booking) => {
    if (!booking?.date) return;
    const d = new Date(booking.date + 'T00:00:00');
    setView('month');
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(d);
  };

  /* ── weekly availability (editable — same matrix that used to live in Settings) ── */
  const getActive = (day, slot) => availability.some(a => a.day === day && a.slot === slot && a.is_available);
  const toggleAvail = async (day, slot) => {
    if (!proId) return;
    const newVal = !getActive(day, slot);
    setAvail(prev => {
      const others = prev.filter(a => !(a.day === day && a.slot === slot));
      return [...others, { day, slot, is_available: newVal }];
    });
    try {
      await api.put('/api/availability', { slots: [{ day, slot, is_available: newVal }] });
      showToast(t('cal_avail_saved'));
    } catch {
      showToast(t('cal_avail_save_err'));
      load();
    }
  };

  /* ── cancel booking ── */
  const cancelBooking = async (id) => {
    try {
      await api.patch(`/api/bookings/${id}/cancel`);
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
    } catch {/* noop */}
  };

  /* TODO(Phase 2): drag-to-reschedule proposed a new slot for the homeowner to
     confirm. With no customer account there is no counterparty — Phase 2
     reintroduces this as a direct pro-side move plus a customer notification.
     The drag affordance stays wired so that change is a one-line swap. */
  const handleDrop = () => setDraggedBookingId(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={28} className="animate-spin text-teal" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-24 pt-4 px-4 md:px-6 max-w-6xl mx-auto" data-testid="pro-calendar-page">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-ink text-paper text-xs px-4 py-2.5 rounded-full shadow-lg animate-slide-up" data-testid="cal-toast">
          {toast}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-headings font-bold text-ink text-2xl flex items-center gap-2">
            <Calendar size={22} className="text-teal" /> Pro Calendar
          </h1>
          <p className="text-xs text-ink-muted mt-0.5">Drag bookings to reschedule · Homeowner confirms</p>
        </div>
        <button
          onClick={() => setView(v => v === 'month' ? 'list' : 'month')}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors
            ${view === 'list' ? 'bg-teal text-paper border-teal' : 'border-sm-border text-ink-muted hover:border-teal/50'}`}
          data-testid="pro-cal-view-toggle"
        >
          {view === 'month' ? <List size={12} /> : <CalendarDays size={12} />}
          {view === 'month' ? 'List view' : 'Calendar view'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">

        {/* ── LEFT (calendar + agenda) ── */}
        <div className="lg:col-span-8 space-y-5">
          {/* Up next — shown above the calendar on mobile only */}
          <div className="lg:hidden" data-testid="pro-cal-upnext-mobile">
            <UpNextWidget booking={nextBooking} today={today} onJump={jumpToBooking} />
          </div>
          {view === 'month' ? (
            <div className="card-lg" data-testid="pro-cal-month-view">
              {/* Month nav */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setCursor(c => { const d=new Date(c); d.setMonth(d.getMonth()-1); return d; })}
                  className="p-1.5 rounded-full hover:bg-cream-soft transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <h2 className="font-headings font-bold text-ink capitalize">{monthLabel}</h2>
                <button onClick={() => setCursor(c => { const d=new Date(c); d.setMonth(d.getMonth()+1); return d; })}
                  className="p-1.5 rounded-full hover:bg-cream-soft transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Day header */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS_MON.map(d => (
                  <div key={d} className="text-[10px] font-bold text-ink-muted text-center uppercase">{d}</div>
                ))}
              </div>

              {/* Grid */}
              <div
                className="grid grid-cols-7 gap-1"
                onDragEnd={() => setDraggedBookingId(null)}
              >
                {grid.map((date, i) => (
                  <DayCell
                    key={i}
                    date={date}
                    today={today}
                    cursorMonth={cursor.getMonth()}
                    bookings={bookings}
                    availability={availability}
                    selected={selected}
                    onClick={() => setSelected(date)}
                    onDrop={handleDrop}
                  />
                ))}
              </div>

              {/* Color legend */}
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-sm-border flex-wrap">
                {[
                  { color: 'bg-blue-400',   label: 'Quoted' },
                  { color: 'bg-yellow-500', label: 'Booked' },
                  { color: 'bg-amber-500',  label: 'In Progress' },
                  { color: 'bg-green-pos',  label: 'Completed' },
                  { color: 'bg-red-400',    label: 'Cancelled' },
                  { color: 'bg-purple-500', label: 'Reschedule pending' },
                ].map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1.5 text-[10px] text-ink-muted">
                    <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            /* List view */
            <div className="card-lg" data-testid="pro-cal-list-view">
              <h2 className="font-headings font-bold text-ink mb-3 flex items-center gap-2">
                <List size={14} className="text-teal" /> {t('cal_next_7_days')}
              </h2>
              {upcoming.length === 0 ? (
                <p className="text-ink-muted text-sm text-center py-8">{t('cal_no_upcoming')}</p>
              ) : (
                <div className="space-y-1">
                  {upcoming.map(b => {
                    const d = new Date(b.date + 'T00:00:00');
                    const label = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
                    const style = getBookingStyle(b, today);
                    return (
                      <div key={b.id} className={`flex items-start gap-3 p-3 rounded-[12px] border ${style}`}>
                        <div className="flex-shrink-0 text-center w-10">
                          <p className="text-[10px] font-bold text-teal uppercase">{label.split(' ')[0]}</p>
                          <p className="text-lg font-headings font-bold text-ink leading-tight">{d.getDate()}</p>
                          <p className="text-[9px] text-ink-muted">{d.toLocaleDateString(undefined,{month:'short'})}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-ink truncate">{b.job_title || 'Appointment'}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="flex items-center gap-1 text-xs text-ink-muted"><Clock size={10}/>{b.slot}</span>
                            {b.homeowner_name && <span className="flex items-center gap-1 text-xs text-ink-muted"><User size={10}/>{b.homeowner_name}</span>}
                            {b.job_number && <span className="text-[10px] font-mono text-teal">{b.job_number}</span>}
                            {b.reschedule_status === 'pending' && (
                              <span className="text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full border border-purple-200">Reschedule pending</span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => navigate('/messages')} className="flex-shrink-0 p-1.5 text-ink-muted hover:text-teal transition-colors">
                          <MessageSquare size={14}/>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Weekly schedule — day-strip + selected day (synced with calendar) */}
          {view === 'month' && (
            <WeekAgenda
              selected={selected}
              onSelectDay={setSelected}
              today={today}
              bookings={bookings}
              onCancel={cancelBooking}
              navigate={navigate}
              t={t}
            />
          )}

          {/* Weekly availability — editable control center */}
          <div className="card-lg" data-testid="pro-cal-availability">
            <h3 className="font-headings font-bold text-ink mb-1 flex items-center gap-2">
              <CalendarDays size={16} className="text-teal" /> {t('settings_availability')}
            </h3>
            <p className="text-xs text-ink-muted mb-3">{t('settings_availability_help')}</p>
            <DatedAvailabilityMatrix
              rows={SLOTS}
              days={WEEKDAYS_MON}
              getActive={getActive}
              bookings={bookings}
              editable
              onToggle={toggleAvail}
              focusDate={selected}
              t={t}
              testidPrefix="cal-avail"
            />
          </div>
        </div>

        {/* ── RIGHT sidebar ── */}
        <div className="lg:col-span-4 space-y-5">
          {/* Up next — jump to next booking (sidebar on desktop, moved to top on mobile) */}
          <div className="hidden lg:block">
            <UpNextWidget booking={nextBooking} today={today} onJump={jumpToBooking} />
          </div>

          {/* Active jobs */}
          <div className="card-lg" data-testid="pro-cal-active-jobs">
            <h3 className="font-headings font-bold text-ink text-sm mb-3 flex items-center gap-2">
              <Briefcase size={14} className="text-amber" /> Active Jobs
              <span className="ml-auto text-[10px] font-normal text-ink-muted">{activeJobs.length} jobs</span>
            </h3>
            {activeJobs.length === 0 ? (
              <p className="text-ink-muted text-xs text-center py-4">No active jobs</p>
            ) : (
              <div className="space-y-2">
                {activeJobs.map(job => (
                  <button
                    key={job.id}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    className="w-full text-left p-2.5 rounded-[10px] border border-sm-border hover:border-amber/50 hover:bg-amber/5 transition-all"
                    data-testid={`pro-cal-job-${job.id}`}
                  >
                    <p className="font-semibold text-xs text-ink truncate">{job.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {job.job_number && <span className="text-[9px] font-mono text-amber">{job.job_number}</span>}
                      <span className="text-[9px] text-ink-muted truncate">{job.city}</span>
                      {job.recurring_group_id && (
                        <span className="text-[8px] bg-teal/10 text-teal px-1 rounded border border-teal/20">
                          {job.recurring_type}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
