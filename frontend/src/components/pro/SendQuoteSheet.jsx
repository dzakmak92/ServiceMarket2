import React, { useState } from 'react';
import { X, MessageCircle, Mail, Link2, Share2, Check } from 'lucide-react';
import useSheetModal from '../../hooks/useSheetModal';
import { moneyLocale } from '../../utils/money';

/**
 * How an Angebot actually reaches the customer.
 *
 * "Senden" used to post the status change and quietly put the portal link on
 * the clipboard. The pro saw the card move and nothing else, so it read as a
 * dead button, and the customer still had to be told by some other means.
 * This sheet names the ways a tradesperson really sends an offer and does it
 * in one tap.
 *
 * The portal link does not depend on the send: it is the job's share token,
 * which exists before the quote is sent. So every option is a real link the
 * browser follows inside the tap (no popup blocker, no lost user gesture), and
 * the status change runs alongside it.
 */
export default function SendQuoteSheet({ q, t, onClose, onSend }) {
  const { panel, dialogProps } = useSheetModal(true, onClose, { label: t('send_sheet_title') });
  const [copied, setCopied] = useState(false);
  const url = q.share_token ? `${window.location.origin}/p/${q.share_token}` : '';
  const gross = new Intl.NumberFormat(moneyLocale(), { style: 'currency', currency: 'EUR' })
    .format(Number(q.gross_total || 0));
  const name = q.customer_name || '';
  const text = t('send_sheet_text', {
    greet: name ? t('send_sheet_greet_name', { name }) : t('send_sheet_greet'),
    title: q.title || q.job_title || t('quote'),
    sum: gross,
    url,
  });
  const phone = String(q.customer_phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^0/, '43');
  const mail = q.customer_email || '';
  const subject = [[t('quote'), q.quote_number].filter(Boolean).join(' '), q.title || q.job_title].filter(Boolean).join(' · ');

  const send = () => { onSend(q); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
    send();
  };
  const nativeShare = async () => {
    send();
    try { await navigator.share({ title: subject, text, url }); } catch { /* cancelled */ }
    onClose();
  };

  const row = 'flex items-center gap-3 w-full min-h-[56px] px-3.5 rounded-2xl border border-sm-border bg-paper text-left';
  const ico = 'w-10 h-10 rounded-xl grid place-items-center shrink-0';

  return (
    <div className="fixed inset-0 z-[60] bg-ink/40 flex items-end md:items-center justify-center"
         {...dialogProps} onClick={onClose} data-testid="send-sheet">
      <div ref={panel} onClick={(e) => e.stopPropagation()}
           className="w-full max-w-md bg-cream rounded-t-[22px] md:rounded-[22px] p-4 pb-[calc(16px+env(safe-area-inset-bottom))] grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-headings font-bold text-[17px] text-ink">{t('send_sheet_title')}</p>
            <p className="text-[12.5px] text-ink-muted truncate">
              {[q.title || q.job_title, name, gross].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('cookie_close')}
                  className="w-9 h-9 rounded-xl grid place-items-center text-ink-muted"><X size={18} /></button>
        </div>

        {!url && <p className="text-[13px] text-red-text">{t('send_sheet_nolink')}</p>}

        {url && (
          <div className="grid gap-2">
            <a className={row} data-testid="send-whatsapp" onClick={send} target="_blank" rel="noreferrer"
               href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`}>
              <span className={ico} style={{ background: '#e3f6ea', color: '#1f8a4c' }}><MessageCircle size={19} /></span>
              <span className="min-w-0"><b className="block text-[14px] text-ink">WhatsApp</b>
                <small className="block text-[12px] text-ink-muted truncate">{q.customer_phone || t('send_sheet_pick_contact')}</small></span>
            </a>
            <a className={row} data-testid="send-mail" onClick={send}
               href={`mailto:${mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>
              <span className={ico} style={{ background: '#e7eef8', color: '#1e5490' }}><Mail size={19} /></span>
              <span className="min-w-0"><b className="block text-[14px] text-ink">{t('send_sheet_mail')}</b>
                <small className="block text-[12px] text-ink-muted truncate">{mail || t('send_sheet_pick_contact')}</small></span>
            </a>
            {typeof navigator !== 'undefined' && navigator.share && (
              <button type="button" className={row} onClick={nativeShare} data-testid="send-share">
                <span className={ico} style={{ background: '#f1ecfb', color: '#6d4bc2' }}><Share2 size={19} /></span>
                <span><b className="block text-[14px] text-ink">{t('send_sheet_other')}</b>
                  <small className="block text-[12px] text-ink-muted">{t('send_sheet_other_sub')}</small></span>
              </button>
            )}
            <button type="button" className={row} onClick={copy} data-testid="send-copy">
              <span className={ico} style={{ background: '#eef2f5', color: '#1a3a52' }}>
                {copied ? <Check size={19} /> : <Link2 size={19} />}</span>
              <span className="min-w-0"><b className="block text-[14px] text-ink">{copied ? t('quote_row_shared') : t('send_sheet_copy')}</b>
                <small className="block text-[12px] text-ink-muted truncate">{url.replace(/^https?:\/\//, '')}</small></span>
            </button>
          </div>
        )}
        <p className="text-[11.5px] text-ink-faint px-1">{t('send_sheet_note')}</p>
      </div>
    </div>
  );
}
