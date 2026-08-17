/* Every human-readable string in the frontend that is not going through `t`.
 *
 * Two kinds of leak produced the German/English mix on the estimator: a server
 * label fetched without `lang`, and a sentence typed straight into the JSX.
 * This finds the second kind. It is deliberately noisy in favour of recall —
 * what it prints is a list to read, not a verdict.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] || '/home/user/ServiceMarket2/frontend/src';

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|__tests__/.test(f)) walk(f); }
    else if (/\.(jsx|js)$/.test(e.name) && !/translations\//.test(f)) files.push(f);
  }
})(ROOT);

/* A word a person reads, not an identifier: at least four letters, and either
   more than one word or an umlaut. Keys (`est_pick_trade`) and class names
   never look like this. */
const WORDY = /^(?=.*[A-Za-zÄÖÜäöüßÇçĞğİıŞşÑñ]{3})(?:.*\s.*|.*[ÄÖÜäöüßÇçĞğİıŞşÑñ].*)$/;
const SKIP = /^(?:[a-z0-9_.-]+|[A-Z_]+|\d[\d.,\s%€$-]*|[\s\p{P}\p{S}]+)$/u;
const ALLOW = /^(?:ServiceMarket|https?:|data:|image\/|application\/|UTF-8|de|en|tr|es)/;
/* Class strings and URLs read as prose to a regex and are not prose. Tailwind
   utilities and API paths are the whole of the noise this scanner produces. */
const CODEY = /(?:^|\s)(?:\/api\/|\/[a-z-]+\/|(?:text|bg|border|rounded|px|py|mt|mb|ml|mr|w|h|min|max|flex|grid|gap|font|tracking|leading|shadow|ring|inline|absolute|relative|sticky|overflow|items|justify|space|divide|hover:|focus|transition|opacity|z)-)/;

const hits = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  /* Comments carry prose by design in this codebase — the block comments are
     the documentation — so they are cut before anything is matched. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const lines = code.split('\n');

  lines.forEach((ln, i) => {
    const push = (text, kind) => {
      const s = text.trim();
      if (!s || s.length < 4 || SKIP.test(s) || ALLOW.test(s)) return;
      if (!WORDY.test(s) || CODEY.test(s)) return;
      hits.push({ f: path.relative(ROOT, f), n: i + 1, kind, s: s.slice(0, 80) });
    };
    // JSX text between tags
    for (const m of ln.matchAll(/>([^<>{}\n]{4,})</g)) push(m[1], 'jsx-text');
    // user-visible props
    for (const m of ln.matchAll(/\b(placeholder|aria-label|title|alt)=(?:"([^"]{4,})"|'([^']{4,})')/g)) {
      push(m[2] || m[3], m[1]);
    }
    // template literals and quoted strings used as fallbacks: `|| 'Angebot'`
    for (const m of ln.matchAll(/\|\|\s*(?:'([^']{4,})'|"([^"]{4,})"|`([^`$]{4,})`)/g)) {
      push(m[1] || m[2] || m[3], 'fallback');
    }
    // `${x} selbst gesetzt`
    for (const m of ln.matchAll(/`([^`]*\$\{[^`]*\}[^`]*)`/g)) {
      const plain = m[1].replace(/\$\{[^}]*\}/g, ' ').trim();
      if (plain.split(/\s+/).filter((w) => /[A-Za-zÄÖÜäöüß]{3}/.test(w)).length >= 2) {
        push(plain, 'template');
      }
    }
  });
}

const byFile = {};
for (const h of hits) (byFile[h.f] ||= []).push(h);
const ordered = Object.entries(byFile).sort((a, b) => b[1].length - a[1].length);
console.log(`${hits.length} candidates in ${ordered.length} files\n`);
for (const [f, rows] of ordered) {
  console.log(`── ${f}  (${rows.length})`);
  for (const r of rows.slice(0, 40)) console.log(`   ${String(r.n).padStart(5)}  ${r.kind.padEnd(10)} ${r.s}`);
}
