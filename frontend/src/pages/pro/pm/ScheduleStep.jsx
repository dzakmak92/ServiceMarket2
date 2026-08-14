import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import api from '../../../api/client';
import { moneyLocale } from '../../../utils/money';

/**
 * Step 2 — when the work happens, shown against the day it lands in.
 *
 * What it replaces asked three questions in a row and answered none of them:
 * a date field, a time field and six duration chips. Nothing on the screen
 * said what was already booked that day, so appointments were laid on top of
 * each other and the clash only surfaced in the calendar afterwards.
 *
 * Now: a month to pick the day, and under it the day itself, drawn to scale —
 * hours down the left, existing appointments where their time actually is, and
 * the gaps between them as real empty space. A gap long enough to hold
 * anything is a dashed card with a plus in the middle; tapping it asks the two
 * questions that are left, start and duration, without covering the day.
 *
 * Three things the shape is doing on purpose:
 *
 *  - The quarter-hour is not a nicety. `PATCH /jobs/{id}/schedule` rejects
 *    any time that is not on one, so the slider steps in fifteens because a
 *    finer value would come back a 400.
 *  - The slider's maximum is the length of the gap. It therefore cannot
 *    produce an overlap at all, rather than producing one and reporting it.
 *  - A gap draws at least 44 px even when its true height would be less. That
 *    breaks the scale in the one place where being exact would leave a target
 *    smaller than a fingertip; everything else on the axis is true to time.
 */

/* The window the day is drawn in. It widens rather than clips when something
   sits outside it — a 5 a.m. start that fell off the top would make the strip
   say something false about the day. */
const DAY_FROM = 6;
const DAY_TO = 20;
const PX_PER_HOUR = 26;
const MIN_SLOT_PX = 44;
const STEP_MIN = 15;

const two = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const minsOf = (d) => d.getHours() * 60 + d.getMinutes();
const dayKey = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/** Local wall-clock parts to an ISO instant. Built from the parts rather than
 *  parsed from a string: east of Greenwich `new Date('2026-08-14')` is the
 *  13th, and a booking a day out is worse than no booking. */
function instantOf(day, mins) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(mins / 60), mins % 60, 0, 0).toISOString();
}

/* "15 min", not "0 h 15" — the first slider stop said the latter, which is a
   sentence nobody speaks. */
const fmtDur = (mins, t) => {
  if (mins < 60) return t('job_cal_dur_m', { m: mins });
  if (mins % 60 === 0) return t('job_cal_dur_h', { h: mins / 60 });
  return t('job_cal_dur_hm', { h: Math.floor(mins / 60), m: mins % 60 });
};

