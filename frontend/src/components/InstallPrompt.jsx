import React, { useState, useEffect } from 'react';
import { useLang } from '../contexts/LangContext';
import { X, Share, PlusSquare } from 'lucide-react';

/**
 * InstallPrompt — shown once on iOS Safari when the app is NOT already running
 * as a standalone PWA. Guides users to "Add to Home Screen" so that Web Push
 * notifications work on iOS 16.4+.
 *
 * On Android / desktop Chrome the browser shows its own native install prompt
 * via the `beforeinstallprompt` event, which we also handle here.
 */
export default function InstallPrompt() {
  const { t } = useLang();
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // Already installed as PWA — don't show
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone) return; // iOS standalone
    // User dismissed before
    if (localStorage.getItem('install_prompt_dismissed')) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    if (ios) {
      // iOS Safari: show our custom guide after 3s
      // Named `timer`, not `t`: `t` is the translator in this component and a
      // local one here is a trap for whoever next adds a string to this block.
      const timer = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android / Chrome: capture the browser event
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem('install_prompt_dismissed', '1');
  };

  const installAndroid = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem('install_prompt_dismissed', '1');
    }
    setDeferredPrompt(null);
    setShow(false);
  };

  if (!show) return null;

  /* Positioned by the stack in App.js rather than by itself. This used to be
     `fixed bottom-20`, and so is the update banner, which put the two of them
     on exactly the same 20 px of screen whenever both had something to say. */
  return (
    <div
      className="pointer-events-auto bg-paper border border-sm-border rounded-2xl shadow-2xl p-4"
      data-testid="install-prompt"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <img src="/icon-192.png" alt="ServiceMarket" className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-headings font-bold text-ink text-sm">{t('install_title')}</p>
            <p className="text-xs text-ink-muted leading-snug mt-0.5">
              {isIOS
                ? 'Install the app to receive push notifications when you get new messages or quotes.'
                : 'Install ServiceMarket for instant push notifications on new messages and quotes.'}
            </p>
          </div>
        </div>
        <button onClick={dismiss} className="p-1 text-ink-muted hover:text-ink flex-shrink-0" aria-label={t('ui_dismiss')}>
          <X size={16} />
        </button>
      </div>

      {isIOS ? (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft bg-cream-soft rounded-xl px-3 py-2">
          <span>{t('install_tap')}</span>
          <Share size={13} className="text-teal flex-shrink-0" />
          <span>then</span>
          <PlusSquare size={13} className="text-teal flex-shrink-0" />
          <span className="font-semibold text-ink">{t('install_then')}</span>
        </div>
      ) : (
        <button
          onClick={installAndroid}
          className="mt-3 w-full btn-primary text-sm py-2"
          data-testid="install-prompt-install-btn"
        >
          {t('install_app')}
        </button>
      )}
    </div>
  );
}
