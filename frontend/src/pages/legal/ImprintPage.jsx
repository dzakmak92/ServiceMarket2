import React from 'react';
import LegalPageLayout from './LegalPageLayout';

export default function ImprintPage() {
  return (
    <LegalPageLayout title="Imprint (Impressum)" version="1.0" lastUpdated="28 February 2026">
      <p className="lead">
        Information disclosed in accordance with § 5 Austrian E-Commerce Act (ECG) and § 25
        Austrian Media Act (MedienG).
      </p>

      <h2>Operator</h2>
      <p>
        <strong>Dienstleistungen in der automatischen Datenverarbeitung und Informationstechnik</strong><br />
        Operator: <em>[Inhaber-Name — to be filled]</em><br />
        Business address: <em>[Geschäftsadresse — to be filled]</em><br />
        Email: <a href="mailto:contact@servicemarket.at">contact@servicemarket.at</a><br />
        Website: <a href="https://servicemarket.at">https://servicemarket.at</a>
      </p>

      <h2>Trade authority</h2>
      <p><em>[Gewerbebehörde — Bezirkshauptmannschaft / Magistrat — to be filled]</em></p>

      <h2>Applicable trade regulations</h2>
      <p>
        Gewerbeordnung 1994 (GewO), available at{' '}
        <a href="https://www.ris.bka.gv.at" target="_blank" rel="noopener noreferrer">www.ris.bka.gv.at</a>.
      </p>

      <h2>Online dispute resolution</h2>
      <p>
        The EU Commission provides an Online Dispute Resolution platform at{' '}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
          ec.europa.eu/consumers/odr
        </a>. We are not obliged and not willing to participate in an alternative dispute
        resolution procedure before a consumer arbitration board.
      </p>

      <h2>Content liability</h2>
      <p>
        We carefully curate content on this Platform. Despite all efforts, we cannot guarantee the
        accuracy, completeness, or topicality of the content. Per § 17 ECG, we are not obliged to
        monitor third-party information; obligations to remove or block illegal information
        according to general laws remain unaffected.
      </p>
    </LegalPageLayout>
  );
}
