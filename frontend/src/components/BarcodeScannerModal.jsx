import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, ScanBarcode, Loader2, Keyboard } from 'lucide-react';

const REGION_ID = 'pm-barcode-reader';
const FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
];

/**
 * Camera barcode scanner (EAN/UPC). Calls onDetected(code) on a successful scan.
 * Gracefully falls back to manual code entry if the camera is unavailable.
 */
export default function BarcodeScannerModal({ onDetected, onClose, t }) {
  const scannerRef = useRef(null);
  const handledRef = useRef(false);
  const [starting, setStarting] = useState(true);
  const [camError, setCamError] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(REGION_ID, { formatsToSupport: FORMATS, verbose: false });
    scannerRef.current = scanner;

    const onScan = (decodedText) => {
      if (handledRef.current) return;
      handledRef.current = true;
      const code = (decodedText || '').replace(/\D/g, '');
      stop().finally(() => onDetected(code));
    };

    scanner
      .start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 160 } }, onScan, () => {})
      .then(() => { if (!cancelled) setStarting(false); })
      .catch((e) => {
        if (cancelled) return;
        setStarting(false);
        setCamError(e?.message || 'Camera unavailable');
      });

    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = async () => {
    const s = scannerRef.current;
    if (!s) return;
    try { if (s.isScanning) await s.stop(); } catch (_) {}
    try { s.clear(); } catch (_) {}
    scannerRef.current = null;
  };

  const close = () => { stop().finally(onClose); };
  const submitManual = () => {
    const code = manual.replace(/\D/g, '');
    if (code.length >= 6) { handledRef.current = true; stop().finally(() => onDetected(code)); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="pm-barcode-modal">
      <div className="bg-paper rounded-[14px] max-w-sm w-full p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-headings font-bold text-ink flex items-center gap-2"><ScanBarcode size={18} className="text-teal" /> {t('pm_scan_barcode')}</h3>
          <button onClick={close} className="text-ink-muted hover:text-ink" data-testid="pm-barcode-close"><X size={18} /></button>
        </div>

        {!camError ? (
          <>
            <div id={REGION_ID} className="rounded-[10px] overflow-hidden bg-ink/5 min-h-[200px]" />
            {starting && (
              <div className="flex items-center justify-center gap-2 text-xs text-ink-muted py-3">
                <Loader2 size={14} className="animate-spin" /> {t('pm_scan_starting')}
              </div>
            )}
            {!starting && <p className="text-[11px] text-ink-muted text-center mt-2">{t('pm_scan_hint')}</p>}
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-xs text-red-warn mb-3">{t('pm_scan_camerr')}</p>
          </div>
        )}

        {/* Manual fallback (always available) */}
        <div className="mt-3 pt-3 border-t border-sm-border">
          <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider mb-1 flex items-center gap-1"><Keyboard size={11} /> {t('pm_scan_manual')}</p>
          <div className="flex gap-2">
            <input
              className="sm-input text-sm flex-1"
              inputMode="numeric"
              placeholder="e.g. 5449000000996"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitManual()}
              data-testid="pm-barcode-manual-input"
            />
            <button onClick={submitManual} className="btn-primary text-xs" data-testid="pm-barcode-manual-submit">{t('pm_scan_use')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
