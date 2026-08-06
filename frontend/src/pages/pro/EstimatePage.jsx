import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import NumberField from '../../components/NumberField';
import { fmtEur0 as fmtEur, fmtEur as fmtEur2, fmtNum as fmtNumRaw } from '../../utils/money';

import {
  Loader2, AlertTriangle, ArrowLeft, Calculator, FileText,
  Trash2, Clock, Package, Info, MapPin, TrendingUp, Bookmark, Search, X,
  RefreshCw, Coins, Pencil, RotateCcw, Check, Layers,
  Paintbrush, Grid3x3, Zap, Droplet, Sprout, SprayCan, Wrench, Hammer,
} from 'lucide-react';

/* The estimator writes hours and square metres with one decimal;
   money.js defaults to none. */
const fmtNum = (v, d = 1) => fmtNumRaw(v, d);

// One icon per offered trade. Keyed on the catalogue's own trade keys, so a
// trade added to OFFERED_TRADES on the server shows up here with the Hammer
// fallback rather than an empty tile.
const TRADE_ICON = {
  maler: Paintbrush, fliesen: Grid3x3, elektrik: Zap, sanitaer: Droplet,
  garten: Sprout, reinigung: SprayCan, montage: Wrench,
};


const TIERS = ['basic', 'standard', 'premium'];
const TIER_LABEL = { basic: 'Basis', standard: 'Standard', premium: 'Premium' };

// Severity drives colour, not decoration. An asbestos warning and a note about
// who moves the furniture must not look alike — that is the whole reason the
// API returns them separately instead of as one text blob.
const SEVERITY = {
  critical: { cls: 'border-red-warn/40 bg-red-warn/5 text-red-warn', label: 'Kritisch' },
  high: { cls: 'border-amber-500/40 bg-amber-500/5 text-amber-700', label: 'Wichtig' },
  medium: { cls: 'border-sm-border bg-cream text-ink', label: 'Hinweis' },
  low: { cls: 'border-sm-border bg-cream text-ink-muted', label: 'Hinweis' },
};

const CONFIDENCE = {
  high: { label: 'gut belegt', cls: 'text-green-700' },
  medium: { label: 'Erfahrungswert', cls: 'text-ink-muted' },
  low: { label: 'ungeprüft', cls: 'text-amber-700' },
};

