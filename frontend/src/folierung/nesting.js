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
  bleedMm: 10,         // Anschnitt je Kante, die NICHT umschlagen wird (Flächen, Streifen)
  backWrapMm: 25,      // Umschlag hinten: über die Kante und 2–3 cm auf die Rückseite
  thicknessMm: 19,     // Materialstärke, wenn das Element keine eigene trägt
  gapMm: 8,            // Abstand zwischen zwei Teilen fürs Messer
  rotate: 'auto',      // 'auto' = nach Dekor, 'yes' = immer, 'no' = nie
};

/* Dekorfamilien mit Laufrichtung: nicht drehen. */
export const GRAIN_DECORS = new Set(['holz', 'metall', 'leder', 'marmor']);

/* ── Standardmaße je Element ────────────────────────────────────────────
 * Schlüssel `oberflaeche.element`, Rückfall `element`. Ein Eintrag ist
 *   { w, h }                        ein Teil je Stück (mm), Sichtmaß
 *   { w, perM: true }               Streifen: Länge = Menge in m, Breite w
 *   { strip: true }                 Fläche in m²: volle Bahnbreite, Länge daraus
 *   { parts: [{ w, h, n }] }        mehrere Teile je Stück
 * dazu der Umschlag:
 *   t        Materialstärke in mm (Front 19, Platte 38, Türblatt 40)
 *   wx, wy   wie viele Kanten je Achse umschlagen werden (0, 1, 2);
 *            eine umschlagene Kante braucht t + backWrap, eine freie nur Anschnitt.
 *   vertical Maserung steht senkrecht, wird nie gedreht (Fronten, Türen, Seiten)
 */
const FRONT = { w: 596, h: 716, t: 19, wx: 2, wy: 2, vertical: true };
export const PIECE_DEFAULTS = {
  'kueche.fronten': FRONT, 'kueche.insel_fronten': FRONT, 'kueche.extra_fronten': FRONT,
  'kueche.platte': { w: 650, perM: true, t: 38, wx: 1 }, 'kueche.insel_platte': { w: 950, perM: true, t: 38, wx: 2 },
  'kueche.nische': { w: 600, perM: true, t: 0, wx: 0 }, 'kueche.sockel': { w: 150, perM: true, t: 16, wx: 0 },
  'kueche.blenden': { w: 100, h: 716, t: 19, wx: 2, wy: 1, vertical: true }, 'kueche.seiten': { w: 580, h: 870, t: 19, wx: 1, wy: 1, vertical: true }, 'kueche.insel_seiten': { w: 900, h: 870, t: 19, wx: 2, wy: 1, vertical: true },
  'kueche.extra_seiten': { w: 580, h: 1000, t: 19, wx: 1, wy: 1, vertical: true }, 'kueche.regal': { w: 300, h: 1000, t: 19, wx: 1, wy: 0 },
  'tueren.blatt_1': { w: 860, h: 1985, t: 40, wx: 2, wy: 2, vertical: true }, 'tueren.blatt_2': { parts: [{ w: 860, h: 1985, n: 2 }], t: 40, wx: 1, wy: 1, vertical: true },
  'tueren.zarge': { parts: [{ w: 180, h: 2100, n: 4 }, { w: 180, h: 900, n: 2 }, { w: 110, h: 2100, n: 2 }, { w: 110, h: 900, n: 1 }] },
  'tueren.haustuer': { w: 1000, h: 2100, t: 60, wx: 2, wy: 2, vertical: true },
  'moebel.fronten': FRONT, 'moebel.seiten': { w: 580, h: 900, t: 19, wx: 1, wy: 1, vertical: true }, 'moebel.tisch': { strip: true },
  'moebel.regal': { w: 300, h: 1000, t: 19, wx: 1, wy: 0 }, 'moebel.bett': { parts: [{ w: 1000, h: 1600, n: 1 }, { w: 300, h: 2000, n: 2 }] },
  'bad.fliesen': { strip: true }, 'bad.fronten': { w: 446, h: 570, t: 19, wx: 2, wy: 2, vertical: true }, 'bad.waschtisch': { w: 600, perM: true, t: 38, wx: 1 },
  'bad.schuerze': { strip: true }, 'bad.dusche': { strip: true },
  'waende.wand': { strip: true }, 'waende.paneel': { w: 600, h: 1000, t: 19, wx: 2, wy: 2, vertical: true }, 'waende.saeule': { w: 1200, perM: true }, 'waende.decke': { strip: true },
  'fenster.fluegel': { parts: [{ w: 110, h: 1400, n: 2 }, { w: 110, h: 900, n: 2 }] }, 'fenster.rahmen': { w: 120, perM: true },
  'fenster.bank': { w: 300, perM: true }, 'fenster.rollo': { w: 300, perM: true },
  'gewerbe.theke': { parts: [{ w: 1100, h: 1000, n: 1 }, { w: 650, h: 1000, n: 1 }] }, 'gewerbe.regal': { parts: [{ w: 400, h: 2000, n: 2 }, { w: 1000, h: 350, n: 4 }] },
  'gewerbe.aufzug': { strip: true }, 'gewerbe.zimmer': { parts: [{ w: 596, h: 2000, n: 4 }, { w: 800, h: 1600, n: 1 }, { w: 500, h: 600, n: 4 }] },
  'gewerbe.tisch': { w: 850, h: 1650, t: 25, wx: 2, wy: 2 }, 'gewerbe.trennwand': { strip: true },
  'sonstiges.stufe': { w: 350, h: 1000, t: 40, wx: 1, wy: 0 }, 'sonstiges.setzstufe': { w: 180, h: 1000, t: 0, wx: 0, wy: 0 },
  'sonstiges.heizkoerper': { w: 800, h: 1000, t: 0, wx: 0, wy: 0 }, 'sonstiges.garderobe': { w: 800, h: 1000, t: 19, wx: 2, wy: 2, vertical: true },
};