export default function ScheduleStep({ job, t, onSaved }) {
  const [month, setMonth] = useState(() => {
    const d = job.scheduled_start ? new Date(job.scheduled_start) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [picked, setPicked] = useState(() => dayKey(
    job.scheduled_start ? new Date(job.scheduled_start) : new Date()));
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  /* Which gap is open, and what is being set in it. `null` means every gap is
     a plus again. */
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /* How tall the opened gap actually is. An open form is nearly always taller
     than the gap it grew out of, and without this everything after it stayed
     where it was and the form covered the next appointment. Measured rather
     than guessed: the height depends on how many start chips fit. */
  const [openH, setOpenH] = useState(0);

  /* Six whole weeks, so the grid never grows or loses a row between months
     and push everything under it up and down. */
  const grid = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(start.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/jobs/appointments',
        { params: { day: dayKey(grid[0]), days: 42 } });
      setAppts(data.appointments || data.jobs || []);
    } catch { setAppts([]); } finally { setLoading(false); }
  }, [grid]);
  useEffect(() => { load(); }, [load]);

  /* How many appointments each day carries, for the dots under the numbers. */
  const perDay = useMemo(() => {
    const m = {};
    for (const a of appts) {
      if (!a.scheduled_start) continue;
      const k = dayKey(new Date(a.scheduled_start));
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [appts]);

  /* The chosen day's appointments, this job's own excluded — it is the thing
     being placed, so it must not block its own gap. */
  const dayAppts = useMemo(() => appts
    .filter((a) => a.scheduled_start && dayKey(new Date(a.scheduled_start)) === picked
      && a.id !== job.id)
    .map((a) => {
      const s = new Date(a.scheduled_start);
      const e = a.scheduled_end ? new Date(a.scheduled_end) : new Date(s.getTime() + 3600000);
      return { ...a, from: minsOf(s), to: Math.max(minsOf(s) + STEP_MIN, minsOf(e)) };
    })
    .sort((a, b) => a.from - b.from), [appts, picked, job.id]);

  /* The axis stretches to hold anything outside the default window. */
  const [from, to] = useMemo(() => {
    let lo = DAY_FROM * 60;
    let hi = DAY_TO * 60;
    for (const a of dayAppts) { lo = Math.min(lo, a.from); hi = Math.max(hi, a.to); }
    return [Math.floor(lo / 60) * 60, Math.ceil(hi / 60) * 60];
  }, [dayAppts]);

  /* Everything between the appointments that is long enough to be worth
     offering. A gap shorter than one step is not a slot, it is a rounding
     error, and a plus that cannot produce a booking is a lie. */
  const gaps = useMemo(() => {
    const out = [];
    let cur = from;
    for (const a of dayAppts) {
      if (a.from - cur >= STEP_MIN) out.push({ from: cur, to: a.from });
      cur = Math.max(cur, a.to);
    }
    if (to - cur >= STEP_MIN) out.push({ from: cur, to });
    return out;
  }, [dayAppts, from, to]);

  const y = (mins) => ((mins - from) / 60) * PX_PER_HOUR;

  /* Everything below an opened gap slides down by whatever the form needs
     beyond the gap's own height. Below the open one only — the day above it
     keeps its true positions. */
  const openGap = draft ? gaps.find((g) => g.from === draft.gap) : null;
  const grown = openGap
    ? Math.max(0, openH - Math.max(MIN_SLOT_PX, y(openGap.to) - y(openGap.from)))
    : 0;
  const shift = (mins) => (openGap && mins >= openGap.to ? grown : 0);
  const height = y(to) + grown;

  const save = async () => {
    if (!draft) return;
    setBusy(true); setErr('');
    try {
      await api.patch(`/api/jobs/${job.id}/schedule`, {
        scheduled_start: instantOf(picked, draft.start),
        scheduled_end: instantOf(picked, draft.start + draft.mins),
      });
      setDraft(null);
      await onSaved?.();
    } catch (e) {
      setErr(e?.response?.data?.detail || t('generic_error'));
    } finally { setBusy(false); }
  };

  const monthLabel = month.toLocaleDateString(moneyLocale(), { month: 'long', year: 'numeric' });
  const pickedDate = (() => { const [yy, mm, dd] = picked.split('-').map(Number);
    return new Date(yy, mm - 1, dd); })();
  const freeMins = gaps.reduce((a, g) => a + (g.to - g.from), 0);

  return (
    <div data-testid="job-cal">
      <div className="rounded-xl border border-sm-border bg-cream-soft p-2.5">
        <div className="flex items-center mb-2">
          <button type="button" data-testid="job-cal-prev" aria-label={t('job_cal_prev')}
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  className="w-8 h-8 grid place-items-center rounded-lg text-ink-muted">‹</button>
          <b className="flex-1 text-center text-[12.5px] font-extrabold"
             data-testid="job-cal-month">{monthLabel}</b>
          <button type="button" data-testid="job-cal-next" aria-label={t('job_cal_next')}
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  className="w-8 h-8 grid place-items-center rounded-lg text-ink-muted">›</button>
        </div>

        <div className="grid grid-cols-7 gap-[3px]">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i} className="text-center text-[9px] font-extrabold uppercase text-ink-faint pb-0.5">
              {new Date(2024, 0, 1 + i).toLocaleDateString(moneyLocale(), { weekday: 'narrow' })}
            </span>
          ))}
          {grid.map((d) => {
            const k = dayKey(d);
            const outside = d.getMonth() !== month.getMonth();
            const isToday = k === dayKey(new Date());
            const on = k === picked;
            return (
              <button key={k} type="button" onClick={() => { setPicked(k); setDraft(null); }}
                      data-testid={`job-cal-day-${k}`} data-on={on ? 'yes' : 'no'}
                      className={`aspect-square rounded-[9px] flex flex-col items-center justify-center
                                  text-[12px] font-bold tabular-nums border
                                  ${on ? 'bg-teal-deep border-teal-deep text-paper'
                        : outside ? 'border-transparent text-ink-faint opacity-50'
                          : 'bg-paper border-sm-border text-ink'}
                                  ${isToday && !on ? '!border-red-warn border-2' : ''}`}>
                {d.getDate()}
                {perDay[k] > 0 && (
                  <i className={`block w-1 h-1 rounded-full mt-0.5
                                 ${on ? 'bg-paper' : 'bg-teal'}`} aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-baseline mt-3 mb-1.5">
          <b className="text-[12.5px] font-extrabold" data-testid="job-cal-dayname">
            {pickedDate.toLocaleDateString(moneyLocale(),
              { weekday: 'long', day: 'numeric', month: 'long' })}
          </b>
          <span className="ml-auto text-[10.5px] font-bold text-ink-faint"
                data-testid="job-cal-free">
            {t('job_cal_free', { h: (freeMins / 60).toFixed(1).replace('.', ',') })}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={18} className="text-teal animate-spin" /></div>
        ) : (
          <div className="flex gap-2.5" style={{ height }} data-testid="job-cal-day">
            <div className="w-[38px] shrink-0 relative">
              {/* The hours move with the cards. Shifting the blocks but not
                  the scale left "13:00 Rohrbruch" sitting beside the 20:00
                  label — an axis that disagrees with what it measures is
                  worse than no axis. */}
              {Array.from({ length: (to - from) / 60 + 1 }, (_, i) => (
                <span key={i} style={{ top: y(from + i * 60) - 5 + shift(from + i * 60) }}
                      className="absolute left-0 text-[9.5px] font-extrabold text-ink-faint tabular-nums">
                  {two((from / 60) + i)}:00
                </span>
              ))}
            </div>
            <div className="w-[2px] shrink-0 rounded bg-cream-deep relative" style={{ height }}>
              {dayAppts.map((a) => (
                <i key={a.id} style={{ top: y(a.from) + shift(a.from), height: y(a.to) - y(a.from) }}
                   className="absolute -left-[3px] w-2 rounded bg-teal" aria-hidden="true" />
              ))}
            </div>
            <div className="flex-1 min-w-0 relative">
              {dayAppts.map((a) => (
                <div key={a.id} style={{ top: y(a.from) + shift(a.from), minHeight: y(a.to) - y(a.from) }}
                     data-testid={`job-cal-appt-${a.id}`}
                     className="absolute left-0 right-0 flex items-center gap-2 rounded-xl px-2.5 py-2
                                bg-step-now-soft border border-step-now-line overflow-hidden">
                  <span className="text-[11.5px] font-extrabold tabular-nums shrink-0 w-[44px]">
                    {two(Math.floor(a.from / 60))}:{two(a.from % 60)}
                  </span>
                  <span className="flex-1 min-w-0 text-[12.5px] font-bold truncate">{a.title}</span>
                </div>
              ))}
              {gaps.map((g) => (
                <Gap key={`${g.from}-${g.to}`} gap={g} y={y} t={t} shift={shift(g.from)}
                     open={draft?.gap === g.from} draft={draft} setDraft={setDraft}
                     busy={busy} onSave={save} onHeight={setOpenH} />
              ))}
            </div>
          </div>
        )}
        {err && <p className="text-[11.5px] text-red-text mt-2" data-testid="job-cal-error">{err}</p>}
      </div>
    </div>
  );
}

/**
 * One free gap: a plus until it is tapped, a small form after.
 *
 * The form grows the card downward rather than opening over the day. What is
 * being decided is *where in the day this goes*, so covering the day to decide
 * it would hide the only thing worth looking at.
 */
function Gap({ gap, y, t, shift, open, draft, setDraft, busy, onSave, onHeight }) {
  const len = gap.to - gap.from;
  const top = y(gap.from) + shift;
  const trueH = y(gap.to) - y(gap.from);
  const starts = [];
  for (let s = gap.from; s + STEP_MIN <= gap.to; s += STEP_MIN) starts.push(s);

  if (!open) {
    return (
      <button type="button" data-testid={`job-cal-gap-${gap.from}`}
              onClick={() => setDraft({ gap: gap.from, start: gap.from,
                mins: Math.min(120, len) })}
              style={{ top, height: Math.max(MIN_SLOT_PX, trueH) }}
              className="absolute left-0 right-0 rounded-xl border-2 border-dashed border-step-now-line
                         bg-paper flex flex-col items-center justify-center gap-1">
        <span className="w-[34px] h-[34px] rounded-full bg-teal-deep text-paper grid place-items-center">
          <Plus size={19} strokeWidth={2.6} />
        </span>
        <span className="text-[10.5px] font-extrabold text-ink-faint tabular-nums">
          {two(Math.floor(gap.from / 60))}:{two(gap.from % 60)} – {two(Math.floor(gap.to / 60))}:{two(gap.to % 60)}
          {' · '}{fmtDur(len, t)}
        </span>
      </button>
    );
  }

  const maxMins = gap.to - draft.start;
  const end = draft.start + draft.mins;
  return (
    <div style={{ top }} data-testid={`job-cal-gap-${gap.from}-open`}
         ref={(el) => { if (el) onHeight(el.getBoundingClientRect().height); }}
         className="absolute left-0 right-0 z-10 rounded-xl border-2 border-teal-deep bg-paper p-3
                    shadow-[0_3px_12px_rgba(26,58,82,.09)]">
      <p className="text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-ink-muted mb-1.5">
        {t('job_cal_start')}
      </p>
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {starts.map((s) => (
          <button key={s} type="button" data-testid={`job-cal-start-${s}`}
                  onClick={() => setDraft({ ...draft, start: s,
                    mins: Math.min(draft.mins, gap.to - s) })}
                  className={`shrink-0 rounded-[9px] px-2.5 py-1.5 text-[12px] font-extrabold tabular-nums
                              border ${s === draft.start
                      ? 'bg-teal-deep border-teal-deep text-paper'
                      : 'bg-cream-soft border-sm-border text-ink'}`}>
            {two(Math.floor(s / 60))}:{two(s % 60)}
          </button>
        ))}
      </div>

      <p className="text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-ink-muted mt-3 mb-1">
        {t('job_cal_dur')}
      </p>
      <input type="range" min={STEP_MIN} max={maxMins} step={STEP_MIN} value={draft.mins}
             data-testid="job-cal-dur" aria-label={t('job_cal_dur')}
             onChange={(e) => setDraft({ ...draft, mins: Number(e.target.value) })}
             className="w-full accent-teal-deep h-6" />
      <div className="flex text-[9.5px] font-extrabold text-ink-faint">
        <span>{fmtDur(STEP_MIN, t)}</span>
        <span className="ml-auto">{fmtDur(maxMins, t)}</span>
      </div>

      <div className="flex items-baseline gap-2 mt-2">
        <b className="text-[15.5px] font-extrabold tabular-nums text-teal-deep whitespace-nowrap"
           data-testid="job-cal-range">
          {two(Math.floor(draft.start / 60))}:{two(draft.start % 60)}–{two(Math.floor(end / 60))}:{two(end % 60)}
        </b>
        <span className="text-[11.5px] font-bold text-ink-muted whitespace-nowrap">
          {fmtDur(draft.mins, t)}
        </span>
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={() => setDraft(null)} data-testid="job-cal-cancel"
                className="min-h-[44px] px-3 rounded-xl border-[1.5px] border-step-now-line
                           text-[12.5px] font-extrabold text-teal-deep">
          {t('ui_cancel')}
        </button>
        <button type="button" onClick={onSave} disabled={busy} data-testid="job-cal-save"
                className="flex-1 min-h-[44px] rounded-xl bg-teal-deep text-paper text-[13px]
                           font-extrabold disabled:opacity-60 flex items-center justify-center gap-2">
          {busy && <Loader2 size={15} className="animate-spin" />}
          {t('job_cal_set')}
        </button>
      </div>
    </div>
  );
}
