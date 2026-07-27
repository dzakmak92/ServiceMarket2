import React, { useCallback, useEffect, useState } from 'react';
import api, { formatError } from '../api/client';
import BusinessHeatMap from './BusinessHeatMap';
import { toast } from 'sonner';
import {
  Search, Loader2, Hand, CheckCircle2, MapPin, X, Clock, BadgeCheck, Building2,
} from 'lucide-react';

/**
 * Onboarding step for tradespeople: "Claim my business — join the family".
 * Shows the whole directory map (names only) + a searchable list to find &
 * claim their listing. Skippable (claim is optional; handled by the parent's
 * Next button). Claims go to admin approval like the standalone flow.
 */
export default function OnboardingClaimStep({ defaultQuery = '', t }) {
  const [markers, setMarkers] = useState([]);
  const [query, setQuery] = useState(defaultQuery || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [target, setTarget] = useState(null);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimedNames, setClaimedNames] = useState([]);

  useEffect(() => {
    api.get('/api/directory/markers').then(({ data }) => setMarkers(data.markers || [])).catch(() => {});
  }, []);

  const runSearch = useCallback(async (q) => {
    const term = (q ?? '').trim();
    if (term.length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/api/directory/businesses', { params: { q: term, per_page: 8 } });
      setResults(data.businesses || []);
      setSearched(true);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);

  // Auto-search the pre-filled company name on first render.
  useEffect(() => { if (defaultQuery && defaultQuery.trim().length >= 2) runSearch(defaultQuery); }, [defaultQuery, runSearch]);

  const submitClaim = async () => {
    if (!target) return;
    setClaiming(true);
    try {
      await api.post(`/api/directory/businesses/${target.id}/claim`, { message, contact_phone: phone });
      setClaimedNames((n) => [...n, target.name]);
      setTarget(null); setPhone(''); setMessage('');
      runSearch(query);
    } catch (e) {
      toast.error(formatError(e));
    } finally { setClaiming(false); }
  };

  return (
    <div data-testid="onboarding-claim-step">
      <h2 className="font-headings font-bold text-ink text-lg flex items-center gap-2">
        <Hand size={18} className="text-teal" /> {t('onb_claim_title')}
      </h2>
      <p className="text-ink-muted text-sm mt-1">{t('onb_claim_sub')}</p>

      {claimedNames.length > 0 && (
        <div className="mt-3 rounded-[14px] bg-green-50 border border-green-pos/30 p-3 flex items-start gap-2.5" data-testid="onboarding-claim-success">
          <CheckCircle2 size={16} className="text-green-pos flex-shrink-0 mt-0.5" />
          <p className="text-xs text-ink leading-relaxed">
            {t('onb_claim_submitted').replace('{name}', claimedNames.join(', '))}
          </p>
        </div>
      )}

      {/* Map (names only) */}
      <div className="mt-4">
        <BusinessHeatMap markers={markers} height={240} />
      </div>

      {/* Search */}
      <div className="relative mt-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runSearch(query); }}
          placeholder={t('onb_claim_search_ph')}
          className="sm-input pl-9 w-full"
          data-testid="onboarding-claim-search"
        />
      </div>
      <p className="text-[11px] text-ink-muted mt-1.5">{t('onb_claim_optional')}</p>

      {/* Results */}
      <div className="mt-3 space-y-2" data-testid="onboarding-claim-results">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={22} className="animate-spin text-teal" /></div>
        ) : searched && results.length === 0 ? (
          <p className="text-center py-6 text-sm text-ink-muted" data-testid="onboarding-claim-none">{t('onb_claim_none')}</p>
        ) : (
          results.map((b) => (
            <div key={b.id} className="bg-paper border border-sm-border rounded-[12px] p-3 flex items-center gap-3" data-testid={`onboarding-claim-row-${b.id}`}>
              <Building2 size={16} className="text-teal flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-ink truncate">{b.name}</p>
                <p className="text-[11px] text-ink-muted flex items-center gap-1">
                  {(b.segment || b.category) && <span>{b.segment || b.category}</span>}
                  {b.city && <><MapPin size={9} /> {b.city}</>}
                </p>
              </div>
              {b.claimed ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-green-pos flex-shrink-0">
                  <BadgeCheck size={13} /> {t('onb_claim_on')}
                </span>
              ) : b.my_claim_status === 'pending' ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-deep flex-shrink-0">
                  <Clock size={13} /> {t('onb_claim_pending')}
                </span>
              ) : (
                <button
                  onClick={() => setTarget(b)}
                  className="flex-shrink-0 text-[11px] font-semibold text-teal border border-teal/40 px-2.5 py-1.5 rounded-full hover:bg-teal/10 transition-colors"
                  data-testid={`onboarding-claim-btn-${b.id}`}
                >
                  {t('onb_claim_btn')}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Claim confirmation modal */}
      {target && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4" data-testid="onboarding-claim-modal">
          <div className="bg-paper rounded-[20px] shadow-2xl max-w-md w-full p-5 animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headings font-bold text-ink text-base flex items-center gap-2">
                <Hand size={16} className="text-teal" /> {t('onb_claim_form_title')}
              </h3>
              <button onClick={() => setTarget(null)} className="p-1 text-ink-muted hover:text-ink" aria-label="close" data-testid="onboarding-claim-modal-close">
                <X size={18} />
              </button>
            </div>
            <div className="bg-cream-soft rounded-[12px] p-3 mb-3">
              <p className="font-semibold text-sm text-ink">{target.name}</p>
              <p className="text-xs text-ink-muted">{(target.segment || target.category) || ''}{target.city ? ` · ${target.city}` : ''}</p>
            </div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">{t('hm_claim_phone_label')}</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+43 ..."
              className="w-full border border-sm-border rounded-[10px] px-3 py-2 text-sm mb-3 focus:outline-none focus:border-teal"
              data-testid="onboarding-claim-phone"
            />
            <label className="block text-xs font-semibold text-ink-soft mb-1">{t('hm_claim_msg_label')}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder={t('hm_claim_msg_ph')}
              className="w-full border border-sm-border rounded-[10px] px-3 py-2 text-sm mb-4 focus:outline-none focus:border-teal resize-none"
              data-testid="onboarding-claim-message"
            />
            <div className="flex gap-2">
              <button onClick={() => setTarget(null)} className="flex-1 border border-sm-border text-ink-soft text-sm py-2 rounded-[10px] hover:bg-cream-soft transition-colors">
                {t('btn_cancel') || 'Cancel'}
              </button>
              <button
                onClick={submitClaim}
                disabled={claiming}
                className="flex-1 btn-primary text-sm py-2 rounded-[10px] disabled:opacity-50"
                data-testid="onboarding-claim-submit"
              >
                {claiming ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('hm_claim_submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
