/**
 * Nesting: die gezählten Teile auf die Rolle legen.
 *
 * Bodaq Interior Film kommt auf der Rolle 1.220 mm × 50 m (4 ft × 164 ft);
 * Coverstyl' ebenso 1.220 mm, 3M DI-NOC 1.220 mm. Die Rolle ist deshalb
 * die Einheit, nicht der Quadratmeter: bestellt wird in Laufmetern, bezahlt
 * wird die ganze Bahnbreite, auch wenn eine Front nur 600 mm davon braucht.
 * Ein pauschaler Verschnitt von 25 % stimmt für eine Küche mit 600er-Fronten
 * zufällig ungefähr und für eine Tür von 860 mm Breite überhaupt nicht
 * (860 auf 1.220 heißt 30 % Rest, der für nichts anderes reicht).
 *
 * Verfahren: Streifen-Packen (shelf packing), Teile nach Länge absteigend,
 * erste passende Bahn, Drehen nur wenn das Dekor keine Laufrichtung hat.
 * Das ist kein optimaler Zuschnitt, aber ein reproduzierbarer, den ein
 * Verarbeiter am Tisch genauso legen würde: Bahn für Bahn, gleich lange
 * Teile nebeneinander. Für Holz und gebürstetes Metall läuft die Maserung
 * immer entlang der Rolle; ein gedrehtes Teil fiele neben seinem Nachbarn
 * sofort auf.
 *
 * Maße in Millimetern. `w` liegt quer zur Rolle (≤ Rollenbreite), `h` läuft
 * mit der Rolle.
 */

export const DEFAULT_NESTING = {
  enabled: true,
  rollWidthMm: 1220,   // Bodaq / Coverstyl' / DI-NOC
  rollLengthM: 50,
  bleedMm: 20,         // Zugabe je Seite: 19er-Kante umschlagen plus Anschnitt
  gapMm: 8,            // Abstand zwischen zwei Teilen fürs Messer
  rotate: 'auto',      // 'auto' = nach Dekor, 'yes' = immer, 'no' = nie
};

/* Dekorfamilien mit Laufrichtung: nicht drehen. */
export const GRAIN_DECORS = new Set(['holz', 'metall', 'leder', 'marmor']);

/* ── Standardmaße je Element ────────────────────────────────────────────
 * Schlüssel `oberflaeche.element`, Rückfall `element`. Ein Eintrag ist
 *   { w, h }                        ein Teil je Stück (mm)
 *   { w, perM: true }               Streifen: Länge = Menge in m, Breite w
 *   { strip: true }                 Fläche in m²: volle Bahnbreite, Länge daraus
 *   { parts: [{ w, h, n }] }        mehrere Teile je Stück
 */
