/** Privacy Policy — Turkish. Translation of the English source in privacy.en.js. */
import { MAIL, DSB, OPERATOR } from './privacy.en.js';

export const TR = {
  title: 'Gizlilik Politikası',
  intro: [
    { lead: [
      'Bu Gizlilik Politikası, ', { b: OPERATOR },
      ' (burada ', { b: '“ServiceMarket”' }, ', “biz”) şirketinin, ',
      { a: 'servicemarket.at', href: 'https://servicemarket.at' },
      ' (“Platform”) kullanımınız sırasında sağladığınız kişisel verileri nasıl topladığını, kullandığını, sakladığını ve koruduğunu açıklar. AB Genel Veri Koruma Tüzüğü ((AB) 2016/679 sayılı Tüzük, “GDPR”) ve Avusturya Veri Koruma Kanunu (Datenschutzgesetz, DSG) ile uyumlu olacak şekilde hazırlanmıştır.',
    ] },
    { note: ['Durum: taslak, hukuki inceleme bekliyor. Dört dil sürümünün tamamı İngilizce taslağın çevirisidir ve metin hukuk müşaviri tarafından nihai hâle getirilene kadar hiçbiri bağlayıcı değildir. Nihai hâle geldiğinde bağlayıcı sürüm Almanca sürüm olacaktır.'] },
  ],
  sections: [
    { id: 'controller', heading: '1. Veri sorumlusu', blocks: [{ p: [
      { b: OPERATOR }, { br: 1 },
      'Sahibi: ', { todo: 'Inhaber-Name — to be filled' }, { br: 1 },
      'İş adresi: ', { todo: 'Geschäftsadresse — to be filled' }, { br: 1 },
      'E-posta: ', { a: MAIL, href: `mailto:${MAIL}` }, { br: 1 },
      'Platform üzerinden sağladığınız kişisel verilerin sorumlusu biziz.',
    ] }] },
    { id: 'data-we-collect', heading: '2. Topladığımız veriler', blocks: [
      { p: ['Platformu nasıl kullandığınıza bağlı olarak aşağıdaki kişisel veri kategorilerini toplarız:'] },
      { ul: [
        [{ b: 'Hesap verileri' }, ' — ad, e-posta adresi, şifre (bcrypt ile özetlenmiş), telefon numarası, rol (ev sahibi veya usta), tercih edilen dil, ülke, şehir.'],
        [{ b: 'Profil verileri (ustalar)' }, ' — işletme adı, hizmet kategorileri, portföy fotoğrafları, adres, doğrulama belgeleri, saatlik ücret, müsaitlik, rozetler (Doğrulanmış / Ruhsatlı / Sigortalı).'],
        [{ b: 'İş ve teklif içeriği' }, ' — iş başlıkları, açıklamalar, yüklediğiniz fotoğraf ve PDF’ler, gönderdiğiniz teklifler, fiyatlar, mesajlar, randevu aralıkları.'],
        [{ b: 'İşlem verileri' }, ' — Stripe müşteri kimliği, ödeme durumu, iletişim ücreti faturaları, aylık faturalandırma kayıtları. Kart bilgilerinizi kendimiz saklamayız; ödeme kuruluşu Stripe’tır.'],
        [{ b: 'Kullanım verileri' }, ' — oturum açma zamanları, IP adresi (/24 olarak kısaltılmış), tarayıcı user-agent bilgisi, anlık bildirim abonelikleri (VAPID).'],
        [{ b: 'Onay kayıtları' }, ' — hangi metnin hangi sürümünü, ne zaman ve hangi IP adresinden kabul ettiğiniz. GDPR m. 7(1) uyarınca onay kanıtı olarak kullanılır.'],
      ] },
    ] },
    { id: 'how-we-use', heading: '3. Verilerinizi nasıl kullanırız', blocks: [{ ul: [
      ['Hesabınızı oluşturmak ve doğrulamak için.'],
      ['Ev sahiplerini uygun ustalarla eşleştirmek için (kategori sınıflandırması, konum eşleştirmesi).'],
      ['Gerçek zamanlı sohbet, anlık bildirim ve randevu takvimi sunmak için.'],
      ['İletişim ücretlerini ve Pro aboneliklerini Stripe üzerinden faturalandırmak ve yasal olarak zorunlu faturaları düzenlemek için.'],
      ['Dolandırıcılığı, kötüye kullanımı ve Koşullarımızın ihlalini önlemek için (hız sınırlama, şüpheli teklif tespiti).'],
      ['Avusturya ve AB hukuku yükümlülüklerine uymak için (vergi kayıtları, yüksek tutarlı randevularda kara para aklamayı önleme kontrolleri).'],
      ['Açık onayınızla, yeni özellikler hakkında pazarlama e-postaları göndermek için. Bu onayı istediğiniz zaman geri alabilirsiniz.'],
    ] }] },
    { id: 'legal-bases', heading: '4. İşlemenin hukuki dayanakları (GDPR m. 6)', blocks: [{ ul: [
      [{ b: 'Sözleşmenin ifası (m. 6(1)(b))' }, ' — kaydolduğunuz pazar yerinin işletilmesi için gereken her şey: hesap, eşleştirme, mesajlaşma, ödemeler.'],
      [{ b: 'Hukuki yükümlülük (m. 6(1)(c))' }, ' — faturaların yedi yıl saklanması (§ 132 BAO) ve uygulanabildiği ölçüde KYC kontrolleri.'],
      [{ b: 'Açık rıza (m. 6(1)(a))' }, ' — pazarlama e-postaları, isteğe bağlı analiz çerezleri, tekil mesajların çevirisi.'],
      [{ b: 'Meşru menfaat (m. 6(1)(f))' }, ' — dar kapsamda: dolandırıcılığın önlenmesi, toplu analizler, hizmetin iyileştirilmesi ve Platformun güvenliği. Aşağıdaki iletişim bilgileri üzerinden istediğiniz zaman itiraz edebilirsiniz.'],
    ] }] },
    { id: 'sharing', heading: '5. Paylaşım ve alt işleyenler', blocks: [
      { p: ['Kişisel verilerinizi satmayız. Yalnızca, her biri bir veri işleme sözleşmesiyle bağlı olan aşağıdaki alt işleyenlerle paylaşırız:'] },
      { ul: [
        [{ b: 'Stripe Payments Europe Ltd.' }, ' (İrlanda) — ödeme işleme. Kart bilgilerini asla kendimiz saklamayız.'],
        [{ b: 'Supabase Inc.' }, ' (AB bölgesi) — PostgreSQL veritabanı ve iş fotoğraflarını, ruhsat yüklemelerini ve fişleri barındıran özel nesne deposu.'],
        [{ b: 'Vercel Inc.' }, ' — uygulama barındırma ve CDN. Her web barındırıcısının aldığı istek meta verilerini alır: IP adresi, user-agent, istenen yol.'],
        [{ b: 'E-posta gönderim sağlayıcısı' }, ' — yalnızca işlemsel postalar: şifre sıfırlama ile göndermeyi seçtiğiniz teklifler ve faturalar. Alıcı adresini ve o mesajın içeriğini alır.'],
        [{ b: 'Open-Meteo' }, ' — takviminizde gösterilen hava durumu tahmini. Yalnızca randevu konumunun koordinatlarını alır: hesap kimliği, ad veya adres almaz.'],
        [{ b: 'Web push sağlayıcıları (Mozilla, Google, Apple)' }, ' — yalnızca tarayıcı anlık bildirimlerini açtığınızda.'],
      ] },
      { p: ['Bu liste güncel hâlidir. Değişmesi hâlinde bu sayfayı güncelleriz ve değişiklik esaslıysa yürürlüğe girmeden önce sizi bilgilendiririz.'] },
    ] },
    { id: 'transfers', heading: '6. Uluslararası aktarımlar', blocks: [{ p: [
      'İşlemenin büyük bölümü AB/AEA içinde gerçekleşir. Verilerin AEA dışına aktarıldığı hâllerde — örneğin ABD’deki barındırma ve anlık bildirim altyapısı — Avrupa Komisyonu’nun Standart Sözleşme Maddelerine ve tamamlayıcı teknik önlemlere (aktarım sırasında ve durağan hâlde şifreleme) dayanırız.',
    ] }] },
    { id: 'retention', heading: '7. Saklama süreleri', blocks: [{ ul: [
      ['Hesap ve profil verileri — hesabınız aktif olduğu sürece; onaylanmış silme talebinden sonra 30 gün içinde, hata ihtimaline karşı yedi günlük bekleme süresinin ardından silinir.'],
      ['İş, teklif ve mesaj geçmişi — ilgili iş tamamlandıktan sonra 24 ay, uyuşmazlık çözümü ve işletme amacıyla.'],
      ['Faturalar ve vergi kayıtları — yedi yıl (§ 132 Bundesabgabenordnung, BAO).'],
      ['Onay kayıtları — geri alınmasından sonra beş yıl, kanıt olarak.'],
      ['Günlükler (sunucu, güvenlik, denetim) — 90 gün; güvenlik olayları bir yıla kadar saklanır.'],
      ['Etkin olmayan hesaplar — 12 ay oturum açmazsanız hesabı işaretler ve bir uyarı e-postasından 30 gün sonra sileriz.'],
    ] }] },
    { id: 'security', heading: '8. Güvenlik önlemleri', blocks: [{ ul: [
      ['Aktarımdaki tüm veriler için TLS 1.2 veya üzeri.'],
      ['Durağan hâlde AES-256 şifreleme (Supabase tarafından yönetilen PostgreSQL ve nesne deposu).'],
      ['Şifreler bcrypt ile özetlenir (maliyet katsayısı 12).'],
      ['Yenileme belirteci döngüsüyle JWT oturum belirteçleri.'],
      ['Her arka uç uç noktasında rol tabanlı erişim denetimi.'],
      ['Bir yöneticinin yönetici olmayan bir profile her erişimi için denetim günlüğü.'],
      ['Bağımlılıklar için düzenli güvenlik taramaları.'],
    ] }] },
    { id: 'rights', heading: '9. Haklarınız', blocks: [
      { p: ['GDPR’nin 15 ilâ 22. maddeleri uyarınca şu haklara sahipsiniz:'] },
      { ul: [
        [{ b: 'Erişim' }, ' — hakkınızda tuttuğumuz kişisel verilere.'],
        [{ b: 'Düzeltme' }, ' — yanlış verilerin düzeltilmesi; alanların çoğunu Ayarlar’dan kendiniz değiştirebilirsiniz.'],
        [{ b: 'Silme' }, ' — Gizlilik Ayarları’ndaki “Hesabımı sil” düğmesiyle hesabınızın silinmesi.'],
        [{ b: 'Kısıtlama' }, ' — belirli hâllerde işlemenin kısıtlanması.'],
        [{ b: 'Taşınabilirlik' }, ' — Gizlilik Ayarları → “Verilerimi indir” yoluyla verilerinizin makine tarafından okunabilir JSON kopyasının indirilmesi.'],
        [{ b: 'İtiraz' }, ' — meşru menfaate dayanan işlemelere itiraz.'],
        [{ b: 'Onayı geri alma' }, ' — istediğiniz zaman, geri almadan önceki hukuka uygun işlemeyi etkilemeksizin.'],
        [{ b: 'Şikâyet' }, ' — verilerinizin hatalı işlendiğini düşünüyorsanız Avusturya Veri Koruma Kurumu’na (Datenschutzbehörde) şikâyette bulunma.'],
      ] },
      { p: ['Bu hakları kullanmak için ', { a: 'veri hakları formumuzu', href: '/data-rights' }, ' kullanın veya ', { a: MAIL, href: `mailto:${MAIL}` }, ' adresine yazın. 30 gün içinde yanıt veririz.'] },
    ] },
    { id: 'cookies', heading: '10. Çerezler', blocks: [
      { p: ['Üç çerez kategorisi kullanırız. Ayrıntılı onay ilk ziyarette ve alt bilgideki “Çerez tercihleri” bağlantısıyla sunulur:'] },
      { ul: [
        [{ b: 'Zorunlu' }, ' — oturum, CSRF koruması, dil. Her zaman açık.'],
        [{ b: 'Analiz' }, ' — anonim kullanım istatistikleri. Onaya bağlı.'],
        [{ b: 'Pazarlama' }, ' — üçüncü taraf sitelerde ilgili reklamlar. Onaya bağlı, varsayılan olarak kapalı.'],
      ] },
    ] },
    { id: 'children', heading: '11. Çocuklar', blocks: [{ p: [
      'Platform 16 yaşından küçük kullanıcılara yönelik değildir. Bilerek reşit olmayanlardan veri toplamayız. Bir çocuğa ait veri tuttuğumuzu düşünüyorsanız, silebilmemiz için lütfen bizimle iletişime geçin.',
    ] }] },
    { id: 'changes', heading: '12. Bu politikadaki değişiklikler', blocks: [{ p: [
      'Platform geliştikçe bu Politikayı güncelleyebiliriz. Esaslı değişiklikleri, yürürlüğe girmesinden en az 14 gün önce uygulama içi bildirimle duyururuz. Güncel sürüm ve “son güncelleme” tarihi her zaman bu sayfanın başında yer alır.',
    ] }] },
    { id: 'contact', heading: '13. İletişim', blocks: [
      { p: ['Gizlilikle ilgili tüm soru ve talepler için:', { br: 1 }, { b: 'E-posta: ' }, { a: MAIL, href: `mailto:${MAIL}` }] },
      { p: ['Denetim makamı: ', { a: 'Österreichische Datenschutzbehörde, Barichgasse 40-42, 1030 Wien', href: DSB }, '.'] },
    ] },
  ],
};
