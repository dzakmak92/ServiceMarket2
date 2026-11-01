import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, ExternalLink, Trash2, History, Layers } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fmtEur0, fmtDate } from '../../utils/money';
import FolierungWizard from '../../folierung/FolierungWizard';
import { canUseFolierung, loadSettings, loadCalcs, saveCalc, deleteCalc } from '../../folierung/store';
import { surfaceByKey, DECORS } from '../../folierung/catalog';

/**
 * /folierung — der Rechner aus Sicht des Betriebs.
 *
 * Dieselben vier Schritte wie die öffentliche Seite, dazu die interne
 * Kalkulation (EK, VK, Deckungsbeitrag, Stunden, Primer in Millilitern)
 * und das Speichern. Nur für freigeschaltete Profile; siehe store.js.
 */
export default function FolierungPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(loadSettings);
  const [calcs, setCalcs] = useState(loadCalcs);
  const [initial, setInitial] = useState(null);
  const [wizardKey, setWizardKey] = useState(0);

  useEffect(() => { setSettings(loadSettings()); }, []);

  if (!canUseFolierung(user)) return <Navigate to="/" replace />;

  const open = (c) => { setInitial(c.input); setWizardKey((k) => k + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 pb-28">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <div className="text-[11px] tracking-[0.18em] uppercase text-amber-text font-bold">Folierung</div>
          <h1 className="font-headings text-2xl md:text-3xl text-ink leading-tight">Preisrechner</h1>
          <p className="text-sm text-ink-muted mt-1">Vier Schritte, drei Wege zum Preis. Mit deinen Preisen, deinem Primer-Vorschlag.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link to="/folierung/preise" className="inline-flex items-center gap-1.5 rounded-xl border border-sm-border bg-paper px-3 py-2 text-sm font-semibold text-ink hover:bg-cream-soft" data-testid="fol-to-prices">
            <SettingsIcon size={16} /> <span className="hidden sm:inline">Preise</span>
          </Link>
          <Link to={`/folie/${settings.slug || 'folie'}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-sm-border bg-paper px-3 py-2 text-sm font-semibold text-ink hover:bg-cream-soft" title="Kundenseite öffnen">
            <ExternalLink size={16} /> <span className="hidden sm:inline">Kundenseite</span>
          </Link>
        </div>
      </div>

      <FolierungWizard key={wizardKey} audience="pro" settings={settings} initial={initial}
        onSave={({ input, result }) => setCalcs(saveCalc({
          input, surface: input.surface, decor: input.decor, vk: result.vk, ek: result.ek, hours: result.hours.total, fronts: result.fronts,
        }))}
        onCreateQuote={() => navigate('/quotes')} />

      {calcs.length > 0 && (
        <section className="mt-10">
          <h2 className="font-headings font-bold text-ink text-lg flex items-center gap-2 mb-3"><History size={18} className="text-teal" /> Gespeicherte Kalkulationen</h2>
          <div className="grid gap-2">
            {calcs.map((c) => {
              const s = surfaceByKey(c.surface);
              const d = DECORS.find((x) => x.key === c.decor);
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-sm-border bg-paper px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-teal/10 text-teal flex items-center justify-center shrink-0"><Layers size={18} /></div>
                  <button type="button" onClick={() => open(c)} className="min-w-0 flex-1 text-left">
                    <div className="font-semibold text-ink text-sm">{s.label} · {d?.label}{c.fronts ? ` · ${c.fronts} Fronten` : ''}</div>
                    <div className="text-xs text-ink-muted">{fmtDate(c.at)} · VK {fmtEur0(c.vk)} · EK {fmtEur0(c.ek)} · {Math.round(c.hours * 10) / 10} h</div>
                  </button>
                  <button type="button" onClick={() => setCalcs(deleteCalc(c.id))} className="p-2 text-ink-muted hover:text-red-text" aria-label="Löschen"><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
