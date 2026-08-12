import React from 'react';
import { Phone, Navigation, MessageSquare } from 'lucide-react';
import { telHref, smsHref } from '../../utils/sms';
import { jobAddress, routeHref } from '../../utils/maps';
import { fmtEur, moneyLocale } from '../../utils/money';

/**
 * Who the work is for, at the top of the screen.
 *
 * One component on purpose. It appears on the job page and above the
 * calculation, and those two had no customer in common: the job page showed
 * "—" where the name belongs, and the calculation had no customer field at
 * all — a quote was created against a job that was invented on the spot, with
 * nobody attached, and the customer was matched up afterwards. Same card,
 * same three actions, both places.
 *
 * `job` is optional. Without it the card is the customer alone, which is what
 * the calculation needs; with it the card also carries the appointment and
 * what the work is worth.
 */

/** Initials for the avatar. Two letters at most, and never punctuation —
 *  "Bau & Technik GmbH" gave "B&" before this filtered non-letters. */
export function initialsOf(name = '') {
  const parts = String(name).split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function Row({ label, children }) {
  return (
    <>
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.05em] text-ink-muted
                     whitespace-nowrap pt-[3px]">{label}</dt>
      <dd className="text-[13.5px] font-semibold leading-snug text-ink">{children}</dd>
    </>
  );
}

