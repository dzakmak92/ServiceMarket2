import api from './client';

/**
 * Stored files.
 *
 * Objects in Supabase Storage are private, so there is no permanent URL to
 * put in a src attribute. What a row stores is a `storage_ref` — a stable
 * bucket/key pair — and a viewable URL is minted on demand and expires.
 *
 * The distinction matters because getting it wrong is invisible for an hour.
 * Storing the signed URL works perfectly in testing and renders a broken
 * image the next morning, which is precisely how the previous generation of
 * this code failed: material photos held "/api/uploads/<id>" strings pointing
 * at a GridFS that no longer exists.
 */

const TTL_SECONDS = 3600;
// Re-sign a minute early rather than racing the expiry on a slow connection.
const REFRESH_MS = (TTL_SECONDS - 60) * 1000;

const cache = new Map();   // storage_ref -> { url, at }

/** True for anything this module can actually sign. */
export function isStorageRef(ref) {
  return typeof ref === 'string' && ref.includes('/') && !ref.startsWith('/') && !ref.startsWith('http');
}

/**
 * A viewable URL for a stored object, or null.
 *
 * Never throws: a missing file must cost a thumbnail, not the screen it sits
 * on. Legacy values — absolute URLs, or the old "/api/uploads/<id>" form —
 * are passed through or dropped rather than sent to the signing endpoint.
 */
export async function signedUrl(ref) {
  if (!ref) return null;
  if (typeof ref === 'string' && ref.startsWith('http')) return ref;
  if (!isStorageRef(ref)) return null;

  const hit = cache.get(ref);
  if (hit && Date.now() - hit.at < REFRESH_MS) return hit.url;

  try {
    const { data } = await api.get('/api/uploads/signed', {
      params: { storage_ref: ref, ttl: TTL_SECONDS },
    });
    if (!data?.url) return null;
    cache.set(ref, { url: data.url, at: Date.now() });
    return data.url;
  } catch {
    return null;
  }
}

/** Resolve many at once, preserving order; unsignable entries become null. */
export async function signedUrls(refs) {
  return Promise.all((refs || []).map(signedUrl));
}

export function forget(ref) {
  cache.delete(ref);
}
