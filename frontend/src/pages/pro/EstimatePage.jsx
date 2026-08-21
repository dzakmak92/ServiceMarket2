import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import NumberField from '../../components/NumberField';
import EstimateCards from './EstimateCards';
import GroupDial from '../../components/pro/GroupDial';
import DialSwipe from '../../components/pro/DialSwipe';
import TradeRow from '../../components/pro/TradeRow';
import { fmtEur0 as fmtEur, fmtEur as fmtEur2, fmtNum as fmtNumRaw } from '../../utils/money';

import {
  Loader2, AlertTriangle, ArrowLeft, Calculator, FileText,
  Trash2, Clock, Package, Info, MapPin, TrendingUp, Bookmark,
  RefreshCw, Coins, Pencil, RotateCcw, Check, Layers,
} from 'lucide-react';

/* The estimator writes hours and square metres with one decimal;
   money.js defaults to none. */
const fmtNum = (v, d = 1) => fmtNumRaw(v, d);

const TIERS = ['basic', 'standard', 'premium'];
const TIER_LABEL = { basic: 'Basis', standard: 'Standard', premium: 'Premium' };

// Severity drives colour, not decoration. An asbestos warning and a note about
// who moves the furniture must not look alike — that is the whole reason the
// API returns them separately instead of as one text blob.
/* The API sends both forms of every catalogue string: `label` / `text` in the
   interface language, and `label_de` / `text_de` as the words a quote was
   agreed in. Screens read the translated one and fall back to the German, so a
   string whose translation is missing shows German rather than nothing.

   Reading `label_de` directly — which every one of the call sites below did —
   is why the guided form asked "Alanın durumu" under a German heading with
   German step titles: the translations were on the payload and nothing looked
   at them. */
const lbl = (o) => (o && (o.label || o.label_de)) || '';
const txt = (o) => (o && (o.text || o.text_de)) || '';

// The label is a key, not a word. These are module constants — evaluated once,
// before any component has a language — so holding German here would pin the
// chip to German for the life of the bundle however the interface is set.
const SEVERITY = {
  critical: { cls: 'border-red-warn/40 bg-red-warn/5 text-red-text', label: 'est_sev_critical' },
  high: { cls: 'border-amber-500/40 bg-amber-500/5 text-amber-700', label: 'est_sev_high' },
  medium: { cls: 'border-sm-border bg-cream text-ink', label: 'est_sev_note' },
  low: { cls: 'border-sm-border bg-cream text-ink-muted', label: 'est_sev_note' },
};

const CONFIDENCE = {
  high: { label: 'est_conf_high', cls: 'text-green-700' },
  medium: { label: 'est_conf_medium', cls: 'text-ink-muted' },
  low: { label: 'est_conf_low', cls: 'text-amber-700' },
};

