/**
 * Folierungs-Katalog: was foliert wird, womit, und was der Untergrund verlangt.
 *
 * Drei Listen, alle rein deklarativ, damit die Preis-Engine (`pricing.js`)
 * und die Zeichnungen (`Drawings.jsx`) dieselbe Quelle lesen:
 *
 *  - SURFACES   die Oberflächen-Welten (Küche, Türen, Möbel, Bad, …) mit ihren
 *               zählbaren Elementen. Jedes Element trägt Fläche, Kantenlänge
 *               und Stunden *pro Einheit* — Zeit ist die Primitive, nicht der
 *               Preis (siehe memory/ESTIMATION_CATALOGUE.md, Regel 1).
 *  - DECORS     die Dekorfamilien, wie Coverstyl' sie sortiert. EK/VK pro m²
 *               stehen NICHT hier, sondern in den Preiseinstellungen
 *               (`store.js` → `settings.decors`), weil sie dem Betrieb gehören.
 *  - SUBSTRATES der Untergrund, aus dem die Primer-Empfehlung folgt. Das ist
 *               der Teil, den kein öffentlicher Rechner hat und der auf der
 *               Baustelle entscheidet, ob die Folie in zwei Jahren noch hält.
 *
 * Alle Texte deutsch: das Werkzeug richtet sich an den deutschsprachigen
 * Endkunden und an einen Betrieb, der mit Endkunden deutsch spricht.
 */

/* ── Elemente ─────────────────────────────────────────────────────────────
 * unit     'stk' | 'm' | 'm2'
 * area     m² Folienfläche je Einheit (netto, ohne Verschnitt)
 * edge     lfm Kante je Einheit (für Kantenprimer und Umschlag)
 * hours    Arbeitsstunden je Einheit bei glattem, sauberem Untergrund
 * portable true = kann demontiert und in der Werkstatt foliert werden
 *          (Hol- & Bring-Service); false = wird immer vor Ort gemacht
 * step     Nummer in der Zeichnung
 * rule     die Zählregel, die unter der Zeichnung steht
 */
const el = (key, label, o) => ({ key, label, unit: 'stk', default: 0, portable: true, ...o });

const KITCHEN_ELEMENTS = [
  el('fronten', 'Fronten', { step: 1, rule: 'Jede Tür, Schublade und Klappe zählt einzeln.', area: 0.42, edge: 2.6, hours: 0.45, default: 16 }),
  el('platte', 'Arbeitsplatte', { step: 2, unit: 'm', rule: 'Vorn an der Kante gemessen, in Metern. Nicht folieren? Dann 0.', area: 0.85, edge: 1.4, hours: 0.9, default: 5, portable: false, stepSize: 0.5 }),
  el('ausschnitte', 'Ausschnitte in der Platte', { step: 3, rule: 'Spüle und Kochfeld sind meist 2.', area: 0, edge: 2.0, hours: 0.35, default: 1, portable: false }),
  el('nische', 'Nischenrückwand', { step: 4, unit: 'm', rule: 'Dein Fliesenspiegel zwischen Platte und Oberschränken, in Metern.', area: 0.6, edge: 0.4, hours: 0.6, default: 0, portable: false, stepSize: 0.5 }),
  el('sockel', 'Sockelleiste', { step: 5, unit: 'm', rule: 'Die Leiste ganz unten zwischen Schrank und Boden, in Metern.', area: 0.16, edge: 0.3, hours: 0.15, default: 5, stepSize: 0.5 }),
  el('blenden', 'Blenden', { step: 6, rule: 'Schmale Leisten in Lücken, nur wenige Zentimeter breit.', area: 0.1, edge: 1.2, hours: 0.2, default: 0 }),
  el('seiten', 'Sichtbare Schrankseiten', { step: 7, rule: 'Die freie Seite eines Schranks, so tief wie der Schrank.', area: 0.55, edge: 2.4, hours: 0.5, default: 2, portable: false }),
  el('regal', 'Offene Regalfächer', { step: 8, rule: 'Fächer ohne Tür, jedes Fach zählt einzeln.', area: 0.3, edge: 1.6, hours: 0.5, default: 0, portable: false }),
];

