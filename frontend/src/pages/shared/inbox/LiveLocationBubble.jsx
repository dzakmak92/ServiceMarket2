import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, ExternalLink, MapPin, RefreshCw } from 'lucide-react';
import api from '../../../api/client';

/** Custom "car with location pin" SVG icon */
function CarPinIcon({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 20 25"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Pin body */}
      <path
        d="M10 1C6.13 1 3 4.13 3 8c0 5.25 7 16 7 16s7-10.75 7-16c0-3.87-3.13-7-7-7z"
        fill="currentColor"
        opacity="0.18"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      {/* Car roof */}
      <path
        d="M7 7.5l1-2h4l1 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Car body */}
      <rect x="6" y="7.5" width="8" height="3" rx="0.8"
        stroke="currentColor" strokeWidth="1.2" fill="none" />
      {/* Wheels */}
      <circle cx="8" cy="10.8" r="0.9" fill="currentColor" />
      <circle cx="12" cy="10.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

// Fix default Leaflet marker icons (webpack asset issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/** Pan the map to new TP position whenever it changes. */
function PanToCenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.panTo([lat, lng], { animate: true, duration: 0.5 });
  }, [lat, lng, map]);
  return null;
}

/** Haversine distance in km between two lat/lng pairs. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Format distance and ETA nicely. */
function etaLabel(distKm) {
  if (distKm == null) return null;
  const mins = Math.round((distKm / 30) * 60); // assume 30 km/h avg urban
  const dist = distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`;
  if (mins < 2) return { dist, eta: '< 2 min' };
  if (mins < 60) return { dist, eta: `~${mins} min` };
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { dist, eta: `~${h}h ${m}m` };
}

const GMAPS_LINK = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

export default function LiveLocationBubble({ msg, t }) {
  const [pos, setPos] = useState({
    lat: msg.lat,
    lng: msg.lng,
    dest_lat: msg.dest_lat ?? null,
    dest_lng: msg.dest_lng ?? null,
    updated_at: null,
  });
  const [isActive, setIsActive] = useState(!msg.session_ended);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!msg.session_id || msg.session_ended) return;
    setRefreshing(true);
    try {
      const { data } = await api.get(`/api/live-location/${msg.session_id}`);
      setIsActive(data.is_active);
      if (data.lat != null && data.lng != null) {
        setPos({
          lat: data.lat,
          lng: data.lng,
          dest_lat: data.dest_lat ?? null,
          dest_lng: data.dest_lng ?? null,
          updated_at: data.updated_at,
        });
      }
    } catch { /* noop */ }
    finally { setRefreshing(false); }
  }, [msg.session_id, msg.session_ended]);

  // Auto-refresh every 5 s while session is active
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [isActive, refresh]);

  // Fetch immediately on mount so ETA shows right away (no 5-second wait)
  useEffect(() => {
    if (isActive && msg.session_id) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { lat, lng, dest_lat, dest_lng } = pos;

  const eta = useMemo(() => {
    if (lat == null || lng == null || dest_lat == null || dest_lng == null) return null;
    const distKm = haversineKm(lat, lng, dest_lat, dest_lng);
    return etaLabel(distKm);
  }, [lat, lng, dest_lat, dest_lng]);

  if (!lat || !lng) {
    return (
      <div className="px-3 py-2 text-xs text-ink-muted flex items-center gap-1.5">
        <MapPin size={12} /> {t?.('live_location_unavailable') || 'Location unavailable'}
      </div>
    );
  }

  const updatedStr = pos.updated_at
    ? new Date(pos.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className="overflow-hidden rounded-[14px] max-w-[300px] w-full border border-teal/20 shadow-sm bg-paper"
      style={{ isolation: 'isolate' }}
      data-testid="live-location-bubble"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-teal/10">
        <div className="flex items-center gap-1.5">
          <Navigation size={13} className={`text-teal ${isActive ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-semibold text-ink">
            {isActive ? (t?.('live_location_active') || 'Live Location') : (t?.('live_location_ended') || 'Location ended')}
          </span>
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-pos animate-ping inline-block" />}
        </div>
        <div className="flex items-center gap-1">
          {isActive && (
            <button
              onClick={refresh}
              disabled={refreshing}
              className="p-1 text-ink-muted hover:text-teal rounded"
              title="Refresh now"
              data-testid="live-location-refresh"
            >
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}
          <a
            href={GMAPS_LINK(lat, lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-ink-muted hover:text-teal rounded"
            title="Open in Google Maps"
            data-testid="live-location-gmaps-link"
          >
            <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* ETA strip — always shown when session is active */}
      {isActive && (
        <div className="px-3 py-2 bg-teal/5 border-b border-teal/10 flex items-center justify-between gap-3" data-testid="live-location-eta">
          <div className="flex items-center gap-1.5">
            <CarPinIcon size={16} className="text-teal flex-shrink-0" />
            {eta ? (
              <>
                <span className="text-xs font-bold text-teal">{eta.eta}</span>
                <span className="text-[10px] text-ink-muted">{t?.('live_location_away') || 'away'}</span>
              </>
            ) : (
              <span className="text-xs font-semibold text-teal">{t?.('live_location_en_route') || 'En route'}</span>
            )}
          </div>
          {eta && <span className="text-[10px] font-mono text-ink-muted">{eta.dist}</span>}
        </div>
      )}

      {/* Interactive Leaflet map */}
      <div style={{ height: '160px', width: '100%' }}>
        <MapContainer
          center={[lat, lng]}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          scrollWheelZoom={false}
          dragging={true}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={[lat, lng]}>
            <Popup>{t?.('live_location_active') || 'Pro is here'}</Popup>
          </Marker>
          <PanToCenter lat={lat} lng={lng} />
        </MapContainer>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-paper flex items-center justify-between">
        <span className="text-[10px] text-ink-muted">
          {updatedStr ? `${t?.('live_location_updated') || 'Updated'} ${updatedStr}` : (t?.('live_location_active') || 'Live')}
        </span>
        <span className="text-[10px] font-mono text-ink-muted">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
      </div>
    </div>
  );
}
