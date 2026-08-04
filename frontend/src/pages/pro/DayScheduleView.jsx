import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  QUARTER, MIN, TRAVEL_GAP, bookableRuns, hhmm, durationLabel, previewResize,
  resizeAndSettle, snapQuarter, toMs,
} from '../../utils/schedule';
import { TEMPLATES, sendViaPhone, smsSegments, telHref } from '../../utils/sms';
import {
  AlertTriangle, Car, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, FileText,
  Lock, MapPin, Phone, Navigation, Play, Plus, Receipt, User, X,
} from 'lucide-react';

/* 80 px per hour is not a taste call: a one-hour appointment has to hold its
   header and body (96 px together), and a quarter line has to stay far enough
   from its neighbour to read as a separate line. 80 gives a 20 px quarter. */
const PPH = 80;
const PX_PER_MS = PPH / (60 * MIN);
const DAY_FROM = 8;
/* 20:00, not 18:00. Emergency call-outs, a Saturday finish and the summer
   evenings a painter actually works are all past six, and a rail that stops
   at 18 cannot show them at all — the appointment simply has nowhere to sit. */
const DAY_TO = 20;

const startOfDay = (d, hour) => { const x = new Date(d); x.setHours(hour, 0, 0, 0); return x; };
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/* ─────────────────────────────────────────────────────────── the grid */
function Grid({ liveFrom, liveTo }) {
  const rows = [];
  for (let h = DAY_FROM; h <= DAY_TO; h += 0.25) {
    const isHour = Number.isInteger(h);
    const isHalf = Math.abs((h % 1) - 0.5) < 1e-9;
    const top = (h - DAY_FROM) * PPH;
    const live = liveFrom != null && h > liveFrom - 1e-9 && h < liveTo + 1e-9;
    rows.push(
      <div
        key={`l${h}`}
        className="absolute left-0 right-0"
        style={{
          top,
          height: live ? 1.5 : 1,
          background: live ? 'rgba(45,106,127,.45)'
            : isHour ? '#e3d8c0' : isHalf ? '#eee6d5' : '#f6f1e6',
        }}
      />,
    );
    if (isHour) {
      rows.push(
        <span
          key={`h${h}`}
          className="absolute font-bold text-ink-soft text-right"
          style={{ left: -34, top, width: 30, transform: 'translateY(-50%)', fontSize: 10.5 }}
        >
          {String(h).padStart(2, '0')}:00
        </span>,
      );
    }
  }
  return <>{rows}</>;
}

/* What this job's next step is, taken from the same transition table the
   API enforces. A slot that is empty or disabled on most statuses teaches the
   pro to ignore it; this one always carries the move that is actually open. */
function primaryAction(status) {
  if (status === 'scheduled' || status === 'accepted') return 'start';
  if (status === 'in_progress') return 'complete';
  if (status === 'completed') return 'invoice';
  return null;
}

