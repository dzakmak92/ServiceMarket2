/**
 * Offline write queue.
 *
 * Field capture happens where the signal does not: Sanitär cellars, new-build
 * sites, rural gardens. A write that fails there must not be lost, and must
 * not be applied twice when it eventually goes through.
 *
 * Two rules make that safe, and both matter:
 *
 *  1. Only *idempotent* operations may be queued. Every enqueued request
 *     carries a client-chosen id that the server uses as the row key, so a
 *     replay lands once. Queueing a plain POST would turn one flaky
 *     connection into two diary entries.
 *  2. Order is preserved. Entries replay oldest-first and a failure stops the
 *     flush, because a later write may depend on an earlier one having landed.
 *
 * Raw IndexedDB rather than a wrapper library: this is perhaps eighty lines of
 * the API and the dependency would be larger than the code.
 */

/**
 * A client-chosen row id. Part of the replay contract, so it lives here
 * rather than in a util: an enqueued write without one is not safe to retry.
 */
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Older Safari. Not cryptographically strong, but this only needs to be
  // unique among one device's unsent writes.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const DB_NAME = 'sm-offline';
const DB_VERSION = 1;
const STORE = 'writes';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // autoIncrement gives a monotonic key, which is what preserves replay
        // order — timestamps collide when several writes happen in one second.
        db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    try {
      out = fn(store);
    } catch (e) {
      reject(e);
      return;
    }
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Queue a request for later. `body` must already carry its client_id. */
export async function enqueue(entry) {
  const db = await openDb();
  const record = {
    method: (entry.method || 'post').toLowerCase(),
    url: entry.url,
    body: entry.body ?? null,
    label: entry.label || entry.url,
    queued_at: new Date().toISOString(),
    attempts: 0,
  };
  await tx(db, 'readwrite', (s) => s.add(record));
  return record;
}

export async function list() {
  const db = await openDb();
  return tx(db, 'readonly', (s) => s.getAll());
}

export async function count() {
  try {
    return (await list()).length;
  } catch {
    return 0;
  }
}

async function remove(seq) {
  const db = await openDb();
  return tx(db, 'readwrite', (s) => s.delete(seq));
}

async function bump(record) {
  const db = await openDb();
  return tx(db, 'readwrite', (s) => s.put({ ...record, attempts: record.attempts + 1 }));
}

// A request that the server actively rejected will be rejected again — the
// payload is wrong, not the network. Keeping it would block every later write
// behind it forever, so it is dropped and reported.
function isPermanent(status) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

let flushing = false;

/**
 * Replay queued writes oldest-first.
 *
 * Stops at the first network failure: the connection is evidently still down,
 * and continuing would burn attempts on every remaining entry.
 */
export async function flush(api) {
  if (flushing || typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, dropped: 0, remaining: await count() };
  }
  flushing = true;
  let sent = 0;
  let dropped = 0;
  try {
    const entries = (await list()).sort((a, b) => a.seq - b.seq);
    for (const entry of entries) {
      try {
        await api.request({ method: entry.method, url: entry.url, data: entry.body });
        await remove(entry.seq);
        sent += 1;
      } catch (err) {
        const status = err?.response?.status;
        if (status && isPermanent(status)) {
          await remove(entry.seq);
          dropped += 1;
          continue;
        }
        await bump(entry);
        break;  // still offline, or the server is down — try again later
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, dropped, remaining: await count() };
}

/** Flush now, and whenever the browser regains connectivity. */
export function startAutoFlush(api) {
  if (typeof window === 'undefined') return () => {};
  const run = () => { flush(api).catch(() => {}); };
  window.addEventListener('online', run);
  // Coming back to the app is as good a signal as the online event, which
  // some mobile browsers fire unreliably after a screen lock.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
  run();
  return () => window.removeEventListener('online', run);
}

/**
 * Send now, or queue if the network is the reason it failed.
 *
 * Returns {queued: true} when it was stored for later, so the caller can tell
 * the user their entry is saved but not yet sent — rather than showing a
 * success that has not happened.
 */
export async function sendOrQueue(api, { method = 'post', url, body, label }) {
  try {
    const res = await api.request({ method, url, data: body });
    return { queued: false, data: res.data };
  } catch (err) {
    // A response means the server was reached and disagreed; that is a real
    // error and must surface, not be hidden in a queue.
    if (err?.response) throw err;
    await enqueue({ method, url, body, label });
    return { queued: true, data: null };
  }
}
