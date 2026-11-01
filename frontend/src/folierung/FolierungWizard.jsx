import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import AnimatedEur from '../components/motion/AnimatedEur';
import useTweenNumber from '../hooks/useTweenNumber';
import {
  ArrowLeft, Check, Minus, Plus, Sparkles, Copy, FileText, Save, Info,
  AlertTriangle, Droplets, Clock, Layers, Coins, ChevronDown, ExternalLink, Scissors, Trash2,
} from 'lucide-react';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { copyToClipboard } from '../utils/sms';
import { parseDecimal } from '../utils/number';
import {
  SURFACES, surfaceByKey, activeElements, CONDITIONS, SUBSTRATES, SUBSTRATES_FOR,
  substrateByKey, DECORS, EXTRAS, TRAVEL_ZONES, FRONT_WIDTHS, FRONT_HEIGHTS, THICKNESSES,
} from './catalog';
import { calculate, emptyInput, withAddon, withShape, withExtraSurface, summaryText, vatLabel } from './pricing';
import Drawing, { drawingFor, SurfaceIcon, ConditionIcon } from './Drawings';
import { pieceDefault, cutSize } from './nesting';

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
const eurRange = (w) => `${eur(roundTo(w.grossLo, 10))} – ${eur(roundTo(w.grossHi, 10))}`;
const roundTo = (v, step) => Math.round(v / step) * step;

