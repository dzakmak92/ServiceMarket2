/**
 * node src/utils/schedule.test.mjs
 *
 * The scheduling arithmetic, checked against the cases that actually bite:
 * the travel gap, the cascade, and the day running out.
 */
import {
  QUARTER, MIN, TRAVEL_GAP, snapQuarter, overlaps, travelShortfall,
  resizeAndSettle, previewResize, freeRuns, durationLabel,
} from './schedule.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok  ', msg); }
                            else { fail++; console.log('  FAIL', msg); } };
const step = (t) => console.log(`\n── ${t} ──`);

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

step('labels');
ok(durationLabel(90 * MIN) === '1 h 30 min', '90 min reads as 1 h 30 min');
ok(durationLabel(60 * MIN) === '1 h', 'a round hour drops the minutes');
ok(durationLabel(QUARTER) === '15 min', 'a quarter has no hour part');

console.log(`\n${fail ? `${fail} FAILURE(S)` : 'ALL PASS'}  (${pass} checks)`);
process.exit(fail ? 1 : 0);