export const SURFACES = [
  {
    key: 'kueche', label: 'Küche', short: 'Küche',
    tagline: 'Fronten, Arbeitsplatte, Nische, Sockel',
    drawing: 'kitchen',
    intro: 'Zähl alles, was an den Wänden deiner Küche steht: Fronten zählen, Längen schätzen. Was nicht foliert werden soll, stellst du auf 0.',
    /* Formvorwahl, wie bei Retrena: setzt nur Startwerte, zählen muss man trotzdem. */
    shapes: [
      { key: 'zeile', label: 'Küchenzeile', hint: 'eine Reihe an einer Wand · ca. 8–12 Fronten', preset: { fronten: 10, platte: 3, sockel: 3, seiten: 1 } },
      { key: 'l', label: 'L-Form', hint: 'zwei Wände über Eck · ca. 14–18 Fronten', preset: { fronten: 16, platte: 5, sockel: 5, seiten: 2 } },
      { key: 'u', label: 'U-Form / groß', hint: 'drei Wände oder zwei Reihen gegenüber · ab 20 Fronten', preset: { fronten: 22, platte: 7, sockel: 7, seiten: 2 } },
    ],
    elements: KITCHEN_ELEMENTS,
    /* Bausteine mit eigenem Zählschritt (Retrena: "Jeder Baustein bekommt einen eigenen Schritt"). */
    addons: [
      { key: 'insel', label: 'Kücheninsel', hint: 'freistehender Block mit Platte', drawing: 'island',
        elements: [
          el('insel_fronten', 'Insel-Fronten', { step: 1, rule: 'Türen und Schubladen der Insel, beide Seiten.', area: 0.42, edge: 2.6, hours: 0.45, default: 6 }),
          el('insel_platte', 'Inselplatte', { step: 2, unit: 'm', rule: 'Länge der Platte, in Metern. Alle vier Kanten sind sichtbar.', area: 1.1, edge: 2.2, hours: 1.2, default: 2, portable: false, stepSize: 0.5 }),
          el('insel_seiten', 'Insel-Sichtseiten', { step: 3, rule: 'Die Rückwand und beide Stirnseiten, wenn sie frei stehen.', area: 0.7, edge: 2.8, hours: 0.6, default: 3, portable: false }),
        ] },
      { key: 'extra', label: 'Extra-Schränke', hint: 'Buffet, Schrankwand, Vorratsschrank: Schränke, die nicht an die Küche anschließen', drawing: 'cabinet',
        elements: [
          el('extra_fronten', 'Fronten', { step: 1, rule: 'Jede Tür und Schublade.', area: 0.42, edge: 2.6, hours: 0.45, default: 4 }),
          el('extra_seiten', 'Sichtseiten', { step: 2, rule: 'Freie Seiten und Oberboden, wenn man sie sieht.', area: 0.55, edge: 2.4, hours: 0.5, default: 1, portable: false }),
        ] },
    ],
  },
  {
    key: 'tueren', label: 'Türen & Zargen', short: 'Türen',
    tagline: 'Zimmertüren, Zargen, Haustür innen',
    drawing: 'door',
    intro: 'Eine Tür ist Blatt plus Zarge. Zähl beides getrennt, weil die Zarge vor Ort gemacht wird und das Blatt auch in der Werkstatt sein kann.',
    elements: [
      el('blatt_1', 'Türblatt, eine Seite', { step: 1, rule: 'Nur die Seite zum Flur oder zum Raum.', area: 1.7, edge: 5.6, hours: 1.4, default: 4 }),
      el('blatt_2', 'Türblatt, beide Seiten', { step: 1, rule: 'Beide Seiten plus die Kanten.', area: 3.6, edge: 5.6, hours: 2.6, default: 0 }),
      el('zarge', 'Zarge mit Bekleidung', { step: 2, rule: 'Rahmen plus beide Zierbekleidungen, pro Tür.', area: 1.1, edge: 11, hours: 1.6, default: 4, portable: false }),
      el('glas', 'Glasausschnitt', { step: 3, rule: 'Jeder Ausschnitt im Blatt; die Folie wird innen sauber umgeschlagen.', area: 0, edge: 2.4, hours: 0.4, default: 0 }),
      el('haustuer', 'Haustür innen', { step: 4, rule: 'Innenseite der Haustür, ohne Rahmen.', area: 2.4, edge: 6.4, hours: 2.2, default: 0, portable: false }),
    ],
  },
  {
    key: 'moebel', label: 'Möbel & Schränke', short: 'Möbel',
    tagline: 'Schrankwand, Kommode, Tisch, Regal',
    drawing: 'cabinet',
    intro: 'Möbel werden wie eine Küche gezählt: Fronten einzeln, Sichtseiten einzeln, Platten in Metern.',
    elements: [
      el('fronten', 'Fronten', { step: 1, rule: 'Jede Tür und Schublade.', area: 0.42, edge: 2.6, hours: 0.45, default: 6 }),
      el('seiten', 'Sichtseiten', { step: 2, rule: 'Freie Korpusseiten und Oberböden.', area: 0.55, edge: 2.4, hours: 0.5, default: 2, portable: false }),
      el('tisch', 'Tischplatte', { step: 3, unit: 'm2', rule: 'Länge mal Breite in Quadratmetern; die Kante kommt automatisch dazu.', area: 1.0, edge: 4.0, hours: 1.3, default: 0, stepSize: 0.25 }),
      el('regal', 'Regalböden', { step: 4, rule: 'Jeder Boden, Oberseite plus Vorderkante.', area: 0.3, edge: 1.2, hours: 0.35, default: 0 }),
      el('bett', 'Bettgestell / Kopfteil', { step: 5, rule: 'Kopfteil und sichtbare Seiten als ein Stück.', area: 2.0, edge: 6.0, hours: 2.0, default: 0 }),
    ],
  },
  {
    key: 'bad', label: 'Badezimmer', short: 'Bad',
    tagline: 'Fliesen, Badmöbel, Waschtisch, Wannenschürze',
    drawing: 'bath',
    intro: 'Im Bad zählt die Fläche. Fliesen in Quadratmetern, Möbel wie in der Küche. Fugen werden vorher gefüllt, das rechnet der Primer-Vorschlag mit.',
    elements: [
      el('fliesen', 'Wandfliesen', { step: 1, unit: 'm2', rule: 'Höhe mal Breite der Fliesenfläche, Fenster und Türen abziehen.', area: 1.0, edge: 0.8, hours: 1.1, default: 6, portable: false, stepSize: 0.5 }),
      el('fronten', 'Badmöbel-Fronten', { step: 2, rule: 'Jede Tür und Schublade von Waschtisch- und Hochschrank.', area: 0.35, edge: 2.2, hours: 0.45, default: 4 }),
      el('waschtisch', 'Waschtischplatte', { step: 3, unit: 'm', rule: 'Vorn an der Kante gemessen, in Metern.', area: 0.7, edge: 1.4, hours: 0.9, default: 1, portable: false, stepSize: 0.5 }),
      el('schuerze', 'Badewannenschürze', { step: 4, unit: 'm2', rule: 'Länge mal Höhe der Verkleidung.', area: 1.0, edge: 2.0, hours: 1.0, default: 0, portable: false, stepSize: 0.25 }),
      el('dusche', 'Duschrückwand', { step: 5, unit: 'm2', rule: 'Nur glatte, trockene Flächen außerhalb des Spritzbereichs der Fugen.', area: 1.0, edge: 1.5, hours: 1.2, default: 0, portable: false, stepSize: 0.25 }),
    ],
  },
  {
    key: 'waende', label: 'Wände & Decken', short: 'Wände',
    tagline: 'Glatte Wandflächen, Paneele, Säulen',
    drawing: 'wall',
    intro: 'Architekturfolie braucht einen glatten, tragfähigen Grund. Raufaser und Putz werden vorher gespachtelt und geschliffen; der Primer-Vorschlag sagt dir, wie viel.',
    elements: [
      el('wand', 'Wandfläche', { step: 1, unit: 'm2', rule: 'Höhe mal Breite, Öffnungen abziehen.', area: 1.0, edge: 0.6, hours: 0.5, default: 10, portable: false, stepSize: 0.5 }),
      el('paneel', 'Wandpaneele', { step: 2, rule: 'Jedes Paneel einzeln, Stöße werden mitfoliert.', area: 0.6, edge: 2.0, hours: 0.4, default: 0 }),
      el('saeule', 'Säulen / Vorsprünge', { step: 3, unit: 'm', rule: 'Höhe in Metern, Umfang bis 1,2 m.', area: 1.2, edge: 2.4, hours: 1.0, default: 0, portable: false, stepSize: 0.5 }),
      el('decke', 'Deckenfläche', { step: 4, unit: 'm2', rule: 'Nur glatte Decken; Arbeit über Kopf dauert länger.', area: 1.0, edge: 0.4, hours: 0.8, default: 0, portable: false, stepSize: 0.5 }),
    ],
  },
  {
    key: 'fenster', label: 'Fenster & Rahmen', short: 'Fenster',
    tagline: 'Kunststofffenster, Fensterbänke, Rollladenkästen',
    drawing: 'window',
    intro: 'Weiße Kunststofffenster werden innen anthrazit oder Holzoptik. Gezählt wird pro Flügel und Rahmen in Metern.',
    elements: [
      el('fluegel', 'Fensterflügel innen', { step: 1, rule: 'Jeder bewegliche Flügel, innen rundum.', area: 0.5, edge: 4.0, hours: 1.0, default: 4, portable: false }),
      el('rahmen', 'Blendrahmen', { step: 2, unit: 'm', rule: 'Umfang des Rahmens innen, in Metern.', area: 0.12, edge: 2.0, hours: 0.35, default: 16, portable: false, stepSize: 0.5 }),
      el('bank', 'Fensterbank', { step: 3, unit: 'm', rule: 'Länge der Bank, Vorderkante kommt dazu.', area: 0.3, edge: 1.2, hours: 0.5, default: 4, portable: false, stepSize: 0.5 }),
      el('rollo', 'Rollladenkasten / Blende', { step: 4, unit: 'm', rule: 'Sichtbare Blende, in Metern.', area: 0.3, edge: 1.0, hours: 0.5, default: 0, portable: false, stepSize: 0.5 }),
    ],
  },
  {
    key: 'gewerbe', label: 'Gewerbe & Objekt', short: 'Objekt',
    tagline: 'Theke, Ladenbau, Aufzug, Hotelzimmer, Büro',
    drawing: 'counter',
    intro: 'Objekte werden nach Fläche und Stück gerechnet; bei Hotels und Büros in Räumen. Nacht- und Wochenendarbeit kommt als Zuschlag dazu.',
    elements: [
      el('theke', 'Theke / Empfang', { step: 1, unit: 'm', rule: 'Front plus Oberseite, Länge in Metern.', area: 1.6, edge: 3.0, hours: 1.6, default: 3, portable: false, stepSize: 0.5 }),
      el('regal', 'Ladenregale / Warenträger', { step: 2, rule: 'Jedes Regalmodul als Stück.', area: 1.5, edge: 5.0, hours: 1.2, default: 0 }),
      el('aufzug', 'Aufzugskabine', { step: 3, unit: 'm2', rule: 'Wandfläche innen, Türen dazu.', area: 1.0, edge: 1.2, hours: 1.4, default: 0, portable: false, stepSize: 0.5 }),
      el('zimmer', 'Hotel-/Pflegezimmer, Möbelset', { step: 4, rule: 'Schrank, Schreibtisch, Nachttische, Kopfteil je Zimmer.', area: 7.0, edge: 24, hours: 6.0, default: 0, portable: false }),
      el('tisch', 'Bürotische', { step: 5, rule: 'Platte plus Kante, Standardmaß 160 × 80.', area: 1.3, edge: 4.8, hours: 1.2, default: 0 }),
      el('trennwand', 'Trennwände / Paneele', { step: 6, unit: 'm2', rule: 'Fläche in Quadratmetern.', area: 1.0, edge: 0.8, hours: 0.6, default: 0, portable: false, stepSize: 0.5 }),
    ],
  },
  {
    key: 'sonstiges', label: 'Treppe, Heizkörper & mehr', short: 'Mehr',
    tagline: 'Treppenstufen, Heizkörper, Garderobe, Fensterbank',
    drawing: 'stairs',
    intro: 'Was sonst nirgends reinpasst. Treppen zählen pro Stufe, Heizkörper pro Stück.',
    elements: [
      el('stufe', 'Trittstufe', { step: 1, rule: 'Jede Trittstufe, Vorderkante inklusive.', area: 0.35, edge: 2.2, hours: 0.6, default: 0, portable: false }),
      el('setzstufe', 'Setzstufe', { step: 2, rule: 'Das senkrechte Brett zwischen zwei Stufen.', area: 0.18, edge: 1.0, hours: 0.3, default: 0, portable: false }),
      el('heizkoerper', 'Heizkörper (Flachheizkörper)', { step: 3, rule: 'Nur die glatte Frontplatte, ohne Rippen.', area: 0.8, edge: 3.0, hours: 1.0, default: 0 }),
      el('garderobe', 'Garderobenpaneel', { step: 4, rule: 'Jedes Paneel, mit Haken demontiert.', area: 0.8, edge: 3.2, hours: 0.8, default: 0 }),
    ],
  },
];

