import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import api, { formatError } from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import { fmtEur } from '../../utils/money';
import { Loader2, X, Calendar, MapPin, Layers, Hammer } from 'lucide-react';

/**
 * What happens after the customer says yes.
 *
 * The decision a tradesperson actually makes on the doorstep is a fork, and
 * it is about size rather than about record-keeping: a socket and a lamp go
 * in the calendar before they leave the flat, while a bathroom becomes a
 * project whose stages get booked as the work reveals itself. Both are the
 * same row in `jobs` with a different `mode`, so nothing here creates a
 * second kind of thing — it decides a shape.
 *
 * One request does all of it (`POST /quotes/{id}/convert`). The four it
 * replaces — accept, set the mode, set the address, set the time — each had
 * to survive a stairwell with one bar of signal, and a gap between any two
 * left a quote accepted against a job with no time, no mode and no address.
 *
 * The time is optional for both shapes. A project may well have its first
 * stage booked on the spot, and a small job may be accepted on Tuesday for a
 * date not yet agreed; forcing a time to record a decision already made
 * would make the pro invent one.
 */

/** Local wall-clock date and time to an ISO instant.
 *
 *  Built from the parts rather than `new Date(str).toISOString()` on a naive
 *  string: the browser reads "2026-08-07T08:30" as local, which is right, but
 *  reading a date-only string as UTC is not — and east of Greenwich local
 *  midnight is the previous day. Constructing it explicitly leaves no room
 *  for the difference.
 */
