# Animated homepage — analysis and script

The public root today is the login screen. `App.js` puts `/` behind
`ProtectedRoute`, so a visitor who has never signed up is redirected to
`/auth` and meets a form. The split-screen hero on the left of that form is
the only marketing the product has, and it is static: a headline, three
bullets, a footer line.

This document is the script for replacing that with a homepage that shows the
product working instead of describing it.

---

## 1 · What the product actually does

Measured from the codebase on 2026-10-21, at `main`. Every figure here is
counted, not estimated. Nothing in the script may claim anything this section
cannot back.

### The catalogue

`backend/data/estimation_catalogue.json` holds **149 job types across 24
trades**, priced for **two countries (AT and DE)**.

| trade | jobs | trade | jobs | trade | jobs |
|---|---|---|---|---|---|
| Garten | 20 | Montage | 11 | Maurer | 3 |
| Sanitär | 20 | Reinigung | 9 | Tischler | 3 |
| Maler | 19 | Boden | 7 | Abriss, Küche, Umzug, Kfz | 2 each |
| Elektrik | 17 | Fenster, Dach, Heizung | 4 each | Trockenbau, Metallbau, Gerüst, Polster, Solar, Gutachter, Fahrrad | 1 each |
| Fliesen | 13 | | | | |

Each job carries a unit (`m2`, `lfm`, `Stk`, `h`, `psch`), a typical size
range, and a price band. Hourly rates are per trade *and* per country — Maler
38–55 €/h in AT, 35–60 in DE; Sanitär 68–112 AT, 68–115 DE. Five modifier
axes adjust the band: condition uplift, condition setup, access uplift, and
the two axis definitions behind them.

**55 of the 149 are flagged `site_visit_required`.** That is a feature, not a
gap, and the homepage should say so: the product refuses to quote a burst
pipe sight-unseen. Honesty about what cannot be estimated remotely is the
most credible thing on the page.

### The spine

A job runs `lead → quoted → accepted → scheduled → in_progress → completed`,
in one of three modes:

- **simple** — the Montage/emergency loop, project machinery hidden
- **project** — the full PM toolkit, tasks, phases, subcontractors
- **recurring** — a service contract that spawns visits (Garten, Wartung)

### Money

- Quotes: tiered variants, revise, send, accept, reject, reopen, convert to
  job, auto-expire stale, PDF.
- Change orders (**Nachtrag**) approved against a running job.
- Invoices: **Abschlagsrechnung** (interim), **Schlussrechnung** (final, which
  nets off prior payments), **Storno** (correction, carries a negative total).
  Issued invoices are immutable — a database trigger enforces it.
- Partial payments, payment state, overdue tracking, cashflow.
- A public pay link at `/pay/:token` the customer opens without an account.

### Tax

`backend/services/tax_rules.py`:

- **AT** 20 standard · 13 reduced-alt · 10 reduced. **DE** 19 · 7.
- Zero-rated treatments: Kleinunternehmer, **Reverse Charge §13b**,
  intra-EU, export.
- **§35a EStG** labour/material split printed on the invoice so a German
  private customer can claim the deduction.
- Exports: **USt-VA**, **EÜR**, **DATEV CSV** (and a full variant), revenue
  and expense CSVs, a year-end PDF, and a read-only **accountant share** link.

### Field work

`frontend/src/offline/queue.js` is a real IndexedDB write queue, not a
cache. Its two rules: only idempotent operations may be queued (every write
carries a client-chosen row id so a replay lands once), and order is
preserved (a failure stops the flush, because a later write may depend on an
earlier one). The comment names where this matters — "Sanitär cellars,
new-build sites, rural gardens."

### The rest

Four languages (de/en/tr/es). Rate learning: `pro_rates` closes the loop on
what this business actually charges, and `012` closed the time half —
predicted hours against measured hours from `job_time_logs`. Weather proxied
server-side so the pro's business coordinates are not handed to a third
party by every client. DSGVO: data export, erasure, a nightly purge cron.

### What the page may not claim

