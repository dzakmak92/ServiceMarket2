import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import NumberField from '../../components/NumberField';
import { useLang } from '../../contexts/LangContext';
import { fmtEur } from '../../utils/money';
import { fmtDate } from '../../utils/money';
import ConvertSheet from '../../components/pro/ConvertSheet';
import {
  Loader2, Plus, X, Check, Ban, FileText, AlertCircle, Trash2,
  Calculator, Clock, Pencil, Share2, MoreHorizontal, FileDown,
} from 'lucide-react';


/**
 * The three-way verdict the list is read by: offen, gewonnen, verloren.
 *
 * A rollup over the eight stored statuses, not a replacement for them — the
 * fine status still shows as the badge, because "versendet" and "angesehen"
 * are different things to a pro chasing an answer. This is the question the
 * list is scanned for.
 *
 * `to` is the endpoint that sets it, and every one of the three is reachable
 * from every other. A decision taken by tapping the wrong third of a control
 * has to be undoable — `reopen` unwinds exactly what `accept` did: the
 * superseded tiers come back, the job returns to `quoted`, and the rate
 * samples the acceptance taught are deleted and the affected keys recomputed.
 *
 * The one refusal is on the server, where it belongs: a job whose work has
 * already started cannot have its quote reopened, because that would say the
 * work was never agreed while somebody is out doing it. That comes back as a
 * 409 with a sentence to show.
 */
const VERDICT = {
  open: {
    of: ['draft', 'sent', 'viewed', 'negotiating'],
    to: 'reopen',
    fill: 'bg-teal/[.14] text-teal',
  },
  won: {
    of: ['accepted', 'converted'],
    to: 'accept',
    fill: 'bg-green-pos/[.14] text-green-text',
    card: 'bg-green-pos/[.07] border-green-pos/25',
  },
  lost: {
    of: ['rejected', 'expired'],
    to: 'reject',
    fill: 'bg-red-warn/[.13] text-red-text',
    card: 'bg-red-warn/[.07] border-red-warn/25',
  },
};
const VERDICT_OF = Object.fromEntries(
  Object.entries(VERDICT).flatMap(([k, v]) => v.of.map((st) => [st, k])));

/**
 * The one line under a quote that says what is going on with it.
 *
 * This is what the status badge could not be. A badge says "versendet"; this
 * says "3× angesehen, keine Antwort" — which is the difference between knowing
 * the state and knowing whether to pick up the phone. Every branch is built
 * from a column the table already has: sent_at, first_viewed_at, viewed_count,
 * decided_at, reject_reason, valid_until.
 *
 * Ordered by what would make somebody act. An expiring quote outranks an
 * unanswered one, because the deadline is the thing that stops being fixable.
 */
function signal(q, t) {
  // `fmtDate`, not toLocaleDateString: the latter takes the browser's
  // locale, so an Austrian pro with an English browser got 8/5/2026 for
  // the 5th of August.
  const day = (d) => (d ? fmtDate(d) : '');
  if (q.status === 'accepted' || q.status === 'converted') {
    return { text: t('quote_sig_won', { d: day(q.decided_at) }), tone: 'text-green-text' };
  }
  if (q.status === 'rejected') {
    const why = (q.reject_reason || '').trim();
    return { text: why ? t('quote_sig_lost_why', { r: why }) : t('quote_sig_lost'),
             tone: 'text-ink-muted' };
  }
  if (q.status === 'expired') {
    return { text: t('quote_sig_expired'), tone: 'text-ink-muted' };
  }
  // Replaced by a newer version. Without this branch it fell through to the
  // still-waiting cases below and announced "noch nicht geöffnet" about a
  // document nobody was ever going to open.
  if (q.status === 'superseded') {
    return { text: t('quote_sig_superseded'), tone: 'text-ink-muted' };
  }
  if (q.status === 'draft') {
    return { text: t('quote_sig_draft'), tone: 'text-ink-muted' };
  }
  // Still out with the customer. Days left first — it is the only one with a
  // deadline attached.
  if (q.valid_until) {
    const left = Math.ceil((new Date(q.valid_until) - Date.now()) / 86400000);
    if (left <= 0) return { text: t('quote_sig_expired'), tone: 'text-red-text' };
    if (left <= 5) return { text: t('quote_sig_expires', { n: left }), tone: 'text-red-text' };
  }
  if (q.viewed_count > 0) {
    return { text: t('quote_sig_viewed', { n: q.viewed_count }), tone: 'text-amber-text' };
  }
  if (q.sent_at) return { text: t('quote_sig_unopened'), tone: 'text-ink-muted' };
  return { text: t('quote_sig_sent'), tone: 'text-ink-muted' };
}

