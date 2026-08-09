import React from 'react';
import LegalPageLayout from './LegalPageLayout';
import LegalDoc, { pick, tocOf } from './LegalDoc';
import { TERMS } from './content/terms';
import { useLang } from '../../contexts/LangContext';

export default function TermsPage() {
  const { lang } = useLang();
  const doc = pick(TERMS, lang);
  return (
    <LegalPageLayout
      title={doc.title}
      version="1.0-draft-2026-02-28"
      lastUpdated="2026-02-28"
      toc={tocOf(doc)}
    >
      <LegalDoc doc={doc} />
    </LegalPageLayout>
  );
}
