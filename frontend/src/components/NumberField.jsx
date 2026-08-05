import React, { useEffect, useState } from 'react';
import { parseDecimal } from '../utils/number';

/**
 * A money/quantity field that accepts the number the pro actually types.
 *
 * `<input type="number">` looks like the right tool and is not. Chromium
 * refuses the comma keystroke and hands back the digits either side of it, so
 * a German tradesperson typing "2,5" produced **25** — ten times the quantity,
 * with `validity.badInput` false, no error, and the wrong figure saved through
 * to the customer's invoice. "0,5" became "05". There is no browser
 * configuration in which the comma parses.
 *
 * So: a text input with `inputMode="decimal"`, which still raises the numeric
 * keypad on a phone, and `parseDecimal` doing the reading.
 *
 * The raw text is kept in state while the field has focus, because a
 * half-typed "12," must not be normalised out from under the cursor. It is
 * reconciled with the value on blur.
 *
 * @param value   number | null
 * @param onChange (number | null) => void — null means the field is empty or
 *                 unreadable, which the caller must distinguish from 0.
 * @param min/max  clamped on blur, and announced to assistive tech.
 */
export default function NumberField({
  value, onChange, min, max, className = '', onBlur, ...rest
}) {
  const [text, setText] = useState(() => (value == null ? '' : String(value).replace('.', ',')));
  const [focused, setFocused] = useState(false);

  /* Follow the value when it changes from outside — a recalculation, a
     template being applied — but never while the pro is mid-word. */
  useEffect(() => {
    if (focused) return;
    setText(value == null ? '' : String(value).replace('.', ','));
  }, [value, focused]);

  const commit = (raw) => {
    const n = parseDecimal(raw);
    if (n == null) { onChange(raw.trim() === '' ? null : null); return; }
    let out = n;
    if (min != null && out < Number(min)) out = Number(min);
    if (max != null && out > Number(max)) out = Number(max);
    onChange(out);
    return out;
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
      onBlur={(e) => {
        setFocused(false);
        const out = commit(e.target.value);
        /* Show what was understood. If "1.234,50" was read as 1234.5, the
           field says so rather than leaving the pro to wonder. */
        setText(out == null ? '' : String(out).replace('.', ','));
        onBlur?.(e);
      }}
      aria-valuemin={min}
      aria-valuemax={max}
      className={className}
      {...rest}
    />
  );
}
