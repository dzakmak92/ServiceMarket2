import React, { useRef, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Horizontally scrollable tab strip with scroll-snap, auto-centering the active tab.
 *
 * Props:
 *  - tabs: [{ key, label, count? (optional) }]
 *  - activeKey: string
 *  - onChange(newKey): function
 *  - testidPrefix: string (e.g. 'admin-tab' renders data-testid='admin-tab-{key}')
 *  - variant: 'pills' | 'underline' (defaults to 'underline' to match existing admin look)
 *  - sticky: bool — render with sticky positioning + paper bg + bottom shadow
 *  - leftAccessory / rightAccessory: optional ReactNode (e.g. an icon, action button)
 */
export default function ScrollSnapTabStrip({
  tabs,
  activeKey,
  onChange,
  testidPrefix = 'tab',
  variant = 'underline',
  sticky = false,
  className = '',
}) {
  const stripRef = useRef(null);
  const tabRefs = useRef({});
  const [showArrows, setShowArrows] = useState({ left: false, right: false });

  // Auto-center the active tab in the visible scroll viewport.
  useEffect(() => {
    const el = tabRefs.current[activeKey];
    if (el && stripRef.current) {
      const strip = stripRef.current;
      const elLeft = el.offsetLeft;
      const elWidth = el.offsetWidth;
      const stripWidth = strip.clientWidth;
      const target = elLeft - stripWidth / 2 + elWidth / 2;
      strip.scrollTo({ left: target, behavior: 'smooth' });
    }
  }, [activeKey]);

  // Show arrows only when overflow scrollable
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const update = () => {
      const canScrollLeft = strip.scrollLeft > 4;
      const canScrollRight = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4;
      setShowArrows({ left: canScrollLeft, right: canScrollRight });
    };
    update();
    strip.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      strip.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [tabs.length]);

  const nudge = (dir) => {
    if (!stripRef.current) return;
    stripRef.current.scrollBy({ left: dir * 220, behavior: 'smooth' });
  };

  const baseTab = variant === 'pills'
    ? 'px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors flex-shrink-0 scroll-snap-align-start'
    : 'px-3 py-2 text-sm font-bold border-b-2 transition-colors flex-shrink-0 scroll-snap-align-start whitespace-nowrap';

  const activeStyles = variant === 'pills'
    ? 'bg-teal text-paper'
    : 'border-teal text-teal';
  const idleStyles = variant === 'pills'
    ? 'bg-cream-soft text-ink-soft hover:bg-cream-deep'
    : 'border-transparent text-ink-muted hover:text-ink';

  return (
    <div className={`relative ${sticky ? 'sticky top-0 z-30 bg-paper border-b border-sm-border' : ''} ${className}`}>
      {/* Left arrow */}
      {showArrows.left && (
        <button
          onClick={() => nudge(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-paper border border-sm-border shadow-md flex items-center justify-center hover:bg-cream-deep transition-colors md:hidden"
          aria-label="Scroll left"
          data-testid={`${testidPrefix}-scroll-left`}
        >
          <ChevronLeft size={14} />
        </button>
      )}
      {/* Right arrow */}
      {showArrows.right && (
        <button
          onClick={() => nudge(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-paper border border-sm-border shadow-md flex items-center justify-center hover:bg-cream-deep transition-colors md:hidden"
          aria-label="Scroll right"
          data-testid={`${testidPrefix}-scroll-right`}
        >
          <ChevronRight size={14} />
        </button>
      )}
      <div
        ref={stripRef}
        className={`flex gap-1 overflow-x-auto scroll-smooth scrollbar-hide ${variant === 'pills' ? 'py-2 px-2' : ''}`}
        style={{ scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch' }}
        data-testid={`${testidPrefix}-strip`}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={(el) => { tabRefs.current[t.key] = el; }}
            onClick={() => onChange(t.key)}
            className={`${baseTab} ${activeKey === t.key ? activeStyles : idleStyles}`}
            data-testid={`${testidPrefix}-${t.key}`}
          >
            {t.label}
            {t.count != null && (
              <span className={`ml-1.5 text-[10px] ${activeKey === t.key ? 'opacity-90' : 'opacity-60'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Passive content wrapper. (Swipe-to-change-tab gestures were removed because
 * they hijacked horizontal scrolling of wide tables/content on mobile, switching
 * tabs unexpectedly. Tab navigation is via the ScrollSnapTabStrip only.)
 *
 * Kept as a thin wrapper so existing call-sites keep working unchanged.
 */
export function SwipeableTabPanel({ tabKeys, activeKey, onChange, children, className = '' }) {
  return (
    <div className={className} data-testid="swipeable-tab-panel">
      {children}
    </div>
  );
}