/**
 * The week strip above the list.
 *
 * One continuous axis, so the gap between two marks is proportional to the
 * days between them — a block-per-week layout makes the weeks louder by giving
 * that up. Weeks are drawn *on* the axis: alternating bands, a divider that
 * runs past the band top and bottom so the boundary is visible even where a
 * mark sits on it, and a day tick per day.
 *
 * Whole ISO weeks, Monday to Sunday. Anchoring to "today minus 21 days" would
 * put the boundary somewhere different every day and the KW labels would stop
 * meaning anything.
 *
 * The point of drawing weeks rather than plotting the quotes alone: an empty
 * week is a fact about the business, and a scatter of the quotes you have
 * cannot show a week you made none in.
 */
function WeekStrip({ quotes, t }) {
  const W = 358, PAD = 8, Y = 8, H = 28;
  const day = 86400000;
  const at = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

  const dated = quotes.filter((q) => q.created_at).map((q) => ({
    q, d: at(q.created_at),
  }));
  if (dated.length < 2) return null;   // one mark on an axis is not a chart

  const today = at(Date.now());
  const monday = (x) => {
    const m = new Date(x);
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return m;
  };
  const first = monday(new Date(Math.min(...dated.map((x) => +x.d))));
  const lastSun = new Date(monday(today)); lastSun.setDate(lastSun.getDate() + 6);
  const weeks = Math.max(1, Math.round((+lastSun - +first) / (7 * day)));
  const ndays = weeks * 7;
  const inner = W - 2 * PAD, dw = inner / ndays;
  const x = (i) => PAD + i * dw;
  const idx = (d) => Math.round((+d - +first) / day);

  /* ISO week number, and it has to be the real one: `KW 32` is a thing people
     say to each other, so an approximation would be worse than no label. */
  const kw = (d) => {
    const a = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    a.setUTCDate(a.getUTCDate() + 4 - (a.getUTCDay() || 7));
    return Math.ceil(((a - Date.UTC(a.getUTCFullYear(), 0, 1)) / day + 1) / 7);
  };
  const mark = (q) => (VERDICT_OF[q.status] === 'won' ? '#3b6f32'
    : VERDICT_OF[q.status] === 'lost' ? '#4d6477'
      : (+today - +at(q.created_at)) / day <= 7 ? '#2d6a7f' : '#ae3f4c');

  const bands = [], labels = [];
  for (let w = 0; w < weeks; w += 1) {
    const mon = new Date(first); mon.setDate(mon.getDate() + w * 7);
    const has = dated.some((z) => idx(z.d) >= w * 7 && idx(z.d) < w * 7 + 7);
    if (w % 2 === 0) {
      bands.push(<rect key={`b${w}`} x={x(w * 7)} y={Y} width={dw * 7} height={H}
                       fill="#2d6a7f" fillOpacity=".05" />);
    }
    if (w) {
      bands.push(<line key={`d${w}`} x1={x(w * 7)} y1={Y - 3} x2={x(w * 7)} y2={Y + H + 3}
                       stroke="#1a3a52" strokeOpacity=".32" strokeWidth="1.5" />);
    }
    labels.push(
      <text key={`l${w}`} x={x(w * 7) + dw * 3.5} y={Y + H + 14} textAnchor="middle"
            fontSize="8.5" fontWeight="800"
            /* An empty week's label is quieter but still text — it is how you
               learn the week was empty — so it uses the palette's faintest
               legal value rather than a grey picked to look dim. */
            fill={has ? '#4d6477' : '#566c7e'}>KW {kw(mon)}</text>);
  }

  /* Today. Without it the strip has no anchor at all — "how long ago" had to
     be counted off the KW labels, which is the one thing the axis exists to
     save you. Drawn past the band on both sides so it is still findable when
     a quote was created today and its mark sits on the same pixel. */
  const todayX = x(idx(today)) + dw / 2;

  return (
    <div className="card mb-3" style={{ padding: '10px 6px 6px' }} data-testid="quote-weeks">
      <svg width="100%" viewBox={`0 0 ${W} ${Y + H + 20}`} role="img"
           aria-label={t('quote_weeks_alt', { n: weeks })}>
        {bands}
        {Array.from({ length: ndays }, (_, i) => (
          <line key={`t${i}`} x1={x(i) + dw / 2} y1={Y + H - 4} x2={x(i) + dw / 2} y2={Y + H}
                stroke="#1a3a52" strokeOpacity=".18" strokeWidth="1" />
        ))}
        {/* Under the marks, so a quote created today is not hidden by its own
            date line, and over the bands so it is not lost in the wash. */}
        <line x1={todayX} y1={Y - 5} x2={todayX} y2={Y + H + 5}
              stroke="#c14655" strokeWidth="2.2" data-testid="quote-today" />
        {dated.map(({ q, d }) => (
          <circle key={q.id} cx={x(idx(d)) + dw / 2} cy={Y + H / 2} r="5.5"
                  fill={mark(q)} stroke="#ffffff" strokeWidth="1.6" />
        ))}
        {labels}
      </svg>
    </div>
  );
}

