import React from 'react';
import LegalPageLayout from './LegalPageLayout';
import LegalDoc, { pick, tocOf } from './LegalDoc';
import { PRIVACY } from './content/privacy';
import { useLang } from '../../contexts/LangContext';

export default function PrivacyPolicyPage() {
  const { lang } = useLang();
  const doc = pick(PRIVACY, lang);
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
