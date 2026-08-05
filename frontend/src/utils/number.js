/**
 * A number as a person writes it.
 *
 * The twin of `parse_number` in backend/services/estimator.py, and it exists
 * for the same reason: this is a German-language product, German writes 12,5
 * where English writes 12.5, and a tradesperson typing into a quantity field
 * types the comma.
 *
 * `<input type="number">` does not help. Chromium refuses the comma keystroke
 * and hands back the digits either side of it, so "2,5" arrives as **25** —
 * ten times the quantity, with `validity.badInput` false, no error, and the
 * wrong figure saved straight through. "0,5" became "05" → €5.00 instead of
 * €0.50. Measured on a bare input under de-AT, de-DE and the default locale;
 * there is no browser configuration in which the comma parses.
 *
 * So the money fields are text inputs with `inputMode="decimal"` and this
 * does the reading.
 */

const THOUSANDS = /^\d{1,3}(\.\d{3})+$/;

/* The shapes a written number is allowed to have: digits, optionally grouped
   in threes, optionally followed by one decimal separator and more digits.
   Checked before normalising, because normalising "1,2,3.4.5" produces a
   confident 1234.5 out of something nobody meant. */
const SHAPE = /^(\d+([.,]\d{3})*|\d*)([.,]\d+)?$/;

/** A number, or null. Never NaN, never Infinity, never a guess.
 *
 *  The ambiguous middle has rules rather than luck:
 *    · both separators → the last one is the decimal point
 *    · only dots, in groups of three → thousands ("1.234" is 1234)
 *    · a lone comma → decimal ("12,5" is twelve and a half)
 */
export function parseDecimal(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val !== 'string') return null;

  let t = val.trim().replace(/ /g, '').replace(/\s/g, '');
  if (!t) return null;

  const neg = t.startsWith('-');
  if (neg || t.startsWith('+')) t = t.slice(1);

  if (!SHAPE.test(t)) return null;

  const hasComma = t.includes(',');
  const hasDot = t.includes('.');
  if (hasComma && hasDot) {
    const cut = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
    t = `${t.slice(0, cut).replace(/[.,]/g, '')}.${t.slice(cut + 1)}`;
  } else if (hasDot && THOUSANDS.test(t)) {
    t = t.replace(/\./g, '');
  } else if (hasComma) {
    t = t.replace(/,/g, '.');
  }

  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** For display in a field the user is editing: their own convention, no
 *  thousands separators (those are what made the input ambiguous). */
export function formatDecimal(n, locale = 'de-AT') {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '';
  const s = String(n);
  return locale.startsWith('de') || locale.startsWith('es') || locale.startsWith('tr')
    ? s.replace('.', ',')
    : s;
}
