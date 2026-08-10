import React, { useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import LegalPageLayout from './LegalPageLayout';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const REQUEST_TYPES = [
  { value: 'access', label: 'Access — I want a copy of my personal data' },
  { value: 'rectification', label: 'Rectification — Some data is inaccurate, please correct' },
  { value: 'erasure', label: 'Erasure — Delete my personal data' },
  { value: 'restriction', label: 'Restriction — Pause processing of my data' },
  { value: 'portability', label: 'Portability — Send me my data in machine-readable format' },
  { value: 'object', label: 'Object — I object to specific processing' },
  { value: 'withdraw_consent', label: 'Withdraw consent — Stop processing based on my consent' },
];

export default function DataRightsPage() {
  const { t } = useLang();
  const [form, setForm] = useState({
    name: '', email: '', request_type: 'access', details: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      const { data } = await api.post('/api/privacy/data-rights-request', form);
      setSuccess({ id: data.id, due_at: data.due_at });
    } catch (err) {
      setError(err.response?.data?.detail || t('dsr_err_submit'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LegalPageLayout title={t('dsr_title')} version="1.0" lastUpdated="2026-02-28">
      <p className="lead">
        {t('dsr_lead', { mail: 'contact@servicemarket.at' })}
      </p>

      {success ? (
        <div className="rounded-[14px] border border-green-pos/30 bg-green-pos/5 p-5 text-center my-6" data-testid="data-rights-success">
          <CheckCircle size={32} className="text-green-text mx-auto mb-2" />
          <p className="font-semibold text-ink">{t('dsr_received')} <code>{success.id.slice(-8)}</code></p>
          <p className="text-sm text-ink-muted mt-1">
            {t('dsr_due', { date: new Date(success.due_at).toLocaleDateString() })}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 not-prose" data-testid="data-rights-form">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Full name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="sm-input"
              data-testid="data-rights-name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Email *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="sm-input"
              data-testid="data-rights-email"
              placeholder={t('dsr_email_hint')}
            />
            <p className="text-[10px] text-ink-muted mt-1">
              {t('dsr_verify_hint')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Type of request *</label>
            <select
              value={form.request_type}
              onChange={(e) => setForm({ ...form, request_type: e.target.value })}
              className="sm-select"
              data-testid="data-rights-type"
            >
              {REQUEST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Additional details (optional)</label>
            <textarea
              rows={4}
              value={form.details}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              className="sm-textarea"
              data-testid="data-rights-details"
              placeholder={t('dsr_details_hint')}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-warn bg-red-50 rounded-[12px] p-3 text-sm">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !form.name || !form.email}
            className="btn-primary w-full"
            data-testid="data-rights-submit"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </form>
      )}

      <hr className="my-8" />

      <h2>{t('dsr_authority')}</h2>
      <p>
        {t('dsr_authority_body')}<br />
        {/* The authority's own name stays in German — it is how the body is
            registered and how a complaint must be addressed. */}
        <strong>Österreichische Datenschutzbehörde</strong>{t('dsr_authority_addr')}{' '}
        <a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer">dsb.gv.at</a>.
      </p>
    </LegalPageLayout>
  );
}
