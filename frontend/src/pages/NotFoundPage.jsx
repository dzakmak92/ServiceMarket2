import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Compass, ArrowLeft, Home } from 'lucide-react';
import { useLang } from '../contexts/LangContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * Shown for any URL the router does not know.
 *
 * Unknown paths used to redirect to `/` without a word, so a broken link
 * looked exactly like a working one that happened to land on the home
 * screen. Saying so, and showing the path, makes a dead link visible to the
 * person who hit it — and gives them the two ways out they actually want.
 */
export default function NotFoundPage() {
  const { t } = useLang();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-paper flex items-center justify-center px-4 py-16 pb-28" data-testid="not-found">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-teal/10 text-teal">
          <Compass className="h-8 w-8" strokeWidth={1.8} aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-bold text-ink">{t('notfound_title')}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t('notfound_sub')}</p>
        <p className="mt-3 inline-block max-w-full truncate rounded-lg bg-cream-deep px-3 py-1.5 font-mono text-xs text-ink-muted">
          {location.pathname}
        </p>
        <div className="mt-7 grid gap-2.5">
          <Link to="/" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal px-5 font-semibold text-white">
            <Home className="h-4 w-4" aria-hidden />
            {t(user ? 'notfound_home' : 'notfound_home_public')}
          </Link>
          {canGoBack && (
            <button type="button" onClick={() => navigate(-1)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 font-semibold text-ink ring-1 ring-ink/15">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t('notfound_back')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
