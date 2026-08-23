import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, MapPin, Info, Repeat2 } from 'lucide-react';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import { fmtEur } from '../../utils/money';

/* 20 and 19 print without a decimal; a rate that is not whole keeps one. */
const fmtPct = (n) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));

/* Kilos and quantities, not money — `fmtEur` would put a currency on a weight.
   One decimal, because 25,6 kg is a measurement and 25,63 kg is a pretence. */
const fmtNum = (n) => new Intl.NumberFormat('de-AT',
  { maximumFractionDigits: 1 }).format(Number(n) || 0);

/**
 * The template list, as something you can tick rather than something you pick.
 *
 * What it replaces was a flat list of every template in a trade — 19 for Maler,
 * 20 for Garten and Sanitär — where the only thing you could do was choose one
 * and leave. Quoting a bathroom means tiling *and* plumbing *and* painting, so
 * that list made you build three documents for one job.
 *
 * Here a template is a row you can check. Checking it fetches its guided form,
 * seeds the form's own defaults and prices it; the row then carries its
 * quantity, its answers and its amount, and several checked rows become one
 * quote. The screen keeps its overview while you work: an open card is about
 * 470 px, so six other rows and the running total stay visible.
 *
 * Three rules the layout follows, each of which was a worse alternative first:
 *
 *  · **A configured row collapses to one line that still says everything** —
 *    "62 m² × 18,00 · 1.116 €" plus the answers that moved it. Without that
 *    you have to reopen a card to remember what you set, and nine rows stop
 *    being readable at all.
 *  · **A note appears once, at the thing that caused it.** Notes reach a
 *    position two ways: the template always carries them, or an answer
 *    triggered them. A note shown against its answer is not repeated in the
 *    footer — `moebel_bauseits` is both, and printing it twice is exactly the
 *    kind of thing that makes a quote look unread.
 *  · **The most severe note is the one that stays visible.** The rest fold. A
 *    "Besichtigung zuerst" that you find under three low-severity notes is a
 *    note you find after quoting.
 */

/* Severity decides colour, and colour decides whether a note is read. The
   dots are the same family the estimate screen already uses. */
const SEV_DOT = {
  critical: 'bg-red-warn',
  high: 'bg-red-warn',
  medium: 'bg-amber',
  low: 'bg-ink-faint',
};
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

/** The German is kept beside the translation everywhere; read the translation. */
const lbl = (o) => (o && (o.label || o.label_de)) || '';
const txt = (o) => (o && (o.text || o.text_de)) || '';

/* The catalogue stores units as plain ASCII — `m2`, `m3` — because they are
   keys as much as labels, and a superscript in a key is a bug waiting to
   happen. On screen they should read as units. */
const UNIT = { m2: 'm²', m3: 'm³' };
const unit = (u) => UNIT[u] || u;

/* The API takes numbers; the inputs hold strings, and a half-typed "1," is
   not one. Anything unparseable is dropped rather than sent as NaN, so a
   quantity in the middle of being typed leaves the estimate on its last good
   figure instead of blanking the card. */
