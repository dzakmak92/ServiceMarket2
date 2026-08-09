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

# Every table in this module, in the order a lookup should try them. Split by
# what they describe rather than merged, so a translator can be handed one
# section at a time and so the coverage test can report which part is short.
TABLES: tuple[dict, ...] = (AXES, JOB_TITLES)


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