const FRONT = { w: 596, h: 716 };
export const PIECE_DEFAULTS = {
  'kueche.fronten': FRONT, 'kueche.insel_fronten': FRONT, 'kueche.extra_fronten': FRONT,
  'kueche.platte': { w: 650, perM: true }, 'kueche.insel_platte': { w: 950, perM: true },
  'kueche.nische': { w: 600, perM: true }, 'kueche.sockel': { w: 150, perM: true },
  'kueche.blenden': { w: 100, h: 716 }, 'kueche.seiten': { w: 580, h: 870 }, 'kueche.insel_seiten': { w: 900, h: 870 },
  'kueche.extra_seiten': { w: 580, h: 1000 }, 'kueche.regal': { w: 300, h: 1000 },
  'tueren.blatt_1': { w: 860, h: 1985 }, 'tueren.blatt_2': { parts: [{ w: 860, h: 1985, n: 2 }] },
  'tueren.zarge': { parts: [{ w: 180, h: 2100, n: 4 }, { w: 180, h: 900, n: 2 }, { w: 110, h: 2100, n: 2 }, { w: 110, h: 900, n: 1 }] },
  'tueren.haustuer': { w: 1000, h: 2100 },
  'moebel.fronten': { w: 596, h: 716 }, 'moebel.seiten': { w: 580, h: 900 }, 'moebel.tisch': { strip: true },
  'moebel.regal': { w: 300, h: 1000 }, 'moebel.bett': { parts: [{ w: 1000, h: 1600, n: 1 }, { w: 300, h: 2000, n: 2 }] },
  'bad.fliesen': { strip: true }, 'bad.fronten': { w: 450, h: 600 }, 'bad.waschtisch': { w: 600, perM: true },
  'bad.schuerze': { strip: true }, 'bad.dusche': { strip: true },
  'waende.wand': { strip: true }, 'waende.paneel': { w: 600, h: 1000 }, 'waende.saeule': { w: 1200, perM: true }, 'waende.decke': { strip: true },
  'fenster.fluegel': { parts: [{ w: 110, h: 1400, n: 2 }, { w: 110, h: 900, n: 2 }] }, 'fenster.rahmen': { w: 120, perM: true },
  'fenster.bank': { w: 300, perM: true }, 'fenster.rollo': { w: 300, perM: true },
  'gewerbe.theke': { parts: [{ w: 1100, h: 1000, n: 1 }, { w: 650, h: 1000, n: 1 }] }, 'gewerbe.regal': { parts: [{ w: 400, h: 2000, n: 2 }, { w: 1000, h: 350, n: 4 }] },
  'gewerbe.aufzug': { strip: true }, 'gewerbe.zimmer': { parts: [{ w: 596, h: 2000, n: 4 }, { w: 800, h: 1600, n: 1 }, { w: 500, h: 600, n: 4 }] },
  'gewerbe.tisch': { w: 850, h: 1650 }, 'gewerbe.trennwand': { strip: true },
  'sonstiges.stufe': { w: 350, h: 1000 }, 'sonstiges.setzstufe': { w: 180, h: 1000 },
  'sonstiges.heizkoerper': { w: 800, h: 1000 }, 'sonstiges.garderobe': { w: 800, h: 1000 },
};

/* Elemente ohne Eintrag (Ausschnitte, Glasausschnitte) brauchen keine Folie. */
export function pieceDefault(surfaceKey, elementKey) {
  return PIECE_DEFAULTS[`${surfaceKey}.${elementKey}`] || PIECE_DEFAULTS[`kueche.${elementKey}`] || null;
}

/**
 * Die Teileliste aus Zählwerten.
 *
 * @param elements   aktive Elemente (catalog.activeElements)
 * @param counts     input.counts
 * @param overrides  input.pieces: { [elementKey]: { w, h } } vom Betrieb eingetragene Maße
 * @param custom     input.customPieces: [{ label, w, h, n }]
 * @param rollW      Rollenbreite für Flächen-Streifen
 * @param bleed      Zugabe je Seite, für die Streifenbreite
 */
export function piecesFor(surfaceKey, elements, counts, overrides = {}, custom = [], rollW = 1220, bleed = 25, innenPct = 0) {
  const out = [];
  const push = (key, label, w, h, n, extra = {}) => {
    if (n <= 0 || w <= 0 || h <= 0) return;
    out.push({ key, label, w: Math.round(w), h: Math.round(h), n: Math.ceil(n), ...extra });
  };
  for (const e of elements) {
    const qty = Number(counts?.[e.key]) || 0;
    if (qty <= 0) continue;
    const base = pieceDefault(surfaceKey, e.key);
    if (!base && !overrides?.[e.key]) continue;
    const d = { ...(base || {}), ...(overrides?.[e.key] || {}) };
    if (d.parts && !overrides?.[e.key]) {
      d.parts.forEach((p, i) => push(e.key, `${e.label} ${i + 1}`, p.w, p.h, p.n * qty));
    } else if (d.perM) {
      push(e.key, e.label, d.w, qty * 1000, 1, { splittable: true });
    } else if (d.strip) {
      const w = Math.max(200, rollW - 2 * bleed);
      push(e.key, e.label, w, (qty * 1e6) / w, 1, { splittable: true, strip: true });
    } else {
      push(e.key, e.label, d.w, d.h, qty);
      if (innenPct > 0 && e.unit === 'stk' && /front|blatt/.test(e.key)) push(e.key, `${e.label} innen`, d.w, d.h, qty * innenPct);
    }
  }
  for (const c of custom || []) push(c.key || 'custom', c.label || 'Eigenes Teil', Number(c.w), Number(c.h), Number(c.n) || 1);
  return out;
}

