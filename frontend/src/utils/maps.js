/**
 * Getting the van to the job.
 *
 * One place, because the Route button exists twice — on the job card in the
 * day view and in the job sheet — and the two had drifted into pointing at
 * different things.
 */

/** The destination as a person would write it on an envelope.
 *
 *  Postal code included on purpose. "Hauptstraße 4, Wien" is ambiguous
 *  across a dozen districts and a handful of other Wiens; "Hauptstraße 4,
 *  1010 Wien" is not. The job's own site address wins over the customer's
 *  billing address — the work happens at the site, and for a landlord or a
 *  property manager those are routinely different towns.
 */
export function jobAddress(appt = {}) {
  const street = appt.site_address || appt.customer_address;
  const zip = appt.site_address ? appt.site_postal_code : appt.customer_postal_code;
  const city = appt.site_address ? appt.site_city : appt.customer_city;
  /* Fall back to whichever city we have if the address came from neither
     side cleanly — a town alone still routes better than nothing. */
  const town = [zip, city || appt.site_city || appt.customer_city]
    .filter(Boolean).join(' ');
  return [street, town].filter(Boolean).join(', ').trim();
}

/** A Google Maps *directions* link, or null when there is nowhere to go.
 *
 *  Directions rather than a pin: the pro taps this on the way out of the
 *  yard, and a map centred on the customer with no route on it just means
 *  one more tap. `api=1` is Google's documented cross-platform form — the
 *  same URL opens the app on Android and iOS and the site on a desktop, so
 *  there is no user-agent sniffing here.
 *
 *  Coordinates beat the address string whenever we have them. A geocoder
 *  given "Bahnhofstraße 12" will find *a* Bahnhofstraße 12; there are
 *  several hundred in Austria alone.
 *
 *  Returns null rather than a search for an empty string. A Route button
 *  that opens Google Maps showing nothing is a dead end, and the caller
 *  needs to be able to tell that there is nothing to link to.
 */
export function routeHref(appt = {}) {
  const lat = Number(appt.site_lat);
  const lng = Number(appt.site_lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  const where = jobAddress(appt);
  if (!where) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}`;
}
