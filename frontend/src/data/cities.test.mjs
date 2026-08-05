/**
 * node src/data/cities.test.mjs
 *
 * The town picker's search, which is the only logic in the list.
 */
import { searchCities, isKnownCity, CITIES, fold } from './cities.js';
let pass=0, fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ok  ',m)):(fail++,console.log('  FAIL',m));};
console.log(`  AT ${CITIES.AT.length} towns, DE ${CITIES.DE.length}`);
ok(new Set(CITIES.AT).size === CITIES.AT.length, 'no duplicates in AT');
ok(new Set(CITIES.DE).size === CITIES.DE.length, 'no duplicates in DE');
ok(searchCities('AT','')[0] === 'Wien', 'AT opens on Wien');
ok(searchCities('DE','')[0] === 'Berlin', 'DE opens on Berlin');
console.log('  Bre ->', searchCities('DE','Bre').join(', '));
ok(searchCities('DE','Bre')[0] === 'Bremen', 'a prefix match outranks a longer containing name');
console.log('  munchen ->', searchCities('DE','munchen').join(', '));
ok(searchCities('DE','munchen').includes('München'), 'umlauts fold away');
ok(searchCities('DE','Muenchen').includes('München'), 'and so does the ue spelling');
ok(searchCities('AT','sankt')[0] === 'Sankt Pölten', 'multi-word names are searchable');
ok(searchCities('DE','frankfurt am main').includes('Frankfurt am Main'), 'spaces do not break it');
ok(searchCities('DE','zzz').length === 0, 'a name we do not have returns nothing to pick');
ok(isKnownCity('AT','wien') && isKnownCity('DE','MÜNCHEN'), 'known-city test ignores case and umlauts');
ok(!isKnownCity('AT','Kleinstadt'), 'and says no to one we do not list');
ok(searchCities('DE','a', 5).length === 5, 'the limit is honoured');
ok(searchCities('XX','a').length === 0, 'an unknown country is empty, not a crash');
console.log(`\n${fail?`${fail} FAILURE(S)`:'ALL PASS'}  (${pass} checks)`);
process.exit(fail?1:0);
