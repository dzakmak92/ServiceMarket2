import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, Euro, MessageSquare } from 'lucide-react';
import StatusPill from './StatusPill';

const URGENCY_COLORS = {
  low: 'text-green-pos',
  medium: 'text-amber',
  high: 'text-red-warn',
};

const URGENCY_LABELS = {
  low: 'Flexible', medium: 'Within weeks', high: 'Urgent 48h',
};

export default function JobCard({ job, showActions = false, onAccept, onComplete, actionLoading }) {
  const timeAgo = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="card-md hover:shadow-lg transition-all duration-300 animate-fade-in" data-testid={`job-card-${job.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={job.status} />
            {job.job_number && (
              <span className="text-[10px] font-mono font-bold text-teal bg-teal/10 px-1.5 py-0.5 rounded">
                {job.job_number}
              </span>
            )}
            <span className={`text-xs font-medium ${URGENCY_COLORS[job.urgency] || ''}`}>
              {URGENCY_LABELS[job.urgency] || job.urgency}
            </span>
          </div>
          <Link to={`/jobs/${job.id}`} className="block mt-2 group">
            <h3 className="font-headings font-bold text-ink text-sm group-hover:text-teal transition-colors line-clamp-2">
              {job.title}
            </h3>
          </Link>
          <p className="text-xs text-ink-muted mt-1 line-clamp-2">{job.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {job.city && (
          <div className="flex items-center gap-1 text-ink-muted">
            <MapPin size={11} />
            <span className="text-xs">{job.city}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-ink-muted">
          <Clock size={11} />
          <span className="text-xs">{timeAgo(job.posted_at)}</span>
        </div>
        {(job.budget_min || job.budget_max) && (
          <div className="flex items-center gap-1 text-ink-soft">
            <span className="text-xs font-medium">
              €{job.budget_min || '?'}{job.budget_max ? `–€${job.budget_max}` : '+'}
            </span>
          </div>
        )}
        {job.quote_count > 0 && (
          <div className={`flex items-center gap-1 ${job.quote_count >= 5 ? 'text-red-warn font-medium' : 'text-ink-muted'}`}>
            <MessageSquare size={11} />
            <span className="text-xs">
              {job.quote_count >= 5 ? 'Full · 5/5 quotes' : `${job.quote_count}/5 quotes`}
            </span>
          </div>
        )}
        {job.category && (
          <span className="text-xs px-2 py-0.5 bg-cream-deep text-ink-soft rounded-full capitalize">
            {job.category.replace('_', ' ')}
          </span>
        )}
      </div>

      {showActions && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-sm-border">
          <Link to={`/jobs/${job.id}`} className="btn-ghost text-xs py-2 flex-1 text-center">
            View Details
          </Link>
          {job.status === 'in_progress' && onComplete && (
            <button
              onClick={() => onComplete(job.id)}
              disabled={actionLoading}
              className="btn-primary text-xs py-2 flex-1"
              data-testid={`mark-complete-${job.id}`}
            >
              Mark Complete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
