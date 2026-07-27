import React, { useState } from 'react';
import { toast } from 'sonner';
import { X, Download, FileText, Loader2 } from 'lucide-react';
import api from '../api/client';
import { useLang } from '../contexts/LangContext';

const LANG_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'es', label: 'Español' },
];

/**
 * Job File PDF export modal with a language picker.
 * Shared by the Pro project detail and Homeowner project detail pages.
 *
 * @param {string} exportPath  e.g. `/api/pm/projects/<id>/export-pdf`
 * @param {string} fileName    base filename (project title)
 */
export default function ExportJobFileModal({ open, onClose, exportPath, fileName }) {
  const { t, lang: uiLang } = useLang();
  const [lang, setLang] = useState(uiLang || 'en');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const download = async () => {
    setBusy(true);
    try {
      const r = await api.get(`${exportPath}?lang=${lang}`, { responseType: 'blob' });
      const blob = new Blob([r.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safe = (fileName || 'project').replace(/[^a-z0-9 \-_]/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'project';
      a.href = url;
      a.download = `Jobfile-${safe}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(t('pm_export_success'));
      onClose();
    } catch (e) {
      toast.error(t('pm_export_error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="export-jobfile-overlay"
    >
      <div
        className="bg-paper rounded-[16px] shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
        data-testid="export-jobfile-modal"
      >
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-teal" />
            <h3 className="text-lg font-headings font-bold text-ink">{t('pm_export_title')}</h3>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" data-testid="export-jobfile-close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-ink-muted mb-4">{t('pm_export_desc')}</p>

        <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2">{t('pm_export_lang_label')}</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {LANG_OPTIONS.map((opt) => (
            <button
              key={opt.code}
              onClick={() => setLang(opt.code)}
              className={`rounded-[10px] border-2 px-3 py-2 text-sm font-medium transition-colors ${
                lang === opt.code
                  ? 'border-teal bg-teal/10 text-teal'
                  : 'border-sm-border text-ink hover:border-teal/40'
              }`}
              data-testid={`export-jobfile-lang-${opt.code}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={download}
          disabled={busy}
          className="btn-primary w-full justify-center"
          data-testid="export-jobfile-download"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {busy ? t('pm_export_generating') : t('pm_export_btn')}
        </button>
      </div>
    </div>
  );
}