/* forwardRef: die Kalkulationsseite wählt die Fläche über das Dial. */
const FolierungWizard = forwardRef(function FolierungWizard({ audience = 'customer', settings, initial, onSave, onCreateQuote, onChange, creating = false, surfaceFromDial = false }, ref) {
  const isPro = audience === 'pro';
  const [step, setStep] = useState(0);
  const [input, setInput] = useState(() => initial || emptyInput('kueche'));
  const [active, setActive] = useState(null);     // hervorgehobenes Element in der Zeichnung
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const topRef = useRef(null);

  const surface = surfaceByKey(input.surface);
  const elements = useMemo(() => activeElements(surface, input.addons, input.extraSurfaces || []), [surface, input.addons, input.extraSurfaces]);
  const result = useMemo(() => calculate(input, settings), [input, settings]);

  /* Nur bei einem Schrittwechsel nach oben, nicht beim Öffnen: auf der
     Kalkulationsseite steht darüber das Gewerke-Raster, das sichtbar bleiben soll. */
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);
  useEffect(() => { setSaved(false); }, [input]);
  /* Der Elternteil (Kalkulationsseite) braucht den Stand, um beim Verlassen
     ein Angebot anzulegen und den Entwurf zu sichern. */
  const startRef = useRef(JSON.stringify(input));
  useEffect(() => { onChange?.({ input, result, dirty: JSON.stringify(input) !== startRef.current }); }, [input, result]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => setInput((i) => ({ ...i, ...p }));
  const setCount = (key, v) => setInput((i) => ({ ...i, counts: { ...i.counts, [key]: Math.max(0, v) } }));
  const chooseSurface = (key) => {
    if (key === input.surface) return;
    setInput(emptyInput(key));
    setActive(null);
  };
  const go = (n) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
  useImperativeHandle(ref, () => ({ chooseSurface }));

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
          <StepTitle title={surfaceFromDial ? surface.label : 'Was soll foliert werden?'}
            sub={surfaceFromDial ? `${surface.tagline}. Andere Fläche im Ring oben wählen.` : 'Tipp die Fläche an, die deiner am nächsten kommt. Jede hat ihre eigene Zählzeichnung.'} />
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${surfaceFromDial ? 'hidden' : ''}`}>
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
          <Kicker className="mt-8">Weitere Bereiche im selben Auftrag</Kicker>
          <p className="text-sm text-ink-muted mb-3">Türen, Möbel oder Bad gleich mit? Jeder Bereich bekommt seine eigene Zählzeichnung, der Preis wird einer.</p>
          <div className="flex flex-wrap gap-2">
            {SURFACES.filter((x) => x.key !== input.surface).map((x) => {
              const on = (input.extraSurfaces || []).includes(x.key);
              return (
                <button key={x.key} type="button" onClick={() => setInput(withExtraSurface(input, x.key, !on))} aria-pressed={on} data-testid={`fol-extra-surface-${x.key}`}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${on ? 'border-amber bg-amber/10 text-ink' : 'border-sm-border bg-paper text-ink hover:border-teal/40'}`}>
                  {on ? <Check size={14} className="text-amber-deep" /> : <Plus size={14} className="text-ink-muted" />} {x.label}
                </button>
              );
            })}
          </div>
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
          {(input.extraSurfaces || []).map((k) => {
            const sf = surfaceByKey(k);
            return (
              <div key={k} className="mt-8">
                <Kicker>{sf.label}</Kicker>
                <p className="text-sm text-ink-muted mb-3">{sf.intro}</p>
                <CountBlock surface={sf} drawing={sf.key === 'moebel' ? 'furniture' : sf.drawing} elements={elements.filter((e) => e.addon === `surface:${k}`)}
                  input={input} setCount={setCount} active={active} setActive={setActive} />
              </div>
            );
          })}

          {isPro && (
            <PieceEditor surface={surface} elements={elements} input={input} patch={patch} settings={settings} result={result} />
          )}

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
          <WayCard badge="Meistgewählt" vat={result.vat} isPro={isPro} title="Montage vor Ort" sub="Das Team kommt zu dir, fertig in 1–3 Tagen" way={result.ways.montage}
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
            <WayCard vat={result.vat} isPro={isPro} title="Hol- & Bring-Service" sub="Du montierst Fronten & Co. selbst ab, wir holen sie, folieren in der Werkstatt und bringen sie zurück" way={result.ways.pickup}
              bullets={[`Rund ${Math.round((1 - result.ways.pickup.value / result.ways.montage.value) * 100)} % günstiger als Montage vor Ort`, 'Werkstattzeit 1–2 Wochen', result.ways.pickup.onsiteLeft ? 'Verbautes (Platte, Nische, Korpus) machen wir beim Zurückbringen vor Ort' : null, 'Wiedermontage machst du selbst, oder wir gegen Aufpreis']}
              cta={!isPro && <CtaRow waHref={waHref} onCopy={share} copied={copied} label="Abholung anfragen" ghost />} />
          )}

          <WayCard vat={result.vat} isPro={isPro} title="Selbst machen" sub="Zuschnitt-Set nach deinen Maßen, du klebst selbst" way={result.ways.diy}
            bullets={[result.material.lfm != null ? `${fmtNum(result.material.lfm, 1)} lfm von der ${settings.nesting?.rollWidthMm || 1220}er-Rolle (${fmtNum(result.material.m2, 1)} m²), auf Maß geschnitten` : `${fmtNum(result.material.m2, 1)} m² Folie inkl. Verschnitt, auf Maß geschnitten`, `Primer dazu: ${result.primer.mode === 'none' ? 'nicht nötig' : result.primer.packs.map((p) => `${p.n} × ${p.ml >= 1000 ? '1 l' : '250 ml'}`).join(' + ')}`, 'Rakel, Cutter und Anleitung liegen bei']}
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

          {isPro && result.nesting && <NestingCard nesting={result.nesting} settings={settings} />}
          {isPro && <ProPanel result={result} input={input} settings={settings} />}

          {isPro && (
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" onClick={() => { onSave?.({ input, result }); setSaved(true); }} className="inline-flex items-center gap-2 rounded-xl bg-teal text-paper px-4 py-2.5 text-sm font-semibold hover:bg-teal-deep" data-testid="fol-save">
                {saved ? <Check size={16} /> : <Save size={16} />} {saved ? 'Gespeichert' : 'Kalkulation speichern'}
              </button>
              {onCreateQuote && (
                <button type="button" disabled={creating} onClick={() => onCreateQuote({ input, result })} data-testid="fol-create-quote"
                  className="inline-flex items-center gap-2 rounded-xl border border-sm-border bg-paper text-ink px-4 py-2.5 text-sm font-semibold hover:bg-cream-soft disabled:opacity-60">
                  <FileText size={16} /> {creating ? 'Lege Angebot an…' : 'Angebot anlegen'}
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
          <div className="text-sm opacity-90">Schritt {step + 1}/{STEPS.length}{step === 2 && result.vk > 0 ? ` · ab ${eur(roundTo(result.ways.montage.grossLo, 10))}` : ''}</div>
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
});

export default FolierungWizard;

const PRIMER_LABEL = { none: 'kein Primer', edges: 'Primer an den Kanten', full: 'Primer vollflächig', full2: 'Primer vollflächig, zwei Aufträge' };

/* ── Zählblock: Zeichnung + Zeilen ─────────────────────────────────────── */
function CountBlock({ surface, drawing, elements, input, setCount, active, setActive }) {
  // Die Zeichnung kennt nur rohe Schlüssel (fronten), die Zählwerte den
  // vollen (moebel:fronten), wenn ein Bereich dazugenommen wurde.
  const raw = (e) => e.rawKey || e.key;
  const keys = elements.map(raw);
  const activeEl = elements.find((e) => e.key === active);
  const pick = (rk) => { const e = elements.find((x) => raw(x) === rk); if (e) setActive(e.key); };
  return (
    <div>
      <div className="rounded-2xl border border-sm-border bg-paper p-3 mb-3">
        <Drawing kind={drawing} active={activeEl ? raw(activeEl) : null} onPick={pick} only={keys} />
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
  /* Die Ziffer rollt: bei Plus nach oben, bei Minus nach unten. Das Feld
     selbst bleibt zum Tippen da und ist nur unsichtbar, solange es nicht
     fokussiert ist. */
  const prev = useRef(value);
  const dir = value > prev.current ? 'up' : value < prev.current ? 'down' : null;
  useEffect(() => { prev.current = value; }, [value]);
  useEffect(() => { if (!focus) setText(String(value).replace('.', ',')); }, [value, focus]);
  const commit = () => { const n = parseDecimal(text); onChange(n == null ? 0 : n); setFocus(false); };
  return (
    <div className="inline-flex items-center rounded-full border border-sm-border bg-cream overflow-hidden" onClick={(e) => e.stopPropagation()} role="presentation">
      <button type="button" aria-label="weniger" onClick={() => onChange(Math.round((value - step) * 100) / 100)} className="w-9 h-9 flex items-center justify-center text-ink hover:bg-cream-deep"><Minus size={14} /></button>
      <div className="flex items-baseline">
        <span className="relative w-10 h-9 overflow-hidden">
          <input value={text} inputMode="decimal" onFocus={() => setFocus(true)} onChange={(e) => setText(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className={`absolute inset-0 w-10 h-9 text-center bg-transparent font-bold text-sm outline-none tabular-nums ${focus ? 'text-ink' : 'text-transparent caret-ink'}`} data-testid={testId} aria-label="Anzahl" />
          {!focus && (
            <span key={value} aria-hidden="true"
              className={`absolute inset-0 flex items-center justify-center font-bold text-ink text-sm tabular-nums pointer-events-none ${dir === 'up' ? 'animate-num-up' : dir === 'down' ? 'animate-num-down' : ''}`}>
              {String(value).replace('.', ',')}
            </span>
          )}
        </span>
        {unit && <span className="text-xs text-ink-muted -ml-1 pr-1">{unit}</span>}
      </div>
      <button type="button" aria-label="mehr" onClick={() => onChange(Math.round((value + step) * 100) / 100)} className="w-9 h-9 flex items-center justify-center text-ink hover:bg-cream-deep"><Plus size={14} /></button>
    </div>
  );
}

/* ── Preis-Karten ───────────────────────────────────────────────────────── */
function WayCard({ badge, title, sub, way, bullets, cta, vat, isPro }) {
  return (
    <div className={`relative rounded-2xl border bg-paper p-5 mb-3 ${badge ? 'border-sm-border mt-4' : 'border-sm-border'}`}>
      {badge && <span className="absolute -top-3 left-4 rounded-full bg-amber text-on-amber text-xs font-bold px-3 py-1">{badge}</span>}
      <h3 className="font-headings font-bold text-ink text-lg">{title}</h3>
      <p className="text-sm text-ink-muted">{sub}</p>
      <div className="mt-3 font-headings text-3xl text-ink tabular-nums">{way.value > 0 ? <AnimatedEur value={roundTo(way.grossLo, 10)} format={(v) => `ab ${eur(roundTo(v, 10))}`} /> : '–'}</div>
      <div className="text-xs text-ink-muted">{way.value > 0 ? <>Spanne {eurRange(way)} · {vatLabel(vat)} und Material{way.noMin ? ', inkl. Versand' : ' · zzgl. An- und Abfahrt außerhalb 30 km'}</> : 'Noch nichts gezählt.'}</div>
      {isPro && way.value > 0 && !vat?.klein && <div className="text-xs text-ink-muted tabular-nums">netto {eur(way.net)} · USt. {eur(way.gross - way.net)}</div>}
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
            <Kicker>EK netto / VK {result.vat.basis === 'gross' ? 'brutto' : 'netto'} · {result.vat.klein ? 'Kleinunternehmer' : `${result.vat.country} ${result.vat.rate} % USt.`}</Kicker>
            <Row l={result.material.lfm != null
              ? `Folie ${fmtNum(result.material.lfm, 1)} lfm = ${fmtNum(result.material.m2, 1)} m² (${Math.round(result.material.wastePct * 100)} % Verschnitt, gelegt)`
              : `Folie ${fmtNum(result.material.m2, 1)} m² (inkl. ${settings.waste} % Verschnitt)`} v={`${eur(result.material.ek)} → ${eur(result.material.vk)}`} />
            <Row l="Primer" v={`${eur(result.primer.ek)} → ${eur(result.primer.vk)}`} />
            <Row l="Verbrauchsmaterial" v={`${eur(result.consumables.ek)} → ${eur(result.consumables.vk)}`} />
            <Row l={`Arbeit ${fmtNum(result.hours.total, 1)} h`} v={`${eur(result.labor.cost)} → ${eur(result.labor.vk)}`} />
            {result.extras.map((x) => <Row key={x.key} l={x.label} v={`– → ${eur(x.vk)}`} />)}
            {result.travelVk > 0 && <Row l="Anfahrt" v={`${eur(result.travelVk * 0.6)} → ${eur(result.travelVk)}`} />}
            {result.weekendVk > 0 && <Row l="Zuschlag Wochenende/Nacht" v={`– → ${eur(result.weekendVk)}`} />}
            <Row l={`Summe VK ${result.vat.basis === 'gross' ? 'brutto' : 'netto'} (Montage)`} v={eur(result.ways.montage.value)} strong />
            {result.vat.basis === 'gross'
              ? <Row l={`davon USt. ${result.vat.rate} %`} v={eur(result.ways.montage.gross - result.ways.montage.net)} muted />
              : !result.vat.klein && <Row l={`+ USt. ${result.vat.rate} % = brutto`} v={eur(result.ways.montage.gross)} muted />}
            <Row l="EK netto → VK netto" v={`${eur(result.ek)} → ${eur(result.vk)}`} strong />
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

/* ── Zuschnitt: Maße je Element und eigene Teile ────────────────────────── */
function PieceEditor({ surface, elements, input, patch, settings, result }) {
  const [open, setOpen] = useState(false);
  const ns = settings.nesting || {};
  const back = ns.backWrapMm ?? 25, bleed = ns.bleedMm ?? 10, tDef = ns.thicknessMm ?? 19;
  const rows = elements
    .filter((e) => (Number(input.counts[e.key]) || 0) > 0)
    .map((e) => ({ e, d: pieceDefault(e.surfaceKey || surface.key, e.rawKey || e.key), o: input.pieces?.[e.key] }))
    .filter((r) => r.d || r.o);
  const setPiece = (key, p) => patch({ pieces: { ...(input.pieces || {}), [key]: { ...(input.pieces?.[key] || {}), ...p } } });
  const clearPiece = (key) => { const p = { ...(input.pieces || {}) }; delete p[key]; patch({ pieces: p }); };
  const custom = input.customPieces || [];
  const setCustom = (i, k, v) => patch({ customPieces: custom.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });
  const n = result.nesting;
  return (
    <div className="mt-8 rounded-2xl border border-navy-edge bg-navy-wedge p-4">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="font-headings font-bold text-ink flex items-center gap-2"><Scissors size={16} className="text-navy" /> Maße, Stärke & Zuschnitt</div>
          <div className="text-xs text-ink-muted mt-0.5">
            {n ? `${n.pieceCount} Teile → ${fmtNum(n.totalMm / 1000, 1)} lfm auf ${n.rollCount} Rolle${n.rollCount === 1 ? '' : 'n'} à ${ns.rollWidthMm || 1220} mm · Verschnitt ${Math.round(n.wastePct * 100)} %` : 'Standardmaße; trag echte Maße ein, wenn du sie hast.'}
          </div>
        </div>
        <ChevronDown size={18} className={`text-ink-muted shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 grid gap-2">
          <p className="text-xs text-ink-muted">
            Sichtmaß eingeben. Der Zuschnitt rechnet je umschlagener Kante die Materialstärke plus {back} mm auf die Rückseite dazu, je freier Kante {bleed} mm Anschnitt.
            Fronten, Türen und Seiten werden nie gedreht: die Maserung steht senkrecht.
          </p>
          {rows.map(({ e, d, o }) => {
            const kind = d?.parts && !(o?.w && o?.h) ? 'parts' : d?.perM ? 'perM' : d?.strip ? 'strip' : 'piece';
            const spec = { t: o?.t ?? d?.t ?? tDef, wx: d?.wx ?? 2, wy: d?.wy ?? 2 };
            const qty = Number(input.counts[e.key]) || 0;
            const groups = o?.groups || [];
            const grouped = groups.reduce((a, g) => a + (Number(g.n) || 0), 0);
            const baseW = o?.w || d?.w, baseH = o?.h || d?.h;
            const cut = kind === 'piece' && baseW && baseH ? cutSize(baseW, baseH, spec, back, bleed) : null;
            const isFront = e.unit === 'stk' && /front|blatt/.test(e.rawKey || e.key);
            return (
              <div key={e.key} className="rounded-xl bg-paper border border-sm-border px-3 py-2.5 grid gap-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink">{qty} {e.unit === 'stk' ? '×' : e.unit === 'm2' ? 'm²' : 'm'} {e.label}{e.addon?.startsWith('surface:') ? ` · ${surfaceByKey(e.surfaceKey).short}` : ''}</div>
                    <div className="text-[11px] text-ink-muted">
                      {kind === 'parts' && `Leistensatz: ${d.parts.map((p) => `${p.n} × ${p.w} × ${p.h}`).join(', ')} mm je Stück`}
                      {kind === 'perM' && `Streifen ${baseW} mm sichtbar, ${qty} m lang → Zuschnitt ${cutSize(baseW, qty * 1000, { ...spec, wy: 0 }, back, bleed).w} mm breit`}
                      {kind === 'strip' && 'volle Bahnbreite, Länge aus der Fläche, kein Umschlag'}
                      {kind === 'piece' && cut && `Standard ${baseW} × ${baseH} → Zuschnitt ${cut.w} × ${cut.h} mm (${spec.wx + spec.wy} Kanten umschlagen)`}
                    </div>
                  </div>
                  {kind !== 'strip' && (
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                      Stärke
                      <select value={spec.t} onChange={(ev) => setPiece(e.key, { t: Number(ev.target.value) })} className="rounded-lg border border-sm-border bg-cream px-1.5 py-1 text-xs text-ink">
                        {[...new Set([...THICKNESSES, spec.t])].sort((a, b) => a - b).map((t) => <option key={t} value={t}>{t} mm</option>)}
                      </select>
                    </label>
                  )}
                </div>

                {kind === 'piece' && e.unit === 'stk' && (
                  <div className="grid gap-1.5">
                    {groups.map((g, gi) => {
                      const c = g.w && g.h ? cutSize(Number(g.w), Number(g.h), spec, back, bleed) : null;
                      return (
                        <div key={gi} className="flex items-center gap-1.5 flex-wrap text-xs">
                          <SizeSelect value={g.w} options={isFront ? FRONT_WIDTHS : []} onChange={(v) => setPiece(e.key, { groups: groups.map((x, j) => (j === gi ? { ...x, w: v } : x)) })} label="Breite" />
                          <span className="text-ink-muted">×</span>
                          <SizeSelect value={g.h} options={isFront ? FRONT_HEIGHTS.map((x) => x.h) : []} labels={isFront ? FRONT_HEIGHTS : []} onChange={(v) => setPiece(e.key, { groups: groups.map((x, j) => (j === gi ? { ...x, h: v } : x)) })} label="Höhe" />
                          <span className="text-ink-muted">×</span>
                          <MmField value={g.n} placeholder="Stk" onChange={(v) => setPiece(e.key, { groups: groups.map((x, j) => (j === gi ? { ...x, n: v } : x)) })} label="Stück" narrow />
                          {c && <span className="text-ink-muted">→ {c.w} × {c.h}</span>}
                          <button type="button" onClick={() => setPiece(e.key, { groups: groups.filter((_, j) => j !== gi) })} className="p-1 text-ink-muted hover:text-red-text" aria-label="Größe entfernen"><Trash2 size={13} /></button>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" onClick={() => setPiece(e.key, { groups: [...groups, { w: baseW || 596, h: baseH || 716, n: Math.max(1, qty - grouped) }] })}
                        className="inline-flex items-center gap-1 rounded-lg border border-sm-border bg-cream px-2 py-1 text-xs font-semibold text-ink hover:bg-cream-deep"><Plus size={12} /> Größe aufteilen</button>
                      {groups.length > 0 && (
                        <span className={`text-[11px] ${grouped === qty ? 'text-green-text' : grouped > qty ? 'text-red-text' : 'text-ink-muted'}`}>
                          {grouped} von {qty} zugeordnet{grouped < qty ? `, ${qty - grouped} im Standardmaß` : grouped > qty ? ', zu viele' : ''}
                        </span>
                      )}
                      {groups.length === 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">Standard
                          <MmField value={o?.w ?? ''} placeholder={String(d?.w ?? '')} onChange={(v) => setPiece(e.key, { w: v })} label="Breite" />×
                          <MmField value={o?.h ?? ''} placeholder={String(d?.h ?? '')} onChange={(v) => setPiece(e.key, { h: v })} label="Höhe" />
                        </span>
                      )}
                      {o && <button type="button" onClick={() => clearPiece(e.key)} className="p-1 text-ink-muted hover:text-red-text" aria-label="Zurücksetzen"><RotateCcwIcon /></button>}
                    </div>
                  </div>
                )}
                {kind === 'perM' && (
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">Sichtbreite <MmField value={o?.w ?? ''} placeholder={String(d?.w ?? '')} onChange={(v) => setPiece(e.key, { w: v })} label="Breite" />
                    {o && <button type="button" onClick={() => clearPiece(e.key)} className="p-1 text-ink-muted hover:text-red-text" aria-label="Zurücksetzen"><RotateCcwIcon /></button>}</div>
                )}
                {kind === 'piece' && e.unit !== 'stk' && (
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">Maß <MmField value={o?.w ?? ''} placeholder={String(d?.w ?? '')} onChange={(v) => setPiece(e.key, { w: v })} label="Breite" />×<MmField value={o?.h ?? ''} placeholder={String(d?.h ?? '')} onChange={(v) => setPiece(e.key, { h: v })} label="Höhe" /></div>
                )}
              </div>
            );
          })}
          <Kicker className="mt-2">Eigene Teile</Kicker>
          {custom.map((c, i) => (
            <div key={i} className="rounded-xl bg-paper border border-sm-border px-3 py-2 flex items-center gap-2 flex-wrap">
              <input value={c.label} onChange={(e) => setCustom(i, 'label', e.target.value)} placeholder="Bezeichnung" className="flex-1 min-w-[120px] text-sm bg-cream rounded-lg border border-sm-border px-2 py-1.5 text-ink" />
              <MmField value={c.w} placeholder="Breite" onChange={(v) => setCustom(i, 'w', v)} label="Breite" />
              <span className="text-ink-muted text-xs">×</span>
              <MmField value={c.h} placeholder="Höhe" onChange={(v) => setCustom(i, 'h', v)} label="Höhe" />
              <span className="text-ink-muted text-xs">×</span>
              <MmField value={c.n} placeholder="Stk" onChange={(v) => setCustom(i, 'n', v)} label="Stück" narrow />
              <select value={c.t ?? tDef} onChange={(e) => setCustom(i, 't', Number(e.target.value))} className="rounded-lg border border-sm-border bg-cream px-1.5 py-1 text-xs text-ink" aria-label="Stärke">
                {THICKNESSES.map((t) => <option key={t} value={t}>{t} mm</option>)}
              </select>
              <label className="inline-flex items-center gap-1 text-[11px] text-ink-muted"><input type="checkbox" checked={!!c.vertical} onChange={(e) => setCustom(i, 'vertical', e.target.checked)} className="accent-amber" /> senkrecht</label>
              <button type="button" onClick={() => patch({ customPieces: custom.filter((_, j) => j !== i) })} className="p-1.5 text-ink-muted hover:text-red-text" aria-label="Entfernen"><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => patch({ customPieces: [...custom, { label: '', w: '', h: '', n: 1, t: tDef, vertical: true }] })}
            className="justify-self-start inline-flex items-center gap-1.5 rounded-xl border border-sm-border bg-paper px-3 py-2 text-sm font-semibold text-ink hover:bg-cream-soft"><Plus size={14} /> Teil hinzufügen</button>
        </div>
      )}
    </div>
  );
}

/* Standardmaß aus der Liste oder ein eigenes. */
function SizeSelect({ value, options, labels, onChange, label }) {
  const v = value === '' || value == null ? '' : Number(value);
  const inList = options.includes(v);
  const [custom, setCustom] = useState(!inList && v !== '');
  if (!options.length || custom) {
    return (
      <span className="inline-flex items-center gap-1">
        <MmField value={v} placeholder={label} onChange={onChange} label={label} />
        {options.length > 0 && <button type="button" onClick={() => setCustom(false)} className="text-[10px] text-teal underline">Liste</button>}
      </span>
    );
  }
  return (
    <select value={inList ? v : ''} aria-label={label}
      onChange={(e) => { if (e.target.value === '__custom') { setCustom(true); return; } onChange(Number(e.target.value)); }}
      className="rounded-lg border border-sm-border bg-cream px-1.5 py-1 text-xs text-ink">
      {!inList && <option value="">{label}</option>}
      {options.map((o) => <option key={o} value={o}>{labels ? (labels.find((l) => l.h === o)?.label || o) : `${o} mm`}</option>)}
      <option value="__custom">anderes Maß…</option>
    </select>
  );
}

function MmField({ value, onChange, placeholder, label, narrow }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-sm-border bg-cream overflow-hidden">
      <input value={value ?? ''} inputMode="numeric" placeholder={placeholder} aria-label={label}
        onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ''); onChange(v === '' ? '' : Number(v)); }}
        className={`${narrow ? 'w-10' : 'w-14'} text-sm text-right bg-transparent px-1.5 py-1.5 text-ink outline-none tabular-nums`} />
      {!narrow && <span className="pr-1.5 text-[10px] text-ink-muted">mm</span>}
    </span>
  );
}

function RotateCcwIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>;
}

/* ── Nesting: die Rolle als Bild ────────────────────────────────────────── */
function NestingCard({ nesting, settings }) {
  const [open, setOpen] = useState(true);
  // Beim ersten Zeichnen zählen Laufmeter und Verschnitt von 0 hoch, während die Teile fallen.
  const lfm = useTweenNumber(nesting.totalMm / 1000, 900, 0).value;
  const waste = useTweenNumber(nesting.wastePct * 100, 900, 0).value;
  let drop = 0;
  const W = nesting.rollWidthMm;
  const grainNote = nesting.rotate ? 'Dekor ohne Laufrichtung: Teile dürfen gedreht werden.' : 'Dekor mit Laufrichtung: nichts wird gedreht, die Maserung läuft bei jedem Teil mit der Rolle.';
  return (
    <div className="rounded-2xl border border-navy-edge bg-navy-wedge p-5 mt-4">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 text-left">
        <h3 className="font-headings font-bold text-ink text-lg flex items-center gap-2"><Scissors size={18} className="text-navy" /> Zuschnitt auf der Rolle</h3>
        <ChevronDown size={18} className={`text-ink-muted shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[[`${fmtNum(lfm, 1)} lfm`, `Rolle ${W} mm`], [`${nesting.rollCount}`, `Rolle${nesting.rollCount === 1 ? '' : 'n'} à ${settings.nesting?.rollLengthM || 50} m`], [`${Math.round(waste)} %`, 'Verschnitt, gelegt']].map(([a, b]) => (
          <div key={b} className="rounded-xl bg-paper border border-sm-border px-3 py-2.5 text-center">
            <div className="font-headings font-bold text-ink text-lg tabular-nums leading-tight">{a}</div>
            <div className="text-[11px] text-ink-muted">{b}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-muted mt-2">{grainNote} Zugabe {settings.nesting?.bleedMm ?? 20} mm je Seite, {settings.nesting?.gapMm ?? 8} mm Messerabstand. Pauschal wären es {settings.waste} %.</p>
      {open && nesting.rolls.map((roll, ri) => {
        // Liegend, in Abschnitten von 4 m: 1.220 mm hoch, 4.000 mm breit je Zeile,
        // so bleibt eine 600er-Front als Kästchen lesbar statt als Strich.
        const SEG = 4000;
        const segs = Math.max(1, Math.ceil(roll.usedMm / SEG));
        return (
          <div key={ri} className="mt-3 rounded-xl bg-paper border border-sm-border p-3">
            <div className="text-xs font-semibold text-ink mb-2">Rolle {ri + 1} · {fmtNum(roll.usedMm / 1000, 2)} lfm · {roll.strips.length} Bahnen · Laufrichtung →</div>
            <div className="grid gap-2">
              {Array.from({ length: segs }, (_, si) => {
                const y0 = si * SEG, y1 = Math.min(roll.usedMm, y0 + SEG);
                const items = roll.strips.flatMap((st) => st.items).filter((it) => it.y < y1 && it.y + it.h > y0);
                return (
                  <div key={si}>
                    <div className="text-[10px] text-ink-muted mb-0.5">{fmtNum(y0 / 1000, 1)} – {fmtNum(y1 / 1000, 1)} m</div>
                    <svg viewBox={`0 0 ${SEG} ${W}`} className="w-full h-auto" role="img" aria-label={`Rolle ${ri + 1}, Meter ${y0 / 1000} bis ${y1 / 1000}`}>
                      <defs><clipPath id={`clip-${ri}-${si}`}><rect x="0" y="0" width={SEG} height={W} /></clipPath></defs>
                      <rect x="0" y="0" width={SEG} height={W} className="fill-cream stroke-sm-border" strokeWidth="6" />
                      <rect x={y1 - y0} y="0" width={SEG - (y1 - y0)} height={W} className="fill-paper" />
                      <g clipPath={`url(#clip-${ri}-${si})`}>
                        {items.map((it, ii) => {
                          const x = it.y - y0, wAlong = it.h, yAcross = it.x, hAcross = it.w;
                          return (
                            <g key={ii}>
                              <rect x={x} y={yAcross} width={wAlong} height={hAcross} rx="8" className={`animate-drop ${it.rot ? 'fill-amber/60 stroke-amber-deep' : 'fill-teal/35 stroke-teal-deep'}`} strokeWidth="6"
                                style={{ animationDelay: `${Math.min(40, drop++) * 45}ms`, transformBox: 'fill-box', transformOrigin: 'center' }} />
                              {wAlong > 220 && hAcross > 90 && (
                                <text x={x + wAlong / 2} y={yAcross + hAcross / 2} textAnchor="middle" dominantBaseline="middle" className="fill-ink" fontSize={Math.min(70, hAcross * 0.45, wAlong / 7)} fontWeight="600">
                                  {it.label.length > 16 ? `${it.label.slice(0, 15)}…` : it.label}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </g>
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {nesting.unplaced.length > 0 && (
        <div className="mt-3 text-sm text-red-text">Nicht gelegt: {nesting.unplaced.map((u) => `${u.label} ${u.w} × ${u.h} mm`).join(', ')}. Breiter als die Rolle; teilen oder Maß prüfen.</div>
      )}
    </div>
  );
}

/* ── Kleinteile ─────────────────────────────────────────────────────────── */
function Progress({ step, onJump }) {
  /* Nur die Punkte bewegen sich: der aktuelle wächst mit einer kleinen Feder,
     die Linie zum nächsten füllt sich von links. Der Inhalt darunter wechselt
     ohne Animation (Rückmeldung zum Bewegungskonzept). */
  return (
    <div className="flex items-center justify-between mb-8 px-1">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <button type="button" onClick={() => onJump(i)} className="flex flex-col items-center gap-1.5 min-w-[56px]" aria-current={i === step ? 'step' : undefined}>
            <span className="relative w-8 h-8 flex items-center justify-center">
              <span className={`absolute inset-0 rounded-full bg-amber/15 transition-transform duration-300 ease-spring ${i === step ? 'scale-100' : 'scale-0'}`} />
              <span className={`relative w-4 h-4 rounded-full transition-[transform,background-color] duration-300 ease-spring ${i === step ? 'scale-[1.75] bg-amber' : i < step ? 'scale-100 bg-amber' : 'scale-100 bg-cream-deep'}`} />
            </span>
            <span className={`text-xs transition-colors duration-ui ${i === step ? 'font-bold text-ink' : 'text-ink-muted'}`}>{s.label}</span>
          </button>
          {i < STEPS.length - 1 && (
            <span className="relative flex-1 h-[3px] rounded -mt-5 bg-cream-deep overflow-hidden">
              <span className={`absolute inset-0 bg-amber origin-left transition-transform duration-300 ease-out ${i < step ? 'scale-x-100' : 'scale-x-0'}`} />
            </span>
          )}
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
      className={`relative text-left rounded-2xl border bg-paper transition duration-ui ease-out active:scale-[.97] flex items-center gap-3 ${small ? 'px-4 py-2.5' : 'p-4'} ${row ? '' : 'flex-col items-start sm:flex-row sm:items-center'} ${on ? 'border-amber bg-amber/5 ring-2 ring-amber/30' : 'border-sm-border hover:border-teal/40'}`}>
      {on && <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber text-on-amber flex items-center justify-center animate-pop"><Check size={14} strokeWidth={3} /></span>}
      {children}
    </button>
  );
}

function ShapeGlyph({ kind }) {
  const d = { zeile: 'M4 20h40v8H4z', l: 'M4 6h8v24h32v8H4z', u: 'M4 6h8v24h24V6h8v32H4z' }[kind];
  return <svg viewBox="0 0 48 44" className="w-12 h-11 shrink-0" aria-hidden="true"><path d={d} className="fill-teal-deep" /></svg>;
}
