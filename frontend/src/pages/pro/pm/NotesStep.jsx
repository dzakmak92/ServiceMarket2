import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import api from '../../../api/client';
import { fmtEur, moneyLocale } from '../../../utils/money';

/**
 * Step 5 — the site diary and the extras that come out of it.
 *
 * The tab it replaces spent 470 px before the first entry: a total, a timer
 * and an always-open form. Then each entry printed "14.8.2026, 00:00:00 ·
 * 4.5 h" and a bin — the date twice over, and *not the note*, which is the
 * only part anybody writes it for. The total said 0.0 h above entries of 4.5
 * and 7.5 because the endpoint never sent one.
 *
 * Now the content comes first and the two buttons sit at the foot, where a
 * thumb already is. A Nachtrag is in the same stream as the notes rather than
 * in a separate tab, because it is written on the day it is agreed and reads
 * as part of the story of the job — it just carries money, so it is tinted
 * and stamped with where it stands.
 */

const CO_TONE = {
  draft: 'bg-cream-deep text-ink-muted',
  sent: 'bg-step-run text-amber-text',
  approved: 'bg-step-done text-green-text',
  rejected: 'bg-red-warn/10 text-red-text',
  invoiced: 'bg-step-now text-teal-deep',
};

export default function NotesStep({ jobId, t, onCount }) {
  const [entries, setEntries] = useState([]);
  const [hours, setHours] = useState(0);
  const [cos, setCos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);       // 'note' | 'co' | null
  const [note, setNote] = useState({ text: '', hours: '' });
  const [co, setCo] = useState({ title: '', amount: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([
        api.get(`/api/jobs/${jobId}/diary`),
        api.get(`/api/jobs/${jobId}/change-orders`).catch(() => ({ data: [] })),
      ]);
      setEntries(d.data.entries || []);
      setHours(d.data.total_hours || 0);
      setCos(Array.isArray(c.data) ? c.data : (c.data?.change_orders || []));
    } finally { setLoading(false); }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { onCount?.({ hours, cos: cos.length }); }, [hours, cos.length, onCount]);

  /* The column is `text`. Posting `note` sent a field the model does not
     declare, Pydantic dropped it without complaint, and every entry written
     from here was saved blank — with its hours, which is what made it look
     like it had worked. */
  const saveNote = async () => {
    if (!note.text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/jobs/${jobId}/diary`, {
        text: note.text.trim(),
        ...(note.hours === '' ? {} : { hours: Number(note.hours) }),
      });
      setNote({ text: '', hours: '' }); setForm(null); await load();
    } finally { setBusy(false); }
  };

  const saveCo = async () => {
    if (!co.title.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/jobs/${jobId}/change-orders`, {
        title: co.title.trim(), vat_rate: 20,
        items: [{ description: co.title.trim(), qty: 1, unit_net: Number(co.amount) || 0 }],
      });
      setCo({ title: '', amount: '' }); setForm(null); await load();
    } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 size={18} className="text-teal animate-spin" /></div>;
  }

  /* Notes and Nachträge in one stream, newest first. They are the same story
     told on the same days; splitting them put the reason for an extra in one
     list and the extra itself in another. */
  const stream = [
    ...cos.map((c) => ({ kind: 'co', at: c.created_at, row: c })),
    ...entries.map((e) => ({ kind: 'note', at: e.entry_date || e.created_at, row: e })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  const day = (v) => (v ? new Date(v).toLocaleDateString(moneyLocale(),
    { day: 'numeric', month: 'short' }) : '');

  return (
    <div data-testid="job-notes">
      {stream.length === 0 && (
        <p className="text-[12.5px] text-ink-faint text-center py-2" data-testid="job-notes-empty">
          {t('job_notes_empty')}
        </p>
      )}

      {stream.map((it) => (it.kind === 'co' ? (
        <div key={`co-${it.row.id}`} data-testid={`job-co-${it.row.id}`}
             className="rounded-xl border border-step-run-line bg-step-run-soft px-3 py-2.5 mb-1.5">
          <p className="flex items-baseline gap-2 text-[10.5px] font-bold text-ink-faint">
            {day(it.at)} · {t('job_notes_co')}
            <span className={`rounded-full px-2 py-[2px] text-[9px] font-extrabold uppercase
                              tracking-[0.04em] ${CO_TONE[it.row.status] || CO_TONE.draft}`}>
              {t(`job_co_${it.row.status}`)}
            </span>
            {/* `net_amount` is what the column is called. Reading net_total /
                gross_total off it — neither of which exists on a change order
                — printed every Nachtrag as € 0,00. */}
            <b className="ml-auto tabular-nums text-amber-text"
               data-testid={`job-co-${it.row.id}-amount`}>
              {fmtEur(it.row.net_amount ?? 0)}
            </b>
          </p>
          <p className="text-[12.5px] mt-1 leading-snug">{it.row.title}</p>
        </div>
      ) : (
        <div key={`n-${it.row.id}`} data-testid={`job-note-${it.row.id}`}
             className="rounded-xl border border-sm-border bg-paper px-3 py-2.5 mb-1.5">
          <p className="flex items-baseline gap-2 text-[10.5px] font-bold text-ink-faint">
            {day(it.at)}
            {it.row.hours ? (
              <b className="ml-auto tabular-nums text-ink-soft">
                {t('job_notes_h', { h: Number(it.row.hours).toFixed(1).replace('.', ',') })}
              </b>
            ) : null}
          </p>
          {/* The note itself. The row it replaces printed the date and the
              hours and left this out entirely.

              An entry with hours and nothing written is legitimate — a day
              worked with nothing to report — and there are older rows with no
              text at all, from when this form posted the wrong field name.
              Both render as a card with a date and no content unless the
              blank is given words. */}
          <p className={`text-[12.5px] mt-1 leading-snug whitespace-pre-wrap
                         ${it.row.text ? '' : 'text-ink-faint'}`}
             data-testid={`job-note-${it.row.id}-text`}>
            {it.row.text || t('job_notes_blank')}
          </p>
        </div>
      )))}

      {form === 'note' && (
        <div className="rounded-xl border-2 border-teal-deep bg-paper p-3 mt-2" data-testid="job-note-form">
          <textarea value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })}
                    rows={3} placeholder={t('job_notes_ph')} data-testid="job-note-text"
                    className="w-full bg-transparent text-[13px] outline-none resize-none" />
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11.5px] font-bold text-ink-muted">{t('job_notes_hours')}</span>
            <input value={note.hours} inputMode="decimal" data-testid="job-note-hours"
                   onChange={(e) => setNote({ ...note, hours: e.target.value })}
                   className="w-[70px] rounded-lg border border-step-now-line bg-paper px-2 py-1.5
                              text-[13px] font-extrabold tabular-nums outline-none" />
            <Save onCancel={() => setForm(null)} onSave={saveNote} busy={busy} t={t}
                  testid="job-note-save" />
          </div>
        </div>
      )}

      {form === 'co' && (
        <div className="rounded-xl border-2 border-amber bg-paper p-3 mt-2" data-testid="job-co-form">
          <input value={co.title} onChange={(e) => setCo({ ...co, title: e.target.value })}
                 placeholder={t('job_co_ph')} data-testid="job-co-title"
                 className="w-full bg-transparent text-[13px] outline-none min-h-[36px]" />
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11.5px] font-bold text-ink-muted">{t('job_co_amount')}</span>
            <input value={co.amount} inputMode="decimal" data-testid="job-co-amount"
                   onChange={(e) => setCo({ ...co, amount: e.target.value })}
                   className="w-[92px] rounded-lg border border-step-run-line bg-paper px-2 py-1.5
                              text-[13px] font-extrabold tabular-nums outline-none" />
            <Save onCancel={() => setForm(null)} onSave={saveCo} busy={busy} t={t}
                  testid="job-co-save" />
          </div>
        </div>
      )}

      {/* The buttons at the foot, after the content — not 470 px before it. */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-sm-border">
        <button type="button" onClick={() => setForm(form === 'note' ? null : 'note')}
                data-testid="job-notes-new"
                className="flex-1 min-h-[44px] rounded-xl bg-teal-deep text-paper text-[12.5px]
                           font-extrabold flex items-center justify-center gap-1.5">
          <Plus size={16} /> {t('job_notes_new')}
        </button>
        <button type="button" onClick={() => setForm(form === 'co' ? null : 'co')}
                data-testid="job-co-new"
                className="flex-1 min-h-[44px] rounded-xl bg-amber text-on-amber text-[12.5px]
                           font-extrabold flex items-center justify-center gap-1.5">
          <Plus size={16} /> {t('job_co_new')}
        </button>
      </div>
    </div>
  );
}

function Save({ onCancel, onSave, busy, t, testid }) {
  return (
    <span className="ml-auto flex gap-2">
      <button type="button" onClick={onCancel}
              className="min-h-[38px] px-3 rounded-lg text-[12px] font-extrabold text-ink-muted">
        {t('ui_cancel')}
      </button>
      <button type="button" onClick={onSave} disabled={busy} data-testid={testid}
              className="min-h-[38px] px-4 rounded-lg bg-teal-deep text-paper text-[12.5px]
                         font-extrabold disabled:opacity-60 flex items-center gap-1.5">
        {busy && <Loader2 size={13} className="animate-spin" />}{t('ui_save')}
      </button>
    </span>
  );
}
