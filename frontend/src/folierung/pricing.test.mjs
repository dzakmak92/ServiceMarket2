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
const pricingSrc = readFileSync(join(here, 'pricing.js'), 'utf8').replaceAll("from './catalog'", `from '${catalogUrl}'`);
const { calculate, emptyInput, withShape, withAddon, primerPacks, DEFAULT_SETTINGS, summaryText } = await import(asUrl(pricingSrc));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ok  ', m)) : (fail++, console.log('  FAIL', m)); };
const near = (got, want, tol, m) => ok(Math.abs(got - want) <= tol, `${m} (got ${got.toFixed(2)}, want ≈ ${want})`);

console.log('\n── eine L-Küche, wie Retrena sie vorrechnet ──');
let inp = withShape(emptyInput('kueche'), 'l');
let r = calculate(inp, DEFAULT_SETTINGS);
ok(r.lines.length >= 4, 'die Formvorwahl füllt Fronten, Platte, Sockel, Seiten');
near(r.areaNet, 16 * 0.42 + 5 * 0.85 + 5 * 0.16 + 2 * 0.55 + 1 * 0, 0.01, 'Nettofläche summiert Element × Fläche');
near(r.areaGross, r.areaNet * 1.25, 0.01, '25 % Verschnitt obendrauf');
ok(r.ways.montage.value > 1500 && r.ways.montage.value < 4500, `Montage vor Ort landet im Marktband 1.500–4.500 € (${r.ways.montage.value.toFixed(0)})`);
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
near(griff.extrasVk, 16 * 14, 0.01, 'grifflos: 14 € je Front');
let small = calculate({ ...emptyInput('kueche'), counts: { fronten: 2 } });
ok(small.ways.montage.minApplied && small.ways.montage.value === 490, 'zwei Fronten → Mindestauftragswert greift');
ok(small.notes.some((n) => n.text.includes('Mindestauftrag')), '… und wird als Hinweis genannt');
let addon = withAddon(inp, 'insel', true);
ok(addon.addons.includes('insel') && addon.counts.insel_platte === 2, 'Insel aktivieren setzt ihre Startwerte');
ok(calculate(addon).areaNet > base.areaNet, '… und vergrößert die Fläche');
let own = calculate(inp, { ...DEFAULT_SETTINGS, hourlyRate: 90 });
ok(own.ways.montage.value > base.ways.montage.value, 'eigener Stundensatz wirkt');
let wall = calculate({ ...emptyInput('waende') });
ok(wall.notes.some((n) => n.level === 'high'), 'Wände tragen den Q3-Hinweis');
ok(summaryText(inp, base).includes('16 × Fronten'), 'die Anfrage nennt die Positionen');
let nothing = calculate({ ...emptyInput('kueche'), counts: {} });
ok(nothing.vk === 0 && nothing.hours.total === 0 && nothing.ways.pickup === null, 'nichts gezählt → kein Preis, keine Rüstzeit');

console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
