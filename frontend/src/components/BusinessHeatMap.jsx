import React, { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/** Marker palette — meaning, not category. */
export const MAP_COLORS = {
  unclaimed: '#94a3b8', // slate — listed but not yet on the platform
  claimed: '#16a34a',   // green — business is on ServiceMarket
  pro: '#0d9488',       // teal — verified ServiceMarket Pro
  you: '#2563eb',       // blue — the homeowner's location
};

/** Imperatively recenters / fits the map when the user's location changes. */
function Recenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom, { duration: 0.8 });
  }, [center, zoom, map]);
  return null;
}

/**
 * Directory map. Pins are coloured by MEANING (claimed vs unclaimed), never by
 * category — keeps a dense 8k-marker map readable. Tooltips show the business
 * NAME only. Optional layers:
 *  - `proMarkers`: verified ServiceMarket pros (larger teal markers).
 *  - `userLocation` ([lat,lng]) + `radiusKm`: a "you are here" pin + radius ring.
 * Clicking a business pin → `onMarkerClick(marker)`; a pro pin → `onProClick(pro)`.
 */
export default function BusinessHeatMap({
  markers = [],
  proMarkers = [],
  onMarkerClick,
  onProClick,
  userLocation = null,
  radiusKm = 25,
  height = 440,
  center = [47.8, 14.6], // Austria
  zoom = 7,
}) {
  return (
    <div
      className="rounded-[16px] overflow-hidden border border-sm-border relative z-0"
      style={{ height }}
      data-testid="business-heatmap"
    >
      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={5}
        preferCanvas
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {userLocation && (
          <Recenter center={userLocation} zoom={Math.max(zoom, 11)} />
        )}

        {/* Radius ring around the homeowner */}
        {userLocation && radiusKm > 0 && (
          <Circle
            center={userLocation}
            radius={radiusKm * 1000}
            pathOptions={{ color: MAP_COLORS.pro, weight: 1.5, fillColor: MAP_COLORS.pro, fillOpacity: 0.06 }}
          />
        )}

        {/* Directory business pins — name only, coloured by claim status */}
        {markers.map((m) => (
          <CircleMarker
            key={m.id}
            center={[m.lat, m.lng]}
            radius={5}
            pathOptions={{
              color: '#ffffff',
              weight: 1,
              fillColor: m.claimed ? MAP_COLORS.claimed : MAP_COLORS.unclaimed,
              fillOpacity: 0.9,
            }}
            eventHandlers={onMarkerClick ? { click: () => onMarkerClick(m) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -2]} opacity={1}>
              <span className="font-semibold">{m.name}</span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* Verified ServiceMarket pros — larger, ringed teal markers on top */}
        {proMarkers.map((p) => (
          <CircleMarker
            key={`pro-${p.id}`}
            center={[p.lat, p.lng]}
            radius={9}
            pathOptions={{ color: '#ffffff', weight: 2.5, fillColor: MAP_COLORS.pro, fillOpacity: 1 }}
            eventHandlers={onProClick ? { click: () => onProClick(p) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={1}>
              <span className="font-semibold">{p.business_name || p.name}</span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* "You are here" marker */}
        {userLocation && (
          <CircleMarker
            center={userLocation}
            radius={7}
            pathOptions={{ color: '#ffffff', weight: 3, fillColor: MAP_COLORS.you, fillOpacity: 1 }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={1} permanent>
              You are here
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}
