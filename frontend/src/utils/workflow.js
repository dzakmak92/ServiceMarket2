import {
  Calculator, FileText, Handshake, Building2, Wrench, Receipt,
} from 'lucide-react';

/**
 * The six stages of a job, as the home screen presents them.
 *
 * Defined once because three things have to agree about them: the tile grid,
 * the counts the API returns, and the bottom navigation. When those drifted
 * apart before, the result was a dropdown offering statuses that were not
 * members of the enum.
 *
 * The grid is laid out column-first — `grid-auto-flow: column` over three
 * rows — so the left column is winning the work and the right is delivering
 * it. That split is why the two columns are tinted differently.
 * Order here is the DOM order, which under column flow is also the reading
 * order: down the left, then down the right.
 *
 * The tiles used to be six solid fills running a light-to-dark ramp down each
 * column. They are now white cards with a tinted icon badge, which is the
 * shape the dashboard has used all along — and the reason the ramp went is
 * that it was carrying two jobs at once. A tile had to say both *which half
 * of the job it belongs to* and *where in that half it sits*, and the second
 * was never information: nobody navigates by noticing that Auftrag is a
 * darker sand than Angebot. Dropping it leaves the one distinction that is
 * real, warm-left against cool-right, and lets the card itself go quiet.
 *
 * `fill` is the card, `badge` is the circle the icon sits in. Measured on a
 * white tile: amber-text on amber/15 is 5.00:1, teal on teal/10 is 5.24:1,
 * and the label — plain `ink` now, rather than a per-family foreground — is
 * 11.86:1.
 */
export const STAGES = [
  // ── links: den Auftrag gewinnen ──────────────────────────────────
  {
    /* The one tile that is not a count.
     *
     * The other five hold something a pro has — quotes awaiting a reply, jobs
     * in hand, visits ahead, invoices outstanding — and this one held `jobs
     * where status = 'lead'`, labelled "zu kalkulieren". That counts enquiries
     * arriving through the marketplace, so a pro who calculates work that was
     * never an enquiry read "0 zu kalkulieren" next to five real figures, for
     * ever. A zero that can only ever be zero is not a fact about the
     * business, it is a fact about the query.
     *
     * `action` replaces the count line with an invitation. Nothing counts what
     * this tile does, because calculating is a thing you start, not a pile you
     * work through.
     */
    key: 'kalkulation', to: '/estimate', icon: Calculator,
    labelKey: 'stage_kalkulation', action: 'stage_kalkulation_go',
    fill: 'bg-paper text-ink border border-cream-deep',
    badge: 'bg-amber/15 text-amber-text',
  },
  {
    key: 'angebot', to: '/quotes', icon: FileText,
    labelKey: 'stage_angebot', unitKey: 'stage_angebot_unit',
    fill: 'bg-paper text-ink border border-cream-deep',
    badge: 'bg-amber/15 text-amber-text',
  },
  {
    key: 'auftrag', to: '/projects', icon: Handshake,
    labelKey: 'stage_auftrag', unitKey: 'stage_auftrag_unit',
    fill: 'bg-paper text-ink border border-cream-deep',
    badge: 'bg-amber/15 text-amber-text',
  },
  // ── rechts: den Auftrag liefern ──────────────────────────────────
  {
    key: 'projekt', to: '/projects?mode=project', icon: Building2,
    labelKey: 'stage_projekt', unitKey: 'stage_projekt_unit',
    fill: 'bg-paper text-ink border border-cream-deep',
    badge: 'bg-teal/10 text-teal',
  },
  {
    key: 'wartung', to: '/recurring', icon: Wrench,
    labelKey: 'stage_wartung', unitKey: 'stage_wartung_unit',
    fill: 'bg-paper text-ink border border-cream-deep',
    badge: 'bg-teal/10 text-teal',
  },
  {
    // Getting paid is the end of the chain, so it closes the right column.
    // This slot held Garantie, which had no feature behind it — no route, no
    // table, no endpoint — and rendered as a dead tile. Invoices are real,
    // and the count is money issued and not yet in the bank.
    key: 'rechnung', to: '/my-invoices', icon: Receipt,
    labelKey: 'stage_rechnung', unitKey: 'stage_rechnung_unit',
    fill: 'bg-paper text-ink border border-cream-deep',
    badge: 'bg-teal/10 text-teal',
  },
];
