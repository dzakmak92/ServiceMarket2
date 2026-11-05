import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Minus, Plus, Save, FileText, Copy, AlertTriangle, X, Ruler, SlidersHorizontal, ArrowRight } from 'lucide-react';
import AnimatedEur from '../components/motion/AnimatedEur';
import useSheetModal from '../hooks/useSheetModal';
import { copyToClipboard } from '../utils/sms';
import { parseDecimal } from '../utils/number';
import {
  surfaceByKey, activeElements, CONDITIONS, SUBSTRATES_FOR, substrateByKey, DECORS, EXTRAS, TRAVEL_ZONES,
} from './catalog';
import { calculate, emptyInput, withAddon, withShape, withType, summaryText, vatLabel } from './pricing';
import { ConditionIcon, TypeGlyph } from './Drawings';
import { pieceDefault } from './nesting';
import { DimTable, CutSummary, ProPanel, NestingCard, ShapeGlyph, PRIMER_LABEL } from './FolierungWizard';

/**
 * Der Folierungs-Rechner für den Betrieb auf einer Seite.
 *
 * Statt vier Schritten (Fläche, Zustand, Zählen, Preis) drei aufklappbare
 * Karten. „Fläche“ und „Zählen“ fragten dieselben Teile zweimal ab und sind
 * jetzt eine Karte; die Fläche selbst wählt der Ring darüber. Alles ist mit
 * einem Vorschlag vorbelegt, der Preis steht von Anfang an unten und ändert
 * sich bei jeder Eingabe. Es gibt keine Weiter-Knöpfe: der Kopf der nächsten
 * Karte ist der Weiter-Knopf.
 *
 * Die öffentliche Kundenseite nutzt weiter FolierungWizard mit vier Schritten.
 */

const eur = (v) => `${Math.round(Number(v) || 0).toLocaleString('de-DE')} €`;
const fmtNum = (v, d = 1) => Number(v || 0).toLocaleString('de-DE', { maximumFractionDigits: d });
const roundTo = (v, step) => Math.round(v / step) * step;
const unitOf = (e) => (e.unit === 'stk' ? '' : e.unit === 'm2' ? 'm²' : 'm');
const PALETTE = ['#1e5490', '#c27c12', '#2d6a7f', '#7a4f9a', '#3b6f32', '#ae3f4c', '#5b8fb0', '#8a6a3c'];

/* Selten gebraucht: hinter einem Link, solange sie auf 0 stehen. */
const RARE = new Set(['ausschnitte', 'regal', 'bett', 'haustuer', 'glas', 'rollo', 'aufzug', 'garderobe', 'blatt_2', 'paneel', 'saeule', 'schuerze', 'dusche', 'tisch', 'zimmer', 'trennwand', 'setzstufe']);
const EXTRA_SHORT = { innen: 'Innenseiten', grifflos: 'Griffe', geraete: 'Geräte-Fronten', demontage: 'Demontage' };
const CARD_NAMES = ['Teile', 'Zustand & Dekor', 'Extras & Anfahrt'];
export const ONE_PAGE_STEPS = CARD_NAMES;

