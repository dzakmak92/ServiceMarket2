import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import ExpandableJobCard from '../../components/ExpandableJobCard';
import ClickToInvoiceLink from '../../components/ClickToInvoiceLink';
import ScrollSnapTabStrip, { SwipeableTabPanel } from '../../components/ScrollSnapTabStrip';
import { Loader2, MessageCircle, Inbox, Trophy, CheckCircle, Receipt, XCircle, AlertTriangle } from 'lucide-react';
import ReportProblemButton from '../../components/ReportProblemButton';

const TABS = [
  { key: 'applied', icon: Inbox, labelKey: 'my_quotes_tab_applied' },
  { key: 'won', icon: Trophy, labelKey: 'my_quotes_tab_won' },
  { key: 'completed', icon: CheckCircle, labelKey: 'my_quotes_tab_completed' },
  { key: 'complaints', icon: AlertTriangle, labelKey: 'my_quotes_tab_complaints' },
  { key: 'lost', icon: XCircle, labelKey: 'my_quotes_tab_lost' },
];

/**
 * Returns the bucket a quote falls into:
 *  - 'won'        — homeowner accepted; job in_progress
 *  - 'completed'  — job fully completed
 *  - 'complaints' — pro has an open/in-progress complaint on this job
 *  - 'lost'       — pro explicitly marked lost
 *  - 'applied'    — everything else
 *
 * Iter45: complaints take priority over won/completed so the pro sees them in one place.
 */
function bucketFor(q) {
  if (q.has_open_complaint) return 'complaints';
  if (q.status === 'lost') return 'lost';
  if (q.job_status === 'completed' && q.status === 'accepted') return 'completed';
  if (q.status === 'accepted') return 'won';
  return 'applied';
}

export default function MyQuotesPage() {
  const { t } = useLang();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('applied');
  const [hasToolkit, setHasToolkit] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/quotes'),
      api.get('/api/profile/pro').catch(() => ({ data: null })),
    ])
      .then(([qr, pr]) => {
        setQuotes(qr.data.quotes || []);
        setHasToolkit(!!pr.data?.has_invoice_toolkit);
      })
      .catch(() => setQuotes([]))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = { applied: 0, won: 0, completed: 0, complaints: 0, lost: 0 };
    for (const q of quotes) c[bucketFor(q)] += 1;
    return c;
  }, [quotes]);

  const markLost = async (quoteId) => {
    try {
      await api.post(`/api/quotes/${quoteId}/mark-lost`);
      setQuotes((arr) => arr.map((x) => x.id === quoteId ? { ...x, status: 'lost' } : x));
    } catch {
      /* noop */
    }
  };

  const filtered = useMemo(
    () => quotes.filter((q) => bucketFor(q) === tab),
    [quotes, tab]
  );

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8">
      <div className="page-container py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-headings font-bold text-ink">{t('my_quotes_title')}</h1>
          <p className="text-ink-muted mt-1">{t('my_quotes_subtitle')}</p>
        </div>

        {/* Tabs — horizontally scrollable on mobile with scroll-snap */}
        <ScrollSnapTabStrip
          tabs={TABS.map((t2) => ({ key: t2.key, label: t(t2.labelKey), count: counts[t2.key] }))}
          activeKey={tab}
          onChange={setTab}
          testidPrefix="my-quotes-tab"
          variant="underline"
        />

        <SwipeableTabPanel
          tabKeys={TABS.map((t2) => t2.key)}
          activeKey={tab}
          onChange={setTab}
          className="mt-4"
        >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="text-teal animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-ink-muted">{t(`my_quotes_empty_${tab}`)}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((q) => {
              // ExpandableJobCard expects a job-shaped object — synthesize from the quote
              const jobLike = {
                id: q.job_id,
                title: q.job_title || `Job #${q.job_id.slice(-6)}`,
                description: q.job_description || '',
                category: q.job_category,
                city: q.job_city,
                status: q.job_status,
                urgency: q.job_urgency,
                budget_min: q.job_budget_min,
                budget_max: q.job_budget_max,
                posted_at: q.job_posted_at,
                attachments: q.job_attachments,
                job_number: q.job_number,
              };
              return (
                <ExpandableJobCard
                  key={q.id}
                  job={jobLike}
                  testIdPrefix="my-quote-job"
                  badge={
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full
                        ${q.status === 'accepted' ? 'bg-green-pos/15 text-green-pos'
                          : q.status === 'declined' ? 'bg-red-warn/15 text-red-warn'
                          : 'bg-amber/15 text-amber-deep'}`}
                    >
                      {t(`quote_status_${q.status}`)}
                    </span>
                  }
                  actions={q.status === 'accepted' && q.job_posted_by_id ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Link
                        to={`/messages?job=${q.job_id}&to=${q.job_posted_by_id}`}
                        className="btn-primary text-xs inline-flex items-center gap-1"
                        data-testid={`my-quote-job-${q.job_id}-message`}
                      >
                        <MessageCircle size={12} /> {t('my_quotes_open_chat')}
                      </Link>
                      <ClickToInvoiceLink
                        jobId={q.job_id}
                        jobStatus={q.job_status}
                        hasToolkit={hasToolkit}
                        t={t}
                        testIdPrefix={`my-quote-job-${q.job_id}`}
                      />
                      {/* Iter45: Won-tab cards show "Report a problem" — moves the job to Complaints */}
                      {!q.has_open_complaint && (
                        <ReportProblemButton
                          jobId={q.job_id}
                          jobTitle={q.job_title}
                          variant="icon"
                          testidPrefix={`my-quote-report-${q.job_id}`}
                        />
                      )}
                    </div>
                  ) : (q.status === 'pending' || q.status === 'declined') && q.job_status !== 'completed' ? (
                    <button
                      onClick={() => markLost(q.id)}
                      className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-red-warn/40 bg-red-warn/10 text-red-warn hover:bg-red-warn/15 flex-shrink-0 transition-colors"
                      title={t('my_quotes_mark_lost_hint')}
                      data-testid={`my-quote-mark-lost-${q.id}`}
                    >
                      <XCircle size={12} /> {t('my_quotes_mark_lost')}
                    </button>
                  ) : null}
                  footer={
                    <div className="bg-cream-soft border border-sm-border rounded-[12px] p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t('my_quotes_your_price')}</span>
                        <span className="text-lg font-headings font-bold text-teal">€{q.price}</span>
                      </div>
                      {q.message && (
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t('my_quotes_your_message')}</span>
                          <p className="text-sm text-ink-soft mt-0.5 whitespace-pre-wrap">{q.message}</p>
                        </div>
                      )}
                      <p className="text-[10px] text-ink-muted">
                        {t('my_quotes_sent_at')} {new Date(q.sent_at).toLocaleString()}
                      </p>
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
        </SwipeableTabPanel>
      </div>
    </div>
  );
}
