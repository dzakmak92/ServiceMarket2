import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useLang } from '../contexts/LangContext';
import { BUILD, buildLabel, runningAsset } from '../utils/build';

/**
 * Which build this phone is running.
 *
 * There was no answer to this anywhere in the app, which made every support
 * conversation start from nothing: a pro reporting a bug that was fixed on
 * Tuesday and a pro whose tab has not reloaded since Monday say exactly the
 * same sentence. The commit is what makes those two different.
 *
 * It lives at the foot of the "More" sheet rather than inside Settings →
 * Account. Two reasons, and the second is the real one: the sheet is two taps
 * from anywhere in the app while the account tab is four, and somebody looking
 * for a version number is not editing their account — they are being asked for
 * it, usually by us, usually while something is wrong.
 *
 * The running asset hash is shown beside the commit when it can be read,
 * because the two can disagree — a tab open for days is executing an older
 * bundle than the one the server is handing out, and that disagreement is the
 * diagnosis rather than a detail to tidy away. `UpdatePrompt` is what offers
 * the reload.
 *
 * One tap copies the lot, so it can be pasted into a message instead of read
 * out character by character.
 */
export default function AppVersion() {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const asset = runningAsset();
  const built = BUILD.at ? new Date(BUILD.at) : null;
  const line = `ServiceMarket ${buildLabel()}${asset ? ` · ${asset}` : ''}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* No clipboard permission, or an insecure origin. The text is on screen
         and selectable either way — the button is a convenience, not the only
         way to get at it. */
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-sm-border flex items-center gap-2"
         data-testid="app-version">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[.05em] text-ink-muted">
          {t('settings_version')}
        </p>
        <p className="text-[12.5px] font-bold text-ink tabular-nums"
           data-testid="app-version-value">{buildLabel()}</p>
        <p className="text-[10.5px] text-ink-muted leading-snug">
          {built ? t('settings_version_built', { d: built.toLocaleDateString() }) : null}
          {asset ? `${built ? ' · ' : ''}${t('settings_version_running', { a: asset })}` : ''}
        </p>
      </div>
      <button type="button" onClick={copy} data-testid="app-version-copy"
              aria-label={t('settings_version_copy')}
              className="shrink-0 rounded-[9px] border border-sm-border bg-cream-soft px-2.5 py-2
                         text-teal">
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}