The current hero carries a comment worth repeating here verbatim in spirit:
the old copy advertised "50K+ verified pros, 200K+ jobs done, 4.8 average
rating" and "Trusted by 200K+ users". **None of those were measurements of
anything.** They were removed on purpose.

The animated homepage inherits that rule. No user counts, no ratings, no
"saves you X hours", no testimonials from people who do not exist, no logo
wall of companies that are not customers. Everything the page animates is a
real screen running real catalogue data. The product is the proof.

---

## 2 · The spine of the page

One claim, proven in the product's own order:

> **Every job, from enquiry to paid.**

The homepage is the `AUFTRAGSLAUF` grid unrolled into time. The six tiles on
the logged-in home — Kalkulation, Angebot, Auftrag, Projekt, Wartung,
Rechnung — are already the mental model the app teaches. The page animates
the same sequence, so the homepage and the first screen after signup agree
with each other.

Scroll is the transport. One pinned stage, six acts, each act advancing the
same job: **a Maler quoting an Altbau flat in Vienna.** The viewer watches one
job travel the whole way rather than six disconnected feature demos.

---

## 3 · The script

Timings are at 1× scroll speed on a desktop; each act is driven by scroll
progress, not a clock, so a fast scroller sees the same frames compressed.
Copy is given DE first (the launch language), EN beneath. TR and ES follow at
build time — standing policy is all four.

---

### Act 0 · The hero · 0–100 % of the first viewport

**On screen.** Cream (`#fdf3e3`). The ServiceMarket mark draws itself in
teal-deep, 600 ms. The headline sets in Bricolage Grotesque, by line:

> **Jeder Auftrag, von der Anfrage bis zur Zahlung.**
> *Every job, from enquiry to paid.*

Beneath it, the subline in ink-soft:

> **Das Büro für das österreichische und deutsche Handwerk.**
> *The back office for Austrian and German trades.*

**The motion.** To the right, the "Angebot in 90 Sek." dial from
`/estimate` draws its ring — the same component, same navy wedge, the green
arc sweeping from 12 o'clock. It is not a decoration lifted from the app; it
*is* the app's component, imported. The number in the hole counts 90 → 0 as
the ring closes, then holds at **90 Sek.**

**Why it opens here.** The dial is the product's one genuine promise with a
number attached, and the number is a design target of the estimator, not a
claim about users.

**CTA.** A teal pill, `Kostenlos starten` / *Start free*, and beneath it in
ink-muted, the honest footer that already exists: **Gehostet in der EU ·
DSGVO-konform**.

---

### Act 1 · Kalkulation · the trade becomes the control

**On screen.** The seven trade chips slide in from the right, staggered 40 ms
apart — Maler, Fliesen, Elektrik, Sanitär, Garten, Montage, Reinigung. Maler
fills navy (`#1e5490`). The dial behind them re-segments into the Maler
groups: Vorbereiten 5, Streichen 3, Tapezieren und verputzen 3, Lackieren 3,
Sanieren und beschichten 2, Fassade streichen und dämmen 5.

**The number that lands.** A counter rolls up beside it:

> **149 Leistungen. 24 Gewerke. Österreich und Deutschland.**
> *149 job types. 24 trades. Austria and Germany.*

**The motion.** The wedge count is read from the catalogue at build time, so
the figures on the homepage cannot drift from the catalogue the app ships.

---

### Act 2 · Die Zahl, die alles auslöst · the estimate fills in

The act that has to land. Everything before it is setup.

**On screen.** One template card opens — `Tapete entfernen`, 5–12 €/m². The
green block we ship in the card (`green-pos` at 20 %, `green-text` words)
sits under the title holding both fields, empty:

> **Menge in m² eintragen für den Preis**

**The motion, in order.**

1. A caret appears in the Menge field. `48` types in, digit by digit,
   90 ms apart.
2. The green block fades to white over 240 ms — the instruction has been
   answered, so it stops being an instruction.
3. The breakdown unfolds beneath, line by line, 80 ms apart: Arbeit,
   Material, Entsorgung (`psch`), each with its band.
