import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import api from '../../../api/client';
import AdminPagination from '../../../components/admin/AdminPagination';

/**
 * Kalkulationen je Handwerker freischalten, passend zum Gewerbeschein.
 *
 * Eine Zeile je Profi, acht Schalter (die sieben Gewerke des Katalogs und
 * Folierung). Ein Tipp speichert sofort; was der Profi sieht, ändert sich
 * beim nächsten Laden der Kalkulation. „Standard“ heißt: nie geändert, also
 * die sieben Gewerke ohne Folierung.
 */
const LICENCE = { verified: 'geprüft', pending: 'in Prüfung', rejected: 'abgelehnt', missing: 'fehlt', none: 'fehlt' };

export default function AdminTrades({ flash }) {
  const [catalog, setCatalog] = useState(null);
  const [pros, setPros] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.get('/api/admin/trades').then((r) => setCatalog(r.data)).catch(() => setFailed(true));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ role: 'tradesperson', page, per_page: perPage });
      if (q.trim()) params.set('q', q.trim());
      const { data } = await api.get(`/api/admin/users?${params}`);
      setPros(data.users || []);
      setTotal(data.total || 0);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally { setLoading(false); }
  }, [page, perPage, q]);

  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  const save = async (pro, next) => {
    const prev = pro.enabled_trades;
    setBusy(pro.id);
    setPros((list) => list.map((p) => (p.id === pro.id ? { ...p, enabled_trades: next, trades_custom: true } : p)));
    try {
      const { data } = await api.patch(`/api/admin/users/${pro.id}/trades`, { trades: next });
      setPros((list) => list.map((p) => (p.id === pro.id ? { ...p, ...data } : p)));
    } catch {
      setPros((list) => list.map((p) => (p.id === pro.id ? { ...p, enabled_trades: prev } : p)));
      flash?.('Speichern fehlgeschlagen');
    } finally { setBusy(null); }
  };

  const toggle = (pro, key) => {
    const on = pro.enabled_trades || [];
    const next = on.includes(key) ? on.filter((k) => k !== key) : [...on, key];
    save(pro, catalog.trades.map((t) => t.key).filter((k) => next.includes(k)));
  };

  return (
    <div className="space-y-4" data-testid="admin-trades">
      <div className="admin-panel">
        <h2 className="font-headings font-bold text-ink text-base">Kalkulationen freischalten</h2>
        <p className="text-xs text-ink-muted mt-1 max-w-2xl">
          Je Handwerker die Gewerke einschalten, für die ein Gewerbeschein vorliegt. Ein Tipp speichert sofort.
          Ausgeschaltete Gewerke verschwinden aus der Kalkulation und werden auch vom Server abgelehnt.
        </p>
        <label className="mt-3 flex items-center gap-2 rounded-xl border border-sm-border bg-paper px-3 py-2 max-w-md">
          <Search size={14} className="text-ink-muted" aria-hidden="true" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
                 placeholder="Name, Firma, E-Mail, Ort…" aria-label="Handwerker suchen"
                 className="flex-1 min-w-0 bg-transparent text-sm text-ink outline-none" data-testid="admin-trades-search" />
        </label>
      </div>

      <div className="admin-panel">
        {failed ? (
          <p className="text-sm text-red-text py-6 text-center">Die Liste konnte nicht geladen werden.</p>
        ) : loading || !catalog ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="text-teal animate-spin" /></div>
        ) : pros.length === 0 ? (
          <p className="text-sm text-ink-muted py-6 text-center">Keine Handwerker gefunden.</p>
        ) : (
          <>
            <ul className="divide-y divide-sm-border">
              {pros.map((pro) => {
                const on = pro.enabled_trades || [];
                return (
                  <li key={pro.id} className="py-3 grid gap-2 md:grid-cols-[minmax(0,240px)_1fr] md:items-center"
                      data-testid={`admin-trades-row-${pro.id}`}>
                    <div className="min-w-0">
                      <p className="font-bold text-ink text-sm truncate">{pro.business_name || pro.name}</p>
                      <p className="text-xs text-ink-muted truncate">
                        {pro.business_name ? `${pro.name} · ` : ''}{pro.email}
                      </p>
                      <p className="text-[11px] text-ink-muted mt-0.5 flex items-center gap-1.5">
                        <span>{on.length} von {catalog.trades.length} an</span>
                        {!pro.trades_custom && <span className="rounded-full bg-cream-deep px-1.5 py-[1px] font-semibold">Standard</span>}
                        {pro.licence_status && <span>· Gewerbeschein: {LICENCE[pro.licence_status] || pro.licence_status}</span>}
                        {busy === pro.id && <Loader2 size={11} className="animate-spin text-teal" />}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {catalog.trades.map((tr) => {
                        const enabled = on.includes(tr.key);
                        return (
                          <button key={tr.key} type="button" onClick={() => toggle(pro, tr.key)}
                                  aria-pressed={enabled} data-testid={`admin-trade-${pro.id}-${tr.key}`}
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors
                                              ${enabled ? 'bg-teal text-paper' : 'border border-sm-border text-ink-muted bg-paper'}`}>
                            {enabled && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                            {tr.label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
            <AdminPagination page={page} perPage={perPage} total={total}
                             onPageChange={setPage} onPerPageChange={setPerPage} />
          </>
        )}
      </div>
    </div>
  );
}