const STATUS_STYLE = {

  draft:      'bg-cream-dark text-ink-muted',
  sent:       'bg-teal/10 text-teal',
  viewed:     'bg-teal/20 text-teal',
  accepted:   'bg-green-pos/10 text-green-text',
  rejected:   'bg-red-warn/10 text-red-text',
  expired:    'bg-amber/10 text-amber',
  converted:  'bg-green-pos/20 text-green-text',
  negotiating:'bg-amber/10 text-amber',
};

const BLANK_LINE = {
  kind: 'labor', description: '', qty: 1, unit: 'pcs',
  unit_price: 0, waste_factor: 0, discount_pct: 0,
};

/**
 * Quotes — the customer-facing document the whole product exists to produce.
 *
 * The engine (tiering, revisions, send/accept/reject, expiry, portal
 * acceptance) has been complete in the backend since Phase 3; this is the
 * first screen for it. Totals are computed locally purely as a preview — the
 * server recalculates on save, because VAT treatment depends on the customer
 * (Kleinunternehmer, §13b reverse charge, cross-border) and the client has no
 * business guessing at that.
 */
export default function QuotesPage() {
  const { t } = useLang();
  const [quotes, setQuotes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  // Which quote is being turned into work. Null when the sheet is closed.
  const [converting, setConverting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  // Which row just put a link on the clipboard. Cleared on a timer, because
  // the confirmation is about the gesture, not about the quote.
  const [shared, setShared] = useState(null);
  // Which row has its overflow menu open, and which quote is being confirmed
  // for deletion. Both hold an id rather than a boolean so only one row can be
  // open at a time without any closing logic.
  const [menu, setMenu] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [jobId, setJobId] = useState('');
  const [title, setTitle] = useState('');
  const [assumptions, setAssumptions] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [lines, setLines] = useState([{ ...BLANK_LINE }]);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [tier, setTier] = useState('standard');
  const [loadingTpl, setLoadingTpl] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const [{ data: q }, { data: j }, { data: tpl }] = await Promise.all([
        api.get('/api/quotes', { params }),
        api.get('/api/jobs', { params: { limit: 100 } }).catch(() => ({ data: { jobs: [] } })),
        api.get('/api/templates').catch(() => ({ data: { templates: [] } })),
      ]);
      setQuotes(q.quotes || []);
      setJobs(j.jobs || []);
      setTemplates(tpl.templates || []);
    } catch (e) {
      setError(e?.response?.data?.detail || t('quotes_err_load'));
    } finally {
      setLoading(false);
    }
    // `t` is read in the catch above. Leaving it out kept the closure built at
    // mount, so an error raised after a language switch was announced in the
    // old language.
  }, [statusFilter, t]);

  useEffect(() => { load(); }, [load]);

  // Preview into the form rather than calling /apply directly: the pro sees
  // and edits every line before anything is created. A template is a starting
  // point, not a finished offer — the substrate is always different.
  const applyTemplate = async (id, forTier) => {
    setTemplateId(id);
    if (!id) return;
    setLoadingTpl(true);
    setError('');
    try {
      const { data } = await api.get(`/api/templates/${id}/preview`, { params: { tier: forTier } });
      if ((data.lines || []).length) setLines(data.lines);
      const tpl = templates.find((x) => x.id === id);
      if (tpl) {
        if (!title) setTitle(tpl.name);
        if (tpl.assumptions) setAssumptions(tpl.assumptions);
      }
    } catch (e) {
      setError(e?.response?.data?.detail || t('quotes_err_template'));
    } finally {
      setLoadingTpl(false);
    }
  };

  const setLine = (i, k, v) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  // Preview only. Net of waste and line discount; VAT is deliberately absent
  // because only the server knows the treatment for this customer.
  const previewNet = useMemo(
    () => lines.reduce((sum, l) => {
      const qty = Number(l.qty || 0) * (1 + Number(l.waste_factor || 0));
      const gross = qty * Number(l.unit_price || 0);
      return sum + gross * (1 - Number(l.discount_pct || 0) / 100);
    }, 0),
    [lines]
  );

  const submit = async (e) => {
    e.preventDefault();
    const usable = lines.filter((l) => l.description.trim());
    if (!jobId || usable.length === 0) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/api/quotes', {
        job_id: jobId,
        tier,
        title: title || undefined,
        assumptions: assumptions || undefined,
        valid_until: validUntil || undefined,
        lines: usable.map((l, i) => ({
          ...l,
          position: i + 1,
          qty: Number(l.qty) || 0,
          unit_price: Number(l.unit_price) || 0,
          waste_factor: Number(l.waste_factor) || 0,
          discount_pct: Number(l.discount_pct) || 0,
        })),
      });
      setShowForm(false);
      setJobId(''); setTitle(''); setAssumptions(''); setValidUntil('');
      setLines([{ ...BLANK_LINE }]);
      setTemplateId(''); setTier('standard');
      await load();
    } catch (e2) {
      setError(e2?.response?.data?.detail || t('quotes_err_create'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Hand the quote to the customer.
   *
   * A draft has to be sent before there is anything to hand over, and `send`
   * returns the token, so the two branches end in the same place: the
   * customer's portal URL on the clipboard. `act` already does the sending and
   * the copying; this only has to say which one applies and confirm it
   * afterwards.
   */
  const share = async (q) => {
    if (q.status === 'draft') {
      if (!await act(q.id, 'send')) return;
    } else if (q.share_token) {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/p/${q.share_token}`);
      } catch {
        // A denied clipboard is not an error worth a red banner, but it must
        // not claim success either.
        return;
      }
    } else {
      return;
    }
    setShared(q.id);
    setTimeout(() => setShared((cur) => (cur === q.id ? null : cur)), 2500);
  };

  // A new tab rather than a download: this gets checked on the phone before
  // it goes out, and a forced download makes that two taps and a file manager.
  const openPdf = async (id) => {
    setBusyId(id);
    try {
      const r = await api.get(`/api/quotes/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e?.response?.data?.detail || t('generic_error'));
      window.scrollTo({ top: 0 });
    } finally {
      setBusyId(null);
    }
  };

  const destroy = async (q) => {
    setBusyId(q.id);
    setError('');
    try {
      await api.delete(`/api/quotes/${q.id}`);
      setDeleting(null);
      await load();
    } catch (e) {
      // The server refuses anything that is not a draft, and its sentence
      // says why. Shown at the top, because the row it belongs to is about
      // to be somewhere else in the list.
      setDeleting(null);
      setError(e?.response?.data?.detail || t('generic_error'));
      window.scrollTo({ top: 0 });
    } finally {
      setBusyId(null);
    }
  };

  // Returns whether it worked, so a caller can tell the difference between a
  // link on the clipboard and a red banner.
  const act = async (id, path, body) => {
    setBusyId(id);
    setError('');
    let ok = false;
    try {
      const { data } = await api.post(`/api/quotes/${id}/${path}`, body || {});
      // Sending returns the job's share token — the link the customer opens.
      if (path === 'send' && data?.share_token) {
        const url = `${window.location.origin}/p/${data.share_token}`;
        try { await navigator.clipboard.writeText(url); } catch { /* not fatal */ }
      }
      ok = true;
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || `Could not ${path} the quote`);
    } finally {
      setBusyId(null);
    }
    return ok;
  };

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="font-headings font-bold text-ink text-2xl">
              {t('quotes') || 'Angebote'}
            </h1>
            <p className="text-sm text-ink-muted">{quotes.length} {t('quotes') || 'Angebote'}</p>
          </div>
          <button type="button" onClick={() => setShowForm((s) => !s)}
                  className="btn-primary flex items-center gap-2" data-testid="quote-new-btn">
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? (t('cancel') || 'Abbrechen') : (t('new_quote') || 'Neues Angebot')}
          </button>
        </div>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="input w-full mb-4" data-testid="quote-status-filter">
          <option value="">{t('all_statuses') || 'Alle Status'}</option>
          {/* The members of the quote_status enum. `converted` is not one —
              filtering by it returned nothing — and `negotiating` and
              `superseded` are real states the picker could not select. */}
          {['draft', 'sent', 'viewed', 'negotiating', 'accepted', 'rejected', 'expired', 'superseded']
            .map((s) => <option key={s} value={s}>{t(`quote_status_${s}`) || s}</option>)}
        </select>

        {error && (
          <div className="card mb-3 flex items-start gap-2 text-sm text-red-warn" data-testid="quote-error">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        {showForm && (
          <form onSubmit={submit} className="card-lg mb-4 space-y-3" data-testid="quote-form">
            <select className="input w-full" required value={jobId}
                    onChange={(e) => setJobId(e.target.value)} data-testid="quote-job">
              <option value="">{t('select_job') || 'Auftrag wählen…'} *</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_number ? `${j.job_number} · ` : ''}{j.title}
                  {j.customer_name ? ` — ${j.customer_name}` : ''}
                </option>
              ))}
            </select>
            {jobs.length === 0 && (
              <p className="text-xs text-ink-muted">
                {t('no_jobs_for_quote') || 'Sie brauchen zuerst einen Auftrag.'}
              </p>
            )}

            {/* The way in for someone who does not yet know what to charge.
                Offered beside the template picker rather than buried in the
                nav, because this is the moment the question comes up. */}
            <Link to={`/estimate${jobId ? `?job=${jobId}` : ''}`}
                  className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink"
                  data-testid="quote-to-estimate">
              <Calculator size={13} />
              {t('quote_via_estimate')
                || 'Positionen aus der Schnellkalkulation berechnen lassen'}
            </Link>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select className="input" value={templateId}
                      onChange={(e) => applyTemplate(e.target.value, tier)}
                      data-testid="quote-template">
                <option value="">{t('no_template') || 'Ohne Vorlage'}</option>
                {templates.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.name}{tp.trade ? ` · ${tp.trade}` : ''}
                  </option>
                ))}
              </select>
              <select className="input" value={tier}
                      onChange={(e) => { setTier(e.target.value); if (templateId) applyTemplate(templateId, e.target.value); }}
                      data-testid="quote-tier">
                <option value="basic">{t('tier_basic') || 'Basis'}</option>
                <option value="standard">{t('tier_standard') || 'Standard'}</option>
                <option value="premium">{t('tier_premium') || 'Premium'}</option>
              </select>
            </div>
            {loadingTpl && (
              <p className="text-xs text-ink-muted flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />{t('loading_template') || 'Vorlage wird geladen…'}
              </p>
            )}
            {templateId && !loadingTpl && (
              <p className="text-xs text-ink-muted">
                {t('template_editable_note')
                  || 'Positionen aus der Vorlage — alles frei änderbar. Preise stammen aus Ihren eigenen Sätzen, sofern vorhanden.'}
              </p>
            )}

            <input className="input w-full" placeholder={t('quote_title') || 'Titel'}
                   value={title} onChange={(e) => setTitle(e.target.value)} />

            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="rounded-lg border border-cream-dark p-2 space-y-2">
                  <div className="flex gap-2">
                    <select className="input w-28 text-sm" value={l.kind}
                            onChange={(e) => setLine(i, 'kind', e.target.value)}>
                      <option value="labor">{t('labor') || 'Arbeit'}</option>
                      <option value="material">{t('material') || 'Material'}</option>
                      <option value="travel">{t('travel') || 'Anfahrt'}</option>
                      <option value="other">{t('other') || 'Sonstiges'}</option>
                    </select>
                    <input className="input flex-1 text-sm" placeholder={t('description') || 'Beschreibung'}
                           value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} />
                    {lines.length > 1 && (
                      <button type="button" className="p-2 text-ink-muted hover:text-red-warn"
                              onClick={() => setLines((ls) => ls.filter((_, x) => x !== i))}
                              aria-label={t('remove') || 'Entfernen'}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {/* NumberField, not type=number: Chromium refuses the comma
                        and hands back the digits either side, so "2,5" arrived
                        as 25 — ten times the quantity, saved without a word. */}
                    <NumberField className="input text-sm" placeholder={t('qty') || 'Menge'}
                                 min={0}
                                 value={l.qty} onChange={(v) => setLine(i, 'qty', v ?? '')} />
                    <input className="input text-sm" placeholder={t('unit') || 'Einheit'}
                           value={l.unit} onChange={(e) => setLine(i, 'unit', e.target.value)} />
                    <NumberField className="input text-sm" placeholder={t('unit_price') || '€/Einheit'}
                                 min={0}
                                 value={l.unit_price}
                                 onChange={(v) => setLine(i, 'unit_price', v ?? '')} />
                    {/* Verschnitt: 0.10 = 10% extra material ordered. */}
                    <NumberField className="input text-sm" min={0} max={1}
                                 title={t('waste_factor') || 'Verschnitt (0.10 = 10%)'}
                                 placeholder={t('waste_short') || 'Verschnitt'}
                                 value={l.waste_factor}
                                 onChange={(v) => setLine(i, 'waste_factor', v ?? '')} />
                  </div>
                </div>
              ))}
              <button type="button" className="btn-secondary w-full text-sm"
                      onClick={() => setLines((ls) => [...ls, { ...BLANK_LINE }])}
                      data-testid="quote-add-line">
                <Plus size={14} className="inline mr-1" />{t('add_line') || 'Position hinzufügen'}
              </button>
            </div>

            {/* The caveat block that stops an optimistic estimate becoming a
                fixed-price trap when the substrate turns out to be rotten. */}
            <textarea className="input w-full" rows={2} value={assumptions}
                      onChange={(e) => setAssumptions(e.target.value)}
                      placeholder={t('assumptions') || 'Annahmen und Vorbehalte'} />

            <div className="flex items-center gap-3">
              <input className="input flex-1" type="date" value={validUntil}
                     onChange={(e) => setValidUntil(e.target.value)}
                     title={t('valid_until') || 'Gültig bis'} />
              <div className="text-right">
                <div className="text-xs text-ink-muted">{t('net_preview') || 'Netto (Vorschau)'}</div>
                <div className="font-headings font-bold text-ink">{fmtEur(previewNet)}</div>
              </div>
            </div>

            <button type="submit" className="btn-primary w-full"
                    disabled={saving || !jobId || !lines.some((l) => l.description.trim())}
                    data-testid="quote-save">
              {saving ? <Loader2 size={16} className="animate-spin mx-auto" />
                      : (t('create_quote') || 'Angebot erstellen')}
            </button>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={26} className="text-teal animate-spin" />
          </div>
        ) : quotes.length === 0 ? (
          <div className="card-lg text-center py-10" data-testid="quote-empty">
            <FileText size={30} className="text-ink-muted mx-auto mb-2" />
            <p className="font-headings font-bold text-ink">{t('no_quotes_yet') || 'Noch keine Angebote'}</p>
            <p className="text-sm text-ink-muted mt-1">
              {t('create_first_quote') || 'Erstellen Sie Ihr erstes Angebot.'}
            </p>
          </div>
        ) : (
          <>
          <WeekStrip quotes={quotes} t={t} />
          <div className="space-y-2.5" data-testid="quote-list">
            {quotes.map((q) => {
              /* Only a decided quote is tinted. An open one stays on paper:
                 those are the cards a pro actually reads, and they should have
                 the best contrast on the page. The tint then means "this one
                 is finished", which is the fastest thing to scan for. */
              /* `superseded` is not a fourth outcome — it is a version a newer
                 one replaced — and the server refuses to accept, reject or
                 convert it. Showing it as "offen" claimed an answer was still
                 wanted on a document nobody is looking at any more, so it gets
                 no verdict at all; the status line already says "ersetzt". */
              const verdict = VERDICT_OF[q.status] || (q.status === 'superseded' ? null : 'open');
              const skin = (verdict && VERDICT[verdict].card) || 'bg-paper border-sm-border';
              return (
              <div key={q.id} className={`rounded-2xl border p-3.5 ${skin}`}
                   data-testid="quote-row" data-verdict={verdict || q.status}>
                <div className="flex items-start justify-between gap-3">
                  {/* The whole row is the way in — opening a quote to read it,
                      change it, revise it or print it was not possible from
                      anywhere before this link existed. */}
                  {/* min-h-[44px]: this link is the way into the quote and it
                      measured 42 px, sized by its own two lines of text. Two
                      pixels under is still under. */}
                  <Link to={`/quotes/${q.id}`}
                        className="min-w-0 flex-1 group min-h-[44px] flex flex-col justify-center"
                        data-testid="quote-open">
                    <div className="font-headings font-bold text-[16px] text-ink leading-tight
                                    truncate group-hover:text-teal">
                      {q.title || q.job_title || (t('quote') || 'Angebot')}
                    </div>
                    <div className="text-[13px] text-ink-muted truncate mt-0.5">
                      {[q.quote_number, q.customer_name, q.job_number].filter(Boolean).join(' · ')}
                    </div>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="font-headings font-bold text-[17px] text-ink tabular-nums">
                      {fmtEur(q.gross_total)}
                    </div>
                    <div className="text-[12px] text-ink-muted mt-0.5">
                      {t(`quote_status_${q.status}`) || q.status}
                    </div>
                  </div>
                </div>

                {(() => {
                  const sig = signal(q, t);
                  return (
                    <p className={`text-[13px] font-semibold mt-1.5 ${sig.tone}`}
                       data-testid="quote-signal">{sig.text}</p>
                  );
                })()}

                {/* One row: the verdict, and the two things you do to a quote
                    from a list.

                    This row used to be four blocks tall — signal, verdict, a
                    full-width amber call to action, then a wrap of secondary
                    buttons — about 240 px per quote. The amber was the worst of
                    it: on an accepted quote it shouted "Arbeit planen" at a
                    decision already taken.

                    A list row summarises; you act inside the quote. So the
                    amber is gone and planning lives on the quote page, where
                    the ConvertSheet now opens from. What stays on the row is
                    the verdict and two icons, because those two are the things
                    you genuinely do without opening anything. */}
                <div className="mt-3 flex items-center gap-1.5">
                {/* The control sits on `paper` even when the card is tinted:
                    it is the one thing here you can act on, and a control that
                    shares the card's fill stops reading as a control.

                    A decided quote's other two segments are disabled rather
                    than hidden — the verdict stays legible as one of three,
                    and nothing offers a transition the API would refuse. */}
                <div className="flex-1 flex rounded-xl border border-sm-border bg-paper
                                overflow-hidden" role="group"
                     aria-label={t('quote_verdict')} data-testid="quote-verdict">
                  {['open', 'won', 'lost'].map((v) => {
                    const on = v === verdict;
                    // Every verdict is reachable from every other one. The one
                    // already set is inert, and a superseded quote has none of
                    // the three to offer.
                    const reachable = !on && verdict !== null;
                    const Icon = { open: Clock, won: Check, lost: Ban }[v];
                    return (
                      <button key={v} type="button"
                              disabled={!reachable || busyId === q.id}
                              onClick={async () => {
                                if (!reachable) return;
                                // Winning goes through the sheet, because
                                // accepting is also scheduling the work and
                                // two accepts that do different things is a
                                // fork nobody asked for. Losing is a plain
                                // transition.
                                if (v !== 'won') {
                                  act(q.id, VERDICT[v].to, { reason: '' });
                                  return;
                                }
                                // A rejected or expired quote can be neither
                                // accepted nor converted — the server refuses
                                // both — so winning one has to undo the
                                // decision first. Without this the sheet
                                // opened on a quote that could never take the
                                // answer, and "Create the job" came back with
                                // "A rejected quote cannot be converted."
                                if (verdict === 'lost' && !await act(q.id, 'reopen')) return;
                                setConverting(q);
                              }}
                              aria-pressed={on}
                              data-testid={`quote-verdict-${v}`}
                              className={`flex-1 min-h-[44px] px-2 text-[13px] font-bold
                                          flex items-center justify-center gap-1.5
                                          border-r border-sm-border last:border-r-0
                                          ${on ? VERDICT[v].fill : 'text-ink-muted'}`}>
                        {on && <Icon size={14} aria-hidden="true" />}
                        {t(`quote_verdict_${v}`)}
                      </button>
                    );
                  })}
                </div>

                  {/* The pen goes to the same place the title does. It is not
                      redundant with it: on a phone a bold heading does not
                      announce itself as a link, and "where do I change this"
                      was the question the row could not answer. */}
                  <Link to={`/quotes/${q.id}`} data-testid="quote-edit"
                        title={t('quote_row_edit')} aria-label={t('quote_row_edit')}
                        className="shrink-0 min-h-[44px] min-w-[44px] rounded-xl border
                                   border-sm-border bg-paper text-ink flex items-center
                                   justify-center">
                    <Pencil size={16} aria-hidden="true" />
                  </Link>

                  {/* Share, singular. A draft has never been sent, so sharing
                      it means sending it — that is what `send` does, and it
                      hands back the token. An already-sent quote just has its
                      link copied. Two backend calls, one intention, so one
                      button; splitting them made the pro decide which verb the
                      database wanted. */}
                  {(q.status === 'draft' || q.share_token) && (
                    <button type="button" data-testid="quote-share"
                            disabled={busyId === q.id}
                            title={t('quote_row_share')} aria-label={t('quote_row_share')}
                            onClick={() => share(q)}
                            className="shrink-0 min-h-[44px] min-w-[44px] rounded-xl border
                                       border-sm-border bg-paper text-ink flex items-center
                                       justify-center">
                      {busyId === q.id
                        ? <Loader2 size={16} className="animate-spin text-teal" />
                        : <Share2 size={16} aria-hidden="true" />}
                    </button>
                  )}

                  {/* Everything rare, behind one button. Deleting lives here
                      rather than on the row because it is the one action on
                      this screen that cannot be undone, and a bin sitting a
                      thumb's width from the verdict control is a bin that gets
                      pressed by accident. */}
                  <button type="button" data-testid="quote-more"
                          onClick={() => setMenu(menu === q.id ? null : q.id)}
                          aria-expanded={menu === q.id}
                          title={t('quote_row_more')} aria-label={t('quote_row_more')}
                          className="shrink-0 min-h-[44px] min-w-[44px] rounded-xl border
                                     border-sm-border bg-paper text-ink flex items-center
                                     justify-center">
                    <MoreHorizontal size={16} aria-hidden="true" />
                  </button>
                </div>

                {menu === q.id && (
                  <div className="mt-2 rounded-xl border border-sm-border bg-paper
                                  overflow-hidden" data-testid="quote-menu">
                    <button type="button" onClick={() => { setMenu(null); openPdf(q.id); }}
                            data-testid="quote-menu-pdf"
                            className="w-full min-h-[44px] px-3.5 text-left text-[14px]
                                       font-semibold text-ink flex items-center gap-2
                                       border-b border-sm-border">
                      <FileDown size={15} />{t('quote_pdf')}
                    </button>
                    {/* Only a draft. A sent Angebot is a document the customer
                        is holding — the row says so rather than hiding the
                        option, because "why can I not delete this" is a
                        question the screen should answer once. */}
                    <button type="button" disabled={q.status !== 'draft'}
                            data-testid="quote-menu-delete"
                            onClick={() => { setMenu(null); setDeleting(q); }}
                            className={`w-full min-h-[44px] px-3.5 text-left text-[14px]
                                        font-semibold flex items-center gap-2
                                        ${q.status === 'draft'
                                          ? 'text-red-text' : 'text-ink-muted'}`}>
                      <Trash2 size={15} />
                      {q.status === 'draft' ? t('delete') : t('quote_delete_only_draft')}
                    </button>
                  </div>
                )}

                {/* Copying to the clipboard is silent, and a silent button is
                    indistinguishable from a broken one. */}
                {shared === q.id && (
                  <p className="text-[12px] text-teal font-semibold mt-1.5"
                     role="status" data-testid="quote-shared">{t('quote_row_shared')}</p>
                )}
              </div>
            );})}
          </div>
          </>
        )}
      </div>

      {converting && (
        <ConvertSheet
          quote={converting}
          onClose={() => setConverting(null)}
          onDone={() => { setConverting(null); load(); }}
        />
      )}

      {/* Deleting is the one thing on this screen with no undo, so it asks —
          and it names the quote, because "are you sure?" on a list of six
          drafts is not a question anybody can answer. */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6
                        bg-ink/40" role="dialog" aria-modal="true"
             data-testid="quote-delete-dialog"
             onClick={(e) => { if (e.target === e.currentTarget) setDeleting(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-paper p-4 shadow-xl">
            <p className="font-headings font-bold text-ink text-[17px]">
              {t('quote_delete_title')}
            </p>
            <p className="text-[14px] text-ink-muted mt-1.5">
              {t('quote_delete_body', {
                q: deleting.title || deleting.job_title || t('quote'),
                v: fmtEur(deleting.gross_total),
              })}
            </p>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setDeleting(null)}
                      data-testid="quote-delete-cancel"
                      className="flex-1 min-h-[46px] rounded-xl border border-sm-border
                                 bg-paper font-bold text-[14px] text-ink">
                {t('cancel')}
              </button>
              <button type="button" onClick={() => destroy(deleting)}
                      disabled={busyId === deleting.id}
                      data-testid="quote-delete-confirm"
                      className="flex-1 min-h-[46px] rounded-xl bg-red-warn text-paper
                                 font-bold text-[14px] flex items-center justify-center gap-2">
                {busyId === deleting.id
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Trash2 size={15} />}
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
