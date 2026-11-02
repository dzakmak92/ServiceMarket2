import api from '../api/client';
import { quoteLinesFrom, quoteTitleFrom, quoteAssumptionsFrom } from './pricing';

/** Angebot aus einer Folierungs-Kalkulation: Auftrag anlegen, dann das Angebot mit Netto-Positionen. */
export async function createFolierungQuote(input, result, settings) {
  const title = quoteTitleFrom(input);
  const { data: job } = await api.post('/api/jobs', { title, category: 'folierung', mode: 'simple', source: 'manual' });
  const { data: quote } = await api.post('/api/quotes', {
    job_id: job.id, title,
    assumptions: quoteAssumptionsFrom(result),
    lines: quoteLinesFrom(input, result, settings),
  });
  return quote;
}
