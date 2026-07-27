import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LangContext';
import api from '../../api/client';
import { Save, User, Bell, Lock, Heart, Trash2, Download, Globe } from 'lucide-react';
import PrivacySettings from '../../components/PrivacySettings';

const TABS = ['personal_info', 'notifications', 'privacy', 'saved_pros'];
const LANG_OPTIONS = [{code:'en',name:'English'},{code:'de',name:'Deutsch'},{code:'tr',name:'Türkçe'},{code:'es',name:'Español'}];

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { t, lang, changeLang } = useLang();
  const [tab, setTab] = useState('personal_info');
  const [form, setForm] = useState({ name:'', phone:'', city:'', address:'', lang:'en' });
  const [notifForm, setNotifForm] = useState({ notif_email:true, notif_sms:false });
  const [privForm, setPrivForm] = useState({ privacy_show_lastname:true, privacy_share_contact_pre_accept:false });
  const [savedPros, setSavedPros] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({ name: user.name || '', phone: user.phone || '', city: user.city || '', address: user.address || '', lang: user.lang || 'en' });
      setNotifForm({ notif_email: user.notif_email ?? true, notif_sms: user.notif_sms ?? false });
      setPrivForm({
        privacy_show_lastname: user.privacy_show_lastname ?? true,
        privacy_share_contact_pre_accept: user.privacy_share_contact_pre_accept ?? false
      });
    }
  }, [user]);

  useEffect(() => {
    if (tab === 'saved_pros') {
      api.get('/api/saved-pros').then(r => setSavedPros(r.data.saved_pros || [])).catch(() => {});
    }
  }, [tab]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.patch('/api/profile', { ...form, ...notifForm, ...privForm });
      if (form.lang !== lang) changeLang(form.lang);
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  };

  const removeSaved = async (proId) => {
    await api.delete(`/api/saved-pros/${proId}`);
    setSavedPros(s => s.filter(p => p.id !== proId));
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ user, exported_at: new Date().toISOString() }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'my-servicemarket-data.json'; a.click();
  };

  const ICONS = { personal_info: User, notifications: Bell, privacy: Lock, saved_pros: Heart };

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8">
      <div className="page-container py-8 max-w-3xl">
        <h1 className="text-3xl font-headings font-bold text-ink mb-8">{t('settings')}</h1>

        <div className="flex gap-6 flex-col md:flex-row">
          {/* Sidebar */}
          <div className="md:w-48 flex-shrink-0">
            <div className="bg-paper rounded-[18px] border border-sm-border p-2 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              {TABS.map(tabId => {
                const Icon = ICONS[tabId];
                return (
                  <button
                    key={tabId}
                    onClick={() => setTab(tabId)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-[14px] text-sm whitespace-nowrap transition-all
                      ${tab === tabId ? 'bg-teal/10 text-teal font-semibold' : 'text-ink-soft hover:bg-cream-soft'}`}
                    data-testid={`settings-tab-${tabId}`}
                  >
                    <Icon size={14} /> {t(tabId)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 animate-fade-in">
            {tab === 'personal_info' && (
              <div className="card-lg space-y-4">
                <h2 className="font-headings font-bold text-ink text-lg">{t('personal_info')}</h2>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('name')}</label>
                  <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} className="sm-input" data-testid="settings-name-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('email')}</label>
                  <input value={user?.email} disabled className="sm-input opacity-60" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('phone')}</label>
                  <input value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} className="sm-input" placeholder="+43 ..." data-testid="settings-phone-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('city')}</label>
                  <input value={form.city} onChange={e => setForm(f=>({...f,city:e.target.value}))} className="sm-input" placeholder="Vienna" data-testid="settings-city-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">{t('settings_address')}</label>
                  <input
                    value={form.address}
                    onChange={e => setForm(f=>({...f,address:e.target.value}))}
                    className="sm-input"
                    placeholder={t('settings_address_placeholder')}
                    data-testid="settings-address-input"
                  />
                  <p className="text-xs text-ink-muted mt-1.5">{t('settings_address_help')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5 flex items-center gap-1"><Globe size={14} />{t('change_language')}</label>
                  <select value={form.lang} onChange={e => setForm(f=>({...f,lang:e.target.value}))} className="sm-select" data-testid="settings-lang-select">
                    {LANG_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                </div>
                <button onClick={saveProfile} disabled={saving} className="btn-primary w-full" data-testid="settings-save-btn">
                  {saving ? 'Saving...' : saved ? '✓ Saved!' : t('btn_save_changes')}
                </button>
              </div>
            )}

            {tab === 'notifications' && (
              <div className="card-lg space-y-4">
                <h2 className="font-headings font-bold text-ink text-lg">{t('notifications')}</h2>
                {[
                  { key: 'notif_email', label: 'Email notifications', desc: 'Receive updates via email' },
                  { key: 'notif_sms', label: 'SMS notifications', desc: 'Receive text message alerts' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between py-3 border-b border-sm-border">
                    <div>
                      <p className="text-sm font-medium text-ink">{item.label}</p>
                      <p className="text-xs text-ink-muted">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifForm(f => ({...f, [item.key]: !f[item.key]}))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${notifForm[item.key] ? 'bg-teal' : 'bg-ink-faint'}`}
                      data-testid={`toggle-${item.key}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform
                        ${notifForm[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
                <button onClick={saveProfile} disabled={saving} className="btn-primary w-full">
                  {saving ? 'Saving...' : t('btn_save_changes')}
                </button>
              </div>
            )}

            {tab === 'privacy' && (
              <div className="card-lg space-y-6">
                <div>
                  <h2 className="font-headings font-bold text-ink text-lg mb-1">Marketplace privacy</h2>
                  <p className="text-xs text-ink-muted mb-3">Control what pros can see before you accept their quote.</p>
                  {[
                    { key: 'privacy_show_lastname', label: 'Show last name', desc: 'Show your last name to pros' },
                    { key: 'privacy_share_contact_pre_accept', label: 'Share contact before accepting', desc: 'Allow pros to see your phone before you accept a quote' },
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between py-3 border-b border-sm-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-ink">{item.label}</p>
                        <p className="text-xs text-ink-muted">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => setPrivForm(f => ({...f, [item.key]: !f[item.key]}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                          ${privForm[item.key] ? 'bg-teal' : 'bg-ink-faint'}`}
                        data-testid={`toggle-${item.key}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform
                          ${privForm[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  ))}
                  <button onClick={saveProfile} className="btn-primary mt-3">Save marketplace settings</button>
                </div>

                <div className="pt-2 border-t border-sm-border">
                  <PrivacySettings />
                </div>
              </div>
            )}

            {tab === 'saved_pros' && (
              <div className="card-lg">
                <h2 className="font-headings font-bold text-ink text-lg mb-4">{t('saved_pros')}</h2>
                {savedPros.length === 0 ? (
                  <div className="text-center py-8">
                    <Heart size={32} className="text-ink-muted mx-auto mb-2" />
                    <p className="text-ink-muted text-sm">No saved pros yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedPros.map(pro => (
                      <div key={pro.id} className="flex items-center justify-between p-3 bg-cream-soft rounded-[14px]">
                        <div>
                          <p className="font-medium text-ink text-sm">{pro.business_name || pro.name}</p>
                          <p className="text-xs text-ink-muted">{pro.city}</p>
                        </div>
                        <button onClick={() => removeSaved(pro.id)} className="text-red-warn hover:bg-red-50 p-2 rounded-lg">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
