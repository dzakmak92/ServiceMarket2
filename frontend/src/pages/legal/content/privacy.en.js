/**
 * Privacy Policy — English, the source text the other three were translated
 * from. See `privacy.js` for how the four are assembled.
 *
 * GDPR article references, Austrian statute citations (§ 132 BAO, DSG) and the
 * names of sub-processors stay as written in every language: they identify a
 * provision, a law or a company, and a translated identifier cannot be looked
 * up.
 */
export const MAIL = 'contact@servicemarket.at';
export const DSB = 'https://www.dsb.gv.at';
export const OPERATOR =
  'Dienstleistungen in der automatischen Datenverarbeitung und Informationstechnik';

export const EN = {
  title: 'Privacy Policy',
  intro: [
    { lead: [
      'This Privacy Policy explains how ', { b: OPERATOR },
      ' (referred to here as ', { b: '"ServiceMarket"' }, ', "we", "us") collects, uses, stores and protects the personal data you provide when you use ',
      { a: 'servicemarket.at', href: 'https://servicemarket.at' },
      ' (the "Platform"). It is written to comply with the EU General Data Protection Regulation (Regulation (EU) 2016/679, "GDPR") and the Austrian Data Protection Act (Datenschutzgesetz, DSG).',
    ] },
    { note: ['Status: draft, pending review by counsel. All four language versions are translations of the English draft and none of them is binding until counsel has finalised the text. Once finalised, the German version will be the binding one.'] },
  ],
  sections: [
    { id: 'controller', heading: '1. Data controller', blocks: [{ p: [
      { b: OPERATOR }, { br: 1 },
      'Operator: ', { todo: 'Inhaber-Name — to be filled' }, { br: 1 },
      'Business address: ', { todo: 'Geschäftsadresse — to be filled' }, { br: 1 },
      'Email: ', { a: MAIL, href: `mailto:${MAIL}` }, { br: 1 },
      'We are the controller for the personal data you provide through the Platform.',
    ] }] },
    { id: 'data-we-collect', heading: '2. Data we collect', blocks: [
      { p: ['We collect the following categories of personal data, depending on how you use the Platform:'] },
      { ul: [
        [{ b: 'Account data' }, ' — name, email address, password (hashed with bcrypt), phone number, role (homeowner or tradesperson), preferred language, country, city.'],
        [{ b: 'Profile data (tradespeople)' }, ' — business name, service categories, portfolio photos, address, verification documents, hourly rate, availability, badges (Verified / Licensed / Insured).'],
        [{ b: 'Job and quote content' }, ' — job titles, descriptions, photos and PDFs you upload, quotes you send, prices, messages, booking slots.'],
        [{ b: 'Transaction data' }, ' — Stripe customer ID, payment status, contact-fee invoices, monthly billing records. We do not store your card details ourselves; Stripe is the payment processor.'],
        [{ b: 'Usage data' }, ' — login timestamps, IP address (truncated to /24), browser user-agent, push-notification subscriptions (VAPID).'],
        [{ b: 'Consent records' }, ' — which version of which policy you accepted, when, and from which IP address. Used as proof of consent under GDPR Art. 7(1).'],
      ] },
    ] },
    { id: 'how-we-use', heading: '3. How we use your data', blocks: [{ ul: [
      ['To create and authenticate your account.'],
      ['To match homeowners with relevant tradespeople (category classification, location matching).'],
      ['To provide real-time chat, push notifications and booking calendars.'],
      ['To bill contact fees and Pro subscriptions via Stripe and to issue the invoices we are legally required to issue.'],
      ['To prevent fraud, abuse and breaches of our Terms (rate limiting, detection of suspicious quotes).'],
      ['To comply with Austrian and EU legal obligations (tax records, anti-money-laundering checks on high-value bookings).'],
      ['With your explicit opt-in, to send marketing emails about new features. You can withdraw that consent at any time.'],
    ] }] },
    { id: 'legal-bases', heading: '4. Legal bases for processing (GDPR Art. 6)', blocks: [{ ul: [
      [{ b: 'Performance of a contract (Art. 6(1)(b))' }, ' — everything needed to operate the marketplace you signed up for: account, matching, messaging, payments.'],
      [{ b: 'Legal obligation (Art. 6(1)(c))' }, ' — keeping invoices for seven years (§ 132 BAO), and KYC checks where they apply.'],
      [{ b: 'Consent (Art. 6(1)(a))' }, ' — marketing emails, optional analytics cookies, translation of individual messages.'],
      [{ b: 'Legitimate interests (Art. 6(1)(f))' }, ' — narrowly: fraud prevention, aggregate analytics, improving the service and securing the Platform. You may object at any time using the contact details below.'],
    ] }] },
    { id: 'sharing', heading: '5. Sharing and sub-processors', blocks: [
      { p: ['We do not sell your personal data. We share it only with the sub-processors below, each bound by a data processing agreement:'] },
      { ul: [
        [{ b: 'Stripe Payments Europe Ltd.' }, ' (Ireland) — payment processing. We never store card details ourselves.'],
        [{ b: 'Supabase Inc.' }, ' (EU region) — the PostgreSQL database and the private object storage holding job photos, licence uploads and receipts.'],
        [{ b: 'Vercel Inc.' }, ' — application hosting and CDN. Receives the request metadata any web host receives: IP address, user-agent, requested path.'],
        [{ b: 'Email delivery provider' }, ' — transactional mail only: password resets, and the quotes and invoices you choose to send. Receives the recipient address and the contents of that message.'],
        [{ b: 'Open-Meteo' }, ' — the weather forecast shown on your calendar. Receives the coordinates of the appointment location and nothing else: no account identifier, no name, no address.'],
        [{ b: 'Web push providers (Mozilla, Google, Apple)' }, ' — only if you opt in to browser push notifications.'],
      ] },
      { p: ['This list is the current one. If it changes we update this page and, where the change is material, tell you before it takes effect.'] },
    ] },
    { id: 'transfers', heading: '6. International transfers', blocks: [{ p: [
      'Most processing happens inside the EU/EEA. Where data is transferred outside the EEA — for example hosting and push-notification infrastructure in the United States — we rely on the European Commission’s Standard Contractual Clauses together with supplementary technical measures (encryption in transit and at rest).',
    ] }] },
    { id: 'retention', heading: '7. Data retention', blocks: [{ ul: [
      ['Account and profile data — kept while your account is active; deleted within 30 days of a confirmed deletion request, after a seven-day grace period in case of mistake.'],
      ['Job, quote and message history — kept for 24 months after the related job is completed, for dispute resolution and operations.'],
      ['Invoices and tax records — seven years (§ 132 Bundesabgabenordnung, BAO).'],
      ['Consent records — kept for five years after withdrawal, as legal proof.'],
      ['Logs (server, security, audit) — 90 days, except security incidents, which we keep for up to one year.'],
      ['Inactive accounts — if you do not log in for 12 months we flag the account and, after a warning email, delete it 30 days later.'],
    ] }] },
    { id: 'security', heading: '8. Security measures', blocks: [{ ul: [
      ['TLS 1.2 or higher for all data in transit.'],
      ['AES-256 encryption at rest (Supabase-managed PostgreSQL and object storage).'],
      ['Passwords hashed with bcrypt (cost factor 12).'],
      ['JWT session tokens with refresh-token rotation.'],
      ['Role-based access control on every backend route.'],
      ['Audit logs for every administrator access to a non-administrator profile.'],
      ['Regular dependency security scans.'],
    ] }] },
    { id: 'rights', heading: '9. Your rights', blocks: [
      { p: ['Under GDPR Articles 15 to 22 you have the right to:'] },
      { ul: [
        [{ b: 'Access' }, ' the personal data we hold about you.'],
        [{ b: 'Rectify' }, ' inaccurate data — most fields are editable in your Settings.'],
        [{ b: 'Erase' }, ' your account, using the "Delete my account" button in Privacy Settings.'],
        [{ b: 'Restrict' }, ' processing in specific cases.'],
        [{ b: 'Portability' }, ' — download a machine-readable JSON copy of your data via Privacy Settings → "Download my data".'],
        [{ b: 'Object' }, ' to processing based on legitimate interests.'],
        [{ b: 'Withdraw consent' }, ' at any time, without affecting processing that was lawful before withdrawal.'],
        [{ b: 'Complain' }, ' to the Austrian Data Protection Authority (Datenschutzbehörde) if you believe we have mishandled your data.'],
      ] },
      { p: ['To exercise these rights, use our ', { a: 'data rights form', href: '/data-rights' }, ' or email ', { a: MAIL, href: `mailto:${MAIL}` }, '. We respond within 30 days.'] },
    ] },
    { id: 'cookies', heading: '10. Cookies', blocks: [
      { p: ['We use three categories of cookie. Granular consent is offered on your first visit and through the "Cookie preferences" link in the footer:'] },
      { ul: [
        [{ b: 'Essential' }, ' — login session, CSRF protection, language. Always on.'],
        [{ b: 'Analytics' }, ' — anonymous usage statistics. Opt-in.'],
        [{ b: 'Marketing' }, ' — relevant advertising on third-party sites. Opt-in, off by default.'],
      ] },
    ] },
    { id: 'children', heading: '11. Children', blocks: [{ p: [
      'The Platform is not intended for users under 16. We do not knowingly collect data from minors. If you believe we hold data about a child, please contact us so that we can delete it.',
    ] }] },
    { id: 'changes', heading: '12. Changes to this policy', blocks: [{ p: [
      'We may update this Policy as the Platform develops. Material changes are announced by in-app notification at least 14 days before they take effect. The current version and the "last updated" date are always at the top of this page.',
    ] }] },
    { id: 'contact', heading: '13. Contact', blocks: [
      { p: ['For all privacy questions and requests:', { br: 1 }, { b: 'Email: ' }, { a: MAIL, href: `mailto:${MAIL}` }] },
      { p: ['Supervisory authority: ', { a: 'Österreichische Datenschutzbehörde, Barichgasse 40-42, 1030 Wien', href: DSB }, '.'] },
    ] },
  ],
};
