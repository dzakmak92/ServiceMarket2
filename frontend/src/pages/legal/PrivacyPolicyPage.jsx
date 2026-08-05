import React from 'react';
import LegalPageLayout from './LegalPageLayout';

const TOC = [
  { id: 'controller', label: '1. Data controller' },
  { id: 'data-we-collect', label: '2. Data we collect' },
  { id: 'how-we-use', label: '3. How we use your data' },
  { id: 'legal-bases', label: '4. Legal bases' },
  { id: 'sharing', label: '5. Sharing & sub-processors' },
  { id: 'transfers', label: '6. International transfers' },
  { id: 'retention', label: '7. Data retention' },
  { id: 'security', label: '8. Security measures' },
  { id: 'rights', label: '9. Your rights' },
  { id: 'cookies', label: '10. Cookies' },
  { id: 'children', label: '11. Children' },
  { id: 'changes', label: '12. Changes to this policy' },
  { id: 'contact', label: '13. Contact' },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      version="1.0-draft-2026-02-28"
      lastUpdated="28 February 2026"
      toc={TOC}
    >
      <p className="lead">
        This Privacy Policy explains how <strong>Dienstleistungen in der automatischen Datenverarbeitung und Informationstechnik</strong>{' '}
        (referred to in this document as <strong>"ServiceMarket"</strong>, "we", "us") collects, uses,
        stores and protects the personal data you provide when you use{' '}
        <a href="https://servicemarket.at">servicemarket.at</a> (the "Platform"). It is written to
        comply with the EU General Data Protection Regulation (Regulation (EU) 2016/679, "GDPR") and
        the Austrian Data Protection Act (Datenschutzgesetz – DSG).
      </p>
      <p className="text-sm text-ink-muted italic">
        Note: This is a draft pending review by counsel. A legally binding German translation will be
        published once finalised. In case of conflict between languages, the German version will
        prevail.
      </p>

      <h2 id="controller">1. Data controller</h2>
      <p>
        <strong>Dienstleistungen in der automatischen Datenverarbeitung und Informationstechnik</strong><br />
        Operator: <em>[Inhaber-Name — to be filled]</em><br />
        Business address: <em>[Geschäftsadresse — to be filled]</em><br />
        Email: <a href="mailto:contact@servicemarket.at">contact@servicemarket.at</a><br />
        We are the data controller for personal data you provide through the Platform.
      </p>

      <h2 id="data-we-collect">2. Data we collect</h2>
      <p>We collect the following categories of personal data, depending on how you use the Platform:</p>
      <ul>
        <li><strong>Account data</strong> — name, email, password (hashed with bcrypt), phone, role
          (homeowner / tradesperson), preferred language, country, city.</li>
        <li><strong>Profile data (for tradespersons)</strong> — business name, service categories,
          portfolio photos, address, verification documents, hourly rate, availability, badges
          (Verified / Licensed / Insured).</li>
        <li><strong>Job & quote content</strong> — job titles, descriptions, photos & PDFs you upload,
          quotes you send, prices, messages, booking slots.</li>
        <li><strong>Transactional data</strong> — Stripe customer ID, payment status, contact-fee
          invoices, monthly billing records. We do not store your card details ourselves — Stripe is
          the payment processor.</li>
        <li><strong>Usage data</strong> — login timestamps, IP address (truncated to /24), browser
          user-agent, push-notification subscriptions (VAPID).</li>
        <li><strong>Consent records</strong> — what version of which policy you accepted, when, from
          which IP. Used as proof of consent under GDPR Art. 7(1).</li>
      </ul>

      <h2 id="how-we-use">3. How we use your data</h2>
      <ul>
        <li>To create and authenticate your account.</li>
        <li>To match homeowners with relevant tradespersons (AI category classification, location matching).</li>
        <li>To deliver real-time chat, push notifications and booking calendars.</li>
        <li>To bill contact fees and pro subscriptions via Stripe and issue legally-required invoices.</li>
        <li>To prevent fraud, abuse, and breach of our Terms (e.g. rate-limiting, suspicious quote detection).</li>
        <li>To comply with Austrian/EU legal obligations (tax records, anti-money-laundering checks for high-value bookings).</li>
        <li>With your explicit opt-in, to send marketing emails about new features. You can withdraw consent any time.</li>
      </ul>

      <h2 id="legal-bases">4. Legal bases for processing (GDPR Art. 6)</h2>
      <ul>
        <li><strong>Contract performance (Art. 6(1)(b))</strong> — everything needed to operate the
          marketplace you signed up for: account, matching, messaging, payments.</li>
        <li><strong>Legal obligation (Art. 6(1)(c))</strong> — keeping invoices for 7 years
          (§ 132 BAO), KYC where applicable.</li>
        <li><strong>Consent (Art. 6(1)(a))</strong> — marketing emails, optional analytics cookies,
          translation of individual messages.</li>
        <li><strong>Legitimate interest (Art. 6(1)(f))</strong> — narrowly, for fraud prevention,
          aggregate analytics, service improvement and securing the Platform. You can object at any
          time via the contact below.</li>
      </ul>

      <h2 id="sharing">5. Sharing & sub-processors</h2>
      <p>We do not sell your personal data. We share it only with the following sub-processors,
        each bound by a Data Processing Agreement:</p>
      <ul>
        <li><strong>Stripe Payments Europe Ltd.</strong> (Ireland) — payment processing. We never
          store card details ourselves.</li>
        <li><strong>Supabase Inc.</strong> (EU region) — the PostgreSQL database and the private
          object storage that holds job photos, licence uploads and receipts.</li>
        <li><strong>Vercel Inc.</strong> — application hosting and CDN. Receives the request
          metadata any web host receives: IP address, user-agent, requested path.</li>
        <li><strong>Email delivery provider</strong> — transactional mail only: password resets,
          and the quotes and invoices you choose to send. Receives the recipient address and the
          contents of that message.</li>
        <li><strong>Open-Meteo</strong> — the weather forecast shown on your calendar. Receives the
          coordinates of the appointment location and nothing else: no account identifier, no name,
          no address.</li>
        <li><strong>Web push providers (Mozilla / Google / Apple)</strong> — when you opt in to
          browser push notifications.</li>
      </ul>
      <p>This list is the current one. If it changes we update this page and, where the change is
        material, tell you before it takes effect.</p>

      <h2 id="transfers">6. International transfers</h2>
      <p>Most processing happens in the EU/EEA. Where data is transferred outside the EEA
        (e.g. hosting and push-notification infrastructure in the US), we rely on the European Commission's Standard
        Contractual Clauses (SCCs) and supplementary technical measures (encryption in transit and
        at rest).</p>

      <h2 id="retention">7. Data retention</h2>
      <ul>
        <li>Account &amp; profile data — kept while your account is active; deleted within 30 days of
          a confirmed deletion request (after a 7-day grace period in case of mistake).</li>
        <li>Job / quote / message history — kept for 24 months after the related job is completed,
          for dispute resolution and operations.</li>
        <li>Invoices &amp; tax records — 7 years (§ 132 Austrian Federal Fiscal Code, BAO).</li>
        <li>Consent records — kept for 5 years after withdrawal as legal proof.</li>
        <li>Logs (server, security, audit) — 90 days, except security incidents which we keep up to 1 year.</li>
        <li>Inactive accounts — if you don't log in for 12 months we flag the account and, after a
          warning email, delete it after 30 days.</li>
      </ul>

      <h2 id="security">8. Security measures</h2>
      <ul>
        <li>TLS 1.2+ for all data in transit.</li>
        <li>AES-256 encryption at rest (Supabase-managed PostgreSQL and object storage).</li>
        <li>Passwords hashed with bcrypt (cost factor 12).</li>
        <li>JWT-based session tokens with refresh-token rotation.</li>
        <li>Role-based access control on every backend route.</li>
        <li>Audit logs for every administrator access to a non-admin profile.</li>
        <li>Regular dependency security scans.</li>
      </ul>

      <h2 id="rights">9. Your rights</h2>
      <p>Under GDPR Articles 15-22 you have the right to:</p>
      <ul>
        <li><strong>Access</strong> the personal data we hold about you.</li>
        <li><strong>Rectify</strong> inaccurate data (most fields are editable in your Settings).</li>
        <li><strong>Erase</strong> your account — use the "Delete my account" button in Privacy Settings.</li>
        <li><strong>Restrict</strong> processing in specific cases.</li>
        <li><strong>Portability</strong> — download a machine-readable JSON of your data via
          Privacy Settings → "Download my data".</li>
        <li><strong>Object</strong> to processing based on legitimate interest.</li>
        <li><strong>Withdraw consent</strong> at any time without affecting prior lawful processing.</li>
        <li><strong>Complain</strong> to the Austrian Data Protection Authority (Datenschutzbehörde)
          if you believe we mishandled your data.</li>
      </ul>
      <p>To exercise these rights, use our <a href="/data-rights">data rights form</a> or email{' '}
        <a href="mailto:contact@servicemarket.at">contact@servicemarket.at</a>. We respond within 30 days.</p>

      <h2 id="cookies">10. Cookies</h2>
      <p>We use three categories of cookies, granular consent is offered on first visit and via the
        "Cookie preferences" link in the footer:</p>
      <ul>
        <li><strong>Essential</strong> — login session, CSRF, language. Always on.</li>
        <li><strong>Analytics</strong> — anonymous usage statistics. Opt-in.</li>
        <li><strong>Marketing</strong> — relevant ads on third-party sites. Opt-in, off by default.</li>
      </ul>

      <h2 id="children">11. Children</h2>
      <p>The Platform is not intended for users under 16. We do not knowingly collect data from
        minors. If you believe we hold data about a child, please contact us so we can delete it.</p>

      <h2 id="changes">12. Changes to this policy</h2>
      <p>We may update this Policy as the Platform evolves. Material changes will be announced via
        in-app notification at least 14 days before they take effect. The current version and "last
        updated" date are always at the top of this page.</p>

      <h2 id="contact">13. Contact</h2>
      <p>For all privacy questions and requests:<br />
        <strong>Email:</strong> <a href="mailto:contact@servicemarket.at">contact@servicemarket.at</a>
      </p>
      <p>Supervisory authority: <a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer">
        Österreichische Datenschutzbehörde, Barichgasse 40-42, 1030 Wien
      </a>.</p>
    </LegalPageLayout>
  );
}
