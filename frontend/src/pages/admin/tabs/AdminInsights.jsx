import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../api/client';
import { useLang } from '../../../contexts/LangContext';
import {
  Sparkles, Loader2, RefreshCw, AlertCircle, Lightbulb, Bug, Star, Heart, TrendingUp,
} from 'lucide-react';

const CATEGORY_META = {
  missing_features: { icon: Lightbulb, color: 'text-teal', bg: 'bg-teal/10', labelKey: 'insights_missing' },
  problems: { icon: Bug, color: 'text-red-text', bg: 'bg-red-warn/10', labelKey: 'insights_problems' },
  nice_to_have: { icon: Star, color: 'text-amber-deep', bg: 'bg-amber/10', labelKey: 'insights_nice' },
  praise: { icon: Heart, color: 'text-green-text', bg: 'bg-green-pos/10', labelKey: 'insights_praise' },
};

export default function AdminInsights({ flash }) {
  const { t } = useLang();
  const [analysis, setAnalysis] = useState(null);
  const [counts, setCounts] = useState({ fb: 0, rv: 0 });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/insights');
      setAnalysis(data.analysis);
      setCounts({ fb: data.current_feedback_count, rv: data.current_review_count });
    } catch (e) {
      setError(e?.response?.data?.detail || t('adm_err_load'));
    } finally { setLoading(false); }
    // `t` is read in the catch, so it belongs in the deps — the effect below
    // depends on this callback, and without it an error raised after a
    // language switch is announced in the old one.
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const analyze = async () => {
    setRunning(true); setError('');
    try {
      const { data } = await api.post('/api/admin/insights/analyze');
      setAnalysis(data);
      flash?.(t('insights_done'));
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || t('adm_err_analysis'));
    } finally { setRunning(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="text-teal animate-spin" /></div>;

  const sentiment = analysis?.sentiment || null;

  return (
    <div className="space-y-4" data-testid="admin-insights">
      {/* Header */}
      <div className="card-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center flex-shrink-0">
            <Sparkles size={20} className="text-teal" />
          </div>
          <div>
            <h2 className="font-headings font-bold text-ink text-lg">{t('insights_title')}</h2>
            <p className="text-xs text-ink-muted">{t('insights_subtitle')}</p>
            <p className="text-[11px] text-ink-muted mt-1">
              {counts.fb} {t('insights_feedback')} · {counts.rv} {t('insights_reviews')}
            </p>
          </div>
        </div>
        <button onClick={analyze} disabled={running} className="btn-primary text-sm flex-shrink-0" data-testid="admin-insights-analyze">
          {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {analysis ? t('insights_reanalyze') : t('insights_analyze')}
        </button>
      </div>

      {error && (
        <div className="card-lg border-l-4 border-red-warn flex items-center gap-2" data-testid="admin-insights-error">
          <AlertCircle size={16} className="text-red-warn" /> <span className="text-sm text-ink">{error}</span>
        </div>
      )}

      {!analysis ? (
        <div className="card-lg text-center py-12">
          <Sparkles size={26} className="text-ink-muted mx-auto mb-2" />
          <p className="text-sm text-ink-muted">{t('insights_empty')}</p>
        </div>
      ) : (
        <>
          {/* Overview + meta */}
          <div className="card-lg" data-testid="admin-insights-overview">
            <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider mb-2">{t('insights_overview')}</p>
            <p className="text-sm text-ink leading-relaxed">{analysis.overview}</p>
            <p className="text-[11px] text-ink-muted mt-3">
              {t('insights_generated')} {analysis.generated_at ? new Date(analysis.generated_at).toLocaleString() : '—'} · {analysis.model} · {analysis.feedback_analysed}+{analysis.reviews_analysed} {t('insights_items')}
            </p>
          </div>

          {/* Sentiment */}
          {sentiment && (
            <div className="card-lg" data-testid="admin-insights-sentiment">
              <p className="text-[10px] uppercase font-bold text-ink-muted tracking-wider mb-2 flex items-center gap-2"><TrendingUp size={12} /> {t('insights_sentiment')}</p>
              <div className="flex h-3 rounded-full overflow-hidden bg-cream-deep">
                <div className="bg-green-pos h-full" style={{ width: `${sentiment.positive || 0}%` }} title={`Positive ${sentiment.positive}%`} />
                <div className="bg-ink-muted/40 h-full" style={{ width: `${sentiment.neutral || 0}%` }} title={`Neutral ${sentiment.neutral}%`} />
                <div className="bg-red-warn h-full" style={{ width: `${sentiment.negative || 0}%` }} title={`Negative ${sentiment.negative}%`} />
              </div>
              <div className="flex justify-between text-[11px] mt-2">
                <span className="text-green-text font-semibold">▲ {sentiment.positive || 0}% {t('insights_positive')}</span>
                <span className="text-ink-muted">● {sentiment.neutral || 0}% {t('insights_neutral')}</span>
                <span className="text-red-warn font-semibold">▼ {sentiment.negative || 0}% {t('insights_negative')}</span>
              </div>
            </div>
          )}

          {/* Themes */}
          {analysis.top_themes?.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="admin-insights-themes">
              {analysis.top_themes.map((th, i) => (
                <span key={i} className="text-xs bg-cream-deep text-ink px-3 py-1 rounded-full font-medium">#{th}</span>
              ))}
            </div>
          )}

          {/* Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const items = analysis.categories?.[key] || [];
              const Icon = meta.icon;
              return (
                <div key={key} className="card-lg" data-testid={`admin-insights-cat-${key}`}>
                  <p className={`text-xs uppercase font-bold tracking-wider mb-3 flex items-center gap-2 ${meta.color}`}>
                    <Icon size={13} /> {t(meta.labelKey)} <span className="text-ink-muted">({items.length})</span>
                  </p>
                  {items.length === 0 ? (
                    <p className="text-xs text-ink-muted py-2">{t('insights_none')}</p>
                  ) : (
                    <ul className="space-y-2">
                      {items.map((it, i) => (
                        <li key={i} className={`rounded-[10px] p-2.5 ${meta.bg}`}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-ink">{it.title}</p>
                            {it.mentions != null && (
                              <span className="text-[10px] font-bold text-ink-muted bg-paper px-1.5 py-0.5 rounded-full flex-shrink-0">{it.mentions}×</span>
                            )}
                          </div>
                          {it.detail && <p className="text-xs text-ink-muted mt-0.5">{it.detail}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
