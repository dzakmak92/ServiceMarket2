/**
 * Which build this is.
 *
 * Two different facts, and they are both worth having:
 *
 *  · `version` / `sha` / `at` are compiled in by `craco.config.js` and describe
 *    the bundle that was deployed — the commit, and when it was built.
 *  · `asset` is read out of the DOM and describes the bundle *this tab is
 *    actually executing*. A phone that has had the app open for a week is
 *    running whatever it loaded that day, which is exactly the case where
 *    "which version are you on" needs an honest answer. `UpdatePrompt` uses
 *    the same fact to offer a reload.
 *
 * They agree on a freshly loaded tab and disagree on a stale one, and the
 * settings screen shows the disagreement rather than hiding it.
 */

const FALLBACK = { version: '0.0.0', sha: 'dev', at: null };

function stamp() {
  try {
    return { ...FALLBACK, ...JSON.parse(process.env.REACT_APP_BUILD) };
  } catch {
    /* Jest, or a bundler that did not run the define plugin. Neither is a
       failure worth throwing a settings page away for. */
    return FALLBACK;
  }
}

export const BUILD = stamp();

/** The hashed entry file this document loaded, e.g. `main.6f3a1c2b`. */
export function runningAsset() {
  const js = document.querySelector('script[src*="/static/js/main."]');
  if (!js) return null;                    // dev server: unhashed bundle
  const m = /main\.([a-z0-9]+)\.js/i.exec(js.getAttribute('src') || '');
  return m ? m[1] : null;
}

/** `0.1.0 · 462f7d7` — short enough for a row, precise enough to act on. */
export function buildLabel() {
  return `${BUILD.version} · ${BUILD.sha}`;
}
