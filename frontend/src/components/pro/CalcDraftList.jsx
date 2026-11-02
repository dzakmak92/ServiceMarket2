import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MoreVertical, Loader2, Calculator } from 'lucide-react';
import api from '../../api/client';
import TradeMark from '../TradeMark';
import { fmtEur0 } from '../../utils/money';
import { listDrafts, removeDraft, restoreDraft, DRAFTS_EVENT } from '../../utils/calcDrafts';
import { calculate } from '../../folierung/pricing';
import { loadSettings } from '../../folierung/store';
import { createFolierungQuote } from '../../folierung/quote';

/**
 * Angebote › Entwürfe: angefangene Kalkulationen aller Gewerke.
 * "Weiter" öffnet die Kalkulation dort, wo sie stand; das Menü legt direkt ein
 * Angebot an oder löscht den Entwurf (mit Rückgängig).
 */
const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
};

export function useCalcDrafts() {
  const [drafts, setDrafts] = useState(listDrafts);
  useEffect(() => {
    const on = () => setDrafts(listDrafts());
    window.addEventListener(DRAFTS_EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(DRAFTS_EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  return drafts;
}

export default function CalcDraftList({ drafts, lang, onQuoted }) {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState(null);

  const resume = (d) => navigate(`/estimate/${d.trade}?draft=${d.id}${d.jobId ? `&job=${d.jobId}` : ''}`);
  const del = (d) => {
    setMenu(null);
    removeDraft(d.id);
    toast('Entwurf gelöscht', { action: { label: 'Rückgängig', onClick: () => restoreDraft(d) }, duration: 5000 });
  };
  const toQuote = async (d) => {
    setMenu(null); setBusy(d.id);
    try {
      let quote;
      if (d.kind === 'folierung') {
        const settings = loadSettings();
        const result = calculate(d.payload.input, settings);
        quote = await createFolierungQuote(d.payload.input, result, settings, { jobId: d.jobId });
      } else {
        const positions = d.payload?.positions || [];
        if (!positions.length) { toast.error('Noch keine Position mit Menge. Öffne den Entwurf und trag die Mengen ein.'); return; }
        const { data } = await api.post('/api/estimate/quote/multi', { positions, lang, job_id: d.jobId || null });
        quote = data?.quotes?.[0];
      }
      removeDraft(d.id);
      toast.success(`Angebot ${quote?.quote_number || ''} angelegt`.trim());
      onQuoted?.();
    } catch {
      toast.error('Das Angebot konnte nicht angelegt werden. Versuch es noch einmal.');
    } finally {
      setBusy(null);
    }
  };

  if (!drafts.length) {
    return (
      <div className="card-lg text-center py-10" data-testid="draft-empty">
        <Calculator size={30} className="text-ink-muted mx-auto mb-2" />
        <p className="font-headings font-bold text-ink">Keine Entwürfe</p>
        <p className="text-sm text-ink-muted mt-1">Angefangene Kalkulationen landen hier automatisch.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-2" data-testid="draft-list" onClick={() => menu && setMenu(null)} role="presentation">
      <p className="text-[12px] text-ink-muted rounded-xl border border-sm-border bg-cream-soft px-3 py-2">
        Angefangene Kalkulationen, noch kein Angebot. Automatisch gespeichert, nach 30 Tagen ohne Änderung gelöscht.
      </p>
      {drafts.map((d) => (
        <div key={d.id} className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-sm-border bg-paper p-3 animate-rise" data-testid={`draft-${d.id}`}>
          <span className="w-10 h-10 rounded-xl bg-navy-wedge text-navy flex items-center justify-center">
            <TradeMark trade={d.trade} size={22} />
          </span>
          <div className="min-w-0">
            <div className="font-bold text-ink text-[13.5px] leading-tight truncate">{d.title}</div>
            <div className="text-[11.5px] text-ink-muted tabular-nums truncate">{d.sub} · {ago(d.updatedAt)}</div>
            <div className="flex gap-1 mt-1.5">
              {Array.from({ length: d.steps || 1 }, (_, i) => (
                <i key={i} className={`block h-1 w-4 rounded ${i < (d.step || 1) ? 'bg-amber' : 'bg-cream-deep'}`} />
              ))}
            </div>
          </div>
          <div className="grid justify-items-end gap-1">
            <div className="font-headings font-bold text-ink text-[14px] tabular-nums">≈ {fmtEur0(d.net || 0)}<span className="block text-[10px] font-body font-semibold text-ink-muted text-right">netto</span></div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => resume(d)} data-testid={`draft-go-${d.id}`}
                className="rounded-xl bg-teal text-paper px-3 py-1.5 text-[12.5px] font-bold">
                {busy === d.id ? <Loader2 size={14} className="animate-spin" /> : 'Weiter'}
              </button>
              <button type="button" aria-label="Mehr" onClick={(e) => { e.stopPropagation(); setMenu(menu === d.id ? null : d.id); }}
                className="p-1 text-ink-muted hover:text-ink"><MoreVertical size={16} /></button>
            </div>
          </div>
          {menu === d.id && (
            <div className="absolute right-2 top-14 z-10 min-w-[180px] rounded-xl border border-sm-border bg-paper p-1 shadow-xl animate-dialog-in" role="menu">
              <button type="button" onClick={() => toQuote(d)} className="w-full text-left rounded-lg px-3 py-2 text-[13px] font-semibold text-ink hover:bg-cream-soft">Angebot anlegen</button>
              <button type="button" onClick={() => del(d)} className="w-full text-left rounded-lg px-3 py-2 text-[13px] font-semibold text-red-text hover:bg-cream-soft">Löschen</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
