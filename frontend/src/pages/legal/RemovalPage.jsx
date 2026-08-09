import React, { useState } from 'react';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import LegalPageLayout from './LegalPageLayout';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function RemovalPage() {
  const { t } = useLang();
  const [form, setForm] = useState({ business_name: '', email: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      const { data } = await api.post('/api/privacy/removal-request', form);
      setSuccess({ id: data.id, due_at: data.due_at });
    } catch (err) {
      setError(err.response?.data?.detail || t('dsr_err_submit'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LegalPageLayout title={t('rem_title')} version="1.0" lastUpdated="2026-02-28">
      <p className="lead">
        {t('rem_lead')}
      </p>
      <p className="text-sm text-ink-muted">
        {t('rem_note', { link: '' })}{' '}
        <a href="/settings">{t('rem_settings_link')}</a>
      </p>

      {success ? (
        <div className="rounded-[14px] border border-green-pos/30 bg-green-pos/5 p-5 text-center my-6" data-testid="removal-success">
          <CheckCircle size={32} className="text-green-pos mx-auto mb-2" />
          <p className="font-semibold text-ink">{t('rem_received')} <code>{success.id.slice(-8)}</code></p>
          <p className="text-sm text-ink-muted mt-1">
            {t('rem_due', { date: new Date(success.due_at).toLocaleDateString() })}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 not-prose" data-testid="removal-form">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Business name *</label>
            <input
              required
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              className="sm-input"
              data-testid="removal-business-name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Contact email *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="sm-input"
              data-testid="removal-email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Reason / additional context (optional)</label>
            <textarea
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="sm-textarea"
              data-testid="removal-reason"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-warn bg-red-50 rounded-[12px] p-3 text-sm">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || !form.business_name || !form.email}
            className="btn-primary w-full"
            data-testid="removal-submit"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {submitting ? 'Submitting…' : 'Submit removal request'}
          </button>
        </form>
      )}
    </LegalPageLayout>
  );
}
