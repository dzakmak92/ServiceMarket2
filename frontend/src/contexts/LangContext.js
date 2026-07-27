import React, { createContext, useContext, useState, useCallback } from 'react';
import translations from '../translations';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem('sm_lang');
    return stored || 'en';
  });

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
