import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api, { formatError } from '../api/client';
import { useLang } from '../contexts/LangContext';
import { Hammer, Loader2, MailCheck, KeyRound, ArrowLeft } from 'lucide-react';

/**
 * Ask for a reset link, and redeem one.
 *
 * Both halves live here because they are the same screen to a user: the mail
 * they receive lands back on this URL with `?token=`, and splitting it across
 * two routes would mean two near-identical pages.
 *
 * The request half deliberately shows the same confirmation whether or not
 * the address has an account. Any difference in wording, status or timing
 * would make this a way to discover who is registered, and these are
 * tradespeople whose business address is their livelihood.
 */
export default function ForgotPasswordPage() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const request = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      setError(formatError(err));
    } finally { setBusy(false); }
  };

  const reset = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return setError(t('pw_too_short'));
    if (pw !== again) return setError(t('pw_mismatch'));
    setBusy(true); setError('');
    try {
      await api.post('/api/auth/reset-password', { token, new_password: pw });
      // The endpoint signs the session in, so there is nowhere to send them
      // but into the app.
      navigate('/', { replace: true });
    } catch (err) {
      setError(formatError(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 bg-teal rounded-[14px] flex items-center justify-center">
            <Hammer size={16} className="text-paper" strokeWidth={1.5} />
          </div>
          <span className="font-headings font-bold text-lg text-ink">
            Service<span className="text-teal">Market</span>
          </span>
        </div>

        <div className="card-lg">
          {token ? (
            <form onSubmit={reset} className="space-y-4" data-testid="reset-form">
              <div>
                <h1 className="font-headings font-bold text-ink text-2xl">
                  {t('auth_reset_title')}
                </h1>
                <p className="text-sm text-ink-muted mt-1">{t('auth_reset_help')}</p>
              </div>
              <div>
                <label htmlFor="pw" className="block text-sm font-medium text-ink mb-1.5">
                  {t('pw_new')}
                </label>
                <input id="pw" type="password" autoComplete="new-password" required
                       className="sm-input w-full" value={pw}
                       onChange={(e) => setPw(e.target.value)} data-testid="reset-pw" />
              </div>
              <div>
                <label htmlFor="pw2" className="block text-sm font-medium text-ink mb-1.5">
                  {t('pw_repeat')}
                </label>
                <input id="pw2" type="password" autoComplete="new-password" required
                       className="sm-input w-full" value={again}
                       onChange={(e) => setAgain(e.target.value)} data-testid="reset-pw2" />
              </div>
              {error && <p className="text-sm text-red-warn" data-testid="reset-error">{error}</p>}
              <button type="submit" disabled={busy} className="btn-primary w-full py-3"
                      data-testid="reset-submit">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                {t('auth_reset_submit')}
              </button>
            </form>
          ) : sent ? (
            <div className="text-center py-4" data-testid="forgot-sent">
              <MailCheck size={32} className="mx-auto text-green-text mb-3" />
              <h1 className="font-headings font-bold text-ink text-xl">
                {t('auth_forgot_sent_title')}
              </h1>
              <p className="text-sm text-ink-muted mt-2">{t('auth_forgot_sent_help')}</p>
              <Link to="/auth" className="btn-ghost text-sm mt-5 inline-flex">
                <ArrowLeft size={14} /> {t('auth_back_to_signin')}
              </Link>
            </div>
          ) : (
            <form onSubmit={request} className="space-y-4" data-testid="forgot-form">
              <div>
                <h1 className="font-headings font-bold text-ink text-2xl">
                  {t('auth_forgot_title')}
                </h1>
                <p className="text-sm text-ink-muted mt-1">{t('auth_forgot_help')}</p>
              </div>
              <div>
                <label htmlFor="fp-email" className="block text-sm font-medium text-ink mb-1.5">
                  {t('email')}
                </label>
                <input id="fp-email" type="email" required autoFocus
                       className="sm-input w-full" value={email}
                       onChange={(e) => setEmail(e.target.value)}
                       placeholder="you@example.com" data-testid="forgot-email" />
              </div>
              {error && <p className="text-sm text-red-warn">{error}</p>}
              <button type="submit" disabled={busy || !email.trim()}
                      className="btn-primary w-full py-3" data-testid="forgot-submit">
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                {t('auth_forgot_submit')}
              </button>
              <Link to="/auth" className="block text-center text-xs text-ink-muted hover:text-teal">
                {t('auth_back_to_signin')}
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
