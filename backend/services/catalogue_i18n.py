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
    'Zustand des Bewuchses': {
        "en": 'State of the growth', "tr": 'Bitki örtüsünün durumu',
        "es": 'Estado de la vegetación'},
    'Kurz, regelmäßig gepflegt': {
        "en": 'Short, regularly maintained', "tr": 'Kısa, düzenli bakımlı',
        "es": 'Corta, con mantenimiento regular'},
    'Normal aufgewachsen': {
        "en": 'Normal growth', "tr": 'Normal büyümüş',
        "es": 'Crecimiento normal'},
    'Hoch, länger nicht gemacht': {
        "en": 'Tall, not done for a while', "tr": 'Uzamış, bir süredir yapılmamış',
        "es": 'Alta, sin cortar desde hace tiempo'},
    'Verwildert, verholzt': {
        "en": 'Overgrown and woody', "tr": 'Yabanileşmiş, odunlaşmış',
        "es": 'Descuidada y leñosa'},
    'Zustand der Räumfläche': {
        "en": 'State of the area to clear', "tr": 'Temizlenecek alanın durumu',
        "es": 'Estado de la superficie a despejar'},
    'Eben, frei, maschinell räumbar': {
        "en": 'Level, clear, machine-clearable', "tr": 'Düz, açık, makineyle temizlenebilir',
        "es": 'Llana, despejada, despejable a máquina'},
    'Überwiegend maschinell, einzelne Hindernisse': {
        "en": 'Mostly by machine, a few obstacles', "tr": 'Ağırlıklı olarak makineyle, birkaç engel',
        "es": 'Sobre todo a máquina, con algunos obstáculos'},
    'Verwinkelt, Stufen und Kanten': {
        "en": 'Awkward, with steps and kerbs', "tr": 'Girintili çıkıntılı, basamak ve kenarlar',
        "es": 'Con recovecos, escalones y bordillos'},
    'Eng, überwiegend Handarbeit': {
        "en": 'Tight, mostly by hand', "tr": 'Dar, ağırlıklı olarak elle',
        "es": 'Estrecha, sobre todo a mano'},
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
    'Einbauküche montieren (Möbel und Arbeitsplatte bauseits)': {
        "en": 'Fit a fitted kitchen (units and worktop supplied by the client)', "tr": 'Ankastre mutfak montajı (dolaplar ve tezgâh müşteriden)',
        "es": 'Montar una cocina integrada (muebles y encimera los aporta el cliente)'},
    'Küche montieren inkl. Arbeitsplatte (Möbel bauseits)': {
        "en": 'Fit a kitchen including the worktop (units supplied by the client)', "tr": 'Tezgâh dahil mutfak montajı (dolaplar müşteriden)',
        "es": 'Montar una cocina con encimera incluida (muebles a cargo del cliente)'},
    'Innentür montieren (Tür wird beigestellt)': {
        "en": 'Hang an internal door (door supplied by the client)', "tr": 'İç kapı montajı (kapı müşteriden)',
        "es": 'Colocar una puerta interior (puerta aportada por el cliente)'},
    'Innentür liefern und montieren (inkl. Zarge)': {
        "en": 'Supply and hang an internal door (frame included)', "tr": 'İç kapı temini ve montajı (kasa dahil)',
        "es": 'Suministrar e instalar una puerta interior (marco incluido)'},
    'Markise montieren (Markise wird beigestellt)': {
        "en": 'Fit an awning (awning supplied by the client)', "tr": 'Tente montajı (tente müşteriden)',
        "es": 'Montar un toldo (toldo aportado por el cliente)'},
    'Gelenkarmmarkise liefern und montieren': {
        "en": 'Supply and fit a folding-arm awning', "tr": 'Mafsallı kol tenteyi temin et ve mont et',
        "es": 'Suministrar e instalar un toldo de brazos articulados'},
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
    'Fliegengitter montieren': {
        "en": 'Fit insect screens', "tr": 'Sineklik montajı',
        "es": 'Instalar mosquiteras'},
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


# ── Quote line descriptions ─────────────────────────────────────────────
#
# What the customer reads on the quote and the invoice.

