import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import { toast } from 'sonner';
import api, { formatError } from '../../api/client';
import ProCard from '../../components/ProCard';
import BusinessHeatMap from '../../components/BusinessHeatMap';
import {
  Search, Loader2, MapPin, Navigation, X, MessageSquare, Crosshair,
  Send, ShieldCheck,
} from 'lucide-react';

const RADII = [10, 25, 50, 100];

/** Great-circle distance in km between two [lat,lng] points. */
function haversineKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

/* ── Message modal — on-platform contact (lead capture) ────────────────────── */
function MessageModal({ business, onClose, t }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (message.trim().length < 5) return;
    setSending(true);
    try {
      await api.post(`/api/directory/businesses/${business.id}/inquire`, { message: message.trim() });
      toast.success(t('fp_msg_sent'));
      onClose();
    } catch (e) {
      toast.error(formatError(e));
    } finally { setSending(false); }
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
          <p className="text-xs text-ink-muted">{business.segment}{business.city ? ` · ${business.city}` : ''}</p>
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
          <button
            onClick={send}
            disabled={sending || message.trim().length < 5}
            className="flex-1 btn-primary text-sm py-2.5 rounded-[12px] flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="message-send-btn"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {t('fp_msg_send')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Map summary line (kept deliberately simple) ───────────────────────────── */
function MapLegend({ total, gpsOn, shownCount, radiusKm, t }) {
  const k = Math.max(1, Math.floor((total || 0) / 1000));
  const label = gpsOn
    ? t('fp_pros_near').replace('{n}', shownCount).replace('{r}', radiusKm)
    : t('fp_pros_total').replace('{n}', k);
  return (
    <div className="mt-3 flex items-center justify-between flex-wrap gap-2 bg-cream-soft/60 border border-sm-border rounded-[14px] px-4 py-3" data-testid="fp-legend">
      <p className="text-sm font-headings font-bold text-ink flex items-center gap-2" data-testid="fp-count">
        <MapPin size={15} className="text-teal" /> {label}
      </p>
      <p className="text-[11px] text-ink-muted flex items-center gap-1.5">
        <MessageSquare size={11} className="text-teal" /> {t('fp_tap_hint')}
      </p>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function FindProsPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  // Registered ServiceMarket pros
  const [pros, setPros] = useState([]);
  const [loadingPros, setLoadingPros] = useState(true);
  const [search, setSearch] = useState('');

  // Directory map
  const [markers, setMarkers] = useState([]);
  const [meta, setMeta] = useState({ total: 0, claimed: 0, unclaimed: 0 });
  const [facets, setFacets] = useState({ segments: [] });
  const [segment, setSegment] = useState('');

  // GPS
  const [myLocation, setMyLocation] = useState(null); // [lat, lng]
  const [gpsState, setGpsState] = useState('idle'); // idle | locating | on | denied | error
  const [radiusKm, setRadiusKm] = useState(25);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [geocoding, setGeocoding] = useState(false);

  const [messageTarget, setMessageTarget] = useState(null);

  /* Fetch directory facets once */
  useEffect(() => {
    api.get('/api/directory/facets').then((r) => setFacets(r.data)).catch(() => {});
  }, []);

  const fetchPros = useCallback(async () => {
    setLoadingPros(true);
    try {
      const { data } = await api.get('/api/pros');
      setPros(data.pros || []);
    } catch { /* noop */ } finally { setLoadingPros(false); }
  }, []);

  const fetchMarkers = useCallback(async () => {
    try {
      const params = {};
      if (segment) params.segment = segment;
      if (search.trim()) params.q = search.trim();
      if (myLocation) { params.lat = myLocation[0]; params.lng = myLocation[1]; params.radius_km = radiusKm; }
      const { data } = await api.get('/api/directory/markers', { params });
      setMarkers(data.markers || []);
      setMeta({ total: data.total || 0, claimed: data.claimed || 0, unclaimed: data.unclaimed || 0 });
    } catch { /* noop */ }
  }, [segment, search, myLocation, radiusKm]);

  useEffect(() => { fetchPros(); }, [fetchPros]);
  useEffect(() => { fetchMarkers(); }, [fetchMarkers]);

  /* GPS + manual fallback */
  const openManual = useCallback(() => {
    setManualOpen(true);
    setManualQuery((q) => q || user?.city || '');
  }, [user?.city]);

  const requestLocation = () => {
    if (gpsState === 'on') { setMyLocation(null); setGpsState('idle'); setManualOpen(false); return; }
    if (!navigator.geolocation) { setGpsState('error'); openManual(); return; }
    setGpsState('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMyLocation([pos.coords.latitude, pos.coords.longitude]); setGpsState('on'); setManualOpen(false); },
      (err) => { setGpsState(err.code === 1 ? 'denied' : 'error'); openManual(); },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  };

  const geocodeManual = async () => {
    const q = manualQuery.trim();
    if (q.length < 2) return;
    setGeocoding(true);
    try {
      const { data } = await api.get('/api/directory/geocode', { params: { q } });
      if (typeof data?.lat === 'number' && typeof data?.lng === 'number') {
        setMyLocation([data.lat, data.lng]); setGpsState('on'); setManualOpen(false);
      } else { setGpsState('error'); }
    } catch { setGpsState('error'); } finally { setGeocoding(false); }
  };

  const gpsOn = gpsState === 'on' && !!myLocation;

  /* Pros with badges → distance-annotated, filtered & sorted when GPS active */
  const displayPros = useMemo(() => {
    const withDist = pros.map((p) => {
      const lat = p.service_center_lat, lng = p.service_center_lng;
      const d = gpsOn && typeof lat === 'number' && typeof lng === 'number'
        ? haversineKm(myLocation, [lat, lng]) : null;
      return { ...p, distance_km: typeof d === 'number' ? d : undefined };
    });
    if (!gpsOn) return withDist;
    return withDist
      .filter((p) => p.distance_km === undefined || p.distance_km <= radiusKm)
      .sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
  }, [pros, gpsOn, myLocation, radiusKm]);

  const proMarkers = useMemo(() => (
    pros
      .filter((p) => typeof p.service_center_lat === 'number' && typeof p.service_center_lng === 'number')
      .filter((p) => !gpsOn || haversineKm(myLocation, [p.service_center_lat, p.service_center_lng]) <= radiusKm)
      .map((p) => ({
        id: p.id || p.user_id, user_id: p.user_id,
        business_name: p.business_name, name: p.name,
        lat: p.service_center_lat, lng: p.service_center_lng,
      }))
  ), [pros, gpsOn, myLocation, radiusKm]);

  const visibleMarkers = useMemo(() => {
    if (!gpsOn) return markers;
    return markers.filter((m) => haversineKm(myLocation, [m.lat, m.lng]) <= radiusKm);
  }, [markers, gpsOn, myLocation, radiusKm]);

  const filteredPros = displayPros.filter((p) =>
    !search ||
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.business_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.service_categories || []).some((c) => (c || '').toLowerCase().includes(search.toLowerCase()))
  );

  const gpsLabel = gpsState === 'locating' ? t('fp_locating')
    : gpsOn ? t('fp_clear_location')
    : t('fp_use_location');

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8">
      <div className="page-container py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <h1 className="text-3xl font-headings font-bold text-ink">{t('nav_find_pros')}</h1>
            <p className="text-ink-muted mt-1">{t('fp_subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={requestLocation}
              disabled={gpsState === 'locating'}
              className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-full transition-colors disabled:opacity-60
                ${gpsOn ? 'bg-teal text-paper hover:opacity-90' : 'border border-teal text-teal hover:bg-teal/10'}`}
              data-testid="gps-toggle-btn"
            >
              {gpsState === 'locating' ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} />}
              {gpsLabel}
            </button>
            {!gpsOn && (
              <button
                onClick={() => (manualOpen ? setManualOpen(false) : openManual())}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-full border border-sm-border text-ink-soft hover:bg-cream-soft transition-colors"
                data-testid="manual-location-toggle"
              >
                <MapPin size={15} /> {t('fp_enter_manually')}
              </button>
            )}
          </div>
        </div>

        {(gpsState === 'denied' || gpsState === 'error') && (
          <div className="mb-3 text-sm text-red-warn bg-red-50 border border-red-warn/30 rounded-[14px] px-4 py-2.5" data-testid="gps-error">
            {gpsState === 'denied' ? t('fp_location_denied') : t('fp_location_unavailable')}
          </div>
        )}

        {/* Manual location entry (GPS fallback) */}
        {manualOpen && !gpsOn && (
          <div className="mb-4 bg-paper border border-sm-border rounded-[14px] p-3" data-testid="manual-location-form">
            <p className="text-xs text-ink-muted mb-2">{t('fp_manual_hint')}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') geocodeManual(); }}
                  placeholder={t('fp_manual_ph')}
                  className="sm-input pl-9 w-full"
                  data-testid="manual-location-input"
                />
              </div>
              <button
                onClick={geocodeManual}
                disabled={geocoding || manualQuery.trim().length < 2}
                className="btn-primary text-sm px-4 py-2.5 rounded-full flex items-center gap-2 disabled:opacity-50"
                data-testid="manual-location-go"
              >
                {geocoding ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} />}
                {t('fp_locate')}
              </button>
            </div>
          </div>
        )}

        {/* GPS radius bar */}
        {gpsOn && (
          <div className="flex items-center gap-3 flex-wrap mb-4 bg-teal/5 border border-teal/20 rounded-[14px] px-4 py-2.5" data-testid="gps-active-bar">
            <span className="text-sm font-semibold text-teal flex items-center gap-1.5">
              <Navigation size={14} /> {t('fp_location_on')}
            </span>
            <span className="text-xs text-ink-muted">{t('fp_within')}</span>
            <div className="flex items-center gap-1">
              {RADII.map((r) => (
                <button
                  key={r}
                  onClick={() => setRadiusKm(r)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors
                    ${radiusKm === r ? 'bg-teal text-paper' : 'bg-paper border border-sm-border text-ink-soft hover:bg-cream-soft'}`}
                  data-testid={`radius-${r}`}
                >
                  {r} km
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('hm_search')}
              className="sm-input pl-10 w-full"
              data-testid="pros-search-input"
            />
          </div>
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            className="sm-select w-auto min-w-[200px]"
            data-testid="fp-category-select"
          >
            <option value="">{t('fp_all_categories')}</option>
            {facets.segments.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Map + clean stats legend */}
        <div className="card-lg mb-6">
          <BusinessHeatMap
            markers={visibleMarkers}
            proMarkers={proMarkers}
            userLocation={gpsOn ? myLocation : null}
            radiusKm={radiusKm}
            onMarkerClick={(m) => setMessageTarget(m)}
            onProClick={(p) => navigate(`/pros/${p.user_id || p.id}`)}
            height={420}
          />
          <MapLegend total={meta.total} gpsOn={gpsOn} shownCount={visibleMarkers.length} radiusKm={radiusKm} t={t} />
        </div>

        {/* Verified professionals */}
        <section>
          <h2 className="font-headings font-bold text-ink text-lg mb-3 flex items-center gap-2">
            <ShieldCheck size={18} className="text-teal" /> {t('fp_our_pros')}
            <span className="text-xs font-medium text-ink-muted">({filteredPros.length} {t('fp_pros_count')})</span>
          </h2>
          {loadingPros ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="card-md animate-pulse h-32 bg-cream-deep" />)}
            </div>
          ) : filteredPros.length === 0 ? (
            <div className="card-lg text-center py-10 text-sm text-ink-muted" data-testid="fp-no-pros">{t('fp_no_pros')}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="fp-pros-grid">
              {filteredPros.map((pro) => <ProCard key={pro.id || pro.user_id} pro={pro} />)}
            </div>
          )}
        </section>
      </div>

      {messageTarget && (
        <MessageModal business={messageTarget} onClose={() => setMessageTarget(null)} t={t} />
      )}
    </div>
  );
}
