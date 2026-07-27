import React from 'react';
import LegalPageLayout from './LegalPageLayout';

const TOC = [
  { id: 'acceptance', label: '1. Acceptance' },
  { id: 'eligibility', label: '2. Eligibility' },
  { id: 'service', label: '3. The service' },
  { id: 'accounts', label: '4. Accounts' },
  { id: 'fees', label: '5. Fees & subscriptions' },
  { id: 'conduct', label: '6. User conduct' },
  { id: 'content', label: '7. User content' },
  { id: 'disputes-between-users', label: '8. Disputes between users' },
  { id: 'liability', label: '9. Liability' },
  { id: 'warranty', label: '10. Warranty disclaimer' },
  { id: 'termination', label: '11. Termination' },
  { id: 'governing-law', label: '12. Governing law' },
  { id: 'contact', label: '13. Contact' },
];

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      version="1.0-draft-2026-02-28"
      lastUpdated="28 February 2026"
      toc={TOC}
    >
      <p className="lead">
        These Terms of Service ("Terms") govern your use of <strong>servicemarket.at</strong> (the
        "Platform") operated by <strong>Dienstleistungen in der automatischen Datenverarbeitung und
        Informationstechnik</strong> ("ServiceMarket", "we", "us"). By creating an account or
        otherwise using the Platform, you agree to these Terms.
      </p>
      <p className="text-sm text-ink-muted italic">
        Note: This is a draft pending review by counsel. A legally binding German translation will
        be published once finalised.
      </p>

      <h2 id="acceptance">1. Acceptance</h2>
      <p>
        By ticking the "I accept the Terms of Service and Privacy Policy" checkbox during
        registration, or by continuing to use the Platform, you confirm that you have read,
        understood and agreed to these Terms.
      </p>

      <h2 id="eligibility">2. Eligibility</h2>
      <p>
        You must be at least 18 years old (or the age of majority in your jurisdiction) to use the
        Platform. Tradespersons must hold any business registrations, licenses or insurance
        required by Austrian law for the services they offer.
      </p>

      <h2 id="service">3. The service</h2>
      <p>
        ServiceMarket is a two-sided marketplace connecting homeowners ("Homeowners") with vetted
        tradespersons ("Pros"). Homeowners post jobs; Pros submit quotes; the parties chat and book
        appointments through the Platform. ServiceMarket facilitates this connection — we are
        <strong> not party to the work contract</strong> between Homeowner and Pro.
      </p>

      <h2 id="accounts">4. Accounts</h2>
      <ul>
        <li>You must register with a valid email and provide truthful information.</li>
        <li>You are responsible for keeping your password confidential and for all activity under your account.</li>
        <li>You may have only one personal account. Businesses may have one company account managed by an authorised individual.</li>
        <li>You may delete your account at any time from Privacy Settings; a 7-day grace period applies.</li>
      </ul>

      <h2 id="fees">5. Fees & subscriptions</h2>
      <ul>
        <li>Posting a job is free for Homeowners.</li>
        <li>Pros pay a contact fee (per accepted quote) and may optionally subscribe to the Pro plan (€29/month). Pro benefits are listed on the <a href="/billing">Billing</a> page.</li>
        <li>Contact fees are aggregated monthly and invoiced on the 25th of each month.</li>
        <li>Payments are processed by Stripe. Subscriptions auto-renew unless cancelled before the renewal date.</li>
        <li>EU consumer cancellation rights (Fern- und Auswärtsgeschäfte-Gesetz – FAGG) apply where mandatory.</li>
      </ul>

      <h2 id="conduct">6. User conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Post false, misleading, or fraudulent jobs or quotes.</li>
        <li>Bypass the Platform's chat to circumvent contact fees.</li>
        <li>Send spam, harassing or unlawful messages.</li>
        <li>Upload content that infringes third-party rights or is illegal in Austria.</li>
        <li>Probe, scan, or attempt to compromise the security of the Platform.</li>
        <li>Use automated scripts or bots without our written consent.</li>
      </ul>
      <p>Violations may result in immediate account suspension and reporting to law enforcement.</p>

      <h2 id="content">7. User content</h2>
      <p>
        You retain ownership of everything you upload (photos, descriptions, messages). By
        uploading, you grant ServiceMarket a non-exclusive, royalty-free, worldwide licence to
        store, process, display and distribute your content solely for the purpose of operating
        the Platform and providing the service to you and the other party in the transaction.
      </p>

      <h2 id="disputes-between-users">8. Disputes between users</h2>
      <p>
        ServiceMarket is a marketplace, not a contractor. The work contract is between the
        Homeowner and the Pro. We do not guarantee work quality, completion, or payment between
        the parties. We provide messaging history and booking records to assist with dispute
        resolution upon a valid legal request.
      </p>

      <h2 id="liability">9. Liability</h2>
      <p>
        To the maximum extent permitted by law, ServiceMarket's total liability for any claim
        arising out of or relating to the Platform shall not exceed the greater of (a) the total
        fees you paid us in the 12 months preceding the claim, or (b) EUR 100.
      </p>
      <p>
        We are not liable for indirect, incidental, consequential or punitive damages, including
        lost profits or data loss, except in cases of intentional misconduct or gross negligence as
        required by Austrian law (§ 1295 ABGB).
      </p>

      <h2 id="warranty">10. Warranty disclaimer</h2>
      <p>
        The Platform is provided "as is" and "as available". We make no guarantee that it will be
        uninterrupted, error-free, or that all bugs will be fixed. Mandatory consumer warranty
        rights under Austrian law remain unaffected.
      </p>

      <h2 id="termination">11. Termination</h2>
      <p>
        We may suspend or terminate your account for material breach of these Terms with prior
        notice where reasonable. You may close your account at any time. Surviving clauses (fees
        owed, liability limits, governing law) remain in force after termination.
      </p>

      <h2 id="governing-law">12. Governing law & jurisdiction</h2>
      <p>
        These Terms are governed by Austrian law, excluding its conflict-of-laws rules and the UN
        Convention on Contracts for the International Sale of Goods (CISG). Exclusive venue for any
        dispute is the competent court for the first district of Vienna (Bezirksgericht Innere
        Stadt Wien) — unless mandatory consumer-protection rules grant you a more favourable forum.
      </p>
      <p>
        EU consumers may also use the European Commission's{' '}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
          Online Dispute Resolution platform
        </a>.
      </p>

      <h2 id="contact">13. Contact</h2>
      <p>
        Questions about these Terms?{' '}
        <a href="mailto:contact@servicemarket.at">contact@servicemarket.at</a>
      </p>
    </LegalPageLayout>
  );
}
