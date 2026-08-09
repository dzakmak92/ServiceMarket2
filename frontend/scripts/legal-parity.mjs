#!/usr/bin/env node
/**
 * node scripts/legal-parity.mjs
 *
 * The privacy policy, the terms and the imprint exist in four languages as
 * data. Nothing about that structure stops a translator from dropping a
 * clause, losing a link, or quietly resolving one of the imprint placeholders
 * into plausible-looking text — and a missing clause in one language is
 * exactly the kind of defect nobody finds by reading the page they can read.
 *
 * So this compares the four versions against each other rather than checking
 * any of them for correctness, which it cannot do:
 *
 *   · same sections, same ids, same order;
 *   · same number of links, so a citation cannot vanish in translation;
 *   · same number of `todo` placeholders, so the three fields § 5 ECG requires
 *     stay visibly unfilled in every language rather than being written over;
 *   · the draft note present in every version of a document that is a draft.
 *
 * Exits non-zero on any of them, so it can gate a build alongside i18n-audit.
 */
import { PRIVACY } from '../src/pages/legal/content/privacy.js';
import { TERMS } from '../src/pages/legal/content/terms.js';
import { IMPRINT } from '../src/pages/legal/content/imprint.js';

const LANGS = ['en', 'de', 'tr', 'es'];
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; };

const countNodes = (doc) => {
  let n = 0, todos = 0, links = 0;
  const scan = (nodes) => (nodes || []).forEach((x) => {
    n++; if (x && x.todo) todos++; if (x && x.a) links++;
  });
  (doc.intro || []).forEach((b) => scan(b.p || b.lead || b.note));
  (doc.sections || []).forEach((s) => s.blocks.forEach((b) => {
    if (b.ul) b.ul.forEach(scan); else scan(b.p || b.lead || b.note);
  }));
  return { n, todos, links };
};

for (const [name, doc] of [['privacy', PRIVACY], ['terms', TERMS], ['imprint', IMPRINT]]) {
  console.log(`\n── ${name} ──`);
  const ids = LANGS.map((l) => (doc[l].sections || []).map((s) => s.id).join(','));
  check(new Set(ids).size === 1, `all four versions have the same sections in the same order`);
  const base = countNodes(doc.en);
  for (const l of LANGS) {
    const c = countNodes(doc[l]);
    check(c.todos === base.todos, `${l}: ${c.todos} placeholder(s), same as en (${base.todos})`);
    check(c.links === base.links, `${l}: ${c.links} link(s), same as en (${base.links})`);
    check(!!doc[l].title, `${l}: has a title (${doc[l].title})`);
  }
  // Every document that is still a draft says so, in every language.
  if (name !== 'imprint') {
    for (const l of LANGS) {
      const note = (doc[l].intro || []).find((b) => b.note);
      check(!!note, `${l}: carries the draft note`);
    }
  }
}
console.log('\n' + (fails ? `${fails} FAILURE(S)` : 'ALL PASS'));
process.exit(fails ? 1 : 0);
