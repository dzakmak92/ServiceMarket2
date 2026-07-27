import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MapPin, Clock, FileText, Languages, Loader2, Building2, CalendarRange, Eye } from 'lucide-react';
import StatusPill from './StatusPill';
import api from '../api/client';
import { useLang } from '../contexts/LangContext';

const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

export default function ExpandableJobCard({
  job,
  actions,
  footer,
  badge,
  testIdPrefix = 'job',
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [translatedDesc, setTranslatedDesc] = useState(null);
  const [translating, setTranslating] = useState(false);
  const { lang, t } = useLang();

  const attachments = (job.attachments || job.job_attachments || []).slice(0, 20);
  const isProject = job.listing_type === 'project';

  const translateDescription = async () => {
    if (!job.description || translating) return;
    if (translatedDesc) { setTranslatedDesc(null); return; }
    setTranslating(true);
    try {
      const { data } = await api.post('/api/translate', { text: job.description, target_lang: lang });
      setTranslatedDesc(data.translated);
    } catch { /* noop */ }
    finally { setTranslating(false); }
  };

  return (
    <div className={`card-md hover:shadow-lg transition-all ${isProject ? 'border-l-2 border-l-teal/40' : ''}`} data-testid={`${testIdPrefix}-${job.id}`}>
      {/* Top row: content + chevron only */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <StatusPill status={job.status} />
            {isProject && (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-teal/12 text-teal px-2 py-0.5 rounded-full inline-flex items-center gap-1" data-testid={`${testIdPrefix}-${job.id}-project-badge`}>
                <Building2 size={9} /> {t('project_badge')}
              </span>
            )}
            {badge}
            <span className="text-xs px-2 py-0.5 bg-cream-deep text-ink-soft rounded-full capitalize">
              {(job.category || '').replace('_', ' ')}
            </span>
            {job.city && (
              <span className="text-xs text-ink-muted flex items-center gap-1">
                <MapPin size={10} /> {job.city}
              </span>
            )}
          </div>
          <h3 className="font-headings font-bold text-ink text-base leading-snug">{job.title}</h3>
          {job.job_number && (
            <span className="text-[10px] font-mono font-bold text-teal bg-teal/10 px-1.5 py-0.5 rounded inline-block mt-0.5">
              {job.job_number}
            </span>
          )}
          {/* Project meta badges */}
          {isProject && (job.timeline_weeks || job.site_visit_required) && (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {job.timeline_weeks && (
                <span className="text-[10px] text-ink-soft flex items-center gap-1">
                  <CalendarRange size={10} className="text-teal" />
                  {job.timeline_weeks === 1
                    ? (t('project_timeline_week') || `${job.timeline_weeks} week`).replace('{n}', job.timeline_weeks)
                    : (t('project_timeline_weeks') || `${job.timeline_weeks} weeks`).replace('{n}', job.timeline_weeks)}
                </span>
              )}
              {job.site_visit_required && (
                <span className="text-[10px] text-ink-soft flex items-center gap-1">
                  <Eye size={10} className="text-amber-deep" /> {t('project_site_visit')}
                </span>
              )}
            </div>
          )}
          {!expanded && (
            <p className="text-sm text-ink-muted mt-1 line-clamp-2">{job.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-ink-muted flex-wrap">
            {job.posted_at && (
              <span className="flex items-center gap-1">
                <Clock size={10} /> {new Date(job.posted_at).toLocaleDateString()}
              </span>
            )}
            {job.budget_max && <span className="font-semibold text-ink">€{job.budget_min || 0}–€{job.budget_max}</span>}
            {job.quote_count != null && job.quote_count > 0 && <span>{job.quote_count} quotes so far</span>}
            {attachments.length > 0 && (
              <span className="flex items-center gap-1 text-teal">
                <FileText size={10} /> {attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'}
              </span>
            )}
          </div>
        </div>
        {/* Chevron — only expand/collapse, no actions here */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-teal transition-colors px-2 py-1 rounded-full flex-shrink-0 mt-0.5"
          data-testid={`${testIdPrefix}-${job.id}-toggle`}
          aria-expanded={expanded}
        >
          {expanded ? <>Hide <ChevronUp size={12} /></> : <>Details <ChevronDown size={12} /></>}
        </button>
      </div>

      {/* Actions row — full width below content so title never gets squashed */}
      {actions && (
        <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-sm-border flex-wrap">
          {actions}
        </div>
      )}

      {expanded && (
        <div className="mt-3 pt-3 border-t border-sm-border space-y-3" data-testid={`${testIdPrefix}-${job.id}-body`}>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Description</p>
              {job.description && (
                <button
                  onClick={translateDescription}
                  disabled={translating}
                  className="flex items-center gap-1 text-[10px] text-ink-muted hover:text-teal transition-colors"
                  data-testid={`${testIdPrefix}-${job.id}-translate`}
                >
                  {translating
                    ? <Loader2 size={10} className="animate-spin" />
                    : <Languages size={10} />}
                  {translatedDesc ? 'Original' : 'Translate'}
                </button>
              )}
            </div>
            <p className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">
              {translatedDesc || job.description || <em className="text-ink-muted">No description provided.</em>}
            </p>
            {translatedDesc && (
              <p className="text-[10px] text-ink-muted mt-1 italic">{job.description}</p>
            )}
          </div>

          {attachments.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
                Attachments ({attachments.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {attachments.map((a) => {
                  const isImg = (a.content_type || '').startsWith('image/');
                  const href = (a.url || '').startsWith('http') ? a.url : `${backendUrl}${a.url}`;
                  return (
                    <a
                      key={a.file_id}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-square rounded-[10px] overflow-hidden border border-sm-border hover:opacity-90 transition-opacity bg-cream-soft"
                      title={a.name}
                      data-testid={`${testIdPrefix}-${job.id}-attach-${a.file_id}`}
                    >
                      {isImg ? (
                        <img src={href} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center px-2 text-center">
                          <FileText size={20} className="text-amber-deep" />
                          <span className="text-[10px] text-ink mt-1 truncate w-full">{a.name}</span>
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {footer}
        </div>
      )}
    </div>
  );
}
