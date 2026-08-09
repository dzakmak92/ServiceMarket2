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
import { parse } from '@babel/parser';

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
const LOOKS_LIKE_CODE = /(&&|\|\||=>|===|!==|<=|>=|\?\.|\+\+|\bnull\b|\bundefined\b|[{}();]|\w\.\w+\(|\w\[|^[=!<>+\-*/]|[=!<>+\-*/]$|\w\s[-+*/]\s\w)/;

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

  /* Names and marks. The wordmark is set as `Service<span>Market</span>`, so
     the parser sees each half as its own text node; "Stripe" is the payment
     processor being named, which is a requirement of naming it. */
  'Service', 'ServiceMarket ·', 'ServiceMarket · servicemarket.at', 'Stripe',

  /* Statutory abbreviations on an AT/DE document. "UID" is the VAT
     identification number and "USt" is the VAT itself; both are the wording
     the invoice is legally required to carry, so they stay in German on the
     document however the interface is set — the same reason ÖNORM numbers
     stay untranslated in the catalogue's assumption notes. */
  'UID:', '% USt',

  /* The token kind, printed as an identifier in a table of share links
     beside a reference and an amount — a value, not a label. */
  'PAY-LINK',

  /* The Austrian data protection authority's registered name. A person
     lodging a complaint has to address it as it is registered, so this
     stays German in every language — the same rule as UID and USt. */
  'Österreichische Datenschutzbehörde',
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

/* Calls whose argument a person reads. Two shapes are matched: the literal
   passed straight in, and the `?? 'fallback'` / `|| 'fallback'` that stands in
   when the server sent no detail — which is precisely the path taken when the
   network is down, so it is the string the pro is most likely to see. */
const NOTIFIER = new RegExp(
  '\\b(setError|setNotice|setMessage|setMsg|setStatus|setInfo|setWarning|'
  /* `new Error(...)` is deliberately absent. A thrown message is read by a
     developer in a stack trace; translating it would put the one string that
     has to be greppable into four languages. */
  + 'setSuccess|setHint|setFeedback|setBanner|setToast|toast|alert|confirm'
  + ')\\s*\\(\\s*(?:'
  + "'((?:[^'\\\\]|\\\\.){4,}?)'"                       // a literal argument
  + "|[^)'\"`]*?(?:\\|\\||\\?\\?)\\s*'((?:[^'\\\\]|\\\\.){4,}?)'"  // a fallback
  + ')', 'g');

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
/* `legal` is the three files that ARE the legal instrument — the privacy
   policy, the terms and the imprint. They are now thin: each picks a language
   and hands a document from `content/` to `LegalDoc`, so there is no prose in
   them for this to find. What the four language versions of those documents
   have to agree about — same clauses, same links, same unfilled statutory
   fields — is a different question, and `legal-parity.mjs` asks it.

   The forms alongside them were never legal text: a name field, an email field
   and a submit button used to exercise an Art. 15–22 right. They count as
   `app` and are held to zero like every other screen. */
const LEGAL_INSTRUMENTS = /\/pages\/legal\/(PrivacyPolicyPage|TermsPage|ImprintPage)\.jsx$/;
const audience = (f) => (/\/(pages|components)\/admin\//.test(f) ? 'admin'
  : LEGAL_INSTRUMENTS.test(f) ? 'legal'
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

/* Parsed once, reused. The two scans below both need the AST, and a regex
   over the raw source reads comments as code: a doc comment mentioning
   `t('key')` as an example was reported as a key used nowhere and declared
   nowhere, which is a failure the build would have stopped on. */
const asts = new Map();
const parseFailures = [];
for (const f of files) {
  try {
    asts.set(f, parse(fs.readFileSync(f, 'utf8'), {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    }));
  } catch (e) {
    console.error(`could not parse ${rel(f)}: ${e.message}`);
    parseFailures.push(rel(f));
  }
}

const walkAst = (node, fn) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => walkAst(n, fn)); return; }
  fn(node);
  for (const k in node) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    walkAst(node[k], fn);
  }
};

const used = new Map();                       // key -> [files]
for (const [f, ast] of asts) {
  const hits = [];
  walkAst(ast.program, (n) => {
    if (n.type !== 'CallExpression') return;
    if (n.callee?.name !== 't') return;
    const arg = n.arguments?.[0];
    if (arg?.type === 'StringLiteral' && /^[a-z][a-z0-9_]*$/.test(arg.value)) hits.push(arg.value);
  });
  for (const m of hits.map((v) => [null, v])) {
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
    /* Prose that never reaches JSX. An error banner, a success notice and a
       confirm dialog are read by exactly the same person as the label above
       them, but they are built in a handler and handed to a state setter, so
       the two rules above cannot see them. This was a real hole: the estimate
       screen told a Turkish-speaking pro "Die Schätzung konnte nicht berechnet
       werden" while every label around it was Turkish, and the audit printed a
       clean bill. */
    for (const m of line.matchAll(NOTIFIER)) {
      const text = m[2] ?? m[3];
      if (text && isProse(text)) hardcoded.push({ ...at, kind: m[1], text });
    }
  });

  /* JSX text, from the parser rather than from a regex.
     The rule this replaces was `>text<` on a single line, which is how JSX is
     written only when it is short. Everything Prettier wrapped — every
     paragraph, every button label long enough to break — sat on its own line
     with no angle bracket beside it and was invisible. That was 89 strings on
     the tradesperson's screens, including whole sentences, while the audit
     reported none. A parser has no such blind spot: a JSXText node is a
     JSXText node whatever the line breaks look like. */
  const ast = asts.get(f);
  if (!ast) continue;
  (function visit(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (n.type === 'JSXText') {
      // JSX collapses runs of whitespace, so the string a person actually
      // reads is the collapsed one — and that is what must be matched
      // against the allow-list.
      const v = n.value.replace(/\s+/g, ' ').trim();
      if (isProse(v)) {
        hardcoded.push({ file: rel(f), line: n.loc.start.line,
                         audience: audience(rel(f)), kind: 'text', text: v });
      }
    }
    for (const k in n) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
      visit(n[k]);
    }
  }(ast.program));
}

/* A file that will not parse is not a file with no strings in it. Failing
   loudly here stops a syntax error from reading as a clean audit. */
if (parseFailures.length) {
  console.error(`\n${parseFailures.length} file(s) did not parse; the report above is incomplete.`);
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