export const surfaceByKey = (key) => SURFACES.find((s) => s.key === key) || SURFACES[0];

/** Alle Elemente einer Oberfläche inklusive der aktivierten Bausteine. */
export function activeElements(surface, addonKeys = [], extraSurfaces = []) {
  const own = surface.elements.map((e) => ({ ...e, rawKey: e.key, surfaceKey: surface.key }));
  const extra = (surface.addons || [])
    .filter((a) => addonKeys.includes(a.key))
    .flatMap((a) => a.elements.map((e) => ({ ...e, rawKey: e.key, surfaceKey: surface.key, addon: a.key })));
  /* Weitere Bereiche im selben Auftrag (Küche + Türen + Möbel). Die Schlüssel
     werden mit dem Bereich vorangestellt, weil `fronten` in Küche, Möbel und
     Bad dasselbe Wort für drei verschiedene Teile ist. */
  const more = extraSurfaces
    .filter((k) => k !== surface.key)
    .map((k) => SURFACES.find((x) => x.key === k)).filter(Boolean)
    .flatMap((sf) => sf.elements.map((e) => ({ ...e, rawKey: e.key, key: `${sf.key}:${e.key}`, surfaceKey: sf.key, addon: `surface:${sf.key}` })));
  return [...own, ...extra, ...more];
}

