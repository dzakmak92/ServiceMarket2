/**
 * Angefangene Kalkulationen ("Entwürfe"), für alle Gewerke.
 *
 * Eine Kalkulation wird nach jeder Änderung hier gesichert, ohne Nachfrage.
 * Die Angebotsseite zeigt sie im Tab "Entwürfe"; "Weiter" öffnet sie wieder
 * (`/estimate/{trade}?draft={id}`). Wird daraus ein Angebot, verschwindet sie.
 * Unberührt nach 30 Tagen fällt sie heraus.
 *
 * Heute im Browser (localStorage). Das ist die einzige Stelle, die das weiß:
 * für den Abgleich zwischen Geräten werden nur diese Funktionen auf eine
 * Server-Route umgestellt.
 *
 * Eintrag: { id, kind: 'folierung' | 'estimate', trade, title, sub, step,
 *            steps, net, updatedAt, payload }
 */
const KEY = 'sm_calc_drafts_v1';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DRAFTS_EVENT = 'sm-drafts';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* privat oder voll */ }
  try { window.dispatchEvent(new Event(DRAFTS_EVENT)); } catch { /* kein window */ }
}

export function listDrafts() {
  const now = Date.now();
  const all = read();
  const fresh = all.filter((d) => now - new Date(d.updatedAt).getTime() < MAX_AGE_MS);
  if (fresh.length !== all.length) write(fresh);
  return fresh.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getDraft(id) { return read().find((d) => d.id === id) || null; }

export function newDraftId() { return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; }

export function saveDraft(entry) {
  const list = read().filter((d) => d.id !== entry.id);
  list.push({ ...entry, updatedAt: new Date().toISOString() });
  write(list);
}

export function removeDraft(id) { write(read().filter((d) => d.id !== id)); }

export function restoreDraft(entry) { if (entry) write([...read().filter((d) => d.id !== entry.id), entry]); }
