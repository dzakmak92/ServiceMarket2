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
 * Gerechnet wird in der Preisbasis, in der der Betrieb seine Preise führt
 * (`settings.priceBasis`: 'net' Standard, 'gross' für eine Brutto-Preisliste).
 * Die Umsatzsteuer kommt aus dem Profil (`settings.vat`: Land, Satz,
 * Kleinunternehmer): Österreich 20 %, Deutschland 19 %, Kleinunternehmer 0 %.
 * Jeder Weg trägt danach `net` und `gross`; der Kunde sieht brutto, der
 * Deckungsbeitrag wird immer netto gegen den Netto-EK gerechnet.
 * Die Engine rundet nichts außer den Gebinden; runden tut die Anzeige.
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
  priceBasis: 'net',     // 'net' = VK-Preise netto eingegeben, 'gross' = Brutto-Preisliste
  vat: { country: 'AT', rate: 20, klein: false }, // aus dem Profil, siehe vatFromProfile()
  hourlyRate: 57,        // VK-Stundensatz
  laborCost: 34,         // interne Lohnkosten je Stunde (für den Deckungsbeitrag)
  setupHours: 1.5,       // Rüstzeit je Auftrag: anfahren, abdecken, Werkzeug, aufräumen
  waste: 25,             // Verschnitt in %
  minOrder: 410,
  rangePct: 10,          // ± um den Richtwert
  primerMarkup: 1.6,     // VK-Faktor auf den Primer-EK
  consumableMarkup: 1.5,
  pickupFactor: 0.5,     // Hol- & Bring: Lohn für demontierbare Teile × Faktor (Werkstatt: Serie, Tisch, kein Abdecken)
  pickupHandlingHours: 0.5, // Hol- & Bring: Annahme, Beschriftung, Verladen je Auftrag
  diyMaterialFactor: 1.0,
  diyCutFee: 75,
  diyShipping: 24,
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

/** USt.-Satz aus dem Pro-Profil: Rechnungsland und Kleinunternehmer-Haken. */
export const VAT_RATES = { AT: 20, DE: 19 };
export function vatFromProfile(profile) {
  const country = ['AT', 'DE'].includes(profile?.invoice_country) ? profile.invoice_country
    : ['AT', 'DE'].includes(profile?.business_country) ? profile.business_country : 'AT';
  const klein = !!profile?.is_kleinunternehmer;
  return { country, rate: klein ? 0 : VAT_RATES[country], klein };
}

/** Wie die Steuer neben einem Preis steht. */
export function vatLabel(vat) {
  if (!vat || vat.klein) return 'ohne USt. (Kleinunternehmerregelung)';
  return `inkl. ${String(vat.rate).replace('.', ',')} % MwSt.`;
}

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
    extraSurfaces: [],   // weitere Bereiche im selben Auftrag (Türen, Möbel, …)
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