/* ────────────────────────────────────────────── one appointment block */
function Block({ appt, top, height, running, progress, dragging, conflict,
                 onGrab, onPrimary, t }) {
  const room = { body: height >= 96, actions: height >= 150 && !dragging };
  const phone = telHref(appt.customer_phone);
  const action = primaryAction(appt.status);
  return (
    <div
      className="absolute left-0 right-0"
      style={{ top, height: height - 3, zIndex: dragging ? 8 : 2 }}
      data-testid={`day-block-${appt.id}`}
      data-start={new Date(appt.start).toISOString()}
      data-end={new Date(appt.end).toISOString()}
    >
      <div
        className="h-full rounded-[11px] overflow-hidden bg-paper flex flex-col"
        style={{
          border: `1.5px solid ${conflict ? '#c14655' : dragging || running ? '#2d6a7f' : '#f0e3c8'}`,
          boxShadow: dragging ? '0 6px 18px rgba(0,0,0,.16)' : '0 1px 4px rgba(0,0,0,.07)',
        }}
      >
        <div className={`flex items-center gap-2 px-3 flex-none
          ${action && !room.actions ? 'py-1' : 'py-[7px]'}
          ${running ? 'bg-teal text-paper' : 'bg-teal-deep text-paper'}`}>
          <p className="font-extrabold text-[13px]">{hhmm(appt.start)}–{hhmm(appt.end)}</p>
          <p className="font-bold text-[10.5px] opacity-75">
            · {durationLabel(toMs(appt.end) - toMs(appt.start))}
          </p>
          {action && !room.actions ? (
            <button
              type="button"
              onClick={() => onPrimary(appt, action)}
              className={`ml-auto rounded-full px-3 min-h-[36px] flex items-center gap-1.5
                text-[11px] font-extrabold
                ${action === 'invoice' ? 'bg-amber text-on-amber' : 'bg-paper text-teal-deep'}`}
              data-testid={`day-primary-${appt.id}`}
            >
              {action === 'start' && <><Play size={11} /> {t('day_start')}</>}
              {action === 'complete' && <><Check size={12} /> {t('day_complete')}</>}
              {action === 'invoice' && <><Receipt size={12} /> {t('day_invoice')}</>}
            </button>
          ) : running ? (
            <span className="ml-auto bg-black/20 rounded-full px-2 py-[2px] text-[9px] font-extrabold">
              {t('day_running')}
            </span>
          ) : null}
        </div>

        <div className="px-3 pt-2 pb-[7px] flex-1 min-h-0 overflow-hidden">
          <Link to={`/projects/${appt.id}`} className="font-extrabold text-[13.5px] text-ink leading-tight">
            {appt.title}
          </Link>
          {room.body && (
            <>
              {appt.customer_name && (
                <p className="font-semibold text-[11.5px] text-ink-soft mt-1 flex items-center gap-1.5">
                  <User size={12} className="text-ink-muted" /> {appt.customer_name}
                </p>
              )}
              {(appt.site_address || appt.customer_address) && (
                <p className="text-[11.5px] text-ink-muted mt-0.5 flex items-center gap-1.5">
                  <MapPin size={12} />
                  {appt.site_address || appt.customer_address}
                  {appt.site_city || appt.customer_city ? `, ${appt.site_city || appt.customer_city}` : ''}
                </p>
              )}
            </>
          )}
          {running && room.actions && progress != null && (
            <div className="mt-2">
              <div className="flex justify-between items-baseline mb-1">
                <span className="font-bold text-[10.5px] text-ink-soft">
                  {t('day_since')} {durationLabel(progress.elapsed)}
                </span>
                <span className="font-extrabold text-[11px] text-red-warn">
                  {t('day_left')} {durationLabel(progress.remaining)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-cream-deep overflow-hidden">
                <div className="h-full bg-red-warn rounded-full"
                     style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        {room.actions && (
          <div className="flex border-t border-sm-border flex-none">
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(
                [appt.site_address || appt.customer_address, appt.site_city || appt.customer_city]
                  .filter(Boolean).join(', '))}`}
              target="_blank" rel="noreferrer"
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1
                         font-bold text-[10.5px] text-teal"
            >
              <Navigation size={13} /> {t('day_route')}
            </a>
            <a
              href={phone ? `tel:${phone}` : undefined}
              aria-disabled={!phone}
              className={`flex-1 min-h-[44px] flex items-center justify-center gap-1
                font-bold text-[10.5px] border-l border-sm-border
                ${phone ? 'text-teal' : 'text-ink-faint pointer-events-none'}`}
            >
              <Phone size={13} /> {t('day_call')}
            </a>
            <Link
              to={`/projects/${appt.id}`}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1
                         font-bold text-[10.5px] text-teal border-l border-sm-border"
            >
              <FileText size={13} /> {t('day_note')}
            </Link>
            {action && (
              <button
                type="button"
                onClick={() => onPrimary(appt, action)}
                className={`flex-1 min-h-[44px] flex items-center justify-center gap-1
                  font-extrabold text-[10.5px] border-l border-sm-border
                  ${action === 'invoice' ? 'bg-amber text-on-amber' : 'bg-teal text-paper'}`}
                data-testid={`day-primary-${appt.id}`}
              >
                {action === 'start' && <><Play size={12} /> {t('day_start')}</>}
                {action === 'complete' && <><Check size={13} /> {t('day_complete')}</>}
                {action === 'invoice' && <><Receipt size={13} /> {t('day_invoice')}</>}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 22px of ink inside a 44px target. A finger — often a gloved one —
          needs the larger box; the smaller circle is all the design wants. */}
      <button
        type="button"
        onPointerDown={(e) => onGrab(e, appt)}
        className="absolute left-1/2 grid place-items-center touch-none"
        style={{ bottom: -22, transform: 'translateX(-50%)', width: 44, height: 44, zIndex: 7 }}
        aria-label={t('day_extend')}
        data-testid={`day-extend-${appt.id}`}
      >
        {dragging ? (
          <span className="w-[34px] h-[34px] rounded-full bg-teal text-paper flex flex-col
                           items-center justify-center"
                style={{ boxShadow: '0 0 0 3px #fdf3e3, 0 3px 10px rgba(0,0,0,.3)' }}>
            <ChevronUp size={11} /><ChevronDown size={11} />
          </span>
        ) : (
          <span className="w-[22px] h-[22px] rounded-full bg-teal text-paper grid place-items-center"
                style={{ boxShadow: '0 0 0 2.5px #fdf3e3, 0 1px 3px rgba(0,0,0,.25)' }}>
            <Plus size={14} strokeWidth={3} />
          </span>
        )}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ the view */
export default function DayScheduleView({ date, onDateChange, proName }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(null);      // { id, endMs }
  const [pending, setPending] = useState(null); // the confirmation sheet
  const [sms, setSms] = useState(null);         // the message sheet
  const [done, setDone] = useState(null);       // the "make an invoice?" prompt
  const [booking, setBooking] = useState(null); // the new-appointment sheet
  const [hasInvoiceToolkit, setHasInvoiceToolkit] = useState(null);
  const dragRef = useRef(null);
  /* The window listeners are bound once per gesture and would otherwise see
     the appointments and commit function from the render that bound them. */
  const apptsRef = useRef(appts);
  const commitRef = useRef(null);

  const dayStart = useMemo(() => startOfDay(date, DAY_FROM), [date]);
  const dayEnd = useMemo(() => startOfDay(date, DAY_TO), [date]);

  const load = useCallback(() => {
    setLoading(true);
    const iso = new Date(date).toISOString().slice(0, 10);
    api.get('/api/jobs/appointments', { params: { day: iso, days: 1 } })
      .then((r) => setAppts((r.data?.appointments || []).map((a) => ({
        ...a, start: a.scheduled_start, end: a.scheduled_end || a.scheduled_start,
      }))))
      .catch(() => setAppts([]))
      .finally(() => setLoading(false));
  }, [date]);
  useEffect(load, [load]);

  /* Asked once, not per card. Whether the pro owns the invoice toolkit decides
     what the prompt after completing a job can offer, and a card cannot know
     it on its own. `null` means not answered yet — distinct from `false`, so
     the prompt never flashes an upsell at someone who has already paid. */
  useEffect(() => {
    api.get('/api/profile/pro')
      .then((r) => setHasInvoiceToolkit(!!r.data?.has_invoice_toolkit))
      .catch(() => setHasInvoiceToolkit(false));
  }, []);

  /* Start, complete, invoice — the transitions the API allows, in the order a
     job goes through them. Completing opens the invoice prompt; it does not
     create anything, because an invoice is a legal document and issuing one
     as a side effect of tapping "Fertig" is how a wrong figure gets sent. */
  const onPrimary = async (appt, action) => {
    if (action === 'invoice') { navigate(`/jobs/${appt.id}/invoice`); return; }
    const next = action === 'start' ? 'in_progress' : 'completed';
    try {
      await api.patch(`/api/jobs/${appt.id}/status`, { status: next });
      setAppts((prev) => prev.map((a) => (a.id === appt.id ? { ...a, status: next } : a)));
      if (next === 'completed') setDone(appt);
    } catch (err) {
      toast.error(err?.response?.status === 409
        ? t('day_status_refused')
        : t('day_save_failed'));
    }
  };

  const now = Date.now();
  const showNow = sameDay(date, new Date());
  const running = appts.find((a) => a.status === 'in_progress'
    && toMs(a.start) <= now && now < toMs(a.end));

  /* ── drag ─────────────────────────────────────────────────────────
     Pointer events, so one code path covers finger, stylus and mouse. The
     move and up listeners go on the window rather than on the handle or the
     rail: the finger leaves the 44px button within the first few pixels of
     every drag, and a listener bound to the element it left stops firing.
     A ref carries the live value because the listeners are bound once and
     would otherwise close over the first render's state. */
  const onGrab = (e, appt) => {
    e.preventDefault();
    dragRef.current = {
      id: appt.id, startY: e.clientY,
      originalEnd: toMs(appt.end), endMs: toMs(appt.end),
      floor: toMs(appt.start) + QUARTER,
    };
    setDrag({ id: appt.id, endMs: toMs(appt.end) });
  };

  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const raw = d.originalEnd + (e.clientY - d.startY) / PX_PER_MS;
      const endMs = Math.max(snapQuarter(raw), d.floor);
      d.endMs = endMs;
      setDrag({ id: d.id, endMs });
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || d.endMs === d.originalEnd) return;        // a tap, not a drag
      const preview = previewResize(apptsRef.current, d.id, d.endMs, { dayEnd });
      if (!preview.moved.length) { commitRef.current(d.id, d.endMs, []); return; }
      setPending({ id: d.id, endMs: d.endMs, ...preview });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag?.id, dayEnd]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* ── persist ── every appointment the settle touched, target included */
  const commit = async (id, endMs, moved) => {
    const settled = resizeAndSettle(appts, id, endMs, { dayEnd });
    const writes = settled.appointments.filter(
      (a) => a.id === id || moved.some((m) => m.id === a.id));
    setAppts(settled.appointments);                        // optimistic
    try {
      await Promise.all(writes.map((a) => api.patch(`/api/jobs/${a.id}/schedule`, {
        scheduled_start: new Date(a.start).toISOString(),
        scheduled_end: new Date(a.end).toISOString(),
      })));
    } catch {
      toast.error(t('day_save_failed'));
      load();                                              // put the truth back
    }
  };

  const confirmMove = async (withSms) => {
    const p = pending;
    setPending(null);
    if (!p) return;
    await commit(p.id, p.endMs, p.moved);
    if (!withSms) return;
    const first = p.moved[0];
    const appt = appts.find((a) => a.id === first.id);
    if (!appt) return;
    setSms({
      appt,
      template: 'delay',
      newStart: new Date(first.to.start),
      delayMinutes: Math.round((first.to.start - first.from.start) / MIN),
    });
  };

  /* Booked straight into the calendar, so it is created `scheduled` rather
     than as a lead. The transition table has no lead → scheduled edge, so a
     job created as a lead here could not be corrected without two more hops
     through statuses that never happened. */
  const createAppointment = async ({ title, customerId, start, end }) => {
    try {
      await api.post('/api/jobs', {
        title,
        customer_id: customerId || undefined,
        status: 'scheduled',
        scheduled_start: new Date(start).toISOString(),
        scheduled_end: new Date(end).toISOString(),
      });
      setBooking(null);
      load();
      toast.success(t('day_appt_created'));
    } catch (err) {
      toast.error(err?.response?.data?.detail
        ? String(err.response.data.detail)
        : t('day_save_failed'));
    }
  };

  const smsBody = useMemo(() => {
    if (!sms) return '';
    return TEMPLATES[sms.template].build({
      customer: sms.appt.customer_name || '',
      newStart: hhmm(sms.newStart),
      newDate: new Date(sms.newStart).toLocaleDateString('de-AT',
        { weekday: 'long', day: 'numeric', month: 'long' }),
      delayMinutes: sms.delayMinutes,
      proName: proName || '',
    });
  }, [sms, proName]);

  useEffect(() => { apptsRef.current = appts; }, [appts]);
  useEffect(() => { commitRef.current = commit; });

  /* Not the empty time — the bookable time. The drive out of the job before
     and into the job after both come out of the hole, and a run that no longer
     holds half an hour once they have is not offered at all. */
  const runs = useMemo(() => bookableRuns(appts, dayStart, dayEnd), [appts, dayStart, dayEnd]);
  const topOf = (v) => (toMs(v) - toMs(dayStart)) * PX_PER_MS;

  if (loading) {
    return <div className="card-lg py-10 text-center text-sm text-ink-muted"
                data-testid="day-loading">…</div>;
  }

  return (
    <>
      <div className="card-lg p-0 pt-3 pr-3 pb-7 relative" data-testid="day-rail">
        <div
          className="relative"
          style={{ marginLeft: 40, height: (DAY_TO - DAY_FROM) * PPH,
                   touchAction: drag ? 'none' : 'auto' }}
        >
          {/* free quarters — the empty time is a target, not background */}
          {!drag && runs.map((r) => {
            const span = toMs(r.end) - toMs(r.start);
            const height = span * PX_PER_MS - 2;
            /* No clearance arithmetic any more. The run already begins 15 min
               after the job above ends, and the extend handle's circle reaches
               only 11 px below its card — the drive is wider than the handle,
               so the two cannot meet. */
            return (
              <button
                key={+r.start}
                type="button"
                className="absolute left-0 right-0 rounded-[10px] flex flex-col items-center
                           justify-center gap-1 border-[1.5px] border-dashed
                           border-teal/40 bg-teal/[0.09] overflow-hidden"
                style={{ top: topOf(r.start), height, zIndex: 1 }}
                onClick={() => setBooking({ run: r })}
                data-testid={`day-free-${hhmm(r.start)}`}
                aria-label={`${t('day_new_appt')} ${hhmm(r.start)} – ${hhmm(r.end)}`}
              >
                <span className="rounded-full bg-paper border-[1.5px] border-teal text-teal
                                 grid place-items-center leading-none"
                      style={{ width: height >= 62 ? 30 : 22, height: height >= 62 ? 30 : 22 }}>
                  <Plus size={height >= 62 ? 17 : 13} strokeWidth={2.4} />
                </span>
                {/* The span is what the empty time is actually worth. It goes
                    only when there is no room for it, never truncated. */}
                {height >= 62 && (
                  <span className="font-bold text-[10px] text-ink-muted">
                    {hhmm(r.start)}–{hhmm(r.end)} · {durationLabel(span)}
                  </span>
                )}
              </button>
            );
          })}

          <Grid
            liveFrom={drag ? DAY_FROM + (toMs(appts.find((a) => a.id === drag.id).start) - toMs(dayStart)) / (60 * MIN) : null}
            liveTo={drag ? DAY_FROM + (drag.endMs - toMs(dayStart)) / (60 * MIN) + 2 : null}
          />

          {showNow && now >= toMs(dayStart) && now <= toMs(dayEnd) && (
            <>
              <span className="absolute bg-red-warn text-paper rounded-full px-1.5 py-[2px]
                               font-extrabold text-[9px]"
                    style={{ left: -40, top: topOf(now), transform: 'translateY(-50%)', zIndex: 6 }}
                    data-testid="day-now">
                {hhmm(now)}
              </span>
              <div className="absolute bg-red-warn"
                   style={{ left: -8, width: 8, top: topOf(now), height: 2, zIndex: 5 }} />
            </>
          )}

          {appts.map((a) => {
            const isDragging = drag?.id === a.id;
            const end = isDragging ? drag.endMs : toMs(a.end);
            const clash = appts.some(
              (o) => o.id !== a.id && toMs(a.start) < toMs(o.end) && toMs(o.start) < end);
            return (
              <Block
                key={a.id}
                appt={isDragging ? { ...a, end: new Date(end) } : a}
                top={topOf(a.start)}
                height={(end - toMs(a.start)) * PX_PER_MS}
                running={running?.id === a.id}
                progress={running?.id === a.id ? {
                  elapsed: now - toMs(a.start),
                  remaining: toMs(a.end) - now,
                  fraction: (now - toMs(a.start)) / (toMs(a.end) - toMs(a.start)),
                } : null}
                dragging={isDragging}
                conflict={isDragging && clash}
                onGrab={onGrab}
                onPrimary={onPrimary}
                t={t}
              />
            );
          })}

          {/* the live readout lives in the rail, not in the card: a child
              cannot rise above a sibling out of its parent's stacking context */}
          {drag && (
            <div className="absolute left-0 flex items-center gap-1.5"
                 style={{ top: topOf(drag.endMs) + 7, zIndex: 12 }}
                 data-testid="day-readout">
              <span className="bg-ink text-paper rounded-lg px-2.5 py-1 font-extrabold text-[12px]"
                    style={{ boxShadow: '0 3px 10px rgba(0,0,0,.35)' }}>
                {t('day_until')} {hhmm(drag.endMs)}
              </span>
              <span className="bg-teal text-paper rounded-full px-2 py-[3px] font-extrabold text-[10px]">
                {drag.endMs >= toMs(appts.find((a) => a.id === drag.id).end) ? '+' : '−'}
                {Math.abs(Math.round((drag.endMs - toMs(appts.find((a) => a.id === drag.id).end)) / MIN))} min
              </span>
            </div>
          )}
        </div>
      </div>

      {pending && (
        <ConflictSheet
          pending={pending}
          appts={appts}
          onCancel={() => setPending(null)}
          onConfirm={confirmMove}
          t={t}
        />
      )}
      {booking && (
        <NewAppointmentSheet
          run={booking.run}
          onCreate={createAppointment}
          onClose={() => setBooking(null)}
          t={t}
        />
      )}
      {done && (
        <CompletedSheet
          appt={done}
          hasToolkit={hasInvoiceToolkit}
          onInvoice={() => { const id = done.id; setDone(null); navigate(`/jobs/${id}/invoice`); }}
          onUnlock={() => { setDone(null); navigate('/billing'); }}
          onClose={() => setDone(null)}
          t={t}
        />
      )}
      {sms && (
        <SmsSheet
          sms={sms}
          body={smsBody}
          onTemplate={(k) => setSms((s) => ({ ...s, template: k }))}
          onClose={() => setSms(null)}
          t={t}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────── the conflict sheet */
function ConflictSheet({ pending, appts, onCancel, onConfirm, t }) {
  const [withSms, setWithSms] = useState(true);
  const first = pending.moved[0];
  const affected = appts.find((a) => a.id === first.id);
  const hasPhone = !!telHref(affected?.customer_phone);
  return (
    <div className="fixed inset-0 z-[210] bg-black/40 flex items-end" onClick={onCancel}
         data-testid="day-conflict-sheet">
      <div className="w-full bg-paper rounded-t-[20px] p-5 shadow-2xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2.5 mb-3">
          <AlertTriangle size={20} className="text-red-warn flex-none mt-0.5" />
          <div className="flex-1">
            <p className="font-headings font-bold text-[15px] text-ink">
              {t('day_conflict_title')}
            </p>
            <p className="text-[12px] text-ink-soft mt-1 leading-relaxed">
              {pending.moved.length === 1
                ? `${affected?.title} bei ${affected?.customer_name || '—'} wird verschoben.`
                : `${pending.moved.length} Termine werden verschoben.`}
              {' '}Zwischen den Terminen bleiben {durationLabel(TRAVEL_GAP)} für die Fahrt.
            </p>
          </div>
        </div>

        <div className="bg-cream-soft rounded-[12px] p-3 mb-3" data-testid="day-conflict-times">
          {pending.moved.map((m) => {
            const a = appts.find((x) => x.id === m.id);
            return (
              <div key={m.id} className="mb-1.5 last:mb-0">
                <p className="font-bold text-[11.5px] text-ink">{a?.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-bold text-[11px] text-ink-muted w-14">
                    {t('day_before')}
                  </span>
                  <span className="font-bold text-[12px] text-ink line-through decoration-ink-faint">
                    {hhmm(m.from.start)} – {hhmm(m.from.end)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-bold text-[11px] text-ink-muted w-14">
                    {t('day_after')}
                  </span>
                  <span className="font-extrabold text-[12px] text-teal">
                    {hhmm(m.to.start)} – {hhmm(m.to.end)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {pending.blocked.length > 0 && (
          <p className="text-[11.5px] text-red-warn mb-3 flex items-center gap-1.5">
            <AlertTriangle size={13} />
            {t('day_past_end')}
          </p>
        )}

        <button
          type="button"
          onClick={() => hasPhone && setWithSms((v) => !v)}
          disabled={!hasPhone}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[12px] mb-2.5 text-left
            ${hasPhone ? 'border-[1.5px] border-teal bg-teal/5' : 'border border-sm-border bg-cream-soft'}`}
          data-testid="day-sms-toggle"
        >
          <span className={`w-[19px] h-[19px] rounded-[5px] grid place-items-center flex-none
            ${withSms && hasPhone ? 'bg-teal text-paper' : 'border border-sm-border bg-paper'}`}>
            {withSms && hasPhone ? '✓' : ''}
          </span>
          <span className="font-bold text-[11.5px] text-ink flex-1">
            {hasPhone
              ? `${affected?.customer_name || t('day_customer')} ${t('day_notify')}`
              : t('day_no_phone')}
          </span>
          {hasPhone && (
            <span className="text-[10px] text-ink-muted">{affected.customer_phone}</span>
          )}
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm(withSms && hasPhone)}
            className="flex-1 min-h-[46px] rounded-[12px] bg-teal text-paper font-extrabold text-[12.5px]"
            data-testid="day-confirm-move"
          >
            {withSms && hasPhone
              ? t('day_move_and_sms')
              : t('day_move')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="min-h-[46px] px-4 rounded-[12px] border border-sm-border bg-paper
                       text-ink-soft font-bold text-[12px] whitespace-nowrap"
            data-testid="day-allow-overlap"
          >
            {t('day_allow_overlap')}
          </button>
        </div>
        <button type="button" onClick={onCancel}
                className="w-full text-center font-semibold text-[11px] text-ink-muted mt-3 py-2">
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────── the slot as a timeline
   The free window drawn end to end, with a quarter-hour tick for every step
   the duration can take. The teal fill is the appointment: it grows with the
   chips below, and it can be dragged, so the length can be set either by
   naming it or by showing it.

   The band draws the *slot*, not the day. Its left edge is the earliest the
   appointment can start and its right edge the latest it can end, both of
   which already have the drive taken out of them by `bookableRuns` — so a
   full band is a full day's-worth of bookable time and never an overlap. */
const MIN_MINUTES = 30;   /* MIN_SLOT, in the unit this sheet counts in */

function SlotBand({ run, minutes, maxMinutes, onChange, t }) {
  const trackRef = useRef(null);
  const quarters = Math.round(maxMinutes / 15);
  /* A tick every 15 min stops being a line and becomes texture once the ticks
     are a few pixels apart. The track is about 350 px inside the sheet, so
     past 24 quarters (6 h) only the hour ticks are drawn. */
  const everyQuarter = quarters <= 24;

  const clamp = (m) => Math.min(maxMinutes, Math.max(MIN_MINUTES, m));

  const setFromX = (clientX) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onChange(clamp(Math.round((frac * maxMinutes) / 15) * 15));
  };

  /* Window listeners rather than setPointerCapture: capture would route the
     moves to whichever element took it, and the finger leaves the track long
     before the drag is over. */
  const onPointerDown = (e) => {
    e.preventDefault();
    setFromX(e.clientX);
    const move = (ev) => setFromX(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onKeyDown = (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 15
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -15 : 0;
    if (!d) return;
    e.preventDefault();
    onChange(clamp(minutes + d));
  };

  const end = new Date(toMs(run.start) + minutes * MIN);
  const frac = minutes / maxMinutes;
  const rest = maxMinutes - minutes;

  /* Axis labels sit on the hour ticks, at the fraction of the track where
     that hour really falls. A single label centred in the row would name a
     time (17:38 in a 15:15–20:00 slot) and then point at the wrong place —
     worse than no label. Long slots thin the labels out rather than
     overlapping them — the tightest these steps allow on a 324 px track is
     six labels about 65 px apart, which a 10 px time clears easily. */
  const hours = maxMinutes / 60;
  const hourStep = hours <= 5 ? 1 : hours <= 10 ? 2 : 3;
  const axis = [];
  for (let i = 4 * hourStep; i < quarters; i += 4 * hourStep) {
    const f = i / quarters;
    if (f > 0.88) break;                    // too close to the end label
    axis.push({ f, at: new Date(toMs(run.start) + i * 15 * MIN) });
  }

  const ticks = [];
  for (let i = 1; i < quarters; i += 1) {
    const hour = i % 4 === 0;
    if (!everyQuarter && !hour) continue;
    ticks.push(
      <span
        key={i}
        className={`absolute top-0 bottom-0 w-px ${hour ? 'bg-teal/30' : 'bg-teal/[0.16]'}`}
        style={{ left: `${(i / quarters) * 100}%` }}
      />,
    );
  }

  return (
    <div className="rounded-[14px] border border-sm-border bg-cream-soft p-3 mb-4"
         data-testid="day-new-band">
      <p className="font-extrabold text-[12.5px] text-ink mb-1.5" data-testid="day-new-readout">
        {hhmm(run.start)} – {hhmm(end)} · {durationLabel(minutes * MIN)}
      </p>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={t('day_duration')}
        aria-valuemin={MIN_MINUTES}
        aria-valuemax={maxMinutes}
        aria-valuenow={minutes}
        aria-valuetext={`${hhmm(run.start)} – ${hhmm(end)}`}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        style={{ touchAction: 'none' }}
        className="relative h-[46px] rounded-[10px] overflow-hidden cursor-pointer
                   border-[1.5px] border-dashed border-teal/30 bg-teal/[0.07]"
        data-testid="day-new-track"
      >
        {ticks}
        <div
          className="absolute left-0 top-0 bottom-0 rounded-[9px] bg-teal flex items-center
                     pl-2.5 text-paper font-extrabold text-[11.5px]"
          style={{ width: `${frac * 100}%` }}
          data-testid="day-new-fill"
        >
          {frac >= 0.22 && durationLabel(minutes * MIN)}
          <span className="absolute right-[5px] top-1/2 -translate-y-1/2 w-[5px] h-[22px]
                           rounded-[3px] bg-paper/55" />
        </div>
      </div>

      <div className="relative h-[13px] mt-1.5 font-bold text-[10px] text-ink-muted"
           data-testid="day-new-axis">
        <span className="absolute left-0 top-0">{hhmm(run.start)}</span>
        {axis.map(({ f, at }) => (
          <span key={f} className="absolute top-0 -translate-x-1/2"
                style={{ left: `${f * 100}%` }}>
            {hhmm(at)}
          </span>
        ))}
        <span className="absolute right-0 top-0">{hhmm(run.end)}</span>
      </div>

      {/* The drive is only claimed on a side that actually has a neighbour —
          the first slot of the day has nothing to drive from. */}
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <span className="flex items-center gap-1 font-bold text-[9.5px] text-ink-faint">
          {run.insetBefore && <><Car size={11} /> {t('day_drive_before')}</>}
        </span>
        {rest > 0 && (
          <span className="font-bold text-[10px] text-ink-muted whitespace-nowrap"
                data-testid="day-new-rest">
            {durationLabel(rest * MIN)} {t('day_stays_free')}
          </span>
        )}
        <span className="flex items-center gap-1 font-bold text-[9.5px] text-ink-faint">
          {run.insetAfter && <>{t('day_drive_after')} <Car size={11} /></>}
        </span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── booking an empty slot */
function NewAppointmentSheet({ run, onCreate, onClose, t }) {
  const span = toMs(run.end) - toMs(run.start);
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState([]);
  /* Default to an hour, or the whole slot when it is shorter. Never longer:
     the slot's end already has the next job's drive taken out of it, so
     offering more would be offering the journey. */
  const [minutes, setMinutes] = useState(Math.min(60, Math.round(span / MIN)));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/customers', { params: { limit: 200 } })
      .then((r) => setCustomers(r.data?.customers || []))
      .catch(() => setCustomers([]));
  }, []);

  const maxMinutes = Math.round(span / MIN);
  const steps = [];
  for (let m = MIN_MINUTES; m <= maxMinutes; m += 15) steps.push(m);

  const submit = (e) => {
    e.preventDefault();
    if (title.trim().length < 3 || saving) return;
    setSaving(true);
    onCreate({
      title: title.trim(),
      customerId,
      start: run.start,
      end: new Date(toMs(run.start) + minutes * MIN),
    }).finally?.(() => setSaving(false));
  };

  return (
    <div className="fixed inset-0 z-[210] bg-black/40 flex items-end" onClick={onClose}
         data-testid="day-new-sheet">
      <form className="w-full bg-paper rounded-t-[20px] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="flex items-center gap-2 mb-1">
          <p className="font-headings font-bold text-[15px] text-ink flex-1">
            {t('day_new_appt_title')}
          </p>
          <button type="button" onClick={onClose} className="p-1 text-ink-muted" aria-label="close">
            <X size={18} />
          </button>
        </div>
        {/* The band's own axis names the free window, so the old sub-line
            saying the same thing in words is gone rather than doubled. */}
        <div className="mt-3">
          <SlotBand run={run} minutes={minutes} maxMinutes={maxMinutes}
                    onChange={setMinutes} t={t} />
        </div>

        <label className="block font-bold text-[11px] text-ink-soft mb-1.5">
          {t('day_what')}
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('day_what_ph')}
          className="w-full min-h-[46px] px-3 rounded-[12px] border border-sm-border bg-cream-soft
                     text-[13px] text-ink mb-4"
          data-testid="day-new-title"
          autoFocus
        />

        <label className="block font-bold text-[11px] text-ink-soft mb-1.5">
          {t('day_customer')}
        </label>
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="w-full min-h-[46px] px-3 rounded-[12px] border border-sm-border bg-cream-soft
                     text-[13px] text-ink mb-4"
          data-testid="day-new-customer"
        >
          <option value="">{t('day_no_customer')}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <label className="block font-bold text-[11px] text-ink-soft mb-1.5">
          {t('day_duration')}
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4" data-testid="day-new-durations">
          {steps.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              className={`min-h-[44px] px-3.5 rounded-[11px] font-bold text-[12px] whitespace-nowrap
                ${minutes === m ? 'bg-teal text-paper'
                                : 'bg-cream-soft border border-sm-border text-ink-soft'}`}
              data-testid={`day-new-dur-${m}`}
            >
              {durationLabel(m * MIN)}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={title.trim().length < 3 || saving}
          className={`w-full min-h-[48px] rounded-[12px] font-extrabold text-[13px]
            ${title.trim().length < 3 || saving
              ? 'bg-cream-deep text-ink-faint' : 'bg-teal text-paper'}`}
          data-testid="day-new-submit"
        >
          {t('day_create_appt')}
        </button>
      </form>
    </div>
  );
}

/* ─────────────────────────────────── after completing: make an invoice? */
function CompletedSheet({ appt, hasToolkit, onInvoice, onUnlock, onClose, t }) {
  return (
    <div className="fixed inset-0 z-[210] bg-black/40 flex items-end" onClick={onClose}
         data-testid="day-completed-sheet">
      <div className="w-full bg-paper rounded-t-[20px] p-5 shadow-2xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <CheckCircle2 size={22} className="text-green-pos flex-none mt-0.5" />
          <div className="flex-1">
            <p className="font-headings font-bold text-[15px] text-ink">
              {t('day_completed_title')}
            </p>
            <p className="text-[12px] text-ink-soft mt-1 leading-relaxed">
              {appt.title}{appt.customer_name ? ` · ${appt.customer_name}` : ''}
            </p>
          </div>
        </div>

        {hasToolkit === false ? (
          <>
            <div className="flex items-start gap-2.5 bg-cream-soft rounded-[12px] p-3 mb-3">
              <Lock size={16} className="text-ink-muted flex-none mt-0.5" />
              <p className="text-[11.5px] text-ink-soft leading-relaxed">
                {t('day_invoice_locked')}
              </p>
            </div>
            <button
              type="button" onClick={onUnlock}
              className="w-full min-h-[46px] rounded-[12px] bg-teal text-paper
                         font-extrabold text-[12.5px]"
              data-testid="day-unlock-toolkit"
            >
              {t('day_unlock_invoicing')}
            </button>
          </>
        ) : (
          <>
            <p className="text-[12px] text-ink-soft mb-3 leading-relaxed">
              {t('day_invoice_prompt')}
            </p>
            <button
              type="button" onClick={onInvoice}
              disabled={hasToolkit === null}
              className={`w-full min-h-[46px] rounded-[12px] font-extrabold text-[12.5px]
                flex items-center justify-center gap-2
                ${hasToolkit === null ? 'bg-cream-deep text-ink-faint' : 'bg-teal text-paper'}`}
              data-testid="day-make-invoice"
            >
              <Receipt size={16} /> {t('day_make_invoice')}
            </button>
          </>
        )}
        <button type="button" onClick={onClose}
                className="w-full text-center font-semibold text-[11.5px] text-ink-muted mt-3 py-2.5
                           min-h-[44px]"
                data-testid="day-invoice-later">
          {t('day_later')}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────── the SMS sheet */
function SmsSheet({ sms, body, onTemplate, onClose, t }) {
  const seg = smsSegments(body);
  const phone = sms.appt.customer_phone;
  const [copied, setCopied] = useState(false);

  const hand = async () => {
    const ok = await sendViaPhone(phone, body);
    setCopied(true);
    toast.success(ok
      ? t('day_sms_copied')
      : t('day_sms_opened'));
  };

  return (
    <div className="fixed inset-0 z-[210] bg-black/40 flex items-end" onClick={onClose}
         data-testid="day-sms-sheet">
      <div className="w-full bg-paper rounded-t-[20px] p-5 shadow-2xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <p className="font-headings font-bold text-[15px] text-ink flex-1">
            SMS an {sms.appt.customer_name}
          </p>
          <span className="text-[11px] text-ink-muted">{phone}</span>
          <button onClick={onClose} className="p-1 text-ink-muted" aria-label="close">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {Object.values(TEMPLATES).map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              onClick={() => onTemplate(tpl.key)}
              className={`flex-1 min-h-[38px] rounded-[10px] font-bold text-[11px]
                ${sms.template === tpl.key
                  ? 'bg-teal text-paper'
                  : 'bg-cream-soft border border-sm-border text-ink-muted'}`}
              data-testid={`day-sms-tpl-${tpl.key}`}
            >
              {tpl.label}
            </button>
          ))}
        </div>

        <div className="border-[1.5px] border-sm-border rounded-[12px] p-3 bg-cream-soft">
          <p className="text-[12px] text-ink leading-relaxed whitespace-pre-line"
             data-testid="day-sms-body">{body}</p>
        </div>
        <div className="flex justify-between items-center mt-2 mb-3 px-0.5">
          <span className="font-bold text-[10.5px] text-ink-muted">
            {t('day_sms_from_phone')}
          </span>
          <span className="text-[10px] text-ink-faint">
            {seg.units} {t('day_chars')} · {seg.segments} SMS
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={hand}
            className="flex-1 min-h-[46px] rounded-[12px] bg-teal text-paper font-extrabold
                       text-[12.5px] flex items-center justify-center gap-2"
            data-testid="day-sms-send"
          >
            <Copy size={15} /> {t('day_copy_open')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] px-4 rounded-[12px] border border-sm-border bg-paper
                       text-ink-soft font-bold text-[12px] whitespace-nowrap"
          >
            {t('day_skip_sms')}
          </button>
        </div>
        <p className="text-[10px] text-ink-faint text-center mt-2.5 leading-relaxed">
          {copied
            ? t('day_sms_paste')
            : t('day_sms_note')}
        </p>
      </div>
    </div>
  );
}
