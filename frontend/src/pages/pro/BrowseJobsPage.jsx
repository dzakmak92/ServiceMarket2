import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import ExpandableJobCard from '../../components/ExpandableJobCard';
import { Search, Loader2, Send, AlertCircle, X, CheckCircle, Plus, Trash2 } from 'lucide-react';
import { isPremiumTier } from '../../utils/tier';

const EMPTY_MILESTONE = () => ({ name: '', amount: '' });

export default function BrowseJobsPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState({ category: '', search: '' });
  const [listingTab, setListingTab] = useState('task');
  const [quoteModal, setQuoteModal] = useState(null);
  const [quoteForm, setQuoteForm] = useState({
    price_type: 'pauschal',
    amount: '',
    estimated_hours: '',
    travel_cost: '',
    parking_cost: '',
    message: '',
    milestones: [EMPTY_MILESTONE(), EMPTY_MILESTONE()],
  });
  const [quoteSending, setQuoteSending] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [quoteSuccess, setQuoteSuccess] = useState('');
  const [categoryFee, setCategoryFee] = useState(null);
  const [proProfile, setProProfile] = useState(null);
  const [appliedJobIds, setAppliedJobIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    api.get('/api/categories').then(r => setCategories(r.data.categories || []));
    api.get('/api/profile/pro').then(r => setProProfile(r.data)).catch(() => {});
    fetchMyQuotes();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchJobs(); }, [filter.category, listingTab, page]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [filter.category, listingTab]);

  const fetchMyQuotes = async () => {
    try {
      const { data } = await api.get('/api/quotes');
      setAppliedJobIds(new Set((data.quotes || []).map((q) => q.job_id)));
    } catch { /* noop */ }
  };

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'open', page, listing_type: listingTab });
      if (filter.category) params.set('category', filter.category);
      const { data } = await api.get(`/api/jobs?${params.toString()}`);
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
    } catch {} finally { setLoading(false); }
  };

  const isProject = quoteModal?.listing_type === 'project';

  const openQuoteModal = (job) => {
    setQuoteModal(job);
    const isProj = job.listing_type === 'project';
    setQuoteForm({
      price_type: isProj ? 'milestone' : 'pauschal',
      amount: '', estimated_hours: '', travel_cost: '', parking_cost: '', message: '',
      milestones: [EMPTY_MILESTONE(), EMPTY_MILESTONE()],
    });
    setQuoteError('');
    setQuoteSuccess('');
    const cat = categories.find(c => c._id === job.category);
    setCategoryFee(cat?.contact_fee || 6);
  };

  const computedTotal = (() => {
    if (isProject) {
      const milestoneSum = (quoteForm.milestones || []).reduce((acc, m) => acc + (parseFloat(m.amount) || 0), 0);
      return Math.round(milestoneSum + (parseInt(quoteForm.travel_cost, 10) || 0) + (parseInt(quoteForm.parking_cost, 10) || 0));
    }
    const amt = parseInt(quoteForm.amount, 10) || 0;
    const hrs = parseFloat(quoteForm.estimated_hours) || 0;
    const base = quoteForm.price_type === 'pauschal' ? amt : Math.round(amt * hrs);
    return base + (parseInt(quoteForm.travel_cost, 10) || 0) + (parseInt(quoteForm.parking_cost, 10) || 0);
  })();

  const updateMilestone = (idx, field, val) => {
    setQuoteForm(f => {
      const ms = [...f.milestones];
      ms[idx] = { ...ms[idx], [field]: val };
      return { ...f, milestones: ms };
    });
  };

  const addMilestone = () => {
    if (quoteForm.milestones.length >= 4) return;
    setQuoteForm(f => ({ ...f, milestones: [...f.milestones, EMPTY_MILESTONE()] }));
  };

  const removeMilestone = (idx) => {
    if (quoteForm.milestones.length <= 2) return;
    setQuoteForm(f => ({ ...f, milestones: f.milestones.filter((_, i) => i !== idx) }));
  };

  const sendQuote = async () => {
    setQuoteError('');
    if (quoteForm.message.length < 20) { setQuoteError(t('quote_missing_required')); return; }

    let payload;
    if (isProject) {
      const validMs = quoteForm.milestones.filter(m => m.name.trim() && parseFloat(m.amount) > 0);
      if (validMs.length < 2) { setQuoteError(t('quote_milestone_required')); return; }
      const total = validMs.reduce((a, m) => a + parseFloat(m.amount), 0);
      payload = {
        job_id: quoteModal.id,
        price_type: 'milestone',
        amount: Math.round(total),
        travel_cost: parseInt(quoteForm.travel_cost, 10) || 0,
        parking_cost: parseInt(quoteForm.parking_cost, 10) || 0,
        message: quoteForm.message,
        milestones: validMs.map((m, i) => ({ name: m.name.trim(), amount: parseFloat(m.amount), order: i })),
      };
    } else {
      if (!quoteForm.amount) { setQuoteError(t('quote_missing_required')); return; }
      if (quoteForm.price_type === 'hourly' && (!quoteForm.estimated_hours || parseFloat(quoteForm.estimated_hours) <= 0)) {
        setQuoteError(t('quote_hours_required')); return;
      }
      payload = {
        job_id: quoteModal.id,
        price_type: quoteForm.price_type,
        amount: parseInt(quoteForm.amount, 10),
        estimated_hours: quoteForm.estimated_hours ? parseFloat(quoteForm.estimated_hours) : null,
        travel_cost: parseInt(quoteForm.travel_cost, 10) || 0,
        parking_cost: parseInt(quoteForm.parking_cost, 10) || 0,
        message: quoteForm.message,
      };
    }

    setQuoteSending(true);
    try {
      await api.post('/api/quotes', payload);
      setQuoteSuccess(t('success_quote_sent'));
      setTimeout(() => { setQuoteModal(null); fetchJobs(); fetchMyQuotes(); }, 1200);
    } catch (e) {
      const detail = e.response?.data?.detail;
      setQuoteError(detail === 'JOB_FULL' ? t('quote_job_full') : (detail || t('error_generic')));
    } finally { setQuoteSending(false); }
  };

  const filtered = jobs.filter(j =>
    !filter.search ||
    j.title.toLowerCase().includes(filter.search.toLowerCase()) ||
    j.city?.toLowerCase().includes(filter.search.toLowerCase())
  );

  const isPro = isPremiumTier(proProfile?.plan_tier);
  const quoteCap = listingTab === 'project' ? 8 : 5;

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8">
      <div className="page-container py-8">
        <div className="mb-4">
          <h1 className="text-3xl font-headings font-bold text-ink">{t('nav_browse_jobs')}</h1>
          <p className="text-ink-muted mt-1">{t('browse_subtitle')}</p>
        </div>

        {/* Task / Project tab toggle */}
        <div className="flex gap-2 mb-5 bg-cream-soft rounded-[14px] p-1.5 w-fit" data-testid="listing-type-tabs">
          {[
            { v: 'task',    label: t('browse_tasks') },
            { v: 'project', label: t('browse_projects') },
          ].map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setListingTab(v)}
              className={`px-5 py-2 rounded-[11px] text-sm font-medium transition-all ${listingTab === v ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
              data-testid={`browse-tab-${v}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={filter.search}
              onChange={e => setFilter(f => ({...f, search: e.target.value}))}
              placeholder={t('browse_search_placeholder')}
              className="sm-input pl-10"
              data-testid="jobs-search-input"
            />
          </div>
          <select
            value={filter.category}
            onChange={e => setFilter(f => ({...f, category: e.target.value}))}
            className="sm-select w-auto min-w-[160px]"
            data-testid="jobs-category-filter"
          >
            <option value="">{t('all_categories')}</option>
            {categories.map(c => <option key={c._id} value={c._id}>{c.name_en || c._id}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={32} className="text-teal animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-ink-muted">{t('no_results')}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-muted mb-4">{filtered.length} {listingTab === 'project' ? t('browse_projects') : t('browse_tasks')} {t('found_suffix')}</p>
            <div className="space-y-4">
              {filtered.map(job => {
                const alreadyApplied = appliedJobIds.has(job.id);
                return (
                  <ExpandableJobCard
                    key={job.id}
                    job={job}
                    testIdPrefix="browse-job"
                    badge={alreadyApplied ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wider bg-teal/10 text-teal px-2 py-0.5 rounded-full inline-flex items-center gap-1" data-testid={`browse-job-${job.id}-applied-badge`}>
                        <CheckCircle size={10} /> {t('quote_applied_badge')}
                      </span>
                    ) : null}
                    actions={alreadyApplied ? (
                      <button type="button" onClick={() => navigate('/my-quotes')} className="btn-ghost text-xs" data-testid={`browse-job-${job.id}-view-quote`}>{t('quote_view_my')}</button>
                    ) : (job.quote_count || 0) >= quoteCap ? (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-red-50 text-red-warn text-xs font-medium border border-red-warn/30" data-testid={`job-${job.id}-full`}>{t('quote_job_full')}</span>
                    ) : (
                      <button onClick={() => openQuoteModal(job)} className="btn-primary flex-shrink-0 text-xs" data-testid={`quote-job-${job.id}`}>
                        <Send size={14} /> {job.listing_type === 'project' ? t('quote_send_project') : t('quote_send')}
                      </button>
                    )}
                  />
                );
              })}
            </div>

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-2 mt-6" data-testid="jobs-pagination">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost text-xs disabled:opacity-40" data-testid="jobs-page-prev">← {t('prev')}</button>
                <span className="text-xs text-ink-muted px-3" data-testid="jobs-page-info">{t('page')} {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} · {total}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={page * PAGE_SIZE >= total} className="btn-ghost text-xs disabled:opacity-40" data-testid="jobs-page-next">{t('next')} →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Quote Modal */}
      {quoteModal && (
        <div className="fixed inset-0 bg-ink/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-paper rounded-t-[24px] sm:rounded-[24px] w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-headings font-bold text-ink text-xl">
                  {isProject ? t('quote_send_project') : t('quote_send')}
                </h2>
                <button onClick={() => setQuoteModal(null)} className="p-2 hover:bg-cream-soft rounded-full"><X size={18} /></button>
              </div>

              <div className="bg-cream-soft rounded-[14px] p-4 mb-4">
                <h3 className="font-semibold text-ink text-sm">{quoteModal.title}</h3>
                <p className="text-xs text-ink-muted mt-1">{quoteModal.city}</p>
              </div>

              {quoteSuccess ? (
                <div className="flex items-center gap-3 text-green-pos bg-green-pos/10 rounded-[14px] p-4 mb-4">
                  <CheckCircle size={20} /> <span className="font-semibold">{quoteSuccess}</span>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {isProject ? (
                      /* ── Milestone form for projects ── */
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-ink">{t('quote_milestone_title')} *</label>
                          {quoteForm.milestones.length < 4 && (
                            <button type="button" onClick={addMilestone} className="text-xs text-teal hover:underline flex items-center gap-1" data-testid="add-milestone-btn">
                              <Plus size={12} /> {t('quote_milestone_add')}
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {quoteForm.milestones.map((ms, idx) => (
                            <div key={idx} className="flex gap-2 items-center" data-testid={`milestone-row-${idx}`}>
                              <input
                                type="text"
                                value={ms.name}
                                onChange={e => updateMilestone(idx, 'name', e.target.value)}
                                placeholder={`${t('quote_milestone_phase')} ${idx + 1}`}
                                className="sm-input flex-1 text-sm"
                                data-testid={`milestone-name-${idx}`}
                              />
                              <div className="relative w-28 flex-shrink-0">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm font-semibold">€</span>
                                <input
                                  type="number"
                                  value={ms.amount}
                                  onChange={e => updateMilestone(idx, 'amount', e.target.value)}
                                  placeholder="0"
                                  className="sm-input pl-7 text-sm"
                                  min="1"
                                  data-testid={`milestone-amount-${idx}`}
                                />
                              </div>
                              {quoteForm.milestones.length > 2 && (
                                <button type="button" onClick={() => removeMilestone(idx)} className="p-1.5 text-ink-muted hover:text-red-warn" data-testid={`milestone-remove-${idx}`}>
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* ── Standard price form for tasks ── */
                      <>
                        <div>
                          <label className="block text-sm font-medium text-ink mb-2">{t('quote_price_type')} *</label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { v: 'pauschal', label: t('quote_price_type_pauschal'), sub: t('quote_price_type_pauschal_sub') },
                              { v: 'hourly',   label: t('quote_price_type_hourly'),   sub: t('quote_price_type_hourly_sub') },
                            ].map((opt) => (
                              <button key={opt.v} type="button" onClick={() => setQuoteForm(f => ({ ...f, price_type: opt.v }))}
                                className={`px-3 py-2.5 rounded-[12px] text-left border transition-colors ${quoteForm.price_type === opt.v ? 'border-teal bg-teal/5 text-ink' : 'border-sm-border bg-paper text-ink hover:bg-cream-soft'}`}
                                data-testid={`quote-pricetype-${opt.v}`}>
                                <p className="text-sm font-medium">{opt.label}</p>
                                <p className="text-[10px] text-ink-muted">{opt.sub}</p>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-ink mb-1.5">{quoteForm.price_type === 'pauschal' ? t('quote_amount_pauschal') : t('quote_amount_hourly')} *</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm font-semibold">€</span>
                              <input type="number" value={quoteForm.amount} onChange={e => setQuoteForm(f => ({ ...f, amount: e.target.value }))} placeholder={quoteForm.price_type === 'pauschal' ? '150' : '45'} className="sm-input pl-7" min="1" data-testid="quote-amount-input" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-ink mb-1.5">{t('quote_estimated_hours')} {quoteForm.price_type === 'hourly' && '*'}</label>
                            <input type="number" value={quoteForm.estimated_hours} onChange={e => setQuoteForm(f => ({ ...f, estimated_hours: e.target.value }))} placeholder="2.5" className="sm-input" min="0" step="0.5" data-testid="quote-hours-input" />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Travel + parking (both modes) */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">{t('quote_travel_cost')}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm font-semibold">€</span>
                          <input type="number" value={quoteForm.travel_cost} onChange={e => setQuoteForm(f => ({ ...f, travel_cost: e.target.value }))} placeholder="0" className="sm-input pl-7" min="0" data-testid="quote-travel-input" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1.5">{t('quote_parking_cost')}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm font-semibold">€</span>
                          <input type="number" value={quoteForm.parking_cost} onChange={e => setQuoteForm(f => ({ ...f, parking_cost: e.target.value }))} placeholder="0" className="sm-input pl-7" min="0" data-testid="quote-parking-input" />
                        </div>
                      </div>
                    </div>

                    {/* Total preview */}
                    {computedTotal > 0 && (
                      <div className="bg-teal/5 border border-teal/30 rounded-[12px] px-4 py-2.5 flex items-center justify-between" data-testid="quote-total-preview">
                        <span className="text-sm font-medium text-ink">{t('quote_total_label')}</span>
                        <span className="text-xl font-headings font-bold text-teal">€{computedTotal}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">{t('quote_message')} *</label>
                      <textarea value={quoteForm.message} onChange={e => setQuoteForm(f => ({ ...f, message: e.target.value }))} placeholder={isProject ? t('quote_message_project_placeholder') : t('quote_message_placeholder')} className="sm-textarea" rows={4} data-testid="quote-message-input" />
                      <p className={`text-xs mt-1 ${quoteForm.message.length < 20 ? 'text-red-warn' : 'text-ink-muted'}`}>{quoteForm.message.length}/20 {t('min_chars')}</p>
                    </div>
                  </div>

                  <div className={`mt-4 px-4 py-3 rounded-[14px] text-sm flex items-center gap-2 ${isPro ? 'bg-amber/10 text-amber-deep border border-amber/30' : 'bg-cream-deep text-ink-muted border border-sm-border'}`}>
                    {isPro ? <><span className="pro-badge mr-1">PRO</span> {t('quote_free_note')}</> : <>{t('quote_fee_note', { fee: categoryFee })}</>}
                  </div>

                  {quoteError && (
                    <div className="flex items-center gap-2 text-red-warn bg-red-50 rounded-[14px] p-3 mt-3 text-sm">
                      <AlertCircle size={14} /> {quoteError}
                    </div>
                  )}

                  <div className="flex gap-3 mt-5">
                    <button onClick={() => setQuoteModal(null)} className="btn-ghost flex-1">{t('btn_cancel')}</button>
                    <button onClick={sendQuote} disabled={quoteSending} className="btn-primary flex-1" data-testid="send-quote-btn">
                      {quoteSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {quoteSending ? t('quote_send_loading') : (isProject ? t('quote_send_project') : t('quote_send'))}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

