/**
 * The five steps a job walks, and where a given job stands in them.
 *
 * Lifted out of the job page so the overview can draw the same five dots the
 * detail page draws as five cards. One definition: if the ladder ever changes,
 * a list that disagreed with the page it links to would be worse than no list.
 */

/* The `job_status` enum in the order it is walked. `cancelled` is not on the
   ladder: it is a way off it, and a cancelled job has no "next step". */
export const RANK = {
  lead: 0, quoted: 1, accepted: 2, scheduled: 3, in_progress: 4,
  completed: 5, invoiced: 6, closed: 7,
};

export const STEP_KEYS = ['quote', 'sched', 'work', 'finish', 'bill'];

/**
 * Which step is where.
 *
 * Driven by facts on the job rather than by the status alone, because the two
 * disagree in the cases that matter: a job can be `accepted` with a date
 * already set, and a job that is `in_progress` has both begun and not
 * finished — which is why the work step gets a third state of its own rather
 * than being called done while the timer is still running.
 */
export function stepStates(job = {}, quote = null) {
  const rank = RANK[job.status];
  const known = rank !== undefined;
  const done = [
    known && rank >= RANK.accepted && !!(quote || job.contract_amount),
    !!job.scheduled_start,
    !!job.started_at || (known && rank >= RANK.completed),
    known && rank >= RANK.completed,
    known && rank >= RANK.invoiced,
  ];
  /* "Now" is the first unfinished step *after the last finished one*, not the
     first unfinished one full stop. A job can be scheduled with no quote
     behind it — booked over the phone — and taking the first gap made the page
     claim the pro was at step 1 while step 2 was already ticked. A chain that
     goes done-after-now reads as broken. The skipped step keeps its own state
     and stays pale, which is the truth: there is no quote here.
     A cancelled job gains no "now" at all — there is nothing to press. */
  const lastDone = done.reduce((acc, d, i) => (d ? i : acc), -1);
  let current = -1;
  if (job.status !== 'cancelled') {
    for (let i = lastDone + 1; i < done.length; i += 1) {
      if (!done[i]) { current = i; break; }
    }
  }
  const running = job.status === 'in_progress';
  return done.map((d, i) => {
    if (i === 2 && running) return 'run';
    if (i === current) return 'now';
    return d ? 'done' : 'wait';
  });
}

/** Whole days between a timestamp and now, floored. Built from local parts so
 *  a job finished at 23:00 does not read as two days old at 01:00. */
export function daysSince(when) {
  if (!when) return null;
  const a = new Date(when);
  const then = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / 86400000);
}
