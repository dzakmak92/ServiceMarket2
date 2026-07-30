# Estimation catalogue — DE/AT

A coefficient catalogue for predicting hours, material, debris and price from a
handful of survey answers. Deterministic, testable, offline, no sub-processor.

`backend/data/estimation_catalogue.json` is the data. `backend/tools/catalogue/`
is the model, the simulation harness and the validator that produced it.

## Design rules

**1. Time is the primitive, not price.** Every operation carries hours per unit.
Price falls out of the pro's own hourly rate. A catalogue of €/m² ages badly and
cannot be validated; a catalogue of h/m² is a physical claim that can be checked
against a stopwatch.

**2. Setup is separate from work.** Fixed hours per job that do not scale with
area — arrive, protect, carry tools, mask, clean. This is the single most
under-quoted item in the trade and the reason small jobs lose money.

**3. Uplifts are additive, never multiplicative.** The first model stacked
multipliers and produced a worst case 5.7× the best case. A tradesperson working
an occupied Altbau up a narrow stair is slower, not five times slower.

**4. Every job declares a market band it must land inside.** AT and DE
separately, sourced. A coefficient producing a price outside its band is wrong
and the harness fails it. Without this the catalogue is just plausible numbers.

**5. Debris is kilograms, not cubic metres.** For Bauschutt weight binds before
volume: 38 m² of Estrich is 3,750–5,438 kg but only 2.5–4.9 m³. Order by weight,
bill by tonne. Quoting by container size systematically underprices.

## Coverage

136 job types across all 20 groups in `business_directory`, tagged with `group`
and `segment` so a prospect and a template line up. 96 carry a guided form,
417 questions in total.

**Five groups are deepened; the rest are wide only.** All follow the same
shape, which is the template for every remaining trade: emergency, recurring,
project.

**Garten & Außenbereich.** 6 job types became 20, and it is the group where
the product's shape is least about a one-off quote. Most of the money is
recurring: mowing, edging, scarifying, leaf clearance, hedge trimming and
winter service are the same customer twelve or twenty times a year. Six job
types are that kind of work and every one is `messy=False`.

Setup dominates completely at the small end here. Mowing is 0.002 h/m²
against 0.4-0.8 h of travel and unloading, so a 150 m² lawn is almost entirely
setup — which is exactly why the trade quotes a minimum call-out and why a flat
€/m² rate loses money on every small garden. The catalogue produces that shape
without being told to.

Winterdienst is the clearest case in the catalogue of the contract being the
product rather than the price. The Räum- und Streupflicht sits with the owner
and is delegable by contract; that is what the customer is buying, and it is a
`high` note rather than a line item.

**Boden & Fliesen.** 6 job types became 20, and the group turned out to hold
two Gewerbe rather than one. Fliesenleger (AT 42-62 EUR/h) and Bodenleger
(AT 38-58) are now separate trades with separate rates; treating a floor layer
as a tiler had overstated every covering job by roughly a tenth.

The covering is not in the price, in either market. Every published
Verlegepreis is labour plus Verlegematerial — Kleber, Fuge, Trittschall — and
the tiles or planks are chosen and usually bought by the customer. Material
here is the consumables and a note says so, because folding in a guessed
30 EUR/m² for tiles would double the quote and put every entry outside its own
band.

Stairs exposed a flaw in how `total` bands validate. Checked at quantity one, a
staircase validates as a single step — a call-out price, roughly double the
per-step rate anyone quotes for a run of fourteen. It is `per_unit` with a
typical run of 3 to 16. Replacing a few broken tiles genuinely *is* a call-out,
and that one stays `total`.

**Maler.** 5 job types became 19 with 74 questions. The trade taught the
catalogue three things.

Published Maler bands include the scaffolding. The Fassade band was taken at
face value (18-44 AT) while the job was priced explicitly without Gerüst, and
that mismatch — not any coefficient — was the catalogue's one standing
validation failure for two revisions. The Gerüst entry in this same catalogue
is 6-14 EUR/m², so the two facade jobs now state bands net of it and the
estimate agrees with the note that says scaffolding is excluded.

