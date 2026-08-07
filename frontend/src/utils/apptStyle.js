/** How an appointment is drawn, so the three calendar views cannot disagree.
 *
 * A project stage and a one-visit job are not the same commitment — one is
 * the whole work, the other a slice of it — and until now the calendar drew
 * them identically. They are told apart by **fill, not by hue**:
 *
 *   · a job is a solid bar
 *   · a project stage is the same colour, hollow, with an inset ring
 *
 * Hue was not available. The calendar already spends colour twice: red means
 * Notdienst in every view, and in the month grid teal/amber means
 * morning/afternoon. A third meaning on the same channel would make a red bar
 * read as "emergency" and "project" at once, and would have forced the month
 * grid to give up its half-day encoding. Fill is a free channel, and it
 * composes: a project's afternoon bar stays amber and still reads as
 * afternoon.
 *
 * It also survives what colour does not. An outlined bar is distinguishable
 * with any form of colour blindness, in greyscale, and on a phone in
 * sunlight — and at 6 px, which is all the month grid has.
 *
 * Fill alone would still fail WCAG 1.4.1, which asks that colour never be the
 * only carrier. Every view that has room for words shows the label from
 * `PROJECT_KEY` beside the bar; the month grid, which has none, states it in
 * its legend.
 */

/** Is this appointment a stage of a project rather than a job in itself? */
export function isProject(appt) {
  return appt?.mode === 'project';
}

/** Translation key for the word shown beside a project's bar. */
export const PROJECT_KEY = 'cal_project';

/** Bar classes for the small blocks in the week and month grids.
 *
 * `solid` is the colour the view already chose — emergency red, or the
 * morning/afternoon colour — and is passed in rather than decided here, so
 * this cannot quietly override a meaning the view owns.
 *
 * The ring is inset: a border would grow the box, and these bars are laid out
 * to the pixel against a grid.
 */
export function barClass(appt, solid, ring) {
  return isProject(appt)
    ? `bg-transparent ring-[1.5px] ring-inset ${ring}`
    : solid;
}

/** Card classes for the list rows in the day and week views. */
export function cardClass(appt) {
  return isProject(appt)
    ? 'border-teal/45 bg-teal/[0.05] border-dashed'
    : 'border-sm-border bg-paper';
}
