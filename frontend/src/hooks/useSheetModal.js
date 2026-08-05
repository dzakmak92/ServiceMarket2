import { useEffect, useRef } from 'react';

/**
 * What makes a bottom sheet a dialog rather than a decorated div.
 *
 * Every sheet in this app was built the same way — a fixed backdrop, a panel,
 * a click handler — and every one of them shipped without the four things
 * that make it a modal. Measured on the new-appointment sheet: Escape did
 * nothing, and tabbing forward from the title field walked the duration chips
 * and then landed on the bottom navigation *behind* the scrim, so a keyboard
 * user could navigate the whole app away while believing the sheet was still
 * in front of them.
 *
 * A hook rather than a component because the sheets differ in everything else
 * — layout, header, footer, how they close — and only agree on this.
 *
 * @param open     whether the sheet is on screen
 * @param onClose  what Escape and the backdrop do
 * @param opts.initialFocus  ref to focus on open; defaults to the first
 *                           focusable thing in the panel
 * @returns {{ panel, dialogProps }} spread `dialogProps` on the backdrop and
 *          put `panel` on the panel element.
 */
export default function useSheetModal(open, onClose, opts = {}) {
  const panel = useRef(null);
  const { initialFocus, label } = opts;

  useEffect(() => {
    if (!open) return undefined;

    const focusables = () => [...(panel.current?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea,'
      + ' [tabindex]:not([tabindex="-1"])') || [])]
      .filter((el) => el.offsetParent !== null);

    /* Focus goes into the sheet, or the sheet is only visually in front. */
    (initialFocus?.current || focusables()[0])?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const here = document.activeElement;
      /* Wrap at both ends. Also catch the case where focus is somewhere
         outside the panel entirely — it should not be, but if it is, the
         next Tab belongs back inside rather than further away. */
      if (!panel.current?.contains(here)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && here === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && here === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey, true);
    /* The page behind a bottom sheet must not scroll: on a phone, a gesture
       that starts on the backdrop otherwise drags the calendar around
       underneath it. */
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, initialFocus]);

  return {
    panel,
    dialogProps: { role: 'dialog', 'aria-modal': 'true', 'aria-label': label || undefined },
  };
}
