/* node src/folierung/nesting.test.mjs */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const asUrl = (src) => `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
const { nest, piecesFor, cutSize, DEFAULT_NESTING } = await import(asUrl(readFileSync(join(here, 'nesting.js'), 'utf8')));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ok  ', m)) : (fail++, console.log('  FAIL', m)); };

console.log('\n── Bodaq-Rolle 1.220 mm × 50 m ──');
ok(DEFAULT_NESTING.rollWidthMm === 1220 && DEFAULT_NESTING.rollLengthM === 50, 'Vorgabe ist die Bodaq-Rolle');

console.log('\n── 16 Küchenfronten 596 × 716 ──');
let r = nest([{ key: 'fronten', label: 'Front', w: 596, h: 716, n: 16 }], { bleedMm: 25, gapMm: 8, grain: true });
ok(r.rolls.length === 1, 'passt auf eine Rolle');
// 596 + 2 × 25 = 646; zwei davon sind 1.300 > 1.220. Eine 600er-Front je
// Bahn, das ist der Grund, warum Küchen mehr verschneiden als man schätzt.
ok(r.rolls[0].strips.every((s) => s.items.length === 1), `eine 600er-Front je Bahn, zwei passen nicht auf 1.220 (${r.rolls[0].strips.map((s) => s.items.length).join(',')})`);
ok(r.rolls[0].strips.length === 16, `sechzehn Bahnen (${r.rolls[0].strips.length})`);
ok(Math.abs(r.totalMm - (16 * 766 + 15 * 8)) < 1, `Länge 16 × 766 + 15 × 8 = ${r.totalMm} mm`);
ok(r.wastePct > 0.5 && r.wastePct < 0.6, `echter Verschnitt um 55 % (${(r.wastePct * 100).toFixed(0)} %), nicht 25 % pauschal`);
let narrow = nest([{ key: 'fronten', label: 'Front', w: 446, h: 716, n: 16 }], { bleedMm: 25, gapMm: 8, grain: true });
ok(narrow.rolls[0].strips.length === 8, `450er-Fronten: zwei je Bahn, acht Bahnen (${narrow.rolls[0].strips.length})`);
ok(r.rolls[0].strips.every((s) => s.items.every((i) => !i.rot)), 'Holz: nichts gedreht');

console.log('\n── Drehen bei Uni ──');
let u = nest([{ key: 'fronten', label: 'Front', w: 596, h: 716, n: 16 }], { bleedMm: 25, gapMm: 8, grain: false });
ok(u.totalMm < r.totalMm, `gedreht (716 quer) braucht weniger Länge: ${u.totalMm} < ${r.totalMm}`);
ok(u.rolls[0].strips[0].items[0].w === 766, 'die lange Seite liegt quer');

console.log('\n── Türblatt 860 × 1985: hochkant, nie quer ──');
let t = nest([{ key: 'blatt', label: 'Türblatt', w: 860, h: 1985, n: 4 }], { grain: false });
ok(t.unplaced.length === 0, 'alle Blätter platziert');
ok(t.rolls[0].strips.every((s) => s.items.length === 1), 'ein Blatt je Bahn (910 + 910 > 1220)');
ok(t.wastePct > 0.2, `Türen verschneiden ~${(t.wastePct * 100).toFixed(0)} %`);

console.log('\n── Streifen und Grenzen ──');
let big = nest([{ key: 'wand', label: 'Wand', w: 1170, h: 60000, n: 1, strip: true, splittable: true }], {});
ok(big.rollCount === 2 && big.unplaced.length === 0, `60 m Streifen wird auf zwei Rollen geteilt (${big.rollCount})`);
let wide = nest([{ key: 'x', label: 'Platte', w: 1400, h: 1400, n: 1 }], { grain: false });
ok(wide.unplaced.length === 1, 'ein 1.400er-Quadrat passt nicht, auch gedreht nicht');
let platte = nest([{ key: 'platte', label: 'Platte', w: 650, h: 5000, n: 1, splittable: true }], { grain: true, bleedMm: 25 });
ok(platte.rolls[0].strips[0].items[0].h === 5050, 'Platte 5 m läuft mit der Rolle, nicht quer');

console.log('\n── Umschlag um die Kante ──');
let cs = cutSize(596, 716, { t: 19, wx: 2, wy: 2 }, 25, 10);
ok(cs.w === 596 + 2 * (19 + 25) && cs.h === 716 + 2 * (19 + 25), `Front 596 × 716 bei 19 mm → Zuschnitt ${cs.w} × ${cs.h} (je Seite 19 + 25)`);
let cp = cutSize(650, 5000, { t: 38, wx: 1, wy: 0 }, 25, 10);
ok(cp.w === 650 + 38 + 25 + 10 && cp.h === 5020, `Platte: vorn 38 + 25 umschlagen, hinten Anschnitt → ${cp.w} breit`);
let lock = nest([{ key: 'fronten', label: 'Front', w: 684, h: 804, n: 4, cut: true, rawW: 596, rawH: 716, vertical: true }], { grain: false });
ok(lock.rolls[0].strips.every((s) => s.items.every((i) => !i.rot)), 'Fronten werden auch bei Uni nicht gedreht (Maserung senkrecht)');
ok(lock.rolls[0].strips[0].items[0].w === 684, 'die Breite liegt quer, die Höhe läuft mit der Rolle');

console.log('\n── piecesFor ──');
const els = [
  { key: 'fronten', rawKey: 'fronten', surfaceKey: 'kueche', label: 'Fronten', unit: 'stk' },
  { key: 'platte', rawKey: 'platte', surfaceKey: 'kueche', label: 'Arbeitsplatte', unit: 'm' },
  { key: 'ausschnitte', rawKey: 'ausschnitte', surfaceKey: 'kueche', label: 'Ausschnitte', unit: 'stk' },
];
let p = piecesFor('kueche', els, { fronten: 16, platte: 5, ausschnitte: 2 }, {}, [], 1220, 10, 0.4);
ok(p.find((x) => x.key === 'fronten' && x.n === 16), '16 Fronten als Teile');
ok(p.find((x) => x.label === 'Fronten innen' && x.n === 7), `Innenseiten: 40 % von 16 → 7 (${p.find((x) => x.label === 'Fronten innen')?.n})`);
ok(p.find((x) => x.key === 'platte' && x.h === 5020 && x.w === 723), `Platte 5 m × 650 → Zuschnitt 723 × 5020 (${p.find((x) => x.key === 'platte')?.w} × ${p.find((x) => x.key === 'platte')?.h})`);
ok(p.find((x) => x.key === 'fronten' && x.w === 684 && x.h === 804 && x.vertical), 'Fronten: 684 × 804 mit Umschlag, Maserung senkrecht');
ok(!p.find((x) => x.key === 'ausschnitte'), 'Ausschnitte brauchen keine Folie');
let o = piecesFor('kueche', els, { fronten: 2 }, { fronten: { w: 400, h: 1200 } });
ok(o[0].rawW === 400 && o[0].rawH === 1200 && o[0].w === 488, 'eigene Maße überschreiben die Vorgabe, Umschlag bleibt');
let th = piecesFor('kueche', els, { fronten: 2 }, { fronten: { t: 22 } });
ok(th[0].w === 596 + 2 * (22 + 25), 'eigene Materialstärke 22 mm wirkt auf den Umschlag');
let gr = piecesFor('kueche', els, { fronten: 10 }, { fronten: { groups: [{ w: 596, h: 716, n: 4 }, { w: 596, h: 283, n: 4 }] } });
ok(gr.length === 3 && gr[2].n === 2 && gr[1].rawH === 283, 'Größen aufgeteilt: 4 Türen, 4 Schubladen, Rest 2 im Standardmaß');
let c = piecesFor('kueche', [], {}, {}, [{ label: 'Blende', w: 120, h: 2400, n: 3 }]);
ok(c.length === 1 && c[0].n === 3, 'eigene Teile werden angehängt');

console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