/* ── Standardmaße ────────────────────────────────────────────────────────
 * Küchenfronten nach dem 32er-Raster, wie sie die Hersteller liefern. Die
 * Höhe trägt den Namen, den der Monteur benutzt; die Breite ist die
 * Korpusbreite minus 4 mm Fuge.
 */
export const FRONT_WIDTHS = [146, 196, 296, 396, 446, 496, 596, 796, 896, 996, 1196];
export const FRONT_HEIGHTS = [
  { h: 140, label: 'Schublade 140' }, { h: 283, label: 'Schublade 283' }, { h: 356, label: 'Auszug 356' },
  { h: 428, label: 'Klappe 428' }, { h: 570, label: 'Tür 570' }, { h: 716, label: 'Tür 716' }, { h: 900, label: 'Tür 900' },
  { h: 1300, label: 'Halbhoch 1300' }, { h: 1600, label: 'Hoch 1600' }, { h: 1950, label: 'Hoch 1950' }, { h: 2100, label: 'Hoch 2100' },
];
export const THICKNESSES = [16, 18, 19, 22, 25, 28, 38, 40];

/* ── Zustand der Fronten heute ───────────────────────────────────────────
 * Retrena fragt das als Bild ab. `factor` ist ein Aufschlag auf die Arbeits-
 * stunden, nicht auf den Preis; `prep` sind Zusatzstunden je m² Vorarbeit.
 */
