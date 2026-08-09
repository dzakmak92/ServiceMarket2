"""The catalogue in the other three languages.

The interface has been translated into four languages since it was built, and
the catalogue has been in one. So an English-speaking tradesperson opening the
estimator got English chrome around German data: *How much · 400 m2 · our
figure*, then **Zustand der Fläche · Bestand, gepflegt**, then *in the price*.
Every label the API sends — job titles, question labels, answer options, quote
line descriptions, assumption notes — carried a single `label_de` and nothing
else. 1,453 distinct strings, none of them translated.

**Keyed by the German string, not by an id.** The catalogue is generated from
`tools/catalogue/`, and its keys are internal (`renovierung_leer`,
`stage.c1`); the German text is the thing a translator is actually translating.
Keying on it also means a shared label — `Zugang zum Grundstück` appears on
twenty garden templates — is translated once and stays consistent. And when a
German label is reworded, its translation drops out rather than silently
staying attached to text that no longer says the same thing;
`test_catalogue_i18n.py` fails on the gap.

**German is not stored here.** It lives in the catalogue, which is the source.
`translate` returns the German unchanged when a string has no entry yet, so an
untranslated label degrades to the language the whole product is written in
rather than to a key or a blank.
"""
from __future__ import annotations

LANGS = ("en", "tr", "es")

# ── The two shared questions ────────────────────────────────────────────
#
# Asked on every job, so they are the most-read strings in the catalogue and
# the first that had to be right. See `tools/catalogue/axes.py` for why each
# trade asks them in different words.

AXES: dict[str, dict[str, str]] = {
    # Question labels
    "Zustand des Objekts": {
        "en": "Condition of the property", "tr": "Nesnenin durumu",
        "es": "Estado del inmueble"},
    "Zustand der Wohnung": {
        "en": "Condition of the flat", "tr": "Konutun durumu",
        "es": "Estado de la vivienda"},
    "Zustand der Fläche": {
        "en": "Condition of the ground", "tr": "Alanın durumu",
        "es": "Estado del terreno"},
    "Umfeld am Gebäude": {
        "en": "Surroundings of the building", "tr": "Bina çevresi",
        "es": "Entorno del edificio"},
    "Zustand des Fahrzeugs": {
        "en": "Condition of the vehicle", "tr": "Aracın durumu",
        "es": "Estado del vehículo"},
    "Verschmutzungsgrad": {
        "en": "Level of soiling", "tr": "Kirlilik derecesi",
        "es": "Grado de suciedad"},
    "Zustand des Möbels": {
        "en": "Condition of the piece", "tr": "Mobilyanın durumu",
        "es": "Estado del mueble"},
    "Zugang": {"en": "Access", "tr": "Erişim", "es": "Acceso"},
    "Zugang zum Grundstück": {
        "en": "Access to the property", "tr": "Arsaya erişim",
        "es": "Acceso a la parcela"},
    "Zugang zur Arbeitsfläche": {
        "en": "Access to the work area", "tr": "Çalışma alanına erişim",
        "es": "Acceso a la zona de trabajo"},
    "Wo wird gearbeitet": {
        "en": "Where the work happens", "tr": "Çalışma nerede yapılacak",
        "es": "Dónde se trabaja"},

    # Condition options — building
    "Neubau, besenrein": {
        "en": "New build, broom-clean", "tr": "Yeni yapı, süpürülmüş",
        "es": "Obra nueva, limpieza de escoba"},
    "Renovierung, leerstehend": {
        "en": "Renovation, unoccupied", "tr": "Tadilat, boş",
        "es": "Reforma, desocupado"},
    "Renovierung, bewohnt": {
        "en": "Renovation, occupied", "tr": "Tadilat, oturuluyor",
        "es": "Reforma, ocupado"},
    "Altbau, bewohnt": {
        "en": "Period building, occupied", "tr": "Eski yapı, oturuluyor",
        "es": "Edificio antiguo, ocupado"},
    "Neubau, leer": {
        "en": "New build, empty", "tr": "Yeni yapı, boş",
        "es": "Obra nueva, vacío"},
    "Renovierung, Wohnung leer": {
        "en": "Renovation, flat empty", "tr": "Tadilat, konut boş",
        "es": "Reforma, vivienda vacía"},

    # Condition options — ground
    "Neuanlage, frei": {
        "en": "New planting, clear", "tr": "Yeni düzenleme, açık",
        "es": "Obra nueva, despejado"},
    "Bestand, gepflegt": {
        "en": "Established and maintained", "tr": "Mevcut, bakımlı",
        "es": "Existente y cuidado"},
    "Bestand, verwildert": {
        "en": "Established, overgrown", "tr": "Mevcut, bakımsız",
        "es": "Existente, descuidado"},
    "Stark verwildert, Wurzelwerk": {
        "en": "Badly overgrown, roots", "tr": "Çok bakımsız, kök yapısı",
        "es": "Muy invadido, raíces"},

    # Condition options — building envelope
    "Baustelle, frei": {
        "en": "Building site, clear", "tr": "Şantiye, açık",
        "es": "Obra, despejado"},
    "Bestand, frei zugänglich": {
        "en": "Existing, freely accessible", "tr": "Mevcut, serbest erişimli",
        "es": "Existente, de libre acceso"},
    "Bewohnt, Balkone und Fenster in Nutzung": {
        "en": "Occupied, balconies and windows in use",
        "tr": "Oturuluyor, balkon ve pencereler kullanımda",
        "es": "Ocupado, balcones y ventanas en uso"},
    "Altbestand, empfindliches Umfeld": {
        "en": "Old fabric, sensitive surroundings",
        "tr": "Eski yapı, hassas çevre",
        "es": "Construcción antigua, entorno delicado"},

    # Condition options — vehicle
    "Neuwertig": {"en": "As new", "tr": "Sıfır ayarında", "es": "Como nuevo"},
    "Gepflegt, normaler Zustand": {
        "en": "Well kept, normal condition", "tr": "Bakımlı, normal durumda",
        "es": "Cuidado, estado normal"},
    "Ältere Ausführung, Verschleiß sichtbar": {
        "en": "Older model, visible wear", "tr": "Eski model, aşınma görünür",
        "es": "Modelo antiguo, desgaste visible"},
    "Stark korrodiert oder festgefahren": {
        "en": "Badly corroded or seized", "tr": "Ağır korozyonlu veya sıkışmış",
        "es": "Muy corroído o agarrotado"},

    # Condition options — soiling
    "Leicht, regelmäßig gepflegt": {
        "en": "Light, regularly cleaned", "tr": "Hafif, düzenli temizlenen",
        "es": "Ligera, con limpieza regular"},
    "Normal, üblicher Gebrauch": {
        "en": "Normal, ordinary use", "tr": "Normal, olağan kullanım",
        "es": "Normal, uso corriente"},
    "Stark verschmutzt": {
        "en": "Heavily soiled", "tr": "Çok kirli", "es": "Muy sucio"},
    "Extrem, Verkrustung, Ruß oder Fett": {
        "en": "Extreme — encrusted, soot or grease",
        "tr": "Aşırı — kabuklaşma, is veya yağ",
        "es": "Extrema: incrustaciones, hollín o grasa"},

    # Condition options — furniture
    "Neuwertig, nur neuer Bezug": {
        "en": "As new, cover only", "tr": "Sıfır ayarında, sadece kılıf",
        "es": "Como nuevo, solo tapizado"},
    "Gebraucht, Polsterung intakt": {
        "en": "Used, padding intact", "tr": "Kullanılmış, dolgu sağlam",
        "es": "Usado, relleno intacto"},
    "Stark abgenutzt, Polsterung ergänzen": {
        "en": "Heavily worn, padding to be replaced",
        "tr": "Çok yıpranmış, dolgu tamamlanacak",
        "es": "Muy desgastado, hay que reponer relleno"},
    "Antik oder Gestell locker": {
        "en": "Antique, or frame loose", "tr": "Antika veya iskelet gevşek",
        "es": "Antiguo o armazón suelto"},

    # Access options — building
    "Erdgeschoss oder Lift": {
        "en": "Ground floor or lift", "tr": "Zemin kat veya asansör",
        "es": "Planta baja o ascensor"},
    "Obergeschoss ohne Lift": {
        "en": "Upper floor, no lift", "tr": "Üst kat, asansörsüz",
        "es": "Planta alta sin ascensor"},
    "Enge Treppe": {
        "en": "Narrow staircase", "tr": "Dar merdiven",
        "es": "Escalera estrecha"},

    # Access options — plot
    "Direkt befahrbar": {
        "en": "Drive straight up", "tr": "Doğrudan araçla girilebilir",
        "es": "Acceso rodado directo"},
    "Nur über Gehweg oder Tor": {
        "en": "Only via a path or gate", "tr": "Sadece yaya yolu veya kapıdan",
        "es": "Solo por acera o portón"},
    "Nur über Treppe oder Durchgang": {
        "en": "Only via steps or a passage",
        "tr": "Sadece merdiven veya geçitten",
        "es": "Solo por escalera o pasaje"},

    # Access options — height
    "Vom Boden oder von der Leiter erreichbar": {
        "en": "Reachable from the ground or a ladder",
        "tr": "Yerden veya merdivenden erişilebilir",
        "es": "Accesible desde el suelo o con escalera"},
    "Anleiterung oder Hubsteiger nötig": {
        "en": "Needs a ladder rig or a platform",
        "tr": "Merdiven kurulumu veya platform gerekir",
        "es": "Requiere escalera de apoyo o plataforma"},
    "Nur über Gerüst erreichbar": {
        "en": "Only reachable from scaffolding",
        "tr": "Sadece iskeleden erişilebilir",
        "es": "Solo accesible desde andamio"},

    # Access options — workshop
    "In der Werkstatt": {
        "en": "At the workshop", "tr": "Atölyede", "es": "En el taller"},
    "Beim Kunden vor Ort": {
        "en": "At the customer's place", "tr": "Müşterinin yerinde",
        "es": "En casa del cliente"},
    "Vor Ort und beengt (Tiefgarage, Hof)": {
        "en": "On site and cramped (underground car park, yard)",
        "tr": "Yerinde ve dar (kapalı otopark, avlu)",
        "es": "In situ y con poco espacio (garaje subterráneo, patio)"},
}


# ── Job titles ──────────────────────────────────────────────────────────
#
# What the picker shows, and what a customer reads at the top of the quote.

