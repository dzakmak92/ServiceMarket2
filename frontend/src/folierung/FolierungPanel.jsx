import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, ExternalLink, Trash2, History, Layers, Loader2, RotateCcw } from 'lucide-react';
import api from '../api/client';
import { useLang } from '../contexts/LangContext';
import { fmtEur0, fmtDate } from '../utils/money';
import FolierungWizard from './FolierungWizard';
import {
  loadSettings, loadCalcs, saveCalc, deleteCalc, rememberVat, loadDraft, saveDraft, clearDraft,
} from './store';
import { vatFromProfile, quoteLinesFrom, quoteTitleFrom, quoteAssumptionsFrom } from './pricing';
import { surfaceByKey, DECORS } from './catalog';

/**
 * Die Folierung als Gewerk auf der Kalkulationsseite (/estimate/folierung).
 *
 * Verhält sich beim Verlassen wie die anderen Gewerke: Ist etwas gerechnet,
 * fragt ein Dialog "Kalkulation verlassen?" mit "Entwurf behalten" (legt ein
 * Angebot unter Angebote an) und "Verwerfen". Die Kalkulationsseite ruft dazu
 * `requestLeave(to)` über die Ref auf, für Zurück und für den Gewerkewechsel.
 *
 * Zusätzlich wird der Stand laufend lokal gesichert. Die anderen Gewerke
 * verlieren ihre Auswahl, wenn man über die untere Navigationsleiste geht;
 * hier ist sie beim Zurückkommen wieder da.
 */
