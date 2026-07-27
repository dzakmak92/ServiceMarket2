import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import AttachmentUploader from '../../components/AttachmentUploader';
import { CheckCircle, AlertCircle, Sparkles, Loader2, Hammer, Building2, CalendarRange, Eye } from 'lucide-react';

const URGENCY_OPTIONS = [
  { value: 'low', labelKey: 'urgency_low' },
  { value: 'medium', labelKey: 'urgency_medium' },
  { value: 'high', labelKey: 'urgency_high' },
];

const TIMELINE_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 16, 20, 26, 39, 52];

export default function PostJobPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEdit = !!editId;

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [loadingJob, setLoadingJob] = useState(isEdit);
  const [editBlocked, setEditBlocked] = useState(false);
  const aiTimerRef = useRef(null);
  const lastClassifiedRef = useRef('');

  const [form, setForm] = useState({
    title: '', category: '', description: '',
    city: '', urgency: 'medium', budget_min: '', budget_max: '',
    attachments: [],
    listing_type: 'task',
    timeline_weeks: '',
    site_visit_required: false,
    recurring_type: 'none',
    recurring_count: 4,
  });

  useEffect(() => {
    api.get('/api/categories').then((r) => setCategories(r.data.categories || []));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    let cancel = false;
    api.get(`/api/jobs/${editId}`)
      .then((r) => {
        if (cancel) return;
        const j = r.data;
        if (j.status !== 'open') {
          setError(t('edit_job_not_open'));
          setEditBlocked(true);
          return;
        }
        setForm({
          title: j.title || '',
          category: j.category || '',
          description: j.description || '',
          city: j.city || '',
          urgency: j.urgency || 'medium',
          budget_min: j.budget_min != null ? String(j.budget_min) : '',
          budget_max: j.budget_max != null ? String(j.budget_max) : '',
          attachments: j.attachments || [],
          listing_type: j.listing_type || 'task',
          timeline_weeks: j.timeline_weeks ? String(j.timeline_weeks) : '',
          site_visit_required: j.site_visit_required || false,
        });
        lastClassifiedRef.current = `${j.title || ''} ${j.description || ''}`.trim();
      })
      .catch(() => setError(t('job_not_found')))
      .finally(() => { if (!cancel) setLoadingJob(false); });
    return () => { cancel = true; };
  }, [editId, isEdit, t]);

  useEffect(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    const composed = `${form.title} ${form.description}`.trim();
    if (composed.length < 25) { setAiSuggestion(null); return; }
    if (composed === lastClassifiedRef.current) return;
    aiTimerRef.current = setTimeout(async () => {
      setAiBusy(true);
      try {
        const { data } = await api.post('/api/ai/classify-job', {
          title: form.title || undefined,
          description: form.description || form.title,
          lang,
        });
        lastClassifiedRef.current = composed;
        setAiSuggestion(data);
      } catch { /* silent */ } finally { setAiBusy(false); }
    }, 900);
    return () => clearTimeout(aiTimerRef.current);
  }, [form.title, form.description, lang]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const acceptAiSuggestion = () => {
    if (aiSuggestion?.category) { set('category', aiSuggestion.category); setAiSuggestion(null); }
  };

  const isProject = form.listing_type === 'project';

  const canSubmit = () => {
    if (form.title.trim().length < 5 || !form.category || !form.city.trim()) return false;
    if (isProject && !form.description.trim()) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit() || loading) return;
    setLoading(true);
    setError('');
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim(),
        city: form.city.trim(),
        urgency: form.urgency,
        budget_min: form.budget_min ? parseInt(form.budget_min, 10) : null,
        budget_max: form.budget_max ? parseInt(form.budget_max, 10) : null,
        attachments: form.attachments,
        listing_type: form.listing_type,
        timeline_weeks: isProject && form.timeline_weeks ? parseInt(form.timeline_weeks, 10) : null,
        site_visit_required: isProject ? form.site_visit_required : false,
        // Recurring (tasks only)
        recurring_type: (!isProject && form.recurring_type !== 'none') ? form.recurring_type : null,
        recurring_count: (!isProject && form.recurring_type !== 'none') ? Math.min(Math.max(Number(form.recurring_count), 2), 8) : null,
      };
      if (isEdit) {
        await api.patch(`/api/jobs/${editId}`, payload);
      } else {
        await api.post('/api/jobs', payload);
      }
      setSuccess(true);
      setTimeout(() => navigate(isEdit ? `/jobs/${editId}` : '/dashboard'), 1100);
    } catch (e) {
      setError(e.response?.data?.detail || (isEdit ? t('edit_job_failed') : t('post_job_failed')));
    } finally { setLoading(false); }
  };

  const suggestedCat = aiSuggestion?.category && categories.find((c) => c._id === aiSuggestion.category);

  if (loadingJob) {
    return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 size={28} className="text-teal animate-spin" /></div>;
  }

  if (isEdit && editBlocked) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="card-lg max-w-md w-full text-center" data-testid="edit-job-blocked">
          <div className="w-12 h-12 bg-amber/15 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={22} className="text-amber-deep" />
          </div>
          <h2 className="text-xl font-headings font-bold text-ink mb-1">{t('edit_job_title')}</h2>
          <p className="text-ink-muted text-sm mb-5">{error || t('edit_job_not_open')}</p>
          <button onClick={() => navigate(`/jobs/${editId}`)} className="btn-primary w-full" data-testid="edit-job-blocked-back">{t('btn_back')}</button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center animate-slide-up">
          <div className="w-20 h-20 bg-green-pos/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={40} className="text-green-pos" />
          </div>
          <h2 className="text-2xl font-headings font-bold text-ink">
            {isEdit ? t('edit_job_saved') : (isProject ? t('success_project_posted') : t('success_job_posted'))}
          </h2>
          <p className="text-ink-muted mt-2">{isEdit ? t('edit_job_redirecting') : t('post_job_redirecting_myjobs')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8">
      <div className="page-container py-8 max-w-2xl">
        <div className="mb-6">
          <h1 className="text-3xl font-headings font-bold text-ink" data-testid="post-job-page-title">
            {isEdit ? t('edit_job_title') : t('post_job_title')}
          </h1>
          <p className="text-ink-muted mt-1">{isEdit ? t('edit_job_subtitle') : t('post_job_subtitle')}</p>
        </div>

        <div className="card-lg animate-fade-in space-y-5">

          {/* Listing type selector — Quick Task vs Project */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-ink mb-2">{t('post_job_listing_type')}</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: 'task',    icon: Hammer,    labelKey: 'listing_type_task',    subKey: 'listing_type_task_sub' },
                  { v: 'project', icon: Building2, labelKey: 'listing_type_project', subKey: 'listing_type_project_sub' },
                ].map(({ v, icon: Icon, labelKey, subKey }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set('listing_type', v)}
                    className={`p-4 rounded-[16px] text-left border transition-all
                      ${form.listing_type === v
                        ? 'border-teal bg-teal/8 ring-1 ring-teal/30'
                        : 'border-sm-border bg-paper hover:bg-cream-soft'}`}
                    data-testid={`listing-type-${v}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${form.listing_type === v ? 'bg-teal/15' : 'bg-cream-deep'}`}>
                      <Icon size={16} className={form.listing_type === v ? 'text-teal' : 'text-ink-muted'} />
                    </div>
                    <p className={`text-sm font-semibold ${form.listing_type === v ? 'text-teal' : 'text-ink'}`}>{t(labelKey)}</p>
                    <p className="text-[11px] text-ink-muted mt-0.5 leading-snug">{t(subKey)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t('post_job_form_title')} *</label>
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={isProject ? t('post_project_placeholder_title') : t('post_job_placeholder_title')}
              className="sm-input"
              data-testid="job-title-input"
            />
            <p className="text-xs text-ink-muted mt-1">{form.title.length}{t('post_job_min_5_chars')}</p>
          </div>

          {/* Description — required for projects */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              {isProject ? t('post_project_scope_label') : t('post_job_description')}
              {isProject && <span className="text-red-warn ml-1">*</span>}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={isProject ? 5 : 4}
              placeholder={isProject ? t('post_project_scope_placeholder') : t('post_job_placeholder_desc')}
              className="sm-textarea"
              data-testid="job-description-input"
            />
            {isProject && !form.description.trim() && (
              <p className="text-xs text-red-warn mt-1">{t('post_project_scope_required')}</p>
            )}
          </div>

          {/* AI suggestion banner */}
          {(aiBusy || suggestedCat) && (
            <div className="rounded-[14px] border border-teal/20 bg-gradient-to-br from-teal/5 to-amber/5 p-4 flex items-start gap-3 animate-fade-in" data-testid="ai-suggestion-banner">
              <div className="w-8 h-8 rounded-full bg-teal/10 flex items-center justify-center flex-shrink-0">
                {aiBusy ? <Loader2 size={14} className="text-teal animate-spin" /> : <Sparkles size={14} className="text-teal" />}
              </div>
              <div className="flex-1 min-w-0">
                {aiBusy ? (
                  <p className="text-sm text-ink-soft">{t('post_job_ai_detecting')}</p>
                ) : suggestedCat ? (
                  <>
                    <p className="text-sm text-ink">{t('post_job_ai_suggested')}: <strong className="text-teal capitalize">{suggestedCat[`name_${lang}`] || suggestedCat.name_en || suggestedCat._id.replace('_', ' ')}</strong>
                      {aiSuggestion.confidence ? <span className="text-ink-muted text-xs ml-2">({Math.round(aiSuggestion.confidence * 100)}%)</span> : null}
                    </p>
                    {aiSuggestion.reason && <p className="text-xs text-ink-muted mt-0.5 italic">{t('post_job_ai_why')} {aiSuggestion.reason}</p>}
                  </>
                ) : null}
              </div>
              {suggestedCat && form.category !== suggestedCat._id && (
                <button onClick={acceptAiSuggestion} className="btn-primary text-xs px-3 py-1.5 flex-shrink-0" data-testid="ai-use-suggestion">{t('post_job_ai_use')}</button>
              )}
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t('post_job_category')} *</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat._id}
                  type="button"
                  onClick={() => set('category', cat._id)}
                  className={`px-3 py-2.5 rounded-[14px] text-sm text-left transition-all border capitalize
                    ${form.category === cat._id ? 'border-teal bg-teal/10 text-teal font-medium'
                    : aiSuggestion?.category === cat._id ? 'border-amber bg-amber/5 text-ink hover:bg-cream-soft'
                    : 'border-sm-border bg-paper text-ink hover:bg-cream-soft'}`}
                  data-testid={`category-select-${cat._id}`}
                >
                  {cat[`name_${lang}`] || cat.name_en || cat._id.replace('_', ' ')}
                  {aiSuggestion?.category === cat._id && form.category !== cat._id && <Sparkles size={10} className="inline ml-1 text-amber" />}
                </button>
              ))}
            </div>
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t('post_job_city')} *</label>
            <input
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder={t('post_job_placeholder_city')}
              className="sm-input"
              data-testid="job-city-input"
            />
          </div>

          {/* Project-specific fields */}
          {isProject && (
            <div className="space-y-4 p-4 bg-teal/4 rounded-[16px] border border-teal/15">
              <p className="text-xs font-semibold text-teal uppercase tracking-wider">{t('post_project_extra_heading')}</p>

              {/* Timeline */}
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  <CalendarRange size={14} className="inline mr-1.5 text-teal" />
                  {t('post_project_timeline')}
                </label>
                <select
                  value={form.timeline_weeks}
                  onChange={(e) => set('timeline_weeks', e.target.value)}
                  className="sm-select w-full"
                  data-testid="timeline-weeks-select"
                >
                  <option value="">{t('post_project_timeline_placeholder')}</option>
                  {TIMELINE_OPTIONS.map((w) => (
                    <option key={w} value={w}>{w === 1 ? t('project_timeline_week').replace('{n}', 1) : t('project_timeline_weeks').replace('{n}', w)}</option>
                  ))}
                </select>
              </div>

              {/* Site visit required */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => set('site_visit_required', !form.site_visit_required)}
                  className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${form.site_visit_required ? 'bg-teal' : 'bg-cream-deep border border-sm-border'}`}
                  data-testid="site-visit-toggle"
                  aria-checked={form.site_visit_required}
                  role="switch"
                >
                  <span className={`block w-4 h-4 rounded-full bg-white shadow mx-1 transition-transform ${form.site_visit_required ? 'translate-x-4' : ''}`} />
                </button>
                <div>
                  <p className="text-sm font-medium text-ink flex items-center gap-1.5">
                    <Eye size={14} className="text-ink-muted" /> {t('post_project_site_visit')}
                  </p>
                  <p className="text-xs text-ink-muted">{t('post_project_site_visit_sub')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              {t('post_job_attachments')}
              {isProject && <span className="text-xs text-ink-muted ml-2">(up to 20)</span>}
            </label>
            <AttachmentUploader
              value={form.attachments}
              onChange={(next) => set('attachments', next)}
            />
          </div>

          {/* Urgency — only for tasks */}
          {!isProject && (
            <div>
              <label className="block text-sm font-medium text-ink mb-3">{t('post_job_urgency')}</label>
              <div className="flex gap-3">
                {URGENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('urgency', opt.value)}
                    className={`flex-1 py-3 px-3 rounded-[14px] text-sm transition-all border text-center
                      ${form.urgency === opt.value ? 'border-teal bg-teal/10 text-teal font-medium' : 'border-sm-border bg-paper text-ink hover:bg-cream-soft'}`}
                    data-testid={`urgency-${opt.value}`}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recurring — only for tasks */}
          {!isProject && (
            <div>
              <label className="block text-sm font-medium text-ink mb-2">
                <CalendarRange size={14} className="inline mr-1.5 text-ink-muted" />
                {t('post_job_recurring') || 'Recurring job'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {[
                  { v: 'none',     label: t('recurring_none') || 'Once' },
                  { v: 'weekly',   label: t('recurring_weekly') || 'Weekly' },
                  { v: 'biweekly', label: t('recurring_biweekly') || 'Biweekly' },
                  { v: 'monthly',  label: t('recurring_monthly') || 'Monthly' },
                ].map(({ v, label }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set('recurring_type', v)}
                    className={`py-2 px-2 rounded-[12px] text-xs border transition-all text-center
                      ${form.recurring_type === v
                        ? 'border-teal bg-teal/10 text-teal font-semibold'
                        : 'border-sm-border text-ink-muted hover:bg-cream-soft'}`}
                    data-testid={`recurring-type-${v}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {form.recurring_type !== 'none' && (
                <div className="flex items-center gap-3 mt-1">
                  <label className="text-xs text-ink-muted whitespace-nowrap">
                    {t('recurring_occurrences') || 'Number of times:'}
                  </label>
                  <input
                    type="number"
                    value={form.recurring_count}
                    onChange={(e) => set('recurring_count', Math.min(Math.max(parseInt(e.target.value)||2, 2), 8))}
                    min={2} max={8}
                    className="sm-input w-20 text-center"
                    data-testid="recurring-count-input"
                  />
                  <span className="text-xs text-ink-muted">
                    ({form.recurring_count - 1} additional copies)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Budget */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t('post_job_budget_min')}</label>
              <input type="number" value={form.budget_min} onChange={(e) => set('budget_min', e.target.value)} placeholder={isProject ? '1000' : '50'} className="sm-input" min="0" data-testid="budget-min-input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t('post_job_budget_max')}</label>
              <input type="number" value={form.budget_max} onChange={(e) => set('budget_max', e.target.value)} placeholder={isProject ? '10000' : '500'} className="sm-input" min="0" data-testid="budget-max-input" />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-warn bg-red-50 rounded-[14px] p-3 text-sm" data-testid="post-job-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="flex gap-3 mt-2">
            {isEdit && (
              <button onClick={() => navigate(`/jobs/${editId}`)} disabled={loading} className="btn-ghost flex-1" data-testid="edit-job-cancel">{t('btn_cancel')}</button>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading || !canSubmit()}
              className={isEdit ? 'btn-primary flex-1' : 'btn-primary w-full'}
              data-testid={isEdit ? 'edit-job-submit' : 'post-job-submit'}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading
                ? (isEdit ? t('edit_job_saving') : t('post_job_posting'))
                : (isEdit ? t('edit_job_submit') : (isProject ? t('post_project_submit') : t('post_job_submit')))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
