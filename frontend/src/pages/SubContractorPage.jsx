import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useLang } from '../contexts/LangContext';
import { Loader2, AlertCircle, Briefcase, ShieldCheck, Plus, BookOpen, ArrowRight } from 'lucide-react';

const COLUMNS = [
  { key: 'todo', labelKey: 'pm_col_todo' },
  { key: 'doing', labelKey: 'pm_col_doing' },
  { key: 'done', labelKey: 'pm_col_done' },
];

export default function SubContractorPage() {
  const { subToken } = useParams();
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState(localStorage.getItem('sub_author_name') || '');
  const [diaryDraft, setDiaryDraft] = useState({ note: '', hours: '' });
  const [posting, setPosting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/api/pm/public/sub/${subToken}`);
      setData(d);
    } catch (e) {
      setError(e?.response?.data?.detail || t('err_not_found'));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subToken]);

  const byColumn = useMemo(() => {
    const out = { todo: [], doing: [], done: [] };
    for (const tk of (data?.tasks || [])) (out[tk.column_key] || out.todo).push(tk);
    for (const k of Object.keys(out)) out[k].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return out;
  }, [data]);

  // Move task forward/back through columns (no DnD on public sub view — touch-friendly tap-to-advance is plenty here)
  const moveTask = async (taskId, newCol) => {
    try {
      await api.patch(`/api/pm/public/sub/${subToken}/tasks/${taskId}`, { column_key: newCol });
      await load();
    } catch (e) { console.error(e); }
  };

  const submitDiary = async () => {
    if (!diaryDraft.note.trim()) return;
    setPosting(true);
    try {
      const name = (authorName || 'Sub-contractor').trim();
      localStorage.setItem('sub_author_name', name);
      await api.post(`/api/pm/public/sub/${subToken}/diary`, {
        note: diaryDraft.note.trim(),
        hours: Number(diaryDraft.hours) || 0,
        author_name: name,
      });
      setDiaryDraft({ note: '', hours: '' });
    } finally { setPosting(false); }
  };

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 size={28} className="text-teal animate-spin" /></div>;
  if (error) return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card-lg max-w-md text-center">
        <AlertCircle size={32} className="text-red-warn mx-auto mb-2" />
        <h1 className="font-headings font-bold text-ink text-xl">{t('pm_sub_revoked_title')}</h1>
        <p className="text-sm text-ink-muted mt-1">{t('pm_sub_revoked_body')}</p>
        <Link to="/" className="btn-ghost text-xs mt-3 inline-flex">{t('ui_home')}</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12" data-testid="pm-sub-page">
      <header className="bg-paper border-b border-sm-border py-3">
        <div className="page-container max-w-5xl flex items-center gap-2 flex-wrap">
          <Briefcase size={18} className="text-teal" />
          <p className="text-sm font-headings font-bold text-ink">ServiceMarket · {t('pm_sub_title')}</p>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-amber-deep">
            <ShieldCheck size={11} /> {t('pm_sub_scoped')}
          </span>
        </div>
      </header>

      <main className="page-container py-6 max-w-5xl space-y-4">
        <div>
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">{data.job_category}</p>
          <h1 className="text-3xl font-headings font-bold text-ink mt-1">{data.title}</h1>
          <p className="text-sm text-ink-muted mt-1">{data.city || ''}</p>
        </div>

        {/* Author name persist */}
        <div className="card-lg">
          <label className="text-xs uppercase font-bold text-ink-muted tracking-wider block mb-1">{t('pm_sub_your_name')}</label>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder={t('pm_sub_your_name_ph')}
            className="sm-input text-sm w-full md:w-80"
            data-testid="pm-sub-author"
          />
          <p className="text-[11px] text-ink-muted mt-1">{t('pm_sub_your_name_help')}</p>
        </div>

        {/* Kanban (3-col, tap-to-advance — simpler than DnD on potentially small touch devices) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="pm-sub-kanban">
          {COLUMNS.map(({ key, labelKey }, idx) => (
            <div key={key} className="card-lg">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase font-bold tracking-wider text-ink-muted">{t(labelKey)}</p>
                <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-cream-deep text-ink-muted">{byColumn[key].length}</span>
              </div>
              <div className="space-y-2">
                {byColumn[key].length === 0 ? (
                  <p className="text-xs text-ink-muted py-4 text-center">{t('pm_task_empty')}</p>
                ) : byColumn[key].map((tk) => {
                  const nextCol = idx < 2 ? COLUMNS[idx + 1].key : null;
                  const prevCol = idx > 0 ? COLUMNS[idx - 1].key : null;
                  return (
                    <div key={tk.id} className="rounded-[10px] border border-sm-border bg-paper p-2.5">
                      <p className="text-sm text-ink mb-2">{tk.title}</p>
                      <div className="flex items-center gap-2">
                        {prevCol && (
                          <button onClick={() => moveTask(tk.id, prevCol)} className="text-[10px] text-ink-muted hover:text-teal">← {t(`pm_col_${prevCol}`)}</button>
                        )}
                        {nextCol && (
                          <button onClick={() => moveTask(tk.id, nextCol)} className="text-[10px] text-teal hover:text-teal-deep ml-auto inline-flex items-center gap-1" data-testid={`pm-sub-advance-${tk.id}`}>
                            {t(`pm_col_${nextCol}`)} <ArrowRight size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Diary entry */}
        <div className="card-lg" data-testid="pm-sub-diary">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={14} className="text-teal" />
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider">{t('pm_sub_log_time')}</p>
          </div>
          <textarea
            rows={2}
            value={diaryDraft.note}
            onChange={(e) => setDiaryDraft((d) => ({ ...d, note: e.target.value }))}
            placeholder={t('pm_diary_note')}
            className="sm-textarea text-sm w-full"
            data-testid="pm-sub-diary-note"
          />
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <label className="text-xs text-ink-muted flex items-center gap-1">
              {t('pm_diary_hours')}:
              <input
                type="number"
                step="0.25"
                value={diaryDraft.hours}
                onChange={(e) => setDiaryDraft((d) => ({ ...d, hours: e.target.value }))}
                className="sm-input text-xs w-20"
                data-testid="pm-sub-diary-hours"
              />
            </label>
            <button onClick={submitDiary} disabled={posting || !diaryDraft.note.trim()} className="btn-primary text-xs ml-auto" data-testid="pm-sub-diary-submit">
              {posting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} {t('btn_save')}
            </button>
          </div>
          <p className="text-[11px] text-ink-muted mt-2">{t('pm_sub_diary_help')}</p>
        </div>

        <p className="text-[11px] text-center text-ink-muted">{t('pm_sub_footer')} <Link to="/" className="text-teal hover:underline">ServiceMarket</Link></p>
      </main>
    </div>
  );
}
