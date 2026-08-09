import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, MapPin, Info } from 'lucide-react';
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

/** One template: a checkbox, and everything it needs once it is checked. */
function Card({ job, state, onToggle, onOpen, onAnswer, t }) {
  const checked = !!state;
  const est = state?.est;
  const open = state?.open;
  // Memoised so the empty-array fallback is not a new array on every
  // render, which would make the summary below recompute continuously.
  const form = useMemo(() => state?.form || [], [state]);
  const qq = qtyQuestion(form);
  const amount = est ? est.total_net[1] : null;

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
    <div data-testid={`estimate-card-${job.key}`}
         className={`rounded-[14px] border overflow-hidden transition-colors
                     ${open ? 'border-teal shadow-[0_2px_10px_rgba(45,106,127,.10)] bg-paper'
                            : checked ? 'border-teal/25 bg-teal/[.03]'
                                      : 'border-cream-deep bg-paper'}`}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button type="button" onClick={() => onToggle(job.key)}
                aria-pressed={checked} aria-label={lbl(job)}
                data-testid={`estimate-check-${job.key}`}
                className={`h-5 w-5 shrink-0 rounded-[6px] border-[1.6px] flex items-center
                            justify-center focus-visible:outline-none focus-visible:ring-4
                            focus-visible:ring-teal/30
                            ${checked ? 'border-teal bg-teal' : 'border-ink-faint/50'}`}>
          {checked && (
            <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true">
              <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="2"
                    fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <button type="button" onClick={() => onOpen(job.key)}
                data-testid={`estimate-open-${job.key}`}
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
        </button>

        {checked && amount != null && !open && (
          <span className="text-right whitespace-nowrap">
            <span className="block font-extrabold text-[13px] text-ink">{fmtEur(amount)}</span>
            <span className="block text-[9px] text-ink-muted">
              {est.qty} {unit(job.unit)}
            </span>
          </span>
        )}
        {state?.loading && <Loader2 size={14} className="animate-spin text-teal" />}
        <ChevronDown size={14} aria-hidden="true"
                     className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
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
                data-testid={`estimate-qty-${job.key}`}
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
                      data-testid={`estimate-field-${job.key}-${q.key}`}
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
            <button type="button" onClick={() => onOpen(job.key, 'notes')}
                    data-testid={`estimate-more-notes-${job.key}`}
                    className="mt-2 flex items-center gap-1 text-[11px] font-bold text-teal">
              <Info size={12} /> {hidden === 1 ? t('est_one_more_note')
                : t('est_more_notes', { n: hidden })}
            </button>
          )}
          {state.showNotes && (
            <div className="mt-2 space-y-1" data-testid={`estimate-all-notes-${job.key}`}>
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

export default function EstimateCards({ jobs, sections, lang, onQuote, quoting }) {
  const { t } = useLang();
  const [picked, setPicked] = useState({});

  /* Answers → estimate, one request per checked position. Debounced together
     rather than per card: typing a quantity in one card must not fire five
     requests for the four that did not change. */
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const keys = Object.keys(picked).filter((k) => picked[k]?.form);
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

  const toggle = async (key) => {
    if (picked[key]) {
      setPicked(({ [key]: _drop, ...rest }) => rest);
      return;
    }
    // Accordion, not independent toggles. Two open cards is 940 px of the
    // screen and the whole point of this layout is that the other rows and the
    // running total stay visible while you work on one.
    setPicked((cur) => {
      const closed = Object.fromEntries(
        Object.entries(cur).map(([k, v]) => [k, { ...v, open: false }]));
      return { ...closed, [key]: { answers: {}, open: true, loading: true } };
    });
    try {
      const { data } = await api.get(`/api/estimate/jobs/${key}`, { params: { lang } });
      // Seed the form's own defaults. An empty form would price from fallbacks
      // the pro never saw and cannot correct.
      const seed = {};
      (data.form || []).forEach((q) => {
        if (q.default !== null && q.default !== undefined) seed[q.key] = q.default;
      });
      setPicked((cur) => (cur[key]
        ? { ...cur, [key]: { ...cur[key], form: data.form || [], answers: seed } }
        : cur));
      bump();
    } catch {
      setPicked(({ [key]: _drop, ...rest }) => rest);
    }
  };

  const open = (key, what) => {
    if (!picked[key]) return toggle(key);
    if (what === 'notes') {
      return setPicked((cur) => ({
        ...cur, [key]: { ...cur[key], showNotes: !cur[key].showNotes },
      }));
    }
    return setPicked((cur) => {
      const opening = !cur[key].open;
      const closed = Object.fromEntries(
        Object.entries(cur).map(([k, v]) => [k, { ...v, open: false }]));
      return { ...closed, [key]: { ...cur[key], open: opening } };
    });
  };

  const answer = (key, qk, value) => {
    setPicked((cur) => (cur[key]
      ? { ...cur, [key]: { ...cur[key], answers: { ...cur[key].answers, [qk]: value },
                           loading: true } }
      : cur));
    bump();
  };

  const chosen = Object.entries(picked).filter(([, p]) => p.est);
  const total = chosen.reduce((s, [, p]) => s + p.est.total_net[1], 0);

  /* Order comes from the section, not from the job array. `sections_for`
     lists "what most people came for" first — a painter opens this for an
     Innenanstrich far more often than for a Wärmedämmverbundsystem — and
     filtering the jobs array instead threw that away and returned whatever
     order the API happened to send. */
  const byKey = new Map(jobs.map((j) => [j.key, j]));
  const groups = sections && sections.length
    ? sections
      .map((s) => ({ key: s.key, label: s.label_de, labels: s.labels,
                     rows: s.job_keys.map((k) => byKey.get(k)).filter(Boolean) }))
      .filter((s) => s.rows.length)
    : [{ key: '_all', label: '', rows: jobs }];

  return (
    <>
      {groups.map((sec) => (
        <div key={sec.key} className="mb-1">
          {sec.key !== '_all' && (
            <h2 className="text-[10px] font-extrabold uppercase tracking-[.12em] text-ink-muted
                           mt-4 mb-2 px-0.5">
              {(lang !== 'de' && sec.labels?.[lang]) || sec.label}
              <span className="font-medium tracking-normal"> · {sec.rows.length}</span>
            </h2>
          )}
          <div className="space-y-1.5">
            {sec.rows.map((j) => (
              <Card key={j.key} job={j} state={picked[j.key]} t={t}
                    onToggle={toggle} onOpen={open} onAnswer={answer} />
            ))}
          </div>
        </div>
      ))}

      {chosen.length > 0 && (
        <div data-testid="estimate-total-bar"
             className="sticky bottom-0 -mx-4 mt-4 flex items-center justify-between gap-3
                        border-t border-sm-border bg-paper px-4 py-2.5
                        shadow-[0_-3px_14px_rgba(26,58,82,.07)]">
          <div>
            <p className="text-[9.5px] text-ink-muted">
              {chosen.length === 1 ? t('est_one_position')
                : t('est_n_positions', { n: chosen.length })} · {t('est_net_estimated')}
            </p>
            <p className="font-headings text-[17px] font-extrabold text-ink tabular-nums">
              {fmtEur(total)}
            </p>
          </div>
          <button type="button" disabled={quoting}
                  onClick={() => onQuote(chosen.map(([key, p]) => ({
                    job_key: key, answers: p.answers, tier: 'standard',
                  })))}
                  data-testid="estimate-multi-quote"
                  className="btn-amber !px-4 !py-2.5 !text-[13px]">
            {quoting ? <Loader2 size={14} className="animate-spin" /> : t('est_create_quote')}
          </button>
        </div>
      )}
    </>
  );
}
