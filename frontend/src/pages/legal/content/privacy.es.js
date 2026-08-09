/** Privacy Policy — Spanish. Translation of the English source in privacy.en.js. */
import { MAIL, DSB, OPERATOR } from './privacy.en.js';

export const ES = {
  title: 'Política de privacidad',
  intro: [
    { lead: [
      'Esta Política de privacidad explica cómo ', { b: OPERATOR },
      ' (aquí ', { b: '«ServiceMarket»' }, ', «nosotros») recoge, utiliza, conserva y protege los datos personales que usted facilita al usar ',
      { a: 'servicemarket.at', href: 'https://servicemarket.at' },
      ' (la «Plataforma»). Está redactada para cumplir el Reglamento General de Protección de Datos de la UE (Reglamento (UE) 2016/679, «RGPD») y la Ley austriaca de protección de datos (Datenschutzgesetz, DSG).',
    ] },
    { note: ['Estado: borrador, pendiente de revisión jurídica. Las cuatro versiones lingüísticas son traducciones del borrador en inglés y ninguna es vinculante mientras el texto no haya sido finalizado por asesoría jurídica. Una vez finalizado, la versión alemana será la vinculante.'] },
  ],
  sections: [
    { id: 'controller', heading: '1. Responsable del tratamiento', blocks: [{ p: [
      { b: OPERATOR }, { br: 1 },
      'Titular: ', { todo: 'Inhaber-Name — to be filled' }, { br: 1 },
      'Domicilio social: ', { todo: 'Geschäftsadresse — to be filled' }, { br: 1 },
      'Correo electrónico: ', { a: MAIL, href: `mailto:${MAIL}` }, { br: 1 },
      'Somos el responsable del tratamiento de los datos personales que usted facilita a través de la Plataforma.',
    ] }] },
    { id: 'data-we-collect', heading: '2. Datos que recogemos', blocks: [
      { p: ['Según cómo utilice la Plataforma, recogemos las siguientes categorías de datos personales:'] },
      { ul: [
        [{ b: 'Datos de cuenta' }, ' — nombre, correo electrónico, contraseña (con hash bcrypt), teléfono, rol (propietario o profesional), idioma preferido, país, ciudad.'],
        [{ b: 'Datos de perfil (profesionales)' }, ' — nombre comercial, categorías de servicio, fotos de portafolio, dirección, documentos de verificación, tarifa horaria, disponibilidad, distintivos (Verificado / Habilitado / Asegurado).'],
        [{ b: 'Contenido de trabajos y presupuestos' }, ' — títulos, descripciones, fotos y PDF que suba, presupuestos que envíe, precios, mensajes, franjas de cita.'],
        [{ b: 'Datos de transacción' }, ' — identificador de cliente en Stripe, estado del pago, facturas de tarifas de contacto, registros mensuales de facturación. No almacenamos los datos de su tarjeta; el procesador de pagos es Stripe.'],
        [{ b: 'Datos de uso' }, ' — marcas de tiempo de inicio de sesión, dirección IP (truncada a /24), user-agent del navegador, suscripciones a notificaciones push (VAPID).'],
        [{ b: 'Registros de consentimiento' }, ' — qué versión de qué texto aceptó, cuándo y desde qué IP. Se utilizan como prueba del consentimiento conforme al art. 7.1 del RGPD.'],
      ] },
    ] },
    { id: 'how-we-use', heading: '3. Para qué utilizamos sus datos', blocks: [{ ul: [
      ['Para crear y autenticar su cuenta.'],
      ['Para poner en contacto a propietarios con profesionales adecuados (clasificación por categoría, coincidencia por ubicación).'],
      ['Para ofrecer chat en tiempo real, notificaciones push y calendarios de citas.'],
      ['Para facturar las tarifas de contacto y las suscripciones Pro a través de Stripe y emitir las facturas legalmente exigidas.'],
      ['Para prevenir el fraude, el abuso y el incumplimiento de nuestros Términos (limitación de peticiones, detección de presupuestos sospechosos).'],
      ['Para cumplir obligaciones legales austriacas y de la UE (registros fiscales, controles de blanqueo de capitales en reservas de importe elevado).'],
      ['Con su consentimiento expreso, para enviarle correos de marketing sobre nuevas funciones. Puede retirar ese consentimiento en cualquier momento.'],
    ] }] },
    { id: 'legal-bases', heading: '4. Bases jurídicas del tratamiento (art. 6 RGPD)', blocks: [{ ul: [
      [{ b: 'Ejecución de un contrato (art. 6.1.b)' }, ' — todo lo necesario para operar el mercado en el que se registró: cuenta, emparejamiento, mensajería, pagos.'],
      [{ b: 'Obligación legal (art. 6.1.c)' }, ' — conservación de facturas durante siete años (§ 132 BAO) y controles KYC cuando procedan.'],
      [{ b: 'Consentimiento (art. 6.1.a)' }, ' — correos de marketing, cookies analíticas opcionales, traducción de mensajes concretos.'],
      [{ b: 'Interés legítimo (art. 6.1.f)' }, ' — de forma restringida: prevención del fraude, analítica agregada, mejora del servicio y seguridad de la Plataforma. Puede oponerse en cualquier momento por los medios de contacto indicados más abajo.'],
    ] }] },
    { id: 'sharing', heading: '5. Comunicación de datos y encargados', blocks: [
      { p: ['No vendemos sus datos personales. Solo los comunicamos a los siguientes encargados del tratamiento, cada uno vinculado por un contrato de encargo:'] },
      { ul: [
        [{ b: 'Stripe Payments Europe Ltd.' }, ' (Irlanda) — procesamiento de pagos. Nunca almacenamos datos de tarjeta.'],
        [{ b: 'Supabase Inc.' }, ' (región UE) — la base de datos PostgreSQL y el almacenamiento privado de objetos con fotos de trabajos, licencias y justificantes.'],
        [{ b: 'Vercel Inc.' }, ' — alojamiento de la aplicación y CDN. Recibe los metadatos de petición que recibe cualquier alojamiento web: dirección IP, user-agent, ruta solicitada.'],
        [{ b: 'Proveedor de envío de correo' }, ' — solo correo transaccional: restablecimiento de contraseña y los presupuestos y facturas que usted decide enviar. Recibe la dirección del destinatario y el contenido de ese mensaje.'],
        [{ b: 'Open-Meteo' }, ' — la previsión meteorológica que aparece en su calendario. Recibe únicamente las coordenadas del lugar de la cita: ningún identificador de cuenta, nombre ni dirección.'],
        [{ b: 'Proveedores de web push (Mozilla, Google, Apple)' }, ' — solo si activa las notificaciones push del navegador.'],
      ] },
      { p: ['Esta es la lista vigente. Si cambia, actualizamos esta página y, cuando el cambio sea sustancial, se lo comunicamos antes de que surta efecto.'] },
    ] },
    { id: 'transfers', heading: '6. Transferencias internacionales', blocks: [{ p: [
      'La mayor parte del tratamiento se realiza en la UE/EEE. Cuando se transfieren datos fuera del EEE —por ejemplo, infraestructura de alojamiento y de notificaciones push en Estados Unidos— nos basamos en las Cláusulas Contractuales Tipo de la Comisión Europea junto con medidas técnicas complementarias (cifrado en tránsito y en reposo).',
    ] }] },
    { id: 'retention', heading: '7. Plazos de conservación', blocks: [{ ul: [
      ['Datos de cuenta y perfil — mientras la cuenta esté activa; se eliminan en un plazo de 30 días desde una solicitud de supresión confirmada, tras un periodo de gracia de siete días por si hubiera error.'],
      ['Historial de trabajos, presupuestos y mensajes — 24 meses desde la finalización del trabajo correspondiente, para resolución de conflictos y operativa.'],
      ['Facturas y registros fiscales — siete años (§ 132 Bundesabgabenordnung, BAO).'],
      ['Registros de consentimiento — cinco años desde su retirada, como prueba.'],
      ['Registros técnicos (servidor, seguridad, auditoría) — 90 días, salvo incidentes de seguridad, que conservamos hasta un año.'],
      ['Cuentas inactivas — si no inicia sesión durante 12 meses, marcamos la cuenta y, tras un correo de aviso, la eliminamos 30 días después.'],
    ] }] },
    { id: 'security', heading: '8. Medidas de seguridad', blocks: [{ ul: [
      ['TLS 1.2 o superior para todos los datos en tránsito.'],
      ['Cifrado AES-256 en reposo (PostgreSQL y almacenamiento de objetos gestionados por Supabase).'],
      ['Contraseñas con hash bcrypt (factor de coste 12).'],
      ['Tokens de sesión JWT con rotación del token de refresco.'],
      ['Control de acceso basado en roles en cada ruta del backend.'],
      ['Registros de auditoría de todo acceso de administración a un perfil que no sea de administración.'],
      ['Análisis de seguridad periódicos de las dependencias.'],
    ] }] },
    { id: 'rights', heading: '9. Sus derechos', blocks: [
      { p: ['Conforme a los artículos 15 a 22 del RGPD, usted tiene derecho a:'] },
      { ul: [
        [{ b: 'Acceder' }, ' a los datos personales que tenemos sobre usted.'],
        [{ b: 'Rectificar' }, ' datos inexactos: la mayoría de los campos son editables en sus Ajustes.'],
        [{ b: 'Suprimir' }, ' su cuenta, con el botón «Eliminar mi cuenta» en Ajustes de privacidad.'],
        [{ b: 'Limitar' }, ' el tratamiento en determinados casos.'],
        [{ b: 'Portabilidad' }, ': descargar una copia legible por máquina en JSON de sus datos desde Ajustes de privacidad → «Descargar mis datos».'],
        [{ b: 'Oponerse' }, ' al tratamiento basado en el interés legítimo.'],
        [{ b: 'Retirar el consentimiento' }, ' en cualquier momento, sin que ello afecte al tratamiento lícito anterior.'],
        [{ b: 'Reclamar' }, ' ante la Autoridad austriaca de protección de datos (Datenschutzbehörde) si considera que hemos tratado indebidamente sus datos.'],
      ] },
      { p: ['Para ejercer estos derechos, utilice nuestro ', { a: 'formulario de derechos', href: '/data-rights' }, ' o escriba a ', { a: MAIL, href: `mailto:${MAIL}` }, '. Respondemos en un plazo de 30 días.'] },
    ] },
    { id: 'cookies', heading: '10. Cookies', blocks: [
      { p: ['Utilizamos tres categorías de cookies. El consentimiento granular se ofrece en la primera visita y mediante el enlace «Preferencias de cookies» del pie de página:'] },
      { ul: [
        [{ b: 'Esenciales' }, ' — sesión de acceso, protección CSRF, idioma. Siempre activas.'],
        [{ b: 'Analíticas' }, ' — estadísticas de uso anónimas. Requieren consentimiento.'],
        [{ b: 'Marketing' }, ' — publicidad relevante en sitios de terceros. Requieren consentimiento; desactivadas por defecto.'],
      ] },
    ] },
    { id: 'children', heading: '11. Menores', blocks: [{ p: [
      'La Plataforma no está dirigida a usuarios menores de 16 años. No recogemos conscientemente datos de menores. Si cree que conservamos datos de un menor, póngase en contacto con nosotros para que podamos eliminarlos.',
    ] }] },
    { id: 'changes', heading: '12. Cambios en esta política', blocks: [{ p: [
      'Podemos actualizar esta Política a medida que evolucione la Plataforma. Los cambios sustanciales se anuncian mediante notificación en la aplicación al menos 14 días antes de que surtan efecto. La versión vigente y la fecha de «última actualización» figuran siempre al principio de esta página.',
    ] }] },
    { id: 'contact', heading: '13. Contacto', blocks: [
      { p: ['Para cualquier consulta o solicitud sobre privacidad:', { br: 1 }, { b: 'Correo electrónico: ' }, { a: MAIL, href: `mailto:${MAIL}` }] },
      { p: ['Autoridad de control: ', { a: 'Österreichische Datenschutzbehörde, Barichgasse 40-42, 1030 Wien', href: DSB }, '.'] },
    ] },
  ],
};
