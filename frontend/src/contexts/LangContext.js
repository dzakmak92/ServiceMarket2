import React, { createContext, useContext, useState, useCallback } from 'react';
import translations from '../translations';
import { setDurationUnits, dateLocale } from '../utils/schedule';
import { setMoneyLocale } from '../utils/money';

const LangContext = createContext(null);

const SUPPORTED = ['de', 'en', 'tr', 'es'];

// The product is de-AT first. Defaulting to English put every Austrian and
// German tradesperson — the whole target audience — into a language they did
// not ask for, on a screen where the language switcher is in a menu.
//
// `sm_lang` means the person picked a language on *this device*, so it wins
// over everything, including their account. Its absence is what lets
// `adoptAccountLang` step in below.
function initialLang() {
  const stored = localStorage.getItem('sm_lang');
  if (SUPPORTED.includes(stored)) return stored;
  const browser = (navigator.languages || [navigator.language || ''])
    .map((l) => String(l).slice(0, 2).toLowerCase())
    .find((l) => SUPPORTED.includes(l));
  return browser || 'de';
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(initialLang);

  /* Keep the schedule module's unit words in step with the interface
     language — "8 h 30 min" was hardcoded and read the same in all four.
     Set during render, not in an effect: durationLabel is called by children
     on this same pass, and an effect runs after they have already drawn, so
     the first paint after a language change would carry the old units. */
  const units = translations[lang];
  setDurationUnits({ h: units?.unit_h || 'h', min: units?.unit_min || 'min' });

  /* Same arrangement for amounts and dates: every screen formatted them in
     de-AT regardless of the chosen language. Registered during render for
     the same reason as the units above. */
  setMoneyLocale(dateLocale(lang));

  const changeLang = useCallback((newLang) => {
    setLang(newLang);
    localStorage.setItem('sm_lang', newLang);
  }, []);

  /* The language the account was created in, applied when this device has no
     opinion of its own.

     Onboarding asks for a language on its very first screen and saves it to
     the account — and nothing ever read it back. A tradesperson who chose
     Turkish got Turkish only for as long as that browser kept its
     localStorage: a new phone, a private window or a cleared cache put them
     back into whatever their browser reported, which for the whole target
     audience means German and for everyone else means English. They had
     answered the question and the app forgot.

     It does not overwrite `sm_lang`. Picking a language from the menu is a
     statement about this device and stays one; this only fills the silence. */
  const adoptAccountLang = useCallback((accountLang) => {
    if (!SUPPORTED.includes(accountLang)) return;
    if (localStorage.getItem('sm_lang')) return;
    setLang((current) => (current === accountLang ? current : accountLang));
  }, []);

  const t = useCallback((key, vars = {}) => {
    const str = translations[lang]?.[key] || translations.en?.[key] || key;
    return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), str);
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, changeLang, adoptAccountLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
