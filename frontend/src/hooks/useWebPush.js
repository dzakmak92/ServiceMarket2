import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

/**
 * useWebPush — registers /sw.js, subscribes the browser to the backend's VAPID
 * push service, and persists the subscription server-side.
 *
 * Returns:
 *  - supported:    boolean — feature is available in this browser
 *  - permission:   'default' | 'granted' | 'denied'
 *  - enabled:      boolean — there's an active subscription
 *  - busy:         boolean
 *  - subscribe()
 *  - unsubscribe()
 *  - sendTest()    — triggers POST /api/push/test
 *
 * Notes:
 *  - Only mounted when `user` is truthy.
 *  - Idempotent: subscribe() returns immediately if a subscription already exists.
 */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function useWebPush(user) {
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const [permission, setPermission] = useState(
    supported ? Notification.permission : 'denied'
  );
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  // Boot: register SW + check existing subscription
  useEffect(() => {
    if (!supported || !user) return;
    let cancelled = false;
    (async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setEnabled(!!sub);
      } catch {
        /* SW unsupported / blocked — silently fall back */
      }
    })();
    return () => { cancelled = true; };
  }, [supported, user]);

  // Listen for in-app navigation requests posted from the SW notification-click
  useEffect(() => {
    if (!supported) return;
    const handler = (e) => {
      const url = e?.data?.type === 'navigate' && e.data.url;
      if (url) {
        window.location.href = url;
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) return { ok: false, reason: 'unsupported' };
    setBusy(true);
    try {
      // 1) Ensure permission
      let perm = Notification.permission;
      if (perm !== 'granted') {
        perm = await Notification.requestPermission();
        setPermission(perm);
      }
      if (perm !== 'granted') return { ok: false, reason: 'denied' };

      // 2) Get VAPID public key
      const { data: keyData } = await api.get('/api/push/public-key');
      const applicationServerKey = urlBase64ToUint8Array(keyData.public_key);

      // 3) Subscribe
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const json = sub.toJSON();
      await api.post('/api/push/subscribe', {
        endpoint: json.endpoint,
        keys: json.keys,
      });

      setEnabled(true);
      return { ok: true };
    } catch (e) {
      console.error('Push subscribe failed:', e);
      return { ok: false, reason: e?.message || 'unknown' };
    } finally {
      setBusy(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      } else {
        await api.post('/api/push/unsubscribe', {}).catch(() => {});
      }
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, [supported]);

  const sendTest = useCallback(async () => {
    try {
      await api.post('/api/push/test');
      return true;
    } catch {
      return false;
    }
  }, []);

  return { supported, permission, enabled, busy, subscribe, unsubscribe, sendTest };
}
