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

## Validation

29 of 30 per-unit job/country pairs land inside their published market band when
measured at large size. The single failure — `maler.fassade` DE at €18.70
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

**Uncertainty varies enormously, and predictably.** Jobs where you cannot see
inside the wall — Rohrbruch ×3.68, Steckdose ×3.27, Dickbett removal ×2.88 —
carry three times the spread of jobs where you can see everything, like painting
or laying new floor. This yields a hard rule:

> **11 of 21 job types exceed a 2.6× spread and must not be quoted fixed-price
> without a site visit.** They are marked `quote_mode: "regie"` in the JSON.

They are, without exception, demolition, plumbing repair and electrical work in
existing fabric. That is not a coincidence and it is defensible to a customer.

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

Coverage is 21 job types across six trades — enough to prove the model, not
enough to cover a trade completely. Sanitär and Elektrik in particular need
depth before launch.
