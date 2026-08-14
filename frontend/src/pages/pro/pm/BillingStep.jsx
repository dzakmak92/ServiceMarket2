import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Receipt } from 'lucide-react';
import api from '../../../api/client';
import { fmtEur } from '../../../utils/money';

/**
 * Step 6 — what gets invoiced, as parts you tick.
 *
 * An invoice for a project is a sum of pieces: the contract, whatever
 * Nachträge the customer approved, and whatever the material actually cost
 * against what was planned. The step lists the pieces and lets each be taken
 * out, because whether material overrun belongs on a fixed-price invoice is a
 * commercial decision and not one the screen should make.
 *
 * The rule that matters: a piece already inside an invoice is **locked** —
 * greyed, struck through, its box replaced by a padlock carrying the invoice
 * number. It cannot be selected, and the sum below counts only what is left.
 * Without that, the obvious way to bill the rest of a project is also the way
 * to bill the deposit a second time.
 *
 * What counts as already invoiced is read from the job's own invoices:
 *
 *  - A Nachtrag carries its own `invoiced` status, so that one is exact.
 *  - The contract is coarser. Any live `standard` or `schluss` invoice settles
 *    the whole of it; `abschlag` invoices settle what they carry, so what
 *    remains is the contract minus their sum. This is stated on the row rather
 *    than hidden, because a part-locked row is the one place a pro could
 *    reasonably disagree with the arithmetic.
 *
 * Everything here is **gross**. Not a preference — `contract_amount` is
 * written from the accepted quote's `gross_total`, and the invoices it is
 * settled against carry `gross_total` too. A Nachtrag is stored net beside its
 * own `vat_rate`, so it is grossed up with the rate it was agreed at rather
 * than a house default, and the net is printed on its row.
 */

/* Draft invoices are not commitments and a Storno is the undoing of one, so
   neither settles anything. A cancelled invoice is off the list for the same
   reason its Storno is: the pair nets to zero and the work is unbilled again. */
const isLive = (inv) => inv.status !== 'draft' && inv.type !== 'storno' && !inv.cancelled_at;

const MAT_VAT = 0.2;

