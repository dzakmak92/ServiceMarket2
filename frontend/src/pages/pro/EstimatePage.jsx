import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import NumberField from '../../components/NumberField';
import { fmtEur0 as fmtEur, fmtEur as fmtEur2, fmtNum as fmtNumRaw } from '../../utils/money';

import {
  Loader2, AlertTriangle, ArrowLeft, Calculator, FileText,
  Trash2, Clock, Package, Info, MapPin, TrendingUp, Bookmark, Search, X,
  ChevronDown, ChevronUp,
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
  /* Which answers the pro actually touched. Every question ships a default,
     so a count of "filled in" would read 100 % before they had done
     anything — the ring has to distinguish their figure from our guess. */
  const [touched, setTouched] = useState(() => new Set());
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
      setTouched(new Set());
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

  const set = (k, v) => {
    setAnswers((a) => ({ ...a, [k]: v }));
    setTouched((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));
  };

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
                        tier={tier} setTier={setTier} result={result}
                        touched={touched} />
            {/* The running total, directly under the form it explains. */}
            <Tally result={result} t={t} />
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

/* What each answer did to the number — measured, not declared.
 *
 * The first version of this read `affects` from the catalogue and badged
 * anything marked `variant` as a price driver. It is not one. The estimator
 * says so in its own docstring: "Questions declared affects='variant' … are
 * recorded and attach notes, but nothing in the arithmetic reads them yet."
 * Measured on maler.innenanstrich: all five Untergrund options, Farbwechsel,
 * Nikotin and Möblierung move the total by exactly € 0, while Zustand moves
 * it by up to €307 and Zugang by up to €128. A pro told that "Rissig oder
 * abblätternd" is priced would quote a crumbling wall at the intact price.
 *
 * So the badge now comes from `answers_applied`, which is the estimator
 * reporting what it actually used, rather than from a declaration that has
 * drifted from the arithmetic. `zeit` is the case that proves the point: it
 * is declared `variant`, but it can set the Notdienst flag, and when it does
 * the estimator lists it — so it gets the price badge exactly when it earns
 * one.
 */
const EFFECT = {
  price: { key: 'est_effect_price', cls: 'bg-teal-tint text-teal-deep' },
  note: { key: 'est_effect_note', cls: 'bg-cream-deep text-ink-muted' },
};

/** Did this answer reach the total on the last calculation? */
function effectOf(result, key) {
  if (!result) return null;                       // nothing measured yet
  const applied = result.answers_applied || [];
  if (applied.includes(key)) return EFFECT.price;
  // `zeit` is reported as `emergency` once it trips the callout tariff.
  if (key === 'zeit' && applied.includes('emergency')) return EFFECT.price;
  return EFFECT.note;
}

/* ── the stepper ───────────────────────────────────────────────────────
 *
 * Three cards, and the order is the argument: how much, then the two answers
 * that move the money, then everything that only reaches the wording of the
 * quote. A pro who stops after card two has a usable number; one who stops
 * after card one has the app's guess, and card one says so.
 *
 * No connecting rail. The first draft had one — a 22 px circle joined by a
 * 2 px line — and it breaks at 200 % text size: the label grows, the line
 * does not, and the circle stops lining up with what it numbers. A large
 * numeral inside the card header carries the same ordering and scales with
 * everything around it.
 */

/** Which card a question belongs on.
 *
 *  The quantity is card one. `condition` and `access` are card two: those are
 *  the three the estimator reports in `answers_applied`, and unlike the
 *  `variant` questions they really do reach the total. Everything else is
 *  card three, which is honest about being documentation rather than
 *  pricing.
 *
 *  `is_quantity` comes from the survey, and it has to: only 56 of the 149 job
 *  types ask for the quantity under the key `qty`. The rest call it `anzahl`,
 *  `flaeche`, `stufen`, `wohnflaeche` — and matching on the literal key,
 *  which is what this did first, filed the most important question on every
 *  one of those templates under "documentation" and left card one off the
 *  screen entirely. Nor is `affects === 'qty'` the test: a cable run in lfm
 *  on a job priced per Stk declares `qty` and moves the total by € 0.
 *
 *  Deliberately not derived from the live result: the cards would reshuffle
 *  under the pro's fingers as each estimate lands.
 */
function cardOf(q) {
  if (q.is_quantity) return 1;
  if (q.affects === 'condition' || q.affects === 'access') return 2;
  return 3;
}

/** How many of a card's answers came from the pro rather than from us.
 *
 *  Not "how many are filled in" — every question ships a default and the form
 *  seeds them all, so that count reads 100 % before anyone has touched
 *  anything.
 *
 *  Nor `qty_source` from the estimator, which was the first attempt: it
 *  reports `typical_size` only when no quantity was sent at all, and this
 *  form always sends one because it seeds the field with the catalogue's
 *  midpoint. From the server the pro's 57,5 and our 57,5 are the same
 *  request. Only the client knows which of them typed it.
 */
function confirmedCount(questions, touched) {
  return questions.filter((q) => touched.has(q.key)).length;
}

function Ring({ done, total, t }) {
  const R = 15;
  const C = 2 * Math.PI * R;
  const frac = total ? done / total : 0;
  const full = done >= total && total > 0;
  return (
    <div className="relative w-[34px] h-[34px] shrink-0"
         role="img" aria-label={t('est_confirmed_of', { done, total })}>
      <svg viewBox="0 0 36 36" className="w-[34px] h-[34px] -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={R} fill="none" strokeWidth="3.5" className="stroke-cream-deep" />
        <circle cx="18" cy="18" r={R} fill="none" strokeWidth="3.5" strokeLinecap="round"
                className={full ? 'stroke-teal' : 'stroke-amber-deep'}
                strokeDasharray={`${(C * frac).toFixed(2)} ${C.toFixed(2)}`} />
      </svg>
      <span aria-hidden="true"
            className={`absolute inset-0 grid place-items-center text-[9.5px] font-bold tabular-nums
                        ${full ? 'text-teal-deep' : 'text-amber-text'}`}>
        {done}/{total}
      </span>
    </div>
  );
}

/** One priced choice, as chips that carry what the other options would cost.
 *
 *  A dropdown hides the consequence behind a tap. "Should I price this as an
 *  occupied Altbau?" is the question, and the answer — €307 more at the top
 *  of the range — is the thing worth showing. The figure is the upper bound
 *  against the current selection, because that is the number a quote gets
 *  wrong in the expensive direction.
 */
function OptionChips({ q, value, onPick, alts, t }) {
  const byValue = new Map((alts || []).map((a) => [a.value, a]));
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5" role="group"
         aria-label={q.label_de} data-testid={`estimate-chips-${q.key}`}>
      {(q.options || []).map(([v, label]) => {
        const on = v === value;
        const alt = byValue.get(v);
        const hi = alt ? alt.delta[1] : null;
        const show = !on && hi != null && Math.abs(hi) >= 1;
        return (
          <button key={v} type="button" onClick={() => onPick(v)} aria-pressed={on}
                  data-testid={`estimate-chip-${q.key}-${v}`}
                  className={`text-[11.5px] leading-tight px-2.5 py-1.5 rounded-full border transition
                              min-h-[32px] ${on
                    ? 'bg-ink text-paper border-ink font-semibold'
                    : 'bg-paper text-ink-muted border-sm-border hover:border-ink/30'}`}>
            {label}
            {show && (
              <span className={`ml-1 text-[10px] tabular-nums font-semibold
                                ${hi < 0 ? 'text-green-pos' : 'text-ink-faint'}`}>
                {hi > 0 ? '+' : '−'}{fmtEur(Math.abs(hi))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function StepCard({ n, title, sub, ring, amount, muted, children, testid }) {
  return (
    <div className={`rounded-[14px] border border-sm-border p-3.5 mb-2.5
                     ${muted ? 'bg-cream-soft' : 'bg-paper'}`}
         data-testid={testid}>
      <div className="flex items-start gap-2.5 mb-2.5">
        <span aria-hidden="true"
              className={`font-headings font-bold text-[24px] leading-[.85] w-5 shrink-0
                          ${muted ? 'text-cream-dark' : 'text-teal-tint'}`}>{n}</span>
        <div className="flex-1 min-w-0">
          <h3 className={`text-[13px] font-bold leading-tight ${muted ? 'text-ink-muted' : 'text-ink'}`}>
            {title}
          </h3>
          {sub && <p className="text-[10.5px] text-ink-faint mt-0.5 leading-snug">{sub}</p>}
        </div>
        {amount}
        {ring}
      </div>
      {children}
    </div>
  );
}

function SurveyForm({ survey, answers, set, tier, setTier, result, touched }) {
  const { t } = useLang();
  const [notesOpen, setNotesOpen] = useState(false);
  const job = survey.job;
  const form = survey.form || [];
  const bd = result?.breakdown;

  const cards = { 1: [], 2: [], 3: [] };
  form.forEach((q) => { cards[cardOf(q)].push(q); });
  const qtyKey = cards[1][0]?.key;

  const field = (q) => {
    const id = `est-q-${q.key}`;
    const helpId = q.help ? `${id}-help` : undefined;
    const alts = bd?.alternatives?.[q.key];
    return (
      <div key={q.key} className="mb-3 last:mb-0">
        {q.type === 'bool' ? (
          <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
            <input id={id} type="checkbox" checked={!!answers[q.key]}
                   aria-describedby={helpId}
                   onChange={(e) => set(q.key, e.target.checked)}
                   data-testid={`estimate-q-${q.key}`} />
            <span className="text-[13px] text-ink leading-snug">{q.label_de}</span>
          </label>
        ) : (
          <>
            <label htmlFor={id} className="text-[11px] font-medium text-ink-muted">
              {q.label_de}{q.unit ? ` (${q.unit})` : ''}
            </label>
            {q.type === 'number' && (
              <NumberField id={id} className="input w-full mt-1" min={0}
                           aria-describedby={helpId}
                           value={answers[q.key] === '' || answers[q.key] == null
                             ? null : Number(answers[q.key])}
                           onChange={(n) => set(q.key, n == null ? '' : n)}
                           data-testid={`estimate-q-${q.key}`} />
            )}
            {q.type === 'choice' && (alts
              /* Chips where the options carry a price, a select where they
                 do not — eight unpriced options as chips is a wall of pills
                 that reads as more important than it is. */
              ? <OptionChips q={q} value={answers[q.key]} alts={alts} t={t}
                             onPick={(v) => set(q.key, v)} />
              : (
                <select id={id} className="input w-full mt-1" value={answers[q.key] ?? ''}
                        aria-describedby={helpId}
                        onChange={(e) => set(q.key, e.target.value)}
                        data-testid={`estimate-q-${q.key}`}>
                  {q.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              ))}
          </>
        )}
        {q.help && (
          <p id={helpId} className="mt-1 text-[10.5px] text-ink-faint leading-relaxed">{q.help}</p>
        )}
      </div>
    );
  };

  const ringFor = (list) => (
    <Ring done={confirmedCount(list, touched)} total={list.length} t={t} />
  );

  const step2Delta = (bd?.steps || []).reduce(
    (acc, s) => [acc[0] + s.delta[0], acc[1] + s.delta[1]], [0, 0]);

  return (
    <div data-testid="estimate-form">
      <h2 className="font-headings font-bold text-ink text-[15.5px] leading-snug px-1 pb-2">
        {job.label_de}
      </h2>

      {job.site_visit_required && (
        <div className="mb-2.5 flex gap-2 rounded-xl border border-amber-tint bg-amber/8 px-3 py-2.5">
          <MapPin size={15} className="text-amber-text mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[12px] font-semibold text-amber-text">{t('est_regie_title')}</p>
            <p className="text-[11.5px] text-ink-soft leading-relaxed mt-0.5">{t('est_regie_body')}</p>
          </div>
        </div>
      )}

      {survey.tiers_differ && (
        <div className="mb-2.5">
          <div className="flex gap-1 bg-cream-deep rounded-xl p-1" role="group"
               aria-label={t('est_tier_label')}>
            {TIERS.map((tr) => (
              <button key={tr} type="button" onClick={() => setTier(tr)} aria-pressed={tier === tr}
                      className={`flex-1 text-xs font-semibold py-2 rounded-lg transition ${
                        tier === tr ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
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

      {/* Card one always stands, even on the handful of templates with no
          quantity to ask for. A screen that simply starts at "2" reads as a
          form that failed to load — and the pro is entitled to know the
          estimate covers one whole job rather than wondering which field
          they missed. */}
      <StepCard n="1" testid="estimate-step-1"
                title={t('est_step_qty')}
                sub={qtyKey
                  ? (touched.has(qtyKey) ? t('est_step_qty_yours') : t('est_step_qty_guess'))
                  : t('est_step_qty_flat_sub')}
                ring={qtyKey ? ringFor(cards[1]) : null}>
        {qtyKey ? cards[1].map(field) : (
          <p className="text-[12px] text-ink-soft leading-relaxed" data-testid="estimate-step-1-flat">
            {t('est_step_qty_flat')}
          </p>
        )}
      </StepCard>

      {cards[2].length > 0 && (
        <StepCard n="2" testid="estimate-step-2"
                  title={t('est_step_price')}
                  sub={bd ? t('est_step_price_sub') : null}
                  amount={bd && (step2Delta[1] !== 0 || step2Delta[0] !== 0) ? (
                    <span className="text-[12px] font-bold tabular-nums text-red-warn shrink-0 text-right leading-tight">
                      <small className="block text-[9px] font-semibold uppercase tracking-wide text-ink-faint">
                        {t('est_surcharge')}
                      </small>
                      + {fmtEur(step2Delta[0])} … {fmtEur(step2Delta[1])}
                    </span>
                  ) : null}
                  ring={ringFor(cards[2])}>
          {cards[2].map(field)}
        </StepCard>
      )}

      {cards[3].length > 0 && (
        <StepCard n="3" muted testid="estimate-step-3"
                  title={t('est_step_note')}
                  /* Only claimed when it is true. The card is filled by
                     `affects`, and if a question declared `variant` ever
                     starts reaching the total, `answers_applied` will say so
                     and this stops promising otherwise. That drift is exactly
                     what put a wrong badge on this screen once already. */
                  sub={cards[3].some((q) => (result?.answers_applied || []).includes(q.key))
                    ? null : t('est_step_note_sub')}
                  ring={ringFor(cards[3])}>
          <button type="button" onClick={() => setNotesOpen((o) => !o)}
                  aria-expanded={notesOpen} data-testid="estimate-step-3-toggle"
                  className="w-full flex items-center justify-between gap-2 text-left
                             text-[12.5px] text-ink-soft min-h-[44px]">
            <span>{cards[3].map((q) => q.label_de).join(' · ')}</span>
            {notesOpen ? <ChevronUp size={14} className="text-ink-faint shrink-0" />
                       : <ChevronDown size={14} className="text-ink-faint shrink-0" />}
          </button>
          {notesOpen && <div className="mt-2">{cards[3].map(field)}</div>}
        </StepCard>
      )}
    </div>
  );
}

/** The running total, ending on the figure in the header.
 *
 *  Every line comes from the estimator run again with one answer changed, so
 *  the lines cannot disagree with the total — verified: 284,44 + 37,48 =
 *  321,92, which is what the header says.
 */
function Tally({ result, t }) {
  const bd = result?.breakdown;
  if (!bd) return null;
  const [lo, hi] = result.total_net;
  return (
    <div className="rounded-[14px] border border-sm-border bg-paper p-3.5 mb-3"
         data-testid="estimate-tally">
      <p className="text-[11px] font-medium text-ink-muted mb-1.5">{t('est_how_it_adds_up')}</p>
      <Row k={`${fmtNum(result.qty, 2)} ${result.job.unit}`} sub={t('est_base_value')}
           v={`${fmtEur(bd.base_net[0])} – ${fmtEur(bd.base_net[1])}`} />
      {bd.steps.map((s) => (
        <Row key={s.key} k={s.value_label || s.label} sub={s.label}
             v={s.delta[1] === 0 && s.delta[0] === 0
               ? `± ${fmtEur(0)}`
               : `+ ${fmtEur(s.delta[0])} … ${fmtEur(s.delta[1])}`}
             tone={s.delta[1] === 0 && s.delta[0] === 0 ? 'zero' : 'up'} />
      ))}
      {!!result.answers_recorded?.length && (
        <Row k={t('est_recorded_short')} sub={t('est_note_only')}
             v={`± ${fmtEur(0)}`} tone="zero" />
      )}
      <div className="flex justify-between items-baseline gap-3 border-t-[1.5px] border-sm-border mt-1.5 pt-2">
        <span className="text-[12px] font-bold text-ink">{t('est_net_estimated')}</span>
        <span className="font-headings font-bold text-[16px] tabular-nums">
          {fmtEur(lo)} – {fmtEur(hi)}
        </span>
      </div>
    </div>
  );
}

function Row({ k, sub, v, tone }) {
  return (
    <div className="flex justify-between items-baseline gap-3 py-1">
      <span className="text-[12px] text-ink-soft min-w-0">
        {k}{sub && <small className="block text-[10px] text-ink-faint">{sub}</small>}
      </span>
      <span className={`text-[12px] font-semibold tabular-nums shrink-0
                        ${tone === 'up' ? 'text-red-warn' : tone === 'zero' ? 'text-ink-faint' : 'text-ink'}`}>
        {v}
      </span>
    </div>
  );
}

/** A question key back to the words the pro just read on the form.
 *
 *  The form carries every question the pro answered, `qty` included, so the
 *  lookup nearly always wins. The two lines below cover keys the estimator
 *  reports for jobs whose form does not name them. Anything still unresolved
 *  falls back to the key rather than to an empty string: an ugly word is
 *  recoverable, a missing one is not.
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

      {/* The drivers panel that used to sit here has moved into the tally
          above the result, where each answer is listed with what it actually
          contributed. Two panels naming the same answers in different words —
          one with amounts, one without — is one more than the screen needs,
          and the one without amounts is the weaker of the two. */}
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
