import React, { useCallback, useEffect, useState } from 'react';
import { Check, ChevronRight, Loader2, Plus, ScanBarcode } from 'lucide-react';
import api from '../../../api/client';
import { fmtEur } from '../../../utils/money';

/**
 * Step 4 — what the job needs, as a list you buy your way down.
 *
 * The tab it replaces gave every position a card 275 px tall with each field
 * on its own line — quantity, planned, actual, supplier, a photo well and a
 * bin — so five positions cost 2584 px, and an always-open form sat above
 * them taking another 230. The three figures at the top read € 0,00 because
 * the endpoint never sent any.
 *
 * Now a row is 46 px and says the three things you check while standing in a
 * merchant's aisle: what it is, how much of it, what it costs. The box on the
 * left is the errand — ticking it records the buy. Everything else about a
 * position (photo, barcode, brand, supplier, delete) lives behind the row,
 * because it is filled in once and read almost never.
 *
 * Two sections, not one list: what is still to get, and what is already got.
 * The heading of the first carries the money still to spend, which is the
 * figure you want before driving anywhere.
 */

export default function MaterialsStep({ jobId, t, onCount }) {
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [draft, setDraft] = useState({ name: '', qty: 1, unit: 'Stk', planned_cost: '' });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/jobs/${jobId}/materials`);
      setItems(data.materials || []);
      setTotals(data.totals || null);
    } finally { setLoading(false); }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { onCount?.(totals); }, [totals, onCount]);

  /* Ticking the box books the planned price as the actual one. That is the
     common case — you buy what you planned at the price you planned — and the
     row stays open underneath for the times it was not. Un-ticking clears the
     actual rather than writing a zero: nothing bought is not nought spent. */
  const toggle = async (m) => {
    if (busy) return;
    setBusy(m.id);
    const bought = m.actual_cost !== null && m.actual_cost !== undefined;
    try {
      await api.patch(`/api/jobs/${jobId}/materials/${m.id}`,
        { actual_cost: bought ? null : Number(m.planned_cost || 0) });
      await load();
    } finally { setBusy(null); }
  };

  const setActual = async (m, value) => {
    setBusy(m.id);
    try {
      await api.patch(`/api/jobs/${jobId}/materials/${m.id}`,
        { actual_cost: value === '' ? null : Number(value) });
      await load();
    } finally { setBusy(null); }
  };

  const remove = async (m) => {
    setBusy(m.id);
    try { await api.delete(`/api/jobs/${jobId}/materials/${m.id}`); await load(); }
    finally { setBusy(null); setOpenId(null); }
  };

  const add = async () => {
    if (!draft.name.trim()) return;
    setAdding(true);
    try {
      await api.post(`/api/jobs/${jobId}/materials`, {
        name: draft.name.trim(), qty: Number(draft.qty) || 1, unit: draft.unit || 'Stk',
        planned_cost: Number(draft.planned_cost) || 0,
      });
      setDraft({ name: '', qty: 1, unit: 'Stk', planned_cost: '' });
      await load();
    } finally { setAdding(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 size={18} className="text-teal animate-spin" /></div>;
  }

  const got = items.filter((m) => m.actual_cost !== null && m.actual_cost !== undefined);
  const todo = items.filter((m) => m.actual_cost === null || m.actual_cost === undefined);
  const pct = items.length ? Math.round((got.length / items.length) * 100) : 0;

  return (
    <div data-testid="job-mats">
      {items.length > 0 && (
        <div className="h-1.5 rounded-full bg-cream-deep overflow-hidden mb-3" aria-hidden="true">
          <i className="block h-full bg-teal" style={{ width: `${pct}%` }} />
        </div>
      )}

      <Head text={t('job_mats_todo')} value={totals ? fmtEur(totals.planned_open) : null}
            testid="job-mats-head-todo" />
      {todo.map((m) => (
        <Row key={m.id} m={m} t={t} busy={busy === m.id} open={openId === m.id}
             onToggle={() => toggle(m)} onOpen={() => setOpenId(openId === m.id ? null : m.id)}
             onActual={(v) => setActual(m, v)} onDelete={() => remove(m)} />
      ))}
      {todo.length === 0 && (
        <p className="text-[12.5px] text-ink-faint py-1" data-testid="job-mats-todo-empty">
          {items.length ? t('job_mats_all_got') : t('job_mats_empty')}
        </p>
      )}

      {got.length > 0 && (
        <>
          <Head text={t('job_mats_got')} value={totals ? fmtEur(totals.actual) : null}
                testid="job-mats-head-got" />
          {got.map((m) => (
            <Row key={m.id} m={m} t={t} got busy={busy === m.id} open={openId === m.id}
                 onToggle={() => toggle(m)} onOpen={() => setOpenId(openId === m.id ? null : m.id)}
                 onActual={(v) => setActual(m, v)} onDelete={() => remove(m)} />
          ))}
        </>
      )}

      {totals && got.length > 0 && totals.variance !== 0 && (
        <p className="text-[11.5px] text-center mt-2" data-testid="job-mats-variance">
          <span className={totals.variance > 0 ? 'text-red-text' : 'text-green-text'}>
            {t(totals.variance > 0 ? 'job_mats_over' : 'job_mats_under',
              { v: fmtEur(Math.abs(totals.variance)) })}
          </span>
        </p>
      )}

      <div className="rounded-xl border-[1.5px] border-dashed border-step-now-line p-2.5 mt-3">
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
               placeholder={t('job_mats_name')} data-testid="job-mats-name"
               className="w-full bg-transparent text-[13px] outline-none min-h-[36px]" />
        <div className="flex gap-2 mt-1">
          <input value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
                 inputMode="decimal" placeholder={t('job_mats_qty')} data-testid="job-mats-qty"
                 className="w-[64px] rounded-lg border border-sm-border bg-paper px-2 py-2
                            text-[13px] tabular-nums outline-none" />
          <input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                 className="w-[68px] rounded-lg border border-sm-border bg-paper px-2 py-2
                            text-[13px] outline-none" aria-label={t('job_mats_unit')} />
          <input value={draft.planned_cost} inputMode="decimal"
                 onChange={(e) => setDraft({ ...draft, planned_cost: e.target.value })}
                 placeholder={t('job_mats_planned')} data-testid="job-mats-planned"
                 className="flex-1 min-w-0 rounded-lg border border-sm-border bg-paper px-2 py-2
                            text-[13px] tabular-nums outline-none" />
        </div>
        <button type="button" onClick={add} disabled={!draft.name.trim() || adding}
                data-testid="job-mats-add"
                className="w-full min-h-[44px] rounded-xl bg-teal-deep text-paper text-[13px]
                           font-extrabold mt-2 disabled:opacity-40 flex items-center
                           justify-center gap-2">
          {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />}
          {t('job_mats_add')}
        </button>
      </div>
    </div>
  );
}

function Head({ text, value, testid }) {
  return (
    <p className="flex items-baseline mt-3 first:mt-0 mb-1.5 text-[10px] font-extrabold uppercase
                  tracking-[0.06em] text-ink-muted" data-testid={testid}>
      {text}
      {value && <b className="ml-auto tabular-nums text-ink-soft">{value}</b>}
    </p>
  );
}

function Row({ m, t, got, busy, open, onToggle, onOpen, onActual, onDelete }) {
  const qty = Number(m.qty || 0);
  const line = got ? Number(m.actual_cost || 0) * qty : Number(m.planned_cost || 0) * qty;
  return (
    <div className={`rounded-xl border border-sm-border bg-paper mb-1.5 ${got ? 'opacity-[0.72]' : ''}`}
         data-testid={`job-mat-${m.id}`} data-got={got ? 'yes' : 'no'}>
      <div className="flex items-center gap-2.5 px-3 min-h-[46px]">
        <button type="button" onClick={onToggle} disabled={busy}
                data-testid={`job-mat-${m.id}-box`}
                aria-label={got ? t('job_mats_untick') : t('job_mats_tick')}
                className={`w-[22px] h-[22px] rounded-md border-2 shrink-0 grid place-items-center
                            ${got ? 'bg-green-pos border-green-pos text-paper' : 'border-step-now-line'}`}>
          {busy ? <Loader2 size={12} className="animate-spin" />
            : got ? <Check size={14} strokeWidth={3} /> : null}
        </button>
        <button type="button" onClick={onOpen} data-testid={`job-mat-${m.id}-open`}
                className="flex-1 min-w-0 text-left py-2">
          <span className="block text-[12.5px] font-bold text-ink truncate">{m.name}</span>
          <span className="block text-[10.5px] text-ink-faint tabular-nums truncate">
            {qty} {m.unit}{m.supplier ? ` · ${m.supplier}` : ''}
          </span>
        </button>
        <span className="shrink-0 text-right">
          <b className="block text-[12.5px] font-extrabold tabular-nums">{fmtEur(line)}</b>
          {!got && (
            <em className="block not-italic text-[9.5px] font-bold text-ink-faint">
              {t('job_mats_planned_short')}
            </em>
          )}
        </span>
        <ChevronRight size={15} className="text-ink-faint shrink-0" aria-hidden="true" />
      </div>

      {open && (
        <div className="border-t border-sm-border px-3 py-2.5" data-testid={`job-mat-${m.id}-sheet`}>
          <label className="flex items-center gap-2 text-[11.5px] text-ink-muted font-bold">
            {t('job_mats_actual')}
            <input defaultValue={m.actual_cost ?? ''} inputMode="decimal"
                   onBlur={(e) => onActual(e.target.value)}
                   data-testid={`job-mat-${m.id}-actual`}
                   className="ml-auto w-[92px] rounded-lg border border-step-now-line bg-paper
                              px-2 py-1.5 text-[13px] font-extrabold tabular-nums text-right outline-none" />
          </label>
          <p className="text-[11px] text-ink-faint mt-2 leading-relaxed">
            {[m.brand, m.barcode].filter(Boolean).join(' · ') || t('job_mats_no_extra')}
          </p>
          <div className="flex gap-2 mt-2">
            <span className="flex-1 flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl
                             border-[1.5px] border-step-now-line text-[12px] font-extrabold
                             text-teal-deep">
              <ScanBarcode size={15} /> {t('job_mats_scan')}
            </span>
            <button type="button" onClick={onDelete} data-testid={`job-mat-${m.id}-delete`}
                    className="min-h-[40px] px-3 rounded-xl border-[1.5px] border-red-warn/40
                               text-[12px] font-extrabold text-red-text">
              {t('ui_delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
