import api from '../api/client';

/**
 * Open a quote's PDF in a new tab. A plain link to /api/quotes/:id/pdf is a
 * dead end: the browser sends no auth header, so the pro lands on a 401. This
 * fetches the file with the session and hands the browser a blob URL instead.
 * The tab is opened first, synchronously, so a popup blocker lets it through.
 */
export async function openQuotePdf(id) {
  const win = window.open('', '_blank');
  try {
    const r = await api.get(`/api/quotes/${id}/pdf`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
    if (win) win.location.href = url; else window.open(url, '_blank', 'noopener');
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (e) {
    if (win) win.close();
    throw e;
  }
}