QUOTE_LINES: dict[str, dict[str, str]] = {
    'Riss öffnen und entstauben': {
        "en": 'Open out and dust off the crack', "tr": 'Çatlağı açıp tozunu alma',
        "es": 'Abrir la fisura y desempolvar'},
    'Rohinstallation Wasser/Abwasser': {
        "en": 'First-fix water and waste', "tr": 'Su/atık su kaba tesisat',
        "es": 'Instalación en bruto de agua y desagüe'},
    'Rohinstallation und Elektro': {
        "en": 'First fix and electrics', "tr": 'Kaba tesisat ve elektrik',
        "es": 'Instalación en bruto y electricidad'},
    'Rohr reparieren, Dichtheitsprüfung': {
        "en": 'Repair the pipe, pressure test', "tr": 'Boru onarımı, sızdırmazlık testi',
        "es": 'Reparar la tubería y probar estanqueidad'},
    'Rohr verlegen und pressen': {
        "en": 'Lay and press the pipe', "tr": 'Boru döşeme ve presleme',
        "es": 'Tender y prensar la tubería'},
    'Rohr, Vlies und Filterkies einbringen': {
        "en": 'Place pipe, fleece and filter gravel', "tr": 'Boru, keçe ve filtre çakılı serme',
        "es": 'Colocar tubo, geotextil y grava filtrante'},
    'Rohre und Regner setzen': {
        "en": 'Set the pipes and sprinklers', "tr": 'Boru ve fıskiyeleri yerleştirme',
        "es": 'Colocar tuberías y aspersores'},
    'Rohrmaterial, Fittings': {
        "en": 'Pipework and fittings', "tr": 'Boru malzemesi, fitings',
        "es": 'Tubería y accesorios'},
    'Rohrspirale einsetzen': {
        "en": 'Run the drain auger', "tr": 'Kanal spiralini kullanma',
        "es": 'Introducir la sonda de desatasco'},
    'Rollladenkasten und Panzer': {
        "en": 'Shutter box and curtain', "tr": 'Panjur kutusu ve lameller',
        "es": 'Cajón y lamas de persiana'},
    'Räder wechseln und wuchten': {
        "en": 'Change and balance the wheels', "tr": 'Tekerlek değişimi ve balans',
        "es": 'Cambiar y equilibrar las ruedas'},
    'Räumen und tragen': {
        "en": 'Clear and carry', "tr": 'Boşaltma ve taşıma',
        "es": 'Vaciar y transportar'},
    'Räumen über die Saison': {
        "en": 'Clearing through the season', "tr": 'Sezon boyunca temizleme',
        "es": 'Retirada durante la temporada'},
    'Saat ausbringen und walzen': {
        "en": 'Sow and roll', "tr": 'Tohum atma ve silindirleme',
        "es": 'Sembrar y rodillar'},
    'Sanitärobjekte und Armaturen': {
        "en": 'Sanitaryware and taps', "tr": 'Vitrifiye ve armatürler',
        "es": 'Sanitarios y grifería'},
    'Sanitärobjekte, Armaturen, Heizkörper': {
        "en": 'Sanitaryware, taps, radiator', "tr": 'Vitrifiye, armatür, radyatör',
        "es": 'Sanitarios, grifería y radiador'},
    'Sanitärsilikon und Vorlegeband': {
        "en": 'Sanitary silicone and backing strip', "tr": 'Saniter silikon ve fitil bandı',
        "es": 'Silicona sanitaria y cinta de respaldo'},
    'Schalter, Steckdosen, Auslässe': {
        "en": 'Switches, sockets, outlets', "tr": 'Anahtar, priz, çıkışlar',
        "es": 'Interruptores, enchufes, salidas'},
    'Schimmelentferner, Sperrgrund, Farbe': {
        "en": 'Mould remover, blocking primer, paint', "tr": 'Küf temizleyici, izolasyon astarı, boya',
        "es": 'Antimoho, imprimación bloqueante, pintura'},
    'Schleifen und ausbessern': {
        "en": 'Sand and make good', "tr": 'Zımpara ve onarım',
        "es": 'Lijar y repasar'},
    'Schleifen und entstauben': {
        "en": 'Sand and dust off', "tr": 'Zımpara ve tozunu alma',
        "es": 'Lijar y desempolvar'},
    'Schleifen und versiegeln': {
        "en": 'Sand and seal', "tr": 'Zımpara ve vernik',
        "es": 'Acuchillar y barnizar'},
    'Schlitz fräsen': {
        "en": 'Cut the chase', "tr": 'Kanal frezeleme',
        "es": 'Fresar la roza'},
    'Schlitz verschließen': {
        "en": 'Make good the chase', "tr": 'Kanalı kapatma',
        "es": 'Cerrar la roza'},
    'Schlitze stemmen': {
        "en": 'Cut the chases', "tr": 'Kanal kırma',
        "es": 'Abrir las rozas'},
    'Schlitze und Dosen': {
        "en": 'Chases and back boxes', "tr": 'Kanallar ve kutular',
        "es": 'Rozas y cajas'},
    'Schlitze verschließen': {
        "en": 'Make good the chases', "tr": 'Kanalları kapatma',
        "es": 'Cerrar las rozas'},
    'Schnittgut aufnehmen': {
        "en": 'Collect the clippings', "tr": 'Kesilen otları toplama',
        "es": 'Recoger los restos de siega'},
    'Sichtprüfung': {
        "en": 'Visual inspection', "tr": 'Gözle muayene',
        "es": 'Inspección visual'},
    'Sockel, Laibungen und Anschlüsse': {
        "en": 'Plinth, reveals and junctions', "tr": 'Sokle, söve ve birleşimler',
        "es": 'Zócalo, mochetas y encuentros'},
    'Sockelleisten demontieren': {
        "en": 'Remove the skirting', "tr": 'Süpürgelikleri sökme',
        "es": 'Retirar los rodapiés'},
    'Sockelleisten montieren': {
        "en": 'Fit the skirting', "tr": 'Süpürgelik montajı',
        "es": 'Colocar los rodapiés'},
    'Spachtelmasse und Grundierung': {
        "en": 'Filler and primer', "tr": 'Macun ve astar',
        "es": 'Masilla e imprimación'},
    'Spachtelmasse, Fein- und Grundierung': {
        "en": 'Filler, fine coat and primer', "tr": 'Macun, ince kat ve astar',
        "es": 'Masilla, capa fina e imprimación'},
    'Spachteln Q2': {
        "en": 'Filling to Q2', "tr": 'Q2 macun',
        "es": 'Enlucido Q2'},
    'Speicher inkl. Sicherheitsgruppe': {
        "en": 'Cylinder incl. safety set', "tr": 'Emniyet grubu dahil depo',
        "es": 'Acumulador incl. grupo de seguridad'},
    'Sperrgrund und Neuanstrich': {
        "en": 'Blocking primer and repaint', "tr": 'İzolasyon astarı ve yeni boya',
        "es": 'Imprimación bloqueante y repintado'},
    'Splittbettung': {
        "en": 'Grit bedding', "tr": 'Mıcır yataklama',
        "es": 'Cama de gravilla'},
    'Sprühextraktion': {
        "en": 'Hot water extraction', "tr": 'Püskürtmeli ekstraksiyon',
        "es": 'Inyección-extracción'},
    'Spülventil/Füllventil tauschen': {
        "en": 'Replace flush or fill valve', "tr": 'Boşaltma/dolum valfi değişimi',
        "es": 'Sustituir válvula de descarga o llenado'},
    'Steinplatte nach Maß': {
        "en": 'Made-to-measure stone slab', "tr": 'Ölçüye göre taş plaka',
        "es": 'Losa de piedra a medida'},
    'Stiegenhaus reinigen': {
        "en": 'Clean the stairwell', "tr": 'Merdiven boşluğunu temizleme',
        "es": 'Limpiar la escalera'},
    'Streuen über die Saison': {
        "en": 'Gritting through the season', "tr": 'Sezon boyunca serpme',
        "es": 'Esparcido durante la temporada'},
    'Stufen setzen': {
        "en": 'Set the steps', "tr": 'Basamak yerleştirme',
        "es": 'Colocar los peldaños'},
    'Stufen setzen und ausrichten': {
        "en": 'Set and align the steps', "tr": 'Basamakları yerleştirip hizalama',
        "es": 'Colocar y alinear los peldaños'},
    'Sturz einbauen': {
        "en": 'Install the lintel', "tr": 'Lento yerleştirme',
        "es": 'Colocar el dintel'},
    'Ständerwerk stellen': {
        "en": 'Erect the studwork', "tr": 'Profil iskeleti kurma',
        "es": 'Levantar la estructura de perfiles'},
    'Substrat und Dünger': {
        "en": 'Substrate and fertiliser', "tr": 'Harç ve gübre',
        "es": 'Sustrato y abono'},
    'System konfigurieren': {
        "en": 'Configure the system', "tr": 'Sistemi yapılandırma',
        "es": 'Configurar el sistema'},
    'Systemplatte verlegen': {
        "en": 'Lay the system panel', "tr": 'Sistem plakası döşeme',
        "es": 'Colocar el panel del sistema'},
    'Tapete ansetzen und verlegen': {
        "en": 'Set out and hang the paper', "tr": 'Duvar kağıdını yerleştirip kaplama',
        "es": 'Replantear y colocar el papel'},
    'Tapete lösen und abziehen': {
        "en": 'Soak and strip the paper', "tr": 'Duvar kağıdını ıslatıp sökme',
        "es": 'Reblandecer y retirar el papel'},
    'Teppich zuschneiden und verlegen': {
        "en": 'Cut and lay the carpet', "tr": 'Halıyı kesip döşeme',
        "es": 'Cortar y colocar la moqueta'},
    'Tiefengrund': {
        "en": 'Penetrating primer', "tr": 'Derin astar',
        "es": 'Imprimación penetrante'},
    'Transport': {
        "en": 'Transport', "tr": 'Nakliye',
        "es": 'Transporte'},
    'Trittschalldämmung verlegen': {
        "en": 'Lay the acoustic underlay', "tr": 'Darbe sesi yalıtımı döşeme',
        "es": 'Colocar el aislamiento acústico'},
    'Tür zerstörungsfrei öffnen': {
        "en": 'Open the door without damage', "tr": 'Kapıyı hasarsız açma',
        "es": 'Abrir la puerta sin daños'},
    'Türblatt und Zarge': {
        "en": 'Door leaf and frame', "tr": 'Kapı kanadı ve kasa',
        "es": 'Hoja y marco de puerta'},
    'Untergrund herstellen': {
        "en": 'Form the base', "tr": 'Zemin oluşturma',
        "es": 'Ejecutar la base'},
    'Untergrund nacharbeiten': {
        "en": 'Make good the substrate', "tr": 'Zemini düzeltme',
        "es": 'Repasar el soporte'},
    'Untergrund prüfen und nivellieren': {
        "en": 'Check and level the substrate', "tr": 'Zemini kontrol edip tesviye etme',
        "es": 'Comprobar y nivelar el soporte'},
    'Untergrund prüfen und vorbereiten': {
        "en": 'Check and prepare the substrate', "tr": 'Zemini kontrol edip hazırlama',
        "es": 'Comprobar y preparar el soporte'},
    'Untergrund reinigen und grundieren': {
        "en": 'Clean and prime the substrate', "tr": 'Zemini temizleyip astarlama',
        "es": 'Limpiar e imprimar el soporte'},
    'Untergrund spachteln': {
        "en": 'Fill the substrate', "tr": 'Zemini macunlama',
        "es": 'Enlucir el soporte'},
    'Untergrund und Gefälle prüfen': {
        "en": 'Check substrate and fall', "tr": 'Zemin ve eğim kontrolü',
        "es": 'Comprobar soporte y pendiente'},
    'Untergrund vorbereiten': {
        "en": 'Prepare the substrate', "tr": 'Zemini hazırlama',
        "es": 'Preparar el soporte'},
    'Untergrund vorbereiten und grundieren': {
        "en": 'Prepare and prime the substrate', "tr": 'Zemini hazırlayıp astarlama',
        "es": 'Preparar e imprimar el soporte'},
    'Unterkonstruktion montieren': {
        "en": 'Fit the sub-structure', "tr": 'Alt konstrüksiyon montajı',
        "es": 'Montar la subestructura'},
    'Unterkonstruktion setzen und ausrichten': {
        "en": 'Set and align the sub-structure', "tr": 'Alt konstrüksiyonu kurup hizalama',
        "es": 'Colocar y nivelar la subestructura'},
    'Unterschränke stellen und ausrichten': {
        "en": 'Set and align the base units', "tr": 'Alt dolapları yerleştirip hizalama',
        "es": 'Colocar y nivelar los muebles bajos'},
    'Unterspannbahn': {
        "en": 'Roofing underlay', "tr": 'Çatı altı membran',
        "es": 'Lámina bajo cubierta'},
    'Ventilbox und Steuerung': {
        "en": 'Valve box and controller', "tr": 'Vana kutusu ve kontrol',
        "es": 'Arqueta de válvulas y programador'},
    'Verbundabdichtung': {
        "en": 'Tanking membrane', "tr": 'Kompozit su yalıtımı',
        "es": 'Impermeabilización bajo alicatado'},
    'Verdrahten und anschließen': {
        "en": 'Wire and connect', "tr": 'Kablolama ve bağlantı',
        "es": 'Cablear y conectar'},
    'Verfugen': {
        "en": 'Grouting', "tr": 'Derzleme',
        "es": 'Rejuntado'},
    'Verfugen und Silikon': {
        "en": 'Grouting and silicone', "tr": 'Derzleme ve silikon',
        "es": 'Rejuntado y silicona'},
    'Verfugen, Randfugen elastisch': {
        "en": 'Grouting, flexible perimeter joints', "tr": 'Derzleme, elastik kenar derzleri',
        "es": 'Rejuntado, juntas perimetrales elásticas'},
    'Verglasen und verklotzen': {
        "en": 'Glaze and pack', "tr": 'Camlama ve takozlama',
        "es": 'Acristalar y calzar'},
    'Verladen': {
        "en": 'Loading', "tr": 'Yükleme',
        "es": 'Carga'},
    'Verlegen im Kombiverfahren mit Nivelliersystem': {
        "en": 'Lay by buttering-floating with a levelling system', "tr": 'Tesviye sistemiyle kombine döşeme',
        "es": 'Colocar por doble encolado con sistema nivelador'},
    'Verlegeplan und Einmessen': {
        "en": 'Setting-out plan and measuring', "tr": 'Döşeme planı ve ölçüm',
        "es": 'Plano de replanteo y mediciones'},
    'Verpacken und sichern': {
        "en": 'Pack and secure', "tr": 'Paketleme ve sabitleme',
        "es": 'Embalar y asegurar'},
    'Verputzen beidseitig': {
        "en": 'Render both sides', "tr": 'İki yüzü sıvama',
        "es": 'Revocar por ambas caras'},
    'Versetzen und verfugen': {
        "en": 'Set and grout', "tr": 'Yerleştirme ve derzleme',
        "es": 'Colocar y rejuntar'},
    'Verteiler anschließen und abdrücken': {
        "en": 'Connect and pressure-test the manifold', "tr": 'Kollektörü bağlayıp basınç testi',
        "es": 'Conectar y probar el colector'},
    'Verteiler montieren und verdrahten': {
        "en": 'Fit and wire the board', "tr": 'Panoyu monte edip kablolama',
        "es": 'Montar y cablear el cuadro'},
    'Verteiler neu': {
        "en": 'New consumer unit', "tr": 'Yeni pano',
        "es": 'Cuadro nuevo'},
    'Verteiler, LS-Schalter, FI': {
        "en": 'Board, breakers, RCD', "tr": 'Pano, sigorta, kaçak akım rölesi',
        "es": 'Cuadro, magnetotérmicos, diferencial'},
    'Vertikutieren': {
        "en": 'Scarifying', "tr": 'Havalandırma',
        "es": 'Escarificado'},
    'Vlies und Mulchschicht': {
        "en": 'Fleece and mulch layer', "tr": 'Keçe ve malç tabakası',
        "es": 'Geotextil y capa de mantillo'},
    'Vlies- bzw. Designtapete': {
        "en": 'Fleece or designer wallpaper', "tr": 'Flizelin veya desenli duvar kağıdı',
        "es": 'Papel tejido o de diseño'},
    'WC montieren und anschließen': {
        "en": 'Fit and connect the WC', "tr": 'Klozeti monte edip bağlama',
        "es": 'Montar y conectar el inodoro'},
    'Wallbox montieren und anschließen': {
        "en": 'Fit and connect the wallbox', "tr": 'Wallbox montaj ve bağlantısı',
        "es": 'Montar y conectar el wallbox'},
    'Wand abbrechen': {
        "en": 'Demolish the wall', "tr": 'Duvarı yıkma',
        "es": 'Derribar el muro'},
    'Wand/Boden öffnen': {
        "en": 'Open up wall or floor', "tr": 'Duvar/zemin açma',
        "es": 'Abrir pared o suelo'},
    'Wandanstrich, zwei Anstriche': {
        "en": 'Wall paint, two coats', "tr": 'Duvar boyası, iki kat',
        "es": 'Pintura de pared, dos manos'},
    'Wanddurchführung herstellen': {
        "en": 'Form the wall penetration', "tr": 'Duvar geçişi yapma',
        "es": 'Ejecutar el paso de muro'},
    'Wanne inkl. Träger und Ablauf': {
        "en": 'Bath incl. support and waste', "tr": 'Taşıyıcı ve gider dahil küvet',
        "es": 'Bañera incl. bastidor y desagüe'},
    'Wanne und Fliesen entfernen': {
        "en": 'Remove bath and tiles', "tr": 'Küvet ve fayans sökümü',
        "es": 'Retirar bañera y azulejos'},
    'Wartung, Reinigung, Abgasmessung': {
        "en": 'Service, clean, flue gas test', "tr": 'Bakım, temizlik, baca gazı ölçümü',
        "es": 'Mantenimiento, limpieza y medición de gases'},
    'Waschtisch und Armatur montieren': {
        "en": 'Fit basin and tap', "tr": 'Lavabo ve armatür montajı',
        "es": 'Montar lavabo y grifo'},
    'Wände, zwei Anstriche': {
        "en": 'Walls, two coats', "tr": 'Duvarlar, iki kat',
        "es": 'Paredes, dos manos'},
    'Wärmepumpe inkl. Speicher': {
        "en": 'Heat pump incl. cylinder', "tr": 'Depo dahil ısı pompası',
        "es": 'Bomba de calor incl. acumulador'},
    'Zarge setzen und Blatt einhängen': {
        "en": 'Set the frame and hang the leaf', "tr": 'Kasayı takıp kanadı asma',
        "es": 'Colocar el marco y colgar la hoja'},
    'Zarge setzen, Tür einhängen, justieren': {
        "en": 'Set the frame, hang and adjust the door', "tr": 'Kasayı takma, kapıyı asma, ayarlama',
        "es": 'Colocar marco, colgar y ajustar la puerta'},
    'Zu- und Ablauf herstellen': {
        "en": 'Form the supply and waste', "tr": 'Giriş ve çıkış yapımı',
        "es": 'Ejecutar acometida y desagüe'},
    'Zuleitung verlegen': {
        "en": 'Run the supply cable', "tr": 'Besleme hattı çekme',
        "es": 'Tender la alimentación'},
    'Zuschnitt Tritt- und Setzstufe': {
        "en": 'Cut treads and risers', "tr": 'Basamak ve rıht kesimi',
        "es": 'Corte de huellas y contrahuellas'},
    'Zuschnitt und Ansetzen': {
        "en": 'Cutting and setting out', "tr": 'Kesim ve yerleştirme',
        "es": 'Corte y replanteo'},
    'Zwei Anstriche': {
        "en": 'Two coats', "tr": 'İki kat',
        "es": 'Dos manos'},
    'Zweilagige Abdichtung': {
        "en": 'Two-layer waterproofing', "tr": 'Çift kat su yalıtımı',
        "es": 'Impermeabilización en dos capas'},
    'Zweimal Wetterschutzlack': {
        "en": 'Two coats of weather paint', "tr": 'İki kat hava koruyucu boya',
        "es": 'Dos manos de esmalte de intemperie'},
    'Zweimal lackieren mit Zwischenschliff': {
        "en": 'Two coats with sanding between', "tr": 'Ara zımparalı iki kat boya',
        "es": 'Dos manos con lijado intermedio'},
    'Zweimal lasieren': {
        "en": 'Two coats of stain', "tr": 'İki kat vernik',
        "es": 'Dos manos de lasur'},
    'Zylinder ausmessen und tauschen': {
        "en": 'Measure and replace the cylinder', "tr": 'Göbeği ölçüp değiştirme',
        "es": 'Medir y sustituir el bombín'},
    'Öl und Filter': {
        "en": 'Oil and filters', "tr": 'Yağ ve filtre',
        "es": 'Aceite y filtros'},
    'Ölwechsel, Filter, Sichtprüfung': {
        "en": 'Oil change, filters, visual check', "tr": 'Yağ değişimi, filtre, gözle muayene',
        "es": 'Cambio de aceite, filtros, inspección visual'},
    'Gastherme inkl. Montagezubehör': {
        "en": 'Gas boiler incl. fitting kit', "tr": 'Montaj aksesuarı dahil kombi',
        "es": 'Caldera de gas incl. accesorios'},
    'Geräte anschließen (E/Wasser)': {
        "en": 'Connect appliances (electric/water)', "tr": 'Cihaz bağlantısı (elektrik/su)',
        "es": 'Conectar aparatos (luz/agua)'},
    'Geräteanschlussventil und Siphon': {
        "en": 'Appliance valve and trap', "tr": 'Cihaz vanası ve sifon',
        "es": 'Llave de aparato y sifón'},
    'Gerüst abbauen': {
        "en": 'Dismantle the scaffold', "tr": 'İskele söküm',
        "es": 'Desmontar el andamio'},
    'Gerüst aufbauen': {
        "en": 'Erect the scaffold', "tr": 'İskele kurulum',
        "es": 'Montar el andamio'},
    'Gerüstmiete 4 Wochen': {
        "en": 'Scaffold hire, 4 weeks', "tr": 'İskele kirası, 4 hafta',
        "es": 'Alquiler de andamio, 4 semanas'},
    'Graben ausheben': {
        "en": 'Dig the trench', "tr": 'Hendek kazma',
        "es": 'Excavar la zanja'},
    'Graben schließen und verdichten': {
        "en": 'Backfill and compact the trench', "tr": 'Hendeği kapatıp sıkıştırma',
        "es": 'Rellenar y compactar la zanja'},
    'Grobreinigung und Bauschutt aufnehmen': {
        "en": 'Rough clean and remove rubble', "tr": 'Kaba temizlik ve moloz toplama',
        "es": 'Limpieza gruesa y retirada de escombros'},
    'Grobschliff': {
        "en": 'Coarse sanding', "tr": 'Kaba zımpara',
        "es": 'Lijado grueso'},
    'Grundierung': {
        "en": 'Primer', "tr": 'Astar',
        "es": 'Imprimación'},
    'Grundierung und Beschichtung': {
        "en": 'Primer and coating', "tr": 'Astar ve kaplama',
        "es": 'Imprimación y revestimiento'},
    'Grundierung und Heizkörperlack': {
        "en": 'Primer and radiator enamel', "tr": 'Astar ve radyatör boyası',
        "es": 'Imprimación y esmalte para radiadores'},
    'Grundierung und Lack': {
        "en": 'Primer and paint', "tr": 'Astar ve boya',
        "es": 'Imprimación y esmalte'},
    'Grundierung und Oberputz': {
        "en": 'Primer and top coat render', "tr": 'Astar ve son kat sıva',
        "es": 'Imprimación y revoco de acabado'},
    'Grundierung, Lack und Dichtstoff': {
        "en": 'Primer, paint and sealant', "tr": 'Astar, boya ve dolgu',
        "es": 'Imprimación, esmalte y sellador'},
    'Grundreinigung aller Flächen': {
        "en": 'Deep clean of all surfaces', "tr": 'Tüm yüzeylerin genel temizliği',
        "es": 'Limpieza a fondo de todas las superficies'},
    'Grundspachtelung': {
        "en": 'Base filling', "tr": 'Temel macun',
        "es": 'Enlucido base'},
    'Gräben ziehen und schließen': {
        "en": 'Cut and close the trenches', "tr": 'Hendek açma ve kapatma',
        "es": 'Abrir y cerrar zanjas'},
    'Grünschnitt entsorgen': {
        "en": 'Dispose of green waste', "tr": 'Yeşil atık bertarafı',
        "es": 'Retirar restos vegetales'},
    'Haftgrund': {
        "en": 'Bonding primer', "tr": 'Aderans astarı',
        "es": 'Imprimación de agarre'},
    'Halterung dübeln und ausrichten': {
        "en": 'Plug and align the bracket', "tr": 'Askıyı dübelleyip hizalama',
        "es": 'Tacar y alinear el soporte'},
    'Handwerkerleistung nach Aufwand': {
        "en": 'Trade work, time and material', "tr": 'Aufwanda göre ustalık hizmeti',
        "es": 'Trabajo por administración'},
    'Heizkörper und Ventile': {
        "en": 'Radiator and valves', "tr": 'Radyatör ve vanalar',
        "es": 'Radiador y válvulas'},
    'Heizkörperlack, zwei Aufträge': {
        "en": 'Radiator enamel, two coats', "tr": 'Radyatör boyası, iki kat',
        "es": 'Esmalte de radiador, dos manos'},
    'Heizrohr verlegen': {
        "en": 'Lay the heating pipe', "tr": 'Isıtma borusu döşeme',
        "es": 'Tender el tubo de calefacción'},
    'Holzgrundierung': {
        "en": 'Wood primer', "tr": 'Ahşap astarı',
        "es": 'Imprimación para madera'},
    'Holzschutzlasur': {
        "en": 'Wood preservative stain', "tr": 'Ahşap koruyucu vernik',
        "es": 'Lasur protector para madera'},
    'Häckseln und verladen': {
        "en": 'Chip and load', "tr": 'Parçalama ve yükleme',
        "es": 'Astillar y cargar'},
    'Imprägnierung auftragen': {
        "en": 'Apply the sealer', "tr": 'Emprenye uygulama',
        "es": 'Aplicar el hidrofugante'},
    'Inbetriebnahme und Anmeldung': {
        "en": 'Commissioning and registration', "tr": 'Devreye alma ve bildirim',
        "es": 'Puesta en marcha y alta'},
    'Inbetriebnahme und Einregulierung': {
        "en": 'Commissioning and balancing', "tr": 'Devreye alma ve ayar',
        "es": 'Puesta en marcha y equilibrado'},
    'Inbetriebnahme, Messung, Anmeldung': {
        "en": 'Commissioning, testing, registration', "tr": 'Devreye alma, ölçüm, bildirim',
        "es": 'Puesta en marcha, medición y alta'},
    'Isolierglas nach Maß': {
        "en": 'Made-to-measure double glazing', "tr": 'Ölçüye göre ısıcam',
        "es": 'Vidrio aislante a medida'},
    'Kabel NYM': {
        "en": 'NYM cable', "tr": 'NYM kablo',
        "es": 'Cable NYM'},
    'Kabine montieren und ausrichten': {
        "en": 'Fit and align the enclosure', "tr": 'Kabini takıp hizalama',
        "es": 'Montar y alinear la mampara'},
    'Kanten und Ränder': {
        "en": 'Edges and borders', "tr": 'Kenarlar ve sınırlar',
        "es": 'Bordes y remates'},
    'Kehrung und Abgasmessung': {
        "en": 'Sweeping and flue gas test', "tr": 'Temizlik ve baca gazı ölçümü',
        "es": 'Deshollinado y medición de gases'},
    'Kleber und Fugenmasse': {
        "en": 'Adhesive and grout', "tr": 'Yapıştırıcı ve derz',
        "es": 'Adhesivo y material de junta'},
    'Kleber, Fuge, Kantenprofil': {
        "en": 'Adhesive, grout, edge trim', "tr": 'Yapıştırıcı, derz, kenar profili',
        "es": 'Adhesivo, junta, perfil de canto'},
    'Kleber, Fuge, Silikon': {
        "en": 'Adhesive, grout, silicone', "tr": 'Yapıştırıcı, derz, silikon',
        "es": 'Adhesivo, junta, silicona'},
    'Kleberreste abschleifen': {
        "en": 'Sand off adhesive residue', "tr": 'Yapıştırıcı kalıntısını zımparalama',
        "es": 'Lijar restos de adhesivo'},
    'Kleberreste entfernen': {
        "en": 'Remove adhesive residue', "tr": 'Yapıştırıcı kalıntısını sökme',
        "es": 'Retirar restos de adhesivo'},
    'Kleinausbesserungen': {
        "en": 'Minor making good', "tr": 'Küçük onarımlar',
        "es": 'Pequeños repasos'},
    'Kleinmaterial': {
        "en": 'Sundries', "tr": 'Sarf malzeme',
        "es": 'Material menudo'},
    'Kleinmaterial, Dichtungen, Silikon': {
        "en": 'Sundries, seals, silicone', "tr": 'Sarf malzeme, conta, silikon',
        "es": 'Material menudo, juntas, silicona'},
    'Kleinteile und Schmiermittel': {
        "en": 'Small parts and lubricant', "tr": 'Küçük parçalar ve yağ',
        "es": 'Piezas pequeñas y lubricante'},
    'Kleisterreste waschen': {
        "en": 'Wash off paste residue', "tr": 'Tutkal kalıntısını yıkama',
        "es": 'Lavar restos de cola'},
    'Komplettdemontage inkl. Fliesen': {
        "en": 'Full strip-out incl. tiles', "tr": 'Fayans dahil komple söküm',
        "es": 'Desmontaje completo incl. azulejos'},
    'Komplettservice': {
        "en": 'Full service', "tr": 'Komple bakım',
        "es": 'Revisión completa'},
    'Konsolen setzen und montieren': {
        "en": 'Fit and mount the brackets', "tr": 'Konsolları takıp monte etme',
        "es": 'Colocar y montar los soportes'},
    'Konterlattung und Lattung': {
        "en": 'Counter battens and battens', "tr": 'Kontrlata ve lata',
        "es": 'Contralistones y rastreles'},
    'Korpus und Fronten': {
        "en": 'Carcass and fronts', "tr": 'Gövde ve kapaklar',
        "es": 'Cuerpo y frentes'},
    'Korpusse setzen und ausrichten': {
        "en": 'Set and align the carcasses', "tr": 'Gövdeleri yerleştirip hizalama',
        "es": 'Colocar y nivelar los cuerpos'},
    'Kronenpflege bzw. Auslichten': {
        "en": 'Crown care or thinning', "tr": 'Taç bakımı veya seyreltme',
        "es": 'Cuidado de copa o aclareo'},
    'Kurz mähen': {
        "en": 'Cut short', "tr": 'Kısa biçme',
        "es": 'Segar corto'},
    'Körbe stellen und ausrichten': {
        "en": 'Set and align the baskets', "tr": 'Sepetleri kurup hizalama',
        "es": 'Colocar y alinear las cestas'},
    'Küche demontieren': {
        "en": 'Strip out the kitchen', "tr": 'Mutfağı sökme',
        "es": 'Desmontar la cocina'},
    'Laibungen nacharbeiten': {
        "en": 'Make good the reveals', "tr": 'Söveleri düzeltme',
        "es": 'Repasar las mochetas'},
    'Laibungen verputzen': {
        "en": 'Render the reveals', "tr": 'Söveleri sıvama',
        "es": 'Revocar las mochetas'},
    'Laub zusammenblasen und aufnehmen': {
        "en": 'Blow up and collect the leaves', "tr": 'Yaprakları üfleyip toplama',
        "es": 'Soplar y recoger las hojas'},
    'Leckortung': {
        "en": 'Leak tracing', "tr": 'Kaçak tespiti',
        "es": 'Localización de fugas'},
    'Leitung verlegen': {
        "en": 'Run the cable', "tr": 'Hat çekme',
        "es": 'Tender la línea'},
    'Leitungen verlegen': {
        "en": 'Run the cables', "tr": 'Hatları çekme',
        "es": 'Tender las líneas'},
    'Lösemittel und Hochdruck': {
        "en": 'Solvent and high pressure', "tr": 'Çözücü ve yüksek basınç',
        "es": 'Disolvente y alta presión'},
    'Markise inkl. Motor': {
        "en": 'Awning incl. motor', "tr": 'Motor dahil tente',
        "es": 'Toldo incl. motor'},
    'Maschinell kehren und waschen': {
        "en": 'Machine sweep and wash', "tr": 'Makineyle süpürme ve yıkama',
        "es": 'Barrido y fregado mecánico'},
    'Matten montieren': {
        "en": 'Fit the mesh panels', "tr": 'Panelleri montaj',
        "es": 'Montar los paneles'},
    'Mauerwerk herstellen': {
        "en": 'Build the masonry', "tr": 'Duvar örme',
        "es": 'Ejecutar la fábrica'},
    'Mechanische Reinigung, Siphon': {
        "en": 'Mechanical cleaning, trap', "tr": 'Mekanik temizlik, sifon',
        "es": 'Limpieza mecánica, sifón'},
    'Messtechnische Eingrenzung': {
        "en": 'Narrow down by measurement', "tr": 'Ölçümle daraltma',
        "es": 'Acotar mediante medición'},
    'Messung und Protokoll': {
        "en": 'Measurement and certificate', "tr": 'Ölçüm ve rapor',
        "es": 'Medición e informe'},
    'Messung, Befund, Übergabe': {
        "en": 'Measurement, findings, handover', "tr": 'Ölçüm, bulgu, teslim',
        "es": 'Medición, diagnóstico y entrega'},
    'Messungen nach ÖVE/ÖNORM E 8001 bzw. DIN VDE 0100-600': {
        "en": 'Tests to ÖVE/ÖNORM E 8001 or DIN VDE 0100-600', "tr": "ÖVE/ÖNORM E 8001 veya DIN VDE 0100-600'e göre ölçümler",
        "es": 'Mediciones según ÖVE/ÖNORM E 8001 o DIN VDE 0100-600'},
    'Module und Wechselrichter': {
        "en": 'Panels and inverter', "tr": 'Modüller ve invertör',
        "es": 'Módulos e inversor'},
    'Montage': {
        "en": 'Installation', "tr": 'Montaj',
        "es": 'Montaje'},
    'Montage und Anschluss': {
        "en": 'Fitting and connection', "tr": 'Montaj ve bağlantı',
        "es": 'Montaje y conexión'},
    'Montage und Funktionstest': {
        "en": 'Fitting and function test', "tr": 'Montaj ve işlev testi',
        "es": 'Montaje y prueba de funcionamiento'},
    'Montage und Inbetriebnahme': {
        "en": 'Fitting and commissioning', "tr": 'Montaj ve devreye alma',
        "es": 'Montaje y puesta en marcha'},
    'Montage und Verankerung': {
        "en": 'Fitting and anchoring', "tr": 'Montaj ve ankraj',
        "es": 'Montaje y anclaje'},
    'Montage vor Ort': {
        "en": 'Fitting on site', "tr": 'Yerinde montaj',
        "es": 'Montaje in situ'},
    'Montage, Anschluss Gas/Wasser/Strom': {
        "en": 'Fitting, gas/water/electric connection', "tr": 'Montaj, gaz/su/elektrik bağlantısı',
        "es": 'Montaje y conexión de gas/agua/luz'},
    'Montage, Anschluss, Inbetriebnahme': {
        "en": 'Fitting, connection, commissioning', "tr": 'Montaj, bağlantı, devreye alma',
        "es": 'Montaje, conexión y puesta en marcha'},
    'Montieren und anschließen': {
        "en": 'Fit and connect', "tr": 'Montaj ve bağlantı',
        "es": 'Montar y conectar'},
    'Mosaik ansetzen und verlegen': {
        "en": 'Set out and lay the mosaic', "tr": 'Mozaiği yerleştirip döşeme',
        "es": 'Replantear y colocar el mosaico'},
    'Motor anschließen': {
        "en": 'Connect the motor', "tr": 'Motoru bağlama',
        "es": 'Conectar el motor'},
    'Möbel montieren': {
        "en": 'Assemble the furniture', "tr": 'Mobilya montajı',
        "es": 'Montar los muebles'},
    'Nachsaat und Startdünger': {
        "en": 'Overseed and starter feed', "tr": 'Tohum takviyesi ve başlangıç gübresi',
        "es": 'Resiembra y abono de arranque'},
    'Neu eindecken': {
        "en": 'Re-cover the roof', "tr": 'Yeniden örtme',
        "es": 'Retejar'},
    'Neu verfugen': {
        "en": 'Re-grout', "tr": 'Yeniden derzleme',
        "es": 'Rejuntar'},
    'Neue Armatur montieren': {
        "en": 'Fit the new tap', "tr": 'Yeni armatürü takma',
        "es": 'Montar el grifo nuevo'},
    'Neue Fliese setzen und verfugen': {
        "en": 'Set and grout the new tile', "tr": 'Yeni fayansı takıp derzleme',
        "es": 'Colocar y rejuntar el azulejo nuevo'},
    'Neue Silikonfuge ziehen': {
        "en": 'Run the new silicone joint', "tr": 'Yeni silikon derz çekme',
        "es": 'Aplicar la nueva junta de silicona'},
    'Nägel versenken, Fugen kitten': {
        "en": 'Punch nails, fill joints', "tr": 'Çivileri gömme, derzleri macunlama',
        "es": 'Embutir clavos, masillar juntas'},
    'Oberschränke montieren': {
        "en": 'Fit the wall units', "tr": 'Üst dolapları montaj',
        "es": 'Montar los muebles altos'},
    'Ortstermin und Aufnahme': {
        "en": 'Site visit and survey', "tr": 'Yerinde inceleme ve tespit',
        "es": 'Visita y toma de datos'},
    'Parkett vollflächig verkleben': {
        "en": 'Bond the parquet fully', "tr": 'Parkeyi tam yüzey yapıştırma',
        "es": 'Encolar el parqué a toda superficie'},
    'Pflanzen setzen': {
        "en": 'Plant out', "tr": 'Bitki dikimi',
        "es": 'Plantar'},
    'Pflanzen setzen und wässern': {
        "en": 'Plant out and water in', "tr": 'Bitki dikimi ve sulama',
        "es": 'Plantar y regar'},
    'Pflanzgraben ausheben': {
        "en": 'Dig the planting trench', "tr": 'Dikim hendeği kazma',
        "es": 'Abrir la zanja de plantación'},
    'Pflanzsubstrat einbringen': {
        "en": 'Place the planting medium', "tr": 'Dikim harcı serme',
        "es": 'Aportar sustrato de plantación'},
    'Pflaster verlegen und rütteln': {
        "en": 'Lay and compact the paving', "tr": 'Parke döşeme ve sıkıştırma',
        "es": 'Colocar y vibrar el adoquinado'},
    'Pfosten setzen und betonieren': {
        "en": 'Set and concrete the posts', "tr": 'Direkleri dikip betonlama',
        "es": 'Colocar y hormigonar los postes'},
    'Pfosten und Elemente montieren': {
        "en": 'Fit posts and panels', "tr": 'Direk ve paneller montajı',
        "es": 'Montar postes y paneles'},
    'Polsterung erneuern und beziehen': {
        "en": 'Renew padding and re-cover', "tr": 'Dolgu yenileme ve kaplama',
        "es": 'Renovar relleno y tapizar'},
    'Protokoll erstellen': {
        "en": 'Produce the certificate', "tr": 'Rapor düzenleme',
        "es": 'Emitir el informe'},
    'Prüfprotokoll': {
        "en": 'Test certificate', "tr": 'Test raporu',
        "es": 'Acta de comprobación'},
    'Prüfung und Beschriftung': {
        "en": 'Testing and labelling', "tr": 'Test ve etiketleme',
        "es": 'Comprobación y etiquetado'},
    'Prüfung und Kennzeichnung': {
        "en": 'Testing and marking', "tr": 'Test ve işaretleme',
        "es": 'Comprobación y marcado'},
    'Prüfung und Protokoll': {
        "en": 'Testing and certificate', "tr": 'Test ve rapor',
        "es": 'Comprobación e informe'},
    'Punktfundamente setzen': {
        "en": 'Cast the pad foundations', "tr": 'Nokta temel dökme',
        "es": 'Ejecutar las zapatas'},
    'Putz auftragen und strukturieren': {
        "en": 'Apply and texture the render', "tr": 'Sıva uygulama ve desenleme',
        "es": 'Aplicar y texturar el revoco'},
    'Putz und Haftgrund': {
        "en": 'Render and bonding primer', "tr": 'Sıva ve aderans astarı',
        "es": 'Revoco e imprimación de agarre'},
    'Rahmen anpassen und einsetzen': {
        "en": 'Trim and fit the frame', "tr": 'Çerçeveyi uyarlayıp takma',
        "es": 'Ajustar y colocar el marco'},
    'Randgestaltung': {
        "en": 'Edge detailing', "tr": 'Kenar düzenlemesi',
        "es": 'Remate de bordes'},
    'Rasen mähen': {
        "en": 'Mow the lawn', "tr": 'Çim biçme',
        "es": 'Cortar el césped'},
    'Rasentragschicht': {
        "en": 'Lawn base layer', "tr": 'Çim taşıyıcı tabakası',
        "es": 'Capa soporte de césped'},
    'Rauchrohr und Anschluss herstellen': {
        "en": 'Fit the flue pipe and connection', "tr": 'Duman borusu ve bağlantı yapımı',
        "es": 'Ejecutar el tubo de humos y la conexión'},
    'Rauchwarnmelder': {
        "en": 'Smoke alarm', "tr": 'Duman dedektörü',
        "es": 'Detector de humo'},
    'Raufaser ansetzen und tapezieren': {
        "en": 'Set out and hang the woodchip', "tr": 'Kabartmalı kağıdı yerleştirip kaplama',
        "es": 'Replantear y colocar el papel de fibra'},
    'Raufaser, Kleister und Farbe': {
        "en": 'Woodchip, paste and paint', "tr": 'Kabartmalı kağıt, tutkal ve boya',
        "es": 'Papel de fibra, cola y pintura'},
    'Reinigen und entfetten': {
        "en": 'Clean and degrease', "tr": 'Temizleme ve yağ alma',
        "es": 'Limpiar y desengrasar'},
    'Reinigen und entstauben': {
        "en": 'Clean and dust off', "tr": 'Temizleme ve tozunu alma',
        "es": 'Limpiar y desempolvar'},
    'Reinigen, Niederdruck': {
        "en": 'Clean, low pressure', "tr": 'Temizleme, düşük basınç',
        "es": 'Limpiar, baja presión'},
    'Reinigen, schleifen, entgrauen': {
        "en": 'Clean, sand, remove greying', "tr": 'Temizleme, zımpara, grileşme giderme',
        "es": 'Limpiar, lijar, desgrisar'},
    'Reiniger und Imprägnierung': {
        "en": 'Cleaner and sealer', "tr": 'Temizleyici ve emprenye',
        "es": 'Limpiador e hidrofugante'},
    'Revisionsöffnung, Diagnose': {
        "en": 'Access opening, diagnosis', "tr": 'Bakım açıklığı, teşhis',
        "es": 'Registro de acceso y diagnóstico'},
    'Rinne und Fallrohr': {
        "en": 'Gutter and downpipe', "tr": 'Oluk ve iniş borusu',
        "es": 'Canalón y bajante'},
    'Rinneisen setzen und montieren': {
        "en": 'Fit and mount the gutter brackets', "tr": 'Oluk demirlerini takıp montaj',
        "es": 'Colocar y montar los ganchos'},
    'Abdecken': {
        "en": 'Cover up', "tr": 'Örtme',
        "es": 'Cubrir'},
    'Abdecken und Abkleben': {
        "en": 'Cover and mask', "tr": 'Örtme ve bantlama',
        "es": 'Cubrir y proteger'},
    'Abdichtung und Drainage': {
        "en": 'Waterproofing and drainage', "tr": 'Su yalıtımı ve drenaj',
        "es": 'Impermeabilización y drenaje'},
    'Abdichtung, zwei Lagen': {
        "en": 'Waterproofing, two layers', "tr": 'Su yalıtımı, çift kat',
        "es": 'Impermeabilización, dos capas'},
    'Abdichtungsmasse und Grundierung': {
        "en": 'Tanking compound and primer', "tr": 'Yalıtım malzemesi ve astar',
        "es": 'Masa impermeable e imprimación'},
    'Ablauf und Gefälle herstellen': {
        "en": 'Form the waste and the fall', "tr": 'Gider ve eğim oluşturma',
        "es": 'Ejecutar desagüe y pendiente'},
    'Absicherung und FI im Verteiler': {
        "en": 'Protection and RCD in the board', "tr": 'Panoda sigorta ve kaçak akım rölesi',
        "es": 'Protección y diferencial en el cuadro'},
    'Abstützung stellen': {
        "en": 'Install propping', "tr": 'Destek kurma',
        "es": 'Colocar apeos'},
    'Aktor und Bedienteil': {
        "en": 'Actuator and control unit', "tr": 'Aktüatör ve kumanda',
        "es": 'Actuador y panel de control'},
    'Aktoren setzen und einlernen': {
        "en": 'Fit and pair the actuators', "tr": 'Aktüatörleri takıp eşleştirme',
        "es": 'Instalar y emparejar actuadores'},
    'Altanlage demontieren': {
        "en": 'Strip out the old installation', "tr": 'Eski tesisatı sökme',
        "es": 'Desmontar la instalación antigua'},
    'Altanstrich anschleifen, lose Teile entfernen': {
        "en": 'Sand the old coat, remove loose material', "tr": 'Eski boyayı zımparalama, gevşek kısımları alma',
        "es": 'Lijar la pintura vieja, retirar lo suelto'},
    'Altarmatur demontieren': {
        "en": 'Remove the old tap', "tr": 'Eski armatürü sökme',
        "es": 'Desmontar el grifo antiguo'},
    'Altbestand demontieren': {
        "en": 'Strip out the existing', "tr": 'Mevcudu sökme',
        "es": 'Desmontar lo existente'},
    'Altbezug abnehmen': {
        "en": 'Strip the old cover', "tr": 'Eski kılıfı sökme',
        "es": 'Retirar la tapicería antigua'},
    'Altdeckung abnehmen': {
        "en": 'Strip the old roof covering', "tr": 'Eski çatı örtüsünü sökme',
        "es": 'Retirar la cubierta antigua'},
    'Alte Bank entfernen': {
        "en": 'Remove the old sill', "tr": 'Eski denizliği sökme',
        "es": 'Retirar el alféizar antiguo'},
    'Alte Tür ausbauen': {
        "en": 'Remove the old door', "tr": 'Eski kapıyı sökme',
        "es": 'Desmontar la puerta antigua'},
    'Alte Tür und Zarge ausbauen': {
        "en": 'Remove the old door and frame', "tr": 'Eski kapı ve kasayı sökme',
        "es": 'Desmontar puerta y marco antiguos'},
    'Altfenster ausbauen': {
        "en": 'Remove the old window', "tr": 'Eski pencereyi sökme',
        "es": 'Desmontar la ventana antigua'},
    'Altfuge entfernen': {
        "en": 'Rake out the old joint', "tr": 'Eski derzi sökme',
        "es": 'Retirar la junta antigua'},
    'Altgerät demontieren': {
        "en": 'Remove the old appliance', "tr": 'Eski cihazı sökme',
        "es": 'Desmontar el aparato antiguo'},
    'Altgerät demontieren, Anlage entleeren': {
        "en": 'Remove the old unit, drain the system', "tr": 'Eski cihazı sökme, tesisatı boşaltma',
        "es": 'Desmontar el equipo y vaciar la instalación'},
    'Altgerät entleeren und ausbauen': {
        "en": 'Drain and remove the old unit', "tr": 'Eski cihazı boşaltıp sökme',
        "es": 'Vaciar y desmontar el equipo antiguo'},
    'Altglas ausbauen': {
        "en": 'Remove the old glazing', "tr": 'Eski camı sökme',
        "es": 'Retirar el vidrio antiguo'},
    'Altheizkörper demontieren': {
        "en": 'Remove the old radiator', "tr": 'Eski radyatörü sökme',
        "es": 'Desmontar el radiador antiguo'},
    'Altrinne demontieren': {
        "en": 'Remove the old gutter', "tr": 'Eski oluğu sökme',
        "es": 'Desmontar el canalón antiguo'},
    'Altverteiler demontieren': {
        "en": 'Strip out the old board', "tr": 'Eski panoyu sökme',
        "es": 'Desmontar el cuadro antiguo'},
    'Altwanne ausbauen': {
        "en": 'Remove the old bath', "tr": 'Eski küveti sökme',
        "es": 'Retirar la bañera antigua'},
    'Anfahrt': {
        "en": 'Travel to site', "tr": 'Gidiş',
        "es": 'Desplazamiento'},
    'Anfahrt Notdienst': {
        "en": 'Emergency call-out travel', "tr": 'Acil servis gidişi',
        "es": 'Desplazamiento de urgencia'},
    'Anlage inkl. Außenstation': {
        "en": 'System including door station', "tr": 'Dış ünite dahil sistem',
        "es": 'Sistema incl. placa exterior'},
    'Anschließen und prüfen': {
        "en": 'Connect and test', "tr": 'Bağlama ve test',
        "es": 'Conectar y comprobar'},
    'Anschlussfugen schließen': {
        "en": 'Seal the perimeter joints', "tr": 'Bağlantı derzlerini kapatma',
        "es": 'Sellar juntas de encuentro'},
    'Anschlussschläuche, Dichtungen': {
        "en": 'Connection hoses, seals', "tr": 'Bağlantı hortumları, contalar',
        "es": 'Latiguillos y juntas'},
    'Arbeitsbereich abschotten': {
        "en": 'Seal off the work area', "tr": 'Çalışma alanını izole etme',
        "es": 'Confinar la zona de trabajo'},
    'Arbeitsplatte und Anschlüsse': {
        "en": 'Worktop and connections', "tr": 'Tezgah ve bağlantılar',
        "es": 'Encimera y conexiones'},
    'Arbeitsplatte zuschneiden und montieren': {
        "en": 'Cut and fit the worktop', "tr": 'Tezgahı kesip monte etme',
        "es": 'Cortar y montar la encimera'},
    'Armierband, Spachtel, Grundierung': {
        "en": 'Scrim tape, filler, primer', "tr": 'File bandı, macun, astar',
        "es": 'Cinta de armar, masilla, imprimación'},
    'Armieren und verspachteln': {
        "en": 'Reinforce and fill', "tr": 'Filelemek ve macunlamak',
        "es": 'Armar y enlucir'},
    'Armierungsschicht mit Gewebe': {
        "en": 'Reinforcing coat with mesh', "tr": 'Fileli sıva katı',
        "es": 'Capa de armadura con malla'},
    'Aufarbeiten, häckseln, verladen': {
        "en": 'Process, chip and load', "tr": 'İşleme, parçalama, yükleme',
        "es": 'Trocear, astillar y cargar'},
    'Aufbauen und ausrichten': {
        "en": 'Assemble and align', "tr": 'Kurma ve hizalama',
        "es": 'Montar y nivelar'},
    'Aufmaß und Planung': {
        "en": 'Survey and planning', "tr": 'Ölçüm ve planlama',
        "es": 'Medición y planificación'},
    'Aufmaß vor Ort': {
        "en": 'Site survey', "tr": 'Yerinde ölçüm',
        "es": 'Medición in situ'},
    'Aufstellung, Hydraulik, Elektro': {
        "en": 'Siting, pipework, electrics', "tr": 'Yerleştirme, hidrolik, elektrik',
        "es": 'Ubicación, hidráulica y electricidad'},
    'Aus- und Einladen': {
        "en": 'Loading and unloading', "tr": 'Yükleme ve boşaltma',
        "es": 'Carga y descarga'},
    'Ausgleichsmasse auftragen': {
        "en": 'Apply levelling compound', "tr": 'Tesviye şapı uygulama',
        "es": 'Aplicar masa niveladora'},
    'Aushub und Abtransport': {
        "en": 'Excavate and cart away', "tr": 'Kazı ve nakliye',
        "es": 'Excavar y retirar'},
    'Aushub und Abtransport (Minibagger)': {
        "en": 'Excavate and cart away (mini digger)', "tr": 'Kazı ve nakliye (mini ekskavatör)',
        "es": 'Excavar y retirar (miniexcavadora)'},
    'Aushub und Planum': {
        "en": 'Excavation and formation level', "tr": 'Kazı ve zemin kotu',
        "es": 'Excavación y explanada'},
    'Ausrichten, bohren, befestigen': {
        "en": 'Align, drill, fix', "tr": 'Hizalama, delme, sabitleme',
        "es": 'Alinear, taladrar, fijar'},
    'Auswertung und Gutachten': {
        "en": 'Assessment and report', "tr": 'Değerlendirme ve rapor',
        "es": 'Evaluación e informe'},
    'Automaten und FI ergänzen': {
        "en": 'Add breakers and RCD', "tr": 'Sigorta ve kaçak akım rölesi ekleme',
        "es": 'Añadir magnetotérmicos y diferencial'},
    'Becken inkl. Technik': {
        "en": 'Pool shell including plant', "tr": 'Teknik dahil havuz',
        "es": 'Vaso incl. equipamiento'},
    'Befahrung und Aufzeichnung': {
        "en": 'Survey run and recording', "tr": 'İnceleme ve kayıt',
        "es": 'Inspección y grabación'},
    'Befallenen Putz bzw. Anstrich entfernen': {
        "en": 'Remove affected render or paint', "tr": 'Etkilenen sıva veya boyayı sökme',
        "es": 'Retirar revoco o pintura afectados'},
    'Befund und Ortung': {
        "en": 'Assessment and tracing', "tr": 'Tespit ve konumlandırma',
        "es": 'Diagnóstico y localización'},
    'Befund und Protokoll': {
        "en": 'Findings and certificate', "tr": 'Bulgu ve rapor',
        "es": 'Diagnóstico e informe'},
    'Befüllen und entlüften': {
        "en": 'Fill and vent', "tr": 'Doldurma ve hava alma',
        "es": 'Llenar y purgar'},
    'Behandlung': {
        "en": 'Treatment', "tr": 'Uygulama',
        "es": 'Tratamiento'},
    'Behebung im Rahmen der Erstmaßnahme': {
        "en": 'Repair within the first call-out', "tr": 'İlk müdahale kapsamında giderme',
        "es": 'Reparación dentro de la primera intervención'},
    'Belag aufnehmen': {
        "en": 'Lift the covering', "tr": 'Kaplamayı sökme',
        "es": 'Levantar el revestimiento'},
    'Belag verlegen': {
        "en": 'Lay the covering', "tr": 'Kaplamayı döşeme',
        "es": 'Colocar el revestimiento'},
    'Beschichtung auftragen': {
        "en": 'Apply the coating', "tr": 'Kaplamayı uygulama',
        "es": 'Aplicar el revestimiento'},
    'Beschläge demontieren und montieren': {
        "en": 'Remove and refit ironmongery', "tr": 'Donanımı sökme ve takma',
        "es": 'Desmontar y montar herrajes'},
    'Beschläge lösen und wieder montieren': {
        "en": 'Free off and refit ironmongery', "tr": 'Donanımı sökme ve yeniden takma',
        "es": 'Soltar y volver a montar herrajes'},
    'Bezugsstoff': {
        "en": 'Cover fabric', "tr": 'Kılıf kumaşı',
        "es": 'Tela de tapizado'},
    'Boden fräsen und planieren': {
        "en": 'Rotavate and level the ground', "tr": 'Zemini frezeleyip düzleme',
        "es": 'Fresar y nivelar el terreno'},
    'Boden lockern und Aushub': {
        "en": 'Break up the ground and excavate', "tr": 'Zemini gevşetme ve kazı',
        "es": 'Roturar el terreno y excavar'},
    'Boden vorbereiten': {
        "en": 'Prepare the ground', "tr": 'Zemini hazırlama',
        "es": 'Preparar el terreno'},
    'Bodenplatte / Funkenschutz': {
        "en": 'Hearth plate / spark guard', "tr": 'Zemin plakası / kıvılcım koruma',
        "es": 'Placa de suelo / protección de chispas'},
    'Bohren, dübeln, ausrichten': {
        "en": 'Drill, plug, align', "tr": 'Delme, dübelleme, hizalama',
        "es": 'Taladrar, tacar, alinear'},
    'Böden, Sanitär, Papierkorb': {
        "en": 'Floors, washrooms, bins', "tr": 'Zeminler, saniter, çöp kutusu',
        "es": 'Suelos, aseos, papeleras'},
    'DC/AC-Verkabelung': {
        "en": 'DC/AC wiring', "tr": 'DC/AC kablolama',
        "es": 'Cableado CC/CA'},
    'Datenleitung verlegen': {
        "en": 'Run the data cable', "tr": 'Veri kablosu çekme',
        "es": 'Tender el cable de datos'},
    'Decken, zwei Anstriche': {
        "en": 'Ceilings, two coats', "tr": 'Tavanlar, iki kat',
        "es": 'Techos, dos manos'},
    'Deckenanstrich, zwei Anstriche': {
        "en": 'Ceiling paint, two coats', "tr": 'Tavan boyası, iki kat',
        "es": 'Pintura de techo, dos manos'},
    'Deckenfarbe': {
        "en": 'Ceiling paint', "tr": 'Tavan boyası',
        "es": 'Pintura de techo'},
    'Desinfektion und Trocknung prüfen': {
        "en": 'Disinfect and check drying', "tr": 'Dezenfeksiyon ve kuruma kontrolü',
        "es": 'Desinfectar y comprobar el secado'},
    'Dichtbänder, Ecken und Manschetten': {
        "en": 'Sealing tapes, corners and collars', "tr": 'Yalıtım bantları, köşe ve manşetler',
        "es": 'Bandas, esquinas y manguitos'},
    'Dichtheitsprüfung': {
        "en": 'Pressure test', "tr": 'Sızdırmazlık testi',
        "es": 'Prueba de estanqueidad'},
    'Dichtheitsprüfung und Übergabe': {
        "en": 'Pressure test and handover', "tr": 'Sızdırmazlık testi ve teslim',
        "es": 'Prueba de estanqueidad y entrega'},
    'Dichtungen und Verschleißteile': {
        "en": 'Seals and wear parts', "tr": 'Contalar ve aşınma parçaları',
        "es": 'Juntas y piezas de desgaste'},
    'Dichtungen, Kleinmaterial': {
        "en": 'Seals, sundries', "tr": 'Contalar, sarf malzeme',
        "es": 'Juntas y material menudo'},
    'Dielen verlegen und verschrauben': {
        "en": 'Lay and screw down the boards', "tr": 'Döşemeleri serip vidalama',
        "es": 'Colocar y atornillar las tablas'},
    'Dispersionsfarbe': {
        "en": 'Emulsion paint', "tr": 'Dispersiyon boya',
        "es": 'Pintura plástica'},
    'Doppelt beplanken': {
        "en": 'Double boarding', "tr": 'Çift kat kaplama',
        "es": 'Doble placa'},
    'Dose setzen (Dosenfräse)': {
        "en": 'Cut in the back box (core cutter)', "tr": 'Kutu açma (kutu freze)',
        "es": 'Abrir la caja (fresa)'},
    'Dose setzen und anschließen': {
        "en": 'Fit and connect the back box', "tr": 'Kutuyu takıp bağlama',
        "es": 'Colocar y conectar la caja'},
    'Dose setzen und auflegen': {
        "en": 'Fit the outlet and terminate', "tr": 'Kutuyu takıp uçları bağlama',
        "es": 'Colocar la toma y conexionar'},
    'Dose, Einsatz, Abdeckung': {
        "en": 'Box, insert, faceplate', "tr": 'Kutu, mekanizma, kapak',
        "es": 'Caja, mecanismo, embellecedor'},
    'Drainmörtel bzw. Lager, Fuge': {
        "en": 'Drainage mortar or pedestals, grout', "tr": 'Drenaj harcı veya takoz, derz',
        "es": 'Mortero drenante o plots, junta'},
    'Dreimal versiegeln': {
        "en": 'Seal three times', "tr": 'Üç kat vernik',
        "es": 'Barnizar tres manos'},
    'Druckprobe durchführen': {
        "en": 'Carry out the pressure test', "tr": 'Basınç testi yapma',
        "es": 'Realizar la prueba de presión'},
    'Druckprobe und Protokoll': {
        "en": 'Pressure test and certificate', "tr": 'Basınç testi ve rapor',
        "es": 'Prueba de presión e informe'},
    'Durchbruch herstellen': {
        "en": 'Form the opening', "tr": 'Açıklık oluşturma',
        "es": 'Ejecutar el hueco'},
    'Duschelemente, Armatur, Tür': {
        "en": 'Shower elements, tap, door', "tr": 'Duş elemanları, armatür, kapı',
        "es": 'Elementos de ducha, grifo, puerta'},
    'Dämmplatten kleben und dübeln': {
        "en": 'Bond and fix the insulation boards', "tr": 'Yalıtım levhalarını yapıştırıp dübelleme',
        "es": 'Pegar y anclar las placas aislantes'},
    'Dämmung einlegen': {
        "en": 'Install insulation', "tr": 'Yalıtım yerleştirme',
        "es": 'Colocar el aislamiento'},
    'Dämmung nach ÖNORM': {
        "en": 'Insulation to ÖNORM', "tr": "ÖNORM'a göre yalıtım",
        "es": 'Aislamiento según ÖNORM'},
    'Dämmung verlegen': {
        "en": 'Lay insulation', "tr": 'Yalıtım döşeme',
        "es": 'Tender el aislamiento'},
    'Dämmung, Kleber, Gewebe, Putz': {
        "en": 'Insulation, adhesive, mesh, render', "tr": 'Yalıtım, yapıştırıcı, file, sıva',
        "es": 'Aislante, adhesivo, malla, revoco'},
    'Eckventile, Siphon, Kleinmaterial': {
        "en": 'Isolating valves, trap, sundries', "tr": 'Ara musluk, sifon, sarf malzeme',
        "es": 'Llaves de escuadra, sifón, material menudo'},
    'Einbau, Anschluss, Abdichtung': {
        "en": 'Installation, connection, sealing', "tr": 'Montaj, bağlantı, yalıtım',
        "es": 'Instalación, conexión, sellado'},
    'Einbau, Befestigung, Abdichtung (RAL)': {
        "en": 'Installation, fixing, sealing (RAL)', "tr": 'Montaj, sabitleme, yalıtım (RAL)',
        "es": 'Instalación, fijación, sellado (RAL)'},
    'Einbau, Verrohrung, Technikraum': {
        "en": 'Installation, pipework, plant room', "tr": 'Montaj, borulama, teknik oda',
        "es": 'Instalación, tuberías, sala técnica'},
    'Einsatz tauschen und prüfen': {
        "en": 'Replace and test the mechanism', "tr": 'Mekanizmayı değiştirip test etme',
        "es": 'Sustituir y comprobar el mecanismo'},
    'Einsatz und Abdeckung': {
        "en": 'Mechanism and faceplate', "tr": 'Mekanizma ve kapak',
        "es": 'Mecanismo y embellecedor'},
    'Elektroanschluss': {
        "en": 'Electrical connection', "tr": 'Elektrik bağlantısı',
        "es": 'Conexión eléctrica'},
    'Endmontage und Übergabe': {
        "en": 'Final fit and handover', "tr": 'Son montaj ve teslim',
        "es": 'Montaje final y entrega'},
    'Entrosten und anschleifen': {
        "en": 'De-rust and sand', "tr": 'Pas alma ve zımpara',
        "es": 'Desoxidar y lijar'},
    'Entsorgung': {
        "en": 'Disposal', "tr": 'Bertaraf',
        "es": 'Retirada'},
    'Entsorgung Bauschutt': {
        "en": 'Rubble disposal', "tr": 'İnşaat atığı bertarafı',
        "es": 'Retirada de escombros'},
    'Epoxid-Grundierung': {
        "en": 'Epoxy primer', "tr": 'Epoksi astar',
        "es": 'Imprimación epoxi'},
    'Ersatzteile': {
        "en": 'Spare parts', "tr": 'Yedek parçalar',
        "es": 'Repuestos'},
    'Erstdiagnose vor Ort': {
        "en": 'First diagnosis on site', "tr": 'Yerinde ilk teşhis',
        "es": 'Primer diagnóstico in situ'},
    'Estrich abbrechen': {
        "en": 'Break out the screed', "tr": 'Şapı sökme',
        "es": 'Demoler la solera'},
    'Fallbereich sichern und abseilen': {
        "en": 'Secure the fall zone and rope down', "tr": 'Devrilme alanını güvenceye alıp indirme',
        "es": 'Asegurar la zona de caída y descolgar'},
    'Fassade reinigen': {
        "en": 'Clean the facade', "tr": 'Cepheyi temizleme',
        "es": 'Limpiar la fachada'},
    'Fassadenanstrich, zwei Anstriche': {
        "en": 'Facade paint, two coats', "tr": 'Cephe boyası, iki kat',
        "es": 'Pintura de fachada, dos manos'},
    'Fassadenfarbe': {
        "en": 'Facade paint', "tr": 'Cephe boyası',
        "es": 'Pintura de fachada'},
    'Fehler suchen und beheben': {
        "en": 'Find and fix the fault', "tr": 'Arıza arama ve giderme',
        "es": 'Localizar y reparar la avería'},
    'Fein- und Zwischenschliff': {
        "en": 'Fine and intermediate sanding', "tr": 'İnce ve ara zımpara',
        "es": 'Lijado fino e intermedio'},
    'Feinreinigung Flächen und Glas': {
        "en": 'Fine clean, surfaces and glass', "tr": 'Yüzey ve cam ince temizliği',
        "es": 'Limpieza fina de superficies y cristales'},
    'Feinspachtelung vollflächig': {
        "en": 'Full-surface fine filling', "tr": 'Tam yüzey ince macun',
        "es": 'Enlucido fino a toda superficie'},
    'Fenster beidseitig reinigen': {
        "en": 'Clean windows both sides', "tr": 'Pencereleri iki yüzden temizleme',
        "es": 'Limpiar ventanas por ambas caras'},
    'Fensterelement': {
        "en": 'Window unit', "tr": 'Pencere elemanı',
        "es": 'Unidad de ventana'},
    'Fertigung': {
        "en": 'Fabrication', "tr": 'İmalat',
        "es": 'Fabricación'},
    'Fertigung in der Werkstatt': {
        "en": 'Fabrication at the workshop', "tr": 'Atölyede imalat',
        "es": 'Fabricación en taller'},
    'Filz abrechen und aufnehmen': {
        "en": 'Rake out and collect the thatch', "tr": 'Keçeyi tırmıklayıp toplama',
        "es": 'Rastrillar y recoger el fieltro'},
    'Fliese und Kleberbett entfernen': {
        "en": 'Remove tile and adhesive bed', "tr": 'Fayans ve yapıştırıcı yatağını sökme',
        "es": 'Retirar azulejo y lecho de adhesivo'},
    'Fliese, Kleber, Fuge': {
        "en": 'Tile, adhesive, grout', "tr": 'Fayans, yapıştırıcı, derz',
        "es": 'Azulejo, adhesivo, junta'},
    'Fliesen abschlagen': {
        "en": 'Break off the tiles', "tr": 'Fayansları kırma',
        "es": 'Picar los azulejos'},
    'Fliesen und Mörtelbett abschlagen': {
        "en": 'Break off tiles and mortar bed', "tr": 'Fayans ve harç yatağını kırma',
        "es": 'Picar azulejos y lecho de mortero'},
    'Fliesen verlegen': {
        "en": 'Lay tiles', "tr": 'Fayans döşeme',
        "es": 'Colocar azulejos'},
    'Fliesenarbeiten': {
        "en": 'Tiling work', "tr": 'Fayans işleri',
        "es": 'Trabajos de alicatado'},
    'Fließbettkleber, Fuge, Nivellierkeile': {
        "en": 'Flow-bed adhesive, grout, levelling wedges', "tr": 'Akışkan yapıştırıcı, derz, tesviye kaması',
        "es": 'Adhesivo fluido, junta, cuñas niveladoras'},
    'Flächenspachtelung Q3': {
        "en": 'Q3 surface filling', "tr": 'Q3 yüzey macunu',
        "es": 'Enlucido de superficie Q3'},
    'Frostschutz und Tragschicht': {
        "en": 'Frost blanket and base course', "tr": 'Don koruma ve taşıyıcı tabaka',
        "es": 'Capa anticongelante y base'},
    'Frostsicher verlegen': {
        "en": 'Lay frost-proof', "tr": 'Dona dayanıklı döşeme',
        "es": 'Colocar resistente a heladas'},
    'Fugen ausfräsen': {
        "en": 'Rake out the joints', "tr": 'Derzleri açma',
        "es": 'Fresar las juntas'},
    'Fugenmasse und Silikon': {
        "en": 'Grout and silicone', "tr": 'Derz dolgusu ve silikon',
        "es": 'Material de junta y silicona'},
    'Fundament herstellen': {
        "en": 'Form the foundation', "tr": 'Temel yapma',
        "es": 'Ejecutar la cimentación'},
    'Fundament und Tragschicht': {
        "en": 'Foundation and base course', "tr": 'Temel ve taşıyıcı tabaka',
        "es": 'Cimentación y capa base'},
    'Funktionskontrolle und Spülung': {
        "en": 'Function check and flush', "tr": 'İşlev kontrolü ve yıkama',
        "es": 'Comprobación de funcionamiento y purga'},
    'Fällen bzw. Stückfällung': {
        "en": 'Felling or sectional felling', "tr": 'Kesim veya parçalı kesim',
        "es": 'Tala o tala por tramos'},
    'Füllsteine einbringen': {
        "en": 'Place the fill stones', "tr": 'Dolgu taşlarını yerleştirme',
        "es": 'Colocar la piedra de relleno'},
}


