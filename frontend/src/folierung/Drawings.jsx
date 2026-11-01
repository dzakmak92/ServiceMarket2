import React from 'react';

/**
 * Die Zählzeichnungen. Eine je Oberflächen-Welt, nummeriert wie die Elemente
 * im Katalog (`step`), damit Zeichnung und Zählzeile dieselbe Nummer tragen.
 *
 * Jede Zeichnung ist eine Liste von Teilen: `keys` sagt, zu welchem Element
 * das Teil gehört, `d` oder `rect` zeichnet es, `badge` setzt die Nummer.
 * Das aktive Element wird in Amber gezeichnet, alles andere in Teal-Tint;
 * so sieht der Kunde beim Antippen einer Zählzeile, was genau gemeint ist.
 *
 * Alles geometrisch und klein gehalten. Es sind Lagepläne, keine Bilder.
 */

const Rect = ({ x, y, w, h, r = 2, on, muted, extra = '' }) => (
  <rect x={x} y={y} width={w} height={h} rx={r}
    className={`${on ? 'fill-amber stroke-amber-deep' : muted ? 'fill-cream-deep stroke-sm-border' : 'fill-teal-tint stroke-teal/40'} ${extra}`}
    strokeWidth="1" />
);

/* Ein Bauteil: alle Rechtecke, gleiche Zugehörigkeit. */
function Part({ part, active, onPick }) {
  const on = active && part.keys.includes(active);
  const clickable = !!onPick && part.keys.length > 0;
  return (
    <g onClick={clickable ? () => onPick(part.keys[0]) : undefined}
      className={clickable ? 'cursor-pointer' : ''} role={clickable ? 'button' : undefined}
      aria-label={part.label}>
      {part.rects.map((r, i) => <Rect key={i} {...r} on={on} muted={part.muted} />)}
      {part.paths?.map((d, i) => (
        <path key={`p${i}`} d={d} className={on ? 'stroke-amber-deep' : 'stroke-teal/50'} strokeWidth="1.2" fill="none" />
      ))}
    </g>
  );
}

function Badge({ x, y, n, on, onPick, k }) {
  return (
    <g onClick={onPick ? () => onPick(k) : undefined} className={onPick ? 'cursor-pointer' : ''}>
      <circle cx={x} cy={y} r="8.5" className={on ? 'fill-amber-deep' : 'fill-ink'} />
      <text x={x} y={y + 3.2} textAnchor="middle" className="fill-paper" fontSize="9" fontWeight="700">{n}</text>
    </g>
  );
}

