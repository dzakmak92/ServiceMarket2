import React from 'react';
import { useLang } from '../../contexts/LangContext';
import Footer from '../../components/Footer';

/**
 * Shared layout for static legal pages.
 * Long-form prose, narrow column, sticky table of contents on the side at lg+.
 */
export default function LegalPageLayout({ title, version, lastUpdated, children, toc = [] }) {
  const { t } = useLang();
  return (
    <div className="min-h-screen bg-cream flex flex-col" data-testid="legal-page-layout">
      <div className="flex-1">
        <div className="page-container py-10 max-w-6xl">
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-headings font-bold text-ink">{title}</h1>
            <p className="text-xs text-ink-muted mt-2 font-mono">
              {t('legal_version')} {version} · {t('legal_updated')} {lastUpdated}
            </p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-8">
            {/* Main content */}
            <article className="card-lg prose prose-sm sm:prose-base max-w-none prose-headings:font-headings prose-headings:font-bold prose-headings:text-ink prose-p:text-ink-soft prose-li:text-ink-soft prose-strong:text-ink">
              {children}
            </article>

            {/* TOC */}
            {toc.length > 0 && (
              <nav className="hidden lg:block sticky top-24 self-start text-xs space-y-1.5" aria-label={t('legal_toc')}>
                <p className="font-semibold uppercase tracking-wider text-ink-muted mb-2">{t('legal_contents')}</p>
                {toc.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="block text-ink-muted hover:text-teal transition-colors leading-snug"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
