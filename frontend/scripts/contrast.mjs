#!/usr/bin/env node
/**
 * node scripts/contrast.mjs
 *
 * Every foreground/background pair the home screen puts text on, measured
 * against WCAG AA (4.5:1 — none of this text is large enough for the 3:1
 * allowance).
 *
 * This exists because contrast on this screen has been wrong three times, and
 * each time it was found by eye after the fact: a mid-teal tile at 4.16:1, a
 * rust CTA at 4.09:1, an amber band at 2.04:1. Colour choices get made by
 * looking at renders, and a render at 4.2:1 looks fine.
 *
 * The palette is read from tailwind.config.js rather than repeated here, so
 * changing a token is what breaks this rather than forgetting to update it.
 * Tinted badges are flattened over the surface they sit on: `bg-amber/15` on a
 * white tile is not amber, it is what amber becomes at 15 % over white, and
 * that is the number that matters.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const CONFIG = fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8');

/** Pull `name: '#rrggbb'` out of the config, including nested families. */
const hexOf = (token) => {
  const [family, shade] = token.includes('.') ? token.split('.') : [token, null];
  if (!shade) {
    const m = new RegExp(`['"]?${family}['"]?\\s*:\\s*'(#[0-9a-fA-F]{6})'`).exec(CONFIG);
    if (!m) throw new Error(`no colour named ${token} in tailwind.config.js`);
    return m[1];
  }
  const fam = new RegExp(`['"]?${family}['"]?\\s*:\\s*\\{([^}]*)\\}`).exec(CONFIG);
  if (!fam) throw new Error(`no colour family named ${family}`);
  const key = shade === 'DEFAULT' ? 'DEFAULT' : shade;
  const m = new RegExp(`['"]?${key}['"]?\\s*:\\s*'(#[0-9a-fA-F]{6})'`).exec(fam[1]);
  if (!m) throw new Error(`no shade ${shade} in ${family}`);
  return m[1];
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** A translucent fill resolved against what is behind it. */
const over = (fg, bg, alpha) =>
  rgb(fg).map((f, i) => Math.round(f * alpha + rgb(bg)[i] * (1 - alpha)));

const AA = 4.5;

/* What the home screen actually renders. Each entry is [label, text, surface],
   where a surface may be a token or a [token, backdrop, alpha] tint. */
const PAIRS = [
  // The focus card
  ['focus card · title', 'paper', 'teal.deep'],
  ['focus card · kicker and meta', 'teal.tint', 'teal.deep'],
  ['focus card · CTA label', 'on-amber', 'amber.DEFAULT'],
  // The six workflow tiles: white cards, ink label, muted count
  ['tile · label', 'ink.DEFAULT', 'paper'],
  ['tile · count', 'ink.muted', 'paper'],
  // The icon inside its badge, which is a tint over the white tile
  ['badge · warm icon', 'amber.text', ['amber.DEFAULT', 'paper', 0.15]],
  ['badge · cool icon', 'teal.DEFAULT', ['teal.DEFAULT', 'paper', 0.10]],
  // Section headings sit on the page, not on a card
  ['section heading', 'ink.muted', 'cream'],
  ['greeting', 'ink.muted', 'cream'],
];

let fails = 0;
console.log('── home screen, text on its own background ──');
for (const [label, fg, bg] of PAIRS) {
  const back = Array.isArray(bg) ? over(hexOf(bg[0]), hexOf(bg[1]), bg[2]) : rgb(hexOf(bg));
  const r = ratio(rgb(hexOf(fg)), back);
  const ok = r >= AA;
  if (!ok) fails += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(30)} ${r.toFixed(2)}:1`);
}

/* The tile hairline is decoration — it separates a white card from a cream
   page and carries no text — so it has no minimum. Printed anyway, because a
   border nobody can see is a border that is not doing its job. */
const hairline = ratio(rgb(hexOf('cream-deep')), rgb(hexOf('cream')));
console.log(`\n  note tile hairline vs page          ${hairline.toFixed(2)}:1  (decoration, no AA minimum)`);

console.log('\n' + (fails ? `${fails} PAIR(S) BELOW AA` : 'ALL PASS'));
process.exit(fails ? 1 : 0);