export default function BillingStep({ jobId, job, invoices = [], t, onOpen }) {
  const [cos, setCos] = useState([]);
  const [mats, setMats] = useState(null);
  const [loading, setLoading] = useState(true);
  /* Only the parts the pro has actually touched. Everything else follows its
     own default, which is why this cannot be seeded from `parts` — the parts
     do not exist until the two requests come back. */
  const [pick, setPick] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, m] = await Promise.all([
        api.get(`/api/jobs/${jobId}/change-orders`).catch(() => ({ data: {} })),
        api.get(`/api/jobs/${jobId}/materials`).catch(() => ({ data: {} })),
      ]);
      const rows = Array.isArray(c.data) ? c.data : (c.data?.change_orders || []);
      setCos(Array.isArray(rows) ? rows : []);
      setMats(m.data?.totals || null);
    } finally { setLoading(false); }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  const live = useMemo(
    () => (Array.isArray(invoices) ? invoices : []).filter(isLive), [invoices]);

  /* How much of the contract is already on an invoice. A full or final
     invoice takes all of it; deposits take what they are worth. */
  const contractTotal = Number(job?.contract_amount || 0);
  const settledContract = useMemo(() => {
    if (live.some((i) => i.type === 'standard' || i.type === 'schluss')) return contractTotal;
    return live.filter((i) => i.type === 'abschlag')
      .reduce((a, i) => a + Number(i.gross_total || 0), 0);
  }, [live, contractTotal]);
  const contractOpen = Math.max(0, contractTotal - settledContract);

  const overrunNet = mats ? Number(mats.variance || 0) : 0;

  const parts = useMemo(() => {
    const out = [];
    out.push({
      key: 'contract',
      title: t('job_bill_contract'),
      note: settledContract > 0
        ? t('job_bill_contract_part', { v: fmtEur(settledContract) })
        : (job?.job_number || ''),
      value: contractOpen,
      locked: contractOpen <= 0.005 && contractTotal > 0,
      lockedBy: live.find((i) => i.type === 'standard' || i.type === 'schluss')?.invoice_number
        || live.find((i) => i.type === 'abschlag')?.invoice_number,
      full: contractTotal,
    });
    /* A rejected Nachtrag is not a thing to bill, so it is not offered at all.
       The rest are, because a draft one the customer agreed to on the phone is
       still work that was done. */
    for (const c of cos.filter((x) => x.status !== 'rejected')) {
      const net = Number(c.net_amount || 0);
      const gross = net * (1 + Number(c.vat_rate ?? 20) / 100);
      out.push({
        key: `co-${c.id}`,
        title: c.title,
        note: `${t(`job_co_${c.status}`)} · ${t('job_bill_net_of', { v: fmtEur(net) })}`,
        value: gross,
        locked: c.status === 'invoiced',
        /* Approved is the bar for putting an extra on an invoice. A sent one
           is a request, not an agreement, so it is offered unticked rather
           than not offered — the pro may know the customer said yes on the
           phone. */
        preselect: c.status === 'approved',
        lockedBy: null,
        full: gross,
      });
    }
    if (Math.abs(overrunNet) >= 0.005) {
      out.push({
        key: 'material',
        title: t('job_bill_material'),
        note: `${t(overrunNet > 0 ? 'job_bill_material_over' : 'job_bill_material_under')} · ${t('job_bill_net_of', { v: fmtEur(overrunNet) })}`,
        value: overrunNet * (1 + MAT_VAT),
        locked: false,
        /* Off by default: on a fixed price the overrun is the pro's, and a
           screen that quietly adds it to the customer's invoice is picking a
           side of that argument. */
        preselect: false,
      });
    }
    return out;
  }, [t, settledContract, contractOpen, contractTotal, job?.job_number, live, cos, overrunNet]);

  const on = (p) => !p.locked && (pick[p.key] ?? p.preselect !== false);
  const gross = parts.filter(on).reduce((a, p) => a + p.value, 0);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 size={18} className="text-teal animate-spin" /></div>;
  }

  return (
    <div data-testid="job-bill">
      {settledContract > 0 && (
        <p className="text-[11.5px] text-ink-soft pb-2 mb-1 border-b border-sm-border"
           data-testid="job-bill-already">
          {t('job_bill_already', { v: fmtEur(settledContract), n: live.length })}
        </p>
      )}

      {parts.map((p) => (
        <div key={p.key} data-testid={`job-bill-part-${p.key}`} data-locked={p.locked ? 'yes' : 'no'}
             className={`flex items-center gap-2.5 py-2.5 border-b border-sm-border last:border-b-0
                         ${p.locked ? 'opacity-50' : ''}`}>
          {p.locked ? (
            <span className="w-[20px] h-[20px] rounded-[5px] bg-cream-deep border-2 border-sm-border
                             grid place-items-center shrink-0 text-ink-faint" aria-hidden="true">
              <Lock size={11} />
            </span>
          ) : (
            <button type="button" data-testid={`job-bill-part-${p.key}-box`}
                    onClick={() => setPick((s) => ({ ...s, [p.key]: !on(p) }))}
                    aria-pressed={on(p)} aria-label={p.title}
                    className={`w-[20px] h-[20px] rounded-[5px] border-2 shrink-0 grid place-items-center
                                text-paper text-[11px] font-extrabold
                                ${on(p) ? 'bg-teal border-teal' : 'border-step-now-line'}`}>
              {on(p) ? '✓' : ''}
            </button>
          )}
          <span className="flex-1 min-w-0">
            <b className={`block text-[12.5px] font-bold truncate
                           ${p.locked ? 'line-through' : ''}`}>{p.title}</b>
            <span className="block text-[10.5px] text-ink-faint truncate">
              {p.locked && p.lockedBy ? `${p.lockedBy} · ${t('job_bill_locked')}` : p.note}
            </span>
          </span>
          <b className="shrink-0 text-[12.5px] font-extrabold tabular-nums">
            {fmtEur(p.locked ? p.full ?? p.value : p.value)}
          </b>
        </div>
      ))}

      <div className="flex items-baseline pt-2.5 mt-1 border-t-2 border-ink">
        <b className="text-[13px] font-extrabold">{t('job_bill_total')}</b>
        <span className="ml-auto text-[20px] font-extrabold tabular-nums tracking-[-0.02em]"
              data-testid="job-bill-total">{fmtEur(gross)}</span>
      </div>
      {/* No net total is printed. The contract sum arrives gross from the
          accepted quote, which may be mixed-rate, so any net derived here
          would be a division by an assumed 20 % that the invoice itself would
          then contradict. The invoice document does that breakdown properly. */}
      <p className="text-[11px] text-ink-faint text-right" data-testid="job-bill-gross-note">
        {t('job_bill_gross_note')}
      </p>

      <button type="button" onClick={onOpen} data-testid="job-bill-open" disabled={gross <= 0}
              className="w-full min-h-[46px] rounded-xl bg-teal text-paper text-[13.5px] font-extrabold
                         mt-3 disabled:opacity-40 flex items-center justify-center gap-2">
        <Receipt size={16} />
        {live.length ? t('job_bill_final') : t('job_bill_create')}
      </button>
      {gross <= 0 && (
        <p className="text-[11.5px] text-ink-faint text-center mt-2" data-testid="job-bill-nothing">
          {t('job_bill_nothing')}
        </p>
      )}
    </div>
  );
}
