import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api, { formatError } from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import { useAuth } from '../../contexts/AuthContext';
import BusinessHeatMap, { MAP_COLORS } from '../../components/BusinessHeatMap';
import { toast } from 'sonner';
import {
  MapPin, Search, Loader2, BadgeCheck, Clock, Hand, Building2,
  Flame, ChevronLeft, ChevronRight, X, MessageSquare, Send,
} from 'lucide-react';

const PER_PAGE = 12;

/* ── Claim modal (tradespeople) ──────────────────────────────────────────── */
function ClaimModal({ business, onClose, onSubmit, saving, t }) {
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4" data-testid="claim-modal">
      <div className="bg-paper rounded-[20px] shadow-2xl max-w-md w-full p-5 animate-slide-up">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-headings font-bold text-ink text-base flex items-center gap-2">
            <Hand size={16} className="text-teal" /> {t('hm_claim_title')}
          </h3>
          <button onClick={onClose} className="p-1 text-ink-muted hover:text-ink" aria-label="close" data-testid="claim-modal-close">
            <X size={18} />
          </button>
        </div>
        <div className="bg-cream-soft rounded-[12px] p-3 mb-3">
          <p className="font-semibold text-sm text-ink">{business.name}</p>
          <p className="text-xs text-ink-muted">{(business.segment || business.category) || ''} · {business.city || '—'}</p>
        </div>
        <p className="text-xs text-ink-muted mb-3">{t('hm_claim_help')}</p>
        <label className="block text-xs font-semibold text-ink-soft mb-1">{t('hm_claim_phone_label')}</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+43 ..."
          className="w-full border border-sm-border rounded-[10px] px-3 py-2 text-sm mb-3 focus:outline-none focus:border-teal"
          data-testid="claim-phone-input"
        />
        <label className="block text-xs font-semibold text-ink-soft mb-1">{t('hm_claim_msg_label')}</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder={t('hm_claim_msg_ph')}
          className="w-full border border-sm-border rounded-[10px] px-3 py-2 text-sm mb-4 focus:outline-none focus:border-teal resize-none"
          data-testid="claim-message-input"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-sm-border text-ink-soft text-sm py-2 rounded-[10px] hover:bg-cream-soft transition-colors">
            {t('btn_cancel') || 'Cancel'}
          </button>
          <button
            onClick={() => onSubmit({ message, contact_phone: phone })}
            disabled={saving}
            className="flex-1 btn-primary text-sm py-2 rounded-[10px] disabled:opacity-50"
            data-testid="claim-submit-btn"
          >
            {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('hm_claim_submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Inquiry modal (homeowners — on-platform message) ──────────────────────── */
function InquiryModal({ business, onClose, t }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (message.trim().length < 5) return;
    setSending(true);
    try {
      await api.post(`/api/directory/businesses/${business.id}/inquire`, { message: message.trim() });
      toast.success(t('fp_msg_sent'));
      onClose();
    } catch (e) { toast.error(formatError(e)); } finally { setSending(false); }
  };
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4" data-testid="message-modal">
      <div className="bg-paper rounded-[20px] shadow-2xl max-w-md w-full p-5 animate-slide-up">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-headings font-bold text-ink text-base flex items-center gap-2">
            <MessageSquare size={16} className="text-teal" /> {t('fp_send_message')}
          </h3>
          <button onClick={onClose} className="p-1 text-ink-muted hover:text-ink" aria-label="close" data-testid="message-modal-close">
            <X size={18} />
          </button>
        </div>
        <div className="bg-cream-soft rounded-[12px] p-3 mb-3">
          <p className="font-semibold text-sm text-ink">{business.name}</p>
          <p className="text-xs text-ink-muted">{(business.segment || business.category) || ''}{business.city ? ` · ${business.city}` : ''}</p>
        </div>
        <p className="text-xs text-ink-muted mb-2">{t('fp_msg_hint')}</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder={t('fp_msg_ph')}
          className="w-full border border-sm-border rounded-[12px] px-3 py-2.5 text-sm mb-4 focus:outline-none focus:border-teal resize-none"
          data-testid="message-input"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-sm-border text-ink-soft text-sm py-2.5 rounded-[12px] hover:bg-cream-soft transition-colors">
            {t('btn_cancel') || 'Cancel'}
          </button>
          <button onClick={send} disabled={sending || message.trim().length < 5} className="flex-1 btn-primary text-sm py-2.5 rounded-[12px] flex items-center justify-center gap-2 disabled:opacity-50" data-testid="message-send-btn">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {t('fp_msg_send')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Business row ────────────────────────────────────────────────────────── */
function BusinessRow({ b, isPro, onClaim, onContact, t }) {
  return (
    <div className="bg-paper border border-sm-border rounded-[14px] p-3 flex items-center gap-3 hover:shadow-sm transition-shadow" data-testid={`business-row-${b.id}`}>
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: b.claimed ? MAP_COLORS.claimed : MAP_COLORS.unclaimed }}
        title={b.claimed ? 'On ServiceMarket' : 'Listed'}
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-ink truncate">{b.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {(b.segment || b.category) && (
            <span className="text-[10px] font-medium bg-teal/10 text-teal px-1.5 py-0.5 rounded-full">{b.segment || b.category}</span>
          )}
          {b.city && (
            <span className="flex items-center gap-1 text-[11px] text-ink-muted"><MapPin size={10} />{b.city}</span>
          )}
        </div>
      </div>
      {isPro ? (
        b.claimed ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-green-pos flex-shrink-0" data-testid={`business-claimed-${b.id}`}>
            <BadgeCheck size={13} /> {t('hm_claimed_badge')}
          </span>
        ) : b.my_claim_status === 'pending' ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-deep flex-shrink-0" data-testid={`business-pending-${b.id}`}>
            <Clock size={13} /> {t('hm_claim_pending')}
          </span>
        ) : (
          <button
            onClick={() => onClaim(b)}
            className="flex-shrink-0 text-[11px] font-semibold text-teal border border-teal/40 px-2.5 py-1.5 rounded-full hover:bg-teal/10 transition-colors"
            data-testid={`business-claim-btn-${b.id}`}
          >
            {t('hm_claim')}
          </button>
        )
      ) : (
        <button
          onClick={() => onContact(b)}
          className="flex-shrink-0 text-[11px] font-semibold text-paper bg-teal px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity flex items-center gap-1"
          data-testid={`business-contact-btn-${b.id}`}
        >
          <MessageSquare size={12} /> {t('hm_contact')}
        </button>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function BusinessMapPage() {
  const { t } = useLang();
  const { user } = useAuth();
  const isPro = user?.role === 'tradesperson';

  const [stats, setStats] = useState({ total: 0, claimed: 0, cities: 0 });
  const [markers, setMarkers] = useState([]);
  const [facets, setFacets] = useState({ segments: [], cities: [] });
  const [loadingMap, setLoadingMap] = useState(true);

  const [businesses, setBusinesses] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(true);

  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [city, setCity] = useState('');

  const [claimTarget, setClaimTarget] = useState(null);
  const [contactTarget, setContactTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadMap = useCallback(async () => {
    setLoadingMap(true);
    try {
      const params = {};
      if (segment) params.segment = segment;
      if (city) params.city = city;
      if (search.trim()) params.q = search.trim();
      const { data } = await api.get('/api/directory/markers', { params });
      setMarkers(data.markers || []);
      setStats({ total: data.total || 0, claimed: data.claimed || 0, unclaimed: data.unclaimed || 0 });
    } catch { /* noop */ } finally { setLoadingMap(false); }
  }, [segment, city, search]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = { page, per_page: PER_PAGE };
      if (segment) params.segment = segment;
      if (city) params.city = city;
      if (search.trim()) params.q = search.trim();
      const { data } = await api.get('/api/directory/businesses', { params });
      setBusinesses(data.businesses || []);
      setTotal(data.total || 0);
    } catch { /* noop */ } finally { setLoadingList(false); }
  }, [page, segment, city, search]);

  useEffect(() => {
    api.get('/api/directory/facets').then(({ data }) => setFacets(data)).catch(() => {});
  }, []);

  useEffect(() => { loadMap(); }, [loadMap]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { setPage(1); }, [segment, city, search]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const submitClaim = async (payload) => {
    if (!claimTarget) return;
    setSaving(true);
    try {
      await api.post(`/api/directory/businesses/${claimTarget.id}/claim`, payload);
      toast.success(t('hm_claim_success'));
      setClaimTarget(null);
      loadList();
    } catch (e) {
      toast.error(formatError(e));
    } finally { setSaving(false); }
  };

  const statCards = useMemo(() => ([
    { label: t('hm_total_pros'), value: stats.total, testid: 'hm-stat-total' },
    { label: t('fp_on_platform'), value: stats.claimed, testid: 'hm-stat-claimed' },
    { label: t('fp_listed'), value: stats.unclaimed, testid: 'hm-stat-unclaimed' },
  ]), [stats, t]);

  return (
    <div className="min-h-screen bg-cream pb-24 pt-4 px-4 md:px-6 max-w-6xl mx-auto" data-testid="business-map-page">
      <div className="mb-5">
        <h1 className="font-headings font-bold text-ink text-2xl flex items-center gap-2">
          <Flame size={22} className="text-teal" /> {t('hm_title')}
        </h1>
        <p className="text-xs text-ink-muted mt-0.5">{t('hm_subtitle')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {statCards.map((s) => (
          <div key={s.label} className="card-lg text-center py-4" data-testid={s.testid}>
            <p className="text-2xl font-headings font-bold text-teal">{loadingMap ? '—' : s.value?.toLocaleString?.() ?? s.value}</p>
            <p className="text-[11px] text-ink-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="card-lg mb-5">
        <BusinessHeatMap
          markers={markers}
          onMarkerClick={(m) => (isPro ? setClaimTarget(m) : setContactTarget(m))}
        />
        {/* Claim-status legend */}
        <div className="flex items-center gap-x-5 gap-y-1.5 mt-3 flex-wrap" data-testid="hm-legend">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: MAP_COLORS.unclaimed }} /> {t('fp_listed')}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: MAP_COLORS.claimed }} /> {t('fp_on_platform')}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('hm_search')}
            className="w-full border border-sm-border rounded-[10px] pl-9 pr-3 py-2 text-sm bg-paper focus:outline-none focus:border-teal"
            data-testid="hm-search-input"
          />
        </div>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className="border border-sm-border rounded-[10px] px-3 py-2 text-sm bg-paper focus:outline-none focus:border-teal max-w-[200px]" data-testid="hm-segment-select">
          <option value="">{t('fp_all_categories')}</option>
          {facets.segments.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={city} onChange={(e) => setCity(e.target.value)} className="border border-sm-border rounded-[10px] px-3 py-2 text-sm bg-paper focus:outline-none focus:border-teal max-w-[160px]" data-testid="hm-city-select">
          <option value="">{t('hm_all_cities')}</option>
          {facets.cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Business list */}
      <div className="space-y-2" data-testid="hm-business-list">
        {loadingList ? (
          <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-teal" /></div>
        ) : businesses.length === 0 ? (
          <p className="text-center py-10 text-ink-muted text-sm" data-testid="hm-no-results">{t('hm_no_results')}</p>
        ) : (
          businesses.map((b) => (
            <BusinessRow key={b.id} b={b} isPro={isPro} onClaim={setClaimTarget} onContact={setContactTarget} t={t} />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-full border border-sm-border disabled:opacity-40 hover:bg-cream-soft transition-colors" data-testid="hm-prev-page">
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-semibold text-ink" data-testid="hm-page-label">{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-full border border-sm-border disabled:opacity-40 hover:bg-cream-soft transition-colors" data-testid="hm-next-page">
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {claimTarget && (
        <ClaimModal business={claimTarget} onClose={() => setClaimTarget(null)} onSubmit={submitClaim} saving={saving} t={t} />
      )}
      {contactTarget && (
        <InquiryModal business={contactTarget} onClose={() => setContactTarget(null)} t={t} />
      )}
    </div>
  );
}