/* Elemente ohne Eintrag (Ausschnitte, Glasausschnitte) brauchen keine Folie. */
export function pieceDefault(surfaceKey, elementKey) {
  return PIECE_DEFAULTS[`${surfaceKey}.${elementKey}`] || PIECE_DEFAULTS[`kueche.${elementKey}`] || null;
}

/** Zuschnittmaß aus Sichtmaß: je Achse umschlagene Kanten (t + hinten) plus freie Kanten (Anschnitt). */
export function cutSize(w, h, { t = 19, wx = 2, wy = 2 } = {}, back = 25, bleed = 10) {
  const addX = wx * (t + back) + (2 - wx) * bleed;
  const addY = wy * (t + back) + (2 - wy) * bleed;
  return { w: Math.round(w + addX), h: Math.round(h + addY), addX, addY };
}

/**
 * Die Teileliste aus Zählwerten, fertig mit Umschlag und Anschnitt.
 *
 * @param elements   aktive Elemente (catalog.activeElements), tragen rawKey/surfaceKey
 * @param counts     input.counts
 * @param overrides  input.pieces: { [elementKey]: { w, h, t, groups: [{ w, h, n }] } }
 * @param custom     input.customPieces: [{ label, w, h, n, t }]
 * @param rollW      Rollenbreite für Flächen-Streifen
 * @param bleed      Anschnitt je freier Kante
 * @param innenPct   Anteil Fronten, deren Innenseite mitfoliert wird
 * @param wrap       { back, t }: Umschlag hinten und Standard-Materialstärke
 */
