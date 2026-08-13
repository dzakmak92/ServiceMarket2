/**
 * Amounts and dates, written the way the pro reads.
 *
 * Every screen carried its own
 * `new Intl.NumberFormat('de-AT', …)` — forty-odd of them — so an English,
 * Turkish or Spanish pro saw "€ 1.234,50" and "05.08.2026" throughout, in an
 * interface that was otherwise in their language. Turkish happens to group
 * the same way; English and Spanish do not, and 05.08 reads as 8 May to an
 * English speaker looking at a payment due date.
 *
 * The locale lives here as module state rather than in a hook, because these
 * are called from module-level helpers (`const fmtEur = …` at the top of a
 * file, outside any component) and threading a locale through every call site
 * would have meant touching every one of them. `LangProvider` registers the
 * current one during render — the same arrangement `setDurationUnits` in
 * utils/schedule.js already uses, and for the same reason: an effect runs
 * after the children have drawn, so the first paint after a language change
 * would still carry the old locale.
 *
 * Currency stays EUR in all four languages. That is not a formatting choice —
 * it is what the invoice says.
 */

let LOCALE = 'de-AT';

export function setMoneyLocale(locale) {
  if (locale) LOCALE = locale;
}

export function moneyLocale() {
  return LOCALE;
}

/** € 1.234,50 / €1,234.50 — the amount, in the reader's convention. */
export const fmtEur = (v) =>
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' }).format(Number(v || 0));

/** The same without the cents, for headline figures. */
export const fmtEur0 = (v) =>
  new Intl.NumberFormat(LOCALE, {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Number(v || 0));

/** A bare number — hours, kilometres, counts. */
export const fmtNum = (v, digits = 0) =>
  new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(Number(v || 0));

/**
 * An amount with the currency sign taken off — for a row of narrow money
 * fields that say "€" once in the heading above them.
 *
 * Not `fmtNum`: in de-AT the currency formatter groups with a full stop
 * ("€ 1.680") while the plain decimal formatter groups with a space
 * ("1 540"), so a heading and a footer built from the two disagreed inside
 * one card. Taking the sign off the currency parts keeps every figure on a
 * screen grouped the same way.
 */
export const fmtEurBare = (v) =>
  new Intl.NumberFormat(LOCALE, {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).formatToParts(Number(v || 0))
    .filter((p) => p.type !== 'currency')
    .map((p) => p.value)
    .join('')
    .trim();

/** A date, short. Em dash for nothing, so an empty cell is not a blank. */
export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(LOCALE) : '—');

/** A date with the month spelled out — for anything a customer reads. */
export const fmtDateLong = (v) => (v
  ? new Date(v).toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' })
  : '—');

/** Date and time, for audit trails and activity feeds. */
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString(LOCALE) : '—');
