import { useEffect } from 'react';

/**
 * Escape closes the thing on top.
 *
 * Nothing in this app closed on Escape — not the invoice preview, the share
 * sheet, the payments sheet, the storno dialog, the new-quote panel, the PM
 * template modals, the notification panel or the mobile "More" sheet. A
 * keyboard user could open any of them and had only the mouse to get out.
 *
 * Deliberately smaller than a focus trap: the sheets in the calendar use
 * `useSheetModal`, which also moves and traps focus. This is the minimum for
 * the overlays that are not full dialogs, and it can be dropped into a
 * component in one line.
 *
 * Bound in the capture phase so a nested overlay does not have to fight its
 * parent for the key, and `stopPropagation` keeps two stacked overlays from
 * both closing on one press.
 */
export default function useEscapeKey(active, onClose) {
  useEffect(() => {
    if (!active || !onClose) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [active, onClose]);
}
