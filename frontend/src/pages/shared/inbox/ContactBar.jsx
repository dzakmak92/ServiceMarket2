import React from 'react';
import { CheckCircle2, Phone, MapPin } from 'lucide-react';

/**
 * Compact contact-INFO bar — shown once a job is in_progress / completed.
 * Action buttons (Call / WhatsApp / Share-or-Show-Location) live inside the
 * composer row right next to the Send button (see ConversationComposer).
 */
export default function ContactBar({ contactInfo, otherContact, t }) {
  if (!contactInfo || !otherContact) return null;
  const phone = otherContact.phone;
  const addr = contactInfo.location_shared ? contactInfo.address_full : null;
  return (
    <div className="px-3 py-1 border-b border-sm-border bg-paper flex items-center gap-2 flex-shrink-0 min-w-0 overflow-hidden" data-testid="contact-bar">
      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-teal uppercase tracking-wide flex-shrink-0">
        <CheckCircle2 size={10} /> {t('job_contact_unlocked')}
      </span>
      {phone && (
        <span className="flex items-center gap-1 text-[11px] text-ink-soft flex-shrink-0">
          <Phone size={9} className="text-teal" />
          {phone}
        </span>
      )}
      {addr && (
        <span className="flex items-center gap-1 text-[11px] text-ink-soft min-w-0 overflow-hidden">
          <MapPin size={9} className="text-teal flex-shrink-0" />
          <span className="truncate">{addr}</span>
        </span>
      )}
    </div>
  );
}
