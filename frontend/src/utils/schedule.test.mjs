/**
 * node src/utils/schedule.test.mjs
 *
 * The scheduling arithmetic, checked against the cases that actually bite:
 * the travel gap, the cascade, and the day running out.
 */
import {
  QUARTER, MIN, TRAVEL_GAP, snapQuarter, overlaps, travelShortfall,
  resizeAndSettle, previewResize, previewInsert, freeRuns, bookableRuns, MIN_SLOT, durationLabel,
  dayKey, halvesOf, splitAtNoon,
} from './schedule.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok  ', msg); }
                            else { fail++; console.log('  FAIL', msg); } };
const step = (t) => console.log(`\n── ${t} ──`);
const eq = (got, want, msg) => ok(got === want, `${msg} (got ${got}, want ${want})`);

const D = '2025-08-08';
const at = (h, m = 0) => new Date(`${D}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`).getTime();
const hm = (ms) => new Date(ms).toTimeString().slice(0, 5);

const day = () => ([
  { id: 'a', start: at(8),     end: at(11)    },
  { id: 'b', start: at(13, 30), end: at(15)   },
  { id: 'c', start: at(16),    end: at(17)    },
]);

step('quarters');
ok(snapQuarter(at(10, 7)) === at(10), 'rounds 10:07 down to 10:00');
ok(snapQuarter(at(10, 8)) === at(10, 15), 'and 10:08 up to 10:15');
ok(snapQuarter(at(10, 1), 'ceil') === at(10, 15), 'ceil never rounds down');
ok(snapQuarter(at(10, 14), 'floor') === at(10), 'floor never rounds up');

step('overlap is shared minutes, not touching ends');
ok(overlaps({ start: at(13, 30), end: at(16, 30) }, { start: at(16), end: at(17) }),
   '13:30–16:30 clashes with 16:00–17:00');
ok(!overlaps({ start: at(8), end: at(11) }, { start: at(11), end: at(12) }),
   'a job ending exactly as the next starts does not clash');
ok(travelShortfall({ end: at(11) }, { start: at(11) }) === TRAVEL_GAP,
   '…but it is short the whole drive');
ok(travelShortfall({ end: at(11) }, { start: at(11, 15) }) === 0,
   'and 15 minutes later it is not');

step('resize pushes the next job, leaving a drive');
{
  const r = resizeAndSettle(day(), 'b', at(16, 30));
  const c = r.appointments.find((x) => x.id === 'c');
  ok(hm(+c.start) === '16:45', `c starts 16:45, not 16:30 (${hm(+c.start)})`);
  ok(+c.end - +c.start === 60 * MIN, 'and keeps its one-hour duration');
  ok(r.moved.length === 1 && r.moved[0].id === 'c', 'exactly one appointment moved');
  ok(hm(r.moved[0].from.start) === '16:00', 'the report carries where it came from');
}

step('a job that already has room is left alone');
{
  const r = resizeAndSettle(day(), 'b', at(15, 30));
  ok(r.moved.length === 0, '15:30 end still leaves 30 min before 16:00 — nothing moves');
}
{
  const r = resizeAndSettle(day(), 'b', at(15, 45));
  ok(r.moved.length === 0, 'ending exactly 15 min before the next start is enough');
}
{
  const r = resizeAndSettle(day(), 'b', at(15, 46));
  ok(r.moved.length === 0, '15:46 snaps back to 15:45 — still enough, still nothing moves');
  const r2 = resizeAndSettle(day(), 'b', at(16));
  ok(r2.moved.length === 1, 'a quarter further and it pushes');
  ok(hm(+r2.appointments.find((x) => x.id === 'c').start) === '16:15',
     'landing on the next quarter that clears the drive');
}

step('the cascade stops where a gap absorbs it');
{
  const far = [...day(), { id: 'd', start: at(18, 30), end: at(19) }];
  const r = resizeAndSettle(far, 'b', at(16, 30));
  ok(r.moved.map((m) => m.id).join(',') === 'c',
     'c moves to 16:45–17:45; d at 18:30 still clears the drive, so it stays');
  const near = [...day(), { id: 'd', start: at(17, 30), end: at(18) }];
  const r2 = resizeAndSettle(near, 'b', at(16, 30));
  ok(r2.moved.map((m) => m.id).join(',') === 'c,d',
     'move d to 17:30 and the same push reaches it');
  ok(hm(+r2.appointments.find((x) => x.id === 'd').start) === '18:00',
     'd lands 15 min after c now ends');
}

step('shrinking, and the floor');
{
  const r = resizeAndSettle(day(), 'b', at(14));
  ok(hm(+r.appointments.find((x) => x.id === 'b').end) === '14:00', 'an end can move up');
  ok(r.moved.length === 0, 'shrinking never pushes anything');
  const z = resizeAndSettle(day(), 'b', at(13, 30));
  ok(+z.appointments.find((x) => x.id === 'b').end === at(13, 45),
     'and cannot go below one quarter');
}