# ── Assumption notes ────────────────────────────────────────────────────
#
# What the pro forwards to a customer as the terms of the quote.

NOTES: dict[str, dict[str, str]] = {
    'Das zu montierende Element wird bauseits beigestellt und ist nicht im Preis enthalten. Der Preis umfasst Montage sowie Befestigungs- und Dichtmaterial.': {
        "en": 'The item to be fitted is supplied by the client and is not included in the price. The price covers the fitting plus fixings and sealant.', "tr": 'Monte edilecek eleman müşteri tarafından temin edilir ve fiyata dahil değildir. Fiyat, montaj ile bağlantı ve sızdırmazlık malzemesini kapsar.',
        "es": 'El elemento a montar lo aporta el cliente y no está incluido en el precio. El precio cubre el montaje y el material de fijación y sellado.'},
    'Das Element ist im Preis enthalten. Die Spanne entspricht der angegebenen Ausführung; eine höherwertige Ausführung wird gesondert verrechnet.': {
        "en": 'The item is included in the price. The range corresponds to the specification stated; a higher specification is charged separately.', "tr": 'Eleman fiyata dahildir. Aralık, belirtilen donanıma karşılık gelir; daha üst donanım ayrıca faturalandırılır.',
        "es": 'El elemento está incluido en el precio. La horquilla corresponde a la calidad indicada; una calidad superior se factura aparte.'},
    'Ab dieser Arbeitshöhe ist eine Absturzsicherung erforderlich. Ob Leiter, Hubarbeitsbühne oder Gerüst hängt von Standfläche und Dauer ab; Hubarbeitsbühne und Gerüst sind nicht im Angebot enthalten.': {
        "en": 'Above this working height, fall protection is required. Whether that means a ladder, a mobile platform or a scaffold depends on the standing ground and the duration; a mobile platform and a scaffold are not included in the quote.', "tr": 'Bu çalışma yüksekliğinin üzerinde düşmeye karşı koruma gereklidir. Merdiven, hidrolik platform veya iskeleden hangisinin kullanılacağı zeminin durumuna ve süreye bağlıdır; hidrolik platform ve iskele teklife dahil değildir.',
        "es": 'A partir de esta altura de trabajo se requiere protección anticaídas. Que sea escalera, plataforma elevadora o andamio depende de la superficie de apoyo y de la duración; la plataforma elevadora y el andamio no están incluidos en la oferta.'},
    'Eine feste Wand nimmt die volle Windlast auf und kann nicht eingefahren werden. Pfosten und Fundamente sind auf die örtliche Windlast auszulegen; ab 180 cm Höhe ist ein größerer Fundamentquerschnitt erforderlich.': {
        "en": 'A fixed screen takes the full wind load and cannot be retracted. Posts and foundations must be sized for the local wind load; from 180 cm high, a larger foundation section is required.', "tr": 'Sabit bir duvar rüzgâr yükünün tamamını taşır ve içeri alınamaz. Direkler ve temeller yerel rüzgâr yüküne göre boyutlandırılmalıdır; 180 cm yükseklikten itibaren daha büyük bir temel kesiti gerekir.',
        "es": 'Una pared fija recibe toda la carga de viento y no puede recogerse. Los postes y las cimentaciones deben dimensionarse para la carga de viento local; a partir de 180 cm de altura se requiere una sección de cimentación mayor.'},
    'Eine Stützmauer nimmt Erddruck auf. Ab etwa 1 m Höhe, bei Hanglage oder bei Belastung der Geländeoberkante ist eine statische Bemessung erforderlich. Sie ist nicht im Angebot enthalten und muss vor Arbeitsbeginn vorliegen.': {
        "en": 'A retaining wall carries earth pressure. From roughly 1 m high, on a slope, or where the ground above it is loaded, a structural calculation is required. It is not part of the quote and must be available before work starts.', "tr": 'İstinat duvarı toprak basıncını taşır. Yaklaşık 1 m yükseklikten itibaren, eğimli arazide veya üst kotta yük olması hâlinde statik hesap gereklidir. Teklife dahil değildir ve işe başlamadan önce hazır olmalıdır.',
        "es": 'Un muro de contención soporta el empuje del terreno. A partir de aproximadamente 1 m de altura, en ladera o cuando la coronación soporta cargas, se requiere un cálculo estructural. No está incluido en la oferta y debe estar disponible antes del inicio de los trabajos.'},
    'Grubensohle, Magerbetonbett und Hinterfüllung erfolgen nach Herstellervorgabe. Bei drückendem Grundwasser, Hanglage oder nicht tragfähigem Boden ist eine gesonderte Bemessung erforderlich; sie ist nicht enthalten.': {
        "en": "The excavation base, lean-concrete bed and backfill follow the manufacturer's specification. Where there is groundwater under pressure, a slope, or unsound soil, a separate calculation is required; it is not included.", "tr": 'Kazı tabanı, grobeton yatağı ve geri dolgu üretici talimatına göre yapılır. Basınçlı yeraltı suyu, eğimli arazi veya taşıma gücü yetersiz zemin hâlinde ayrı bir hesap gereklidir; dahil değildir.',
        "es": 'La base de la excavación, la cama de hormigón de limpieza y el relleno se ejecutan según las indicaciones del fabricante. Con agua freática a presión, en ladera o con suelo no portante se requiere un cálculo aparte; no está incluido.'},
    'Für Schäden an Gebäuden, Leitungen und Bepflanzung im Fallbereich besteht Haftpflichtversicherung. Der Fallbereich ist vor Arbeitsbeginn zu räumen; nicht entfernte Gegenstände sind nicht gedeckt.': {
        "en": 'Damage to buildings, services and planting within the felling zone is covered by liability insurance. The felling zone must be cleared before work starts; items left in place are not covered.', "tr": 'Devrilme alanındaki binalara, hatlara ve bitkilere verilecek zararlar sorumluluk sigortası kapsamındadır. Devrilme alanı işe başlamadan önce boşaltılmalıdır; kaldırılmayan eşyalar kapsam dışıdır.',
        "es": 'Los daños a edificios, conducciones y plantaciones dentro de la zona de caída están cubiertos por el seguro de responsabilidad civil. La zona de caída debe despejarse antes de comenzar; los objetos no retirados no están cubiertos.'},
    'Der Heizkörper muss kalt sein und die Heizung während der Arbeiten und der Trocknung abgeschaltet bleiben. Entleeren oder Abmontieren ist nicht erforderlich und nicht enthalten.': {
        "en": 'The radiator must be cold and the heating switched off during the work and while the paint dries. Draining or removing it is neither necessary nor included.', "tr": 'Radyatör soğuk olmalı ve çalışma ile kuruma süresince ısıtma kapalı kalmalıdır. Boşaltma veya sökme gerekli değildir ve dahil değildir.',
        "es": 'El radiador debe estar frío y la calefacción apagada durante los trabajos y el secado. No es necesario vaciarlo ni desmontarlo, y no está incluido.'},
    'Beistellung der Tapete durch den Auftraggeber ist möglich; der Materialanteil entfällt dann. Für Maßhaltigkeit, Chargengleichheit und ausreichende Menge beigestellter Ware wird nicht gehaftet.': {
        "en": 'The client may supply the wallpaper, in which case the material element falls away. No liability is accepted for the dimensional accuracy, batch consistency or sufficiency of goods supplied by the client.', "tr": 'Duvar kâğıdının müşteri tarafından temin edilmesi mümkündür; bu durumda malzeme payı düşer. Müşteri tarafından temin edilen malın ölçü doğruluğu, parti aynılığı ve miktar yeterliliği için sorumluluk kabul edilmez.',
        "es": 'El cliente puede aportar el papel pintado, en cuyo caso se descuenta la parte de material. No se asume responsabilidad por la exactitud dimensional, la homogeneidad de lote ni la cantidad suficiente del material aportado.'},
    'Geölte Böden brauchen eine Nachpflege — je nach Beanspruchung nach 6 bis 12 Monaten, danach jährlich. Pflegeöl und Nachpflege sind nicht enthalten.': {
        "en": 'Oiled floors need re-oiling — after six to twelve months depending on wear, and annually thereafter. The maintenance oil and the re-oiling are not included.', "tr": 'Yağlı zeminler bakım gerektirir — kullanıma bağlı olarak 6 ila 12 ay sonra, sonrasında yılda bir. Bakım yağı ve bakım uygulaması dahil değildir.',
        "es": 'Los suelos aceitados necesitan mantenimiento: a los seis o doce meses según el uso, y después anualmente. El aceite de mantenimiento y su aplicación no están incluidos.'},
    'Die Ausgleichsmasse muss vor dem Belag durchtrocknen — je nach Schichtdicke und Produkt 1 bis 7 Tage. Der Raum ist in dieser Zeit nicht begehbar und nicht belegreif.': {
        "en": 'The levelling compound has to dry through before the covering goes down — one to seven days depending on thickness and product. The room cannot be walked on or covered during that time.', "tr": 'Tesviye şapı, kaplamadan önce tamamen kurumalıdır — katman kalınlığına ve ürüne göre 1 ila 7 gün. Bu süre boyunca oda ne kullanılabilir ne de kaplanabilir.',
        "es": 'La masilla niveladora debe secar por completo antes de colocar el pavimento: de uno a siete días según el espesor y el producto. Durante ese tiempo la estancia no es transitable ni apta para revestir.'},
    'In Gebäuden vor 1990 können Wand- und Deckenaufbauten, Rohrisolierungen, Schächte und Brandabschottungen asbesthaltig sein. Wird beim Öffnen Verdachtsmaterial angetroffen, werden die Arbeiten unterbrochen und eine Materialanalyse veranlasst. Analyse und Arbeiten nach TRGS 519 sind nicht im Angebot enthalten.': {
        "en": 'In buildings from before 1990, wall and ceiling build-ups, pipe lagging, ducts and fire-stopping may contain asbestos. If suspect material is found on opening up, work stops and a material analysis is commissioned. The analysis and any work to TRGS 519 are not included in the quote.', "tr": "1990 öncesi binalarda duvar ve tavan katmanları, boru yalıtımları, şaftlar ve yangın durdurucular asbest içerebilir. Açma sırasında şüpheli malzemeye rastlanırsa işler durdurulur ve malzeme analizi yaptırılır. Analiz ve TRGS 519'a göre yapılacak işler teklife dahil değildir.",
        "es": 'En edificios anteriores a 1990, los trasdosados de paredes y techos, los aislamientos de tuberías, los patinillos y los sellados cortafuegos pueden contener amianto. Si al abrir se encuentra material sospechoso, se interrumpen los trabajos y se encarga un análisis del material. El análisis y los trabajos según TRGS 519 no están incluidos en la oferta.'},
    'Anstriche vor etwa 1960 können Blei enthalten. Trockenes Schleifen ist dann unzulässig; staubarme Verfahren sind nicht im Angebot enthalten.': {
        "en": 'Paint from before about 1960 may contain lead. Dry sanding is then not permitted; low-dust methods are not included in the quote.', "tr": 'Yaklaşık 1960 öncesi boyalar kurşun içerebilir. Bu durumda kuru zımparalama yasaktır; az tozlu yöntemler teklife dahil değildir.',
        "es": 'Las pinturas anteriores a 1960 aproximadamente pueden contener plomo. En ese caso no se permite el lijado en seco; los métodos de bajo polvo no están incluidos en la oferta.'},
    'Ohne funktionierendes Absperrventil muss der Steigstrang abgesperrt werden. Abstimmung mit der Hausverwaltung und Mehraufwand sind nicht enthalten.': {
        "en": 'Without a working shut-off valve the riser has to be isolated. Coordination with the building management and the extra work involved are not included.', "tr": 'Çalışır durumda bir kesme vanası yoksa ana kolonun kapatılması gerekir. Bina yönetimiyle koordinasyon ve ek iş yükü dahil değildir.',
        "es": 'Sin una llave de corte operativa hay que cerrar el montante. La coordinación con la administración de la finca y el sobrecoste no están incluidos.'},
    'Ohne vorhandene Anschlussdose ist eine neue Zuleitung vom Verteiler erforderlich; nicht im Angebot enthalten.': {
        "en": 'If there is no existing junction box, a new supply line from the distribution board is required; this is not included in the quote.', "tr": 'Mevcut bir bağlantı kutusu yoksa, dağıtım panosundan yeni bir besleme hattı çekilmesi gerekir; teklife dahil değildir.',
        "es": 'Si no existe caja de conexión, se requiere una nueva línea desde el cuadro eléctrico; no está incluida en la oferta.'},
    'Prüfintervalle richten sich nach Nutzung und Landesrecht (Wohnung meist 10 Jahre, Gewerbe kürzer).': {
        "en": 'Inspection intervals depend on use and regional law (usually ten years for dwellings, shorter for commercial premises).', "tr": 'Muayene aralıkları kullanıma ve eyalet mevzuatına göre belirlenir (konutlarda genellikle 10 yıl, ticari yerlerde daha kısa).',
        "es": 'Los intervalos de revisión dependen del uso y de la normativa autonómica (en viviendas, por lo general diez años; en locales comerciales, menos).'},
    'RDKS-Sensoren werden geprüft; Ersatz bei Defekt nach Aufwand.': {
        "en": 'TPMS sensors are checked; replacement of faulty ones is charged on a time-and-materials basis.', "tr": 'Lastik basınç sensörleri (TPMS) kontrol edilir; arızalı olanların değişimi sarf esasına göre faturalandırılır.',
        "es": 'Se comprueban los sensores TPMS; su sustitución en caso de avería se factura según el tiempo y el material empleados.'},
    'Radikalschnitt ist zwischen 1. März und 30. September gesetzlich eingeschränkt.': {
        "en": 'Hard cutting back is legally restricted between 1 March and 30 September.', "tr": 'Radikal budama, 1 Mart ile 30 Eylül arasında yasal olarak kısıtlıdır.',
        "es": 'La poda radical está legalmente restringida entre el 1 de marzo y el 30 de septiembre.'},
    'Rauchwarnmelderpflicht besteht in allen österreichischen Bundesländern und deutschen Ländern; Wartung obliegt je nach Landesrecht Eigentümer oder Mieter.': {
        "en": 'Smoke alarms are mandatory in every Austrian and German state; depending on regional law, maintenance is the duty of either the owner or the tenant.', "tr": 'Duman dedektörü zorunluluğu tüm Avusturya ve Almanya eyaletlerinde geçerlidir; bakım, eyalet mevzuatına göre mülk sahibine veya kiracıya aittir.',
        "es": 'La instalación de detectores de humo es obligatoria en todos los estados de Austria y Alemania; según la normativa autonómica, el mantenimiento corresponde al propietario o al inquilino.'},
    'Raumklima 18-24 °C und 45-65 % rel. Luftfeuchte sind bauseits sicherzustellen.': {
        "en": 'The client must ensure indoor conditions of 18-24 °C and 45-65 % relative humidity.', "tr": '18-24 °C oda sıcaklığı ve %45-65 bağıl nem koşullarının sağlanması mal sahibine aittir.',
        "es": 'La propiedad debe garantizar unas condiciones ambientales de 18-24 °C y 45-65 % de humedad relativa.'},
    'Rollrasen muss innerhalb von 24 Stunden nach Lieferung verlegt und gewässert werden. Der Termin ist witterungs- und lieferabhängig.': {
        "en": 'Turf must be laid and watered within 24 hours of delivery. The date depends on the weather and on delivery.', "tr": 'Hazır çim, teslimattan sonraki 24 saat içinde serilmeli ve sulanmalıdır. Tarih hava koşullarına ve teslimata bağlıdır.',
        "es": 'El césped en rollo debe colocarse y regarse dentro de las 24 horas siguientes a su entrega. La fecha depende de la meteorología y del suministro.'},
    'Schlüsselübergabe ist zu vereinbaren; Schlüsselverwaltung nach Absprache.': {
        "en": 'Handover of keys must be arranged; key-holding by agreement.', "tr": 'Anahtar teslimi ayrıca kararlaştırılmalıdır; anahtar saklama hizmeti mutabakata bağlıdır.',
        "es": 'La entrega de llaves debe acordarse; la custodia de llaves, según convenio.'},
    'Schäden durch Fremdkörper (Feuchttücher, Hygieneartikel) sind nicht vom Angebot gedeckt.': {
        "en": 'Damage caused by foreign objects (wet wipes, sanitary products) is not covered by this quote.', "tr": 'Yabancı cisimlerin (ıslak mendil, hijyen ürünleri) yol açtığı hasarlar bu teklif kapsamında değildir.',
        "es": 'Los daños causados por cuerpos extraños (toallitas, productos de higiene) no están cubiertos por esta oferta.'},
    'Silikonfugen sind Wartungsfugen und von der Gewährleistung ausgenommen (ÖNORM B 2207 / IVD).': {
        "en": 'Silicone joints are maintenance joints and are excluded from the warranty (ÖNORM B 2207 / IVD).', "tr": 'Silikon derzler bakım derzidir ve garanti kapsamı dışındadır (ÖNORM B 2207 / IVD).',
        "es": 'Las juntas de silicona son juntas de mantenimiento y quedan excluidas de la garantía (ÖNORM B 2207 / IVD).'},
    'Sind mehrere Abläufe betroffen, liegt die Ursache meist im Fallstrang. Fallstrangreinigung und ggf. Kamerabefahrung werden gesondert verrechnet.': {
        "en": 'If several drains are affected, the cause usually lies in the soil stack. Cleaning the stack and, where needed, a camera survey are charged separately.', "tr": 'Birden fazla gider etkilenmişse, sorunun kaynağı genellikle ana düşey borudur. Düşey borunun temizliği ve gerekirse kamera ile inceleme ayrıca faturalandırılır.',
        "es": 'Si hay varios desagües afectados, la causa suele estar en la bajante. La limpieza de la bajante y, en su caso, la inspección con cámara se facturan aparte.'},
    'Sockelausbildung, Laibungen, Rollladenkästen, Fensterbänke und Dachanschluss sind gesondert zu bewerten. Sie bestimmen die Bauphysik des Systems und sind hier nur pauschal berücksichtigt.': {
        "en": 'The plinth detail, reveals, roller-shutter boxes, window sills and the roof junction have to be assessed separately. They govern the building physics of the system and are only allowed for as a lump sum here.', "tr": 'Sokel detayı, pervaz yüzeyleri, panjur kutuları, denizlikler ve çatı bağlantısı ayrıca değerlendirilmelidir. Bunlar sistemin yapı fiziğini belirler ve burada yalnızca götürü olarak dikkate alınmıştır.',
        "es": 'El detalle de zócalo, las mochetas, las cajas de persiana, los vierteaguas y el encuentro con la cubierta deben valorarse por separado. Determinan la física constructiva del sistema y aquí solo se consideran a tanto alzado.'},
    'Staubschutz und tägliche Grobreinigung sind enthalten. Feinreinigung nicht enthalten.': {
        "en": 'Dust protection and daily rough cleaning are included. Final detailed cleaning is not.', "tr": 'Toz koruması ve günlük kaba temizlik dahildir. İnce temizlik dahil değildir.',
        "es": 'La protección contra el polvo y la limpieza basta diaria están incluidas. La limpieza fina no.'},
    'Tore und Türen sind nicht im Laufmeterpreis enthalten und werden gesondert angeboten.': {
        "en": 'Gates and doors are not covered by the price per linear metre and are quoted separately.', "tr": 'Kapılar ve bahçe kapıları metretül fiyatına dahil değildir, ayrıca teklif edilir.',
        "es": 'Las puertas y portones no están incluidos en el precio por metro lineal y se ofertan por separado.'},
    'Tragen ohne Aufzug ist kalkuliert; ab dem 3. Obergeschoss entsteht Mehraufwand.': {
        "en": 'Carrying without a lift is allowed for; from the third floor upwards additional effort arises.', "tr": 'Asansörsüz taşıma hesaba katılmıştır; 3. kattan itibaren ek iş yükü doğar.',
        "es": 'El acarreo sin ascensor está contemplado; a partir de la tercera planta se genera un sobrecoste.'},
    'Transportversicherung deckt den gesetzlichen Rahmen; Höherwertversicherung auf Wunsch.': {
        "en": 'Transport insurance covers the statutory limits; higher-value cover is available on request.', "tr": 'Nakliye sigortası yasal çerçeveyi kapsar; talep hâlinde yüksek değer sigortası yapılabilir.',
        "es": 'El seguro de transporte cubre los límites legales; a petición, se puede contratar cobertura de mayor valor.'},
    'Trocknung und Folgeschäden (Maler, Boden) sind nicht enthalten.': {
        "en": 'Drying out and consequential damage (painting, flooring) are not included.', "tr": 'Kurutma ve dolaylı hasarlar (boya, zemin) dahil değildir.',
        "es": 'El secado y los daños derivados (pintura, suelo) no están incluidos.'},
    'Untergrund wird als eben und tragfähig angenommen. Ausgleichsarbeiten sind nicht enthalten.': {
        "en": 'The substrate is assumed to be level and sound. Levelling work is not included.', "tr": 'Zeminin düz ve taşıyıcı olduğu varsayılmaktadır. Tesviye işleri dahil değildir.',
        "es": 'Se presupone que el soporte es plano y firme. Los trabajos de nivelación no están incluidos.'},
    'Verbundabdichtung im Nassbereich nach ÖNORM B 3407 / DIN 18534 ist enthalten.': {
        "en": 'A bonded waterproofing membrane in the wet area to ÖNORM B 3407 / DIN 18534 is included.', "tr": "Islak hacimlerde ÖNORM B 3407 / DIN 18534'e uygun sürme su yalıtımı dahildir.",
        "es": 'Se incluye la impermeabilización adherida en la zona húmeda según ÖNORM B 3407 / DIN 18534.'},
    'Verschleißteile (Kette, Bremsbeläge, Züge) sind nicht enthalten.': {
        "en": 'Wear parts (chain, brake pads, cables) are not included.', "tr": 'Aşınan parçalar (zincir, fren balatası, teller) dahil değildir.',
        "es": 'Las piezas de desgaste (cadena, pastillas de freno, cables) no están incluidas.'},
    'Verschnitt ist mit dem angegebenen Prozentsatz kalkuliert. Diagonal- oder Musterverlegung erhöht den Verschnitt.': {
        "en": 'Wastage is calculated at the percentage stated. Diagonal or patterned laying increases wastage.', "tr": 'Fire, belirtilen yüzdeye göre hesaplanmıştır. Diyagonal veya desenli döşeme fireyi artırır.',
        "es": 'El desperdicio está calculado con el porcentaje indicado. La colocación en diagonal o con dibujo lo incrementa.'},
    'Viele Smart-Home-Aktoren benötigen einen Neutralleiter in der Schalterdose. Fehlt er, ist eine Leitungsergänzung nötig; Mehraufwand nach Aufwand.': {
        "en": 'Many smart-home actuators need a neutral conductor in the switch box. If there is none, additional wiring is required; the extra work is charged on a time-and-materials basis.', "tr": 'Birçok akıllı ev aktüatörü, anahtar kutusunda nötr iletken gerektirir. Yoksa hat takviyesi gerekir; ek iş yükü sarf esasına göre faturalandırılır.',
        "es": 'Muchos actuadores domóticos necesitan un conductor neutro en la caja del interruptor. Si no lo hay, se requiere cableado adicional; el sobrecoste se factura según el tiempo y el material empleados.'},
    'Vor Grabarbeiten sind Leitungspläne einzuholen. Schäden an nicht eingemessenen Leitungen sind nicht vom Angebot gedeckt.': {
        "en": 'Utility plans must be obtained before any excavation. Damage to unsurveyed services is not covered by this quote.', "tr": 'Kazı işlerinden önce altyapı planları temin edilmelidir. Ölçülmemiş hatlarda oluşan hasarlar bu teklif kapsamında değildir.',
        "es": 'Antes de excavar deben solicitarse los planos de servicios. Los daños en conducciones no replanteadas no están cubiertos por esta oferta.'},
    'Vor Verlegung ist die Belegreife des Estrichs mittels CM-Messung nachzuweisen (Zementestrich max. 2,0 CM-%, mit Fußbodenheizung 1,8). Die Messung ist nicht enthalten; bei zu hoher Restfeuchte verschiebt sich der Termin.': {
        "en": 'Before laying, the screed must be shown to be ready to cover by CM (carbide) measurement (cement screed max. 2.0 CM-%, 1.8 with underfloor heating). The measurement is not included; if residual moisture is too high the date is postponed.', "tr": 'Döşemeden önce şapın kaplamaya hazır olduğu CM ölçümüyle belgelenmelidir (çimento şapta azami %2,0 CM, yerden ısıtmalıda %1,8). Ölçüm dahil değildir; kalıntı nem yüksekse tarih ertelenir.',
        "es": 'Antes de la colocación debe acreditarse la aptitud de la solera mediante medición CM (mortero de cemento máx. 2,0 CM-%; con suelo radiante, 1,8). La medición no está incluida; si la humedad residual es excesiva, la fecha se aplaza.'},
    'Vor dem Bohren wird eine Leitungsortung durchgeführt. Für nicht ortbare Altleitungen wird keine Haftung übernommen.': {
        "en": 'Cable and pipe detection is carried out before drilling. No liability is accepted for old services that cannot be detected.', "tr": 'Delme işleminden önce hat tespiti yapılır. Tespit edilemeyen eski hatlar için sorumluluk kabul edilmez.',
        "es": 'Antes de taladrar se realiza una detección de conducciones. No se asume responsabilidad por instalaciones antiguas no detectables.'},
    'Wanddurchführung wird fachgerecht abgedichtet; Putz- und Malerarbeiten sind nicht enthalten.': {
        "en": 'The wall penetration is sealed to a professional standard; plastering and painting are not included.', "tr": 'Duvar geçişi tekniğine uygun şekilde sızdırmaz hâle getirilir; sıva ve boya işleri dahil değildir.',
        "es": 'El pasamuros se sella conforme a la técnica; los trabajos de enlucido y pintura no están incluidos.'},
    'Wasser-, Abwasser- und Elektroanschlüsse werden an geeigneter Position als vorhanden angenommen.': {
        "en": 'Water, waste water and electrical connections are assumed to exist in a suitable position.', "tr": 'Su, atık su ve elektrik bağlantılarının uygun konumda mevcut olduğu varsayılmaktadır.',
        "es": 'Se presupone que existen tomas de agua, desagüe y electricidad en una posición adecuada.'},
    'Wasseranschluss mit ausreichendem Druck und Durchfluss ist bauseits bereitzustellen. Druckerhöhung ist nicht enthalten.': {
        "en": 'A water connection with adequate pressure and flow is to be provided by the client. Pressure boosting is not included.', "tr": 'Yeterli basınç ve debiye sahip su bağlantısı mal sahibi tarafından sağlanmalıdır. Basınç yükseltme dahil değildir.',
        "es": 'La propiedad debe facilitar una toma de agua con presión y caudal suficientes. El grupo de presión no está incluido.'},
    'Wertgegenstände und persönliche Unterlagen sind vor Beginn zu entnehmen.': {
        "en": 'Valuables and personal documents must be removed before work starts.', "tr": 'Değerli eşyalar ve kişisel belgeler işe başlamadan önce alınmalıdır.',
        "es": 'Los objetos de valor y la documentación personal deben retirarse antes de comenzar.'},
    'Wurzelstock fräsen oder roden ist nicht enthalten und wird gesondert angeboten.': {
        "en": 'Stump grinding or removal is not included and is quoted separately.', "tr": 'Kütük frezeleme veya sökümü dahil değildir, ayrıca teklif edilir.',
        "es": 'El destoconado o la extracción del tocón no están incluidos y se ofertan por separado.'},
    'Wände werden als lot- und fluchtgerecht angenommen; Ausgleich nach Aufwand.': {
        "en": 'Walls are assumed to be plumb and in line; making good is charged on a time-and-materials basis.', "tr": 'Duvarların şakülünde ve hizasında olduğu varsayılmaktadır; tesviye sarf esasına göre faturalandırılır.',
        "es": 'Se presupone que los muros están a plomo y alineados; su nivelación se factura según el tiempo y el material empleados.'},
    'Zeitweise Abschaltung der Stromversorgung ist erforderlich.': {
        "en": 'The power supply has to be switched off temporarily.', "tr": 'Elektrik beslemesinin geçici olarak kesilmesi gerekir.',
        "es": 'Es necesario interrumpir temporalmente el suministro eléctrico.'},
    'Zwischen den Anstrichen sind Trocknungszeiten einzuhalten. Die Räume sind während der Arbeiten und mindestens 24 Stunden danach nur eingeschränkt nutzbar.': {
        "en": 'Drying times between coats must be observed. The rooms are only usable to a limited extent during the work and for at least 24 hours afterwards.', "tr": 'Katlar arasında kuruma sürelerine uyulmalıdır. Odalar, çalışmalar sırasında ve sonrasında en az 24 saat boyunca ancak sınırlı ölçüde kullanılabilir.',
        "es": 'Deben respetarse los tiempos de secado entre manos. Las estancias solo podrán usarse de forma limitada durante los trabajos y al menos 24 horas después.'},
    'Öffnen und Verschließen von Wand bzw. Boden ist enthalten; Oberflächenwiederherstellung nicht.': {
        "en": 'Opening up and closing the wall or floor is included; restoring the surface finish is not.', "tr": 'Duvar veya zeminin açılması ve kapatılması dahildir; yüzey kaplamasının eski hâline getirilmesi dahil değildir.',
        "es": 'La apertura y el cierre del muro o del suelo están incluidos; la reposición del acabado superficial no.'},
    'Fliesen- und Malerarbeiten erfolgen durch das Folgegewerk und sind nicht enthalten.': {
        "en": 'Tiling and painting are carried out by the follow-on trade and are not included.', "tr": 'Fayans ve boya işleri takip eden meslek grubu tarafından yapılır ve dahil değildir.',
        "es": 'El alicatado y la pintura los ejecuta el gremio posterior y no están incluidos.'},
    'Fliesen-, Maler- und Elektroarbeiten sind nicht enthalten.': {
        "en": 'Tiling, painting and electrical work are not included.', "tr": 'Fayans, boya ve elektrik işleri dahil değildir.',
        "es": 'Los trabajos de alicatado, pintura y electricidad no están incluidos.'},
    'Funktionsfähiges Absperrventil wird vorausgesetzt.': {
        "en": 'A working shut-off valve is assumed to be in place.', "tr": 'Çalışır durumda bir kesme vanası bulunduğu varsayılmaktadır.',
        "es": 'Se presupone que existe una llave de corte en funcionamiento.'},
    'Fällungen und starke Rückschnitte sind vielerorts genehmigungspflichtig (AT: Baumschutzgesetze der Länder und Gemeinden, DE: kommunale Baumschutzsatzungen). Die Genehmigung ist bauseits einzuholen und muss vor Arbeitsbeginn vorliegen.': {
        "en": 'Felling and hard pruning require a permit in many places (Austria: provincial and municipal tree protection laws; Germany: municipal tree protection by-laws). The client must obtain the permit and it must be in hand before work starts.', "tr": 'Ağaç kesimi ve sert budama birçok yerde izne tabidir (AT: eyalet ve belediye ağaç koruma yasaları; DE: belediye ağaç koruma yönetmelikleri). İznin alınması mal sahibine aittir ve işe başlamadan önce hazır olmalıdır.',
        "es": 'La tala y las podas severas requieren autorización en muchos lugares (Austria: leyes de protección del arbolado de los estados y municipios; Alemania: ordenanzas municipales de protección del arbolado). La propiedad debe obtener la autorización, que ha de estar disponible antes del inicio de los trabajos.'},
    'Förderungsabwicklung ist nicht enthalten.': {
        "en": 'Handling of grant applications is not included.', "tr": 'Teşvik başvurularının yürütülmesi dahil değildir.',
        "es": 'La tramitación de subvenciones no está incluida.'},
    'Für Einsätze außerhalb der Geschäftszeiten gelten Zuschläge.': {
        "en": 'Call-outs outside business hours are subject to surcharges.', "tr": 'Mesai saatleri dışındaki müdahalelerde ek ücret uygulanır.',
        "es": 'Las intervenciones fuera del horario comercial están sujetas a recargos.'},
    'Für Ladeeinrichtungen ist ein FI Typ B bzw. Typ A EV erforderlich. Ist keiner vorhanden, wird er ergänzt und gesondert verrechnet.': {
        "en": 'Charging equipment requires a type B or type A EV residual-current device. If none is present, one is added and charged separately.', "tr": 'Şarj üniteleri için tip B ya da tip A EV kaçak akım rölesi gereklidir. Mevcut değilse eklenir ve ayrıca faturalandırılır.',
        "es": 'Los puntos de recarga requieren un diferencial de tipo B o de tipo A EV. Si no existe, se instala y se factura aparte.'},
    'Für Verkauf oder Vermietung wird der Befund auf den Übergabestichtag ausgestellt.': {
        "en": 'For a sale or letting, the certificate is issued as of the handover date.', "tr": 'Satış veya kiralama için rapor, devir tarihi esas alınarak düzenlenir.',
        "es": 'En caso de venta o alquiler, el certificado se emite con fecha de la entrega.'},
    'Für barrierefreie Umbauten bestehen Förderungen (AT: Länder/Pflegefonds, DE: KfW 455-B, Pflegekasse). Antragstellung ist nicht enthalten.': {
        "en": 'Grants are available for accessibility conversions (Austria: provincial funds and the care fund; Germany: KfW 455-B and the long-term care insurance fund). Filing the application is not included.', "tr": 'Engelsiz dönüşümler için teşvikler mevcuttur (AT: eyaletler/bakım fonu, DE: KfW 455-B, bakım sigortası). Başvurunun yapılması dahil değildir.',
        "es": 'Existen ayudas para reformas de accesibilidad (Austria: fondos de los estados y fondo de dependencia; Alemania: KfW 455-B y caja de dependencia). La presentación de la solicitud no está incluida.'},
    'Für diese Arbeiten ist ein Gerüst erforderlich; es ist nicht im Angebot enthalten.': {
        "en": 'Scaffolding is required for this work; it is not included in the quote.', "tr": 'Bu işler için iskele gereklidir; teklife dahil değildir.',
        "es": 'Estos trabajos requieren andamio, que no está incluido en la oferta.'},
    'Für eine bodengleiche Dusche ist eine ausreichende Aufbauhöhe erforderlich. Ist sie nicht gegeben, sind Ablaufvariante oder Aufbau anzupassen; Mehraufwand nach Aufwand.': {
        "en": 'A level-access shower needs sufficient build-up height. If it is not available, either the drain type or the build-up must be adapted; the extra work is charged on a time-and-materials basis.', "tr": 'Zemine sıfır duş için yeterli yapı yüksekliği gereklidir. Yoksa gider tipi veya yapı katmanı uyarlanmalıdır; ek işler sarf esasına göre faturalandırılır.',
        "es": 'Una ducha a ras de suelo requiere una altura de montaje suficiente. Si no la hay, debe adaptarse el tipo de desagüe o la composición del suelo; el sobrecoste se factura según el tiempo y el material empleados.'},
    'Für kleine Flächen gilt eine Mindestpauschale je Einsatz — Anfahrt und Rüstzeit fallen unabhängig von der Größe an.': {
        "en": 'A minimum flat rate applies per visit for small areas — travel and set-up time arise regardless of size.', "tr": 'Küçük alanlar için her müdahalede asgari bir götürü ücret geçerlidir — yol ve hazırlık süresi alandan bağımsız olarak oluşur.',
        "es": 'En superficies pequeñas se aplica una tarifa mínima por intervención: el desplazamiento y el tiempo de preparación se producen con independencia del tamaño.'},
    'Geländer und Handlauf sind nicht enthalten und werden gesondert angeboten.': {
        "en": 'Balustrade and handrail are not included and are quoted separately.', "tr": 'Korkuluk ve tutamak dahil değildir, ayrıca teklif edilir.',
        "es": 'La barandilla y el pasamanos no están incluidos y se ofertan por separado.'},
    'Genehmigung für die Nutzung öffentlichen Grundes ist bauseits einzuholen.': {
        "en": 'Permission to use public land must be obtained by the client.', "tr": 'Kamusal alanın kullanımı için izin alınması mal sahibine aittir.',
        "es": 'La autorización para ocupar la vía pública debe obtenerla la propiedad.'},
    'Geprüfte Geräte erhalten eine Prüfplakette mit Datum der nächsten Prüfung.': {
        "en": 'Tested appliances receive a test label showing the date of the next inspection.', "tr": 'Test edilen cihazlara, bir sonraki muayene tarihini gösteren bir test etiketi yapıştırılır.',
        "es": 'Los aparatos revisados reciben una etiqueta de control con la fecha de la próxima revisión.'},
    'Gerüst ist nicht im Angebot enthalten und wird bauseits beigestellt.': {
        "en": 'Scaffolding is not included in the quote and is provided by the client.', "tr": 'İskele teklife dahil değildir ve mal sahibi tarafından sağlanır.',
        "es": 'El andamio no está incluido en la oferta y lo aporta la propiedad.'},
    'Grenzabstände und Zustimmung des Nachbarn sind bauseits zu klären.': {
        "en": "Boundary distances and the neighbour's consent must be settled by the client.", "tr": 'Sınır mesafeleri ve komşunun onayı mal sahibi tarafından açıklığa kavuşturulmalıdır.',
        "es": 'Las distancias a linderos y el consentimiento del vecino debe gestionarlos la propiedad.'},
    'Großformate ab 60x120 werden zu zweit im Kombiverfahren mit Nivelliersystem verlegt. Ab 120x240 steigt der Aufwand nochmals deutlich und wird gesondert bewertet.': {
        "en": 'Large formats from 60x120 upwards are laid by two people using the buttering-floating method with a levelling system. From 120x240 the effort rises considerably again and is assessed separately.', "tr": "60x120 ve üzeri büyük formatlar, nivelman sistemiyle iki kişi tarafından kombine yöntemle döşenir. 120x240'tan itibaren iş yükü bir kez daha belirgin şekilde artar ve ayrıca değerlendirilir.",
        "es": 'Los formatos grandes a partir de 60x120 se colocan entre dos personas mediante el método de doble encolado con sistema nivelador. A partir de 120x240 el esfuerzo aumenta notablemente de nuevo y se valora por separado.'},
    'Halteverbotszonen sind bauseits zu beantragen; Kosten nicht enthalten.': {
        "en": 'No-parking zones must be applied for by the client; the cost is not included.', "tr": 'Park yasağı bölgeleri mal sahibi tarafından talep edilmelidir; masraflar dahil değildir.',
        "es": 'Las zonas de prohibición de estacionamiento debe solicitarlas la propiedad; su coste no está incluido.'},
    'Holzschutz an bewitterten Bauteilen ist je nach Ausrichtung alle 3 bis 6 Jahre zu erneuern. Der Anstrich ist keine dauerhafte Versiegelung.': {
        "en": 'Wood protection on weather-exposed elements has to be renewed every three to six years depending on orientation. The coating is not a permanent seal.', "tr": 'Hava koşullarına maruz yapı elemanlarındaki ahşap koruması, cepheye göre 3 ila 6 yılda bir yenilenmelidir. Boya kalıcı bir yalıtım değildir.',
        "es": 'La protección de la madera en elementos expuestos a la intemperie debe renovarse cada tres a seis años según la orientación. El acabado no es un sellado permanente.'},
    'Hydraulischer Abgleich ist nicht enthalten und wird gesondert angeboten.': {
        "en": 'Hydronic balancing is not included and is quoted separately.', "tr": 'Hidrolik denge ayarı dahil değildir ve ayrıca teklif edilir.',
        "es": 'El equilibrado hidráulico no está incluido y se oferta por separado.'},
    'Im Rahmen eines Wartungsvertrags gelten reduzierte Sätze und ein bevorzugter Termin.': {
        "en": 'Under a maintenance contract, reduced rates and priority scheduling apply.', "tr": 'Bakım sözleşmesi kapsamında indirimli fiyatlar ve öncelikli randevu geçerlidir.',
        "es": 'Con un contrato de mantenimiento se aplican tarifas reducidas y cita preferente.'},
    'Im Verteiler ist kein Platz frei. Erweiterung oder Tausch wird gesondert angeboten.': {
        "en": 'There is no free space in the distribution board. Extending or replacing it is quoted separately.', "tr": 'Dağıtım panosunda boş yer yoktur. Genişletme veya değişim ayrıca teklif edilir.',
        "es": 'No hay espacio libre en el cuadro eléctrico. Su ampliación o sustitución se oferta por separado.'},
    'In Altbauten sind Leitungen häufig nicht normgerecht verlegt. Notwendige Anpassungen werden nach Aufwand verrechnet.': {
        "en": 'In older buildings wiring is often not routed to current standards. Any necessary adaptations are charged on a time-and-materials basis.', "tr": 'Eski binalarda hatlar çoğu zaman standartlara uygun döşenmemiştir. Gerekli uyarlamalar sarf esasına göre faturalandırılır.',
        "es": 'En edificios antiguos, las instalaciones a menudo no están tendidas conforme a la norma. Las adaptaciones necesarias se facturan según el tiempo y el material empleados.'},
    'Innen- und Außenlaibungen sind nachzuarbeiten; Malerarbeiten nicht enthalten.': {
        "en": 'Internal and external reveals need making good; painting is not included.', "tr": 'İç ve dış pervaz yüzeylerinin rötuşlanması gerekir; boya işleri dahil değildir.',
        "es": 'Las mochetas interiores y exteriores requieren repaso; la pintura no está incluida.'},
    'Klassische Nullung ohne getrennten Schutzleiter entspricht nicht dem Stand der Technik. Ein Weiterbetrieb nach Eingriff ist unzulässig; die betroffenen Stromkreise sind zu sanieren. Nicht im Angebot enthalten.': {
        "en": 'Classic protective neutralling without a separate earth conductor does not meet current technical standards. Continued operation after any intervention is not permissible; the affected circuits have to be rewired. Not included in the quote.', "tr": 'Ayrı koruma iletkeni olmayan klasik sıfırlama, günümüz tekniğine uygun değildir. Müdahale sonrası kullanıma devam edilmesi caiz değildir; ilgili devreler yenilenmelidir. Teklife dahil değildir.',
        "es": 'La puesta a neutro clásica sin conductor de protección independiente no se ajusta al estado de la técnica. No se admite seguir utilizándola tras una intervención; los circuitos afectados deben sanearse. No está incluido en la oferta.'},
    'Laboranalysen und Materialprüfungen werden gesondert verrechnet.': {
        "en": 'Laboratory analyses and material tests are charged separately.', "tr": 'Laboratuvar analizleri ve malzeme testleri ayrıca faturalandırılır.',
        "es": 'Los análisis de laboratorio y los ensayos de materiales se facturan aparte.'},
    'Ladeeinrichtungen sind beim Netzbetreiber zu melden, ab 11 kW genehmigungspflichtig. Die Meldung ist enthalten, eine allfällige Netzverstärkung nicht.': {
        "en": 'Charging equipment must be registered with the grid operator, and from 11 kW upwards requires approval. Registration is included; any grid reinforcement is not.', "tr": 'Şarj üniteleri şebeke işletmecisine bildirilmelidir; 11 kW üzeri izne tabidir. Bildirim dahildir, olası şebeke güçlendirmesi dahil değildir.',
        "es": 'Los puntos de recarga deben comunicarse a la distribuidora eléctrica y, a partir de 11 kW, requieren autorización. La comunicación está incluida; un eventual refuerzo de red no.'},
    'Leistung ist behördlich vorgeschrieben; Intervalle richten sich nach der Landesverordnung.': {
        "en": 'This service is required by law; the intervals follow the applicable regional regulation.', "tr": 'Bu hizmet yasal olarak zorunludur; aralıklar ilgili eyalet yönetmeliğine göre belirlenir.',
        "es": 'Esta prestación es obligatoria por ley; los intervalos se rigen por la normativa autonómica aplicable.'},
    'Markise ist für die angegebene Windklasse ausgelegt; bei Sturm einzufahren.': {
        "en": 'The awning is rated for the stated wind class; it must be retracted in storms.', "tr": 'Tente belirtilen rüzgâr sınıfına göre tasarlanmıştır; fırtınada içeri alınmalıdır.',
        "es": 'El toldo está dimensionado para la clase de viento indicada; debe recogerse en caso de temporal.'},
    'Montageanleitung und Beschläge sind bauseits beizustellen.': {
        "en": 'Assembly instructions and fittings are to be provided by the client.', "tr": 'Montaj kılavuzu ve donanımlar mal sahibi tarafından temin edilmelidir.',
        "es": 'Las instrucciones de montaje y los herrajes los aporta la propiedad.'},
    'Möbel werden bauseits ausgeräumt bzw. mittig gestellt und abgedeckt.': {
        "en": 'The client clears the furniture out, or moves it to the centre of the room and covers it.', "tr": 'Mobilyalar mal sahibi tarafından boşaltılır ya da odanın ortasına toplanıp örtülür.',
        "es": 'El mobiliario lo retira la propiedad o lo desplaza al centro de la estancia y lo cubre.'},
    'Neue Fugenmasse trocknet farblich anders auf als die gealterte Bestandsfuge. Teilerneuerungen bleiben sichtbar.': {
        "en": 'Fresh grout dries to a different shade than aged existing grout. Partial renewals stay visible.', "tr": 'Yeni derz dolgusu, yaşlanmış mevcut derzden farklı bir tonda kurur. Kısmi yenilemeler görünür kalır.',
        "es": 'La lechada nueva seca con un tono distinto al de la junta existente envejecida. Las renovaciones parciales seguirán siendo visibles.'},
    'Nikotin-, Ruß- und Wasserflecken schlagen durch Dispersionsfarbe durch. Ein Isoliergrund ist erforderlich und wird gesondert ausgewiesen.': {
        "en": 'Nicotine, soot and water stains bleed through emulsion paint. A stain-blocking primer is required and is shown as a separate item.', "tr": 'Nikotin, is ve su lekeleri dispersiyon boyanın altından vurur. Yalıtım astarı gereklidir ve ayrı kalem olarak gösterilir.',
        "es": 'Las manchas de nicotina, hollín y agua traspasan la pintura plástica. Se requiere una imprimación aislante, que se indica como partida aparte.'},
    'Ohne Ersatzfliesen aus derselben Charge ist ein exakt gleicher Farbton und Kaliber nicht erreichbar. Ein sichtbarer Unterschied ist kein Mangel.': {
        "en": 'Without replacement tiles from the same batch, an exact match in shade and calibre cannot be achieved. A visible difference is not a defect.', "tr": 'Aynı partiden yedek fayans olmadan tam olarak aynı renk tonu ve kalibre elde edilemez. Görünür bir fark kusur sayılmaz.',
        "es": 'Sin azulejos de repuesto del mismo lote no es posible lograr un tono y un calibre idénticos. Una diferencia visible no constituye un defecto.'},
    'Ohne FI-Schutzschalter entspricht die Anlage nicht dem Stand der Technik. Bei Eingriffen in den Verteiler ist die Nachrüstung erforderlich (ÖVE/ÖNORM E 8001, DIN VDE 0100-410) und wird gesondert angeboten.': {
        "en": 'Without a residual-current device the installation does not meet current technical standards. When the distribution board is worked on, retrofitting one is required (ÖVE/ÖNORM E 8001, DIN VDE 0100-410) and is quoted separately.', "tr": 'Kaçak akım rölesi olmadan tesisat günümüz tekniğine uygun değildir. Dağıtım panosuna müdahale edildiğinde sonradan takılması zorunludur (ÖVE/ÖNORM E 8001, DIN VDE 0100-410) ve ayrıca teklif edilir.',
        "es": 'Sin interruptor diferencial, la instalación no se ajusta al estado de la técnica. Al intervenir en el cuadro eléctrico es obligatorio instalarlo (ÖVE/ÖNORM E 8001, DIN VDE 0100-410) y se oferta por separado.'},
    'Der Umbau von Stand-WC auf wandhängend erfordert eine Vorwandinstallation mit Spülkasten und tragendem Element. Fliesen-, Trockenbau- und Malerarbeiten sind nicht enthalten.': {
        "en": 'Converting a floor-standing WC to a wall-hung one requires a pre-wall installation with concealed cistern and load-bearing frame. Tiling, drywall and painting work are not included.', "tr": 'Ayaklı klozetten asma klozete geçiş, gömme rezervuar ve taşıyıcı çerçeveli bir ön duvar tesisatı gerektirir. Fayans, alçıpan ve boya işleri dahil değildir.',
        "es": 'El cambio de un inodoro de pie a uno suspendido requiere una instalación tras pared con cisterna empotrada y bastidor portante. Los trabajos de alicatado, pladur y pintura no están incluidos.'},
    'Der Zustand der Bestandsanlage ist nicht bekannt. Zeigt sich beim Öffnen eine nicht normgerechte Ausführung, sind Zusatzarbeiten erforderlich, die nach Aufwand verrechnet werden.': {
        "en": 'The condition of the existing installation is unknown. If opening it up reveals work that does not meet current standards, additional work is required and is charged on a time-and-materials basis.', "tr": 'Mevcut tesisatın durumu bilinmemektedir. Açıldığında standartlara uygun olmayan bir uygulama ortaya çıkarsa, ek işler gerekir ve bunlar sarf esasına göre faturalandırılır.',
        "es": 'Se desconoce el estado de la instalación existente. Si al abrirla se detecta una ejecución no conforme a la norma, serán necesarios trabajos adicionales que se facturarán según el tiempo y el material empleados.'},
    'Der tatsächliche Zeitaufwand ist modellabhängig und richtet sich nach den Herstellervorgaben (Arbeitswerte).': {
        "en": "The actual time required depends on the model and follows the manufacturer's flat-rate labour times.", "tr": 'Gerçek çalışma süresi modele bağlıdır ve üreticinin belirlediği iş değerlerine göre hesaplanır.',
        "es": 'El tiempo real necesario depende del modelo y se rige por los baremos de trabajo del fabricante.'},
    'Die Anfahrtspauschale wird bei Auftragserteilung angerechnet.': {
        "en": 'The call-out fee is credited against the invoice if the job is awarded.', "tr": 'Yol ücreti, iş verilmesi hâlinde faturadan düşülür.',
        "es": 'El importe del desplazamiento se descuenta de la factura si se adjudica el trabajo.'},
    'Die Auswahl bindet an ein Hersteller-Ökosystem; ein späterer Wechsel bedeutet Austausch der Aktoren.': {
        "en": "This choice ties you to one manufacturer's ecosystem; switching later means replacing the actuators.", "tr": 'Bu seçim sizi tek bir üreticinin ekosistemine bağlar; sonradan değiştirmek aktüatörlerin de değişmesi anlamına gelir.',
        "es": 'Esta elección le vincula al ecosistema de un fabricante; cambiar más adelante implica sustituir los actuadores.'},
    'Die Einleitung von Drainagewasser in den Kanal ist genehmigungspflichtig und vielerorts unzulässig. Die Klärung erfolgt bauseits.': {
        "en": "Discharging drainage water into the sewer requires a permit and is prohibited in many places. Clarifying this is the client's responsibility.", "tr": 'Drenaj suyunun kanalizasyona verilmesi izne tabidir ve birçok yerde yasaktır. Bunun açıklığa kavuşturulması mal sahibine aittir.',
        "es": 'El vertido de agua de drenaje a la red de alcantarillado requiere autorización y está prohibido en muchos lugares. Su aclaración corresponde a la propiedad.'},
    'Die Erneuerung der Zuleitungen ist als Zusatzposition kalkuliert.': {
        "en": 'Renewing the supply lines is costed as a separate item.', "tr": 'Besleme hatlarının yenilenmesi ayrı bir kalem olarak hesaplanmıştır.',
        "es": 'La renovación de las acometidas está presupuestada como partida aparte.'},
    'Die Erstmaßnahme umfasst Eingrenzung und Sofortbehebung. Weitergehende Instandsetzung wird nach Aufwand verrechnet.': {
        "en": 'The initial call covers containment and an immediate fix. Any further repair is charged on a time-and-materials basis.', "tr": 'İlk müdahale, sorunun sınırlandırılmasını ve acil giderilmesini kapsar. Daha kapsamlı onarım sarf esasına göre faturalandırılır.',
        "es": 'La primera intervención cubre la contención y la reparación inmediata. Cualquier reparación posterior se factura según el tiempo y el material empleados.'},
    'Die Grundmiete umfasst vier Wochen Standzeit; darüber hinaus wird wochenweise verrechnet.': {
        "en": 'The base hire covers four weeks on site; beyond that it is charged by the week.', "tr": 'Temel kira dört haftalık bekleme süresini kapsar; bunun ötesi haftalık olarak faturalandırılır.',
        "es": 'El alquiler base cubre cuatro semanas de permanencia; a partir de ahí se factura por semanas.'},
    'Die Heizungsanlage muss für die Arbeiten entleert werden; Wiederbefüllung ist enthalten.': {
        "en": 'The heating system has to be drained for this work; refilling is included.', "tr": 'Bu işler için ısıtma tesisatının boşaltılması gerekir; yeniden doldurma dahildir.',
        "es": 'La instalación de calefacción debe vaciarse para estos trabajos; el llenado posterior está incluido.'},
    'Die Koordination der Folgegewerke (Elektro, Maler) ist enthalten; deren Leistungen sind es nicht.': {
        "en": 'Coordinating the follow-on trades (electrical, painting) is included; their own work is not.', "tr": 'Takip eden meslek gruplarının (elektrik, boya) koordinasyonu dahildir; onların işleri dahil değildir.',
        "es": 'La coordinación de los gremios posteriores (electricidad, pintura) está incluida; sus trabajos no.'},
    'Die Räum- und Streupflicht bleibt beim Eigentümer und wird durch diesen Vertrag vertraglich übertragen. Umfang, Zeitfenster und Dokumentation sind im Vertrag festzuhalten.': {
        "en": 'The legal duty to clear and grit remains with the owner and is transferred by this contract. Scope, time windows and record-keeping must be set out in the contract.', "tr": 'Kar temizleme ve tuzlama yükümlülüğü mülk sahibinde kalır ve bu sözleşmeyle devredilir. Kapsam, zaman aralıkları ve belgeleme sözleşmede yazılı olmalıdır.',
        "es": 'La obligación legal de despejar y esparcir sal recae en el propietario y se transfiere mediante este contrato. El alcance, las franjas horarias y la documentación deben fijarse en el contrato.'},
    'Die Räume sind während der Behandlung und der Nachwirkzeit nicht zu betreten.': {
        "en": 'The rooms must not be entered during treatment or the subsequent exposure period.', "tr": 'Uygulama ve etki süresi boyunca odalara girilmemelidir.',
        "es": 'No debe accederse a las estancias durante el tratamiento ni durante el tiempo de actuación posterior.'},
    'Die Sanierung behandelt den Befall, nicht die Ursache. Ohne Beseitigung der Feuchtequelle tritt der Schaden wieder auf; Ursachenermittlung und bauliche Maßnahmen sind nicht enthalten.': {
        "en": 'Remediation treats the infestation, not its cause. Unless the source of moisture is removed the damage will return; investigating the cause and any structural work are not included.', "tr": 'Sanasyon, küfü giderir ancak nedenini gidermez. Nem kaynağı ortadan kaldırılmazsa hasar tekrar eder; neden tespiti ve yapısal önlemler dahil değildir.',
        "es": 'El saneamiento trata la afectación, no su causa. Si no se elimina la fuente de humedad, el daño reaparecerá; la investigación de la causa y las obras estructurales no están incluidas.'},
    'Die Tragfähigkeit der Dachkonstruktion für die Zusatzlast ist vor Montage nachzuweisen.': {
        "en": "The roof structure's capacity to carry the additional load must be verified before installation.", "tr": 'Çatı konstrüksiyonunun ek yükü taşıyabileceği montajdan önce belgelenmelidir.',
        "es": 'Antes del montaje debe acreditarse que la estructura de la cubierta soporta la carga adicional.'},
    'Die Tragfähigkeit des Altanstrichs wird vor Ort mittels Kratz- und Klebebandprobe geprüft. Ist der Untergrund kreidend oder nicht tragfähig, sind Zusatzarbeiten erforderlich.': {
        "en": 'The soundness of the old paint is checked on site with a scratch and tape test. If the substrate is chalking or unsound, additional work is required.', "tr": 'Eski boyanın taşıyıcılığı yerinde çizik ve bant testiyle kontrol edilir. Zemin tebeşirleniyorsa veya taşıyıcı değilse ek işler gerekir.',
        "es": 'La solidez de la pintura antigua se comprueba in situ mediante ensayo de rayado y de cinta adhesiva. Si el soporte pulveriza o no es firme, serán necesarios trabajos adicionales.'},
    'Die erforderliche Aufbauhöhe ist bauseits sicherzustellen; Türen sind ggf. zu kürzen.': {
        "en": 'The client must ensure the required build-up height is available; doors may need to be trimmed.', "tr": 'Gerekli yapı yüksekliğinin sağlanması mal sahibine aittir; kapıların kısaltılması gerekebilir.',
        "es": 'La propiedad debe garantizar la altura de montaje necesaria; puede ser preciso recortar las puertas.'},
    'Die vorgeschriebenen Sicherheitsabstände zu brennbaren Bauteilen sind einzuhalten; bauseits zu prüfen.': {
        "en": 'The prescribed safety clearances to combustible building elements must be observed; to be checked by the client.', "tr": 'Yanıcı yapı elemanlarına karşı öngörülen güvenlik mesafelerine uyulmalıdır; kontrolü mal sahibine aittir.',
        "es": 'Deben respetarse las distancias de seguridad prescritas respecto a elementos constructivos combustibles; su comprobación corresponde a la propiedad.'},
    'Durch die neue Aufbauhöhe können Türblätter zu kürzen sein. Tischlerarbeiten sind nicht enthalten.': {
        "en": 'The new build-up height may mean door leaves have to be trimmed. Joinery work is not included.', "tr": 'Yeni yapı yüksekliği nedeniyle kapı kanatlarının kısaltılması gerekebilir. Marangoz işleri dahil değildir.',
        "es": 'La nueva altura de montaje puede obligar a recortar las hojas de las puertas. Los trabajos de carpintería no están incluidos.'},
    'Ein Identitäts- und Wohnsitznachweis ist vor der Öffnung vorzulegen.': {
        "en": 'Proof of identity and of residence must be produced before the lock is opened.', "tr": 'Kapı açılmadan önce kimlik ve ikamet belgesi ibraz edilmelidir.',
        "es": 'Antes de la apertura debe presentarse un documento de identidad y un justificante de domicilio.'},
    'Ein Messprotokoll der Strecken ist enthalten.': {
        "en": 'A measurement report for the runs is included.', "tr": 'Hatlara ait bir ölçüm protokolü dahildir.',
        "es": 'Se incluye un acta de mediciones de los tramos.'},
    'Ein normgerechter Elektroanschluss mit ausreichender Absicherung wird vorausgesetzt; Anpassungen durch einen Elektriker sind nicht enthalten.': {
        "en": 'A compliant electrical connection with adequate fusing is assumed; any adaptation by an electrician is not included.', "tr": 'Yeterli sigortaya sahip, standartlara uygun bir elektrik bağlantısı olduğu varsayılmaktadır; elektrikçi tarafından yapılacak uyarlamalar dahil değildir.',
        "es": 'Se presupone una conexión eléctrica conforme a la norma y con protección suficiente; las adaptaciones a cargo de un electricista no están incluidas.'},
    'Eine 24-Stunden-Bereitschaft wird als Saisonpauschale unabhängig von der Anzahl der Einsätze verrechnet.': {
        "en": 'A 24-hour standby service is charged as a flat seasonal fee, regardless of how many call-outs occur.', "tr": '24 saatlik hazırbulunuşluk, müdahale sayısından bağımsız olarak sezonluk götürü ücret şeklinde faturalandırılır.',
        "es": 'El servicio de guardia 24 horas se factura como tarifa fija de temporada, con independencia del número de intervenciones.'},
    'Eine Anwachsgarantie setzt die vereinbarte Bewässerung und Pflege voraus und ist nur mit Pflegevertrag möglich.': {
        "en": 'An establishment guarantee depends on the agreed watering and care and is only available with a maintenance contract.', "tr": 'Tutma garantisi, üzerinde anlaşılan sulama ve bakımın yapılmasına bağlıdır ve yalnızca bakım sözleşmesiyle mümkündür.',
        "es": 'La garantía de arraigo exige el riego y los cuidados acordados y solo es posible con un contrato de mantenimiento.'},
    'Eine Nachkontrolle ist im Preis enthalten; weitere Behandlungen nach Aufwand.': {
        "en": 'One follow-up inspection is included in the price; any further treatments are charged on a time-and-materials basis.', "tr": 'Bir kez sonradan kontrol fiyata dahildir; ilave uygulamalar sarf esasına göre faturalandırılır.',
        "es": 'Una revisión de control está incluida en el precio; los tratamientos adicionales se facturan según el tiempo y el material empleados.'},
    'Eine neue Steuerleitung ist erforderlich und gesondert kalkuliert.': {
        "en": 'A new control cable is required and is costed separately.', "tr": 'Yeni bir kumanda hattı gereklidir ve ayrıca hesaplanmıştır.',
        "es": 'Se requiere una nueva línea de control, presupuestada por separado.'},
    'Eingriffe in tragende Bauteile erfordern eine statische Berechnung und Freigabe. Diese ist nicht im Angebot enthalten und muss vor Arbeitsbeginn vorliegen.': {
        "en": 'Work on load-bearing elements requires a structural calculation and sign-off. This is not part of the quote and must be available before work starts.', "tr": 'Taşıyıcı yapı elemanlarına müdahale, statik hesap ve onay gerektirir. Bu, teklife dahil değildir ve işe başlamadan önce hazır olmalıdır.',
        "es": 'La intervención en elementos portantes requiere un cálculo estructural y su aprobación. No está incluido en la oferta y debe estar disponible antes del inicio de los trabajos.'},
    'Einhaltung der Schallschutzgrenzwerte am Aufstellort ist zu prüfen.': {
        "en": 'Compliance with noise limits at the installation location must be checked.', "tr": 'Kurulum yerindeki gürültü sınır değerlerine uyulup uyulmadığı kontrol edilmelidir.',
        "es": 'Debe comprobarse el cumplimiento de los límites de ruido en el lugar de instalación.'},
    'Elektrobefund bzw. Anlagenprüfung nicht enthalten. Bestehende Leitungen werden als normgerecht angenommen.': {
        "en": 'An electrical inspection certificate or system test is not included. Existing wiring is assumed to meet current standards.', "tr": 'Elektrik raporu veya tesisat muayenesi dahil değildir. Mevcut hatların standartlara uygun olduğu varsayılmaktadır.',
        "es": 'No se incluye el certificado de instalación eléctrica ni la revisión de la instalación. Se presupone que el cableado existente cumple la norma.'},
    'Entleeren und Winterfestmachen der Anlage ist eine jährlich wiederkehrende Leistung und nicht im Einbaupreis enthalten.': {
        "en": 'Draining and winterising the system is an annually recurring service and is not part of the installation price.', "tr": 'Tesisatın boşaltılması ve kışa hazırlanması yıllık tekrarlanan bir hizmettir ve montaj fiyatına dahil değildir.',
        "es": 'El vaciado y la preparación para el invierno son un servicio anual recurrente y no están incluidos en el precio de instalación.'},
    'Entsorgung des Altgeräts ist enthalten.': {
        "en": 'Disposal of the old appliance is included.', "tr": 'Eski cihazın bertarafı dahildir.',
        "es": 'La retirada del aparato antiguo está incluida.'},
    'Entwässerung und Anschluss an den Kanal sind nicht enthalten.': {
        "en": 'Drainage and connection to the sewer are not included.', "tr": 'Drenaj ve kanalizasyon bağlantısı dahil değildir.',
        "es": 'El drenaje y la conexión al alcantarillado no están incluidos.'},
    'Erdarbeiten für eine erdverlegte Zuleitung sind nicht enthalten.': {
        "en": 'Excavation work for a buried supply line is not included.', "tr": 'Yeraltına döşenecek besleme hattı için kazı işleri dahil değildir.',
        "es": 'Los trabajos de excavación para una acometida enterrada no están incluidos.'},
    'Estricharbeiten sind nicht enthalten und erfolgen durch das Folgegewerk.': {
        "en": 'Screed work is not included and is carried out by the follow-on trade.', "tr": 'Şap işleri dahil değildir ve takip eden meslek grubu tarafından yapılır.',
        "es": 'Los trabajos de solera no están incluidos y los ejecuta el gremio posterior.'},
    'Farbtöne und Strukturen wirken auf der Fläche anders als auf der Musterkarte. Ein Musteranstrich vor Ausführung wird empfohlen und ist gesondert zu beauftragen.': {
        "en": 'Colours and textures look different on a full surface than on a sample card. A trial coat before execution is recommended and must be ordered separately.', "tr": 'Renkler ve dokular geniş yüzeyde numune kartındakinden farklı görünür. Uygulamadan önce numune boyama önerilir ve ayrıca sipariş edilmelidir.',
        "es": 'Los tonos y las texturas se perciben de forma distinta en la superficie que en la carta de muestras. Se recomienda una pintura de muestra previa, que debe encargarse por separado.'},
    'Fertigung erst nach Aufmaß vor Ort. Maßabweichungen zum Plan können den Preis ändern.': {
        "en": 'Manufacture begins only after on-site measurement. Deviations from the plan dimensions can change the price.', "tr": 'Üretim ancak yerinde ölçüm sonrası başlar. Plandan sapan ölçüler fiyatı değiştirebilir.',
        "es": 'La fabricación comienza solo tras la medición in situ. Las desviaciones respecto a las medidas del plano pueden alterar el precio.'},
    'Ab 3 m Raumhöhe ist eine Arbeitsbühne oder ein Gerüst erforderlich; nicht enthalten.': {
        "en": 'From 3 m ceiling height a platform or scaffold is required; not included.', "tr": '3 m tavan yüksekliğinden itibaren çalışma platformu veya iskele gerekir; dahil değildir.',
        "es": 'A partir de 3 m de altura se requiere plataforma o andamio; no incluido.'},
    'Ab etwa 0,5 m² Befall ist nach Umweltbundesamt-Leitfaden eine fachgerechte Sanierung mit Abschottung erforderlich. Ursachenklärung, Trocknung und ggf. Raumluftmessung sind nicht enthalten.': {
        "en": 'From roughly 0.5 m² of growth the Umweltbundesamt guidance requires professional remediation under containment. Establishing the cause, drying and any air testing are not included.', "tr": "Yaklaşık 0,5 m²'den fazla küf için Umweltbundesamt kılavuzuna göre izolasyonlu profesyonel sanitasyon gerekir. Neden tespiti, kurutma ve gerekirse iç hava ölçümü dahil değildir.",
        "es": 'A partir de unos 0,5 m² afectados, la guía del Umweltbundesamt exige un saneamiento profesional con confinamiento. No se incluyen el diagnóstico de la causa, el secado ni la medición del aire.'},
    'Abholung und Rücklieferung in die Werkstatt sind enthalten.': {
        "en": 'Collection and return to the workshop are included.', "tr": 'Atölyeye alım ve geri teslim dahildir.',
        "es": 'La recogida y la devolución al taller están incluidas.'},
    'Abrechnung nach tatsächlichem Aufwand; angefangene Viertelstunden werden gerundet.': {
        "en": 'Charged on time and material; part quarter-hours are rounded.', "tr": 'Gerçek harcamaya göre faturalanır; başlanan çeyrek saatler yuvarlanır.',
        "es": 'Se factura por tiempo real; los cuartos de hora iniciados se redondean.'},
    'Abschleifen setzt eine ausreichende Nutzschicht voraus. Bei zu geringer Restdicke oder durchgeschliffenen Stellen ist eine Sanierung nicht möglich; die Prüfung erfolgt vor Ort.': {
        "en": 'Sanding requires enough wear layer. Where too little remains, or where it has been sanded through, restoration is not possible; this is checked on site.', "tr": 'Zımpara için yeterli aşınma tabakası gerekir. Kalan kalınlık azsa veya delinmişse restorasyon mümkün değildir; kontrol yerinde yapılır.',
        "es": 'El acuchillado exige capa de uso suficiente. Si queda poco espesor o hay zonas pasadas, no es posible restaurar; se comprueba in situ.'},
    'Abtransport und Deponiegebühren sind kalkuliert; Mulde bauseits stellplatzpflichtig.': {
        "en": 'Haulage and tip fees are included; the customer must provide a permit for the skip.', "tr": 'Nakliye ve döküm ücretleri hesaba dahildir; konteyner yeri müşteri tarafından izinlendirilir.',
        "es": 'Transporte y tasas de vertedero incluidos; el cliente debe gestionar el permiso del contenedor.'},
    'Abtransport und Entsorgung des Grünschnitts sind kalkuliert.': {
        "en": 'Removal and disposal of the green waste are included.', "tr": 'Yeşil atığın nakli ve bertarafı hesaba dahildir.',
        "es": 'La retirada y el vertido de los restos vegetales están incluidos.'},
    'Alte Leim- oder Kalkfarben sind nicht überstreichbar und müssen vollständig abgewaschen werden. Der Mehraufwand ist erst nach Freilegen einer Probefläche bezifferbar.': {
        "en": 'Old distemper or limewash cannot be painted over and has to be washed off completely. The extra work can only be priced once a test patch has been opened up.', "tr": 'Eski tutkal veya kireç boyanın üzeri boyanamaz, tamamen yıkanmalıdır. Ek iş ancak deneme alanı açıldıktan sonra fiyatlanabilir.',
        "es": 'La pintura al temple o a la cal no admite repintado y debe lavarse por completo. El sobrecoste solo puede cifrarse tras abrir una cata.'},
    'Altölentsorgung ist im Preis enthalten.': {
        "en": 'Disposal of the used oil is included in the price.', "tr": 'Atık yağ bertarafı fiyata dahildir.',
        "es": 'La gestión del aceite usado está incluida en el precio.'},
    'Angebot basiert auf überschlägiger Auslegung. Eine Heizlastberechnung nach ÖNORM H 7500 / DIN EN 12831 wird empfohlen.': {
        "en": 'The quote is based on an approximate sizing. A heat load calculation to ÖNORM H 7500 / DIN EN 12831 is recommended.', "tr": "Teklif kaba bir hesaba dayanır. ÖNORM H 7500 / DIN EN 12831'e göre ısı yükü hesabı önerilir.",
        "es": 'La oferta se basa en un dimensionado aproximado. Se recomienda un cálculo de carga térmica según ÖNORM H 7500 / DIN EN 12831.'},
    'Angebot geht von einer nutzbaren Bestandsleitung aus. Ist sie es nicht, wird eine neue Leitung nach Aufwand verrechnet.': {
        "en": 'The quote assumes the existing cable can be reused. If it cannot, a new cable is charged on time and material.', "tr": 'Teklif mevcut hattın kullanılabilir olduğunu varsayar. Değilse yeni hat harcamaya göre faturalanır.',
        "es": 'La oferta supone que el cableado existente es utilizable. Si no lo es, el cable nuevo se factura por administración.'},
    'Angebot gilt für nichttragende Bauteile. Die Tragfähigkeit ist bauseits bzw. durch einen Statiker zu bestätigen.': {
        "en": 'The quote covers non-load-bearing elements. Load-bearing status must be confirmed by the customer or a structural engineer.', "tr": 'Teklif taşıyıcı olmayan elemanlar içindir. Taşıyıcılık müşteri veya bir statik mühendisi tarafından teyit edilmelidir.',
        "es": 'La oferta cubre elementos no portantes. La condición portante debe confirmarla el cliente o un técnico estructural.'},
    'Angebot gilt für tragfähigen Untergrund. Bodenaustausch bei nicht tragfähigem Untergrund nach Aufwand.': {
        "en": 'The quote assumes a load-bearing base. Replacing unsuitable ground is charged on time and material.', "tr": 'Teklif taşıyıcı zemin içindir. Taşıyıcı olmayan zeminde zemin değişimi harcamaya göre faturalanır.',
        "es": 'La oferta supone un terreno con capacidad portante. La sustitución del terreno no apto se factura por administración.'},
    'Angebot gilt für tragfähigen, trockenen Untergrund. Risse, Schimmel oder nicht tragfähige Altanstriche sind nicht enthalten.': {
        "en": 'The quote assumes a sound, dry substrate. Cracks, mould or unsound old coatings are not included.', "tr": 'Teklif sağlam ve kuru zemin içindir. Çatlak, küf veya sağlam olmayan eski boyalar dahil değildir.',
        "es": 'La oferta supone un soporte firme y seco. No se incluyen fisuras, moho ni pinturas antiguas sin adherencia.'},
    'Angebot gilt für vom Boden bzw. Innenraum erreichbare Flächen.': {
        "en": 'The quote covers surfaces reachable from the ground or from inside.', "tr": 'Teklif yerden veya iç mekandan erişilebilen yüzeyler içindir.',
        "es": 'La oferta cubre las superficies accesibles desde el suelo o desde el interior.'},
    'Anmeldung beim Netzbetreiber und Zählertausch sind nicht im Angebot enthalten.': {
        "en": 'Registration with the network operator and any meter change are not included.', "tr": 'Şebeke işletmecisine bildirim ve sayaç değişimi dahil değildir.',
        "es": 'El alta ante la distribuidora y el cambio de contador no están incluidos.'},
    'Anstriche vor etwa 1960 können Blei enthalten. Trockenes Schleifen ist dann unzulässig; staubarme Verfahren sind nicht im Angebot enthalten.': {
        "en": 'Coatings from before about 1960 may contain lead. Dry sanding is then prohibited; low-dust methods are not included in the quote.', "tr": 'Yaklaşık 1960 öncesi boyalar kurşun içerebilir. Bu durumda kuru zımpara yasaktır; az tozlu yöntemler teklife dahil değildir.',
        "es": 'Las pinturas anteriores a 1960 pueden contener plomo. El lijado en seco queda prohibido; los métodos de bajo polvo no están incluidos.'},
    'Arbeiten am Steigstrang erfordern Abstimmung mit Hausverwaltung und Miteigentümern sowie eine Wasserabschaltung.': {
        "en": 'Work on the riser requires agreement with the managing agent and co-owners, and a water shut-off.', "tr": 'Kolon üzerindeki işler yönetim ve kat maliklerinin onayını ve su kesintisini gerektirir.',
        "es": 'Trabajar en el montante exige acuerdo con la administración y los copropietarios, y corte de agua.'},
    'Arbeiten in der Krone erfolgen mit Seilklettertechnik oder Hubarbeitsbühne durch qualifiziertes Personal. Bühnenmiete und Stellplatzgenehmigung sind gesondert zu bewerten.': {
        "en": 'Crown work is carried out by qualified staff using rope access or an access platform. Platform hire and parking permits are assessed separately.', "tr": 'Taçtaki işler nitelikli personel tarafından halatla tırmanma veya platformla yapılır. Platform kirası ve park izni ayrıca değerlendirilir.',
        "es": 'Los trabajos en copa los realiza personal cualificado con trepa o plataforma. El alquiler de la plataforma y el permiso de ocupación se valoran aparte.'},
    'Aufbau nicht einsehbar. Bei Dickbett-Verlegung entsteht Mehraufwand, der nach tatsächlichem Aufwand verrechnet wird.': {
        "en": 'The build-up cannot be seen. A thick-bed installation causes extra work, charged on time and material.', "tr": 'Katman görünmüyor. Kalın yataklı döşemede oluşan ek iş harcamaya göre faturalanır.',
        "es": 'No se ve el sistema constructivo. Una colocación en capa gruesa genera trabajo adicional, facturado por administración.'},
    'Auftausalz ist in vielen Gemeinden auf Gehwegen untersagt. Die örtliche Vorgabe ist bauseits zu prüfen.': {
        "en": 'De-icing salt is banned on footpaths in many municipalities. The local rule must be checked by the customer.', "tr": 'Buz çözücü tuz birçok belediyede kaldırımlarda yasaktır. Yerel kural müşteri tarafından kontrol edilmelidir.',
        "es": 'La sal fundente está prohibida en aceras en muchos municipios. El cliente debe comprobar la norma local.'},
    'Ausführung nach ÖNORM B 5371 / DIN 18065 (Geländerhöhe, Öffnungsweiten).': {
        "en": 'Executed to ÖNORM B 5371 / DIN 18065 (balustrade height, opening widths).', "tr": "ÖNORM B 5371 / DIN 18065'e göre uygulanır (korkuluk yüksekliği, açıklık genişlikleri).",
        "es": 'Ejecución según ÖNORM B 5371 / DIN 18065 (altura de barandilla, anchos de paso).'},
    'Ausführung witterungsabhängig; Verzögerungen begründen keinen Preisnachlass.': {
        "en": 'Work depends on the weather; delays are not grounds for a discount.', "tr": 'Uygulama hava koşullarına bağlıdır; gecikmeler indirim gerekçesi değildir.',
        "es": 'La ejecución depende del tiempo; los retrasos no dan derecho a descuento.'},
    'Ausreichendes Gefälle zur Entwässerung wird vorausgesetzt.': {
        "en": 'Adequate fall for drainage is assumed.', "tr": 'Drenaj için yeterli eğim varsayılır.',
        "es": 'Se presupone pendiente suficiente para el desagüe.'},
    'Außenbeläge werden frostsicher und mit Gefälle ausgeführt. Bestehende Abdichtung und Untergrundaufbau werden als normgerecht angenommen.': {
        "en": 'Outdoor coverings are laid frost-proof and to falls. Existing waterproofing and build-up are assumed to meet the standard.', "tr": 'Dış kaplamalar dona dayanıklı ve eğimli yapılır. Mevcut su yalıtımı ve katman standarda uygun kabul edilir.',
        "es": 'Los pavimentos exteriores se ejecutan resistentes a heladas y con pendiente. Se supone que la impermeabilización y el soporte existentes cumplen la norma.'},
    'Baubehördliche Genehmigung ist bauseits einzuholen und nicht im Angebot enthalten.': {
        "en": 'Building consent must be obtained by the customer and is not included.', "tr": 'Yapı ruhsatı müşteri tarafından alınır ve teklife dahil değildir.',
        "es": 'La licencia de obra la gestiona el cliente y no está incluida.'},
    'Bauseitiger Stromanschluss an geeigneter Stelle wird vorausgesetzt.': {
        "en": 'A power supply at a suitable point is assumed to be provided by the customer.', "tr": 'Uygun bir noktada müşteri tarafından elektrik sağlanacağı varsayılır.',
        "es": 'Se presupone toma de corriente aportada por el cliente en un punto adecuado.'},
    'Behördliche Abnahme und Rauchfangkehrer-Befund sind nicht enthalten.': {
        "en": "Official sign-off and the chimney sweep's certificate are not included.", "tr": 'Resmi kabul ve baca temizleyicisi raporu dahil değildir.',
        "es": 'La recepción oficial y el certificado del deshollinador no están incluidos.'},
    'Bei Altbauten ist der Untergrund oft nicht lot- und fluchtgerecht. Ausgleich nach Aufwand.': {
        "en": 'In period buildings the substrate is often out of plumb and line. Levelling is charged on time and material.', "tr": 'Eski yapılarda zemin çoğu kez şakulünde ve düzgün değildir. Tesviye harcamaya göre faturalanır.',
        "es": 'En edificios antiguos el soporte suele estar fuera de plomo y alineación. La nivelación se factura por administración.'},
    'Bei Bauteilen vor 1990 kann der Kleber bzw. Bodenbelag Asbest enthalten. Vor Abbruch ist eine Materialanalyse erforderlich; Arbeiten nach TRGS 519 sind nicht im Angebot enthalten.': {
        "en": 'In elements from before 1990 the adhesive or covering may contain asbestos. A material analysis is required before removal; work to TRGS 519 is not included.', "tr": '1990 öncesi yapı elemanlarında yapıştırıcı veya kaplama asbest içerebilir. Sökümden önce malzeme analizi gerekir; TRGS 519 kapsamındaki işler dahil değildir.',
        "es": 'En elementos anteriores a 1990 el adhesivo o el revestimiento pueden contener amianto. Antes del desmontaje se requiere un análisis; los trabajos según TRGS 519 no están incluidos.'},
    'Bei Brunnen- oder Zisternenwasser ist eine Wasseranalyse zu empfehlen; eisenhaltiges Wasser verfärbt Beläge und setzt Düsen zu.': {
        "en": 'With well or tank water a water analysis is advisable; iron-rich water stains surfaces and blocks nozzles.', "tr": 'Kuyu veya sarnıç suyunda su analizi önerilir; demirli su yüzeyleri boyar ve memeleri tıkar.',
        "es": 'Con agua de pozo o aljibe conviene un análisis; el agua ferruginosa mancha los pavimentos y obtura los difusores.'},
    'Bei Fußbodenheizung ist ein Aufheiz- bzw. Funktionsheizprotokoll erforderlich und vor Verlegebeginn vorzulegen. Erstellung ist nicht enthalten.': {
        "en": 'With underfloor heating a commissioning heat-up record is required and must be produced before laying starts. Producing it is not included.', "tr": 'Yerden ısıtmada ısıtma/işletme protokolü gerekir ve döşemeden önce sunulmalıdır. Hazırlanması dahil değildir.',
        "es": 'Con suelo radiante se exige un protocolo de puesta en marcha, a presentar antes de iniciar la colocación. Su emisión no está incluida.'},
    'Bei beengtem Fallraum wird der Baum in Stücken abgetragen und abgeseilt. Der Mehraufwand gegenüber einer Fällung im Ganzen wird nach tatsächlichem Aufwand verrechnet.': {
        "en": 'Where the fall zone is confined the tree is taken down in sections and lowered. The extra over a single fell is charged on time and material.', "tr": 'Devrilme alanı darsa ağaç parçalar halinde indirilir. Tek parça kesime göre ek iş harcamaya göre faturalanır.',
        "es": 'Si la zona de caída es reducida, el árbol se desmonta por tramos y se desciende. El sobrecoste frente a la tala entera se factura por administración.'},
    'Bei deutlichem Farbwechsel, besonders dunkel auf hell oder bei intensiven Farbtönen, ist ein dritter Anstrich erforderlich. Dieser ist im Grundpreis nicht enthalten und wird gesondert ausgewiesen.': {
        "en": 'A marked change of colour — especially dark to light, or strong shades — needs a third coat. That is not in the base price and is shown separately.', "tr": 'Belirgin renk değişiminde, özellikle koyudan açığa veya yoğun tonlarda, üçüncü kat gerekir. Bu temel fiyata dahil değildir ve ayrı gösterilir.',
        "es": 'Un cambio de color marcado —sobre todo de oscuro a claro o con tonos intensos— requiere una tercera mano. No está en el precio base y se indica aparte.'},
    'Bei länger zurückliegender Wartung ist mit zusätzlichem Reinigungs- und Teileaufwand zu rechnen.': {
        "en": 'If the last service was some time ago, expect extra cleaning and parts.', "tr": 'Son bakım üzerinden uzun süre geçtiyse ek temizlik ve parça beklenmelidir.',
        "es": 'Si el último mantenimiento fue hace tiempo, cabe esperar más limpieza y piezas.'},
    'Bei mehreren Ladepunkten oder begrenztem Hausanschluss ist ein Lastmanagement erforderlich.': {
        "en": 'With several charge points, or a limited supply, load management is required.', "tr": 'Birden fazla şarj noktası veya sınırlı bağlantıda yük yönetimi gerekir.',
        "es": 'Con varios puntos de recarga o una acometida limitada se requiere gestión de carga.'},
    'Bei unbekanntem Hersteller kann die Ersatzteilbeschaffung Mehraufwand verursachen oder einen Komplettaustausch erfordern.': {
        "en": 'If the manufacturer is unknown, sourcing parts may cost extra or force a full replacement.', "tr": 'Üretici bilinmiyorsa yedek parça temini ek iş getirebilir veya komple değişim gerektirebilir.',
        "es": 'Si se desconoce el fabricante, conseguir repuestos puede encarecer el trabajo u obligar a sustituirlo todo.'},
    'Bei verdichteten Baustellenflächen kann ein Bodenaustausch erforderlich sein. Dieser ist nicht enthalten und wird nach tatsächlichem Aufwand verrechnet.': {
        "en": 'Compacted site ground may need replacing. That is not included and is charged on time and material.', "tr": 'Sıkışmış şantiye zemininde zemin değişimi gerekebilir. Bu dahil değildir ve harcamaya göre faturalanır.',
        "es": 'El terreno de obra compactado puede exigir sustitución. No está incluido y se factura por administración.'},
    'Bei wiederkehrenden Verstopfungen wird eine Kamerabefahrung empfohlen, um die Ursache zu finden.': {
        "en": 'Where blockages recur, a camera survey is recommended to find the cause.', "tr": 'Tekrarlayan tıkanıklıklarda nedeni bulmak için kamera incelemesi önerilir.',
        "es": 'Si los atascos se repiten, se recomienda una inspección con cámara para hallar la causa.'},
    'Beim Wannentausch werden angrenzende Fliesen beschädigt. Fliesenarbeiten sind nicht enthalten.': {
        "en": 'Replacing the bath damages the tiles around it. Tiling work is not included.', "tr": 'Küvet değişiminde çevredeki fayanslar zarar görür. Fayans işleri dahil değildir.',
        "es": 'Al sustituir la bañera se dañan los azulejos contiguos. Los trabajos de alicatado no están incluidos.'},
    'Beistellung des Bezugsstoffs durch den Auftraggeber ist möglich; Materialanteil entfällt dann.': {
        "en": 'The customer may supply the cover fabric; the material share is then omitted.', "tr": 'Kılıf kumaşını müşteri temin edebilir; bu durumda malzeme payı düşer.',
        "es": 'El cliente puede aportar la tela; en ese caso se descuenta la parte de material.'},
    'Beschläge, Griffe und Dichtungen werden demontiert und wieder montiert. Defekte Beschläge werden nicht ersetzt.': {
        "en": 'Ironmongery, handles and seals are removed and refitted. Faulty ironmongery is not replaced.', "tr": 'Donanım, kollar ve contalar sökülüp yeniden takılır. Arızalı donanım değiştirilmez.',
        "es": 'Herrajes, manillas y juntas se desmontan y vuelven a montar. Los herrajes defectuosos no se sustituyen.'},
    'Bestehende Gasleitung, Abgasführung und Elektroanschluss werden als normgerecht und weiterverwendbar angenommen.': {
        "en": 'The existing gas pipe, flue and electrical connection are assumed to meet the standard and be reusable.', "tr": 'Mevcut gaz hattı, baca ve elektrik bağlantısı standarda uygun ve kullanılabilir kabul edilir.',
        "es": 'Se supone que la tubería de gas, la salida de humos y la conexión eléctrica existentes cumplen la norma y son reutilizables.'},
    'Bewässerung in den ersten Wochen ist bauseits sicherzustellen; ohne sie keine Anwachsgarantie.': {
        "en": "Watering in the first weeks is the customer's responsibility; without it there is no establishment guarantee.", "tr": 'İlk haftalardaki sulama müşteriye aittir; sulama olmadan tutma garantisi verilmez.',
        "es": 'El riego de las primeras semanas corre a cargo del cliente; sin él no hay garantía de arraigo.'},
    'Bleileitungen sind gesundheitsschädlich und in Gebäuden vor 1970 möglich. Wird Blei vorgefunden, ist der gesamte Strang zu tauschen; dies ist im Angebot nicht enthalten.': {
        "en": 'Lead pipes are a health hazard and possible in buildings from before 1970. If lead is found the whole riser must be replaced; that is not included.', "tr": 'Kurşun borular sağlığa zararlıdır ve 1970 öncesi binalarda bulunabilir. Kurşun bulunursa tüm kolon değiştirilmelidir; bu teklife dahil değildir.',
        "es": 'Las tuberías de plomo son nocivas y posibles en edificios anteriores a 1970. Si aparece plomo hay que sustituir todo el montante; no está incluido.'},
    'Das Bad ist während der Arbeiten nicht nutzbar. Ohne zweites WC ist eine Ersatzlösung bauseits zu organisieren.': {
        "en": 'The bathroom cannot be used during the work. Without a second WC the customer must arrange an alternative.', "tr": 'Banyo çalışma süresince kullanılamaz. İkinci WC yoksa alternatifi müşteri sağlar.',
        "es": 'El baño no puede usarse durante los trabajos. Sin un segundo aseo, el cliente debe organizar una alternativa.'},
    'Das Gutachten wird unabhängig erstellt; ein bestimmtes Ergebnis kann nicht zugesagt werden.': {
        "en": 'The report is produced independently; no particular outcome can be promised.', "tr": 'Rapor bağımsız olarak hazırlanır; belirli bir sonuç taahhüt edilemez.',
        "es": 'El informe se emite de forma independiente; no puede prometerse un resultado concreto.'},
    'Das Protokoll ist für die Vorlage bei Versicherung oder Hausverwaltung geeignet.': {
        "en": 'The certificate is suitable for submission to an insurer or managing agent.', "tr": 'Rapor sigortaya veya yönetime sunulmaya uygundur.',
        "es": 'El informe es apto para presentarlo a la aseguradora o la administración.'},
    'Das erforderliche Gefälle zum Ablauf muss herstellbar sein; andernfalls ist eine Pumpenlösung nötig.': {
        "en": 'The necessary fall to the waste must be achievable; otherwise a pumped solution is needed.', "tr": 'Gidere gerekli eğim sağlanabilmelidir; aksi halde pompalı çözüm gerekir.',
        "es": 'Debe poderse dar la pendiente necesaria al desagüe; si no, hará falta una solución con bomba.'},
    'Dehnungsfugen werden nach Herstellervorgabe ausgeführt.': {
        "en": "Movement joints are formed to the manufacturer's specification.", "tr": 'Genleşme derzleri üretici talimatına göre yapılır.',
        "es": 'Las juntas de dilatación se ejecutan según especificación del fabricante.'},
    'Der Anschluss darf nur durch ein konzessioniertes Elektrounternehmen erfolgen.': {
        "en": 'The connection may only be made by a licensed electrical contractor.', "tr": 'Bağlantı yalnızca yetkili bir elektrik firması tarafından yapılabilir.',
        "es": 'La conexión solo puede realizarla una empresa eléctrica autorizada.'},
    'Der Aushub verbleibt am Grundstück; Abtransport und Deponiegebühren entfallen. Zwischenlagerung ist bauseits zu ermöglichen.': {
        "en": 'The spoil stays on the plot; haulage and tip fees do not apply. The customer must allow space to stockpile it.', "tr": 'Kazı malzemesi arsada kalır; nakliye ve döküm ücreti düşer. Geçici depolama imkanı müşteri tarafından sağlanır.',
        "es": 'La tierra se queda en la parcela; no hay transporte ni tasas de vertedero. El cliente debe permitir su acopio.'},
    'Der Befund dokumentiert den Ist-Zustand. Die Behebung festgestellter Mängel ist nicht enthalten.': {
        "en": 'The report documents the condition as found. Remedying any defects is not included.', "tr": 'Rapor mevcut durumu belgeler. Tespit edilen eksiklerin giderilmesi dahil değildir.',
        "es": 'El informe documenta el estado actual. La subsanación de los defectos detectados no está incluida.'},
    'Der Grünschnitt verbleibt vor Ort; der Entsorgungsanteil entfällt.': {
        "en": 'The green waste stays on site; the disposal share is omitted.', "tr": 'Yeşil atık yerinde kalır; bertaraf payı düşer.',
        "es": 'Los restos vegetales se quedan en obra; se descuenta la parte de vertido.'},
    'Der Preis umfasst Verlegung und Verlegematerial (Kleber, Fuge, Dämmung). Fliesen bzw. Bodenbelag sind nicht enthalten und werden gesondert verrechnet.': {
        "en": 'The price covers laying and laying materials (adhesive, grout, underlay). Tiles or floor covering are not included and are charged separately.', "tr": 'Fiyat döşeme ve döşeme malzemesini (yapıştırıcı, derz, şilte) kapsar. Fayans veya zemin kaplaması dahil değildir, ayrıca faturalanır.',
        "es": 'El precio cubre la colocación y el material de colocación (adhesivo, junta, aislante). Los azulejos o el pavimento no están incluidos y se facturan aparte.'},
}