The substrate is the whole job. A painter quoting per m² is quoting the coat;
what varies by a factor of four is what happens before it — nothing on new
plasterboard, a full strip and wash on five layers of painted-over Raufaser.
`untergrund` is asked on every surface job and moves the number more than any
other answer.

A colour change is not free. Dark to light is three coats, and it is the most
common argument on site. It is asked, priced, and produces a note.

**Elektrik.** 3 job types became 14 with 35 questions. Every job carries an
E-Befund note, because electrical work in existing fabric touches a legally
significant document and a quote silent about it leaves the pro carrying an
unpriced risk. Two questions do most of the work: the state of the existing
installation (klassische Nullung without a separate protective conductor is a
`critical` note — continued operation after an intervention is not permissible)
and, for a Wallbox, the distance from the distribution board, which is the
single largest cost driver. The rate was corrected from 55-85 to 62-110 EUR/h.

**Sanitär is the depth reference.** 20 job types with 43 survey questions,
covering the three shapes the trade actually sells: emergency call-outs
(Notdienst, Rohrreinigung — flagged `emergency_capable`, priced at the
Notdienst rate of 125-160 EUR/h rather than a surcharge on the normal one),
recurring maintenance (Thermenwartung, Dichtheitsprüfung), and projects
(Badsanierung). Every other trade should be deepened to this shape.

Two corrections came out of doing it. The hourly rate was 55-80 EUR when the
Austrian market is 68-112 — every Sanitär job had been understated by roughly
a quarter. And the condition setup allowance was being charged to service
calls: nobody masks a bathroom to unclog a sink, which had pushed a
thirty-minute Rohrreinigung to 202 EUR against an 80-180 band. Jobs now carry
a `messy` flag, and 25 of 80 do not attract protection and cleanup time.

Fahrzeuge — the largest group at 2,839 businesses — is deliberately shallow.
Vehicle repair is priced from manufacturer Arbeitswerte, 5-6 minute units
published per model through AUDATEX or DAT, not from area and condition. That
data is licensed and model-specific; a generic h/m2 catalogue cannot compete
with it and should not pretend to. Only the few genuinely model-independent
operations are included.

## Validation

272 of 272 job/country pairs land inside their published market band.

Getting to zero misses took restating a band, not tuning a coefficient. For two
revisions `maler.fassade` DE sat at €19.10 against a €20 floor and was written
off as a known scope mismatch — published Fassade prices include Gerüst and
this catalogue excludes it. That was the correct diagnosis and the wrong
response: the fix is to state the band for the scope actually being priced,
which is the published band less the 6-14 EUR/m² this catalogue itself charges
for Gerüst. The estimate had been right the whole time. A validation harness
that carries a permanent expected failure has stopped being a validation
harness, so the check now requires zero.

Bands are checked at **large** size on purpose. Published €/m² rates are averages
over typical, larger jobs where the contractor's setup is already amortised;
comparing a small-job estimate against them is apples to oranges. That gap is
not an error — it is the product's core insight.

## What 5,328 simulated scenarios showed

**The small-job premium is real and large.** Median ×1.27, up to ×2.09 for
mould remediation and ×1.68 for tile removal — the same work costs twice as
much per m² on a 2 m² patch as on a 15 m² wall.
Flat €/m² pricing under-recovers on 83% of scenarios.

**Site-visit necessity is declared, not derived — and the first version got
this wrong.** With 21 job types the hi/lo spread looked like a proxy for hidden
preconditions, and a 2.6× threshold produced a tidy rule. At 64 it collapsed:
the spread measures what share of the price is variable labour, not how hidden
the conditions are. Window cleaning topped the list at ×4.35 because it is
small and setup-dominated; a boiler swap looked certain at ×1.84 only because an
1,800-2,900 EUR appliance swamps the labour variance. Deriving the flag would
have sent a tradesperson to inspect a window and quote a Wärmepumpe blind.

`site_visit_required` is now an explicit list of 52 job types — concealed
build-up, concealed services, structural involvement, or a measurement that must
be exact before fabrication. The spread survives under an honest name,
`labour_variance`: how much of the price is variable labour, and therefore how
fast the job converges once `pro_rates` has real data.

**DE and AT differ by only ×1.04 in labour.** The meaningful differences are
fiscal — VAT rates, §35a deductibility, Kleinunternehmer thresholds — all of
which the tax layer already handles. One catalogue serves both markets.

