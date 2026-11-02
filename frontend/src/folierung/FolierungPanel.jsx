import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Settings as SettingsIcon, ExternalLink, Trash2, History, Layers, RotateCcw } from 'lucide-react';
import api from '../api/client';
import { useLang } from '../contexts/LangContext';
import { fmtEur0, fmtDate } from '../utils/money';
import FolierungWizard from './FolierungWizard';
import GroupDial from '../components/pro/GroupDial';
import SuccessCheck from '../components/motion/SuccessCheck';
import {
  loadSettings, loadCalcs, saveCalc, deleteCalc, rememberVat, loadDraft as loadLegacyDraft, clearDraft as clearLegacyDraft,
} from './store';
import { vatFromProfile, quoteTitleFrom } from './pricing';
import { createFolierungQuote } from './quote';
import { getDraft, saveDraft, removeDraft, newDraftId } from '../utils/calcDrafts';
import { notifyDraftSaved } from '../utils/draftToast';
import { surfaceByKey, DECORS, SURFACES } from './catalog';

/* Die acht Flächen als Ring, wie die Gruppen der anderen Gewerke. Die Zahl
   unter dem Namen ist die Anzahl zählbarer Elemente. */
const DIAL = SURFACES.map((s) => ({ key: s.key, label: s.short, count: s.elements.length }));

/**
 * Die Folierung als Gewerk auf der Kalkulationsseite (/estimate/folierung).
 *
 * Entwürfe wie bei allen Gewerken (utils/calcDrafts): Sobald etwas geändert
 * ist, wird der Stand nach jeder Änderung als Entwurf gesichert. Beim
 * Verlassen, egal wohin, kommt der Hinweis "gespeichert unter Angebote ›
 * Entwürfe". `?draft={id}` öffnet einen Entwurf an der Stelle, wo er stand.
 */
