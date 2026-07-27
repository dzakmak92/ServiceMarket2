import React, { useEffect, useState, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  ArrowLeft, Loader2, Plus, Trash2, Briefcase, KanbanSquare, Boxes, BookOpen, Share2,
  Copy, RefreshCw, ExternalLink, Save, LayoutDashboard, CalendarDays, UserPlus, X, Eye, Receipt,
  ScanBarcode, Camera, Image as ImageIcon, FileDown,
} from 'lucide-react';
import OverviewTab from './pm/OverviewTab';
import KanbanTab from './pm/KanbanTab';
import GanttTab from './pm/GanttTab';
import BillingTab from './pm/BillingTab';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import ExportJobFileModal from '../../components/ExportJobFileModal';
import ScrollSnapTabStrip, { SwipeableTabPanel } from '../../components/ScrollSnapTabStrip';

const fmtEur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));
const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const TABS = [
  { key: 'overview', icon: LayoutDashboard, labelKey: 'pm_tab_overview' },
  { key: 'kanban', icon: KanbanSquare, labelKey: 'pm_tab_kanban' },
  { key: 'gantt', icon: CalendarDays, labelKey: 'pm_tab_gantt' },
  { key: 'materials', icon: Boxes, labelKey: 'pm_tab_materials' },
  { key: 'diary', icon: BookOpen, labelKey: 'pm_tab_diary' },
  { key: 'billing', icon: Receipt, labelKey: 'pm_tab_billing' },
  { key: 'share', icon: Share2, labelKey: 'pm_tab_share' },
];

