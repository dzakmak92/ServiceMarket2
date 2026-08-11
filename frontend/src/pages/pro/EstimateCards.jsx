import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, MapPin, Info, Repeat2 } from 'lucide-react';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import { fmtEur } from '../../utils/money';

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
function Card({ job, state, onToggle, onOpen, onAnswer, t, zone, alsoIn, section }) {
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
  const amount = est ? est.lines_net : null;

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
                     ${open ? 'border-teal shadow-[0_2px_10px_rgba(45,106,127,.10)] bg-paper'
                            : checked ? (z?.picked || 'border-teal/25 bg-teal/[.03]')
                                      : (z?.rest || 'border-cream-deep bg-paper')}`}>
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
            <span className="block font-extrabold text-[13px] text-ink">{fmtEur(amount)}</span>
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
        <div className="border-t border-cream-deep bg-cream-soft/40 px-3 py-3">
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
                className="w-full rounded-[9px] border border-sm-border bg-paper px-2.5 py-2
                           text-right text-[13px] font-bold text-ink"
              />
            </label>
            {/* Derived, not editable. `per_unit` is total ÷ quantity across
                four separate rate keys — labour, covering, material, setup —
                so there is no single number here to type into. Changing what
                a unit costs is what the rate card does, one rate key at a
                time, and it is one tap away rather than silently folded in. */}
            <div className="flex-1">
              <span className="block text-[9px] font-extrabold uppercase tracking-[.06em]
                               text-ink-muted mb-1">€ / {unit(job.unit)}</span>
              <div className="rounded-[9px] border border-sm-border bg-cream-soft px-2.5 py-2
                              text-right text-[13px] font-bold text-ink-soft">
                {est?.per_unit ? fmtEur(est.per_unit[1]) : '—'}
              </div>
            </div>
            <div className="min-w-[86px] rounded-[9px] bg-teal/[.08] px-2.5 py-2 text-right">
              <span className="block text-[13px] font-extrabold text-ink">
                {amount != null ? fmtEur(amount) : '—'}
              </span>
              <span className="block text-[8.5px] text-ink-muted">{t('est_net_estimated')}</span>
            </div>
          </div>

          {est?.rates_applied > 0 && (
            <p className="mt-1.5 text-[10px] font-bold text-teal">
              {t('est_own_rate')} · {est.rates_applied}/{est.lines.length}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            {fields.map((q) => {
              const wide = q.type === 'bool' || (q.options || []).length > 3;
              return (
                <label key={q.key} className={wide ? 'col-span-2' : ''}>
                  <span className="block text-[9px] font-extrabold uppercase tracking-[.06em]
                                   text-ink-muted mb-1">{lbl(q)}</span>
                  {q.type === 'bool' ? (
                    <select
                      value={String(state.answers[q.key] ?? false)}
                      onChange={(e) => onAnswer(job.key, q.key, e.target.value === 'true')}
                      className="w-full rounded-[9px] border border-sm-border bg-paper px-2.5 py-2
                                 text-[12px] text-ink">
                      <option value="false">{t('no')}</option>
                      <option value="true">{t('yes')}</option>
                    </select>
                  ) : (
                    <select
                      value={state.answers[q.key] ?? ''}
                      onChange={(e) => onAnswer(job.key, q.key, e.target.value)}
                      data-testid={`estimate-field-${tid}-${q.key}`}
                      className="w-full rounded-[9px] border border-sm-border bg-paper px-2.5 py-2
                                 text-[12px] text-ink">
                      {(q.options || []).map(([v, l]) => (
                        <option key={String(v)} value={String(v)}>{l}</option>
                      ))}
                    </select>
                  )}
                  {byField.has(q.key) && (
                    <div className="mt-1.5"><Note note={byField.get(q.key)} /></div>
                  )}
                </label>
              );
            })}
          </div>

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
        </div>
      )}
    </div>
  );
}

export default function EstimateCards({ jobs, sections, lang, onQuote, quoting,
                                        onSelection }) {
  const { t } = useLang();
  const [picked, setPicked] = useState({});

  /* Answers → estimate, one request per card that has a quantity — including
     one only opened to be read, because the price is what somebody opened it
     for. Debounced together rather than per card: typing a quantity in one
     card must not fire five requests for the four that did not change. */
  const [tick, setTick] = useState(0);
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
            { job_key: key, answers: p.answers, tier: 'standard' },
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

  /* Accordion, not independent toggles. Two open cards is 940 px of the screen
     and the whole point of this layout is that the other rows and the running
     total stay visible while you work on one. A card that is neither ticked
     nor the one being opened has nothing left to keep, so it goes. */
  const openOnly = (cur, key, patch) => {
    const rest = Object.fromEntries(Object.entries(cur)
      .filter(([k, v]) => k === key || v.checked)
      .map(([k, v]) => [k, k === key ? v : { ...v, open: false }]));
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

  const chosen = Object.entries(picked).filter(([, p]) => p.checked && p.est);
  // Same figure as the cards, for the same reason: this bar sits directly
  // above the button that creates the quote, so it is a promise about it.
  const total = chosen.reduce((s, [, p]) => s + p.est.lines_net, 0);

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

  /* Consecutive sections sharing a zone become one panel. Runs, not a group-by:
     a zone drawn twice down the page is two panels of one colour, and colour
     that repeats in two places stops saying where you are. The backend lists a
     zone's sections contiguously for exactly this reason; if that ever stops
     being true this renders it as two panels rather than silently reordering
     the sections behind the pro's back. */
  const bands = [];
  groups.forEach((sec) => {
    const last = bands[bands.length - 1];
    if (last && last.zone === sec.zone && sec.zone) last.secs.push(sec);
    else bands.push({ zone: sec.zone, label: sec.zoneLabel, secs: [sec] });
  });

  return (
    <>
      {bands.map((band, bi) => {
        const z = ZONE[band.zone];
        /* Distinct templates, not rows. Summing row counts would tell a
           painter the Innen zone holds seventeen templates when it holds
           fifteen and shows two of them twice. */
        const n = new Set(band.secs.flatMap((x) => x.rows.map((j) => j.key))).size;
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
                          onToggle={toggle} onOpen={open} onAnswer={answer} />
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
          <div>
            <p className="text-[9.5px] text-ink-muted">
              {chosen.length > 0 && (
                <>
                  {chosen.length === 1 ? t('est_one_position')
                    : t('est_n_positions', { n: chosen.length })} · {t('est_net_estimated')}
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
              <p className="font-headings text-[17px] font-extrabold text-ink tabular-nums">
                {fmtEur(total)}
              </p>
            )}
          </div>
          <button type="button" disabled={quoting || pending.length > 0 || !chosen.length}
                  onClick={() => onQuote(chosen.map(([key, p]) => ({
                    job_key: key, answers: p.answers, tier: 'standard',
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
