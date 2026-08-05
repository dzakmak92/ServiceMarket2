/* node src/utils/number.test.mjs */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'number.js'), 'utf8');
const { parseDecimal, formatDecimal } = await import(
  `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ok  ', m)) : (fail++, console.log('  FAIL', m)); };
const eq = (got, want, m) => ok(Object.is(got, want), `${m} (got ${got}, want ${want})`);

console.log('\n── a number as a German tradesperson types it ──');
eq(parseDecimal('12,5'), 12.5, 'the comma is a decimal point');
eq(parseDecimal('0,5'), 0.5, 'a leading zero survives — this became 05 → €5,00');
eq(parseDecimal('2,5'), 2.5, 'and 2,5 is not 25');
eq(parseDecimal('12.5'), 12.5, 'the English form still works');
eq(parseDecimal('1.234'), 1234, 'dots in threes are thousands');
eq(parseDecimal('1.234,56'), 1234.56, 'German thousands with a decimal comma');
eq(parseDecimal('1,234.56'), 1234.56, 'and the English form of the same number');
eq(parseDecimal(' 60 '), 60, 'padding is not part of the number');
eq(parseDecimal('-5'), -5, 'a negative is a number (whether the field allows it is separate)');
eq(parseDecimal('1.234.567'), 1234567, 'two thousands groups');
eq(parseDecimal('0'), 0, 'zero is a number, not an absence');

console.log('\n── and what is not a number ──');
for (const bad of ['', '   ', 'abc', '1,2,3.4.5', '--5', '.', ',', '1e3', '5%', null,
                   undefined, true, false, {}, [], NaN, Infinity, -Infinity]) {
  ok(parseDecimal(bad) === null, `${JSON.stringify(bad) ?? String(bad)} is rejected`);
}
eq(parseDecimal(12.5), 12.5, 'a real number passes through');

console.log('\n── formatting back into the field ──');
eq(formatDecimal(12.5, 'de-AT'), '12,5', 'German shows a comma');
eq(formatDecimal(12.5, 'en-GB'), '12.5', 'English shows a dot');
eq(formatDecimal(null), '', 'nothing formats to nothing');
eq(formatDecimal(0, 'de-AT'), '0', 'zero shows as zero, not blank');

console.log(`\n${fail ? 'FAILURES' : 'ALL PASS'}  (${pass + fail} checks)`);
process.exit(fail ? 1 : 0);
