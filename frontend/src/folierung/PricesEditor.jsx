import React, { useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import NumberField from '../components/NumberField';
import { DECORS, PRIMERS, CONSUMABLES, TRAVEL_ZONES, EXTRAS, CONDITIONS } from './catalog';

/**
 * Die Preise des Betriebs, direkt in der Karte „Meine Preise“ bearbeitbar.
 *
 * Früher eine eigene Seite (/folierung/preise) mit Speichern-Knopf. Jetzt
 * wirkt jede Änderung sofort: der Preis unten rechnet mit, gespeichert wird
 * gleich mit (store.js, lokal). Oben das, was man oft anfasst, darunter
 * aufklappbare Gruppen für den Rest.
 */
export default function PricesEditor({ settings: s, onChange, onReset }) {
  const set = (k, v) => onChange({ ...s, [k]: v });
  const setIn = (group, id, k, v) => onChange({
    ...s,
    [group]: { ...s[group], [id]: k && typeof s[group][id] === 'object' ? { ...s[group][id], [k]: v } : v },
  });
  const gross = s.priceBasis === 'gross';
  const vatRate = s.vat?.klein ? 0 : (s.vat?.rate ?? 20);

  return (
    <div className="grid gap-3" data-testid="fol-prices-card">
      <div className="grid grid-cols-2 gap-2">
        <Num label={`Stundensatz ${gross ? 'brutto' : 'netto'}`} unit="€/h" value={s.hourlyRate} onChange={(v) => set('hourlyRate', v)} testid="fol-p-hourly" />
        <Num label="Mindestauftrag" unit="€" value={s.minOrder} onChange={(v) => set('minOrder', v)} testid="fol-p-min" />
        <Num label="Verschnitt" unit="%" value={s.waste} onChange={(v) => set('waste', v)} />
        <Num label="Rüstzeit je Auftrag" unit="h" value={s.setupHours} onChange={(v) => set('setupHours', v)} />
        <Num label="Wochenende / Nacht" unit="%" value={s.weekendPct} onChange={(v) => set('weekendPct', v)} />
        <Num label="Preisspanne ±" unit="%" value={s.rangePct} onChange={(v) => set('rangePct', v)} />
      </div>

      <div>
        <Head>Folie je m² · EK netto / VK {gross ? 'brutto' : 'netto'}</Head>
        <p className="mb-1 grid grid-cols-[18px_minmax(0,1fr)_68px_68px_34px] gap-1.5 px-2 text-[9.5px] font-bold uppercase tracking-[.06em] text-ink-faint">
          <span /><span /><span>EK €</span><span>VK €</span><span className="text-right">Marge</span>
        </p>
        <div className="rounded-[11px] border border-rule overflow-hidden">
          {DECORS.map((d) => {
            const row = s.decors[d.key];
            const vkNet = gross ? row.vk / (1 + vatRate / 100) : row.vk;
            const margin = vkNet > 0 ? Math.round((1 - row.ek / vkNet) * 100) : 0;
            return (
              <div key={d.key} className="grid grid-cols-[18px_minmax(0,1fr)_68px_68px_34px] items-center gap-1.5 px-2 py-1.5 border-b border-rule last:border-b-0">
                <span className="h-[18px] w-[18px] rounded-[5px] border border-sm-border"
                      style={row.sample ? { backgroundImage: `url(${row.sample})`, backgroundSize: 'cover' } : { background: d.swatch }} />
                <span className="text-[12px] text-ink truncate">{d.label}</span>
                <Cell label={`${d.label} EK`} value={row.ek} onChange={(v) => setIn('decors', d.key, 'ek', v)} />
                <Cell label={`${d.label} VK`} value={row.vk} onChange={(v) => setIn('decors', d.key, 'vk', v)} testid={`fol-p-vk-${d.key}`} />
                <span className={`text-[10.5px] font-bold text-right tabular-nums ${margin < 30 ? 'text-red-text' : 'text-green-text'}`}>{margin} %</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <Head>Anfahrt</Head>
        <div className="grid grid-cols-2 gap-2">
          {TRAVEL_ZONES.map((z) => <Num key={z.key} label={z.label} unit="€" value={s.travel[z.key]} onChange={(v) => setIn('travel', z.key, null, v)} />)}
        </div>
      </div>

      <div className="grid gap-1.5">
        <More title="Weitere Kalkulation" sub="Lohnkosten, Hol- & Bring, Selbst machen, Aufschläge">
          <div className="grid grid-cols-2 gap-2">
            <Num label="Lohnkosten intern" unit="€/h" value={s.laborCost} onChange={(v) => set('laborCost', v)} />
            <Num label="Hol & Bring: Lohnfaktor" unit="×" value={s.pickupFactor} onChange={(v) => set('pickupFactor', v)} />
            <Num label="Hol & Bring: Annahme" unit="h" value={s.pickupHandlingHours} onChange={(v) => set('pickupHandlingHours', v)} />
            <Num label="Selbst: Zuschnitt" unit="€" value={s.diyCutFee} onChange={(v) => set('diyCutFee', v)} />
            <Num label="Selbst: Versand" unit="€" value={s.diyShipping} onChange={(v) => set('diyShipping', v)} />
            <Num label="Aufschlag Primer" unit="×" value={s.primerMarkup} onChange={(v) => set('primerMarkup', v)} />
            <Num label="Aufschlag Verbrauch" unit="×" value={s.consumableMarkup} onChange={(v) => set('consumableMarkup', v)} />
          </div>
        </More>
        <More title="Extras & Zustand" sub="Zuschläge und Zeitfaktoren">
          <div className="grid grid-cols-2 gap-2">
            {EXTRAS.map((x) => <Num key={x.key} label={x.label} unit={x.pct != null ? '%' : x.perFront != null ? '€/Front' : '€/Stk'} value={s.extras[x.key]} onChange={(v) => setIn('extras', x.key, null, v)} />)}
            {CONDITIONS.filter((c) => c.key !== 'glatt').map((c) => <Num key={c.key} label={`Zeitfaktor ${c.label}`} unit="×" value={s.conditions[c.key]} onChange={(v) => setIn('conditions', c.key, null, v)} />)}
          </div>
        </More>
        <More title="Primer" sub="Verbrauch und Gebindepreise">
          {Object.values(PRIMERS).map((p) => (
            <div key={p.key} className="grid gap-1.5">
              <span className="text-[12px] font-bold text-ink">{p.label}</span>
              <div className="grid grid-cols-2 gap-2">
                <Num label="Vollfläche" unit="ml/m²" value={s.primers[p.key].mlPerM2} onChange={(v) => setIn('primers', p.key, 'mlPerM2', v)} />
                <Num label="Kante" unit="ml/lfm" value={s.primers[p.key].mlPerEdgeM} onChange={(v) => setIn('primers', p.key, 'mlPerEdgeM', v)} />
                <Num label="EK 250 ml" unit="€" value={s.primers[p.key].ek250} onChange={(v) => setIn('primers', p.key, 'ek250', v)} />
                <Num label="EK 1 l" unit="€" value={s.primers[p.key].ek1000} onChange={(v) => setIn('primers', p.key, 'ek1000', v)} />
              </div>
            </div>
          ))}
        </More>
        <More title="Rolle & Zuschnitt" sub="Rollenmaße, Umschlag, Drehen">
          <label className="flex items-center justify-between gap-3 text-[12.5px] font-semibold text-ink cursor-pointer">
            Zuschnitt rechnen (Nesting)
            <input type="checkbox" checked={!!s.nesting.enabled} onChange={(e) => setIn('nesting', 'enabled', null, e.target.checked)} className="w-5 h-5 accent-teal" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Rollenbreite" unit="mm" value={s.nesting.rollWidthMm} onChange={(v) => setIn('nesting', 'rollWidthMm', null, v)} />
            <Num label="Rollenlänge" unit="m" value={s.nesting.rollLengthM} onChange={(v) => setIn('nesting', 'rollLengthM', null, v)} />
            <Num label="Umschlag hinten" unit="mm" value={s.nesting.backWrapMm} onChange={(v) => setIn('nesting', 'backWrapMm', null, v)} />
            <Num label="Materialstärke" unit="mm" value={s.nesting.thicknessMm} onChange={(v) => setIn('nesting', 'thicknessMm', null, v)} />
            <Num label="Anschnitt" unit="mm" value={s.nesting.bleedMm} onChange={(v) => setIn('nesting', 'bleedMm', null, v)} />
            <Num label="Messerabstand" unit="mm" value={s.nesting.gapMm} onChange={(v) => setIn('nesting', 'gapMm', null, v)} />
          </div>
          <label className="grid gap-1">
            <Small>Teile drehen</Small>
            <select value={s.nesting.rotate} onChange={(e) => setIn('nesting', 'rotate', null, e.target.value)}
                    className="rounded-[9px] border border-navy/25 bg-navy/[.05] px-2.5 py-2 text-[12.5px] text-ink">
              <option value="auto">Automatisch (nur Dekore ohne Laufrichtung)</option>
              <option value="no">Nie drehen</option>
              <option value="yes">Immer erlauben</option>
            </select>
          </label>
        </More>
        <More title="Verbrauchsmaterial" sub="Einkaufspreise">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(CONSUMABLES).map(([k, c]) => (
              <Num key={k} label={c.label} unit={`€/${c.unit}`} value={s.consumables[k]} onChange={(v) => setIn('consumables', k, null, v)} />
            ))}
          </div>
        </More>
        <More title="Kundenseite & Steuer" sub="Name, Adresse, WhatsApp, netto oder brutto">
          <p className="m-0 rounded-[9px] bg-cream px-2.5 py-2 text-[12px] text-ink" data-testid="fol-vat-info">
            {s.vat?.klein ? 'Kleinunternehmer: keine Umsatzsteuer.' : `${s.vat?.country === 'DE' ? 'Deutschland' : 'Österreich'}: ${vatRate} % USt.`}
            <span className="text-ink-muted"> Ändern unter Einstellungen → Rechnungsdaten.</span>
          </p>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Preisbasis">
            {[['net', 'VK netto'], ['gross', 'VK brutto']].map(([k, a]) => (
              <button key={k} type="button" onClick={() => set('priceBasis', k)} aria-pressed={s.priceBasis === k} data-testid={`fol-basis-${k}`}
                      className={`min-h-[40px] rounded-[9px] text-[12.5px] font-bold ${s.priceBasis === k ? 'bg-teal text-paper' : 'border border-sm-border text-ink'}`}>
                {a} eingeben
              </button>
            ))}
          </div>
          <Text label="Name auf der Kundenseite" value={s.businessName} onChange={(v) => set('businessName', v)} placeholder="z. B. Folientechnik Müller" />
          <Text label="Adresse der Kundenseite" prefix="/folie/" value={s.slug} onChange={(v) => set('slug', v.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
          <Text label="WhatsApp für Anfragen" value={s.whatsapp} onChange={(v) => set('whatsapp', v)} placeholder="+43 660 1234567" />
          <Text label="Link zur KI-Vorschau" value={s.aiUrl} onChange={(v) => set('aiUrl', v)} placeholder="https://…" />
          {DECORS.map((d) => (
            <Text key={d.key} label={`Musterbild ${d.label}`} value={s.decors[d.key].sample} onChange={(v) => setIn('decors', d.key, 'sample', v)} placeholder="Bild-URL (optional)" />
          ))}
        </More>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted">
        <span>Änderungen gelten sofort und werden gespeichert.</span>
        <button type="button" data-testid="fol-prices-reset"
                onClick={() => { if (window.confirm('Alle Preise auf die Standardwerte zurücksetzen?')) onReset(); }}
                className="shrink-0 inline-flex items-center gap-1 font-bold text-navy">
          <RotateCcw size={12} aria-hidden="true" /> Standard
        </button>
      </div>
    </div>
  );
}

const Small = ({ children }) => (
  <span className="block text-[10px] font-bold uppercase tracking-[.06em] text-ink-muted truncate">{children}</span>
);
const Head = ({ children }) => (
  <p className="m-0 mb-1.5 text-[10px] font-bold uppercase tracking-[.06em] text-ink-muted">{children}</p>
);

function Num({ label, unit, value, onChange, testid }) {
  return (
    <label className="grid gap-1 min-w-0">
      <Small>{label}</Small>
      <span className="flex items-center rounded-[9px] border border-navy/25 bg-navy/[.05] overflow-hidden">
        <NumberField value={value} onChange={(v) => onChange(v == null ? 0 : v)} min={0} data-testid={testid}
                     className="flex-1 min-w-0 w-full bg-transparent px-2.5 py-2 text-[13px] font-semibold text-ink outline-none tabular-nums" />
        <span className="pr-2.5 text-[11px] text-ink-muted whitespace-nowrap">{unit}</span>
      </span>
    </label>
  );
}

function Cell({ label, value, onChange, testid }) {
  return (
    <NumberField value={value} onChange={(v) => onChange(v == null ? 0 : v)} min={0} aria-label={label} data-testid={testid}
                 className="w-full min-w-0 rounded-[8px] border border-navy/25 bg-navy/[.05] px-2 py-1.5 text-[12.5px] font-semibold text-ink text-right outline-none tabular-nums" />
  );
}

function Text({ label, value, onChange, placeholder, prefix }) {
  return (
    <label className="grid gap-1 min-w-0">
      <Small>{label}</Small>
      <span className="flex items-center rounded-[9px] border border-navy/25 bg-navy/[.05] overflow-hidden">
        {prefix && <span className="pl-2.5 text-[12px] text-ink-muted">{prefix}</span>}
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
               className="flex-1 min-w-0 bg-transparent px-2.5 py-2 text-[13px] text-ink outline-none" />
      </span>
    </label>
  );
}

function More({ title, sub, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-[11px] border ${open ? 'border-navy/30' : 'border-rule'}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-[11px]
                         focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/30">
        <span className="flex-1 min-w-0">
          <span className="block text-[12.5px] font-bold text-ink leading-tight">{title}</span>
          <span className="block text-[10px] text-ink-muted truncate">{sub}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="grid gap-2.5 border-t border-rule px-2.5 pt-2.5 pb-3">{children}</div>}
    </div>
  );
}
