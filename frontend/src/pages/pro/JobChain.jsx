import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Loader2, FileText, CalendarClock, Play, Check, Receipt, Link2, ExternalLink,
} from 'lucide-react';
import api, { apiBase, formatError } from '../../api/client';
import CustomerCard, { fmtWhen, relDay } from '../../components/pro/CustomerCard';
import StepCard, { Knot, Isle, Segment } from '../../components/pro/StepCard';
import useJobAction from '../../hooks/useJobAction';
import { fmtEur, fmtDate, fmtDateTime, moneyLocale } from '../../utils/money';
import { statusLabel } from '../../utils/jobStatus';
import { stepStates } from '../../utils/jobSteps';

/**
 * The job, as the chain it is.
 *
 * The page this replaces was a project dashboard wearing a job's name: five
 * KPI cards reading € 0,00 above a red "net profit € 0,00", seven tabs of
 * project machinery, and — on a job whose status was literally `scheduled` —
 * no date, no address and no phone number anywhere on the screen. 267 of the
 * first 820 pixels went by before the first figure, and that figure was 0 %.
 *
 * What is here instead: who the work is for, then the five steps the job
 * actually moves through, hanging off one spine that starts at the customer.
 * Every step is shut until it is asked for, wears its own colour, and holds
 * the one action that moves the job on — the same ladder the server's
 * transition table enforces, so the page can never offer a move that will be
 * refused.
 */

const DURATIONS = [60, 90, 120, 180, 240, 480];

