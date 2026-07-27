import React, { useState, useEffect } from 'react';
import api from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import { Edit2, Check, X, Loader2, AlertCircle } from 'lucide-react';

const MIN_FEE = 4;

export default function AdminFees({ flash }) {
  const { t, lang } = useLang();
  const [cats, setCats] = useState([]);
  const [stats, setStats] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([
        api.get('/api/admin/categories'),
        api.get('/api/admin/category-revenue'),
      ]);
      setCats(c.data.categories || []);
      const map = {};
      (r.data.categories || []).forEach((x) => { map[x.category] = { quotes: x.quotes, revenue: x.revenue }; });
      setStats(map);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const startEdit = (cat) => {
    setEditingId(cat._id);
    setDraft(String(cat.contact_fee || 0));
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
    setError('');
  };

  const save = async (catId) => {
    const fee = parseFloat(draft);
    if (isNaN(fee) || fee < MIN_FEE) {
      setError(t('admin_fee_min').replace('{min}', MIN_FEE));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/api/admin/categories/${catId}`, { contact_fee: fee });
      flash(t('admin_fee_updated'));
      setEditingId(null);
      setDraft('');
      await fetchAll();
    } catch (e) {
      setError(e.response?.data?.detail || t('error_generic'));
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={28} className="text-teal animate-spin" /></div>;

  return (
    <div className="admin-panel" data-testid="fees-panel">
      <h2 className="font-headings font-bold text-ink text-xl mb-1">{t('admin_category_fees')}</h2>
      <p className="text-sm text-ink-muted mb-5">{t('admin_fees_help').replace('{min}', MIN_FEE)}</p>

      {error && (
        <div className="flex items-center gap-2 text-red-warn bg-red-50 border border-red-200 rounded-[14px] p-3 mb-4 text-sm" data-testid="fees-error">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('admin_th_category')}</th>
              <th>{t('admin_contact_fee_eur')}</th>
              <th>{t('admin_th_quotes_30d')}</th>
              <th>{t('admin_th_revenue_30d')}</th>
              <th className="text-right">{t('admin_th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => {
              const isEditing = editingId === c._id;
              const s = stats[c._id] || { quotes: 0, revenue: 0 };
              return (
                <tr key={c._id} data-testid={`fee-row-${c._id}`}>
                  <td>
                    <span className="inline-flex items-center gap-1.5 capitalize text-ink font-medium">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: c.accent_color || '#cbd5e1' }}
                      />
                      {c[`name_${lang}`] || c.name_en || c._id.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        autoFocus
                        type="number"
                        min={MIN_FEE}
                        step="0.5"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="admin-input-sm"
                        data-testid={`fee-input-${c._id}`}
                      />
                    ) : (
                      <span className="font-mono text-ink font-semibold">€{(c.contact_fee || 0).toFixed(2)}</span>
                    )}
                  </td>
                  <td className="text-ink-soft">{s.quotes}</td>
                  <td className="text-ink-soft">€{s.revenue.toFixed(2)}</td>
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => save(c._id)}
                            disabled={saving}
                            className="admin-btn admin-btn-primary admin-btn-sm"
                            data-testid={`fee-save-${c._id}`}
                          >
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            {t('btn_save')}
                          </button>
                          <button onClick={cancelEdit} className="admin-btn admin-btn-ghost admin-btn-sm">
                            <X size={12} /> {t('btn_cancel')}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEdit(c)}
                          className="admin-btn admin-btn-ghost admin-btn-sm"
                          data-testid={`fee-edit-${c._id}`}
                        >
                          <Edit2 size={12} /> {t('admin_edit')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
