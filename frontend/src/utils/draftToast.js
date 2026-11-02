import { toast } from 'sonner';

/* Einmal je Entwurf und Verlassen: "gespeichert unter Angebote › Entwürfe". */
const shown = new Set();
export function notifyDraftSaved(id, navigate) {
  if (!id || shown.has(id)) return;
  shown.add(id);
  setTimeout(() => shown.delete(id), 4000);
  toast.success('Kalkulation gespeichert', {
    description: 'Du findest sie unter Angebote › Entwürfe.',
    action: navigate ? { label: 'Ansehen', onClick: () => navigate('/quotes?tab=drafts') } : undefined,
    duration: 5000,
  });
}