export default function EstimatePage() {
  const { t, lang } = useLang();
  // Entered from a job or from the quote form, the target is already known.
  // Making the pro pick it again from a list they just came from is the kind
  // of small friction that stops a tool being used on site.
  const [params] = useSearchParams();
  const [meta, setMeta] = useState(null);
  const [jobs, setJobs] = useState([]);
  // The trade lives in the URL, not in component state. `/estimate` is the
  // seven cards; `/estimate/maler` is that trade's templates. That makes each
  // card a real link — the back button works, the page can be shared, and a
  // reload does not throw the pro back to the start.
  const navigate = useNavigate();
  const { trade = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /* How this trade's templates are chunked, from the API. Null for a search
     and for the seventeen trades small enough to read as a flat list. */
  const [sections, setSections] = useState(null);
  const [query, setQuery] = useState('');

  const [selected, setSelected] = useState(null);   // survey payload
  const [answers, setAnswers] = useState({});
  const [tier, setTier] = useState('standard');
  const [result, setResult] = useState(null);
  const [calculating, setCalculating] = useState(false);

  const [myJobs, setMyJobs] = useState([]);
  const [targetJob, setTargetJob] = useState(params.get('job') || '');
  const [allTiers, setAllTiers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [createdQuote, setCreatedQuote] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [showAccuracy, setShowAccuracy] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  // The rate card and the tier comparison: both endpoints existed, were
  // tested, and had no caller anywhere in the frontend.
  const [rates, setRates] = useState(null);
  const [showRates, setShowRates] = useState(false);
  const [compare, setCompare] = useState(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [{ data: m }, { data: j }] = await Promise.all([
          api.get('/api/estimate/catalogue'),
          api.get('/api/estimate/jobs'),
        ]);
        if (!live) return;
        setMeta(m);
        setJobs(j.jobs || []);
        // Not awaited with the rest: the picker must not wait on a panel that
        // is empty until the business has finished a few jobs.
        api.get('/api/estimate/accuracy')
          .then(({ data }) => { if (live) setAccuracy(data); })
          .catch(() => {});
        api.get('/api/profile/pro/rates')
          .then(({ data }) => { if (live) setRates(data.rates || []); })
          .catch(() => { if (live) setRates([]); });
      } catch (e) {
        if (live) setError(e?.response?.data?.detail || 'Katalog konnte nicht geladen werden');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  /* The section layout comes from the server, which is where the mapping
     lives — the catalogue's own `group` cannot do this: all 19 Maler
     templates share the group "Maler & Tapezierer". */
  useEffect(() => {
    if (!trade) { setSections(null); return undefined; }
    let live = true;
    api.get('/api/estimate/jobs', { params: { trade } })
      .then(({ data }) => { if (live) setSections(data.sections || null); })
      .catch(() => { if (live) setSections(null); });
    return () => { live = false; };
  }, [trade]);

  /* Reset the search when the trade changes, so leaving and re-entering a
     category does not show a filtered list with the box apparently empty. */
  useEffect(() => { setQuery(''); }, [trade]);

  const visible = useMemo(() => {
    if (!trade) return [];
    const mine = jobs.filter((j) => j.trade === trade);
    const q = query.trim().toLowerCase();
    if (!q) return mine;
    return mine.filter((j) => j.label_de.toLowerCase().includes(q)
                           || j.key.toLowerCase().includes(q));
  }, [jobs, trade, query]);

  const openJob = async (key) => {
    setError('');
    setResult(null);
    setNotice('');
    try {
      /* `lang` matters: the per-field help comes back translated, and without
         it an English or Spanish pro read German explanations under English
         labels. The catalogue's own question wording stays German — that is
         the language the trade data is written in. */
      const { data } = await api.get(`/api/estimate/jobs/${key}`, { params: { lang } });
      setSelected(data);
      // Start from the form's own defaults. An empty form would estimate from
      // fallbacks the pro never saw and cannot correct.
      const seed = {};
      (data.form || []).forEach((q) => { if (q.default !== null && q.default !== undefined) seed[q.key] = q.default; });
      setAnswers(seed);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Dieser Auftragstyp konnte nicht geladen werden');
    }
  };

  const calculate = useCallback(async (key, ans, wantTier) => {
    setCalculating(true);
    try {
      const { data } = await api.post('/api/estimate', {
        job_key: key, answers: ans, tier: wantTier,
      });
      setResult(data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Die Schätzung konnte nicht berechnet werden');
    } finally {
      setCalculating(false);
    }
  }, []);

  // Recalculate as the form is answered. Debounced because number inputs fire
  // on every keystroke and a per-digit round trip makes the field feel laggy.
  useEffect(() => {
    if (!selected) return undefined;
    const key = selected.job.key;
    const id = setTimeout(() => calculate(key, answers, tier), 350);
    return () => clearTimeout(id);
  }, [selected, answers, tier, calculate]);

  useEffect(() => {
    if (!selected) return;
    api.get('/api/jobs', { params: { status: 'open', limit: 100 } })
      .then(({ data }) => setMyJobs(data.jobs || []))
      .catch(() => setMyJobs([]));
  }, [selected]);

  const set = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));

  const saveEstimate = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post('/api/estimate/save', {
        job_key: selected.job.key, answers, tier,
        job_id: targetJob || null,
      });
      setCreatedQuote(false);
      setNotice('Schätzung gemerkt. Sobald der Auftrag abgerechnet ist, '
        + 'vergleicht die App die tatsächlichen Stunden damit.');
    } catch (e) {
      setError(e?.response?.data?.detail || 'Die Schätzung konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  const createQuote = async () => {
    if (!targetJob) return;
    setCreating(true);
    setError('');
    try {
      const { data } = await api.post('/api/estimate/quote', {
        job_key: selected.job.key, answers, tier,
        job_id: targetJob, all_tiers: allTiers,
      });
      const n = (data.quotes || []).length;
      setNotice(`${n} ${n === 1 ? 'Angebot' : 'Angebote'} erstellt.`);
      setCreatedQuote(true);
      api.get('/api/estimate/accuracy').then(({ data: a }) => setAccuracy(a)).catch(() => {});
    } catch (e) {
      setError(e?.response?.data?.detail || 'Das Angebot konnte nicht erstellt werden');
    } finally {
      setCreating(false);
    }
  };

  /** Rebuild the speed correction from every finished, timed job.
      Rebuilt rather than nudged, so correcting one bad timer entry actually
      fixes the number instead of leaving it baked in. */
  const recalibrate = async () => {
    setCalibrating(true); setError('');
    try {
      const { data } = await api.post('/api/estimate/calibrate');
      const { data: a } = await api.get('/api/estimate/accuracy');
      setAccuracy(a);
      setNotice(`Neu berechnet aus ${data.jobs_measured} `
        + `${data.jobs_measured === 1 ? 'Auftrag' : 'Aufträgen'}.`);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Die Neuberechnung ist fehlgeschlagen');
    } finally { setCalibrating(false); }
  };

  /** The same answers at all three tiers. The escape from pure price
      comparison: a customer choosing between options is not a customer
      choosing the cheapest of eight quotes. */
  const compareTiers = async () => {
    setComparing(true); setError('');
    try {
      const { data } = await api.post('/api/estimate/compare', {
        job_key: selected.job.key, answers,
      });
      setCompare(data.tiers || null);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Der Vergleich ist fehlgeschlagen');
    } finally { setComparing(false); }
  };

  const saveRate = async (key, amount, label, unit) => {
    const { data } = await api.put('/api/profile/pro/rates',
                                   { key, amount, label, unit });
    setRates((rs) => rs.map((r) => (r.key === key ? { ...r, ...data } : r)));
  };

  const resetRate = async (key) => {
    await api.delete(`/api/profile/pro/rates/${encodeURIComponent(key)}`);
    const { data } = await api.get('/api/profile/pro/rates');
    setRates(data.rates || []);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 className="animate-spin text-ink-muted" size={24} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-4">
          {(selected || trade) && (
            <button
              type="button"
              onClick={() => {
                if (selected) { setSelected(null); setResult(null); setNotice(''); }
                else navigate('/estimate');
              }}
              className="p-2 -ml-2 text-ink-muted hover:text-ink min-w-[44px] min-h-[44px]
                         flex items-center justify-center"
              aria-label={t('back')}
              data-testid="estimate-back"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex-1">
            <h1 className="font-headings font-bold text-ink text-2xl">
              {t('estimate') || 'Schnellkalkulation'}
            </h1>
            <p className="text-sm text-ink-muted">
              {selected
                ? selected.job.group
                : trade
                  ? `${(meta?.trades || []).find((x) => x.key === trade)?.label || trade}`
                    + ` · ${visible.length} ${t('est_templates')}`
                  : t('est_pick_trade')}
            </p>
          </div>
        </div>

        {error && (
          <div className="card mb-3 flex items-start gap-2 text-sm text-red-warn" data-testid="estimate-error">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="card mb-3 text-sm text-ink flex items-center justify-between gap-3"
               data-testid="estimate-notice">
            <span>{notice}</span>
            {createdQuote && (
              <Link to="/quotes" className="btn-secondary shrink-0 text-xs py-1 px-3">
                Zu den Angeboten
              </Link>
            )}
          </div>
        )}

        {!selected ? (
          <>
            <JobPicker meta={meta} jobs={visible} trade={trade}
                       sections={query.trim() ? null : sections}
                       query={query} setQuery={setQuery}
                       onPickTrade={(k) => navigate(`/estimate/${k}`)}
                       onPick={openJob} t={t} lang={lang} />
            {/* Accuracy and the rate card are expert tools, not the task. They
                sat above the picker, so the first thing on the screen was
                never the thing the pro came to do. Below it now — still
                reachable, and both endpoints still have a caller. */}
            <div className="mt-6 space-y-2">
              <AccuracyCard data={accuracy} open={showAccuracy}
                            onToggle={() => setShowAccuracy((o) => !o)}
                            onRecalibrate={recalibrate} calibrating={calibrating} />
              <RateCard rates={rates} open={showRates}
                        onToggle={() => setShowRates((o) => !o)}
                        onSave={saveRate} onReset={resetRate} />
            </div>
          </>
        ) : (
          <>
            {/* The price above the form, not below it. The pro changes a
                field to see what it does to the number; with the number
                underneath a five-field form they had to scroll to find out,
                every time. */}
            <PriceHeader result={result} calculating={calculating} />
            <SurveyForm survey={selected} answers={answers} set={set}
                        tier={tier} setTier={setTier} />
            <Result result={result} calculating={calculating} form={selected.form} />
            {result && selected.tiers_differ && (
              <TierCompare tiers={compare} busy={comparing} tier={tier}
                           onCompare={compareTiers}
                           onPick={(k) => { setTier(k); setCompare(null); }} />
            )}
            {result && (
              <QuoteBox jobs={myJobs} targetJob={targetJob} setTargetJob={setTargetJob}
                        allTiers={allTiers} setAllTiers={setAllTiers}
                        tiersDiffer={!!selected.tiers_differ}
                        creating={creating} onCreate={createQuote}
                        saving={saving} onSave={saveEstimate} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function JobPicker({ meta, jobs, trade, sections, query, setQuery,
                    onPickTrade, onPick, t, lang }) {
  const trades = meta?.trades || [];

  // ── /estimate — the seven trades ──────────────────────────────────
  if (!trade) {
    return (
      <div className="grid grid-cols-2 gap-2.5" data-testid="estimate-trades">
        {trades.map((tr, i) => {
          const Icon = TRADE_ICON[tr.key] || Hammer;
          // The last card spans both columns when the count is odd, so the
          // grid never ends on a lone half-width card.
          const wide = trades.length % 2 === 1 && i === trades.length - 1;
          return (
            <button
              key={tr.key} type="button" onClick={() => onPickTrade(tr.key)}
              data-testid={`estimate-trade-${tr.key}`}
              className={`${wide ? 'col-span-2 min-h-[88px]' : 'min-h-[104px]'}
                          relative overflow-hidden text-left bg-paper border border-sm-border
                          rounded-[18px] px-3.5 py-3.5 flex flex-col justify-end gap-0.5
                          hover:border-teal/40 transition-colors
                          focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/30`}
            >
              <Icon size={64} strokeWidth={1.5} aria-hidden="true"
                    className="absolute -right-1.5 -top-1 opacity-[.16] text-teal
                               pointer-events-none" />
              <span className="relative font-headings font-bold text-[15.5px] tracking-[-.022em]">
                {tr.label}
              </span>
              <span className="relative text-[11.5px] text-ink-muted">
                {tr.count} {t('est_templates')}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // ── /estimate/:trade — that trade's templates ─────────────────────
  //
  // Nineteen rows that differ only in their wording is a list nobody scans;
  // they read it top to bottom or give up. Two things fix that and neither is
  // decoration: a search box, because typing three letters beats scrolling,
  // and headings, because a painter already sorts this work into indoors and
  // outdoors before they open the app.
  const byKey = new Map(jobs.map((j) => [j.key, j]));
  const groups = sections
    ? sections
        .map((sec) => ({
          ...sec,
          rows: sec.job_keys.map((k) => byKey.get(k)).filter(Boolean),
        }))
        .filter((sec) => sec.rows.length)
    : [{ key: '_all', rows: jobs }];

  return (
    <div data-testid="estimate-job-list">
      <label className="flex items-center gap-2 bg-paper border border-sm-border rounded-xl
                        px-3 py-2 mb-3 focus-within:ring-4 focus-within:ring-teal/25">
        <Search size={15} className="text-ink-faint shrink-0" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('est_search_ph')}
          aria-label={t('est_search_ph')}
          className="flex-1 min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-faint
                     outline-none"
          data-testid="estimate-search"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')}
                  aria-label={t('clear')} data-testid="estimate-search-clear"
                  className="text-ink-faint hover:text-ink shrink-0">
            <X size={14} />
          </button>
        )}
      </label>

      {groups.map((sec) => (
        <div key={sec.key}>
          {sec.key !== '_all' && (
            <h2 className="text-[11px] font-bold uppercase tracking-[.07em] text-ink-faint
                           mt-4 mb-1.5 px-0.5 flex items-baseline gap-1.5"
                data-testid={`estimate-section-${sec.key}`}>
              {sectionLabel(sec, lang)}
              <span className="font-medium normal-case tracking-normal opacity-80">
                · {sec.rows.length}
              </span>
            </h2>
          )}
          <div className="bg-paper border border-sm-border rounded-[14px] overflow-hidden">
            {sec.rows.map((j, i) => (
              <button key={j.key} type="button" onClick={() => onPick(j.key)}
                      data-testid={`estimate-job-${j.key}`}
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-3
                                  hover:bg-cream-soft transition-colors
                                  focus-visible:outline-none focus-visible:ring-4
                                  focus-visible:ring-teal/30 focus-visible:relative
                                  ${i ? 'border-t border-sm-border/70' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink text-[14px] leading-snug">{j.label_de}</p>
                  {j.quote_mode === 'regie' && (
                    /* The one badge that changes what the pro does next — and
                       now it says what it wants, rather than leaving a
                       first-time user to guess what an orange word means. */
                    <p className="text-[11px] text-amber-text mt-0.5 flex items-center gap-1">
                      <MapPin size={11} className="shrink-0" aria-hidden="true" />
                      {t('est_site_visit_short')}
                    </p>
                  )}
                </div>
                {/* The typical size moves out of the grey subtitle into its
                    own column. Same figure, but now it is something the eye
                    can run down instead of prose it has to read. */}
                <span className="shrink-0 text-right text-[11px] text-ink-faint leading-tight">
                  <b className="block text-[13px] font-semibold text-ink-soft tabular-nums">
                    {j.typical_size[0]}–{j.typical_size[1]}
                  </b>
                  {j.unit}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {jobs.length === 0 && (
        <p className="text-sm text-ink-muted text-center py-8" data-testid="estimate-empty">
          {query.trim() ? t('est_no_match', { q: query.trim() }) : t('est_no_templates')}
        </p>
      )}
    </div>
  );
}

/** The section heading in the interface language, German as the fallback —
 *  the catalogue is written in German and that is a real answer, not a
 *  missing one. */
function sectionLabel(sec, lang) {
  return (lang && lang !== 'de' && sec.labels?.[lang]) || sec.label_de;
}
function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition ${
              active ? 'bg-ink text-paper border-ink' : 'bg-paper text-ink-muted border-sm-border'}`}>
      {children}
    </button>
  );
}

/**
 * The number, kept where the pro can see it while they answer.
 *
 * It used to sit under the form. Changing "Zustand" from leerstehend to
 * bewohnt moves the total by a third, and to find that out you had to scroll
 * past five fields, read, and scroll back — so most people changed one thing,
 * looked, and never tried the second.
 *
 * Sticky, and it keeps the last figure while the next one is in flight rather
 * than blanking: a number that disappears every time you touch a field reads
 * as an error, not as loading.
 */
function PriceHeader({ result, calculating }) {
  const { t } = useLang();
  if (!result) {
    return (
      <div className="rounded-[17px] bg-teal text-paper p-4 mb-3 min-h-[104px]
                      flex items-center justify-center" data-testid="estimate-price-header">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }
  const [lo, hi] = result.total_net;
  const unit = result.job.unit;
  return (
    /* top-[4.5rem], not top-2: the app bar is `sticky top-0` and 4 rem tall,
       so a price card pinned to the viewport top slid underneath it and the
       figure — the one thing this card exists to show — was covered by the
       logo. z-20 keeps it under that bar rather than fighting it. */
    <div className={`sticky top-[4.5rem] z-20 rounded-[17px] bg-teal text-paper p-4 mb-3
                     shadow-[0_6px_20px_rgba(26,58,82,.18)] transition-opacity
                     ${calculating ? 'opacity-80' : ''}`}
         data-testid="estimate-price-header">
      <p className="text-[11.5px] text-teal-tint flex items-center gap-1.5">
        {t('est_net_estimated')}
        {calculating && <Loader2 className="animate-spin" size={11} />}
      </p>
      <p className="font-headings font-bold text-[30px] leading-[1.05] tracking-[-.035em]
                    tabular-nums mt-0.5" data-testid="estimate-price-value">
        {fmtEur(lo)} – {fmtEur(hi)}
      </p>
      <p className="text-[11.5px] text-teal-tint mt-1">
        {fmtNum(result.qty, 2)} {unit}
        {result.per_unit && ` · ${fmtEur2(result.per_unit[0])}–${fmtEur2(result.per_unit[1])} / ${unit}`}
        {result.rate_basis === 'notdienst' && ` · ${t('est_callout_rate')}`}
      </p>

      {/* Two numbers become a span you can see rather than one you compute.
          The fill is the whole track because lo and hi *are* the ends — the
          bar exists to give the spread a size, not to locate it. */}
      <div className="mt-3" aria-hidden="true">
        <div className="h-2 rounded-full bg-paper/25 overflow-hidden">
          <div className="h-full rounded-full bg-paper" style={{ width: '100%' }} />
        </div>
        <div className="flex justify-between text-[10.5px] text-teal-tint mt-1.5 tabular-nums">
          <span>{t('est_best_case')} {fmtEur(lo)}</span>
          <span>{t('est_worst_case')} {fmtEur(hi)}</span>
        </div>
      </div>
      <p className="sr-only">
        {t('est_range_sr', { lo: fmtEur(lo), hi: fmtEur(hi) })}
      </p>
    </div>
  );
}

/* What each answer does to the number. The estimator has always sorted them
   this way; the form has never said so, so five questions looked like five
   levers when two of them were. */
const EFFECT = {
  amount: { key: 'est_effect_amount', cls: 'bg-teal-tint text-teal-deep' },
  surcharge: { key: 'est_effect_surcharge', cls: 'bg-teal-tint text-teal-deep' },
  scope: { key: 'est_effect_scope', cls: 'bg-teal-tint text-teal-deep' },
  note: { key: 'est_effect_note', cls: 'bg-cream-deep text-ink-muted' },
};

function SurveyForm({ survey, answers, set, tier, setTier }) {
  const { t } = useLang();
  const job = survey.job;
  return (
    <div className="card-lg mb-3 space-y-3" data-testid="estimate-form">
      <div>
        <h2 className="font-headings font-bold text-ink text-[17px] leading-snug">
          {job.label_de}
        </h2>
        {job.site_visit_required && (
          /* Says what it wants, not just that something is special. The chip
             on the list before this screen read "Besichtigung" and left a
             first-time user to work out what that asked of them. */
          <div className="mt-2 flex gap-2 rounded-xl border border-amber-tint bg-amber/8 px-3 py-2.5">
            <MapPin size={15} className="text-amber-text mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-semibold text-amber-text">{t('est_regie_title')}</p>
              <p className="text-[11.5px] text-ink-soft leading-relaxed mt-0.5">
                {t('est_regie_body')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Shown only where it does something.

          A tier is not a markup — it selects which operations get priced, via
          `tier_min` on each one. The catalogue has 149 basic operations, 4
          standard ones and no premium ones at all, so Standard and Premium
          return an identical figure everywhere, and Basis differs on 4 of 149
          job types. Three of those four are in trades this app does not
          offer, which leaves exactly one of the 109 reachable templates —
          garten.beet_anlegen — where pressing these buttons changes anything.

          Three controls that return one number are worse than no control:
          the pro presses Premium, sees the same price, and stops trusting the
          rest of the screen. `tiers_differ` already knew, and the "create all
          three variants" box below already used it; the buttons did not.

          `tier` stays at its default of standard when this is hidden, which
          is the same estimate every tier would have produced. */}
      {survey.tiers_differ && (
        <div>
          <div className="flex gap-1 bg-cream-deep rounded-xl p-1" role="group"
               aria-label={t('est_tier_label')}>
            {TIERS.map((tr) => (
              <button key={tr} type="button" onClick={() => setTier(tr)}
                      aria-pressed={tier === tr}
                      className={`flex-1 text-xs font-semibold py-2 rounded-lg transition ${
                        tier === tr
                          ? 'bg-paper text-ink shadow-sm'
                          : 'text-ink-muted hover:text-ink'}`}
                      data-testid={`estimate-tier-${tr}`}>
                {TIER_LABEL[tr]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-faint text-center mt-1.5 leading-relaxed">
            {t(`est_tier_help_${tier}`)}
          </p>
        </div>
      )}

      {(survey.form || []).map((q) => {
        const eff = EFFECT[q.price_effect] || EFFECT.note;
        const id = `est-q-${q.key}`;
        const helpId = q.help ? `${id}-help` : undefined;
        /* A checkbox is labelled by the question itself, not by a separate
           heading plus the word "Ja". Rendering both gave the one control two
           `<label for>` elements — which is invalid, and which made a screen
           reader announce the question twice and "Ja" as if it were a second
           field. "Ja" alone is meaningless anyway once the heading above it
           has scrolled past. */
        const isBool = q.type === 'bool';
        /* Which answers reach the money and which only reach the wording of
           the quote. */
        const badge = (
          <span className={`shrink-0 text-[9.5px] font-bold uppercase tracking-wide
                            px-1.5 py-0.5 rounded-full ${eff.cls}`}>
            {t(eff.key)}
          </span>
        );
        return (
          <div key={q.key}>
            {/* A checkbox is its own label, so a heading above it would print
                the question twice. Everything else needs the heading, because
                a select shows its value, not its question. */}
            {!isBool && (
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={id} className="text-[11.5px] font-medium text-ink-muted">
                  {q.label_de}{q.unit ? ` (${q.unit})` : ''}
                </label>
                {badge}
              </div>
            )}
            {q.type === 'number' && (
              <NumberField id={id} className="input w-full mt-1" min={0}
                           aria-describedby={helpId}
                           value={answers[q.key] === '' || answers[q.key] == null
                             ? null : Number(answers[q.key])}
                           onChange={(n) => set(q.key, n == null ? '' : n)}
                           data-testid={`estimate-q-${q.key}`} />
            )}
            {q.type === 'choice' && (
              <select id={id} className="input w-full mt-1" value={answers[q.key] ?? ''}
                      aria-describedby={helpId}
                      onChange={(e) => set(q.key, e.target.value)}
                      data-testid={`estimate-q-${q.key}`}>
                {q.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            )}
            {isBool && (
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={id} className="flex items-center gap-2 cursor-pointer min-w-0">
                  <input id={id} type="checkbox" checked={!!answers[q.key]}
                         aria-describedby={helpId}
                         onChange={(e) => set(q.key, e.target.checked)}
                         data-testid={`estimate-q-${q.key}`} />
                  {/* The question, not the help text. Putting the explanation
                      inside the checkbox label made the box appear to mean the
                      sentence — "Erzeugt einen Hinweis im Angebot" is not
                      something you tick. */}
                  <span className="text-[13px] text-ink leading-snug">{q.label_de}</span>
                </label>
                {badge}
              </div>
            )}
            {q.help && (
              <p id={helpId} className="mt-1 text-[11px] text-ink-faint leading-relaxed">
                {q.help}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A question key back to the words the pro just read on the form.
 *
 *  `qty` never appears in the form array — it is the quantity field the
 *  survey builds from `typical_size` — so it gets the unit it is measured
 *  in, which is what the pro sees above that input. Anything still
 *  unresolved falls back to the key rather than to an empty string: an
 *  ugly word is recoverable, a missing one is not.
 */
function labelFor(form, key) {
  const q = (form || []).find((x) => x.key === key);
  if (q) return q.label_de;
  if (key === 'qty') return 'Menge';
  if (key === 'emergency' || key === 'zeit') return 'Einsatzzeit';
  return key;
}

function Result({ result, calculating, form }) {
  /* Its own translator. `t` lives in the default export's scope and these
     are siblings, not children of it — calling it here threw
     "t is not defined" the instant a template was opened, and the error
     boundary took the whole calculation screen with it. Every trade,
     every one of the 109 templates. */
  const { t } = useLang();

  if (!result) {
    return (
      <div className="card-lg mb-4 flex items-center justify-center py-10 text-ink-muted">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }
  const [lo, hi] = result.total_net;
  const band = result.market_band;
  // The band is per unit or per job depending on the entry, and comparing the
  // wrong one to the wrong one is how a sane estimate looks alarming.
  const compare = result.band_basis === 'per_unit' ? result.per_unit : result.total_net;
  const outside = band && ((compare[0] + compare[1]) / 2 < band[0]
    || (compare[0] + compare[1]) / 2 > band[1]);

  return (
    <div className={`card-lg mb-4 space-y-4 ${calculating ? 'opacity-60' : ''}`}
         data-testid="estimate-result">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat icon={Clock} label="Arbeitszeit"
              value={`${fmtNum(result.hours[0])}–${fmtNum(result.hours[1])} h`}
              sub={`davon ${fmtNum(result.setup_hours[0])}–${fmtNum(result.setup_hours[1])} h Rüstzeit`} />
        <Stat icon={Package} label="Material"
              value={`${fmtEur(result.material[0])}–${fmtEur(result.material[1])}`}
              sub={`Stundensatz ${fmtEur(result.hourly_used[0])}–${fmtEur(result.hourly_used[1])}`} />
        {result.debris_kg[1] > 0 && (
          <Stat icon={Trash2} label="Abfall"
                value={`${fmtNum(result.debris_kg[0], 0)}–${fmtNum(result.debris_kg[1], 0)} kg`}
                sub={result.container || ''} />
        )}
        {result.disposal[1] > 0 && (
          <Stat icon={Trash2} label="Entsorgung"
                value={`${fmtEur(result.disposal[0])}–${fmtEur(result.disposal[1])}`}
                sub="inkl. Container" />
        )}
      </div>

      {band && (
        <p className={`text-xs ${outside ? 'text-amber-700' : 'text-ink-muted'}`}>
          <Info size={12} className="inline mr-1 -mt-0.5" />
          Marktüblich {result.band_basis === 'per_unit'
            ? `${fmtEur2(band[0])}–${fmtEur2(band[1])} / ${result.job.unit}`
            : `${fmtEur(band[0])}–${fmtEur(band[1])}`} in {result.country}
          {outside && ' — diese Schätzung liegt außerhalb. Vor dem Versenden prüfen.'}
        </p>
      )}

      {result.calibration_note && (
        // The estimate is no longer the trade average. Saying so is not a
        // flourish: a pro who sees a number move without explanation stops
        // trusting the tool, and this is the number that came from their own
        // finished jobs rather than from a price radar.
        <p className="text-xs text-green-700 border border-green-700/30 bg-green-700/5
                      rounded-lg px-3 py-2">
          <TrendingUp size={12} className="inline mr-1 -mt-0.5" />
          {result.calibration_note}
        </p>
      )}

      {(!!result.answers_recorded?.length || !!result.answers_applied?.length) && (
        /* This printed the raw column names — literally "Preiswirksam:
           condition, access, qty. Nur vermerkt: untergrund_boden, feuchte."
           Nobody outside this repository knows what `untergrund_boden` is,
           and the pro reading it is being shown a database schema.
           `labelFor` maps a key back to the question that asked it, which is
           the wording the pro just answered. */
        <div className="rounded-xl border border-sm-border bg-cream-soft px-3 py-2.5"
             data-testid="estimate-drivers">
          <p className="text-[11.5px] font-semibold text-ink flex items-center gap-1.5">
            <Info size={12} className="shrink-0" aria-hidden="true" />
            {t('est_what_moved')}
          </p>
          {!!result.answers_applied?.length && (
            <p className="text-[11.5px] text-ink-soft leading-relaxed mt-1">
              {result.answers_applied.map((k) => labelFor(form, k)).join(' · ')}
            </p>
          )}
          {!!result.answers_recorded?.length && (
            <p className="text-[11.5px] text-ink-faint leading-relaxed mt-1.5">
              <span className="font-medium text-ink-muted">{t('est_recorded_only')}</span>{' '}
              {result.answers_recorded.map((k) => labelFor(form, k)).join(' · ')}.{' '}
              {t('est_recorded_why')}
            </p>
          )}
        </div>
      )}

      {!!result.notes.length && (
        /* These are the sentences that belong in the quote, not warnings —
           but three identical amber boxes stacked on top of each other read
           as three things having gone wrong. Only critical and high keep a
           coloured box; the rest become a checklist, which is what they are.
           The severity still drives the difference, so an asbestos warning
           and a note about who moves the furniture cannot look alike. */
        <div data-testid="estimate-notes">
          <p className="text-[11.5px] font-semibold text-ink flex items-center gap-1.5 mb-1">
            <Check size={13} className="shrink-0" aria-hidden="true" />
            {t('est_assumptions')}
          </p>
          <div className="space-y-1.5">
            {result.notes.map((n) => (
              ['critical', 'high'].includes(n.severity) ? (
                <div key={n.key}
                     className={`text-[11.5px] leading-relaxed border rounded-lg px-3 py-2
                                 ${SEVERITY[n.severity]?.cls || SEVERITY.medium.cls}`}>
                  <span className="font-semibold">{SEVERITY[n.severity]?.label}: </span>{n.text_de}
                </div>
              ) : (
                <div key={n.key} className="flex gap-2 text-[11.5px] leading-relaxed text-ink-soft
                                            border-t border-sm-border/70 pt-1.5">
                  <Check size={12} className="text-ink-faint shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{n.text_de}</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {result.rates_applied > 0 && (
        // Once the business's own prices are in play the two figures measure
        // different things, and showing both is the comparison a pro most
        // wants. Collapsing them would hide it behind a discrepancy.
        <div className="text-xs border border-green-700/30 bg-green-700/5 rounded-lg px-3 py-2">
          <TrendingUp size={12} className="inline mr-1 -mt-0.5 text-green-700" />
          <span className="text-ink">
            Mit Ihren eigenen Sätzen: <b>{fmtEur2(result.lines_net)}</b>
          </span>
          <span className="text-ink-muted">
            {' '}· Richtwert {fmtEur(result.total_net[0])}–{fmtEur(result.total_net[1])}
            {' '}· {result.rates_applied} von {result.lines.length} Positionen
            aus Ihren angenommenen Angeboten
          </span>
        </div>
      )}

      <details>
        <summary className="text-xs text-ink-muted cursor-pointer">
          {result.lines.length} Positionen · {fmtEur2(result.lines_net)}
        </summary>
        <table className="w-full mt-2 text-xs">
          <tbody>
            {result.lines.map((l) => (
              <tr key={l.position} className="border-b border-sm-border/60">
                <td className="py-1.5 pr-2 text-ink">
                  {l.description}
                  {l.rate_source === 'pro' && (
                    <span className="ml-1 text-[10px] text-green-700">{t('est_own_rate')}</span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-right text-ink-muted whitespace-nowrap">
                  {fmtNum(l.qty, 2)} {l.unit}
                </td>
                <td className="py-1.5 text-right text-ink whitespace-nowrap">
                  {fmtEur2(l.unit_price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div>
      <p className="text-xs text-ink-muted flex items-center gap-1">
        <Icon size={12} />{label}
      </p>
      <p className="text-ink font-medium">{value}</p>
      {sub && <p className="text-[11px] text-ink-muted">{sub}</p>}
    </div>
  );
}

function QuoteBox({ jobs, targetJob, setTargetJob, allTiers, setAllTiers, tiersDiffer,
                   creating, onCreate, saving, onSave }) {
  /* Its own translator. `t` lives in the default export's scope and these
     are siblings, not children of it — calling it here threw
     "t is not defined" the instant a template was opened, and the error
     boundary took the whole calculation screen with it. Every trade,
     every one of the 109 templates. */
  const { t } = useLang();

  return (
    <div className="card-lg mb-4 space-y-3" data-testid="estimate-quote-box">
      <p className="text-sm font-medium text-ink flex items-center gap-2">
        <FileText size={15} />Als Angebot übernehmen
      </p>
      <select className="input w-full" value={targetJob}
              onChange={(e) => setTargetJob(e.target.value)} data-testid="estimate-target-job">
        <option value="">{t('est_pick_job')}</option>
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>
            {j.job_number ? `${j.job_number} · ` : ''}{j.title}
          </option>
        ))}
      </select>
      {/* Offered only where the catalogue actually distinguishes the tiers.
          For 132 of the 136 job types every tier resolves to the same
          operations, so ticking this produced three identical quotes — worse
          than one, because the customer sees a choice that is not one. */}
      {tiersDiffer && (
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" checked={allTiers}
                 onChange={(e) => setAllTiers(e.target.checked)} />
          Alle drei Varianten anlegen — eine Wahl zwischen Optionen ist keine
          Wahl zwischen acht Preisen.
        </label>
      )}
      <button type="button" className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={!targetJob || creating} onClick={onCreate} data-testid="estimate-create-quote">
        {creating ? <Loader2 className="animate-spin" size={16} /> : <Calculator size={16} />}
        Angebot erstellen
      </button>
      {!jobs.length && (
        <p className="text-xs text-ink-muted">
          Kein offener Auftrag vorhanden. Ein Angebot hängt immer an einem Auftrag.
        </p>
      )}
      {/* Separate from the quote on purpose. A job that was calculated and not
          quoted is real evidence about how this business prices; learning only
          from work that was won would bias the model toward the cheap jobs. */}
      <button type="button" className="btn-secondary w-full flex items-center justify-center gap-2"
              disabled={saving} onClick={onSave} data-testid="estimate-save">
        {saving ? <Loader2 className="animate-spin" size={16} /> : <Bookmark size={16} />}
        Nur merken, kein Angebot
      </button>
    </div>
  );
}

function AccuracyCard({ data, open, onToggle, onRecalibrate, calibrating }) {
  if (!data || !data.jobs_measured) return null;
  const o = data.overall;
  const enough = o?.applies;
  return (
    <div className="card-lg mb-4" data-testid="estimate-accuracy">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <p className="text-xs text-ink-muted flex items-center gap-1">
          <TrendingUp size={12} />Aus Ihren abgerechneten Aufträgen
        </p>
        <div className="flex items-baseline justify-between gap-3 mt-1">
          <p className="font-headings font-bold text-ink text-xl">
            {data.realised_hourly_all != null
              ? `${fmtEur2(data.realised_hourly_all)} / h tatsächlich`
              : `${data.jobs_measured} Aufträge gemessen`}
          </p>
          <span className="text-xs text-ink-muted">
            {data.jobs_measured} {data.jobs_measured === 1 ? 'Auftrag' : 'Aufträge'}
          </span>
        </div>
        {/* The gap between the rate on the quote and the rate the hours
            actually earned is the number almost nobody computes for
            themselves, and it is usually the lower one. */}
        {o && (
          <p className="text-xs text-ink-muted mt-1">
            {enough
              ? `Sie brauchen im Schnitt das ${fmtNum(o.hours_factor, 2)}-fache der `
                + 'Richtwerte. Neue Schätzungen sind entsprechend angepasst.'
              : `Noch ${data.min_samples - (o.samples || 0)} abgerechnete `
                + 'Aufträge, bis die Anpassung greift — bis dahin nur zur Information.'}
          </p>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-1">
          {/* Rebuilt from scratch, not nudged — so correcting one bad timer
              entry actually fixes the figure. The endpoint existed and had no
              caller, which left the loop closed on the server and open on the
              screen. */}
          <button type="button" onClick={onRecalibrate} disabled={calibrating}
                  className="btn-ghost text-xs mb-2" data-testid="estimate-recalibrate">
            {calibrating
              ? <Loader2 size={12} className="animate-spin" />
              : <RefreshCw size={12} />}
            Neu berechnen
          </button>
          {data.jobs.map((j) => (
            <div key={j.estimate_id}
                 className={`flex items-baseline justify-between gap-2 text-xs py-1
                             border-b border-sm-border/60 ${j.excluded ? 'opacity-50' : ''}`}>
              <span className="text-ink truncate">{j.job_number || j.title}</span>
              <span className="text-ink-muted whitespace-nowrap">
                {fmtNum(j.predicted_hours)} → {fmtNum(j.actual_hours)} h
                {j.excluded
                  ? ' · ausgeschlossen'
                  : ` · ×${fmtNum(j.ratio, 2)}`}
              </span>
            </div>
          ))}
          {data.jobs.some((j) => j.excluded) && (
            // Shown rather than silently dropped, so a forgotten timer can be
            // found and corrected instead of quietly skewing nothing.
            <p className="text-[11px] text-ink-muted pt-1">
              Ausgeschlossene Aufträge weichen zu stark ab, um etwas über Ihr
              Arbeitstempo auszusagen — meist ein vergessener Timer oder ein
              Auftrag, dessen Umfang sich geändert hat.
            </p>
          )}
        </div>
      )}
    </div>
  );
}


/**
 * What this business charges, and the evidence for it.
 *
 * `GET/PUT/DELETE /api/profile/pro/rates` were mounted, tested and called by
 * nothing — so the input every estimate, quote line and invoice default
 * depends on had no screen at all. The rates are learned from accepted quotes
 * (median over samples), which means the cold start is covered; what was
 * missing was any way to see them or correct one.
 */
function RateCard({ rates, open, onToggle, onSave, onReset }) {
  /* Its own translator. `t` lives in the default export's scope and these
     are siblings, not children of it — calling it here threw
     "t is not defined" the instant a template was opened, and the error
     boundary took the whole calculation screen with it. Every trade,
     every one of the 109 templates. */
  const { t } = useLang();

  const [editing, setEditing] = useState(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  if (!rates || rates.length === 0) return null;

  const commit = async (r) => {
    const amount = parseFloat(value);
    if (!(amount > 0)) { setEditing(null); return; }
    setBusy(true);
    try { await onSave(r.key, amount, r.label, r.unit); }
    finally { setBusy(false); setEditing(null); }
  };

  const manual = rates.filter((r) => r.is_manual).length;

  return (
    <div className="card-lg mb-4" data-testid="estimate-rates">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <p className="text-xs text-ink-muted flex items-center gap-1">
          <Coins size={12} />Aus Ihren angenommenen Angeboten gelernt
        </p>
        <div className="flex items-baseline justify-between gap-3 mt-1">
          <p className="font-headings font-bold text-ink text-xl">
            {rates.length} {rates.length === 1 ? 'Preis' : 'Preise'}
          </p>
          <span className="text-xs text-ink-muted">
            {manual > 0 ? `${manual} selbst gesetzt` : 'alle gelernt'}
          </span>
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-1">
          {rates.map((r) => (
            <div key={r.key}
                 className="flex items-center justify-between gap-2 text-xs py-1.5
                            border-b border-sm-border/60"
                 data-testid={`estimate-rate-${r.key}`}>
              <span className="text-ink min-w-0">
                {r.label || r.key}
                <span className="block text-[11px] text-ink-muted">
                  {/* The spread, because a rate built from prices between 38
                      and 92 means something different from one built from
                      prices between 61 and 64. */}
                  {r.n_samples > 0
                    ? `${r.n_samples} ${r.n_samples === 1 ? 'Angebot' : 'Angebote'}`
                      + (r.low != null && r.high != null && r.low !== r.high
                          ? ` · ${fmtEur2(r.low)}–${fmtEur2(r.high)}` : '')
                    : 'ohne Belege'}
                  {r.is_manual && ' · selbst gesetzt'}
                </span>
              </span>
              {editing === r.key ? (
                <span className="flex items-center gap-1 shrink-0">
                  <input
                    type="number" min="0" step="0.01" autoFocus
                    className="input h-8 w-24 text-xs" value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commit(r); }}
                    aria-label={r.label || r.key}
                  />
                  <button type="button" className="btn-primary h-8 px-2 text-xs"
                          disabled={busy} onClick={() => commit(r)}>
                    <Check size={12} />
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-ink font-medium whitespace-nowrap">
                    {fmtEur2(r.amount)}{r.unit ? ` / ${r.unit}` : ''}
                  </span>
                  <button type="button"
                          className="text-ink-muted hover:text-teal p-1"
                          aria-label={t('est_change_price')} title={t('est_change_price')}
                          onClick={() => { setEditing(r.key); setValue(String(r.amount)); }}>
                    <Pencil size={12} />
                  </button>
                  {r.is_manual && (
                    // Reverting restores the learned median; the samples kept
                    // accruing underneath the override the whole time.
                    <button type="button"
                            className="text-ink-muted hover:text-red-warn p-1"
                            aria-label={t('est_reset_learned')}
                            title={t('est_reset_learned')}
                            onClick={() => onReset(r.key)}>
                      <RotateCcw size={12} />
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
          <p className="text-[11px] text-ink-muted pt-2">
            Ein selbst gesetzter Preis wird vom Lernen nicht mehr überschrieben.
          </p>
        </div>
      )}
    </div>
  );
}


/**
 * The same answers at all three tiers.
 *
 * `POST /api/estimate/compare` was mounted and unused. The tier select on the
 * quote form only tagged one quote; there was no way to see what the other
 * two would cost, which is the whole point of offering three.
 */
function TierCompare({ tiers, busy, tier, onCompare, onPick }) {
  // Only rendered for job types whose catalogue entry actually gates an
  // operation by tier — see `tiers_differ` in estimator.survey(). Offering a
  // choice between three identical prices makes the product look broken and
  // the tradesperson look careless.
  const LABELS = { basic: 'Basis', standard: 'Standard', premium: 'Premium' };
  if (!tiers) {
    return (
      <button type="button" onClick={onCompare} disabled={busy}
              className="btn-ghost w-full mb-4 text-sm" data-testid="estimate-compare">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
        Alle drei Varianten vergleichen
      </button>
    );
  }
  return (
    <div className="card-lg mb-4" data-testid="estimate-compare-result">
      <p className="text-xs text-ink-muted mb-3">
        Dieselben Angaben, drei Ausführungen. Ein Kunde, der zwischen Varianten
        wählt, vergleicht nicht mehr nur den Preis.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {['basic', 'standard', 'premium'].map((k) => {
          const e = tiers[k];
          if (!e) return null;
          const [lo, hi] = e.total_net || [0, 0];
          return (
            <button
              key={k} type="button" onClick={() => onPick(k)}
              className={`card p-3 text-left transition-colors
                          ${tier === k ? 'border-teal bg-teal/5' : 'hover:border-teal/40'}`}
              data-testid={`estimate-tier-${k}`}
            >
              <p className="text-[10px] uppercase font-bold tracking-wider text-ink-muted">
                {LABELS[k]}
              </p>
              <p className="font-headings font-bold text-ink text-lg mt-0.5">
                {lo === hi ? fmtEur2(lo) : `${fmtEur2(lo)}–${fmtEur2(hi)}`}
              </p>
              <p className="text-[11px] text-ink-muted mt-0.5">
                {fmtNum(e.hours?.[0])}–{fmtNum(e.hours?.[1])} h · netto
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
