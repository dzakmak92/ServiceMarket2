import React, { useState } from 'react';
import { useLang } from '../contexts/LangContext';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

const CATEGORIES = [
  { v: 'pricing', l: 'Pricing / fee dispute', hint: 'Contact fee, won-job fee or 1% Pay-Now fee.' },
  { v: 'no_show', l: 'No-show', hint: 'Customer never showed or stopped responding.' },
  { v: 'quality', l: 'Quality issue', hint: 'Disagreement about the job outcome.' },
  { v: 'communication', l: 'Communication', hint: 'Repeated rude / abusive messages, spam, etc.' },
  { v: 'other', l: 'Other', hint: 'Something else — describe in the message.' },
];

/**
 * "Report a problem" button — visible to PROS only.
 * Opens a modal that creates a support ticket bound to a job.
 *
 * Props:
 *  - jobId (required)
 *  - jobTitle (optional)
 *  - variant: 'icon' | 'button' (default 'button')
 *  - className: extra classes
 *  - testid prefix override
 */
export default function ReportProblemButton({
  jobId,
  jobTitle = '',
  variant = 'button',
  className = '',
  testidPrefix = 'report-problem',
}) {
  const { t } = useLang();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('pricing');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  // Only show for pros (tradesperson role)
  if (!user || user.role !== 'tradesperson') return null;

  const submit = async (e) => {
    e?.preventDefault();
    if (subject.length < 3 || message.length < 5) {
      setError('Subject (3+) and message (5+) required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/feedback/support', {
        job_id: jobId,
        category,
        subject,
        message,
      });
      setDone(true);
      setSubject('');
      setMessage('');
      setCategory('pricing'); // reset to default for next open
      setTimeout(() => { setOpen(false); setDone(false); }, 1800);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Submission failed');
    } finally {
      setBusy(false);
    }
  };

  const Trigger = variant === 'icon' ? (
    <button
      onClick={() => setOpen(true)}
      className={`p-2 rounded-lg text-ink-muted hover:text-red-warn hover:bg-red-warn/10 transition-colors ${className}`}
      title={t('rp_title')}
      data-testid={`${testidPrefix}-trigger`}
    >
      <AlertTriangle size={14} />
    </button>
  ) : (
    <button
      onClick={() => setOpen(true)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-red-warn/40 bg-red-warn/10 text-red-warn hover:bg-red-warn/15 transition-colors ${className}`}
      data-testid={`${testidPrefix}-trigger`}
    >
      <AlertTriangle size={12} /> Report a problem
    </button>
  );

  return (
    <>
      {Trigger}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-testid={`${testidPrefix}-modal`}>
          <div className="bg-paper rounded-2xl max-w-lg w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headings font-bold text-ink text-lg flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-warn" />
                Report a problem
              </h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-cream-deep" data-testid={`${testidPrefix}-close`}>
                <X size={16} />
              </button>
            </div>
            {jobTitle && (
              <p className="text-xs text-ink-muted mb-3">{t('rp_job')} <span className="text-ink font-bold">{jobTitle}</span></p>
            )}
            {done ? (
              <div className="text-center py-8" data-testid={`${testidPrefix}-success`}>
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-pos/15 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-green-pos" />
                </div>
                <p className="font-bold text-ink">{t('rp_filed')}</p>
                <p className="text-sm text-ink-muted mt-1">{t('rp_filed_desc')}</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                {/* Category */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">{t('fb_category')}</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {CATEGORIES.map((c) => (
                      <button
                        type="button"
                        key={c.v}
                        onClick={() => setCategory(c.v)}
                        className={`text-left p-2 rounded-lg border transition-colors
                          ${category === c.v ? 'border-teal bg-teal/5' : 'border-sm-border hover:bg-cream-soft'}`}
                        data-testid={`${testidPrefix}-cat-${c.v}`}
                      >
                        <p className="text-sm font-bold text-ink">{c.l}</p>
                        <p className="text-xs text-ink-muted">{c.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Subject */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">{t('fb_subject')}</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t('rp_subject_ph')}
                    maxLength={140}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-sm-border focus:outline-none focus:ring-2 focus:ring-teal text-sm"
                    data-testid={`${testidPrefix}-subject`}
                  />
                </div>
                {/* Message */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">{t('fb_message')}</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    placeholder={t('rp_message_ph')}
                    maxLength={4000}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-sm-border focus:outline-none focus:ring-2 focus:ring-teal text-sm"
                    data-testid={`${testidPrefix}-message`}
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-warn">{error}</p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setOpen(false)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-sm-border text-sm">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || subject.length < 3 || message.length < 5}
                    className="px-4 py-1.5 rounded-lg bg-red-warn text-paper text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
                    data-testid={`${testidPrefix}-submit`}
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                    Submit ticket
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
