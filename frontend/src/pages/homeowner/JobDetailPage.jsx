import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import StatusPill from '../../components/StatusPill';
import ReportProblemButton from '../../components/ReportProblemButton';
import {
  MapPin, Clock, Star, CheckCircle2, MessageSquare, AlertCircle, Loader2,
  Phone, Share2, Mail, Pencil, Receipt, CalendarRange, Eye,
} from 'lucide-react';

export default function JobDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);
  const [completingId, setCompletingId] = useState(null);
  const [error, setError] = useState('');
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewData, setReviewData] = useState({ rating: 5, text: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Contact + location sharing
  const [contactInfo, setContactInfo] = useState(null);
  const [showShareLocation, setShowShareLocation] = useState(false);
  const [addressDraft, setAddressDraft] = useState('');
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => { fetchJob(); }, [id]);

  const fetchJob = async () => {
    try {
      const { data } = await api.get(`/api/jobs/${id}`);
      setJob(data);
      if (data && (data.status === 'in_progress' || data.status === 'completed')) {
        try {
          const c = await api.get(`/api/jobs/${data.id}/contact`);
          setContactInfo(c.data);
        } catch { setContactInfo(null); }
      }
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  };

  const acceptQuote = async (quoteId, proUserId) => {
    setAcceptingId(quoteId);
    setError('');
    try {
      await api.post(`/api/quotes/${quoteId}/accept`);
      await fetchJob();
      if (proUserId) {
        navigate(`/messages?job=${id}&to=${proUserId}`);
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to accept quote');
    } finally {
      setAcceptingId(null);
    }
  };

  const markComplete = async () => {
    setCompletingId(id);
    try {
      await api.patch(`/api/jobs/${id}/status`, { status: 'completed' });
      await fetchJob();
      if (job.accepted_pro_id) setReviewModal(true);
    } catch { /* noop */ } finally {
      setCompletingId(null);
    }
  };

  const submitReview = async () => {
    setReviewSubmitting(true);
    try {
      await api.post('/api/reviews', { job_id: id, ...reviewData });
      setReviewModal(false);
    } catch { /* noop */ } finally {
      setReviewSubmitting(false);
    }
  };

  const shareLocation = async () => {
    if (!addressDraft.trim()) return;
    setShareLoading(true);
    try {
      await api.patch(`/api/jobs/${id}/share-location`, { address_full: addressDraft.trim() });
      await fetchJob();
      setShowShareLocation(false);
      setAddressDraft('');
    } catch {
      /* noop */
    } finally {
      setShareLoading(false);
    }
  };

  const isMyJob = job?.posted_by_id === user?._id;

  const cleanPhone = (p) => (p || '').replace(/[^\d+]/g, '');
  const waLink = (p) => {
    const c = cleanPhone(p).replace(/^\+/, '');
    return c ? `https://wa.me/${c}` : null;
  };

  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <Loader2 size={32} className="text-teal animate-spin" />
    </div>
  );

  if (!job) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <p className="text-ink-muted">{t('job_not_found')}</p>
    </div>
  );

  const proContact = contactInfo?.pro;

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8">
      <div className="page-container py-8 max-w-3xl">
        {/* Back */}
        <button onClick={() => navigate(-1)} className="text-ink-muted hover:text-ink text-sm mb-6 flex items-center gap-1">
          {t('job_back')}
        </button>

        {/* Job header */}
        <div className="card-lg mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <StatusPill status={job.status} />
                <span className="text-xs px-2 py-0.5 bg-cream-deep text-ink-soft rounded-full capitalize">
                  {job.category?.replace('_', ' ')}
                </span>
              </div>
              <h1 className="text-2xl font-headings font-bold text-ink">{job.title}</h1>
              {job.listing_type === 'project' && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold bg-teal/10 text-teal px-2 py-0.5 rounded-full">Project</span>
                  {job.timeline_weeks && (
                    <span className="text-xs text-ink-soft flex items-center gap-1">
                      <CalendarRange size={11} className="text-teal" />
                      {job.timeline_weeks === 1 ? `${job.timeline_weeks} week` : `${job.timeline_weeks} weeks`}
                    </span>
                  )}
                  {job.site_visit_required && (
                    <span className="text-xs text-amber-deep flex items-center gap-1">
                      <Eye size={11} /> Site visit required
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-4 mt-3 text-sm text-ink-muted flex-wrap">
                {job.city && <span className="flex items-center gap-1"><MapPin size={13} />{job.city}</span>}
                <span className="flex items-center gap-1"><Clock size={13} />
                  {new Date(job.posted_at).toLocaleDateString()}
                </span>
                {job.edited_at && (
                  <span className="text-xs italic text-ink-muted" data-testid="job-edited-marker">
                    · {t('job_edited_label')} {new Date(job.edited_at).toLocaleDateString()}
                  </span>
                )}
                {(job.budget_min || job.budget_max) && (
                  <span className="font-semibold text-ink">
                    €{job.budget_min || '?'}{job.budget_max ? `–€${job.budget_max}` : '+'}
                  </span>
                )}
              </div>
            </div>
            {isMyJob && job.status === 'open' && (
              <Link
                to={`/jobs/${id}/edit`}
                className="btn-ghost text-xs px-3 py-1.5 flex-shrink-0"
                data-testid="edit-job-btn"
                title={t('edit_job_title')}
              >
                <Pencil size={13} /> {t('btn_edit')}
              </Link>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-sm-border">
            <h3 className="text-sm font-semibold text-ink mb-2">{t('job_description_label')}</h3>
            <p className="text-ink-soft text-sm leading-relaxed whitespace-pre-wrap">{job.description}</p>
          </div>

          {job.attachments && job.attachments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-sm-border" data-testid="job-attachments-section">
              <h3 className="text-sm font-semibold text-ink mb-2">{t('job_attachments_label')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {job.attachments.slice(0, 10).map((a) => {
                  const isImg = (a.content_type || '').startsWith('image/');
                  const isFullUrl = (a.url || '').startsWith('http');
                  const href = isFullUrl ? a.url : `${process.env.REACT_APP_BACKEND_URL || ''}${a.url}`;
                  return (
                    <a
                      key={a.file_id}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-square rounded-[10px] overflow-hidden border border-sm-border hover:opacity-90 transition-opacity bg-cream-soft"
                      data-testid={`job-attachment-${a.file_id}`}
                      title={a.name}
                    >
                      {isImg ? (
                        <img src={href} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center px-2 text-center">
                          <span className="text-amber-deep text-2xl">📄</span>
                          <span className="text-[10px] text-ink mt-1 truncate w-full">{a.name}</span>
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-warn bg-red-50 rounded-[14px] p-3 mt-4 text-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* Homeowner actions */}
          {isMyJob && job.status === 'in_progress' && (
            <div className="mt-4 pt-4 border-t border-sm-border flex gap-3">
              <button
                onClick={markComplete}
                disabled={!!completingId}
                className="btn-primary flex-1"
                data-testid="mark-complete-btn"
              >
                {completingId ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {t('mark_complete')}
              </button>
              <Link
                to={`/messages?job=${id}&to=${job.pro_user_id || job.accepted_pro_user_id || ''}`}
                className="btn-ghost flex-1 text-center"
              >
                <MessageSquare size={16} /> {t('nav_messages')}
              </Link>
            </div>
          )}

          {/* Pro action — click to invoice on completed jobs */}
          {user?.role === 'tradesperson' && job.status === 'completed' && (
            <div className="mt-4 pt-4 border-t border-sm-border" data-testid="click-to-invoice-row">
              <Link
                to={`/jobs/${id}/invoice`}
                className="btn-primary w-full justify-center"
                data-testid="click-to-invoice-btn"
              >
                <Receipt size={16} /> {t('btn_click_to_invoice')}
              </Link>
              <p className="text-[11px] text-ink-muted text-center mt-2">{t('click_to_invoice_help')}</p>
            </div>
          )}

          {/* Pro action — report a problem (only for tradespeople, any job they have a quote on) */}
          {user?.role === 'tradesperson' && (
            <div className="mt-4 pt-4 border-t border-sm-border flex justify-end">
              <ReportProblemButton
                jobId={id}
                jobTitle={job.title}
                variant="button"
                testidPrefix="job-report-problem"
              />
            </div>
          )}
        </div>

        {/* Contact + Location card — post-acceptance */}
        {isMyJob && contactInfo && proContact && (
          <div className="card-lg mb-6 border border-teal/20 bg-gradient-to-br from-teal/5 to-amber/5" data-testid="job-contact-card">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={16} className="text-teal" />
              <h2 className="font-headings font-bold text-ink">{t('job_contact_unlocked')}</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Pro contact */}
              <div>
                <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">{t('job_contact_pro')}</p>
                <p className="font-semibold text-ink">{proContact.name}</p>
                {proContact.business_name && (
                  <p className="text-xs text-ink-muted">{proContact.business_name}</p>
                )}
                {proContact.phone ? (
                  <p className="text-sm text-ink-soft flex items-center gap-1 mt-1">
                    <Phone size={12} /> {proContact.phone}
                  </p>
                ) : (
                  <p className="text-xs text-ink-muted italic mt-1">{t('job_no_phone')}</p>
                )}
                {proContact.email && (
                  <p className="text-xs text-ink-muted flex items-center gap-1 mt-0.5">
                    <Mail size={12} /> {proContact.email}
                  </p>
                )}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {proContact.phone && (
                    <a
                      href={`tel:${cleanPhone(proContact.phone)}`}
                      className="btn-primary text-xs px-3 py-1.5"
                      data-testid="job-call-btn"
                    >
                      <Phone size={12} /> {t('btn_call')}
                    </a>
                  )}
                  {proContact.phone && waLink(proContact.phone) && (
                    <a
                      href={waLink(proContact.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-green-pos text-paper inline-flex items-center justify-center gap-1.5 rounded-full font-medium px-3 py-1.5 text-xs hover:opacity-90"
                      data-testid="job-whatsapp-btn"
                    >
                      <MessageSquare size={12} /> {t('btn_whatsapp')}
                    </a>
                  )}
                  <Link
                    to={`/messages?job=${id}&to=${proContact.user_id || job.pro_user_id || ''}`}
                    className="btn-ghost text-xs px-3 py-1.5"
                  >
                    {t('job_messages_link')}
                  </Link>
                </div>
              </div>

              {/* Location share */}
              <div>
                <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">{t('job_contact_address')}</p>
                {contactInfo.location_shared && contactInfo.address_full ? (
                  <>
                    <p className="font-medium text-ink flex items-center gap-1">
                      <MapPin size={14} className="text-teal" /> {contactInfo.address_full}
                    </p>
                    <p className="text-xs text-teal mt-1">✓ {t('job_address_shared')}</p>
                  </>
                ) : showShareLocation ? (
                  <div className="space-y-2">
                    <input
                      value={addressDraft}
                      onChange={(e) => setAddressDraft(e.target.value)}
                      placeholder={t('job_address_placeholder')}
                      className="sm-input text-sm"
                      data-testid="job-share-location-input"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowShareLocation(false); setAddressDraft(''); }}
                        className="btn-ghost flex-1 text-xs py-2"
                      >
                        {t('btn_cancel')}
                      </button>
                      <button
                        onClick={shareLocation}
                        disabled={shareLoading || addressDraft.trim().length < 4}
                        className="btn-primary flex-1 text-xs py-2"
                        data-testid="job-share-location-confirm"
                      >
                        {shareLoading ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />}
                        {t('btn_share')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-ink-muted mb-2">{t('job_share_location_desc')}</p>
                    <button
                      onClick={() => { setShowShareLocation(true); setAddressDraft(job.city || ''); }}
                      className="btn-amber text-xs px-3 py-1.5"
                      data-testid="job-share-location-open"
                    >
                      <Share2 size={12} /> {t('job_share_location')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quotes */}
        {isMyJob && job.status === 'open' && (
          <div>
            <h2 className="text-xl font-headings font-bold text-ink mb-4">
              {t('quotes_label')} ({job.quotes?.length || 0})
            </h2>
            {(job.quotes || []).length === 0 ? (
              <div className="card-lg text-center py-10">
                <MessageSquare size={32} className="text-ink-muted mx-auto mb-3" />
                <p className="text-ink-muted">{t('quotes_none')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(job.quotes || []).map(q => (
                  <div key={q.id} className="card-lg" data-testid={`quote-${q.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-headings font-bold text-ink">{q.pro_name}</span>
                          {q.pro_badge && <span className="pro-badge">PRO</span>}
                          {q.pro_verified && <CheckCircle2 size={14} className="text-teal" />}
                        </div>
                        {q.pro_rating > 0 && (
                          <Link to={`/pros/${q.pro_user_id}#reviews`} className="flex items-center gap-1 mt-1 hover:opacity-80" data-testid={`quote-${q.id}-reviews-link`}>
                            <Star size={12} className="text-amber fill-amber" />
                            <span className="text-xs font-semibold">{q.pro_rating.toFixed(1)}</span>
                            <span className="text-xs text-ink-muted">({q.pro_reviews} {t('reviews_word')})</span>
                          </Link>
                        )}
                        <p className="text-sm text-ink-soft mt-2 leading-relaxed">{q.message}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-2xl font-headings font-bold text-ink">€{q.price_total ?? q.price}</p>
                        <p className="text-[10px] text-ink-muted uppercase tracking-wide mt-0.5">
                          {q.price_type === 'hourly' ? t('quote_price_type_hourly') : q.price_type === 'milestone' ? t('quote_price_type_milestone') : t('quote_price_type_pauschal')}
                        </p>
                        <StatusPill status={q.status} className="mt-2" />
                      </div>
                    </div>

                    {/* Milestone breakdown for project quotes */}
                    {q.price_type === 'milestone' && Array.isArray(q.milestones) && q.milestones.length > 0 && (
                      <div className="mt-3 bg-teal/4 border border-teal/15 rounded-[12px] p-3" data-testid={`quote-${q.id}-milestones`}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-teal mb-2">{t('quote_milestone_title')}</p>
                        <div className="space-y-1.5">
                          {q.milestones.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((ms, mi) => (
                            <div key={mi} className="flex items-center justify-between text-sm">
                              <span className="text-ink-soft">{ms.name || `Phase ${mi + 1}`}</span>
                              <span className="font-semibold text-ink">€{ms.amount?.toFixed(2) ?? 0}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-sm font-bold text-ink border-t border-teal/15 mt-2 pt-2">
                          <span>{t('quote_total_label')}</span>
                          <span className="text-teal">€{(q.milestones.reduce((a, m) => a + (m.amount || 0), 0) + (q.travel_cost || 0) + (q.parking_cost || 0)).toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {/* Quote breakdown — only show if iter22 fields populated */}
                    {q.price_type !== 'milestone' && (q.price_type || q.travel_cost || q.parking_cost || q.estimated_hours) && (
                      <div className="mt-3 bg-cream-soft rounded-[12px] p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs" data-testid={`quote-${q.id}-breakdown`}>
                        {q.price_type === 'hourly' ? (
                          <div>
                            <p className="text-[10px] text-ink-muted uppercase">{t('quote_amount_hourly')}</p>
                            <p className="font-semibold text-ink mt-0.5">€{q.amount}/h × {q.estimated_hours}h</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] text-ink-muted uppercase">{t('quote_amount_pauschal')}</p>
                            <p className="font-semibold text-ink mt-0.5">€{q.amount}</p>
                          </div>
                        )}
                        {q.estimated_hours != null && q.price_type === 'pauschal' && (
                          <div>
                            <p className="text-[10px] text-ink-muted uppercase">{t('quote_estimated_hours')}</p>
                            <p className="font-semibold text-ink mt-0.5">{q.estimated_hours} h</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] text-ink-muted uppercase">{t('quote_travel_cost')}</p>
                          <p className="font-semibold text-ink mt-0.5">€{q.travel_cost ?? 0}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-ink-muted uppercase">{t('quote_parking_cost')}</p>
                          <p className="font-semibold text-ink mt-0.5">€{q.parking_cost ?? 0}</p>
                        </div>
                      </div>
                    )}

                    {/* Pro availability — read-only chips (next 8 free slots within 2 weeks) */}
                    {Array.isArray(q.pro_next_slots) && q.pro_next_slots.length > 0 && (
                      <div className="mt-3 border-t border-sm-border pt-3" data-testid={`quote-${q.id}-slots`}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
                          {t('quote_pro_next_slots')}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {q.pro_next_slots.map((s) => {
                            const d = new Date(s.date);
                            const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
                            return (
                              <span
                                key={`${s.date}_${s.slot}`}
                                className="text-[10px] px-2 py-1 rounded-full bg-paper border border-sm-border text-ink"
                                data-testid={`quote-${q.id}-slot`}
                              >
                                {day} · {s.slot}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {q.status === 'pending' && (
                      <div className="flex gap-3 mt-4 pt-4 border-t border-sm-border">
                        <button
                          onClick={() => acceptQuote(q.id, q.pro_user_id)}
                          disabled={acceptingId === q.id}
                          className="btn-primary flex-1"
                          data-testid={`accept-quote-${q.id}`}
                        >
                          {acceptingId === q.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          {t('accept_quote')}
                        </button>
                        <Link to={`/pros/${q.pro_user_id}`} className="btn-ghost flex-1 text-center text-sm">
                          {t('view_profile')}
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* If completed + homeowner, show quote list with accepted */}
        {isMyJob && job.status !== 'open' && (job.quotes || []).length > 0 && (
          <div>
            <h2 className="text-xl font-headings font-bold text-ink mb-4">{t('quotes_all')}</h2>
            <div className="space-y-3">
              {(job.quotes || []).map(q => (
                <div key={q.id} className="card-md flex items-center justify-between">
                  <div>
                    <span className="font-medium text-ink">{q.pro_name}</span>
                    <p className="text-xs text-ink-muted">€{q.price}</p>
                  </div>
                  <StatusPill status={q.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4">
          <div className="bg-paper rounded-[18px] p-6 max-w-sm w-full animate-slide-up">
            <h2 className="text-xl font-headings font-bold text-ink mb-1">{t('job_complete_title')}</h2>
            <p className="text-ink-muted text-sm mb-6">{t('job_complete_review_q')}</p>
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setReviewData(r => ({ ...r, rating: s }))}
                  className={`text-3xl transition-transform hover:scale-110 ${s <= reviewData.rating ? 'text-amber' : 'text-ink-faint'}`}>
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={reviewData.text}
              onChange={e => setReviewData(r => ({ ...r, text: e.target.value }))}
              placeholder={t('job_complete_review_placeholder')}
              className="sm-textarea mb-4" rows={3}
            />
            <div className="flex gap-3">
              <button onClick={() => setReviewModal(false)} className="btn-ghost flex-1">{t('btn_skip')}</button>
              <button
                onClick={submitReview}
                disabled={reviewSubmitting}
                className="btn-primary flex-1"
                data-testid="submit-review-btn"
              >
                {reviewSubmitting ? t('posting') : t('post_review')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
