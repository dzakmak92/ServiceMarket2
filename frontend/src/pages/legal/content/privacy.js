/**
 * Privacy Policy, assembled from one file per language.
 *
 * Split by language rather than kept in one object because each version is
 * ~180 lines of prose and a four-language object is unreadable in a diff:
 * changing one clause should show as a change to four files, one per language,
 * not as four edits scattered through a thousand-line literal.
 */
import { EN } from './privacy.en.js';
import { DE } from './privacy.de.js';
import { TR } from './privacy.tr.js';
import { ES } from './privacy.es.js';

export const PRIVACY = { en: EN, de: DE, tr: TR, es: ES };
