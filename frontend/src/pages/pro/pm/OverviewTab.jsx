import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../api/client';
import {
  Loader2, MessageSquare, Phone, Mail, MapPin, FileText, Receipt, Clock,
  TrendingUp, AlertTriangle, Sparkles, CheckCircle2, FileSignature, Image as ImageIcon,
  Play, Square, Calendar as CalendarIcon,
} from 'lucide-react';

const fmtEur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const ACTIVITY_ICON = {
  project_created: Sparkles,
  quote_accepted: CheckCircle2,
  invoice: Receipt,
  diary: FileText,
};

export default function OverviewTab({ projectId, t, onJumpTab }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timer, setTimer] = useState(null);
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/api/pm/projects/${projectId}/overview`);
      setData(d);
    } finally { setLoading(false); }
  };
  const loadTimer = async () => {
    try {
      const { data: t2 } = await api.get('/api/pm/timer');
      setTimer(t2.running);
    } catch { setTimer(null); }
  };

  useEffect(() => { load(); loadTimer(); /* eslint-disable-next-line */ }, [projectId]);

  // Tick every second while a timer for THIS project is running
  useEffect(() => {
    if (!timer || timer.project_id !== projectId) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [timer, projectId]);

  const toggleTimer = async () => {
    if (timer && timer.project_id === projectId) {
      await api.post(`/api/pm/projects/${projectId}/timer/stop`);
    } else {
      await api.post(`/api/pm/projects/${projectId}/timer/start`);
      setNow(Date.now()); // reset tick baseline immediately
    }
    await loadTimer();
    await load();
  };

  if (loading || !data) return <div className="flex justify-center py-10"><Loader2 size={24} className="text-teal animate-spin" /></div>;

  const isTimerOnThis = timer && timer.project_id === projectId;
  const timerElapsedSec = isTimerOnThis ? Math.floor((now - new Date(timer.started_at).getTime()) / 1000) : 0;
  const hh = String(Math.floor(timerElapsedSec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((timerElapsedSec % 3600) / 60)).padStart(2, '0');
  const ss = String(timerElapsedSec % 60).padStart(2, '0');

  const pl = data.pl;
  const job = data.job || {};
  const cust = data.customer || {};
  const profitPositive = pl.profit_eur > 0;

  return (
    <div className="space-y-4" data-testid="pm-overview-tab">
      {/* ─── KPI strip ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="card-lg p-4">
          <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">{t('pm_progress')}</p>
          <p className="text-2xl font-headings font-bold text-ink mt-0.5">{data.progress_pct}%</p>
          <div className="h-1 bg-cream-deep rounded-full overflow-hidden mt-2">
            <div className="h-full bg-teal transition-all" style={{ width: `${data.progress_pct}%` }} />
          </div>
          <p className="text-[11px] text-ink-muted mt-1">{data.tasks_done}/{data.tasks_total} {t('pm_tasks_total').toLowerCase()}</p>
        </div>

        <div className="card-lg p-4" data-testid="pm-overview-revenue">
          <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">{t('pm_overview_revenue')}</p>
          <p className="text-2xl font-headings font-bold text-ink mt-0.5">{fmtEur(pl.revenue_eur)}</p>
          <p className="text-[11px] text-ink-muted mt-1">{t('pm_overview_quote_base')}</p>
        </div>

        <div className="card-lg p-4" data-testid="pm-overview-materials">
          <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">{t('pm_overview_materials')}</p>
          <p className="text-2xl font-headings font-bold text-ink mt-0.5">{fmtEur(pl.materials_actual_eur)}</p>
          <p className="text-[11px] text-ink-muted mt-1">{t('pm_material_planned')}: {fmtEur(pl.materials_planned_eur)}</p>
        </div>

        <div className="card-lg p-4" data-testid="pm-overview-hours">
          <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">{t('pm_overview_labour')}</p>
          <p className="text-2xl font-headings font-bold text-ink mt-0.5">{pl.labour_hours.toFixed(1)} h</p>
          <p className="text-[11px] text-ink-muted mt-1">× {fmtEur(pl.labour_rate_eur)}/h = {fmtEur(pl.labour_cost_eur)}</p>
        </div>

        <div className={`card-lg p-4 col-span-2 lg:col-span-1 ${profitPositive ? 'bg-green-pos/5 border-green-pos/30' : 'bg-red-warn/5 border-red-warn/30'}`} data-testid="pm-overview-profit">
          <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider flex items-center gap-1">
            <TrendingUp size={10} /> {t('pm_overview_profit')}
          </p>
          <p className={`text-2xl font-headings font-bold mt-0.5 ${profitPositive ? 'text-green-pos' : 'text-red-warn'}`}>
            {fmtEur(pl.profit_eur)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">{t('pm_overview_margin')} {pl.margin_pct}%</p>
        </div>
      </div>

      {/* ─── Timer widget ─── */}
      <div className={`card-lg flex items-center gap-4 ${isTimerOnThis ? 'border-amber bg-amber/5' : ''}`} data-testid="pm-timer-widget">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isTimerOnThis ? 'bg-amber/20' : 'bg-cream-deep'}`}>
          <Clock size={22} className={isTimerOnThis ? 'text-amber-deep' : 'text-ink-muted'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">{t('pm_timer_title')}</p>
          <p className="text-2xl font-headings font-bold text-ink tabular-nums" data-testid="pm-timer-elapsed">
            {isTimerOnThis ? `${hh}:${mm}:${ss}` : '00:00:00'}
          </p>
        </div>
        <button
          onClick={toggleTimer}
          className={`btn-primary text-sm ${isTimerOnThis ? 'bg-red-warn hover:bg-red-warn/90' : ''}`}
          data-testid="pm-timer-toggle"
        >
          {isTimerOnThis ? <><Square size={14} /> {t('pm_timer_stop')}</> : <><Play size={14} /> {t('pm_timer_start')}</>}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ─── Original Job ─── */}
        <div className="card-lg" data-testid="pm-overview-job">
          <div className="flex items-center gap-2 mb-2">
            <FileSignature size={16} className="text-teal" />
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">{t('pm_overview_job_title')}</p>
          </div>
          <h3 className="font-headings font-bold text-ink text-base mb-1">{job.title || '—'}</h3>
          <p className="text-[11px] text-ink-muted mb-3">
            {job.category} · {job.postal_code} {job.city}
          </p>
          {job.description && (
            <div className="bg-cream-soft rounded-[10px] p-3 mb-3 max-h-32 overflow-y-auto">
              <p className="text-sm text-ink whitespace-pre-wrap">{job.description}</p>
            </div>
          )}
          {job.photos && job.photos.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5 mb-2" data-testid="pm-overview-photos">
              {job.photos.slice(0, 4).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square block rounded-[8px] overflow-hidden bg-cream-deep">
                  <img src={url} alt={`job ${i}`} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                </a>
              ))}
            </div>
          )}
          {(!job.photos || job.photos.length === 0) && (
            <p className="text-xs text-ink-muted inline-flex items-center gap-1"><ImageIcon size={11} /> {t('pm_overview_no_photos')}</p>
          )}
          {job.lat && job.lng && (
            <a href={`https://www.google.com/maps?q=${job.lat},${job.lng}`} target="_blank" rel="noopener noreferrer" className="text-xs text-teal hover:underline inline-flex items-center gap-1 mt-2">
              <MapPin size={11} /> {t('pm_overview_open_map')}
            </a>
          )}
        </div>

        {/* ─── Customer ─── */}
        <div className="card-lg" data-testid="pm-overview-customer">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-teal" />
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">{t('pm_overview_customer_title')}</p>
          </div>
          <h3 className="font-headings font-bold text-ink text-base">{cust.name || '—'}</h3>
          <div className="text-sm text-ink-soft mt-1 space-y-1">
            {cust.address && <p>{cust.address}</p>}
            {(cust.postal_code || cust.city) && <p>{cust.postal_code} {cust.city}</p>}
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {cust.email && (
              <a href={`mailto:${cust.email}`} className="btn-ghost text-xs" data-testid="pm-overview-email">
                <Mail size={11} /> {cust.email}
              </a>
            )}
            {cust.phone && (
              <a href={`tel:${cust.phone}`} className="btn-ghost text-xs" data-testid="pm-overview-call">
                <Phone size={11} /> {cust.phone}
              </a>
            )}
          </div>

          {/* Chat snippet */}
          {data.chat.thread_id && (
            <div className="mt-3 pt-3 border-t border-sm-border">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider flex items-center gap-1"><MessageSquare size={10} /> {t('pm_overview_chat_recent')}</p>
                <Link to={`/messages?thread=${data.chat.thread_id}`} className="text-[11px] text-teal hover:underline" data-testid="pm-overview-open-chat">{t('pm_overview_open_chat')}</Link>
              </div>
              {data.chat.messages.length === 0 ? (
                <p className="text-xs text-ink-muted italic">{t('pm_overview_chat_empty')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.chat.messages.map((m) => (
                    <li key={m.id} className={`text-xs rounded-[8px] px-2 py-1.5 ${m.sent_by_me ? 'bg-teal/10 text-ink' : 'bg-cream-soft text-ink'}`}>
                      <span className="font-semibold text-[10px] uppercase">{m.sent_by_me ? t('pm_overview_chat_me') : (cust.name || 'Customer')}: </span>
                      {m.body}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Quote + Invoices ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-lg" data-testid="pm-overview-quote">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-green-pos" />
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">{t('pm_overview_quote')}</p>
          </div>
          <p className="text-2xl font-headings font-bold text-ink">{fmtEur(data.quote.price_eur)}</p>
          {data.quote.travel_cost_eur > 0 && (
            <p className="text-xs text-ink-muted">+ {fmtEur(data.quote.travel_cost_eur)} {t('pm_overview_travel')}</p>
          )}
          {data.quote.message && <p className="text-sm text-ink-soft mt-2 italic">"{data.quote.message}"</p>}
          {data.quote.accepted_at && (
            <p className="text-[11px] text-ink-muted mt-2 inline-flex items-center gap-1"><CalendarIcon size={10} /> {t('pm_overview_accepted')} {fmtDate(data.quote.accepted_at)}</p>
          )}
        </div>

        <div className="card-lg" data-testid="pm-overview-invoices">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Receipt size={16} className="text-teal" />
              <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">{t('pm_overview_invoices')}</p>
            </div>
            <Link
              to={`/invoice-from-project/${projectId}`}
              className="text-[11px] text-teal hover:underline inline-flex items-center gap-1"
              data-testid="pm-overview-create-invoice"
            >
              {t('pm_overview_create_invoice')} →
            </Link>
          </div>
          {data.invoices.length === 0 ? (
            <p className="text-xs text-ink-muted py-2 italic">{t('pm_overview_no_invoices')}</p>
          ) : (
            <ul className="space-y-1.5">
              {data.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-[8px] hover:bg-cream-soft" data-testid={`pm-overview-invoice-${inv.id}`}>
                  <Link to={`/my-invoices?new=${inv.id}`} className="font-mono text-xs text-teal hover:underline">{inv.invoice_number}</Link>
                  <div className="flex items-center gap-2">
                    <span className="text-ink font-medium">{fmtEur(inv.brutto_total)}</span>
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full ${inv.status === 'paid' ? 'bg-green-pos/15 text-green-pos' : 'bg-amber/15 text-amber-deep'}`}>{inv.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ─── Activity timeline ─── */}
      <div className="card-lg" data-testid="pm-overview-activity">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-ink-soft rotate-180" />
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">{t('pm_overview_activity')}</p>
        </div>
        {data.activity.length === 0 ? (
          <p className="text-xs text-ink-muted italic">{t('pm_overview_no_activity')}</p>
        ) : (
          <ul className="space-y-2.5">
            {data.activity.map((a, i) => {
              const Icon = ACTIVITY_ICON[a.kind] || FileText;
              return (
                <li key={i} className="flex items-start gap-3" data-testid={`pm-overview-activity-${i}`}>
                  <div className="w-7 h-7 rounded-full bg-cream-deep flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon size={11} className="text-ink-soft" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink leading-tight">{a.label}</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">{a.ts && new Date(a.ts).toLocaleString('de-AT')}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