export default function CustomerCard({
  customer, job, t, onEdit, onPick, subtitle, testid = 'customer-card',
}) {
  const c = customer || {};
  const hasCustomer = !!(c.id || c.name);

  /* No customer is a state, not an empty card. Without one there is no route,
     no call and no quote with an address on it, so the card says that and
     offers the two ways out rather than printing three dashes. */
  if (!hasCustomer) {
    return (
      <div className="rounded-[15px] border-[1.5px] border-dashed border-teal-tint bg-paper p-3.5
                      text-center" data-testid={`${testid}-empty`}>
        <p className="text-[14px] font-bold text-ink">{t('job_cust_none')}</p>
        <p className="text-[12px] text-ink-muted mt-0.5 mb-2.5">{t('job_cust_none_help')}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => onPick?.('existing')}
                  data-testid={`${testid}-pick`}
                  className="flex-1 min-h-[44px] rounded-xl border-[1.5px] border-teal/35 bg-paper
                             text-[13px] font-bold text-teal-deep">
            {t('job_cust_pick')}
          </button>
          <button type="button" onClick={() => onPick?.('new')}
                  data-testid={`${testid}-new`}
                  className="flex-1 min-h-[44px] rounded-xl border-[1.5px] border-teal/35 bg-paper
                             text-[13px] font-bold text-teal-deep">
            {t('job_cust_new')}
          </button>
        </div>
      </div>
    );
  }

  /* The site address wins over the billing address, and `jobAddress` already
     knows that — it is the same helper the calendar's Route button uses, so
     the two can never point at different places. */
  const forAddr = { ...(job || {}), customer_address: c.address,
                    customer_postal_code: c.postal_code, customer_city: c.city };
  const address = jobAddress(forAddr);
  const route = routeHref(forAddr);
  /* `telHref` cleans the number; it does not add the scheme — every other
     caller writes `tel:${…}` itself, and one that forgot rendered a link the
     browser treated as a relative path. */
  const num = telHref(c.phone);
  const tel = num ? `tel:${num}` : '';
  const sms = num ? smsHref(c.phone, '') : '';

  const start = job?.scheduled_start ? new Date(job.scheduled_start) : null;
  const end = job?.scheduled_end ? new Date(job.scheduled_end) : null;
  const amount = job ? Number(job.contract_amount || 0) : 0;

  return (
    <div className="rounded-[15px] border border-sm-border bg-paper overflow-hidden"
         data-testid={testid}>
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2.5">
        <span className="w-[38px] h-[38px] rounded-xl bg-teal-tint text-teal-deep shrink-0
                         grid place-items-center font-extrabold text-[15px]"
              aria-hidden="true">{initialsOf(c.name)}</span>
        <span className="min-w-0 flex-1">
          <b className="block text-[16px] font-extrabold tracking-[-0.01em] leading-tight text-ink
                        truncate" data-testid={`${testid}-name`}>{c.name}</b>
          <span className="block text-[12px] text-ink-faint mt-px truncate">
            {subtitle || c.email || c.phone || '—'}
          </span>
        </span>
        {onEdit && (
          <button type="button" onClick={onEdit} data-testid={`${testid}-edit`}
                  className="shrink-0 min-h-[44px] px-1 text-[11.5px] font-bold text-teal">
            {t('job_cust_change')}
          </button>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-[7px] px-3 pb-2.5 items-baseline">
        {address && (
          <Row label={t('job_f_site')}>
            {address.split(', ')[0]}
            <small className="block text-[11.5px] font-medium text-ink-faint">
              {address.split(', ').slice(1).join(', ') || ' '}
            </small>
          </Row>
        )}
        {c.phone && (
          <Row label={t('job_f_contact')}>
            <span className="tabular-nums">{c.phone}</span>
            {c.email && <small className="block text-[11.5px] font-medium text-ink-faint truncate">
              {c.email}</small>}
          </Row>
        )}
        {job && (
          <Row label={t('job_f_when')}>
            {start
              ? <>{fmtWhen(start, end)}
                  <small className="block text-[11.5px] font-medium text-ink-faint">
                    {relDay(start, t)}</small></>
              : <span className="text-teal">{t('job_not_scheduled')}</span>}
          </Row>
        )}
        {job && amount > 0 && (
          <Row label={t('job_f_worth')}>
            <span className="tabular-nums">{fmtEur(amount)} {t('job_net')}</span>
            {job.title && <small className="block text-[11.5px] font-medium text-ink-faint truncate">
              {job.title}</small>}
          </Row>
        )}
      </dl>

      {/* One bar, three 44 px targets, in the order they get used: ring first,
          drive second, write third. Anything that is missing loses its cell
          rather than becoming a button that does nothing. */}
      <div className="flex border-t border-sm-border">
        <Act href={tel} icon={Phone} label={t('day_call')} testid={`${testid}-call`} />
        <Act href={route} icon={Navigation} label={t('day_route')} testid={`${testid}-route`}
             external />
        <Act href={sms} icon={MessageSquare} label={t('job_a_message')}
             testid={`${testid}-message`} />
      </div>
    </div>
  );
}

function Act({ href, icon: Icon, label, testid, external }) {
  const cls = `flex-1 min-h-[44px] flex items-center justify-center gap-1.5 text-[12.5px]
               font-bold border-r border-sm-border last:border-r-0`;
  if (!href) {
    return (
      <span className={`${cls} text-ink-faint/70`} data-testid={`${testid}-off`} aria-hidden="true">
        <Icon size={14} /> {label}
      </span>
    );
  }
  return (
    <a href={href} data-testid={testid} className={`${cls} text-teal-deep`}
       {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      <Icon size={14} /> {label}
    </a>
  );
}

/* ── dates ───────────────────────────────────────────────────────────────
   Built from local parts, never from toISOString(): east of Greenwich an
   09:00 appointment turned into the previous day the moment it went through
   UTC. The calendar learned that twice; this card starts there. */

export function fmtWhen(start, end) {
  /* The app's locale, not the browser's. `undefined` here printed
     "Sat, Aug 8" on a German page, because the machine happened to be set to
     en-US — the one locale in this app that is never the user's choice. */
  const day = start.toLocaleDateString(moneyLocale(),
    { weekday: 'short', day: 'numeric', month: 'short' });
  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return end ? `${day} · ${hhmm(start)}–${hhmm(end)}` : `${day} · ${hhmm(start)}`;
}

export function relDay(when, t) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(when.getFullYear(), when.getMonth(), when.getDate());
  const days = Math.round((b - a) / 86400000);
  if (days === 0) return t('job_rel_today');
  if (days === 1) return t('job_rel_tomorrow');
  if (days === -1) return t('job_rel_yesterday');
  return days > 0 ? t('job_rel_in', { n: days }) : t('job_rel_ago', { n: -days });
}
