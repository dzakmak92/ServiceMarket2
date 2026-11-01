import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, Minus, Plus, Sparkles, Copy, FileText, Save, Info,
  AlertTriangle, Droplets, Clock, Layers, Coins, ChevronDown, ExternalLink,
} from 'lucide-react';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { copyToClipboard } from '../utils/sms';
import { parseDecimal } from '../utils/number';
import {
  SURFACES, surfaceByKey, activeElements, CONDITIONS, SUBSTRATES, SUBSTRATES_FOR,
  substrateByKey, DECORS, EXTRAS, TRAVEL_ZONES,
} from './catalog';
import { calculate, emptyInput, withAddon, withShape, summaryText } from './pricing';
import Drawing, { drawingFor, SurfaceIcon, ConditionIcon } from './Drawings';

/**
 * Der Folierungs-Rechner in vier Schritten, nach dem Muster, das Retrena auf
 * retrena.de/kueche-folieren-lassen vorführt: Oberfläche → Zustand → Zählen
 * → Preis. Erweitert um alles, was eine Küche nicht braucht, ein Betrieb
 * aber schon: acht Oberflächen-Welten, den Untergrund mit Primer-Vorschlag
 * und eine zweite Ansicht für den Betrieb selbst.
 *
 * `audience`
 *   'customer'  die öffentliche Seite. Zeigt drei Wege zum Preis als Spanne,
 *               fragt nach Fotos, verlinkt WhatsApp und die KI-Vorschau.
 *   'pro'       dieselben Schritte, dazu EK, VK, Deckungsbeitrag, Stunden,
 *               Primer in ml und Gebinden, Verbrauchsmaterial, Speichern.
 */

const STEPS = [
  { key: 'surface', label: 'Fläche' },
  { key: 'state', label: 'Zustand' },
  { key: 'count', label: 'Zählen' },
  { key: 'price', label: 'Preis' },
];

/* Das Modul spricht deutsch, auch wenn die Oberfläche englisch steht: der
   Endkunde liest die öffentliche Seite ohne Sprachwahl. */
const eur = (v) => `${Math.round(Number(v) || 0).toLocaleString('de-DE')} €`;
const fmtNum = (v, d = 1) => Number(v || 0).toLocaleString('de-DE', { maximumFractionDigits: d });
const eurRange = (w) => `${eur(roundTo(w.lo, 10))} – ${eur(roundTo(w.hi, 10))}`;
const roundTo = (v, step) => Math.round(v / step) * step;

