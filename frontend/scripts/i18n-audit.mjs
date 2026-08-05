#!/usr/bin/env node
/**
 * node scripts/i18n-audit.mjs [--json]
 *
 * Two questions about every user-facing string in the app:
 *
 *   1. Does every `t('key')` used anywhere exist in all four languages?
 *      A key missing from one falls back to English silently — no error, no
 *      marker, just the wrong language mid-sentence. That is the failure this
 *      catches, and it is invisible to anything that only looks for `key`
 *      shaped text on screen.
 *
 *   2. Is anything user-facing written as a literal instead of a key?
 *      JSX text, and the attributes that reach a person: placeholder, title,
 *      aria-label, alt.
 *
 * Exits non-zero if either finds something, so it can gate a build.
 *
 * It is deliberately noisy rather than clever: a false positive costs a line
 * in an allow-list, a false negative ships English to a German tradesperson.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const SRC = path.join(ROOT, 'src');
const LANGS = ['en', 'de', 'tr', 'es'];

/* Files that legitimately hold no user-facing prose. */
const SKIP_FILES = [
  /\/translations\//, /\.test\.mjs$/, /\/data\/cities\.js$/,
  /\/setupTests\./, /\/reportWebVitals\./, /\/serviceWorker/,
  /* ProCalendarPage is the marketplace booking calendar. It reads
     /api/bookings, which no router mounts — the endpoint 404s — and nothing
     links to it: the route exists but the nav dropped it. Ten strings there
     are not worth translating on a page that cannot show data. It wants
     deleting, not translating, and that is a call for the product owner
     rather than a silent removal here. */
  /\/pages\/pro\/ProCalendarPage\.jsx$/,
];

/* Strings that are not prose: units, symbols, code, brand names, and the
   handful of words that are the same in all four languages anyway. */
/* `a > b && c < d` inside a JSX expression looks exactly like text between
   two tags. Anything carrying an operator is code, not a sentence. */
const LOOKS_LIKE_CODE = /(&&|\|\||=>|===|!==|<=|>=|\?\.|\+\+|\bnull\b|\bundefined\b|[{}();]|\w\.\w+\(|^[=!<>+\-*/]|[=!<>+\-*/]$)/;

/* Things that are the same in every language, and things that are examples
   rather than copy. A placeholder reading "Max Mustermann" is showing the
   shape of an answer, not addressing the reader; translating the brand or
   the OpenStreetMap attribution would be wrong outright. */
const ALLOWED = new Set([
  'OpenStreetMap', 'DATEV EXTF v700', 'Kleinunternehmer', 'Market',
  'Weber Installations', 'Weber Installations GmbH', 'Mariahilfer Straße 12',
  'Hauptstraße 12', 'Markus Weber', 'Max Mustermann', 'Anna Müller',
  'Erste Bank', 'Baumarkt', 'Wien', 'Vienna 1010, Vienna 1020, ...',
  'AT12 3456 7890 1234 5678', 'Homeowner:', 'Pro:',
  'JPG / PNG / WebP / PDF · max 10 MB',
  // a worked example of a pasted enquiry, shown so the pro sees the shape
  'Name: Maria Gruber\\nTel: +43 664 1112233\\nBetreff: Bad sanieren\\n1210 Wien',
]);

const NOT_PROSE = [
  /^[\s\d\W]*$/,                       // punctuation, numbers, symbols only
  /^[a-z][a-zA-Z0-9]*$/,               // single lowerCamel token — a value, not a sentence
  /^[A-Z][A-Z0-9_]*$/,                 // SCREAMING_CASE
  /^(ServiceMarket|PRO|Pro|EUR|€|USD|IBAN|BIC|UID|ATU|PDF|CSV|SMS|E-Mail|Email|OK)$/,
  /^(https?:|mailto:|tel:|sms:|\/|\.|#)/,
  /^[\w.-]+@[\w.-]+$/,                 // an address
  /^\d+(\.\d+)?\s*(px|%|em|rem|ms|s|kg|m²|h|min)$/,
];

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(f);
  }
  return out;
};

const rel = (f) => path.relative(ROOT, f);

/* Who reads the file. Not every literal is equally wrong: an admin console
   is read by the operator, and a privacy policy is a legal instrument whose
   translation is a lawyer's call, not a developer's. The tradesperson- and
   customer-facing screens are the ones that must be complete. */
const audience = (f) => (/\/(pages|components)\/admin\//.test(f) ? 'admin'
  : /\/pages\/legal\//.test(f) ? 'legal'
  : 'app');
const files = walk(SRC).filter((f) => !SKIP_FILES.some((r) => r.test(f)));