/* ── Küche: Zeile mit Hochschrank, Oberschränken, Nische, Platte, Sockel ── */
const KITCHEN = {
  viewBox: '0 0 400 230', parts: [
    { keys: [], label: 'Wand', muted: true, rects: [{ x: 0, y: 0, w: 400, h: 230, r: 0 }] },
    { keys: ['seiten'], label: 'Sichtbare Schrankseite', rects: [{ x: 10, y: 22, w: 8, h: 186 }, { x: 10, y: 22, w: 60, h: 6 }] },
    { keys: ['fronten'], label: 'Hochschrank-Fronten', rects: [{ x: 20, y: 30, w: 48, h: 86 }, { x: 20, y: 120, w: 48, h: 86 }] },
    { keys: ['fronten'], label: 'Oberschrank-Fronten', rects: [{ x: 80, y: 30, w: 44, h: 50 }, { x: 128, y: 30, w: 44, h: 50 }, { x: 250, y: 30, w: 44, h: 50 }, { x: 298, y: 30, w: 44, h: 50 }] },
    { keys: ['regal'], label: 'Offenes Regalfach', rects: [{ x: 346, y: 30, w: 42, h: 50 }], paths: ['M348 55 H386', 'M348 68 H386'] },
    { keys: [], label: 'Dunstabzug', muted: true, rects: [{ x: 176, y: 30, w: 70, h: 26 }] },
    { keys: ['nische'], label: 'Nischenrückwand', rects: [{ x: 80, y: 86, w: 308, h: 32, r: 1 }] },
    { keys: ['platte'], label: 'Arbeitsplatte', rects: [{ x: 76, y: 120, w: 316, h: 9, r: 1 }] },
    { keys: ['ausschnitte'], label: 'Ausschnitt (Spüle)', rects: [{ x: 96, y: 121, w: 40, h: 7, r: 1 }] },
    { keys: ['ausschnitte'], label: 'Ausschnitt (Kochfeld)', rects: [{ x: 250, y: 121, w: 44, h: 7, r: 1 }] },
    { keys: ['fronten'], label: 'Unterschrank-Fronten', rects: [{ x: 80, y: 134, w: 56, h: 64 }, { x: 140, y: 134, w: 44, h: 30 }, { x: 140, y: 168, w: 44, h: 30 }, { x: 188, y: 134, w: 56, h: 64 }, { x: 250, y: 134, w: 44, h: 30 }, { x: 250, y: 168, w: 44, h: 30 }, { x: 298, y: 134, w: 44, h: 64 }] },
    { keys: ['blenden'], label: 'Blende', rects: [{ x: 346, y: 134, w: 10, h: 64 }] },
    { keys: ['seiten'], label: 'Sichtbare Schrankseite rechts', rects: [{ x: 360, y: 134, w: 28, h: 64 }] },
    { keys: ['sockel'], label: 'Sockelleiste', rects: [{ x: 20, y: 208, w: 368, h: 10, r: 1 }] },
  ],
  badges: [
    { k: 'fronten', n: 1, x: 108, y: 166 }, { k: 'platte', n: 2, x: 200, y: 124 }, { k: 'ausschnitte', n: 3, x: 116, y: 110 },
    { k: 'nische', n: 4, x: 340, y: 102 }, { k: 'sockel', n: 5, x: 200, y: 213 }, { k: 'blenden', n: 6, x: 351, y: 150 },
    { k: 'seiten', n: 7, x: 14, y: 116 }, { k: 'regal', n: 8, x: 367, y: 44 },
  ],
};

const ISLAND = {
  viewBox: '0 0 400 200', parts: [
    { keys: ['insel_platte'], label: 'Inselplatte', rects: [{ x: 40, y: 40, w: 320, h: 12, r: 2 }] },
    { keys: ['insel_fronten'], label: 'Insel-Fronten', rects: [{ x: 60, y: 60, w: 56, h: 100 }, { x: 120, y: 60, w: 56, h: 48 }, { x: 120, y: 112, w: 56, h: 48 }, { x: 180, y: 60, w: 56, h: 100 }, { x: 240, y: 60, w: 56, h: 100 }] },
    { keys: ['insel_seiten'], label: 'Insel-Sichtseite', rects: [{ x: 300, y: 60, w: 50, h: 100 }, { x: 46, y: 60, w: 10, h: 100 }] },
    { keys: [], label: 'Sockel', muted: true, rects: [{ x: 56, y: 164, w: 290, h: 8 }] },
  ],
  badges: [{ k: 'insel_fronten', n: 1, x: 148, y: 86 }, { k: 'insel_platte', n: 2, x: 200, y: 46 }, { k: 'insel_seiten', n: 3, x: 325, y: 110 }],
};