const FolierungPanel = forwardRef(function FolierungPanel(_props, ref) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(loadSettings);
  const [calcs, setCalcs] = useState(loadCalcs);
  const [draft] = useState(loadDraft);
  const [initial, setInitial] = useState(() => draft?.input || null);
  const [restored, setRestored] = useState(!!draft?.input);
  const [wizardKey, setWizardKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(null);       // Ziel, wenn der Dialog offen ist
  const state = useRef({ input: null, result: null, dirty: !!draft?.input });

  /* Steuer aus dem Profil: Rechnungsland und Kleinunternehmer. */
  useEffect(() => {
    let live = true;
    api.get('/api/profile/pro').then(({ data }) => {
      if (!live) return;
      const vat = vatFromProfile(data);
      rememberVat(vat);
      setSettings((s) => ({ ...s, vat, businessName: s.businessName || data?.business_name || '' }));
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const onChange = useCallback(({ input, result, dirty }) => {
    const d = dirty || state.current.restoredDirty;
    state.current = { input, result, dirty: d, restoredDirty: state.current.restoredDirty };
    if (d) saveDraft(input);
  }, []);
  // Ein wiederhergestellter Entwurf ist von Anfang an "angefangen".
  state.current.restoredDirty = restored;

  const createQuote = async ({ input, result }) => {
    setCreating(true); setError('');
    try {
      const title = quoteTitleFrom(input);
      const { data: job } = await api.post('/api/jobs', { title, category: 'folierung', mode: 'simple', source: 'manual' });
      const { data: quote } = await api.post('/api/quotes', {
        job_id: job.id, title,
        assumptions: quoteAssumptionsFrom(result),
        lines: quoteLinesFrom(input, result, settings),
      });
      clearDraft();
      state.current.dirty = false;
      return quote;
    } catch (e) {
      setError(e?.response?.data?.detail
        ? (typeof e.response.data.detail === 'string' ? e.response.data.detail : 'Das Angebot konnte nicht angelegt werden.')
        : 'Das Angebot konnte nicht angelegt werden. Prüf die Verbindung und versuch es noch einmal.');
      return null;
    } finally {
      setCreating(false);
    }
  };

  useImperativeHandle(ref, () => ({
    /** true, wenn der Dialog übernimmt; sonst navigiert die Seite selbst. */
    requestLeave(to) {
      const { result, dirty } = state.current;
      if (dirty && result && result.lines.length) { setLeaving(to); return true; }
      return false;
    },
  }));

  const restart = () => {
    clearDraft();
    setRestored(false);
    state.current = { input: null, result: null, dirty: false, restoredDirty: false };
    setInitial(null);
    setWizardKey((k) => k + 1);
  };

  const open = (c) => { setInitial(c.input); setRestored(true); setWizardKey((k) => k + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const net = state.current.result?.vk || 0;

  return (
    <div data-testid="folierung-panel">
      <div className="flex items-center justify-between gap-3 mb-5 mt-1">
        <p className="text-sm text-ink-muted min-w-0">Vier Schritte, drei Wege zum Preis. Mit deinen Preisen, Primer und Zuschnitt.</p>
        <div className="flex gap-2 shrink-0">
          <Link to="/folierung/preise" className="inline-flex items-center gap-1.5 rounded-xl border border-sm-border bg-paper px-3 py-2 text-sm font-semibold text-ink hover:bg-cream-soft" data-testid="fol-to-prices">
            <SettingsIcon size={16} /> <span className="hidden sm:inline">Preise</span>
          </Link>
          <Link to={`/folie/${settings.slug || 'folie'}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-sm-border bg-paper px-3 py-2 text-sm font-semibold text-ink hover:bg-cream-soft" title="Kundenseite öffnen">
            <ExternalLink size={16} /> <span className="hidden sm:inline">Kundenseite</span>
          </Link>
        </div>
      </div>

      {restored && draft?.at && wizardKey === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber/40 bg-amber/5 px-4 py-2.5 mb-4 text-sm" data-testid="fol-draft-restored">
          <span className="text-ink">Deine letzte Kalkulation vom {fmtDate(draft.at)} ist wieder offen.</span>
          <button type="button" onClick={restart} className="inline-flex items-center gap-1 font-semibold text-teal hover:underline shrink-0"><RotateCcw size={14} /> Neu beginnen</button>
        </div>
      )}
      {error && <div className="rounded-xl border border-red-warn/40 bg-red-warn/5 px-4 py-2.5 mb-4 text-sm text-red-text">{error}</div>}

      <FolierungWizard key={wizardKey} audience="pro" settings={settings} initial={initial} onChange={onChange} creating={creating}
        onSave={({ input, result }) => setCalcs(saveCalc({
          input, surface: input.surface, decor: input.decor, vk: result.vk, ek: result.ek, hours: result.hours.total, fronts: result.fronts,
        }))}
        onCreateQuote={async (x) => { const q = await createQuote(x); if (q?.id) navigate(`/quotes/${q.id}`); }} />

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
                    <div className="text-xs text-ink-muted">{fmtDate(c.at)} · VK netto {fmtEur0(c.vk)} · EK {fmtEur0(c.ek)} · {Math.round(c.hours * 10) / 10} h</div>
                  </button>
                  <button type="button" onClick={() => setCalcs(deleteCalc(c.id))} className="p-2 text-ink-muted hover:text-red-text" aria-label="Löschen"><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Gleicher Dialog wie bei den anderen Gewerken (EstimatePage). */}
      {leaving !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-ink/40"
             role="dialog" aria-modal="true" data-testid="fol-leave"
             onClick={(e) => { if (e.target === e.currentTarget) setLeaving(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-paper p-4 shadow-xl">
            <p className="font-headings font-bold text-ink text-[17px]">{t('est_leave_title')}</p>
            <p className="text-[14px] text-ink-muted mt-1.5">
              {t('est_leave_body', { n: state.current.result?.lines.length || 0, v: fmtEur0(net) })}
            </p>
            <div className="flex gap-2 mt-4">
              <button type="button" disabled={creating} data-testid="fol-leave-keep"
                      onClick={async () => {
                        const q = await createQuote(state.current);
                        const to = leaving;
                        setLeaving(null);
                        if (q) navigate(to);
                      }}
                      className="flex-1 min-h-[46px] rounded-xl bg-teal text-paper font-bold text-[14px] flex items-center justify-center gap-2">
                {creating ? <Loader2 size={15} className="animate-spin" /> : null}
                {t('est_leave_keep')}
              </button>
              <button type="button" disabled={creating} data-testid="fol-leave-discard"
                      onClick={() => { const to = leaving; clearDraft(); state.current.dirty = false; setLeaving(null); navigate(to); }}
                      className="flex-1 min-h-[46px] rounded-xl font-bold text-[14px] border border-red-warn/35 bg-paper text-red-text">
                {t('est_leave_discard')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default FolierungPanel;