# ── What the estimator writes, not the catalogue ────────────────────────
#
# Six of these never existed in estimation_catalogue.json: the estimator
# composes them at calculation time — the setup position every quote opens
# with, the disposal position, the skip size chosen by weight, the trade
# names in the picker. The audit reads the catalogue, so it was blind to
# them by construction, and they stayed German through five commits that
# each reported full coverage. test_catalogue_i18n now walks a real
# estimate as well as the catalogue, which is what makes that impossible
# to repeat.

ESTIMATE_STRINGS: dict[str, dict[str, str]] = {
    'Anfahrt, Einrichten und Schutzmaßnahmen': {
        "en": 'Travel, set-up and protective measures', "tr": 'Yol, hazırlık ve koruma önlemleri',
        "es": 'Desplazamiento, preparación y medidas de protección'},
    'Entsorgung inkl. Container': {
        "en": 'Disposal including container', "tr": 'Bertaraf (konteyner dahil)',
        "es": 'Retirada de residuos, contenedor incluido'},
    'Big Bag (bis 1 t)': {
        "en": 'Big bag (up to 1 t)', "tr": 'Big bag (1 tona kadar)',
        "es": 'Big bag (hasta 1 t)'},
    '3 m³ Mulde': {
        "en": '3 m³ skip', "tr": '3 m³ konteyner',
        "es": 'Contenedor de 3 m³'},
    '7 m³ Mulde': {
        "en": '7 m³ skip', "tr": '7 m³ konteyner',
        "es": 'Contenedor de 7 m³'},
    'Mehrere Mulden oder Abrollcontainer': {
        "en": 'Several skips or a roll-off container', "tr": 'Birden fazla konteyner veya kancalı konteyner',
        "es": 'Varios contenedores o un contenedor de gancho'},
    'Maler': {
        "en": 'Painting and decorating', "tr": 'Boyacılık',
        "es": 'Pintura'},
    'Fliesen': {
        "en": 'Tiling', "tr": 'Fayans',
        "es": 'Alicatado'},
    'Elektrik': {
        "en": 'Electrical', "tr": 'Elektrik',
        "es": 'Electricidad'},
    'Sanitär': {
        "en": 'Plumbing and heating', "tr": 'Tesisat',
        "es": 'Fontanería'},
    'Garten': {
        "en": 'Garden and grounds', "tr": 'Bahçe',
        "es": 'Jardinería'},
    'Reinigung': {
        "en": 'Cleaning', "tr": 'Temizlik',
        "es": 'Limpieza'},
    'Montage / Allround': {
        "en": 'Fitting and handyman', "tr": 'Montaj / Genel işler',
        "es": 'Montaje / Multiservicios'},
    'Material': {
        "en": 'Material', "tr": 'Malzeme',
        "es": 'Material'},
}

# Every table in this module, in the order a lookup should try them. Split by
# what they describe rather than merged, so a translator can be handed one
# section at a time and so the coverage test can report which part is short.


TABLES: tuple[dict, ...] = (ESTIMATE_STRINGS, NOTES, QUOTE_LINES, OPTIONS, QUESTIONS, AXES, JOB_TITLES)


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