const CABINET = {
  viewBox: '0 0 400 230', parts: [
    { keys: ['extra_seiten', 'seiten'], label: 'Oberboden', rects: [{ x: 60, y: 14, w: 280, h: 8 }] },
    { keys: ['extra_seiten', 'seiten'], label: 'Sichtseite', rects: [{ x: 52, y: 22, w: 10, h: 190 }, { x: 338, y: 22, w: 10, h: 190 }] },
    { keys: ['extra_fronten', 'fronten'], label: 'Fronten', rects: [{ x: 66, y: 26, w: 64, h: 90 }, { x: 134, y: 26, w: 64, h: 90 }, { x: 202, y: 26, w: 64, h: 90 }, { x: 270, y: 26, w: 64, h: 90 },
      { x: 66, y: 120, w: 132, h: 28 }, { x: 66, y: 152, w: 132, h: 28 }, { x: 66, y: 184, w: 132, h: 26 }, { x: 202, y: 120, w: 132, h: 90 }] },
    { keys: ['regal'], label: 'Regalböden', rects: [] },
    { keys: ['tisch'], label: 'Tischplatte', rects: [] },
    { keys: ['bett'], label: 'Bett', rects: [] },
  ],
  badges: [{ k: 'extra_fronten', n: 1, x: 98, y: 70 }, { k: 'extra_seiten', n: 2, x: 57, y: 120 }],
};
/* Möbel teilt die Zeichnung mit den Extra-Schränken, nur die Schlüssel heißen anders. */
const FURNITURE = {
  viewBox: '0 0 400 230', parts: [
    { keys: ['seiten'], label: 'Oberboden', rects: [{ x: 40, y: 14, w: 200, h: 8 }] },
    { keys: ['seiten'], label: 'Sichtseite', rects: [{ x: 32, y: 22, w: 8, h: 130 }, { x: 240, y: 22, w: 8, h: 130 }] },
    { keys: ['fronten'], label: 'Fronten', rects: [{ x: 44, y: 26, w: 60, h: 60 }, { x: 108, y: 26, w: 60, h: 60 }, { x: 172, y: 26, w: 64, h: 60 }, { x: 44, y: 90, w: 124, h: 28 }, { x: 44, y: 122, w: 124, h: 26 }, { x: 172, y: 90, w: 64, h: 58 }] },
    { keys: ['regal'], label: 'Regalböden', rects: [{ x: 270, y: 30, w: 110, h: 6 }, { x: 270, y: 70, w: 110, h: 6 }, { x: 270, y: 110, w: 110, h: 6 }] },
    { keys: ['tisch'], label: 'Tischplatte', rects: [{ x: 60, y: 170, w: 200, h: 10 }], paths: ['M70 180 V215', 'M250 180 V215'] },
    { keys: ['bett'], label: 'Kopfteil', rects: [{ x: 290, y: 150, w: 90, h: 40 }], paths: ['M290 190 H380 V215 H290 Z'] },
  ],
  badges: [{ k: 'fronten', n: 1, x: 76, y: 58 }, { k: 'seiten', n: 2, x: 36, y: 90 }, { k: 'tisch', n: 3, x: 160, y: 175 }, { k: 'regal', n: 4, x: 325, y: 73 }, { k: 'bett', n: 5, x: 335, y: 170 }],
};

const DOOR = {
  viewBox: '0 0 400 230', parts: [
    { keys: [], label: 'Wand', muted: true, rects: [{ x: 0, y: 0, w: 400, h: 230, r: 0 }] },
    { keys: ['zarge'], label: 'Zarge', rects: [{ x: 70, y: 10, w: 14, h: 215 }, { x: 216, y: 10, w: 14, h: 215 }, { x: 70, y: 10, w: 160, h: 14 }] },
    { keys: ['blatt_1', 'blatt_2'], label: 'Türblatt', rects: [{ x: 86, y: 26, w: 128, h: 199, r: 1 }] },
    { keys: ['glas'], label: 'Glasausschnitt', rects: [{ x: 110, y: 50, w: 80, h: 90, r: 1 }] },
    { keys: [], label: 'Griff', muted: true, rects: [{ x: 196, y: 128, w: 10, h: 4 }] },
    { keys: ['haustuer'], label: 'Haustür innen', rects: [{ x: 272, y: 20, w: 100, h: 205, r: 2 }], paths: ['M290 60 H354', 'M290 120 H354', 'M290 180 H354'] },
  ],
  badges: [{ k: 'blatt_1', n: 1, x: 150, y: 180 }, { k: 'zarge', n: 2, x: 77, y: 120 }, { k: 'glas', n: 3, x: 150, y: 95 }, { k: 'haustuer', n: 4, x: 322, y: 90 }],
};

