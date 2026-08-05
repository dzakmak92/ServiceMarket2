import React, { createContext, useContext, useState, useCallback } from 'react';
import translations from '../translations';
import { setDurationUnits } from '../utils/schedule';

const LangContext = createContext(null);

const SUPPORTED = ['de', 'en', 'tr', 'es'];

// The product is de-AT first. Defaulting to English put every Austrian and
// German tradesperson — the whole target audience — into a language they did
// not ask for, on a screen where the language switcher is in a menu.
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

  const changeLang = useCallback((newLang) => {
    setLang(newLang);
    localStorage.setItem('sm_lang', newLang);
  }, []);

  const t = useCallback((key, vars = {}) => {
    const str = translations[lang]?.[key] || translations.en?.[key] || key;
    return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), str);
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, changeLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
