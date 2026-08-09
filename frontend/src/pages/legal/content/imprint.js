/**
 * Imprint / Impressum, in four languages.
 *
 * Disclosure required by § 5 Austrian E-Commerce Act (ECG) and § 25 Austrian
 * Media Act (MedienG). Three of the required fields — operator name, business
 * address, trade authority — are still `todo` nodes and render as visible
 * amber placeholders in every language. They are not translated and must not
 * be guessed: an imprint missing them is a defect in the imprint, not in its
 * translation, and inventing plausible-looking values would hide the defect
 * rather than fix it.
 *
 * Statute names and citations (Gewerbeordnung 1994, § 5 ECG, § 25 MedienG,
 * § 17 ECG) stay in German in every language. They identify documents; a
 * translated citation cannot be looked up.
 */
const OPERATOR = 'Dienstleistungen in der automatischen Datenverarbeitung und Informationstechnik';
const MAIL = 'contact@servicemarket.at';
const SITE = 'https://servicemarket.at';
const RIS = 'https://www.ris.bka.gv.at';
const ODR = 'https://ec.europa.eu/consumers/odr';

export const IMPRINT = {
  en: {
    title: 'Imprint (Impressum)',
    intro: [{ lead: ['Information disclosed in accordance with § 5 Austrian E-Commerce Act (ECG) and § 25 Austrian Media Act (MedienG).'] }],
    sections: [
      { id: 'operator', heading: 'Operator', blocks: [{ p: [
        { b: OPERATOR }, { br: 1 },
        'Operator: ', { todo: 'Inhaber-Name — to be filled' }, { br: 1 },
        'Business address: ', { todo: 'Geschäftsadresse — to be filled' }, { br: 1 },
        'Email: ', { a: MAIL, href: `mailto:${MAIL}` }, { br: 1 },
        'Website: ', { a: SITE, href: SITE },
      ] }] },
      { id: 'authority', heading: 'Trade authority', blocks: [{ p: [
        { todo: 'Gewerbebehörde — Bezirkshauptmannschaft / Magistrat — to be filled' },
      ] }] },
      { id: 'regulations', heading: 'Applicable trade regulations', blocks: [{ p: [
        'Gewerbeordnung 1994 (GewO), available at ', { a: 'www.ris.bka.gv.at', href: RIS }, '.',
      ] }] },
      { id: 'odr', heading: 'Online dispute resolution', blocks: [{ p: [
        'The EU Commission provides an Online Dispute Resolution platform at ',
        { a: 'ec.europa.eu/consumers/odr', href: ODR },
        '. We are neither obliged nor willing to participate in dispute resolution proceedings before a consumer arbitration board.',
      ] }] },
      { id: 'liability', heading: 'Content liability', blocks: [{ p: [
        'We curate the content on this Platform carefully. Despite all care we cannot guarantee that it is accurate, complete or up to date. Under § 17 ECG we are not obliged to monitor third-party information; obligations to remove or block unlawful information under general law remain unaffected.',
      ] }] },
    ],
  },

  de: {
    title: 'Impressum',
    intro: [{ lead: ['Offenlegung gemäß § 5 E-Commerce-Gesetz (ECG) und § 25 Mediengesetz (MedienG).'] }],
    sections: [
      { id: 'operator', heading: 'Betreiber', blocks: [{ p: [
        { b: OPERATOR }, { br: 1 },
        'Inhaber: ', { todo: 'Inhaber-Name — to be filled' }, { br: 1 },
        'Geschäftsanschrift: ', { todo: 'Geschäftsadresse — to be filled' }, { br: 1 },
        'E-Mail: ', { a: MAIL, href: `mailto:${MAIL}` }, { br: 1 },
        'Website: ', { a: SITE, href: SITE },
      ] }] },
      { id: 'authority', heading: 'Gewerbebehörde', blocks: [{ p: [
        { todo: 'Gewerbebehörde — Bezirkshauptmannschaft / Magistrat — to be filled' },
      ] }] },
      { id: 'regulations', heading: 'Anwendbare Gewerbevorschriften', blocks: [{ p: [
        'Gewerbeordnung 1994 (GewO), abrufbar unter ', { a: 'www.ris.bka.gv.at', href: RIS }, '.',
      ] }] },
      { id: 'odr', heading: 'Online-Streitbeilegung', blocks: [{ p: [
        'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit: ',
        { a: 'ec.europa.eu/consumers/odr', href: ODR },
        '. Wir sind weder verpflichtet noch bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
      ] }] },
      { id: 'liability', heading: 'Haftung für Inhalte', blocks: [{ p: [
        'Die Inhalte dieser Plattform werden sorgfältig gepflegt. Für Richtigkeit, Vollständigkeit und Aktualität kann trotz aller Sorgfalt keine Gewähr übernommen werden. Nach § 17 ECG sind wir nicht verpflichtet, fremde Informationen zu überwachen; Verpflichtungen zur Entfernung oder Sperrung rechtswidriger Informationen nach den allgemeinen Gesetzen bleiben unberührt.',
      ] }] },
    ],
  },

  tr: {
    title: 'Künye (Impressum)',
    intro: [{ lead: ['Avusturya E-Ticaret Kanunu (ECG) § 5 ve Avusturya Medya Kanunu (MedienG) § 25 uyarınca yapılan bilgilendirme.'] }],
    sections: [
      { id: 'operator', heading: 'İşletmeci', blocks: [{ p: [
        { b: OPERATOR }, { br: 1 },
        'Sahibi: ', { todo: 'Inhaber-Name — to be filled' }, { br: 1 },
        'İş adresi: ', { todo: 'Geschäftsadresse — to be filled' }, { br: 1 },
        'E-posta: ', { a: MAIL, href: `mailto:${MAIL}` }, { br: 1 },
        'Web sitesi: ', { a: SITE, href: SITE },
      ] }] },
      { id: 'authority', heading: 'Ticaret makamı', blocks: [{ p: [
        { todo: 'Gewerbebehörde — Bezirkshauptmannschaft / Magistrat — to be filled' },
      ] }] },
      { id: 'regulations', heading: 'Geçerli ticaret mevzuatı', blocks: [{ p: [
        'Gewerbeordnung 1994 (GewO), şu adresten erişilebilir: ', { a: 'www.ris.bka.gv.at', href: RIS }, '.',
      ] }] },
      { id: 'odr', heading: 'Çevrimiçi uyuşmazlık çözümü', blocks: [{ p: [
        'Avrupa Komisyonu bir çevrimiçi uyuşmazlık çözüm platformu sunmaktadır: ',
        { a: 'ec.europa.eu/consumers/odr', href: ODR },
        '. Tüketici tahkim kurulu önünde uyuşmazlık çözüm sürecine katılma yükümlülüğümüz yoktur ve katılmaya istekli değiliz.',
      ] }] },
      { id: 'liability', heading: 'İçerik sorumluluğu', blocks: [{ p: [
        'Bu platformdaki içerikler özenle hazırlanmaktadır. Tüm özene rağmen içeriğin doğruluğu, eksiksizliği ve güncelliği garanti edilemez. ECG § 17 uyarınca üçüncü taraf bilgilerini izleme yükümlülüğümüz yoktur; genel mevzuat uyarınca hukuka aykırı bilgilerin kaldırılması veya engellenmesine ilişkin yükümlülükler saklıdır.',
      ] }] },
    ],
  },

  es: {
    title: 'Aviso legal (Impressum)',
    intro: [{ lead: ['Información facilitada conforme al § 5 de la Ley austriaca de comercio electrónico (ECG) y al § 25 de la Ley austriaca de medios (MedienG).'] }],
    sections: [
      { id: 'operator', heading: 'Titular', blocks: [{ p: [
        { b: OPERATOR }, { br: 1 },
        'Titular: ', { todo: 'Inhaber-Name — to be filled' }, { br: 1 },
        'Domicilio social: ', { todo: 'Geschäftsadresse — to be filled' }, { br: 1 },
        'Correo electrónico: ', { a: MAIL, href: `mailto:${MAIL}` }, { br: 1 },
        'Sitio web: ', { a: SITE, href: SITE },
      ] }] },
      { id: 'authority', heading: 'Autoridad competente', blocks: [{ p: [
        { todo: 'Gewerbebehörde — Bezirkshauptmannschaft / Magistrat — to be filled' },
      ] }] },
      { id: 'regulations', heading: 'Normativa aplicable', blocks: [{ p: [
        'Gewerbeordnung 1994 (GewO), disponible en ', { a: 'www.ris.bka.gv.at', href: RIS }, '.',
      ] }] },
      { id: 'odr', heading: 'Resolución de litigios en línea', blocks: [{ p: [
        'La Comisión Europea facilita una plataforma de resolución de litigios en línea en ',
        { a: 'ec.europa.eu/consumers/odr', href: ODR },
        '. No estamos obligados ni dispuestos a participar en un procedimiento de resolución de litigios ante una junta arbitral de consumo.',
      ] }] },
      { id: 'liability', heading: 'Responsabilidad por los contenidos', blocks: [{ p: [
        'Los contenidos de esta plataforma se elaboran con cuidado. Pese a ello, no podemos garantizar su exactitud, integridad ni actualidad. Conforme al § 17 ECG no estamos obligados a supervisar información de terceros; las obligaciones de retirar o bloquear información ilícita conforme a la legislación general no se ven afectadas.',
      ] }] },
    ],
  },
};
