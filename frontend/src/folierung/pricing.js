/**
 * Die Preis-Engine der Folierung. Reine Funktion, kein React, kein Netz.
 *
 * `calculate(input, settings)` liest den Katalog und die Preiseinstellungen
 * des Betriebs und liefert alles, was die zwei Ansichten brauchen:
 *
 *  - der Kunde sieht die drei Wege zum Preis (Montage vor Ort, Hol- & Bring,
 *    Selbst machen) als Spanne;
 *  - der Betrieb sieht dazu EK, VK, Deckungsbeitrag, Stunden, den Primer-
 *    Vorschlag in Millilitern und Gebinden und das Verbrauchsmaterial.
 *
 * Alles in EUR brutto, so wie es dem Endkunden genannt wird. Die Engine
 * rundet nichts außer den Gebinden; runden tut die Anzeige.
 */
import {
  surfaceByKey, activeElements, CONDITIONS, substrateByKey, DECORS, PRIMERS,
  CONSUMABLES, EXTRAS, FRONT_KEYS, TRAVEL_ZONES, SUBSTRATES_FOR,
} from './catalog';
import { DEFAULT_NESTING, GRAIN_DECORS, piecesFor, nest } from './nesting';

export const DEFAULT_SETTINGS = {
  businessName: '',
  slug: 'folie',
  whatsapp: '',
  aiUrl: '',
  hourlyRate: 68,        // VK-Stundensatz brutto
  laborCost: 34,         // interne Lohnkosten je Stunde (für den Deckungsbeitrag)
  setupHours: 1.5,       // Rüstzeit je Auftrag: anfahren, abdecken, Werkzeug, aufräumen
  waste: 25,             // Verschnitt in %
  minOrder: 490,
  rangePct: 10,          // ± um den Richtwert
  primerMarkup: 1.6,     // VK-Faktor auf den Primer-EK
  consumableMarkup: 1.5,
  pickupFactor: 0.5,     // Hol- & Bring: Lohn für demontierbare Teile × Faktor (Werkstatt: Serie, Tisch, kein Abdecken)
  pickupHandlingHours: 0.5, // Hol- & Bring: Annahme, Beschriftung, Verladen je Auftrag
  diyMaterialFactor: 1.0,
  diyCutFee: 90,
  diyShipping: 29,
  weekendPct: 25,
  decors: Object.fromEntries(DECORS.map((d) => [d.key, { ek: d.ek, vk: d.vk, sample: '' }])),
  primers: Object.fromEntries(Object.values(PRIMERS).map((p) => [p.key, {
    mlPerM2: p.mlPerM2, mlPerEdgeM: p.mlPerEdgeM, ek250: p.packs[0].ek, ek1000: p.packs[1].ek,
  }])),
  consumables: Object.fromEntries(Object.entries(CONSUMABLES).map(([k, c]) => [k, c.ek])),
  travel: Object.fromEntries(TRAVEL_ZONES.map((z) => [z.key, z.price])),
  extras: Object.fromEntries(EXTRAS.map((x) => [x.key, x.pct ?? x.perFront ?? x.perItem])),
  conditions: Object.fromEntries(CONDITIONS.map((c) => [c.key, c.factor])),
  nesting: { ...DEFAULT_NESTING },
};

/** Startzustand eines Rechners für eine Oberfläche. */
export function emptyInput(surfaceKey = 'kueche') {
  const surface = surfaceByKey(surfaceKey);
  const counts = {};
  for (const e of activeElements(surface, [])) counts[e.key] = e.default;
  const subs = surface.key;
  return {
    surface: surface.key,
    shape: surface.shapes ? surface.shapes[1].key : null,
    addons: [],
    counts,
    condition: 'glatt',
    substrate: defaultSubstrate(subs),
    decor: 'uni',
    extras: { innen: false, grifflos: false, geraete: 0, demontage: false },
    travel: '0',
    weekend: false,
    pieces: {},          // eigene Maße je Element (mm), für den Zuschnitt
    customPieces: [],    // zusätzliche Teile { label, w, h, n }
  };
}