export const CONDITIONS = [
  { key: 'glatt', label: 'Matt & glatt', hint: 'ebene Fläche ohne Glanz', factor: 1.0, prep: 0, badge: 'Standardpreis' },
  { key: 'glanz', label: 'Hochglanz oder Struktur', hint: 'glänzende oder fühlbar geprägte Fläche', factor: 1.1, prep: 0.1, badge: '+10 %' },
  { key: 'verziert', label: 'Mit Verzierung', hint: 'Landhausstil, Rahmen oder Rillen in der Front', factor: 1.3, prep: 0.15, badge: '+30 %' },
  { key: 'beschaedigt', label: 'Beschädigt / abgeplatzt', hint: 'Kanten gequollen, Lack abgeplatzt, Löcher', factor: 1.2, prep: 0.3, badge: '+20 % und Spachtel' },
];

/* ── Untergrund → Primer ────────────────────────────────────────────────
 * primer   'none' | 'edges' | 'full' | 'full2'   (full2 = zwei Aufträge)
 * product  welcher Primer: 'standard' (Coverstyl' Primer / 3M Primer 94)
 *          oder 'plastic' (Kunststoffprimer für PVC/PP)
 * prep     Vorarbeiten mit Stunden je m² und Verbrauchsmaterial je m²
 * note     was dem Kunden gesagt wird
 * ok       false = nicht folierbar, Hinweis statt Preis
 */