export function piecesFor(surfaceKey, elements, counts, overrides = {}, custom = [], rollW = 1220, bleed = 10, innenPct = 0, wrap = {}) {
  const back = Number(wrap.back ?? DEFAULT_NESTING.backWrapMm);
  const tDefault = Number(wrap.t ?? DEFAULT_NESTING.thicknessMm);
  const out = [];
  const push = (key, label, rawW, rawH, n, spec, extra = {}) => {
    if (n <= 0 || rawW <= 0 || rawH <= 0) return;
    const c = cutSize(rawW, rawH, { t: spec.t ?? tDefault, wx: spec.wx ?? 2, wy: spec.wy ?? 2 }, back, bleed);
    out.push({ key, label, w: c.w, h: c.h, rawW: Math.round(rawW), rawH: Math.round(rawH), n: Math.ceil(n), cut: true, vertical: !!spec.vertical, t: spec.t ?? tDefault, wx: spec.wx ?? 2, wy: spec.wy ?? 2, ...extra });
  };
  for (const e of elements) {
    const qty = Number(counts?.[e.key]) || 0;
    if (qty <= 0) continue;
    const base = pieceDefault(e.surfaceKey || surfaceKey, e.rawKey || e.key);
    const o = overrides?.[e.key];
    if (!base && !o) continue;
    const d = { ...(base || {}), ...(o || {}) };
    if (o?.t != null) d.t = Number(o.t);
    const isFront = /front|blatt/.test(e.rawKey || e.key) && e.unit === 'stk';
    if (d.groups?.length && e.unit === 'stk') {
      // Größen aufgeteilt: n je Größe; was über die Zählung hinaus fehlt, bekommt das Standardmaß.
      let left = qty;
      for (const g of d.groups) {
        const n = Math.min(left, Number(g.n) || 0);
        if (n > 0 && g.w && g.h) { push(e.key, `${e.label} ${g.w}×${g.h}`, Number(g.w), Number(g.h), n, d); left -= n; }
      }
      if (left > 0 && d.w && d.h) push(e.key, e.label, d.w, d.h, left, d);
      if (innenPct > 0 && isFront) for (const g of d.groups) if (g.w && g.h && g.n) push(e.key, `${e.label} ${g.w}×${g.h} innen`, Number(g.w), Number(g.h), Number(g.n) * innenPct, d);
    } else if (d.parts && !(o?.w && o?.h)) {
      d.parts.forEach((p, i) => push(e.key, `${e.label} ${i + 1}`, p.w, p.h, p.n * qty, d));
    } else if (d.perM) {
      push(e.key, e.label, d.w, qty * 1000, 1, { ...d, wy: 0 }, { splittable: true });
    } else if (d.strip) {
      const w = Math.max(200, rollW - 2 * bleed);
      push(e.key, e.label, w - 2 * bleed, (qty * 1e6) / w, 1, { t: 0, wx: 0, wy: 0 }, { splittable: true, strip: true });
    } else {
      push(e.key, e.label, d.w, d.h, qty, d);
      if (innenPct > 0 && isFront) push(e.key, `${e.label} innen`, d.w, d.h, qty * innenPct, d);
    }
  }
  for (const c of custom || []) push(c.key || 'custom', c.label || 'Eigenes Teil', Number(c.w), Number(c.h), Number(c.n) || 1, { t: c.t != null && c.t !== '' ? Number(c.t) : tDefault, wx: 2, wy: 2, vertical: !!c.vertical });
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
      // Teile aus piecesFor sind fertig zugeschnitten (cut); rohe Teile bekommen hier Zugabe.
      const b = p.cut ? 0 : bleed;
      let w = p.w + 2 * b, h = p.h + 2 * b;
      areaPieces += ((p.rawW ?? p.w) * (p.rawH ?? p.h)) / 1e6;
      const lock = !!p.vertical;   // senkrechte Maserung: nie drehen, auch bei Uni nicht
      if (w > rollW && (h <= rollW) && !lock && (rotate || p.strip || p.splittable)) [w, h] = [h, w];
      if (w > rollW) { unplaced.push({ label: p.label, w: p.w, h: p.h, why: `breiter als die Rolle (${rollW} mm), auch gedreht` }); continue; }
      // Quer möglichst breit legen, das spart Länge; nur wenn Drehen erlaubt ist.
      if (rotate && !lock && h <= rollW && h > w) [w, h] = [h, w];
      while (h > rollL) { items.push({ w, h: rollL, label: `${p.label} (Teil)`, key: p.key }); h -= rollL; }
      items.push({ w, h, label: p.label, key: p.key, canRotate: rotate && !p.strip && !lock });
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
