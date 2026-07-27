import React, { useState, useRef } from 'react';
import api from '../api/client';
import { Plus, X, FileText, Image as ImageIcon, Loader2, AlertCircle, Paperclip } from 'lucide-react';

const ALLOWED_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Two display modes:
 *  - mode='form' (default) — used in the Post-Job form. Big "Attach" pill button + helper text + vertical chip list.
 *  - mode='inline' — used in the message composer. Just an icon-only round paperclip button + an inline horizontal thumb strip rendered by <AttachmentThumbStrip>.
 *
 * Props:
 *  - value: Attachment[]
 *  - onChange(next): controlled setter
 *  - mode: 'form' | 'inline'
 */
export default function AttachmentUploader({ value = [], onChange, mode = 'form' }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const onPick = async (e) => {
    setError('');
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (value.length + files.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} attachments`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setUploading(true);
    const uploaded = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name}: file too large (max 10 MB)`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post('/api/uploads/file', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploaded.push(data);
      } catch (err) {
        setError(err.response?.data?.detail || `Upload of ${file.name} failed`);
      }
    }
    if (uploaded.length) onChange([...value, ...uploaded]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (mode === 'inline') {
    return (
      <>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || value.length >= MAX_FILES}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-cream-soft hover:bg-teal/10 hover:text-teal text-ink-muted flex items-center justify-center transition-colors disabled:opacity-40"
          title={uploading ? 'Uploading…' : 'Attach photo or file'}
          data-testid="attach-button"
          aria-label="attach"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={20} strokeWidth={2.4} />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_ACCEPT}
          multiple
          className="hidden"
          onChange={onPick}
          data-testid="attach-input"
        />
        {error && (
          <span className="absolute -top-6 left-0 text-[10px] text-red-warn bg-red-50 px-2 py-0.5 rounded-full" data-testid="attach-error">
            {error}
          </span>
        )}
      </>
    );
  }

  // mode === 'form'
  const cap = `${value.length}/${MAX_FILES}`;
  const removeAt = (idx) => {
    const next = [...value];
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div data-testid="attachment-uploader">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || value.length >= MAX_FILES}
          className="inline-flex items-center gap-1.5 rounded-full border border-sm-border bg-paper hover:bg-cream-soft transition-colors disabled:opacity-50 text-sm px-3 py-1.5"
          data-testid="attach-button"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
          {uploading ? 'Uploading…' : 'Attach'}
          <span className="text-ink-muted">({cap})</span>
        </button>
        <span className="text-[10px] text-ink-muted">JPG / PNG / WebP / PDF · max 10 MB</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_ACCEPT}
        multiple
        className="hidden"
        onChange={onPick}
        data-testid="attach-input"
      />
      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-red-warn bg-red-50 rounded-[10px] px-2.5 py-1.5 text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}
      {value.length > 0 && (
        <ul className="mt-2 space-y-1" data-testid="attachment-list">
          {value.map((a, i) => (
            <li
              key={a.file_id}
              className="flex items-center gap-2 bg-cream-soft border border-sm-border rounded-[10px] text-sm px-3 py-2"
              data-testid={`attachment-chip-${i}`}
            >
              {(a.content_type || '').startsWith('image/') ? (
                <ImageIcon size={14} className="text-teal flex-shrink-0" />
              ) : (
                <FileText size={14} className="text-amber-deep flex-shrink-0" />
              )}
              <span className="flex-1 min-w-0 truncate text-ink">{a.name}</span>
              <span className="text-ink-muted text-[10px] flex-shrink-0">{Math.max(1, Math.round((a.size || 0) / 1024))} KB</span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="p-0.5 rounded-full hover:bg-red-50 text-ink-muted hover:text-red-warn transition-colors"
                aria-label="remove attachment"
                data-testid={`attachment-chip-${i}-remove`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Horizontal thumb strip — sits inline beside the message composer.
 * Each tile is 40×40 with a tiny X corner button. Images render as actual previews;
 * PDFs render the FileText icon on the cream background.
 */
export function AttachmentThumbStrip({ value = [], onChange }) {
  if (!value || value.length === 0) return null;
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  const removeAt = (idx) => {
    const next = [...value];
    next.splice(idx, 1);
    onChange(next);
  };
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0" data-testid="attachment-thumb-strip">
      {value.map((a, i) => {
        const isImg = (a.content_type || '').startsWith('image/');
        const isFullUrl = (a.url || '').startsWith('http');
        const href = isFullUrl ? a.url : `${backendUrl}${a.url}`;
        return (
          <div
            key={a.file_id}
            className="relative group w-10 h-10 rounded-[10px] overflow-hidden border border-sm-border flex-shrink-0"
            data-testid={`attachment-thumb-${i}`}
            title={a.name}
          >
            {isImg ? (
              <img src={href} alt={a.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-cream-soft flex items-center justify-center">
                <FileText size={16} className="text-amber-deep" />
              </div>
            )}
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-ink text-paper flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              aria-label="remove attachment"
              data-testid={`attachment-thumb-${i}-remove`}
            >
              <X size={10} strokeWidth={3} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Render-only attachment list — used to display attachments inside message
 * bubbles and on the job-detail page.
 */
export function AttachmentDisplay({ attachments = [], size = 'sm' }) {
  if (!attachments || attachments.length === 0) return null;
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  return (
    <ul className="mt-2 space-y-1" data-testid="attachment-display">
      {attachments.map((a) => {
        const isImg = (a.content_type || '').startsWith('image/');
        const isFullUrl = (a.url || '').startsWith('http');
        const href = isFullUrl ? a.url : `${backendUrl}${a.url}`;
        const sizeKB = Math.max(1, Math.round((a.size || 0) / 1024));
        return (
          <li key={a.file_id}>
            {isImg ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                data-testid={`attachment-img-${a.file_id}`}
              >
                <img
                  src={href}
                  alt={a.name}
                  className="max-h-48 rounded-[10px] border border-sm-border object-cover"
                  loading="lazy"
                />
              </a>
            ) : (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                download={a.name}
                className={`inline-flex items-center gap-2 bg-cream-soft border border-sm-border rounded-[10px] hover:bg-cream-deep transition-colors ${
                  size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm px-3 py-2'
                }`}
                data-testid={`attachment-file-${a.file_id}`}
              >
                <FileText size={size === 'sm' ? 12 : 14} className="text-amber-deep" />
                <span className="truncate max-w-[180px]">{a.name}</span>
                <span className="text-ink-muted text-[10px]">{sizeKB} KB</span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
