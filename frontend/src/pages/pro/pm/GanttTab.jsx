import React, { useEffect, useRef, useState } from 'react';
import api from '../../../api/client';
import { Loader2, CalendarDays, AlertCircle, Users, Link2 } from 'lucide-react';
import Gantt from 'frappe-gantt';
import '../../../vendor/frappe-gantt.css';

const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

export default function GanttTab({ projectId, t }) {
  const containerRef = useRef(null);
  const ganttRef = useRef(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('Week');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/pm/projects/${projectId}/tasks`);
      setTasks(data.tasks || []);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Map our tasks → frappe-gantt format. Fall back to spreading any
  // un-dated tasks across the next 30 days so the timeline isn't empty.
  useEffect(() => {
    if (loading || !containerRef.current) return;
    // Clear previous Gantt
    containerRef.current.innerHTML = '';
    ganttRef.current = null;

    if (tasks.length === 0) return;

    const today = new Date();
    const fallbackStart = new Date(today);
    const gTasks = tasks.map((tk, i) => {
      const start = tk.start_at
        ? new Date(tk.start_at)
        : (() => { const d = new Date(fallbackStart); d.setDate(today.getDate() + i * 2); return d; })();
      const end = tk.due_at
        ? new Date(tk.due_at)
        : (() => { const d = new Date(start); d.setDate(start.getDate() + 2); return d; })();
      return {
        id: tk.id,
        name: tk.title,
        start: isoDay(start),
        end: isoDay(end),
        progress: tk.column === 'done' ? 100 : tk.column === 'doing' ? 50 : 0,
        custom_class: tk.column === 'done' ? 'bar-done' : tk.column === 'doing' ? 'bar-doing' : 'bar-todo',
      };
    });

    try {
      ganttRef.current = new Gantt(containerRef.current, gTasks, {
        view_mode: viewMode,
        bar_height: 22,
        bar_corner_radius: 4,
        padding: 16,
        date_format: 'YYYY-MM-DD',
        custom_popup_html: (task) => `
          <div class="gantt-popup">
            <strong>${task.name}</strong>
            <p>${task.start} → ${task.end}</p>
            <p>Progress: ${task.progress}%</p>
          </div>
        `,
        on_date_change: async (task, start, end) => {
          // Persist the new dates back to MongoDB
          try {
            await api.patch(`/api/pm/projects/${projectId}/tasks/${task.id}`, {
              start_at: new Date(start).toISOString(),
              due_at: new Date(end).toISOString(),
            });
          } catch (e) { console.error('failed to save date', e); }
        },
      });
    } catch (e) {
      console.error('Gantt render failed', e);
    }
  }, [tasks, loading, viewMode, projectId]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="text-teal animate-spin" /></div>;

  return (
    <div className="space-y-4" data-testid="pm-gantt-tab">
      <div className="card-lg flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-teal" />
          <p className="text-sm font-headings font-bold text-ink">{t('pm_gantt_title')}</p>
        </div>
        <div className="flex items-center gap-1">
          {['Quarter Day', 'Half Day', 'Day', 'Week', 'Month'].map((v) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`text-[11px] px-2 py-1 rounded-[8px] transition-colors ${viewMode === v ? 'bg-teal text-paper' : 'text-ink-muted hover:bg-cream-deep'}`}
              data-testid={`pm-gantt-view-${v.replace(/\s/g, '').toLowerCase()}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="card-lg flex items-center gap-3" data-testid="pm-gantt-empty">
          <AlertCircle size={18} className="text-amber-deep" />
          <p className="text-sm text-ink-muted">{t('pm_gantt_empty')}</p>
        </div>
      ) : (
        <div className="card-lg overflow-x-auto">
          <p className="text-[11px] text-ink-muted italic mb-2">{t('pm_gantt_hint')}</p>
          <div ref={containerRef} className="gantt-target" />
        </div>
      )}

      {tasks.length > 0 && (
        <CrewDependencyEditor projectId={projectId} tasks={tasks} reload={load} t={t} />
      )}

      {/* Inline overrides for frappe-gantt colors so it matches our design system */}
      <style>{`
        .gantt .bar-todo .bar  { fill: #cbd5d3; }
        .gantt .bar-doing .bar { fill: #f5b942; }
        .gantt .bar-done .bar  { fill: #18a999; }
        .gantt .bar-progress  { fill: rgba(255,255,255,0.6); }
        .gantt-popup {
          background: #1f2937;
          color: #fff;
          padding: 10px 12px;
          border-radius: 8px;
          font-family: inherit;
          font-size: 12px;
          line-height: 1.4;
        }
        .gantt-popup strong { font-weight: 700; display: block; margin-bottom: 4px; }
        .gantt-popup p { margin: 2px 0; }
        .gantt .grid-header  { fill: #faf8f4; }
        .gantt .lower-text, .gantt .upper-text { fill: #5a5a5a; font-size: 11px; }
        .gantt .row-line, .gantt .tick { stroke: #e5e0d6; }
      `}</style>
    </div>
  );
}

/* ── Crew assignment + task dependencies (drives smart auto-shift) ───────── */
function CrewDependencyEditor({ projectId, tasks, reload, t }) {
  const [savingId, setSavingId] = useState(null);
  const patch = async (id, body) => {
    setSavingId(id);
    try {
      await api.patch(`/api/pm/projects/${projectId}/tasks/${id}`, body);
      await reload();
    } finally { setSavingId(null); }
  };
  return (
    <div className="card-lg" data-testid="pm-crew-editor">
      <p className="text-sm font-headings font-bold text-ink flex items-center gap-2 mb-1">
        <Users size={16} className="text-teal" /> {t('pm_crew_title')}
      </p>
      <p className="text-[11px] text-ink-muted mb-3">{t('pm_crew_help')}</p>
      <div className="space-y-2">
        {tasks.map((tk) => (
          <div key={tk.id} className="grid grid-cols-12 gap-2 items-center" data-testid={`pm-crew-row-${tk.id}`}>
            <p className="col-span-12 sm:col-span-5 text-sm text-ink truncate flex items-center gap-1">
              {savingId === tk.id && <Loader2 size={11} className="animate-spin text-teal" />}{tk.title}
            </p>
            <input
              className="sm-input text-xs col-span-6 sm:col-span-3"
              placeholder={t('pm_crew_assignee')}
              defaultValue={tk.assignee || ''}
              onBlur={(e) => { if ((e.target.value || '') !== (tk.assignee || '')) patch(tk.id, { assignee: e.target.value }); }}
              data-testid={`pm-crew-assignee-${tk.id}`}
            />
            <select
              className="sm-input text-xs col-span-6 sm:col-span-4"
              value={tk.depends_on || ''}
              onChange={(e) => patch(tk.id, { depends_on: e.target.value })}
              data-testid={`pm-crew-depends-${tk.id}`}
            >
              <option value="">{t('pm_crew_no_dep')}</option>
              {tasks.filter((o) => o.id !== tk.id).map((o) => (
                <option key={o.id} value={o.id}>{t('pm_crew_after')}: {o.title}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
