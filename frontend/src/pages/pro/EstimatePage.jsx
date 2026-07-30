import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import { useLang } from '../../contexts/LangContext';
import {
  Loader2, Search, AlertTriangle, ArrowLeft, Calculator, FileText,
  Trash2, Clock, Package, Info, MapPin,
} from 'lucide-react';

const fmtEur = (v) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR',
    maximumFractionDigits: 0 }).format(Number(v || 0));
const fmtEur2 = (v) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));
const fmtNum = (v, d = 1) =>
  new Intl.NumberFormat('de-AT', { maximumFractionDigits: d }).format(Number(v || 0));

const TIERS = ['basic', 'standard', 'premium'];
const TIER_LABEL = { basic: 'Basis', standard: 'Standard', premium: 'Premium' };

// Severity drives colour, not decoration. An asbestos warning and a note about
// who moves the furniture must not look alike — that is the whole reason the
// API returns them separately instead of as one text blob.
const SEVERITY = {
  critical: { cls: 'border-red-warn/40 bg-red-warn/5 text-red-warn', label: 'Kritisch' },
  high: { cls: 'border-amber-500/40 bg-amber-500/5 text-amber-700', label: 'Wichtig' },
  medium: { cls: 'border-sm-border bg-cream text-ink', label: 'Hinweis' },
  low: { cls: 'border-sm-border bg-cream text-ink-muted', label: 'Hinweis' },
};

const CONFIDENCE = {
  high: { label: 'gut belegt', cls: 'text-green-700' },
  medium: { label: 'Erfahrungswert', cls: 'text-ink-muted' },
  low: { label: 'ungeprüft', cls: 'text-amber-700' },
};

