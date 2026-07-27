import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import { Hammer, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // login | register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // GDPR / Austrian-law consent
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const { login, register, formatError } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let user;
      if (mode === 'login') {
        user = await login(email, password);
      } else {
        if (!name.trim()) { setError('Name is required'); setLoading(false); return; }
        if (!acceptedTerms || !acceptedPrivacy) {
          setError(t('auth_consent_required'));
          setLoading(false);
          return;
        }
        user = await register(email, password, name, {
          accepted_terms: true,
          accepted_privacy: true,
          marketing_opt_in: marketingOptIn,
          policy_version: '1.0-draft-2026-02-28',
        });
      }
      if (!user.onboarding_complete) {
        navigate('/onboarding');
      } else {
        navigate('/');
      }
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-teal-deep flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute rounded-full border border-paper"
              style={{ width: `${(i+1)*120}px`, height: `${(i+1)*120}px`, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} />
          ))}
        </div>
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-paper/20 rounded-[14px] flex items-center justify-center">
            <Hammer size={20} className="text-paper" strokeWidth={1.5} />
          </div>
          <span className="text-paper font-headings font-bold text-xl">ServiceMarket</span>
        </div>
        <div className="relative">
          <h2 className="text-paper font-headings font-bold text-4xl leading-tight">
            Find trusted pros.<br />Get the job done.
          </h2>
          <p className="text-paper/70 mt-4 text-lg">
            Europe's marketplace for local tradespeople.
          </p>
          <div className="flex gap-6 mt-8">
            {[['50K+', 'Verified Pros'], ['200K+', 'Jobs Done'], ['4.8', 'Avg Rating']].map(([num, label]) => (
              <div key={label}>
                <p className="text-paper font-headings font-bold text-2xl">{num}</p>
                <p className="text-paper/60 text-sm">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-paper/40 text-xs relative">GDPR compliant · Trusted by 200K+ users</p>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-slide-up">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-teal rounded-[14px] flex items-center justify-center">
              <Hammer size={16} className="text-paper" strokeWidth={1.5} />
            </div>
            <span className="font-headings font-bold text-lg text-ink">ServiceMarket</span>
          </div>

          <h1 className="text-3xl font-headings font-bold text-ink mb-1">
            {mode === 'login' ? t('auth_welcome') : t('auth_create_account')}
          </h1>
          <p className="text-ink-muted mb-8">
            {mode === 'login' ? t('auth_no_account') : t('auth_have_account')} {' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-teal font-semibold hover:underline"
              data-testid="toggle-auth-mode"
            >
              {mode === 'login' ? t('auth_sign_up') : t('auth_sign_in')}
            </button>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">{t('auth_name')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Anna Müller"
                  className="sm-input"
                  required
                  data-testid="register-name-input"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t('auth_email')}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="sm-input"
                required
                data-testid="auth-email-input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t('auth_password')}</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="sm-input pr-12"
                  required
                  minLength={6}
                  data-testid="auth-password-input"
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-[14px] px-4 py-3 text-sm text-red-warn" data-testid="auth-error">
                {error}
              </div>
            )}

            {/* GDPR consent — required for registration only */}
            {mode === 'register' && (
              <div className="space-y-2.5 pt-2" data-testid="consent-checkboxes">
                <label className="flex items-start gap-2.5 text-xs text-ink-soft leading-relaxed cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-teal flex-shrink-0"
                    data-testid="consent-terms"
                  />
                  <span>
                    I have read and accept the{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-teal hover:underline font-medium">
                      Terms of Service
                    </a> *
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-xs text-ink-soft leading-relaxed cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedPrivacy}
                    onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-teal flex-shrink-0"
                    data-testid="consent-privacy"
                  />
                  <span>
                    I have read and accept the{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-teal hover:underline font-medium">
                      Privacy Policy
                    </a> *
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-xs text-ink-soft leading-relaxed cursor-pointer">
                  <input
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={(e) => setMarketingOptIn(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-teal flex-shrink-0"
                    data-testid="consent-marketing"
                  />
                  <span>
                    Send me product updates and tips (optional, you can unsubscribe anytime)
                  </span>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (mode === 'register' && (!acceptedTerms || !acceptedPrivacy))}
              className="btn-primary w-full py-3.5 mt-2"
              data-testid="auth-submit-button"
            >
              {loading
                ? (mode === 'login' ? t('auth_signing_in') : t('auth_creating'))
                : (mode === 'login' ? t('auth_sign_in') : t('auth_sign_up'))
              }
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-4 bg-cream-soft rounded-[14px] border border-sm-border">
            <p className="text-xs font-semibold text-ink-muted mb-2 uppercase tracking-wide">Demo accounts</p>
            <div className="space-y-1 text-xs text-ink-soft">
              <p><span className="font-medium">Homeowner:</span> homeowner@test.com · Test123!</p>
              <p><span className="font-medium">Pro:</span> pro@test.com · Test123!</p>
              <p><span className="font-medium">Admin:</span> admin@servicemarket.eu · Admin123!</p>
            </div>
          </div>

          <p className="text-center text-xs text-ink-faint mt-6">
            By signing up, you agree to our{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-muted">Terms</a> and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-muted">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}
