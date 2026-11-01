import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Check, RotateCcw, Save, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import NumberField from '../../components/NumberField';
import { canUseFolierung, loadSettings, saveSettings, resetSettings } from '../../folierung/store';
import { DECORS, PRIMERS, CONSUMABLES, TRAVEL_ZONES, EXTRAS, CONDITIONS } from '../../folierung/catalog';

/**
 * /folierung/preise — die Preise des Betriebs: EK, VK, Stundensatz,
 * Verschnitt, Primer-Verbrauch, Gebindepreise, Anfahrt, Zuschläge und die
 * Links der Kundenseite (WhatsApp, KI-Vorschau, Musterbilder).
 *
 * Nur für freigeschaltete Profile. Gespeichert wird lokal (store.js); der
 * Speichern-Knopf ist bewusst explizit, damit eine halb geänderte Tabelle
 * nicht sofort auf der Kundenseite steht.
 */
export default function FolierungPricesPage() {
  const { user } = useAuth();
  const [s, setS] = useState(loadSettings);
  const [saved, setSaved] = useState(false);

  if (!canUseFolierung(user)) return <Navigate to="/" replace />;

  const set = (k, v) => { setS((x) => ({ ...x, [k]: v })); setSaved(false); };
  const setIn = (group, id, k, v) => {
    setS((x) => ({ ...x, [group]: { ...x[group], [id]: typeof x[group][id] === 'object' ? { ...x[group][id], [k]: v } : v } }));
    setSaved(false);
  };
  const save = () => { saveSettings(s); setSaved(true); };
  const reset = () => { setS(resetSettings()); setSaved(false); };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 pb-28">
      <Link to="/folierung" className="text-sm text-teal inline-flex items-center gap-1 hover:underline mb-3"><ArrowLeft size={14} /> Zum Rechner</Link>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <div className="text-[11px] tracking-[0.18em] uppercase text-amber-text font-bold flex items-center gap-1"><Lock size={11} /> Nur für dich</div>
          <h1 className="font-headings text-2xl md:text-3xl text-ink leading-tight">Preise & Einstellungen</h1>
          <p className="text-sm text-ink-muted mt-1">Alle Beträge brutto in Euro. Was du hier speicherst, rechnet der Kunde auf deiner Seite sofort mit.</p>
        </div>
      </div>

      <Card title="Betrieb & Kundenseite">
        <Text label="Name auf der Kundenseite" value={s.businessName} onChange={(v) => set('businessName', v)} placeholder="z. B. Folientechnik Müller" />
        <Text label="Adresse der Kundenseite" value={s.slug} onChange={(v) => set('slug', v.toLowerCase().replace(/[^a-z0-9-]/g, ''))} prefix="/folie/" hint="Nur Kleinbuchstaben, Ziffern und Bindestrich." />
        <Text label="WhatsApp-Nummer für Anfragen" value={s.whatsapp} onChange={(v) => set('whatsapp', v)} placeholder="+49 170 1234567" hint="Ohne Nummer zeigt die Seite stattdessen einen Kopieren-Knopf für die Zusammenfassung." />
        <Text label="Link zur KI-Vorschau (Vorher / Nachher)" value={s.aiUrl} onChange={(v) => set('aiUrl', v)} placeholder="https://…" hint="Die Plattform, auf der der Kunde sein Foto im Dekor sieht. Wird als Knopf im Preis-Schritt angezeigt." />
      </Card>

      <Card title="Kalkulation">
        <div className="grid sm:grid-cols-2 gap-3">
          <Num label="Stundensatz VK" unit="€/h" value={s.hourlyRate} onChange={(v) => set('hourlyRate', v)} />
          <Num label="Lohnkosten intern" unit="€/h" value={s.laborCost} onChange={(v) => set('laborCost', v)} hint="für den Deckungsbeitrag" />
          <Num label="Rüstzeit je Auftrag" unit="h" value={s.setupHours} onChange={(v) => set('setupHours', v)} hint="anfahren, abdecken, aufräumen" />
          <Num label="Verschnitt" unit="%" value={s.waste} onChange={(v) => set('waste', v)} />
          <Num label="Mindestauftragswert" unit="€" value={s.minOrder} onChange={(v) => set('minOrder', v)} />
          <Num label="Preisspanne ±" unit="%" value={s.rangePct} onChange={(v) => set('rangePct', v)} />
          <Num label="Hol- & Bring: Lohnfaktor Werkstatt" unit="×" value={s.pickupFactor} onChange={(v) => set('pickupFactor', v)} hint="0,5 = halbe Zeit je Front in der Werkstatt" />
          <Num label="Hol- & Bring: Annahme je Auftrag" unit="h" value={s.pickupHandlingHours} onChange={(v) => set('pickupHandlingHours', v)} />
          <Num label="Zuschlag Wochenende / Nacht" unit="%" value={s.weekendPct} onChange={(v) => set('weekendPct', v)} />
          <Num label="Selbst machen: Zuschnitt-Pauschale" unit="€" value={s.diyCutFee} onChange={(v) => set('diyCutFee', v)} />
          <Num label="Selbst machen: Versand" unit="€" value={s.diyShipping} onChange={(v) => set('diyShipping', v)} />
          <Num label="Aufschlag auf Primer-EK" unit="×" value={s.primerMarkup} onChange={(v) => set('primerMarkup', v)} />
          <Num label="Aufschlag auf Verbrauchsmaterial" unit="×" value={s.consumableMarkup} onChange={(v) => set('consumableMarkup', v)} />
        </div>
      </Card>

      <Card title="Dekore: EK / VK je m²" sub="Wie Coverstyl' sortiert. Das Musterbild zeigt die Kundenseite statt des Platzhalters; am besten die Bild-URL einer Coverstyl'-Musterkarte.">
        <div className="grid gap-3">
          {DECORS.map((d) => {
            const row = s.decors[d.key];
            const margin = row.vk > 0 ? Math.round((1 - row.ek / row.vk) * 100) : 0;
            return (
              <div key={d.key} className="rounded-xl border border-sm-border p-3 grid sm:grid-cols-[48px_1fr_90px_90px_60px] gap-3 items-center">
                <div className="h-12 w-12 rounded-lg border border-sm-border" style={row.sample ? { backgroundImage: `url(${row.sample})`, backgroundSize: 'cover' } : { background: d.swatch }} />
                <div className="min-w-0">
                  <div className="font-semibold text-ink text-sm">{d.label}</div>
                  <input value={row.sample || ''} onChange={(e) => setIn('decors', d.key, 'sample', e.target.value)} placeholder="Musterbild-URL (optional)"
                    className="mt-1 w-full text-xs rounded-lg border border-sm-border bg-cream px-2 py-1.5 text-ink" />
                </div>
                <Num label="EK" unit="€" value={row.ek} onChange={(v) => setIn('decors', d.key, 'ek', v)} compact />
                <Num label="VK" unit="€" value={row.vk} onChange={(v) => setIn('decors', d.key, 'vk', v)} compact />
                <div className="text-xs text-ink-muted sm:text-right">Marge<br /><span className={`font-bold ${margin < 30 ? 'text-red-text' : 'text-green-text'}`}>{margin} %</span></div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Primer" sub="Verbrauch und Gebindepreise. Daraus rechnet der Vorschlag Milliliter und Flaschen.">
        {Object.values(PRIMERS).map((p) => (
          <div key={p.key} className="rounded-xl border border-sm-border p-3 mb-3 last:mb-0">
            <div className="font-semibold text-ink text-sm mb-2">{p.label}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Num label="Vollfläche" unit="ml/m²" value={s.primers[p.key].mlPerM2} onChange={(v) => setIn('primers', p.key, 'mlPerM2', v)} compact />
              <Num label="Kante" unit="ml/lfm" value={s.primers[p.key].mlPerEdgeM} onChange={(v) => setIn('primers', p.key, 'mlPerEdgeM', v)} compact />
              <Num label="EK 250 ml" unit="€" value={s.primers[p.key].ek250} onChange={(v) => setIn('primers', p.key, 'ek250', v)} compact />
              <Num label="EK 1 l" unit="€" value={s.primers[p.key].ek1000} onChange={(v) => setIn('primers', p.key, 'ek1000', v)} compact />
            </div>
          </div>
        ))}
      </Card>

      <Card title="Rolle & Zuschnitt" sub="Bodaq Interior Film: 1.220 mm × 50 m je Rolle. Der Rechner rechnet je Teil den Umschlag (Materialstärke plus Rückseite) dazu, legt es auf die Bahn und ermittelt den echten Verschnitt. Fronten, Türen und Seiten werden nie gedreht.">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-sm-border bg-cream px-3 py-2.5 text-sm sm:col-span-2 cursor-pointer">
            <span className="font-semibold text-ink">Zuschnitt rechnen (Nesting)</span>
            <input type="checkbox" checked={!!s.nesting.enabled} onChange={(e) => setIn('nesting', 'enabled', null, e.target.checked)} className="w-5 h-5 accent-amber" />
          </label>
          <Num label="Rollenbreite" unit="mm" value={s.nesting.rollWidthMm} onChange={(v) => setIn('nesting', 'rollWidthMm', null, v)} />
          <Num label="Rollenlänge" unit="m" value={s.nesting.rollLengthM} onChange={(v) => setIn('nesting', 'rollLengthM', null, v)} />
          <Num label="Umschlag hinten" unit="mm" value={s.nesting.backWrapMm} onChange={(v) => setIn('nesting', 'backWrapMm', null, v)} hint="über die Kante und auf die Rückseite, 20–30 mm" />
          <Num label="Materialstärke Standard" unit="mm" value={s.nesting.thicknessMm} onChange={(v) => setIn('nesting', 'thicknessMm', null, v)} hint="Front 19, Platte 38, Türblatt 40; je Element änderbar" />
          <Num label="Anschnitt an freien Kanten" unit="mm" value={s.nesting.bleedMm} onChange={(v) => setIn('nesting', 'bleedMm', null, v)} hint="Flächen und Streifen ohne Umschlag" />
          <Num label="Messerabstand" unit="mm" value={s.nesting.gapMm} onChange={(v) => setIn('nesting', 'gapMm', null, v)} />
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-semibold text-ink">Teile drehen</span>
            <select value={s.nesting.rotate} onChange={(e) => setIn('nesting', 'rotate', null, e.target.value)} className="rounded-xl border border-sm-border bg-cream px-3 py-2.5 text-ink">
              <option value="auto">Automatisch: Streifen und Flächen nur bei Dekoren ohne Laufrichtung (Uni, Stein, Spezial)</option>
              <option value="no">Nie drehen</option>
              <option value="yes">Immer erlauben</option>
            </select>
          </label>
        </div>
      </Card>

      <Card title="Verbrauchsmaterial EK">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(CONSUMABLES).map(([k, c]) => (
            <Num key={k} label={c.label} unit={`€/${c.unit}`} value={s.consumables[k]} onChange={(v) => setIn('consumables', k, null, v)} compact />
          ))}
        </div>
      </Card>

      <Card title="Anfahrt, Extras, Zustand">
        <div className="grid sm:grid-cols-2 gap-3">
          {TRAVEL_ZONES.map((z) => <Num key={z.key} label={`Anfahrt ${z.label}`} unit="€" value={s.travel[z.key]} onChange={(v) => setIn('travel', z.key, null, v)} compact />)}
          {EXTRAS.map((x) => <Num key={x.key} label={x.label} unit={x.pct != null ? '%' : x.perFront != null ? '€/Front' : '€/Stk'} value={s.extras[x.key]} onChange={(v) => setIn('extras', x.key, null, v)} compact />)}
          {CONDITIONS.filter((c) => c.key !== 'glatt').map((c) => <Num key={c.key} label={`Zeitfaktor: ${c.label}`} unit="×" value={s.conditions[c.key]} onChange={(v) => setIn('conditions', c.key, null, v)} compact />)}
        </div>
      </Card>

      <div className="sticky bottom-20 md:bottom-4 z-10 mt-6">
        <div className="rounded-2xl bg-teal-deep text-paper px-3 py-2.5 flex items-center justify-between gap-2 shadow-lg">
          <button type="button" onClick={reset} className="rounded-xl border border-paper/30 px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-1.5"><RotateCcw size={14} /> Standard</button>
          <button type="button" onClick={save} data-testid="fol-prices-save" className="rounded-xl bg-amber text-on-amber px-5 py-2.5 text-sm font-bold inline-flex items-center gap-1.5 hover:bg-amber-deep">
            {saved ? <Check size={16} /> : <Save size={16} />} {saved ? 'Gespeichert' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ title, sub, children }) {
  return (
    <section className="rounded-2xl border border-sm-border bg-paper p-5 mb-4">
      <h2 className="font-headings font-bold text-ink text-lg">{title}</h2>
      {sub && <p className="text-xs text-ink-muted mt-0.5 mb-3">{sub}</p>}
      {!sub && <div className="mb-3" />}
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Text({ label, value, onChange, placeholder, hint, prefix }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <div className="flex items-center rounded-xl border border-sm-border bg-cream overflow-hidden">
        {prefix && <span className="pl-3 text-ink-muted text-sm">{prefix}</span>}
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-ink outline-none" />
      </div>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

function Num({ label, unit, value, onChange, hint, compact }) {
  return (
    <label className="grid gap-1 text-sm min-w-0">
      <span className={`font-semibold text-ink ${compact ? 'text-xs' : ''} truncate`} title={label}>{label}</span>
      <div className="flex items-center rounded-xl border border-sm-border bg-cream overflow-hidden">
        <NumberField value={value} onChange={(v) => onChange(v == null ? 0 : v)} min={0} className="flex-1 min-w-0 w-full bg-transparent px-3 py-2 text-ink outline-none tabular-nums" />
        <span className="pr-3 text-xs text-ink-muted whitespace-nowrap">{unit}</span>
      </div>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}
