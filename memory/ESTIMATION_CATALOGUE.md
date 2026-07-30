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

64 job types across all 20 groups in `business_directory`, tagged with `group`
and `segment` so a prospect and a template line up. 15,696 scenarios simulated.

Fahrzeuge — the largest group at 2,839 businesses — is deliberately shallow.
Vehicle repair is priced from manufacturer Arbeitswerte, 5-6 minute units
published per model through AUDATEX or DAT, not from area and condition. That
data is licensed and model-specific; a generic h/m2 catalogue cannot compete
with it and should not pretend to. Only the few genuinely model-independent
operations are included.

## Validation

127 of 128 job/country pairs land inside their published market band. The single failure — `maler.fassade` DE at €18.70
against a €20 floor — is a scope mismatch, not a bad coefficient: published
Fassade prices include Gerüst and this catalogue explicitly excludes it.

Bands are checked at **large** size on purpose. Published €/m² rates are averages
over typical, larger jobs where the contractor's setup is already amortised;
comparing a small-job estimate against them is apples to oranges. That gap is
not an error — it is the product's core insight.

## What 5,328 simulated scenarios showed

**The small-job premium is real and large.** Median ×1.27, up to ×1.68 for tile
removal — the same work costs 68% more per m² on a small floor than a large one.
Flat €/m² pricing under-recovers on 83% of scenarios.

**Site-visit necessity is declared, not derived — and the first version got
this wrong.** With 21 job types the hi/lo spread looked like a proxy for hidden
preconditions, and a 2.6× threshold produced a tidy rule. At 64 it collapsed:
the spread measures what share of the price is variable labour, not how hidden
the conditions are. Window cleaning topped the list at ×4.35 because it is
small and setup-dominated; a boiler swap looked certain at ×1.84 only because an
1,800-2,900 EUR appliance swamps the labour variance. Deriving the flag would
have sent a tradesperson to inspect a window and quote a Wärmepumpe blind.

`site_visit_required` is now an explicit list of 34 job types — concealed
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
      ├─ setup_hours            fixed, does not scale
      ├─ uncertainty_spread     derived → quote_mode fixed | regie
      ├─ small_job_premium      derived
      ├─ note_keys              trigger legal/scope notes
      └─ operations[]
           ├─ hours_per_unit          the physical claim
           ├─ material_per_unit + waste_factor
           ├─ debris_kg_per_unit
           └─ tier_min                basic | standard | premium

24 notes carry a severity. Two are `critical` and exist to prevent harm rather
than to price work: **asbestos in pre-1990 adhesives and floor coverings**
(TRGS 519 — a criminal-liability matter, not a pricing one) and **load-bearing
confirmation before demolition**.

## Honest limits

The coefficients are generic starting points calibrated against published bands,
not measurements of any particular business. They will be wrong for any specific
pro — a fast tiler beats them, a meticulous one does not. That is why the
feedback loop matters more than the catalogue: after ten jobs, comparing
estimated against actual `job_time_logs` and writing back to `pro_rates`
produces coefficients that describe *this* business. Nobody can copy that, and
it is the actual moat.

Coverage is wide, not deep: 64 job types is one to six per group, which proves
the structure and does not cover any trade completely. A Fliesenleger does far
more than six things.

Confidence is recorded per job because it is uneven. 1 high, 49 medium, 14 low.
The `low` entries — Pool, Wärmepumpe, Markise, Einbauschrank, Geländer, Sofa,
Gutachten, Flachdach, Rollladen, Fensterbank, Küchendemontage, Schädlings-
bekämpfung, KFZ-Service — are plausible trade knowledge that no published band
corroborates. They must be checked with a practising pro before they price
anything real, and the field exists so that gap is visible rather than hidden
behind a uniform-looking table.

Five notes are `critical` and exist to prevent harm rather than to price work:
asbestos in pre-1990 adhesives and coverings, load-bearing confirmation before
demolition, structural sign-off for openings, roof load before PV, and buried
services before excavation.
