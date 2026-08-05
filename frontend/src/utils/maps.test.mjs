/* node src/utils/maps.test.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'maps.js'), 'utf8');
const mod = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
const { routeHref, jobAddress } = mod;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ok  ', m)) : (fail++, console.log('  FAIL', m)); };
const eq = (a, b, m) => ok(a === b, `${m}\n        got: ${a}\n        want: ${b}`);

console.log('\n── the address we hand to a map ──');
eq(jobAddress({ site_address: 'Seestraße 4', site_postal_code: '1010', site_city: 'Wien' }),
   'Seestraße 4, 1010 Wien', 'street, postal code and town');
eq(jobAddress({ customer_address: 'Ringstr. 9', customer_postal_code: '80331', customer_city: 'München' }),
   'Ringstr. 9, 80331 München', 'falls back to the customer address');
eq(jobAddress({ site_address: 'Seestraße 4', site_city: 'Wien',
                customer_address: 'Anderswo 1', customer_city: 'Graz' }),
   'Seestraße 4, Wien', 'the site wins over the billing address');
eq(jobAddress({ site_city: 'Linz' }), 'Linz', 'a town alone still routes');
eq(jobAddress({}), '', 'nothing in gives nothing out');
eq(jobAddress({ site_address: 'Weg 1', site_postal_code: '4020' }), 'Weg 1, 4020',
   'a postal code with no town is still worth sending');

console.log('\n── the link ──');
ok(routeHref({ site_address: 'Seestraße 4', site_city: 'Wien' })
     .startsWith('https://www.google.com/maps/dir/?api=1&destination='),
   'Google Maps directions, in the documented cross-platform form');
eq(routeHref({ site_address: 'Seestraße 4', site_postal_code: '1010', site_city: 'Wien' }),
   'https://www.google.com/maps/dir/?api=1&destination=Seestra%C3%9Fe%204%2C%201010%20Wien',
   'umlauts, the ß, spaces and the comma are all encoded');
eq(routeHref({ site_lat: 48.2082, site_lng: 16.3738, site_address: 'Seestraße 4' }),
   'https://www.google.com/maps/dir/?api=1&destination=48.2082,16.3738',
   'coordinates beat the address string when we have them');
eq(routeHref({ site_lat: 0, site_lng: 0, site_address: 'Seestraße 4', site_city: 'Wien' }),
   'https://www.google.com/maps/dir/?api=1&destination=Seestra%C3%9Fe%204%2C%20Wien',
   'null island is not a destination — fall back to the address');
eq(routeHref({ site_lat: null, site_lng: null, site_city: 'Wien' }),
   'https://www.google.com/maps/dir/?api=1&destination=Wien',
   'missing coordinates are not coordinates');
eq(routeHref({ site_lat: 'nonsense', site_lng: 'nonsense', site_city: 'Wien' }),
   'https://www.google.com/maps/dir/?api=1&destination=Wien',
   'unparseable coordinates are not coordinates');
eq(routeHref({}), null, 'no address at all gives null, not a search for nothing');
eq(routeHref({ site_address: '   ' }), null, 'whitespace is not an address');
eq(routeHref(), null, 'called with nothing at all');

console.log('\n── an address that would break a URL ──');
const nasty = routeHref({ site_address: 'A&B Straße #3?x=1', site_city: 'Wien' });
ok(!/[&?#]/.test(nasty.split('destination=')[1]),
   `ampersand, hash and question mark cannot escape the parameter\n        ${nasty}`);

console.log(`\n${fail ? 'FAILURES' : 'ALL PASS'}  (${pass + fail} checks)`);
process.exit(fail ? 1 : 0);
