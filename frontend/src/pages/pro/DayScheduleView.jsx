import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  QUARTER, MIN, TRAVEL_GAP, hhmm, durationLabel, freeRuns, previewResize,
  resizeAndSettle, snapQuarter, toMs,
} from '../../utils/schedule';
import { TEMPLATES, sendViaPhone, smsSegments, telHref } from '../../utils/sms';
import {
  AlertTriangle, ChevronDown, ChevronUp, Copy, FileText, MapPin, Phone,
  Navigation, Plus, User, X,
} from 'lucide-react';

/* 80 px per hour is not a taste call: a one-hour appointment has to hold its
   header and body (96 px together), and a quarter line has to stay far enough
   from its neighbour to read as a separate line. 80 gives a 20 px quarter. */
const PPH = 80;
const PX_PER_MS = PPH / (60 * MIN);
const DAY_FROM = 8;
const DAY_TO = 18;

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

/* ────────────────────────────────────────────── one appointment block */
function Block({ appt, top, height, running, progress, dragging, conflict, onGrab, t }) {
  const room = { body: height >= 96, actions: height >= 150 && !dragging };
  const phone = telHref(appt.customer_phone);
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
        <div className={`flex items-center gap-2 px-3 py-[7px] flex-none
          ${running ? 'bg-teal text-paper' : 'bg-teal-deep text-paper'}`}>
          <p className="font-extrabold text-[13px]">{hhmm(appt.start)}–{hhmm(appt.end)}</p>
          <p className="font-bold text-[10.5px] opacity-75">
            · {durationLabel(toMs(appt.end) - toMs(appt.start))}
          </p>
          {running && (
            <span className="ml-auto bg-black/20 rounded-full px-2 py-[2px] text-[9px] font-extrabold">
              {t('day_running')}
            </span>
          )}
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
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5
                         font-bold text-[11px] text-teal"
            >
              <Navigation size={13} /> {t('day_route')}
            </a>
            <a
              href={phone ? `tel:${phone}` : undefined}
              aria-disabled={!phone}
              className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5
                font-bold text-[11px] border-l border-sm-border
                ${phone ? 'text-teal' : 'text-ink-faint pointer-events-none'}`}
            >
              <Phone size={13} /> {t('day_call')}
            </a>
            <Link
              to={`/projects/${appt.id}`}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5
                         font-bold text-[11px] text-teal border-l border-sm-border"
            >
              <FileText size={13} /> {t('day_note')}
            </Link>
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
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(null);      // { id, endMs }
  const [pending, setPending] = useState(null); // the confirmation sheet
  const [sms, setSms] = useState(null);         // the message sheet
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

  const now = Date.now();
  const showNow = sameDay(date, new Date());
  const running = appts.find((a) => toMs(a.start) <= now && now < toMs(a.end));

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

  const runs = useMemo(() => freeRuns(appts, dayStart, dayEnd), [appts, dayStart, dayEnd]);
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
            /* A gap no longer than the travel gap is the drive, not free time.
               Offering to book into it would be offering to book the journey.
               Skipped by the rule, not by whether the pixels happened to fit. */
            if (span <= TRAVEL_GAP) return null;
            /* The extend handle straddles the card's bottom edge — 22 px of it
               hangs below — and that edge is where a free run starts. Clear it
               at the top only; the bottom of a run meets the next card's own
               top edge, which nothing overhangs. */
            const clearTop = 24;
            const height = span * PX_PER_MS - clearTop - 2;
            if (height < 8) return null;
            return (
              <button
                key={+r.start}
                type="button"
                className="absolute left-0 right-0 rounded-[10px] flex items-center justify-center gap-1.5
                           border-[1.5px] border-dashed border-cream-deep overflow-hidden"
                style={{ top: topOf(r.start) + clearTop, height, zIndex: 1 }}
                data-testid={`day-free-${hhmm(r.start)}`}
                aria-label={`${t('day_new_appt')} ${hhmm(r.start)}`}
              >
                {/* Below about half an hour the label is taller than the slot
                    it labels. A plus on its own still says what it does. */}
                {height >= 26 ? (
                  <>
                    <span className="font-extrabold text-[10.5px] text-teal">
                      + {t('day_new_appt')}
                    </span>
                    <span className="font-semibold text-[10px] text-ink-faint">
                      {durationLabel(span)} {t('day_free')}
                    </span>
                  </>
                ) : (
                  <span className="font-extrabold text-[11px] text-teal leading-none">+</span>
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