step('running out of day');
{
  const r = resizeAndSettle(day(), 'b', at(17, 30), { dayEnd: at(18) });
  ok(r.blocked.includes('c'), 'c would end past 18:00 and is reported blocked');
  ok(r.appointments.find((x) => x.id === 'c') != null,
     'it is still returned — the caller decides, this does not silently drop it');
}

step('preview says the same thing without doing it');
{
  const src = day();
  const p = previewResize(src, 'b', at(16, 30));
  ok(p.clashes.length === 1 && p.clashes[0].id === 'c', 'names the clash');
  ok(hm(+p.moved[0].to.start) === '16:45', 'and the time it would move to');
  ok(+src[2].start === at(16), 'the input is untouched');
}

step('free runs');
{
  const runs = freeRuns(day(), at(8), at(18));
  ok(runs.length === 3, '11–13:30, 15–16, 17–18');
  ok(hm(+runs[0].start) === '11:00' && hm(+runs[0].end) === '13:30', 'first run correct');
  ok(hm(+runs[2].end) === '18:00', 'last run reaches the end of the day');
}

step('bookable runs carry the drive on the sides that have one');
{
  const r = bookableRuns(day(), at(8), at(20));
  // 11:00–13:30 sits between two jobs, so 15 min comes off each end
  ok(hm(+r[0].start) === '11:15' && hm(+r[0].end) === '13:15',
     `first run 11:15–13:15, not 11:00–13:30 (${hm(+r[0].start)}–${hm(+r[0].end)})`);
  ok(r[0].insetBefore && r[0].insetAfter, 'and it says both ends were pulled in');
  // 17:00 to the end of the day: nothing comes after, so that edge stays
  const last = r[r.length - 1];
  ok(hm(+last.start) === '17:15' && hm(+last.end) === '20:00',
     `last run keeps the day's end (${hm(+last.start)}–${hm(+last.end)})`);
  ok(last.insetBefore && !last.insetAfter, 'inset before only');
}
{
  // A day whose first job starts later: the run before it has nothing to
  // drive from, so 08:00 is bookable from the first minute.
  const later = [{ id: 'x', start: at(10), end: at(12) }];
  const r = bookableRuns(later, at(8), at(20));
  ok(hm(+r[0].start) === '08:00', 'the first slot of the day starts at 08:00 exactly');
  ok(!r[0].insetBefore && r[0].insetAfter, 'nothing before it, something after');
  ok(hm(+r[0].end) === '09:45', 'and gives up 15 min to the drive into the 10:00 job');
}
{
  const empty = bookableRuns([], at(8), at(20));
  ok(empty.length === 1 && hm(+empty[0].start) === '08:00' && hm(+empty[0].end) === '20:00',
     'an empty day is bookable end to end');
}

step('a run too short after the inset is not offered');
{
  // 15:00–16:00 between two jobs is one hour, which is 30 min after the drives
  const r = bookableRuns(day(), at(8), at(20));
  const mid = r.find((x) => hm(+x.start) === '15:15');
  ok(mid && hm(+mid.end) === '15:45', 'a 1 h hole yields exactly 30 min — just offerable');
}
{
  const tight = [{ id: 'a', start: at(8), end: at(11) },
                 { id: 'b', start: at(11, 45), end: at(13) }];
  const r = bookableRuns(tight, at(8), at(20));
  ok(!r.some((x) => +x.start >= at(11) && +x.end <= at(11, 45)),
     'a 45 min hole is 15 min after the drives and is dropped, not drawn short');
}
{
  const r = bookableRuns(day(), at(8), at(20), { minSlot: 15 * MIN });
  ok(r.length >= 3, 'the floor is a parameter, not a hard-coded 30');
}

