/** Privacy Policy — German. Translation of the English source in privacy.en.js. */
import { MAIL, DSB, OPERATOR } from './privacy.en.js';

export const DE = {
  title: 'Datenschutzerklärung',
  intro: [
    { lead: [
      'Diese Datenschutzerklärung erläutert, wie ', { b: OPERATOR },
      ' (hier ', { b: '„ServiceMarket“' }, ', „wir“, „uns“) die personenbezogenen Daten erhebt, verwendet, speichert und schützt, die Sie bei der Nutzung von ',
      { a: 'servicemarket.at', href: 'https://servicemarket.at' },
      ' (die „Plattform“) bereitstellen. Sie ist auf die Datenschutz-Grundverordnung (Verordnung (EU) 2016/679, „DSGVO“) und das österreichische Datenschutzgesetz (DSG) abgestimmt.',
    ] },
    { note: ['Status: Entwurf, juristische Prüfung ausständig. Alle vier Sprachfassungen sind Übersetzungen des englischen Entwurfs; keine davon ist verbindlich, solange der Text nicht anwaltlich finalisiert ist. Nach der Finalisierung ist die deutsche Fassung die verbindliche.'] },
  ],
  sections: [
    { id: 'controller', heading: '1. Verantwortlicher', blocks: [{ p: [
      { b: OPERATOR }, { br: 1 },
      'Inhaber: ', { todo: 'Inhaber-Name — to be filled' }, { br: 1 },
      'Geschäftsanschrift: ', { todo: 'Geschäftsadresse — to be filled' }, { br: 1 },
      'E-Mail: ', { a: MAIL, href: `mailto:${MAIL}` }, { br: 1 },
      'Wir sind Verantwortlicher für die personenbezogenen Daten, die Sie über die Plattform bereitstellen.',
    ] }] },
    { id: 'data-we-collect', heading: '2. Welche Daten wir erheben', blocks: [
      { p: ['Je nachdem, wie Sie die Plattform nutzen, erheben wir folgende Kategorien personenbezogener Daten:'] },
      { ul: [
        [{ b: 'Kontodaten' }, ' — Name, E-Mail-Adresse, Passwort (mit bcrypt gehasht), Telefonnummer, Rolle (Auftraggeber oder Betrieb), bevorzugte Sprache, Land, Ort.'],
        [{ b: 'Profildaten (Betriebe)' }, ' — Firmenname, Leistungskategorien, Portfoliofotos, Adresse, Nachweisdokumente, Stundensatz, Verfügbarkeit, Abzeichen (Geprüft / Befugt / Versichert).'],
        [{ b: 'Auftrags- und Angebotsinhalte' }, ' — Auftragstitel, Beschreibungen, hochgeladene Fotos und PDFs, versendete Angebote, Preise, Nachrichten, Terminfenster.'],
        [{ b: 'Transaktionsdaten' }, ' — Stripe-Kundennummer, Zahlungsstatus, Rechnungen über Kontaktentgelte, monatliche Abrechnungsdaten. Kartendaten speichern wir nicht selbst; Zahlungsdienstleister ist Stripe.'],
        [{ b: 'Nutzungsdaten' }, ' — Anmeldezeitpunkte, IP-Adresse (auf /24 gekürzt), Browser-User-Agent, Push-Benachrichtigungs-Abonnements (VAPID).'],
        [{ b: 'Einwilligungsnachweise' }, ' — welche Fassung welcher Erklärung Sie wann und von welcher IP-Adresse akzeptiert haben. Dient als Nachweis der Einwilligung nach Art. 7 Abs. 1 DSGVO.'],
      ] },
    ] },
    { id: 'how-we-use', heading: '3. Wozu wir Ihre Daten verwenden', blocks: [{ ul: [
      ['Zur Erstellung und Authentifizierung Ihres Kontos.'],
      ['Zur Vermittlung passender Betriebe an Auftraggeber (Kategorisierung, Standortabgleich).'],
      ['Für Chat in Echtzeit, Push-Benachrichtigungen und Terminkalender.'],
      ['Zur Abrechnung von Kontaktentgelten und Pro-Abos über Stripe und zur Ausstellung der gesetzlich vorgeschriebenen Rechnungen.'],
      ['Zur Verhinderung von Betrug, Missbrauch und Verstößen gegen unsere AGB (Ratenbegrenzung, Erkennung auffälliger Angebote).'],
      ['Zur Erfüllung österreichischer und unionsrechtlicher Pflichten (Steuerunterlagen, Geldwäscheprüfungen bei hochpreisigen Buchungen).'],
      ['Mit Ihrer ausdrücklichen Einwilligung: Versand von Marketing-E-Mails zu neuen Funktionen. Die Einwilligung können Sie jederzeit widerrufen.'],
    ] }] },
    { id: 'legal-bases', heading: '4. Rechtsgrundlagen der Verarbeitung (Art. 6 DSGVO)', blocks: [{ ul: [
      [{ b: 'Vertragserfüllung (Art. 6 Abs. 1 lit. b)' }, ' — alles, was zum Betrieb des Marktplatzes erforderlich ist, für den Sie sich registriert haben: Konto, Vermittlung, Nachrichten, Zahlungen.'],
      [{ b: 'Rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c)' }, ' — Aufbewahrung von Rechnungen für sieben Jahre (§ 132 BAO) sowie KYC-Prüfungen, soweit anwendbar.'],
      [{ b: 'Einwilligung (Art. 6 Abs. 1 lit. a)' }, ' — Marketing-E-Mails, optionale Analyse-Cookies, Übersetzung einzelner Nachrichten.'],
      [{ b: 'Berechtigte Interessen (Art. 6 Abs. 1 lit. f)' }, ' — eng begrenzt: Betrugsprävention, aggregierte Auswertungen, Verbesserung und Absicherung der Plattform. Sie können jederzeit über die unten genannten Kontaktdaten widersprechen.'],
    ] }] },
    { id: 'sharing', heading: '5. Weitergabe und Auftragsverarbeiter', blocks: [
      { p: ['Wir verkaufen Ihre personenbezogenen Daten nicht. Wir geben sie ausschließlich an die folgenden Auftragsverarbeiter weiter, jeweils gebunden durch einen Auftragsverarbeitungsvertrag:'] },
      { ul: [
        [{ b: 'Stripe Payments Europe Ltd.' }, ' (Irland) — Zahlungsabwicklung. Kartendaten speichern wir nie selbst.'],
        [{ b: 'Supabase Inc.' }, ' (EU-Region) — die PostgreSQL-Datenbank und der private Objektspeicher mit Auftragsfotos, Befugnisnachweisen und Belegen.'],
        [{ b: 'Vercel Inc.' }, ' — Hosting der Anwendung und CDN. Erhält die Metadaten jeder Anfrage, die jeder Webhost erhält: IP-Adresse, User-Agent, aufgerufener Pfad.'],
        [{ b: 'E-Mail-Zustelldienst' }, ' — ausschließlich Transaktionsmails: Passwort-Zurücksetzungen sowie die Angebote und Rechnungen, die Sie versenden. Erhält die Empfängeradresse und den Inhalt dieser Nachricht.'],
        [{ b: 'Open-Meteo' }, ' — die Wettervorhersage in Ihrem Kalender. Erhält ausschließlich die Koordinaten des Einsatzorts: keine Kontokennung, keinen Namen, keine Adresse.'],
        [{ b: 'Web-Push-Anbieter (Mozilla, Google, Apple)' }, ' — nur, wenn Sie Browser-Push-Benachrichtigungen aktivieren.'],
      ] },
      { p: ['Diese Liste ist der aktuelle Stand. Ändert sie sich, aktualisieren wir diese Seite und informieren Sie bei wesentlichen Änderungen vorab.'] },
    ] },
    { id: 'transfers', heading: '6. Übermittlung in Drittländer', blocks: [{ p: [
      'Die Verarbeitung findet überwiegend in der EU bzw. im EWR statt. Soweit Daten außerhalb des EWR übermittelt werden — etwa Hosting- und Push-Infrastruktur in den USA — stützen wir uns auf die Standardvertragsklauseln der Europäischen Kommission samt ergänzender technischer Maßnahmen (Verschlüsselung bei der Übertragung und im Ruhezustand).',
    ] }] },
    { id: 'retention', heading: '7. Speicherdauer', blocks: [{ ul: [
      ['Konto- und Profildaten — solange Ihr Konto aktiv ist; Löschung innerhalb von 30 Tagen nach bestätigtem Löschverlangen, nach einer Frist von sieben Tagen für den Fall eines Irrtums.'],
      ['Auftrags-, Angebots- und Nachrichtenverlauf — 24 Monate nach Abschluss des zugehörigen Auftrags, für Streitbeilegung und Betrieb.'],
      ['Rechnungen und Steuerunterlagen — sieben Jahre (§ 132 Bundesabgabenordnung, BAO).'],
      ['Einwilligungsnachweise — fünf Jahre nach Widerruf, als Nachweis.'],
      ['Protokolle (Server, Sicherheit, Audit) — 90 Tage, mit Ausnahme von Sicherheitsvorfällen, die wir bis zu einem Jahr aufbewahren.'],
      ['Inaktive Konten — melden Sie sich zwölf Monate nicht an, markieren wir das Konto und löschen es nach einer Warn-E-Mail 30 Tage später.'],
    ] }] },
    { id: 'security', heading: '8. Sicherheitsmaßnahmen', blocks: [{ ul: [
      ['TLS 1.2 oder höher für alle Daten bei der Übertragung.'],
      ['AES-256-Verschlüsselung im Ruhezustand (von Supabase verwaltetes PostgreSQL und Objektspeicher).'],
      ['Passwörter mit bcrypt gehasht (Kostenfaktor 12).'],
      ['JWT-Sitzungstoken mit Rotation der Refresh-Token.'],
      ['Rollenbasierte Zugriffskontrolle auf jeder Backend-Route.'],
      ['Audit-Protokolle für jeden Zugriff einer Administration auf ein Nicht-Administrationsprofil.'],
      ['Regelmäßige Sicherheitsprüfungen der Abhängigkeiten.'],
    ] }] },
    { id: 'rights', heading: '9. Ihre Rechte', blocks: [
      { p: ['Nach den Art. 15 bis 22 DSGVO haben Sie das Recht auf:'] },
      { ul: [
        [{ b: 'Auskunft' }, ' über die personenbezogenen Daten, die wir zu Ihnen speichern.'],
        [{ b: 'Berichtigung' }, ' unrichtiger Daten — die meisten Felder können Sie in den Einstellungen selbst ändern.'],
        [{ b: 'Löschung' }, ' Ihres Kontos über die Schaltfläche „Konto löschen“ in den Datenschutz-Einstellungen.'],
        [{ b: 'Einschränkung' }, ' der Verarbeitung in bestimmten Fällen.'],
        [{ b: 'Datenübertragbarkeit' }, ' — Download einer maschinenlesbaren JSON-Kopie Ihrer Daten über Datenschutz-Einstellungen → „Meine Daten herunterladen“.'],
        [{ b: 'Widerspruch' }, ' gegen Verarbeitungen auf Grundlage berechtigter Interessen.'],
        [{ b: 'Widerruf der Einwilligung' }, ' jederzeit, ohne die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung zu berühren.'],
        [{ b: 'Beschwerde' }, ' bei der österreichischen Datenschutzbehörde, wenn Sie der Ansicht sind, dass wir Ihre Daten nicht korrekt verarbeitet haben.'],
      ] },
      { p: ['Zur Ausübung dieser Rechte nutzen Sie bitte unser ', { a: 'Formular für Betroffenenrechte', href: '/data-rights' }, ' oder schreiben Sie an ', { a: MAIL, href: `mailto:${MAIL}` }, '. Wir antworten innerhalb von 30 Tagen.'] },
    ] },
    { id: 'cookies', heading: '10. Cookies', blocks: [
      { p: ['Wir verwenden drei Kategorien von Cookies. Eine granulare Einwilligung wird beim ersten Besuch und über den Link „Cookie-Einstellungen“ im Footer angeboten:'] },
      { ul: [
        [{ b: 'Notwendig' }, ' — Anmeldesitzung, CSRF-Schutz, Sprache. Immer aktiv.'],
        [{ b: 'Analyse' }, ' — anonyme Nutzungsstatistik. Nur mit Einwilligung.'],
        [{ b: 'Marketing' }, ' — passende Werbung auf Drittseiten. Nur mit Einwilligung, standardmäßig aus.'],
      ] },
    ] },
    { id: 'children', heading: '11. Minderjährige', blocks: [{ p: [
      'Die Plattform richtet sich nicht an Personen unter 16 Jahren. Wir erheben wissentlich keine Daten von Minderjährigen. Wenn Sie annehmen, dass wir Daten eines Kindes gespeichert haben, kontaktieren Sie uns bitte, damit wir sie löschen können.',
    ] }] },
    { id: 'changes', heading: '12. Änderungen dieser Erklärung', blocks: [{ p: [
      'Wir können diese Erklärung mit der Weiterentwicklung der Plattform anpassen. Wesentliche Änderungen kündigen wir mindestens 14 Tage vor Wirksamwerden per In-App-Benachrichtigung an. Die aktuelle Fassung und das Datum der letzten Aktualisierung stehen stets am Anfang dieser Seite.',
    ] }] },
    { id: 'contact', heading: '13. Kontakt', blocks: [
      { p: ['Für alle Fragen und Anliegen zum Datenschutz:', { br: 1 }, { b: 'E-Mail: ' }, { a: MAIL, href: `mailto:${MAIL}` }] },
      { p: ['Aufsichtsbehörde: ', { a: 'Österreichische Datenschutzbehörde, Barichgasse 40-42, 1030 Wien', href: DSB }, '.'] },
    ] },
  ],
};
