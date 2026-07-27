import React, { useMemo, useState, useEffect } from 'react';
import { Loader2, MessageSquare, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

const THREADS_PER_PAGE = 15;

/**
 * Build Outlook-style buckets from a date-sorted (desc) thread array.
 * Returns an ordered array of { label, threads[] } groups.
 */
function bucketize(threads, t) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  // ISO week starts Monday — push back to Monday of current week
  const startOfThisWeek = new Date(startOfToday);
  const dow = (startOfToday.getDay() + 6) % 7; // 0 = Mon
  startOfThisWeek.setDate(startOfThisWeek.getDate() - dow);
  const startOfLastWeek = new Date(startOfThisWeek); startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const buckets = {
    today: { label: t('thread_group_today'), threads: [] },
    yesterday: { label: t('thread_group_yesterday'), threads: [] },
    this_week: { label: t('thread_group_this_week'), threads: [] },
    last_week: { label: t('thread_group_last_week'), threads: [] },
    this_month: { label: t('thread_group_this_month'), threads: [] },
  };
  const monthBuckets = {}; // keyed by 'YYYY-MM' for older months

  threads.forEach((th) => {
    const ts = th.last_message?.sent_at;
    const d = ts ? new Date(ts) : null;
    if (!d || isNaN(d.getTime())) {
      buckets.this_month.threads.push(th); // fallback
      return;
    }
    if (d >= startOfToday) buckets.today.threads.push(th);
    else if (d >= startOfYesterday) buckets.yesterday.threads.push(th);
    else if (d >= startOfThisWeek) buckets.this_week.threads.push(th);
    else if (d >= startOfLastWeek) buckets.last_week.threads.push(th);
    else if (d >= startOfThisMonth) buckets.this_month.threads.push(th);
    else {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthBuckets[key]) {
        monthBuckets[key] = {
          label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
          threads: [],
          _ts: d.getTime(),
        };
      }
      monthBuckets[key].threads.push(th);
    }
  });

  const ordered = [
    buckets.today, buckets.yesterday, buckets.this_week, buckets.last_week, buckets.this_month,
    ...Object.values(monthBuckets).sort((a, b) => b._ts - a._ts),
  ].filter((g) => g.threads.length > 0);
  return ordered;
}