/** Einen weiteren Bereich (Türen, Möbel, …) in dieselbe Kalkulation nehmen. */
export function withExtraSurface(input, surfaceKey, on) {
  const extra = surfaceByKey(surfaceKey);
  if (!extra || extra.key === input.surface) return input;
  const extraSurfaces = on ? [...new Set([...(input.extraSurfaces || []), extra.key])] : (input.extraSurfaces || []).filter((k) => k !== extra.key);
  const counts = { ...input.counts };
  if (on) for (const e of extra.elements) if (counts[`${extra.key}:${e.key}`] == null) counts[`${extra.key}:${e.key}`] = e.default;
  return { ...input, extraSurfaces, counts };
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
  const elements = activeElements(surface, input.addons || [], input.extraSurfaces || []);
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
    if (FRONT_KEYS.has(e.rawKey || e.key)) fronts += n;
    lines.push({ key: e.key, rawKey: e.rawKey || e.key, label: e.addon?.startsWith('surface:') ? `${e.label} (${surfaceByKey(e.surfaceKey).short})` : e.label, qty: n, unit: e.unit, area: a, hours: h });
  }
  const wastePct = num(s.waste, 25) / 100;
  const areaGross = areaNet * (1 + wastePct);

  // Innenseiten: Fläche und Zeit der Fronten noch einmal anteilig.
  const innenPct = input.extras?.innen ? num(s.extras?.innen, 40) / 100 : 0;
  const frontArea = lines.filter((l) => FRONT_KEYS.has(l.rawKey)).reduce((a, l) => a + l.area, 0);
  const frontHours = lines.filter((l) => FRONT_KEYS.has(l.rawKey)).reduce((a, l) => a + l.hours, 0);
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
    const pieces = piecesFor(surface.key, elements, input.counts, input.pieces, input.customPieces, ns.rollWidthMm, ns.bleedMm, innenPct, { back: ns.backWrapMm, t: ns.thicknessMm });
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

  // ── Steuer: Preisbasis → netto / brutto ───────────────────────────────
  const vat = { country: s.vat?.country || 'AT', klein: !!s.vat?.klein, rate: s.vat?.klein ? 0 : num(s.vat?.rate, 20), basis: s.priceBasis === 'gross' ? 'gross' : 'net' };
  const f = 1 + vat.rate / 100;
  const toNet = (v) => (vat.basis === 'gross' ? v / f : v);
  const toGross = (v) => (vat.basis === 'gross' ? v : v * f);
  for (const w of [montage, pickup, diy]) {
    if (!w) continue;
    Object.assign(w, { net: toNet(w.value), gross: toGross(w.value), grossLo: toGross(w.lo), grossHi: toGross(w.hi) });
  }

  // EK ist netto (Lieferantenpreise, Lohnkosten); der VK für den Vergleich auch.
  const ek = material.ek + primer.ek + consumablesEk + labor.cost + toNet(travelVk) * 0.6;
  const vk = toNet(montage.value);
  const margin = vk - ek;

  const notes = [];
  if (!lines.length) notes.push({ level: 'info', text: 'Noch nichts gezählt. Trag mindestens ein Element ein.' });
  if (substrate.key === 'putz_tapete') notes.push({ level: 'high', text: 'Wände: nur gespachtelt Q3 folierbar. Der Spachtelanteil ist im Preis, aber die Fläche muss trocken und tragfähig sein.' });
  if (substrate.key === 'kunststoff') notes.push({ level: 'high', text: 'PVC: nur mit Kunststoffprimer. Kein Standardprimer, sonst löst sich die Folie an den Umschlägen.' });
  if (condition.key === 'beschaedigt') notes.push({ level: 'medium', text: 'Beschädigte Kanten werden gespachtelt. Gequollene Spanplatte kann nicht foliert werden; das zeigt das Foto.' });
  if (input.surface === 'bad' && num(input.counts?.dusche, 0) > 0) notes.push({ level: 'high', text: 'Duschrückwand: Folie nur außerhalb des dauerhaft nassen Bereichs. Silikonfugen neu ziehen.' });
  if (nesting?.unplaced?.length) notes.push({ level: 'high', text: `${nesting.unplaced.length} Teil(e) passen nicht auf die Rolle (${ns.rollWidthMm} mm): ${nesting.unplaced.map((u) => `${u.label} ${u.w} × ${u.h}`).join(', ')}. Teilen oder quer legen.` });
  if (montage.minApplied) notes.push({ level: 'medium', text: `Unter dem Mindestauftragswert von ${Math.round(minOrder)} € ${vat.basis === 'gross' ? 'brutto' : 'netto'}. Der Richtwert ist auf den Mindestwert gesetzt.` });

  return {
    surface: surface.key, condition: condition.key, substrate: substrate.key, decor: decor.key,
    areaNet, areaGross, innenArea, edges, fronts, lines, prepItems,
    hours, material, labor, primer, nesting, consumables: { ek: consumablesEk, vk: consumablesVk },
    extras: extrasLines, extrasVk, travelVk, weekendVk,
    ways: { montage, pickup, diy },
    ek, vk, margin, marginPct: vk > 0 ? margin / vk : 0,
    vat, toNet, toGross,
    perFront: fronts > 0 ? montage.gross / fronts : null,
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
    `Richtwert Montage vor Ort: ab ${eur(result.ways.montage.grossLo)} (${eur(result.ways.montage.grossLo)} – ${eur(result.ways.montage.grossHi)}), ${vatLabel(result.vat)}`,
    result.ways.pickup ? `Hol- & Bring-Service: ab ${eur(result.ways.pickup.grossLo)}` : null,
    `Selbst machen (Zuschnitt-Set): ab ${eur(result.ways.diy.grossLo)}`,
    '',
    'Name:', 'Adresse / PLZ:', 'Telefon:', 'Wunschtermin:',
    '2–3 Handyfotos sind angehängt.',
  ].filter((l) => l !== null).join('\n');
}

