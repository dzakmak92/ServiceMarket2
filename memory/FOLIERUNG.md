# Folierung — Preisrechner für Architekturfolie

Stand: Frontend fertig, Backend offen. Vorbild: retrena.de/kueche-folieren-lassen/#rechner
(vier Schritte, drei Wege zum Preis), erweitert auf acht Oberflächen-Welten, den
Untergrund mit Primer-Vorschlag und eine Betriebsansicht mit EK/VK.

## Was gebaut ist

| Adresse | Für wen | Datei |
|---|---|---|
| `/folierung` | Betrieb (nur freigeschaltete Profile) | `frontend/src/pages/pro/FolierungPage.jsx` |
| `/folierung/preise` | Betrieb: EK, VK, Stundensatz, Primer, Links | `frontend/src/pages/pro/FolierungPricesPage.jsx` |
| `/folie/:slug` | Endkunde, ohne Login, ohne App-Chrome | `frontend/src/pages/FoliePublicPage.jsx` |

Modul `frontend/src/folierung/`:

- `catalog.js` — Oberflächen mit zählbaren Elementen (Fläche, Kante, Stunden je Einheit,
  demontierbar ja/nein), Küchenformen und Bausteine (Insel, Extra-Schränke), Zustand,
  Untergründe → Primer-Regel, Dekorfamilien (Coverstyl'-Sortierung), Primer, Verbrauchs-
  material, Extras, Anfahrtszonen. Rein deklarativ.
- `pricing.js` — `calculate(input, settings)`: Mengen → Stunden → EK/VK, Primer in ml und
  Gebinden, drei Wege (Montage vor Ort, Hol- & Bring, Selbst machen) als Spanne,
  Deckungsbeitrag, Hinweise. `summaryText()` für WhatsApp/Formular. `DEFAULT_SETTINGS`.
- `pricing.test.mjs` — 30 Prüfungen, `node src/folierung/pricing.test.mjs`.
- `nesting.js` — Zuschnitt auf der Rolle. Standardmaße je Element (mm), Teileliste aus den
  Zählwerten (`piecesFor`), Streifen-Packen auf Rollen (`nest`): Zugabe je Seite, Messerabstand,
  Drehen nur bei Dekoren ohne Laufrichtung. Liefert Laufmeter, Rollenzahl, echten Verschnitt
  und die Lage jedes Teils für die Zeichnung. Rolle: **Bodaq Interior Film 1.220 mm × 50 m**
  (Materialbank: 4 ft × 164 ft; resimdo-Datenblatt: 122 cm × 50 lfm). Coverstyl' und 3M DI-NOC
  sind ebenfalls 1.220 mm breit. Einstellbar unter Preise → Rolle & Zuschnitt.
- `nesting.test.mjs` — 22 Prüfungen. Die wichtigste: zwei 596er-Fronten mit 20–25 mm Zugabe
  passen **nicht** nebeneinander auf 1.220 mm; eine Küche aus 600er-Fronten in Holzdekor
  verschneidet daher um 50 %, nicht 25 %. 450er-Fronten liegen zu zweit.
- `store.js` — Freischaltung (`canUseFolierung`) und Persistenz. **Heute localStorage.**
  Das ist die einzige Stelle, die beim Backend-Anschluss geändert wird.
- `Drawings.jsx` — nummerierte Zählzeichnungen (Küche, Insel, Schrank, Möbel, Tür, Bad, Wand,
  Fenster, Objekt, Treppe), Oberflächen-Icons, Zustandsbilder.
- `FolierungWizard.jsx` — die vier Schritte, `audience="pro"|"customer"`.

Freischaltung: `REACT_APP_FOLIERUNG_USERS` (kommagetrennte E-Mails) in Vercel setzen.
Ohne Variable gilt die Vorgabe in `store.js`. Admins sehen das Modul immer.

## Was noch fehlt (Backend)

Alles unten ist Postgres + FastAPI nach dem Muster von `backend/routes/profile_routes.py`.

### Tabellen

```sql
create table folierung_settings (
  pro_id      uuid primary key references pro_profiles(user_id) on delete cascade,
  slug        text unique not null,            -- /folie/{slug}
  settings    jsonb not null,                  -- genau das Objekt aus DEFAULT_SETTINGS
  updated_at  timestamptz not null default now()
);

create table folierung_calcs (
  id          uuid primary key default gen_random_uuid(),
  pro_id      uuid not null references pro_profiles(user_id) on delete cascade,
  customer_id uuid references customers(id),
  input       jsonb not null,                  -- der Wizard-Zustand
  result      jsonb not null,                  -- calculate()-Ergebnis zum Zeitpunkt
  vk numeric, ek numeric, hours numeric,
  source      text not null default 'pro',     -- 'pro' | 'public'
  created_at  timestamptz not null default now()
);

create table folierung_leads (                  -- Anfragen von der Kundenseite
  id          uuid primary key default gen_random_uuid(),
  pro_id      uuid not null,
  calc_id     uuid references folierung_calcs(id),
  name text, phone text, email text, address text, postal_code text, city text,
  wish_date   text,
  photos      jsonb,                            -- Upload-Keys aus /api/uploads
  consent_at  timestamptz,                      -- DSGVO: Foto-Einwilligung
  status      text not null default 'new',      -- new | quoted | won | lost
  created_at  timestamptz not null default now()
);
```

### Endpunkte

| Methode | Pfad | Zweck |
|---|---|---|
| GET/PUT | `/api/folierung/settings` | eigene Einstellungen (Pro, auth) |
| GET/POST/DELETE | `/api/folierung/calcs` | gespeicherte Kalkulationen |
| GET | `/api/public/folie/{slug}` | Einstellungen **ohne EK, Lohnkosten, Margen** für die Kundenseite |
| POST | `/api/public/folie/{slug}/lead` | Anfrage mit Fotos; Turnstile wie bei `/api/auth/register` |
| POST | `/api/folierung/calcs/{id}/quote` | Positionen aus `result.lines` als Angebot anlegen (`repositories/quotes.py`) |

`store.js` wird dann: `loadSettings → GET`, `saveSettings → PUT`, `loadCalcs/saveCalc/deleteCalc → calcs`.
`FoliePublicPage` liest `GET /api/public/folie/{slug}` statt localStorage.

Die Preisrechnung bleibt im Frontend (deterministisch, offline, testbar). Der Server rechnet
beim Anlegen eines Angebots einmal nach, mit derselben Engine über Node oder einer Portierung
von `pricing.js` — niemals mit zwei verschiedenen Zahlensätzen.

### Freischaltung sauber

Statt E-Mail-Liste im Frontend: Spalte `pro_profiles.has_folierung boolean default false`,
im `/api/profile/pro`-Payload mitliefern, `canUseFolierung` liest sie. Setzen über Admin → Users.

## Offene Entscheidungen (bitte beantworten)

1. **KI-Vorschau (Vorher/Nachher):** Welche Plattform? Der Link wird unter Preise & Einstellungen
   eingetragen und erscheint als Knopf. Wenn die Plattform eine API hat (Foto + Dekor rein,
   Bild raus), kann die Vorschau direkt in Schritt 4 stehen statt als Link. Dann braucht es:
   Foto-Upload (vorhanden: `AttachmentUploader` → `/api/uploads`), Einwilligung, API-Key als
   Umgebungsvariable.
2. **Coverstyl'-Muster:** Die Seite coverstyl.com war aus der Entwicklungsumgebung nicht
   erreichbar. Je Dekorfamilie gibt es ein Feld „Musterbild-URL“. Besser: eigene Dekor-Liste
   (Artikelnummer, Name, Familie, Bild, EK) als Tabelle `folierung_decors`, importiert aus der
   Coverstyl'-Preisliste. Dann wählt der Kunde das konkrete Dekor, nicht nur die Familie.
3. **Wer bekommt den öffentlichen Link?** Ein Slug je Betrieb (`/folie/mueller`) oder zusätzlich
   eigene Domain? Für eine eigene Domain: Vercel-Domain auf die App, Slug aus dem Host lesen.
4. **Preise:** Die Vorgaben sind Marktwerte, keine Betriebswerte. Stundensatz, Dekor-EK/VK,
   Primerpreise und Verschnitt müssen einmal eingetragen werden.

## Was im Retrena-Vorbild fehlt und hier schon drin ist

- Acht Oberflächen statt nur Küche; jede mit eigener Zeichnung und eigenen Zählregeln.
- Untergrund → Vorarbeit → Primer: Modus (keiner / Kanten / vollflächig / zweimal),
  Produkt (Standard / Kunststoff), Menge in ml, Gebinde, EK.
- Innenseiten, grifflose Optik, Gerätefronten, Demontage durch Betrieb, Wochenend-/Nachtzuschlag,
  Anfahrtszonen, Mindestauftragswert, Preisspanne.
- Hol- & Bring rechnet nur das Demontierbare in die Werkstatt; Platte, Nische, Korpus bleiben
  vor Ort, und die Karte sagt das.
- Betriebsansicht: EK → VK je Posten, Deckungsbeitrag, Stunden nach Rüstzeit, Vorarbeit,
  Folieren, Demontage; Speichern, Zusammenfassung kopieren.

## Was noch nicht drin ist (Reihenfolge nach Nutzen)

1. Foto-Upload + Lead-Formular direkt auf der Kundenseite (heute: WhatsApp-Link oder Kopieren).
2. Angebot aus Kalkulation: `result.lines` → Angebotspositionen mit `rate_key` je Element, damit
   `repositories/rates.py` die eigenen Preise lernt.
3. Terminvorschlag aus `hours.total` (1–3 Tage) in `/schedule`.
4. Zwei Dekore in einem Auftrag (Ober-/Unterschränke verschieden), Mehrpreis je Dekor statt je Familie.
5. Nesting verfeinern: Maserungsrichtung je Element (Schubladen quer), Reststücke über Bahnen hinweg nutzen (Guillotine statt Streifen), Export der Schnittliste als PDF/CSV für den Plotter.
6. Musterkarte bestellen (Preis, Versand) als vierter Weg.
7. Rabattstaffel ab 30 Fronten / Objektgeschäft, Tagespauschale, Mehrpersonen-Team.
8. Garantietext, AGB-Haken, Anzahlung (30 % bei Auftrag) in der Anfrage.
9. Vier Sprachen: das Modul ist absichtlich deutsch; `t()`-Schlüssel nur für die Nav gesetzt.
10. Entsorgung alter Fronten, Demontage Elektrogeräte, Scharnier-/Dämpfer-Upsell als Extras.