**Bed type is the highest-value question in the survey.** Dünnbett versus
Dickbett roughly doubles both hours and debris, and it is answerable in ten
seconds by looking at a tile edge.

## Structure

    job type
      ├─ unit, typical size, market band (AT, DE), sources
      ├─ guided_form[]          the 4-8 taps that drive the estimate
      │    └─ key, type, options, affects, note_if
      ├─ messy                  does it attract protection/cleanup setup
      ├─ emergency_capable      sellable as a Notdienst call-out
      ├─ setup_hours            fixed, does not scale
      ├─ uncertainty_spread     derived → quote_mode fixed | regie
      ├─ small_job_premium      derived
      ├─ note_keys              trigger legal/scope notes
      └─ operations[]
           ├─ hours_per_unit          the physical claim
           ├─ material_per_unit + waste_factor
           ├─ debris_kg_per_unit
           └─ tier_min                basic | standard | premium

131 notes carry a severity, so a UI can rank them: an asbestos warning and a
note about who moves the furniture must not look alike.

## Honest limits

The coefficients are generic starting points calibrated against published bands,
not measurements of any particular business. They will be wrong for any specific
pro — a fast tiler beats them, a meticulous one does not. That is why the
feedback loop matters more than the catalogue: after ten jobs, comparing
estimated against actual `job_time_logs` and writing back to `pro_rates`
produces coefficients that describe *this* business. Nobody can copy that, and
it is the actual moat.

Coverage is uneven on purpose and the unevenness is the honest part. Three
groups are deep — Garten 20, Boden & Fliesen 20, Sanitär 20, Maler 19,
Elektrik 17 — and the other fifteen
are one to six job types each, enough to prove the structure and not enough to
cover the trade. A Fliesenleger does far more than six things.

Confidence is recorded per job because it is uneven. 18 high, 73 medium, 45 low.
The `low` entries — Pool, Wärmepumpe, Markise, Einbauschrank, Geländer, Sofa,
Gutachten, Flachdach, Rollladen, Fensterbank, Küchendemontage, Schädlings-
bekämpfung, KFZ-Service, the Maler entries WDVS, Strukturputz,
Bodenbeschichtung, Holzschutz, Risse and Fassadenreinigung, and most of the
new Garten work — are plausible trade knowledge that no published band
corroborates. The count went up, not down, with the last two trades: going
deep means reaching jobs that no price radar publishes, and saying so is the
point of the field. They must be checked with
a practising pro before they price anything real, and the field exists so that
gap is visible rather than hidden behind a uniform-looking table.

Seven notes are `critical` and exist to prevent harm rather than to price work:
asbestos in pre-1990 adhesives and coverings, load-bearing confirmation before
demolition, structural sign-off for openings, roof load before PV, buried
services before excavation, mould beyond 0.5 m², and felling a tree that
may be protected.

## What reads it

`backend/services/estimator.py` is the only consumer, and it reimplements
`tools/catalogue/engine.py` exactly. If the two drift, the band validation
stops saying anything about what the app actually quotes — so
`backend/tests/test_estimator.py` re-runs all 272 band checks through the
service rather than the authoring harness, and additionally proves the quote
positions sum back to the total they were derived from.

**Not every question changes the number.** The engine has one quantity axis per
job plus condition, access and Notdienst. Questions declared `affects="variant"`
— tile format, wallpaper pattern match, felling in a confined space — are
recorded and attach notes, but nothing in the arithmetic reads them. That is a
real limit and it is now reported rather than implied: every estimate returns
`answers_applied` and `answers_recorded` separately, and the screen prints
both.

Five notes had been written as though the variant *was* priced ("der Mehraufwand
ist berücksichtigt"). A note is a promise the pro forwards to a customer, so
those were the worst kind of wrong: not an inaccurate number but an
unenforceable commitment. They now say the work is quoted separately, and a
test refuses any note claiming inclusion unless the job's operations cover it.

The catalogue carries no `rate_key` and no prices, deliberately: it is a
physical model of hours, material and debris. The join to a business's own
pricing is made in the service by convention (`trade.operation` against
`pro_rates.key`), so a pro who corrects a rate once has it applied everywhere
that operation appears.