JOB_TITLES: dict[str, dict[str, str]] = {
    'Steckdose setzen (Unterputz, Bestand)': {
        "en": 'Fit a socket (flush, existing circuit)', "tr": 'Priz montajı (sıva altı, mevcut hat)',
        "es": 'Instalar un enchufe (empotrado, circuito existente)'},
    'Leitung verlegen (Unterputz)': {
        "en": 'Run cable (chased in)', "tr": 'Kablo çekimi (sıva altı)',
        "es": 'Tender cable (empotrado)'},
    'Verteiler erneuern (Wohnung)': {
        "en": 'Replace the consumer unit (flat)', "tr": 'Sigorta panosu yenileme (daire)',
        "es": 'Renovar el cuadro eléctrico (vivienda)'},
    'Störungssuche und Behebung': {
        "en": 'Fault finding and repair', "tr": 'Arıza arama ve giderme',
        "es": 'Localización y reparación de averías'},
    'E-Befund / Anlagenüberprüfung': {
        "en": 'Electrical inspection certificate', "tr": 'Elektrik raporu / tesisat kontrolü',
        "es": 'Certificado de inspección eléctrica'},
    'Prüfung ortsveränderlicher Geräte': {
        "en": 'Portable appliance testing', "tr": 'Taşınabilir cihaz testi',
        "es": 'Comprobación de aparatos portátiles'},
    'Schalter oder Steckdose tauschen': {
        "en": 'Replace a switch or socket', "tr": 'Anahtar veya priz değişimi',
        "es": 'Cambiar interruptor o enchufe'},
    'Leuchte montieren': {
        "en": 'Fit a light fitting', "tr": 'Aydınlatma montajı',
        "es": 'Montar una luminaria'},
    'Rauchwarnmelder montieren': {
        "en": 'Fit smoke alarms', "tr": 'Duman dedektörü montajı',
        "es": 'Instalar detectores de humo'},
    'Außensteckdose setzen (IP44)': {
        "en": 'Fit an outdoor socket (IP44)', "tr": 'Dış mekan prizi (IP44)',
        "es": 'Instalar enchufe exterior (IP44)'},
    'Herd- oder Kochfeldanschluss': {
        "en": 'Cooker or hob connection', "tr": 'Ocak veya set üstü bağlantısı',
        "es": 'Conexión de cocina o placa'},
    'Netzwerkdose setzen (Cat 6a)': {
        "en": 'Fit a network outlet (Cat 6a)', "tr": 'Ağ prizi montajı (Cat 6a)',
        "es": 'Instalar toma de red (Cat 6a)'},
    'Wallbox installieren (11 kW)': {
        "en": 'Install a wallbox (11 kW)', "tr": 'Wallbox kurulumu (11 kW)',
        "es": 'Instalar wallbox (11 kW)'},
    'Verteiler erweitern (einzelne Stromkreise)': {
        "en": 'Extend the consumer unit (individual circuits)', "tr": 'Pano genişletme (tekil devreler)',
        "es": 'Ampliar el cuadro (circuitos sueltos)'},
    'Elektroinstallation Wohnung komplett': {
        "en": 'Full rewire of a flat', "tr": 'Dairenin komple elektrik tesisatı',
        "es": 'Instalación eléctrica completa de vivienda'},
    'Smart-Home-Nachrüstung (Schalter/Jalousie)': {
        "en": 'Smart-home retrofit (switches / blinds)', "tr": 'Akıllı ev dönüşümü (anahtar/panjur)',
        "es": 'Domótica añadida (interruptores/persianas)'},
    'Gegensprech-/Videoanlage tauschen': {
        "en": 'Replace the intercom or video entry system', "tr": 'İnterkom/görüntülü sistem değişimi',
        "es": 'Sustituir portero automático o videoportero'},
    'Fliesen entfernen (Dünnbett)': {
        "en": 'Remove tiles (thin-bed)', "tr": 'Fayans sökümü (ince yataklı)',
        "es": 'Retirar azulejos (capa fina)'},
    'Fliesen entfernen (Dickbett, Altbau)': {
        "en": 'Remove tiles (thick-bed, period building)', "tr": 'Fayans sökümü (kalın yataklı, eski yapı)',
        "es": 'Retirar azulejos (capa gruesa, edificio antiguo)'},
    'Bodenfliesen verlegen': {
        "en": 'Lay floor tiles', "tr": 'Yer karosu döşeme',
        "es": 'Colocar baldosas de suelo'},
    'Wandfliesen verlegen': {
        "en": 'Lay wall tiles', "tr": 'Duvar karosu döşeme',
        "es": 'Colocar azulejos de pared'},
    'Großformatfliesen verlegen (ab 60x120)': {
        "en": 'Lay large-format tiles (from 60x120)', "tr": 'Büyük ebat karo döşeme (60x120 ve üzeri)',
        "es": 'Colocar gran formato (desde 60x120)'},
    'Mosaik verlegen': {
        "en": 'Lay mosaic', "tr": 'Mozaik döşeme',
        "es": 'Colocar mosaico'},
    'Treppe fliesen': {
        "en": 'Tile a staircase', "tr": 'Merdiven kaplama',
        "es": 'Alicatar una escalera'},
    'Terrasse fliesen (frostsicher)': {
        "en": 'Tile a terrace (frost-proof)', "tr": 'Teras kaplama (dona dayanıklı)',
        "es": 'Alicatar una terraza (resistente a heladas)'},
    'Verbundabdichtung Nassbereich': {
        "en": 'Tanking to wet areas', "tr": 'Islak hacim su yalıtımı',
        "es": 'Impermeabilización de zonas húmedas'},
    'Fugen erneuern': {
        "en": 'Renew grout', "tr": 'Derz yenileme',
        "es": 'Renovar juntas'},
    'Silikonfugen erneuern': {
        "en": 'Renew silicone joints', "tr": 'Silikon derz yenileme',
        "es": 'Renovar juntas de silicona'},
    'Einzelne Fliesen ersetzen': {
        "en": 'Replace individual tiles', "tr": 'Tekil fayans değişimi',
        "es": 'Sustituir azulejos sueltos'},
    'Fliesensockel setzen': {
        "en": 'Fit tile skirting', "tr": 'Süpürgelik karo montajı',
        "es": 'Colocar rodapié cerámico'},
    'Rasen mähen (pro Einsatz)': {
        "en": 'Mow the lawn (per visit)', "tr": 'Çim biçme (ziyaret başına)',
        "es": 'Cortar el césped (por visita)'},
    'Vertikutieren mit Nachsaat': {
        "en": 'Scarify and overseed', "tr": 'Havalandırma ve tohum takviyesi',
        "es": 'Escarificar y resembrar'},
    'Laub beseitigen': {
        "en": 'Clear leaves', "tr": 'Yaprak temizliği',
        "es": 'Retirar hojas'},
    'Hecke schneiden': {
        "en": 'Trim a hedge', "tr": 'Çit budama',
        "es": 'Recortar seto'},
    'Baumschnitt / Kronenpflege': {
        "en": 'Tree pruning / crown care', "tr": 'Ağaç budama / taç bakımı',
        "es": 'Poda de árbol / cuidado de copa'},
    'Baum fällen inkl. Entsorgung': {
        "en": 'Fell a tree, disposal included', "tr": 'Ağaç kesimi, bertaraf dahil',
        "es": 'Talar un árbol, retirada incluida'},
    'Winterdienst (Saison)': {
        "en": 'Winter gritting (season)', "tr": 'Kış hizmeti (sezonluk)',
        "es": 'Servicio invernal (temporada)'},
    'Rasen neu anlegen (Saat)': {
        "en": 'New lawn from seed', "tr": 'Tohumdan yeni çim',
        "es": 'Césped nuevo por siembra'},
    'Rollrasen verlegen': {
        "en": 'Lay turf', "tr": 'Hazır çim serme',
        "es": 'Colocar césped en rollo'},
    'Beet anlegen und bepflanzen': {
        "en": 'Create and plant a bed', "tr": 'Tarh yapımı ve dikim',
        "es": 'Crear y plantar un arriate'},
    'Hecke pflanzen': {
        "en": 'Plant a hedge', "tr": 'Çit dikimi',
        "es": 'Plantar un seto'},
    'Bewässerungsanlage einbauen': {
        "en": 'Install an irrigation system', "tr": 'Sulama sistemi kurulumu',
        "es": 'Instalar sistema de riego'},
    'Pflasterung (Betonstein)': {
        "en": 'Paving (concrete block)', "tr": 'Beton parke döşeme',
        "es": 'Pavimentado (adoquín de hormigón)'},
    'Holz- oder WPC-Terrasse bauen': {
        "en": 'Build a timber or WPC deck', "tr": 'Ahşap veya WPC teras yapımı',
        "es": 'Construir tarima de madera o WPC'},
    'Zaun setzen (Doppelstabmatte)': {
        "en": 'Erect a fence (twin-wire mesh)', "tr": 'Çit kurulumu (çift telli panel)',
        "es": 'Instalar valla (malla de doble varilla)'},
    'Sichtschutzwand montieren': {
        "en": 'Fit a privacy screen', "tr": 'Paravan montajı',
        "es": 'Montar panel de privacidad'},
    'Gabionen- oder Trockenmauer': {
        "en": 'Gabion or dry-stone wall', "tr": 'Gabion veya kuru taş duvar',
        "es": 'Muro de gaviones o piedra seca'},
    'Drainage verlegen': {
        "en": 'Lay drainage', "tr": 'Drenaj döşeme',
        "es": 'Instalar drenaje'},
    'Außentreppe bauen': {
        "en": 'Build outdoor steps', "tr": 'Dış merdiven yapımı',
        "es": 'Construir escalera exterior'},
    'Pool einbauen (GFK-Becken, Standard)': {
        "en": 'Install a pool (GRP shell, standard)', "tr": 'Havuz kurulumu (CTP havuz, standart)',
        "es": 'Instalar piscina (vaso de PRFV, estándar)'},
    'Innenanstrich Wände, 2 Anstriche': {
        "en": 'Interior walls, two coats', "tr": 'İç duvar boyası, iki kat',
        "es": 'Pintura interior de paredes, dos manos'},
    'Deckenanstrich, 2 Anstriche': {
        "en": 'Ceiling, two coats', "tr": 'Tavan boyası, iki kat',
        "es": 'Pintura de techo, dos manos'},
    'Wohnung komplett streichen': {
        "en": 'Paint a whole flat', "tr": 'Dairenin komple boyanması',
        "es": 'Pintar una vivienda completa'},
    'Spachteln Q3 (glatt, streiffrei)': {
        "en": 'Skim to Q3 (smooth, streak-free)', "tr": 'Q3 alçı (düz, izsiz)',
        "es": 'Enlucido Q3 (liso, sin marcas)'},
    'Spachteln Q4 (streiflichttauglich)': {
        "en": 'Skim to Q4 (raking-light finish)', "tr": 'Q4 alçı (yalıcı ışığa uygun)',
        "es": 'Enlucido Q4 (apto a luz rasante)'},
    'Tapete entfernen': {
        "en": 'Strip wallpaper', "tr": 'Duvar kağıdı sökümü',
        "es": 'Retirar papel pintado'},
    'Raufaser tapezieren und streichen': {
        "en": 'Hang and paint woodchip', "tr": 'Kabartmalı kağıt kaplama ve boyama',
        "es": 'Empapelar en fibra y pintar'},
    'Vlies- oder Designtapete verlegen': {
        "en": 'Hang fleece or designer wallpaper', "tr": 'Duvar kağıdı (flizelin/desenli) kaplama',
        "es": 'Colocar papel tejido o de diseño'},
    'Innentür lackieren (Blatt und Zarge)': {
        "en": 'Paint an internal door (leaf and frame)', "tr": 'İç kapı boyama (kanat ve kasa)',
        "es": 'Pintar puerta interior (hoja y marco)'},
    'Heizkörper lackieren': {
        "en": 'Paint radiators', "tr": 'Radyatör boyama',
        "es": 'Pintar radiadores'},
    'Holzfenster streichen': {
        "en": 'Paint timber windows', "tr": 'Ahşap pencere boyama',
        "es": 'Pintar ventanas de madera'},
    'Schimmelsanierung Innenwand': {
        "en": 'Mould remediation, internal wall', "tr": 'İç duvar küf sanitasyonu',
        "es": 'Tratamiento de moho en pared interior'},
    'Struktur- oder Dekorputz innen': {
        "en": 'Textured or decorative plaster, interior', "tr": 'İç mekan dekoratif sıva',
        "es": 'Revoco decorativo o texturado interior'},
    'Risse sanieren': {
        "en": 'Repair cracks', "tr": 'Çatlak onarımı',
        "es": 'Reparar fisuras'},
    'Fassadenanstrich': {
        "en": 'Facade painting', "tr": 'Cephe boyama',
        "es": 'Pintura de fachada'},
    'Fassade reinigen und imprägnieren': {
        "en": 'Clean and seal a facade', "tr": 'Cephe temizliği ve emprenye',
        "es": 'Limpiar e hidrofugar fachada'},
    'Wärmedämmverbundsystem (WDVS)': {
        "en": 'External wall insulation (EWI)', "tr": 'Dış cephe ısı yalıtım sistemi',
        "es": 'Sistema de aislamiento exterior (SATE)'},
    'Holzfassade oder Zaun lasieren': {
        "en": 'Stain a timber facade or fence', "tr": 'Ahşap cephe veya çit vernikleme',
        "es": 'Lasurar fachada de madera o valla'},
    'Bodenbeschichtung Garage oder Keller': {
        "en": 'Floor coating, garage or cellar', "tr": 'Garaj veya bodrum zemin kaplaması',
        "es": 'Revestimiento de suelo, garaje o sótano'},
    'Türöffnung (zugefallen)': {
        "en": 'Door opening (latched shut)', "tr": 'Kapı açma (çarparak kapanmış)',
        "es": 'Apertura de puerta (cerrada de golpe)'},
    'Allround-Handwerker (Regiestunde)': {
        "en": 'General handyman (by the hour)', "tr": 'Çok yönlü usta (saat başı)',
        "es": 'Manitas general (por horas)'},
    'Einbauküche montieren': {
        "en": 'Fit a fitted kitchen', "tr": 'Ankastre mutfak montajı',
        "es": 'Montar cocina a medida'},
    'Fliegengitter montieren': {
        "en": 'Fit insect screens', "tr": 'Sineklik montajı',
        "es": 'Instalar mosquiteras'},
    'Innentür tauschen (Blatt und Zarge)': {
        "en": 'Replace an internal door (leaf and frame)', "tr": 'İç kapı değişimi (kanat ve kasa)',
        "es": 'Sustituir puerta interior (hoja y marco)'},
    'Markise montieren': {
        "en": 'Fit an awning', "tr": 'Tente montajı',
        "es": 'Instalar toldo'},
    'Möbel montieren (Schrank, Kommode)': {
        "en": 'Assemble furniture (wardrobe, chest)', "tr": 'Mobilya kurulumu (dolap, komodin)',
        "es": 'Montar muebles (armario, cómoda)'},
    'Regal oder Hängeschrank montieren': {
        "en": 'Fit shelving or a wall unit', "tr": 'Raf veya asma dolap montajı',
        "es": 'Montar estantería o mueble alto'},
    'Rollladen reparieren oder Gurt tauschen': {
        "en": 'Repair a roller shutter or replace the strap', "tr": 'Panjur onarımı veya kayış değişimi',
        "es": 'Reparar persiana o cambiar la cinta'},
    'Schließzylinder tauschen': {
        "en": 'Replace a lock cylinder', "tr": 'Kilit göbeği değişimi',
        "es": 'Sustituir el bombín'},
    'TV-Wandhalterung montieren': {
        "en": 'Fit a TV wall mount', "tr": 'TV duvar askısı montajı',
        "es": 'Instalar soporte de TV'},
    'Grundreinigung Wohnung': {
        "en": 'Deep clean of a flat', "tr": 'Daire genel temizliği',
        "es": 'Limpieza a fondo de vivienda'},
    'Fensterreinigung': {
        "en": 'Window cleaning', "tr": 'Cam temizliği',
        "es": 'Limpieza de cristales'},
    'Hausbetreuung (Stiegenhaus, pro Besuch)': {
        "en": 'Building caretaking (stairwell, per visit)', "tr": 'Bina bakımı (merdiven, ziyaret başına)',
        "es": 'Conserjería (escalera, por visita)'},
    'Schädlingsbekämpfung (Erstbehandlung)': {
        "en": 'Pest control (first treatment)', "tr": 'Haşere mücadelesi (ilk uygulama)',
        "es": 'Control de plagas (primer tratamiento)'},
    'Bauendreinigung nach Umbau': {
        "en": "Builders' clean after works", "tr": 'İnşaat sonrası temizlik',
        "es": 'Limpieza final de obra'},
    'Graffiti entfernen': {
        "en": 'Remove graffiti', "tr": 'Grafiti temizliği',
        "es": 'Eliminar grafitis'},
    'Teppich- und Polsterreinigung': {
        "en": 'Carpet and upholstery cleaning', "tr": 'Halı ve döşeme temizliği',
        "es": 'Limpieza de moquetas y tapicerías'},
    'Tiefgaragen- und Parkflächenreinigung': {
        "en": 'Underground car park and parking area cleaning', "tr": 'Kapalı otopark ve park alanı temizliği',
        "es": 'Limpieza de garaje y aparcamiento'},
    'Unterhaltsreinigung Büro (pro Einsatz)': {
        "en": 'Office maintenance clean (per visit)', "tr": 'Ofis rutin temizliği (ziyaret başına)',
        "es": 'Limpieza de mantenimiento de oficina (por visita)'},
    'WC tauschen (wandhängend)': {
        "en": 'Replace a WC (wall-hung)', "tr": 'Klozet değişimi (asma)',
        "es": 'Sustituir inodoro (suspendido)'},
    'Waschtisch mit Armatur tauschen': {
        "en": 'Replace a basin and tap', "tr": 'Lavabo ve armatür değişimi',
        "es": 'Sustituir lavabo y grifo'},
    'Gastherme tauschen': {
        "en": 'Replace a gas boiler', "tr": 'Kombi değişimi',
        "es": 'Sustituir caldera de gas'},
    'Rohrbruch orten und reparieren': {
        "en": 'Trace and repair a burst pipe', "tr": 'Boru patlağı tespiti ve onarımı',
        "es": 'Localizar y reparar una fuga'},
    'Notdienst-Anfahrt und Erstdiagnose': {
        "en": 'Emergency call-out and first diagnosis', "tr": 'Acil servis gelişi ve ilk teşhis',
        "es": 'Desplazamiento de urgencia y diagnóstico'},
    'Verstopfung Waschbecken/Dusche lösen': {
        "en": 'Clear a blocked basin or shower', "tr": 'Lavabo/duş tıkanıklığı açma',
        "es": 'Desatascar lavabo o ducha'},
    'Verstopfung WC/Fallstrang lösen': {
        "en": 'Clear a blocked WC or soil stack', "tr": 'Klozet/kolon tıkanıklığı açma',
        "es": 'Desatascar inodoro o bajante'},
    'Kanal-Kamerabefahrung mit Protokoll': {
        "en": 'Drain camera survey with report', "tr": 'Kanal kamera incelemesi ve raporu',
        "es": 'Inspección de saneamiento con cámara e informe'},
    'Armatur tauschen': {
        "en": 'Replace a tap', "tr": 'Armatür değişimi',
        "es": 'Sustituir un grifo'},
    'Spülkasten reparieren (UP)': {
        "en": 'Repair a cistern (concealed)', "tr": 'Rezervuar onarımı (gömme)',
        "es": 'Reparar cisterna (empotrada)'},
    'Badewanne tauschen': {
        "en": 'Replace a bath', "tr": 'Küvet değişimi',
        "es": 'Sustituir bañera'},
    'Wanne raus, bodengleiche Dusche rein': {
        "en": 'Bath out, level-access shower in', "tr": 'Küvet çıkar, zemin hizası duş',
        "es": 'Quitar bañera, poner ducha a ras'},
    'Duschkabine montieren': {
        "en": 'Fit a shower enclosure', "tr": 'Duşakabin montajı',
        "es": 'Instalar mampara de ducha'},
    'Warmwasserspeicher tauschen': {
        "en": 'Replace a hot water cylinder', "tr": 'Termosifon değişimi',
        "es": 'Sustituir acumulador de agua caliente'},
    'Wasserleitung erneuern (Strang)': {
        "en": 'Renew a water riser', "tr": 'Su hattı yenileme (kolon)',
        "es": 'Renovar montante de agua'},
    'Waschmaschinenanschluss setzen': {
        "en": 'Fit a washing machine connection', "tr": 'Çamaşır makinesi bağlantısı',
        "es": 'Instalar toma para lavadora'},
    'Thermenwartung (jährlich)': {
        "en": 'Boiler service (annual)', "tr": 'Kombi bakımı (yıllık)',
        "es": 'Mantenimiento de caldera (anual)'},
    'Dichtheitsprüfung mit Protokoll': {
        "en": 'Pressure test with certificate', "tr": 'Sızdırmazlık testi ve raporu',
        "es": 'Prueba de estanqueidad con informe'},
    'Sanitärerneuerung (WC, Waschtisch, Dusche)': {
        "en": 'Sanitaryware renewal (WC, basin, shower)', "tr": 'Vitrifiye yenileme (klozet, lavabo, duş)',
        "es": 'Renovación de sanitarios (inodoro, lavabo, ducha)'},
    'Badsanierung komplett (inkl. Fliesen und Heizkörper)': {
        "en": 'Full bathroom refit (tiles and radiator included)', "tr": 'Komple banyo yenileme (fayans ve radyatör dahil)',
        "es": 'Reforma integral de baño (azulejos y radiador incl.)'},
    'Estrich entfernen': {
        "en": 'Remove screed', "tr": 'Şap sökümü',
        "es": 'Retirar solera'},
    'Nichttragende Wand abbrechen': {
        "en": 'Demolish a non-load-bearing wall', "tr": 'Taşıyıcı olmayan duvar yıkımı',
        "es": 'Derribar tabique no portante'},
    'Alten Bodenbelag entfernen': {
        "en": 'Lift the old floor covering', "tr": 'Eski zemin kaplaması sökümü',
        "es": 'Retirar el pavimento antiguo'},
    'Untergrund spachteln und ausgleichen': {
        "en": 'Skim and level the subfloor', "tr": 'Zemin şap ve tesviye',
        "es": 'Nivelar y alisar el soporte'},
    'Laminat verlegen': {
        "en": 'Lay laminate', "tr": 'Laminat döşeme',
        "es": 'Colocar laminado'},
    'Vinyl oder Designbelag verlegen': {
        "en": 'Lay vinyl or LVT', "tr": 'Vinil veya LVT döşeme',
        "es": 'Colocar vinilo o LVT'},
    'Parkett verlegen (verklebt)': {
        "en": 'Lay parquet (bonded)', "tr": 'Parke döşeme (yapıştırma)',
        "es": 'Colocar parqué (encolado)'},
    'Parkett oder Dielen abschleifen und versiegeln': {
        "en": 'Sand and seal parquet or boards', "tr": 'Parke veya döşeme zımpara ve verniği',
        "es": 'Acuchillar y barnizar parqué o tarima'},
    'Teppichboden verlegen': {
        "en": 'Lay carpet', "tr": 'Halıfleks döşeme',
        "es": 'Colocar moqueta'},
    'Dach umdecken (Ziegel, inkl. Lattung)': {
        "en": 'Re-roof (tiles, battens included)', "tr": 'Çatı yenileme (kiremit, lata dahil)',
        "es": 'Retejar (tejas, rastreles incluidos)'},
    'Dachrinne erneuern': {
        "en": 'Renew guttering', "tr": 'Oluk yenileme',
        "es": 'Renovar canalón'},
    'Flachdach abdichten (Bitumen 2-lagig)': {
        "en": 'Waterproof a flat roof (two-layer bitumen)', "tr": 'Teras çatı yalıtımı (çift kat bitüm)',
        "es": 'Impermeabilizar cubierta plana (bitumen, dos capas)'},
    'Kaminkehrung und Messung': {
        "en": 'Chimney sweep and flue test', "tr": 'Baca temizliği ve ölçümü',
        "es": 'Deshollinado y medición'},
    'Fahrrad-Service (groß)': {
        "en": 'Bicycle service (major)', "tr": 'Bisiklet bakımı (büyük)',
        "es": 'Revisión de bicicleta (completa)'},
    'Fenster tauschen (Kunststoff, 2-flg)': {
        "en": 'Replace a window (uPVC, two-leaf)', "tr": 'Pencere değişimi (PVC, çift kanat)',
        "es": 'Sustituir ventana (PVC, dos hojas)'},
    'Rollladen nachrüsten (Aufsatz, elektrisch)': {
        "en": 'Retrofit a roller shutter (surface, electric)', "tr": 'Panjur ekleme (üstten, elektrikli)',
        "es": 'Añadir persiana (superpuesta, eléctrica)'},
    'Gelenkarmmarkise montieren': {
        "en": 'Fit a folding-arm awning', "tr": 'Mafsallı kol tente montajı',
        "es": 'Instalar toldo de brazos articulados'},
    'Isolierglasscheibe tauschen': {
        "en": 'Replace a double-glazed unit', "tr": 'Isıcam değişimi',
        "es": 'Sustituir vidrio aislante'},
    'Fassadengerüst (Auf-/Abbau + 4 Wochen)': {
        "en": 'Facade scaffold (erect, dismantle + 4 weeks)', "tr": 'Cephe iskelesi (kurulum/söküm + 4 hafta)',
        "es": 'Andamio de fachada (montaje/desmontaje + 4 semanas)'},
    'Bauschadengutachten': {
        "en": 'Building defects report', "tr": 'Yapı hasarı bilirkişi raporu',
        "es": 'Informe pericial de patologías'},
    'Heizkörper tauschen': {
        "en": 'Replace a radiator', "tr": 'Radyatör değişimi',
        "es": 'Sustituir radiador'},
    'Fußbodenheizung verlegen (Nass)': {
        "en": 'Lay underfloor heating (wet system)', "tr": 'Yerden ısıtma döşeme (ıslak sistem)',
        "es": 'Instalar suelo radiante (sistema húmedo)'},
    'Luft-Wasser-Wärmepumpe einbauen': {
        "en": 'Install an air-to-water heat pump', "tr": 'Hava-su ısı pompası kurulumu',
        "es": 'Instalar bomba de calor aerotérmica'},
    'Kaminofen anschließen': {
        "en": 'Connect a wood-burning stove', "tr": 'Soba bağlantısı',
        "es": 'Conectar estufa de leña'},
    'Kleines Service (Öl und Filter)': {
        "en": 'Minor service (oil and filters)', "tr": 'Küçük bakım (yağ ve filtre)',
        "es": 'Revisión menor (aceite y filtros)'},
    'Reifenwechsel (4 Räder, mit Wuchten)': {
        "en": 'Tyre change (four wheels, balanced)', "tr": 'Lastik değişimi (4 tekerlek, balanslı)',
        "es": 'Cambio de neumáticos (4 ruedas, equilibrado)'},
    'Küchenmontage (Standardküche)': {
        "en": 'Kitchen fitting (standard kitchen)', "tr": 'Mutfak montajı (standart mutfak)',
        "es": 'Montaje de cocina (cocina estándar)'},
    'Alte Küche demontieren und entsorgen': {
        "en": 'Strip out and dispose of an old kitchen', "tr": 'Eski mutfak sökümü ve bertarafı',
        "es": 'Desmontar y retirar cocina antigua'},
    'Wanddurchbruch mit Sturz': {
        "en": 'Form an opening with a lintel', "tr": 'Lentolu duvar açıklığı',
        "es": 'Abrir hueco con dintel'},
    'Wand mauern (nichttragend)': {
        "en": 'Build a wall (non-load-bearing)', "tr": 'Duvar örme (taşıyıcı olmayan)',
        "es": 'Levantar tabique (no portante)'},
    'Fensterbank Naturstein tauschen': {
        "en": 'Replace a natural stone sill', "tr": 'Doğal taş denizlik değişimi',
        "es": 'Sustituir alféizar de piedra natural'},
    'Geländer fertigen und montieren': {
        "en": 'Fabricate and fit a balustrade', "tr": 'Korkuluk imalatı ve montajı',
        "es": 'Fabricar e instalar barandilla'},
    'Sofa neu beziehen (3-Sitzer)': {
        "en": 'Reupholster a sofa (three-seater)', "tr": "Koltuk kaplama (3'lü)",
        "es": 'Retapizar un sofá (tres plazas)'},
    'PV-Anlage Schrägdach': {
        "en": 'PV system, pitched roof', "tr": 'Eğimli çatı GES',
        "es": 'Instalación fotovoltaica en cubierta inclinada'},
    'Innentür inkl. Zarge tauschen': {
        "en": 'Replace an internal door and frame', "tr": 'İç kapı ve kasa değişimi',
        "es": 'Sustituir puerta interior con marco'},
    'Einbauschrank nach Maß': {
        "en": 'Made-to-measure fitted wardrobe', "tr": 'Ölçüye göre gömme dolap',
        "es": 'Armario empotrado a medida'},
    'Möbelmontage (Kaufmöbel)': {
        "en": 'Furniture assembly (flat-pack)', "tr": 'Mobilya montajı (hazır mobilya)',
        "es": 'Montaje de muebles (comprados)'},
    'Ständerwand (doppelt beplankt)': {
        "en": 'Stud wall (double-boarded)', "tr": 'Alçıpan duvar (çift kat)',
        "es": 'Tabique de perfiles (doble placa)'},
    'Wohnungsumzug': {
        "en": 'House move', "tr": 'Ev taşıma',
        "es": 'Mudanza de vivienda'},
    'Entrümpelung': {
        "en": 'House clearance', "tr": 'Ev boşaltma',
        "es": 'Vaciado de vivienda'},
}


