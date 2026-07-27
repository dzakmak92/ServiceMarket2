import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import { isPremiumTier } from '../../utils/tier';
import {
  Star, CheckCircle2, Heart, Loader2, MessageSquare, Calendar,
  ChevronLeft, ChevronRight, MapPin, Briefcase, Shield, Clock,
} from 'lucide-react';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// JS weekday → "Mon"|... ; JS getDay() returns 0=Sun..6=Sat
function jsDayToLabel(jsDay) {
  return WEEKDAY_LABELS[(jsDay + 6) % 7];
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // Sun=0..Sat=6
  const diff = (day + 6) % 7; // shift so Mon=0
  d.setDate(d.getDate() - diff);
  return d;
}

export default function ProDetailPage() {
  const { proId } = useParams();
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [pro, setPro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingPro, setSavingPro] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const REVIEWS_PER_PAGE = 5;

  useEffect(() => {
    api.get(`/api/pros/${proId}`)
      .then((r) => { setPro(r.data); setIsSaved(r.data.is_saved); })
      .catch(() => navigate(-1))
      .finally(() => setLoading(false));
  }, [proId]);

  const toggleSave = async () => {
    setSavingPro(true);
    try {
      if (isSaved) {
        await api.delete(`/api/saved-pros/${pro.id}`);
        setIsSaved(false);
      } else {
        await api.post(`/api/saved-pros/${pro.id}`);
        setIsSaved(true);
      }
    } catch { /* noop */ } finally { setSavingPro(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={32} className="text-teal animate-spin" />
      </div>
    );
  }
  if (!pro) return null;

  const rating = pro.rating_avg || 0;
  const reviews = pro.reviews || [];
  const photos = pro.portfolio_photos || [];
  const availability = pro.availability || [];
  const bookings = pro.bookings || [];
  const reviewCount = pro.reviews_count ?? reviews.length;
  const jobsCompleted = pro.completed_jobs_count ?? 0;
  const responseMins = pro.response_time_minutes;
  const responseLabel = responseMins == null
    ? '—'
    : responseMins < 60 ? `< 1 hour` : `< ${Math.ceil(responseMins / 60)} hours`;
  const primaryCategory = (pro.service_categories && pro.service_categories[0]) || pro.primary_category || '';

  // Build a 2D lookup: weekday(Mon..Sun) → set of slot strings  (e.g. "Mon|09:00-12:00")
  const slotByStartHour = new Map();
  const cellMap = {};
  for (const a of availability) {
    const m = (a.slot || '').match(/^\s*(\d{1,2}):\d{2}/);
    if (!m) continue;
    const hour = m[1].padStart(2, '0') + ':00';
    if (!slotByStartHour.has(hour)) slotByStartHour.set(hour, true);
    cellMap[`${hour}|${a.day}`] = a.slot;
  }
  const rows = [...slotByStartHour.keys()].sort();

  const tagline = pro.tagline || pro.business_description || '';

  const buildPhotoSrc = (p) => {
    const url = p.url || '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    return `${process.env.REACT_APP_BACKEND_URL}${url}`;
  };

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12" data-testid="pro-detail-page">
      <div className="page-container py-6">
        <button
          onClick={() => navigate(-1)}
          className="text-ink-muted hover:text-ink text-sm mb-6 flex items-center gap-1"
          data-testid="pro-detail-back"
        >
          ← {t('btn_back')}
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* LEFT COLUMN */}
          <div className="space-y-5 min-w-0">
            {/* Header card */}
            <div className="card-lg">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-16 h-16 bg-cream-deep rounded-[18px] flex items-center justify-center flex-shrink-0">
                  <span className="text-ink font-headings font-bold text-2xl">
                    {(pro.business_name || pro.name || '?')[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-headings font-bold text-ink truncate">
                      {pro.business_name || pro.name}
                    </h1>
                    {isPremiumTier(pro.plan_tier) && <span className="pro-badge">PRO</span>}
                  </div>
                  <p className="text-sm text-ink-muted mt-0.5">
                    {pro.business_name && pro.name ? `${pro.name} · ` : ''}
                    <span className="capitalize">{(primaryCategory || '').replace('_', ' ')}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-3 flex-wrap" data-testid="pro-badges">
                    {pro.is_licensed ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal text-paper text-sm font-semibold rounded-full shadow-sm" data-testid="badge-verified-licenced">
                        <CheckCircle2 size={14} /> {t('badge_verified_licenced')}
                      </span>
                    ) : pro.licence_status === 'pending' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber/15 text-amber-deep border border-amber/30 text-sm font-semibold rounded-full" data-testid="badge-pending-verification">
                        <Clock size={13} /> {t('badge_pending_verification')}
                      </span>
                    ) : null}
                    {pro.is_insured ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink text-paper text-sm font-semibold rounded-full shadow-sm" data-testid="badge-insured">
                        <Shield size={13} /> {t('badge_insured')}
                      </span>
                    ) : pro.insurance_status === 'pending' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber/15 text-amber-deep border border-amber/30 text-sm font-semibold rounded-full" data-testid="badge-insurance-pending">
                        <Clock size={13} /> {t('badge_pending_verification')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cream-deep/40 text-ink-muted border border-sm-border text-sm font-medium rounded-full" data-testid="badge-not-insured">
                        {t('badge_not_insured')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-3xl font-headings font-bold text-ink leading-none">{rating.toFixed(1)}</p>
                  <p className="text-xs text-ink-muted mt-1">{reviewCount} {t('reviews_word')}</p>
                </div>
              </div>
              {tagline && (
                <p className="mt-4 pl-3 border-l-2 border-amber italic text-ink-soft text-sm">
                  &ldquo;{tagline}&rdquo;
                </p>
              )}
            </div>

            {/* Portfolio */}
            <div className="card-lg" data-testid="pro-portfolio">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-headings font-bold text-ink text-lg">
                  {t('portfolio')} <span className="text-ink-muted font-normal">({photos.length})</span>
                </h2>
                {photos.length > 0 && (
                  <span className="text-xs text-ink-muted">
                    {t('portfolio_past_work')} {pro.name?.split(' ')[0] || ''}
                  </span>
                )}
              </div>
              {photos.length === 0 ? (
                <p className="text-center py-8 text-ink-muted text-sm">{t('portfolio_empty')}</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {photos.map((p, i) => (
                    <div
                      key={p.file_id || i}
                      className="aspect-square rounded-[14px] overflow-hidden bg-amber/15 flex items-center justify-center"
                    >
                      <img
                        src={buildPhotoSrc(p)}
                        alt={p.caption || `Portfolio ${i + 1}`}
                        className="w-full h-full object-cover"
                        data-testid={`pro-portfolio-${i}`}
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reviews */}
            <div className="card-lg" data-testid="pro-reviews">
              <h2 className="font-headings font-bold text-ink text-lg mb-4">
                {t('admin_reviews_t')} <span className="text-ink-muted font-normal">({reviewCount})</span>
              </h2>
              {reviews.length === 0 ? (
                <p className="text-ink-muted text-sm text-center py-4">{t('no_reviews_yet')}</p>
              ) : (() => {
                const totalPages = Math.max(1, Math.ceil(reviews.length / REVIEWS_PER_PAGE));
                const safePage = Math.min(reviewPage, totalPages);
                const start = (safePage - 1) * REVIEWS_PER_PAGE;
                const pageReviews = reviews.slice(start, start + REVIEWS_PER_PAGE);
                return (
                  <>
                    <div className="space-y-4">
                      {pageReviews.map((rev) => (
                        <div
                          key={rev.id}
                          className="border-b border-sm-border last:border-b-0 pb-4 last:pb-0"
                          data-testid={`review-${rev.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-ink text-sm">{rev.reviewer_name || 'Anonymous'}</p>
                              <p className="text-xs text-ink-muted">
                                {rev.created_at ? new Date(rev.created_at).toLocaleDateString() : ''}
                              </p>
                            </div>
                            <div className="flex">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  size={12}
                                  className={s <= (rev.rating || 0) ? 'text-amber fill-amber' : 'text-cream-deep'}
                                />
                              ))}
                            </div>
                          </div>
                          {(rev.job_title || rev.job_category || rev.job_city) && (
                            <div
                              className="mt-2 px-3 py-2 bg-cream-soft rounded-[10px] flex items-center gap-3 flex-wrap text-[11px] text-ink-soft"
                              data-testid={`review-${rev.id}-job-context`}
                            >
                              <span className="font-semibold text-ink-muted uppercase tracking-wide text-[10px]">
                                {t('review_job_label')}
                              </span>
                              {rev.job_title && (
                                <span className="flex items-center gap-1 font-medium text-ink truncate max-w-[260px]">
                                  <Briefcase size={11} className="text-teal flex-shrink-0" />
                                  {rev.job_title}
                                </span>
                              )}
                              {rev.job_category && (
                                <span className="capitalize text-ink-muted">
                                  {rev.job_category.replace('_', ' ')}
                                </span>
                              )}
                              {rev.job_city && (
                                <span className="flex items-center gap-1 text-ink-muted">
                                  <MapPin size={10} /> {rev.job_city}
                                </span>
                              )}
                            </div>
                          )}
                          {rev.text && <p className="text-sm text-ink-soft mt-2 leading-relaxed">{rev.text}</p>}
                          {rev.response && (
                            <div
                              className="mt-3 ml-4 pl-4 border-l-2 border-teal/30"
                              data-testid={`review-${rev.id}-response`}
                            >
                              <p className="text-[11px] font-semibold text-teal uppercase tracking-wider mb-1">
                                {t('review_reply_response_label')}
                              </p>
                              <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-wrap">
                                {rev.response}
                              </p>
                              {rev.response_created_at && (
                                <p className="text-[10px] text-ink-muted mt-1">
                                  {new Date(rev.response_created_at).toLocaleDateString()}
                                  {rev.response_updated_at && rev.response_updated_at !== rev.response_created_at && (
                                    <span className="italic ml-2">· {t('review_reply_edited')}</span>
                                  )}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-5 pt-4 border-t border-sm-border" data-testid="reviews-pagination">
                        <button
                          onClick={() => setReviewPage((p) => Math.max(1, p - 1))}
                          disabled={safePage === 1}
                          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          data-testid="reviews-prev"
                        >
                          <ChevronLeft size={14} /> {t('reviews_prev')}
                        </button>
                        <span className="text-xs text-ink-muted" data-testid="reviews-page-indicator">
                          {t('reviews_page_x_of_y').replace('{x}', safePage).replace('{y}', totalPages)}
                        </span>
                        <button
                          onClick={() => setReviewPage((p) => Math.min(totalPages, p + 1))}
                          disabled={safePage === totalPages}
                          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          data-testid="reviews-next"
                        >
                          {t('reviews_next')} <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Weekly availability — with real dates + booked-slot markers */}
            <DatedAvailabilityMatrix
              rows={rows}
              cellMap={cellMap}
              bookings={bookings}
              t={t}
              proName={pro.name?.split(' ')[0] || pro.business_name || ''}
            />
          </div>

          {/* RIGHT — sticky "At a glance" card */}
          <aside className="lg:sticky lg:top-20 lg:self-start space-y-4">
            <div className="card-lg">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-4">
                {t('pro_at_a_glance')}
              </p>
              <dl className="divide-y divide-sm-border">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-sm text-ink-soft">{t('pro_hourly_rate')}</dt>
                  <dd className="text-sm font-bold text-ink">€{pro.hourly_rate || '—'}/hr</dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-sm text-ink-soft">{t('pro_experience')}</dt>
                  <dd className="text-sm font-bold text-ink">{pro.years_experience || '—'} {t('years_short')}</dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-sm text-ink-soft">{t('pro_jobs_completed')}</dt>
                  <dd className="text-sm font-bold text-ink">{jobsCompleted}</dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-sm text-ink-soft">{t('pro_response')}</dt>
                  <dd className="text-sm font-bold text-ink">{responseLabel}</dd>
                </div>
              </dl>

              <div className="flex gap-2 mt-5">
                {user?.role === 'homeowner' && (
                  <Link
                    to="/post-job"
                    className="btn-primary flex-1"
                    data-testid="pro-request-quote-btn"
                  >
                    <MessageSquare size={14} /> {t('pro_request_quote')}
                  </Link>
                )}
                {user?.role === 'homeowner' && (
                  <button
                    onClick={toggleSave}
                    disabled={savingPro}
                    className={`w-11 h-11 rounded-full border flex items-center justify-center transition-colors
                      ${isSaved ? 'bg-amber/20 border-amber text-amber-deep' : 'border-sm-border text-ink-soft hover:bg-cream-soft'}`}
                    data-testid="pro-save-btn"
                    aria-label={isSaved ? t('unsave_pro') : t('save_pro')}
                  >
                    <Heart size={16} className={isSaved ? 'fill-amber-deep' : ''} />
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────
// Dated weekly availability — shows actual dates + paints booked slots red (X)
// ──────────────────────────────────────────────
function DatedAvailabilityMatrix({ rows, cellMap, bookings, t, proName }) {
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, 1 = next, -1 = previous
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const weekStart = useMemo(() => {
    const start = startOfWeek(today);
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [today, weekOffset]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  // Build a booking lookup: key = `<iso-date>|<slot>` → true, plus a fallback `<day>|<slot>` for legacy bookings
  const bookedMap = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (!b.slot) continue;
      if (b.date) map[`${b.date}|${b.slot}`] = true;
      if (b.day) map[`day:${b.day}|${b.slot}`] = (map[`day:${b.day}|${b.slot}`] || 0) + 1;
    }
    return map;
  }, [bookings]);

  const isBooked = (date, slot, weekday) => {
    const iso = date.toISOString().slice(0, 10);
    if (bookedMap[`${iso}|${slot}`]) return true;
    // Fallback: legacy bookings without a `date` field — show 'booked' on the next occurrence
    // only if the booking weekday matches AND the date is the *closest* future occurrence
    // (we just paint all matching weekdays for simplicity in this 7-day view)
    return false;
  };

  const fmtDate = (d) =>
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  const weekLabel = `${weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  return (
    <div className="card-lg" data-testid="pro-availability">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-headings font-bold text-ink text-lg flex items-center gap-2">
          <Calendar size={16} className="text-teal" />
          {t('pro_weekly_avail')}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="p-1.5 rounded-full hover:bg-cream-soft transition-colors"
            aria-label="previous week"
            data-testid="pro-cal-prev"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-semibold text-ink min-w-[140px] text-center">{weekLabel}</span>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="p-1.5 rounded-full hover:bg-cream-soft transition-colors"
            aria-label="next week"
            data-testid="pro-cal-next"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <p className="text-xs text-ink-muted mb-4">
        {t('pro_weekly_avail_desc').replace('{name}', proName)}
      </p>

      {rows.length === 0 ? (
        <p className="text-ink-muted text-sm text-center py-4">{t('booking_no_avail')}</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-[60px_repeat(7,minmax(64px,1fr))] gap-1.5 min-w-[520px]">
            <div></div>
            {days.map((d, i) => {
              const isToday = d.getTime() === today.getTime();
              const isPast = d < today;
              return (
                <div
                  key={i}
                  className={`text-center ${isPast ? 'opacity-40' : ''} ${isToday ? 'text-teal' : 'text-ink-soft'}`}
                >
                  <div className={`text-[10px] font-semibold uppercase tracking-wide ${isToday ? 'text-teal' : 'text-ink-muted'}`}>
                    {jsDayToLabel(d.getDay())}
                  </div>
                  <div className={`text-sm font-bold ${isToday ? 'text-teal' : 'text-ink'}`}>
                    {fmtDate(d)}
                  </div>
                </div>
              );
            })}
            {rows.map((row) => (
              <React.Fragment key={row}>
                <div className="text-xs font-semibold text-ink-muted self-center">{row}</div>
                {days.map((d) => {
                  const weekday = jsDayToLabel(d.getDay());
                  const slot = cellMap[`${row}|${weekday}`];
                  const past = d < today;
                  const booked = slot && isBooked(d, slot, weekday);
                  let cls = 'h-12 rounded-[10px] flex items-center justify-center text-[10px] font-semibold transition-colors';
                  let content = '·';
                  if (!slot) {
                    cls += ' bg-cream-deep text-ink-faint';
                  } else if (past) {
                    cls += ' bg-cream-deep text-ink-faint opacity-60';
                    content = slot;
                  } else if (booked) {
                    cls += ' bg-red-warn text-paper line-through';
                    content = '✕';
                  } else {
                    cls += ' bg-teal text-paper';
                    content = slot;
                  }
                  return (
                    <div
                      key={`${row}-${d.toISOString()}`}
                      className={cls}
                      title={booked ? t('booking_booked_short') : (slot || '')}
                      data-testid={`pro-avail-${row}-${d.toISOString().slice(0, 10)}`}
                      data-booked={booked ? 'true' : 'false'}
                    >
                      {content}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-[11px] text-ink-muted">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-teal inline-block"></span>{t('booking_avail')}</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-warn inline-block"></span>{t('booking_booked')}</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-cream-deep inline-block"></span>{t('booking_unavail')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
