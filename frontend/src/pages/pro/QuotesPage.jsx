import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CalcDraftList, { useCalcDrafts } from '../../components/pro/CalcDraftList';
import SkeletonList from '../../components/motion/SkeletonList';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import { fmtEur } from '../../utils/money';
import ConvertSheet from '../../components/pro/ConvertSheet';
import { openQuotePdf } from '../../utils/openPdf';
import CompactRow, { MiniGroup, MiniBtn } from '../../components/pro/CompactRow';
import TradeMark from '../../components/TradeMark';
import { tradeOfCategory } from '../../components/pro/JobListView';
import {
  Loader2, Check, Ban, FileText, AlertCircle, Trash2,
  Calculator, Clock, Pencil, Share2, FileDown,
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
 * How long an open quote has been sitting, in three steps.
 *
 * Only open quotes get one. Once a customer has said yes or no, how old the
 * document is stops being a question anybody asks — and letting a decided
 * quote take an age colour was what made the first attempt unreadable: a red
 * "two weeks old" wash and a red "they said no" wash measured 1.04:1 apart,
 * i.e. the same colour saying two different things on one screen.
 *
 * The steps are one hue deepening rather than orange-to-red. The orange and
 * red tried first were 1.05:1 apart in luminance — told apart by hue alone,
 * which fails in greyscale, in sunlight and for a colour-blind reader. These
 * are 1.24:1 apart, so the order survives all three.
 */
const AGE = [
  { after: 14, card: 'bg-age-hot border-age-hot-edge',
    text: 'text-age-hot-text', meta: 'text-age-hot-meta' },
  { after: 7, card: 'bg-age-warm border-age-warm-edge',
    text: 'text-teal', meta: 'text-ink-muted' },
];
/* The fine status as the card's label colour: waiting is amber, looked at is
   teal, decided is green or red, and a draft or a replaced version is grey. */
const STATUS_TONE = {
  draft: 'muted', sent: 'amber', viewed: 'teal', negotiating: 'teal',
  accepted: 'green', converted: 'green', rejected: 'red', expired: 'red', superseded: 'muted',
};

const ageOf = (q) => {
  const days = Math.floor((Date.now() - new Date(q.created_at)) / 86400000);
  return { days, step: q.created_at ? AGE.find((a) => days >= a.after) : null };
};


/**
 * The four-week strip above the list.
 *
 * One continuous axis, so the gap between two marks is the gap in days — a
 * block-per-week layout makes the weeks louder by giving that up. Four whole
 * ISO weeks, Monday to Sunday, ending with the week we are in: a window that
 * grew with the oldest quote meant the strip changed scale every time an old
 * one was decided, and the day-to-day comparison it exists for needs a scale
 * that holds still.
 *
 * It is drawn as a line rather than as a band. At 24 units of height there is
 * no room for a filled band, a day tick and a label; the label moves above the
 * axis, the ticks go, and what is left is the one thing the strip is for —
 * where the open quotes sit in the last month, and how far each is from today.
 *
 * Anything older than the window is not dropped in silence: `outside` is
 * counted and the caller prints it under the card. A strip that quietly
 * omitted four waiting quotes would be a statement about the business that is
 * not true.
 */
function WeekStrip({ quotes, t }) {
  const W = 358, PAD = 8, H = 24, AXIS = 17;
  const day = 86400000;
  const at = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

  const dated = quotes.filter((q) => q.created_at).map((q) => ({ q, d: at(q.created_at) }));
  if (dated.length < 2) return null;   // one mark on an axis is not a chart

  const today = at(Date.now());
  const monday = (x) => {
    const m = new Date(x);
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return m;
  };
  const WEEKS = 4;
  const first = monday(today);
  first.setDate(first.getDate() - 7 * (WEEKS - 1));

  const ndays = WEEKS * 7;
  const inner = W - 2 * PAD, dw = inner / ndays;
  const x = (i) => PAD + i * dw;
  const idx = (d) => Math.round((+d - +first) / day);

  const inside = dated.filter((z) => +z.d >= +first);
  const outside = dated.length - inside.length;

  /* ISO week number, and it has to be the real one: `KW 32` is a thing people
     say to each other, so an approximation would be worse than no label. */
  const kw = (d) => {
    const a = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    a.setUTCDate(a.getUTCDate() + 4 - (a.getUTCDay() || 7));
    return Math.ceil(((a - Date.UTC(a.getUTCFullYear(), 0, 1)) / day + 1) / 7);
  };
  /* The strip only ever shows open quotes, so a mark says one thing: how long
     this one has been waiting. It says it twice — darker *and* larger —
     because the three colours are a single hue deepening, and on a mark this
     small hue alone is not a channel everybody has. */
  const AGE_MARK = [
    { after: 14, fill: '#1a3a52', r: 5 },
    { after: 7, fill: '#1f4d5e', r: 4.4 },
    { after: -1, fill: '#2d6a7f', r: 3.8 },
  ];
  const age = (d) => AGE_MARK.find((m) => (+today - +d) / day >= m.after);

  /* One mark per day, not one per quote. Three quotes written on the same
     Tuesday used to be three circles on the same pixel, and three white
     strokes over each other make a blot that reads as a bigger, older mark
     than any of them is. The day keeps the oldest one's weight, because that
     is the one that needs chasing. */
  const byDay = new Map();
  for (const z of inside) {
    const k = idx(z.d);
    const m = age(z.d);
    const prev = byDay.get(k);
    if (!prev || m.r > prev.r) byDay.set(k, m);
  }

  const labels = [], dividers = [];
  for (let w = 0; w < WEEKS; w += 1) {
    const mon = new Date(first); mon.setDate(mon.getDate() + w * 7);
    labels.push(
      <text key={`l${w}`} x={x(w * 7) + dw * 3.5} y="8" textAnchor="middle"
            fontSize="8" fontWeight="800"
            /* The week we are in is the one being read against; the three
               behind it are context and step back a shade. */
            fill={w === WEEKS - 1 ? '#4d6477' : '#566c7e'}>KW {kw(mon)}</text>);
    if (w) {
      dividers.push(
        <line key={`d${w}`} x1={x(w * 7)} y1={AXIS - 5} x2={x(w * 7)} y2={AXIS + 5}
              stroke="#1a3a52" strokeOpacity=".3" strokeWidth="1.3" />);
    }
  }

  /* Today. Without it the strip has no anchor at all — "how long ago" would
     have to be counted off the KW labels, which is the one thing the axis
     exists to save you. Drawn past the axis on both sides so it is still
     findable when a quote written today sits on the same pixel. */
  const todayX = x(idx(today)) + dw / 2;

  return (
    <>
      <div className="card mb-2" style={{ padding: '6px 6px 4px' }} data-testid="quote-weeks">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img"
             aria-label={t('quote_weeks_alt', { n: WEEKS })}>
          {labels}
          <line x1={PAD} y1={AXIS} x2={W - PAD} y2={AXIS} stroke="#1a3a52" strokeOpacity=".16"
                strokeWidth="3" strokeLinecap="round" />
          {dividers}
          <line x1={todayX} y1={AXIS - 7} x2={todayX} y2={AXIS + 7}
                stroke="#c14655" strokeWidth="2.2" data-testid="quote-today" />
          {[...byDay.entries()].map(([k, m]) => (
            <circle key={k} cx={x(k) + dw / 2} cy={AXIS} r={m.r} fill={m.fill}
                    stroke="#ffffff" strokeWidth="1.6" />
          ))}
        </svg>
      </div>
      {outside > 0 && (
        <p className="text-[11px] text-ink-faint text-center mb-3" data-testid="quote-weeks-older">
          {t('quote_weeks_older', { n: outside })}
        </p>
      )}
    </>
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
  const { t, lang } = useLang();
  const [quotes, setQuotes] = useState([]);
  const [jobs, setJobs] = useState([]);
  /* Which of the three lists is on screen. The status dropdown this replaces
     offered eight fine statuses and no counts, so it could tell you there were
     "sent" quotes but never that anything was waiting. The fine status is still
     on every card, where it belongs. */
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => (params.get('tab') === 'drafts' ? 'drafts' : 'open'));
  const drafts = useCalcDrafts();
  // Which quote is being turned into work. Null when the sheet is closed.
  const [converting, setConverting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  // Which row just put a link on the clipboard. Cleared on a timer, because
  // the confirmation is about the gesture, not about the quote.
  const [shared, setShared] = useState(null);
  // Which quote is being confirmed for deletion. The ••• menus keep their own
  // open state inside CompactRow.
  const [deleting, setDeleting] = useState(null);
  // Which quote just changed tabs, so the list can say so. Cleared on a timer
  // and by any further interaction.
  const [moved, setMoved] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      /* Everything, filtered in the browser. The tabs need all three counts to
         put a number on themselves, and a server-side status filter can only
         ever return one of the three — the other two would have to be guessed
         or fetched separately. This is one list per pro, not a feed. */
      const [{ data: q }, { data: j }] = await Promise.all([
        api.get('/api/quotes', { params: { limit: 200 } }),
        api.get('/api/jobs', { params: { limit: 100 } }).catch(() => ({ data: { jobs: [] } })),
      ]);
      setQuotes(q.quotes || []);
      setJobs(j.jobs || []);
    } catch (e) {
      setError(e?.response?.data?.detail || t('quotes_err_load'));
    } finally {
      setLoading(false);
    }
    // `t` is read in the catch above. Leaving it out kept the closure built at
    // mount, so an error raised after a language switch was announced in the
    // old language.
  }, [t]);

  useEffect(() => { load(); }, [load]);

  /* One pass, three lists. `superseded` belongs to none of the three — it is a
     version a newer one replaced, not an outcome — so it appears under Offen,
     where its own card already says "ersetzt" and offers no verdict. */
  const byTab = useMemo(() => {
    const out = { drafts: [], open: [], won: [], lost: [] };
    quotes.forEach((q) => out[VERDICT_OF[q.status] || 'open'].push(q));
    return out;
  }, [quotes]);
  const shown = byTab[tab];


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
      await openQuotePdf(id);
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
          {/* A quote begins with what the work costs, not with an empty line
              editor: the form this button used to unfold asked for a job, a
              template and a tier before it would show a single figure, and the
              answer to "what do I charge" was one small link buried inside it.
              The estimator is that answer, and it ends by writing the quote —
              so the button goes straight there. */}
          <Link to="/estimate" className="btn-primary flex items-center gap-2"
                data-testid="quote-new-btn">
            <Calculator size={16} />
            {t('new_quote') || 'Neues Angebot'}
          </Link>
        </div>

        {/* Three lists, in the shape the cards use for the same three words.
            One idiom on the page for "one of three", and the tab carries its
            own verdict colour so the bar itself says which world you are in.

            This replaces a dropdown of eight fine statuses that carried no
            counts — it could tell you there were "versendet" quotes but never
            that anything was waiting. The fine status is still on every card,
            which is where it was being read from anyway. */}
        <div className="flex rounded-xl border border-sm-border bg-paper overflow-hidden mb-3"
             role="tablist" aria-label={t('quote_verdict')} data-testid="quote-tabs">
          {['drafts', 'open', 'won', 'lost'].map((v) => {
            const on = v === tab;
            if (v === 'drafts') {
              return (
                <button key={v} type="button" role="tab" aria-selected={on}
                        onClick={() => setTab(v)} data-testid="quote-tab-drafts"
                        className={`flex-1 min-h-[52px] px-2 text-[13px] font-bold leading-tight
                                    border-r border-sm-border ${on ? 'bg-amber/15 text-amber-text' : 'text-ink-muted'}`}>
                  Entwürfe
                  <span className="block text-[11px] font-semibold opacity-90">
                    {drafts.length}{drafts.length > 0 && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber ml-1 align-middle" />}
                  </span>
                </button>
              );
            }
            return (
              <button key={v} type="button" role="tab" aria-selected={on}
                      onClick={() => setTab(v)} data-testid={`quote-tab-${v}`}
                      className={`flex-1 min-h-[52px] px-2 text-[13px] font-bold leading-tight
                                  border-r border-sm-border last:border-r-0
                                  ${on ? VERDICT[v].fill : 'text-ink-muted'}`}>
                {t(`quote_verdict_${v}`)}
                <span className="block text-[11px] font-semibold opacity-90">
                  {byTab[v].length}
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="card mb-3 flex items-start gap-2 text-sm text-red-warn" data-testid="quote-error">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}


        {tab === 'drafts' ? (
          <CalcDraftList drafts={drafts} lang={lang} onQuoted={() => { load(); }} />
        ) : loading ? (
          <SkeletonList rows={4} />
        ) : shown.length === 0 ? (
          <div className="card-lg text-center py-10" data-testid="quote-empty">
            <FileText size={30} className="text-ink-muted mx-auto mb-2" />
            <p className="font-headings font-bold text-ink">
              {quotes.length ? t(`quote_empty_${tab}`) : (t('no_quotes_yet') || 'Noch keine Angebote')}
            </p>
            <p className="text-sm text-ink-muted mt-1">
              {quotes.length ? t('quote_empty_other_tabs')
                             : (t('create_first_quote') || 'Erstellen Sie Ihr erstes Angebot.')}
            </p>
          </div>
        ) : (
          <>
          {/* Only under Offen, and only the open quotes. The strip answers "how
              long has this been sitting", which is a question about work still
              waiting; on Gewonnen it would plot decisions already taken. Fed
              the decided ones too, its axis would stretch across history nobody
              is acting on and squeeze the marks that matter into one corner. */}
          {tab === 'open' && <WeekStrip quotes={shown} t={t} />}

          {/* Where it went. Not a toast that floats and fades — it sits in the
              list, at the top, where the row used to be, and offers the two
              things somebody wants next: go and look, or take it back. */}
          {moved && (
            <div className="card mb-2.5 flex items-center gap-3" role="status"
                 data-testid="quote-moved">
              <p className="flex-1 text-[13px] font-semibold text-ink">
                {t('quote_moved', { v: t(`quote_verdict_${moved.to}`) })}
              </p>
              <button type="button" onClick={() => { setTab(moved.to); setMoved(null); }}
                      data-testid="quote-moved-go"
                      className="min-h-[38px] px-3 rounded-[10px] border border-sm-border
                                 bg-paper text-[13px] font-bold text-teal">
                {t('show')}
              </button>
              <button type="button" data-testid="quote-moved-undo"
                      onClick={async () => {
                        /* Undo is `reopen`, the same call the Offen segment
                           makes — so this cannot drift from what that does,
                           including the server's refusal when the job has
                           already started. */
                        if (await act(moved.id, 'reopen')) setMoved(null);
                      }}
                      className="min-h-[38px] px-3 rounded-[10px] border border-sm-border
                                 bg-paper text-[13px] font-bold text-ink">
                {t('undo')}
              </button>
            </div>
          )}
          <div className="space-y-2" data-testid="quote-list">
            {shown.map((q) => {
              /* `superseded` is not a fourth outcome — it is a version a newer
                 one replaced — and the server refuses to accept, reject or
                 convert it. Showing it as "offen" claimed an answer was still
                 wanted on a document nobody is looking at any more, so it gets
                 no verdict at all; the status line already says "ersetzt". */
              const verdict = VERDICT_OF[q.status] || (q.status === 'superseded' ? null : 'open');
              /* Open cards are washed by age, decided ones by their verdict.
                 The two never appear together, because the tabs keep them on
                 separate screens — which is the whole reason age can afford a
                 colour at all. */
              const { step } = ageOf(q);
              const aged = verdict === 'open' ? step : null;
              const skin = aged ? aged.card
                : (verdict && VERDICT[verdict].card) || 'bg-paper border-sm-border';
              const trade = tradeOfCategory(q.job_category || q.category);
              const canShare = q.status === 'draft' || !!q.share_token;
              return (
              <CompactRow key={q.id} testid="quote-row" data={{ 'data-verdict': verdict || q.status }}
                openTestid="quote-open" moreTestid="quote-more" menuTestid="quote-menu"
                menuLabel={t('quote_row_more')} skin={skin} washed={!!aged}
                metaClass={aged?.meta || 'text-ink-muted'}
                to={`/quotes/${q.id}`}
                mark={trade ? <TradeMark trade={trade} size={24} /> : <FileText size={21} aria-hidden="true" />}
                title={q.title || q.job_title || (t('quote') || 'Angebot')}
                meta={[q.quote_number, q.customer_name].filter(Boolean).join(' · ') || q.job_number}
                pill={{ tone: STATUS_TONE[q.status] || 'muted', text: t(`quote_status_${q.status}`) || q.status }}
                amount={busyId === q.id
                  ? <Loader2 size={16} className="animate-spin text-teal" />
                  : fmtEur(q.gross_total)}
                controls={(
                  /* The verdict, as three icons. Every verdict is reachable
                     from every other one; the one already set is inert, and a
                     superseded quote has none of the three to offer. Winning
                     goes through the ConvertSheet, because accepting is also
                     scheduling the work; a lost quote is reopened first, since
                     the server refuses to convert a rejected one. */
                  <MiniGroup label={t('quote_verdict')} testid="quote-verdict">
                    {['open', 'won', 'lost'].map((v) => {
                      const on = v === verdict;
                      const reachable = !on && verdict !== null;
                      return (
                        <MiniBtn key={v} icon={{ open: Clock, won: Check, lost: Ban }[v]}
                                 label={t(`quote_verdict_${v}`)} on={on} tone={VERDICT[v].fill}
                                 disabled={!reachable || busyId === q.id}
                                 testid={`quote-verdict-${v}`}
                                 onClick={async () => {
                                   if (!reachable) return;
                                   if (v !== 'won') {
                                     if (await act(q.id, VERDICT[v].to, { reason: '' })) {
                                       setMoved({ to: v, id: q.id, from: verdict });
                                     }
                                     return;
                                   }
                                   if (verdict === 'lost' && !await act(q.id, 'reopen')) return;
                                   setConverting(q);
                                 }} />
                      );
                    })}
                  </MiniGroup>
                )}
                menu={[
                  { key: 'edit', label: t('quote_row_edit'), icon: Pencil, to: `/quotes/${q.id}`, testid: 'quote-edit' },
                  /* Share, singular: a draft is sent (which hands back the
                     link), a sent quote just has its link copied. A quote
                     with neither has nothing to share, so it is not offered. */
                  canShare && { key: 'share', label: q.status === 'draft' ? t('quote_row_send') : t('quote_row_share'),
                                icon: Share2, onClick: () => share(q), testid: 'quote-share' },
                  { key: 'pdf', label: t('quote_pdf'), icon: FileDown, onClick: () => openPdf(q.id), testid: 'quote-menu-pdf' },
                  /* Only a draft can go; a sent Angebot is a document the
                     customer holds, so the menu simply does not offer it
                     rather than showing a greyed entry that leads nowhere. */
                  q.status === 'draft' && { key: 'delete', icon: Trash2, testid: 'quote-menu-delete',
                    danger: true, label: t('delete'), onClick: () => setDeleting(q) },
                ]}
                note={shared === q.id && (
                  <p className="text-[12px] text-teal font-semibold mt-1.5 px-1"
                     role="status" data-testid="quote-shared">{t('quote_row_shared')}</p>
                )}
              />
            );})}
          </div>
          </>
        )}
      </div>

      {converting && (
        <ConvertSheet
          quote={converting}
          onClose={() => setConverting(null)}
            onDone={() => {
            const q = converting;
            setConverting(null);
            setMoved({ to: 'won', id: q?.id, from: 'open' });
            load();
          }}
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
