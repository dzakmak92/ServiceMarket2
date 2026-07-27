/* ServiceMarket Web Push Service Worker
 * Receives push events from the browser's push service (FCM / Mozilla / Apple Push)
 * and shows a notification even when the page/browser is closed.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'ServiceMarket', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'ServiceMarket';
  const body = data.body || '';
  const url = data.url || '/';
  const tag = data.tag || 'servicemarket';
  // requireInteraction makes the notif stay until the user dismisses or clicks
  // (key for high-priority server messages like a shared invoice).
  const requireInteraction = !!data.requireInteraction;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
      vibrate: [80, 40, 80],
      renotify: requireInteraction,
      requireInteraction,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      // If an app tab is already open, focus + navigate it
      for (const client of clientsArr) {
        try {
          const u = new URL(client.url);
          if (u.origin === self.location.origin) {
            client.focus();
            client.postMessage({ type: 'navigate', url: targetUrl });
            // Best-effort navigation if supported
            if ('navigate' in client) {
              return client.navigate(targetUrl).catch(() => {});
            }
            return;
          }
        } catch {
          /* ignore bad URL */
        }
      }
      // Otherwise open a new tab on our origin
      return self.clients.openWindow(targetUrl);
    })
  );
});

// Handle a server-pushed instruction to refresh subscription (Optional, future use)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.getSubscription().then(() => {
      // The client will resubscribe on next page load
    })
  );
});
