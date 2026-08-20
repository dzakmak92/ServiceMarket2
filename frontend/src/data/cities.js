/**
 * Towns to pick from during onboarding — Austria and Germany.
 *
 * Names only, deliberately. Coordinates are never written down here: they
 * come either from the device (the pro taps "use my location") or from
 * geocoding the chosen name server-side. A hand-written coordinate table
 * would be a hundred chances to put someone's business in the wrong valley,
 * and nothing on the weather card would say so.
 *
 * Ordered roughly by population, largest first, so the towns most pros are
 * in appear before any typing. This is a curated list, not an import of an
 * official municipal register — it covers the large towns and cities, and
 * everything it misses is reachable through "add your own", which is a
 * first-class path rather than a fallback.
 */

// `vat` is the standard rate, shown while choosing so the pro sees what the
// choice does to their prices. It is a label only — the rate that actually
// lands on a quote comes from the server (backend/services/tax_rules.py),
// which also knows about Kleinunternehmer and reduced rates.
export const COUNTRIES = [
  { code: 'AT', name: 'Österreich', flag: '🇦🇹', dial: '+43', vat: 20 },
  { code: 'DE', name: 'Deutschland', flag: '🇩🇪', dial: '+49', vat: 19 },
];

const AT = [
  'Wien', 'Graz', 'Linz', 'Salzburg', 'Innsbruck', 'Klagenfurt', 'Villach',
  'Wels', 'Sankt Pölten', 'Dornbirn', 'Wiener Neustadt', 'Steyr', 'Feldkirch',
  'Bregenz', 'Leonding', 'Klosterneuburg', 'Baden', 'Wolfsberg', 'Leoben',
  'Krems an der Donau', 'Traun', 'Amstetten', 'Lustenau', 'Kapfenberg',
  'Mödling', 'Hallein', 'Kufstein', 'Traiskirchen', 'Schwechat',
  'Braunau am Inn', 'Stockerau', 'Saalfelden', 'Ansfelden', 'Tulln',
  'Hohenems', 'Spittal an der Drau', 'Telfs', 'Ternitz', 'Perchtoldsdorf',
  'Bludenz', 'Bad Ischl', 'Eisenstadt', 'Rankweil', 'Marchtrenk',
  'Gänserndorf', 'Zwettl', 'Korneuburg', 'Götzis', 'Enns', 'Schwaz',
  'Hall in Tirol', 'Neunkirchen', 'Vöcklabruck', 'Gmunden', 'Feldkirchen',
  'Judenburg', 'Knittelfeld', 'Ried im Innkreis', 'Bruck an der Mur', 'Imst',
];

const DE = [
  'Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt am Main', 'Stuttgart',
  'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden',
  'Hannover', 'Nürnberg', 'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld',
  'Bonn', 'Münster', 'Mannheim', 'Karlsruhe', 'Augsburg', 'Wiesbaden',
  'Mönchengladbach', 'Gelsenkirchen', 'Braunschweig', 'Chemnitz', 'Kiel',
  'Aachen', 'Halle (Saale)', 'Magdeburg', 'Freiburg im Breisgau', 'Krefeld',
  'Lübeck', 'Oberhausen', 'Erfurt', 'Mainz', 'Rostock', 'Kassel', 'Hagen',
  'Hamm', 'Saarbrücken', 'Mülheim an der Ruhr', 'Potsdam',
  'Ludwigshafen am Rhein', 'Oldenburg', 'Leverkusen', 'Osnabrück', 'Solingen',
  'Heidelberg', 'Herne', 'Neuss', 'Darmstadt', 'Paderborn', 'Regensburg',
  'Ingolstadt', 'Würzburg', 'Fürth', 'Wolfsburg', 'Offenbach am Main', 'Ulm',
  'Heilbronn', 'Pforzheim', 'Göttingen', 'Bottrop', 'Trier', 'Recklinghausen',
  'Reutlingen', 'Bremerhaven', 'Koblenz', 'Bergisch Gladbach', 'Jena',
  'Remscheid', 'Erlangen', 'Moers', 'Siegen', 'Hildesheim', 'Salzgitter',
  'Cottbus', 'Kaiserslautern', 'Gütersloh', 'Schwerin', 'Witten', 'Gera',
  'Iserlohn', 'Ludwigsburg', 'Hanau', 'Esslingen am Neckar', 'Zwickau',
  'Düren', 'Ratingen', 'Tübingen', 'Flensburg', 'Gießen',
  'Villingen-Schwenningen', 'Konstanz', 'Worms', 'Marburg', 'Minden',
  'Norderstedt', 'Delmenhorst', 'Bamberg', 'Viersen', 'Rheine', 'Lünen',
  'Dessau-Roßlau', 'Troisdorf', 'Castrop-Rauxel', 'Bayreuth', 'Aschaffenburg',
  'Brandenburg an der Havel', 'Fulda', 'Lippstadt', 'Kempten', 'Landshut',
  'Neubrandenburg', 'Rosenheim', 'Herford', 'Wolfenbüttel', 'Sindelfingen',
];

export const CITIES = { AT, DE };

/** Fold the umlauts and the ß so "Munchen" and "Muenchen" both find München. */
export const fold = (s) => (s || '')
  .toLowerCase()
  .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
  .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
  .replace(/[^a-z0-9]/g, '');

/**
 * Towns in `country` matching `query`, best first.
 *
 * A town whose name starts with what was typed comes before one that merely
 * contains it, so "Bre" offers Bremen before Bremerhaven and never buries
 * Berlin under a longer name that happens to contain the letters.
 */
export function searchCities(country, query, limit = 8) {
  const list = CITIES[country] || [];
  const q = fold(query);
  if (!q) return list.slice(0, limit);
  const starts = [];
  const contains = [];
  for (const city of list) {
    const f = fold(city);
    if (f.startsWith(q)) starts.push(city);
    else if (f.includes(q)) contains.push(city);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Is this exactly a town we already list? Used to decide whether to offer
 *  "add it anyway" — offering that for a name already in the list would be
 *  asking the pro to choose between two identical things. */
export function isKnownCity(country, name) {
  const f = fold(name);
  return (CITIES[country] || []).some((c) => fold(c) === f);
}