export const SUBSTRATES = [
  { key: 'melamin', label: 'Melamin / Laminat (Standard-Küchenfront)', primer: 'edges', product: 'standard',
    prep: [{ key: 'reinigen', label: 'Reinigen & entfetten', hours: 0.05, consumable: 'reiniger', qty: 0.02 }],
    note: 'Glatte Melaminfronten brauchen Primer nur an den Kanten. Die Fläche wird entfettet.' },
  { key: 'lack', label: 'Lackiert, matt oder seidenmatt', primer: 'edges', product: 'standard',
    prep: [{ key: 'reinigen', label: 'Reinigen & entfetten', hours: 0.05, consumable: 'reiniger', qty: 0.02 },
           { key: 'anschleifen', label: 'Leicht anschleifen', hours: 0.08, consumable: 'schleifvlies', qty: 0.1 }],
    note: 'Alter Lack wird angeschliffen, damit der Kleber greift. Primer auf allen Kanten.' },
  { key: 'hochglanz', label: 'Hochglanz-Lack oder Acryl', primer: 'edges', product: 'standard',
    prep: [{ key: 'reinigen', label: 'Reinigen & entfetten', hours: 0.05, consumable: 'reiniger', qty: 0.02 },
           { key: 'anschleifen', label: 'Mattieren (Schleifvlies)', hours: 0.12, consumable: 'schleifvlies', qty: 0.15 }],
    note: 'Hochglanz wird vollflächig mattiert. Ohne diesen Schritt löst sich die Folie an den Kanten.' },
  { key: 'holz_lasiert', label: 'Echtholz lasiert / geölt', primer: 'full', product: 'standard',
    prep: [{ key: 'reinigen', label: 'Reinigen & entfetten', hours: 0.05, consumable: 'reiniger', qty: 0.03 },
           { key: 'anschleifen', label: 'Anschleifen', hours: 0.12, consumable: 'schleifvlies', qty: 0.15 },
           { key: 'spachteln', label: 'Poren füllen', hours: 0.15, consumable: 'spachtel', qty: 0.12 }],
    note: 'Geöltes Holz muss vollflächig grundiert werden; offene Poren werden vorher gefüllt.' },
  { key: 'holz_roh', label: 'Rohes Holz / rohe MDF', primer: 'full2', product: 'standard',
    prep: [{ key: 'schleifen', label: 'Schleifen P240', hours: 0.15, consumable: 'schleifvlies', qty: 0.2 },
           { key: 'spachteln', label: 'Füllen & nachschleifen', hours: 0.25, consumable: 'spachtel', qty: 0.25 }],
    note: 'Rohe MDF saugt. Zwei Primer-Aufträge vollflächig, sonst zeichnet sich die Fläche durch.' },
  { key: 'fliesen', label: 'Fliesen mit Fugen', primer: 'full', product: 'standard',
    prep: [{ key: 'reinigen', label: 'Reinigen & entfetten', hours: 0.08, consumable: 'reiniger', qty: 0.04 },
           { key: 'fugen', label: 'Fugen füllen & schleifen', hours: 0.35, consumable: 'fugenfueller', qty: 0.35 }],
    note: 'Fugen werden gefüllt und plan geschliffen, dann vollflächig grundiert. Sonst zeichnet sich jede Fuge ab.' },
  { key: 'metall', label: 'Metall / Edelstahl / Pulverbeschichtung', primer: 'edges', product: 'standard',
    prep: [{ key: 'reinigen', label: 'Entfetten (IPA)', hours: 0.06, consumable: 'reiniger', qty: 0.04 }],
    note: 'Metall braucht vor allem Entfettung. Primer auf den Kanten und an Umschlägen.' },
  { key: 'kunststoff', label: 'Kunststoff (PVC-Fenster, Kunststoffmöbel)', primer: 'full', product: 'plastic',
    prep: [{ key: 'reinigen', label: 'Reinigen & entfetten', hours: 0.06, consumable: 'reiniger', qty: 0.03 }],
    note: 'PVC und PP sind haftkritisch. Vollflächig Kunststoffprimer, nicht der Standardprimer.' },
  { key: 'glas', label: 'Glas', primer: 'none', product: 'standard',
    prep: [{ key: 'reinigen', label: 'Reinigen (IPA)', hours: 0.04, consumable: 'reiniger', qty: 0.02 }],
    note: 'Auf Glas hält die Folie ohne Primer. Nur sauber und fettfrei.' },
  { key: 'altfolie', label: 'Bereits foliert', primer: 'edges', product: 'standard',
    prep: [{ key: 'entfernen', label: 'Alte Folie abziehen & Kleberreste lösen', hours: 0.4, consumable: 'kleberentferner', qty: 0.08 },
           { key: 'reinigen', label: 'Reinigen & entfetten', hours: 0.05, consumable: 'reiniger', qty: 0.03 }],
    note: 'Die alte Folie kommt runter, Kleberreste werden gelöst. Danach wie Melamin.' },
  { key: 'putz_tapete', label: 'Putz / Raufaser / Tapete', primer: 'full2', product: 'standard',
    prep: [{ key: 'spachteln', label: 'Vollflächig spachteln Q3 & schleifen', hours: 0.6, consumable: 'spachtel', qty: 0.9 }],
    note: 'Nur eine glatt gespachtelte Wand ist folierbar. Tapete wird vorher entfernt. Der Spachtelanteil ist der größte Posten.' },
];