export default function FolierungWizard({ audience = 'customer', settings, initial, onSave, onCreateQuote }) {
  const isPro = audience === 'pro';
  const [step, setStep] = useState(0);
  const [input, setInput] = useState(() => initial || emptyInput('kueche'));
  const [active, setActive] = useState(null);     // hervorgehobenes Element in der Zeichnung
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const topRef = useRef(null);

  const surface = surfaceByKey(input.surface);
  const elements = useMemo(() => activeElements(surface, input.addons), [surface, input.addons]);
  const result = useMemo(() => calculate(input, settings), [input, settings]);

  useEffect(() => { topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [step]);
  useEffect(() => { setSaved(false); }, [input]);

  const patch = (p) => setInput((i) => ({ ...i, ...p }));
  const setCount = (key, v) => setInput((i) => ({ ...i, counts: { ...i.counts, [key]: Math.max(0, v) } }));
  const chooseSurface = (key) => {
    if (key === input.surface) return;
    setInput(emptyInput(key));
    setActive(null);
  };
  const go = (n) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)));

  const share = async () => {
    const ok = await copyToClipboard(summaryText(input, result, settings));
    setCopied(!!ok);
    setTimeout(() => setCopied(false), 2000);
  };
  const waHref = settings.whatsapp
    ? `https://wa.me/${settings.whatsapp.replace(/[^\d]/g, '')}?text=${encodeURIComponent(summaryText(input, result, settings))}`
    : null;

  return (
    <div ref={topRef} className="scroll-mt-24">
      <Progress step={step} onJump={(n) => n < step && go(n)} />

      {step === 0 && (
        <section>
          <StepTitle title="Was soll foliert werden?" sub="Tipp die Fläche an, die deiner am nächsten kommt. Jede hat ihre eigene Zählzeichnung." />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SURFACES.map((s) => (
              <Choice key={s.key} on={s.key === input.surface} onClick={() => chooseSurface(s.key)} testId={`fol-surface-${s.key}`}>
                <SurfaceIcon kind={s.key} className="w-12 h-12 shrink-0" />
                <div className="min-w-0">
                  <div className="font-headings font-bold text-ink leading-tight">{s.label}</div>
                  <div className="text-xs text-ink-muted mt-0.5 leading-snug">{s.tagline}</div>
                </div>
              </Choice>
            ))}
          </div>

          {surface.shapes && (
            <>
              <Kicker className="mt-8">Wie sieht deine {surface.label} aus?</Kicker>
              <p className="text-sm text-ink-muted mb-3">Tipp die Form an. Das setzt nur Startwerte; gezählt wird im übernächsten Schritt.</p>
              <div className="grid gap-2">
                {surface.shapes.map((sh) => (
                  <Choice key={sh.key} on={sh.key === input.shape} onClick={() => setInput(withShape(input, sh.key))} row>
                    <ShapeGlyph kind={sh.key} />
                    <div><div className="font-headings font-bold text-ink">{sh.label}</div><div className="text-xs text-ink-muted">{sh.hint}</div></div>
                  </Choice>
                ))}
              </div>
            </>
          )}

          {surface.addons && (
            <>
              <Kicker className="mt-8">Welche Bausteine hat deine Küche noch?</Kicker>
              <p className="text-sm text-ink-muted mb-3">Jeder Baustein bekommt einen eigenen Zählschritt.</p>
              <div className="grid gap-2">
                {surface.addons.map((a) => {
                  const on = input.addons.includes(a.key);
                  return (
                    <Choice key={a.key} on={on} onClick={() => setInput(withAddon(input, a.key, !on))} row testId={`fol-addon-${a.key}`}>
                      <div className="w-12 h-9 shrink-0"><Drawing kind={a.drawing} only={[]} className="h-9" /></div>
                      <div className="min-w-0">
                        <div className="font-headings font-bold text-ink">{a.label}</div>
                        <div className="text-xs text-ink-muted">{a.hint} · <span className="font-semibold text-ink">eigener Schritt</span></div>
                      </div>
                    </Choice>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {step === 1 && (
        <section>
          <StepTitle title={`Wie sehen deine ${surface.key === 'kueche' ? 'Fronten' : 'Flächen'} heute aus?`}
            sub="Tippe auf das Bild, das am nächsten kommt. Die Auswahl gilt für alles, auch für Bausteine." />
          <div className="grid gap-2">
            {CONDITIONS.map((c) => (
              <Choice key={c.key} on={c.key === input.condition} onClick={() => patch({ condition: c.key })} row testId={`fol-cond-${c.key}`}>
                <ConditionIcon kind={c.key} className="w-12 h-16 shrink-0" />
                <div>
                  <div className="font-headings font-bold text-ink">{c.label}</div>
                  <div className="text-xs text-ink-muted">{c.hint}</div>
                  <div className="text-xs font-semibold text-ink mt-0.5">{c.badge}</div>
                </div>
              </Choice>
            ))}
          </div>

          <Kicker className="mt-8">Woraus ist die Fläche?</Kicker>
          <p className="text-sm text-ink-muted mb-3">Daraus folgt die Vorarbeit und der Primer. {isPro ? 'Der Vorschlag steht im Preis-Schritt in Millilitern.' : 'Wenn du unsicher bist: lass die Vorauswahl, das Foto klärt es.'}</p>
          <div className="grid gap-2">
            {(SUBSTRATES_FOR[surface.key] || []).map((k) => {
              const s = substrateByKey(k);
              return (
                <Choice key={k} on={k === input.substrate} onClick={() => patch({ substrate: k })} row small testId={`fol-sub-${k}`}>
                  <div className="min-w-0">
                    <div className="font-semibold text-ink text-sm">{s.label}</div>
                    <div className="text-xs text-ink-muted">{PRIMER_LABEL[s.primer]}{s.product === 'plastic' ? ' · Kunststoffprimer' : ''}</div>
                  </div>
                </Choice>
              );
            })}
          </div>

          <Kicker className="mt-8">Welches Dekor?</Kicker>
          <p className="text-sm text-ink-muted mb-3">Über 500 Dekore, sortiert in sieben Familien. Die genaue Farbe wählst du am Muster.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DECORS.map((d) => {
              const on = d.key === input.decor;
              const sample = settings.decors?.[d.key]?.sample;
              return (
                <button key={d.key} type="button" onClick={() => patch({ decor: d.key })} data-testid={`fol-decor-${d.key}`}
                  className={`text-left rounded-2xl border overflow-hidden transition ${on ? 'border-amber ring-2 ring-amber/40' : 'border-sm-border hover:border-teal/40'} bg-paper`}>
                  <div className="h-16 w-full" style={sample ? { backgroundImage: `url(${sample})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: d.swatch }} />
                  <div className="p-2.5">
                    <div className="font-headings font-bold text-ink text-sm leading-tight">{d.label}</div>
                    <div className="text-[11px] text-ink-muted leading-snug mt-0.5">{d.hint}</div>
                    {isPro && <div className="text-[11px] text-ink-muted mt-1">VK {eur(settings.decors?.[d.key]?.vk ?? d.vk)}/m²</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <StepTitle title="Jetzt kurz zählen und abschätzen" sub={surface.intro} />
          <CountBlock surface={surface} drawing={surface.key === 'moebel' ? 'furniture' : surface.drawing}
            elements={elements.filter((e) => !e.addon)} input={input} setCount={setCount} active={active} setActive={setActive} />
          {(surface.addons || []).filter((a) => input.addons.includes(a.key)).map((a) => (
            <div key={a.key} className="mt-8">
              <Kicker>{a.label}</Kicker>
              <CountBlock surface={surface} drawing={a.drawing} elements={elements.filter((e) => e.addon === a.key)}
                input={input} setCount={setCount} active={active} setActive={setActive} />
            </div>
          ))}

          <Kicker className="mt-8">Extras</Kicker>
          <div className="grid gap-2">
            {EXTRAS.map((x) => {
              const v = input.extras[x.key];
              const price = settings.extras?.[x.key];
              const tag = x.pct != null ? `+${price} %` : x.perFront != null ? `${eur(price)} je Front` : `${eur(price)} je Stück`;
              if (x.count) {
                return (
                  <div key={x.key} className="flex items-center justify-between gap-3 rounded-2xl border border-sm-border bg-paper px-4 py-3">
                    <div className="min-w-0"><div className="font-semibold text-ink text-sm">{x.label}</div><div className="text-xs text-ink-muted">{x.hint} · {tag}</div></div>
                    <Stepper value={v || 0} onChange={(n) => patch({ extras: { ...input.extras, [x.key]: n } })} step={1} />
                  </div>
                );
              }
              return (
                <label key={x.key} className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 cursor-pointer ${v ? 'border-amber bg-amber/5' : 'border-sm-border bg-paper'}`}>
                  <div className="min-w-0"><div className="font-semibold text-ink text-sm">{x.label}</div><div className="text-xs text-ink-muted">{x.hint} · {tag}</div></div>
                  <input type="checkbox" checked={!!v} onChange={(e) => patch({ extras: { ...input.extras, [x.key]: e.target.checked } })} className="w-5 h-5 accent-amber" data-testid={`fol-extra-${x.key}`} />
                </label>
              );
            })}
          </div>

          <Kicker className="mt-8">Anfahrt</Kicker>
          <div className="grid gap-2">
            <select value={input.travel} onChange={(e) => patch({ travel: e.target.value })} className="rounded-2xl border border-sm-border bg-paper px-4 py-3 text-sm text-ink" data-testid="fol-travel">
              {TRAVEL_ZONES.map((z) => <option key={z.key} value={z.key}>{z.label}{settings.travel?.[z.key] ? ` · ${eur(settings.travel[z.key])}` : ''}</option>)}
            </select>
            <label className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 cursor-pointer ${input.weekend ? 'border-amber bg-amber/5' : 'border-sm-border bg-paper'}`}>
              <div><div className="font-semibold text-ink text-sm">Wochenende oder nachts</div><div className="text-xs text-ink-muted">Ladenlokal, Praxis, Hotel: Arbeit außerhalb der Öffnungszeit · +{settings.weekendPct} % auf die Arbeit</div></div>
              <input type="checkbox" checked={!!input.weekend} onChange={(e) => patch({ weekend: e.target.checked })} className="w-5 h-5 accent-amber" />
            </label>
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <StepTitle title={isPro ? 'Kalkulation' : 'Deine drei Wege zum Preis'}
            sub={isPro ? 'Richtwert, Kosten und Material auf Basis deiner Preise. Den Festpreis machst du nach den Fotos.' : 'Richtwerte auf Basis deiner Angaben. Deinen Festpreis bekommst du nach kostenloser Foto-Einschätzung.'} />
          <button type="button" onClick={() => go(2)} className="text-sm text-teal underline-offset-2 hover:underline inline-flex items-center gap-1 mb-4"><ArrowLeft size={14} /> Angaben ändern</button>

          {result.notes.filter((n) => n.level !== 'info').map((n, i) => (
            <div key={i} className={`flex gap-2 rounded-2xl border px-4 py-3 text-sm mb-3 ${n.level === 'high' ? 'border-amber-500/40 bg-amber-500/5 text-amber-700' : 'border-sm-border bg-paper text-ink'}`}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{n.text}</span>
            </div>
          ))}

          {/* Weg 1: Montage vor Ort */}
          <WayCard badge="Meistgewählt" title="Montage vor Ort" sub="Das Team kommt zu dir, fertig in 1–3 Tagen" way={result.ways.montage}
            bullets={[`Auch ${surface.key === 'kueche' ? 'Arbeitsplatte, Insel & Nischenrückwand' : 'alles Verbaute, das nicht in die Werkstatt kann'}`, '10 Jahre Herstellergarantie auf Haftung und Farbstabilität', result.perFront ? `ca. ${eur(result.perFront)} je Front` : null]}
            cta={!isPro && <CtaRow waHref={waHref} onCopy={share} copied={copied} label="Festpreis anfragen" />} />

          {!isPro && (
            <div className="rounded-2xl border-2 border-amber bg-paper p-5 text-center mb-3">
              <h3 className="font-headings font-bold text-ink text-lg">Aus dem Richtwert wird dein Festpreis</h3>
              <p className="text-sm text-ink-muted mt-1 mb-4">Schick 2–3 Handyfotos. Innerhalb von 24 Stunden bekommst du den verbindlichen Preis, inklusive An- und Abfahrt.</p>
              <CtaRow waHref={waHref} onCopy={share} copied={copied} label="Fotos per WhatsApp schicken" stacked />
              <p className="text-xs text-ink-muted mt-3">Die Einschätzung ist kostenlos. Entscheiden musst du erst, wenn der Festpreis steht.</p>
            </div>
          )}

          {result.ways.pickup && (
            <WayCard title="Hol- & Bring-Service" sub="Du montierst Fronten & Co. selbst ab, wir holen sie, folieren in der Werkstatt und bringen sie zurück" way={result.ways.pickup}
              bullets={[`Rund ${Math.round((1 - result.ways.pickup.value / result.ways.montage.value) * 100)} % günstiger als Montage vor Ort`, 'Werkstattzeit 1–2 Wochen', result.ways.pickup.onsiteLeft ? 'Verbautes (Platte, Nische, Korpus) machen wir beim Zurückbringen vor Ort' : null, 'Wiedermontage machst du selbst, oder wir gegen Aufpreis']}
              cta={!isPro && <CtaRow waHref={waHref} onCopy={share} copied={copied} label="Abholung anfragen" ghost />} />
          )}

          <WayCard title="Selbst machen" sub="Zuschnitt-Set nach deinen Maßen, du klebst selbst" way={result.ways.diy}
            bullets={[`${fmtNum(result.material.m2, 1)} m² Folie inkl. Verschnitt, auf Maß geschnitten`, `Primer dazu: ${result.primer.mode === 'none' ? 'nicht nötig' : result.primer.packs.map((p) => `${p.n} × ${p.ml >= 1000 ? '1 l' : '250 ml'}`).join(' + ')}`, 'Rakel, Cutter und Anleitung liegen bei']}
            cta={!isPro && <CtaRow waHref={waHref} onCopy={share} copied={copied} label="Zuschnitt-Set anfragen" ghost />} />

          {/* KI-Vorschau */}
          <div className="rounded-2xl border border-sm-border bg-paper p-5 mb-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal/10 text-teal flex items-center justify-center shrink-0"><Sparkles size={20} /></div>
              <div className="min-w-0 flex-1">
                <h3 className="font-headings font-bold text-ink">Vorher / Nachher mit KI</h3>
                <p className="text-sm text-ink-muted mt-1">Lade ein Foto hoch und sieh dein {surface.label.toLowerCase().includes('küche') ? 'Küche' : surface.short} im gewählten Dekor, bevor du dich entscheidest.</p>
                {settings.aiUrl ? (
                  <a href={settings.aiUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-3 rounded-xl bg-teal text-paper px-4 py-2.5 text-sm font-semibold hover:bg-teal-deep" data-testid="fol-ai-link">
                    Vorschau öffnen <ExternalLink size={14} />
                  </a>
                ) : (
                  <p className="text-xs text-amber-text mt-2">{isPro ? 'Noch kein Link hinterlegt. Trag ihn unter Preise & Einstellungen ein.' : 'Vorschau folgt in Kürze.'}</p>
                )}
              </div>
            </div>
          </div>

          {isPro && <ProPanel result={result} input={input} settings={settings} />}

          {isPro && (
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" onClick={() => { onSave?.({ input, result }); setSaved(true); }} className="inline-flex items-center gap-2 rounded-xl bg-teal text-paper px-4 py-2.5 text-sm font-semibold hover:bg-teal-deep" data-testid="fol-save">
                {saved ? <Check size={16} /> : <Save size={16} />} {saved ? 'Gespeichert' : 'Kalkulation speichern'}
              </button>
              {onCreateQuote && (
                <button type="button" onClick={() => onCreateQuote({ input, result })} className="inline-flex items-center gap-2 rounded-xl border border-sm-border bg-paper text-ink px-4 py-2.5 text-sm font-semibold hover:bg-cream-soft">
                  <FileText size={16} /> Angebot daraus
                </button>
              )}
              <button type="button" onClick={share} className="inline-flex items-center gap-2 rounded-xl border border-sm-border bg-paper text-ink px-4 py-2.5 text-sm font-semibold hover:bg-cream-soft">
                <Copy size={16} /> {copied ? 'Kopiert' : 'Zusammenfassung kopieren'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Steuerleiste */}
      <div className="sticky bottom-20 md:bottom-4 mt-6 z-10">
        <div className="rounded-2xl bg-teal-deep text-paper px-3 py-2.5 flex items-center justify-between gap-2 shadow-lg">
          <button type="button" onClick={() => go(step - 1)} disabled={step === 0}
            className="rounded-xl border border-paper/30 px-4 py-2.5 text-sm font-semibold disabled:opacity-30">Zurück</button>
          <div className="text-sm opacity-90">Schritt {step + 1}/{STEPS.length}{step === 2 && result.vk > 0 ? ` · ab ${eur(roundTo(result.ways.montage.lo, 10))}` : ''}</div>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => go(step + 1)} data-testid="fol-next"
              className="rounded-xl bg-amber text-on-amber px-4 py-2.5 text-sm font-bold hover:bg-amber-deep">{step === 2 ? 'Preise zeigen' : 'Weiter'}</button>
          ) : (
            <button type="button" onClick={() => { setInput(emptyInput(input.surface)); go(0); }}
              className="rounded-xl bg-paper text-ink px-4 py-2.5 text-sm font-bold">Neu</button>
          )}
        </div>
      </div>
    </div>
  );
}

const PRIMER_LABEL = { none: 'kein Primer', edges: 'Primer an den Kanten', full: 'Primer vollflächig', full2: 'Primer vollflächig, zwei Aufträge' };

/* ── Zählblock: Zeichnung + Zeilen ─────────────────────────────────────── */
function CountBlock({ surface, drawing, elements, input, setCount, active, setActive }) {
  const keys = elements.map((e) => e.key);
  const activeEl = elements.find((e) => e.key === active);
  return (
    <div>
      <div className="rounded-2xl border border-sm-border bg-paper p-3 mb-3">
        <Drawing kind={drawing} active={active} onPick={setActive} only={keys} />
        <p className="text-xs text-ink-muted text-center mt-2 px-2">
          {activeEl ? <><span className="font-semibold text-amber-text">{activeEl.step} {activeEl.label}:</span> {activeEl.rule}</>
            : <><Info size={12} className="inline -mt-0.5" /> Tipp eine Nummer im Bild oder eine Zeile an, dann steht die Regel hier.</>}
        </p>
      </div>
      <div className="grid gap-2">
        {elements.map((e) => {
          const on = active === e.key;
          const v = input.counts[e.key] ?? 0;
          return (
            <div key={e.key} onClick={() => setActive(e.key)} role="presentation"
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border bg-paper px-3 py-2.5 ${on ? 'border-amber ring-2 ring-amber/30' : 'border-sm-border'}`}>
              <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${on ? 'bg-amber-deep text-paper' : 'bg-ink text-paper'}`}>{e.step}</span>
              <div className="min-w-0">
                <div className="font-semibold text-ink text-sm leading-tight">{e.label}</div>
                <div className="text-[11px] text-ink-muted leading-snug">{e.rule}</div>
              </div>
              <Stepper value={v} onChange={(n) => setCount(e.key, n)} step={e.stepSize || 1} unit={e.unit === 'stk' ? '' : e.unit === 'm2' ? 'm²' : 'm'} testId={`fol-count-${e.key}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stepper({ value, onChange, step = 1, unit = '', testId }) {
  const [text, setText] = useState(String(value).replace('.', ','));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(String(value).replace('.', ',')); }, [value, focus]);
  const commit = () => { const n = parseDecimal(text); onChange(n == null ? 0 : n); setFocus(false); };
  return (
    <div className="inline-flex items-center rounded-full border border-sm-border bg-cream overflow-hidden" onClick={(e) => e.stopPropagation()} role="presentation">
      <button type="button" aria-label="weniger" onClick={() => onChange(Math.round((value - step) * 100) / 100)} className="w-9 h-9 flex items-center justify-center text-ink hover:bg-cream-deep"><Minus size={14} /></button>
      <div className="flex items-baseline">
        <input value={text} inputMode="decimal" onFocus={() => setFocus(true)} onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="w-10 h-9 text-center bg-transparent font-bold text-ink text-sm outline-none tabular-nums" data-testid={testId} aria-label="Anzahl" />
        {unit && <span className="text-xs text-ink-muted -ml-1 pr-1">{unit}</span>}
      </div>
      <button type="button" aria-label="mehr" onClick={() => onChange(Math.round((value + step) * 100) / 100)} className="w-9 h-9 flex items-center justify-center text-ink hover:bg-cream-deep"><Plus size={14} /></button>
    </div>
  );
}

/* ── Preis-Karten ───────────────────────────────────────────────────────── */
function WayCard({ badge, title, sub, way, bullets, cta }) {
  return (
    <div className={`relative rounded-2xl border bg-paper p-5 mb-3 ${badge ? 'border-sm-border mt-4' : 'border-sm-border'}`}>
      {badge && <span className="absolute -top-3 left-4 rounded-full bg-amber text-on-amber text-xs font-bold px-3 py-1">{badge}</span>}
      <h3 className="font-headings font-bold text-ink text-lg">{title}</h3>
      <p className="text-sm text-ink-muted">{sub}</p>
      <div className="mt-3 font-headings text-3xl text-ink tabular-nums">{way.value > 0 ? <>ab {eur(roundTo(way.lo, 10))}</> : '–'}</div>
      <div className="text-xs text-ink-muted">{way.value > 0 ? <>Spanne {eurRange(way)} · inkl. 19 % MwSt. und Material{way.noMin ? ', inkl. Versand' : ' · zzgl. An- und Abfahrt außerhalb 30 km'}</> : 'Noch nichts gezählt.'}</div>
      <ul className="mt-3 grid gap-1.5">
        {bullets.filter(Boolean).map((b, i) => <li key={i} className="flex gap-2 text-sm text-ink"><Check size={16} className="text-teal shrink-0 mt-0.5" />{b}</li>)}
      </ul>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

function CtaRow({ waHref, onCopy, copied, label, ghost, stacked }) {
  const cls = ghost
    ? 'border-2 border-teal-deep text-ink bg-paper hover:bg-cream-soft'
    : 'bg-amber text-on-amber hover:bg-amber-deep';
  return (
    <div className={`grid gap-2 ${stacked ? '' : ''}`}>
      {waHref ? (
        <a href={waHref} target="_blank" rel="noreferrer" className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${cls}`}>
          <WhatsAppIcon size={18} /> {label}
        </a>
      ) : (
        <button type="button" onClick={onCopy} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${cls}`}>
          {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Zusammenfassung kopiert' : label}
        </button>
      )}
      {waHref && stacked && (
        <button type="button" onClick={onCopy} className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-teal-deep bg-paper px-4 py-3 text-sm font-bold text-ink hover:bg-cream-soft">
          {copied ? <Check size={18} /> : <FileText size={18} />} {copied ? 'Kopiert, einfügen & senden' : 'Lieber per Formular'}
        </button>
      )}
    </div>
  );
}

/* ── Betriebsansicht: EK/VK, Stunden, Primer, Material ──────────────────── */
function ProPanel({ result, input, settings }) {
  const [open, setOpen] = useState(true);
  const sub = substrateByKey(input.substrate);
  const Row = ({ l, v, strong, muted }) => (
    <div className={`flex justify-between gap-3 text-sm ${strong ? 'font-bold text-ink border-t border-sm-border pt-2 mt-1' : muted ? 'text-ink-muted' : 'text-ink'}`}><span>{l}</span><span className="tabular-nums">{v}</span></div>
  );
  return (
    <div className="rounded-2xl border border-navy-edge bg-navy-wedge p-5 mt-4">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between">
        <h3 className="font-headings font-bold text-ink text-lg flex items-center gap-2"><Coins size={18} className="text-navy" /> Interne Kalkulation</h3>
        <ChevronDown size={18} className={`text-ink-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid md:grid-cols-2 gap-5 mt-4">
          <div className="rounded-xl bg-paper border border-sm-border p-4">
            <Kicker>EK / VK</Kicker>
            <Row l={`Folie ${fmtNum(result.material.m2, 1)} m² (inkl. ${settings.waste} % Verschnitt)`} v={`${eur(result.material.ek)} → ${eur(result.material.vk)}`} />
            <Row l="Primer" v={`${eur(result.primer.ek)} → ${eur(result.primer.vk)}`} />
            <Row l="Verbrauchsmaterial" v={`${eur(result.consumables.ek)} → ${eur(result.consumables.vk)}`} />
            <Row l={`Arbeit ${fmtNum(result.hours.total, 1)} h`} v={`${eur(result.labor.cost)} → ${eur(result.labor.vk)}`} />
            {result.extras.map((x) => <Row key={x.key} l={x.label} v={`– → ${eur(x.vk)}`} />)}
            {result.travelVk > 0 && <Row l="Anfahrt" v={`${eur(result.travelVk * 0.6)} → ${eur(result.travelVk)}`} />}
            {result.weekendVk > 0 && <Row l="Zuschlag Wochenende/Nacht" v={`– → ${eur(result.weekendVk)}`} />}
            <Row l="Summe EK → VK (Montage)" v={`${eur(result.ek)} → ${eur(result.vk)}`} strong />
            <Row l="Deckungsbeitrag" v={`${eur(result.margin)} · ${Math.round(result.marginPct * 100)} %`} strong />
            {result.ways.montage.minApplied && <Row l="Mindestauftragswert angewendet" v={eur(settings.minOrder)} muted />}
          </div>
          <div className="grid gap-4">
            <div className="rounded-xl bg-paper border border-sm-border p-4">
              <Kicker><Clock size={12} className="inline -mt-0.5 mr-1" />Stunden</Kicker>
              <Row l="Rüstzeit" v={`${fmtNum(result.hours.setup, 1)} h`} />
              <Row l={`Vorarbeit (${sub.label})`} v={`${fmtNum(result.hours.prep, 1)} h`} />
              <Row l="Folieren" v={`${fmtNum(result.hours.work, 1)} h`} />
              {result.hours.demontage > 0 && <Row l="Demontage / Montage" v={`${fmtNum(result.hours.demontage, 1)} h`} />}
              <Row l="Gesamt" v={`${fmtNum(result.hours.total, 1)} h ≈ ${fmtNum(result.hours.total / 8, 1)} Tage`} strong />
            </div>
            <div className="rounded-xl bg-paper border border-sm-border p-4">
              <Kicker><Droplets size={12} className="inline -mt-0.5 mr-1" />Primer-Vorschlag</Kicker>
              <p className="text-sm text-ink">{result.primer.text}</p>
              <p className="text-xs text-ink-muted mt-2">{result.primer.note}</p>
              {result.prepItems.length > 0 && (
                <div className="mt-3">
                  <Kicker><Layers size={12} className="inline -mt-0.5 mr-1" />Vorarbeit & Material</Kicker>
                  {result.prepItems.map((p) => <Row key={p.key} l={`${p.label} · ${fmtNum(p.hours, 1)} h`} v={`${fmtNum(p.qty, 2)} ${p.unit} ${p.consumable}`} muted />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Kleinteile ─────────────────────────────────────────────────────────── */
function Progress({ step, onJump }) {
  return (
    <div className="flex items-center justify-between mb-8 px-1">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <button type="button" onClick={() => onJump(i)} className="flex flex-col items-center gap-1.5 min-w-[56px]" aria-current={i === step ? 'step' : undefined}>
            <span className={`rounded-full transition-all ${i === step ? 'w-8 h-8 bg-amber ring-8 ring-amber/15' : i < step ? 'w-4 h-4 bg-amber' : 'w-4 h-4 bg-cream-deep'}`} />
            <span className={`text-xs ${i === step ? 'font-bold text-ink' : 'text-ink-muted'}`}>{s.label}</span>
          </button>
          {i < STEPS.length - 1 && <span className={`flex-1 h-[3px] rounded -mt-5 ${i < step ? 'bg-amber' : 'bg-cream-deep'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function StepTitle({ title, sub }) {
  return (
    <header className="mb-4">
      <h2 className="font-headings text-2xl text-ink leading-tight">{title}</h2>
      {sub && <p className="text-sm text-ink-muted mt-1.5">{sub}</p>}
    </header>
  );
}

function Kicker({ children, className = '' }) {
  return <div className={`text-[11px] tracking-[0.18em] uppercase text-amber-text font-bold mb-2 ${className}`}>{children}</div>;
}

function Choice({ on, onClick, children, row, small, testId }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} aria-pressed={on}
      className={`relative text-left rounded-2xl border bg-paper transition flex items-center gap-3 ${small ? 'px-4 py-2.5' : 'p-4'} ${row ? '' : 'flex-col items-start sm:flex-row sm:items-center'} ${on ? 'border-amber bg-amber/5 ring-2 ring-amber/30' : 'border-sm-border hover:border-teal/40'}`}>
      {on && <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber text-on-amber flex items-center justify-center"><Check size={14} strokeWidth={3} /></span>}
      {children}
    </button>
  );
}

function ShapeGlyph({ kind }) {
  const d = { zeile: 'M4 20h40v8H4z', l: 'M4 6h8v24h32v8H4z', u: 'M4 6h8v24h24V6h8v32H4z' }[kind];
  return <svg viewBox="0 0 48 44" className="w-12 h-11 shrink-0" aria-hidden="true"><path d={d} className="fill-teal-deep" /></svg>;
}
