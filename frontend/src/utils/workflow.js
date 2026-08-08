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
 * it. That split is why the two columns carry different colour families.
 * Order here is the DOM order, which under column flow is also the reading
 * order: down the left, then down the right.
 *
 * Colour runs light to dark down the left and dark to light down the right,
 * so the weight sits diagonally rather than banding into rows.
 */
export const STAGES = [
  // ── links: den Auftrag gewinnen ──────────────────────────────────
  {
    key: 'kalkulation', to: '/estimate', icon: Calculator,
    labelKey: 'stage_kalkulation', unitKey: 'stage_kalkulation_unit',
    fill: 'bg-stage-w1 text-on-amber',
  },
  {
    key: 'angebot', to: '/quotes', icon: FileText,
    labelKey: 'stage_angebot', unitKey: 'stage_angebot_unit',
    fill: 'bg-stage-w2 text-on-amber',
  },
  {
    key: 'auftrag', to: '/projects', icon: Handshake,
    labelKey: 'stage_auftrag', unitKey: 'stage_auftrag_unit',
    fill: 'bg-stage-w3 text-on-amber',
  },
  // ── rechts: den Auftrag liefern ──────────────────────────────────
  {
    key: 'projekt', to: '/projects?mode=project', icon: Building2,
    labelKey: 'stage_projekt', unitKey: 'stage_projekt_unit',
    fill: 'bg-stage-c1 text-ink',
  },
  {
    key: 'wartung', to: '/recurring', icon: Wrench,
    labelKey: 'stage_wartung', unitKey: 'stage_wartung_unit',
    fill: 'bg-stage-c2 text-ink',
  },
  {
    // Getting paid is the end of the chain, so it closes the right column.
    // This slot held Garantie, which had no feature behind it — no route, no
    // table, no endpoint — and rendered as a dead tile. Invoices are real,
    // and the count is money issued and not yet in the bank.
    key: 'rechnung', to: '/my-invoices', icon: Receipt,
    labelKey: 'stage_rechnung', unitKey: 'stage_rechnung_unit',
    fill: 'bg-stage-c3 text-ink',
  },
];
