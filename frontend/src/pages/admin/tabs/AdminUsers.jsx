import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import { Eye, Ban, Loader2 } from 'lucide-react';
import AdminFilterBar from '../../../components/admin/AdminFilterBar';
import AdminPagination from '../../../components/admin/AdminPagination';
import ProReviewsPanel from './ProReviewsPanel';

export default function AdminUsers({ flash }) {
  const { t } = useLang();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ role: 'all' });
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(null);
  const [acting, setActing] = useState(null);
  const [openId, setOpenId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.role && filters.role !== 'all') params.set('role', filters.role);
      if (search) params.set('q', search);
      if (year) params.set('year', year);
      params.set('page', page);
      params.set('per_page', perPage);
      const { data } = await api.get(`/api/admin/users?${params.toString()}`);
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } finally { setLoading(false); }
  }, [filters, search, year, page, perPage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleBan = async (uId, currentlyBanned, name) => {
    const action = currentlyBanned ? t('admin_unban_confirm') : t('admin_ban_confirm');
    if (!window.confirm(action.replace('{name}', name))) return;
    setActing(uId);
    try {
      await api.patch(`/api/admin/users/${uId}/ban`, { banned: !currentlyBanned });
      flash(currentlyBanned ? t('admin_unbanned_msg') : t('admin_banned_msg'));
      await fetchData();
    } catch {
      flash(t('error_generic'));
    } finally { setActing(null); }
  };

  return (
    <div className="space-y-4">
      {/* Pro Reviews moderation — collapsible sub-section (was its own tab before iter36) */}
      <ProReviewsPanel flash={flash} />

      <AdminFilterBar
        filters={[
          { key: 'role', label: 'Role', options: [
            { value: 'all', label: 'All' },
            { value: 'homeowner', label: 'Homeowners' },
            { value: 'tradesperson', label: 'Tradespeople' },
          ] },
        ]}
        values={filters}
        onChange={(k, v) => { setFilters({ ...filters, [k]: v }); setPage(1); }}
        search={{ placeholder: 'Search name, email, city…', value: search, onChange: (v) => { setSearch(v); setPage(1); } }}
        showYear
        yearValue={year}
        onYearChange={(v) => { setYear(v); setPage(1); }}
        totalLabel={`${total} users`}
        onReset={() => { setFilters({ role: 'all' }); setSearch(''); setYear(null); setPage(1); }}
      />

      <div className="admin-panel" data-testid="users-panel">
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 size={24} className="text-teal animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('name')}</th>
                  <th>{t('email')}</th>
                  <th>{t('admin_th_role')}</th>
                  <th>{t('admin_th_country')}</th>
                  <th>{t('admin_th_status')}</th>
                  <th className="text-right">{t('admin_th_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <React.Fragment key={u.id}>
                  <tr data-testid={`user-row-${u.id}`}>
                    <td className="font-medium text-ink" data-label={t('name')}>{u.name}</td>
                    <td className="text-ink-soft truncate max-w-[200px]" data-label={t('email')}>{u.email}</td>
                    <td data-label={t('admin_th_role')}><span className="admin-tag capitalize">{u.role}</span></td>
                    <td className="text-ink-soft" data-label={t('admin_th_country')}>{u.country || '—'}</td>
                    <td data-label={t('admin_th_status')}>
                      <span className={`status-pill ${u.banned ? 'status-cancelled' : 'status-active'}`}>
                        {u.banned ? t('admin_status_banned') : t('admin_status_active')}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          className="admin-btn admin-btn-ghost admin-btn-sm"
                          onClick={() => setOpenId(openId === u.id ? null : u.id)}
                          data-testid={`user-view-${u.id}`}
                        >
                          <Eye size={12} /> {openId === u.id ? t('btn_close') : t('btn_view_short')}
                        </button>
                        <button
                          onClick={() => toggleBan(u.id, !!u.banned, u.name)}
                          disabled={acting === u.id}
                          className={`admin-btn admin-btn-sm ${u.banned ? 'admin-btn-ghost' : 'admin-btn-danger'}`}
                          data-testid={`user-ban-${u.id}`}
                        >
                          {acting === u.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                          {u.banned ? t('admin_unban') : t('admin_ban')}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {openId === u.id && (
                    <tr className="bg-cream-soft" data-testid={`user-detail-${u.id}`}>
                      <td colSpan="6" className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div><p className="text-[10px] uppercase text-ink-muted font-bold">{t('admin_user_id')}</p><p className="text-ink font-mono text-xs">{u.id}</p></div>
                          <div><p className="text-[10px] uppercase text-ink-muted font-bold">{t('admin_user_city')}</p><p className="text-ink">{u.city || '—'}</p></div>
                          <div><p className="text-[10px] uppercase text-ink-muted font-bold">{t('admin_user_phone')}</p><p className="text-ink">{u.phone || '—'}</p></div>
                          <div><p className="text-[10px] uppercase text-ink-muted font-bold">{t('admin_user_lang')}</p><p className="text-ink uppercase">{u.lang || '—'}</p></div>
                          <div><p className="text-[10px] uppercase text-ink-muted font-bold">{t('admin_user_created')}</p><p className="text-ink text-xs">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</p></div>
                          <div><p className="text-[10px] uppercase text-ink-muted font-bold">{t('admin_user_last_login')}</p><p className="text-ink text-xs">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}</p></div>
                          <div><p className="text-[10px] uppercase text-ink-muted font-bold">{t('admin_user_onboard')}</p><p className="text-ink">{u.onboarding_complete ? '✓' : '—'}</p></div>
                          <div><p className="text-[10px] uppercase text-ink-muted font-bold">{t('admin_user_email_v')}</p><p className="text-ink">{u.is_email_verified ? '✓' : '—'}</p></div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <AdminPagination
              page={page}
              perPage={perPage}
              total={total}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
