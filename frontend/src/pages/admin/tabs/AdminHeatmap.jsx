import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '../../../contexts/LangContext';
import api, { formatError, apiBase } from '../../../api/client';
import BusinessHeatMap, { MAP_COLORS } from '../../../components/BusinessHeatMap';
import {
  Loader2, Flame, Upload, BadgeCheck, Hand, Building2, Check, X,
  MapPin, Clock, Download, Mail,
} from 'lucide-react';

function StatCard({ label, value, accent = 'text-teal', testid }) {
  return (
    <div className="card-lg text-center py-4" data-testid={testid}>
      <p className={`text-2xl font-headings font-bold ${accent}`}>{value}</p>
      <p className="text-[11px] text-ink-muted mt-0.5">{label}</p>
    </div>
  );
}

function BreakdownList({ title, rows, keyName }) {
  const { t } = useLang();
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card-lg" data-testid={`breakdown-${keyName}`}>
      <h4 className="font-headings font-bold text-ink text-sm mb-3">{title}</h4>
      <div className="space-y-1.5">
        {rows.length === 0 ? (
          <p className="text-xs text-ink-muted">{t('admin_no_data')}</p>
        ) : rows.map((r) => (
          <div key={r[keyName]} className="flex items-center gap-2">
            <span className="text-xs text-ink-soft w-28 truncate">{r[keyName]}</span>
            <div className="flex-1 h-2 rounded-full bg-cream-deep overflow-hidden">
              <div className="h-full bg-teal rounded-full" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
            <span className="text-xs font-semibold text-ink w-10 text-right">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClaimCard({ claim, onReview, busy }) {
  const { t } = useLang();
  return (
    <div className="bg-paper border border-sm-border rounded-[14px] p-3" data-testid={`admin-claim-${claim.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-ink truncate flex items-center gap-1.5">
            <Building2 size={14} className="text-teal flex-shrink-0" /> {claim.business_name}
          </p>
          <p className="text-[11px] text-ink-muted flex items-center gap-1 mt-0.5">
            <MapPin size={10} />{claim.business_city || '—'}
          </p>
        </div>
        <span className="text-[10px] text-ink-muted flex items-center gap-1 flex-shrink-0">
          <Clock size={10} />{new Date(claim.created_at).toLocaleDateString()}
        </span>
      </div>
      <div className="mt-2 text-xs text-ink-soft bg-cream-soft rounded-[10px] p-2">
        <p><span className="font-semibold">{claim.user_name}</span> · {claim.user_email} <span className="text-ink-muted">({claim.user_role})</span></p>
        {claim.contact_phone && <p className="text-ink-muted mt-0.5">☎ {claim.contact_phone}</p>}
        {claim.message && <p className="mt-1 italic text-ink-muted">“{claim.message}”</p>}
      </div>
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onReview(claim.id, 'approve')}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-paper bg-green-pos py-1.5 rounded-[10px] hover:opacity-90 disabled:opacity-50 transition-opacity"
          data-testid={`claim-approve-${claim.id}`}
        >
          <Check size={13} /> {t('adm_approve')}
        </button>
        <button
          onClick={() => onReview(claim.id, 'reject')}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-red-warn border border-red-warn/40 py-1.5 rounded-[10px] hover:bg-red-50 disabled:opacity-50 transition-colors"
          data-testid={`claim-reject-${claim.id}`}
        >
          <X size={13} /> {t('adm_reject')}
        </button>
      </div>
    </div>
  );
}

function LeadCard({ lead, onResolve, busy }) {
  const { t } = useLang();
  return (
    <div className="bg-paper border border-sm-border rounded-[14px] p-3" data-testid={`admin-lead-${lead.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-ink truncate flex items-center gap-1.5">
            <Building2 size={14} className="text-teal flex-shrink-0" /> {lead.business_name}
            {!lead.business_claimed && (
              <span className="text-[9px] font-bold uppercase bg-amber/15 text-amber-deep px-1.5 py-0.5 rounded-full">lead</span>
            )}
          </p>
          <p className="text-[11px] text-ink-muted flex items-center gap-1 mt-0.5">
            <MapPin size={10} />{lead.business_city || '—'}{lead.business_segment ? ` · ${lead.business_segment}` : ''}
          </p>
        </div>
        <span className="text-[10px] text-ink-muted flex items-center gap-1 flex-shrink-0">
          <Clock size={10} />{new Date(lead.created_at).toLocaleDateString()}
        </span>
      </div>
      <div className="mt-2 text-xs text-ink-soft bg-cream-soft rounded-[10px] p-2">
        <p className="flex items-center gap-1"><Mail size={11} className="text-ink-muted" /><span className="font-semibold">{lead.homeowner_name}</span> · {lead.homeowner_email}</p>
        <p className="mt-1 italic text-ink-muted">“{lead.message}”</p>
      </div>
      <button
        onClick={() => onResolve(lead.id)}
        disabled={busy}
        className="mt-2 w-full flex items-center justify-center gap-1 text-xs font-semibold text-paper bg-teal py-1.5 rounded-[10px] hover:opacity-90 disabled:opacity-50 transition-opacity"
        data-testid={`lead-resolve-${lead.id}`}
      >
        <Check size={13} /> {t('adm_mark_handled')}
      </button>
    </div>
  );
}

export default function AdminHeatmap({ flash }) {
  const [stats, setStats] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, mRes, cRes] = await Promise.all([
        api.get('/api/directory/admin/stats'),
        api.get('/api/directory/markers'),
        api.get('/api/directory/admin/claims?status=pending'),
      ]);
      setStats(sRes.data);
      setMarkers(mRes.data.markers || []);
      setClaims(cRes.data.claims || []);
    } catch (e) { flash?.(formatError(e)); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const review = async (claimId, action) => {
    setReviewBusy(true);
    try {
      await api.post(`/api/directory/admin/claims/${claimId}/review`, { action });
      flash?.(action === 'approve' ? 'Claim approved' : 'Claim rejected');
      load();
    } catch (e) { flash?.(formatError(e)); } finally { setReviewBusy(false); }
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      // Native fetch for the multipart upload — lets the browser set the
      // multipart boundary itself and avoids axios timeouts on large files.
      const base = apiBase || '';
      const res = await fetch(`${base}/api/directory/admin/import`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      if (!res.ok) {
        let msg = `Import failed (${res.status})`;
        try { const j = await res.json(); if (j.detail) msg = j.detail; } catch { /* noop */ }
        throw new Error(msg);
      }
      const data = await res.json();
      flash?.(`Imported: ${data.inserted} new, ${data.updated} updated, ${data.skipped} skipped`);
      load();
    } catch (err) {
      flash?.(err?.message || formatError(err));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-teal" /></div>;
  }

  return (
    <div className="space-y-5" data-testid="admin-heatmap">
      {/* Header + CSV import */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-headings font-bold text-ink text-lg flex items-center gap-2">
            <Flame size={18} className="text-teal" /> {t('adm_directory')}
          </h2>
          <p className="text-xs text-ink-muted">{t('adm_directory_sub')}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/business_import_template.csv"
            download
            className="text-xs px-4 py-2 rounded-full border border-sm-border text-ink-soft hover:bg-cream-soft transition-colors flex items-center gap-2"
            data-testid="csv-template-btn"
          >
            <Download size={14} /> {t('adm_template')}
          </a>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onImport} className="hidden" data-testid="csv-file-input" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="btn-primary text-xs px-4 py-2 rounded-full flex items-center gap-2 disabled:opacity-50"
            data-testid="csv-import-btn"
          >
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {t('adm_import_csv')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total businesses" value={stats?.total ?? 0} testid="hm-admin-total" />
        <StatCard label="Claimed" value={stats?.claimed ?? 0} accent="text-green-text" testid="hm-admin-claimed" />
        <StatCard label="Unclaimed" value={stats?.unclaimed ?? 0} accent="text-ink" testid="hm-admin-unclaimed" />
        <StatCard label="Pending claims" value={stats?.pending_claims ?? 0} accent="text-amber-deep" testid="hm-admin-pending" />
      </div>

      {/* Map + claim-status legend */}
      <div className="card-lg">
        <BusinessHeatMap markers={markers} height={460} />
        <div className="flex items-center gap-x-5 gap-y-1.5 mt-3 flex-wrap" data-testid="admin-map-legend">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: MAP_COLORS.unclaimed }} /> {t('adm_unclaimed')}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: MAP_COLORS.claimed }} /> Claimed (on platform)
          </span>
          <span className="text-[11px] text-ink-muted">{t('adm_showing', { n: markers.length.toLocaleString(), total: (stats?.total ?? 0).toLocaleString() })}</span>
        </div>
      </div>

      {/* Breakdown — categories only */}
      <BreakdownList title={t('adm_top_categories')} rows={stats?.top_segments || []} keyName="segment" />

      {/* Pending claims */}
      <div>
        <h3 className="font-headings font-bold text-ink text-sm mb-3 flex items-center gap-2">
          <Hand size={15} className="text-teal" /> {t('adm_pending_claims')}
          <span className="ml-1 text-[10px] font-bold bg-amber/15 text-amber-deep px-2 py-0.5 rounded-full">{claims.length}</span>
        </h3>
        {claims.length === 0 ? (
          <div className="card-lg text-center py-8 text-sm text-ink-muted flex flex-col items-center gap-2" data-testid="no-pending-claims">
            <BadgeCheck size={22} className="text-green-text" /> {t('adm_no_claims')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {claims.map((c) => <ClaimCard key={c.id} claim={c} onReview={review} busy={reviewBusy} />)}
          </div>
        )}
      </div>
    </div>
  );
}
