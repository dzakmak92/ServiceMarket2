/**
 * The version this build reports.
 *
 * Baked in from `frontend/package.json` by `craco.config.js`, so the number
 * shown on a phone is the number that was released — bump it in package.json
 * and the next build carries it.
 */
export const APP_VERSION = process.env.REACT_APP_VERSION || '0.0.0';
