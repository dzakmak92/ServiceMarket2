import React, { useState, useEffect } from 'react';
import api, { apiBase } from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import {
  Eye, CheckCircle2, XCircle, Loader2, ExternalLink, FileText,
  Mail, Phone, MapPin, AlertCircle,
} from 'lucide-react';

const DocBlock = ({ label, status, url, onApprove, onReject, busy, t, allowMissing = false, onMissing }) => (
  <div className="rounded-[12px] border border-sm-border p-4 bg-paper space-y-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <FileText size={14} className="text-ink-soft" />
        <p className="text-sm font-semibold text-ink">{label}</p>
      </div>
      <span className={`status-pill ${
        status === 'verified' ? 'status-done'
        : status === 'rejected' ? 'status-cancelled'
        : status === 'missing' ? 'status-pending'
        : 'status-pending'
      }`}>
        {t(`verif_status_${status || 'pending'}`)}
      </span>
    </div>
    {url ? (
      <a
        href={`${apiBase}${url}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-teal underline hover:text-teal-deep"
      >
        <ExternalLink size={11} /> {t('verif_open_doc')}
      </a>
    ) : (
      <p className="text-xs text-ink-muted italic">{t('verif_no_doc')}</p>
    )}
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onApprove}
        disabled={busy || !url}
        className="admin-btn admin-btn-primary admin-btn-sm"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        {t('verif_btn_approve')}
      </button>
      <button
        onClick={onReject}
        disabled={busy}
        className="admin-btn admin-btn-danger admin-btn-sm"
      >
        <XCircle size={12} /> {t('verif_btn_reject')}
      </button>
      {allowMissing && (
        <button
          onClick={onMissing}
          disabled={busy}
          className="admin-btn admin-btn-ghost admin-btn-sm"
        >
          {t('verif_btn_mark_missing')}
        </button>
      )}
    </div>
  </div>
);

export default function AdminVerifications({ flash }) {
  const { t } = useLang();
  const [pros, setPros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/verifications');
      setPros(data.pros || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const update = async (proId, body) => {
    setBusy(proId);
    try {
      await api.patch(`/api/admin/pros/${proId}/verify`, body);
      flash(t('verif_updated_msg'));
      await fetchData();
    } catch {
      flash(t('error_generic'));
    } finally { setBusy(null); }
  };

  const detail = pros.find((p) => p.id === openId);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={28} className="text-teal animate-spin" /></div>;

  return (
    <div className="admin-panel" data-testid="verifications-panel">
      <h2 className="font-headings font-bold text-ink text-xl mb-4">{t('admin_pro_verifications')}</h2>
      {pros.length === 0 ? (
        <p className="text-center text-ink-muted py-8">{t('admin_no_pending_v')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin_th_pro')}</th>
                <th>{t('admin_th_business')}</th>
                <th>{t('admin_th_country')}</th>
                <th>{t('verif_th_licence')}</th>
                <th>{t('verif_th_insurance')}</th>
                <th className="text-right">{t('admin_th_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pros.map((p) => {
                const ls = p.licence_status || (p.licence_url ? 'pending' : 'missing');
                const is = p.insurance_status || (p.insurance_url ? 'pending' : 'missing');
                return (
                  <tr key={p.id} data-testid={`verif-row-${p.id}`}>
                    <td className="font-medium text-ink">{p.user_name}</td>
                    <td className="text-ink-soft">{p.business_name || '—'}</td>
                    <td className="text-ink-soft">{p.user_country || '—'}</td>
                    <td>
                      <span className={`status-pill ${ls === 'verified' ? 'status-done' : ls === 'rejected' ? 'status-cancelled' : 'status-pending'}`}>
                        {t(`verif_status_${ls}`)}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${is === 'verified' ? 'status-done' : is === 'rejected' ? 'status-cancelled' : 'status-pending'}`}>
                        {t(`verif_status_${is}`)}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          className="admin-btn admin-btn-ghost admin-btn-sm"
                          onClick={() => setOpenId(p.id)}
                          data-testid={`verif-view-${p.id}`}
                        >
                          <Eye size={12} /> {t('btn_view_short')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setOpenId(null)}
          data-testid="verif-modal"
        >
          <div
            className="bg-paper rounded-[14px] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-sm-border flex items-center justify-between">
              <div>
                <h3 className="font-headings font-bold text-ink text-lg">{detail.user_name}</h3>
                <p className="text-xs text-ink-muted">{detail.business_name || t('verif_no_business')}</p>
              </div>
              <button onClick={() => setOpenId(null)} className="admin-btn admin-btn-ghost admin-btn-sm">
                {t('btn_close')}
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Contact info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <p className="flex items-center gap-2 text-ink-soft"><Mail size={12} /> {detail.user_email}</p>
                <p className="flex items-center gap-2 text-ink-soft"><Phone size={12} /> {detail.user_phone || '—'}</p>
                <p className="flex items-center gap-2 text-ink-soft"><MapPin size={12} /> {detail.user_country || '—'}</p>
                <a
                  href={`/pros/${detail.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-teal text-xs underline"
                >
                  <ExternalLink size={11} /> {t('verif_open_public_profile')}
                </a>
              </div>

              {/* Licence (required) */}
              <DocBlock
                t={t}
                label={t('verif_licence_label')}
                status={detail.licence_status || (detail.licence_url ? 'pending' : 'missing')}
                url={detail.licence_url}
                busy={busy === detail.id}
                onApprove={() => update(detail.id, { licence_status: 'verified' })}
                onReject={() => update(detail.id, { licence_status: 'rejected' })}
              />

              {/* Insurance (optional) */}
              <DocBlock
                t={t}
                label={t('verif_insurance_label')}
                status={detail.insurance_status || (detail.insurance_url ? 'pending' : 'missing')}
                url={detail.insurance_url}
                busy={busy === detail.id}
                onApprove={() => update(detail.id, { insurance_status: 'verified' })}
                onReject={() => update(detail.id, { insurance_status: 'rejected' })}
                allowMissing
                onMissing={() => update(detail.id, { insurance_status: 'missing' })}
              />

              {!detail.licence_url && !detail.insurance_url && (
                <p className="flex items-center gap-2 text-xs text-amber-deep italic">
                  <AlertCircle size={12} /> {t('verif_no_docs_uploaded')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