function numeric(overrides) {
  const out = {};
  Object.entries(overrides || {}).forEach(([k, v]) => {
    const n = Number(String(v).replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  });
  return out;
}

const round2 = (n) => Math.round(n * 100) / 100;

/** One line's net, with its own waste factor. */
const lineNet = (ln) => ln.qty * (1 + (ln.waste_factor || 0)) * ln.unit_price;

/**
 * The positions that are in the price, and what they come to.
 *
 * `lines_net` is the estimator's sum of everything it wrote. Once a pro can
 * untick a position that is no longer the number on the card, so the card
 * adds up what is left — and the quote drops the same lines, so the two agree
 * by construction rather than by coincidence.
 */
function included(est, excluded) {
  const out = (est?.lines || []).filter((ln) => !(excluded || []).includes(ln.rate_key));
  return { lines: out, net: round2(out.reduce((n, ln) => n + lineNet(ln), 0)) };
}

/**
 * What this position comes to after its Nachlass.
 *
 * Two figures, both live at once: a percentage and an amount off. They apply
 * in that order — the percentage against the position, the amount against
 * what the percentage left — which is the order a Nachlass is written in, and
 * the only order in which "10 % und 50 EUR" means one thing. Clamped at zero:
 * 400 EUR off a 378 EUR position is a typo, not a position the pro pays the
 * customer to do.
 *
 * `pct_effective` is the two of them expressed as the single percentage that
 * produces the same net, because `quote_lines.discount_pct` is the only
 * discount column the schema has and a fixed amount has nowhere else to go.
 * The arithmetic is exact; what it costs is that the quote prints one
 * percentage rather than the two figures the pro typed.
 */
function discountOf(state, amount) {
  const num = (v) => Math.max(Number(String(v ?? '').replace(',', '.')) || 0, 0);
  const pct = Math.min(num(state?.discount), 100);
  const eur = num(state?.discountEur);
  if (amount == null || !(amount > 0)) return { pct, eur, net: amount, pct_effective: 0 };
  const net = Math.max(amount * (1 - pct / 100) - eur, 0);
  return { pct, eur, net, pct_effective: round2((1 - net / amount) * 100) };
}

/** Has this position a quantity somebody actually typed? */
function hasQty(state) {
  const qq = qtyQuestion(state?.form);
  if (!qq) return true;               // a Pauschale job prices without one
  const v = state.answers[qq.key];
  return v !== undefined && v !== null && v !== '' && Number(v) > 0;
}

/** The quantity question, which is the one field that is always editable. */
function qtyQuestion(form) {
  return (form || []).find((q) => q.is_quantity)
      || (form || []).find((q) => q.affects === 'qty' && q.type === 'number');
}

/**
 * Which notes belong to which answer, and which belong to the position itself.
 *
 * `note_if` on a question maps an answer to a note key, so a note the pro
 * caused can be shown where they caused it. Everything else the estimate
 * returned is a property of the template and goes in the footer. The set
 * difference is what stops a note appearing twice.
 */
function splitNotes(est, form, answers) {
  const byField = new Map();
  const claimed = new Set();
  (form || []).forEach((q) => {
    const map = q.note_if || {};
    const given = answers[q.key];
    if (given === undefined || given === null) return;
    const key = map[String(given)];
    if (!key) return;
    const note = (est.notes || []).find((n) => n.key === key);
    if (!note) return;
    byField.set(q.key, note);
    claimed.add(key);
  });
  const always = (est.notes || []).filter((n) => !claimed.has(n.key));
  return { byField, always };
}

/** The note a pro must not miss: worst severity wins, ties go to the first. */
function topNote(notes) {
  return [...(notes || [])].sort(
    (a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9))[0];
}

function Note({ note, tone = 'normal' }) {
  /* Severity is carried by the dot, the border and the fill — not by the text
     colour. `red-warn` on a tint of itself measures 4.53:1 at 6 % and fails
     outright at 7 %, so the one element that has to be readable would have been
     the one riding closest to the limit. Ink on the same fill is 10.7:1 and the
     note still reads as the severe one. */
  if (!note) return null;
  const severe = note.severity === 'critical' || note.severity === 'high';
  return (
    <div className={`flex gap-2 rounded-[9px] border px-2.5 py-2 text-[11px] leading-relaxed
                     ${severe ? 'border-red-warn/40 bg-red-warn/[.06] text-ink'
                              : 'border-amber/25 bg-amber/[.07] text-ink-soft'}
                     ${tone === 'flat' ? 'border-0 bg-transparent px-0 py-1' : ''}`}>
      <span className={`mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full
                        ${SEV_DOT[note.severity] || 'bg-ink-faint'}`} />
      <span>{txt(note)}</span>
    </div>
  );
}

/**
 * How the price is made up — the positions the estimator actually wrote.
 *
 * This is the part of the card the whole design round was about. Without it
 * the card offers one number and no way to argue with it: a pro who thinks
 * 32 m² of woodchip is four hours and not six has nowhere to say so, and a
 * customer who asks what the 8,50 € covers gets an answer only the app knows.
 *
 * Every quantity here is editable and goes back as `qty_overrides`, keyed by
 * rate key — the estimator has taken that parameter since the beginning and
 * nothing on this screen ever sent one. The unit price is not editable and
 * that is deliberate: what a unit costs is the rate card, one rate key at a
 * time, and folding it in here would silently fork a business's pricing per
 * quote. A line the pro has moved says so, because a corrected estimate and a
 * model's own estimate are different claims.
 */
function Breakdown({ est, overrides, rates, excluded, onQty, onRate, onInclude, t, tid }) {
  const lines = est?.lines || [];
  if (!lines.length) return null;
  const moved = new Set(est.qty_adjusted || []);
  const out = new Set(excluded || []);
  const kept = lines.filter((ln) => !out.has(ln.rate_key));
  return (
    <div className="mt-3">
      <p className="text-[9px] font-extrabold uppercase tracking-[.06em] text-ink-muted mb-1.5">
        {t('est_breakdown')}
      </p>
      <div className="rounded-[11px] border border-rule overflow-hidden">
        {lines.map((ln) => {
          const own = overrides?.[ln.rate_key];
          const rate = rates?.[ln.rate_key];
          const qty = own !== undefined && own !== '' ? Number(own) : ln.qty;
          const price = rate !== undefined && rate !== '' ? Number(rate) : ln.unit_price;
          const sum = qty * (1 + (ln.waste_factor || 0)) * price;
          const on = !out.has(ln.rate_key);
          return (
            <div key={ln.rate_key + ln.description}
                 className={`flex gap-2 px-2.5 py-2 border-b border-rule/60 last:border-b-0
                             ${!on ? 'bg-row'
                               : ln.kind === 'material' ? 'bg-teal/[.04]' : 'bg-paper'}`}>
              {/* In the price, or not. An unticked position keeps its figures
                  and stays legible — it is a thing you can put back, not a
                  thing deleted — and it is dropped from the quote entirely
                  rather than written as an option the customer can ask for. */}
              <button type="button" onClick={() => onInclude(ln.rate_key, !on)}
                      aria-pressed={on} aria-label={ln.description}
                      data-testid={`estimate-line-on-${tid}-${ln.rate_key}`}
                      className={`mt-[3px] grid h-[19px] w-[19px] shrink-0 place-items-center
                                  rounded-[6px] border-[1.6px] focus-visible:outline-none
                                  focus-visible:ring-4 focus-visible:ring-teal/30
                                  ${on ? 'border-teal bg-teal'
                                       : 'border-ink-faint/50 bg-paper'}`}>
                {on && (
                  <svg viewBox="0 0 12 10" aria-hidden="true"
                       className="h-[8px] w-[10px] fill-none stroke-white stroke-[2.4]">
                    <path d="M1 5l3.2 3.2L11 1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <div className={`min-w-0 flex-1 ${on ? '' : 'opacity-55'}`}>
              <p className="flex items-center gap-1.5">
                <span className="flex-1 min-w-0 text-[11.5px] font-bold text-ink leading-snug">
                  {ln.description}
                </span>
                <span className={`shrink-0 rounded-full px-1.5 py-[1px] text-[8.5px] font-extrabold
                                  ${ln.kind === 'material' ? 'bg-teal/15 text-teal'
                                    : ln.kind === 'other' ? 'bg-amber/20 text-amber-text'
                                                          : 'bg-navy/10 text-navy'}`}>
                  {t(ln.kind === 'material' ? 'est_kind_material'
                    : ln.kind === 'other' ? 'est_kind_other' : 'est_kind_labour')}
                </span>
              </p>
              <p className="mt-1.5 flex items-center gap-1.5">
                {/* Editable, and filled so it reads as a field rather than as
                    a printed figure. */}
                <span className="inline-flex items-center rounded-[8px] border border-navy/25
                                 bg-navy/[.05] pl-1.5 pr-1">
                  <input
                    type="number" inputMode="decimal" min="0" step="any"
                    value={own !== undefined ? own : ln.qty}
                    onChange={(e) => onQty(ln.rate_key, e.target.value)}
                    data-testid={`estimate-line-qty-${tid}-${ln.rate_key}`}
                    aria-label={`${ln.description} — ${t('est_qty')}`}
                    className="w-[52px] bg-transparent py-1 text-right text-[12px]
                               font-bold text-ink outline-none"
                  />
                  <u className="not-italic no-underline pl-1 text-[9.5px] font-bold text-ink-muted">
                    {unit(ln.unit)}
                  </u>
                </span>
                <b className="text-[11px] font-bold text-ink-muted">×</b>
                {/* The unit price, and it is a field like everything else.
                    Editing it writes this business's rate for this rate key —
                    `maler.stundensatz` really is the hourly rate, and changing
                    it here changes it everywhere, which is why the line below
                    says so. It persists: the estimator has always read
                    `pro_rates` in preference to the catalogue, and until now
                    the only way to put a figure in there was to have a quote
                    accepted or to go and find the settings screen. */}
                <span className="inline-flex items-center rounded-[8px] border border-navy/25
                                 bg-navy/[.05] pl-1.5 pr-1">
                  <input
                    type="number" inputMode="decimal" min="0" step="any"
                    value={rate !== undefined ? rate : ln.unit_price}
                    onChange={(e) => onRate(ln, e.target.value)}
                    data-testid={`estimate-line-rate-${tid}-${ln.rate_key}`}
                    aria-label={`${ln.description} — ${t('est_unit_price')}`}
                    className="w-[54px] bg-transparent py-1 text-right text-[12px]
                               font-bold text-ink outline-none"
                  />
                  <u className="not-italic no-underline pl-1 text-[9.5px] font-bold text-ink-muted">
                    €
                  </u>
                </span>
                <em className="ml-auto not-italic text-[13px] font-extrabold text-navy
                               tabular-nums">{fmtEur(sum)}</em>
              </p>
              {(moved.has(ln.rate_key) || own !== undefined) && (
                <p className="mt-1 flex items-center gap-2 text-[9.5px] font-bold text-amber-text">
                  {/* Just "your figure" — not "the catalogue said N". The
                      estimator applies the override and echoes the corrected
                      quantity back on `qty`, so the model's original is not in
                      the response to quote. Reset is what recovers it. */}
                  {t('est_line_yours')}
                  <button type="button" onClick={() => onQty(ln.rate_key, undefined)}
                          className="rounded-full border border-rule bg-paper px-1.5 py-[1px]
                                     text-[9px] font-extrabold text-navy">
                    {t('est_line_reset')}
                  </button>
                </p>
              )}
              {(est.repriced || []).includes(ln.rate_key) && (
                <p className="mt-1 flex items-center gap-2 text-[9.5px] font-bold text-teal">
                  {t('est_rate_yours')}
                  <button type="button" onClick={() => onRate(ln, undefined)}
                          data-testid={`estimate-rate-reset-${tid}-${ln.rate_key}`}
                          className="rounded-full border border-rule bg-paper px-1.5 py-[1px]
                                     text-[9px] font-extrabold text-navy">
                    {t('est_line_reset')}
                  </button>
                </p>
              )}
              </div>
            </div>
          );
        })}
        <p className="flex items-baseline gap-2 bg-navy/[.06] px-2.5 py-2 text-[12px]
                      font-extrabold text-ink">
          <span>{t('est_positions')}</span>
          {kept.length < lines.length && (
            <span className="text-[10px] font-bold text-ink-muted">
              {t('est_positions_of', { n: kept.length, total: lines.length })}
            </span>
          )}
          <b className="ml-auto tabular-nums text-navy">
            {fmtEur(kept.reduce((n, ln) => n + lineNet(ln), 0))}
          </b>
        </p>
      </div>
    </div>
  );
}

/**
 * The waste, in kilos before it is in euros.
 *
 * The catalogue prices a tonne — `disposal_per_tonne`, 130–260 €/t for Austrian
 * Sperrmüll — and carries `debris_kg_per_unit` per operation, so the euro
 * figure on a small job is genuinely small: 32 m² of woodchip is 25,6 kg and
 * about five euros. A pro reading "4,99 €" with no kilos beside it assumes the
 * app has lost a decimal. With the kilos there they can see it is right, and
 * see the thing the catalogue does *not* price: the trip to the Mistplatz.
 */
function Waste({ est, t }) {
  const kg = est?.debris_kg || [0, 0];
  if (!(kg[1] > 0)) return null;
  /* The euro figure the *positions* carry, not the top of the disposal range.
     The estimator writes one disposal line at the midpoint of that range and
     puts the range itself in `disposal`, so printing `disposal[1]` here made
     this block disagree with the line three rows above it — 9,98 € against
     5,82 € for the same rubbish. */
  const line = (est.lines || []).find((l) => l.kind === 'other');
  const eur = line ? line.qty * (1 + (line.waste_factor || 0)) * line.unit_price
                   : (est.disposal || [0, 0])[1];
  return (
    <div className="mt-3 rounded-[11px] border border-amber/30 bg-amber/[.07] px-2.5 py-2">
      <p className="text-[9px] font-extrabold uppercase tracking-[.06em] text-amber-text">
        {t('est_waste')}
      </p>
      <p className="mt-1 flex items-baseline gap-2 text-[12px] font-bold text-ink">
        <span>{kg[0] === kg[1] ? `${fmtNum(kg[1])} kg`
          : `${fmtNum(kg[0])} – ${fmtNum(kg[1])} kg`}</span>
        <b className="ml-auto tabular-nums text-[13px] font-extrabold text-amber-text">
          {fmtEur(eur)}
        </b>
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-ink-soft">
        {est.container ? t('est_waste_container', { c: est.container })
          : t('est_waste_no_container')}
      </p>
    </div>
  );
}

/**
 * The check a pro would do in their head, done on the card.
 *
 * `market_band` is what the catalogue says this work goes for, and until now it
 * was printed on the collapsed row and nowhere else — so the one moment it
 * matters, when a quantity or an answer has just moved the price, it was off
 * screen. Comparing the same basis the band is quoted on: `per_unit` bands
 * against €/unit, `total` bands against the position total.
 */
function BandCheck({ est, job, net, t }) {
  const band = est?.market_band;
  if (!band || band.length !== 2) return null;
  const perUnit = est.band_basis === 'per_unit';
  /* `lines_net / qty`, never `per_unit[1]`.
     `per_unit` is the top of the model's *range* divided by the quantity, and
     the card quotes what the positions come to. Checking one against the band
     while quoting the other is how a position that quotes at 11,18 €/m² —
     comfortably inside a 5–12 band — got flagged as 18,87 €/m² and over it.
     The check has to judge the figure the customer will actually be sent, so
     it takes the net the card arrived at: after positions were unticked,
     after prices were typed over, after the Nachlass. */
  const value = perUnit ? (est.qty ? net / est.qty : null) : net;
  if (!value) return null;
  const span = band[1] - band[0];
  const pos = span > 0 ? ((value - band[0]) / span) * 100 : 100;
  const inside = value >= band[0] && value <= band[1];
  /* Clamped for the bar only. The figure beside it is never clamped, and the
     sentence says which side it fell off — a marker parked on the end of a
     bar reads as "just about inside", which is the opposite of the truth. */
  const at = Math.max(0, Math.min(100, pos));
  return (
    <div className="mb-3 rounded-[11px] border border-navy/15 bg-navy/[.04] px-2.5 py-2"
         data-testid="estimate-band">
      <p className="text-[9px] font-extrabold uppercase tracking-[.06em] text-ink-muted">
        {t('est_check')}
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <b className="text-[15px] font-extrabold text-navy tabular-nums">
          {fmtEur(value)}{perUnit ? ` / ${unit(job.unit)}` : ''}
        </b>
        <span className={`ml-auto rounded-full px-1.5 py-[1px] text-[9px] font-extrabold
                          ${inside ? 'bg-green-pos/15 text-green-text'
                                   : 'bg-amber/20 text-amber-text'}`}>
          {inside ? t('est_check_in') : value > band[1] ? t('est_check_over')
                                                        : t('est_check_under')}
        </span>
      </p>
      <div className="relative mt-2 h-[7px] rounded-full bg-navy/10">
        <span className="absolute inset-y-0 left-0 right-0 rounded-full bg-green-pos/30" />
        <span className="absolute -top-[3px] h-[13px] w-[2px] rounded-full bg-navy"
              style={{ left: `${at}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-ink-soft">
        {t('est_check_band', { lo: fmtEur(band[0]), hi: fmtEur(band[1]),
          u: perUnit ? `/ ${unit(job.unit)}` : '' })}
      </p>
    </div>
  );
}

/* Per-zone chrome.

   `rest` is the card at rest — not open, not ticked — and it is the only state
   the zone tint applies to. Both other states go white, and that is the point
   rather than a shortcut: inside a tinted panel, `paper` is the lightest
   surface available, so a card that is ticked or open lifts off the zone
   instead of sinking into it.

   The obvious thing — keeping the `bg-teal/[.03]` wash that means "in the
   quote" everywhere else — does the opposite here. A Tailwind opacity utility
   composites over what is behind the element, which inside a zone is the
   panel, not the page; the ticked card came out darker than the untouched
   ones around it, so selecting a template made it recede. */
const ZONE = {
  innen: {
    panel: 'bg-teal/[.09] border-teal/20',
    head: 'text-teal',
    rest: 'border-teal/20 bg-zone-in',
    picked: 'border-teal bg-paper',
    box: 'border-teal/50',
  },
  aussen: {
    panel: 'bg-amber/[.09] border-amber/30',
    head: 'text-amber-text',
    rest: 'border-amber/30 bg-zone-out',
    picked: 'border-teal bg-paper',
    box: 'border-amber/60',
  },
};

/** One template: a checkbox, and everything it needs once it is checked. */
function Card({ job, state, onToggle, onOpen, onAnswer, onLineQty, onLineRate,
                onInclude, onPerUnit, onDiscount, t, zone, alsoIn, section, vat }) {
  const vatRate = Number(vat?.rate) || 0;
  const z = ZONE[zone];
  /* A cross-listed template is on the page twice, so its test ids have to say
     which copy. Rows that appear once keep the plain id they always had —
     `alsoIn` is set on every copy of a duplicated template and on nothing
     else, so "has a suffix" and "is duplicated" are the same statement. */
  const tid = alsoIn ? `${job.key}@${section}` : job.key;
  // Ticked, which is not the same as on screen: a card can be open because
  // somebody wanted to read it without putting it in the quote.
  const checked = !!state?.checked;
  const est = state?.est;
  /* Open where it was opened. A cross-listed template shares one state object
     between its two copies, so `state.open` alone would expand both — two
     identical forms, hundreds of pixels apart, for one position. */
  const open = !!state?.open && state.openIn === section;
  // Memoised so the empty-array fallback is not a new array on every
  // render, which would make the summary below recompute continuously.
  const form = useMemo(() => state?.form || [], [state]);
  const qq = qtyQuestion(form);
  /* `lines_net`, not `total_net[1]`.
   *
   * The estimator returns two different things. `total_net` is a *range* —
   * what the model says the work is worth, low to high — and `lines_net` is
   * what the positions it wrote actually come to. Both are real and the
   * estimator's own docstring says they are allowed to disagree.
   *
   * This screen showed the top of the range and then built the quote out of
   * the positions, so a Wohnung priced at 3.387,74 € here arrived as a
   * 2.247,81 € quote — a third lower, with nothing on screen to explain it.
   * The number beside a tick-box that becomes a quote has to be the number
   * the quote will carry. The range still has a place, but it is on the
   * single-job page, which prints it as a guide beside the same `lines_net`. */
  const inc = included(est, state?.excluded);
  const qtyNow = Number(est?.qty) || 0;
  /* What the included positions come to, divided by the quantity — so it
     moves when they do, and a position unticked below changes it. Held as the
     typed string while somebody is typing into it. */
  const perUnitShown = state?.perUnit !== undefined && state.perUnit !== ''
    ? state.perUnit
    : (qtyNow > 0 && est ? round2(inc.net / qtyNow) : '');
  const amount = est ? inc.net : null;
  const dropped = est ? (est.lines || []).length - inc.lines.length : 0;
  const { pct: disc, eur: discEur, net } = discountOf(state, amount);
  const given = amount == null ? 0 : amount - net;
  /* The combined figure only when there are two to combine — repeating one
     line's own amount as its "zusammen" says nothing. */
  const both = disc > 0 && discEur > 0;

  /* The answers worth repeating on a collapsed row: the ones that moved the
     price. `answers_applied` is the estimator's own list, so this cannot
     drift from what the arithmetic actually used. */
  const summary = useMemo(() => {
    if (!est) return '';
    const applied = est.answers_applied || [];
    return applied
      .map((key) => {
        const q = form.find((x) => x.key === key);
        if (!q) return null;
        const given = state.answers[key];
        const opt = (q.options || []).find(([v]) => String(v) === String(given));
        return opt ? opt[1] : null;
      })
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ');
  }, [est, form, state]);

  const { byField, always } = est
    ? splitNotes(est, form, state.answers) : { byField: new Map(), always: [] };
  const footer = topNote(always);
  const hidden = (always.length ? always.length - 1 : 0) + Math.max(byField.size - 1, 0);

  /* Fields other than the quantity, two to a row. Bool questions get a full
     row because a switch beside a select reads as one control with a stray
     tick next to it. */
  const fields = form.filter((q) => q !== qq && q.key !== 'condition' && q.key !== 'access');

  return (
    <div data-testid={`estimate-card-${tid}`}
         className={`rounded-[14px] border overflow-hidden transition-colors
                     ${open ? 'border-navy shadow-[0_2px_10px_rgba(30,84,144,.10)] bg-paper'
                            : checked ? (z?.picked || 'border-transparent bg-teal/[.07]')
                                      : (z?.rest || 'border-transparent bg-row')}`}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button type="button" onClick={() => onToggle(job.key, section)}
                aria-pressed={checked} aria-label={lbl(job)}
                data-testid={`estimate-check-${tid}`}
                className={`h-5 w-5 shrink-0 rounded-[6px] border-[1.6px] flex items-center
                            justify-center focus-visible:outline-none focus-visible:ring-4
                            focus-visible:ring-teal/30
                            ${checked ? 'border-teal bg-teal'
                                      : (z?.box || 'border-ink-faint/50')}`}>
          {checked && (
            <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true">
              <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="2"
                    fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <button type="button" onClick={() => onOpen(job.key, section)}
                data-testid={`estimate-open-${tid}`}
                className="min-w-0 flex-1 text-left focus-visible:outline-none
                           focus-visible:ring-4 focus-visible:ring-teal/30 rounded">
          <span className="block font-bold text-ink text-[13px] leading-tight">{lbl(job)}</span>
          <span className="block text-[10px] text-ink-muted mt-[2px] leading-snug">
            {checked && summary ? summary
              : `${job.market_band?.[0] ?? ''}–${job.market_band?.[1] ?? ''} €/${unit(job.unit)}`}
            {job.site_visit_required && (
              <span className="text-red-warn"> · {t('est_site_visit')}</span>
            )}
          </span>
          {/* The same template, seen from its other group. Without this the
              duplicate reads as a second, near-identical template — and the
              pro's next question is which of the two to quote. There is only
              one: same key, same price, one position, and ticking it here
              ticks it there. */}
          {alsoIn && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full
                             bg-ink/[.05] px-1.5 py-[1px] text-[9px] font-semibold
                             text-ink-muted">
              <Repeat2 size={9} aria-hidden="true" />
              {t('est_also_in', { s: alsoIn })}
            </span>
          )}
        </button>

        {checked && !open && (amount != null ? (
          <span className="text-right whitespace-nowrap">
            <span className="block font-extrabold text-[13px] text-ink">{fmtEur(net)}</span>
            <span className="block text-[9px] text-ink-muted">
              {est.qty} {unit(job.unit)}
            </span>
          </span>
        ) : (
          <span className="whitespace-nowrap text-[10px] font-bold text-amber-text">
            {t('est_needs_qty')}
          </span>
        ))}
        {state?.loading && <Loader2 size={14} className="animate-spin text-teal" />}
        {/* The chevron is what people aim at to expand a row, so it has to be
            the thing that expands it. It was decoration next to a title that
            carried the click, which left the one control that looks like a
            control doing nothing. Its own hit area, not a wider title button:
            44 px of tappable target at the end of the row. */}
        <button type="button" onClick={() => onOpen(job.key, section)}
                aria-expanded={!!open} aria-label={`${lbl(job)} — ${t('est_details')}`}
                data-testid={`estimate-expand-${tid}`}
                className="-my-2 -mr-1 shrink-0 px-1 py-2 rounded focus-visible:outline-none
                           focus-visible:ring-4 focus-visible:ring-teal/30">
          <ChevronDown size={14} aria-hidden="true"
                       className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && state && (
        <div className="border-t border-rule bg-paper px-3 py-3">
          {/* First, under the title, above the quantity.
              It was the last thing on the card, which put the one line that
              says whether the price is sane below the Brutto that the price
              had already become — you read the verdict after you had read the
              number it was a verdict on. It is a reading of the €/unit
              against the catalogue's own band, so it belongs beside the two
              fields that produce it. */}
          <BandCheck est={est} job={job} net={net} t={t} />

          {/* Until there is a quantity the two fields sit inside a green
              block that says what is missing, directly under the title.
              It was a placeholder further down, in the gap the breakdown
              will fill — which is the right place for a result and the wrong
              place for an instruction: you read it after scrolling past the
              field it is asking you to fill.

              The green wraps the fields rather than sitting above them, so
              the note ends where the work ends and there is no doubt what it
              refers to. Type a quantity and the block turns white.

              green-pos is a fill and the config says it "fails as text
              everywhere it has been used", so the wash is green-pos at 20 %
              and the words are green-text: 4.72:1, comfortably past AA. */}
          <div className={!est ? 'mb-[18px] rounded-[11px] border-[1.5px] border-green-text/25 bg-green-pos/20 px-3 pb-3 pt-2.5' : ''}
               data-testid={!est ? `estimate-awaiting-${tid}` : undefined}>
          {!est && (
            <p className="mb-2 text-[12px] font-extrabold text-green-text">
              {t('est_awaiting_qty', { u: unit(job.unit) })}
            </p>
          )}
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="block text-[9px] font-extrabold uppercase tracking-[.06em]
                               text-ink-muted mb-1">
                {qq ? lbl(qq) : t('est_qty')}
              </span>
              <input
                type="number" inputMode="decimal" min="0"
                value={qq ? (state.answers[qq.key] ?? '') : ''}
                onChange={(e) => qq && onAnswer(job.key, qq.key, e.target.value)}
                placeholder={unit(job.unit)}
                data-testid={`estimate-qty-${tid}`}
                /* Filled, like every other field on this card you can type
                   into. What you can change and what the app worked out are
                   two different things and they should not look alike. */
                className="w-full rounded-[9px] border border-navy/25 bg-navy/[.05] px-2.5 py-2
                           text-right text-[13px] font-bold text-ink"
              />
            </label>
            {/* Derived, not editable: the positions divided by the quantity,
                across four separate rate keys — labour, covering, material,
                setup — so there is no single number here to type into.
                Changing what a unit costs is what the rate card does, one rate
                key at a time, and it is one tap away rather than silently
                folded in.

                It used to print `per_unit[1]`, which is the top of the
                estimator's *range* over the quantity — 18,87 €/m² beside a
                card totalling 357,81 € on 32 m², a figure that multiplies back
                out to 603,84 €. The plate now divides the same total the card
                quotes, so the three numbers on screen agree. */}
            <div className="flex-1">
              <span className="block text-[9px] font-extrabold uppercase tracking-[.06em]
                               text-ink-muted mb-1">€ / {unit(job.unit)}</span>
              {/* A field now, not a plate.
                  It was derived and locked on the grounds that it is the
                  positions divided by the quantity and there is no single
                  number underneath to type into. True of the arithmetic and
                  wrong about the job: a painter knows they charge 8,50 the m²
                  and wants to say so. Typing one scales every position by the
                  same factor, so the breakdown still adds up to the figure
                  above it, and the scaled prices travel with this position —
                  without touching the rate card the whole business quotes
                  from. */}
              <input
                type="number" inputMode="decimal" min="0" step="any"
                value={perUnitShown}
                onChange={(e) => onPerUnit(job.key, inc.lines, qtyNow, e.target.value)}
                placeholder="—"
                data-testid={`estimate-per-unit-${tid}`}
                className="w-full rounded-[9px] border border-navy/25 bg-navy/[.05] px-2.5 py-2
                           text-right text-[13px] font-bold text-ink outline-none"
              />
            </div>
          </div>
          </div>

          {est?.rates_applied > 0 && (
            <p className="mt-1.5 text-[10px] font-bold text-teal">
              {t('est_own_rate')} · {est.rates_applied}/{est.lines.length}
            </p>
          )}

          <div className="mt-3 space-y-2.5">
            {fields.map((q) => {
              /* `price_effect` has been on every question since the form was
                 built and nothing on screen used it, so a question worth
                 +15–30 % looked exactly like one that only writes a sentence
                 into the quote. "note" is the only value that moves nothing. */
              const free = q.price_effect === 'note';
              /* Every answer is a chip: all of them visible, one tap to
                 change. A select hides the answers behind a tap and then makes
                 you aim at a list — on a phone, on a building site, with the
                 other hand holding something.

                 Three or fewer sit in one row. Four or more go two to a row,
                 because "Raufaser, mehrfach überstrichen" is not a thing you
                 can fit four of across 360 px — and the option a painter picks
                 most is the one the shortest label belongs to, so truncating
                 was never an option either. An odd last chip takes the full
                 width rather than leaving a hole. */
              const opts = q.type === 'bool'
                ? [[false, t('no')], [true, t('yes')]]
                : (q.options || []);
              const chips = opts.length > 0;
              const given = q.type === 'bool'
                ? !!state.answers[q.key] : state.answers[q.key] ?? '';
              const pick = (v) => onAnswer(job.key, q.key, v);
              return (
                <div key={q.key}>
                  <span className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase
                                   tracking-[.06em] text-ink-muted mb-1">
                    <span className="min-w-0 truncate">{lbl(q)}</span>
                    {free && (
                      <span className="shrink-0 rounded-full bg-ink/[.06] px-1.5 py-[1px]
                                       text-[8px] font-extrabold tracking-normal normal-case
                                       text-ink-muted">{t('est_effect_note')}</span>
                    )}
                  </span>
                  {chips ? (
                    /* Cards, two to a row.
                       The joined segmented block it replaces was drawn for
                       three short words, and the catalogue's answers are not
                       short words: "Raufaser, mehrfach überstrichen" wrapped
                       to two lines beside a neighbour that took one, so every
                       row came out ragged, and the chosen answer was a heavy
                       navy slab in an otherwise white card.

                       Separate cells of equal minimum height wrap without
                       going ragged, and selection is a tinted fill with a
                       navy edge and a tick — the answer sits in the card
                       rather than on top of it. An odd last card takes the
                       full width instead of leaving a hole. */
                    <div role="group" aria-label={lbl(q)}
                         data-testid={`estimate-field-${tid}-${q.key}`}
                         className="grid grid-cols-2 gap-1.5">
                      {opts.map(([v, l], i) => {
                        const on = String(v) === String(given);
                        const last = i === opts.length - 1;
                        const span = last && opts.length % 2 ? 'col-span-2' : '';
                        return (
                          <button
                            key={String(v)} type="button" aria-pressed={on}
                            onClick={() => pick(v)}
                            data-testid={`estimate-opt-${tid}-${q.key}-${v}`}
                            className={`relative min-h-[46px] min-w-0 rounded-[11px] border
                                        px-2.5 py-2 pr-6 text-left text-[12px] font-bold
                                        leading-tight focus-visible:outline-none
                                        focus-visible:ring-4 focus-visible:ring-teal/30 ${span}
                                        ${on ? 'border-[1.5px] border-navy bg-navy/[.07] text-ink'
                                             : 'border-rule bg-paper text-ink-soft'}`}>
                            {l}
                            {on && (
                              <svg viewBox="0 0 12 10" aria-hidden="true"
                                   className="absolute right-2 top-2 h-[9px] w-[11px]
                                              fill-none stroke-navy stroke-[2.2]">
                                <path d="M1 5l3.2 3.2L11 1.4" strokeLinecap="round"
                                      strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <select
                      value={q.type === 'bool' ? String(given) : given}
                      onChange={(e) => pick(q.type === 'bool'
                        ? e.target.value === 'true' : e.target.value)}
                      data-testid={`estimate-field-${tid}-${q.key}`}
                      className={`w-full rounded-[10px] border px-2.5 py-2.5 text-[12px] text-ink
                                  ${free ? 'border-rule bg-paper'
                                         : 'border-navy/25 bg-navy/[.05] font-semibold'}`}>
                      {opts.map(([v, l]) => (
                        <option key={String(v)} value={String(v)}>{l}</option>
                      ))}
                    </select>
                  )}
                  {byField.has(q.key) && (
                    <div className="mt-1.5"><Note note={byField.get(q.key)} /></div>
                  )}
                </div>
              );
            })}
          </div>

          {/* The three blocks the card was missing: what the price is made of,
              what comes out of the flat in kilos, and whether the result still
              sits where the catalogue says this work sits. All three are drawn
              from the estimate that is already on screen — none of them costs
              a request. */}
          <Breakdown est={est} overrides={state.qtyOverrides} rates={state.rateEdits}
                     excluded={state.excluded} tid={tid} t={t}
                     onQty={(rateKey, v) => onLineQty(job.key, rateKey, v)}
                     onRate={(ln, v) => onLineRate(job.key, ln, v)}
                     onInclude={(rateKey, on) => onInclude(job.key, rateKey, on)} />
          <Waste est={est} t={t} />

          {footer && <div className="mt-3"><Note note={footer} /></div>}
          {hidden > 0 && (
            <button type="button" onClick={() => onOpen(job.key, section, 'notes')}
                    data-testid={`estimate-more-notes-${tid}`}
                    className="mt-2 flex items-center gap-1 text-[11px] font-bold text-teal">
              <Info size={12} /> {hidden === 1 ? t('est_one_more_note')
                : t('est_more_notes', { n: hidden })}
            </button>
          )}
          {state.showNotes && (
            <div className="mt-2 space-y-1" data-testid={`estimate-all-notes-${tid}`}>
              {always.filter((n) => n !== footer).map((n) => (
                <Note key={n.key} note={n} tone="flat" />
              ))}
              {[...byField.values()].filter((n) => n !== footer).map((n) => (
                <Note key={`f-${n.key}`} note={n} tone="flat" />
              ))}
            </div>
          )}

          {/* The Nachlass, in its own block rather than as two rows in the
              tax column.

              It is the one thing in this part of the card somebody decides;
              everything under it is arithmetic. As rows in that column the
              two fields never lined up and could not be made to — the boxes
              started after labels of different widths, ended at different
              widths, and carried a % and a € that are not the same width
              either — so the fix is to stop them being rows in it.

              Per position rather than per document, because that is where a
              tradesperson actually gives ground: the painting is keen and the
              scaffolding is not. It writes `quote_lines.discount_pct`, a
              column the schema has carried from the start, that the invoice
              already applies, and that nothing had ever set.

              Neutral until something is entered. A quote with no Nachlass is
              the normal case, and an amber block on every position of every
              card would shout on all of them. Nothing moves when it fills —
              same block, same rows, different colour. */}
          {amount != null && (
            <div data-testid={`estimate-discount-block-${tid}`}
                 className={`mt-3 rounded-xl border px-3 py-2.5 ${given > 0
                   ? 'border-amber/40 bg-amber/[.09]' : 'border-rule bg-row'}`}>
              <p className={`flex items-baseline text-[9.5px] font-extrabold uppercase
                             tracking-[.07em] ${given > 0 ? 'text-amber-text' : 'text-ink-muted'}`}>
                <span>{t('est_discount')}</span>
                {both && (
                  <b className="ml-auto text-[12.5px] font-extrabold normal-case tracking-normal
                                tabular-nums">− {fmtEur(given)}</b>
                )}
              </p>

              {[['discount', '%', disc, amount * disc / 100, 100],
                ['discountEur', '€', discEur, Math.min(discEur, amount * (1 - disc / 100)), null]]
                .map(([field, sym, value, off, max]) => (
                  <p key={field} className="mt-1.5 flex items-center gap-2">
                    {/* Both boxes are the same element at the same width, first
                        in the row, so they start and end on the same two
                        verticals whatever is beside them. */}
                    <span className={`inline-flex w-[78px] items-center rounded-[8px] border
                                      bg-paper pl-2 pr-1.5 ${given > 0
                                        ? 'border-amber/50' : 'border-rule'}`}>
                      <input
                        type="number" inputMode="decimal" min="0" step="any"
                        {...(max ? { max } : {})}
                        value={state[field] ?? ''} placeholder="0"
                        onChange={(e) => onDiscount(job.key, field, e.target.value)}
                        data-testid={`estimate-${field === 'discount' ? 'discount' : 'discount-eur'}-${tid}`}
                        aria-label={`${t('est_discount')} ${sym}`}
                        className="w-full bg-transparent py-[5px] text-right text-[12px]
                                   font-bold text-ink outline-none"
                      />
                      <u className="not-italic no-underline pl-1.5 w-[11px] text-[10px]
                                    font-bold text-ink-muted">{sym}</u>
                    </span>
                    {value > 0 && (
                      <b className="ml-auto text-[12px] font-extrabold text-ink tabular-nums">
                        − {fmtEur(off)}
                      </b>
                    )}
                  </p>
                ))}
            </div>
          )}

          {/* Netto, USt., Brutto — the last thing on the card, because the
              gross is the number that leaves it. Filled, like everything else
              here the app worked out rather than took from you.

              The rate is the pro's own, fetched with the catalogue: a
              Kleinunternehmer charges nothing and assuming twenty percent
              would be wrong for a large share of this app's users. Where the
              customer could still change the treatment — reverse charge,
              intra-EU — the line says so instead of pretending the gross is
              settled. */}
          {amount != null && (
            <div className="mt-3 rounded-xl border border-navy/20 bg-navy/[.07] px-3 py-2.5"
                 data-testid={`estimate-foot-${tid}`}>
              <p className="flex items-baseline text-[12.5px] font-extrabold text-ink">
                <span>{t('est_net_label')}</span>
                <b className={`ml-auto tabular-nums ${disc > 0 || discEur > 0
                  ? 'text-ink-faint line-through decoration-1 font-bold' : ''}`}>
                  {fmtEur(amount)}
                </b>
              </p>
              {(disc > 0 || discEur > 0) && (
                <p className="flex items-baseline text-[12.5px] font-extrabold text-ink mt-1">
                  <span>{t('est_net_after')}</span>
                  <b className="ml-auto tabular-nums">{fmtEur(net)}</b>
                </p>
              )}
              {vatRate > 0 && (
                <p className="flex items-baseline text-[11px] font-bold text-ink-muted mt-0.5">
                  <span>{t('est_vat', { pct: fmtPct(vatRate) })}</span>
                  <b className="ml-auto tabular-nums">{fmtEur(net * vatRate / 100)}</b>
                </p>
              )}
              <p className="flex items-baseline border-t border-navy/15 mt-1.5 pt-1.5
                            text-[13px] font-extrabold text-ink">
                <span>{vatRate > 0 ? t('est_gross') : t('est_net_total')}</span>
                <b className="ml-auto text-[18px] text-navy tabular-nums">
                  {fmtEur(net * (1 + vatRate / 100))}
                </b>
              </p>
              <p className="mt-1 text-[9.5px] text-ink-muted">
                {vat?.treatment === 'kleinunternehmer' ? t('est_vat_klein')
                  : vat?.final === false ? t('est_vat_provisional') : t('est_net_estimated')}
              </p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default function EstimateCards({ jobs, sections, lang, onQuote, quoting,
                                        onSelection, only = null, vat }) {
  const { t } = useLang();
  const [picked, setPicked] = useState({});

  /* Answers → estimate, one request per card that has a quantity — including
     one only opened to be read, because the price is what somebody opened it
     for. Debounced together rather than per card: typing a quantity in one
     card must not fire five requests for the four that did not change. */
  const [tick, setTick] = useState(0);
  /* Whether the bar leads with net or gross is a fact about the business — a
     Maler quoting private customers thinks in Brutto, one quoting a builder
     thinks in Netto — so it is remembered rather than asked every visit. */
  const [withVat, setWithVat] = useState(() => {
    try { return localStorage.getItem('sm_est_gross') === '1'; } catch { return false; }
  });
  const toggleVat = () => setWithVat((v) => {
    try { localStorage.setItem('sm_est_gross', v ? '0' : '1'); } catch { /* private mode */ }
    return !v;
  });
  const bump = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const keys = Object.keys(picked).filter((k) => picked[k]?.form && hasQty(picked[k]));
    if (!keys.length) return undefined;
    const id = setTimeout(async () => {
      const next = {};
      await Promise.all(keys.map(async (key) => {
        const p = picked[key];
        try {
          const { data } = await api.post('/api/estimate',
            { job_key: key, answers: p.answers, tier: 'standard',
              qty_overrides: numeric(p.qtyOverrides),
              rate_overrides: numeric(p.rateEdits) },
            { params: { lang } });
          next[key] = data;
        } catch { /* a position that will not price keeps its last figure */ }
      }));
      setPicked((cur) => {
        const out = { ...cur };
        Object.entries(next).forEach(([k, est]) => {
          if (out[k]) out[k] = { ...out[k], est, loading: false };
        });
        return out;
      });
    }, 320);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, lang]);

  /* An entry in `picked` is a card that is doing something — ticked, or open,
     or both. `checked` is what puts a position in the quote; `open` is only
     what is on screen. Keeping them apart is what lets somebody read a
     template's options without silently adding it to the quote, which with the
     unpriced-position gate would have locked the quote button on a row they
     only looked at. */
  const drop = (key) => setPicked(({ [key]: _gone, ...rest }) => rest);

  /* Independent toggles, not an accordion.
     This was an accordion: opening a card closed whichever one was open, on
     the argument that two open cards is 940 px and the other rows and the
     running total should stay visible. That is a real cost and it is not the
     one that matters — a quote is several positions and they get set up
     together, so closing the one you just filled in to look at the next is the
     app taking work away from you. Comparing two templates side by side was
     impossible, and every reopen re-read a form you had already answered.
     Cards now stay open until they are closed, and the ones that are neither
     open nor ticked are still dropped, because those have nothing to keep. */
  const openOnly = (cur, key, patch) => {
    const rest = Object.fromEntries(Object.entries(cur)
      .filter(([k, v]) => k === key || v.checked || v.open));
    return { ...rest, [key]: { ...(cur[key] || {}), ...patch } };
  };

  const load = async (key, init) => {
    setPicked((cur) => openOnly(cur, key, { answers: {}, loading: true, ...init }));
    try {
      const { data } = await api.get(`/api/estimate/jobs/${key}`, { params: { lang } });
      /* Seed the form's own defaults — except the quantity, which is left
         empty on purpose.

         `survey()` synthesises a quantity question whose default is the
         template's typical size, and `test_estimator` asserts that default is
         exactly what the estimator uses when nothing is answered. That
         invariant is worth keeping: it is what stops the number on screen
         disagreeing with the number in the price. So the field is not zeroed —
         zero would still price as 57,5 m² and the screen would be lying — it
         is left blank, and a position with no quantity is simply not priced
         yet. A quote is a promise about a number somebody typed. */
      const qq = qtyQuestion(data.form || []);
      const seed = {};
      (data.form || []).forEach((q) => {
        if (q === qq) return;
        if (q.default !== null && q.default !== undefined) seed[q.key] = q.default;
      });
      /* The spinner has to mean "a price is coming". A Pauschale job prices
         straight away and keeps spinning until it does; a job that wants a
         quantity is not waiting on anything until one is typed, and a spinner
         that never resolves is worse than no spinner. */
      setPicked((cur) => {
        if (!cur[key]) return cur;
        const next = { ...cur[key], form: data.form || [], answers: seed };
        return { ...cur, [key]: { ...next, loading: hasQty(next) } };
      });
      bump();
    } catch {
      drop(key);
    }
  };

  /** The checkbox: what goes in the quote. Ticking a fresh row opens it too. */
  const toggle = (key, section) => {
    const cur = picked[key];
    if (!cur) return load(key, { checked: true, open: true, openIn: section });
    if (!cur.checked) {
      return setPicked((s) => ({ ...s, [key]: { ...s[key], checked: true } }));
    }
    // Unticked: it stays on screen only while it is still open.
    return cur.open
      ? setPicked((s) => ({ ...s, [key]: { ...s[key], checked: false } }))
      : drop(key);
  };

  /** The chevron and the title: what is on screen. Never ticks anything. */
  const open = (key, section, what) => {
    const cur = picked[key];
    if (!cur) return load(key, { checked: false, open: true, openIn: section });
    if (what === 'notes') {
      return setPicked((s) => ({ ...s, [key]: { ...s[key], showNotes: !s[key].showNotes } }));
    }
    /* Clicking the other copy of a cross-listed template moves it there rather
       than closing it. Reading "auch unter Fassade" and tapping it there should
       show you the template, not collapse the one you were already looking at. */
    const elsewhere = cur.open && cur.openIn !== section;
    if (cur.open && !elsewhere && !cur.checked) return drop(key);
    return setPicked((s) => openOnly(s, key,
      elsewhere ? { open: true, openIn: section }
                : { open: !s[key].open, openIn: section }));
  };

  const answer = (key, qk, value) => {
    setPicked((cur) => {
      if (!cur[key]) return cur;
      const next = { ...cur[key], answers: { ...cur[key].answers, [qk]: value } };
      /* Clearing the quantity cancels the price rather than requesting one,
         and the last estimate goes with it — a figure left on screen for a
         quantity that is no longer there is the one number nobody should
         trust, and it would still have been counted into the total. */
      if (!hasQty(next)) return { ...cur, [key]: { ...next, est: null, loading: false } };
      return { ...cur, [key]: { ...next, loading: true } };
    });
    bump();
  };

  /* A quantity the pro corrected on one position of one template.
     Keyed by rate key, which is what `/api/estimate` has always taken and what
     the estimator matches its own lines on. Passing `undefined` clears the
     correction and the line goes back to what the model says. */
  const lineQty = (key, rateKey, value) => {
    setPicked((cur) => {
      if (!cur[key]) return cur;
      const next = { ...(cur[key].qtyOverrides || {}) };
      if (value === undefined || value === '') delete next[rateKey];
      else next[rateKey] = value;
      return { ...cur, [key]: { ...cur[key], qtyOverrides: next, loading: true } };
    });
    bump();
  };

  /* A unit price the pro typed. It is not a per-quote override — it is this
     business's rate for that rate key, written to `pro_rates` and marked
     manual, which is the record the estimator has always preferred to the
     catalogue and which learning never overwrites afterwards. So the next
     quote starts from it, on this template and every other one that prices
     the same key.

     Debounced by the same tick the estimate is: typing "4" on the way to "46"
     must not write a four-euro hourly rate to the profile. `undefined` clears
     the override and the rate falls back to what the accepted quotes measured,
     or to the catalogue. */
  /* A unit price the pro typed, for this position on this job.
     It goes to the estimator as `rate_overrides` and travels with the quote.
     It is deliberately *not* the rate card: `maler.stundensatz` is the hourly
     rate every template in the trade prices from, and setting the price per
     m² on one job scales every position on it — writing those scaled figures
     into the profile would silently reprice the whole business off one job.
     The rate card is still what the estimator falls back to, still learned
     from accepted quotes, and still editable in settings.
     Clearing the field drops the override. */
  const lineRate = (key, ln, value) => {
    setPicked((cur) => {
      if (!cur[key]) return cur;
      const next = { ...(cur[key].rateEdits || {}) };
      if (value === undefined || value === '') delete next[ln.rate_key];
      else next[ln.rate_key] = value;
      /* The typed €/unit is abandoned: it was a target for a different set of
         prices, and keeping it would leave the field disagreeing with the
         positions under it. */
      return { ...cur, [key]: { ...cur[key], rateEdits: next, perUnit: '', loading: true } };
    });
    bump();
  };

  /* In the price, or out of it. Held as rate keys because that is what both
     the estimate lines and the quote payload are keyed on, so what the card
     drops and what the document drops cannot drift apart. */
  const include = (key, rateKey, on) => {
    setPicked((cur) => {
      if (!cur[key]) return cur;
      const was = cur[key].excluded || [];
      const next = on ? was.filter((k) => k !== rateKey)
                      : (was.includes(rateKey) ? was : [...was, rateKey]);
      return { ...cur, [key]: { ...cur[key], excluded: next, perUnit: '' } };
    });
  };

  /* A price per unit, turned into per-position prices.
     The target is `value × qty` for the positions that are in the price; every
     one of them is scaled by the same factor, so the breakdown still adds up
     to what the field says. Sent as `rate_overrides`, which the estimator
     applies to the lines it wrote — including the disposal line, which is
     priced from the tonne rate and never consulted a rate card at all. */
  const perUnit = (key, lines, qty, value) => {
    setPicked((cur) => {
      if (!cur[key]) return cur;
      const target = Number(String(value).replace(',', '.'));
      const base = lines.reduce((n, ln) => n + lineNet(ln), 0);
      if (!(qty > 0) || !(base > 0) || !Number.isFinite(target) || target <= 0) {
        return { ...cur, [key]: { ...cur[key], perUnit: value } };
      }
      const factor = (target * qty) / base;
      const next = { ...(cur[key].rateEdits || {}) };
      lines.forEach((ln) => { next[ln.rate_key] = round2(ln.unit_price * factor); });
      return { ...cur, [key]: { ...cur[key], perUnit: value, rateEdits: next, loading: true } };
    });
    bump();
  };

  /* Kept as the typed string so "1," on the way to "12,5" does not snap back
     to 1 under the cursor. Local only — a Nachlass changes nothing the
     estimator computes, so there is nothing to re-fetch. */
  const setDiscount = (key, field, value) => setPicked((cur) => (
    cur[key] ? { ...cur, [key]: { ...cur[key], [field]: value } } : cur));

  /* The single percentage that produces the same net as the two figures the
     pro typed — see `discountOf` — applied to what is still in the price. */
  const pctOf = (p) => discountOf(p, included(p.est, p.excluded).net).pct_effective;
  const netOf = (p) => discountOf(p, included(p.est, p.excluded).net).net;

  const chosen = Object.entries(picked).filter(([, p]) => p.checked && p.est);
  // Same figure as the cards, for the same reason: this bar sits directly
  // above the button that creates the quote, so it is a promise about it.
  const gross = chosen.reduce((s, [, p]) => s + included(p.est, p.excluded).net, 0);
  const total = chosen.reduce((s, [, p]) => s + netOf(p), 0);
  const given = gross - total;
  /* The quote has always stored net, VAT and gross — the `quote_lines`
     trigger computes all three on insert — but this bar reported the net
     while the card foot above it reported the gross, so the figure read just
     before pressing the button was not the figure on the document. */
  const vatRate = Number(vat?.rate) || 0;
  const withTax = (n) => (withVat ? n * (1 + vatRate / 100) : n);

  /* Ticked, but no quantity typed yet, so it has no price and cannot go into
     the quote. Somebody who ticks a position means to send it — dropping it
     out of the total silently would hand them a quote that is short a line
     they thought they had added. Count it, name it, and hold the button. */
  const pending = Object.entries(picked).filter(([, p]) => p.checked && p.form && !hasQty(p));

  /* Tell the page above what is on the table, so leaving the screen can offer
     to keep it. The page owns the back button and this component owns the
     ticks, and without this the back button cannot know there is anything to
     lose.

     Keyed on a signature rather than on `chosen`, which is a fresh array on
     every render and would loop for ever. The answers are in the signature
     because changing one changes the draft that would be saved. */
  const positions = chosen.map(([key, p]) => ({
    job_key: key, answers: p.answers, tier: 'standard',
    qty_overrides: numeric(p.qtyOverrides),
    rate_overrides: numeric(p.rateEdits),
    excluded: p.excluded || [],
  }));
  /* `pending.length` goes up too, and leaving that out is what made the first
     version of this useless: a card ticked with no quantity yet has no
     estimate, so it is not in `chosen` — and that is precisely the state a pro
     is in halfway through, which is precisely when they hit back. */
  const signature = JSON.stringify([positions, Math.round(total * 100), pending.length]);
  useEffect(() => {
    const [pos, , unpriced] = JSON.parse(signature);
    onSelection?.(pos, total, unpriced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  /* Order comes from the section, not from the job array. `sections_for`
     lists "what most people came for" first — a painter opens this for an
     Innenanstrich far more often than for a Wärmedämmverbundsystem — and
     filtering the jobs array instead threw that away and returned whatever
     order the API happened to send. */
  const byKey = new Map(jobs.map((j) => [j.key, j]));
  const say = (de, other) => (lang !== 'de' && other?.[lang]) || de;

  /* Section labels resolved once, so a cross-listing notice can name the other
     group in the reader's own language without the API having to send that
     label twice. The backend deliberately returns section *keys* in `cross`
     for this reason. */
  const secLabel = new Map((sections || []).map((s) => [s.key, say(s.label_de, s.labels)]));

  const groups = sections && sections.length
    ? sections
      .map((s) => ({ key: s.key, label: say(s.label_de, s.labels),
                     sub: say(s.sub_de, s.subs),
                     zone: s.zone, zoneLabel: say(s.zone_label_de, s.zone_labels),
                     /* Which other groups each row also appears in, as a
                        readable list. Joined here rather than in the card so
                        a template shown in three places still reads as one
                        sentence. */
                     also: Object.fromEntries(Object.entries(s.cross || {})
                       .map(([k, others]) => [k, others.map((o) => secLabel.get(o))
                         .filter(Boolean).join(', ')])
                       .filter(([, v]) => v)),
                     rows: s.job_keys.map((k) => byKey.get(k)).filter(Boolean) }))
      .filter((s) => s.rows.length)
    : [{ key: '_all', label: '', sub: '', zone: null, also: {}, rows: jobs }];

  /* How many distinct templates each zone holds, counted before the dial's
     filter is applied. The zone heading is a statement about the zone — Innen
     holds sixteen — and computing it from what is on screen would make it say
     three the moment a wedge is open. */
  const zoneTotal = new Map();
  groups.forEach((sec) => {
    if (!sec.zone) return;
    const seen = zoneTotal.get(sec.zone) || new Set();
    sec.rows.forEach((j) => seen.add(j.key));
    zoneTotal.set(sec.zone, seen);
  });

  /* `only` is the dial's open wedge. Filtered here rather than upstream so
     `secLabel` above still holds every section's name: a cross-listing notice
     on a card in the open group has to name the other group it appears in,
     and that group is not being rendered. */
  const shown = only ? groups.filter((s) => s.key === only) : groups;

  /* Consecutive sections sharing a zone become one panel. Runs, not a group-by:
     a zone drawn twice down the page is two panels of one colour, and colour
     that repeats in two places stops saying where you are. The backend lists a
     zone's sections contiguously for exactly this reason; if that ever stops
     being true this renders it as two panels rather than silently reordering
     the sections behind the pro's back. */
  const bands = [];
  shown.forEach((sec) => {
    const last = bands[bands.length - 1];
    if (last && last.zone === sec.zone && sec.zone) last.secs.push(sec);
    else bands.push({ zone: sec.zone, label: sec.zoneLabel, secs: [sec] });
  });

  return (
    <>
      {/* With the dial on, the rows follow it with nothing in between: the
          dial already names the open group and says how many are in it, so a
          zone panel and a section heading under it are the same sentence
          twice and 90 px of it. The zone tint goes with them — a band of
          colour round one group says nothing, because there is nothing on
          screen for it to be a different colour from. */}
      {only && bands.flatMap((band) => band.secs).map((sec) => (
        <div key={sec.key} className="space-y-1.5">
          {sec.rows.map((j) => (
            <Card key={`${sec.key}/${j.key}`} job={j} state={picked[j.key]} t={t}
                  zone={null} alsoIn={sec.also?.[j.key]} section={sec.key}
                  onToggle={toggle} onOpen={open} onAnswer={answer}
                          onLineQty={lineQty}
                          onLineRate={lineRate}
                          onInclude={include} onPerUnit={perUnit}
                          onDiscount={setDiscount} vat={vat} />
          ))}
        </div>
      ))}

      {!only && bands.map((band, bi) => {
        const z = ZONE[band.zone];
        /* Distinct templates, not rows. Summing row counts would tell a
           painter the Innen zone holds seventeen templates when it holds
           fifteen and shows two of them twice. */
        const n = (zoneTotal.get(band.zone)
          || new Set(band.secs.flatMap((x) => x.rows.map((j) => j.key)))).size;
        return (
          <div key={`${band.zone || '_'}${bi}`}
               data-testid={band.zone ? `estimate-zone-${band.zone}` : undefined}
               className={z ? `mt-8 first:mt-4 rounded-[18px] border px-3 pt-3 pb-3.5 ${z.panel}`
                            : 'mb-1'}>
            {z && (
              <h2 className={`text-[11px] font-extrabold uppercase tracking-[.16em] ${z.head}`}>
                {band.label}
                <span className="ml-1.5 font-medium normal-case tracking-normal text-ink-muted">
                  {t('est_n_templates', { n })}
                </span>
              </h2>
            )}
            {band.secs.map((sec) => {
              /* h3 under a zone's h2, h2 when there is no zone. The six trades
                 without zones would otherwise get an h3 with no h2 above it,
                 which is a broken outline for anyone reading by headings. */
              const H = z ? 'h3' : 'h2';
              return (
              <div key={sec.key}>
                {sec.key !== '_all' && (
                  <H className={`text-[9.5px] font-extrabold uppercase tracking-[.11em]
                                 ${z ? `${z.head} mt-4 first:mt-3` : 'text-ink-muted mt-4'} mb-2 px-0.5`}>
                    {sec.label}
                    <span className="font-medium tracking-normal"> · {sec.rows.length}</span>
                    {sec.sub && (
                      <span className="block font-medium normal-case tracking-normal
                                       text-ink-muted mt-[2px]">{sec.sub}</span>
                    )}
                  </H>
                )}
                <div className="space-y-1.5">
                  {sec.rows.map((j) => (
                    /* Keyed by section *and* template: a cross-listed template
                       renders twice on one page, and two siblings with the
                       same React key is one of them silently not rendering. */
                    <Card key={`${sec.key}/${j.key}`} job={j} state={picked[j.key]} t={t}
                          zone={band.zone} alsoIn={sec.also?.[j.key]} section={sec.key}
                          onToggle={toggle} onOpen={open} onAnswer={answer}
                          onLineQty={lineQty}
                          onLineRate={lineRate}
                          onInclude={include} onPerUnit={perUnit}
                          onDiscount={setDiscount} vat={vat} />
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        );
      })}

      {(chosen.length > 0 || pending.length > 0) && (
        <div data-testid="estimate-total-bar"
             className="sticky bottom-0 -mx-4 mt-4 flex items-center justify-between gap-3
                        border-t border-sm-border bg-paper px-4 py-2.5
                        shadow-[0_-3px_14px_rgba(26,58,82,.07)]">
          <div className="min-w-0">
            <p className="text-[9.5px] text-ink-muted">
              {chosen.length > 0 && (
                <>
                  {chosen.length === 1 ? t('est_one_position')
                    : t('est_n_positions', { n: chosen.length })}
                  {' · '}
                  {withVat && vatRate > 0 ? t('est_incl_vat', { pct: fmtPct(vatRate) })
                    : t('est_net_estimated')}
                </>
              )}
              {pending.length > 0 && (
                <span className="font-bold text-amber-text">
                  {chosen.length > 0 ? ' · ' : ''}
                  {t('est_missing_qty', { n: pending.length })}
                </span>
              )}
            </p>
            {/* No amount while nothing is priced. A 0,00 € under two ticked
                positions reads as a total, and it is not one. */}
            {chosen.length > 0 && (
              <p className="flex items-baseline gap-2">
                {given > 0 && (
                  <span className="font-headings text-[17px] font-extrabold tabular-nums
                                   text-ink-faint line-through decoration-1">
                    {fmtEur(withTax(gross))}
                  </span>
                )}
                <span className="font-headings text-[17px] font-extrabold text-ink tabular-nums">
                  {fmtEur(withTax(total))}
                </span>
              </p>
            )}
            {given > 0 && (
              <p className="text-[9.5px] font-bold text-amber-text">
                {t('est_discount_given', { v: fmtEur(given) })}
              </p>
            )}
          </div>

          {chosen.length > 0 && vatRate > 0 && (
            <button type="button" onClick={toggleVat} aria-pressed={withVat}
                    data-testid="estimate-with-vat"
                    className="shrink-0 flex items-center gap-1.5 rounded-[9px] border
                               border-sm-border bg-cream-soft px-2 py-1.5">
              <span className={`grid h-[15px] w-[15px] place-items-center rounded-[4px]
                                border-[1.5px] ${withVat ? 'border-teal bg-teal'
                                                         : 'border-ink-faint/50 bg-paper'}`}>
                {withVat && (
                  <svg viewBox="0 0 12 10" aria-hidden="true"
                       className="h-[8px] w-[10px] fill-none stroke-white stroke-[2.4]">
                    <path d="M1 5l3.2 3.2L11 1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-[10.5px] font-bold text-ink whitespace-nowrap">
                {t('est_vat_short', { pct: fmtPct(vatRate) })}
              </span>
            </button>
          )}

          <button type="button" disabled={quoting || pending.length > 0 || !chosen.length}
                  onClick={() => onQuote(chosen.map(([key, p]) => ({
                    job_key: key, answers: p.answers, tier: 'standard',
                    /* The corrections went with the draft and not with the
                       quote, so a position the pro had halved was quoted at
                       full quantity. */
                    qty_overrides: numeric(p.qtyOverrides),
                    rate_overrides: numeric(p.rateEdits),
                    excluded: p.excluded || [],
                    discount_pct: pctOf(p),
                  })))}
                  data-testid="estimate-multi-quote"
                  className="btn-amber !px-4 !py-2.5 !text-[13px]
                             disabled:opacity-50 disabled:cursor-not-allowed">
            {quoting ? <Loader2 size={14} className="animate-spin" /> : t('est_create_quote')}
          </button>
        </div>
      )}
    </>
  );
}