export default function EstimatePage() {
  const { t } = useLang();
  const [meta, setMeta] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState(null);   // survey payload
  const [answers, setAnswers] = useState({});
  const [tier, setTier] = useState('standard');
  const [result, setResult] = useState(null);
  const [calculating, setCalculating] = useState(false);

  const [myJobs, setMyJobs] = useState([]);
  const [targetJob, setTargetJob] = useState('');
  const [allTiers, setAllTiers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [{ data: m }, { data: j }] = await Promise.all([
          api.get('/api/estimate/catalogue'),
          api.get('/api/estimate/jobs'),
        ]);
        if (!live) return;
        setMeta(m);
        setJobs(j.jobs || []);
      } catch (e) {
        if (live) setError(e?.response?.data?.detail || 'Katalog konnte nicht geladen werden');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs.filter((j) => (!group || j.group === group)
      && (!needle || j.label_de.toLowerCase().includes(needle)
        || j.key.toLowerCase().includes(needle)
        || j.group.toLowerCase().includes(needle)));
  }, [jobs, query, group]);

  const openJob = async (key) => {
    setError('');
    setResult(null);
    setNotice('');
    try {
      const { data } = await api.get(`/api/estimate/jobs/${key}`);
      setSelected(data);
      // Start from the form's own defaults. An empty form would estimate from
      // fallbacks the pro never saw and cannot correct.
      const seed = {};
      (data.form || []).forEach((q) => { if (q.default !== null && q.default !== undefined) seed[q.key] = q.default; });
      setAnswers(seed);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Dieser Auftragstyp konnte nicht geladen werden');
    }
  };

  const calculate = useCallback(async (key, ans, wantTier) => {
    setCalculating(true);
    try {
      const { data } = await api.post('/api/estimate', {
        job_key: key, answers: ans, tier: wantTier,
      });
      setResult(data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Die Schätzung konnte nicht berechnet werden');
    } finally {
      setCalculating(false);
    }
  }, []);

  // Recalculate as the form is answered. Debounced because number inputs fire
  // on every keystroke and a per-digit round trip makes the field feel laggy.
  useEffect(() => {
    if (!selected) return undefined;
    const key = selected.job.key;
    const id = setTimeout(() => calculate(key, answers, tier), 350);
    return () => clearTimeout(id);
  }, [selected, answers, tier, calculate]);

  useEffect(() => {
    if (!selected) return;
    api.get('/api/jobs', { params: { status: 'open', limit: 100 } })
      .then(({ data }) => setMyJobs(data.jobs || []))
      .catch(() => setMyJobs([]));
  }, [selected]);

  const set = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));

  const createQuote = async () => {
    if (!targetJob) return;
    setCreating(true);
    setError('');
    try {
      const { data } = await api.post('/api/estimate/quote', {
        job_key: selected.job.key, answers, tier,
        job_id: targetJob, all_tiers: allTiers,
      });
      const n = (data.quotes || []).length;
      setNotice(`${n} ${n === 1 ? 'Angebot' : 'Angebote'} erstellt — unter Angebote zu finden.`);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Das Angebot konnte nicht erstellt werden');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 className="animate-spin text-ink-muted" size={24} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-4">
          {selected && (
            <button type="button" onClick={() => { setSelected(null); setResult(null); setNotice(''); }}
                    className="p-2 -ml-2 text-ink-muted hover:text-ink" data-testid="estimate-back">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex-1">
            <h1 className="font-headings font-bold text-ink text-2xl">
              {t('estimate') || 'Schnellkalkulation'}
            </h1>
            <p className="text-sm text-ink-muted">
              {selected
                ? selected.job.group
                : `${jobs.length} Auftragstypen · ${meta?.groups?.length || 0} Gewerke`}
            </p>
          </div>
        </div>

        {error && (
          <div className="card mb-3 flex items-start gap-2 text-sm text-red-warn" data-testid="estimate-error">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="card mb-3 text-sm text-ink" data-testid="estimate-notice">{notice}</div>
        )}

        {!selected ? (
          <JobPicker meta={meta} jobs={visible} query={query} setQuery={setQuery}
                     group={group} setGroup={setGroup} onPick={openJob} />
        ) : (
          <>
            <SurveyForm survey={selected} answers={answers} set={set}
                        tier={tier} setTier={setTier} />
            <Result result={result} calculating={calculating} />
            {result && (
              <QuoteBox jobs={myJobs} targetJob={targetJob} setTargetJob={setTargetJob}
                        allTiers={allTiers} setAllTiers={setAllTiers}
                        creating={creating} onCreate={createQuote} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function JobPicker({ meta, jobs, query, setQuery, group, setGroup, onPick }) {
  return (
    <>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input className="input w-full pl-9" value={query} placeholder="Arbeit suchen…"
               onChange={(e) => setQuery(e.target.value)} data-testid="estimate-search" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4">
        <Chip active={!group} onClick={() => setGroup('')}>Alle</Chip>
        {(meta?.groups || []).map((g) => (
          <Chip key={g.group} active={group === g.group} onClick={() => setGroup(g.group)}>
            {g.group} <span className="opacity-50">{g.count}</span>
          </Chip>
        ))}
      </div>

      <div className="space-y-2" data-testid="estimate-job-list">
        {jobs.map((j) => (
          <button key={j.key} type="button" onClick={() => onPick(j.key)}
                  className="card w-full text-left hover:border-ink/20 transition">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">{j.label_de}</p>
                <p className="text-xs text-ink-muted">
                  {j.group} · typisch {j.typical_size[0]}–{j.typical_size[1]} {j.unit}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {j.quote_mode === 'regie' && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700">
                    Besichtigung
                  </span>
                )}
                <p className={`text-[11px] mt-1 ${CONFIDENCE[j.confidence]?.cls}`}>
                  {CONFIDENCE[j.confidence]?.label}
                </p>
              </div>
            </div>
          </button>
        ))}
        {!jobs.length && (
          <p className="text-sm text-ink-muted py-8 text-center">Nichts gefunden.</p>
        )}
      </div>
    </>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition ${
              active ? 'bg-ink text-paper border-ink' : 'bg-paper text-ink-muted border-sm-border'}`}>
      {children}
    </button>
  );
}

function SurveyForm({ survey, answers, set, tier, setTier }) {
  const job = survey.job;
  return (
    <div className="card-lg mb-4 space-y-3" data-testid="estimate-form">
      <div>
        <h2 className="font-medium text-ink">{job.label_de}</h2>
        {job.site_visit_required && (
          <p className="text-xs text-amber-700 mt-1 flex items-start gap-1.5">
            <MapPin size={13} className="mt-0.5 shrink-0" />
            Ohne Besichtigung nur als Regiepreis anbieten — der Aufwand hängt hier
            zu stark vom Objekt ab für einen Fixpreis.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {TIERS.map((tr) => (
          <button key={tr} type="button" onClick={() => setTier(tr)}
                  className={`flex-1 text-xs py-2 rounded-lg border transition ${
                    tier === tr ? 'bg-ink text-paper border-ink' : 'bg-paper text-ink-muted border-sm-border'}`}
                  data-testid={`estimate-tier-${tr}`}>
            {TIER_LABEL[tr]}
          </button>
        ))}
      </div>

      {(survey.form || []).map((q) => (
        <label key={q.key} className="block text-xs text-ink-muted">
          {q.label_de}{q.unit ? ` (${q.unit})` : ''}
          {q.type === 'number' && (
            <input className="input w-full" type="number" min="0" step="any"
                   value={answers[q.key] ?? ''}
                   onChange={(e) => set(q.key, e.target.value === '' ? '' : Number(e.target.value))}
                   data-testid={`estimate-q-${q.key}`} />
          )}
          {q.type === 'choice' && (
            <select className="input w-full" value={answers[q.key] ?? ''}
                    onChange={(e) => set(q.key, e.target.value)}
                    data-testid={`estimate-q-${q.key}`}>
              {q.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          )}
          {q.type === 'bool' && (
            <div className="mt-1">
              <input type="checkbox" className="mr-2" checked={!!answers[q.key]}
                     onChange={(e) => set(q.key, e.target.checked)}
                     data-testid={`estimate-q-${q.key}`} />
              <span className="text-ink">{q.help_de || 'Ja'}</span>
            </div>
          )}
          {q.help_de && q.type !== 'bool' && (
            <span className="block mt-0.5 text-[11px] text-ink-muted/80">{q.help_de}</span>
          )}
        </label>
      ))}
    </div>
  );
}

function Result({ result, calculating }) {
  if (!result) {
    return (
      <div className="card-lg mb-4 flex items-center justify-center py-10 text-ink-muted">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }
  const [lo, hi] = result.total_net;
  const band = result.market_band;
  // The band is per unit or per job depending on the entry, and comparing the
  // wrong one to the wrong one is how a sane estimate looks alarming.
  const compare = result.band_basis === 'per_unit' ? result.per_unit : result.total_net;
  const outside = band && ((compare[0] + compare[1]) / 2 < band[0]
    || (compare[0] + compare[1]) / 2 > band[1]);

  return (
    <div className={`card-lg mb-4 space-y-4 ${calculating ? 'opacity-60' : ''}`}
         data-testid="estimate-result">
      <div>
        <p className="text-xs text-ink-muted">Netto, geschätzt</p>
        <p className="font-headings font-bold text-ink text-3xl">
          {fmtEur(lo)} – {fmtEur(hi)}
        </p>
        <p className="text-xs text-ink-muted mt-1">
          {fmtNum(result.qty, 2)} {result.job.unit}
          {result.per_unit && ` · ${fmtEur2(result.per_unit[0])}–${fmtEur2(result.per_unit[1])} / ${result.job.unit}`}
          {result.rate_basis === 'notdienst' && ' · Notdiensttarif'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat icon={Clock} label="Arbeitszeit"
              value={`${fmtNum(result.hours[0])}–${fmtNum(result.hours[1])} h`}
              sub={`davon ${fmtNum(result.setup_hours[0])}–${fmtNum(result.setup_hours[1])} h Rüstzeit`} />
        <Stat icon={Package} label="Material"
              value={`${fmtEur(result.material[0])}–${fmtEur(result.material[1])}`}
              sub={`Stundensatz ${fmtEur(result.hourly_used[0])}–${fmtEur(result.hourly_used[1])}`} />
        {result.debris_kg[1] > 0 && (
          <Stat icon={Trash2} label="Abfall"
                value={`${fmtNum(result.debris_kg[0], 0)}–${fmtNum(result.debris_kg[1], 0)} kg`}
                sub={result.container || ''} />
        )}
        {result.disposal[1] > 0 && (
          <Stat icon={Trash2} label="Entsorgung"
                value={`${fmtEur(result.disposal[0])}–${fmtEur(result.disposal[1])}`}
                sub="inkl. Container" />
        )}
      </div>

      {band && (
        <p className={`text-xs ${outside ? 'text-amber-700' : 'text-ink-muted'}`}>
          <Info size={12} className="inline mr-1 -mt-0.5" />
          Marktüblich {result.band_basis === 'per_unit'
            ? `${fmtEur2(band[0])}–${fmtEur2(band[1])} / ${result.job.unit}`
            : `${fmtEur(band[0])}–${fmtEur(band[1])}`} in {result.country}
          {outside && ' — diese Schätzung liegt außerhalb. Vor dem Versenden prüfen.'}
        </p>
      )}

      {!!result.answers_recorded?.length && (
        // Stated, not hidden. These answers attached notes and did not change
        // the total — the catalogue has one quantity axis plus condition,
        // access and Notdienst. Letting the form imply otherwise would make
        // the survey theatre.
        <p className="text-xs text-ink-muted">
          <Info size={12} className="inline mr-1 -mt-0.5" />
          Preiswirksam: {result.answers_applied.join(', ') || '—'}. Nur vermerkt
          und als Hinweis ausgewiesen: {result.answers_recorded.join(', ')}.
        </p>
      )}

      {!!result.notes.length && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink">Annahmen und Vorbehalte</p>
          {result.notes.map((n) => (
            <div key={n.key}
                 className={`text-xs border rounded-lg px-3 py-2 ${SEVERITY[n.severity]?.cls || SEVERITY.medium.cls}`}>
              <span className="font-medium">{SEVERITY[n.severity]?.label}: </span>{n.text_de}
            </div>
          ))}
        </div>
      )}

      <details>
        <summary className="text-xs text-ink-muted cursor-pointer">
          {result.lines.length} Positionen · {fmtEur2(result.lines_net)}
        </summary>
        <table className="w-full mt-2 text-xs">
          <tbody>
            {result.lines.map((l) => (
              <tr key={l.position} className="border-b border-sm-border/60">
                <td className="py-1.5 pr-2 text-ink">
                  {l.description}
                  {l.rate_source === 'pro' && (
                    <span className="ml-1 text-[10px] text-green-700">eigener Satz</span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-right text-ink-muted whitespace-nowrap">
                  {fmtNum(l.qty, 2)} {l.unit}
                </td>
                <td className="py-1.5 text-right text-ink whitespace-nowrap">
                  {fmtEur2(l.unit_price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div>
      <p className="text-xs text-ink-muted flex items-center gap-1">
        <Icon size={12} />{label}
      </p>
      <p className="text-ink font-medium">{value}</p>
      {sub && <p className="text-[11px] text-ink-muted">{sub}</p>}
    </div>
  );
}

function QuoteBox({ jobs, targetJob, setTargetJob, allTiers, setAllTiers, creating, onCreate }) {
  return (
    <div className="card-lg mb-4 space-y-3" data-testid="estimate-quote-box">
      <p className="text-sm font-medium text-ink flex items-center gap-2">
        <FileText size={15} />Als Angebot übernehmen
      </p>
      <select className="input w-full" value={targetJob}
              onChange={(e) => setTargetJob(e.target.value)} data-testid="estimate-target-job">
        <option value="">Auftrag wählen…</option>
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>
            {j.job_number ? `${j.job_number} · ` : ''}{j.title}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input type="checkbox" checked={allTiers} onChange={(e) => setAllTiers(e.target.checked)} />
        Alle drei Varianten anlegen — eine Wahl zwischen Optionen ist keine Wahl
        zwischen acht Preisen.
      </label>
      <button type="button" className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={!targetJob || creating} onClick={onCreate} data-testid="estimate-create-quote">
        {creating ? <Loader2 className="animate-spin" size={16} /> : <Calculator size={16} />}
        Angebot erstellen
      </button>
      {!jobs.length && (
        <p className="text-xs text-ink-muted">
          Kein offener Auftrag vorhanden. Ein Angebot hängt immer an einem Auftrag.
        </p>
      )}
    </div>
  );
}
