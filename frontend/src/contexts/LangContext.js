import React, { createContext, useContext, useState, useCallback } from 'react';
import translations from '../translations';

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