const FolierungPanel = forwardRef(function FolierungPanel(_props, ref) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(loadSettings);
  const [calcs, setCalcs] = useState(loadCalcs);
  const [params] = useSearchParams();
  /* Einmalig: den alten Einzel-Entwurf (vor den Entwürfen in Angebote) übernehmen. */
  const [draft] = useState(() => {
    const legacy = loadLegacyDraft();
    if (legacy?.input) {
      const id = newDraftId();
      saveDraft({ id, kind: 'folierung', trade: 'folierung', title: quoteTitleFrom(legacy.input), sub: 'Übernommen', step: 1, steps: 4, net: 0, payload: { input: legacy.input, step: 0 } });
      clearLegacyDraft();
    }
    const d = getDraft(params.get('draft'));
    return d?.kind === 'folierung' ? d : null;
  });
  /* Der Auftrag, für den gerechnet wird (`?job=` aus Aufträge/Projekte). Er
     wandert in den Entwurf mit, damit "Weiter" später am selben Auftrag landet. */
  const jobId = useRef(params.get('job') || draft?.jobId || null);
  const [initial, setInitial] = useState(() => draft?.payload?.input || null);
  const [restored, setRestored] = useState(!!draft);
  const [wizardKey, setWizardKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const draftId = useRef(draft?.id || newDraftId());
  const state = useRef({ input: null, result: null, dirty: !!draft });
  const wizardRef = useRef(null);
  const [surface, setSurface] = useState(() => draft?.input?.surface || 'kueche');
  const [done, setDone] = useState(null);             // gerade angelegtes Angebot

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

  const onChange = useCallback(({ input, result, step, dirty }) => {
    const d = dirty || state.current.restoredDirty;
    state.current = { input, result, dirty: d, restoredDirty: state.current.restoredDirty };
    if (d && result.lines.length) {
      saveDraft({
        id: draftId.current, kind: 'folierung', trade: 'folierung', jobId: jobId.current,
        title: quoteTitleFrom(input),
        sub: `${result.lines.length} Positionen · ${['Fläche', 'Zustand', 'Zählen', 'Preis'][step] || ''}`,
        step: (step || 0) + 1, steps: 4, net: result.vk, gross: result.ways.montage.gross,
        payload: { input, step },
      });
    }
    setSurface(input.surface);
  }, []);
  // Ein wiederhergestellter Entwurf ist von Anfang an "angefangen".
  state.current.restoredDirty = restored;

  /* Beim Verlassen, egal wohin (Zurück, anderes Gewerk, Navigationsleiste):
     ist etwas gerechnet, sagen wir, wo es liegt. */
  useEffect(() => () => {
    const { dirty, result } = state.current;
    if (dirty && result?.lines?.length && getDraft(draftId.current)) notifyDraftSaved(draftId.current, navigate);
  }, [navigate]);

  const createQuote = async ({ input, result }) => {
    setCreating(true); setError('');
    try {
      const quote = await createFolierungQuote(input, result, settings, { jobId: jobId.current });
      removeDraft(draftId.current);
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

  /* Kein Dialog mehr: der Entwurf ist schon gesichert, die Seite navigiert selbst. */
  useImperativeHandle(ref, () => ({ requestLeave: () => false }));

  const restart = () => {
    draftId.current = newDraftId();
    setRestored(false);
    state.current = { input: null, result: null, dirty: false, restoredDirty: false };
    setInitial(null);
    setWizardKey((k) => k + 1);
  };

  const open = (c) => { setInitial(c.input); setRestored(true); setWizardKey((k) => k + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); };

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

      <div className="mb-3 -mx-1" data-testid="folierung-dial">
        <GroupDial groups={DIAL} value={surface}
                   onChange={(k) => { wizardRef.current?.chooseSurface(k); setSurface(k); }}
                   label="Flächen" promise={t('est_promise_lead')} seconds={t('est_promise_time')} />
      </div>

      {restored && draft && wizardKey === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber/40 bg-amber/5 px-4 py-2.5 mb-4 text-sm" data-testid="fol-draft-restored">
          <span className="text-ink">Entwurf vom {fmtDate(draft.updatedAt)} geöffnet. Änderungen werden automatisch gesichert.</span>
          <button type="button" onClick={restart} className="inline-flex items-center gap-1 font-semibold text-teal hover:underline shrink-0"><RotateCcw size={14} /> Neu beginnen</button>
        </div>
      )}
      {error && <div className="rounded-xl border border-red-warn/40 bg-red-warn/5 px-4 py-2.5 mb-4 text-sm text-red-text">{error}</div>}

      <FolierungWizard ref={wizardRef} key={wizardKey} audience="pro" surfaceFromDial settings={settings} initial={initial} onChange={onChange} creating={creating}
        initialStep={wizardKey === 0 ? (draft?.payload?.step || 0) : 0}
        onSave={({ input, result }) => setCalcs(saveCalc({
          input, surface: input.surface, decor: input.decor, vk: result.vk, ek: result.ek, hours: result.hours.total, fronts: result.fronts,
        }))}
        onCreateQuote={async (x) => { const q = await createQuote(x); if (q?.id) setDone({ q, net: x.result.vk, gross: x.result.ways.montage.gross }); }} />

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

      {done && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-ink/40 animate-scrim-in"
             role="dialog" aria-modal="true" data-testid="fol-created">
          <div className="w-full max-w-sm rounded-2xl bg-paper p-4 shadow-xl text-center animate-dialog-in">
            <SuccessCheck />
            <p className="font-headings font-bold text-ink text-[17px]">{t('est_created_title')}</p>
            <p className="text-[14px] text-ink-muted mt-1.5 tabular-nums">
              {[done.q.quote_number, `${fmtEur0(done.net)} netto`, settings.vat?.klein ? null : `${fmtEur0(done.gross)} brutto`].filter(Boolean).join(' · ')}
            </p>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => navigate(`/quotes/${done.q.id}`)} data-testid="fol-created-open"
                      className="flex-1 min-h-[46px] rounded-xl bg-teal text-paper font-bold text-[14px]">Angebot öffnen</button>
              <button type="button" onClick={() => { setDone(null); restart(); }}
                      className="flex-1 min-h-[46px] rounded-xl border border-sm-border bg-paper text-ink font-bold text-[14px]">Neue Kalkulation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default FolierungPanel;