// ── 1. key coverage ─────────────────────────────────────────────────────
const trSrc = fs.readFileSync(path.join(SRC, 'translations', 'index.js'), 'utf8');
const blocks = {};
for (const l of LANGS) {
  const i = trSrc.indexOf(`\n  ${l}: {`);
  const j = trSrc.indexOf('\n  },', i);
  if (i < 0 || j < 0) { console.error(`cannot find the ${l} block`); process.exit(2); }
  blocks[l] = trSrc.slice(i, j);
}
const topLevelKeys = (block) => {
  const keys = new Set();
  let depth = 0, inStr = null;
  for (let i = 0; i < block.length; i += 1) {
    const c = block[i];
    if (inStr) { if (c === '\\') i += 1; else if (c === inStr) inStr = null; continue; }
    // Comments hold prose, and prose holds things that look like `word:`.
    if (c === '/' && block[i + 1] === '/') { i = block.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && block[i + 1] === '*') { i = block.indexOf('*/', i) + 1; if (i < 1) break; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{' || c === '[') { depth += 1; continue; }
    if (c === '}' || c === ']') { depth -= 1; continue; }
    // depth 1 is the language object itself; anything deeper is a nested value
    if (depth === 1 && /[a-z]/.test(c)) {
      const m = /^([a-z][a-z0-9_]*)\s*:/.exec(block.slice(i));
      if (m) { keys.add(m[1]); i += m[0].length - 1; }
    }
  }
  return keys;
};
const declared = Object.fromEntries(LANGS.map((l) => [l, topLevelKeys(blocks[l])]));

const used = new Map();                       // key -> [files]
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*['"`]([a-z][a-z0-9_]*)['"`]/g)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(rel(f));
  }
}

const missing = [];
for (const [key, where] of used) {
  const absent = LANGS.filter((l) => !declared[l].has(key));
  if (absent.length) missing.push({ key, absent, files: [...where].slice(0, 3) });
}

/* Keys present in English but not in one of the others — these are the silent
   fallbacks, whether or not anything currently uses them. */
const partial = [];
for (const key of declared.en) {
  const absent = LANGS.filter((l) => l !== 'en' && !declared[l].has(key));
  if (absent.length) partial.push({ key, absent });
}

// ── 2. hardcoded prose ──────────────────────────────────────────────────
const isProse = (s) => {
  const v = s.trim();
  if (v.length < 2) return false;
  if (ALLOWED.has(v)) return false;
  if (NOT_PROSE.some((r) => r.test(v))) return false;
  if (LOOKS_LIKE_CODE.test(v)) return false;
  if (!/[a-zA-ZäöüÄÖÜß]{2}/.test(v)) return false;
  // a sentence, or two or more words, or one capitalised word of real length
  return /\s/.test(v) || /^[A-ZÄÖÜ]/.test(v);
};

const hardcoded = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const at = { file: rel(f), line: i + 1, audience: audience(rel(f)) };
    // user-facing attributes carrying a literal
    for (const m of line.matchAll(/\b(placeholder|title|aria-label|alt)\s*=\s*"([^"]{2,})"/g)) {
      if (isProse(m[2])) hardcoded.push({ ...at, kind: m[1], text: m[2] });
    }
    for (const m of line.matchAll(/\b(placeholder|title|aria-label|alt)\s*=\s*\{\s*'([^']{2,})'\s*\}/g)) {
      if (isProse(m[2])) hardcoded.push({ ...at, kind: m[1], text: m[2] });
    }
    // JSX text between tags on one line: >Some words<
    for (const m of line.matchAll(/>\s*([^<>{}\n][^<>{}\n]*?)\s*</g)) {
      if (isProse(m[1])) hardcoded.push({ ...at, kind: 'text', text: m[1] });
    }
  });
}

// ── report ──────────────────────────────────────────────────────────────
const json = process.argv.includes('--json');
if (json) {
  console.log(JSON.stringify({ missing, partial, hardcoded }, null, 1));
} else {
  console.log(`scanned ${files.length} files · ${used.size} keys used · `
    + `${declared.en.size} declared in en\n`);

  console.log(`── keys used but missing in some language: ${missing.length} ──`);
  missing.slice(0, 40).forEach((m) =>
    console.log(`  ${m.key}  missing in ${m.absent.join(',')}  (${m.files.join(', ')})`));
  if (missing.length > 40) console.log(`  … ${missing.length - 40} more`);

  console.log(`\n── declared in en but not everywhere: ${partial.length} ──`);
  partial.slice(0, 40).forEach((m) => console.log(`  ${m.key}  missing in ${m.absent.join(',')}`));
  if (partial.length > 40) console.log(`  … ${partial.length - 40} more`);

  for (const aud of ['app', 'admin', 'legal']) {
    const list = hardcoded.filter((h) => h.audience === aud);
    const byFile = {};
    list.forEach((h) => { (byFile[h.file] ||= []).push(h); });
    const ranked = Object.entries(byFile).sort((a, z) => z[1].length - a[1].length);
    console.log(`\n── hardcoded [${aud}]: ${list.length} in ${ranked.length} files ──`);
    ranked.slice(0, 20).forEach(([f, l]) => {
      console.log(`  ${f}  (${l.length})`);
      if (aud === 'app') l.slice(0, 5).forEach((h) =>
        console.log(`      ${h.line}: [${h.kind}] ${h.text.slice(0, 66)}`));
    });
    if (ranked.length > 20) console.log(`  … ${ranked.length - 20} more files`);
  }
}

/* Only the app-facing literals fail the run. Admin and legal are reported so
   they cannot be forgotten, but gating on them would mean the check is
   permanently red and therefore permanently ignored. */
const blocking = missing.length + partial.length
  + hardcoded.filter((h) => h.audience === 'app').length;
process.exit(blocking ? 1 : 0);