export function defaultSubstrate(surfaceKey) {
  return (SUBSTRATES_FOR[surfaceKey] || ['melamin'])[0];
}

/** Beim Aktivieren eines Bausteins dessen Startwerte eintragen, ohne Gezähltes zu überschreiben. */
export function withAddon(input, addonKey, on) {
  const surface = surfaceByKey(input.surface);
  const addon = (surface.addons || []).find((a) => a.key === addonKey);
  if (!addon) return input;
  const addons = on ? [...new Set([...input.addons, addonKey])] : input.addons.filter((k) => k !== addonKey);
  const counts = { ...input.counts };
  if (on) for (const e of addon.elements) if (counts[e.key] == null) counts[e.key] = e.default;
  return { ...input, addons, counts };
}

/** Küchenform wählen: setzt die Zählwerte auf die typischen Startwerte. */
export function withShape(input, shapeKey) {
  const surface = surfaceByKey(input.surface);
  const shape = (surface.shapes || []).find((s) => s.key === shapeKey);
  if (!shape) return input;
  return { ...input, shape: shapeKey, counts: { ...input.counts, ...shape.preset } };
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Gebinde für eine Primermenge: große zuerst, Rest in 250 ml, mit 10 % Reserve. */
export function primerPacks(ml, prices) {
  const need = Math.ceil(ml * 1.1);
  if (need <= 0) return { packs: [], ek: 0, ml: 0 };
  let big = Math.floor(need / 1000);
  let rest = need - big * 1000;
  let small = Math.ceil(rest / 250);
  // Vier kleine kosten mehr als eine große: dann lieber die große.
  if (small * prices.ek250 >= prices.ek1000) { big += 1; small = 0; }
  const packs = [];
  if (big) packs.push({ ml: 1000, n: big, ek: big * prices.ek1000 });
  if (small) packs.push({ ml: 250, n: small, ek: small * prices.ek250 });
  return { packs, ek: packs.reduce((s, p) => s + p.ek, 0), ml: need };
}

export function calculate(input, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const surface = surfaceByKey(input.surface);
  const elements = activeElements(surface, input.addons || []);
  const condition = CONDITIONS.find((c) => c.key === input.condition) || CONDITIONS[0];
  const condFactor = num(s.conditions?.[condition.key], condition.factor);
  const substrate = substrateByKey(input.substrate);
  const decor = DECORS.find((d) => d.key === input.decor) || DECORS[0];
  const decorPrice = s.decors?.[decor.key] || { ek: decor.ek, vk: decor.vk };
  const rate = num(s.hourlyRate, 68);

  // ── Mengen ────────────────────────────────────────────────────────────
  let areaNet = 0, edges = 0, fronts = 0, workHours = 0, portableHours = 0, portableArea = 0;
  const lines = [];
  for (const e of elements) {
    const n = num(input.counts?.[e.key], 0);
    if (n <= 0) continue;
    const a = n * e.area, ed = n * e.edge, h = n * e.hours * condFactor;
    areaNet += a; edges += ed; workHours += h;
    if (e.portable) { portableHours += h; portableArea += a; }
    if (FRONT_KEYS.has(e.key)) fronts += n;
    lines.push({ key: e.key, label: e.label, qty: n, unit: e.unit, area: a, hours: h });
  }
  const wastePct = num(s.waste, 25) / 100;
  const areaGross = areaNet * (1 + wastePct);

  // Innenseiten: Fläche und Zeit der Fronten noch einmal anteilig.
  const innenPct = input.extras?.innen ? num(s.extras?.innen, 40) / 100 : 0;
  const frontArea = lines.filter((l) => FRONT_KEYS.has(l.key)).reduce((a, l) => a + l.area, 0);
  const frontHours = lines.filter((l) => FRONT_KEYS.has(l.key)).reduce((a, l) => a + l.hours, 0);
  const innenArea = frontArea * innenPct;
  const innenHours = frontHours * innenPct;

  // ── Vorarbeit & Primer aus dem Untergrund ─────────────────────────────
  const prepItems = [];
  let prepHours = (areaNet + innenArea) * condition.prep;
  let consumablesEk = 0;
  for (const p of substrate.prep) {
    const qty = p.qty * (areaNet + innenArea);
    const unitEk = num(s.consumables?.[p.consumable], CONSUMABLES[p.consumable]?.ek ?? 0);
    const c = CONSUMABLES[p.consumable];
    prepHours += p.hours * (areaNet + innenArea);
    consumablesEk += qty * unitEk;
    prepItems.push({ key: p.key, label: p.label, hours: p.hours * (areaNet + innenArea), qty, unit: c?.unit, consumable: c?.label, ek: qty * unitEk });
  }
  const primerDef = PRIMERS[substrate.product] || PRIMERS.standard;
  const primerPrices = { ...primerDef, ...(s.primers?.[primerDef.key] || {}) };
  const fullArea = substrate.primer === 'full' ? (areaNet + innenArea) : substrate.primer === 'full2' ? 2 * (areaNet + innenArea) : 0;
  const edgeM = substrate.primer === 'none' ? 0 : edges;
  const primerMl = fullArea * num(primerPrices.mlPerM2, primerDef.mlPerM2) + edgeM * num(primerPrices.mlPerEdgeM, primerDef.mlPerEdgeM);
  const packs = primerPacks(primerMl, { ek250: num(primerPrices.ek250, primerDef.packs[0].ek), ek1000: num(primerPrices.ek1000, primerDef.packs[1].ek) });
  const primer = {
    mode: substrate.primer, product: primerDef.label, productKey: primerDef.key,
    fullArea, edgeM, ml: primerMl, packs: packs.packs, packsMl: packs.ml,
    ek: packs.ek, vk: packs.ek * num(s.primerMarkup, 1.6),
    note: substrate.note,
    text: primerText(substrate.primer, fullArea, edgeM, packs, primerDef.label),
  };

  // ── Stunden ───────────────────────────────────────────────────────────
  const setupHours = lines.length ? num(s.setupHours, 1.5) : 0;
  const demontagePct = input.extras?.demontage ? num(s.extras?.demontage, 12) / 100 : 0;
  const demontageHours = (workHours + innenHours) * demontagePct;
  const hours = {
    prep: prepHours, work: workHours + innenHours, setup: setupHours, demontage: demontageHours,
    total: prepHours + workHours + innenHours + setupHours + demontageHours,
  };

  // ── Zuschnitt: die Teile auf die Rolle legen ──────────────────────────
  // Ergibt die gekaufte Fläche (Laufmeter × Rollenbreite) und den echten
  // Verschnitt. Ist das Nesting aus, gilt der pauschale Prozentsatz.
  const ns = { ...DEFAULT_NESTING, ...(s.nesting || {}) };
  let nesting = null;
  if (ns.enabled && lines.length) {
    const pieces = piecesFor(surface.key, elements, input.counts, input.pieces, input.customPieces, ns.rollWidthMm, ns.bleedMm, innenPct);
    nesting = nest(pieces, { ...ns, grain: GRAIN_DECORS.has(decor.key) });
    nesting.pieces = pieces;
  }
  const pauschalM2 = areaGross + innenArea * (1 + wastePct);
  const materialM2 = nesting && nesting.areaBoughtM2 > 0 ? nesting.areaBoughtM2 : pauschalM2;

  // ── Geld ──────────────────────────────────────────────────────────────
  const material = {
    m2: materialM2,
    lfm: nesting ? nesting.totalMm / 1000 : null,
    rolls: nesting ? nesting.rollCount : null,
    wastePct: nesting ? nesting.wastePct : wastePct,
    pauschalM2,
    ek: materialM2 * num(decorPrice.ek, decor.ek),
    vk: materialM2 * num(decorPrice.vk, decor.vk),
  };
  const labor = { vk: hours.total * rate, cost: hours.total * num(s.laborCost, 34) };
  const extrasLines = [];
  if (input.extras?.grifflos && fronts) extrasLines.push({ key: 'grifflos', label: `Grifflose Optik, ${fronts} Fronten`, vk: fronts * num(s.extras?.grifflos, 14) });
  const geraete = num(input.extras?.geraete, 0);
  if (geraete > 0) extrasLines.push({ key: 'geraete', label: `${geraete} Geräte-Front(en)`, vk: geraete * num(s.extras?.geraete, 35) });
  const extrasVk = extrasLines.reduce((a, l) => a + l.vk, 0);
  const travelVk = num(s.travel?.[input.travel], 0);
  const weekendVk = input.weekend ? (labor.vk) * num(s.weekendPct, 25) / 100 : 0;
  const consumablesVk = consumablesEk * num(s.consumableMarkup, 1.5);

  const minOrder = num(s.minOrder, 490);
  const rangePct = num(s.rangePct, 10) / 100;
  const way = (value, extra = {}) => {
    const v = Math.max(value > 0 ? minOrder : 0, value);
    return { value: v, lo: v * (1 - rangePct), hi: v * (1 + rangePct), minApplied: value > 0 && value < minOrder, ...extra };
  };

  const base = material.vk + primer.vk + consumablesVk + extrasVk + weekendVk;
  const montage = way(base + labor.vk + travelVk);
  // Hol- & Bring: demontierbare Teile werden in der Werkstatt gemacht, schneller und ohne
  // Rüstzeit beim Kunden; alles Verbaute (Platte, Nische, Korpus) bleibt vor Ort.
  // Bleibt etwas vor Ort (Platte, Nische, Korpus), fällt die Rüstzeit dort
  // weiter an; ist alles demontierbar, ersetzt sie eine kurze Annahmezeit.
  const onsiteHours = hours.total - portableHours * (1 + innenPct) - setupHours;
  const onsiteLeft = onsiteHours > 0.01;
  const pickupHours = portableHours * (1 + innenPct) * num(s.pickupFactor, 0.5)
    + onsiteHours + (onsiteLeft ? setupHours : num(s.pickupHandlingHours, 0.5));
  const pickup = portableHours > 0
    ? way(base + pickupHours * rate + travelVk, { hours: pickupHours, portableArea, onsiteLeft })
    : null;
  const diy = way(material.vk * num(s.diyMaterialFactor, 1) + primer.vk + num(s.diyCutFee, 90) + num(s.diyShipping, 29), { noMin: true });
  diy.value = material.vk * num(s.diyMaterialFactor, 1) + primer.vk + num(s.diyCutFee, 90) + num(s.diyShipping, 29);
  diy.lo = diy.value * (1 - rangePct); diy.hi = diy.value * (1 + rangePct); diy.minApplied = false;

  const ek = material.ek + primer.ek + consumablesEk + labor.cost + travelVk * 0.6;
  const vk = montage.value;
  const margin = vk - ek;

  const notes = [];
  if (!lines.length) notes.push({ level: 'info', text: 'Noch nichts gezählt. Trag mindestens ein Element ein.' });
  if (substrate.key === 'putz_tapete') notes.push({ level: 'high', text: 'Wände: nur gespachtelt Q3 folierbar. Der Spachtelanteil ist im Preis, aber die Fläche muss trocken und tragfähig sein.' });
  if (substrate.key === 'kunststoff') notes.push({ level: 'high', text: 'PVC: nur mit Kunststoffprimer. Kein Standardprimer, sonst löst sich die Folie an den Umschlägen.' });
  if (condition.key === 'beschaedigt') notes.push({ level: 'medium', text: 'Beschädigte Kanten werden gespachtelt. Gequollene Spanplatte kann nicht foliert werden; das zeigt das Foto.' });
  if (input.surface === 'bad' && num(input.counts?.dusche, 0) > 0) notes.push({ level: 'high', text: 'Duschrückwand: Folie nur außerhalb des dauerhaft nassen Bereichs. Silikonfugen neu ziehen.' });
  if (nesting?.unplaced?.length) notes.push({ level: 'high', text: `${nesting.unplaced.length} Teil(e) passen nicht auf die Rolle (${ns.rollWidthMm} mm): ${nesting.unplaced.map((u) => `${u.label} ${u.w} × ${u.h}`).join(', ')}. Teilen oder quer legen.` });
  if (montage.minApplied) notes.push({ level: 'medium', text: `Unter dem Mindestauftragswert von ${minOrder} €. Der Richtwert ist auf den Mindestwert gesetzt.` });

  return {
    surface: surface.key, condition: condition.key, substrate: substrate.key, decor: decor.key,
    areaNet, areaGross, innenArea, edges, fronts, lines, prepItems,
    hours, material, labor, primer, nesting, consumables: { ek: consumablesEk, vk: consumablesVk },
    extras: extrasLines, extrasVk, travelVk, weekendVk,
    ways: { montage, pickup, diy },
    ek, vk, margin, marginPct: vk > 0 ? margin / vk : 0,
    perFront: fronts > 0 ? montage.value / fronts : null,
    notes,
  };
}

function primerText(mode, fullArea, edgeM, packs, product) {
  const packList = packs.packs.map((p) => `${p.n} × ${p.ml >= 1000 ? '1 l' : '250 ml'}`).join(' + ') || 'kein Gebinde';
  if (mode === 'none') return 'Kein Primer nötig. Nur reinigen und entfetten.';
  if (mode === 'edges') return `Nur Kanten: ca. ${Math.round(edgeM)} lfm Kante → ${Math.ceil(packs.ml)} ml ${product}. Gebinde: ${packList}.`;
  if (mode === 'full') return `Vollflächig: ${fullArea.toFixed(1)} m² plus ${Math.round(edgeM)} lfm Kante → ${Math.ceil(packs.ml)} ml ${product}. Gebinde: ${packList}.`;
  return `Zwei Aufträge vollflächig: ${(fullArea / 2).toFixed(1)} m² × 2 plus ${Math.round(edgeM)} lfm Kante → ${Math.ceil(packs.ml)} ml ${product}. Gebinde: ${packList}.`;
}

/** Text für die Anfrage per WhatsApp oder Formular. */
export function summaryText(input, result, settings = DEFAULT_SETTINGS) {
  const surface = surfaceByKey(input.surface);
  const decor = DECORS.find((d) => d.key === input.decor) || DECORS[0];
  const condition = CONDITIONS.find((c) => c.key === input.condition) || CONDITIONS[0];
  const zone = TRAVEL_ZONES.find((z) => z.key === input.travel);
  const eur = (v) => `${Math.round(v).toLocaleString('de-DE')} €`;
  const rows = result.lines.map((l) => `- ${l.qty} ${l.unit === 'stk' ? '×' : l.unit} ${l.label}`);
  const ex = [];
  if (input.extras?.innen) ex.push('Innenseiten');
  if (input.extras?.grifflos) ex.push('grifflose Optik');
  if (input.extras?.geraete) ex.push(`${input.extras.geraete} Gerätefront(en)`);
  if (input.extras?.demontage) ex.push('Demontage durch Betrieb');
  return [
    `Anfrage Folierung: ${surface.label}${settings.businessName ? ` · ${settings.businessName}` : ''}`,
    '',
    'Umfang:', ...(rows.length ? rows : ['- (nichts gezählt)']),
    '',
    `Zustand heute: ${condition.label}`,
    `Dekor: ${decor.label} (${decor.hint})`,
    `Extras: ${ex.length ? ex.join(', ') : 'keine'}`,
    `Anfahrt: ${zone ? zone.label : '–'}`,
    '',
    `Richtwert Montage vor Ort: ab ${eur(result.ways.montage.lo)} (${eur(result.ways.montage.lo)} – ${eur(result.ways.montage.hi)})`,
    result.ways.pickup ? `Hol- & Bring-Service: ab ${eur(result.ways.pickup.lo)}` : null,
    `Selbst machen (Zuschnitt-Set): ab ${eur(result.ways.diy.lo)}`,
    '',
    'Name:', 'Adresse / PLZ:', 'Telefon:', 'Wunschtermin:',
    '2–3 Handyfotos sind angehängt.',
  ].filter((l) => l !== null).join('\n');
}
