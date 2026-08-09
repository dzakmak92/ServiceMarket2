import React from 'react';
import LegalPageLayout from './LegalPageLayout';
import LegalDoc, { pick } from './LegalDoc';
import { IMPRINT } from './content/imprint';
import { useLang } from '../../contexts/LangContext';

export default function ImprintPage() {
  const { lang } = useLang();
  const doc = pick(IMPRINT, lang);
  // No table of contents: five short sections read faster as a page than as a
  // page with a sidebar pointing at it.
  return (
    <LegalPageLayout title={doc.title} version="1.0" lastUpdated="2026-02-28">
      <LegalDoc doc={doc} />
    </LegalPageLayout>
  );
}