const BATH = {
  viewBox: '0 0 400 230', parts: [
    { keys: ['fliesen'], label: 'Wandfliesen', rects: Array.from({ length: 5 }, (_, r) => Array.from({ length: 6 }, (_, c) => ({ x: 12 + c * 38, y: 12 + r * 24, w: 36, h: 22, r: 0 }))).flat() },
    { keys: ['dusche'], label: 'Duschrückwand', rects: [{ x: 250, y: 12, w: 138, h: 200, r: 1 }], paths: ['M320 30 V60', 'M300 60 H340'] },
    { keys: ['waschtisch'], label: 'Waschtischplatte', rects: [{ x: 20, y: 136, w: 200, h: 9, r: 1 }] },
    { keys: [], label: 'Becken', muted: true, rects: [{ x: 90, y: 137, w: 60, h: 7, r: 3 }] },
    { keys: ['fronten'], label: 'Badmöbel-Fronten', rects: [{ x: 28, y: 150, w: 88, h: 26 }, { x: 28, y: 180, w: 88, h: 26 }, { x: 122, y: 150, w: 90, h: 56 }] },
    { keys: ['schuerze'], label: 'Badewannenschürze', rects: [{ x: 250, y: 150, w: 138, h: 60, r: 2 }] },
  ],
  badges: [{ k: 'fliesen', n: 1, x: 120, y: 70 }, { k: 'fronten', n: 2, x: 72, y: 178 }, { k: 'waschtisch', n: 3, x: 190, y: 140 }, { k: 'schuerze', n: 4, x: 320, y: 180 }, { k: 'dusche', n: 5, x: 320, y: 110 }],
};

const WALL = {
  viewBox: '0 0 400 230', parts: [
    { keys: ['decke'], label: 'Decke', rects: [{ x: 0, y: 0, w: 400, h: 22, r: 0 }] },
    { keys: ['wand'], label: 'Wandfläche', rects: [{ x: 0, y: 22, w: 260, h: 190, r: 0 }] },
    { keys: [], label: 'Fenster', muted: true, rects: [{ x: 40, y: 60, w: 70, h: 80 }] },
    { keys: ['paneel'], label: 'Wandpaneele', rects: [{ x: 140, y: 50, w: 28, h: 150 }, { x: 172, y: 50, w: 28, h: 150 }, { x: 204, y: 50, w: 28, h: 150 }] },
    { keys: ['saeule'], label: 'Säule', rects: [{ x: 300, y: 22, w: 40, h: 190, r: 0 }] },
    { keys: [], label: 'Boden', muted: true, rects: [{ x: 0, y: 212, w: 400, h: 18, r: 0 }] },
  ],
  badges: [{ k: 'wand', n: 1, x: 90, y: 180 }, { k: 'paneel', n: 2, x: 186, y: 125 }, { k: 'saeule', n: 3, x: 320, y: 120 }, { k: 'decke', n: 4, x: 200, y: 11 }],
};

const WINDOW = {
  viewBox: '0 0 400 230', parts: [
    { keys: [], label: 'Wand', muted: true, rects: [{ x: 0, y: 0, w: 400, h: 230, r: 0 }] },
    { keys: ['rollo'], label: 'Rollladenkasten', rects: [{ x: 60, y: 14, w: 280, h: 26, r: 1 }] },
    { keys: ['rahmen'], label: 'Blendrahmen', rects: [{ x: 60, y: 44, w: 280, h: 140, r: 1 }] },
    { keys: [], label: 'Glas', muted: true, rects: [{ x: 78, y: 60, w: 110, h: 108 }, { x: 212, y: 60, w: 110, h: 108 }] },
    { keys: ['fluegel'], label: 'Fensterflügel', rects: [{ x: 70, y: 52, w: 126, h: 124, r: 1 }, { x: 204, y: 52, w: 126, h: 124, r: 1 }],
      paths: ['M70 52 H196 V176 H70 Z M78 60 H188 V168 H78 Z', 'M204 52 H330 V176 H204 Z M212 60 H322 V168 H212 Z'] },
    { keys: ['bank'], label: 'Fensterbank', rects: [{ x: 50, y: 188, w: 300, h: 12, r: 1 }] },
  ],
  badges: [{ k: 'fluegel', n: 1, x: 133, y: 150 }, { k: 'rahmen', n: 2, x: 200, y: 110 }, { k: 'bank', n: 3, x: 200, y: 194 }, { k: 'rollo', n: 4, x: 200, y: 27 }],
};

