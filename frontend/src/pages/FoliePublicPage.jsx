import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import FolierungWizard from '../folierung/FolierungWizard';
import { loadSettings } from '../folierung/store';
import { vatLabel } from '../folierung/pricing';

/**
 * /folie/:slug — die Kundenseite. Kein Login, kein Header, keine internen
 * Zahlen. Das ist das Gegenstück zu retrena.de/kueche-folieren-lassen/#rechner,
 * nur für alle Oberflächen.
 *
 * Die Einstellungen kommen heute aus `loadSettings()` (localStorage des
 * Browsers, der sie zuletzt gespeichert hat); mit dem Backend liest diese
 * Seite `GET /api/public/folie/{slug}` — siehe memory/FOLIERUNG.md. Bis dahin
 * sieht ein fremder Browser die Vorgabepreise.
 */
export default function FoliePublicPage() {
  const { slug } = useParams();
  const [settings] = useState(loadSettings);
  const name = settings.businessName || 'Folierung';

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-paper/80 backdrop-blur border-b border-sm-border">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="font-headings font-bold text-ink text-xl tracking-tight">{name}</div>
          <div className="text-xs text-ink-muted">Preisrechner</div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 pb-28" data-testid={`folie-public-${slug}`}>
        <div className="mb-8">
          <div className="text-[11px] tracking-[0.18em] uppercase text-amber-text font-bold">Folierungsrechner</div>
          <h1 className="font-headings text-3xl text-ink leading-tight mt-1">Berechne den Preis für deine Flächen</h1>
          <p className="text-ink-muted mt-2">Vier Schritte, drei Wege zum Preis.</p>
        </div>
        <FolierungWizard audience="customer" settings={settings} />

        <section className="mt-12 rounded-2xl border-l-4 border-amber bg-paper p-6">
          <div className="text-[11px] tracking-[0.18em] uppercase text-amber-text font-bold">Auf einen Blick</div>
          <h2 className="font-headings text-2xl text-ink mt-1">Was Folieren kostet und bringt</h2>
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[['1–3 Tage', 'Montage vor Ort'], ['10 Jahre', 'Foliengarantie'], ['500+', 'Dekore, ein Preis'], ['24 Stunden', 'bis zum Festpreis']].map(([a, b]) => (
              <div key={b} className="rounded-xl bg-cream px-4 py-4 text-center">
                <div className="font-headings font-bold text-ink text-xl">{a}</div>
                <div className="text-xs text-ink-muted mt-0.5">{b}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-ink mt-5">Folieren heißt: Fronten, Platten und sichtbare Flächen werden mit einer selbstklebenden Architekturfolie bezogen. Kein Abbau, kein Staub, kein Neukauf. Der Untergrund wird gereinigt, Kanten werden grundiert, die Folie wird warm um jede Kante gelegt.</p>
        </section>
        <footer className="text-xs text-ink-muted text-center mt-10">Richtwerte {vatLabel(settings.vat)}. Verbindlich wird der Preis nach Foto-Einschätzung oder Aufmaß.</footer>
      </main>
    </div>
  );
}
