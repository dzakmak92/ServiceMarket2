import React, { useMemo } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useLang } from '../../contexts/LangContext';

/**
 * Where the customers are.
 *
 * `customers.lat` and `customers.lng` have been on the row since the first
 * migration, beside the address, and nothing has ever drawn them. This is not
 * a map service: there are no tiles, no key and no request. It is the pins,
 * placed by projecting the coordinates the rows already carry onto the box —
 * which is the part that carries the information. A tile layer can go behind
 * it later without changing any of this.
 *
 * Equirectangular, with longitude squeezed by cos(lat). Over one city the
 * error is a fraction of a pixel, and the alternative — a real projection for
 * a 130 px box showing Vienna — is arithmetic nobody can check by looking.
 */
export default function ContactMap({ customers, open, onToggle, onPick, selectedId }) {
  const { t } = useLang();

  const pins = useMemo(() => {
    /* `Number(null)` is 0 and `Number.isFinite(0)` is true, so a null-checked
       only by coercion puts every customer without coordinates on the equator
       off West Africa — where they stack into one pin in the middle of the
       frame and look like a working map. Reject the empty values first. */
    const has = (v) => v !== null && v !== undefined && v !== ''
      && Number.isFinite(Number(v));
    const withCoords = (customers || []).filter((c) => has(c.lat) && has(c.lng));
    if (!withCoords.length) return [];

    const lats = withCoords.map((c) => Number(c.lat));
    const lngs = withCoords.map((c) => Number(c.lng));
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const k = Math.cos((midLat * Math.PI) / 180) || 1;

    /* The box the points occupy, in projected units, with a floor so a single
       customer — or a street of them — does not fill the frame at absurd
       zoom. 0.02° is roughly two kilometres. */
    const xs = lngs.map((v) => v * k);
    const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 0.02);
    const spanY = Math.max(Math.max(...lats) - Math.min(...lats), 0.02);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...lats) + Math.max(...lats)) / 2;

    const W = 364;
    const H = open ? 300 : 130;
    const pad = 26;
    const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);

    const placed = withCoords.map((c) => ({
      id: c.id,
      name: c.company_name || c.name,
      x: W / 2 + (Number(c.lng) * k - cx) * scale,
      // y grows downward and latitude grows northward.
      y: H / 2 - (Number(c.lat) - cy) * scale,
      warn: c.type === 'business' && !c.vat_id_validated_at,
    }));

    /* Customers at the same address are one pin with a count, not five pins on
       top of each other. A Hausverwaltung with twelve flats in one building is
       the normal case, not an edge one. */
    const groups = new Map();
    placed.forEach((p) => {
      const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
      const at = groups.get(key);
      if (at) at.n += 1;
      else groups.set(key, { ...p, n: 1 });
    });
    return [...groups.values()];
  }, [customers, open]);

  const H = open ? 300 : 130;

  return (
    <div className="relative mb-3 overflow-hidden rounded-[13px] border border-navy-edge"
         data-testid="contacts-map">
      <svg viewBox={`0 0 364 ${H}`} className="block w-full" style={{ height: H }}
           preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="364" height={H} fill="#eef2f6" />
        <path d={`M-10 ${H * 0.62} C 90 ${H * 0.48}, 150 ${H * 0.78}, 250 ${H * 0.55}
                  S 340 ${H * 0.3}, 380 ${H * 0.42} L 380 ${H} L -10 ${H} Z`} fill="#e3ebf3" />
        <g stroke="#dde5ec" strokeWidth="2" fill="none">
          <path d={`M40 0 V ${H}`} /><path d={`M128 0 V ${H}`} />
          <path d={`M216 0 V ${H}`} /><path d={`M300 0 V ${H}`} />
          <path d={`M0 ${H * 0.28} H 364`} /><path d={`M0 ${H * 0.58} H 364`} />
          <path d={`M0 ${H * 0.84} H 364`} />
        </g>
        {pins.map((p) => (
          <g key={p.id} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
             onClick={() => onPick?.(p.id)} style={{ cursor: 'pointer' }}>
            <path d="M0 0 C -8 -10, -8 -20, 0 -22 C 8 -20, 8 -10, 0 0 Z"
                  fill={p.warn ? '#c14655' : '#2d6a7f'}
                  stroke={p.id === selectedId ? '#1a3a52' : 'none'} strokeWidth="1.5" />
            {p.n > 1 ? (
              <text x="0" y="-11.5" textAnchor="middle" fill="#fff"
                    fontSize="9" fontWeight="800">{p.n}</text>
            ) : (
              <circle cx="0" cy="-15" r="3.4" fill="#fff" />
            )}
          </g>
        ))}
      </svg>

      {/* No coordinates on any row is a real state, not an empty map: the
          addresses are there, nothing has geocoded them yet. */}
      {!pins.length && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center
                      text-[11px] font-bold text-ink-muted">
          {t('contacts_map_none')}
        </p>
      )}

      <button type="button" onClick={onToggle}
              aria-expanded={!!open} aria-label={t(open ? 'contacts_map_close' : 'contacts_map_open')}
              data-testid="contacts-map-toggle"
              className="absolute right-2 top-2 grid h-[34px] w-[34px] place-items-center
                         rounded-[9px] border border-navy-edge bg-paper/90 text-navy">
        {open ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
    </div>
  );
}