const COUNTER = {
  viewBox: '0 0 400 230', parts: [
    { keys: ['trennwand'], label: 'Trennwand', rects: [{ x: 0, y: 0, w: 400, h: 230, r: 0 }], muted: false },
    { keys: ['regal'], label: 'Ladenregal', rects: [{ x: 20, y: 30, w: 90, h: 6 }, { x: 20, y: 64, w: 90, h: 6 }, { x: 20, y: 98, w: 90, h: 6 }, { x: 20, y: 132, w: 90, h: 6 }, { x: 16, y: 24, w: 4, h: 120 }, { x: 110, y: 24, w: 4, h: 120 }] },
    { keys: ['theke'], label: 'Theke', rects: [{ x: 130, y: 120, w: 170, h: 10, r: 2 }, { x: 136, y: 130, w: 158, h: 76 }] },
    { keys: ['tisch'], label: 'Bürotisch', rects: [{ x: 320, y: 110, w: 70, h: 8 }], paths: ['M326 118 V200', 'M384 118 V200'] },
    { keys: ['aufzug'], label: 'Aufzugskabine', rects: [{ x: 320, y: 20, w: 60, h: 70, r: 1 }], paths: ['M350 20 V90'] },
    { keys: ['zimmer'], label: 'Hotelzimmer-Set', rects: [{ x: 140, y: 30, w: 60, h: 60 }, { x: 210, y: 60, w: 90, h: 30 }] },
  ],
  badges: [{ k: 'theke', n: 1, x: 215, y: 168 }, { k: 'regal', n: 2, x: 65, y: 82 }, { k: 'aufzug', n: 3, x: 350, y: 55 }, { k: 'zimmer', n: 4, x: 230, y: 45 }, { k: 'tisch', n: 5, x: 355, y: 150 }, { k: 'trennwand', n: 6, x: 60, y: 200 }],
};

const STAIRS = {
  viewBox: '0 0 400 230', parts: [
    { keys: [], label: 'Wand', muted: true, rects: [{ x: 0, y: 0, w: 400, h: 230, r: 0 }] },
    { keys: ['stufe'], label: 'Trittstufen', rects: Array.from({ length: 5 }, (_, i) => ({ x: 20 + i * 44, y: 200 - i * 36, w: 50, h: 8, r: 1 })) },
    { keys: ['setzstufe'], label: 'Setzstufen', rects: Array.from({ length: 5 }, (_, i) => ({ x: 20 + i * 44, y: 208 - i * 36, w: 44, h: 28, r: 0 })) },
    { keys: ['heizkoerper'], label: 'Heizkörper', rects: [{ x: 270, y: 120, w: 110, h: 70, r: 2 }], paths: ['M280 130 V180', 'M300 130 V180', 'M320 130 V180', 'M340 130 V180', 'M360 130 V180'] },
    { keys: ['garderobe'], label: 'Garderobenpaneel', rects: [{ x: 290, y: 20, w: 90, h: 80, r: 2 }], paths: ['M305 40 V48', 'M335 40 V48', 'M365 40 V48'] },
  ],
  badges: [{ k: 'stufe', n: 1, x: 133, y: 132 }, { k: 'setzstufe', n: 2, x: 42, y: 222 }, { k: 'heizkoerper', n: 3, x: 325, y: 200 }, { k: 'garderobe', n: 4, x: 335, y: 80 }],
};

const DRAWINGS = { kitchen: KITCHEN, island: ISLAND, cabinet: CABINET, furniture: FURNITURE, door: DOOR, bath: BATH, wall: WALL, window: WINDOW, counter: COUNTER, stairs: STAIRS };

/**
 * @param kind      Schlüssel aus DRAWINGS (Oberfläche.drawing / Baustein.drawing)
 * @param active    Elementschlüssel, der hervorgehoben wird
 * @param onPick    (elementKey) => void — Tippen auf Teil oder Nummer
 * @param only      optional: nur Badges dieser Elementschlüssel zeigen
 */
export default function Drawing({ kind, active, onPick, only, className = '' }) {
  const d = DRAWINGS[kind] || DRAWINGS.kitchen;
  const badges = only ? d.badges.filter((b) => only.includes(b.k)) : d.badges;
  return (
    <svg viewBox={d.viewBox} className={`w-full h-auto ${className}`} role="img" aria-label="Zeichnung zum Zählen">
      {d.parts.map((p, i) => <Part key={i} part={p} active={active} onPick={onPick} />)}
      {badges.map((b) => <Badge key={b.k + b.n} {...b} on={active === b.k} onPick={onPick} />)}
    </svg>
  );
}

