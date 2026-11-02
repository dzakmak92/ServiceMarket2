import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';

/**
 * Design 3 of the Angebotskarte, shared by Angebote, Aufträge and Projekte:
 * a big trade mark, title and number, the status as a label, and on the right
 * the amount over one row of small controls plus a ••• menu. Everything rarer
 * than the controls lives in the menu, so a card is about 90 px tall and a
 * phone shows twice as many as before.
 *
 * The menu always carries "Öffnen" first, so even a card whose controls are
 * all spoken for has a labelled way in — the icons alone are not the only
 * door.
 */

export const PILL = {
  muted: 'bg-white/75 text-ink-muted',
  amber: 'bg-amber/15 text-amber-text',
  teal: 'bg-teal/[.12] text-teal',
  green: 'bg-green-pos/[.14] text-green-text',
  red: 'bg-red-warn/[.12] text-red-text',
};

export function MiniGroup({ children, label, testid }) {
  return (
    <div className="flex rounded-[11px] border border-sm-border bg-paper overflow-hidden"
         role="group" aria-label={label} data-testid={testid}>
      {children}
    </div>
  );
}

/** One icon in a MiniGroup: a button, an in-app link or an outside link. */
export function MiniBtn({ icon: Icon, label, onClick, href, to, external, on, tone, disabled, testid }) {
  const cls = `w-9 h-9 grid place-items-center border-r border-sm-border last:border-r-0
               transition-colors duration-press
               ${on ? (tone || 'bg-teal/[.12] text-teal') : disabled ? 'text-ink-faint' : 'text-ink-muted hover:text-ink'}`;
  const inner = <Icon size={15} aria-hidden="true" />;
  if (to) return <Link to={to} className={cls} aria-label={label} title={label} data-testid={testid}>{inner}</Link>;
  if (href) {
    return (
      <a href={href} className={cls} aria-label={label} title={label} data-testid={testid}
         {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{inner}</a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}
            aria-label={label} title={label} aria-pressed={on || undefined} data-testid={testid}>
      {inner}
    </button>
  );
}

export default function CompactRow({
  mark, washed, to, title, meta, metaClass = 'text-ink-muted', pill, amount, controls,
  menu = [], menuLabel, skin = 'bg-paper border-sm-border', note, testid, openTestid,
  moreTestid, menuTestid, style, data = {},
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={ref} className={`rounded-2xl border p-2.5 animate-rise ${skin}`} style={style}
         data-testid={testid} {...data}>
      <div className="flex items-center gap-2.5">
        <Link to={to} tabIndex={-1} aria-hidden="true"
              className={`w-12 h-12 rounded-[14px] text-navy grid place-items-center shrink-0
                          ${washed ? 'bg-white/75' : 'bg-navy-wedge'}`}>
          {mark}
        </Link>
        <Link to={to} className="min-w-0 flex-1 group" data-testid={openTestid}>
          {/* Two lines before it cuts: the right column takes ~160 px for the
              controls, and one line left "Wohnzimmer s…" on a phone. */}
          <div className="font-headings font-bold text-[15px] text-ink leading-[1.2] line-clamp-2
                          [overflow-wrap:anywhere] group-hover:text-teal">{title}</div>
          <div className={`text-[12.5px] truncate mt-0.5 ${metaClass}`}>{meta}</div>
          {pill && (
            <span className={`inline-block mt-1 rounded-full px-2 py-px text-[10.5px] font-extrabold
                              ${PILL[pill.tone] || PILL.muted}`} data-testid="row-pill">
              {pill.text}
            </span>
          )}
        </Link>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <div className="font-headings font-bold text-[16px] text-ink tabular-nums whitespace-nowrap">
            {amount}
          </div>
          <div className="flex items-center gap-1.5">
            {controls}
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                    aria-label={menuLabel} title={menuLabel} data-testid={moreTestid}
                    className={`w-9 h-9 rounded-[11px] border border-sm-border grid place-items-center
                                ${open ? 'bg-ink text-paper' : 'bg-paper text-ink'}`}>
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="mt-2 rounded-xl border border-sm-border bg-paper overflow-hidden animate-drop"
             data-testid={menuTestid}>
          {menu.filter(Boolean).map((m) => {
            const Icon = m.icon;
            const cls = `w-full min-h-[44px] px-3.5 text-left text-[14px] font-semibold flex
                         items-center gap-2 border-b border-sm-border last:border-b-0
                         ${m.disabled ? 'text-ink-muted' : m.danger ? 'text-red-text' : 'text-ink'}`;
            const body = (<>{Icon && <Icon size={15} aria-hidden="true" />}<span className="flex-1">{m.label}</span>
              {m.hint && <span className="text-[12px] font-medium text-ink-muted">{m.hint}</span>}</>);
            if (m.to) {
              return <Link key={m.key} to={m.to} className={cls} data-testid={m.testid}
                           onClick={() => setOpen(false)}>{body}</Link>;
            }
            if (m.href) {
              return (
                <a key={m.key} href={m.href} className={cls} data-testid={m.testid}
                   onClick={() => setOpen(false)}
                   {...(m.external ? { target: '_blank', rel: 'noreferrer' } : {})}>{body}</a>
              );
            }
            return (
              <button key={m.key} type="button" disabled={m.disabled} className={cls}
                      data-testid={m.testid}
                      onClick={() => { setOpen(false); m.onClick?.(); }}>{body}</button>
            );
          })}
        </div>
      )}
      {note}
    </div>
  );
}
