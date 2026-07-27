import React from 'react';
import { Link } from 'react-router-dom';
import { Star, MapPin, Briefcase, CheckCircle2, Clock, ShieldCheck, Award, Umbrella, Navigation } from 'lucide-react';
import { isPremiumTier } from '../utils/tier';
import { useLang } from '../contexts/LangContext';

function TrustBadge({ icon: Icon, label, testid }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold bg-teal/10 text-teal px-1.5 py-0.5 rounded-full"
      data-testid={testid}
    >
      <Icon size={11} /> {label}
    </span>
  );
}

export default function ProCard({ pro, onSave, saved, compact = false }) {
  const { t } = useLang();
  const rating = pro.rating_avg || 0;
  const stars = Math.round(rating);
  const hasTrust = pro.is_verified || pro.is_licensed || pro.is_insured;

  return (
    <Link
      to={`/pros/${pro.user_id || pro.id}`}
      className={`card-md hover:shadow-lg block transition-all duration-300 ${compact ? 'p-3' : ''}`}
      data-testid={`pro-card-${pro.id || pro.user_id}`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-12 h-12 bg-teal/10 rounded-[14px] flex items-center justify-center flex-shrink-0">
          <span className="text-teal font-headings font-bold text-lg">
            {(pro.business_name || pro.name || '?')[0]?.toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-headings font-bold text-ink text-sm truncate">
              {pro.business_name || pro.name}
            </h3>
            {isPremiumTier(pro.plan_tier) && (
              <span className="pro-badge">PRO</span>
            )}
            {pro.is_verified && (
              <CheckCircle2 size={14} className="text-teal flex-shrink-0" />
            )}
          </div>

          {/* Trust badges: verified / certified / insured */}
          {hasTrust && (
            <div className="flex flex-wrap gap-1 mt-1.5" data-testid={`pro-badges-${pro.id || pro.user_id}`}>
              {pro.is_verified && <TrustBadge icon={ShieldCheck} label={t('fp_verified')} testid={`badge-verified-${pro.id || pro.user_id}`} />}
              {pro.is_licensed && <TrustBadge icon={Award} label={t('fp_certified')} testid={`badge-certified-${pro.id || pro.user_id}`} />}
              {pro.is_insured && <TrustBadge icon={Umbrella} label={t('fp_insured')} testid={`badge-insured-${pro.id || pro.user_id}`} />}
            </div>
          )}

          {pro.tagline && (
            <p className="text-xs text-ink-muted mt-0.5 truncate">{pro.tagline}</p>
          )}

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {/* Rating */}
            {rating > 0 && (
              <div className="flex items-center gap-1">
                <Star size={12} className="text-amber fill-amber" />
                <span className="text-xs font-semibold text-ink">{rating.toFixed(1)}</span>
                <span className="text-xs text-ink-muted">({pro.reviews_count || 0})</span>
              </div>
            )}

            {/* Distance (when GPS active) */}
            {typeof pro.distance_km === 'number' && (
              <div className="flex items-center gap-1 text-teal font-semibold" data-testid={`pro-distance-${pro.id || pro.user_id}`}>
                <Navigation size={11} />
                <span className="text-xs">{pro.distance_km.toFixed(1)} km {t('fp_away')}</span>
              </div>
            )}

            {/* Location */}
            {pro.city && (
              <div className="flex items-center gap-1 text-ink-muted">
                <MapPin size={11} />
                <span className="text-xs">{pro.city}</span>
              </div>
            )}

            {/* Jobs done */}
            {pro.completed_jobs_count > 0 && (
              <div className="flex items-center gap-1 text-ink-muted">
                <Briefcase size={11} />
                <span className="text-xs">{pro.completed_jobs_count} jobs</span>
              </div>
            )}

            {/* Response time */}
            {pro.response_time_minutes && (
              <div className="flex items-center gap-1 text-ink-muted">
                <Clock size={11} />
                <span className="text-xs">{pro.response_time_minutes}min</span>
              </div>
            )}
          </div>

          {/* Categories */}
          {!compact && pro.service_categories?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {pro.service_categories.slice(0, 3).map(cat => (
                <span key={cat} className="text-[10px] px-2 py-0.5 bg-cream-deep text-ink-soft rounded-full capitalize">
                  {cat.replace('_', ' ')}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Price / Save */}
        <div className="text-right flex-shrink-0">
          {pro.hourly_rate > 0 && (
            <p className="text-sm font-bold text-ink">€{pro.hourly_rate}<span className="text-xs text-ink-muted font-normal">/hr</span></p>
          )}
          {pro.years_experience > 0 && (
            <p className="text-xs text-ink-muted mt-0.5">{pro.years_experience} yrs</p>
          )}
        </div>
      </div>
    </Link>
  );
}