export default function PMProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/pm/projects/${id}`);
      setProject(data);
    } catch (e) {
      if (e?.response?.status === 404) navigate('/projects');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 size={28} className="text-teal animate-spin" /></div>;
  if (!project) return null;

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-12">
      <div className="page-container py-8 max-w-6xl">
        <div className="mb-6">
          <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-teal mb-3" data-testid="pm-back">
            <ArrowLeft size={12} /> {t('pm_back')}
          </Link>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <Briefcase size={26} className="text-teal mt-1 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-2xl font-headings font-bold text-ink truncate">{project.title}</h1>
                <p className="text-ink-muted text-sm">
                  {project.customer?.name || '—'} · {project.job_category} · {project.customer?.city || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {project.status === 'done' && (
                <button
                  onClick={() => setExportOpen(true)}
                  className="btn-ghost text-xs"
                  data-testid="pm-export-jobfile-btn"
                >
                  <FileDown size={14} /> {t('pm_export_jobfile')}
                </button>
              )}
              <ProjectStatusSelect project={project} reload={load} t={t} />
            </div>
          </div>
        </div>

        {/* Tab strip — horizontally scrollable on mobile with scroll-snap */}
        <ScrollSnapTabStrip
          tabs={TABS.map(({ key, labelKey }) => ({ key, label: t(labelKey) }))}
          activeKey={tab}
          onChange={setTab}
          testidPrefix="pm-tab"
          variant="pills"
          className="mb-5"
        />

        <SwipeableTabPanel tabKeys={TABS.map((t2) => t2.key)} activeKey={tab} onChange={setTab}>
          {tab === 'overview' && <OverviewTab projectId={id} t={t} onJumpTab={setTab} />}
          {tab === 'kanban' && <KanbanTab projectId={id} t={t} />}
          {tab === 'gantt' && <GanttTab projectId={id} t={t} />}
          {tab === 'materials' && <MaterialsTab projectId={id} t={t} />}
          {tab === 'diary' && <DiaryTab projectId={id} t={t} />}
          {tab === 'billing' && <BillingTab projectId={id} t={t} />}
          {tab === 'share' && <ShareTab project={project} reload={load} t={t} />}
        </SwipeableTabPanel>
      </div>

      <ExportJobFileModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        exportPath={`/api/pm/projects/${id}/export-pdf`}
        fileName={project.title || project.job_title}
      />
    </div>
  );
}


// ──────────────────────────────────────────────
// Status dropdown + hourly rate input
// ──────────────────────────────────────────────
function ProjectStatusSelect({ project, reload, t }) {
  const [busy, setBusy] = useState(false);
  const onChange = async (e) => {
    setBusy(true);
    try {
      await api.patch(`/api/pm/projects/${project.id}`, { status: e.target.value });
      await reload();
    } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={project.status}
        onChange={onChange}
        disabled={busy}
        className="sm-select text-xs"
        data-testid="pm-status-select"
      >
        <option value="active">{t('pm_status_active')}</option>
        <option value="on_hold">{t('pm_status_on_hold')}</option>
        <option value="done">{t('pm_status_done')}</option>
        <option value="archived">{t('pm_status_archived')}</option>
      </select>
      {busy && <Loader2 size={14} className="text-teal animate-spin" />}
    </div>
  );
}


// ──────────────────────────────────────────────
// Materials tab (unchanged from prior P0)
// ──────────────────────────────────────────────
function MaterialsTab({ projectId, t }) {
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ planned: 0, actual: 0, variance: 0 });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ name: '', qty: 1, unit: 'pcs', planned_cost: 0, actual_cost: '', supplier: '', barcode: '', brand: '' });
  const [scanOpen, setScanOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/pm/projects/${projectId}/materials`);
      setItems(data.materials || []);
      setTotals(data.totals || { planned: 0, actual: 0, variance: 0 });
    } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleScanned = async (code) => {
    setScanOpen(false);
    if (!code) return;
    setLookingUp(true);
    try {
      const { data } = await api.get(`/api/pm/barcode-lookup?code=${encodeURIComponent(code)}`);
      if (data.found && data.name) {
        setDraft((d) => ({ ...d, name: data.name, brand: data.brand || '', barcode: code, supplier: d.supplier || data.brand || '' }));
        toast.success(t('pm_scan_found').replace('{name}', data.name));
      } else {
        setDraft((d) => ({ ...d, barcode: code }));
        toast.info(t('pm_scan_notfound').replace('{code}', code));
      }
    } catch (e) {
      setDraft((d) => ({ ...d, barcode: code }));
      toast.error(t('pm_scan_error'));
    } finally { setLookingUp(false); }
  };

  const add = async () => {
    if (!draft.name.trim()) return;
    await api.post(`/api/pm/projects/${projectId}/materials`, {
      name: draft.name.trim(),
      qty: Number(draft.qty) || 1,
      unit: draft.unit || 'pcs',
      planned_cost: Number(draft.planned_cost) || 0,
      actual_cost: draft.actual_cost === '' ? null : Number(draft.actual_cost),
      supplier: draft.supplier || null,
      barcode: draft.barcode || null,
      brand: draft.brand || null,
    });
    setDraft({ name: '', qty: 1, unit: 'pcs', planned_cost: 0, actual_cost: '', supplier: '', barcode: '', brand: '' });
    await load();
  };

  const updateField = async (id, field, val) => {
    await api.patch(`/api/pm/projects/${projectId}/materials/${id}`, { [field]: val });
    await load();
  };

  const uploadPhoto = async (mat, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(t('pm_mat_photo_imgonly')); return; }
    setUploadingId(mat.id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/api/uploads/file', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const photos = [...(mat.photos || []), data.url];
      await api.patch(`/api/pm/projects/${projectId}/materials/${mat.id}`, { photos });
      await load();
      toast.success(t('pm_mat_photo_added'));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('pm_mat_photo_failed'));
    } finally { setUploadingId(null); }
  };

  const removePhoto = async (mat, url) => {
    const photos = (mat.photos || []).filter((p) => p !== url);
    await api.patch(`/api/pm/projects/${projectId}/materials/${mat.id}`, { photos });
    await load();
  };

  const remove = async (id) => {
    await api.delete(`/api/pm/projects/${projectId}/materials/${id}`);
    await load();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="text-teal animate-spin" /></div>;

  return (
    <div className="space-y-4" data-testid="pm-materials">
      <div className="grid grid-cols-3 gap-3">
        <div className="card-lg p-4"><p className="text-[10px] uppercase font-bold text-ink-muted">{t('pm_material_planned')}</p><p className="text-xl font-headings font-bold text-ink">{fmtEur(totals.planned)}</p></div>
        <div className="card-lg p-4"><p className="text-[10px] uppercase font-bold text-ink-muted">{t('pm_material_actual')}</p><p className="text-xl font-headings font-bold text-ink">{fmtEur(totals.actual)}</p></div>
        <div className="card-lg p-4">
          <p className="text-[10px] uppercase font-bold text-ink-muted">{t('pm_material_variance')}</p>
          <p className={`text-xl font-headings font-bold ${totals.variance > 0 ? 'text-red-warn' : 'text-green-pos'}`}>{fmtEur(totals.variance)}</p>
        </div>
      </div>

      <div className="card-lg">
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-xs uppercase font-bold text-ink-muted tracking-wider flex items-center gap-2"><Plus size={12} /> {t('pm_material_add')}</p>
          <button onClick={() => setScanOpen(true)} className="btn-ghost text-xs flex-shrink-0" data-testid="pm-material-scan-btn">
            {lookingUp ? <Loader2 size={12} className="animate-spin" /> : <ScanBarcode size={12} />} {t('pm_scan_barcode')}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <input className="sm-input text-xs col-span-2" placeholder={t('pm_material_name')} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} data-testid="pm-material-name" />
          <input className="sm-input text-xs" type="number" step="0.01" placeholder={t('pm_material_qty')} value={draft.qty} onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))} data-testid="pm-material-qty" />
          <input className="sm-input text-xs" placeholder={t('pm_material_unit')} value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} />
          <input className="sm-input text-xs" type="number" step="0.01" placeholder={t('pm_material_planned')} value={draft.planned_cost} onChange={(e) => setDraft((d) => ({ ...d, planned_cost: e.target.value }))} data-testid="pm-material-planned" />
          <input className="sm-input text-xs" type="number" step="0.01" placeholder={t('pm_material_actual')} value={draft.actual_cost} onChange={(e) => setDraft((d) => ({ ...d, actual_cost: e.target.value }))} data-testid="pm-material-actual" />
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <input className="sm-input text-xs flex-1" placeholder={t('pm_material_supplier')} value={draft.supplier} onChange={(e) => setDraft((d) => ({ ...d, supplier: e.target.value }))} />
          <button onClick={add} className="btn-primary text-xs" data-testid="pm-material-create"><Plus size={12} /> {t('pm_material_add')}</button>
        </div>
      </div>

      <div className="card-lg overflow-x-auto">
        <table className="w-full text-sm stack-table">
          <thead className="text-[10px] uppercase text-ink-muted">
            <tr>
              <th className="text-left p-2">{t('pm_material_name')}</th>
              <th className="text-right p-2">{t('pm_material_qty')}</th>
              <th className="text-right p-2">{t('pm_material_planned')}</th>
              <th className="text-right p-2">{t('pm_material_actual')}</th>
              <th className="text-left p-2">{t('pm_material_supplier')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan="6" className="text-center text-ink-muted py-4 text-xs">{t('pm_material_empty')}</td></tr>
            ) : items.map((m) => (
              <tr key={m.id} className="border-t border-sm-border" data-testid={`pm-material-${m.id}`}>
                <td className="p-2 font-medium text-ink">
                  <div>{m.name}
                    {m.barcode && <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] text-ink-muted align-middle"><ScanBarcode size={9} /> {m.barcode}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {(m.photos || []).map((url) => (
                      <button key={url} onClick={() => setLightbox(`${BACKEND}${url}`)} className="relative group" data-testid={`pm-material-photo-${m.id}`}>
                        <img src={`${BACKEND}${url}`} alt="" className="w-9 h-9 rounded-md object-cover border border-sm-border" />
                        <span onClick={(e) => { e.stopPropagation(); removePhoto(m, url); }} className="absolute -top-1.5 -right-1.5 bg-ink text-paper rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`pm-material-photo-del-${m.id}`}><X size={9} /></span>
                      </button>
                    ))}
                    <label className="w-9 h-9 rounded-md border border-dashed border-sm-border flex items-center justify-center cursor-pointer hover:border-teal hover:text-teal text-ink-muted" data-testid={`pm-material-addphoto-${m.id}`}>
                      {uploadingId === m.id ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { uploadPhoto(m, e.target.files[0]); e.target.value = ''; }} />
                    </label>
                  </div>
                </td>
                <td className="p-2 text-right" data-label={t('pm_material_qty')}>{m.qty} {m.unit}</td>
                <td className="p-2 text-right" data-label={t('pm_material_planned')}>{fmtEur(m.planned_cost)}</td>
                <td className="p-2 text-right" data-label={t('pm_material_actual')}>
                  <input
                    type="number"
                    defaultValue={m.actual_cost ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      if (v !== m.actual_cost) updateField(m.id, 'actual_cost', v);
                    }}
                    className="sm-input text-xs w-24 text-right"
                  />
                </td>
                <td className="p-2 text-ink-soft text-xs" data-label={t('pm_material_supplier')}>{m.supplier || '—'}</td>
                <td className="p-2 text-right">
                  <button onClick={() => remove(m.id)} className="text-ink-muted hover:text-red-warn"><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {scanOpen && <BarcodeScannerModal onDetected={handleScanned} onClose={() => setScanOpen(false)} t={t} />}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-ink/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)} data-testid="pm-material-lightbox">
          <img src={lightbox} alt="" className="max-w-full max-h-[85vh] rounded-lg" />
          <button className="absolute top-4 right-4 text-paper" onClick={() => setLightbox(null)}><X size={24} /></button>
        </div>
      )}
    </div>
  );
}