function instantOf(day, time) {
  const [y, m, d] = (day || '').split('-').map(Number);
  const [hh, mm] = (time || '').split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const timeKey = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function JobChain({ jobId, job: shell, reload, t }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get(`/api/jobs/${jobId}/overview`);
      setData(d);
    } finally { setLoading(false); }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(async () => {
    await Promise.all([load(), reload?.()]);
  }, [load, reload]);

  const act = useJobAction({ t, onChanged: () => refresh() });

  const job = useMemo(
    () => ({ ...(data?.job || {}), mode: shell?.mode, title: data?.job?.title || shell?.title }),
    [data, shell?.mode, shell?.title]);
  const customer = data?.customer && Object.keys(data.customer).length ? data.customer : null;
  const quote = data?.quote && data.quote.id ? data.quote : null;
  const invoices = data?.invoices || [];
  const pl = data?.pl || {};
  const states = useMemo(() => stepStates(job, quote), [job, quote]);
  /* The moves the server would actually accept, straight off the job payload.
     Without this the page offered "Arbeit beginnen" on a job booked by phone
     that was still a `lead` — the transition table refuses lead → in_progress,
     so the button made a request, got a 409 and left the job where it was.
     A button that cannot work is worse than none: it says the job started. */
  const allowed = shell?.allowed_transitions || [];

  /* One open at a time. Tapping the open one shuts it, so the resting state
     is always reachable. */
  const toggle = (key) => setOpen((cur) => (cur === key ? null : key));

  if (loading) {
    return (
      <div className="flex justify-center py-12" data-testid="job-chain-loading">
        <Loader2 size={24} className="text-teal animate-spin" />
      </div>
    );
  }

  const primary = async (action) => {
    setBusy(true);
    try { await act({ id: jobId, status: job.status }, action); }
    finally { setBusy(false); }
  };

  const STEPS = [
    {
      key: 'quote', title: t('job_step_quote'),
      /* An agreed amount with no quote document behind it is normal — the job
         was taken over the phone. Printing "none" beside a green tick read as
         a contradiction; the figure is what was agreed either way. */
      value: quote ? fmtEur(quote.net_total)
        : (job.contract_amount ? fmtEur(job.contract_amount) : t('job_step_quote_none')),
      body: <QuoteBody quote={quote} job={job} t={t} state={states[0]} navigate={navigate} />,
    },
    {
      key: 'sched', title: t('job_step_sched'),
      value: job.scheduled_start
        ? fmtWhen(new Date(job.scheduled_start), null)
        : t('job_step_open'),
      body: <ScheduleBody job={job} t={t} onSaved={refresh} />,
    },
    {
      key: 'work', title: t('job_step_work'),
      value: states[2] === 'run' ? t('job_running') : `${(pl.labour_hours || 0).toFixed(1)} h`,
      body: (
        <WorkBody job={job} pl={pl} data={data} t={t} state={states[2]} busy={busy}
                  can={allowed.includes('in_progress')} status={job.status}
                  onStart={() => primary('start')} />
      ),
    },
    {
      key: 'finish', title: t('job_step_finish'),
      value: states[3] === 'done' ? t('job_step_done') : t('job_step_open'),
      body: (
        <FinishBody job={job} data={data} t={t} state={states[3]} busy={busy}
                    can={allowed.includes('completed')} status={job.status}
                    onFinish={() => primary('complete')} />
      ),
    },
    {
      key: 'bill', title: t('job_step_bill'),
      value: invoices.length ? fmtEur(pl.revenue_eur || 0) : fmtEur(job.contract_amount || 0),
      body: <BillBody job={job} invoices={invoices} t={t} jobId={jobId} navigate={navigate} />,
    },
  ];

  return (
    <div data-testid="job-chain">
      {/* The spine starts at the customer card — the customer is where the job
          starts, and a chain that begins below them says the two are separate
          things. */}
      <div className="relative pl-[34px]" data-testid="job-spine">
        <div className="relative mb-[22px]">
          {/* The start of the chain is only a start once somebody is at it: a
              job with no customer gets a hollow knot and a pale segment, so
              the green does not claim something that has not happened. */}
          <Segment state={customer ? 'done' : 'wait'} />
          <span aria-hidden="true" data-testid="job-start-knot"
                data-state={customer ? 'done' : 'wait'}
                className={`absolute -left-[34px] top-3 w-[25px] h-[25px] rounded-full border-[3px]
                            bg-paper grid place-items-center z-[2]
                            ${customer ? 'border-green-pos' : 'border-cream-deep'}`}>
            <span className={`w-[7px] h-[7px] rounded-full block
                              ${customer ? 'bg-green-pos' : 'bg-cream-deep'}`} />
          </span>
          {/* The job's own name rides under the customer's. It used to be the
              page's h1 and nothing else carried it; here the card is the
              header, so the title belongs in it or nowhere. */}
          <CustomerCard customer={customer} job={job} t={t}
                        subtitle={[job.title, job.category].filter(Boolean).join(' · ')}
                        onEdit={() => navigate(`/customers?job=${jobId}`)}
                        onPick={() => navigate(`/customers?job=${jobId}`)}
                        testid="job-customer" />
        </div>

        {STEPS.map((s, i) => (
          <div key={s.key} className="relative mb-[22px] last:mb-0">
            {i < STEPS.length - 1 && <Segment state={states[i]} />}
            <Knot state={states[i]} n={i + 1} label={`job-step-${s.key}`} />
            <StepCard state={states[i]} n={i + 1} title={s.title} value={s.value}
                      open={open === s.key} onToggle={() => toggle(s.key)}
                      testid={`job-step-${s.key}`}>
              {s.body}
            </StepCard>
          </div>
        ))}
      </div>

      {/* Not steps, so not on the spine. The line ends visibly above them. */}
      <p className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-ink-muted
                    mt-4 mb-1.5 ml-0.5">{t('job_grp_about')}</p>
      <div className="mb-2">
        <StepCard state="wait" title={t('job_about_desc')}
                  value={job.description ? '' : '—'} open={open === 'desc'}
                  onToggle={() => toggle('desc')} testid="job-about-desc">
          <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
            {job.description || t('job_about_desc_none')}
          </p>
        </StepCard>
      </div>
      <StepCard state="wait" title={t('job_about_share')} value={t('job_about_share_v')}
                open={open === 'share'} onToggle={() => toggle('share')} testid="job-about-share">
        <ShareBody job={job} t={t} />
      </StepCard>
    </div>
  );
}


