import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLang } from '../contexts/LangContext';

/**
 * Tells the person a newer build is deployed, and reloads when they say so.
 *
 * A tradesperson keeps this open on a phone for days — the app is a home-screen
 * icon, and a tab that is never closed is a tab still running whatever was
 * deployed the week it was opened. Every fix we ship reaches them only when
 * something happens to reload the page, and nothing reliably does. This is what
 * makes a deploy arrive.
 *
 * **How it knows.** No build-time version constant and no extra endpoint: the
 * hashed entry files *are* the version. `currentBuild()` reads the ones this
 * document actually loaded out of the DOM, and `deployedBuild()` reads the ones
 * the server is handing out now from CRA's own `asset-manifest.json`. Different
 * pair, different build.
 *
 * Reading the running build from the DOM rather than from a constant compiled
 * into the bundle matters for the case this exists for: a tab holding an
 * `index.html` that came out of the browser cache. Either way the script tag on
 * the page is the truth about what this tab is executing.
 *
 * **It never reloads on its own.** The button is the whole point. A reload
 * throws away anything half-typed — a calculation in progress, a quote being
 * edited — and choosing that moment belongs to the person doing the work, not
 * to a poll that happened to fire. Dismissing sets it aside for this build
 * only: a further deploy asks again, and so does the next page load, because
 * "later" is not "never".
 */

/* Five minutes, and only while the tab is on screen. The thing being detected
   changes a few times a day at most, and a phone in a pocket should not be
   spending its battery asking. */
const EVERY_MS = 5 * 60 * 1000;

function currentBuild() {
  const js = document.querySelector('script[src*="/static/js/main."]');
  /* The dev server serves an unhashed bundle, so there is nothing to compare
     and nothing to detect. Returning null switches the whole component off
     rather than having it poll a manifest that does not exist. */
  if (!js) return null;
  const css = document.querySelector('link[rel="stylesheet"][href*="/static/css/main."]');
  return `${js.getAttribute('src')}|${css ? css.getAttribute('href') : ''}`;
}

async function deployedBuild() {
  const res = await fetch(`/asset-manifest.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  /* `vercel.json` rewrites everything unmatched to `/index.html`, so a missing
     manifest comes back as 200 text/html rather than a 404. Without this check
     the JSON parse throws on every single poll. */
  if (!(res.headers.get('content-type') || '').includes('json')) return null;
  const manifest = await res.json();
  const files = manifest && manifest.files;
  if (!files || !files['main.js']) return null;
  return `${files['main.js']}|${files['main.css'] || ''}`;
}

export default function UpdatePrompt() {
  const { t } = useLang();
  const [waiting, setWaiting] = useState(null);   // the build we are offering
  const mine = useRef(currentBuild());
  const setAside = useRef(null);

  useEffect(() => {
    if (!mine.current) return undefined;
    let live = true;

    const look = async () => {
      if (document.visibilityState !== 'visible') return;
      let deployed;
      try {
        deployed = await deployedBuild();
      } catch {
        /* Offline, or the network dropped mid-request. Not an error worth
           showing anybody — the next poll will find out. */
        return;
      }
      if (!live || !deployed || deployed === mine.current) return;
      if (deployed === setAside.current) return;
      setWaiting(deployed);
    };

    /* Once now, then on a timer, then whenever the tab comes back — the last
       one is what catches a phone that was in a pocket over a deploy. */
    look();
    const timer = setInterval(look, EVERY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') look(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const later = useCallback(() => {
    setAside.current = waiting;
    setWaiting(null);
  }, [waiting]);

  if (!waiting) return null;

  return (
    <div
      className="pointer-events-auto bg-paper border border-sm-border rounded-2xl shadow-2xl p-4"
      role="status"
      data-testid="update-prompt"
    >
      <div className="flex items-start gap-2.5">
        <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal flex items-center
                         justify-center flex-shrink-0">
          <RefreshCw size={18} />
        </span>
        <div className="min-w-0">
          <p className="font-headings font-bold text-ink text-sm">{t('upd_title')}</p>
          <p className="text-xs text-ink-muted leading-snug mt-0.5">{t('upd_body')}</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={later}
          className="flex-1 min-h-[44px] rounded-xl border border-sm-border text-ink-muted
                     hover:text-ink font-bold text-sm"
          data-testid="update-prompt-later"
        >
          {t('upd_later')}
        </button>
        <button
          onClick={() => window.location.reload()}
          className="flex-1 btn-primary text-sm min-h-[44px]"
          data-testid="update-prompt-reload"
        >
          {t('upd_confirm')}
        </button>
      </div>
    </div>
  );
}