// ──────────────────────────────────────────────
// Diary tab — with running-timer awareness
// ──────────────────────────────────────────────
function DiaryTab({ projectId, t }) {
  const [entries, setEntries] = useState([]);
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ note: '', hours: '' });
  const [timer, setTimer] = useState(null);
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/pm/projects/${projectId}/diary`);
      setEntries(data.entries || []);
      setTotalHours(data.total_hours || 0);
    } finally { setLoading(false); }
  };
  const loadTimer = async () => {
    try {
      const { data: r } = await api.get('/api/pm/timer');
      setTimer(r.running);
    } catch { setTimer(null); }
  };
  useEffect(() => {
    load(); loadTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  useEffect(() => {
    if (!timer || timer.project_id !== projectId) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [timer, projectId]);

  const isTimerOnThis = timer && timer.project_id === projectId;
  const elapsedSec = isTimerOnThis ? Math.floor((now - new Date(timer.started_at).getTime()) / 1000) : 0;
  const hh = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');

  const toggleTimer = async () => {
    if (isTimerOnThis) {
      await api.post(`/api/pm/projects/${projectId}/timer/stop`);
    } else {
      await api.post(`/api/pm/projects/${projectId}/timer/start`);
    }
    await loadTimer();
    await load();
  };

  const add = async () => {
    if (!draft.note.trim()) return;
    await api.post(`/api/pm/projects/${projectId}/diary`, {
      note: draft.note.trim(),
      hours: Number(draft.hours) || 0,
    });
    setDraft({ note: '', hours: '' });
    await load();
  };

  const remove = async (entryId) => {
    await api.delete(`/api/pm/projects/${projectId}/diary/${entryId}`);
    await load();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="text-teal animate-spin" /></div>;

  return (
    <div className="space-y-4" data-testid="pm-diary">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-lg">
          <p className="text-[10px] uppercase font-bold text-ink-muted">{t('pm_diary_total')}</p>
          <p className="text-2xl font-headings font-bold text-ink">{totalHours.toFixed(1)} h</p>
        </div>
        <div className={`card-lg flex items-center gap-3 ${isTimerOnThis ? 'border-amber bg-amber/5' : ''}`}>
          <div>
            <p className="text-[10px] uppercase font-bold text-ink-muted">{t('pm_timer_title')}</p>
            <p className="text-2xl font-headings font-bold text-ink tabular-nums">{isTimerOnThis ? `${hh}:${mm}:${ss}` : '00:00:00'}</p>
          </div>
          <button
            onClick={toggleTimer}
            className={`btn-primary text-xs ml-auto ${isTimerOnThis ? 'bg-red-warn hover:bg-red-warn/90' : ''}`}
            data-testid="pm-diary-timer-toggle"
          >
            {isTimerOnThis ? t('pm_timer_stop') : t('pm_timer_start')}
          </button>
        </div>
      </div>

      <div className="card-lg">
        <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2 flex items-center gap-2"><Plus size={12} /> {t('pm_diary_add')}</p>
        <textarea
          rows={3}
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          placeholder={t('pm_diary_note')}
          className="sm-textarea text-sm w-full"
          data-testid="pm-diary-note"
        />
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <label className="text-xs text-ink-muted flex items-center gap-1">{t('pm_diary_hours')}:
            <input type="number" step="0.25" value={draft.hours} onChange={(e) => setDraft((d) => ({ ...d, hours: e.target.value }))} className="sm-input text-xs w-20" data-testid="pm-diary-hours" />
          </label>
          <button onClick={add} className="btn-primary text-xs ml-auto" data-testid="pm-diary-create"><Plus size={12} /> {t('pm_diary_add')}</button>
        </div>
      </div>

      <div className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-center text-ink-muted py-6 text-sm">{t('pm_diary_empty')}</p>
        ) : entries.map((e) => (
          <div key={e.id} className="card-lg" data-testid={`pm-diary-${e.id}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink whitespace-pre-wrap">{e.note}</p>
                <p className="text-xs text-ink-muted mt-1">
                  {new Date(e.entry_date).toLocaleString('de-AT')}
                  {e.hours > 0 && <span className="ml-2">· {e.hours.toFixed(1)} h</span>}
                  {e.source === 'timer' && <span className="ml-2 inline-block bg-amber/15 text-amber-deep text-[9px] uppercase px-1 rounded">timer</span>}
                  {e.source === 'sub' && <span className="ml-2 inline-block bg-teal/15 text-teal text-[9px] uppercase px-1 rounded">sub</span>}
                </p>
              </div>
              <button onClick={() => remove(e.id)} className="text-ink-muted hover:text-red-warn" data-testid={`pm-diary-delete-${e.id}`}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────
