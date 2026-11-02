/* node src/folierung/pricing.test.mjs
   Die Quelldateien sind ESM ohne "type": "module"; wie number.test.mjs werden
   sie als data:-URL importiert. pricing.js hängt an catalog.js, darum wird der
   relative Import vorher auf die Daten-URL des Katalogs umgeschrieben. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const asUrl = (src) => `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
const catalogUrl = asUrl(readFileSync(join(here, 'catalog.js'), 'utf8'));
const nestingUrl = asUrl(readFileSync(join(here, 'nesting.js'), 'utf8'));
const pricingSrc = readFileSync(join(here, 'pricing.js'), 'utf8')
  .replaceAll("from './catalog'", `from '${catalogUrl}'`)
  .replaceAll("from './nesting'", `from '${nestingUrl}'`);
const { calculate, emptyInput, withShape, withAddon, withExtraSurface, withType, primerPacks, DEFAULT_SETTINGS, summaryText, vatFromProfile, vatLabel, quoteLinesFrom } = await import(asUrl(pricingSrc));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ok  ', m)) : (fail++, console.log('  FAIL', m)); };
const wasteOf = (r) => r.nesting ? r.nesting.wastePct : 0;
const near = (got, want, tol, m) => ok(Math.abs(got - want) <= tol, `${m} (got ${got.toFixed(2)}, want ≈ ${want})`);

console.log('\n── eine L-Küche, wie Retrena sie vorrechnet ──');
let inp = withShape(emptyInput('kueche'), 'l');
let r = calculate(inp, DEFAULT_SETTINGS);
ok(r.lines.length >= 4, 'die Formvorwahl füllt Fronten, Platte, Sockel, Seiten');
near(r.areaNet, 16 * 0.42 + 5 * 0.85 + 5 * 0.16 + 2 * 0.55 + 1 * 0, 0.01, 'Nettofläche summiert Element × Fläche');
near(r.areaGross, r.areaNet * 1.25, 0.01, '25 % Verschnitt pauschal (Vergleichswert)');
ok(r.nesting && r.nesting.rollCount >= 1, `Nesting gelaufen: ${r.nesting.pieceCount} Teile, ${(r.nesting.totalMm / 1000).toFixed(1)} lfm auf ${r.nesting.rollCount} Rolle(n)`);
ok(Math.abs(r.material.m2 - r.nesting.areaBoughtM2) < 0.001, 'Material = gekaufte Laufmeter × Rollenbreite');
ok(r.material.wastePct > wasteOf(r) - 0.001, `echter Verschnitt ${(r.material.wastePct * 100).toFixed(0)} % statt Pauschale`);
let off = calculate(inp, { ...DEFAULT_SETTINGS, nesting: { ...DEFAULT_SETTINGS.nesting, enabled: false } });
near(off.material.m2, off.areaGross, 0.01, 'Nesting aus → Pauschale');
ok(r.ways.montage.gross > 1500 && r.ways.montage.gross < 4500, `Montage vor Ort brutto im Marktband 1.500–4.500 € (${r.ways.montage.gross.toFixed(0)})`);
ok(r.ways.pickup && r.ways.pickup.value < r.ways.montage.value, 'Hol- & Bring ist billiger als Montage');
ok(r.ways.diy.value < r.ways.pickup.value, 'Selbst machen ist am billigsten');
ok(r.ek < r.vk && r.marginPct > 0.3, `Deckungsbeitrag positiv und über 30 % (${(r.marginPct * 100).toFixed(0)} %)`);
ok(r.primer.mode === 'edges', 'Melamin: Primer nur auf den Kanten');
ok(r.primer.ml > 0 && r.primer.packs.length > 0, `Primer-Menge und Gebinde vorhanden (${Math.ceil(r.primer.ml)} ml → ${r.primer.packs.map((p) => `${p.n}×${p.ml}`).join('+')})`);

console.log('\n── der Untergrund steuert den Primer ──');
let fl = calculate({ ...emptyInput('bad'), counts: { fliesen: 6, fronten: 0, waschtisch: 0, schuerze: 0, dusche: 0 }, substrate: 'fliesen' });
ok(fl.primer.mode === 'full', 'Fliesen: vollflächig');
near(fl.primer.fullArea, 6, 0.01, 'Vollfläche = Nettofläche');
ok(fl.prepItems.some((p) => p.key === 'fugen'), 'Fugen füllen steht in der Vorarbeit');
let roh = calculate({ ...emptyInput('moebel'), substrate: 'holz_roh' });
ok(roh.primer.mode === 'full2' && roh.primer.fullArea > roh.areaNet * 1.9, 'rohe MDF: zwei Aufträge, doppelte Fläche');
let pvc = calculate({ ...emptyInput('fenster') });
ok(pvc.primer.productKey === 'plastic', 'Fenster: Kunststoffprimer vorgeschlagen');
let glas = calculate({ ...emptyInput('bad'), substrate: 'glas', counts: { dusche: 2 } });
ok(glas.primer.mode === 'none' && glas.primer.ml === 0, 'Glas: kein Primer');

console.log('\n── Gebinde ──');
let p = primerPacks(0, { ek250: 19, ek1000: 58 });
ok(p.packs.length === 0 && p.ek === 0, 'nichts gebraucht, nichts bestellt');
p = primerPacks(300, { ek250: 19, ek1000: 58 });
ok(p.packs.length === 1 && p.packs[0].ml === 250 && p.packs[0].n === 2, '300 ml + Reserve → 2 × 250 ml');
p = primerPacks(900, { ek250: 19, ek1000: 58 });
ok(p.packs.length === 1 && p.packs[0].ml === 1000, '900 ml → eine 1-l-Flasche statt vier kleiner');
p = primerPacks(1500, { ek250: 19, ek1000: 58 });
ok(p.packs.find((x) => x.ml === 1000)?.n === 1 && p.packs.find((x) => x.ml === 250)?.n === 3, '1.650 ml → 1 l + 3 × 250 ml');

console.log('\n── Extras und Regeln ──');
let base = calculate(inp);
let innen = calculate({ ...inp, extras: { ...inp.extras, innen: true } });
ok(innen.ways.montage.value > base.ways.montage.value, 'Innenseiten kosten mehr');
near(innen.innenArea, base.lines.find((l) => l.key === 'fronten').area * 0.4, 0.01, 'Innenseiten = 40 % der Frontfläche');
let griff = calculate({ ...inp, extras: { ...inp.extras, grifflos: true } });
near(griff.extrasVk, 16 * 12, 0.01, 'grifflos: 12 € netto je Front');
let small = calculate({ ...emptyInput('kueche'), counts: { fronten: 2 } });
ok(small.ways.montage.minApplied && small.ways.montage.value === 410, 'zwei Fronten → Mindestauftragswert greift (410 netto)');
ok(small.notes.some((n) => n.text.includes('Mindestauftrag')), '… und wird als Hinweis genannt');
let addon = withAddon(inp, 'insel', true);
ok(addon.addons.includes('insel') && addon.counts.insel_platte === 2, 'Insel aktivieren setzt ihre Startwerte');
ok(calculate(addon).areaNet > base.areaNet, '… und vergrößert die Fläche');
let multi = withExtraSurface(inp, 'tueren', true);
ok(multi.extraSurfaces.includes('tueren') && multi.counts['tueren:blatt_1'] === 4, 'Türen als weiterer Bereich mit Startwerten');
let mr = calculate(multi);
ok(mr.lines.some((l) => l.key === 'tueren:blatt_1') && mr.areaNet > base.areaNet, 'Türen zählen in Fläche und Preis mit');
ok(mr.fronts === base.fronts + 4, `Türblätter zählen als Fronten (${mr.fronts})`);
let own = calculate(inp, { ...DEFAULT_SETTINGS, hourlyRate: 90 });
ok(own.ways.montage.value > base.ways.montage.value, 'eigener Stundensatz wirkt');
let wall = calculate({ ...emptyInput('waende') });
ok(wall.notes.some((n) => n.level === 'high'), 'Wände tragen den Q3-Hinweis');
ok(summaryText(inp, base).includes('16 × Fronten'), 'die Anfrage nennt die Positionen');
let nothing = calculate({ ...emptyInput('kueche'), counts: {} });
ok(nothing.vk === 0 && nothing.hours.total === 0 && nothing.ways.pickup === null, 'nichts gezählt → kein Preis, keine Rüstzeit');

console.log('\n── Typen je Fläche ──');
const mb = emptyInput('moebel');
ok(mb.types.schrankwand === 1 && mb.counts.fronten === 6 && mb.counts.seiten === 2, 'Möbel starten mit einer Schrankwand (6 Fronten, 2 Seiten)');
const mb2 = withType(mb, 'kommode', 1);
ok(mb2.counts.fronten === 10 && mb2.counts.seiten === 4, 'Kommode dazu: +4 Fronten, +2 Seiten');
const mb3 = withType(mb2, 'schrankwand', 0);
ok(mb3.counts.fronten === 4 && mb3.types.schrankwand === 0, 'Schrankwand weg: Fronten zurück auf 4');
const td = emptyInput('tueren');
ok(td.counts.blatt_1 === 4 && td.counts.zarge === 4, 'Türen starten mit 4 Zimmertüren');
const td2 = withType(td, 'glastuer', 2);
ok(td2.counts.glas === 2 && td2.counts.blatt_1 === 6, 'zwei Glastüren: +2 Blätter, +2 Ausschnitte');
const manual = withType({ ...mb, counts: { ...mb.counts, fronten: 1 } }, 'schrankwand', 0);
ok(manual.counts.fronten === 0, 'nie unter 0, auch wenn von Hand weniger gezählt wurde');
ok(emptyInput('kueche').types && Object.keys(emptyInput('kueche').types).length === 0, 'Küche bleibt bei Form und Bausteinen');

console.log('\n── Umsatzsteuer aus dem Profil ──');
const at = vatFromProfile({ invoice_country: 'AT' });
const de = vatFromProfile({ invoice_country: 'DE' });
const kl = vatFromProfile({ invoice_country: 'AT', is_kleinunternehmer: true });
ok(at.rate === 20 && de.rate === 19 && kl.rate === 0, 'AT 20 %, DE 19 %, Kleinunternehmer 0 %');
ok(vatFromProfile({}).country === 'AT', 'ohne Angabe: Österreich');
ok(vatLabel(at) === 'inkl. 20 % MwSt.' && vatLabel(kl).includes('Kleinunternehmer'), `Beschriftung: "${vatLabel(at)}"`);
const rAT = calculate(inp, { ...DEFAULT_SETTINGS, vat: at });
const rDE = calculate(inp, { ...DEFAULT_SETTINGS, vat: de });
const rKL = calculate(inp, { ...DEFAULT_SETTINGS, vat: kl });
near(rAT.ways.montage.gross, rAT.ways.montage.net * 1.2, 0.01, 'netto-Preisliste in AT: brutto = netto × 1,20');
near(rDE.ways.montage.gross, rDE.ways.montage.net * 1.19, 0.01, 'in DE: × 1,19');
near(rKL.ways.montage.gross, rKL.ways.montage.net, 0.01, 'Kleinunternehmer: brutto = netto');
const rG = calculate(inp, { ...DEFAULT_SETTINGS, priceBasis: 'gross', vat: at });
near(rG.ways.montage.gross, rG.ways.montage.value, 0.01, 'Brutto-Preisliste: der Preis bleibt, wie er eingegeben ist');
near(rG.vk, rG.ways.montage.value / 1.2, 0.01, '… und der Deckungsbeitrag rechnet netto');
ok(rAT.marginPct > 0.3, `Deckungsbeitrag netto gegen EK netto: ${(rAT.marginPct * 100).toFixed(0)} %`);
ok(summaryText(inp, rAT).includes('inkl. 20 % MwSt.'), 'die Anfrage nennt 20 % für Österreich');

console.log('\n── Angebotspositionen ──');
const ql = quoteLinesFrom(inp, rAT, { ...DEFAULT_SETTINGS, vat: at });
const qsum = ql.reduce((a, l) => a + l.qty * l.unit_price, 0);
near(qsum, rAT.vk, 1, `Positionen summieren sich auf den Netto-Richtwert (${qsum.toFixed(2)} ≈ ${rAT.vk.toFixed(2)})`);
ok(ql.every((l) => l.description && l.qty > 0 && l.unit_price >= 0 && l.position > 0), 'jede Position ist vollständig');
ok(ql.some((l) => l.kind === 'labor' && l.unit === 'h') && ql.some((l) => l.kind === 'material' && l.unit === 'm²'), 'Arbeit in Stunden, Folie in m²');
const qk = quoteLinesFrom(inp, rKL, { ...DEFAULT_SETTINGS, vat: kl });
ok(qk.every((l) => l.tax_treatment === 'kleinunternehmer'), 'Kleinunternehmer: Behandlung auf jeder Position');
const qsmall = quoteLinesFrom(small.input || { ...emptyInput('kueche'), counts: { fronten: 2 } }, small);
ok(qsmall.some((l) => l.description.startsWith('Mindestauftragswert')), 'Mindestauftrag wird als Ausgleich ausgewiesen');

console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