const reduce = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const FolierungOnePage = forwardRef(function FolierungOnePage({
  settings, initial, onSave, onCreateQuote, onChange, creating = false, initialStep = 0,
}, ref) {
  const [input, setInput] = useState(() => initial || emptyInput('kueche'));
  const [open, setOpen] = useState(() => Math.min(Math.max(Number(initialStep) || 0, 0), 2));
  const [touched, setTouched] = useState(() => (initial ? [true, true, true] : [false, false, false]));
  const [sheet, setSheet] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRefs = useRef([]);

  const surface = surfaceByKey(input.surface);
  const elements = useMemo(() => activeElements(surface, input.addons, input.extraSurfaces || []), [surface, input.addons, input.extraSurfaces]);
  const result = useMemo(() => calculate(input, settings), [input, settings]);
  const colorOf = useMemo(() => Object.fromEntries(elements.map((e, i) => [e.key, PALETTE[i % PALETTE.length]])), [elements]);

  useEffect(() => { setSaved(false); }, [input]);
  const startRef = useRef(JSON.stringify(input));
  useEffect(() => {
    onChange?.({ input, result, step: open, dirty: JSON.stringify(input) !== startRef.current });
  }, [input, result, open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Jede Änderung gehört zu einer Karte; die Karte gilt dann als bearbeitet. */
  const touch = (i) => setTouched((t) => (t[i] ? t : t.map((v, j) => (j === i ? true : v))));
  const edit = (i, fn) => { touch(i); setInput(fn); };
  const patch = (i, p) => edit(i, (s) => ({ ...s, ...p }));
  const setCount = (key, v) => edit(0, (s) => {
    const n = Math.max(0, Math.round(v * 100) / 100);
    const g = s.pieces?.[key]?.groups;
    const pieces = g?.length === 1 ? { ...s.pieces, [key]: { ...s.pieces[key], groups: [{ ...g[0], n }] } } : s.pieces;
    return { ...s, counts: { ...s.counts, [key]: n }, pieces };
  });

  const chooseSurface = (key) => {
    if (key === input.surface) return;
    setInput(emptyInput(key));
    setTouched([false, false, false]);
    setOpen(0);
  };
  useImperativeHandle(ref, () => ({ chooseSurface }));

  const toggle = (i) => {
    const next = open === i ? -1 : i;
    setOpen(next);
    if (next >= 0) {
      requestAnimationFrame(() => cardRefs.current[i]?.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'nearest' }));
    }
  };

  /* ── Zusammenfassungen ─────────────────────────────────────────────── */
  const own = elements.filter((e) => !e.addon);
  const fmtCount = (e) => {
    const v = input.counts[e.key] ?? 0;
    return e.unit === 'stk' ? `${fmtNum(v, 0)} ${e.label}` : `${fmtNum(v, 1)} ${unitOf(e)} ${e.label}`;
  };
  const summ1 = [
    surface.shapes ? surface.shapes.find((s) => s.key === input.shape)?.label : null,
    ...own.filter((e) => (input.counts[e.key] ?? 0) > 0).slice(0, 2).map(fmtCount),
    ...(surface.addons || []).filter((a) => input.addons.includes(a.key)).map((a) => (a.key === 'insel' ? 'Insel' : a.label)),
  ].filter(Boolean).join(' · ') || 'Noch nichts gezählt';
  const cond = CONDITIONS.find((c) => c.key === input.condition);
  const summ2 = [cond?.label, substrateByKey(input.substrate)?.label?.split(/ \(| \//)[0], DECORS.find((d) => d.key === input.decor)?.label].filter(Boolean).join(' · ');
  const extrasOn = EXTRAS.filter((x) => (x.count ? (input.extras[x.key] || 0) > 0 : !!input.extras[x.key]));
  const zone = TRAVEL_ZONES.find((z) => z.key === input.travel);
  const summ3 = [
    extrasOn.length ? extrasOn.map((x) => EXTRA_SHORT[x.key] || x.label.split(' (')[0]).join(', ') : 'keine Extras',
    zone ? zone.label.split('·')[0].trim() : null,
    input.weekend ? 'Wochenende' : null,
  ].filter(Boolean).join(' · ');
  const summaries = [summ1, summ2, summ3];

  const createQuote = async () => { await onCreateQuote?.({ input, result }); setSheet(false); };
  const save = () => { onSave?.({ input, result }); setSaved(true); };
  const share = async () => {
    const ok = await copyToClipboard(summaryText(input, result, settings));
    setCopied(!!ok);
    setTimeout(() => setCopied(false), 2000);
  };
  const montage = result.ways.montage;
  const noCount = !(result.vk > 0);

  const cards = [
    { title: surface.label, body: <PartsCard surface={surface} input={input} elements={elements} setCount={setCount} edit={edit} patch={patch} settings={settings} /> },
    { title: 'Zustand & Dekor', body: <StateCard surface={surface} input={input} patch={patch} settings={settings} /> },
    { title: 'Extras & Anfahrt', body: <ExtrasCard input={input} patch={patch} settings={settings} /> },
    /* The prices the calculation runs on, where the cards are: what used to be
       a gear icon at the top of the page. Read here, changed on the prices page. */
    { title: 'Meine Preise', prices: true, body: <PricesCard settings={settings} /> },
  ];
  const vkMin = Math.min(...DECORS.map((d) => Number(settings.decors?.[d.key]?.vk ?? d.vk) || 0));
  summaries[3] = `${eur(settings.hourlyRate)}/h · Folie ab ${eur(vkMin)}/m² · Mindestauftrag ${eur(settings.minOrder)}`;

  return (
    <div data-testid="fol-onepage">
      <div className="grid gap-2.5">
        {cards.map((c, i) => {
          const isOpen = open === i;
          return (
            /* Same build as the step cards on the other calculators
               (EstimatePage › Step): square number badge, 17 px title,
               64 px header, 16 px inner padding. */
            <section key={i} ref={(el) => { cardRefs.current[i] = el; }}
                     className={`scroll-mt-24 rounded-2xl border border-sm-border bg-paper overflow-hidden
                                 ${isOpen ? 'shadow-[0_4px_16px_rgba(26,58,82,.09)]' : ''}`}
                     data-testid={`fol-card-${i}`} data-open={isOpen ? 'yes' : 'no'}>
              <button type="button" onClick={() => toggle(i)} aria-expanded={isOpen}
                      className="w-full min-h-[64px] flex items-center gap-3 px-4 py-3 text-left
                                 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/25">
                <span aria-hidden="true"
                      className={`w-7 h-7 rounded-[9px] grid place-items-center text-[14px] font-bold shrink-0
                                  ${isOpen ? 'bg-teal text-paper'
                                           : (!c.prices && touched[i]) ? 'bg-green-pos/12 text-green-text' : 'bg-cream-deep text-ink-muted'}`}>
                  {c.prices ? <SlidersHorizontal size={14} /> : (!isOpen && touched[i] ? <Check size={14} strokeWidth={2.6} /> : i + 1)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[17px] font-headings font-bold leading-tight tracking-[-.015em] text-ink">{c.title}</span>
                  <span className="block text-[13px] text-ink-muted mt-0.5 truncate" data-testid={`fol-card-sum-${i}`}>
                    {isOpen && i === 0 ? 'Was und wie viel' : summaries[i]}
                    {!c.prices && !touched[i] && !(isOpen && i === 0) && <span className="ml-1.5 font-semibold text-amber-text">Vorschlag</span>}
                  </span>
                </span>
                <ChevronDown size={18} aria-hidden="true"
                             className={`shrink-0 text-ink-faint transition-transform duration-ui ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && <div className="px-4 pb-4 grid gap-2.5">{c.body}</div>}
            </section>
          );
        })}
      </div>

      {/* Der Preis: immer da, ändert sich live. Über der unteren Leiste. */}
      {/* Docked to the tab bar on phones: full width, flat bottom, so it reads
          as part of the frame rather than a card floating over the content. */}
      {/* Fixed, not sticky, on phones: sticky let go of the tab bar at the end
          of the page and left a strip of page between the two. The spacer
          keeps the last card clear of it. */}
      <div className="h-[72px] md:hidden" aria-hidden="true" />
      <div className="fixed left-0 right-0 bottom-[var(--tabbar-h,73px)] md:sticky md:bottom-4 z-30 md:z-20 md:mt-4"
           data-testid="fol-pricebar">
        <div className="bg-[#173a5e] text-paper flex items-center justify-between gap-3 pl-4 pr-3 py-2
                        rounded-t-[16px] md:rounded-[18px] shadow-[0_-6px_18px_rgba(23,58,94,.18)] md:shadow-[0_10px_24px_rgba(23,58,94,.28)]">
          <button type="button" onClick={() => setSheet(true)} className="min-w-0 text-left" data-testid="fol-price-open"
                  aria-label="Preis und Kalkulation öffnen">
            <small className="block text-[11px] text-[#a9c3dc]">Montage vor Ort</small>
            <b className="block font-headings text-[20px] leading-tight tabular-nums" data-testid="fol-price">
              {montage.value > 0 ? <AnimatedEur onDark value={roundTo(montage.grossLo, 10)} format={(v) => `ab ${eur(roundTo(v, 10))}`} /> : '–'}
            </b>
          </button>
          <button type="button" onClick={createQuote} disabled={creating || noCount || !onCreateQuote}
                  className="shrink-0 min-h-[44px] px-4 rounded-xl bg-amber text-on-amber font-bold text-[14px] disabled:opacity-60"
                  data-testid="fol-create-quote">
            {creating ? 'Lege an…' : 'Angebot erstellen'}
          </button>
        </div>
      </div>

      {sheet && (
        <PriceSheet result={result} input={input} settings={settings} elements={elements} colorOf={colorOf}
                    patch={(p) => patch(0, p)} onClose={() => setSheet(false)}
                    onSave={save} saved={saved} onCreate={createQuote} creating={creating} noCount={noCount}
                    onCopy={share} copied={copied} />
      )}
    </div>
  );
});

export default FolierungOnePage;

/* ── Karte 1: was und wie viel ─────────────────────────────────────────── */
function PartsCard({ surface, input, elements, setCount, edit, patch, settings }) {
  const [more, setMore] = useState(false);
  const [dims, setDims] = useState(null);
  const own = elements.filter((e) => !e.addon);
  const v = (e) => input.counts[e.key] ?? 0;
  const isRare = (e) => RARE.has(e.rawKey || e.key) && !v(e);
  const main = own.filter((e) => !isRare(e));
  const rare = own.filter(isRare);
  const bigKeys = new Set([
    main.find((e) => e.unit === 'stk')?.key,
    main.find((e) => e.unit !== 'stk')?.key,
  ].filter(Boolean));
  const tileProps = { input, setCount, settings, dims, setDims };

  return (
    <>
      {surface.shapes && (
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Form">
          {surface.shapes.map((sh) => {
            const on = sh.key === input.shape;
            return (
              <button key={sh.key} type="button" role="radio" aria-checked={on} data-testid={`fol-shape-${sh.key}`}
                      onClick={() => edit(0, (s) => withShape(s, sh.key))}
                      className={`grid justify-items-center gap-1 py-2 px-1 rounded-xl text-[12px] font-semibold
                                  ${on ? 'bg-[#f0f5fb] text-navy shadow-[inset_0_0_0_2px_#1e5490]' : 'text-ink shadow-[inset_0_0_0_1px_#dfe6ec]'}`}>
                <span className="h-7 grid place-items-center scale-[.6]"><ShapeGlyph kind={sh.key} /></span>
                {sh.label}
              </button>
            );
          })}
        </div>
      )}

      {surface.types && (
        <div className="grid grid-cols-2 gap-1.5" data-testid="fol-types">
          {surface.types.map((tp) => {
            const n = input.types?.[tp.key] || 0;
            return (
              <div key={tp.key} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${n ? 'bg-[#fff8ec] shadow-[inset_0_0_0_1.5px_#e0951f]' : 'shadow-[inset_0_0_0_1px_#dfe6ec]'}`}
                   data-testid={`fol-type-${tp.key}`}>
                <span className="w-8 shrink-0"><TypeGlyph kind={tp.key} /></span>
                <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-ink leading-tight">{tp.label}</span>
                <span className="flex items-center">
                  <MiniStep label={`${tp.label} weniger`} onClick={() => edit(0, (s) => withType(s, tp.key, n - 1))}><Minus size={14} /></MiniStep>
                  <b className="w-5 text-center text-[14px] tabular-nums">{n}</b>
                  <MiniStep label={`${tp.label} mehr`} onClick={() => edit(0, (s) => withType(s, tp.key, n + 1))}><Plus size={14} /></MiniStep>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Tiles items={main} big={bigKeys} {...tileProps} />
      {rare.length > 0 && (more
        ? <Tiles items={rare} big={new Set()} {...tileProps} />
        : (
          <button type="button" onClick={() => setMore(true)} data-testid="fol-more-parts"
                  className="justify-self-start text-[12.5px] font-semibold text-navy px-0.5 py-1">
            + {rare.map((e) => e.label).join(', ')}
          </button>
        ))}

      {(surface.addons || []).map((a) => {
        const on = input.addons.includes(a.key);
        const els = elements.filter((e) => e.addon === a.key);
        const sub = on
          ? els.map((e) => (e.unit === 'stk' ? `${fmtNum(v(e), 0)} ${shortLabel(e.label)}` : `${fmtNum(v(e), 1)} ${unitOf(e)} ${shortLabel(e.label)}`)).join(' · ')
          : a.hint;
        return (
          <div key={a.key} data-testid={`fol-addon-${a.key}`}
               className={`rounded-[14px] px-2.5 py-2 grid gap-2 ${on ? 'bg-[#f6fbf7] shadow-[inset_0_0_0_1.5px_#9fd0ad]' : 'shadow-[inset_0_0_0_1px_#e3e9ee]'}`}>
            <button type="button" role="switch" aria-checked={on} onClick={() => edit(0, (s) => withAddon(s, a.key, !on))}
                    className="flex items-center justify-between gap-3 text-left min-h-[40px]">
              <span className="min-w-0"><b className="block text-[14px] text-ink">{a.label}</b>
                <small className="block text-[11.5px] text-ink-muted">{sub}</small></span>
              <Toggle on={on} />
            </button>
            {on && <Tiles items={els} big={new Set(els.slice(0, 2).map((e) => e.key))} onWhite {...tileProps} />}
          </div>
        );
      })}

      {(input.extraSurfaces || []).map((k) => {
        const sf = surfaceByKey(k);
        const els = elements.filter((e) => e.addon === `surface:${k}`);
        return (
          <div key={k} className="rounded-[14px] px-2.5 py-2 grid gap-2 bg-[#f6fbf7] shadow-[inset_0_0_0_1.5px_#9fd0ad]">
            <b className="text-[14px] text-ink">{sf.label}</b>
            <Tiles items={els} big={new Set()} onWhite {...tileProps} />
          </div>
        );
      })}

      {dims && (() => {
        const e = elements.find((x) => x.key === dims);
        if (!e) return null;
        return (
          <div className="rounded-[14px] shadow-[inset_0_0_0_1px_#dfe6ec] px-2.5 py-2" data-testid="fol-dims">
            <div className="flex items-center justify-between mb-1">
              <b className="text-[13px] text-ink">Maße · {e.label}</b>
              <button type="button" onClick={() => setDims(null)} aria-label="Maße schließen" className="w-8 h-8 grid place-items-center text-ink-muted"><X size={16} /></button>
            </div>
            <DimTable e={e} surfaceKey={e.surfaceKey || surface.key} qty={v(e)} input={input} patch={(p) => patch(0, p)} settings={settings} />
          </div>
        );
      })()}
    </>
  );
}

const shortLabel = (l) => l.replace(/^Insel-/, '').replace('Inselplatte', 'Platte').replace('Sichtseiten', 'Seiten');

function Tiles({ items, big, input, setCount, settings, dims, setDims, onWhite }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map((e) => {
        const value = input.counts[e.key] ?? 0;
        const hasDims = value > 0 && (pieceDefault(e.surfaceKey, e.rawKey || e.key) || input.pieces?.[e.key]);
        return (
          <Tile key={e.key} e={e} value={value} big={big.has(e.key)} onWhite={onWhite}
                onChange={(n) => setCount(e.key, n)}
                dims={hasDims ? { on: dims === e.key, toggle: () => setDims(dims === e.key ? null : e.key) } : null} />
        );
      })}
    </div>
  );
}

function Tile({ e, value, big, onChange, dims, onWhite }) {
  const step = e.stepSize || 1;
  const [text, setText] = useState(null);
  const unit = unitOf(e);
  const commit = () => { const n = parseDecimal(text); if (n != null) onChange(n); setText(null); };
  return (
    <div className={`rounded-xl pl-2.5 pr-2 py-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5
                     ${onWhite ? 'bg-paper' : big ? 'bg-[#f6f9fc]' : ''} shadow-[inset_0_0_0_1px_#dfe6ec]`}
         data-testid={`fol-el-${e.key}`}>
      <span className="col-span-2 flex items-center justify-between gap-1 min-w-0">
        <span className="text-[11.5px] text-ink-muted leading-tight line-clamp-2 [overflow-wrap:anywhere]">{e.label}</span>
        {dims && (
          <button type="button" onClick={dims.toggle} aria-pressed={dims.on} data-testid={`fol-dims-${e.key}`}
                  className={`shrink-0 inline-flex items-center gap-0.5 text-[10.5px] font-bold rounded-md px-1 ${dims.on ? 'text-paper bg-navy' : 'text-navy'}`}>
            <Ruler size={11} aria-hidden="true" />Maße
          </button>
        )}
      </span>
      <label className="flex items-baseline min-w-0">
        <input value={text ?? String(value).replace('.', ',')} inputMode="decimal" aria-label={e.label}
               onFocus={(ev) => { setText(String(value).replace('.', ',')); ev.target.select(); }}
               onChange={(ev) => setText(ev.target.value)} onBlur={commit}
               onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur(); }}
               data-testid={`fol-count-${e.key}`}
               className={`w-full min-w-0 bg-transparent outline-none font-headings font-extrabold text-ink tabular-nums
                           ${big ? 'text-[22px]' : 'text-[18px]'} leading-tight`}
               style={{ width: `${Math.max(1, (text ?? String(value)).length) + 0.4}ch` }} />
        {unit && <em className="not-italic text-[11px] font-semibold text-ink-faint ml-0.5">{unit}</em>}
      </label>
      <span className="flex gap-1">
        <MiniStep label={`${e.label} weniger`} onClick={() => onChange(Math.max(0, Math.round((value - step) * 100) / 100))}><Minus size={14} /></MiniStep>
        <MiniStep label={`${e.label} mehr`} onClick={() => onChange(Math.round((value + step) * 100) / 100)}><Plus size={14} /></MiniStep>
      </span>
    </div>
  );
}

function MiniStep({ label, onClick, children }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
            className="w-[34px] h-[34px] rounded-[10px] bg-[#eef2f6] text-ink grid place-items-center active:scale-95 transition-transform duration-press">
      {children}
    </button>
  );
}

function Toggle({ on }) {
  return (
    <span aria-hidden="true" className={`relative w-10 h-6 rounded-full shrink-0 transition-colors duration-ui ${on ? 'bg-[#2f7a45]' : 'bg-[#d8e0e7]'}`}>
      <i className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-paper shadow transition-[left] duration-ui ${on ? 'left-[19px]' : 'left-[3px]'}`} />
    </span>
  );
}

function Chip({ on, onClick, children, testid }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testid}
            className={`min-h-[36px] px-3 rounded-full text-[12.5px] ${on ? 'bg-navy text-paper font-semibold' : 'text-ink shadow-[inset_0_0_0_1px_#dfe6ec]'}`}>
      {children}
    </button>
  );
}

function Label({ children, hint }) {
  return <p className="m-0 mt-1 text-[12px] font-semibold text-ink-muted">{children}{hint && <span className="font-normal text-ink-faint ml-1.5">{hint}</span>}</p>;
}

/* ── Karte 2: Zustand, Material, Dekor ─────────────────────────────────── */
/* Read-only: the figures the price above is built from, and the way to change them. */
function PricesCard({ settings }) {
  const rows = [
    ['Stundensatz', `${eur(settings.hourlyRate)}/h`],
    ['Mindestauftrag', eur(settings.minOrder)],
    ['Verschnitt', `${fmtNum(settings.waste, 0)} %`],
    ['Rüstzeit je Auftrag', `${fmtNum(settings.setupHours, 1)} h`],
    ['Wochenende', `+${fmtNum(settings.weekendPct, 0)} %`],
    ['Anfahrt bis 30 km', eur(settings.travel?.[TRAVEL_ZONES[0]?.key] ?? 0)],
  ];
  return (
    <div className="grid gap-2.5" data-testid="fol-prices-card">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 m-0 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-[#eef2f5] pb-1.5 min-w-0">
            <dt className="text-ink-muted truncate">{k}</dt><dd className="m-0 font-semibold text-ink tabular-nums whitespace-nowrap">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-[12px] font-semibold text-ink-muted mb-1.5">Folie, Verkauf je m²</p>
        <div className="grid grid-cols-4 gap-1.5">
          {DECORS.map((d) => (
            <span key={d.key} className="rounded-[10px] bg-[#f6f8fa] px-2 py-1.5 min-w-0">
              <small className="block text-[10.5px] text-ink-muted truncate">{d.label}</small>
              <b className="block text-[12.5px] text-ink tabular-nums">{eur(settings.decors?.[d.key]?.vk ?? d.vk)}</b>
            </span>
          ))}
        </div>
      </div>
      <Link to="/folierung/preise" data-testid="fol-prices-edit"
            className="min-h-[44px] rounded-xl bg-[#eef3f8] text-navy font-bold text-[14px] flex items-center justify-center gap-2">
        Preise bearbeiten <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

function StateCard({ surface, input, patch, settings }) {
  return (
    <>
      <Label>Zustand der {surface.key === 'kueche' ? 'Fronten' : 'Flächen'}</Label>
      <div className="grid grid-cols-2 gap-1.5">
        {CONDITIONS.map((c) => {
          const on = c.key === input.condition;
          return (
            <button key={c.key} type="button" onClick={() => patch(1, { condition: c.key })} aria-pressed={on} data-testid={`fol-cond-${c.key}`}
                    className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12.5px] min-h-[48px]
                                ${on ? 'bg-[#f0f5fb] font-semibold text-ink shadow-[inset_0_0_0_2px_#1e5490]' : 'text-ink shadow-[inset_0_0_0_1px_#dfe6ec]'}`}>
              <ConditionIcon kind={c.key} className="w-6 h-8 shrink-0" />
              <span className="min-w-0 leading-tight">{c.label}</span>
            </button>
          );
        })}
      </div>
      <Label hint="bestimmt den Primer">Material</Label>
      <div className="flex flex-wrap gap-1.5">
        {(SUBSTRATES_FOR[surface.key] || []).map((k) => {
          const s = substrateByKey(k);
          return <Chip key={k} on={k === input.substrate} onClick={() => patch(1, { substrate: k })} testid={`fol-sub-${k}`}>{s.label}</Chip>;
        })}
      </div>
      <p className="m-0 text-[11.5px] text-ink-faint">{PRIMER_LABEL[substrateByKey(input.substrate)?.primer] || ''}</p>
      <Label>Dekor</Label>
      <div className="grid grid-cols-7 gap-1.5">
        {DECORS.map((d) => {
          const on = d.key === input.decor;
          const sample = settings.decors?.[d.key]?.sample;
          return (
            <button key={d.key} type="button" onClick={() => patch(1, { decor: d.key })} aria-pressed={on} data-testid={`fol-decor-${d.key}`}
                    title={`${d.label} · VK ${eur(settings.decors?.[d.key]?.vk ?? d.vk)}/m²`}
                    className={`grid justify-items-center gap-1 text-[10px] leading-tight min-w-0 ${on ? 'text-navy font-bold' : 'text-ink-muted'}`}>
              <i className={`block w-full aspect-square rounded-[9px] ${on ? 'shadow-[0_0_0_2px_#fff,0_0_0_4px_#1e5490]' : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]'}`}
                 style={sample ? { backgroundImage: `url(${sample})`, backgroundSize: 'cover' } : { background: d.swatch }} />
              <span className="truncate max-w-full">{d.label.split(/[ &]/)[0]}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ── Karte 3: Extras und Anfahrt ───────────────────────────────────────── */
function ExtrasCard({ input, patch, settings }) {
  return (
    <>
      <div className="grid">
        {EXTRAS.map((x) => {
          const v = input.extras[x.key];
          const price = settings.extras?.[x.key];
          const tag = x.pct != null ? `+${price ?? x.pct} %` : x.perFront != null ? `${eur(price ?? x.perFront)} je Front` : `${eur(price ?? x.perItem)} je Stück`;
          if (x.count) {
            const n = v || 0;
            return (
              <div key={x.key} className="flex items-center justify-between gap-3 min-h-[52px] border-b border-[#f1f4f6]" data-testid={`fol-extra-${x.key}`}>
                <span className="min-w-0"><span className="block text-[13.5px] text-ink">{x.label}</span><small className="block text-[11px] text-ink-faint">{tag}</small></span>
                <span className="flex items-center gap-1">
                  <MiniStep label={`${x.label} weniger`} onClick={() => patch(2, { extras: { ...input.extras, [x.key]: Math.max(0, n - 1) } })}><Minus size={14} /></MiniStep>
                  <b className="w-6 text-center tabular-nums">{n}</b>
                  <MiniStep label={`${x.label} mehr`} onClick={() => patch(2, { extras: { ...input.extras, [x.key]: n + 1 } })}><Plus size={14} /></MiniStep>
                </span>
              </div>
            );
          }
          return (
            <button key={x.key} type="button" role="switch" aria-checked={!!v} data-testid={`fol-extra-${x.key}`}
                    onClick={() => patch(2, { extras: { ...input.extras, [x.key]: !v } })}
                    className="flex items-center justify-between gap-3 min-h-[52px] border-b border-[#f1f4f6] text-left">
              <span className="min-w-0"><span className="block text-[13.5px] text-ink">{x.label}</span><small className="block text-[11px] text-ink-faint">{tag}</small></span>
              <Toggle on={!!v} />
            </button>
          );
        })}
      </div>
      <Label>Anfahrt</Label>
      <div className="flex flex-wrap gap-1.5">
        {TRAVEL_ZONES.map((z) => (
          <Chip key={z.key} on={z.key === input.travel} onClick={() => patch(2, { travel: z.key })} testid={`fol-travel-${z.key}`}>
            {z.label.split('·')[0].replace(', mit Übernachtung', '').trim()}{settings.travel?.[z.key] ? ` · ${eur(settings.travel[z.key])}` : ''}
          </Chip>
        ))}
      </div>
      <button type="button" role="switch" aria-checked={!!input.weekend} onClick={() => patch(2, { weekend: !input.weekend })}
              className="flex items-center justify-between gap-3 min-h-[48px] text-left" data-testid="fol-weekend">
        <span><span className="block text-[13.5px] text-ink">Wochenende oder nachts</span>
          <small className="block text-[11px] text-ink-faint">Ladenlokal, Praxis, Hotel</small></span>
        <Toggle on={!!input.weekend} />
      </button>
    </>
  );
}

/* ── Preis-Blatt ───────────────────────────────────────────────────────── */
function PriceSheet({ result, input, settings, elements, colorOf, patch, onClose, onSave, saved, onCreate, creating, noCount, onCopy, copied }) {
  const { panel, dialogProps } = useSheetModal(true, onClose, { label: 'Preis und Kalkulation' });
  const ways = [
    ['montage', 'Montage vor Ort', '1–3 Tage vor Ort'],
    ['pickup', 'Abholung', 'wir folieren in der Werkstatt'],
    ['diy', 'Zuschnitt-Set', 'selbst kleben'],
  ].filter(([k]) => result.ways[k]);
  return (
    <div className="fixed inset-0 z-[60] bg-ink/40 flex items-end md:items-center justify-center" {...dialogProps} onClick={onClose} data-testid="fol-price-sheet">
      <div ref={panel} onClick={(e) => e.stopPropagation()}
           className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-cream rounded-t-[22px] md:rounded-[22px] px-3.5 pt-2 pb-[calc(14px+env(safe-area-inset-bottom))] grid gap-3">
        <div className="justify-self-center w-10 h-1 rounded-full bg-[#cfd9e2]" aria-hidden="true" />
        <div className="flex items-baseline justify-between gap-3">
          <b className="font-headings text-[17px] text-ink">Preis</b>
          <span className="flex items-center gap-2">
            <span className="text-[11.5px] text-ink-muted">Richtwert, {vatLabel(result.vat)}</span>
            <button type="button" onClick={onClose} aria-label="Schließen" className="w-9 h-9 grid place-items-center rounded-xl text-ink-muted" data-testid="fol-price-close"><X size={18} /></button>
          </span>
        </div>
        <div className={`grid gap-1.5 ${ways.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {ways.map(([k, label, sub], i) => {
            const w = result.ways[k];
            return (
              <div key={k} className={`rounded-xl px-2.5 py-2 grid min-w-0 ${i === 0 ? 'bg-[#f0f5fb] shadow-[inset_0_0_0_2px_#1e5490]' : 'bg-paper shadow-[inset_0_0_0_1px_#dfe6ec]'}`}
                   data-testid={`fol-way-${k}`}>
                <small className="text-[11px] text-ink-muted truncate">{label}</small>
                <b className="font-headings text-[17px] text-ink tabular-nums leading-tight">{w.value > 0 ? `ab ${eur(roundTo(w.grossLo, 10))}` : '–'}</b>
                <em className="not-italic text-[10.5px] text-ink-faint truncate">{sub}</em>
              </div>
            );
          })}
        </div>
        {result.notes.filter((n) => n.level !== 'info').map((n, i) => (
          <div key={i} className="flex gap-2 rounded-xl bg-paper border border-sm-border px-3 py-2 text-[13px] text-ink">
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-text" /><span>{n.text}</span>
          </div>
        ))}
        <ProPanel result={result} input={input} settings={settings} />
        {result.nesting && <NestingCard nesting={result.nesting} settings={settings} />}
        <CutSummary result={result} settings={settings} elements={elements} colorOf={colorOf} input={input} patch={patch} />
        <div className="grid grid-cols-[auto_auto_1fr] gap-2 sticky bottom-0 bg-cream pt-1">
          <button type="button" onClick={onSave} data-testid="fol-save"
                  className="min-h-[46px] px-3.5 rounded-xl bg-paper border border-sm-border text-ink font-bold text-[14px] inline-flex items-center gap-1.5">
            {saved ? <Check size={16} /> : <Save size={16} />}{saved ? 'Gespeichert' : 'Speichern'}
          </button>
          <button type="button" onClick={onCopy} aria-label="Zusammenfassung kopieren" title="Zusammenfassung kopieren"
                  className="min-h-[46px] w-[46px] rounded-xl bg-paper border border-sm-border text-ink grid place-items-center">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <button type="button" onClick={onCreate} disabled={creating || noCount} data-testid="fol-sheet-create"
                  className="min-h-[46px] rounded-xl bg-amber text-on-amber font-bold text-[14px] inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
            <FileText size={16} />{creating ? 'Lege an…' : 'Angebot erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