export const substrateByKey = (key) => SUBSTRATES.find((s) => s.key === key) || SUBSTRATES[0];

/* Welche Untergründe für welche Oberfläche angeboten werden; der erste ist der Vorschlag. */
export const SUBSTRATES_FOR = {
  kueche: ['melamin', 'lack', 'hochglanz', 'holz_lasiert', 'holz_roh', 'altfolie'],
  tueren: ['lack', 'melamin', 'holz_lasiert', 'holz_roh', 'metall', 'altfolie'],
  moebel: ['melamin', 'lack', 'hochglanz', 'holz_lasiert', 'holz_roh', 'altfolie'],
  bad: ['fliesen', 'melamin', 'lack', 'hochglanz', 'kunststoff', 'glas'],
  waende: ['putz_tapete', 'melamin', 'lack', 'fliesen', 'glas'],
  fenster: ['kunststoff', 'metall', 'lack', 'holz_lasiert'],
  gewerbe: ['melamin', 'lack', 'metall', 'hochglanz', 'kunststoff', 'glas'],
  sonstiges: ['lack', 'metall', 'melamin', 'holz_lasiert', 'holz_roh'],
};

/* ── Dekorfamilien ──────────────────────────────────────────────────────
 * So sortiert Coverstyl' seinen Katalog (Uni, Holz, Stein/Beton, Marmor,
 * Metall, Leder/Textil, Spezial). `swatch` ist ein CSS-Hintergrund als
 * Platzhalter, bis in den Preiseinstellungen ein Musterbild hinterlegt ist.
 * `sample` kann je Familie eine Bild-URL tragen (Coverstyl'-Muster).
 */