function relativeTime(ts, t) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= startOfToday) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (d >= startOfYesterday) return t('thread_group_yesterday');
  // Within last 7 days → weekday
  const daysAgo = (startOfToday - d) / 86400000;
  if (daysAgo < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

/**
 * Outlook-style left-rail thread list:
 *  - Groups: Today / Yesterday / This week / Last week / This month / <Month Year>
 *  - Pagination: 15 threads per page with Prev / Next + indicator
 *
 * Props:
 *  - threads: array (pre-sorted desc by last_message.sent_at)
 *  - activeThreadId, loading, onOpen(thread), t
 */
export default function ThreadList({ threads, activeThreadId, loading, onOpen, t }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('active');     // 'active' | 'completed'

  // Bucket a thread → 'active' or 'completed' (which covers both won-complete and lost)
  const threadBucket = (th) => {
    const isLost = th.my_quote_status === 'lost';
    const isComplete = th.job_status === 'completed';
    return (isLost || isComplete) ? 'completed' : 'active';
  };

  // Filter first (across pro name + job title + last message), then bucket, then paginate.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = threads;
    if (q) {
      list = list.filter((th) =>
        (th.other_name || '').toLowerCase().includes(q) ||
        (th.job_title || '').toLowerCase().includes(q) ||
        (th.last_message?.text || '').toLowerCase().includes(q)
      );
    }
    return list.filter((th) => threadBucket(th) === tab);
  }, [threads, query, tab]);

  const counts = useMemo(() => {
    const c = { active: 0, completed: 0 };
    for (const th of threads) c[threadBucket(th)] += 1;
    return c;
  }, [threads]);

  // Reset to page 1 whenever query or tab changes
  useEffect(() => { setPage(1); }, [query, tab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / THREADS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * THREADS_PER_PAGE;
  const pageSlice = filtered.slice(start, start + THREADS_PER_PAGE);
  const groups = useMemo(() => bucketize(pageSlice, t), [pageSlice, t]);

  return (
    <>
      <div className="p-4 border-b border-sm-border">
        <h1 className="font-headings font-bold text-ink text-lg">{t('inbox')}</h1>
        {threads.length > 0 && (
          <p className="text-xs text-ink-muted mt-0.5">
            {query
              ? `${filtered.length} / ${threads.length} ${t('threads_grouped_by_job')}`
              : `${threads.length} ${t('threads_grouped_by_job')}`}
          </p>
        )}
        {/* Active / Completed tab strip */}
        {threads.length > 0 && (
          <div className="mt-3 inline-flex rounded-[10px] border border-sm-border bg-cream-soft p-0.5 text-xs" data-testid="thread-tabs">
            {[
              { k: 'active', label: t('inbox_tab_active'), c: counts.active },
              { k: 'completed', label: t('inbox_tab_completed'), c: counts.completed },
            ].map(({ k, label, c }) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-[8px] font-medium transition-colors ${tab === k ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
                data-testid={`thread-tab-${k}`}
              >
                {label} <span className="text-[10px] text-ink-muted ml-0.5">({c})</span>
              </button>
            ))}
          </div>
        )}
        {/* Search */}
        {threads.length > 0 && (
          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('thread_search_placeholder')}
              className="w-full pl-9 pr-9 py-2 rounded-[12px] border border-sm-border bg-cream-soft text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-teal focus:bg-paper transition-colors"
              data-testid="thread-search-input"
              aria-label={t('thread_search_placeholder')}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-ink-muted hover:text-ink hover:bg-cream-deep/30 transition-colors"
                data-testid="thread-search-clear"
                aria-label={t('btn_clear')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="text-teal animate-spin" />
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center p-8">
            <MessageSquare size={32} className="text-ink-muted mx-auto mb-2" />
            <p className="text-ink-muted text-sm">{t('no_threads')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center p-8" data-testid="thread-search-no-results">
            <Search size={32} className="text-ink-muted mx-auto mb-2" />
            <p className="text-ink-muted text-sm">{t('thread_search_no_results').replace('{q}', query)}</p>
            <button
              onClick={() => setQuery('')}
              className="mt-3 text-xs font-medium text-teal hover:text-teal-deep transition-colors"
              data-testid="thread-search-reset"
            >
              {t('btn_clear')}
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} data-testid={`thread-group-${group.label}`}>
              <div className="sticky top-0 z-10 px-4 py-1.5 bg-cream-soft/90 backdrop-blur-sm border-b border-sm-border">
                <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                  {group.label}
                </p>
              </div>
              {group.threads.map((thread) => {
                const ts = thread.last_message?.sent_at;
                const isLost = thread.my_quote_status === 'lost';
                const isWonAndDone = thread.job_status === 'completed' && !isLost;
                // Subtle tint applied to the WHOLE row so the user gets instant overview
                const rowTint = isLost ? 'bg-red-warn/5 hover:bg-red-warn/10'
                                : isWonAndDone ? 'bg-green-pos/5 hover:bg-green-pos/10'
                                : 'hover:bg-cream-soft';
                return (
                  <button
                    key={thread.thread_id}
                    onClick={() => onOpen(thread)}
                    className={`w-full text-left px-4 py-3 border-b border-sm-border transition-colors ${rowTint}
                      ${activeThreadId === thread.thread_id ? 'border-l-2 border-l-teal' : ''}`}
                    data-testid={`thread-${thread.thread_id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink text-sm truncate">{thread.other_name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-ink-muted whitespace-nowrap">
                          {relativeTime(ts, t)}
                        </span>
                        {thread.unread_count > 0 && (
                          <span className="w-5 h-5 bg-teal text-paper text-[10px] font-bold rounded-full flex items-center justify-center">
                            {thread.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5 truncate">
                      {thread.job_title}
                      {isLost && <span className="ml-1.5 inline-flex items-center text-[9px] uppercase font-bold tracking-wide text-red-warn">· {t('inbox_thread_lost')}</span>}
                      {isWonAndDone && <span className="ml-1.5 inline-flex items-center text-[9px] uppercase font-bold tracking-wide text-green-pos">· {t('inbox_thread_done')}</span>}
                    </p>
                    <p className="text-xs text-ink-faint mt-1 truncate">{thread.last_message?.text}</p>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Pagination — show against the *filtered* result set */}
      {!loading && filtered.length > THREADS_PER_PAGE && (
        <div
          className="flex items-center justify-between px-3 py-2 border-t border-sm-border bg-paper flex-shrink-0"
          data-testid="thread-list-pagination"
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1"
            data-testid="thread-list-prev"
          >
            <ChevronLeft size={14} /> {t('reviews_prev')}
          </button>
          <span className="text-xs text-ink-muted" data-testid="thread-list-page-indicator">
            {t('reviews_page_x_of_y').replace('{x}', safePage).replace('{y}', totalPages)}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1"
            data-testid="thread-list-next"
          >
            {t('reviews_next')} <ChevronRight size={14} />
          </button>
        </div>
      )}
    </>
  );
}