/** Welche Zeichnung ein Element zeigt (Küche: Insel und Extra-Schränke haben eigene). */
export function drawingFor(surface, element) {
  if (element?.addon) {
    const a = (surface.addons || []).find((x) => x.key === element.addon);
    if (a?.drawing) return a.drawing;
  }
  if (surface.key === 'moebel') return 'furniture';
  return surface.drawing;
}

/* Kleine Vorschau-Icons für die Oberflächen-Auswahl. */
export function SurfaceIcon({ kind, className = 'w-14 h-14' }) {
  const stroke = 'stroke-ink';
  const common = { fill: 'none', strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' };
  const icons = {
    kueche: <g className={stroke} {...common}><rect x="4" y="22" width="40" height="18" rx="1" /><path d="M4 22h40M16 22v18M30 22v18M8 14h32v6H8zM18 10h12" /></g>,
    tueren: <g className={stroke} {...common}><rect x="12" y="4" width="24" height="40" rx="1" /><rect x="17" y="9" width="14" height="14" /><circle cx="31" cy="30" r="1.5" /></g>,
    moebel: <g className={stroke} {...common}><rect x="6" y="8" width="36" height="34" rx="1" /><path d="M6 20h36M6 31h36M24 8v34M22 14h4M22 25h4M22 36h4" /></g>,
    bad: <g className={stroke} {...common}><path d="M6 24h36v8a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" /><path d="M10 24V10a4 4 0 0 1 8 0M8 42l-2 4M40 42l2 4" /></g>,
    waende: <g className={stroke} {...common}><rect x="4" y="6" width="40" height="36" /><path d="M4 18h40M4 30h40M18 6v12M30 18v12M18 30v12" /></g>,
    fenster: <g className={stroke} {...common}><rect x="6" y="6" width="36" height="30" rx="1" /><path d="M24 6v30M6 21h36M4 40h40" /></g>,
    gewerbe: <g className={stroke} {...common}><path d="M4 20h40v4H4zM8 24v18h32V24" /><path d="M14 30h8M26 30h8M14 36h8" /><circle cx="36" cy="12" r="4" /></g>,
    sonstiges: <g className={stroke} {...common}><path d="M4 44h10V34h10V24h10V14h10V4" /><path d="M4 44h40" /></g>,
  };
  return <svg viewBox="0 0 48 48" className={className} aria-hidden="true">{icons[kind] || icons.kueche}</svg>;
}

/* Zustandsbilder (Retrena: "Tippe auf das Bild, das deinen Fronten heute am nächsten kommt"). */
export function ConditionIcon({ kind, className = 'w-16 h-20' }) {
  const body = {
    glatt: <><rect x="6" y="4" width="36" height="56" rx="2" className="fill-cream-deep stroke-ink-faint" /><rect x="34" y="28" width="3" height="10" rx="1" className="fill-ink" /></>,
    glanz: <><rect x="6" y="4" width="36" height="56" rx="2" className="fill-cream-deep stroke-ink-faint" /><path d="M14 60 L28 4 M22 60 L36 4" className="stroke-paper" strokeWidth="4" /><rect x="34" y="28" width="3" height="10" rx="1" className="fill-ink" /></>,
    verziert: <><rect x="6" y="4" width="36" height="56" rx="2" className="fill-cream-deep stroke-ink-faint" /><rect x="12" y="10" width="24" height="44" rx="1" fill="none" className="stroke-ink-faint" strokeWidth="2" /><rect x="15" y="13" width="18" height="38" fill="none" className="stroke-ink-faint" /><rect x="36" y="28" width="3" height="10" rx="1" className="fill-ink" /></>,
    beschaedigt: <><rect x="6" y="4" width="36" height="56" rx="2" className="fill-cream-deep stroke-ink-faint" /><path d="M6 44 l6 -4 l4 6 l6 -5 l4 7" fill="none" className="stroke-red-warn" strokeWidth="2" /><path d="M30 8 l5 6 l-3 4" fill="none" className="stroke-red-warn" strokeWidth="2" /><rect x="34" y="28" width="3" height="10" rx="1" className="fill-ink" /></>,
  };
  return <svg viewBox="0 0 48 64" className={className} aria-hidden="true" strokeWidth="1">{body[kind] || body.glatt}</svg>;
}
