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

  /* The estimate cards. A note nobody can read is a note that did not warn
     anybody, and these sit on tints of their own severity colour — so the
     text and its background move together and the ratio has to be checked
     rather than assumed. */
  ['card · template name', 'ink.DEFAULT', 'paper'],
  ['card · band and unit', 'ink.muted', 'paper'],
  ['card · amount on a checked row', 'ink.DEFAULT', ['teal.DEFAULT', 'paper', 0.03]],
  ['note · severe text on its tint', 'ink.DEFAULT', ['red-warn', 'paper', 0.06]],
  ['note · ordinary text on its tint', 'ink.soft', ['amber.DEFAULT', 'paper', 0.07]],
  ['card · total chip', 'ink.DEFAULT', ['teal.DEFAULT', 'paper', 0.08]],
  ['card · missing-quantity warning', 'amber.text', 'paper'],

  /* The Innen/Außen zone panels. Two surfaces stacked — a tint of the zone
     colour over the cream page, and a card that is a *different* mix (the same
     colour over white) sitting on top of it — so every reading here is text on
     a surface that neither token names on its own. Getting this wrong is what
     the whole file exists for: the panel has to be deep enough that the card
     lifts off it, and one step deeper than this the group subtitle fails. */
  ['zone · Innen heading on its panel', 'teal.DEFAULT', ['teal.DEFAULT', 'cream', 0.09]],
  ['zone · Außen heading on its panel', 'amber.text', ['amber.DEFAULT', 'cream', 0.09]],
  ['zone · group subtitle on Innen', 'ink.muted', ['teal.DEFAULT', 'cream', 0.09]],
  ['zone · group subtitle on Außen', 'ink.muted', ['amber.DEFAULT', 'cream', 0.09]],
  ['zone · card title on Innen card', 'ink.DEFAULT', 'zone-in'],
  ['zone · card title on Außen card', 'ink.DEFAULT', 'zone-out'],
  ['zone · card band on Innen card', 'ink.muted', 'zone-in'],
  ['zone · card band on Außen card', 'ink.muted', 'zone-out'],
  ['zone · site-visit flag on Innen card', 'red-warn', 'zone-in'],
  ['zone · site-visit flag on Außen card', 'red-warn', 'zone-out'],
  /* The "also under X" chip: a tint of ink on a card that is itself a tint.
     Three surfaces deep, and it is the one piece of text explaining why a
     template appears twice — the reading nobody would think to check. */
  ['card · cross-listing chip on Innen', 'ink.muted', ['ink.DEFAULT', 'zone-in', 0.05]],
  ['card · cross-listing chip on Außen', 'ink.muted', ['ink.DEFAULT', 'zone-out', 0.05]],
  ['card · cross-listing chip on paper', 'ink.muted', ['ink.DEFAULT', 'paper', 0.05]],

  /* The quotes list: a three-way verdict, and a card tinted once it is
     decided. Green is why `green-text` exists — `green-pos` measures 4.15:1 on
     plain white, so every green figure and every "accepted" badge in this app
     was below AA until this row was added. It is the lightest of the three
     brand colours, so the same opacity buys a deeper fill and it fails first
     every time. Red needed the same for a tint of itself. */
  ['quote · won card title', 'ink.DEFAULT', ['green-pos', 'cream', 0.07]],
  ['quote · won card meta', 'ink.muted', ['green-pos', 'cream', 0.07]],
  ['quote · lost card title', 'ink.DEFAULT', ['red-warn', 'cream', 0.07]],
  ['quote · lost card meta', 'ink.muted', ['red-warn', 'cream', 0.07]],
  ['quote · verdict open segment', 'teal.DEFAULT', ['teal.DEFAULT', 'paper', 0.14]],
  ['quote · verdict won segment', 'green-text', ['green-pos', 'paper', 0.14]],
  ['quote · verdict lost segment', 'red-text', ['red-warn', 'paper', 0.13]],
  ['quote · verdict inactive segment', 'ink.muted', 'paper'],
  /* The two icon buttons on a quote row — pen and share. They carry no visible
     label, so the glyph is the whole control and it has to be as readable as
     text would have been. White face on every card, tinted or not. */
  ['quote · row icon glyph', 'ink.DEFAULT', 'paper'],
  /* The clipboard confirmation. It prints directly on the card, not on a
     button, so it is measured on all three card surfaces. */
  ['quote · link-copied on open card', 'teal.DEFAULT', 'paper'],
  ['quote · link-copied on won card', 'teal.DEFAULT', ['green-pos', 'cream', 0.07]],
  ['quote · link-copied on lost card', 'teal.DEFAULT', ['red-warn', 'cream', 0.07]],
  /* The two values the tokens exist for, on the surface they fail on without
     them — kept so a well-meaning revert is caught here rather than shipped. */
  ['quote · green as text on paper', 'green-text', 'paper'],
  ['quote · red as text on its own tint', 'red-text', ['red-warn', 'paper', 0.13]],
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

/* What separates an icon button from a tinted quote card is its white face —
   its `sm-border` hairline on a warm tint is around 1.06:1, i.e. nothing. Both
   are printed because the pair is what makes the control visible, and if the
   face ever stops separating there is no border underneath to save it. */
for (const [name, tint] of [['won', ['green-pos', 'cream', 0.07]], ['lost', ['red-warn', 'cream', 0.07]]]) {
  const surf = over(hexOf(tint[0]), hexOf(tint[1]), tint[2]);
  console.log(`  note button face vs ${name.padEnd(5)} card    ` +
              `${ratio(rgb(hexOf('paper')), surf).toFixed(2)}:1  face, ` +
              `${ratio(rgb(hexOf('sm-border')), surf).toFixed(2)}:1  hairline`);
}

console.log('\n' + (fails ? `${fails} PAIR(S) BELOW AA` : 'ALL PASS'));
process.exit(fails ? 1 : 0);
