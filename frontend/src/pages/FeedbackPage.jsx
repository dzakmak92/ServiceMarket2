import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LangContext';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Lightbulb, AlertOctagon, AlertTriangle, CheckCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import ScrollSnapTabStrip, { SwipeableTabPanel } from '../components/ScrollSnapTabStrip';

const KINDS = [
  { v: 'feedback', label: 'General feedback', icon: MessageSquare, accent: '#2d6a7f',
    hint: 'Tell us how we\'re doing. Share what works, what doesn\'t, what you\'d like to see.' },
  { v: 'feature', label: 'Feature request', icon: Lightbulb, accent: '#f5a623',
    hint: 'Have an idea? Pitch it here — we read every suggestion.' },
  { v: 'issue', label: 'Report an issue', icon: AlertOctagon, accent: '#c0392b',
    hint: 'Something broken or confusing? Describe what went wrong so we can fix it.' },
];

const STATUS_META = {
  open:         { label: 'Open', color: 'bg-amber/15 text-amber-deep' },
  in_progress:  { label: 'In Progress', color: 'bg-teal/15 text-teal' },
  resolved:     { label: 'Resolved', color: 'bg-green-pos/15 text-green-text' },
  closed:       { label: 'Closed', color: 'bg-cream-deep text-ink-muted' },
};

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.open;
  return <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${m.color}`}>{m.label}</span>;
}

export default function FeedbackPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [tab, setTab] = useState('submit');
  const [kind, setKind] = useState('feedback');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!user) navigate('/auth?next=/feedback');
  }, [user, navigate]);

  const loadMine = () => {
    setLoadingMine(true);
    api.get('/api/feedback/mine')
      .then((r) => setSubmissions(r.data.items || []))
      .finally(() => setLoadingMine(false));
  };

  useEffect(() => {
    if (tab === 'mine') loadMine();
  }, [tab]);

  const submit = async (e) => {
    e?.preventDefault();
    if (subject.length < 3 || message.length < 5) {
      setNotice('Subject (3+) and message (5+) are required');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/feedback', {
        kind, subject, message,
        ...(kind === 'feedback' && rating > 0 ? { rating } : {}),
      });
      setNotice(t('feedback_thanks'));
      setSubject('');
      setMessage('');
      setRating(0);
      setTimeout(() => setTab('mine'), 800);
    } catch (err) {
      setNotice(err?.response?.data?.detail || t('err_submit_failed'));
    } finally {
      setBusy(false);
      setTimeout(() => setNotice(null), 4000);
    }
  };

  if (!user) return null;
  const activeMeta = KINDS.find(k => k.v === kind);
  const ActiveIcon = activeMeta?.icon || MessageSquare;

  return (
    <div className="min-h-screen bg-cream pt-8 pb-24 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="font-headings font-bold text-4xl text-ink mb-1">{t('fb_title')}</h1>
          <p className="text-ink-muted">{t('fb_subtitle')}</p>
        </div>

        {/* Tabs */}
        <ScrollSnapTabStrip
          tabs={[
            { key: 'submit', label: 'Submit' },
            { key: 'mine', label: 'My submissions' },
          ]}
          activeKey={tab}
          onChange={setTab}
          testidPrefix="feedback-tab"
          variant="underline"
          className="mb-5"
        />

        {notice && (
          <div className="mb-4 px-4 py-2.5 bg-teal/10 text-teal text-sm rounded-lg" data-testid="feedback-notice">{notice}</div>
        )}

        <SwipeableTabPanel tabKeys={['submit', 'mine']} activeKey={tab} onChange={setTab}>

        {tab === 'submit' ? (
          <form onSubmit={submit} className="bg-paper border border-sm-border rounded-2xl p-6 space-y-5" data-testid="feedback-submit-form">
            {/* Kind selector */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">{t('fb_about')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {KINDS.map(({ v, label, icon: Icon, accent }) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setKind(v)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all text-left
                      ${kind === v ? 'border-teal bg-teal/5' : 'border-sm-border hover:bg-cream-soft'}`}
                    data-testid={`feedback-kind-${v}`}
                  >
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-paper flex-shrink-0" style={{ background: accent }}>
                      <Icon size={14} />
                    </span>
                    <span className="text-sm font-bold text-ink">{label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-muted mt-2 flex items-start gap-2">
                <ActiveIcon size={12} className="mt-0.5 flex-shrink-0" /> {activeMeta?.hint}
              </p>
            </div>

            {/* Rating (only for general feedback) */}
            {kind === 'feedback' && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">{t('fb_rating')} <span className="text-ink-muted">{t('fb_optional')}</span></p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n === rating ? 0 : n)}
                      className={`text-2xl transition-all ${n <= rating ? 'text-amber' : 'text-cream-deep hover:text-amber/50'}`}
                      data-testid={`feedback-rate-${n}`}
                    >★</button>
                  ))}
                </div>
              </div>
            )}

            {/* Subject */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">{t('fb_subject')}</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('fb_subject_ph')}
                maxLength={140}
                required
                className="w-full px-3 py-2 rounded-lg border border-sm-border focus:outline-none focus:ring-2 focus:ring-teal text-sm"
                data-testid="feedback-subject"
              />
            </div>

            {/* Message */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">{t('fb_message')}</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder={t('fb_message_ph')}
                maxLength={4000}
                required
                className="w-full px-3 py-2 rounded-lg border border-sm-border focus:outline-none focus:ring-2 focus:ring-teal text-sm"
                data-testid="feedback-message"
              />
              <p className="text-xs text-ink-muted mt-1 text-right">{message.length}/4000</p>
            </div>

            <button
              type="submit"
              disabled={busy || subject.length < 3 || message.length < 5}
              className="w-full px-4 py-2.5 rounded-lg bg-teal text-paper font-bold disabled:opacity-50 hover:bg-teal/90 transition-colors"
              data-testid="feedback-submit-btn"
            >
              {busy ? 'Submitting…' : 'Send to ServiceMarket'}
            </button>
          </form>
        ) : (
          <div className="bg-paper border border-sm-border rounded-2xl p-4" data-testid="feedback-mine-list">
            {loadingMine ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={20} className="text-teal animate-spin" /></div>
            ) : submissions.length === 0 ? (
              <div className="text-center py-12 text-ink-muted">
                <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                {t('feedback_none_yet')}
              </div>
            ) : (
              <ul className="divide-y divide-sm-border">
                {submissions.map((i) => {
                  const isSupport = i.entry_kind === 'support';
                  const Icon = isSupport ? AlertTriangle : (KINDS.find(k => k.v === i.kind)?.icon || MessageSquare);
                  const accent = isSupport ? '#c0392b' : (KINDS.find(k => k.v === i.kind)?.accent || '#2d6a7f');
                  const isExpanded = expandedId === i.id;
                  return (
                    <li key={i.id} className="py-3 flex items-start gap-3" data-testid={`mine-row-${i.id}`}>
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-paper flex-shrink-0" style={{ background: accent }}>
                        <Icon size={14} />
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : i.id)}
                        className="min-w-0 flex-1 text-left hover:bg-cream-soft/50 -mx-2 px-2 py-1 rounded-md transition-colors"
                        data-testid={`mine-row-toggle-${i.id}`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-ink text-sm">{i.subject}</span>
                          <StatusPill status={i.status} />
                          <span className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">
                            {isSupport ? `complaint · ${i.category}` : i.kind}
                          </span>
                          <span className="ml-auto text-ink-muted">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </span>
                        </div>
                        <p className="text-xs text-ink-muted mt-0.5">
                          {new Date(i.created_at).toLocaleDateString()} · {new Date(i.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {i.job_title && ` · Job: ${i.job_title}`}
                        </p>
                        {!isExpanded && (
                          <p className="text-sm text-ink-soft mt-1 line-clamp-1">{i.message}</p>
                        )}
                        {isExpanded && (
                          <div className="mt-3 space-y-3" data-testid={`mine-row-expanded-${i.id}`}>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted mb-1">{t('fb_your_message')}</p>
                              <p className="text-sm text-ink whitespace-pre-wrap">{i.message}</p>
                            </div>
                            {isSupport && (
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">{t('fb_category')}</p>
                                  <p className="text-ink capitalize">{(i.category || '').replace('_', ' ')}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">{t('fb_submitted')}</p>
                                  <p className="text-ink">{new Date(i.created_at).toLocaleString()}</p>
                                </div>
                                {i.resolved_at && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">{t('fb_resolved_at')}</p>
                                    <p className="text-ink">{new Date(i.resolved_at).toLocaleString()}</p>
                                  </div>
                                )}
                                {i.job_title && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">{t('fb_related_job')}</p>
                                    <p className="text-ink truncate">{i.job_title}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            {!isSupport && i.rating && (
                              <div>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">{t('fb_your_rating')}</p>
                                <p className="text-amber text-base">{'★'.repeat(i.rating)}{'☆'.repeat(5 - i.rating)}</p>
                              </div>
                            )}
                            {i.admin_response && (
                              <div className="bg-teal/5 border-l-2 border-teal pl-3 py-2 text-sm text-ink rounded-r-lg">
                                <p className="text-[10px] uppercase tracking-wider font-bold text-teal mb-0.5">{t('fb_response')}</p>
                                {i.admin_response}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        </SwipeableTabPanel>
      </div>
    </div>
  );
}