# ── Question labels ─────────────────────────────────────────────────────
#
# What the form asks. Shared across templates wherever the wording is.

QUESTIONS: dict[str, dict[str, str]] = {
    'Platz im Verteiler frei?': {
        "en": 'Space free in the board?', "tr": 'Panoda yer var mı?',
        "es": '¿Hay espacio libre en el cuadro?'},
    'Platz im Verteiler?': {
        "en": 'Space in the board?', "tr": 'Panoda yer var mı?',
        "es": '¿Espacio en el cuadro?'},
    'Platz im Verteilerfeld ausreichend': {
        "en": 'Enough space in the board', "tr": 'Pano alanı yeterli',
        "es": 'Espacio suficiente en el cuadro'},
    'Prüfmedium': {
        "en": 'Test medium', "tr": 'Test ortamı',
        "es": 'Medio de prueba'},
    'Rahmen und Falz mitreinigen': {
        "en": 'Clean frames and rebates too', "tr": 'Çerçeve ve fitil de temizlensin',
        "es": 'Limpiar también marcos y galces'},
    'Rasenfläche': {
        "en": 'Lawn area', "tr": 'Çim alanı',
        "es": 'Superficie de césped'},
    'Raum': {
        "en": 'Room', "tr": 'Mekan',
        "es": 'Estancia'},
    'Raumhöhe über 3 m?': {
        "en": 'Ceiling height over 3 m?', "tr": "Tavan yüksekliği 3 m'den fazla mı?",
        "es": '¿Altura libre mayor de 3 m?'},
    'Rissbreite': {
        "en": 'Crack width', "tr": 'Çatlak genişliği',
        "es": 'Ancho de fisura'},
    'Risslänge gesamt': {
        "en": 'Total length of cracks', "tr": 'Toplam çatlak uzunluğu',
        "es": 'Longitud total de fisuras'},
    'Rollladenkasten': {
        "en": 'Shutter box', "tr": 'Panjur kutusu',
        "es": 'Cajón de persiana'},
    'Sanitäranlagen': {
        "en": 'Sanitary facilities', "tr": 'Saniter tesisler',
        "es": 'Aseos'},
    'Schimmel in der Fuge': {
        "en": 'Mould in the joint', "tr": 'Derzde küf',
        "es": 'Moho en la junta'},
    'Schnitt': {
        "en": 'Cut', "tr": 'Kesim',
        "es": 'Corte'},
    'Schutzbeschichtung vorhanden': {
        "en": 'Protective coating present', "tr": 'Koruyucu kaplama mevcut',
        "es": 'Hay recubrimiento protector'},
    'Schädling': {
        "en": 'Pest', "tr": 'Haşere',
        "es": 'Plaga'},
    'Seit wann?': {
        "en": 'Since when?', "tr": 'Ne zamandır?',
        "es": '¿Desde cuándo?'},
    'Speichergröße': {
        "en": 'Cylinder size', "tr": 'Depo hacmi',
        "es": 'Capacidad del acumulador'},
    'Spezialwerkzeug nötig': {
        "en": 'Special tools needed', "tr": 'Özel alet gerekli',
        "es": 'Se necesitan herramientas especiales'},
    'Spülkasten': {
        "en": 'Cistern', "tr": 'Rezervuar',
        "es": 'Cisterna'},
    'Standort': {
        "en": 'Location', "tr": 'Konum',
        "es": 'Ubicación'},
    'Starke Kalk- oder Urinsteinablagerungen': {
        "en": 'Heavy limescale or urine scale', "tr": 'Yoğun kireç veya idrar taşı',
        "es": 'Fuerte cal o sarro de orina'},
    'Starker Moosbefall': {
        "en": 'Heavy moss', "tr": 'Yoğun yosun',
        "es": 'Musgo abundante'},
    'Stellplätze': {
        "en": 'Parking bays', "tr": 'Park yerleri',
        "es": 'Plazas de aparcamiento'},
    'Steuerung': {
        "en": 'Control', "tr": 'Kontrol',
        "es": 'Control'},
    'Streumittel': {
        "en": 'Grit material', "tr": 'Serpme malzemesi',
        "es": 'Material fundente'},
    'Symptom': {
        "en": 'Symptom', "tr": 'Belirti',
        "es": 'Síntoma'},
    'System': {
        "en": 'System', "tr": 'Sistem',
        "es": 'Sistema'},
    'Tapete wird beigestellt': {
        "en": 'Wallpaper supplied by the customer', "tr": 'Duvar kağıdını müşteri temin eder',
        "es": 'El papel lo aporta el cliente'},
    'Technik': {
        "en": 'Equipment', "tr": 'Teknik donanım',
        "es": 'Equipamiento'},
    'Türblätter müssen gekürzt werden': {
        "en": 'Door leaves have to be trimmed', "tr": 'Kapı kanatları kısaltılmalı',
        "es": 'Hay que recortar las hojas de puerta'},
    'Umfang': {
        "en": 'Scope', "tr": 'Kapsam',
        "es": 'Alcance'},
    'Umfang je Besuch': {
        "en": 'Scope per visit', "tr": 'Ziyaret başına kapsam',
        "es": 'Alcance por visita'},
    'Umfeld': {
        "en": 'Surroundings', "tr": 'Çevre',
        "es": 'Entorno'},
    'Untergrund': {
        "en": 'Substrate', "tr": 'Zemin',
        "es": 'Soporte'},
    'Untergrund der Stufen': {
        "en": 'Substrate of the steps', "tr": 'Basamak zemini',
        "es": 'Soporte de los peldaños'},
    'Unterkonstruktion': {
        "en": 'Sub-structure', "tr": 'Alt konstrüksiyon',
        "es": 'Subestructura'},
    'Ursache': {
        "en": 'Cause', "tr": 'Neden',
        "es": 'Causa'},
    'Verfahren': {
        "en": 'Method', "tr": 'Yöntem',
        "es": 'Método'},
    'Verlegeart': {
        "en": 'Laying pattern', "tr": 'Döşeme deseni',
        "es": 'Patrón de colocación'},
    'Verlegeart des Bestands': {
        "en": 'How the existing was laid', "tr": 'Mevcudun döşeme şekli',
        "es": 'Cómo se colocó lo existente'},
    'Verlegung': {
        "en": 'Laying', "tr": 'Döşeme',
        "es": 'Colocación'},
    'Vermutete Schadensstelle': {
        "en": 'Suspected location of the fault', "tr": 'Şüphelenilen hasar yeri',
        "es": 'Ubicación probable del daño'},
    'Verschmutzung': {
        "en": 'Soiling', "tr": 'Kirlilik',
        "es": 'Suciedad'},
    'Vorher spülen erforderlich': {
        "en": 'Flushing needed beforehand', "tr": 'Öncesinde yıkama gerekli',
        "es": 'Hace falta limpieza previa'},
    'Wand- oder Deckendurchbrüche nötig': {
        "en": 'Wall or ceiling penetrations needed', "tr": 'Duvar veya tavan delme gerekli',
        "es": 'Se necesitan pasos en muro o techo'},
    'Wandaufbau': {
        "en": 'Wall construction', "tr": 'Duvar yapısı',
        "es": 'Construcción del muro'},
    'Wanddurchführung nötig?': {
        "en": 'Wall penetration needed?', "tr": 'Duvar geçişi gerekli mi?',
        "es": '¿Se necesita paso de muro?'},
    'Wannenschürze': {
        "en": 'Bath panel', "tr": 'Küvet eteği',
        "es": 'Faldón de bañera'},
    'Was ist defekt': {
        "en": 'What is broken', "tr": 'Ne arızalı',
        "es": 'Qué está averiado'},
    'Was ist passiert': {
        "en": 'What has happened', "tr": 'Ne oldu',
        "es": 'Qué ha pasado'},
    'Was ist verstopft?': {
        "en": 'What is blocked?', "tr": 'Ne tıkalı?',
        "es": '¿Qué está atascado?'},
    'Wasser ist abgestellt': {
        "en": 'Water is shut off', "tr": 'Su kapatıldı',
        "es": 'El agua está cortada'},
    'Wasserquelle': {
        "en": 'Water source', "tr": 'Su kaynağı',
        "es": 'Fuente de agua'},
    'Wechsel des Energieträgers geplant': {
        "en": 'Change of fuel planned', "tr": 'Enerji kaynağı değişimi planlı',
        "es": 'Se plantea cambiar de combustible'},
    'Wohnfläche': {
        "en": 'Floor area', "tr": 'Konut alanı',
        "es": 'Superficie habitable'},
    'Wände lot- und fluchtgerecht?': {
        "en": 'Walls plumb and true?', "tr": 'Duvarlar şakulünde ve düzgün mü?',
        "es": '¿Paredes a plomo y alineadas?'},
    'Zarge': {
        "en": 'Door frame', "tr": 'Kapı kasası',
        "es": 'Marco de puerta'},
    'Zaunlänge': {
        "en": 'Length of fence', "tr": 'Çit uzunluğu',
        "es": 'Longitud de valla'},
    'Zeitfenster': {
        "en": 'Time slot', "tr": 'Zaman aralığı',
        "es": 'Franja horaria'},
    'Zement- oder Mörtelreste auf dem Boden': {
        "en": 'Cement or mortar residue on the floor', "tr": 'Zeminde çimento veya harç kalıntısı',
        "es": 'Restos de cemento o mortero en el suelo'},
    'Zu befahrende Länge': {
        "en": 'Length to survey', "tr": 'İncelenecek uzunluk',
        "es": 'Longitud a inspeccionar'},
    'Zu bewässernde Fläche': {
        "en": 'Area to be irrigated', "tr": 'Sulanacak alan',
        "es": 'Superficie a regar'},
    'Zu räumende Fläche': {
        "en": 'Area to be cleared', "tr": 'Temizlenecek alan',
        "es": 'Superficie a despejar'},
    'Zugang zum Kanal': {
        "en": 'Access to the drain', "tr": 'Kanala erişim',
        "es": 'Acceso al saneamiento'},
    'Zuleitung': {
        "en": 'Supply cable', "tr": 'Besleme hattı',
        "es": 'Alimentación'},
    'Zustand': {
        "en": 'Condition', "tr": 'Durum',
        "es": 'Estado'},
    'Zustand der Bestandsanlage': {
        "en": 'Condition of the existing installation', "tr": 'Mevcut tesisatın durumu',
        "es": 'Estado de la instalación existente'},
    'Zustand des Holzes': {
        "en": 'Condition of the timber', "tr": 'Ahşabın durumu',
        "es": 'Estado de la madera'},
    'Zustand des Schlosses': {
        "en": 'Condition of the lock', "tr": 'Kilidin durumu',
        "es": 'Estado de la cerradura'},
    'Zweites Bad/WC vorhanden?': {
        "en": 'Second bathroom or WC available?', "tr": 'İkinci banyo/WC var mı?',
        "es": '¿Hay un segundo baño o aseo?'},
    'Öffnung ohne Beschädigung erforderlich': {
        "en": 'Opening must be non-destructive', "tr": 'Hasarsız açılması gerekli',
        "es": 'La apertura debe ser sin daños'},
    'Ölflecken vorhanden': {
        "en": 'Oil stains present', "tr": 'Yağ lekesi mevcut',
        "es": 'Hay manchas de aceite'},
    'Abfluss': {
        "en": 'Waste outlet', "tr": 'Gider',
        "es": 'Desagüe'},
    'Abgasführung': {
        "en": 'Flue routing', "tr": 'Baca çıkışı',
        "es": 'Salida de humos'},
    'Abgasmessung mit Protokoll': {
        "en": 'Flue gas test with certificate', "tr": 'Baca gazı ölçümü ve raporu',
        "es": 'Medición de gases con informe'},
    'Ableitung': {
        "en": 'Discharge', "tr": 'Tahliye',
        "es": 'Evacuación'},
    'Absperrventil vorhanden und dicht': {
        "en": 'Isolating valve present and sound', "tr": 'Ara musluk mevcut ve sızdırmaz',
        "es": 'Llave de corte presente y estanca'},
    'Alte Küche muss zuerst raus': {
        "en": 'Old kitchen has to come out first', "tr": 'Önce eski mutfak sökülmeli',
        "es": 'Hay que retirar antes la cocina antigua'},
    'Alter': {
        "en": 'Age', "tr": 'Yaşı',
        "es": 'Antigüedad'},
    'Altmaterial': {
        "en": 'Existing material', "tr": 'Mevcut malzeme',
        "es": 'Material existente'},
    'Anlass': {
        "en": 'Reason', "tr": 'Gerekçe',
        "es": 'Motivo'},
    'Anschlüsse': {
        "en": 'Connections', "tr": 'Bağlantılar',
        "es": 'Conexiones'},
    'Ansichtsfläche': {
        "en": 'Face area', "tr": 'Görünen yüzey',
        "es": 'Superficie vista'},
    'Anstriche': {
        "en": 'Coats', "tr": 'Kat sayısı',
        "es": 'Manos'},
    'Anzahl': {
        "en": 'Quantity', "tr": 'Adet',
        "es": 'Cantidad'},
    'Anzahl Bäume': {
        "en": 'Number of trees', "tr": 'Ağaç sayısı',
        "es": 'Número de árboles'},
    'Anzahl Dosen': {
        "en": 'Number of outlets', "tr": 'Kutu sayısı',
        "es": 'Número de cajas'},
    'Anzahl Fenster': {
        "en": 'Number of windows', "tr": 'Pencere sayısı',
        "es": 'Número de ventanas'},
    'Anzahl Fensterflügel': {
        "en": 'Number of window leaves', "tr": 'Pencere kanadı sayısı',
        "es": 'Número de hojas'},
    'Anzahl Fliesen': {
        "en": 'Number of tiles', "tr": 'Fayans sayısı',
        "es": 'Número de azulejos'},
    'Anzahl Geräte': {
        "en": 'Number of appliances', "tr": 'Cihaz sayısı',
        "es": 'Número de aparatos'},
    'Anzahl Heizkörper': {
        "en": 'Number of radiators', "tr": 'Radyatör sayısı',
        "es": 'Número de radiadores'},
    'Anzahl Möbelstücke': {
        "en": 'Number of items', "tr": 'Mobilya sayısı',
        "es": 'Número de muebles'},
    'Anzahl Parteien': {
        "en": 'Number of dwellings', "tr": 'Daire sayısı',
        "es": 'Número de viviendas'},
    'Anzahl Punkte': {
        "en": 'Number of points', "tr": 'Nokta sayısı',
        "es": 'Número de puntos'},
    'Anzahl Rollläden': {
        "en": 'Number of roller shutters', "tr": 'Panjur sayısı',
        "es": 'Número de persianas'},
    'Anzahl Räume': {
        "en": 'Number of rooms', "tr": 'Oda sayısı',
        "es": 'Número de estancias'},
    'Anzahl Steckdosen': {
        "en": 'Number of sockets', "tr": 'Priz sayısı',
        "es": 'Número de enchufes'},
    'Anzahl Stromkreise': {
        "en": 'Number of circuits', "tr": 'Devre sayısı',
        "es": 'Número de circuitos'},
    'Anzahl Stufen': {
        "en": 'Number of steps', "tr": 'Basamak sayısı',
        "es": 'Número de peldaños'},
    'Anzahl Türen': {
        "en": 'Number of doors', "tr": 'Kapı sayısı',
        "es": 'Número de puertas'},
    'Anzahl WCs': {
        "en": 'Number of WCs', "tr": 'Klozet sayısı',
        "es": 'Número de inodoros'},
    'Anzahl Waschtische': {
        "en": 'Number of basins', "tr": 'Lavabo sayısı',
        "es": 'Número de lavabos'},
    'Anzahl Zylinder': {
        "en": 'Number of cylinders', "tr": 'Göbek sayısı',
        "es": 'Número de bombines'},
    'Arbeitsplatte': {
        "en": 'Worktop', "tr": 'Tezgah',
        "es": 'Encimera'},
    'Art': {
        "en": 'Type', "tr": 'Tür',
        "es": 'Tipo'},
    'Art der Arbeit': {
        "en": 'Type of work', "tr": 'İşin türü',
        "es": 'Tipo de trabajo'},
    'Art der Armatur': {
        "en": 'Type of tap', "tr": 'Armatür türü',
        "es": 'Tipo de grifo'},
    'Art der Geräte': {
        "en": 'Type of appliances', "tr": 'Cihaz türü',
        "es": 'Tipo de aparatos'},
    'Art der Tapete': {
        "en": 'Type of wallpaper', "tr": 'Duvar kağıdı türü',
        "es": 'Tipo de papel'},
    'Art des Risses': {
        "en": 'Type of crack', "tr": 'Çatlak türü',
        "es": 'Tipo de fisura'},
    'Aufbau': {
        "en": 'Build-up', "tr": 'Yapı katmanı',
        "es": 'Sistema constructivo'},
    'Aufbau der alten Fliesen': {
        "en": 'Build-up of the old tiles', "tr": 'Eski fayans katmanı',
        "es": 'Sistema del alicatado antiguo'},
    'Aufbauhöhe für Ablauf ausreichend?': {
        "en": 'Enough build-up height for the waste?', "tr": 'Gider için yükseklik yeterli mi?',
        "es": '¿Altura suficiente para el desagüe?'},
    'Aufsteigende Feuchte bekannt': {
        "en": 'Rising damp known', "tr": 'Yükselen nem biliniyor',
        "es": 'Humedad por capilaridad conocida'},
    'Aufstellung': {
        "en": 'Mounting', "tr": 'Yerleşim',
        "es": 'Instalación'},
    'Ausführung': {
        "en": 'Version', "tr": 'Uygulama',
        "es": 'Ejecución'},
    'Ausgangslage': {
        "en": 'Starting condition', "tr": 'Başlangıç durumu',
        "es": 'Situación de partida'},
    'Ausgleichshöhe': {
        "en": 'Levelling depth', "tr": 'Tesviye kalınlığı',
        "es": 'Espesor de nivelación'},
    'Aushub': {
        "en": 'Spoil', "tr": 'Kazı malzemesi',
        "es": 'Tierra excavada'},
    'Ausmaß': {
        "en": 'Extent', "tr": 'Kapsam',
        "es": 'Alcance'},
    'Ausstattungsgrad': {
        "en": 'Specification level', "tr": 'Donanım seviyesi',
        "es": 'Nivel de equipamiento'},
    'Badgröße': {
        "en": 'Bathroom size', "tr": 'Banyo büyüklüğü',
        "es": 'Tamaño del baño'},
    'Barrierefrei nach ÖNORM B 1600?': {
        "en": 'Step-free to ÖNORM B 1600?', "tr": "ÖNORM B 1600'e göre erişilebilir mi?",
        "es": '¿Accesible según ÖNORM B 1600?'},
    'Bauart': {
        "en": 'Design', "tr": 'Yapı tipi',
        "es": 'Tipología'},
    'Bauart der neuen Wanne': {
        "en": 'Type of the new bath', "tr": 'Yeni küvetin tipi',
        "es": 'Tipo de la nueva bañera'},
    'Baujahr': {
        "en": 'Year built', "tr": 'Yapım yılı',
        "es": 'Año de construcción'},
    'Baujahr der Altanlage': {
        "en": 'Year the old unit was built', "tr": 'Eski cihazın yılı',
        "es": 'Año del equipo antiguo'},
    'Baujahr des Gebäudes': {
        "en": 'Year the building was built', "tr": 'Binanın yapım yılı',
        "es": 'Año del edificio'},
    'Baumgröße': {
        "en": 'Tree size', "tr": 'Ağaç boyu',
        "es": 'Tamaño del árbol'},
    'Bauphase': {
        "en": 'Stage of works', "tr": 'İnşaat aşaması',
        "es": 'Fase de obra'},
    'Bauteil': {
        "en": 'Element', "tr": 'Yapı elemanı',
        "es": 'Elemento'},
    'Beanspruchungsklasse': {
        "en": 'Exposure class', "tr": 'Maruziyet sınıfı',
        "es": 'Clase de exposición'},
    'Beckengröße': {
        "en": 'Pool size', "tr": 'Havuz boyutu',
        "es": 'Tamaño del vaso'},
    'Beetfläche': {
        "en": 'Bed area', "tr": 'Tarh alanı',
        "es": 'Superficie del arriate'},
    'Befallene Fläche': {
        "en": 'Affected area', "tr": 'Etkilenen alan',
        "es": 'Superficie afectada'},
    'Befestigungsgrund': {
        "en": 'Fixing substrate', "tr": 'Sabitleme zemini',
        "es": 'Soporte de fijación'},
    'Beheizung': {
        "en": 'Heating', "tr": 'Isıtma',
        "es": 'Calentamiento'},
    'Belag': {
        "en": 'Covering', "tr": 'Kaplama',
        "es": 'Revestimiento'},
    'Belag wird beigestellt': {
        "en": 'Covering supplied by the customer', "tr": 'Kaplamayı müşteri temin eder',
        "es": 'El revestimiento lo aporta el cliente'},
    'Belastung': {
        "en": 'Loading', "tr": 'Yük sınıfı',
        "es": 'Carga'},
    'Bepflanzung': {
        "en": 'Planting', "tr": 'Bitkilendirme',
        "es": 'Plantación'},
    'Bereits Wasserschaden sichtbar': {
        "en": 'Water damage already visible', "tr": 'Su hasarı halihazırda görünür',
        "es": 'Ya hay daños por agua visibles'},
    'Bestandsleitung nutzbar?': {
        "en": 'Existing cable usable?', "tr": 'Mevcut hat kullanılabilir mi?',
        "es": '¿Se puede usar el cableado existente?'},
    'Bestehender Lack': {
        "en": 'Existing paintwork', "tr": 'Mevcut boya',
        "es": 'Pintura existente'},
    'Betroffen ist': {
        "en": 'What is affected', "tr": 'Etkilenen',
        "es": 'Qué está afectado'},
    'Bisheriger Belag': {
        "en": 'Previous covering', "tr": 'Önceki kaplama',
        "es": 'Revestimiento anterior'},
    'Breite': {
        "en": 'Width', "tr": 'Genişlik',
        "es": 'Anchura'},
    'Bürofläche': {
        "en": 'Office area', "tr": 'Ofis alanı',
        "es": 'Superficie de oficina'},
    'Deckenaufbau': {
        "en": 'Ceiling construction', "tr": 'Tavan yapısı',
        "es": 'Construcción del techo'},
    'Deutlicher Farbwechsel': {
        "en": 'Marked change of colour', "tr": 'Belirgin renk değişimi',
        "es": 'Cambio de color marcado'},
    'Dokumentation': {
        "en": 'Documentation', "tr": 'Belgeleme',
        "es": 'Documentación'},
    'Durchschnittliche Leitungslänge': {
        "en": 'Average cable run', "tr": 'Ortalama hat uzunluğu',
        "es": 'Longitud media de cable'},
    'Dämmstoff': {
        "en": 'Insulation material', "tr": 'Yalıtım malzemesi',
        "es": 'Material aislante'},
    'Dämmstärke': {
        "en": 'Insulation thickness', "tr": 'Yalıtım kalınlığı',
        "es": 'Espesor del aislamiento'},
    'Einsatzzeit': {
        "en": 'Time of call-out', "tr": 'Müdahale zamanı',
        "es": 'Franja de intervención'},
    'Elektroanschluss vorhanden und ausreichend?': {
        "en": 'Power supply present and adequate?', "tr": 'Elektrik bağlantısı var ve yeterli mi?',
        "es": '¿Toma eléctrica presente y suficiente?'},
    'Elektrogeräte': {
        "en": 'Appliances', "tr": 'Beyaz eşya',
        "es": 'Electrodomésticos'},
    'Entfernung Verteiler zur Wallbox': {
        "en": 'Distance from board to wallbox', "tr": "Panodan wallbox'a mesafe",
        "es": 'Distancia del cuadro al wallbox'},
    'Entfernung zum Verteiler': {
        "en": 'Distance to the board', "tr": 'Panoya mesafe',
        "es": 'Distancia al cuadro'},
    'Entfernung zur nächsten Leitung': {
        "en": 'Distance to the nearest pipe', "tr": 'En yakın hatta mesafe',
        "es": 'Distancia a la tubería más cercana'},
    'Entwässerung vorhanden': {
        "en": 'Drainage present', "tr": 'Drenaj mevcut',
        "es": 'Drenaje existente'},
    'Erdleitungen im Bereich bekannt': {
        "en": 'Buried services in the area known', "tr": 'Bölgedeki yeraltı hatları biliniyor',
        "es": 'Se conocen las conducciones enterradas'},
    'Ersatzfliesen vorhanden': {
        "en": 'Spare tiles available', "tr": 'Yedek fayans mevcut',
        "es": 'Hay azulejos de repuesto'},
    'FI Typ A/B vorhanden?': {
        "en": 'Type A/B RCD present?', "tr": 'A/B tipi kaçak akım rölesi var mı?',
        "es": '¿Hay diferencial tipo A/B?'},
    'FI-Schutzschalter vorhanden': {
        "en": 'RCD present', "tr": 'Kaçak akım rölesi mevcut',
        "es": 'Diferencial presente'},
    'Fenster und Rahmen enthalten': {
        "en": 'Windows and frames included', "tr": 'Pencere ve çerçeve dahil',
        "es": 'Ventanas y marcos incluidos'},
    'Fensterart': {
        "en": 'Type of window', "tr": 'Pencere türü',
        "es": 'Tipo de ventana'},
    'Flecken': {
        "en": 'Stains', "tr": 'Lekeler',
        "es": 'Manchas'},
    'Fliesen im Anschlussbereich erhalten?': {
        "en": 'Tiles around the joint to be kept?', "tr": 'Bağlantı çevresindeki fayanslar kalacak mı?',
        "es": '¿Se conservan los azulejos del encuentro?'},
    'Fläche': {
        "en": 'Area', "tr": 'Alan',
        "es": 'Superficie'},
    'Form': {
        "en": 'Layout', "tr": 'Biçim',
        "es": 'Distribución'},
    'Format': {
        "en": 'Format', "tr": 'Ebat',
        "es": 'Formato'},
    'Fugenbreite': {
        "en": 'Joint width', "tr": 'Derz genişliği',
        "es": 'Ancho de junta'},
    'Fugenlänge': {
        "en": 'Length of joint', "tr": 'Derz uzunluğu',
        "es": 'Longitud de junta'},
    'Funktion': {
        "en": 'Function', "tr": 'İşlev',
        "es": 'Función'},
    'Funktionierendes Absperrventil vorhanden?': {
        "en": 'Working isolating valve present?', "tr": 'Çalışan ara musluk var mı?',
        "es": '¿Hay llave de corte operativa?'},
    'Funkvernetzt?': {
        "en": 'Radio-linked?', "tr": 'Kablosuz bağlantılı mı?',
        "es": '¿Interconectados por radio?'},
    'Fußbodenheizung vorhanden': {
        "en": 'Underfloor heating present', "tr": 'Yerden ısıtma mevcut',
        "es": 'Suelo radiante presente'},
    'Fällgenehmigung': {
        "en": 'Felling permit', "tr": 'Kesim izni',
        "es": 'Permiso de tala'},
    'Gebäudehöhe': {
        "en": 'Building height', "tr": 'Bina yüksekliği',
        "es": 'Altura del edificio'},
    'Gefälle vorhanden': {
        "en": 'Fall present', "tr": 'Eğim mevcut',
        "es": 'Hay pendiente'},
    'Gerät': {
        "en": 'Appliance', "tr": 'Cihaz',
        "es": 'Aparato'},
    'Gerätetyp': {
        "en": 'Appliance type', "tr": 'Cihaz tipi',
        "es": 'Tipo de aparato'},
    'Gerüst': {
        "en": 'Scaffolding', "tr": 'İskele',
        "es": 'Andamio'},
    'Geschosse': {
        "en": 'Storeys', "tr": 'Kat sayısı',
        "es": 'Plantas'},
    'Geschätzte Stunden': {
        "en": 'Estimated hours', "tr": 'Tahmini saat',
        "es": 'Horas estimadas'},
    'Grabentiefe': {
        "en": 'Trench depth', "tr": 'Hendek derinliği',
        "es": 'Profundidad de zanja'},
    'Größe': {
        "en": 'Size', "tr": 'Boyut',
        "es": 'Tamaño'},
    'Grünschnitt': {
        "en": 'Green waste', "tr": 'Yeşil atık',
        "es": 'Restos vegetales'},
    'Halterung': {
        "en": 'Bracket', "tr": 'Askı',
        "es": 'Soporte'},
    'Heckenlänge': {
        "en": 'Length of hedge', "tr": 'Çit uzunluğu',
        "es": 'Longitud del seto'},
    'Heizkörper abnehmen': {
        "en": 'Take the radiators off the wall', "tr": 'Radyatörleri sökmek',
        "es": 'Descolgar los radiadores'},
    'Herdanschlussdose vorhanden?': {
        "en": 'Cooker outlet box present?', "tr": 'Ocak bağlantı kutusu var mı?',
        "es": '¿Hay caja de conexión de cocina?'},
    'Hersteller bekannt?': {
        "en": 'Manufacturer known?', "tr": 'Üretici biliniyor mu?',
        "es": '¿Se conoce el fabricante?'},
    'Häufigkeit': {
        "en": 'Frequency', "tr": 'Sıklık',
        "es": 'Frecuencia'},
    'Höhe': {
        "en": 'Height', "tr": 'Yükseklik',
        "es": 'Altura'},
    'Imprägnierung gewünscht': {
        "en": 'Protective treatment wanted', "tr": 'Emprenye isteniyor',
        "es": 'Se desea impregnación'},
    'Imprägnierung im Anschluss': {
        "en": 'Seal afterwards', "tr": 'Ardından emprenye',
        "es": 'Hidrofugado posterior'},
    'Kabelführung': {
        "en": 'Cable routing', "tr": 'Kablo geçişi',
        "es": 'Recorrido del cable'},
    'Küche stark verfettet': {
        "en": 'Kitchen heavily greased', "tr": 'Mutfak çok yağlı',
        "es": 'Cocina muy engrasada'},
    'Küchenzeile gesamt': {
        "en": 'Total run of units', "tr": 'Toplam mutfak uzunluğu',
        "es": 'Longitud total de la cocina'},
    'Laubmenge': {
        "en": 'Amount of leaves', "tr": 'Yaprak miktarı',
        "es": 'Cantidad de hojas'},
    'Leitungen erneuern?': {
        "en": 'Renew the pipework?', "tr": 'Tesisat yenilensin mi?',
        "es": '¿Renovar las tuberías?'},
    'Leitungslänge': {
        "en": 'Cable run', "tr": 'Hat uzunluğu',
        "es": 'Longitud de cable'},
    'Letzte Wartung': {
        "en": 'Last service', "tr": 'Son bakım',
        "es": 'Último mantenimiento'},
    'Länge': {
        "en": 'Length', "tr": 'Uzunluk',
        "es": 'Longitud'},
    'Material': {
        "en": 'Material', "tr": 'Malzeme',
        "es": 'Material'},
    'Maß': {
        "en": 'Size', "tr": 'Ölçü',
        "es": 'Medida'},
    'Maß des alten Zylinders bekannt': {
        "en": 'Size of the old cylinder known', "tr": 'Eski göbeğin ölçüsü biliniyor',
        "es": 'Se conoce la medida del bombín antiguo'},
    'Maße': {
        "en": 'Dimensions', "tr": 'Ölçüler',
        "es": 'Medidas'},
    'Mehr als 0,5 m² befallen': {
        "en": 'More than 0.5 m² affected', "tr": "0,5 m²'den fazla etkilenmiş",
        "es": 'Más de 0,5 m² afectados'},
    'Mit Geländer': {
        "en": 'With a balustrade', "tr": 'Korkuluklu',
        "es": 'Con barandilla'},
    'Mit Motor und Funk': {
        "en": 'With motor and remote', "tr": 'Motorlu ve kumandalı',
        "es": 'Con motor y mando'},
    'Mit Setzstufe': {
        "en": 'With risers', "tr": 'Rıht dahil',
        "es": 'Con contrahuella'},
    'Mit Tor oder Türe': {
        "en": 'With a gate or door', "tr": 'Kapı veya bahçe kapısı dahil',
        "es": 'Con portón o puerta'},
    'Mit Unkrautvlies und Mulch': {
        "en": 'With weed fabric and mulch', "tr": 'Yabani ot örtüsü ve malç ile',
        "es": 'Con malla antihierba y mantillo'},
    'Montageart': {
        "en": 'Type of installation', "tr": 'Montaj şekli',
        "es": 'Tipo de montaje'},
    'Montageort': {
        "en": 'Mounting location', "tr": 'Montaj yeri',
        "es": 'Lugar de montaje'},
    'Muss an der Wand gesichert werden': {
        "en": 'Must be anchored to the wall', "tr": 'Duvara sabitlenmeli',
        "es": 'Debe anclarse a la pared'},
    'Musteransatz': {
        "en": 'Pattern match', "tr": 'Desen eşleşmesi',
        "es": 'Casado del dibujo'},
    'Möblierung': {
        "en": 'Furnishing', "tr": 'Eşya durumu',
        "es": 'Amueblado'},
    'Nach Bauarbeiten (Zement- und Farbreste)': {
        "en": 'After building work (cement and paint residue)', "tr": 'İnşaat sonrası (çimento ve boya kalıntısı)',
        "es": 'Tras obra (restos de cemento y pintura)'},
    'Neue Beschläge und Drücker': {
        "en": 'New ironmongery and handles', "tr": 'Yeni donanım ve kollar',
        "es": 'Herrajes y manillas nuevos'},
    'Neue Oberfläche': {
        "en": 'New finish', "tr": 'Yeni yüzey',
        "es": 'Nuevo acabado'},
    'Neue Stromkreise': {
        "en": 'New circuits', "tr": 'Yeni devreler',
        "es": 'Circuitos nuevos'},
    'Neutralleiter in der Dose vorhanden?': {
        "en": 'Neutral present in the back box?', "tr": 'Kutuda nötr var mı?',
        "es": '¿Hay neutro en la caja?'},
    'Nikotin- oder Wasserflecken': {
        "en": 'Nicotine or water stains', "tr": 'Nikotin veya su lekesi',
        "es": 'Manchas de nicotina o agua'},
    'Objekt': {
        "en": 'Property', "tr": 'Nesne',
        "es": 'Inmueble'},
    'Patchfeld vorhanden': {
        "en": 'Patch panel present', "tr": 'Patch paneli mevcut',
        "es": 'Hay panel de parcheo'},
    'Pflanzhöhe': {
        "en": 'Planting height', "tr": 'Dikim boyu',
        "es": 'Altura de plantación'},
}


