import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import { Trash2, Loader2, Star, Flag, ChevronDown, ChevronUp } from 'lucide-react';
import AdminFilterBar from '../../../components/admin/AdminFilterBar';
import AdminPagination from '../../../components/admin/AdminPagination';

/**
 * Pro-review moderation panel — used as a sub-section within AdminUsers tab.
 * Iter39: relocated here after the standalone Reviews tab was removed.
 */
export default function ProReviewsPanel({ flash }) {
  const { t } = useLang();
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ flagged: 'all' });
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(null);
  const [acting, setActing] = useState(null);
  const [collapsed, setCollapsed] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.flagged === 'flagged') params.set('flagged_only', 'true');
      if (search) params.set('q', search);
      if (year) params.set('year', year);
      params.set('page', page);
      params.set('per_page', perPage);
      const { data } = await api.get(`/api/admin/reviews?${params.toString()}`);
      setReviews(data.reviews || []);
      setTotal(data.total || 0);
    } finally { setLoading(false); }
  }, [filters, search, year, page, perPage]);

  useEffect(() => { if (!collapsed) fetchAll(); }, [fetchAll, collapsed]);

  const flaggedCount = useMemo(() => reviews.filter((r) => r.is_flagged).length, [reviews]);

  const remove = async (id) => {
    if (!window.confirm(t('admin_delete_review_confirm') || 'Delete this review?')) return;
    setActing(id);
    try {
      await api.delete(`/api/admin/reviews/${id}`);
      flash?.(t('admin_review_deleted') || 'Review deleted');
      await fetchAll();
    } catch {
      flash?.(t('error_generic') || 'Failed');
    } finally { setActing(null); }
  };

  return (
    <div className="admin-panel" data-testid="pro-reviews-panel">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-2"
        data-testid="pro-reviews-panel-toggle"
      >
        <div className="flex items-center gap-2">
          <Star size={14} className="text-amber" />
          <h3 className="font-headings font-bold text-ink text-base">Pro Reviews Moderation</h3>
          {flaggedCount > 0 && (
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-red-warn/15 text-red-warn inline-flex items-center gap-1">
              <Flag size={10} /> {flaggedCount} flagged
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-3">
          <AdminFilterBar
            filters={[
              { key: 'flagged', label: 'Status', options: [
                { value: 'all', label: 'All' },
                { value: 'flagged', label: 'Flagged' },
              ] },
            ]}
            values={filters}
            onChange={(k, v) => { setFilters({ ...filters, [k]: v }); setPage(1); }}
            search={{ placeholder: 'Search review text…', value: search, onChange: (v) => { setSearch(v); setPage(1); } }}
            showYear
            yearValue={year}
            onYearChange={(v) => { setYear(v); setPage(1); }}
            totalLabel={`${total} reviews`}
            onReset={() => { setFilters({ flagged: 'all' }); setSearch(''); setYear(null); setPage(1); }}
          />

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={20} className="text-teal animate-spin" /></div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-8 text-ink-muted text-sm">No reviews match.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Reviewer</th>
                    <th>Pro</th>
                    <th>Rating</th>
                    <th>Comment</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr key={r.id} data-testid={`review-row-${r.id}`}>
                      <td className="font-medium text-ink">{r.reviewer_name || '—'}</td>
                      <td className="text-ink-soft">{r.pro_name || '—'}</td>
                      <td>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={11}
                              className={s <= (r.rating || 0) ? 'text-amber fill-amber' : 'text-ink-muted'}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="text-ink-soft text-sm max-w-[280px] truncate">{r.text || r.comment || '—'}</td>
                      <td>
                        {r.is_flagged ? (
                          <span className="status-pill status-cancelled inline-flex items-center gap-1">
                            <Flag size={10} /> flagged
                          </span>
                        ) : (
                          <span className="status-pill status-active">ok</span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => remove(r.id)}
                          disabled={acting === r.id}
                          className="admin-btn admin-btn-danger admin-btn-sm float-right"
                          data-testid={`review-delete-${r.id}`}
                        >
                          {acting === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AdminPagination
                page={page}
                perPage={perPage}
                total={total}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