4. The total counts up to its figure in `tabular-nums`, 600 ms,
   `cubic-bezier(.2,.8,.2,1)`.

**Copy over it.**

> **Eine Zahl eintippen. Das Angebot steht.**
> *Type one number. The quote is there.*

**Then the honesty beat, and it is the best moment on the page.** A second
card slides up — `Rohrbruch orten und reparieren`, unit `psch` — and instead
of a price it shows the red `Besichtigung` flag:

> **55 von 149 Leistungen schätzt die App nicht aus der Ferne. Ein Rohrbruch
> wird besichtigt, nicht geraten.**
> *55 of the 149 are not estimated remotely. A burst pipe gets a site visit,
> not a guess.*

---

### Act 3 · Zwei Länder, zwei Steuersysteme

**On screen.** The quote from Act 2, now with a VAT foot. A small AT/DE
toggle sits above it.

**The motion.** The toggle flips to DE. Every rate on the invoice re-renders
with a 180 ms number roll: **20 % → 19 %**. A reduced line goes **10 % → 7 %**.
Then a third state: the Kleinunternehmer switch turns on and the whole VAT
block collapses to **0 %**, replaced by its legal note.

**Copy.**

> **20 oder 19. 13, 10, 7 — oder gar keine.
> Reverse Charge §13b, Kleinunternehmer, innergemeinschaftlich, Export.**
> *20 or 19. 13, 10, 7 — or none at all.*

Then, as the §35a line prints itself onto the PDF preview:

> **Und der Lohnanteil nach §35a steht auf der Rechnung, damit Ihr Kunde ihn
> absetzen kann.**
> *And the §35a labour share is on the invoice, so your customer can claim it.*

---

### Act 4 · Kein Empfang, kein Problem

**On screen.** The job screen on a phone, in a cellar — the frame darkens
slightly, a signal indicator in the corner drops to nothing.

**The motion.**

1. The signal bars empty. A small amber chip appears: `Offline`.
2. Three field entries are made anyway — hours, a material, a photo. Each
   one lands in the list with a hollow ring instead of a tick, and a queue
   counter climbs 1 → 2 → 3.
3. The signal returns. The queue flushes **oldest first**, one entry at a
   time, 200 ms apart, each hollow ring filling to a solid teal tick.
4. The counter falls to 0 and the amber chip fades.

**Copy.**

> **Keller, Neubau, Garten — der Empfang bricht weg, die Erfassung nicht.
> Jeder Eintrag geht genau einmal durch, in der Reihenfolge, in der er
> entstanden ist.**
> *Cellars, new builds, gardens — the signal drops, the capture does not.
> Every entry lands exactly once, in the order it was made.*

That second sentence is the queue's actual contract, not a slogan. Worth
keeping precise: "exactly once, in order" is what the idempotency key and the
stop-on-failure flush buy, and a tradesperson who has lost a day's hours to a
flaky app will recognise the difference.

---

### Act 5 · Abschlag, Schluss, Storno

**On screen.** A three-document chain draws left to right.

**The motion.** The Abschlagsrechnung slides in and stamps `ausgestellt`. The
Schlussrechnung follows and visibly *subtracts* — the prior payment animates
out of the total as a struck line, the remainder counting down to the real
balance. Then a Storno drops in behind, carrying its negative total, and the
pair nets visibly to zero.

A lock icon closes over the issued invoice:

> **Ausgestellt heißt unveränderlich. Korrigiert wird mit einer Stornorechnung,
> nicht mit der Löschtaste.**
> *Issued means immutable. You correct it with a Storno, not the delete key.*

---

### Act 6 · Was am Jahresende übrig bleibt

**On screen.** The tax dashboard. USt-VA, EÜR, and a DATEV CSV fan out as
three cards.

**The motion.** The DATEV card tips forward and rows stream into it. Then an
accountant-share link mints itself — a URL assembling character by character —
and a small read-only badge settles beside it.

**Copy.**

