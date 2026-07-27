import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Circle, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default-marker icon path (Leaflet's CRA quirk)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Approx geocodes for major Austrian + EU cities so the map can center sensibly
// even when the pro hasn't picked a precise center yet. Fallback: Vienna.
const CITY_FALLBACK = {
  Wien: [48.2082, 16.3738], Vienna: [48.2082, 16.3738],
  Graz: [47.0707, 15.4395], Linz: [48.3069, 14.2858],
  Salzburg: [47.8095, 13.0550], Innsbruck: [47.2692, 11.4041],
  Klagenfurt: [46.6249, 14.3050], Villach: [46.6111, 13.8558],
  Wels: [48.1573, 14.0291],
  Berlin: [52.5200, 13.4050], München: [48.1351, 11.5820], Munich: [48.1351, 11.5820],
  Hamburg: [53.5511, 9.9937], Köln: [50.9375, 6.9603],
  Zürich: [47.3769, 8.5417], Bern: [46.9480, 7.4474], Geneva: [46.2044, 6.1432],
  Madrid: [40.4168, -3.7038], Barcelona: [41.3851, 2.1734],
  Istanbul: [41.0082, 28.9784], Ankara: [39.9334, 32.8597],
};

function ClickHandler({ onPick }) {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

export default function ServiceRadiusPicker({ proForm, setProForm, user, t }) {
  const initialCenter = useMemo(() => {
    if (proForm.service_center_lat != null && proForm.service_center_lng != null) {
      return [proForm.service_center_lat, proForm.service_center_lng];
    }
    const city = user?.city;
    if (city && CITY_FALLBACK[city]) return CITY_FALLBACK[city];
    return CITY_FALLBACK.Vienna;
  }, [proForm.service_center_lat, proForm.service_center_lng, user?.city]);

  const [center, setCenter] = useState(initialCenter);
  const [radius, setRadius] = useState(proForm.service_radius_km || 0);

  // Push back to form whenever center/radius changes
  useEffect(() => {
    setProForm((f) => ({
      ...f,
      service_center_lat: center[0],
      service_center_lng: center[1],
      service_radius_km: radius,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, radius]);

  const onPick = (lat, lng) => setCenter([lat, lng]);

  const clear = () => {
    setRadius(0);
    setProForm((f) => ({ ...f, service_radius_km: 0 }));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-[12px] overflow-hidden border border-sm-border" style={{ height: 280 }} data-testid="geo-fence-map">
        <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={onPick} />
          <Marker position={center} />
          {radius > 0 && (
            <Circle
              center={center}
              radius={radius * 1000}
              pathOptions={{ color: '#0d9488', fillColor: '#14b8a6', fillOpacity: 0.15 }}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-[11px] text-ink-muted">{t('settings_geo_fence_click_help')}</p>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-ink">{t('settings_geo_radius')}</label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={radius}
          onChange={(e) => setRadius(parseInt(e.target.value, 10))}
          className="flex-1 min-w-[160px]"
          data-testid="geo-radius-slider"
        />
        <span className="font-mono text-sm text-ink min-w-[60px] text-right" data-testid="geo-radius-value">
          {radius === 0 ? t('settings_geo_off') : `${radius} km`}
        </span>
        {radius > 0 && (
          <button
            type="button"
            onClick={clear}
            className="btn-ghost text-xs px-3 py-1.5"
            data-testid="geo-radius-clear"
          >
            {t('settings_geo_off')}
          </button>
        )}
      </div>
      {radius === 0 ? (
        <p className="text-xs text-ink-muted italic">{t('settings_geo_radius_zero_help')}</p>
      ) : (
        <p className="text-xs text-teal">{t('settings_geo_radius_active').replace('{n}', radius)}</p>
      )}
    </div>
  );
}