export default function EstimatePage() {
  const { t, lang } = useLang();
  // Entered from a job or from the quote form, the target is already known.
  // Making the pro pick it again from a list they just came from is the kind
  // of small friction that stops a tool being used on site.
  const [params] = useSearchParams();
  const [meta, setMeta] = useState(null);
  const [jobs, setJobs] = useState([]);
  // The trade lives in the URL, not in component state: `/estimate/maler` is
  // Maler's templates. That makes every trade a real address — the back button
  // works, the page can be shared, and a reload does not throw the pro back to
  // the start. `/estimate` itself is now only a doorway; see the redirect
  // below.
  const navigate = useNavigate();
  const { trade = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /* How this trade's templates are chunked, from the API. Null for a search
     and for the seventeen trades small enough to read as a flat list. */
  const [sections, setSections] = useState(null);

  /* Which group the dial has open. Null means "the first one" and is resolved
     against `sections` at render, because the trade can change under this
     state and a key from the previous trade would open nothing. */
  const [group, setGroup] = useState(null);

  /* `/estimate` is a doorway, not a screen.
     
     It used to be a grid of seven cards under "Kalkulation · Wofür rechnen
     Sie?" — a whole screen whose only job was to get you to the next one. The
     seven trades are now a row on the working screen, so there is nothing left
     for this address to show and it forwards to a trade instead.

     `replace: true` matters: without it, going back from `/estimate/maler`
     lands on `/estimate`, which forwards straight to `/estimate/maler` again,
     and the back button never escapes the estimator.

     Which trade: the last one used on this device, because a tiler opens this
     to price tiling. Falling back to the first offered rather than to a
     hardcoded `maler`, so hiding a trade on the server cannot send anybody to
     an address with nothing at it. */
  useEffect(() => {
    if (trade || !meta?.trades?.length) return;
    const last = localStorage.getItem('est_trade');
    const known = meta.trades.some((x) => x.key === last);
    navigate(`/estimate/${known ? last : meta.trades[0].key}`, { replace: true });
  }, [trade, meta, navigate]);

  useEffect(() => {
    if (trade) localStorage.setItem('est_trade', trade);
  }, [trade]);

  const [selected, setSelected] = useState(null);   // survey payload
  const [answers, setAnswers] = useState({});
  /* Which answers the pro actually touched. Every question ships a default,
     so a count of "filled in" would read 100 % before they had done
     anything — the ring has to distinguish their figure from our guess. */
  const [touched, setTouched] = useState(() => new Set());
  // Which step is unfolded. One at a time — see the stepper comment. The
  // quantity opens first because it is the one field nobody can skip.
  const [openStep, setOpenStep] = useState('qty');
  // The pro's own hourly rate for this estimate, and their own quantities for
  // individual positions. Both empty by default: an untouched estimate is the
  // catalogue's, and the screen says so.
  const [hourlyRate, setHourlyRate] = useState('');
  // Whether the full price card has scrolled out of view. An observer rather
  // than a scroll handler: the browser reports the crossing once instead of
  // this recomputing a rectangle on every frame of a flick.
  const headRef = useRef(null);
  const [headGone, setHeadGone] = useState(false);
  const [qtyOverrides, setQtyOverrides] = useState({});
  // What the last answer did to the total, shown for a moment beside it. The
  // estimate has always recalculated on its own; nothing said so.
  const [delta, setDelta] = useState(null);
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
  // The quote that was just made, for the dialog that says so. Null until one
  // exists, which is also what closes the dialog.
  const [created, setCreated] = useState(null);
  /* What is currently ticked in the card picker, reported up from it, and
     whether we are asking about it on the way out. The picker owns the ticks
     and this page owns the back button, so leaving with work on the table can
     only be caught if the two know about each other. */
  const [selection, setSelection] = useState({ positions: [], total: 0, unpriced: 0 });
  const [leaving, setLeaving] = useState(false);
  /* Where the pro was going when the guard stopped them. Back goes home, as
     it always has; the trade carousel goes to the trade they tapped, and
     sending them home instead would be the guard losing their place on top of
     what it is already asking about. */
  const [leaveTo, setLeaveTo] = useState('/');
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
        /* `lang` on both. Neither call sent it, so the trade tiles and every
           template row came back German whatever the interface was set to —
           an English page with a German list on it. */
        const [{ data: m }, { data: j }] = await Promise.all([
          api.get('/api/estimate/catalogue', { params: { lang } }),
          api.get('/api/estimate/jobs', { params: { lang } }),
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
        if (live) setError(e?.response?.data?.detail || t('est_err_catalogue'));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
    /* `lang` is in the deps and `t` is not. Switching language has to refetch,
       because the trade names and the template titles are server strings; the
       error text in the catch is resolved when it fires and needs no reload. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  /* The section layout comes from the server, which is where the mapping
     lives — the catalogue's own `group` cannot do this: all 19 Maler
     templates share the group "Maler & Tapezierer".

     Cached per trade and per language, and the other six prefetched once the
     first one has arrived. Seven small responses bought once means switching
     trade redraws from memory instead of waiting on a round trip, which is
     the difference between the ring changing and the ring disappearing and
     coming back. */
  /* The cache holds promises, not values. A value would need a second
     "in flight" set to stop the prefetch and a switch racing each other into
     two requests; a promise is both the claim and the result. An already
     resolved one settles in a microtask, before the browser paints, so a
     cached trade draws in the same frame as the tap. */
  const secCache = useRef({});
  const [sectionsFor, setSectionsFor] = useState(null);
  const loadSections = useCallback((key, tradeKey) => {
    if (!(key in secCache.current)) {
      secCache.current[key] = api
        .get('/api/estimate/jobs', { params: { trade: tradeKey, lang } })
        .then(({ data }) => data.sections || null)
        .catch(() => { delete secCache.current[key]; return null; });
    }
    return secCache.current[key];
  }, [lang]);

  useEffect(() => {
    if (!trade) { setSections(null); setSectionsFor(null); return undefined; }
    let live = true;
    loadSections(`${trade}|${lang}`, trade).then((secs) => {
      /* `sectionsFor` is what stops a stale layout being drawn against new
         jobs. Maler's six groups filtered by Fliesen's job keys come to zero
         wedges, which is the ring vanishing for one frame — the thing this
         whole arrangement exists to prevent. */
      if (live) { setSections(secs); setSectionsFor(trade); }
    });
    return () => { live = false; };
    /* `lang` is read in the request and so it belongs here. It was left out
       when the language was added to this call, which made the lint rule warn
       — and a warning is a build failure on Vercel, where CI is set. Every
       deploy from that commit onward failed, so the site kept serving the last
       build that happened to be clean. Refetching on a language change is
       cheap and this list is small; the alternative, dropping `lang` from the
       request, would mean reasoning about which fields of the response are
       language-dependent every time somebody reads a new one from it.
       `loadSections` is memoised on `lang`, so listing it changes nothing at
       runtime and keeps the rule quiet — which matters, because a warning is
       a build failure on Vercel and this is the exact effect that caused the
       last one. */
  }, [trade, lang, loadSections]);

  /* The other six, quietly, so the first switch is as instant as the second.
     Fired only after the current trade's own layout is in, so it never
     competes with the request the screen is actually waiting on. */
  const [secsBy, setSecsBy] = useState({});
  useEffect(() => {
    if (!sectionsFor || !meta?.trades?.length) return undefined;
    let live = true;
    for (const tr of meta.trades) {
      /* The same promise the open trade waited on: already resolved for it,
         one request each for the rest, and nothing is fetched twice. */
      loadSections(`${tr.key}|${lang}`, tr.key).then((secs) => {
        if (live) setSecsBy((m) => (m[tr.key] === secs ? m : { ...m, [tr.key]: secs }));
      });
    }
    return () => { live = false; };
  }, [sectionsFor, meta, lang, loadSections]);

  /* Maler's "fassade" is not a group Fliesen has, so the open group cannot
     survive a change of trade — it would open an empty dial. */
  useEffect(() => { setGroup(null); }, [trade]);

  const visible = useMemo(() => {
    if (!trade) return [];
    return jobs.filter((j) => j.trade === trade);
  }, [jobs, trade]);

  /* The dial's wedges, and which one is open.
   *
   * A search turns the dial off rather than filtering it: typing "fassade"
   * should find the template wherever it lives, and a dial that narrowed to
   * one wedge while the list narrowed underneath it would be saying the same
   * thing twice. Nine of the twenty-two trades have no sections at all and
   * get no dial, which is the existing flat list unchanged.
   *
   * `count` is the number of rows the wedge opens, cross-listings included —
   * the same rows the list below will show. It is deliberately not the
   * trade's distinct total, which the heading above already carries.
   */
  const dial = useMemo(() => {
    /* `sectionsFor !== trade` means the layout on hand belongs to the trade
       we just left. Drawing it would filter its groups by the new trade's job
       keys, get zero wedges, and blink the ring out for a frame. */
    if (sectionsFor !== trade) return null;
    if (!trade || !sections || sections.length < 2) return null;
    const have = new Set(visible.map((j) => j.key));
    const wedges = sections
      .map((s) => ({
        key: s.key,
        label: (lang !== 'de' && s.labels?.[lang]) || s.label_de,
        count: s.job_keys.filter((k) => have.has(k)).length,
      }))
      .filter((s) => s.count);
    return wedges.length >= 2 ? wedges : null;
  }, [trade, sections, sectionsFor, visible, lang]);

  /* The same reduction the open dial does, for any trade whose layout is in.
     The carousel needs its neighbours' wedges, and a trade with fewer than two
     groups has no dial at all and is simply not in the swipe. */
  const wedgesOf = useCallback((tradeKey) => {
    const secs = secsBy[tradeKey];
    if (!secs || secs.length < 2) return null;
    const have = new Set(jobs.filter((j) => j.trade === tradeKey).map((j) => j.key));
    const wedges = secs
      .map((s) => ({
        key: s.key,
        label: (lang !== 'de' && s.labels?.[lang]) || s.label_de,
        count: s.job_keys.filter((k) => have.has(k)).length,
      }))
      .filter((s) => s.count);
    return wedges.length >= 2 ? wedges : null;
  }, [secsBy, jobs, lang]);

  /* Identity matters here, not just value. GroupDial fits every wedge label by
     bisection and memoises on the array it was given, so handing it a fresh
     array re-runs that work for all five mounted dials. `wedgesOf` builds a new
     array each call, so the previous one is kept whenever the content is the
     same — which is why this map does not depend on the open trade at all.

     It also cannot depend on `dial`: that is null for the one render after a
     trade change, and a null here would swap the branch below and remount the
     whole carousel mid-animation. `secsBy` is keyed by trade, so it is never
     stale and needs no such guard. */
  const wedgeCache = useRef({});
  useEffect(() => { wedgeCache.current = {}; }, [lang]);
  const dials = useMemo(() => {
    const same = (a, b) => a && b && a.length === b.length
      && a.every((x, i) => x.key === b[i].key && x.label === b[i].label
        && x.count === b[i].count);
    const out = {};
    for (const tr of meta?.trades || []) {
      const w = wedgesOf(tr.key);
      if (!w) continue;
      const prev = wedgeCache.current[tr.key];
      out[tr.key] = same(prev, w) ? prev : w;
      wedgeCache.current[tr.key] = out[tr.key];
    }
    return out;
  }, [meta, wedgesOf]);

  /* Order is the trades that actually have a dial, so a swipe never lands on
     an empty pane. */
  const swipeOrder = useMemo(
    () => (meta?.trades || []).map((tr) => tr.key).filter((k) => dials[k]),
    [meta, dials],
  );

  /* Resolved, not stored: `group` can name a section that this trade does not
     have, or one whose templates have all been retired. */
  const openGroup = (dial && dial.some((w) => w.key === group) ? group : dial?.[0]?.key) || null;

  /**
   * Leaving the picker with positions ticked.
   *
   * Nothing on this screen is stored until a quote is made, so navigating away
   * throws an afternoon's ticking away without a word. Both exits — the back
   * arrow and the trade carousel — go through here, because a guard that
   * covers one of two doors is a guard that is going to be reported as data
   * loss on the other. `onDiscard` is where the pro ends up if they choose to
   * lose the work, which is not always where the tap was pointing: back has
   * always dropped them home rather than at the trade list.
   */
  const leave = (to, onDiscard = to) => {
    if (selection.positions.length || selection.unpriced) { setLeaveTo(onDiscard); setLeaving(true); }
    else navigate(to);
  };

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
      setOpenStep('qty');
      setDelta(null);
      // Both are about this job's positions, so neither survives a change of
      // template — an override keyed to a rate key the new job does not have
      // would be a setting with no control to clear it.
      setHourlyRate('');
      setQtyOverrides({});
    } catch (e) {
      setError(e?.response?.data?.detail || t('est_err_job'));
    }
  };

  const calculate = useCallback(async (key, ans, wantTier, rate, overrides) => {
    setCalculating(true);
    try {
      const { data } = await api.post('/api/estimate', {
        job_key: key, answers: ans, tier: wantTier,
        hourly_rate: rate > 0 ? rate : null,
        qty_overrides: overrides || {},
      }, { params: { lang } });
      // Against the figure that was on screen, not against a stored baseline:
      // this is "what did that tap do", and the answer is only meaningful
      // relative to what the pro was just looking at.
      setResult((prev) => {
        const before = prev && prev.job.key === key ? prev.total_net[1] : null;
        const move = before == null ? 0 : data.total_net[1] - before;
        // In words, not with a sign. A pill reading "− € 623" is the same
        // accounting minus that was taken off the option rows, and it lands
        // on the one element the eye is already on.
        setDelta(Math.abs(move) < 0.5 ? null : {
          key: move > 0 ? 'est_delta_more' : 'est_delta_less',
          amount: fmtEur(Math.abs(move)),
        });
        return data;
      });
    } catch (e) {
      setError(e?.response?.data?.detail || t('est_err_calc'));
    } finally {
      setCalculating(false);
    }
    // `lang` is in the deps on purpose. The debounce effect below depends on
    // this callback, so switching language re-runs the calculation and the
    // positions and assumptions come back in the new one — rather than the
    // labels changing around a quote that is still German.
  }, [lang, t]);

  // Recalculate as the form is answered. Debounced because number inputs fire
  // on every keystroke and a per-digit round trip makes the field feel laggy.
  useEffect(() => {
    if (!selected) return undefined;
    const key = selected.job.key;
    const id = setTimeout(
      () => calculate(key, answers, tier, Number(hourlyRate), qtyOverrides), 350);
    return () => clearTimeout(id);
  }, [selected, answers, tier, hourlyRate, qtyOverrides, calculate]);

  // The pill is a notification, not a state: it says what just happened and
  // then gets out of the way.
  useEffect(() => {
    if (!delta) return undefined;
    const id = setTimeout(() => setDelta(null), 2600);
    return () => clearTimeout(id);
  }, [delta]);

  useEffect(() => {
    if (!selected) return;
    api.get('/api/jobs', { params: { status: 'open', limit: 100 } })
      .then(({ data }) => setMyJobs(data.jobs || []))
      .catch(() => setMyJobs([]));
  }, [selected]);

  useEffect(() => {
    const el = headRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    // rootMargin pulls the trigger line down past the app bar, so the strip
    // appears as the card slides under it rather than after it is long gone.
    const io = new IntersectionObserver(
      ([e]) => setHeadGone(!e.isIntersecting),
      { rootMargin: '-68px 0px 0px 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
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
      }, { params: { lang } });
      setCreatedQuote(false);
      setNotice(t('est_saved_notice'));
    } catch (e) {
      setError(e?.response?.data?.detail || t('est_err_save'));
    } finally {
      setSaving(false);
    }
  };

  const createQuote = async () => {
    setCreating(true);
    setError('');
    try {
      const { data } = await api.post('/api/estimate/quote', {
        job_key: selected.job.key, answers, tier,
        job_id: targetJob || null, all_tiers: allTiers,
        // The document's language, not the screen's — see the endpoint. A pro
        // reading the app in Turkish still sends an Austrian customer a German
        // quote unless they have switched the whole interface, which is the
        // signal we have.
        lang,
      });
      const n = (data.quotes || []).length;
      setNotice(n === 1 ? t('est_quotes_created_one')
        : t('est_quotes_created_many', { n }));
      setCreatedQuote(true);
      api.get('/api/estimate/accuracy').then(({ data: a }) => setAccuracy(a)).catch(() => {});
    } catch (e) {
      setError(e?.response?.data?.detail || t('est_err_quote'));
    } finally {
      setCreating(false);
    }
  };

  /** Several ticked templates, one quote.

      The single-position path below stays: it is what a pro uses when they are
      working through one job type and want the breakdown, the tier comparison
      and the rate card. This is the other case, and it is the more common one
      — a bathroom is tiling and plumbing and painting, and quoting it as three
      documents is something nobody does by hand. */
  const createMultiQuote = async (positions, { then = 'confirm' } = {}) => {
    setCreating(true); setError(''); setNotice('');
    try {
      const { data } = await api.post('/api/estimate/quote/multi', {
        positions, job_id: targetJob || null, lang,
      });
      /* Report the outcome where the button is.

         This used to set a notice and stay put, and the notice renders at the
         top of the page while the button that triggers it is pinned to the
         bottom of a list that is around four thousand pixels tall. The quote
         was created every time — it just happened entirely off screen, so the
         only readable outcome of pressing "create quote" was that nothing
         appeared to happen.

         It then navigated straight into the new quote, which fixed that but
         skipped past the fact that a quote had been made at all. Now it says
         so, in a dialog, and goes to the list when the pro is ready — except
         on the way out of an abandoned calculation, where the draft is being
         kept on the way to somewhere else and a second dialog would be one
         more thing to dismiss. */
      const q = data?.quotes?.[0];
      if (q?.id && then === 'home') { navigate('/'); return data; }
      if (q?.id) {
        /* The gross too. `quotes` has always carried `vat_total` and
           `gross_total` — the trigger on `quote_lines` fills them on insert —
           and this dialog reported only the net, so a quote stored at 453,67
           announced itself as 378,06 and read as one written without VAT. */
        setCreated({ id: q.id, number: q.quote_number, net: q.net_total,
                     gross: q.gross_total, vat: q.vat_total,
                     n: positions.length });
        api.get('/api/estimate/accuracy').then(({ data: a }) => setAccuracy(a)).catch(() => {});
        return data;
      }
      // No id came back, so there is nothing to navigate to and the notice is
      // the only thing left that can report the outcome.
      setNotice(t('est_multi_created', { n: positions.length }));
      setCreatedQuote(true);
      api.get('/api/estimate/accuracy').then(({ data: a }) => setAccuracy(a)).catch(() => {});
      return data;
    } catch (e) {
      /* The failure has to be visible from where the button is. Without this
         the error message lands at the top of the page too, and a quote that
         failed looks exactly like a quote that succeeded: nothing happens. */
      setError(e?.response?.data?.detail || t('est_err_multi'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return null;
    } finally { setCreating(false); }
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
      const n = data.jobs_measured;
      setNotice(n === 1 ? t('est_recalibrated_one')
        : t('est_recalibrated_many', { n }));
    } catch (e) {
      setError(e?.response?.data?.detail || t('est_err_recalibrate'));
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
      }, { params: { lang } });
      setCompare(data.tiers || null);
    } catch (e) {
      setError(e?.response?.data?.detail || t('est_err_compare'));
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

  /* White, not the app's cream. The ring's unselected wedges are a cool
     near-white; on cream they measure 1.01:1 against the page, so the fill
     does nothing and the shape is carried entirely by a 1 px hairline. That is
     why this screen never looked like its drawing. It is the one page in the
     app that is not cream, and the row treatment below pays for it. */
  return (
    <div className="min-h-screen bg-paper pb-24">
      {/* pt-2, not pt-6. The cream app bar is a banner with its own weight;
          24 px of white under it before the back link read as the page not
          having started yet, and it pushed the trade row and the ring down for
          nothing. */}
      <div className="max-w-4xl mx-auto px-4 pt-2">
        {/* Inside a trade the heading is the trade, and it is a control. A
            page title reading "Kalkulation" over a subtitle reading "Maler ·
            19 Vorlagen" spent the top of the screen saying what the screen
            was, to somebody who had just tapped Maler to get here. The survey
            keeps the plain heading: there the title is the job, and the trade
            circles would be offering to leave a form half-answered. */}
        {trade && !selected ? (
          <div className="mb-3">
            {/* This said "Alle Gewerke" and went to `/estimate`. Both halves
                stopped being true at once: every trade is on the screen right
                below it, and `/estimate` now forwards back to here, so the
                link was a loop as well as a lie. It goes home instead — the
                estimator still needs one way out that is not the tab bar. */}
            <button type="button" onClick={() => leave('/')}
                    className="flex items-center gap-1.5 -ml-2 px-2 min-h-[44px]
                               text-ink-muted hover:text-ink font-bold text-[13px]"
                    data-testid="estimate-back">
              <ArrowLeft size={16} />
              {t('back')}
            </button>
            <TradeRow trades={meta?.trades || []} value={trade}
                      onChange={(k) => leave(`/estimate/${k}`)}
                      label={t('est_pick_trade')} unit={t('est_templates')} />
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-4">
            {selected && (
              <button
                type="button"
                onClick={() => { setSelected(null); setResult(null); setNotice(''); }}
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
                {selected ? selected.job.group : t('est_pick_trade')}
              </p>
            </div>
          </div>
        )}

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
                {t('est_to_quotes')}
              </Link>
            )}
          </div>
        )}

        {!selected ? (
          <>
            <JobPicker jobs={visible}
                       sections={sections}
                       onPick={openJob} t={t} lang={lang}
                       dial={dials[trade] || dial ? (
                         /* No card. It had one to lift the ring off the
                            cream; the page is white now, so a white card on it
                            would be a border drawn round nothing. */
                         <div className="mb-3 -mx-1" data-testid="estimate-dial">
                           {/* Gated on `dials`, not on `dial`. `dial` is null
                               for the render after a trade change, and using it
                               here unmounted the carousel and remounted it —
                               which is a jump, not a swipe. */}
                           {swipeOrder.length > 1 && swipeOrder.includes(trade) ? (
                             /* The dial is the biggest thing on the screen and
                                the thumb is already on it, so it switches trade
                                as well. The row of cards above still does, and
                                both write the same URL. */
                             <DialSwipe order={swipeOrder} value={trade}
                                        onChange={(k) => leave(`/estimate/${k}`)}
                                        dials={dials} group={openGroup} onGroup={setGroup}
                                        label={t('est_groups')}
                                        promise={t('est_promise_lead')}
                                        seconds={t('est_promise_time')}
                                        swipeLabel={t('est_swipe_trades')}
                                        prevLabel={t('est_prev_trade')}
                                        nextLabel={t('est_next_trade')} />
                           ) : (
                             /* Same reason: `dial` can be null for a render
                                while `dials` already has this trade. */
                             <GroupDial groups={dial || dials[trade]} value={openGroup}
                                        onChange={setGroup}
                                        label={t('est_groups')}
                                        promise={t('est_promise_lead')}
                                        seconds={t('est_promise_time')} />
                           )}
                         </div>
                       ) : sectionsFor !== trade ? (
                         /* Only ever seen on the first visit to a trade, and
                            only for as long as one request takes — every
                            later switch draws from the cache in the same
                            frame. It is here so that first request cannot
                            pull the list up and drop it again: the aspect
                            ratio is the ring's own 354 x 288, so the space it
                            holds is exactly the space the ring will take. */
                         <div className="mb-3 -mx-1 aspect-[354/288]"
                              data-testid="estimate-dial-pending" aria-hidden="true" />
                       ) : null}
                       cards={trade ? (
                         <EstimateCards jobs={visible}
                                        sections={sections}
                                        vat={meta?.vat}
                                        only={dial ? openGroup : null}
                                        lang={lang} quoting={creating}
                                        onQuote={createMultiQuote}
                                        onSelection={(positions, total, unpriced) =>
                                          setSelection({ positions, total, unpriced })} />
                       ) : null} />
            {/* The learned-rates card is off this screen. It is an expert
                tool — a list of the hourly and unit rates the app has inferred
                from accepted quotes, with an override on each — and it was the
                last thing under a page whose job is "pick a template and get a
                number". Nobody scrolling past nineteen templates is looking
                for it, and having it there made the screen end on machinery.

                Not deleted: `RateCard`, `saveRate` and `resetRate` are intact
                and `/api/profile/pro/rates` is still fetched, because the
                learned rate is still what the estimate is priced with — the
                per-position override inside an open template reads the same
                data. Only the panel is gone, so it can come back behind a
                control on the settings screen without being rebuilt.

                Accuracy stays. It answers "should I trust this number", which
                is a question about the thing the screen just produced. */}
            <div className="mt-6">
              <AccuracyCard data={accuracy} open={showAccuracy}
                            onToggle={() => setShowAccuracy((o) => !o)}
                            onRecalibrate={recalibrate} calibrating={calibrating} />
            </div>
          </>
        ) : (
          <>
            {/* The price above the form, not below it. The pro changes a
                field to see what it does to the number; with the number
                underneath a five-field form they had to scroll to find out,
                every time. */}
            {/* Full card at rest, 46 px strip once it has scrolled away. The
                strip is what stays pinned; the card is not, because pinned at
                its full height it would be 224 px of permanent chrome with the
                app bar on a 390 x 664 phone. */}
            <div ref={headRef}>
              <PriceHeader result={result} calculating={calculating} delta={delta} />
            </div>
            {headGone && (
              <PriceHeader result={result} calculating={calculating} delta={delta} compact />
            )}
            <RateBar value={hourlyRate} onChange={setHourlyRate} result={result} />
            <SurveyForm survey={selected} answers={answers} set={set}
                        tier={tier} setTier={setTier} result={result}
                        touched={touched} open={openStep} setOpen={setOpenStep} />
            {/* The running total, directly under the form it explains. */}
            <Tally result={result} t={t} />
            <Result result={result} calculating={calculating} form={selected.form}
                    overrides={qtyOverrides} setOverrides={setQtyOverrides} />
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

      {/* Leaving with positions ticked. Nothing on this screen is stored until
          a quote is made, so back used to throw away an afternoon of ticking
          without a word. It asks rather than saving silently: a calculation
          abandoned after two taps becomes a draft nobody wants, and the quotes
          list is where they would pile up. */}
      {leaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-ink/40"
             role="dialog" aria-modal="true" data-testid="estimate-leave"
             onClick={(e) => { if (e.target === e.currentTarget) setLeaving(false); }}>
          <div className="w-full max-w-sm rounded-2xl bg-paper p-4 shadow-xl">
            <p className="font-headings font-bold text-ink text-[17px]">
              {t('est_leave_title')}
            </p>
            <p className="text-[14px] text-ink-muted mt-1.5">
              {selection.positions.length
                ? t('est_leave_body', { n: selection.positions.length,
                                        v: fmtEur(selection.total) })
                /* Ticked, but no quantity anywhere, so there is no price and
                   nothing a quote could be made of. Offering "keep draft"
                   here would either save an empty document or invent the
                   quantities — say so instead. */
                : t('est_leave_nothing', { n: selection.unpriced })}
            </p>
            <div className="flex gap-2 mt-4">
              {selection.positions.length > 0 && (
              <button type="button" disabled={creating}
                      data-testid="estimate-leave-keep"
                      onClick={async () => {
                        // Straight home on success. The dialog has already
                        // said the draft is being kept, so a second one
                        // announcing it would be a thing to dismiss twice.
                        const ok = await createMultiQuote(selection.positions,
                                                          { then: 'home' });
                        if (!ok) setLeaving(false);
                      }}
                      className="flex-1 min-h-[46px] rounded-xl bg-teal text-paper
                                 font-bold text-[14px] flex items-center justify-center gap-2">
                {creating ? <Loader2 size={15} className="animate-spin" /> : null}
                {t('est_leave_keep')}
              </button>
              )}
              <button type="button" disabled={creating}
                      data-testid="estimate-leave-discard"
                      onClick={() => { setLeaving(false); navigate(leaveTo); }}
                      className={`flex-1 min-h-[46px] rounded-xl font-bold text-[14px]
                                  ${selection.positions.length
                                    ? 'border border-red-warn/35 bg-paper text-red-text'
                                    : 'bg-teal text-paper'}`}>
                {selection.positions.length ? t('est_leave_discard') : t('est_leave_ok')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The quote exists. Said here rather than by arriving somewhere new,
          because "did that work?" is the question, and a screen you did not
          ask for is not an answer to it. */}
      {created && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-ink/40"
             role="dialog" aria-modal="true" data-testid="estimate-created">
          <div className="w-full max-w-sm rounded-2xl bg-paper p-4 shadow-xl text-center">
            <div className="w-11 h-11 rounded-full bg-green-pos/15 text-green-text
                            flex items-center justify-center mx-auto mb-2.5">
              <Check size={22} strokeWidth={2.6} />
            </div>
            <p className="font-headings font-bold text-ink text-[17px]">
              {t('est_created_title')}
            </p>
            <p className="text-[14px] text-ink-muted mt-1.5">
              {[created.number,
                Number(created.vat) > 0
                  ? t('est_created_gross', { n: fmtEur(created.net),
                                             g: fmtEur(created.gross) })
                  : t('est_created_net', { v: fmtEur(created.net) })]
                .filter(Boolean).join(' · ')}
            </p>
            <button type="button" onClick={() => navigate('/quotes')}
                    data-testid="estimate-created-go"
                    className="w-full min-h-[46px] mt-4 rounded-xl bg-teal text-paper
                               font-bold text-[14px]">
              {t('est_created_go')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function JobPicker({ jobs, sections, onPick, t, lang, cards, dial }) {
  /* The seven-card grid that used to stand here is gone. It was a whole screen
     whose only job was to get you to the next one: you read "Kalkulation ·
     Wofür rechnen Sie?", tapped a card, and only then saw anything you could
     price. The seven trades now sit as a row above the dial on the screen that
     does the work, so that first tap buys a trade *and* a group instead of
     just a trade — and `/estimate` sends you straight there. */

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
      {/* The search box is gone. It was the only way to reach a template
          without knowing which group it is filed under, and the two
          cross-listed Maler templates are filed under two — so this is a real
          capability removed, not a tidy-up. If it comes back it belongs in the
          bar as an icon rather than as a 50 px field above the ring.

          The dial takes its place: nineteen templates under six headings is a
          page you scroll past, and the same nineteen behind six wedges is a
          page where the first thing you do is choose. `EstimateCards` draws
          only the open group's rows. */}
      {dial}

      {/* The rows themselves. Nineteen templates that differ only in their
          wording is a list nobody scans — they read it top to bottom or give
          up — and picking one of them was all this list ever let you do.
          `EstimateCards` renders the same rows as something you can tick,
          configure in place and total up, which is what quoting a real job
          needs: a bathroom is tiling and plumbing and painting. */}
      {cards}

      {jobs.length === 0 && (
        <p className="text-sm text-ink-muted text-center py-8" data-testid="estimate-empty">
          {t('est_no_templates')}
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
 * **Which number.** A range is honest and nobody sends a range to a customer.
 * The figure that leads is the sum of the positions, because that is what
 * would actually appear on the quote — the same lines the customer reads. The
 * midpoint of the range (EUR 586 against EUR 558 here) is arithmetic with no
 * referent: it is not what anything costs, it is the average of two guesses.
 * The range stays, underneath, as the statement of how sure that figure is.
 *
 * **Where it sits.** A point on the span rather than a percentage alone: at
 * 44 % this estimate is below the middle of its own range, which is a real
 * thing to know before quoting and is exactly what a midpoint would hide.
 *
 * **What it is made of.** Labour and material as two rows with names and
 * amounts, reading like a quote rather than a chart, because that is the
 * document this becomes.
 *
 * **Two states.** At rest it is all of the above. Once it has scrolled away
 * it becomes a 46 px strip carrying the figure and what the last answer did
 * to it. That is not decoration: measured on a 390 x 664 phone, the full card
 * pinned would be 224 px of permanent chrome with the app bar — a third of
 * the screen, and at mid-scroll it covered 146 px of the card underneath.
 * The detail is worth having while you look at the price and worth nothing
 * while you are answering a question.
 *
 * The delta pill is the point of the redesign — the estimate has always
 * recalculated on its own (measured at 431 ms), but the number changed
 * silently, so nothing said "that tap cost you EUR 181".
 */

/** What the positions come to, split by what kind of work they are.
 *
 *  Summed from the lines rather than read from `labour`/`material`, which are
 *  ranges over the whole model: these have to add up to the figure printed
 *  above them, and a range cannot.
 */
function partsOf(result) {
  const out = [];
  const by = new Map();
  for (const l of result?.lines || []) {
    const v = l.qty * (1 + (l.waste_factor || 0)) * l.unit_price;
    by.set(l.kind, (by.get(l.kind) || 0) + v);
  }
  for (const [kind, key] of [['labor', 'est_kind_labor'], ['material', 'est_kind_material'],
                             ['other', 'est_kind_other']]) {
    const v = by.get(kind);
    if (v > 0.5) out.push({ kind, key, value: v });
  }
  return out;
}

function PriceHeader({ result, calculating, delta, compact }) {
  const { t } = useLang();
  if (!result) {
    return (
      <div className="rounded-2xl bg-teal text-paper p-4 mb-3 min-h-[92px]
                      flex items-center justify-center" data-testid="estimate-price-header">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }
  const [lo, hi] = result.total_net;
  const offer = result.lines_net;
  const span = hi - lo;
  const frac = span > 0 ? (offer - lo) / span : 0;
  // Outside its own range is a real state, not an error: once the business's
  // own rates price the positions, `lines_net` and `total_net` are measuring
  // different things and the estimator says so with `rates_applied`. Pinning
  // the marker to an end it is not at would be a small lie on the one element
  // whose whole job is to locate the figure, so it is dropped instead.
  const inRange = frac >= 0 && frac <= 1;
  const pct = Math.min(100, Math.max(0, frac * 100));
  const parts = partsOf(result);
  const biggest = Math.max(...parts.map((p) => p.value), 1);

  if (compact) {
    return (
      <div className={`sticky top-[4rem] z-20 -mx-4 px-4 py-2.5 bg-teal text-paper mb-3
                       flex items-center gap-3 min-h-[46px]
                       shadow-[0_4px_14px_rgba(26,58,82,.2)] transition-opacity
                       ${calculating ? 'opacity-90' : ''}`}
           data-testid="estimate-price-strip">
        <span className="text-[11px] font-bold uppercase tracking-wider text-teal-tint shrink-0">
          {t('est_offer_price_short')}
        </span>
        <span className="font-headings font-bold text-[20px] leading-none tracking-[-.03em]
                         tabular-nums flex-1 text-center">
          {fmtEur(offer)}
        </span>
        {delta ? (
          <span className="text-[12.5px] font-bold tabular-nums rounded-full bg-paper/22 px-2.5 py-1
                           shrink-0 whitespace-nowrap" data-testid="estimate-price-delta-strip">
            {t(delta.key, { amount: delta.amount })}
          </span>
        ) : (
          <span className="w-[18px] shrink-0 grid place-items-center">
            {calculating && <Loader2 className="animate-spin" size={13} />}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl bg-teal text-paper px-4 py-3.5 mb-3
                     shadow-[0_5px_18px_rgba(26,58,82,.18)] transition-opacity
                     ${calculating ? 'opacity-90' : ''}`}
         data-testid="estimate-price-header">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-teal-tint">
          {t('est_offer_price')}
        </span>
        {inRange ? (
          <span className="text-[11px] font-bold tabular-nums rounded-md bg-paper/20 px-2 py-0.5
                           shrink-0 whitespace-nowrap" data-testid="estimate-price-position">
            {t('est_of_range', { pct: fmtNum(pct, 0) })}
          </span>
        ) : (
          <span className="text-[11px] font-bold rounded-md bg-paper/20 px-2 py-0.5 shrink-0">
            {t('est_own_rates_short')}
          </span>
        )}
        {delta && (
          <span className="text-[12.5px] font-bold tabular-nums rounded-full bg-paper/22 px-2.5 py-1
                           shrink-0 whitespace-nowrap" data-testid="estimate-price-delta">
            {t(delta.key, { amount: delta.amount })}
          </span>
        )}
      </div>

      <p className="font-headings font-bold text-[28px] leading-[1.05] tracking-[-.035em]
                    tabular-nums mt-0.5" data-testid="estimate-price-value">
        {fmtEur(offer)}
      </p>

      {/* The span, with the figure's place on it. */}
      <div className="relative h-[22px] mt-2" aria-hidden="true">
        <span className="absolute left-0 right-0 top-[8px] h-[5px] rounded-full bg-paper/25" />
        {inRange && (
          <span className="absolute top-[1px] w-5 h-5 rounded-full bg-paper border-[5px] border-teal
                           shadow-[0_0_0_2px_theme(colors.paper)] -translate-x-1/2"
                style={{ left: `${pct}%` }} data-testid="estimate-price-dot" />
        )}
      </div>
      <div className="flex justify-between text-[11px] text-teal-tint tabular-nums -mt-0.5">
        <span>{fmtEur(lo)}</span><span>{fmtEur(hi)}</span>
      </div>

      {/* What it is made of, as rows rather than a split bar. */}
      <div className="mt-2.5 space-y-1" data-testid="estimate-price-parts">
        {parts.map((p) => (
          <div key={p.kind} className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold text-teal-tint w-[62px] shrink-0">{t(p.key)}</span>
            <span className="h-[7px] rounded-full bg-paper/85 min-w-[6px]"
                  style={{ width: `${(p.value / biggest) * 62}%` }} aria-hidden="true" />
            <span className="ml-auto text-[11.5px] font-semibold tabular-nums text-teal-tint">
              {fmtEur(p.value)}
            </span>
          </div>
        ))}
      </div>

      <p className="sr-only">
        {t('est_range_sr', { lo: fmtEur(lo), hi: fmtEur(hi) })}
      </p>
    </div>
  );
}

/** The pro's own hourly rate, at the top, feeding the calculation.
 *
 *  The catalogue prices labour from a trade-wide band — Maler in AT is
 *  EUR 38-55/h — which is a cold start for someone who has never quoted the
 *  work and wrong for everyone who has. A business that knows its rate knows
 *  one number, so this takes one: the range that remains comes from the hours,
 *  which is where the real uncertainty lives.
 *
 *  Empty means the catalogue's band, and the placeholder says which band that
 *  is. This is deliberately not the rate card below, which stores per-operation
 *  prices on the profile and applies them to every future job. This is one
 *  estimate, and it forgets.
 */
function RateBar({ value, onChange, result }) {
  const { t } = useLang();
  const used = result?.hourly_used;
  const own = value !== '' && Number(value) > 0;
  return (
    <div className="flex items-center gap-3 mb-3 rounded-2xl border border-sm-border
                    bg-paper px-3.5 py-2.5" data-testid="estimate-rate-bar">
      <label htmlFor="est-hourly" className="flex-1 min-w-0">
        <span className="block text-[13px] font-bold text-ink leading-tight">
          {t('est_hourly_label')}
        </span>
        <span className="block text-[12px] text-ink-faint mt-0.5 leading-snug">
          {own ? t('est_hourly_own')
               : (used ? t('est_hourly_catalogue', {
                   lo: fmtEur(used[0]), hi: fmtEur(used[1]) }) : ' ')}
        </span>
      </label>
      <div className="relative shrink-0">
        <NumberField id="est-hourly" min={0}
                     className="w-[118px] h-11 rounded-xl border-[1.5px] border-sm-border bg-paper
                                pl-3 pr-11 text-[17px] font-bold tabular-nums text-ink text-right
                                focus-visible:outline-none focus-visible:border-teal
                                focus-visible:ring-4 focus-visible:ring-teal/20"
                     value={value === '' ? null : Number(value)}
                     onChange={(n) => onChange(n == null ? '' : n)}
                     data-testid="estimate-hourly" />
        <span aria-hidden="true"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold
                         text-ink-faint pointer-events-none">
          {t('est_per_hour')}
        </span>
      </div>
      {own && (
        <button type="button" onClick={() => onChange('')}
                data-testid="estimate-hourly-reset"
                aria-label={t('est_hourly_reset')}
                className="shrink-0 w-11 h-11 grid place-items-center rounded-xl
                           border border-sm-border text-ink-muted hover:text-ink">
          <RotateCcw size={16} />
        </button>
      )}
    </div>
  );
}

/* ── the stepper ───────────────────────────────────────────────────────
 *
 * One step open at a time. The order is the argument: how much, then each
 * answer that moves the money, then everything that only reaches the wording
 * of the quote. A pro who stops after the priced steps has a usable number;
 * one who stops at the first has the app's guess, and that step says so.
 *
 * Why an accordion rather than three open cards: with everything unfolded the
 * form is 2.9 screens on a phone and the controls have to shrink to fit. They
 * did — the quantity field rendered at 24 px and the option chips at 32 px,
 * eight of nine below the 44 px a thumb needs, with the price difference on
 * each chip set in 10 px. Folding the steps buys the room to make the one
 * thing you are touching full size, and a collapsed step still shows its
 * answer and what that answer costs, so nothing is hidden by folding it.
 *
 * No connecting rail. The first draft had one — a 22 px circle joined by a
 * 2 px line — and it breaks at 200 % text size: the label grows, the line
 * does not, and the circle stops lining up with what it numbers.
 */

/** The steps, derived from the form the server sent.
 *
 *  Not a fixed three. A job type may ask for condition and not access, or ask
 *  four recorded questions or none, and the survey is the only thing that
 *  knows which. `is_quantity` comes from the server for the same reason: only
 *  56 of the 149 job types call the quantity `qty` — the rest use `anzahl`,
 *  `flaeche`, `stufen`, `wohnflaeche` — and matching on the key filed the most
 *  important question of every one of those templates under "documentation".
 */
function stepsOf(form) {
  const list = form || [];
  const qty = list.find((q) => q.is_quantity) || null;
  const priced = list.filter((q) => q.affects === 'condition' || q.affects === 'access');
  const rest = list.filter((q) => q !== qty && !priced.includes(q));
  const steps = [{ id: 'qty', kind: 'qty', questions: qty ? [qty] : [] }];
  priced.forEach((q) => steps.push({ id: q.key, kind: 'priced', questions: [q] }));
  if (rest.length) steps.push({ id: 'notes', kind: 'notes', questions: rest });
  return steps;
}

/** How many answers came from the pro rather than from us.
 *
 *  Not "how many are filled in" — every question ships a default and the form
 *  seeds them all, so that count reads 100 % before anyone has touched
 *  anything.
 *
 *  Nor `qty_source` from the estimator, which was the first attempt: it
 *  reports `typical_size` only when no quantity was sent at all, and this form
 *  always sends one. From the server the pro's 57,5 and our 57,5 are the same
 *  request. Only the client knows which of them typed it.
 */
function confirmedCount(questions, touched) {
  return questions.filter((q) => touched.has(q.key)).length;
}

/** Each option's surcharge over the cheapest one.
 *
 *  The figures used to be measured against whatever was selected at that
 *  moment, which made every cheaper option render as a negative — a column of
 *  "− € 159" that reads as a loss on a screen whose whole job is to price
 *  work. Anchoring on the cheapest option instead means a surcharge can never
 *  be negative: it is the distance from the floor, and the floor is labelled
 *  rather than priced.
 *
 *  Checked against the whole catalogue: in all 298 priced questions one option
 *  is cheapest at both ends of the range, so the anchor is well defined. The
 *  null return is for the day that stops being true — the caller then falls
 *  back to printing each option's own total, which is always honest, instead
 *  of a surcharge that would have to be negative.
 */
function surchargesOver(alts) {
  if (!alts || !alts.length) return null;
  const lo = Math.min(...alts.map((a) => a.total_net[0]));
  const hi = Math.min(...alts.map((a) => a.total_net[1]));
  if (!alts.some((a) => a.total_net[0] - lo < 0.005 && a.total_net[1] - hi < 0.005)) return null;
  return new Map(alts.map((a) => [a.value, [a.total_net[0] - lo, a.total_net[1] - hi]]));
}

/** A money span for a step header or an option row: "+ € 39 – € 159". */
function spanOf(pair, t) {
  if (!pair || (Math.abs(pair[0]) < 0.5 && Math.abs(pair[1]) < 0.5)) return null;
  return Math.round(pair[0]) === Math.round(pair[1])
    ? `+ ${fmtEur(pair[1])}`
    : `+ ${fmtEur(pair[0])} – ${fmtEur(pair[1])}`;
}

/** One priced choice, as rows a thumb can hit and a column of prices to scan.
 *
 *  A dropdown hides the consequence behind a tap. "Should I price this as an
 *  occupied Altbau?" is the question, and what it costs is the thing worth
 *  showing. Full-width rows rather than wrapped chips because the prices then
 *  line up in one right-hand column — ragged two-up chips cannot be scanned,
 *  and the figure was the first thing to shrink when they had to fit.
 */
function OptionRows({ q, value, onPick, alts, t }) {
  const over = surchargesOver(alts);
  const byValue = new Map((alts || []).map((a) => [a.value, a]));
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup"
         aria-label={lbl(q)} data-testid={`estimate-opts-${q.key}`}>
      {(q.options || []).map(([v, label]) => {
        const on = v === value;
        const up = over ? over.get(v) : null;
        const span = spanOf(up, t);
        const isBase = !!over && !span;
        const alt = byValue.get(v);
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onPick(v)}
                  data-testid={`estimate-opt-${q.key}-${v}`}
                  className={`w-full min-h-[60px] flex items-center gap-3 px-3.5 py-2.5 rounded-[14px]
                              border text-left transition
                              focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/25
                              ${on ? 'border-teal bg-teal/[.07] shadow-[inset_3px_0_0_theme(colors.teal.DEFAULT)]'
                                   : 'border-sm-border bg-paper hover:border-teal/40'}`}>
            <span aria-hidden="true"
                  className={`w-[21px] h-[21px] rounded-full border-2 shrink-0 grid place-items-center
                              ${on ? 'border-teal' : 'border-cream-deep'}`}>
              {on && <span className="w-[11px] h-[11px] rounded-full bg-teal" />}
            </span>
            <span className="flex-1 min-w-0 text-[15px] font-semibold leading-tight">{label}</span>
            {over ? (
              isBase
                ? <span className="shrink-0 text-[12px] font-bold text-green-text bg-green-pos/10
                                   border border-green-pos/25 rounded-lg px-2 py-1">{t('est_opt_base')}</span>
                : <span className="shrink-0 text-[14px] font-bold tabular-nums text-ink">{span}</span>
            ) : alt ? (
              /* The fallback: no anchor, so each option prints its own total
                 rather than a difference that would have to be negative. */
              <span className="shrink-0 text-[14px] font-bold tabular-nums text-ink">
                {fmtEur(alt.total_net[1])}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** A yes/no as a switch, because a 13 px checkbox is not a touch target. */
function SwitchRow({ id, label, help, checked, onChange, testid }) {
  return (
    <button type="button" role="switch" aria-checked={checked} id={id}
            onClick={() => onChange(!checked)} data-testid={testid}
            className="w-full min-h-[60px] flex items-center gap-3 px-3.5 py-2.5 rounded-[14px]
                       border border-sm-border bg-paper text-left transition hover:border-teal/40
                       focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/25">
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold leading-tight">{label}</span>
        {help && <span className="block text-[12px] text-ink-faint mt-0.5 leading-snug">{help}</span>}
      </span>
      <span aria-hidden="true"
            className={`w-[50px] h-[30px] rounded-full shrink-0 relative transition-colors
                        ${checked ? 'bg-teal' : 'bg-cream-deep'}`}>
        <span className={`absolute top-[3px] left-[3px] w-6 h-6 rounded-full bg-paper shadow
                          transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}

/** One step: a header that is always readable, a body that folds. */
function Step({ n, title, sub, amount, amountMuted, done, open, onToggle, muted, children, testid }) {
  return (
    <div className={`rounded-2xl border mb-2.5 overflow-hidden
                     ${open ? 'border-sm-border shadow-[0_4px_16px_rgba(26,58,82,.09)]' : 'border-sm-border'}
                     ${muted ? 'bg-cream-soft' : 'bg-paper'}`}
         data-testid={testid}>
      <button type="button" onClick={onToggle} aria-expanded={open}
              data-testid={`${testid}-toggle`}
              className="w-full min-h-[64px] flex items-center gap-3 px-4 py-3 text-left
                         focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/25">
        <span aria-hidden="true"
              className={`w-7 h-7 rounded-[9px] grid place-items-center text-[14px] font-bold shrink-0
                          ${open ? 'bg-teal text-paper'
                                 : done ? 'bg-green-pos/12 text-green-text' : 'bg-cream-deep text-ink-muted'}`}>
          {done && !open ? '✓' : n}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[17px] font-headings font-bold leading-tight tracking-[-.015em]">
            {title}
          </span>
          {sub && <span className="block text-[13px] text-ink-muted mt-0.5 truncate">{sub}</span>}
        </span>
        <span className={`shrink-0 text-[15px] font-bold tabular-nums
                          ${amountMuted ? 'text-ink-faint font-semibold text-[13px]' : 'text-ink'}`}>
          {amount}
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function SurveyForm({ survey, answers, set, tier, setTier, result, touched, open, setOpen }) {
  const { t } = useLang();
  const job = survey.job;
  const form = survey.form || [];
  const bd = result?.breakdown;
  const steps = stepsOf(form);
  const stepDelta = new Map((bd?.steps || []).map((s) => [s.key, s.delta]));

  const answered = (q) => {
    if (q.type === 'bool') return answers[q.key] ? lbl(q) : null;
    const opt = (q.options || []).find(([v]) => v === answers[q.key]);
    return opt ? opt[1] : (answers[q.key] === '' || answers[q.key] == null ? null : String(answers[q.key]));
  };

  /* The control for one question, at a size a thumb can use. */
  const field = (q) => {
    const id = `est-q-${q.key}`;
    const helpId = q.help ? `${id}-help` : undefined;
    if (q.type === 'bool') {
      return (
        <div key={q.key} className="mb-2 last:mb-0">
          <SwitchRow id={id} label={lbl(q)} help={q.help}
                     checked={!!answers[q.key]} onChange={(v) => set(q.key, v)}
                     testid={`estimate-q-${q.key}`} />
        </div>
      );
    }
    const alts = bd?.alternatives?.[q.key];
    return (
      <div key={q.key} className="mb-4 last:mb-0">
        <label htmlFor={id}
               className="block text-[13px] font-bold uppercase tracking-wider text-ink-muted mb-2">
          {lbl(q)}{q.unit ? ` (${q.unit})` : ''}
        </label>
        {q.type === 'number' && (
          <NumberField id={id} className="w-full h-14 rounded-[14px] border-[1.5px] border-sm-border
                                          bg-paper px-4 text-[24px] font-bold tabular-nums text-ink
                                          focus-visible:outline-none focus-visible:border-teal
                                          focus-visible:ring-4 focus-visible:ring-teal/20"
                       min={0} aria-describedby={helpId}
                       value={answers[q.key] === '' || answers[q.key] == null
                         ? null : Number(answers[q.key])}
                       onChange={(n) => set(q.key, n == null ? '' : n)}
                       data-testid={`estimate-q-${q.key}`} />
        )}
        {q.type === 'choice' && (
          <OptionRows q={q} value={answers[q.key]} alts={alts} t={t}
                      onPick={(v) => set(q.key, v)} />
        )}
        {q.help && (
          <p id={helpId} className="mt-2 text-[13px] text-ink-faint leading-relaxed">{q.help}</p>
        )}
      </div>
    );
  };

  const totalQ = form.length;
  const doneQ = confirmedCount(form, touched);

  return (
    <div data-testid="estimate-form">
      <h2 className="font-headings font-bold text-ink text-[18px] leading-snug px-1 pb-1.5 tracking-[-.025em]">
        {lbl(job)}
      </h2>

      {/* Confirmations, not filled fields — see confirmedCount. */}
      <div className="flex items-center gap-2.5 px-1 pb-3" data-testid="estimate-progress">
        <span className="flex-1 h-1.5 rounded-full bg-cream-deep overflow-hidden">
          <span className="block h-full rounded-full bg-green-pos transition-[width] duration-300"
                style={{ width: `${totalQ ? (doneQ / totalQ) * 100 : 0}%` }} />
        </span>
        <span className="text-[12px] font-bold text-ink-muted shrink-0 tabular-nums">
          {t('est_confirmed_of', { done: doneQ, total: totalQ })}
        </span>
      </div>

      {job.site_visit_required && (
        <div className="mb-2.5 flex gap-2.5 rounded-xl border border-amber-tint bg-amber/8 px-3.5 py-3">
          <MapPin size={16} className="text-amber-text mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[13.5px] font-bold text-amber-text">{t('est_regie_title')}</p>
            <p className="text-[13px] text-ink-soft leading-relaxed mt-0.5">{t('est_regie_body')}</p>
          </div>
        </div>
      )}

      {survey.tiers_differ && (
        <div className="mb-2.5">
          <div className="flex gap-1 bg-cream-deep rounded-xl p-1" role="group"
               aria-label={t('est_tier_label')}>
            {TIERS.map((tr) => (
              <button key={tr} type="button" onClick={() => setTier(tr)} aria-pressed={tier === tr}
                      className={`flex-1 text-[13.5px] font-bold py-2.5 rounded-lg transition ${
                        tier === tr ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
                      data-testid={`estimate-tier-${tr}`}>
                {TIER_LABEL[tr]}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-ink-faint text-center mt-1.5 leading-relaxed">
            {t(`est_tier_help_${tier}`)}
          </p>
        </div>
      )}

      {steps.map((st, i) => {
        const n = i + 1;
        const isOpen = open === st.id;
        const done = st.questions.length > 0
          && st.questions.every((q) => touched.has(q.key));
        const toggle = () => setOpen(isOpen ? null : st.id);
        const testid = `estimate-step-${n}`;

        if (st.kind === 'qty') {
          const q = st.questions[0];
          return (
            <Step key={st.id} n={n} testid={testid} open={isOpen} onToggle={toggle} done={done}
                  title={t('est_step_qty')}
                  sub={q
                    ? `${fmtNum(Number(answers[q.key]) || 0, 2)} ${q.unit || ''} · ${
                        touched.has(q.key) ? t('est_step_qty_yours') : t('est_step_qty_guess_short')}`
                    : t('est_step_qty_flat_sub')}
                  amount={bd
                    ? `${fmtEur(bd.base_net[0])} – ${fmtEur(bd.base_net[1])}`
                    : ''}
                  amountMuted={false}>
              {q ? field(q) : (
                <p className="text-[15px] text-ink-soft leading-relaxed"
                   data-testid="estimate-step-1-flat">{t('est_step_qty_flat')}</p>
              )}
            </Step>
          );
        }

        if (st.kind === 'priced') {
          const q = st.questions[0];
          const span = spanOf(stepDelta.get(q.key), t);
          return (
            <Step key={st.id} n={n} testid={testid} open={isOpen} onToggle={toggle} done={done}
                  title={lbl(q)} sub={answered(q) || ''}
                  amount={span || t('est_included')} amountMuted={!span}>
              <OptionRows q={q} value={answers[q.key]} alts={bd?.alternatives?.[q.key]} t={t}
                          onPick={(v) => set(q.key, v)} />
              {q.help && <p className="mt-2 text-[13px] text-ink-faint leading-relaxed">{q.help}</p>}
            </Step>
          );
        }

        /* Recorded only. The subtitle lists the answers rather than the
           question names: what the pro wants from a folded step is what it
           currently says, not what it could ask. */
        const summary = st.questions.map(answered).filter(Boolean).join(' · ');
        return (
          <Step key={st.id} n={n} testid={testid} open={isOpen} onToggle={toggle} done={done} muted
                title={t('est_step_note')}
                sub={summary || st.questions.map(lbl).join(' · ')}
                amount={t('est_included')} amountMuted>
            <p className="text-[13px] text-ink-faint leading-relaxed mb-3">{t('est_step_note_sub')}</p>
            {st.questions.map(field)}
          </Step>
        );
      })}
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
      {/* The header leads with the positions total and this list ends on the
          range, and without a line joining them the screen shows two different
          figures for one job and never says how they relate.
          They are different measurements, deliberately: the rows above sum to
          the range exactly — that is what makes this list worth printing — and
          the positions are priced at their own unit prices. The midpoint of a
          range is not the range of midpoints. So both are stated, and named. */}
      <div className="flex justify-between items-baseline gap-3 mt-1.5 pt-1.5
                      border-t border-dashed border-sm-border">
        <span className="text-[12px] text-ink-soft">
          {t('est_offer_price')}
          <small className="block text-[10.5px] text-ink-faint">{t('est_offer_price_sub')}</small>
        </span>
        <span className="font-headings font-bold text-[16px] tabular-nums text-teal-deep"
              data-testid="estimate-tally-offer">
          {fmtEur(result.lines_net)}
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
  if (q) return lbl(q);
  if (key === 'qty') return 'Menge';
  if (key === 'emergency' || key === 'zeit') return 'Einsatzzeit';
  return key;
}

function Result({ result, calculating, form, overrides, setOverrides }) {
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
          {t('est_market_rate')} {result.band_basis === 'per_unit'
            ? `${fmtEur2(band[0])}–${fmtEur2(band[1])} / ${result.job.unit}`
            : `${fmtEur(band[0])}–${fmtEur(band[1])}`} in {result.country}
          {outside && t('est_outside_band')}
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
                  <span className="font-semibold">{t(SEVERITY[n.severity]?.label)}: </span>{txt(n)}
                </div>
              ) : (
                <div key={n.key} className="flex gap-2 text-[11.5px] leading-relaxed text-ink-soft
                                            border-t border-sm-border/70 pt-1.5">
                  <Check size={12} className="text-ink-faint shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{txt(n)}</span>
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
            {t('est_own_rates')} <b>{fmtEur2(result.lines_net)}</b>
          </span>
          <span className="text-ink-muted">
            {' '}· {t('est_guide_value')} {fmtEur(result.total_net[0])}–{fmtEur(result.total_net[1])}
            {' '}· {t('est_positions_learned',
                        { a: result.rates_applied, b: result.lines.length })}
          </span>
        </div>
      )}

      <Positions result={result} overrides={overrides} setOverrides={setOverrides} t={t} />
    </div>
  );
}

/** The positions, with the quantity of each one open to correction.
 *
 *  Every position is derived from the job's single quantity axis: 62 m² of
 *  wall means 62 m² of masking and 62 m² of two-coat paint. On a real job that
 *  is right in general and wrong in one place — the floor is already covered,
 *  the ceiling is not being painted, half the room is tiled. Before this the
 *  only way to say so was to abandon the estimate and price by hand.
 *
 *  A corrected quantity is exact for its own position — the line's contribution
 *  is recomputed at its unit price and the difference applied to both ends of
 *  the range. It cannot narrow the range: the ends come from a spread of
 *  hours, not of quantities. The card says which positions were corrected
 *  rather than quietly showing a different total.
 */
function Positions({ result, overrides, setOverrides, t }) {
  const [open, setOpen] = useState(false);
  const lines = result.lines || [];
  const changed = result.qty_adjusted || [];
  const setQty = (key, n) => setOverrides((prev) => {
    const next = { ...prev };
    if (n == null || n === '') delete next[key]; else next[key] = n;
    return next;
  });
  return (
    <div data-testid="estimate-positions">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
              data-testid="estimate-positions-toggle"
              className="w-full min-h-[48px] flex items-center justify-between gap-3 text-left">
        <span className="text-[14px] font-semibold text-ink">
          {t('est_positions_n', { n: lines.length })}
          {changed.length > 0 && (
            <span className="ml-2 text-[12px] font-bold text-teal-deep bg-teal-tint
                             rounded-lg px-2 py-0.5">
              {t('est_positions_adjusted', { n: changed.length })}
            </span>
          )}
        </span>
        <span className="text-[14px] font-bold tabular-nums text-ink shrink-0">
          {fmtEur2(result.lines_net)}
        </span>
      </button>

      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {lines.map((l) => {
            const on = changed.includes(l.rate_key);
            const shown = overrides[l.rate_key] ?? l.qty;
            return (
              <div key={l.position}
                   className={`rounded-xl border px-3 py-2.5
                               ${on ? 'border-teal bg-teal/[.06]' : 'border-sm-border bg-paper'}`}
                   data-testid={`estimate-pos-${l.rate_key}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[14px] text-ink leading-snug min-w-0">
                    {l.description}
                    {l.rate_source === 'pro' && (
                      <span className="ml-1.5 text-[11px] font-semibold text-green-text">
                        {t('est_own_rate')}
                      </span>
                    )}
                  </span>
                  <span className="text-[14px] font-bold tabular-nums text-ink shrink-0">
                    {fmtEur2(shown * (1 + (l.waste_factor || 0)) * l.unit_price)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <NumberField min={0}
                               className="w-[104px] h-11 rounded-xl border-[1.5px] border-sm-border
                                          bg-paper px-3 text-[15px] font-bold tabular-nums text-ink
                                          focus-visible:outline-none focus-visible:border-teal
                                          focus-visible:ring-4 focus-visible:ring-teal/20"
                               value={Number(shown)}
                               onChange={(n) => setQty(l.rate_key, n)}
                               aria-label={`${l.description} — ${l.unit}`}
                               data-testid={`estimate-pos-qty-${l.rate_key}`} />
                  <span className="text-[13px] text-ink-muted">{l.unit}</span>
                  <span className="text-[13px] text-ink-faint ml-auto tabular-nums">
                    × {fmtEur2(l.unit_price)}
                  </span>
                  {on && (
                    <button type="button" onClick={() => setQty(l.rate_key, null)}
                            aria-label={t('est_pos_reset')}
                            data-testid={`estimate-pos-reset-${l.rate_key}`}
                            className="shrink-0 w-11 h-11 grid place-items-center rounded-xl
                                       border border-sm-border text-ink-muted hover:text-ink">
                      <RotateCcw size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {changed.length > 0 && (
            <p className="text-[12.5px] text-ink-faint leading-relaxed mt-1">
              {t('est_positions_note')}
            </p>
          )}
        </div>
      )}
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
        <FileText size={15} />{t('est_quote_box_title')}
      </p>
      {/* Empty is the default and it is not an error. A quote is what a pro
          sends *before* there is work — requiring an existing job first put
          the sequence backwards, and on a fresh enquiry made quoting
          impossible until a job had been invented to hang it on. The server
          creates one from the calculation when none is named. Picking an
          existing job is still offered, because a second quote on work
          already captured belongs on that job and not on a new one. */}
      <select className="input w-full" value={targetJob}
              onChange={(e) => setTargetJob(e.target.value)} data-testid="estimate-target-job">
        <option value="">{t('est_job_new')}</option>
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
          {t('est_all_tiers')}
        </label>
      )}
      <button type="button" className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={creating} onClick={onCreate} data-testid="estimate-create-quote">
        {creating ? <Loader2 className="animate-spin" size={16} /> : <Calculator size={16} />}
        {t('est_create_quote')}
      </button>
      <p className="text-[12.5px] text-ink-faint leading-relaxed">
        {targetJob ? t('est_job_existing_help') : t('est_job_new_help')}
      </p>
      {/* Separate from the quote on purpose. A job that was calculated and not
          quoted is real evidence about how this business prices; learning only
          from work that was won would bias the model toward the cheap jobs. */}
      <button type="button" className="btn-secondary w-full flex items-center justify-center gap-2"
              disabled={saving} onClick={onSave} data-testid="estimate-save">
        {saving ? <Loader2 className="animate-spin" size={16} /> : <Bookmark size={16} />}
        {t('est_save_only')}
      </button>
    </div>
  );
}

function AccuracyCard({ data, open, onToggle, onRecalibrate, calibrating }) {
  // Its own translator, for the same reason as its siblings above: `t` lives
  // in the default export's scope and this is not a child of it.
  const { t } = useLang();
  if (!data || !data.jobs_measured) return null;
  const o = data.overall;
  const enough = o?.applies;
  return (
    <div className="card-lg mb-4" data-testid="estimate-accuracy">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <p className="text-xs text-ink-muted flex items-center gap-1">
          <TrendingUp size={12} />{t('est_accuracy_title')}
        </p>
        <div className="flex items-baseline justify-between gap-3 mt-1">
          <p className="font-headings font-bold text-ink text-xl">
            {data.realised_hourly_all != null
              ? `${fmtEur2(data.realised_hourly_all)} / h tatsächlich`
              : `${data.jobs_measured} Aufträge gemessen`}
          </p>
          <span className="text-xs text-ink-muted">
            {data.jobs_measured === 1 ? t('est_jobs_one')
              : t('est_jobs_many', { n: data.jobs_measured })}
          </span>
        </div>
        {/* The gap between the rate on the quote and the rate the hours
            actually earned is the number almost nobody computes for
            themselves, and it is usually the lower one. */}
        {o && (
          <p className="text-xs text-ink-muted mt-1">
            {enough
              ? t('est_factor_help', { f: fmtNum(o.hours_factor, 2) })
              : t('est_factor_pending', { n: data.min_samples - (o.samples || 0) })}
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
            {t('est_recalculate')}
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
              {t('est_excluded_help')}
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
          <Coins size={12} />{t('est_rates_title')}
        </p>
        <div className="flex items-baseline justify-between gap-3 mt-1">
          <p className="font-headings font-bold text-ink text-xl">
            {rates.length === 1 ? t('est_prices_one')
              : t('est_prices_many', { n: rates.length })}
          </p>
          <span className="text-xs text-ink-muted">
            {manual > 0 ? t('est_rates_manual', { n: manual }) : t('est_rates_learned')}
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
                    ? (r.n_samples === 1 ? t('est_quotes_one')
                      : t('est_quotes_many', { n: r.n_samples }))
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
            {t('est_manual_price_help')}
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
  // Its own translator — see AccuracyCard above.
  const { t } = useLang();
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
        {t('est_compare_cta')}
      </button>
    );
  }
  return (
    <div className="card-lg mb-4" data-testid="estimate-compare-result">
      <p className="text-xs text-ink-muted mb-3">
        {t('est_compare_help')}
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
                {fmtNum(e.hours?.[0])}–{fmtNum(e.hours?.[1])} h · {t('est_net')}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