/**
 * Teile auf Rollen legen.
 * @returns { rolls:[{ strips:[{ y, h, items:[{ x, y, w, h, label, rot }] }], usedMm }],
 *            totalMm, rollCount, areaBoughtM2, areaPiecesM2, wastePct, unplaced:[] }
 */
export function nest(pieces, opts = {}) {
  const o = { ...DEFAULT_NESTING, ...opts };
  const rollW = Number(o.rollWidthMm) || 1220;
  const rollL = (Number(o.rollLengthM) || 50) * 1000;
  const gap = Number(o.gapMm) || 0;
  const bleed = Number(o.bleedMm) || 0;
  const rotate = o.rotate === 'yes' ? true : o.rotate === 'no' ? false : !o.grain;

  // Teile mit Zugabe ausrollen, zu lange Streifen in Rollenlängen teilen.
  const items = [];
  const unplaced = [];
  let areaPieces = 0;
  for (const p of pieces) {
    for (let i = 0; i < p.n; i++) {
      let w = p.w + 2 * bleed, h = p.h + 2 * bleed;
      areaPieces += (p.w * p.h) / 1e6;
      if (w > rollW && (h <= rollW) && (rotate || p.strip || p.splittable)) [w, h] = [h, w];
      if (w > rollW) { unplaced.push({ label: p.label, w: p.w, h: p.h, why: `breiter als die Rolle (${rollW} mm), auch gedreht` }); continue; }
      // Quer möglichst breit legen, das spart Länge; nur wenn Drehen erlaubt ist.
      if (rotate && h <= rollW && h > w) [w, h] = [h, w];
      while (h > rollL) { items.push({ w, h: rollL, label: `${p.label} (Teil)`, key: p.key }); h -= rollL; }
      items.push({ w, h, label: p.label, key: p.key, canRotate: rotate && !p.strip });
    }
  }
  items.sort((a, b) => b.h - a.h || b.w - a.w);

  const rolls = [];
  const newRoll = () => { const r = { strips: [], usedMm: 0 }; rolls.push(r); return r; };
  const fits = (strip, w, h) => strip.h >= h && strip.rem >= w + (strip.items.length ? gap : 0);
  const place = (roll, strip, it, w, h, rot) => {
    const x = rollW - strip.rem + (strip.items.length ? gap : 0);
    strip.items.push({ x, y: strip.y, w, h, label: it.label, key: it.key, rot });
    strip.rem = rollW - (x + w);
    if (roll) { /* keep for symmetry */ }
  };

  for (const it of items) {
    let done = false;
    for (const roll of rolls) {
      for (const strip of roll.strips) {
        if (fits(strip, it.w, it.h)) { place(roll, strip, it, it.w, it.h, false); done = true; break; }
        if (it.canRotate && fits(strip, it.h, it.w)) { place(roll, strip, it, it.h, it.w, true); done = true; break; }
      }
      if (done) break;
    }
    if (done) continue;
    // Neue Bahn: auf der Rolle mit Platz, sonst neue Rolle.
    let w = it.w, h = it.h, rot = false;
    if (it.canRotate && it.h <= rollW && it.h > it.w) { [w, h] = [it.h, it.w]; rot = true; }
    let roll = rolls.find((r) => r.usedMm + (r.strips.length ? gap : 0) + h <= rollL) || newRoll();
    const y = roll.usedMm + (roll.strips.length ? gap : 0);
    const strip = { y, h, rem: rollW, items: [] };
    roll.strips.push(strip);
    place(roll, strip, it, w, h, rot);
    roll.usedMm = y + h;
  }

  const totalMm = rolls.reduce((a, r) => a + r.usedMm, 0);
  const areaBought = (totalMm * rollW) / 1e6;
  return {
    rolls, totalMm, rollCount: rolls.length, rollWidthMm: rollW, rollLengthMm: rollL,
    areaBoughtM2: areaBought, areaPiecesM2: areaPieces,
    wastePct: areaBought > 0 ? 1 - areaPieces / areaBought : 0,
    unplaced, rotate,
    pieceCount: items.length,
  };
}