> **USt-VA, EÜR, DATEV-Export. Und ein Lesezugriff für den Steuerberater,
> der kein Passwort braucht.**
> *USt-VA, EÜR, DATEV export. And read-only access for your accountant that
> needs no password.*

---

### Act 7 · Close

The six `AUFTRAGSLAUF` tiles assemble into their real grid — the exact
component from the logged-in home, column-first, counts at zero because this
is a new account.

> **So sieht Ihre Startseite am ersten Tag aus.**
> *This is your home screen on day one.*

Teal CTA, `Kostenlos starten`. Beneath it: **Gehostet in der EU ·
DSGVO-konform · Deutsch, English, Türkçe, Español.**

---

## 4 · Motion system

| | |
|---|---|
| easing | `cubic-bezier(.2,.8,.2,1)` for anything entering; `cubic-bezier(.4,0,.2,1)` for anything leaving |
| stagger | 40 ms chips, 80 ms list rows, 200 ms queue flush |
| number rolls | 600 ms, `tabular-nums`, never faster — a price that snaps looks like a glitch |
| act length | 2 viewport heights each; the pinned stage releases on the last frame |
| palette | tokens only, no new colours: `cream`, `paper`, `teal`, `teal-deep`, `navy`, `amber`, `green-pos`/`green-text`, `red-warn` |
| type | Bricolage Grotesque headings, Inter body — already loaded, no new webfont |

**`prefers-reduced-motion` is not optional and the repo currently honours it
nowhere** — `grep` finds no `motion-reduce`, no media query, in any of
`frontend/src` or the Tailwind config. This page is the wrong place to keep
that record. Under reduced motion every act renders at its **final frame**,
scroll-linked only for position: the estimate shows 48 m² and its total
already filled, the queue shows three ticks, the VAT foot shows 20 %. No
counting, no typing, no sweeping. The page must read completely with every
animation disabled, which is also how it will read to a crawler.

**Performance budget.** The homepage is the first thing a visitor downloads on
a phone on one bar. No animation library — the four existing keyframes plus
scroll-linked transforms get everything above. If a timeline tool becomes
unavoidable it is lazy-loaded below the hero, never in the critical bundle.
Compositor-only properties: `transform` and `opacity`. Nothing animates
`height`, `top`, or `box-shadow`.

---

## 5 · How it gets built

1. **Unprotect the root.** `/` stops being `ProtectedRoute` → `RoleHome`.
   Instead: signed in → `ProHomePage` as today; signed out → the new
   `HomePage`. The redirect to `/auth` stops being the public face.
   `AuthPage` keeps its split hero and stays exactly where it is for anyone
   arriving at `/auth` directly.
2. **Real components, not mockups.** The dial, the estimate card, the VAT
   foot and the `AUFTRAGSLAUF` grid are imported from the app with a `demo`
   prop that feeds them fixture data. A screenshot would rot within a week;
   an imported component cannot, because it breaks the build when it changes.
3. **Figures at build time.** Trade and job counts are read from
   `estimation_catalogue.json` by a small build step, the way `craco.config.js`
   already injects `REACT_APP_VERSION`. The page cannot drift from the
   catalogue.
4. **Four languages.** Every string lands in `translations/index.js` in
   de/en/tr/es in the same commit — standing policy, and the close line
   advertises it.
5. **Then SEO**, which the SPA currently has none of: a `<title>`, a
   description, OG tags, and prerendered markup for the hero so the first
   paint is not an empty `#root`.

---

## 6 · Open questions for you

1. **Length.** Seven acts is roughly four to five viewport heights of
   scrolling. I would rather cut than pad: Acts 2, 4 and 3 are the three that
   sell, in that order. Acts 5 and 6 could fold into one "nach dem Auftrag"
   act if you want it shorter.
2. **Pricing.** The page has no pricing section because the repo has no
   settled price. The seed grants an `explorer` plan with everything
   unlocked. Tell me the plans and I will write that act.
3. **Who it talks to.** The script is written for the tradesperson. If the
   homepage also has to talk to their customer — the person who receives the
   pay link — that is a second, shorter page, not another act on this one.