// Share tab — customer link + sub-contractor invite + hourly-rate / settings
// ──────────────────────────────────────────────
function ShareTab({ project, reload, t }) {
  const [note, setNote] = useState(project.customer_status_note || '');
  const [hourlyRate, setHourlyRate] = useState(project.hourly_rate_eur || 65);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState({ share: false, sub: false });
  const [rotating, setRotating] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [subToken, setSubToken] = useState(project.sub_token || null);

  const publicUrl = `${window.location.origin}/p/${project.share_token}`;
  const subUrl = subToken ? `${window.location.origin}/sub/${subToken}` : null;

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/pm/projects/${project.id}`, {
        customer_status_note: note,
        hourly_rate_eur: Number(hourlyRate) || 65,
      });
      await reload();
    } finally { setSaving(false); }
  };

  const copy = async (kind, url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied((c) => ({ ...c, [kind]: true }));
      setTimeout(() => setCopied((c) => ({ ...c, [kind]: false })), 1500);
    } catch { /* noop */ }
  };

  const rotate = async () => {
    setRotating(true);
    try {
      await api.post(`/api/pm/projects/${project.id}/rotate-share-token`);
      await reload();
    } finally { setRotating(false); }
  };

  const issueSub = async () => {
    setSubBusy(true);
    try {
      const { data } = await api.post(`/api/pm/projects/${project.id}/sub-invite`);
      setSubToken(data.sub_token);
    } finally { setSubBusy(false); }
  };

  const revokeSub = async () => {
    setSubBusy(true);
    try {
      await api.post(`/api/pm/projects/${project.id}/sub-revoke`);
      setSubToken(null);
    } finally { setSubBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="pm-share-tab">
      {/* Customer link */}
      <div className="card-lg">
        <div className="flex items-center gap-2 mb-1">
          <Eye size={16} className="text-teal" />
          <h3 className="font-headings font-bold text-ink text-base">{t('pm_share_title')}</h3>
        </div>
        <p className="text-sm text-ink-muted mb-3">{t('pm_share_help')}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs bg-cream-soft px-3 py-2 rounded-[10px] border border-sm-border flex-1 min-w-[260px] break-all" data-testid="pm-share-url">{publicUrl}</code>
          <button onClick={() => copy('share', publicUrl)} className="btn-ghost text-xs" data-testid="pm-share-copy"><Copy size={12} /> {copied.share ? '✓' : t('pm_share_copy')}</button>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs" data-testid="pm-share-open"><ExternalLink size={12} /> {t('pm_share_open_public')}</a>
          <button onClick={rotate} disabled={rotating} className="btn-ghost text-xs" data-testid="pm-share-rotate">
            {rotating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {t('pm_share_rotate')}
          </button>
        </div>
      </div>

      {/* Sub-contractor magic link */}
      <div className="card-lg" data-testid="pm-sub-card">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus size={16} className="text-amber-deep" />
          <h3 className="font-headings font-bold text-ink text-base">{t('pm_sub_invite_title')}</h3>
        </div>
        <p className="text-sm text-ink-muted mb-3">{t('pm_sub_invite_help')}</p>
        {subUrl ? (
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs bg-cream-soft px-3 py-2 rounded-[10px] border border-sm-border flex-1 min-w-[260px] break-all" data-testid="pm-sub-url">{subUrl}</code>
            <button onClick={() => copy('sub', subUrl)} className="btn-ghost text-xs" data-testid="pm-sub-copy"><Copy size={12} /> {copied.sub ? '✓' : t('pm_share_copy')}</button>
            <a href={subUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs"><ExternalLink size={12} /> {t('pm_share_open_public')}</a>
            <button onClick={revokeSub} disabled={subBusy} className="btn-ghost text-xs text-red-warn" data-testid="pm-sub-revoke">
              {subBusy ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} {t('pm_sub_revoke')}
            </button>
          </div>
        ) : (
          <button onClick={issueSub} disabled={subBusy} className="btn-primary text-xs" data-testid="pm-sub-issue">
            {subBusy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} {t('pm_sub_issue')}
          </button>
        )}
      </div>

      {/* Customer status note + hourly rate */}
      <div className="card-lg space-y-4">
        <div>
          <label className="block">
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2">{t('pm_status_note_label')}</p>
            <textarea
              rows={3}
              maxLength={280}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="sm-textarea text-sm w-full"
              data-testid="pm-status-note"
            />
            <p className="text-[11px] text-ink-muted mt-1">{t('pm_status_note_help')}</p>
          </label>
        </div>
        <div>
          <label className="block">
            <p className="text-xs uppercase font-bold text-ink-muted tracking-wider mb-2">{t('pm_hourly_rate')}</p>
            <input
              type="number"
              step="0.5"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              className="sm-input text-sm w-32"
              data-testid="pm-hourly-rate"
            />
            <p className="text-[11px] text-ink-muted mt-1">{t('pm_hourly_rate_help')}</p>
          </label>
        </div>
        <div className="flex justify-end">
          <button onClick={saveSettings} disabled={saving} className="btn-primary text-xs" data-testid="pm-status-note-save">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {t('btn_save')}
          </button>
        </div>
      </div>
    </div>
  );
}