/* ── step bodies ──────────────────────────────────────────────────────── */

function Btn({ children, onClick, href, kind = 'ghost', testid, disabled, external }) {
  const base = 'w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl font-bold';
  const cls = kind === 'primary'
    ? `${base} bg-teal text-paper text-[14.5px]`
    : kind === 'amber'
      ? `${base} bg-amber text-on-amber text-[14.5px]`
      : `${base} border-[1.5px] border-teal/35 bg-paper text-teal-deep text-[12.5px]`;
  if (href) {
    return (
      <a href={href} data-testid={testid} className={cls}
         {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testid}
            className={`${cls} disabled:opacity-60`}>{children}</button>
  );
}

function Money({ label, value, strong }) {
  return (
    <div className={`flex items-baseline gap-2 py-1.5 ${strong ? 'border-t border-ink/25 mt-1 pt-2' : ''}`}>
      <span className={`text-[13px] ${strong ? 'font-extrabold text-ink' : 'text-ink-soft'}`}>{label}</span>
      <span className="flex-1 border-b border-dotted border-ink/30 -translate-y-[3px]" />
      <span className={`tabular-nums font-bold text-ink ${strong ? 'text-[15px]' : 'text-[13px]'}`}>
        {value}
      </span>
    </div>
  );
}

/** The quote, with its lines — fetched when the card is opened and not
 *  before, which is the whole reason the cards start shut. */
function QuoteBody({ quote, job, t, state, navigate }) {
  const [full, setFull] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!quote?.id) return;
    let alive = true;
    api.get(`/api/quotes/${quote.id}`)
      .then(({ data }) => { if (alive) setFull(data); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [quote?.id]);

  if (!quote) {
    return (
      <>
        {job?.contract_amount > 0 && (
          <Isle testid="job-quote-agreed">
            <Money label={t('job_quote_agreed')} value={fmtEur(job.contract_amount)} strong />
          </Isle>
        )}
        <p className="text-[13px] text-ink-soft mb-2.5">{t('job_quote_none_help')}</p>
        <Btn kind="primary" testid="job-quote-create" onClick={() => navigate('/estimate')}>
          <FileText size={16} /> {t('job_quote_create')}
        </Btn>
      </>
    );
  }

  const lines = full?.lines || [];
  return (
    <>
      {state === 'done' && quote.decided_at && (
        <p className="flex items-center gap-2 text-[11.5px] font-bold text-green-text mb-2.5"
           data-testid="job-quote-stamp">
          <span className="w-[7px] h-[7px] rounded-full bg-green-pos block" />
          {t('job_quote_accepted_on', { d: fmtDate(quote.decided_at) })}
          {quote.quote_number ? ` · ${quote.quote_number}` : ''}
        </p>
      )}
      <Isle testid="job-quote-lines">
        {lines.length === 0 && !failed && (
          <p className="text-[12.5px] text-ink-muted py-1">{t('ui_loading')}</p>
        )}
        {lines.map((l, i) => (
          <Money key={l.id || i} label={l.description || l.title || '—'}
                 value={fmtEur(l.net_amount ?? l.total_net ?? 0)} />
        ))}
        <Money label={t('job_sum_net')} value={fmtEur(quote.net_total)} strong />
      </Isle>
      <div className="flex gap-2">
        <Btn href={`${apiBase || ''}/api/quotes/${quote.id}/pdf`} external testid="job-quote-pdf">
          <FileText size={14} /> {t('job_quote_pdf')}
        </Btn>
        <Btn onClick={() => navigate(`/quotes/${quote.id}`)} testid="job-quote-open">
          <ExternalLink size={14} /> {t('job_quote_open')}
        </Btn>
      </div>
    </>
  );
}

/** The appointment, and how to move it. Quarter-hour steps, because the API
 *  refuses 16:07 and the grid cannot draw it. */
function ScheduleBody({ job, t, onSaved }) {
  const start = job.scheduled_start ? new Date(job.scheduled_start) : null;
  const end = job.scheduled_end ? new Date(job.scheduled_end) : null;
  const [day, setDay] = useState(dayKey(start || new Date()));
  const [time, setTime] = useState(start ? timeKey(start) : '08:00');
  const [minutes, setMinutes] = useState(
    start && end ? Math.max(15, Math.round((end - start) / 60000)) : 120);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const s = instantOf(day, time);
    if (!s) { toast.error(t('conv_bad_time')); return; }
    setBusy(true);
    try {
      await api.patch(`/api/jobs/${job.id}/schedule`, {
        scheduled_start: s.toISOString(),
        scheduled_end: new Date(s.getTime() + minutes * 60000).toISOString(),
      });
      toast.success(t('job_sched_saved'));
      await onSaved?.();
    } catch (err) { toast.error(formatError(err)); }
    finally { setBusy(false); }
  };

  return (
    <>
      {start && (
        <Isle testid="job-sched-now">
          <Money label={t('job_f_when')} value={fmtWhen(start, end)} />
          <Money label={t('job_sched_in')} value={relDay(start, t)} />
        </Isle>
      )}
      <div className="flex gap-2">
        <label className="flex-1 min-w-0">
          <span className="block text-[11px] font-extrabold uppercase tracking-wider
                           text-ink-muted mb-1">{t('conv_day')}</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
                 className="input" data-testid="job-sched-day" />
        </label>
        <label className="w-[120px] shrink-0">
          <span className="block text-[11px] font-extrabold uppercase tracking-wider
                           text-ink-muted mb-1">{t('conv_time')}</span>
          <input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)}
                 className="input" data-testid="job-sched-time" />
        </label>
      </div>
      <span className="block text-[11px] font-extrabold uppercase tracking-wider
                       text-ink-muted mt-2.5 mb-1.5">{t('conv_duration')}</span>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {DURATIONS.map((m) => (
          <button key={m} type="button" onClick={() => setMinutes(m)} aria-pressed={minutes === m}
                  data-testid={`job-sched-dur-${m}`}
                  className={`min-h-[44px] px-3 rounded-xl border text-[13.5px] font-bold
                              ${minutes === m ? 'border-teal bg-teal text-paper'
                                              : 'border-sm-border bg-paper text-ink'}`}>
            {m < 60 ? `${m} min` : `${m / 60} h`}
          </button>
        ))}
      </div>
      <Btn kind={start ? 'ghost' : 'primary'} onClick={save} disabled={busy}
           testid="job-sched-save">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}
        {start ? t('job_sched_move') : t('job_sched_set')}
      </Btn>
    </>
  );
}

