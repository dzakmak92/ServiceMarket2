/**
 * Which trade mark to draw for a job or a quote.
 *
 * `jobs.category` holds two vocabularies: the estimator writes its own keys
 * ("maler", "fliesen", "montage" …) and the marketplace writes English ones
 * ("painting", "tiling" …). Older jobs have no category at all, so the title
 * is the last resort — "Interior walls, two coats" is a painting job whatever
 * the column says.
 */
const MARKS = ['maler', 'fliesen', 'elektrik', 'sanitaer', 'garten', 'reinigung', 'montage', 'folierung'];

const ALIAS = {
  painting: 'maler', tiling: 'fliesen', flooring: 'fliesen', electrical: 'elektrik',
  plumbing: 'sanitaer', hvac: 'sanitaer', gardening: 'garten', home_cleaning: 'reinigung',
  cleaning: 'reinigung', handyman: 'montage', carpentry: 'montage', moving: 'montage',
  locksmith: 'montage', appliance_repair: 'montage',
};

/* Checked in order; the first match wins. Words in German and English, as
   titles come from the catalogue in either. */
const WORDS = [
  ['folierung', /folier|foliert|wrap|vinyl/],
  ['fliesen', /fliese|tile|tiling|terrass|boden|floor|fuge/],
  ['elektrik', /elektr|steckdos|licht|lamp|socket|electr|wiring|kabel|sicherung/],
  ['sanitaer', /sanit|bad(?!e)|wc|toilet|dusch|shower|wasser|plumb|heiz|boiler|\btap\b|leak/],
  ['garten', /garten|garden|hecke|hedge|rasen|lawn|baum|tree|pflanz/],
  ['reinigung', /reinig|clean|putz/],
  ['maler', /mal(er|en)|streich|paint|wall|wand|tapet|wallpaper|lack|coat|spachtel|decke|ceiling/],
  ['montage', /montag|kitchen|küche|möbel|furniture|assembl|fit |fitted|install|tür|door|regal|shelf/],
];

export function tradeOf(category, title) {
  const c = (category || '').toLowerCase().trim();
  if (MARKS.includes(c)) return c;
  if (ALIAS[c]) return ALIAS[c];
  const tt = ` ${(title || '').toLowerCase()} `;
  for (const [k, re] of WORDS) if (re.test(tt)) return k;
  return null;
}

export default tradeOf;