function instantOf(day, time) {
  const [y, m, d] = (day || '').split('-').map(Number);
  const [hh, mm] = (time || '').split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

const DURATIONS = [60, 90, 120, 180, 240, 480];

export default function ConvertSheet({ quote, onClose, onDone }) {
  const { t } = useLang();
  const [mode, setMode] = useState('simple');
  const [book, setBook] = useState(true);
  const today = useMemo(() => {
    // Local, not toISOString(): that converts to UTC, and east of Greenwich
    // local midnight is yesterday there.
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);
  const [day, setDay] = useState(today);
  const [time, setTime] = useState('08:00');
  const [minutes, setMinutes] = useState(120);
  const [addr, setAddr] = useState('');
  const [plz, setPlz] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);

  // A project is the shape for work too big for one visit, so booking a slot
  // is offered but not assumed; a small job is the opposite.
  const wantsSlot = book;

  const submit = async () => {
    setBusy(true);
    try {
      const body = { mode };
      if (wantsSlot) {
        const start = instantOf(day, time);
        if (!start) { toast.error(t('conv_bad_time')); setBusy(false); return; }
        const end = new Date(start.getTime() + minutes * 60000);
        body.scheduled_start = start.toISOString();
        body.scheduled_end = end.toISOString();
      }
      if (addr.trim() || plz.trim() || city.trim()) {
        body.site = { address: addr.trim() || null, postal_code: plz.trim() || null,
                      city: city.trim() || null };
      }
      const { data } = await api.post(`/api/quotes/${quote.id}/convert`, body);
      toast.success(mode === 'project' ? t('conv_done_project') : t('conv_done_job'));
      onDone?.(data);
    } catch (err) {
      toast.error(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const Choice = ({ value, icon: Icon, title, body: text }) => (
    <button type="button" onClick={() => setMode(value)} aria-pressed={mode === value}
            data-testid={`conv-mode-${value}`}
            className={`w-full min-h-[76px] flex items-start gap-3 rounded-2xl border px-4 py-3.5
                        text-left transition
                        focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/25
                        ${mode === value
                          ? 'border-teal bg-teal/[.07] shadow-[inset_3px_0_0_theme(colors.teal.DEFAULT)]'
                          : 'border-sm-border bg-paper hover:border-teal/40'}`}>
      <Icon size={19} className={mode === value ? 'text-teal mt-0.5' : 'text-ink-muted mt-0.5'} />
      <span className="min-w-0">
        <span className="block text-[16px] font-bold leading-tight">{title}</span>
        <span className="block text-[13px] text-ink-muted mt-1 leading-snug">{text}</span>
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
         role="dialog" aria-modal="true" aria-label={t('conv_title')}
         data-testid="convert-sheet">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full sm:max-w-[460px] max-h-[92vh] overflow-y-auto
                      bg-cream rounded-t-[22px] sm:rounded-[22px] px-4 pt-3 pb-6
                      shadow-[0_-10px_34px_rgba(26,58,82,.24)]">
        <div className="w-11 h-1 rounded-full bg-cream-deep mx-auto mb-3 sm:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h2 className="font-headings font-bold text-[19px] tracking-[-.02em]">{t('conv_title')}</h2>
            {/* Joined as one list, not appended: a draft has no number and a
                quote may have no customer name, and hanging the amount off
                the end with its own separator printed "· € 300,00". */}
            <p className="text-[13px] text-ink-muted mt-0.5 truncate">
              {[quote.quote_number, quote.customer_name,
                quote.gross_total != null ? fmtEur(quote.gross_total) : null]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('close') || 'Schließen'}
                  className="shrink-0 w-11 h-11 grid place-items-center rounded-xl
                             border border-sm-border bg-paper text-ink-muted">
            <X size={17} />
          </button>
        </div>

        <p className="text-[13px] text-ink-faint leading-relaxed mt-2 mb-3">{t('conv_intro')}</p>

        <div className="flex flex-col gap-2">
          <Choice value="simple" icon={Hammer} title={t('conv_job')} body={t('conv_job_body')} />
          <Choice value="project" icon={Layers} title={t('conv_project')} body={t('conv_project_body')} />
        </div>

        <div className="mt-4 rounded-2xl border border-sm-border bg-paper overflow-hidden">
          <button type="button" role="switch" aria-checked={book} onClick={() => setBook((b) => !b)}
                  data-testid="conv-book-toggle"
                  className="w-full min-h-[60px] flex items-center gap-3 px-4 py-3 text-left">
            <Calendar size={17} className="text-ink-muted shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-bold leading-tight">{t('conv_book')}</span>
              <span className="block text-[12.5px] text-ink-faint mt-0.5 leading-snug">
                {t('conv_book_help')}
              </span>
            </span>
            <span aria-hidden="true"
                  className={`w-[50px] h-[30px] rounded-full shrink-0 relative transition-colors
                              ${book ? 'bg-teal' : 'bg-cream-deep'}`}>
              <span className={`absolute top-[3px] left-[3px] w-6 h-6 rounded-full bg-paper shadow
                                transition-transform ${book ? 'translate-x-5' : ''}`} />
            </span>
          </button>

          {book && (
            <div className="px-4 pb-4 pt-1 border-t border-sm-border">
              <div className="flex gap-2">
                <label className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold uppercase tracking-wider
                                   text-ink-muted mb-1.5">{t('conv_day')}</span>
                  <input type="date" value={day} min={today} onChange={(e) => setDay(e.target.value)}
                         className="input" data-testid="conv-day" />
                </label>
                <label className="w-[126px] shrink-0">
                  <span className="block text-[13px] font-bold uppercase tracking-wider
                                   text-ink-muted mb-1.5">{t('conv_time')}</span>
                  {/* Quarter-hour steps, because the API refuses 16:07 and the
                      grid cannot draw it — better to make it unpickable than
                      to reject it after the fact. */}
                  <input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)}
                         className="input" data-testid="conv-time" />
                </label>
              </div>
              <span className="block text-[13px] font-bold uppercase tracking-wider
                               text-ink-muted mt-3 mb-1.5">{t('conv_duration')}</span>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map((m) => (
                  <button key={m} type="button" onClick={() => setMinutes(m)}
                          aria-pressed={minutes === m} data-testid={`conv-dur-${m}`}
                          className={`min-h-[44px] px-3.5 rounded-xl border text-[14px] font-bold
                                      ${minutes === m ? 'border-teal bg-teal text-paper'
                                                      : 'border-sm-border bg-paper text-ink'}`}>
                    {m < 60 ? `${m} min` : `${m / 60} h`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <details className="mt-3 rounded-2xl border border-sm-border bg-paper overflow-hidden">
          <summary className="min-h-[56px] flex items-center gap-3 px-4 cursor-pointer list-none">
            <MapPin size={17} className="text-ink-muted shrink-0" />
            <span className="text-[15px] font-bold">{t('conv_where')}</span>
            <span className="ml-auto text-[13px] text-ink-faint">{t('conv_optional')}</span>
          </summary>
          <div className="px-4 pb-4 pt-1 border-t border-sm-border space-y-2">
            <input className="input" placeholder={t('conv_addr')} value={addr}
                   onChange={(e) => setAddr(e.target.value)} data-testid="conv-addr" />
            <div className="flex gap-2">
              <input className="input w-[112px] shrink-0" placeholder={t('conv_plz')} value={plz}
                     onChange={(e) => setPlz(e.target.value)} data-testid="conv-plz" />
              <input className="input flex-1 min-w-0" placeholder={t('conv_city')} value={city}
                     onChange={(e) => setCity(e.target.value)} data-testid="conv-city" />
            </div>
            <p className="text-[12.5px] text-ink-faint leading-relaxed">{t('conv_where_help')}</p>
          </div>
        </details>

        <button type="button" onClick={submit} disabled={busy} data-testid="conv-submit"
                className="w-full min-h-[54px] mt-4 rounded-2xl bg-amber text-on-amber
                           font-bold text-[16px] flex items-center justify-center gap-2
                           disabled:opacity-60">
          {busy && <Loader2 size={17} className="animate-spin" />}
          {mode === 'project' ? t('conv_do_project') : t('conv_do_job')}
        </button>
      </div>
    </div>
  );
}
