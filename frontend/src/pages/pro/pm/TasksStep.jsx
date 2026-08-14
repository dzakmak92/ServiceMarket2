import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Play, Plus } from 'lucide-react';
import api from '../../../api/client';

/**
 * Step 3 — the work, as one list you tick off.
 *
 * What it replaces called itself a board and, at 390 px, was not one: the
 * three columns stacked, so you never saw two of them at once, which is the
 * only thing a board is for. Nine tasks cost 1666 px. Each card gave a whole
 * row to "‹ Zu erledigen · In Arbeit ›", each column carried its own "new
 * task" field — three copies of the same control — and nothing anywhere said
 * four of nine were done.
 *
 * Now: one list, 44 px a row, sorted by state, with the count in the step
 * header and a bar under it. The board is still there for anyone who wants
 * it, on its own tab; this is the view for somebody standing in the room.
 *
 * The one thing the chosen design did not specify is how a task reaches
 * "doing" at all, since the box only says done or not. Tapping the box marks
 * done; tapping the row starts and pauses. Both are stated on the row rather
 * than left to be discovered — the running row says so in words.
 */

const COLS = ['todo', 'doing', 'done'];

export default function TasksStep({ jobId, t, onCount }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/jobs/${jobId}/tasks`);
      setTasks(data.tasks || []);
    } finally { setLoading(false); }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const g = { todo: [], doing: [], done: [] };
    for (const tk of tasks) (g[tk.column_key] || g.todo).push(tk);
    for (const k of COLS) g[k].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return g;
  }, [tasks]);

  const total = tasks.length;
  const done = groups.done.length;
  useEffect(() => { onCount?.({ done, total }); }, [done, total, onCount]);

  /* Optimistic, because the alternative on a phone with one bar of signal is
     a checkbox that does nothing for two seconds and then does. A failure
     reloads rather than guessing what the server has. */
  const move = async (task, column_key) => {
    if (busy) return;
    setBusy(task.id);
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, column_key } : x)));
    try { await api.patch(`/api/jobs/${jobId}/tasks/${task.id}`, { column_key }); }
    catch { await load(); } finally { setBusy(null); }
  };

  const add = async () => {
    const v = title.trim();
    if (!v) return;
    setAdding(true);
    try {
      await api.post(`/api/jobs/${jobId}/tasks`, { title: v, column_key: 'todo' });
      setTitle('');
      await load();
    } finally { setAdding(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 size={18} className="text-teal animate-spin" /></div>;
  }

  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div data-testid="job-tasks">
      {total > 0 && (
        <div className="h-1.5 rounded-full bg-cream-deep overflow-hidden mb-3" aria-hidden="true">
          <i className="block h-full bg-green-pos" style={{ width: `${pct}%` }} />
        </div>
      )}

      {[...groups.doing, ...groups.todo].map((tk) => (
        <Row key={tk.id} task={tk} t={t} busy={busy === tk.id}
             onDone={() => move(tk, 'done')}
             onToggleRun={() => move(tk, tk.column_key === 'doing' ? 'todo' : 'doing')} />
      ))}

      {groups.done.length > 0 && (
        <>
          <p className="flex items-baseline mt-3 mb-1.5 text-[10px] font-extrabold uppercase
                        tracking-[0.06em] text-ink-muted">
            {t('job_tasks_done')}
            <b className="ml-auto tabular-nums text-ink-soft">{groups.done.length}</b>
          </p>
          {groups.done.map((tk) => (
            <Row key={tk.id} task={tk} t={t} busy={busy === tk.id} done
                 onDone={() => move(tk, 'todo')} />
          ))}
        </>
      )}

      {total === 0 && (
        <p className="text-[12.5px] text-ink-faint text-center py-2" data-testid="job-tasks-empty">
          {t('job_tasks_empty')}
        </p>
      )}

      <div className="flex items-center gap-2 mt-2 rounded-xl border-[1.5px] border-dashed
                      border-step-now-line px-2.5 min-h-[46px]">
        <Plus size={16} className="text-teal shrink-0" aria-hidden="true" />
        <input value={title} onChange={(e) => setTitle(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && add()}
               placeholder={t('job_tasks_add')} data-testid="job-tasks-input"
               className="flex-1 bg-transparent text-[13px] outline-none min-w-0" />
        <button type="button" onClick={add} disabled={!title.trim() || adding}
                data-testid="job-tasks-add"
                className="text-[12.5px] font-extrabold text-teal-deep disabled:opacity-40 px-1">
          {adding ? <Loader2 size={14} className="animate-spin" /> : t('job_tasks_save')}
        </button>
      </div>
    </div>
  );
}

function Row({ task, t, busy, done, onDone, onToggleRun }) {
  const running = task.column_key === 'doing';
  return (
    <div data-testid={`job-task-${task.id}`} data-col={task.column_key}
         className="flex items-center gap-2.5 rounded-xl border border-sm-border bg-paper
                    px-3 mb-1.5 min-h-[46px]">
      <button type="button" onClick={onDone} disabled={busy}
              data-testid={`job-task-${task.id}-box`}
              aria-label={done ? t('job_tasks_undo') : t('job_tasks_done_do')}
              className={`w-[22px] h-[22px] rounded-md border-2 shrink-0 grid place-items-center
                          ${done ? 'bg-green-pos border-green-pos text-paper'
                    : running ? 'border-amber bg-step-run text-amber-text' : 'border-step-now-line'}`}>
        {busy ? <Loader2 size={12} className="animate-spin" />
          : done ? <Check size={14} strokeWidth={3} />
            : running ? <Play size={10} fill="currentColor" strokeWidth={0} /> : null}
      </button>

      <button type="button" onClick={onToggleRun} disabled={done || busy}
              data-testid={`job-task-${task.id}-run`}
              className="flex-1 min-w-0 text-left py-2 disabled:cursor-default">
        <span className={`block text-[13px] font-semibold truncate
                          ${done ? 'text-ink-faint line-through' : 'text-ink'}`}>
          {task.title}
        </span>
      </button>

      {running && (
        <span className="shrink-0 rounded-full bg-step-run px-2 py-[3px] text-[9px] font-extrabold
                         uppercase tracking-[0.04em] text-amber-text">{t('job_tasks_running')}</span>
      )}
      {!running && !done && (
        <span className="shrink-0 text-[11.5px] font-extrabold text-amber-text">
          {t('job_tasks_start')}
        </span>
      )}
    </div>
  );
}
