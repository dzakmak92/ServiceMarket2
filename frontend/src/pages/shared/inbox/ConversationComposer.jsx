import React from 'react';
import AttachmentUploader, { AttachmentThumbStrip } from '../../../components/AttachmentUploader';
import WhatsAppIcon from '../../../components/WhatsAppIcon';
import { Loader2, Send, Phone, MapPin, MapPinPlus, LocateFixed } from 'lucide-react';

/**
 * Message composer — bottom row layout:
 *  [attach +] [thumb strip] [textarea] [contact buttons] [send]
 *
 * Contact buttons:
 *  - HO:  Call · WA · Share Address (MapPinPlus, red)
 *  - TP:  Call · WA · Show Address (MapPin, teal) · Share Live Location (Navigation)
 *         Live location button is disabled (grey) until HO has shared their address.
 */
export default function ConversationComposer({
  text, setText, attachments, setAttachments,
  onSend, sending, t,
  contactInfo, otherContact, userRole, jobStatus,
  mapsLink, cleanPhone, waLink, onShareLocation,
  // live location props (TP only)
  isSharing, onStartLiveLocation, onStopLiveLocation,
}) {
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };
  const disabled = sending || (!text.trim() && attachments.length === 0);

  const contactUnlocked = !!contactInfo && !!otherContact;
  const phone = otherContact?.phone;
  const showShare = contactUnlocked && userRole === 'homeowner' && jobStatus === 'in_progress' && !contactInfo.location_shared;
  const showLocation = contactUnlocked && contactInfo.location_shared && contactInfo.address_full;

  // TP live-location button: always visible when unlocked, disabled until HO shares address
  const showLiveLocation = contactUnlocked && userRole === 'tradesperson';
  const liveLocationEnabled = showLiveLocation && !!(contactInfo?.address_full);

  return (
    <div className="flex items-end gap-1.5 p-3 border-t border-sm-border bg-paper flex-shrink-0" data-testid="conversation-composer">
      <AttachmentUploader value={attachments} onChange={setAttachments} mode="inline" />
      <AttachmentThumbStrip value={attachments} onChange={setAttachments} />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('message_placeholder')}
        className="sm-textarea flex-1 min-h-[44px] max-h-32 resize-none py-2.5"
        rows={1}
        data-testid="message-input"
      />

      {contactUnlocked && (
        <div className="flex items-center gap-1 flex-shrink-0" data-testid="composer-contact-actions">
          {phone && (
            <a href={`tel:${cleanPhone(phone)}`}
              className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-teal text-paper hover:bg-teal-deep flex items-center justify-center transition-colors"
              data-testid="composer-call-btn" title={t('btn_call')}>
              <Phone size={15} />
            </a>
          )}
          {phone && waLink(phone) && (
            <a href={waLink(phone)} target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-green-pos text-paper hover:opacity-90 flex items-center justify-center transition-colors"
              data-testid="composer-whatsapp-btn" title={t('btn_whatsapp')}>
              <WhatsAppIcon size={16} />
            </a>
          )}

          {/* HO: share address */}
          {showShare && (
            <button type="button" onClick={onShareLocation}
              className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-red-warn text-paper hover:opacity-90 flex items-center justify-center transition-colors"
              data-testid="composer-share-location-btn" title={t('job_share_location')}>
              <MapPinPlus size={14} />
            </button>
          )}
          {/* HO: show shared address as map link */}
          {showLocation && userRole === 'homeowner' && (
            <a href={mapsLink(contactInfo.address_full)} target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-teal text-paper hover:bg-teal-deep flex items-center justify-center transition-colors"
              data-testid="composer-show-location-btn" title={t('btn_show_location')}>
              <MapPin size={14} />
            </a>
          )}

          {/* TP: share live location (greyed out until HO shares address) */}
          {showLiveLocation && (
            <button
              type="button"
              onClick={liveLocationEnabled ? (isSharing ? onStopLiveLocation : onStartLiveLocation) : undefined}
              disabled={!liveLocationEnabled}
              className={`w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all relative
                ${!liveLocationEnabled
                  ? 'bg-cream-deep text-ink-faint cursor-not-allowed border border-sm-border'
                  : isSharing
                    ? 'bg-red-600 text-paper shadow-md'
                    : 'bg-red-500 text-paper hover:bg-red-600'}`}
              data-testid="composer-live-location-btn"
              title={!liveLocationEnabled
                ? t('live_location_disabled_hint') || 'Share live location (available after homeowner shares address)'
                : isSharing ? t('live_location_stop') || 'Stop sharing location' : t('live_location_share') || 'Share live location'}
            >
              <LocateFixed size={15} className={isSharing ? 'animate-pulse' : ''} />
              {isSharing && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-pos rounded-full border-2 border-paper animate-ping" />
              )}
            </button>
          )}
        </div>
      )}

      <button onClick={onSend} disabled={disabled}
        className="btn-primary p-2.5 md:p-3 rounded-full flex-shrink-0" data-testid="send-message-btn">
        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
      </button>
    </div>
  );
}
