import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';

import ThreadList from './inbox/ThreadList';
import ConversationHeader from './inbox/ConversationHeader';
import ContactBar from './inbox/ContactBar';
import ConversationTopPanel from './inbox/ConversationTopPanel';
import MessageList from './inbox/MessageList';
import ConversationComposer from './inbox/ConversationComposer';
import ShareLocationModal from './inbox/ShareLocationModal';

import { Loader2, MessageSquare } from 'lucide-react';

const cleanPhone = (p) => (p || '').replace(/[^0-9+]/g, '');
const waLink = (p) => {
  const clean = cleanPhone(p);
  return clean ? `https://wa.me/${clean.replace('+', '')}` : null;
};
const mapsLink = (addr) =>
  addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : null;

export default function InboxPage() {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();

  // Read deep-link from URL synchronously so the conversation pane is rendered
  // from the first paint (no flash of thread-list before redirect).
  const initialDeepLink = (() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get('job');
    const toId = params.get('to');
    return (jobId && toId) ? { job_id: jobId, other_user_id: toId, job_title: '', other_name: '' } : null;
  })();

  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeThread, setActiveThread] = useState(initialDeepLink);
  const [threadLoading, setThreadLoading] = useState(!!initialDeepLink);  // ← deep-link spinner shows from frame 1

  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [job, setJob] = useState(null);
  const [avail, setAvail] = useState([]);
  const [proBookings, setProBookings] = useState([]);
  const [contactInfo, setContactInfo] = useState(null);
  const [hasToolkit, setHasToolkit] = useState(false);

  useEffect(() => {
    if (user?.role !== 'tradesperson') { setHasToolkit(false); return; }
    let cancelled = false;
    api.get('/api/profile/pro')
      .then((r) => { if (!cancelled) setHasToolkit(!!r.data?.has_invoice_toolkit); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  const [newMsg, setNewMsg] = useState('');
  const [newAttachments, setNewAttachments] = useState([]);
  const [sending, setSending] = useState(false);

  const [translatedTexts, setTranslatedTexts] = useState({});
  const [translatingId, setTranslatingId] = useState(null);

  // Share-location modal
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState('');

  // Live location (TP only)
  const [liveSessionId, setLiveSessionId] = useState(null);
  const liveWatchRef = React.useRef(null);
  const liveIntervalRef = React.useRef(null);

  const startLiveLocation = async () => {
    if (!activeThread?.job_id) return;
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { data } = await api.post('/api/live-location', {
            job_id: activeThread.job_id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setLiveSessionId(data.session_id);
          refreshMessages();
          // Push fresh GPS coords to server every 5 s
          liveIntervalRef.current = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
              async (p) => {
                if (data.session_id) {
                  await api.patch(`/api/live-location/${data.session_id}`, {
                    lat: p.coords.latitude, lng: p.coords.longitude,
                  }).catch(() => {});
                }
              },
              () => {},
              { enableHighAccuracy: true, timeout: 4_000 }
            );
          }, 5_000);
        } catch (e) {
          alert(e.response?.data?.detail || 'Could not start live location sharing.');
        }
      },
      () => { alert('Location permission denied. Please enable it in your browser settings.'); },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  const stopLiveLocation = async () => {
    if (!liveSessionId) return;
    clearInterval(liveIntervalRef.current);
    liveIntervalRef.current = null;
    try {
      await api.delete(`/api/live-location/${liveSessionId}`);
    } catch { /* noop */ }
    setLiveSessionId(null);
    refreshMessages();
  };

  // Clean up geolocation watcher on unmount or thread change
  React.useEffect(() => {
    return () => {
      clearInterval(liveIntervalRef.current);
      if (liveWatchRef.current != null) navigator.geolocation?.clearWatch(liveWatchRef.current);
    };
  }, []);

  // ──────────────────────────────────────────────
  // Effects
  // ──────────────────────────────────────────────
  useEffect(() => { fetchThreads(); }, []);

  // On mount: if URL has a deep-link, open that thread immediately (before
  // threads list returns). This avoids a flash of the thread list.
  useEffect(() => {
    if (initialDeepLink) {
      openThread(initialDeepLink);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After threads load: handle deep-link in URL OR auto-open first thread.
  // The mount effect above already kicked off the API for initialDeepLink, so
  // we skip re-firing if the current active thread already matches the URL.
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(location.search);
    const jobId = params.get('job');
    const toId = params.get('to');
    if (jobId && toId) {
      // Already on this thread? do nothing.
      if (activeThread && activeThread.job_id === jobId && activeThread.other_user_id === toId) return;
      const found = threads.find((th) => th.job_id === jobId && th.other_user_id === toId);
      openThread(found || { job_id: jobId, other_user_id: toId, job_title: '', other_name: '' });
    } else if (!activeThread && threads.length > 0) {
      openThread(threads[0]);
    }
  }, [threads, loading, location.search]);  // eslint-disable-line react-hooks/exhaustive-deps

  // When threads list finally arrives, enrich the active thread with metadata
  // (other_name, other_pro_id, job_title) so the header doesn't show blanks.
  // IMPORTANT: depend only on the activeThread *identity* (job_id + other_user_id),
  // NOT on the whole activeThread object, otherwise we'd cause an infinite render
  // loop because the spread always produces a new object reference.
  useEffect(() => {
    if (!activeThread || threads.length === 0) return;
    const match = threads.find(
      (th) => th.job_id === activeThread.job_id && th.other_user_id === activeThread.other_user_id
    );
    if (!match) return;
    // Only merge when match actually provides info we don't yet have, so we
    // don't trigger a state update on every render of the parent.
    const needsEnrichment =
      (match.other_pro_id && !activeThread.other_pro_id) ||
      (match.other_name && !activeThread.other_name) ||
      (match.job_title && !activeThread.job_title) ||
      (match.thread_id && !activeThread.thread_id);
    if (needsEnrichment) {
      setActiveThread((t2) => ({ ...t2, ...match }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, activeThread?.job_id, activeThread?.other_user_id]);

  // ──────────────────────────────────────────────
  // Data fetchers
  // ──────────────────────────────────────────────
  const fetchThreads = async () => {
    try {
      const { data } = await api.get('/api/messages/threads');
      setThreads(data.threads || []);
    } catch { /* noop */ }
    finally { setLoading(false); }
  };

  const openThread = async (thread) => {
    setThreadLoading(true);
    // Reset everything from the previous thread BEFORE fetching the new one,
    // so the UI doesn't briefly show stale calendar/messages/job context.
    setActiveThread(thread);
    setMessages([]);
    setOtherUser(null);
    setJob(null);
    setAvail([]);
    setProBookings([]);
    setContactInfo(null);
    setTranslatedTexts({});
    try {
      const { data } = await api.get(`/api/messages/thread/${thread.job_id}/${thread.other_user_id}`);
      setMessages(data.messages || []);
      setOtherUser(data.other_user);
      setJob(data.job);
      setAvail(data.pro_availability || []);
      if (data.other_pro_id && !thread.other_pro_id) {
        setActiveThread((tx) => ({ ...tx, other_pro_id: data.other_pro_id }));
      }
      const proIdForBookings = data.other_pro_id || thread.other_pro_id;
      if (proIdForBookings) {
        try {
          const br = await api.get(`/api/pros/${proIdForBookings}/bookings`);
          setProBookings(br.data?.bookings || []);
        } catch { setProBookings([]); }
      }
      setThreads((ts) => ts.map((tt) =>
        tt.thread_id === thread.thread_id ? { ...tt, unread_count: 0 } : tt
      ));
      if (data.job && (data.job.status === 'in_progress' || data.job.status === 'completed')) {
        try {
          const cr = await api.get(`/api/jobs/${thread.job_id}/contact`);
          setContactInfo(cr.data);
        } catch { /* noop */ }
      }
    } finally {
      setThreadLoading(false);
    }
  };

  const refreshMessages = async () => {
    if (!activeThread) return;
    const { data } = await api.get(`/api/messages/thread/${activeThread.job_id}/${activeThread.other_user_id}`);
    setMessages(data.messages || []);
    if (activeThread.other_pro_id) {
      try {
        const br = await api.get(`/api/pros/${activeThread.other_pro_id}/bookings`);
        setProBookings(br.data?.bookings || []);
      } catch { /* noop */ }
    }
  };

  // ──────────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────────
  const sendMessage = async (kind = 'text', extra = {}) => {
    if (kind === 'text' && !newMsg.trim() && newAttachments.length === 0) return;
    setSending(true);
    try {
      const payload = {
        job_id: activeThread.job_id,
        to_id: activeThread.other_user_id,
        text: kind === 'text' ? newMsg : (extra.text || ''),
        kind,
        ...extra,
      };
      if (kind === 'text' && newAttachments.length > 0) payload.attachments = newAttachments;
      const { data } = await api.post('/api/messages', payload);
      setMessages((m) => [...m, data]);
      setNewMsg('');
      if (kind === 'text') setNewAttachments([]);
    } catch { /* noop */ }
    finally { setSending(false); }
  };

  const bookSlot = async (weekday, slot, dateObj) => {
    if (!activeThread?.other_pro_id) return;
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    try {
      await api.post('/api/bookings', {
        pro_id: activeThread.other_pro_id,
        job_id: activeThread.job_id,
        day: weekday, slot, date: isoDate,
      });
      await refreshMessages();
    } catch (e) {
      alert(e.response?.data?.detail || 'Could not book slot');
    }
  };

  const translateMessage = async (msgId, originalText) => {
    if (!originalText || translatingId) return;
    setTranslatingId(msgId);
    try {
      const { data } = await api.post('/api/translate', { text: originalText, target_lang: lang });
      setTranslatedTexts((t2) => ({ ...t2, [msgId]: data.translated }));
    } catch { /* noop */ }
    finally { setTranslatingId(null); }
  };

  const downloadICal = async (bookingId) => {
    try {
      const resp = await api.get(`/api/bookings/${bookingId}/ical`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `booking_${bookingId}.ics`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { /* noop */ }
  };

  const openProProfile = () => {
    if (activeThread?.other_user_id) navigate(`/pros/${activeThread.other_user_id}`);
  };

  const openShareLocationModal = () => {
    const seed = (user?.address && user.address.trim()) || job?.city || '';
    setAddressDraft(seed);
    setShareError('');
    setShareModalOpen(true);
  };

  const submitShareLocation = async () => {
    if (addressDraft.trim().length < 4) return;
    setShareLoading(true); setShareError('');
    try {
      await api.patch(`/api/jobs/${activeThread.job_id}/share-location`, {
        address_full: addressDraft.trim(),
      });
      setShareModalOpen(false);
      refreshMessages();
      // Refresh contact info
      const cr = await api.get(`/api/jobs/${activeThread.job_id}/contact`);
      setContactInfo(cr.data);
    } catch (e) {
      setShareError(e.response?.data?.detail || 'Could not share location');
    } finally {
      setShareLoading(false);
    }
  };

  // ──────────────────────────────────────────────
  // Derived
  // ──────────────────────────────────────────────
  const otherContact = contactInfo
    ? (user.role === 'homeowner' ? contactInfo.pro : contactInfo.homeowner)
    : null;
  const scheduleDisabled = !job || job.status === 'completed' || job.status === 'cancelled';

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100dvh-4rem-var(--mobile-nav-h))] md:h-[calc(100dvh-4rem)] bg-paper overflow-x-hidden" data-testid="inbox-shell">
      {/* Thread list */}
      <div className={`${activeThread ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-sm-border flex-col`}>
        <ThreadList
          threads={threads}
          activeThreadId={activeThread?.thread_id}
          loading={loading}
          onOpen={openThread}
          t={t}
        />
      </div>

      {/* Conversation area */}
      <div className={`${activeThread ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col bg-cream-soft overflow-x-hidden`}>
        {!activeThread ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare size={48} className="text-ink-muted mx-auto mb-3" />
              <p className="text-ink-muted">{t('no_messages')}</p>
            </div>
          </div>
        ) : threadLoading ? (
          <div className="flex-1 flex items-center justify-center" data-testid="thread-loading">
            <Loader2 size={28} className="text-teal animate-spin" />
          </div>
        ) : (
          <>
            <ConversationHeader
              otherUser={otherUser}
              activeThread={activeThread}
              job={job}
              t={t}
              onBack={() => setActiveThread(null)}
              onViewProfile={openProProfile}
              userRole={user?.role}
              hasToolkit={hasToolkit}
              myQuoteStatus={activeThread?.my_quote_status}
              onMarkLost={async () => {
                // Find the pro's own quote id on this job
                try {
                  const { data } = await api.get('/api/quotes');
                  const mine = (data.quotes || []).find((qq) => qq.job_id === activeThread.job_id);
                  if (!mine) return;
                  await api.post(`/api/quotes/${mine.id}/mark-lost`);
                  setActiveThread((th) => th ? { ...th, my_quote_status: 'lost' } : th);
                  fetchThreads();
                } catch { /* noop */ }
              }}
            />
            <ContactBar
              contactInfo={contactInfo}
              otherContact={otherContact}
              t={t}
            />
            <ConversationTopPanel
              activeThread={activeThread}
              job={job}
              userRole={user.role}
              avail={avail}
              proBookings={proBookings}
              scheduleDisabled={scheduleDisabled}
              onBook={bookSlot}
              t={t}
            />
            <MessageList
              messages={messages}
              currentUserId={user._id || user.id}
              translatedTexts={translatedTexts}
              translatingId={translatingId}
              onTranslate={translateMessage}
              onDownloadICal={downloadICal}
              mapsLink={mapsLink}
              t={t}
            />
            <ConversationComposer
              text={newMsg}
              setText={setNewMsg}
              attachments={newAttachments}
              setAttachments={setNewAttachments}
              onSend={() => sendMessage()}
              sending={sending}
              contactInfo={contactInfo}
              otherContact={otherContact}
              userRole={user.role}
              jobStatus={job?.status}
              mapsLink={mapsLink}
              cleanPhone={cleanPhone}
              waLink={waLink}
              onShareLocation={openShareLocationModal}
              isSharing={!!liveSessionId}
              onStartLiveLocation={startLiveLocation}
              onStopLiveLocation={stopLiveLocation}
              t={t}
            />
          </>
        )}
      </div>

      {/* Share Location modal */}
      <ShareLocationModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        addressDraft={addressDraft}
        setAddressDraft={setAddressDraft}
        onConfirm={submitShareLocation}
        loading={shareLoading}
        error={shareError}
        t={t}
      />
    </div>
  );
}