# ── Answer options ──────────────────────────────────────────────────────
#
# What a tap on the form actually says.

OPTIONS: dict[str, dict[str, str]] = {
    'Teil einer Schließanlage': {
        "en": 'Part of a master-key system', "tr": 'Bir kilit sisteminin parçası',
        "es": 'Parte de un amaestramiento'},
    'Teilausfall': {
        "en": 'Partial outage', "tr": 'Kısmi kesinti',
        "es": 'Fallo parcial'},
    'Teilweise belegt': {
        "en": 'Partly occupied', "tr": 'Kısmen dolu',
        "es": 'Parcialmente ocupado'},
    'Teilweise geräumt': {
        "en": 'Partly cleared', "tr": 'Kısmen boşaltılmış',
        "es": 'Parcialmente despejado'},
    'Teppich oder Teppichboden': {
        "en": 'Rug or fitted carpet', "tr": 'Halı veya halıfleks',
        "es": 'Alfombra o moqueta'},
    'Teppich, geklebt': {
        "en": 'Carpet, bonded', "tr": 'Halı, yapıştırılmış',
        "es": 'Moqueta, encolada'},
    'Thermostatarmatur': {
        "en": 'Thermostatic mixer', "tr": 'Termostatik armatür',
        "es": 'Grifo termostático'},
    'Täglich': {
        "en": 'Daily', "tr": 'Günlük',
        "es": 'A diario'},
    'Täglich inkl. Wochenende': {
        "en": 'Daily, weekends included', "tr": 'Hafta sonu dahil günlük',
        "es": 'A diario, fines de semana incluidos'},
    'U-Form': {
        "en": 'U-shape', "tr": 'U şekli',
        "es": 'En U'},
    'Unbekannt': {
        "en": 'Unknown', "tr": 'Bilinmiyor',
        "es": 'Se desconoce'},
    'Undicht, Wasser läuft nach': {
        "en": 'Leaking, water keeps running', "tr": 'Sızdırıyor, su akmaya devam ediyor',
        "es": 'Con fuga, el agua sigue corriendo'},
    'Unterputz': {
        "en": 'Flush-mounted', "tr": 'Sıva altı',
        "es": 'Empotrado'},
    'Unterputz (Vorwand)': {
        "en": 'Concealed (stud wall)', "tr": 'Sıva altı (ön duvar)',
        "es": 'Empotrada (trasdosado)'},
    'Unterputz (stemmen)': {
        "en": 'Flush (chasing)', "tr": 'Sıva altı (kırma)',
        "es": 'Empotrado (rozas)'},
    'Unterputz, Schlitz fräsen': {
        "en": 'Flush, chase to be cut', "tr": 'Sıva altı, kanal açma',
        "es": 'Empotrado, con roza'},
    'Unterputz, Wand aufstemmen': {
        "en": 'Flush, wall to be chased', "tr": 'Sıva altı, duvar kırma',
        "es": 'Empotrado, con roza en pared'},
    'Unterputz, bleibt': {
        "en": 'Concealed, stays', "tr": 'Sıva altı, kalıyor',
        "es": 'Empotrada, se conserva'},
    'Unterputz, wird getauscht': {
        "en": 'Concealed, to be replaced', "tr": 'Sıva altı, değişecek',
        "es": 'Empotrada, se sustituye'},
    'Verbleibt am Grundstück': {
        "en": 'Stays on the plot', "tr": 'Arsada kalıyor',
        "es": 'Se queda en la parcela'},
    'Verbleibt vor Ort': {
        "en": 'Stays on site', "tr": 'Yerinde kalıyor',
        "es": 'Se queda en obra'},
    'Vereinzelt': {
        "en": 'Occasional', "tr": 'Yer yer',
        "es": 'Puntuales'},
    'Vergraut oder abblätternd': {
        "en": 'Greyed or flaking', "tr": 'Grileşmiş veya kabarmış',
        "es": 'Agrisada o descascarillada'},
    'Verkauf/Vermietung': {
        "en": 'Sale or letting', "tr": 'Satış/kiralama',
        "es": 'Venta o alquiler'},
    'Verputzt, gestrichen, intakt': {
        "en": 'Rendered, painted, sound', "tr": 'Sıvalı, boyalı, sağlam',
        "es": 'Revocado, pintado, en buen estado'},
    'Versetzter Ansatz': {
        "en": 'Offset match', "tr": 'Kaydırmalı ek',
        "es": 'Casado a salto'},
    'Versiegelung': {
        "en": 'Lacquer seal', "tr": 'Vernik',
        "es": 'Barnizado'},
    'Verstopfung': {
        "en": 'Blockage', "tr": 'Tıkanıklık',
        "es": 'Atasco'},
    'Verwittert, Altanstrich lose': {
        "en": 'Weathered, old coat loose', "tr": 'Yıpranmış, eski boya gevşek',
        "es": 'Deteriorada, pintura vieja suelta'},
    'Verzinkter Stahl': {
        "en": 'Galvanised steel', "tr": 'Galvanizli çelik',
        "es": 'Acero galvanizado'},
    'Vlies, trocken abziehbar': {
        "en": 'Fleece, strips off dry', "tr": 'Flizelin, kuru soyulabilir',
        "es": 'Tejido, se retira en seco'},
    'Voll belegt, in Etappen': {
        "en": 'Fully occupied, in phases', "tr": 'Tam dolu, etaplı',
        "es": 'Totalmente ocupado, por fases'},
    'Voll möbliert': {
        "en": 'Fully furnished', "tr": 'Tam eşyalı',
        "es": 'Totalmente amueblado'},
    'Vollflächig geklebt': {
        "en": 'Fully bonded', "tr": 'Tam yüzey yapıştırma',
        "es": 'Encolado a toda superficie'},
    'Vollflächig verklebt': {
        "en": 'Fully bonded', "tr": 'Tam yüzey yapıştırma',
        "es": 'Encolado a toda superficie'},
    'Von innen zugänglich': {
        "en": 'Accessible from inside', "tr": 'İçeriden erişilebilir',
        "es": 'Accesible desde dentro'},
    'Vor unter 2 Jahren': {
        "en": 'Less than 2 years ago', "tr": '2 yıldan az önce',
        "es": 'Hace menos de 2 años'},
    'Vor über 2 Jahren / unbekannt': {
        "en": 'More than 2 years ago / unknown', "tr": '2 yıldan fazla önce / bilinmiyor',
        "es": 'Hace más de 2 años / se desconoce'},
    'Vorhanden und nutzbar': {
        "en": 'Present and usable', "tr": 'Mevcut ve kullanılabilir',
        "es": 'Presente y utilizable'},
    'Vorhanden und passend': {
        "en": 'Present and in the right place', "tr": 'Mevcut ve uygun',
        "es": 'Presentes y en su sitio'},
    'Vorhanden, abzweigbar': {
        "en": 'Present, can be spurred off', "tr": 'Mevcut, dallandırılabilir',
        "es": 'Presente, se puede derivar'},
    'W1-I, Wand mit Spritzwasser': {
        "en": 'W1-I, wall with splash water', "tr": 'W1-I, sıçrama sulu duvar',
        "es": 'W1-I, pared con salpicaduras'},
    'W2-I, bodengleiche Dusche': {
        "en": 'W2-I, level-access shower', "tr": 'W2-I, zemin hizası duş',
        "es": 'W2-I, ducha a ras de suelo'},
    'W3-I, öffentlich oder Dampfbad': {
        "en": 'W3-I, public or steam room', "tr": 'W3-I, umumi veya buhar odası',
        "es": 'W3-I, público o baño de vapor'},
    'WLAN': {
        "en": 'Wi-Fi', "tr": 'Wi-Fi',
        "es": 'Wi-Fi'},
    'WPC': {
        "en": 'WPC', "tr": 'WPC',
        "es": 'WPC'},
    'Walk-in': {
        "en": 'Walk-in', "tr": 'Walk-in',
        "es": 'Walk-in'},
    'Wand': {
        "en": 'Wall', "tr": 'Duvar',
        "es": 'Pared'},
    'Wand mit Wärmedämmung': {
        "en": 'Wall with external insulation', "tr": 'Isı yalıtımlı duvar',
        "es": 'Pared con aislamiento'},
    'Wand und Boden': {
        "en": 'Wall and floor', "tr": 'Duvar ve zemin',
        "es": 'Pared y suelo'},
    'Wandhängend, Vorwand vorhanden': {
        "en": 'Wall-hung, stud wall present', "tr": 'Asma, ön duvar mevcut',
        "es": 'Suspendido, con trasdosado'},
    'Wandmontage': {
        "en": 'Wall mounted', "tr": 'Duvara montaj',
        "es": 'De pared'},
    'Warmwasser-Wärmepumpe': {
        "en": 'Hot water heat pump', "tr": 'Sıcak su ısı pompası',
        "es": 'Bomba de calor para ACS'},
    'Waschbecken': {
        "en": 'Basin', "tr": 'Lavabo',
        "es": 'Lavabo'},
    'Waschtisch': {
        "en": 'Basin', "tr": 'Lavabo',
        "es": 'Lavabo'},
    'Wasser': {
        "en": 'Water', "tr": 'Su',
        "es": 'Agua'},
    'Wasser tritt aus': {
        "en": 'Water is escaping', "tr": 'Su sızıyor',
        "es": 'Sale agua'},
    'Wasserschaden': {
        "en": 'Water damage', "tr": 'Su hasarı',
        "es": 'Daño por agua'},
    'Welle oder Lager': {
        "en": 'Barrel or bearings', "tr": 'Mil veya yatak',
        "es": 'Eje o rodamientos'},
    'Wenige Tage': {
        "en": 'A few days', "tr": 'Birkaç gün',
        "es": 'Pocos días'},
    'Werkstatt und Maschinen': {
        "en": 'Workshop and machines', "tr": 'Atölye ve makineler',
        "es": 'Taller y máquinas'},
    'Werktag': {
        "en": 'Weekday', "tr": 'Hafta içi',
        "es": 'Día laborable'},
    'Werktag 7-17 Uhr': {
        "en": 'Weekday, 7am to 5pm', "tr": 'Hafta içi 07:00-17:00',
        "es": 'Laborable, de 7 a 17 h'},
    'Werktags': {
        "en": 'Weekdays', "tr": 'Hafta içi',
        "es": 'Días laborables'},
    'Wespen oder Hornissen': {
        "en": 'Wasps or hornets', "tr": 'Arı veya eşek arısı',
        "es": 'Avispas o avispones'},
    'Wiederkehrend': {
        "en": 'Recurring', "tr": 'Tekrarlayan',
        "es": 'Recurrente'},
    'Wird abtransportiert': {
        "en": 'Taken away', "tr": 'Uzaklaştırılacak',
        "es": 'Se retira'},
    'Wird bauseits gestellt': {
        "en": 'Provided by the customer', "tr": 'Müşteri temin eder',
        "es": 'Lo aporta el cliente'},
    'Wird benötigt': {
        "en": 'Needed', "tr": 'Gerekli',
        "es": 'Se necesita'},
    'Wohnraum': {
        "en": 'Living space', "tr": 'Yaşam alanı',
        "es": 'Zona de estar'},
    'Wohnung': {
        "en": 'Flat', "tr": 'Daire',
        "es": 'Vivienda'},
    'Während der Bürozeit': {
        "en": 'During office hours', "tr": 'Mesai saatlerinde',
        "es": 'En horario de oficina'},
    'Wärmebrücke': {
        "en": 'Thermal bridge', "tr": 'Isı köprüsü',
        "es": 'Puente térmico'},
    'Wöchentlich': {
        "en": 'Weekly', "tr": 'Haftalık',
        "es": 'Semanal'},
    'Zaun oder Sichtschutz': {
        "en": 'Fence or screen', "tr": 'Çit veya paravan',
        "es": 'Valla o panel'},
    'Zeitsteuerung': {
        "en": 'Timer control', "tr": 'Zaman kontrolü',
        "es": 'Programador'},
    'Ziegel': {
        "en": 'Brick', "tr": 'Tuğla',
        "es": 'Ladrillo'},
    'Ziegel oder Beton': {
        "en": 'Brick or concrete', "tr": 'Tuğla veya beton',
        "es": 'Ladrillo u hormigón'},
    'Ziegel oder Putz': {
        "en": 'Brick or render', "tr": 'Tuğla veya sıva',
        "es": 'Ladrillo o revoco'},
    'Zisterne': {
        "en": 'Rainwater tank', "tr": 'Sarnıç',
        "es": 'Aljibe'},
    'Zugeputzt oder verbaut': {
        "en": 'Plastered over or boxed in', "tr": 'Sıvanmış veya kapatılmış',
        "es": 'Tapiado o encerrado'},
    'Zusätzlich Außenflächen und Müllplatz': {
        "en": 'Plus outdoor areas and bin store', "tr": 'Ek olarak dış alanlar ve çöp yeri',
        "es": 'Además zonas exteriores y cuarto de basuras'},
    'Zusätzlich Fenster innen': {
        "en": 'Plus windows inside', "tr": 'Ek olarak iç pencereler',
        "es": 'Además ventanas por dentro'},
    'Zusätzlich Glas, Geländer, Müllraum': {
        "en": 'Plus glass, handrails, bin room', "tr": 'Ek olarak cam, korkuluk, çöp odası',
        "es": 'Además cristales, barandillas, cuarto de basuras'},
    'Zusätzlich Schränke innen und Fenster': {
        "en": 'Plus inside cupboards and windows', "tr": 'Ek olarak dolap içleri ve pencereler',
        "es": 'Además interior de armarios y ventanas'},
    'Zweimal': {
        "en": 'Twice', "tr": 'İki kez',
        "es": 'Dos manos'},
    'Älter als ein Monat': {
        "en": 'More than a month old', "tr": 'Bir aydan eski',
        "es": 'De más de un mes'},
    'Älter, aber mit Schutzleiter': {
        "en": 'Older, but with an earth', "tr": 'Eski ama topraklı',
        "es": 'Antigua, pero con toma de tierra'},
    'Öl oder Hartwachs': {
        "en": 'Oil or hard wax', "tr": 'Yağ veya sert mum',
        "es": 'Aceite o cera dura'},
    'Über 10 m, Seilklettertechnik': {
        "en": 'Over 10 m, rope access', "tr": '10 m üzeri, halatla tırmanma',
        "es": 'Más de 10 m, trepa con cuerda'},
    'Über 100 cm': {
        "en": 'Over 100 cm', "tr": '100 cm üzeri',
        "es": 'Más de 100 cm'},
    'Über 15 m': {
        "en": 'Over 15 m', "tr": '15 m üzeri',
        "es": 'Más de 15 m'},
    'Über 15 mm': {
        "en": 'Over 15 mm', "tr": '15 mm üzeri',
        "es": 'Más de 15 mm'},
    'Über 175 cm': {
        "en": 'Over 175 cm', "tr": '175 cm üzeri',
        "es": 'Más de 175 cm'},
    'Über 2,5 m': {
        "en": 'Over 2.5 m', "tr": '2,5 m üzeri',
        "es": 'Más de 2,5 m'},
    'Über 3 mm': {
        "en": 'Over 3 mm', "tr": '3 mm üzeri',
        "es": 'Más de 3 mm'},
    'Über 5 m': {
        "en": 'Over 5 m', "tr": '5 m üzeri',
        "es": 'Más de 5 m'},
    'Über 8 x 4 m': {
        "en": 'Over 8 x 4 m', "tr": '8 x 4 m üzeri',
        "es": 'Más de 8 x 4 m'},
    'Über WC oder Ablauf': {
        "en": 'Via the WC or a waste outlet', "tr": 'Klozet veya giderden',
        "es": 'Por el inodoro o un desagüe'},
    'Massivwand': {
        "en": 'Solid wall', "tr": 'Masif duvar',
        "es": 'Muro macizo'},
    'Matratze': {
        "en": 'Mattress', "tr": 'Yatak',
        "es": 'Colchón'},
    'Mehr als 4 Geschosse': {
        "en": 'More than 4 storeys', "tr": '4 kattan fazla',
        "es": 'Más de 4 plantas'},
    'Mehr als 6': {
        "en": 'More than 6', "tr": "6'dan fazla",
        "es": 'Más de 6'},
    'Mehrere Abläufe': {
        "en": 'Several outlets', "tr": 'Birden fazla gider',
        "es": 'Varios desagües'},
    'Mehrere Anlagen': {
        "en": 'Several facilities', "tr": 'Birden fazla tesis',
        "es": 'Varias instalaciones'},
    'Mehrere Einheiten oder Gebäude': {
        "en": 'Several units or buildings', "tr": 'Birden fazla birim veya bina',
        "es": 'Varias unidades o edificios'},
    'Mineralwolle': {
        "en": 'Mineral wool', "tr": 'Taş yünü',
        "es": 'Lana mineral'},
    'Mit Heizung': {
        "en": 'With heating', "tr": 'Isıtmalı',
        "es": 'Con calefacción'},
    'Mit Hohlkehle': {
        "en": 'With a cove', "tr": 'İç bükey pahlı',
        "es": 'Con media caña'},
    'Mit Kochinsel': {
        "en": 'With an island', "tr": 'Ada mutfaklı',
        "es": 'Con isla'},
    'Mit Video': {
        "en": 'With video', "tr": 'Görüntülü',
        "es": 'Con vídeo'},
    'Modern, mit FI': {
        "en": 'Modern, with RCD', "tr": 'Modern, kaçak akım röleli',
        "es": 'Moderna, con diferencial'},
    'Motor defekt': {
        "en": 'Motor faulty', "tr": 'Motor arızalı',
        "es": 'Motor averiado'},
    'Muss erst geöffnet werden': {
        "en": 'Has to be opened up first', "tr": 'Önce açılması gerekiyor',
        "es": 'Hay que abrirlo antes'},
    'Muster, Fischgrät oder Bordüre': {
        "en": 'Pattern, herringbone or border', "tr": 'Desen, balıksırtı veya bordür',
        "es": 'Dibujo, espiga o cenefa'},
    'Möbel und Einrichtung': {
        "en": 'Furniture and fittings', "tr": 'Mobilya ve donanım',
        "es": 'Muebles y equipamiento'},
    'Möbelwaschtisch mit Unterschrank': {
        "en": 'Vanity basin with unit', "tr": 'Dolaplı lavabo',
        "es": 'Lavabo con mueble'},
    'Müssen versetzt werden': {
        "en": 'Have to be moved', "tr": 'Kaydırılmalı',
        "es": 'Hay que desplazarlas'},
    'Nach Schaden': {
        "en": 'After damage', "tr": 'Hasar sonrası',
        "es": 'Tras un siniestro'},
    'Nacht oder Sonn-/Feiertag': {
        "en": 'Night, Sunday or public holiday', "tr": 'Gece veya pazar/resmi tatil',
        "es": 'Noche, domingo o festivo'},
    'Nacht/Sonntag': {
        "en": 'Night / Sunday', "tr": 'Gece/pazar',
        "es": 'Noche/domingo'},
    'Nachts': {
        "en": 'At night', "tr": 'Geceleyin',
        "es": 'De noche'},
    'Nass reinigen mit Aufsitzmaschine': {
        "en": 'Wet clean with ride-on machine', "tr": 'Binicili makineyle ıslak temizlik',
        "es": 'Fregado con máquina conductor sentado'},
    'Naturstein': {
        "en": 'Natural stone', "tr": 'Doğal taş',
        "es": 'Piedra natural'},
    'Naturstein oder Keramik, bauseits aufgemessen': {
        "en": 'Natural stone or ceramic, measured on site', "tr": 'Doğal taş veya seramik, yerinde ölçülü',
        "es": 'Piedra o cerámica, medida in situ'},
    'Neigbar': {
        "en": 'Tilting', "tr": 'Eğilebilir',
        "es": 'Inclinable'},
    'Nein': {
        "en": 'No', "tr": 'Hayır',
        "es": 'No'},
    'Nein / unbekannt': {
        "en": 'No / unknown', "tr": 'Hayır / bilinmiyor',
        "es": 'No / se desconoce'},
    'Nein, Standardwerkzeug': {
        "en": 'No, standard tools', "tr": 'Hayır, standart alet',
        "es": 'No, herramienta estándar'},
    'Nein, muss nachgerüstet werden': {
        "en": 'No, has to be retrofitted', "tr": 'Hayır, sonradan eklenmeli',
        "es": 'No, hay que instalarlo'},
    'Neu an bestehende Leitung': {
        "en": 'New, onto the existing pipe', "tr": 'Mevcut hatta yeni bağlantı',
        "es": 'Nuevo, a la tubería existente'},
    'Neu erforderlich': {
        "en": 'New one needed', "tr": 'Yenisi gerekli',
        "es": 'Se necesita nuevo'},
    'Neu gemauert und gefliest': {
        "en": 'Newly built and tiled', "tr": 'Yeni örülmüş ve kaplanmış',
        "es": 'De obra nueva y alicatado'},
    'Neu herzustellen': {
        "en": 'To be newly formed', "tr": 'Yeniden yapılacak',
        "es": 'A ejecutar de nuevo'},
    'Neu, unbehandelt': {
        "en": 'New, untreated', "tr": 'Yeni, işlemsiz',
        "es": 'Nueva, sin tratar'},
    'Neue Holzzarge': {
        "en": 'New timber frame', "tr": 'Yeni ahşap kasa',
        "es": 'Marco de madera nuevo'},
    'Neue Zuleitung erforderlich': {
        "en": 'New supply cable needed', "tr": 'Yeni besleme hattı gerekli',
        "es": 'Se necesita nueva alimentación'},
    'Neues Fertigelement': {
        "en": 'New ready-made panel', "tr": 'Yeni hazır eleman',
        "es": 'Nuevo panel prefabricado'},
    'Nicht enthalten': {
        "en": 'Not included', "tr": 'Dahil değil',
        "es": 'No incluido'},
    'Nicht erforderlich': {
        "en": 'Not required', "tr": 'Gerekli değil',
        "es": 'No necesario'},
    'Nicht nötig, Leiter reicht': {
        "en": 'Not needed, a ladder will do', "tr": 'Gerek yok, merdiven yeterli',
        "es": 'No hace falta, basta una escalera'},
    'Niederdruck mit Reiniger': {
        "en": 'Low pressure with detergent', "tr": 'Deterjanlı düşük basınç',
        "es": 'Baja presión con detergente'},
    'Nischentür': {
        "en": 'Recess door', "tr": 'Niş kapısı',
        "es": 'Puerta de nicho'},
    'Noch unklar': {
        "en": 'Not yet clear', "tr": 'Henüz belirsiz',
        "es": 'Aún no está claro'},
    'Noch zu klären': {
        "en": 'Still to be settled', "tr": 'Henüz netleşmedi',
        "es": 'Pendiente de aclarar'},
    'Nur Audio': {
        "en": 'Audio only', "tr": 'Sadece sesli',
        "es": 'Solo audio'},
    'Nur Silikonfugen': {
        "en": 'Silicone joints only', "tr": 'Sadece silikon derzler',
        "es": 'Solo juntas de silicona'},
    'Nur ein WC': {
        "en": 'One WC only', "tr": 'Sadece bir klozet',
        "es": 'Solo un inodoro'},
    'Nur eine Seite': {
        "en": 'One side only', "tr": 'Sadece bir taraf',
        "es": 'Solo un lado'},
    'Nur von außen': {
        "en": 'From outside only', "tr": 'Sadece dışarıdan',
        "es": 'Solo desde fuera'},
    'Nur zugefallen': {
        "en": 'Just latched shut', "tr": 'Sadece çarparak kapanmış',
        "es": 'Solo cerrada de golpe'},
    'Obstbaum, vom Boden erreichbar': {
        "en": 'Fruit tree, reachable from the ground', "tr": 'Meyve ağacı, yerden erişilebilir',
        "es": 'Frutal, accesible desde el suelo'},
    'PKW-Stellplatz oder Einfahrt': {
        "en": 'Parking bay or driveway', "tr": 'Otopark yeri veya giriş',
        "es": 'Plaza de aparcamiento o entrada'},
    'PVC oder Linoleum, geklebt': {
        "en": 'PVC or linoleum, bonded', "tr": 'PVC veya linolyum, yapıştırılmış',
        "es": 'PVC o linóleo, encolado'},
    'Panzer beschädigt': {
        "en": 'Curtain damaged', "tr": 'Panjur lamelleri hasarlı',
        "es": 'Lamas dañadas'},
    'Parkett, geklebt': {
        "en": 'Parquet, bonded', "tr": 'Parke, yapıştırılmış',
        "es": 'Parqué, encolado'},
    'Periodisch': {
        "en": 'Periodic', "tr": 'Periyodik',
        "es": 'Periódica'},
    'Plissee oder Rollo': {
        "en": 'Pleated or roller screen', "tr": 'Plise veya stor',
        "es": 'Plisada o enrollable'},
    'Polstermöbel': {
        "en": 'Upholstered furniture', "tr": 'Döşemeli mobilya',
        "es": 'Mueble tapizado'},
    'Porenbeton oder Altbauputz': {
        "en": 'Aerated block or old render', "tr": 'Gazbeton veya eski sıva',
        "es": 'Hormigón celular o revoco antiguo'},
    'Prüfliste': {
        "en": 'Checklist', "tr": 'Kontrol listesi',
        "es": 'Lista de comprobación'},
    'Punktfundamente': {
        "en": 'Pad foundations', "tr": 'Nokta temeller',
        "es": 'Zapatas aisladas'},
    'Putz oder Beton': {
        "en": 'Render or concrete', "tr": 'Sıva veya beton',
        "es": 'Revoco u hormigón'},
    'Putz oder Mauerwerk, tragfähig': {
        "en": 'Render or masonry, sound', "tr": 'Sıva veya duvar, taşıyıcı',
        "es": 'Revoco o fábrica, con resistencia'},
    'Putz, intakt gestrichen': {
        "en": 'Render, soundly painted', "tr": 'Sıva, sağlam boyalı',
        "es": 'Revoco, pintado y en buen estado'},
    'Putz, kreidend': {
        "en": 'Render, chalking', "tr": 'Sıva, tebeşirlenmiş',
        "es": 'Revoco, pulverulento'},
    'Ratten oder Mäuse': {
        "en": 'Rats or mice', "tr": 'Fare veya sıçan',
        "es": 'Ratas o ratones'},
    'Raufaser, einmal gestrichen': {
        "en": 'Woodchip, painted once', "tr": 'Kabartmalı kağıt, bir kez boyalı',
        "es": 'Fibra, pintada una vez'},
    'Raufaser, gestrichen': {
        "en": 'Woodchip, painted', "tr": 'Kabartmalı kağıt, boyalı',
        "es": 'Fibra, pintada'},
    'Raufaser, mehrfach überstrichen': {
        "en": 'Woodchip, painted several times', "tr": 'Kabartmalı kağıt, defalarca boyalı',
        "es": 'Fibra, pintada varias veces'},
    'Reibeputz': {
        "en": 'Float-finish render', "tr": 'Serpme sıva',
        "es": 'Revoco raspado'},
    'Revisionsschacht vorhanden': {
        "en": 'Inspection chamber present', "tr": 'Rögar mevcut',
        "es": 'Hay arqueta de registro'},
    'Rippenheizkörper': {
        "en": 'Column radiator', "tr": 'Dilimli radyatör',
        "es": 'Radiador de elementos'},
    'Rissig oder abblätternd': {
        "en": 'Cracked or flaking', "tr": 'Çatlak veya kabarmış',
        "es": 'Agrietado o descascarillado'},
    'Rohrreinigungsspirale': {
        "en": 'Drain auger', "tr": 'Kanal açma spirali',
        "es": 'Sonda de desatasco'},
    'Rollputz': {
        "en": 'Roll-on render', "tr": 'Rulo sıva',
        "es": 'Revoco a rodillo'},
    'Runddusche': {
        "en": 'Quadrant enclosure', "tr": 'Yuvarlak duş',
        "es": 'Ducha curva'},
    'Schaben': {
        "en": 'Cockroaches', "tr": 'Hamamböceği',
        "es": 'Cucarachas'},
    'Schadhafte Fugen': {
        "en": 'Damaged joints', "tr": 'Hasarlı derzler',
        "es": 'Juntas dañadas'},
    'Schrankwand oder Eckschrank': {
        "en": 'Wall unit or corner wardrobe', "tr": 'Duvar ünitesi veya köşe dolabı',
        "es": 'Mueble de pared o armario rinconero'},
    'Schwenkarm': {
        "en": 'Swing arm', "tr": 'Hareketli kol',
        "es": 'Brazo articulado'},
    'Schwerlast': {
        "en": 'Heavy duty', "tr": 'Ağır yük',
        "es": 'Tráfico pesado'},
    'Seit heute': {
        "en": 'Since today', "tr": 'Bugünden beri',
        "es": 'Desde hoy'},
    'Senkrecht- oder Fallarmmarkise': {
        "en": 'Vertical or drop-arm awning', "tr": 'Dikey veya düşer kollu tente',
        "es": 'Toldo vertical o de brazos caídos'},
    'Setzriss, durchgehend': {
        "en": 'Settlement crack, through', "tr": 'Oturma çatlağı, boydan boya',
        "es": 'Fisura de asiento, pasante'},
    'Sicherheitsschloss oder Mehrfachverriegelung': {
        "en": 'Security lock or multipoint', "tr": 'Güvenlik kilidi veya çoklu kilit',
        "es": 'Cerradura de seguridad o multipunto'},
    'Sicherheitszylinder mit Karte': {
        "en": 'Security cylinder with card', "tr": 'Kartlı güvenlik göbeği',
        "es": 'Bombín de seguridad con tarjeta'},
    'Sichtbar': {
        "en": 'Surface run', "tr": 'Görünür',
        "es": 'A la vista'},
    'Sichtbar zugänglich': {
        "en": 'Visibly accessible', "tr": 'Görünür şekilde erişilebilir',
        "es": 'Accesible a la vista'},
    'Sichtbeton': {
        "en": 'Fair-faced concrete', "tr": 'Brüt beton',
        "es": 'Hormigón visto'},
    'Sickerschacht': {
        "en": 'Soakaway', "tr": 'Sızdırma kuyusu',
        "es": 'Pozo filtrante'},
    'Siphon öffnen und reinigen': {
        "en": 'Open and clean the trap', "tr": 'Sifonu açıp temizlemek',
        "es": 'Abrir y limpiar el sifón'},
    'Smart Home': {
        "en": 'Smart home', "tr": 'Akıllı ev',
        "es": 'Domótica'},
    'Sondermaß, Zuschnitt nötig': {
        "en": 'Special size, cutting needed', "tr": 'Özel ölçü, kesim gerekli',
        "es": 'Medida especial, hay que cortar'},
    'Sondermaß, muss angepasst werden': {
        "en": 'Special size, has to be adapted', "tr": 'Özel ölçü, uyarlanmalı',
        "es": 'Medida especial, hay que adaptarla'},
    'Spannrahmen im Fensterfalz': {
        "en": 'Tension frame in the rebate', "tr": 'Pencere fitilinde gergi çerçeve',
        "es": 'Marco a presión en el galce'},
    'Splitt': {
        "en": 'Grit', "tr": 'Mıcır',
        "es": 'Gravilla'},
    'Splittbett': {
        "en": 'Grit bed', "tr": 'Mıcır yatağı',
        "es": 'Cama de gravilla'},
    'Sprossenfenster': {
        "en": 'Muntin window', "tr": 'Kayıtlı pencere',
        "es": 'Ventana con cuarterones'},
    'Spülventil': {
        "en": 'Flush valve', "tr": 'Boşaltma valfi',
        "es": 'Válvula de descarga'},
    'Stahl-Email, Standardmaß': {
        "en": 'Enamelled steel, standard size', "tr": 'Emaye çelik, standart ölçü',
        "es": 'Acero esmaltado, medida estándar'},
    'Stahlzarge, einputzen': {
        "en": 'Steel frame, to be rendered in', "tr": 'Çelik kasa, sıvaya gömme',
        "es": 'Marco de acero, a empotrar'},
    'Stand-WC auf wandhängend umbauen': {
        "en": 'Convert floor WC to wall-hung', "tr": 'Ayaklı klozeti asmaya çevirmek',
        "es": 'Pasar de inodoro a suelo a suspendido'},
    'Stand-WC gegen Stand-WC': {
        "en": 'Floor WC for floor WC', "tr": 'Ayaklı klozet yerine ayaklı',
        "es": 'Inodoro a suelo por otro igual'},
    'Standard': {
        "en": 'Standard', "tr": 'Standart',
        "es": 'Estándar'},
    'Standard-Waschtisch': {
        "en": 'Standard basin', "tr": 'Standart lavabo',
        "es": 'Lavabo estándar'},
    'Standardfenster': {
        "en": 'Standard window', "tr": 'Standart pencere',
        "es": 'Ventana estándar'},
    'Standardgeräte einbauen': {
        "en": 'Fit standard appliances', "tr": 'Standart cihazları takmak',
        "es": 'Instalar electrodomésticos estándar'},
    'Standardmaß ab Lager': {
        "en": 'Standard size from stock', "tr": 'Stoktan standart ölçü',
        "es": 'Medida estándar de almacén'},
    'Standardschalter oder Steckdose': {
        "en": 'Standard switch or socket', "tr": 'Standart anahtar veya priz',
        "es": 'Interruptor o enchufe estándar'},
    'Standardzylinder': {
        "en": 'Standard cylinder', "tr": 'Standart göbek',
        "es": 'Bombín estándar'},
    'Standspeicher': {
        "en": 'Floor-standing cylinder', "tr": 'Ayaklı depo',
        "es": 'Acumulador de pie'},
    'Standsäule im Garten': {
        "en": 'Bollard in the garden', "tr": 'Bahçede sütun',
        "es": 'Columna en el jardín'},
    'Stark abgenutzt, tiefe Kratzer': {
        "en": 'Heavily worn, deep scratches', "tr": 'Çok yıpranmış, derin çizikler',
        "es": 'Muy desgastado, arañazos profundos'},
    'Stark, Tierhaare oder Urin': {
        "en": 'Heavy, pet hair or urine', "tr": 'Yoğun, hayvan tüyü veya idrar',
        "es": 'Fuerte, pelo de mascota u orina'},
    'Stark, mehrere Bäume': {
        "en": 'Heavy, several trees', "tr": 'Yoğun, birden fazla ağaç',
        "es": 'Abundante, varios árboles'},
    'Starr': {
        "en": 'Fixed', "tr": 'Sabit',
        "es": 'Fijo'},
    'Staub und Flugschmutz': {
        "en": 'Dust and airborne dirt', "tr": 'Toz ve uçucu kir',
        "es": 'Polvo y suciedad ambiental'},
    'Staudenbeet': {
        "en": 'Perennial bed', "tr": 'Çok yıllık bitki tarhı',
        "es": 'Arriate de vivaces'},
    'Stelzlager': {
        "en": 'Pedestals', "tr": 'Ayak takozu',
        "es": 'Plots regulables'},
    'Stelzlager, lose': {
        "en": 'Pedestals, loose laid', "tr": 'Ayak takozu, serbest',
        "es": 'Plots, colocación suelta'},
    'Stufen bereits ausgeglichen': {
        "en": 'Steps already levelled', "tr": 'Basamaklar tesviye edilmiş',
        "es": 'Peldaños ya nivelados'},
    'Stützmauer, Geländesprung': {
        "en": 'Retaining wall, change of level', "tr": 'İstinat duvarı, kot farkı',
        "es": 'Muro de contención, desnivel'},
    'Ganze Wohnung': {
        "en": 'The whole flat', "tr": 'Tüm daire',
        "es": 'Toda la vivienda'},
    'Ganzes Haus': {
        "en": 'The whole house', "tr": 'Tüm ev',
        "es": 'Toda la casa'},
    'Gastherme': {
        "en": 'Gas boiler', "tr": 'Kombi',
        "es": 'Caldera de gas'},
    'Gehoben': {
        "en": 'Upper spec', "tr": 'Üst seviye',
        "es": 'Gama alta'},
    'Gehölze und Solitäre': {
        "en": 'Shrubs and specimens', "tr": 'Çalı ve soliter bitki',
        "es": 'Arbustos y ejemplares'},
    'Gelenkarmmarkise': {
        "en": 'Folding-arm awning', "tr": 'Mafsallı kol tente',
        "es": 'Toldo de brazos articulados'},
    'Gerade / im Verband': {
        "en": 'Straight / stretcher bond', "tr": 'Düz / şaşırtmalı',
        "es": 'Recto / a matajunta'},
    'Gerader Ansatz': {
        "en": 'Straight match', "tr": 'Düz ek',
        "es": 'Casado recto'},
    'Gerüst oder Hebebühne': {
        "en": 'Scaffold or platform', "tr": 'İskele veya platform',
        "es": 'Andamio o plataforma'},
    'Gestaltung, frei stehend': {
        "en": 'Decorative, free-standing', "tr": 'Dekoratif, serbest duran',
        "es": 'Ornamental, exento'},
    'Gewerbeobjekt': {
        "en": 'Commercial property', "tr": 'Ticari mülk',
        "es": 'Local comercial'},
    'Gipskarton': {
        "en": 'Plasterboard', "tr": 'Alçıpan',
        "es": 'Placa de yeso'},
    'Gipskarton / Hohlwand': {
        "en": 'Plasterboard / hollow wall', "tr": 'Alçıpan / boşluklu duvar',
        "es": 'Placa de yeso / tabique hueco'},
    'Gipskarton oder Gipsfaser': {
        "en": 'Plasterboard or fibreboard', "tr": 'Alçıpan veya alçı lif levha',
        "es": 'Placa de yeso o fibra-yeso'},
    'Gipskarton oder Hohlwand': {
        "en": 'Plasterboard or hollow wall', "tr": 'Alçıpan veya boşluklu duvar',
        "es": 'Placa de yeso o tabique hueco'},
    'Gipskarton oder Holz': {
        "en": 'Plasterboard or timber', "tr": 'Alçıpan veya ahşap',
        "es": 'Placa de yeso o madera'},
    'Gipskarton, neu gespachtelt': {
        "en": 'Plasterboard, newly filled', "tr": 'Alçıpan, yeni alçılı',
        "es": 'Placa de yeso, recién enlucida'},
    'Glas oder Alu': {
        "en": 'Glass or aluminium', "tr": 'Cam veya alüminyum',
        "es": 'Vidrio o aluminio'},
    'Glatter Lack, Glas oder Metall': {
        "en": 'Smooth paint, glass or metal', "tr": 'Düz boya, cam veya metal',
        "es": 'Pintura lisa, vidrio o metal'},
    'Graffiti': {
        "en": 'Graffiti', "tr": 'Grafiti',
        "es": 'Grafitis'},
    'Grobreinigung, noch Rohbau': {
        "en": 'Rough clean, still shell', "tr": 'Kaba temizlik, henüz kaba yapı',
        "es": 'Limpieza gruesa, aún en bruto'},
    'Großflächiges Glaselement': {
        "en": 'Large glazed unit', "tr": 'Büyük cam eleman',
        "es": 'Gran paño acristalado'},
    'Gurt gerissen': {
        "en": 'Strap has snapped', "tr": 'Kayış kopmuş',
        "es": 'Cinta rota'},
    'Gurtwickler defekt': {
        "en": 'Strap winder faulty', "tr": 'Kayış sarıcı arızalı',
        "es": 'Recogedor averiado'},
    'Gut, nur anschleifen': {
        "en": 'Good, just needs a sand', "tr": 'İyi, sadece zımpara',
        "es": 'Bien, solo lijar'},
    'Haarriss im Putz': {
        "en": 'Hairline crack in the render', "tr": 'Sıvada kılcal çatlak',
        "es": 'Fisura capilar en el revoco'},
    'Hausanschluss': {
        "en": 'Mains supply', "tr": 'Şebeke bağlantısı',
        "es": 'Acometida'},
    'Hebeanlage erforderlich': {
        "en": 'Lifting station needed', "tr": 'Terfi ünitesi gerekli',
        "es": 'Se necesita bomba de elevación'},
    'Heizung, Abdeckung, Gegenstromanlage': {
        "en": 'Heating, cover, counter-current unit', "tr": 'Isıtma, örtü, karşı akım ünitesi',
        "es": 'Calefacción, cubierta, contracorriente'},
    'Heißwasser oder Dampf': {
        "en": 'Hot water or steam', "tr": 'Sıcak su veya buhar',
        "es": 'Agua caliente o vapor'},
    'Herd mit Kochfeld': {
        "en": 'Cooker with hob', "tr": 'Ocaklı fırın',
        "es": 'Cocina con placa'},
    'Hochdruck': {
        "en": 'High pressure', "tr": 'Yüksek basınç',
        "es": 'Alta presión'},
    'Hochdruck mit Schmutzwasseraufnahme': {
        "en": 'High pressure with waste pick-up', "tr": 'Atık su toplamalı yüksek basınç',
        "es": 'Alta presión con recogida de agua'},
    'Hochdruckspülung': {
        "en": 'High-pressure jetting', "tr": 'Yüksek basınçlı yıkama',
        "es": 'Hidrolimpieza a presión'},
    'Holz': {
        "en": 'Timber', "tr": 'Ahşap',
        "es": 'Madera'},
    'Holzdielen': {
        "en": 'Floorboards', "tr": 'Ahşap döşeme',
        "es": 'Entarimado'},
    'Holzfaser': {
        "en": 'Wood fibre', "tr": 'Ahşap lif',
        "es": 'Fibra de madera'},
    'Holzfassade': {
        "en": 'Timber facade', "tr": 'Ahşap cephe',
        "es": 'Fachada de madera'},
    'Holzschäden sichtbar': {
        "en": 'Timber damage visible', "tr": 'Ahşap hasarı görünür',
        "es": 'Daños en la madera visibles'},
    'Holztreppe': {
        "en": 'Timber stairs', "tr": 'Ahşap merdiven',
        "es": 'Escalera de madera'},
    'Hängeleuchte': {
        "en": 'Pendant light', "tr": 'Sarkıt armatür',
        "es": 'Lámpara colgante'},
    'Hängeschrank oder schwere Last': {
        "en": 'Wall unit or heavy load', "tr": 'Asma dolap veya ağır yük',
        "es": 'Mueble alto o carga pesada'},
    'Im Boden oder Estrich': {
        "en": 'In the floor or screed', "tr": 'Zeminde veya şapta',
        "es": 'En el suelo o la solera'},
    'Im Hohlraum oder Kabelkanal': {
        "en": 'In a void or trunking', "tr": 'Boşlukta veya kablo kanalında',
        "es": 'En hueco o canaleta'},
    'Im Kabelkanal': {
        "en": 'In trunking', "tr": 'Kablo kanalında',
        "es": 'En canaleta'},
    'In der Wand': {
        "en": 'In the wall', "tr": 'Duvarda',
        "es": 'En la pared'},
    'Indirekt über Heizung': {
        "en": 'Indirect from the heating', "tr": 'Isıtmadan dolaylı',
        "es": 'Indirecto por la calefacción'},
    'Induktion, mehrphasig': {
        "en": 'Induction, multi-phase', "tr": 'İndüksiyon, çok fazlı',
        "es": 'Inducción, multifásica'},
    'Inkl. Kochfeld, Dunstabzug, Geschirrspüler': {
        "en": 'Incl. hob, extractor, dishwasher', "tr": 'Ocak, davlumbaz, bulaşık makinesi dahil',
        "es": 'Incl. placa, campana, lavavajillas'},
    'Intakt, nur anschleifen': {
        "en": 'Sound, just needs a sand', "tr": 'Sağlam, sadece zımpara',
        "es": 'En buen estado, solo lijar'},
    'Ja': {
        "en": 'Yes', "tr": 'Evet',
        "es": 'Sí'},
    'Ja, > 12 cm': {
        "en": 'Yes, more than 12 cm', "tr": 'Evet, > 12 cm',
        "es": 'Sí, más de 12 cm'},
    'Ja, eingemessen': {
        "en": 'Yes, surveyed', "tr": 'Evet, ölçülmüş',
        "es": 'Sí, replanteadas'},
    'Jalousieschalter': {
        "en": 'Blind switch', "tr": 'Panjur anahtarı',
        "es": 'Interruptor de persiana'},
    'Kabelkanal': {
        "en": 'Trunking', "tr": 'Kablo kanalı',
        "es": 'Canaleta'},
    'Kanal, mit Absperrblase': {
        "en": 'Drain, with stopper bag', "tr": 'Kanal, tıkaç balonlu',
        "es": 'Saneamiento, con obturador'},
    'Kanalanschluss': {
        "en": 'Connection to the sewer', "tr": 'Kanal bağlantısı',
        "es": 'Conexión al alcantarillado'},
    'Kassettenmarkise': {
        "en": 'Cassette awning', "tr": 'Kaset tente',
        "es": 'Toldo cofre'},
    'Kehren und Wischen': {
        "en": 'Sweeping and mopping', "tr": 'Süpürme ve silme',
        "es": 'Barrido y fregado'},
    'Kein Ansatz / uni': {
        "en": 'No match / plain', "tr": 'Ek yok / düz',
        "es": 'Sin casado / liso'},
    'Kein Strom in einem Raum': {
        "en": 'No power in one room', "tr": 'Bir odada elektrik yok',
        "es": 'Sin corriente en una estancia'},
    'Kein Warmwasser oder Heizung aus': {
        "en": 'No hot water, or heating off', "tr": 'Sıcak su yok veya ısıtma kapalı',
        "es": 'Sin agua caliente o calefacción parada'},
    'Keine': {
        "en": 'None', "tr": 'Yok',
        "es": 'Ninguno'},
    'Keine bekannt': {
        "en": 'None known', "tr": 'Bilinen yok',
        "es": 'Ninguna conocida'},
    'Keine besonderen': {
        "en": 'Nothing particular', "tr": 'Özel bir şey yok',
        "es": 'Ninguna en particular'},
    'Keller': {
        "en": 'Cellar', "tr": 'Bodrum',
        "es": 'Sótano'},
    'Klassische Nullung / kein PE': {
        "en": 'Classic unearthed / no CPC', "tr": 'Klasik nötrleme / topraksız',
        "es": 'Neutralización clásica / sin PE'},
    'Kleiderschrank, 2 bis 3 Türen': {
        "en": 'Wardrobe, 2 to 3 doors', "tr": 'Gardırop, 2-3 kapılı',
        "es": 'Armario, 2 a 3 puertas'},
    'Kleinreparaturen': {
        "en": 'Small repairs', "tr": 'Küçük onarımlar',
        "es": 'Pequeñas reparaciones'},
    'Klick, schwimmend': {
        "en": 'Click, floating', "tr": 'Tık, yüzer',
        "es": 'Clic, flotante'},
    'Klinker oder Naturstein': {
        "en": 'Brick or natural stone', "tr": 'Klinker veya doğal taş',
        "es": 'Ladrillo visto o piedra natural'},
    'Knaufzylinder': {
        "en": 'Thumbturn cylinder', "tr": 'Topuzlu göbek',
        "es": 'Bombín con pomo'},
    'Kommode, Nachttisch, Stuhl': {
        "en": 'Chest, bedside table, chair', "tr": 'Komodin, sehpa, sandalye',
        "es": 'Cómoda, mesilla, silla'},
    'Kondensat / Lüftungsverhalten': {
        "en": 'Condensation / ventilation habits', "tr": 'Yoğuşma / havalandırma alışkanlığı',
        "es": 'Condensación / hábitos de ventilación'},
    'Kunststoff': {
        "en": 'Plastic', "tr": 'Plastik',
        "es": 'Plástico'},
    'Kupfer': {
        "en": 'Copper', "tr": 'Bakır',
        "es": 'Cobre'},
    'Küche': {
        "en": 'Kitchen', "tr": 'Mutfak',
        "es": 'Cocina'},
    'Küchenarmatur': {
        "en": 'Kitchen tap', "tr": 'Mutfak armatürü',
        "es": 'Grifo de cocina'},
    'Küchenspüle': {
        "en": 'Kitchen sink', "tr": 'Mutfak eviyesi',
        "es": 'Fregadero'},
    'L-Form': {
        "en": 'L-shape', "tr": 'L şekli',
        "es": 'En L'},
    'Laminat, schwimmend': {
        "en": 'Laminate, floating', "tr": 'Laminat, yüzer',
        "es": 'Laminado, flotante'},
    'Laminat, werkseitig zugeschnitten': {
        "en": 'Laminate, cut to size at works', "tr": 'Laminat, fabrikada kesilmiş',
        "es": 'Laminado, cortado en fábrica'},
    'Lasiert, intakt': {
        "en": 'Stained, sound', "tr": 'Verniklenmiş, sağlam',
        "es": 'Lasurada, en buen estado'},
    'Leer': {
        "en": 'Empty', "tr": 'Boş',
        "es": 'Vacío'},
    'Leicht': {
        "en": 'Light', "tr": 'Hafif',
        "es": 'Ligera'},
    'Leichte Gebrauchsspuren': {
        "en": 'Light wear', "tr": 'Hafif kullanım izi',
        "es": 'Ligeras marcas de uso'},
    'Liegt vor': {
        "en": 'Already granted', "tr": 'Mevcut',
        "es": 'Ya concedido'},
    'Lose verlegt': {
        "en": 'Loose laid', "tr": 'Serbest serilmiş',
        "es": 'Colocado suelto'},
    'Luft': {
        "en": 'Air', "tr": 'Hava',
        "es": 'Aire'},
    'Lärche': {
        "en": 'Larch', "tr": 'Melez çamı',
        "es": 'Alerce'},
    'Manuell': {
        "en": 'Manual', "tr": 'Manuel',
        "es": 'Manual'},
    'Maschinell kehren': {
        "en": 'Machine sweeping', "tr": 'Makineyle süpürme',
        "es": 'Barrido mecánico'},
    'Massivholz, vor Ort anpassen': {
        "en": 'Solid timber, cut on site', "tr": 'Masif ahşap, yerinde uyarlama',
        "es": 'Madera maciza, ajuste in situ'},
    '1 bis 3 mm': {
        "en": '1 to 3 mm', "tr": '1 ila 3 mm',
        "es": 'De 1 a 3 mm'},
    '1,5 bis 2,5 m': {
        "en": '1.5 to 2.5 m', "tr": '1,5 ila 2,5 m',
        "es": 'De 1,5 a 2,5 m'},
    '100 bis 175 cm': {
        "en": '100 to 175 cm', "tr": '100 ila 175 cm',
        "es": 'De 100 a 175 cm'},
    '100 cm': {
        "en": '100 cm', "tr": '100 cm',
        "es": '100 cm'},
    '100 x 100': {
        "en": '100 x 100', "tr": '100 x 100',
        "es": '100 x 100'},
    '12 cm': {
        "en": '12 cm', "tr": '12 cm',
        "es": '12 cm'},
    '16 cm': {
        "en": '16 cm', "tr": '16 cm',
        "es": '16 cm'},
    '20 cm': {
        "en": '20 cm', "tr": '20 cm',
        "es": '20 cm'},
    '150 cm': {
        "en": '150 cm', "tr": '150 cm',
        "es": '150 cm'},
    '180 cm': {
        "en": '180 cm', "tr": '180 cm',
        "es": '180 cm'},
    '200 cm': {
        "en": '200 cm', "tr": '200 cm',
        "es": '200 cm'},
    '60 x 120': {
        "en": '60 x 120', "tr": '60 x 120',
        "es": '60 x 120'},
    '120 x 240 oder größer': {
        "en": '120 x 240 or larger', "tr": '120 x 240 veya daha büyük',
        "es": '120 x 240 o mayor'},
    '14-tägig in der Saison': {
        "en": 'Fortnightly in season', "tr": 'Sezonda iki haftada bir',
        "es": 'Quincenal en temporada'},
    '24-Stunden-Bereitschaft': {
        "en": '24-hour standby', "tr": '24 saat nöbet',
        "es": 'Disponibilidad 24 horas'},
    '3 bis 4 Geschosse': {
        "en": '3 to 4 storeys', "tr": '3 ila 4 kat',
        "es": 'De 3 a 4 plantas'},
    '3 bis 5 m': {
        "en": '3 to 5 m', "tr": '3 ila 5 m',
        "es": 'De 3 a 5 m'},
    '3x pro Woche': {
        "en": 'Three times a week', "tr": 'Haftada 3 kez',
        "es": 'Tres veces por semana'},
    '4 bis 6': {
        "en": '4 to 6', "tr": '4 ila 6',
        "es": 'De 4 a 6'},
    '5 bis 15 mm': {
        "en": '5 to 15 mm', "tr": '5 ila 15 mm',
        "es": 'De 5 a 15 mm'},
    '6 x 3 bis 8 x 4 m': {
        "en": '6 x 3 to 8 x 4 m', "tr": '6 x 3 ila 8 x 4 m',
        "es": 'De 6 x 3 a 8 x 4 m'},
    '60 bis 100 cm': {
        "en": '60 to 100 cm', "tr": '60 ila 100 cm',
        "es": 'De 60 a 100 cm'},
    '8 bis 15 m': {
        "en": '8 to 15 m', "tr": '8 ila 15 m',
        "es": 'De 8 a 15 m'},
    'Abblätternd': {
        "en": 'Flaking', "tr": 'Kabarmış',
        "es": 'Descascarillada'},
    'Abend oder Samstag': {
        "en": 'Evening or Saturday', "tr": 'Akşam veya cumartesi',
        "es": 'Tarde o sábado'},
    'Abend/Samstag': {
        "en": 'Evening / Saturday', "tr": 'Akşam/cumartesi',
        "es": 'Tarde/sábado'},
    'Abgesperrt': {
        "en": 'Deadlocked', "tr": 'Kilitli',
        "es": 'Cerrada con llave'},
    'Acryl mit Wannenträger': {
        "en": 'Acrylic with support tray', "tr": 'Küvet taşıyıcılı akrilik',
        "es": 'Acrílico con bastidor'},
    'Algen und Grünbelag': {
        "en": 'Algae and green growth', "tr": 'Yosun ve yeşil tabaka',
        "es": 'Algas y verdín'},
    'Alle Fugen ausfräsen': {
        "en": 'Rake out all joints', "tr": 'Tüm derzleri açmak',
        "es": 'Fresar todas las juntas'},
    'Allgemeine Handwerksarbeiten': {
        "en": 'General trade work', "tr": 'Genel ustalık işleri',
        "es": 'Trabajos generales'},
    'Altbau, Leim- oder Kalkfarbe': {
        "en": 'Period building, distemper or limewash', "tr": 'Eski yapı, tutkal veya kireç boya',
        "es": 'Edificio antiguo, temple o cal'},
    'Alte Papiertapete, mehrlagig': {
        "en": 'Old paper wallpaper, several layers', "tr": 'Eski kağıt duvar kağıdı, çok katlı',
        "es": 'Papel antiguo, varias capas'},
    'Alter Gussradiator': {
        "en": 'Old cast-iron radiator', "tr": 'Eski döküm radyatör',
        "es": 'Radiador antiguo de fundición'},
    'Alter Lack, mehrlagig': {
        "en": 'Old varnish, several layers', "tr": 'Eski vernik, çok katlı',
        "es": 'Barniz antiguo, varias capas'},
    'Alter Rasen vorhanden': {
        "en": 'Existing old lawn', "tr": 'Mevcut eski çim',
        "es": 'Césped viejo existente'},
    'Ameisen': {
        "en": 'Ants', "tr": 'Karınca',
        "es": 'Hormigas'},
    'An der Fassade': {
        "en": 'On the facade', "tr": 'Cephede',
        "es": 'En la fachada'},
    'Anschlussfuge Wand/Decke': {
        "en": 'Wall-to-ceiling joint', "tr": 'Duvar/tavan birleşim derzi',
        "es": 'Junta pared-techo'},
    'App- und wettergesteuert': {
        "en": 'App and weather controlled', "tr": 'Uygulama ve hava durumu kontrollü',
        "es": 'Control por app y meteorología'},
    'Auf Splitt und Platten': {
        "en": 'On grit and slabs', "tr": 'Mıcır ve plaka üzerine',
        "es": 'Sobre gravilla y losas'},
    'Aufputz': {
        "en": 'Surface-mounted', "tr": 'Sıva üstü',
        "es": 'De superficie'},
    'Aufputz / Kabelkanal': {
        "en": 'Surface / trunking', "tr": 'Sıva üstü / kablo kanalı',
        "es": 'De superficie / canaleta'},
    'Aufputz / Vorwand': {
        "en": 'Surface / stud wall', "tr": 'Sıva üstü / ön duvar',
        "es": 'De superficie / trasdosado'},
    'Aufsatzbecken': {
        "en": 'Countertop basin', "tr": 'Çanak lavabo',
        "es": 'Lavabo sobre encimera'},
    'Auftausalz': {
        "en": 'De-icing salt', "tr": 'Buz çözücü tuz',
        "es": 'Sal fundente'},
    'Aus der Fliese geschnitten': {
        "en": 'Cut from the tile', "tr": 'Fayanstan kesilmiş',
        "es": 'Cortado del azulejo'},
    'Autarkes Kochfeld': {
        "en": 'Standalone hob', "tr": 'Bağımsız ocak',
        "es": 'Placa independiente'},
    'Außen und Garten': {
        "en": 'Outdoors and garden', "tr": 'Dış mekan ve bahçe',
        "es": 'Exterior y jardín'},
    'Außenbereich': {
        "en": 'Outdoors', "tr": 'Dış mekan',
        "es": 'Exterior'},
    'Bad oder Dusche': {
        "en": 'Bathroom or shower', "tr": 'Banyo veya duş',
        "es": 'Baño o ducha'},
    'Bad oder Küche': {
        "en": 'Bathroom or kitchen', "tr": 'Banyo veya mutfak',
        "es": 'Baño o cocina'},
    'Bangkirai': {
        "en": 'Bangkirai', "tr": 'Bangkirai',
        "es": 'Bangkirai'},
    'Bauendreinigung vor Übergabe': {
        "en": "Builders' clean before handover", "tr": 'Teslim öncesi inşaat temizliği',
        "es": 'Limpieza final antes de la entrega'},
    'Baustellenfläche, verdichtet': {
        "en": 'Compacted site ground', "tr": 'Sıkışmış şantiye zemini',
        "es": 'Terreno de obra compactado'},
    'Baustellengeräte': {
        "en": 'Site equipment', "tr": 'Şantiye ekipmanı',
        "es": 'Equipos de obra'},
    'Beengt, Stückfällung nötig': {
        "en": 'Confined, sectional felling needed', "tr": 'Dar alan, parçalı kesim gerekli',
        "es": 'Espacio reducido, tala por tramos'},
    'Beidseitig und Oberkante': {
        "en": 'Both sides and the top', "tr": 'İki taraf ve üst',
        "es": 'Ambos lados y la parte superior'},
    'Bereits beschichtet': {
        "en": 'Already coated', "tr": 'Halihazırda kaplı',
        "es": 'Ya revestido'},
    'Bestand bleibt': {
        "en": 'Existing stays', "tr": 'Mevcut kalıyor',
        "es": 'Se conserva lo existente'},
    'Bestand weiter nutzbar': {
        "en": 'Existing still usable', "tr": 'Mevcut kullanılabilir',
        "es": 'Lo existente sigue siendo utilizable'},
    'Bestandszarge bleibt, nur Türblatt': {
        "en": 'Existing frame stays, leaf only', "tr": 'Mevcut kasa kalır, sadece kanat',
        "es": 'Se conserva el marco, solo la hoja'},
    'Bestehende Fliesen': {
        "en": 'Existing tiles', "tr": 'Mevcut fayans',
        "es": 'Azulejos existentes'},
    'Bestehendes WDVS': {
        "en": 'Existing external insulation', "tr": 'Mevcut dış cephe yalıtımı',
        "es": 'SATE existente'},
    'Beton': {
        "en": 'Concrete', "tr": 'Beton',
        "es": 'Hormigón'},
    'Beton, alt': {
        "en": 'Concrete, old', "tr": 'Beton, eski',
        "es": 'Hormigón, antiguo'},
    'Beton, neu': {
        "en": 'Concrete, new', "tr": 'Beton, yeni',
        "es": 'Hormigón, nuevo'},
    'Betonstein': {
        "en": 'Concrete block', "tr": 'Beton taş',
        "es": 'Piedra de hormigón'},
    'Betontreppe, roh': {
        "en": 'Concrete stairs, bare', "tr": 'Ham beton merdiven',
        "es": 'Escalera de hormigón, en bruto'},
    'Bettwanzen': {
        "en": 'Bedbugs', "tr": 'Tahtakurusu',
        "es": 'Chinches'},
    'Bewegungsmelder': {
        "en": 'Motion sensor', "tr": 'Hareket sensörü',
        "es": 'Detector de movimiento'},
    'Bis 1 mm': {
        "en": 'Up to 1 mm', "tr": "1 mm'ye kadar",
        "es": 'Hasta 1 mm'},
    'Bis 1,5 m': {
        "en": 'Up to 1.5 m', "tr": "1,5 m'ye kadar",
        "es": 'Hasta 1,5 m'},
    'Bis 10 m, Leiter oder Hubsteiger': {
        "en": 'Up to 10 m, ladder or platform', "tr": "10 m'ye kadar, merdiven veya platform",
        "es": 'Hasta 10 m, escalera o plataforma'},
    'Bis 100 cm': {
        "en": 'Up to 100 cm', "tr": "100 cm'ye kadar",
        "es": 'Hasta 100 cm'},
    'Bis 2 Geschosse': {
        "en": 'Up to 2 storeys', "tr": '2 kata kadar',
        "es": 'Hasta 2 plantas'},
    'Bis 3': {
        "en": 'Up to 3', "tr": "3'e kadar",
        "es": 'Hasta 3'},
    'Bis 3 m': {
        "en": 'Up to 3 m', "tr": "3 m'ye kadar",
        "es": 'Hasta 3 m'},
    'Bis 3 mm': {
        "en": 'Up to 3 mm', "tr": "3 mm'ye kadar",
        "es": 'Hasta 3 mm'},
    'Bis 5 mm': {
        "en": 'Up to 5 mm', "tr": "5 mm'ye kadar",
        "es": 'Hasta 5 mm'},
    'Bis 6 x 3 m': {
        "en": 'Up to 6 x 3 m', "tr": "6 x 3 m'ye kadar",
        "es": 'Hasta 6 x 3 m'},
    'Bis 60 cm': {
        "en": 'Up to 60 cm', "tr": "60 cm'ye kadar",
        "es": 'Hasta 60 cm'},
    'Bis 8 m': {
        "en": 'Up to 8 m', "tr": "8 m'ye kadar",
        "es": 'Hasta 8 m'},
    'Blei': {
        "en": 'Lead', "tr": 'Kurşun',
        "es": 'Plomo'},
    'Blockstufen': {
        "en": 'Solid block steps', "tr": 'Blok basamak',
        "es": 'Peldaños macizos'},
    'Boden': {
        "en": 'Floor', "tr": 'Zemin',
        "es": 'Suelo'},
    'Bodendecker': {
        "en": 'Ground cover', "tr": 'Yer örtücü',
        "es": 'Tapizantes'},
    'Bohrhammer oder Kernbohrung': {
        "en": 'Hammer drill or core drilling', "tr": 'Kırıcı delici veya karot',
        "es": 'Martillo o perforación con corona'},
    'Brennwertgerät': {
        "en": 'Condensing boiler', "tr": 'Yoğuşmalı cihaz',
        "es": 'Caldera de condensación'},
    'Brunnen': {
        "en": 'Well', "tr": 'Kuyu',
        "es": 'Pozo'},
    'Bussystem, verdrahtet': {
        "en": 'Wired bus system', "tr": 'Kablolu bus sistemi',
        "es": 'Sistema de bus cableado'},
    'Böden, Bad, Küche, Staubflächen': {
        "en": 'Floors, bathroom, kitchen, dusting', "tr": 'Zeminler, banyo, mutfak, toz alma',
        "es": 'Suelos, baño, cocina, superficies'},
    'Bücher oder Geschirr': {
        "en": 'Books or crockery', "tr": 'Kitap veya tabak',
        "es": 'Libros o vajilla'},
    'Bürogeräte': {
        "en": 'Office equipment', "tr": 'Ofis cihazları',
        "es": 'Equipos de oficina'},
    'Carport oder Gartenhaus': {
        "en": 'Carport or garden shed', "tr": 'Otopark sundurması veya bahçe evi',
        "es": 'Cochera o caseta de jardín'},
    'Dachboden': {
        "en": 'Loft', "tr": 'Çatı arası',
        "es": 'Buhardilla'},
    'Dachfenster': {
        "en": 'Roof window', "tr": 'Çatı penceresi',
        "es": 'Ventana de tejado'},
    'Dachsparren oder Balkonplatte': {
        "en": 'Rafters or balcony slab', "tr": 'Çatı merteği veya balkon plağı',
        "es": 'Cabios o losa de balcón'},
    'Datenbank mit Historie': {
        "en": 'Database with history', "tr": 'Geçmişli veritabanı',
        "es": 'Base de datos con histórico'},
    'Deckenleuchte': {
        "en": 'Ceiling light', "tr": 'Tavan armatürü',
        "es": 'Plafón'},
    'Dekoration': {
        "en": 'Decorative items', "tr": 'Dekorasyon',
        "es": 'Decoración'},
    'Dekorspachtel / Beton-Optik': {
        "en": 'Decorative skim / concrete look', "tr": 'Dekoratif alçı / beton görünüm',
        "es": 'Microcemento / efecto hormigón'},
    'Diagonal': {
        "en": 'Diagonal', "tr": 'Diyagonal',
        "es": 'En diagonal'},
    'Dickbett': {
        "en": 'Thick-bed', "tr": 'Kalın yatak',
        "es": 'Capa gruesa'},
    'Dickbett, Mörtelbett 15-40 mm': {
        "en": 'Thick-bed, 15-40 mm mortar', "tr": 'Kalın yatak, 15-40 mm harç',
        "es": 'Capa gruesa, mortero de 15-40 mm'},
    'Dimmer': {
        "en": 'Dimmer', "tr": 'Dimmer',
        "es": 'Regulador'},
    'Drainmörtel, gebunden': {
        "en": 'Drainage mortar, bonded', "tr": 'Drenaj harcı, bağlı',
        "es": 'Mortero drenante, adherido'},
    'Drehrahmen für Türen': {
        "en": 'Hinged frame for doors', "tr": 'Kapılar için menteşeli çerçeve',
        "es": 'Marco abatible para puertas'},
    'Drückerplatte oder Gestänge': {
        "en": 'Flush plate or linkage', "tr": 'Basma plakası veya mekanizma',
        "es": 'Pulsador o varillaje'},
    'Dusche oder Wanne, Aufputz': {
        "en": 'Shower or bath, surface-mounted', "tr": 'Duş veya küvet, sıva üstü',
        "es": 'Ducha o bañera, de superficie'},
    'Dusche oder Wanne, Unterputz': {
        "en": 'Shower or bath, concealed', "tr": 'Duş veya küvet, ankastre',
        "es": 'Ducha o bañera, empotrado'},
    'Dusche/Wanne': {
        "en": 'Shower / bath', "tr": 'Duş/küvet',
        "es": 'Ducha/bañera'},
    'Dünnbett': {
        "en": 'Thin-bed', "tr": 'İnce yatak',
        "es": 'Capa fina'},
    'Dünnbett, Kleber sichtbar': {
        "en": 'Thin-bed, adhesive visible', "tr": 'İnce yatak, yapıştırıcı görünür',
        "es": 'Capa fina, adhesivo visible'},
    'EPS': {
        "en": 'EPS', "tr": 'EPS',
        "es": 'EPS'},
    'Eckeinstieg': {
        "en": 'Corner entry', "tr": 'Köşe giriş',
        "es": 'Entrada en esquina'},
    'Ein Raum': {
        "en": 'One room', "tr": 'Bir oda',
        "es": 'Una estancia'},
    'Einbauspots': {
        "en": 'Recessed spots', "tr": 'Gömme spot',
        "es": 'Focos empotrados'},
    'Eine Anlage': {
        "en": 'One facility', "tr": 'Bir tesis',
        "es": 'Una instalación'},
    'Einfamilienhaus': {
        "en": 'Detached house', "tr": 'Müstakil ev',
        "es": 'Vivienda unifamiliar'},
    'Einmal': {
        "en": 'Once', "tr": 'Bir kez',
        "es": 'Una mano'},
    'Einmalig': {
        "en": 'One-off', "tr": 'Tek seferlik',
        "es": 'Puntual'},
    'Einzeilig': {
        "en": 'Single run', "tr": 'Tek sıra',
        "es": 'En línea'},
    'Elektrisch': {
        "en": 'Electric', "tr": 'Elektrikli',
        "es": 'Eléctrico'},
    'Erdplanum vorhanden': {
        "en": 'Formation level ready', "tr": 'Zemin kotu hazır',
        "es": 'Explanada preparada'},
    'Erdverlegt (Garage separat)': {
        "en": 'Buried (garage separate)', "tr": 'Yeraltı (garaj ayrı)',
        "es": 'Enterrado (garaje aparte)'},
    'Estrich': {
        "en": 'Screed', "tr": 'Şap',
        "es": 'Solera'},
    'Estrich oder Betonboden': {
        "en": 'Screed or concrete floor', "tr": 'Şap veya beton zemin',
        "es": 'Solera o suelo de hormigón'},
    'Estrich, alt aber eben': {
        "en": 'Screed, old but level', "tr": 'Şap, eski ama düz',
        "es": 'Solera, antigua pero plana'},
    'Estrich, neu': {
        "en": 'Screed, new', "tr": 'Şap, yeni',
        "es": 'Solera, nueva'},
    'FI fällt': {
        "en": 'RCD trips', "tr": 'Kaçak akım rölesi atıyor',
        "es": 'Salta el diferencial'},
    'Fahrzeugpolster': {
        "en": 'Vehicle upholstery', "tr": 'Araç döşemesi',
        "es": 'Tapicería de vehículo'},
    'Feinreinigung, bezugsfertig': {
        "en": 'Fine clean, ready to occupy', "tr": 'İnce temizlik, taşınmaya hazır',
        "es": 'Limpieza fina, listo para entrar'},
    'Fertigsockel': {
        "en": 'Ready-made skirting', "tr": 'Hazır süpürgelik',
        "es": 'Rodapié prefabricado'},
    'Filter und Pumpe': {
        "en": 'Filter and pump', "tr": 'Filtre ve pompa',
        "es": 'Filtro y bomba'},
    'Flachheizkörper': {
        "en": 'Panel radiator', "tr": 'Panel radyatör',
        "es": 'Radiador de panel'},
    'Flackern': {
        "en": 'Flickering', "tr": 'Titreme',
        "es": 'Parpadeo'},
    'Frei geräumt': {
        "en": 'Cleared', "tr": 'Boşaltılmış',
        "es": 'Despejado'},
    'Freier Fallraum': {
        "en": 'Clear felling space', "tr": 'Serbest devrilme alanı',
        "es": 'Espacio libre de caída'},
    'Freies Gefälle': {
        "en": 'Free fall to ground', "tr": 'Serbest eğim',
        "es": 'Vertido libre por gravedad'},
    'Freistehend': {
        "en": 'Freestanding', "tr": 'Ayaklı',
        "es": 'Exenta'},
    'Früh oder abends': {
        "en": 'Early or late', "tr": 'Sabah erken veya akşam',
        "es": 'A primera o última hora'},
    'Funk, herstellergebunden': {
        "en": 'Radio, manufacturer-tied', "tr": 'Kablosuz, üreticiye bağlı',
        "es": 'Radio, ligado al fabricante'},
    'Furnier oder roh': {
        "en": 'Veneer or bare', "tr": 'Kaplama veya ham',
        "es": 'Chapa o en bruto'},
    'Fußweg oder Terrasse': {
        "en": 'Footpath or terrace', "tr": 'Yaya yolu veya teras',
        "es": 'Acera o terraza'},
    'Füllventil': {
        "en": 'Fill valve', "tr": 'Dolum valfi',
        "es": 'Válvula de llenado'},
}

# Every table in this module, in the order a lookup should try them. Split by
# what they describe rather than merged, so a translator can be handed one
# section at a time and so the coverage test can report which part is short.
TABLES: tuple[dict, ...] = (OPTIONS, QUESTIONS, AXES, JOB_TITLES)


def translate(text: str, lang: str = "de") -> str:
    """The string in `lang`, or the German it was given.

    Falling back to German is deliberate. A missing translation shows the
    tradesperson a word in the language the product is written in, which is
    recoverable; showing a key, a blank or an English guess is not.
    """
    if not text or lang == "de" or lang not in LANGS:
        return text
    for table in TABLES:
        row = table.get(text)
        if row and row.get(lang):
            return row[lang]
    return text


def translated_keys() -> set[str]:
    """Every German string this module can translate. Used by the audit."""
    return {k for table in TABLES for k in table}
