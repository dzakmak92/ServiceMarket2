/**
 * Wo die Preiseinstellungen und gespeicherten Kalkulationen liegen.
 *
 * Heute: localStorage. Das ist bewusst die einzige Stelle, die das weiß.
 * Wenn das Backend kommt (siehe memory/FOLIERUNG.md: `folierung_settings`,
 * `folierung_calcs`, `GET /api/public/folie/{slug}`), werden nur diese vier
 * Funktionen auf `api` umgestellt; Wizard, Preisseite und öffentliche Seite
 * bleiben, wie sie sind.
 *
 * Freischaltung: das Modul ist für genau die Profile sichtbar, die in
 * REACT_APP_FOLIERUNG_USERS stehen (kommagetrennte E-Mails). Ohne Variable
 * gilt die Vorgabe unten: der Betrieb, für den das Modul gebaut wurde. Ein
 * Admin sieht es immer.
 */
import { DEFAULT_SETTINGS } from './pricing';

const SETTINGS_KEY = 'folierung_settings_v1';
const CALCS_KEY = 'folierung_calcs_v1';

const ALLOWED = (process.env.REACT_APP_FOLIERUNG_USERS || 'dzakmak92@gmail.com')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export function canUseFolierung(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'tradesperson') return false;
  return ALLOWED.includes(String(user.email || '').toLowerCase());
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privat / voll: dann eben nicht */ }
}

/** Einstellungen, vollständig: gespeicherte Werte über den Vorgaben, verschachtelt gemischt. */
export function loadSettings() {
  const saved = read(SETTINGS_KEY, null);
  if (!saved) return structuredClone(DEFAULT_SETTINGS);
  const out = { ...DEFAULT_SETTINGS, ...saved };
  for (const k of ['decors', 'primers', 'consumables', 'travel', 'extras', 'conditions']) {
    out[k] = { ...DEFAULT_SETTINGS[k], ...(saved[k] || {}) };
    if (k === 'decors' || k === 'primers') {
      for (const id of Object.keys(DEFAULT_SETTINGS[k])) out[k][id] = { ...DEFAULT_SETTINGS[k][id], ...(saved[k]?.[id] || {}) };
    }
  }
  return out;
}

export function saveSettings(settings) { write(SETTINGS_KEY, settings); return settings; }
export function resetSettings() { try { localStorage.removeItem(SETTINGS_KEY); } catch { /* s.o. */ } return structuredClone(DEFAULT_SETTINGS); }

/** Gespeicherte Kalkulationen des Betriebs, neueste zuerst. */
export function loadCalcs() { return read(CALCS_KEY, []); }
export function saveCalc(entry) {
  const list = [{ id: `c_${Date.now()}`, at: new Date().toISOString(), ...entry }, ...loadCalcs()].slice(0, 50);
  write(CALCS_KEY, list);
  return list;
}
export function deleteCalc(id) {
  const list = loadCalcs().filter((c) => c.id !== id);
  write(CALCS_KEY, list);
  return list;
}
