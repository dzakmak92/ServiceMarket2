/**
 * Customer SMS — composed here, sent by the phone.
 *
 * Nothing goes out over the network. The app has no gateway and no sender
 * identity; the message leaves from the tradesperson's own number, which is
 * the number the customer already has and will reply to. That also keeps the
 * whole thing free and takes the platform out of a conversation it has no
 * business being in.
 *
 * The body is copied to the clipboard before the handover, because `sms:`
 * body support is inconsistent — reliable on Android, patchy across iOS
 * versions and blocked entirely in some in-app browsers. When the prefill
 * works the copy is redundant; when it silently drops, a paste rescues it.
 * Belt and braces beats a message the pro thinks they sent.
 */

export const TEMPLATES = {
  delay: {
    key: 'delay',
    label: 'Verspätung',
    build: ({ customer, newStart, delayMinutes, proName }) =>
      `Guten Tag ${customer},\n` +
      `Ihr Termin heute verschiebt sich um ${delayMinutes} Minuten auf ${newStart} Uhr. ` +
      `Der vorige Auftrag dauert länger als geplant, bitte entschuldigen Sie.\n` +
      `${proName}`,
  },
  moved: {
    key: 'moved',
    label: 'Verschoben',
    build: ({ customer, newStart, newDate, proName }) =>
      `Guten Tag ${customer},\n` +
      `Ihr Termin wurde auf ${newDate}, ${newStart} Uhr verschoben. ` +
      `Passt Ihnen das? Bitte kurz zurückmelden.\n` +
      `${proName}`,
  },
  cancelled: {
    key: 'cancelled',
    label: 'Abgesagt',
    build: ({ customer, proName }) =>
      `Guten Tag ${customer},\n` +
      `Ihr heutiger Termin muss leider entfallen. Ich melde mich, um einen ` +
      `neuen Termin zu vereinbaren.\n` +
      `${proName}`,
  },
};

/** GSM-7 fits 160 per segment, 153 when concatenated. Anything outside the
 *  basic alphabet forces UCS-2: 70 and 67. German umlauts are in GSM-7's
 *  extension, "€" costs two — so a naive length count understates the bill. */
const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';

export function smsSegments(text) {
  const chars = Array.from(text);
  const ucs2 = chars.some((c) => !GSM7.includes(c) && !GSM7_EXT.includes(c));
  if (ucs2) {
    const n = chars.length;
    return { units: n, encoding: 'UCS-2', segments: n <= 70 ? 1 : Math.ceil(n / 67) };
  }
  const units = chars.reduce((a, c) => a + (GSM7_EXT.includes(c) ? 2 : 1), 0);
  return { units, encoding: 'GSM-7', segments: units <= 160 ? 1 : Math.ceil(units / 153) };
}

/** Strip everything a dialler will not accept, keeping a leading +. */
export function telHref(phone) {
  if (!phone) return '';
  const cleaned = String(phone).replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? '+' + cleaned.slice(1).replace(/\+/g, '') : cleaned;
}

/**
 * `sms:` with a body, in the one shape both platforms accept.
 *
 * iOS wants `&body=` after a separator, Android wants `?body=`. `?&body=` is
 * the form that satisfies both: Android reads `?` then an empty first param,
 * iOS reads the `&`. Written once here rather than guessed at the call site.
 */
export function smsHref(phone, body) {
  const num = telHref(phone);
  return `sms:${num}?&body=${encodeURIComponent(body)}`;
}

/** Copy without assuming the Clipboard API exists — it is absent on http
 *  origins and in older WebViews, which is exactly where trades' phones live.
 *  Returns whether the text actually made it. */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the textarea */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Copy, then hand over to the phone's own messaging app. */
export async function sendViaPhone(phone, body) {
  const copied = await copyToClipboard(body);
  window.location.href = smsHref(phone, body);
  return copied;
}