/**
 * Angebotspositionen aus einer Kalkulation, für POST /api/quotes.
 *
 * Immer netto: die Datenbank rechnet USt. und Brutto beim Einfügen selbst
 * (Trigger auf quote_lines), und ein Kleinunternehmer bekommt die Behandlung
 * mitgeschickt, damit kein Satz erfunden wird. Die Summe der Positionen ist
 * genau der Netto-Richtwert der Montage vor Ort.
 */
export function quoteLinesFrom(input, result, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const n = result.toNet;
  const decor = DECORS.find((d) => d.key === input.decor) || DECORS[0];
  const tax = result.vat?.klein ? { tax_treatment: 'kleinunternehmer' } : {};
  const r2 = (v) => Math.round(v * 100) / 100;
  const lines = [];
  const add = (kind, description, qty, unit, total, detail) => {
    if (!(total > 0) || !(qty > 0)) return;
    lines.push({ kind, description, qty: r2(qty), unit, unit_price: r2(n(total) / qty), ...(detail ? { detail } : {}), ...tax });
  };
  const counted = result.lines.map((l) => `${l.qty} ${l.unit === 'stk' ? '×' : l.unit === 'm2' ? 'm²' : 'm'} ${l.label}`).join(', ');
  const m = result.material;
  add('material', `Architekturfolie ${decor.label}`, m.m2, 'm²', m.vk,
    m.lfm != null ? `${String(m.lfm.toFixed(1)).replace('.', ',')} lfm von der ${s.nesting?.rollWidthMm || 1220}-mm-Rolle, inkl. Umschlag und Verschnitt` : `inkl. ${s.waste} % Verschnitt`);
  add('material', 'Primer', 1, 'pcs', result.primer.vk, result.primer.text);
  add('material', 'Verbrauchsmaterial (Reiniger, Schleifvlies, Spachtel)', 1, 'pcs', result.consumables.vk);
  add('labor', 'Folierarbeiten inkl. Vorarbeit und Rüsten', result.hours.total, 'h', result.labor.vk, counted);
  for (const x of result.extras) add('other', x.label, 1, 'pcs', x.vk);
  add('travel', 'Anfahrt', 1, 'pcs', result.travelVk);
  add('other', 'Zuschlag Wochenende / Nacht', 1, 'pcs', result.weekendVk);
  const sum = lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
  const gap = r2(result.vk - sum);
  if (gap > 0.5) lines.push({ kind: 'other', description: 'Mindestauftragswert, Ausgleich', qty: 1, unit: 'pcs', unit_price: gap, ...tax });
  return lines.map((l, i) => ({ ...l, position: i + 1 }));
}

export function quoteTitleFrom(input) {
  const surface = surfaceByKey(input.surface);
  const more = (input.extraSurfaces || []).length;
  return `Folierung ${surface.label}${more ? ` + ${more}` : ''}`;
}

export function quoteAssumptionsFrom(result) {
  const notes = result.notes.filter((x) => x.level !== 'info').map((x) => x.text);
  return [
    'Richtwert nach Foto-Einschätzung; verbindlich nach Aufmaß.',
    result.primer.note,
    ...notes,
  ].filter(Boolean).join('\n');
}