export const DECORS = [
  { key: 'uni', label: 'Uni matt', hint: 'Weiß, Grau, Anthrazit, Salbei, Pastell', ek: 14, vk: 34,
    swatch: 'linear-gradient(135deg,#e9e4da 0 50%,#b8b4ad 50%)' },
  { key: 'holz', label: 'Holzoptik', hint: 'Eiche, Nussbaum, Esche, Walnuss, Altholz', ek: 16, vk: 39,
    swatch: 'repeating-linear-gradient(100deg,#b58757 0 6px,#a4794c 6px 9px,#c3996a 9px 17px)' },
  { key: 'stein', label: 'Stein & Beton', hint: 'Beton, Schiefer, Terrazzo, Sandstein', ek: 18, vk: 42,
    swatch: 'radial-gradient(circle at 30% 30%,#9a9a96 0 2px,transparent 3px),radial-gradient(circle at 70% 60%,#7c7c78 0 2px,transparent 3px),#8e8e8a' },
  { key: 'marmor', label: 'Marmor', hint: 'Carrara, Calacatta, Nero Marquina', ek: 19, vk: 44,
    swatch: 'linear-gradient(115deg,#f3f1ee 0 40%,#cfcac3 42%,#f3f1ee 45% 70%,#b9b3ab 72%,#f3f1ee 74%)' },
  { key: 'metall', label: 'Metall', hint: 'Edelstahl gebürstet, Messing, Kupfer, Schwarzstahl', ek: 22, vk: 49,
    swatch: 'repeating-linear-gradient(90deg,#c9ccd0 0 1px,#aeb2b7 1px 2px,#d6d9dc 2px 4px)' },
  { key: 'leder', label: 'Leder & Textil', hint: 'Leder, Leinen, Filz, Rattan', ek: 20, vk: 46,
    swatch: 'radial-gradient(circle,#6c4a35 0 1px,transparent 1.5px) 0 0/6px 6px,#7a5640' },
  { key: 'spezial', label: 'Spezial', hint: 'Supermatt Soft-Touch, 3D-Struktur, Glitter, Tafelfolie', ek: 26, vk: 58,
    swatch: 'linear-gradient(135deg,#2c2f33 0 50%,#43474d 50%)' },
];

/* ── Zubehör & Verbrauchsmaterial ─────────────────────────────────────── */
export const PRIMERS = {
  standard: { key: 'standard', label: "Coverstyl' Primer (alternativ 3M Primer 94)", mlPerM2: 125, mlPerEdgeM: 5, packs: [{ ml: 250, ek: 19 }, { ml: 1000, ek: 58 }] },
  plastic: { key: 'plastic', label: 'Kunststoffprimer (PVC/PP)', mlPerM2: 110, mlPerEdgeM: 6, packs: [{ ml: 250, ek: 24 }, { ml: 1000, ek: 72 }] },
};

export const CONSUMABLES = {
  reiniger: { label: 'Reiniger / IPA', unit: 'l', ek: 9 },
  schleifvlies: { label: 'Schleifvlies', unit: 'Stk', ek: 1.2 },
  spachtel: { label: 'Feinspachtel', unit: 'kg', ek: 4.5 },
  fugenfueller: { label: 'Fugenfüller', unit: 'kg', ek: 5.5 },
  kleberentferner: { label: 'Kleberentferner', unit: 'l', ek: 16 },
};

/* ── Extras, die der Kunde ankreuzt ───────────────────────────────────── */
export const EXTRAS = [
  { key: 'innen', label: 'Innenseiten mitfolieren', hint: 'sichtbar beim Öffnen', pct: 40, appliesTo: 'fronts' },
  { key: 'grifflos', label: 'Grifflose Optik / neue Griffe', hint: 'alte Bohrungen schließen', perFront: 14 },
  { key: 'geraete', label: 'Geräte-Fronten (Geschirrspüler, Kühlschrank)', hint: 'Demontage der Gerätefront', perItem: 35, count: true },
  { key: 'demontage', label: 'Demontage & Wiedermontage durch uns', hint: 'Scharniere, Griffe, Dämpfer', pct: 12, appliesTo: 'labor' },
];

/* Elementschlüssel, die als "Front" gelten (für Innenseiten, Griffe). */
export const FRONT_KEYS = new Set(['fronten', 'insel_fronten', 'extra_fronten', 'blatt_1', 'blatt_2']);

export const TRAVEL_ZONES = [
  { key: '0', label: 'Bis 30 km · inklusive', price: 0 },
  { key: '1', label: '30 – 80 km', price: 60 },
  { key: '2', label: '80 – 150 km', price: 120 },
  { key: '3', label: 'Über 150 km, mit Übernachtung', price: 290 },
];
