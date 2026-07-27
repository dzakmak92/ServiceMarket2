import React from 'react';
import { X, Share2, AlertCircle, Loader2 } from 'lucide-react';

/**
 * Share-Location modal (homeowner → pro). Opens when the user clicks
 * [data-testid=contact-share-location-btn] in the ContactBar.
 */
export default function ShareLocationModal({
  open, onClose, addressDraft, setAddressDraft,
  onConfirm, loading, error, t,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4">
      <div className="bg-paper rounded-[18px] p-6 max-w-md w-full animate-slide-up" data-testid="share-location-modal">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-headings font-bold text-ink flex items-center gap-2">
            <Share2 size={16} className="text-red-warn" /> {t('job_share_location')}
          </h2>
          <button onClick={onClose} className="p-1 text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-ink-muted mb-4">{t('job_share_location_desc')}</p>
        <input
          value={addressDraft}
          onChange={(e) => setAddressDraft(e.target.value)}
          placeholder={t('job_address_placeholder')}
          className="sm-input mb-3"
          autoFocus
          data-testid="share-location-modal-input"
        />
        {error && (
          <div className="flex items-center gap-1.5 text-red-warn text-xs mb-3">
            <AlertCircle size={12} /> {error}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">{t('btn_cancel')}</button>
          <button
            onClick={onConfirm}
            disabled={loading || addressDraft.trim().length < 4}
            className="btn-primary flex-1"
            data-testid="share-location-modal-confirm"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
            {t('btn_share')}
          </button>
        </div>
      </div>
    </div>
  );
}
