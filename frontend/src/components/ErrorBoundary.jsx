import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * The app had none, and one render bug cost the whole screen.
 *
 * `OverviewTab` read a field the API stopped returning and threw on render.
 * React's default response to an uncaught error is to unmount the entire
 * tree, so a tradesperson opening any job saw a white page — not a broken
 * panel, not an error, a blank browser window with no way back except the
 * back button. A boundary turns that into one broken card.
 *
 * Deliberately plain: no error reporting service, no stack trace on screen.
 * The message says what happened and offers the two things that actually
 * help — reload, and go back — in the user's language where a `t` is passed.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept: without it the only trace of a production render crash is the
    // absence of a screen.
    // eslint-disable-next-line no-console
    console.error('render error', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    // `t` returns the key itself when a translation is missing, so a bare
    // t() here could put `error_boundary_title` on screen at exactly the
    // moment the user is least able to interpret it. The German text is the
    // fallback, and the keys below exist in all four languages.
    const raw = this.props.t;
    const t = (key, fallback) => {
      const v = raw ? raw(key) : key;
      return !v || v === key ? fallback : v;
    };
    return (
      <div className="card-lg text-center py-10" data-testid="error-boundary">
        <AlertTriangle size={32} className="mx-auto text-amber-deep mb-3" />
        <p className="font-headings font-bold text-ink">
          {t('error_boundary_title', 'Diese Ansicht konnte nicht geladen werden.')}
        </p>
        <p className="text-sm text-ink-muted mt-1 mb-4">
          {t('error_boundary_body',
            'Ihre Daten sind sicher gespeichert. Bitte laden Sie die Seite neu.')}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary text-sm inline-flex"
          data-testid="error-boundary-reload"
        >
          <RefreshCw size={14} /> {t('error_boundary_reload', 'Neu laden')}
        </button>
      </div>
    );
  }
}
