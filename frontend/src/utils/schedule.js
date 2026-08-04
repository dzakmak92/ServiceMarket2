/**
 * Day-schedule arithmetic.
 *
 * Kept out of the component on purpose. Resizing an appointment can push the
 * next one, which can push the one after that, and every step has to land on a
 * quarter hour with a drive between it and the job before. That is arithmetic,
 * not rendering, and it is the part worth testing.
 */

export const MIN = 60 * 1000;
export const QUARTER = 15 * MIN;

/**
 * The drive between two jobs. A pushed appointment never starts the instant
 * the previous one ends — the pro is still standing in someone's bathroom
 * packing up. Fifteen minutes is the floor, not an estimate of the actual
 * route; a real travel time can only replace it once addresses are geocoded.
 */
export const TRAVEL_GAP = 15 * MIN;

export const toMs = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/** Snap to a quarter. 'floor' and 'ceil' matter: a start rounds down so the
 *  appointment never eats into the drive, an end rounds up. */
export function snapQuarter(ms, mode = 'round') {
  const f = mode === 'floor' ? Math.floor : mode === 'ceil' ? Math.ceil : Math.round;
  return f(ms / QUARTER) * QUARTER;
}

/** Two appointments clash when they share any minute at all. Touching ends
 *  (one finishes exactly as the next begins) is not a clash — it is only a
 *  missing drive, which `travelShortfall` reports separately. */
export function overlaps(a, b) {
  return toMs(a.start) < toMs(b.end) && toMs(b.start) < toMs(a.end);
}

/** Minutes of drive missing between `before` and `after`, or 0 if there is
 *  enough. Negative gaps (a real overlap) are reported in full. */
export function travelShortfall(before, after) {
  const gap = toMs(after.start) - toMs(before.end);
  return gap >= TRAVEL_GAP ? 0 : TRAVEL_GAP - gap;
}

/**
 * Resize `target` to a new end and settle everything after it.
 *
 * Returns `{ appointments, moved, blocked }` — the whole day in order, the
 * ids that had to shift with their old and new times, and anything that could
 * not be placed before `dayEnd`. Nothing is mutated.
 *
 * The cascade is deliberate: pushing job B into job C and leaving C alone
 * would trade one visible conflict for a hidden one.
 */
export function resizeAndSettle(appointments, targetId, newEndMs, opts = {}) {
  const dayEnd = opts.dayEnd == null ? Infinity : toMs(opts.dayEnd);
  const gap = opts.travelGap == null ? TRAVEL_GAP : opts.travelGap;

  const list = appointments
    .map((a) => ({ ...a, start: toMs(a.start), end: toMs(a.end) }))
    .sort((a, b) => a.start - b.start);

  const target = list.find((a) => a.id === targetId);
  if (!target) return { appointments: appointments.slice(), moved: [], blocked: [] };

  const end = Math.max(snapQuarter(newEndMs), target.start + QUARTER);
  const before = new Map(list.map((a) => [a.id, { start: a.start, end: a.end }]));
  target.end = end;

  // Walk forward from the target. Each appointment is pushed only as far as
  // the one in front of it requires, so a big gap absorbs the delay and the
  // cascade stops there rather than shunting the rest of the day.
  const moved = [];
  const blocked = [];
  let prev = target;
  for (const a of list) {
    if (a.start <= target.start || a.id === targetId) continue;
    const earliest = snapQuarter(prev.end + gap, 'ceil');
    if (a.start < earliest) {
      const dur = a.end - a.start;
      a.start = earliest;
      a.end = earliest + dur;
      moved.push({ id: a.id, from: before.get(a.id), to: { start: a.start, end: a.end } });
      if (a.end > dayEnd) blocked.push(a.id);
    }
    prev = a;
  }

  return {
    appointments: list.map((a) => ({ ...a, start: new Date(a.start), end: new Date(a.end) })),
    moved,
    blocked,
  };
}

/** What a resize would do, without doing it — for the confirmation sheet. */
export function previewResize(appointments, targetId, newEndMs, opts = {}) {
  const target = appointments.find((a) => a.id === targetId);
  if (!target) return null;
  const end = Math.max(snapQuarter(newEndMs), toMs(target.start) + QUARTER);
  const clashes = appointments.filter(
    (a) => a.id !== targetId && overlaps({ start: toMs(target.start), end }, a));
  const { moved, blocked } = resizeAndSettle(appointments, targetId, end, opts);
  return { newEnd: new Date(end), clashes, moved, blocked };
}

/** Free runs between appointments, for the tappable quarters. */
export function freeRuns(appointments, dayStart, dayEnd) {
  const list = appointments
    .map((a) => ({ start: toMs(a.start), end: toMs(a.end) }))
    .sort((a, b) => a.start - b.start);
  const runs = [];
  let cursor = toMs(dayStart);
  for (const a of list) {
    if (a.start > cursor) runs.push({ start: new Date(cursor), end: new Date(a.start) });
    cursor = Math.max(cursor, a.end);
  }
  if (cursor < toMs(dayEnd)) runs.push({ start: new Date(cursor), end: new Date(dayEnd) });
  return runs;
}

export const hhmm = (v) =>
  new Date(toMs(v)).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });

export function durationLabel(ms) {
  const m = Math.round(ms / MIN);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}
