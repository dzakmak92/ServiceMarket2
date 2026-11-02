import api from '../api/client';
import { quoteLinesFrom, quoteTitleFrom, quoteAssumptionsFrom } from './pricing';

/** Angebot aus einer Folierungs-Kalkulation: Auftrag anlegen, dann das Angebot mit Netto-Positionen.
   Kommt die Kalkulation von einem bestehenden Auftrag (`?job=`), landet das
   Angebot dort statt auf einem neuen Zwilling. */
export async function createFolierungQuote(input, result, settings, { jobId } = {}) {
  const title = quoteTitleFrom(input);
  let id = jobId;
  if (!id) {
    const { data: job } = await api.post('/api/jobs', { title, category: 'folierung', mode: 'simple', source: 'manual' });
    id = job.id;
  }
  const { data: quote } = await api.post('/api/quotes', {
    job_id: id, title,
    assumptions: quoteAssumptionsFrom(result),
    lines: quoteLinesFrom(input, result, settings),
  });
  return quote;
}
