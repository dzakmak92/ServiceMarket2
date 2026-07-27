import React, { useEffect, useRef } from 'react';
import { AttachmentDisplay } from '../../../components/AttachmentUploader';
import { Loader2, Languages, MapPin, FileText, CalendarPlus } from 'lucide-react';
import LiveLocationBubble from './LiveLocationBubble';

/**
 * Scrollable message bubble list. Renders 3 bubble shapes:
 *  - text bubble (mine vs other)
 *  - system bubble (acceptance / booking / location / live_location / invoice_share)
 */
export default function MessageList({
  messages, currentUserId, translatedTexts, translatingId,
  onTranslate, onDownloadICal, mapsLink, t,
}) {
  const containerRef = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const timeStr = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch { return ''; }
  };

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3 min-h-0" data-testid="message-list">
      {messages.map((msg) => {
        const mine = msg.from_id === currentUserId;
        const translated = translatedTexts[msg.id];

        // ── Live location bubble ─────────────────────────────────────────────
        if (msg.kind === 'live_location') {
          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className="flex flex-col gap-1 items-start">
                <LiveLocationBubble msg={msg} t={t} />
                <span className="text-[10px] text-ink-faint px-1">{timeStr(msg.sent_at)}</span>
              </div>
            </div>
          );
        }

        if (msg.kind === 'acceptance' || msg.kind === 'booking' || msg.kind === 'location' || msg.kind === 'invoice_share') {
          const locationAddr = msg.kind === 'location'
            ? (msg.address_full || msg.text.replace(/^📍\s*Address shared:\s*/, ''))
            : null;
          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className="bubble-system py-2 px-4 text-xs max-w-xs">
                {msg.kind === 'location' && <MapPin size={11} className="inline mr-1 -mt-0.5 text-teal" />}
                {msg.kind === 'invoice_share' && <FileText size={11} className="inline mr-1 -mt-0.5 text-teal" />}
                {msg.text}
                {msg.kind === 'location' && locationAddr && (
                  <a
                    href={mapsLink(locationAddr)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-teal hover:underline"
                    data-testid={`msg-show-location-${msg.id}`}
                  >
                    <MapPin size={11} /> {t('btn_show_location')}
                  </a>
                )}
                {msg.kind === 'invoice_share' && msg.invoice_id && (
                  <a
                    href={`${process.env.REACT_APP_BACKEND_URL}/api/pro-invoices/${msg.invoice_id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-teal hover:underline"
                    data-testid={`msg-open-invoice-${msg.id}`}
                  >
                    <FileText size={11} /> {t('msg_open_invoice')}
                  </a>
                )}
                {msg.kind === 'booking' && (
                  <>
                    <p className="font-semibold mt-1">{msg.booking_day} · {msg.booking_slot}</p>
                    {msg.booking_id && (
                      <button
                        onClick={() => onDownloadICal(msg.booking_id)}
                        className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-teal hover:underline"
                        data-testid={`ical-download-${msg.booking_id}`}
                      >
                        <CalendarPlus size={11} /> {t('btn_add_to_calendar')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        }

        return (
          <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              <div className={`px-4 py-2.5 ${mine ? 'bubble-mine' : 'bubble-other'}`}>
                {(msg.text || translated) && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{translated || msg.text}</p>
                )}
                {msg.attachments && msg.attachments.length > 0 && (
                  <AttachmentDisplay attachments={msg.attachments} size="sm" />
                )}
              </div>
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] text-ink-faint">{timeStr(msg.sent_at)}</span>
                {msg.text && (
                  <button
                    onClick={() => onTranslate(msg.id, msg.text)}
                    className="text-[10px] text-ink-muted hover:text-teal flex items-center gap-0.5"
                    disabled={translatingId === msg.id}
                    data-testid={`translate-btn-${msg.id}`}
                  >
                    {translatingId === msg.id
                      ? <Loader2 size={10} className="animate-spin" />
                      : <><Languages size={10} /> {t('translate_btn')}</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
