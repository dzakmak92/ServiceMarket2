import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { signedUrl } from '../api/files';

/**
 * An image held in private storage.
 *
 * Takes a `storage_ref`, not a URL, because objects in Supabase Storage have
 * no permanent address — a viewable link is minted on demand and expires. The
 * component owns that signing so no caller is tempted to store the signed URL
 * instead of the ref, which works perfectly for an hour and then renders a
 * broken image forever.
 *
 * A file that cannot be signed shows a placeholder rather than a browser's
 * broken-image glyph: a missing thumbnail should not make the screen around it
 * look broken too.
 */
export default function StoredImage({ storageRef, alt = '', className = '',
                                      fallbackClassName = '', onResolved, ...rest }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    setUrl(null);
    if (!storageRef) { setFailed(true); return undefined; }
    signedUrl(storageRef).then((u) => {
      if (!live) return;
      if (u) { setUrl(u); if (onResolved) onResolved(u); } else setFailed(true);
    });
    return () => { live = false; };
    // onResolved is intentionally excluded: callers pass inline arrows, and
    // depending on it would re-sign on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageRef]);

  if (failed) {
    return (
      <div className={fallbackClassName || className}
           title="Datei nicht verfügbar" data-testid="stored-image-missing">
        <ImageOff size={14} className="text-ink-muted m-auto" />
      </div>
    );
  }
  if (!url) return <div className={fallbackClassName || className} aria-busy="true" />;
  return <img src={url} alt={alt} className={className} loading="lazy"
              onError={() => setFailed(true)} {...rest} />;
}
