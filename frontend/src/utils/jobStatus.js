// The `job_status` vocabulary, in the order a job moves through it.
//
// One copy, because there used to be several and they disagreed. The projects
// list was fixed to the real enum in an earlier pass; the detail page's status
// dropdown was not, and still offered active/on_hold/done/archived — names
// from the old pm_projects table that are not members of the enum at all. It
// also PATCHed them onto /api/jobs/{id}, where JobPatch has no `status` field,
// so Pydantic dropped them before the repository saw them. Two bugs stacked:
// even a correct value would have gone nowhere, and no value offered was
// correct. The result was a job that could never leave `accepted`.

import {
  Sparkles, FileText, CheckCircle, Calendar as CalendarIcon, Clock,
  Receipt, Archive, Pause,
} from 'lucide-react';

export const STATUS_META = {
  lead:        { i: Sparkles,     cls: 'text-ink-muted bg-cream-deep',   dot: 'bg-ink-muted', key: 'pm_status_lead' },
  quoted:      { i: FileText,     cls: 'text-teal bg-teal/10',           dot: 'bg-teal',      key: 'pm_status_quoted' },
  accepted:    { i: CheckCircle,  cls: 'text-teal bg-teal/10',           dot: 'bg-teal',      key: 'pm_status_accepted' },
  scheduled:   { i: CalendarIcon, cls: 'text-amber-deep bg-amber/10',    dot: 'bg-amber',     key: 'pm_status_scheduled' },
  in_progress: { i: Clock,        cls: 'text-amber-deep bg-amber/10',    dot: 'bg-amber',     key: 'pm_status_in_progress' },
  completed:   { i: CheckCircle,  cls: 'text-green-pos bg-green-pos/10', dot: 'bg-green-pos', key: 'pm_status_completed' },
  invoiced:    { i: Receipt,      cls: 'text-green-pos bg-green-pos/10', dot: 'bg-green-pos', key: 'pm_status_invoiced' },
  closed:      { i: Archive,      cls: 'text-ink-muted bg-cream-deep',   dot: 'bg-ink-muted', key: 'pm_status_closed' },
  cancelled:   { i: Pause,        cls: 'text-ink-muted bg-cream-deep',   dot: 'bg-ink-muted', key: 'pm_status_cancelled' },
};

export const STATUS_ORDER = Object.keys(STATUS_META);

// Which of them count as work still in hand, for the default filter and the
// pipeline tile.
export const OPEN = ['lead', 'quoted', 'accepted', 'scheduled', 'in_progress'];
export const EARNED = ['completed', 'invoiced', 'closed'];

// The label, translated. t() returns the key it was given when a translation
// is missing, and a key is truthy, so `t(k) || fallback` never fires — hence
// the explicit comparison.
export const statusLabel = (status, t) => {
  const key = STATUS_META[status]?.key;
  if (!key) return status;
  const label = t(key);
  return label === key ? status : label;
};
