/**
 * IBAN → BIC + bank name lookup.
 * Covers the most common AT / DE / CH banks.
 * Source: ECB/OeNB public BLZ catalogues.
 *
 * Returns { bic: string|null, name: string } or null when the IBAN
 * country is not covered or the bank is not in the table.
 */

// ── Austria (5-digit BLZ at positions 4-8 of the BBAN) ──────────────────────
const AT_BLZ = {
  // Bank Austria / UniCredit
  '12000': { bic: 'BKAUATWWXXX', name: 'Bank Austria' },
  '19040': { bic: 'BKAUATWWXXX', name: 'Bank Austria' },
  '19041': { bic: 'BKAUATWWXXX', name: 'Bank Austria' },
  '19043': { bic: 'BKAUATWWXXX', name: 'Bank Austria' },
  '19044': { bic: 'BKAUATWWXXX', name: 'Bank Austria' },
  '19050': { bic: 'BKAUATWWXXX', name: 'Bank Austria' },
  '19051': { bic: 'BKAUATWWXXX', name: 'Bank Austria' },
  '19052': { bic: 'BKAUATWWXXX', name: 'Bank Austria' },
  // Erste Bank
  '20111': { bic: 'GIBAATWWXXX', name: 'Erste Bank' },
  '20200': { bic: 'GIBAATWWXXX', name: 'Erste Bank' },
  '20201': { bic: 'GIBAATWWXXX', name: 'Erste Bank' },
  '20202': { bic: 'GIBAATWWXXX', name: 'Erste Bank' },
  '20204': { bic: 'GIBAATWWXXX', name: 'Erste Bank' },
  '20206': { bic: 'GIBAATWWXXX', name: 'Erste Bank' },
  '20208': { bic: 'GIBAATWWXXX', name: 'Erste Bank' },
  '20250': { bic: 'GIBAATWWXXX', name: 'Erste Bank' },
  // s Sparkasse (owned by Erste Group but separate BICs)
  '20251': { bic: 'OPSKATWWXXX', name: 's Sparkasse' },
  '20302': { bic: 'OPSKATWWXXX', name: 's Sparkasse' },
  '20305': { bic: 'OPSKATWWXXX', name: 's Sparkasse' },
  // BAWAG P.S.K.
  '14000': { bic: 'BAWAATWWXXX', name: 'BAWAG P.S.K.' },
  // easybank (BAWAG subsidiary)
  '14200': { bic: 'EASYATWWXXX', name: 'easybank' },
  // ING Austria
  '17500': { bic: 'INGDATWWXXX', name: 'ING Austria' },
  // Volksbank Wien
  '19200': { bic: 'VBOEATWWXXX', name: 'Volksbank Wien' },
  '40800': { bic: 'VBOEATWWXXX', name: 'Volksbank' },
  '43000': { bic: 'VBOEATWWXXX', name: 'Volksbank Niederösterreich' },
  '44000': { bic: 'VBOEATWWXXX', name: 'Volksbank Steiermark' },
  '45000': { bic: 'VBOEATWWXXX', name: 'Volksbank Wien' },
  '57200': { bic: 'VBOEATWWXXX', name: 'Volksbank' },
  '58000': { bic: 'VBOEATWWXXX', name: 'Volksbank Ried' },
  // Raiffeisen Zentralbank (Wien)
  '32000': { bic: 'RZOOAT2LXXX', name: 'Raiffeisen Zentralbank' },
  '32001': { bic: 'RZOOAT2LXXX', name: 'Raiffeisen Bank International' },
  // Raiffeisen regional banks — exact BICs vary, give name only
  '33000': { bic: null, name: 'Raiffeisen (regional)' },
  '34000': { bic: null, name: 'Raiffeisen (regional)' },
  '35000': { bic: null, name: 'Raiffeisen Niederösterreich' },
  '36000': { bic: null, name: 'Raiffeisen (regional)' },
  '37000': { bic: null, name: 'Raiffeisen Salzburg' },
  '38400': { bic: null, name: 'Raiffeisen (regional)' },
  // Hypo banks
  '29000': { bic: 'HYPNATAATXXX', name: 'Hypo Niederösterreich' },
  '30000': { bic: 'HYSTAT2GXXX', name: 'Hypo Steiermark' },
  '55000': { bic: 'HYPKATWKXXX', name: 'Hypo Kärnten' },
  '56000': { bic: 'HYPTIROL0XXX', name: 'Hypo Tirol' },
  // Austrian National Bank
  '10000': { bic: 'OENBATWWXXX', name: 'Österreichische Nationalbank' },
  // Postsparkasse
  '60000': { bic: 'OPSKATWWXXX', name: 'Österreichische Postsparkasse' },
  // Sberbank Austria (now Addiko)
  '18500': { bic: 'ADLKATWWXXX', name: 'Addiko Bank' },
  // Austrian Anadi Bank
  '55100': { bic: 'HAABAT2KXXX', name: 'Anadi Bank' },
};

