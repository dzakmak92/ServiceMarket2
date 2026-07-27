import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../api/client';
import { toast } from 'sonner';

/**
 * Real-time notification hook.
 *
 * Strategy: open a Server-Sent Events stream to /api/notifications/stream (sub-second push)
 * AND keep a slow polling fallback (every 90s) to recover from disconnects, paused tabs,
 * or proxy buffering issues. On any new unread notification, fire a browser desktop
 * Notification (when permission is granted AND the tab is hidden).
 */
export function useNotifications(user) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default'
  );
  const seenIds = useRef(new Set());
  const eventSourceRef = useRef(null);

  const requestPermission = async () => {
    if (!('Notification' in window)) return 'denied';
    const p = await Notification.requestPermission();
    setPermission(p);
    return p;
  };

  const showDesktopNotification = useCallback(
    (n) => {
      if (permission !== 'granted' || !('Notification' in window)) return;
      if (document.visibilityState === 'visible') return;
      try {
        const note = new Notification(n.title || 'ServiceMarket', {
          body: n.body || '',
          tag: n.id,
          icon: '/favicon.ico',
        });
        note.onclick = () => {
          window.focus();
          if (n.link_to) window.location.href = n.link_to;
        };
      } catch {
        /* iOS Safari may throw; ignore */
      }
    },
    [permission]
  );

  const ingest = useCallback(
    (list, { firstLoad = false } = {}) => {
      setNotifications(list);
      setUnreadCount(list.filter((x) => !x.is_read).length);

      if (firstLoad) {
        list.forEach((n) => seenIds.current.add(n.id));
        return;
      }
      list.forEach((n) => {
        if (!seenIds.current.has(n.id) && !n.is_read) {
          showDesktopNotification(n);
          // In-app toast pop-up — visible regardless of tab focus (iter45)
          try {
            const isImportant = ['support_resolved', 'support_closed', 'fee_cancelled', 'fee_adjusted', 'pay_link_shared'].includes(n.kind);
            const toastFn = isImportant ? toast.success : toast;
            toastFn(n.title || 'Notification', {
              description: (n.body || '').slice(0, 240),
              duration: isImportant ? 6500 : 4500,
              action: n.link_to ? { label: 'Open', onClick: () => { window.location.href = n.link_to; } } : undefined,
            });
          } catch {
            /* sonner not mounted yet */
          }
        }
        seenIds.current.add(n.id);
      });
    },
    [showDesktopNotification]
  );

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/api/notifications');
      ingest(data.notifications || [], { firstLoad: seenIds.current.size === 0 });
    } catch {
      /* silent */
    }
  }, [user, ingest]);

  useEffect(() => {
    if (!user) return;
    // 1) initial fetch + slow polling fallback (every 90s)
    refresh();
    const t = setInterval(refresh, 90_000);

    // 2) open SSE stream for instant pushes
    const base = process.env.REACT_APP_BACKEND_URL || '';
    const url = `${base}/api/notifications/stream`;
    let es;
    try {
      es = new EventSource(url, { withCredentials: true });
      eventSourceRef.current = es;
      es.addEventListener('notification', (evt) => {
        try {
          const n = JSON.parse(evt.data);
          // Single-item update — also refresh full list so unread count is correct
          if (!seenIds.current.has(n.id)) {
            seenIds.current.add(n.id);
            showDesktopNotification(n);
            setNotifications((curr) => [n, ...curr.filter((x) => x.id !== n.id)]);
            setUnreadCount((c) => c + 1);
          }
        } catch {
          /* malformed event */
        }
      });
      es.onerror = () => {
        // Browser auto-reconnects; nothing to do.
      };
    } catch {
      /* SSE not supported — polling handles it */
    }

    return () => {
      clearInterval(t);
      try { es?.close(); } catch { /* noop */ }
    };
  }, [user, refresh, showDesktopNotification]);

  const markOneRead = async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((x) => (x.id === id ? { ...x, is_read: true } : x))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* noop */
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/api/notifications/read-all');
      setUnreadCount(0);
      setNotifications((n) => n.map((x) => ({ ...x, is_read: true })));
    } catch {
      /* noop */
    }
  };

  const clearAll = async () => {
    try {
      await api.delete('/api/notifications');
      setNotifications([]);
      setUnreadCount(0);
      seenIds.current = new Set();
    } catch {
      /* noop */
    }
  };

  return {
    notifications,
    unreadCount,
    permission,
    requestPermission,
    refresh,
    markOneRead,
    markAllRead,
    clearAll,
  };
}
