import React, { useState } from 'react';
import { Search, Filter as FilterIcon, X, ChevronDown } from 'lucide-react';

/**
 * Reusable admin filter bar — chips + search + year/month dropdowns.
 * Mobile-first: filters collapse behind a "Filters" button on small screens.
 * On md+ screens, everything is always visible.
 */
export default function AdminFilterBar({
  filters = [],
  values = {},
  onChange,
  search,
  showYear,
  yearValue,
  onYearChange,
  showMonth,
  monthValue,
  onMonthChange,
  totalLabel,
  onReset,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const now = new Date();
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) years.push(y);
  const months = [
    { v: 1, l: 'Jan' }, { v: 2, l: 'Feb' }, { v: 3, l: 'Mar' }, { v: 4, l: 'Apr' },
    { v: 5, l: 'May' }, { v: 6, l: 'Jun' }, { v: 7, l: 'Jul' }, { v: 8, l: 'Aug' },
    { v: 9, l: 'Sep' }, { v: 10, l: 'Oct' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dec' },
  ];

  const activeCount =
    (search?.value && search.value.length > 0 ? 1 : 0) +
    (yearValue ? 1 : 0) +
    (monthValue ? 1 : 0) +
    Object.values(values).filter((v) => v && v !== 'all').length;
  const hasActive = activeCount > 0;

  return (
    <div className="admin-panel" data-testid="admin-filter-bar">
      {/* Header row — always visible */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <FilterIcon size={14} className="text-ink-muted" />
        <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">Filters</span>
        {hasActive && (
          <span className="text-[10px] font-bold bg-teal text-paper px-1.5 py-0.5 rounded-full" data-testid="admin-filter-active-count">{activeCount}</span>
        )}
        {totalLabel && (
          <span className="ml-auto text-xs text-ink-muted" data-testid="admin-filter-total">{totalLabel}</span>
        )}
        {/* Mobile toggle (visible <md) */}
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="md:hidden text-xs font-bold uppercase tracking-wider text-teal inline-flex items-center gap-1 px-2 py-1 border border-sm-border rounded-md"
          data-testid="admin-filter-mobile-toggle"
        >
          {mobileOpen ? 'Hide' : 'Show'} <ChevronDown size={11} className={`transition-transform ${mobileOpen ? 'rotate-180' : ''}`} />
        </button>
        {hasActive && (
          <button
            onClick={onReset}
            className="text-xs font-bold uppercase tracking-wider text-red-warn hover:underline inline-flex items-center gap-1"
            data-testid="admin-filter-reset"
          >
            <X size={11} /> Reset
          </button>
        )}
      </div>

      {/* Search — always visible (it's the most important control) */}
      {search && (
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={search.value || ''}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder || 'Search…'}
            className="admin-input pl-9 w-full"
            data-testid="admin-filter-search"
          />
        </div>
      )}

      {/* Filter chips body — collapsible on mobile */}
      <div className={`${mobileOpen ? 'block' : 'hidden'} md:block`}>
        <div className="flex flex-wrap gap-2">
          {/* Filter chips */}
          {filters.map((f) => (
            <div key={f.key} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{f.label}</span>
              {f.type !== 'select' && (f.options || []).map((o) => (
                <button
                  key={o.value}
                  onClick={() => onChange(f.key, o.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors
                    ${values[f.key] === o.value || (!values[f.key] && o.value === 'all') ? 'bg-teal text-paper' : 'bg-cream-soft text-ink-soft hover:bg-cream-deep'}`}
                  data-testid={`filter-${f.key}-${o.value}`}
                >
                  {o.label}{o.count != null && ` (${o.count})`}
                </button>
              ))}
              {f.type === 'select' && (
                <select
                  value={values[f.key] || ''}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  className="admin-input text-xs h-8 py-0"
                  data-testid={`filter-${f.key}-select`}
                >
                  {(f.options || []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}{o.count != null && ` (${o.count})`}</option>
                  ))}
                </select>
              )}
            </div>
          ))}

          {/* Year filter */}
          {showYear && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Year</span>
              <select
                value={yearValue || ''}
                onChange={(e) => onYearChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="admin-input text-xs h-8 py-0"
                data-testid="filter-year"
              >
                <option value="">All</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {/* Month filter (only when year selected) */}
          {showMonth && yearValue && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Month</span>
              <select
                value={monthValue || ''}
                onChange={(e) => onMonthChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="admin-input text-xs h-8 py-0"
                data-testid="filter-month"
              >
                <option value="">All</option>
                {months.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