// ── Germany (8-digit BLZ at positions 4-11 of the BBAN) ────────────────────
const DE_BLZ = {
  '10010010': { bic: 'PBNKDEFFXXX', name: 'Postbank' },
  '10010111': { bic: 'PBNKDEFFXXX', name: 'Postbank' },
  '10020030': { bic: 'BELADEBEXXX', name: 'Berliner Bank' },
  '10050000': { bic: 'BELADEBEXXX', name: 'Berliner Sparkasse' },
  '20010020': { bic: 'PBNKDEFFXXX', name: 'Postbank Hamburg' },
  '20030000': { bic: 'DEUTDEDBXXX', name: 'Deutsche Bank Hamburg' },
  '20060000': { bic: 'HYVEDEMHXXX', name: 'HypoVereinsbank Hamburg' },
  '30010111': { bic: 'PBNKDEFFXXX', name: 'Postbank Düsseldorf' },
  '37040044': { bic: 'COBADEFFXXX', name: 'Commerzbank' },
  '37050198': { bic: 'COLSDE33XXX', name: 'Sparkasse KölnBonn' },
  '43060967': { bic: 'GENODEM1GLS', name: 'GLS Bank' },
  '50010517': { bic: 'INGDDEFFXXX', name: 'ING-DiBa' },
  '50040000': { bic: 'COBADEFFXXX', name: 'Commerzbank Frankfurt' },
  '50070010': { bic: 'DEUTDEDBXXX', name: 'Deutsche Bank' },
  '50070024': { bic: 'DEUTDEDBXXX', name: 'Deutsche Bank Frankfurt' },
  '70010080': { bic: 'PBNKDEFFXXX', name: 'Postbank München' },
  '70020270': { bic: 'HYVEDEMMXXX', name: 'HypoVereinsbank München' },
  '70050000': { bic: 'SSKMDEMM', name: 'Stadtsparkasse München' },
  '70090100': { bic: 'DEUTDEMMXXX', name: 'Deutsche Bank München' },
  '75040062': { bic: 'COBADEFFXXX', name: 'Commerzbank Nürnberg' },
  '86055592': { bic: 'OSDDDE81XXX', name: 'Ostsächsische Sparkasse Dresden' },
};

// ── Switzerland (5-digit clearing number at positions 4-8 of the BBAN) ──────
const CH_CLR = {
  '00230': { bic: 'UBSWCHZH80A', name: 'UBS Switzerland' },
  '00240': { bic: 'UBSWCHZH80A', name: 'UBS Switzerland' },
  '03000': { bic: 'CRESCHZZ80A', name: 'Credit Suisse' },
  '08401': { bic: 'RAIFCH22XXX', name: 'Raiffeisen Schweiz' },
  '09000': { bic: 'POFICHBEXXX', name: 'PostFinance' },
};

// ── BLZ prefix fallback for AT (when exact match not found) ─────────────────
const AT_PREFIX_FALLBACK = [
  { prefix: '12', name: 'Bank Austria' },
  { prefix: '19', name: 'Bank Austria' },
  { prefix: '14', name: 'BAWAG P.S.K.' },
  { prefix: '20', name: 'Erste Bank / Sparkasse' },
  { prefix: '32', name: 'Raiffeisen' },
  { prefix: '33', name: 'Raiffeisen (regional)' },
  { prefix: '34', name: 'Raiffeisen (regional)' },
  { prefix: '35', name: 'Raiffeisen (regional)' },
  { prefix: '36', name: 'Raiffeisen (regional)' },
  { prefix: '37', name: 'Raiffeisen (regional)' },
  { prefix: '38', name: 'Raiffeisen / Erste' },
  { prefix: '39', name: 'Volksbank' },
  { prefix: '40', name: 'Volksbank' },
  { prefix: '41', name: 'Volksbank' },
  { prefix: '42', name: 'Volksbank' },
  { prefix: '43', name: 'Volksbank / Sparkasse' },
  { prefix: '44', name: 'Volksbank Steiermark' },
  { prefix: '45', name: 'Volksbank' },
  { prefix: '55', name: 'Hypo Kärnten / Anadi' },
  { prefix: '56', name: 'Hypo Tirol' },
  { prefix: '57', name: 'Volksbank' },
  { prefix: '58', name: 'Volksbank' },
  { prefix: '60', name: 'Postsparkasse' },
];

/**
 * Extract the bank code from an IBAN string.
 * @param {string} iban - normalized (no spaces, uppercase)
 * @returns {{ bic: string|null, name: string }|null}
 */
export function lookupBankFromIban(iban) {
  const clean = iban.replace(/\s/g, '').toUpperCase();
  const country = clean.slice(0, 2);

  if (country === 'AT' && clean.length === 20) {
    const blz = clean.slice(4, 9); // 5-digit BLZ
    if (AT_BLZ[blz]) return AT_BLZ[blz];
    // Prefix fallback — name only, no BIC
    const fb = AT_PREFIX_FALLBACK.find((p) => blz.startsWith(p.prefix));
    if (fb) return { bic: null, name: fb.name };
    return null;
  }

  if (country === 'DE' && clean.length === 22) {
    const blz = clean.slice(4, 12); // 8-digit BLZ
    if (DE_BLZ[blz]) return DE_BLZ[blz];
    return null;
  }

  if (country === 'CH' && clean.length === 21) {
    const clr = clean.slice(4, 9); // 5-digit clearing
    if (CH_CLR[clr]) return CH_CLR[clr];
    return null;
  }

  return null;
}

/**
 * Very light IBAN checksum (mod-97).
 * Returns true for structurally valid IBANs.
 */
export function isValidIban(iban) {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  if (!s.slice(0, 2).match(/^[A-Z]{2}$/)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const digits = rearranged.split('').map((c) => (c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c)).join('');
  // BigInt mod-97
  let remainder = 0n;
  for (const ch of digits) { remainder = (remainder * 10n + BigInt(ch)) % 97n; }
  return remainder === 1n;
}
