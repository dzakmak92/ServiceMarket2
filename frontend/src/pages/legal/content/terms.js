/**
 * Terms of Service, in four languages.
 *
 * Drafted in English; the other three are translations of that draft. None of
 * the four has been reviewed by counsel, and the note at the top of every
 * version says so — see `DRAFT_NOTE` below, which is the one paragraph in
 * this file that must stay accurate as the document's status changes.
 *
 * Austrian statute citations (FAGG, § 1295 ABGB, GewO, Bezirksgericht Innere
 * Stadt Wien) stay in German in every language. They identify a law or a
 * court; a translated citation cannot be looked up and a translated court
 * name is not the court.
 */
const MAIL = 'contact@servicemarket.at';
const ODR = 'https://ec.europa.eu/consumers/odr';
const OPERATOR = 'Dienstleistungen in der automatischen Datenverarbeitung und Informationstechnik';

export const TERMS = {
  en: {
    title: 'Terms of Service',
    intro: [
      { lead: [
        'These Terms of Service ("Terms") govern your use of ', { b: 'servicemarket.at' },
        ' (the "Platform"), operated by ', { b: OPERATOR }, ' ("ServiceMarket", "we", "us"). ',
        'By creating an account or otherwise using the Platform, you agree to these Terms.',
      ] },
      { note: ['Status: draft, pending review by counsel. All four language versions are translations of the English draft and none of them is binding until counsel has finalised the text. Once finalised, the German version will be the binding one.'] },
    ],
    sections: [
      { id: 'acceptance', heading: '1. Acceptance', blocks: [{ p: [
        'By ticking the "I accept the Terms of Service and Privacy Policy" box during registration, or by continuing to use the Platform, you confirm that you have read, understood and agreed to these Terms.',
      ] }] },
      { id: 'eligibility', heading: '2. Eligibility', blocks: [{ p: [
        'You must be at least 18 years old (or the age of majority in your jurisdiction) to use the Platform. Tradespeople must hold any business registration, licence or insurance required under Austrian law for the services they offer.',
      ] }] },
      { id: 'service', heading: '3. The service', blocks: [{ p: [
        'ServiceMarket is a two-sided marketplace connecting homeowners ("Homeowners") with vetted tradespeople ("Pros"). Homeowners post jobs; Pros submit quotes; the parties chat and book appointments through the Platform. ServiceMarket facilitates that connection — we are ',
        { b: 'not a party to the work contract' }, ' between Homeowner and Pro.',
      ] }] },
      { id: 'accounts', heading: '4. Accounts', blocks: [{ ul: [
        ['You must register with a valid email address and provide truthful information.'],
        ['You are responsible for keeping your password confidential and for all activity under your account.'],
        ['You may hold only one personal account. A business may hold one company account, managed by an authorised individual.'],
        ['You may delete your account at any time from Privacy Settings; a seven-day grace period applies.'],
      ] }] },
      { id: 'fees', heading: '5. Fees and subscriptions', blocks: [{ ul: [
        ['Posting a job is free for Homeowners.'],
        ['Pros pay a contact fee per accepted quote and may optionally subscribe to the Pro plan (€29/month). The Pro benefits are listed on the ', { a: 'Billing', href: '/billing' }, ' page.'],
        ['Contact fees are aggregated monthly and invoiced on the 25th of each month.'],
        ['Payments are processed by Stripe. Subscriptions renew automatically unless cancelled before the renewal date.'],
        ['EU consumer cancellation rights (Fern- und Auswärtsgeschäfte-Gesetz, FAGG) apply where mandatory.'],
      ] }] },
      { id: 'conduct', heading: '6. User conduct', blocks: [
        { p: ['You agree not to:'] },
        { ul: [
          ['post false, misleading or fraudulent jobs or quotes;'],
          ['bypass the Platform’s chat in order to avoid contact fees;'],
          ['send spam, harassing or unlawful messages;'],
          ['upload content that infringes third-party rights or is unlawful in Austria;'],
          ['probe, scan or attempt to compromise the security of the Platform;'],
          ['use automated scripts or bots without our written consent.'],
        ] },
        { p: ['Violations may lead to immediate suspension of the account and to a report to law enforcement.'] },
      ] },
      { id: 'content', heading: '7. User content', blocks: [{ p: [
        'You retain ownership of everything you upload — photos, descriptions, messages. By uploading it you grant ServiceMarket a non-exclusive, royalty-free, worldwide licence to store, process, display and transmit that content solely in order to operate the Platform and provide the service to you and to the other party in the transaction.',
      ] }] },
      { id: 'disputes-between-users', heading: '8. Disputes between users', blocks: [{ p: [
        'ServiceMarket is a marketplace, not a contractor. The work contract is between Homeowner and Pro. We do not guarantee the quality of the work, its completion, or payment between the parties. On a valid legal request we make message history and booking records available to assist in resolving a dispute.',
      ] }] },
      { id: 'liability', heading: '9. Liability', blocks: [
        { p: ['To the maximum extent permitted by law, ServiceMarket’s total liability for any claim arising out of or relating to the Platform is limited to the greater of (a) the total fees you paid us in the twelve months before the claim, or (b) EUR 100.'] },
        { p: ['We are not liable for indirect, incidental, consequential or punitive damages, including lost profit or lost data, except in cases of intent or gross negligence, as required by Austrian law (§ 1295 ABGB).'] },
      ] },
      { id: 'warranty', heading: '10. Warranty disclaimer', blocks: [{ p: [
        'The Platform is provided "as is" and "as available". We do not warrant that it will be uninterrupted or free of errors, or that every defect will be fixed. Mandatory consumer warranty rights under Austrian law remain unaffected.',
      ] }] },
      { id: 'termination', heading: '11. Termination', blocks: [{ p: [
        'We may suspend or terminate your account for material breach of these Terms, with prior notice where that is reasonable. You may close your account at any time. Surviving clauses — fees owed, limits of liability, governing law — remain in force after termination.',
      ] }] },
      { id: 'governing-law', heading: '12. Governing law and jurisdiction', blocks: [
        { p: ['These Terms are governed by Austrian law, excluding its conflict-of-laws rules and the UN Convention on Contracts for the International Sale of Goods (CISG). The exclusive venue for any dispute is the court competent for the first district of Vienna (Bezirksgericht Innere Stadt Wien), unless mandatory consumer-protection rules give you a more favourable forum.'] },
        { p: ['EU consumers may also use the European Commission’s ', { a: 'Online Dispute Resolution platform', href: ODR }, '.'] },
      ] },
      { id: 'contact', heading: '13. Contact', blocks: [{ p: [
        'Questions about these Terms: ', { a: MAIL, href: `mailto:${MAIL}` },
      ] }] },
    ],
  },

  de: {
    title: 'Allgemeine Geschäftsbedingungen',
    intro: [
      { lead: [
        'Diese Allgemeinen Geschäftsbedingungen ("AGB") regeln Ihre Nutzung von ', { b: 'servicemarket.at' },
        ' (die "Plattform"), betrieben von ', { b: OPERATOR }, ' ("ServiceMarket", "wir", "uns"). ',
        'Mit der Erstellung eines Kontos oder der sonstigen Nutzung der Plattform stimmen Sie diesen AGB zu.',
      ] },
      { note: ['Status: Entwurf, juristische Prüfung ausständig. Alle vier Sprachfassungen sind Übersetzungen des englischen Entwurfs; keine davon ist verbindlich, solange der Text nicht anwaltlich finalisiert ist. Nach der Finalisierung ist die deutsche Fassung die verbindliche.'] },
    ],
    sections: [
      { id: 'acceptance', heading: '1. Zustimmung', blocks: [{ p: [
        'Mit dem Anhaken des Kästchens "Ich akzeptiere die AGB und die Datenschutzerklärung" bei der Registrierung oder mit der weiteren Nutzung der Plattform bestätigen Sie, diese AGB gelesen, verstanden und akzeptiert zu haben.',
      ] }] },
      { id: 'eligibility', heading: '2. Voraussetzungen', blocks: [{ p: [
        'Sie müssen mindestens 18 Jahre alt sein (bzw. in Ihrem Rechtsraum volljährig), um die Plattform zu nutzen. Betriebe müssen über die für ihre Leistungen nach österreichischem Recht erforderlichen Gewerbeberechtigungen, Befugnisse und Versicherungen verfügen.',
      ] }] },
      { id: 'service', heading: '3. Die Leistung', blocks: [{ p: [
        'ServiceMarket ist ein zweiseitiger Marktplatz, der Auftraggeber ("Auftraggeber") mit geprüften Betrieben ("Betriebe") zusammenbringt. Auftraggeber stellen Aufträge ein, Betriebe legen Angebote, die Parteien kommunizieren und vereinbaren Termine über die Plattform. ServiceMarket vermittelt diese Verbindung — wir sind ',
        { b: 'nicht Vertragspartei des Werkvertrags' }, ' zwischen Auftraggeber und Betrieb.',
      ] }] },
      { id: 'accounts', heading: '4. Konten', blocks: [{ ul: [
        ['Die Registrierung erfordert eine gültige E-Mail-Adresse und wahrheitsgemäße Angaben.'],
        ['Sie sind für die Geheimhaltung Ihres Passworts und für sämtliche Aktivitäten unter Ihrem Konto verantwortlich.'],
        ['Sie dürfen nur ein persönliches Konto führen. Ein Unternehmen darf ein Firmenkonto führen, das von einer berechtigten Person verwaltet wird.'],
        ['Sie können Ihr Konto jederzeit in den Datenschutz-Einstellungen löschen; es gilt eine Frist von sieben Tagen.'],
      ] }] },
      { id: 'fees', heading: '5. Entgelte und Abonnements', blocks: [{ ul: [
        ['Das Einstellen eines Auftrags ist für Auftraggeber kostenlos.'],
        ['Betriebe zahlen je angenommenem Angebot ein Kontaktentgelt und können optional das Pro-Abo abschließen (29 €/Monat). Die Pro-Leistungen sind auf der Seite ', { a: 'Abrechnung', href: '/billing' }, ' aufgeführt.'],
        ['Kontaktentgelte werden monatlich zusammengefasst und am 25. jedes Monats in Rechnung gestellt.'],
        ['Zahlungen werden über Stripe abgewickelt. Abonnements verlängern sich automatisch, sofern sie nicht vor dem Verlängerungstermin gekündigt werden.'],
        ['Verbraucherrechtliche Rücktrittsrechte nach dem Fern- und Auswärtsgeschäfte-Gesetz (FAGG) gelten, soweit sie zwingend sind.'],
      ] }] },
      { id: 'conduct', heading: '6. Nutzerverhalten', blocks: [
        { p: ['Sie verpflichten sich, Folgendes zu unterlassen:'] },
        { ul: [
          ['falsche, irreführende oder betrügerische Aufträge oder Angebote einzustellen;'],
          ['den Chat der Plattform zu umgehen, um Kontaktentgelte zu vermeiden;'],
          ['Spam, belästigende oder rechtswidrige Nachrichten zu senden;'],
          ['Inhalte hochzuladen, die Rechte Dritter verletzen oder in Österreich rechtswidrig sind;'],
          ['die Sicherheit der Plattform zu testen, zu scannen oder zu kompromittieren;'],
          ['automatisierte Skripte oder Bots ohne unsere schriftliche Zustimmung einzusetzen.'],
        ] },
        { p: ['Verstöße können zur sofortigen Sperre des Kontos und zur Anzeige bei den Strafverfolgungsbehörden führen.'] },
      ] },
      { id: 'content', heading: '7. Nutzerinhalte', blocks: [{ p: [
        'Sie behalten das Eigentum an allem, was Sie hochladen — Fotos, Beschreibungen, Nachrichten. Mit dem Hochladen räumen Sie ServiceMarket ein nicht ausschließliches, unentgeltliches, weltweites Nutzungsrecht ein, diese Inhalte zu speichern, zu verarbeiten, anzuzeigen und zu übermitteln, ausschließlich zum Betrieb der Plattform und zur Erbringung der Leistung Ihnen und der jeweils anderen Partei gegenüber.',
      ] }] },
      { id: 'disputes-between-users', heading: '8. Streitigkeiten zwischen Nutzern', blocks: [{ p: [
        'ServiceMarket ist ein Marktplatz, kein ausführender Betrieb. Der Werkvertrag besteht zwischen Auftraggeber und Betrieb. Wir übernehmen keine Gewähr für die Qualität der Arbeit, deren Fertigstellung oder die Zahlung zwischen den Parteien. Auf ein berechtigtes rechtliches Verlangen stellen wir Nachrichtenverlauf und Termindaten zur Unterstützung der Streitbeilegung bereit.',
      ] }] },
      { id: 'liability', heading: '9. Haftung', blocks: [
        { p: ['Soweit gesetzlich zulässig, ist die Gesamthaftung von ServiceMarket für Ansprüche aus oder im Zusammenhang mit der Plattform auf den höheren der folgenden Beträge begrenzt: (a) die Summe der Entgelte, die Sie uns in den zwölf Monaten vor dem Anspruch gezahlt haben, oder (b) 100 EUR.'] },
        { p: ['Für mittelbare Schäden, Folgeschäden, Zufallsschäden oder Strafschadenersatz einschließlich entgangenem Gewinn oder Datenverlust haften wir nicht, ausgenommen bei Vorsatz und grober Fahrlässigkeit, wie nach österreichischem Recht zwingend vorgesehen (§ 1295 ABGB).'] },
      ] },
      { id: 'warranty', heading: '10. Gewährleistungsausschluss', blocks: [{ p: [
        'Die Plattform wird "wie besehen" und "wie verfügbar" bereitgestellt. Wir sichern weder einen unterbrechungsfreien noch einen fehlerfreien Betrieb zu und auch nicht, dass jeder Mangel behoben wird. Zwingende verbraucherrechtliche Gewährleistungsansprüche nach österreichischem Recht bleiben unberührt.',
      ] }] },
      { id: 'termination', heading: '11. Beendigung', blocks: [{ p: [
        'Wir können Ihr Konto bei einem wesentlichen Verstoß gegen diese AGB sperren oder beenden, mit vorheriger Ankündigung, soweit dies zumutbar ist. Sie können Ihr Konto jederzeit schließen. Fortgeltende Bestimmungen — offene Entgelte, Haftungsgrenzen, anwendbares Recht — bleiben nach Beendigung in Kraft.',
      ] }] },
      { id: 'governing-law', heading: '12. Anwendbares Recht und Gerichtsstand', blocks: [
        { p: ['Diese AGB unterliegen österreichischem Recht unter Ausschluss der Kollisionsnormen und des UN-Kaufrechts (CISG). Ausschließlicher Gerichtsstand für Streitigkeiten ist das Bezirksgericht Innere Stadt Wien, sofern nicht zwingende Verbraucherschutzbestimmungen einen günstigeren Gerichtsstand vorsehen.'] },
        { p: ['Verbraucher in der EU können auch die ', { a: 'Online-Streitbeilegungsplattform', href: ODR }, ' der Europäischen Kommission nutzen.'] },
      ] },
      { id: 'contact', heading: '13. Kontakt', blocks: [{ p: [
        'Fragen zu diesen AGB: ', { a: MAIL, href: `mailto:${MAIL}` },
      ] }] },
    ],
  },

  tr: {
    title: 'Kullanım Koşulları',
    intro: [
      { lead: [
        'Bu Kullanım Koşulları ("Koşullar"), ', { b: OPERATOR }, ' ("ServiceMarket", "biz") tarafından işletilen ',
        { b: 'servicemarket.at' }, ' ("Platform") kullanımınızı düzenler. ',
        'Hesap oluşturarak veya Platformu başka bir şekilde kullanarak bu Koşulları kabul etmiş olursunuz.',
      ] },
      { note: ['Durum: taslak, hukuki inceleme bekliyor. Dört dil sürümünün tamamı İngilizce taslağın çevirisidir ve metin hukuk müşaviri tarafından nihai hâle getirilene kadar hiçbiri bağlayıcı değildir. Nihai hâle geldiğinde bağlayıcı sürüm Almanca sürüm olacaktır.'] },
    ],
    sections: [
      { id: 'acceptance', heading: '1. Kabul', blocks: [{ p: [
        'Kayıt sırasında "Kullanım Koşullarını ve Gizlilik Politikasını kabul ediyorum" kutusunu işaretleyerek veya Platformu kullanmaya devam ederek bu Koşulları okuduğunuzu, anladığınızı ve kabul ettiğinizi onaylarsınız.',
      ] }] },
      { id: 'eligibility', heading: '2. Uygunluk', blocks: [{ p: [
        'Platformu kullanmak için en az 18 yaşında (veya bulunduğunuz ülkede reşit) olmalısınız. Ustalar, sundukları hizmetler için Avusturya hukukunun gerektirdiği işletme kaydına, ruhsata ve sigortaya sahip olmalıdır.',
      ] }] },
      { id: 'service', heading: '3. Hizmet', blocks: [{ p: [
        'ServiceMarket, ev sahiplerini ("Ev Sahipleri") denetimden geçmiş ustalarla ("Ustalar") buluşturan çift taraflı bir pazar yeridir. Ev Sahipleri iş ilanı verir, Ustalar teklif sunar, taraflar Platform üzerinden yazışır ve randevu oluşturur. ServiceMarket bu bağlantıyı sağlar — Ev Sahibi ile Usta arasındaki ',
        { b: 'eser sözleşmesinin tarafı değiliz' }, '.',
      ] }] },
      { id: 'accounts', heading: '4. Hesaplar', blocks: [{ ul: [
        ['Kayıt için geçerli bir e-posta adresi ve doğru bilgiler gereklidir.'],
        ['Şifrenizin gizliliğinden ve hesabınız altındaki tüm işlemlerden siz sorumlusunuz.'],
        ['Yalnızca bir kişisel hesap tutabilirsiniz. Bir işletme, yetkili bir kişi tarafından yönetilen bir kurumsal hesap tutabilir.'],
        ['Hesabınızı istediğiniz zaman Gizlilik Ayarları’ndan silebilirsiniz; yedi günlük bir bekleme süresi uygulanır.'],
      ] }] },
      { id: 'fees', heading: '5. Ücretler ve abonelikler', blocks: [{ ul: [
        ['Ev Sahipleri için iş ilanı vermek ücretsizdir.'],
        ['Ustalar, kabul edilen her teklif için bir iletişim ücreti öder ve isteğe bağlı olarak Pro aboneliğine geçebilir (29 €/ay). Pro avantajları ', { a: 'Faturalandırma', href: '/billing' }, ' sayfasında listelenmiştir.'],
        ['İletişim ücretleri aylık olarak toplanır ve her ayın 25’inde faturalandırılır.'],
        ['Ödemeler Stripe üzerinden işlenir. Abonelikler, yenileme tarihinden önce iptal edilmedikçe otomatik olarak yenilenir.'],
        ['AB tüketici cayma hakları (Fern- und Auswärtsgeschäfte-Gesetz, FAGG) emredici olduğu ölçüde geçerlidir.'],
      ] }] },
      { id: 'conduct', heading: '6. Kullanıcı davranışı', blocks: [
        { p: ['Aşağıdakileri yapmamayı kabul edersiniz:'] },
        { ul: [
          ['yanlış, yanıltıcı veya hileli iş ilanı ya da teklif yayımlamak;'],
          ['iletişim ücretlerinden kaçınmak için Platform sohbetini atlatmak;'],
          ['spam, taciz edici veya hukuka aykırı mesajlar göndermek;'],
          ['üçüncü kişilerin haklarını ihlal eden veya Avusturya’da hukuka aykırı içerik yüklemek;'],
          ['Platformun güvenliğini yoklamak, taramak veya tehlikeye atmaya çalışmak;'],
          ['yazılı iznimiz olmadan otomatik betikler veya botlar kullanmak.'],
        ] },
        { p: ['İhlaller, hesabın derhâl askıya alınmasına ve kolluk kuvvetlerine bildirimde bulunulmasına yol açabilir.'] },
      ] },
      { id: 'content', heading: '7. Kullanıcı içeriği', blocks: [{ p: [
        'Yüklediğiniz her şeyin — fotoğraflar, açıklamalar, mesajlar — mülkiyeti sizde kalır. Yükleyerek ServiceMarket’e, yalnızca Platformu işletmek ve hizmeti size ve işlemdeki diğer tarafa sunmak amacıyla bu içeriği saklama, işleme, görüntüleme ve iletme konusunda münhasır olmayan, telifsiz, dünya çapında bir lisans vermiş olursunuz.',
      ] }] },
      { id: 'disputes-between-users', heading: '8. Kullanıcılar arası uyuşmazlıklar', blocks: [{ p: [
        'ServiceMarket bir pazar yeridir, yüklenici değildir. Eser sözleşmesi Ev Sahibi ile Usta arasındadır. İşin kalitesini, tamamlanmasını veya taraflar arasındaki ödemeyi garanti etmeyiz. Geçerli bir hukuki talep üzerine, uyuşmazlığın çözümüne yardımcı olmak için mesaj geçmişini ve randevu kayıtlarını sunarız.',
      ] }] },
      { id: 'liability', heading: '9. Sorumluluk', blocks: [
        { p: ['Yasaların izin verdiği azami ölçüde, ServiceMarket’in Platformdan kaynaklanan veya Platformla ilgili herhangi bir talebe ilişkin toplam sorumluluğu, şunlardan yüksek olanıyla sınırlıdır: (a) talepten önceki on iki ayda bize ödediğiniz ücretlerin toplamı veya (b) 100 EUR.'] },
        { p: ['Kâr kaybı veya veri kaybı dâhil olmak üzere dolaylı, arızi, sonuç niteliğindeki veya cezai zararlardan sorumlu değiliz; Avusturya hukukunun emrettiği üzere kast ve ağır ihmal hâlleri saklıdır (§ 1295 ABGB).'] },
      ] },
      { id: 'warranty', heading: '10. Garanti reddi', blocks: [{ p: [
        'Platform "olduğu gibi" ve "mevcut olduğu şekilde" sunulur. Kesintisiz veya hatasız çalışacağını ya da her kusurun giderileceğini taahhüt etmeyiz. Avusturya hukuku uyarınca emredici tüketici garanti hakları saklıdır.',
      ] }] },
      { id: 'termination', heading: '11. Sona erme', blocks: [{ p: [
        'Bu Koşulların esaslı ihlali hâlinde hesabınızı askıya alabilir veya sonlandırabiliriz; makul olduğu ölçüde önceden bildirimde bulunuruz. Hesabınızı istediğiniz zaman kapatabilirsiniz. Devam eden hükümler — ödenmemiş ücretler, sorumluluk sınırları, uygulanacak hukuk — sona ermeden sonra da yürürlükte kalır.',
      ] }] },
      { id: 'governing-law', heading: '12. Uygulanacak hukuk ve yetkili mahkeme', blocks: [
        { p: ['Bu Koşullar, kanunlar ihtilafı kuralları ve Milletlerarası Mal Satımına İlişkin Sözleşmeler Hakkında Birleşmiş Milletler Antlaşması (CISG) hariç olmak üzere Avusturya hukukuna tabidir. Uyuşmazlıklarda münhasır yetkili mahkeme Bezirksgericht Innere Stadt Wien’dir; emredici tüketici koruma kuralları size daha lehe bir mahkeme tanımadıkça.'] },
        { p: ['AB tüketicileri ayrıca Avrupa Komisyonu’nun ', { a: 'Çevrimiçi Uyuşmazlık Çözüm platformunu', href: ODR }, ' kullanabilir.'] },
      ] },
      { id: 'contact', heading: '13. İletişim', blocks: [{ p: [
        'Bu Koşullar hakkındaki sorular: ', { a: MAIL, href: `mailto:${MAIL}` },
      ] }] },
    ],
  },

  es: {
    title: 'Términos del servicio',
    intro: [
      { lead: [
        'Estos Términos del servicio ("Términos") regulan su uso de ', { b: 'servicemarket.at' },
        ' (la "Plataforma"), operada por ', { b: OPERATOR }, ' ("ServiceMarket", "nosotros"). ',
        'Al crear una cuenta o utilizar de cualquier otro modo la Plataforma, acepta estos Términos.',
      ] },
      { note: ['Estado: borrador, pendiente de revisión jurídica. Las cuatro versiones lingüísticas son traducciones del borrador en inglés y ninguna es vinculante mientras el texto no haya sido finalizado por asesoría jurídica. Una vez finalizado, la versión alemana será la vinculante.'] },
    ],
    sections: [
      { id: 'acceptance', heading: '1. Aceptación', blocks: [{ p: [
        'Al marcar la casilla "Acepto los Términos del servicio y la Política de privacidad" durante el registro, o al seguir utilizando la Plataforma, confirma que ha leído, entendido y aceptado estos Términos.',
      ] }] },
      { id: 'eligibility', heading: '2. Requisitos', blocks: [{ p: [
        'Debe tener al menos 18 años (o la mayoría de edad en su jurisdicción) para utilizar la Plataforma. Los profesionales deben disponer del alta de actividad, las licencias y los seguros que exija la legislación austriaca para los servicios que ofrecen.',
      ] }] },
      { id: 'service', heading: '3. El servicio', blocks: [{ p: [
        'ServiceMarket es un mercado de dos lados que conecta a propietarios ("Propietarios") con profesionales verificados ("Profesionales"). Los Propietarios publican trabajos, los Profesionales envían presupuestos y las partes se comunican y concretan citas a través de la Plataforma. ServiceMarket facilita esa conexión: ',
        { b: 'no somos parte del contrato de obra' }, ' entre Propietario y Profesional.',
      ] }] },
      { id: 'accounts', heading: '4. Cuentas', blocks: [{ ul: [
        ['Debe registrarse con una dirección de correo válida y facilitar información veraz.'],
        ['Es responsable de mantener la confidencialidad de su contraseña y de toda actividad realizada con su cuenta.'],
        ['Solo puede tener una cuenta personal. Una empresa puede tener una cuenta corporativa gestionada por una persona autorizada.'],
        ['Puede eliminar su cuenta en cualquier momento desde Ajustes de privacidad; se aplica un periodo de gracia de siete días.'],
      ] }] },
      { id: 'fees', heading: '5. Tarifas y suscripciones', blocks: [{ ul: [
        ['Publicar un trabajo es gratuito para los Propietarios.'],
        ['Los Profesionales pagan una tarifa de contacto por cada presupuesto aceptado y pueden suscribirse opcionalmente al plan Pro (29 €/mes). Las ventajas Pro figuran en la página de ', { a: 'Facturación', href: '/billing' }, '.'],
        ['Las tarifas de contacto se agrupan mensualmente y se facturan el día 25 de cada mes.'],
        ['Los pagos se procesan a través de Stripe. Las suscripciones se renuevan automáticamente salvo cancelación antes de la fecha de renovación.'],
        ['Los derechos de desistimiento del consumidor de la UE (Fern- und Auswärtsgeschäfte-Gesetz, FAGG) se aplican cuando son imperativos.'],
      ] }] },
      { id: 'conduct', heading: '6. Conducta del usuario', blocks: [
        { p: ['Se compromete a no:'] },
        { ul: [
          ['publicar trabajos o presupuestos falsos, engañosos o fraudulentos;'],
          ['eludir el chat de la Plataforma para evitar las tarifas de contacto;'],
          ['enviar spam ni mensajes acosadores o ilícitos;'],
          ['subir contenido que vulnere derechos de terceros o sea ilícito en Austria;'],
          ['sondear, escanear o intentar comprometer la seguridad de la Plataforma;'],
          ['utilizar scripts automatizados o bots sin nuestro consentimiento por escrito.'],
        ] },
        { p: ['Las infracciones pueden dar lugar a la suspensión inmediata de la cuenta y a su comunicación a las autoridades.'] },
      ] },
      { id: 'content', heading: '7. Contenido del usuario', blocks: [{ p: [
        'Usted conserva la propiedad de todo lo que sube: fotos, descripciones, mensajes. Al subirlo, concede a ServiceMarket una licencia no exclusiva, gratuita y mundial para almacenar, procesar, mostrar y transmitir ese contenido con la única finalidad de operar la Plataforma y prestarle el servicio a usted y a la otra parte de la operación.',
      ] }] },
      { id: 'disputes-between-users', heading: '8. Conflictos entre usuarios', blocks: [{ p: [
        'ServiceMarket es un mercado, no un contratista. El contrato de obra se celebra entre Propietario y Profesional. No garantizamos la calidad del trabajo, su finalización ni el pago entre las partes. Ante un requerimiento legal válido, facilitamos el historial de mensajes y los registros de citas para ayudar a resolver el conflicto.',
      ] }] },
      { id: 'liability', heading: '9. Responsabilidad', blocks: [
        { p: ['En la máxima medida permitida por la ley, la responsabilidad total de ServiceMarket por cualquier reclamación derivada de la Plataforma o relacionada con ella se limita a la mayor de las siguientes cantidades: (a) el total de las tarifas que nos haya abonado en los doce meses anteriores a la reclamación, o (b) 100 EUR.'] },
        { p: ['No respondemos de daños indirectos, incidentales, consecuenciales ni punitivos, incluidos el lucro cesante o la pérdida de datos, salvo en casos de dolo o culpa grave, conforme exige la legislación austriaca (§ 1295 ABGB).'] },
      ] },
      { id: 'warranty', heading: '10. Exclusión de garantías', blocks: [{ p: [
        'La Plataforma se ofrece "tal cual" y "según disponibilidad". No garantizamos que funcione de forma ininterrumpida ni sin errores, ni que se corrija todo defecto. Los derechos de garantía imperativos del consumidor conforme a la legislación austriaca no se ven afectados.',
      ] }] },
      { id: 'termination', heading: '11. Extinción', blocks: [{ p: [
        'Podemos suspender o cancelar su cuenta por incumplimiento sustancial de estos Términos, con aviso previo cuando sea razonable. Puede cerrar su cuenta en cualquier momento. Las cláusulas que sobreviven —tarifas pendientes, límites de responsabilidad, ley aplicable— siguen vigentes tras la extinción.',
      ] }] },
      { id: 'governing-law', heading: '12. Ley aplicable y jurisdicción', blocks: [
        { p: ['Estos Términos se rigen por la legislación austriaca, con exclusión de sus normas de conflicto de leyes y de la Convención de las Naciones Unidas sobre los Contratos de Compraventa Internacional de Mercaderías (CISG). El fuero exclusivo para cualquier litigio es el tribunal competente del primer distrito de Viena (Bezirksgericht Innere Stadt Wien), salvo que normas imperativas de protección del consumidor le otorguen un fuero más favorable.'] },
        { p: ['Los consumidores de la UE también pueden utilizar la ', { a: 'plataforma de resolución de litigios en línea', href: ODR }, ' de la Comisión Europea.'] },
      ] },
      { id: 'contact', heading: '13. Contacto', blocks: [{ p: [
        'Preguntas sobre estos Términos: ', { a: MAIL, href: `mailto:${MAIL}` },
      ] }] },
    ],
  },
};
