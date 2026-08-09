import React from 'react';
import { useLang } from '../../contexts/LangContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Reusable admin pagination strip — 25/50/100 per-page toggle + page nav.
 * Designed to be sticky-friendly at the bottom of any tab's content.
 *
 * Props:
 *  - page, perPage, total
 *  - onPageChange(newPage)
 *  - onPerPageChange(newPerPage)
 */
export default function AdminPagination({ page = 1, perPage = 25, total = 0, onPageChange, onPerPageChange, sizes = [25, 50, 100] }) {
  const { t } = useLang();
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const goPrev = () => onPageChange(Math.max(1, page - 1));
  const goNext = () => onPageChange(Math.min(totalPages, page + 1));
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 py-3" data-testid="admin-pagination">
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <span>{t('adm_per_page')}</span>
        {sizes.map((n) => (
          <button
            key={n}
            onClick={() => { onPerPageChange(n); onPageChange(1); }}
            className={`px-2.5 py-0.5 rounded-md font-bold transition-colors
              ${perPage === n ? 'bg-teal text-paper' : 'bg-cream-soft text-ink-soft hover:bg-cream-deep'}`}
            data-testid={`per-page-${n}`}
          >{n}</button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-ink-soft">
        <span data-testid="pagination-range">
          {total === 0 ? '0 of 0' : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total}`}
        </span>
        <button
          onClick={goPrev}
          disabled={page === 1}
          className="p-1 rounded border border-sm-border disabled:opacity-30 hover:bg-cream-deep"
          data-testid="pagination-prev"
        ><ChevronLeft size={14} /></button>
        <span className="font-bold text-ink">{page} / {totalPages}</span>
        <button
          onClick={goNext}
          disabled={page >= totalPages}
          className="p-1 rounded border border-sm-border disabled:opacity-30 hover:bg-cream-deep"
          data-testid="pagination-next"
        ><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}