/** What has been booked against the job, and the button that starts it. */
function WorkBody({ job, pl, data, t, state, busy, can, status, onStart }) {
  const [now, setNow] = useState(Date.now());
  const running = state === 'run';
  useEffect(() => {
    if (!running || !job.started_at) return undefined;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [running, job.started_at]);

  const secs = running && job.started_at
    ? Math.max(0, Math.floor((now - new Date(job.started_at).getTime()) / 1000)) : 0;
  const hhmmss = [Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60]
    .map((x) => String(x).padStart(2, '0')).join(':');

  return (
    <>
      {running && (
        <Isle testid="job-work-timer">
          <Money label={t('job_running_since')}
                 value={new Date(job.started_at).toLocaleTimeString(moneyLocale(),
                   { hour: '2-digit', minute: '2-digit' })} />
          <Money label={t('job_elapsed')} value={hhmmss} strong />
        </Isle>
      )}
      <Isle testid="job-work-recorded">
        <Money label={t('job_hours')} value={`${(pl.labour_hours || 0).toFixed(1)} h`} />
        <Money label={t('job_material')} value={fmtEur(data?.materials?.actual || 0)} />
        <Money label={t('job_costs_so_far')}
               value={fmtEur((pl.labour_cost_eur || 0) + (pl.materials_actual_eur || 0))} strong />
      </Isle>
      {state === 'now' && can && (
        <Btn kind="primary" onClick={onStart} disabled={busy} testid="job-work-start">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {t('job_work_start')}
        </Btn>
      )}
      {state === 'now' && !can && <Blocked t={t} status={status} testid="job-work-blocked" />}
      {state === 'wait' && (
        <p className="text-[12.5px] text-ink-faint leading-relaxed">{t('job_work_wait')}</p>
      )}
    </>
  );
}

/** What is missing before the job can be called finished — and the button
 *  that finishes it anyway, because none of it is mandatory. */
function FinishBody({ job, data, t, state, busy, can, status, onFinish }) {
  const photos = (data?.job?.photos || []).length;
  const done = state === 'done';
  return (
    <>
      <Isle testid="job-finish-check">
        <Money label={t('job_finish_photos')} value={String(photos)} />
        <Money label={t('job_finish_signoff')}
               value={job.abnahme_at ? fmtDate(job.abnahme_at) : t('job_step_open')} />
        {job.completed_at && (
          <Money label={t('job_finish_at')}
                 value={fmtDateTime(job.completed_at)} strong />
        )}
      </Isle>
      {!done && state !== 'wait' && !can && (
        <Blocked t={t} status={status} testid="job-finish-blocked" />
      )}
      {!done && state !== 'wait' && can && (
        <>
          <Btn kind="amber" onClick={onFinish} disabled={busy} testid="job-finish-do">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {t('job_finish_do')}
          </Btn>
          <p className="text-[12px] text-ink-faint leading-relaxed mt-2">{t('job_finish_help')}</p>
        </>
      )}
      {state === 'wait' && (
        <p className="text-[12.5px] text-ink-faint leading-relaxed">{t('job_finish_wait')}</p>
      )}
    </>
  );
}

/** Why the action is not here. The status control in the page header offers
 *  the moves that *are* legal, so this points at it rather than growing a
 *  second one. */
function Blocked({ t, status, testid }) {
  return (
    <p className="text-[12.5px] leading-relaxed text-ink-soft rounded-[11px] bg-amber/10
                  border border-amber-tint px-3 py-2.5" data-testid={testid}>
      {t('job_action_blocked', { s: statusLabel(status, t) })}
    </p>
  );
}

function BillBody({ job, invoices, t, jobId, navigate }) {
  return (
    <>
      <Isle testid="job-bill-basis">
        {invoices.length === 0
          ? <Money label={t('job_bill_basis')} value={fmtEur(job.contract_amount || 0)} strong />
          : invoices.map((inv) => (
            <Money key={inv.id} label={`${inv.invoice_number} · ${inv.status}`}
                   value={fmtEur(inv.gross_total)} />
          ))}
      </Isle>
      <Btn kind="ghost" testid="job-bill-open"
           onClick={() => navigate(`/jobs/${jobId}/invoice`)}>
        <Receipt size={15} /> {invoices.length ? t('job_bill_open') : t('job_bill_create')}
      </Btn>
    </>
  );
}

function ShareBody({ job, t }) {
  const url = job.share_token ? `${window.location.origin}/p/${job.share_token}` : null;
  const [copied, setCopied] = useState(false);
  if (!url) return <p className="text-[12.5px] text-ink-faint">{t('job_share_none')}</p>;
  return (
    <>
      <p className="rounded-[10px] border border-ink/15 bg-paper px-2.5 py-2 text-[11.5px]
                    text-ink-soft break-all mb-2.5 font-mono" data-testid="job-share-url">{url}</p>
      <div className="flex gap-2">
        <Btn testid="job-share-copy" onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true); setTimeout(() => setCopied(false), 1500);
          } catch { /* a browser that refuses the clipboard is not an error worth shouting about */ }
        }}>
          <Link2 size={14} /> {copied ? '✓' : t('pm_share_copy')}
        </Btn>
        <Btn href={url} external testid="job-share-open">
          <ExternalLink size={14} /> {t('pm_share_open_public')}
        </Btn>
      </div>
    </>
  );
}
