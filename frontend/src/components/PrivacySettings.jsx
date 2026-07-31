import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useCookieConsent } from '../contexts/CookieConsentContext';
import { Download, Trash2, AlertCircle, CheckCircle, Loader2, Mail, Cookie, Shield, RotateCcw } from 'lucide-react';

/**
 * Single drop-in "Privacy" tab content used by both ProSettingsPage and the
 * Homeowner SettingsPage. Renders 4 sections:
 *   1. Marketing prefs (Right to Object — Art. 21)
 *   2. Cookie preferences (re-opens the banner)
 *   3. Download my data (Right to Portability — Art. 20)
 *   4. Delete my account (Right to Erasure — Art. 17)
 */
export default function PrivacySettings() {
  const { user, refreshUser, logout } = useAuth();
  const { openPreferences, consent } = useCookieConsent();
  const [marketing, setMarketing] = useState(!!user?.notif_email_marketing);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [deletePassword, setDeletePassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteScheduled, setDeleteScheduled] = useState(
    user?.deletion_scheduled_for || null
  );
  const [cancellingDelete, setCancellingDelete] = useState(false);
  // What deletion would actually do, computed from this account's own data.
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    let live = true;
    api.get('/api/me/deletion')
      .then(({ data }) => {
        if (!live) return;
        setPlan(data.plan);
        if (data.scheduled) setDeleteScheduled(data.scheduled.scheduled_for);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Keep marketing toggle in sync with the user prop
  useEffect(() => setMarketing(!!user?.notif_email_marketing), [user]);

  const saveMarketingPrefs = async () => {
    setSavingPrefs(true); setPrefsSaved(false);
    try {
      await api.put('/api/me/marketing-prefs', { marketing_emails: marketing });
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2000);
      refreshUser();
    } finally {
      setSavingPrefs(false);
    }
  };

  const downloadMyData = async () => {
    setExporting(true);
    try {
      // Use raw axios so we can get the zip blob
      const resp = await api.get('/api/me/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `servicemarket_data_export_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const requestDelete = async () => {
    setDeleteError('');
    if (confirmText !== 'DELETE') {
      setDeleteError('Please type DELETE in capitals to confirm.');
      return;
    }
    setDeleting(true);
    try {
      const { data } = await api.delete('/api/me');
      setDeleteScheduled(data.scheduled_for);
      setConfirmText('');
      // We could log the user out here; instead we keep them logged in so they
      // can cancel within the grace window if it was a mistake.
    } catch (e) {
      setDeleteError(e.response?.data?.detail || 'Could not schedule deletion.');
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = async () => {
    setCancellingDelete(true);
    try {
      await api.post('/api/me/cancel-deletion');
      setDeleteScheduled(null);
      refreshUser();
    } finally {
      setCancellingDelete(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="privacy-settings">
      <div className="flex items-start gap-2">
        <Shield size={20} className="text-teal flex-shrink-0 mt-0.5" />
        <div>
          <h2 className="font-headings font-bold text-ink text-lg">Privacy & data</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Manage your consent and exercise your data-protection rights at any time.
          </p>
        </div>
      </div>

      {/* 1. Marketing prefs */}
      <section className="card-md" data-testid="privacy-marketing-card">
        <div className="flex items-start gap-3 mb-3">
          <Mail size={16} className="text-teal flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-ink text-sm">Marketing emails</h3>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Product updates, tips and news. Off by default. Withdraw anytime.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
            className="h-4 w-4 accent-teal"
            data-testid="privacy-marketing-toggle"
          />
          <span>Send me product updates and tips</span>
        </label>
        <button
          onClick={saveMarketingPrefs}
          disabled={savingPrefs || marketing === !!user?.notif_email_marketing}
          className="btn-ghost text-xs mt-3 inline-flex items-center gap-1"
          data-testid="privacy-marketing-save"
        >
          {savingPrefs ? <Loader2 size={12} className="animate-spin" /> : null}
          {savingPrefs ? 'Saving…' : 'Save preference'}
        </button>
        {prefsSaved && (
          <span className="inline-flex items-center gap-1 text-xs text-green-pos ml-3">
            <CheckCircle size={12} /> Saved
          </span>
        )}
      </section>

      {/* 2. Cookie prefs */}
      <section className="card-md" data-testid="privacy-cookies-card">
        <div className="flex items-start gap-3 mb-3">
          <Cookie size={16} className="text-teal flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-ink text-sm">Cookie preferences</h3>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Currently: analytics {consent?.cookies_analytics ? 'on' : 'off'} · marketing {consent?.cookies_marketing ? 'on' : 'off'}
            </p>
          </div>
        </div>
        <button
          onClick={openPreferences}
          className="btn-ghost text-xs"
          data-testid="privacy-cookies-edit"
        >
          Change cookie preferences
        </button>
      </section>

      {/* 3. Download my data */}
      <section className="card-md" data-testid="privacy-export-card">
        <div className="flex items-start gap-3 mb-3">
          <Download size={16} className="text-teal flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-ink text-sm">Download my data</h3>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Get a machine-readable archive of everything we hold about you (GDPR Art. 20).
            </p>
          </div>
        </div>
        <button
          onClick={downloadMyData}
          disabled={exporting}
          className="btn-primary text-xs inline-flex items-center gap-1.5"
          data-testid="privacy-export-btn"
        >
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {exporting ? 'Preparing archive…' : 'Download ZIP'}
        </button>
      </section>

      {/* 4. Delete account */}
      <section className="card-md border-red-warn/30" data-testid="privacy-delete-card">
        <div className="flex items-start gap-3 mb-3">
          <Trash2 size={16} className="text-red-warn flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-ink text-sm">Delete my account</h3>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Löscht Ihr Konto und Ihre personenbezogenen Daten. Innerhalb der
              Widerrufsfrist von {plan?.grace_days ?? 7} Tagen können Sie das
              rückgängig machen.
            </p>
          </div>
        </div>

        {/* Computed from this account, not a blurb. What is retained depends
            on whether invoices were ever issued and when — telling everyone
            "invoices are kept for seven years" is wrong for a pro who has
            never issued one, and vague for one who has. */}
        {plan && !deleteScheduled && (
          <div className="rounded-[12px] bg-cream-soft border border-sm-border p-3 mb-3 space-y-2"
               data-testid="privacy-delete-plan">
            <p className="text-xs font-medium text-ink">Wird gelöscht</p>
            <ul className="text-[11px] text-ink-muted list-disc pl-4 space-y-0.5">
              {plan.deletes.map((d) => <li key={d}>{d}</li>)}
            </ul>
            {plan.retained.length > 0 && (
              <>
                <p className="text-xs font-medium text-ink pt-1">Bleibt erhalten</p>
                <ul className="text-[11px] text-ink-muted list-disc pl-4 space-y-0.5">
                  {plan.retained.map((r) => (
                    <li key={r.what}>
                      {r.de} — {r.count} {r.count === 1 ? 'Eintrag' : 'Einträge'},
                      {' '}bis {new Date(r.until).toLocaleDateString('de-AT')} ({r.basis})
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-[11px] text-ink-muted pt-1">{plan.retained_note}</p>
          </div>
        )}

        {deleteScheduled ? (
          <div className="rounded-[12px] bg-amber/10 border border-amber/30 p-3 space-y-2" data-testid="privacy-delete-scheduled">
            <p className="text-sm text-ink">
              <strong>
                Löschung vorgemerkt für {new Date(deleteScheduled).toLocaleString('de-AT')}.
              </strong>{' '}
              Bis dahin können Sie das Konto weiter nutzen und die Löschung
              zurücknehmen.
            </p>
            <button
              onClick={cancelDelete}
              disabled={cancellingDelete}
              className="btn-ghost text-xs inline-flex items-center gap-1.5"
              data-testid="privacy-cancel-delete"
            >
              {cancellingDelete ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Cancel deletion
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ink-muted">
              Type <code className="bg-cream-deep px-1 py-0.5 rounded">DELETE</code> below to confirm.
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="sm-input text-sm"
              data-testid="privacy-delete-confirm"
            />
            {deleteError && (
              <div className="flex items-center gap-1.5 text-red-warn text-xs">
                <AlertCircle size={12} /> {deleteError}
              </div>
            )}
            <button
              onClick={requestDelete}
              disabled={deleting || confirmText !== 'DELETE'}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-warn text-paper hover:bg-red-warn/90 font-medium px-4 py-2 text-xs disabled:opacity-40"
              data-testid="privacy-delete-btn"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {deleting ? 'Scheduling deletion…' : 'Schedule deletion'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
