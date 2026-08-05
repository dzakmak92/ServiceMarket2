import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../api/client';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { Plus, Trash2, Loader2, FileTextIcon, Sparkles, BookCopy, ChevronLeft, ChevronRight, Save, Boxes, Receipt } from 'lucide-react';

const COLUMNS = [
  { key: 'todo', labelKey: 'pm_col_todo', cls: 'border-cream-deep' },
  { key: 'doing', labelKey: 'pm_col_doing', cls: 'border-amber' },
  { key: 'done', labelKey: 'pm_col_done', cls: 'border-green-pos' },
];
const ORDER = ['todo', 'doing', 'done'];

export default function KanbanTab({ projectId, t }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState({ todo: '', doing: '', done: '' });
  const [movingId, setMovingId] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/jobs/${projectId}/tasks`);
      setTasks(data.tasks || []);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Group tasks by column with stable ordering
  const byColumn = useMemo(() => {
    const out = { todo: [], doing: [], done: [] };
    for (const tk of tasks) (out[tk.column_key] || out.todo).push(tk);
    for (const k of Object.keys(out)) out[k].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return out;
  }, [tasks]);

  const addTask = async (column) => {
    const title = (newTitle[column] || '').trim();
    if (!title) return;
    await api.post(`/api/jobs/${projectId}/tasks`, { title, column_key: column });
    setNewTitle((s) => ({ ...s, [column]: '' }));
    await load();
  };

  const deleteTask = async (taskId) => {
    setTasks((prev) => prev.filter((tk) => tk.id !== taskId));
    try {
      await api.delete(`/api/jobs/${projectId}/tasks/${taskId}`);
    } catch (e) { console.error('delete failed', e); load(); }
  };

  // One-tap move between columns — far more reliable than drag-and-drop,
  // especially on touch devices. dir = -1 (left) or +1 (right).
  const moveTask = async (task, dir) => {
    const target = ORDER[ORDER.indexOf(task.column_key) + dir];
    if (!target) return;
    setMovingId(task.id);
    setTasks((prev) => prev.map((tk) => (tk.id === task.id ? { ...tk, column_key: target } : tk))); // optimistic
    try {
      await api.patch(`/api/jobs/${projectId}/tasks/${task.id}`, { column_key: target });
    } catch (e) {
      console.error('move failed', e);
      load(); // revert
    } finally { setMovingId(null); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="text-teal animate-spin" /></div>;

  return (
    <div data-testid="pm-kanban">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
        <p className="text-xs text-ink-muted italic">{t('pm_kanban_dnd_hint')}</p>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={() => setSaveTplOpen(true)}
            className="btn-ghost text-xs"
            data-testid="pm-save-template-btn"
          >
            <Save size={12} /> {t('pm_save_template')}
          </button>
          <button
            onClick={() => setTemplatesOpen(true)}
            className="btn-ghost text-xs"
            data-testid="pm-apply-template-btn"
          >
            <BookCopy size={12} /> {t('pm_apply_template')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {COLUMNS.map(({ key, labelKey, cls }, colIdx) => (
          <div key={key} className={`card-lg border-t-4 ${cls}`} data-testid={`pm-kanban-col-${key}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase font-bold tracking-wider text-ink-muted">{t(labelKey)}</p>
              <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-cream-deep text-ink-muted">{byColumn[key].length}</span>
            </div>

            <div className="space-y-2 mb-3 min-h-[40px]">
              {byColumn[key].length === 0 ? (
                <p className="text-xs text-ink-muted py-4 text-center">{t('pm_task_empty')}</p>
              ) : byColumn[key].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  colIdx={colIdx}
                  moving={movingId === task.id}
                  onMove={moveTask}
                  onDelete={deleteTask}
                  t={t}
                />
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newTitle[key]}
                onChange={(e) => setNewTitle((s) => ({ ...s, [key]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && addTask(key)}
                placeholder={t('pm_task_placeholder')}
                className="sm-input text-xs flex-1"
                data-testid={`pm-task-input-${key}`}
              />
              <button
                onClick={() => addTask(key)}
                className="btn-ghost text-xs px-2"
                data-testid={`pm-task-add-${key}`}
                aria-label={t('pm_task_add')}
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {templatesOpen && (
        <TemplatesModal projectId={projectId} onClose={() => setTemplatesOpen(false)} onApplied={() => { setTemplatesOpen(false); load(); }} t={t} />
      )}
      {saveTplOpen && (
        <SaveTemplateModal projectId={projectId} onClose={() => setSaveTplOpen(false)} t={t} />
      )}
    </div>
  );
}

function TaskCard({ task, colIdx, moving, onMove, onDelete, t }) {
  const canLeft = colIdx > 0;
  const canRight = colIdx < COLUMNS.length - 1;
  return (
    <div className="rounded-[10px] border border-sm-border bg-paper p-2.5" data-testid={`pm-task-${task.id}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink flex-1 min-w-0 break-words">{task.title}</p>
        <button
          onClick={() => onDelete(task.id)}
          className="text-ink-muted hover:text-red-warn flex-shrink-0"
          aria-label="delete"
          data-testid={`pm-task-delete-${task.id}`}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-sm-border/60 min-h-[20px]">
        {canLeft ? (
          <button
            onClick={() => onMove(task, -1)}
            disabled={moving}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-ink-muted hover:text-teal disabled:opacity-40 transition-colors"
            data-testid={`pm-task-moveleft-${task.id}`}
            aria-label={t('pm_task_move_left')}
            title={t('pm_task_move_left')}
          >
            <ChevronLeft size={14} /> {t(COLUMNS[colIdx - 1].labelKey)}
          </button>
        ) : <span />}
        {moving && <Loader2 size={12} className="animate-spin text-teal" />}
        {canRight ? (
          <button
            onClick={() => onMove(task, 1)}
            disabled={moving}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-ink-muted hover:text-teal disabled:opacity-40 transition-colors"
            data-testid={`pm-task-moveright-${task.id}`}
            aria-label={t('pm_task_move_right')}
            title={t('pm_task_move_right')}
          >
            {t(COLUMNS[colIdx + 1].labelKey)} <ChevronRight size={14} />
          </button>
        ) : <span />}
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// Templates modal — apply tasks + materials + milestone payments
// ────────────────────────────────────────
function TemplatesModal({ projectId, onClose, onApplied, t }) {
  useEscapeKey(true, onClose);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);
  const [baseAmounts, setBaseAmounts] = useState({});

  useEffect(() => {
    api.get('/api/pm/templates').then((r) => setTemplates(r.data.templates || [])).finally(() => setLoading(false));
  }, []);

  const hasPercentMilestones = (tpl) => (tpl.milestones || []).some((m) => m.percent && !m.amount_eur);

  const apply = async (tpl) => {
    setApplying(tpl.id);
    try {
      const base = Number(baseAmounts[tpl.id]) || 0;
      const { data } = await api.post(
        `/api/pm/templates/${encodeURIComponent(tpl.id)}/apply/${projectId}?base_amount=${base}`
      );
      const applied = data.applied || {};
      const parts = [`${applied.tasks || 0} ${t('pm_tab_kanban').toLowerCase()}`];
      if (applied.materials) parts.push(`${applied.materials} ${t('pm_tab_materials').toLowerCase()}`);
      toast.success(`${t('pm_template_applied')}: ${parts.join(' · ')}`);
      // Milestones come back computed but unwritten: the payment rail is the
      // last phase, and creating payment rows before it exists leaves orphans.
      if ((data.milestones || []).length) {
        toast.info(`${data.milestones.length} ${t('pm_milestones')} — ${t('pm_milestones_manual') || 'noch manuell anzulegen'}`);
      }
      onApplied();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
    } finally { setApplying(null); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-paper rounded-[14px] max-w-lg w-full p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="pm-templates-modal">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-teal" />
            <h3 className="font-headings font-bold text-ink text-lg">{t('pm_templates_title')}</h3>
          </div>
          <button onClick={onClose} className="btn-ghost text-xs">✕</button>
        </div>
        <p className="text-sm text-ink-muted mb-4">{t('pm_templates_subtitle')}</p>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="text-teal animate-spin" /></div>
        ) : (
          <ul className="space-y-2">
            {templates.map((tpl) => (
              <li key={tpl.id} className="rounded-[10px] border border-sm-border p-3" data-testid={`pm-template-${tpl.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-headings font-bold text-ink text-sm">{tpl.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-ink-muted flex-wrap mt-0.5">
                      <span className="inline-flex items-center gap-0.5"><FileTextIcon size={10} /> {tpl.tasks?.length || 0}</span>
                      {tpl.materials?.length > 0 && <span className="inline-flex items-center gap-0.5"><Boxes size={10} /> {tpl.materials.length}</span>}
                      {tpl.milestones?.length > 0 && <span className="inline-flex items-center gap-0.5"><Receipt size={10} /> {tpl.milestones.length}</span>}
                      {tpl.category && <span>· {tpl.category}</span>}
                    </div>
                  </div>
                  <button onClick={() => apply(tpl)} disabled={applying === tpl.id} className="btn-primary text-xs flex-shrink-0" data-testid={`pm-template-apply-${tpl.id}`}>
                    {applying === tpl.id ? <Loader2 size={12} className="animate-spin" /> : <FileTextIcon size={12} />} {t('pm_apply_template')}
                  </button>
                </div>
                {hasPercentMilestones(tpl) && (
                  <div className="mt-2 pt-2 border-t border-sm-border/60">
                    <label className="text-[11px] text-ink-muted block mb-1">{t('pm_template_contract_value')}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="€ 0.00"
                      value={baseAmounts[tpl.id] || ''}
                      onChange={(e) => setBaseAmounts((s) => ({ ...s, [tpl.id]: e.target.value }))}
                      className="sm-input text-xs w-full"
                      data-testid={`pm-template-base-${tpl.id}`}
                    />
                    <p className="text-[10px] text-ink-muted mt-1">{t('pm_template_contract_hint')}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// Save current project as a reusable template
// ────────────────────────────────────────
function SaveTemplateModal({ projectId, onClose, t }) {
  useEscapeKey(true, onClose);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (name.trim().length < 2) return;
    setSaving(true);
    try {
      await api.post(`/api/pm/templates/from-project/${projectId}`, { name: name.trim(), category: category.trim() || null });
      toast.success(t('pm_template_saved'));
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-paper rounded-[14px] max-w-md w-full p-5" onClick={(e) => e.stopPropagation()} data-testid="pm-save-template-modal">
        <div className="flex items-center gap-2 mb-2">
          <Save size={18} className="text-teal" />
          <h3 className="font-headings font-bold text-ink text-lg">{t('pm_save_template')}</h3>
        </div>
        <p className="text-sm text-ink-muted mb-4">{t('pm_save_template_hint')}</p>
        <input
          className="sm-input text-sm w-full mb-2"
          placeholder={t('pm_template_name_ph')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="pm-save-template-name"
        />
        <input
          className="sm-input text-sm w-full mb-4"
          placeholder={t('pm_template_category_ph')}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          data-testid="pm-save-template-category"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost text-sm">{t('cancel') || 'Cancel'}</button>
          <button onClick={save} disabled={saving || name.trim().length < 2} className="btn-primary text-sm" data-testid="pm-save-template-confirm">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {t('pm_save_template')}
          </button>
        </div>
      </div>
    </div>
  );
}