step('booking a draft that outgrows its hole');
{
  // the 11:00–13:30 hole is bookable 11:15–13:15; a 3 h draft runs to 14:15.
  // b is pushed to 14:30–16:00, which now ends exactly as c begins — so the
  // push carries on into c. Naming only the first affected job would be a
  // half-truth the pro finds out about at 16:00.
  const p = previewInsert(day(), { start: at(11, 15), end: at(14, 15) });
  ok(p.moved.map((m) => m.id).join(',') === 'b,c', 'every job the push reaches is reported');
  ok(hm(p.moved[0].to.start) === '14:30', 'b lands 15 min after the draft ends');
  ok(hm(p.moved[0].to.end) === '16:00', 'keeping its 1 h 30 duration');
  ok(hm(p.moved[0].from.start) === '13:30', 'and reports where it was');
  ok(hm(p.moved[1].to.start) === '16:15', 'c is pushed on by the drive out of b');
}
{
  // the same draft, but with room after the job it hits: the cascade stops
  const roomy = [{ id: 'a', start: at(8), end: at(11) },
                 { id: 'b', start: at(13, 30), end: at(15) },
                 { id: 'c', start: at(18), end: at(19) }];
  const p = previewInsert(roomy, { start: at(11, 15), end: at(14, 15) });
  ok(p.moved.length === 1 && p.moved[0].id === 'b',
     'a gap that absorbs the push means only one appointment is affected');
}
{
  const p = previewInsert(day(), { start: at(11, 15), end: at(13, 15) });
  ok(p.moved.length === 0, 'a draft that stops at the window end moves nothing');
  const q = previewInsert(day(), { start: at(11, 15), end: at(13, 30) });
  ok(q.moved.length === 1, 'a quarter more eats the drive, so it does');
}
{
  // long enough to reach past b and into c as well
  const p = previewInsert(day(), { start: at(11, 15), end: at(15, 30) });
  ok(p.moved.map((m) => m.id).join(',') === 'b,c', 'a longer draft moves every job it reaches');
  ok(hm(p.moved[0].to.start) === '15:45' && hm(p.moved[1].to.start) === '17:30',
     'each pushed only as far as the one in front of it needs');
}
{
  const p = previewInsert(day(), { start: at(11, 15), end: at(17, 0) }, { dayEnd: at(18) });
  ok(p.blocked.length > 0, 'what no longer fits before the day ends is reported');
}
{
  const p = previewInsert([], { start: at(8), end: at(16) });
  ok(p.moved.length === 0 && p.blocked.length === 0, 'an empty day costs nothing');
}
{
  const src = day();
  previewInsert(src, { start: at(11, 15), end: at(15, 30) });
  ok(+src[1].start === at(13, 30), 'the day it was asked about is untouched');
}

step('the calendar day is the local one');
{
  // Local midnight in any zone east of Greenwich is the previous day in UTC.
  // `toISOString().slice(0,10)` returned that previous day, so in Vienna the
  // day view asked the API for yesterday and showed none of today's work.
  const midnight = new Date('2026-08-05T00:00:00');
  ok(dayKey(midnight) === '2026-08-05',
     `local midnight is its own day, not yesterday (${dayKey(midnight)})`);
  const lateEvening = new Date('2026-08-05T23:30:00');
  ok(dayKey(lateEvening) === '2026-08-05', 'and so is half past eleven at night');
  ok(dayKey(new Date('2026-01-09T00:00:00')) === '2026-01-09', 'single digits are padded');
  ok(dayKey(new Date('2026-12-31T23:59:00')) === '2026-12-31', "new year's eve does not roll over");
  ok(dayKey(+midnight) === dayKey(midnight), 'it takes a timestamp as happily as a Date');
}

step('labels');
ok(durationLabel(90 * MIN) === '1 h 30 min', '90 min reads as 1 h 30 min');
ok(durationLabel(60 * MIN) === '1 h', 'a round hour drops the minutes');
ok(durationLabel(QUARTER) === '15 min', 'a quarter has no hour part');

step('splitting a day at noon');

const noonOn = (h, m = 0) => { const d = new Date(2026, 7, 5); d.setHours(h, m, 0, 0); return d; };
const nAppt = (a, b) => ({ start: noonOn(a), end: noonOn(b) });

eq(splitAtNoon(nAppt(8, 11)).am, 180, 'a morning job is all morning');
eq(splitAtNoon(nAppt(8, 11)).pm, 0, 'and none of it is afternoon');
eq(splitAtNoon(nAppt(13, 17)).pm, 240, 'an afternoon job is all afternoon');
eq(splitAtNoon(nAppt(13, 17)).am, 0, 'and none of it is morning');

// The case the whole design turns on.
const straddle = splitAtNoon(nAppt(11, 15));
eq(straddle.am, 60, 'a job across noon gives its real hour to the morning');
eq(straddle.pm, 180, 'and the rest to the afternoon');
ok(straddle.am + straddle.pm === 240, 'the two halves add up to the whole job');

eq(splitAtNoon(nAppt(12, 14)).am, 0, 'a job starting exactly at noon is afternoon');
eq(splitAtNoon(nAppt(10, 12)).pm, 0, 'a job ending exactly at noon is morning');
eq(splitAtNoon(nAppt(9, 9)).am, 0, 'a zero-length job is zero minutes, not an error');
eq(splitAtNoon({ start: noonOn(9), end: noonOn(8) }).am, 0,
   'an end before its start does not produce negative minutes');

const halves = halvesOf([nAppt(8, 10), nAppt(11, 15), nAppt(16, 17)]);
eq(halves.am, 180, 'summed over a day, the mornings add up');
eq(halves.pm, 240, 'and so do the afternoons');
eq(halvesOf([]).am, 0, 'an empty day is an empty morning');

// Noon is local, so this has to hold in every zone the tests run in.
ok(splitAtNoon(nAppt(11, 13)).am === 60 && splitAtNoon(nAppt(11, 13)).pm === 60,
   'noon is local noon, whatever zone the test runs in');

console.log(`\n${fail ? `${fail} FAILURE(S)` : 'ALL PASS'}  (${pass} checks)`);
process.exit(fail ? 1 : 0);
