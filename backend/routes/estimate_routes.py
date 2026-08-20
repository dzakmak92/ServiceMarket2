"""Smart estimation endpoints.

The catalogue (136 job types across 20 groups, DE and AT) becomes usable here:
browse it, fetch a job's guided form, answer four or five questions, get hours,
material, debris, disposal and a set of quote positions back — and, once the
business has finished a few of them, an estimate corrected by its own measured
speed rather than the trade average.

Two things this deliberately is not.

It is **not a price oracle.** Every estimate carries its market band, its
confidence, and whether the job needs a site visit before anyone quotes it
fixed. 52 of the 136 job types are marked `regie` precisely because a remote
estimate on them is a guess; the endpoint returns a number for those too, but
it says so, and the UI is expected to.

It is **not a model call.** No LLM, no photos, no network. The same answers
give the same estimate on every request, which is what makes it safe to put in
front of a customer and what makes a wrong number diagnosable.

The feedback endpoints — /save, /accuracy, /calibrate — are what stop the
catalogue being a permanent cold start. A generic model of the trade is
copyable in a week; a year of one business's own hours is not.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user
from db import pg
from repositories import estimates as estimates_repo
from repositories import jobs as jobs_repo
from repositories import quotes as quotes_repo
from routes._pro import require_pro_id
from services import calibration as calib
from services import catalogue_ui
from services import catalogue_i18n
from services import estimate_breakdown
from services import estimator
from services import tax_rules

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/estimate", tags=["estimate"])

TIER_PATTERN = "^(basic|standard|premium)$"
COUNTRY_PATTERN = "^(AT|DE)$"

# quotes.ai_confidence is numeric(4,3); the catalogue grades confidence in
# words. These are the words' intended weight, not a measurement: "low" means
# a placeholder nobody has checked with a practising pro yet.
CONFIDENCE_SCORE = {"high": 0.850, "medium": 0.600, "low": 0.350}


class EstimateIn(BaseModel):
    job_key: str
    answers: dict[str, Any] = Field(default_factory=dict)
    tier: str = Field(default="standard", pattern=TIER_PATTERN)
    country: Optional[str] = Field(default=None, pattern=COUNTRY_PATTERN)
    # When false the business's learned rates are ignored — useful for showing
    # a pro what the catalogue alone says versus what their own pricing does.
    use_own_rates: bool = True
    # Same, for the speed correction learned from finished jobs.
    use_calibration: bool = True
    # The pro's own hourly rate for this estimate. One figure, not a range:
    # a business that knows its rate knows one number, and the spread that
    # remains comes from the hours, which is where the real uncertainty is.
    # Bounded rather than trusted — a stray keystroke should not produce a
    # five-figure quote — and rejected as a range error rather than clamped
    # silently.
    hourly_rate: Optional[float] = Field(default=None, gt=0, le=1000)
    # Per-position quantity corrections, keyed by rate key. See
    # `estimator.estimate`.
    qty_overrides: dict[str, float] = Field(default_factory=dict)


class SaveEstimateIn(EstimateIn):
    # Optional: the guided form is often filled in before the job exists, and
    # an estimate with no job is still evidence about how this business prices.
    job_id: Optional[str] = None


class EstimateToQuoteIn(EstimateIn):
    # Optional. A quote is what you send *before* there is work — the job is
    # what acceptance creates, not what quoting requires. Making the pro pick
    # an existing job first put the sequence backwards and, on a new enquiry,
    # made quoting impossible until they had invented a job to attach it to.
    #
    # `quotes.job_id` stays `not null`: the job is the spine every quote,
    # invoice and appointment hangs from, and making it nullable would put a
    # branch in every one of those queries. Instead the job is created here,
    # as a `lead`, from what the estimate already knows. That is the state the
    # ladder starts at, and `lead -> quoted -> accepted` then runs as it
    # always has.
    job_id: Optional[str] = None
    # Optional customer for the job created above. Without one the quote
    # carries no tax context beyond the business's own, which is the same
    # position a quote written for an unknown enquirer has always been in.
    customer_id: Optional[str] = None
    title: Optional[str] = None
    # Three tiers in one call. The doc's escape from pure price comparison:
    # a customer choosing between options is not a customer choosing the
    # cheapest of eight quotes.
    all_tiers: bool = False
    # The language of the *document*, which is a different question from the
    # language of the screen. On /estimate, `lang` is a query parameter and
    # means "render this for me"; here it is a field on the body, because what
    # is written into `quotes` and `quote_lines` is what the customer will
    # receive and what both sides are held to. It defaults to German, so a pro
    # who never touches it produces exactly the document they produced before.
    lang: str = Field(default="de", pattern="^(de|en|tr|es)$")


class PositionIn(BaseModel):
    """One line of a multi-position quote: a job type and its answers.

    Deliberately not the whole of `EstimateIn`. Country, own-rates, calibration
    and language are properties of the *quote*, not of a position within it — a
    quote cannot be half in Austria, and a pro cannot want their learned rates
    applied to the painting and not to the tiling. Those stay on the parent so
    they cannot disagree between lines.
    """
    job_key: str
    answers: dict[str, Any] = Field(default_factory=dict)
    tier: str = Field(default="standard", pattern=TIER_PATTERN)
    hourly_rate: Optional[float] = Field(default=None, gt=0, le=1000)
    qty_overrides: dict[str, float] = Field(default_factory=dict)


class MultiQuoteIn(BaseModel):
    """Several priced positions, one quote.

    The single-position endpoint stays: it is what the estimate screen calls
    while a pro works through one job type, and every existing caller uses it.
    This is the shape the new picker needs, where several templates are ticked
    on one screen and become several lines of the same document — a bathroom is
    tiling *and* plumbing *and* painting, and quoting it as three separate
    documents is something no tradesperson would do by hand.
    """
    positions: list[PositionIn] = Field(min_length=1, max_length=40)
    country: Optional[str] = Field(default=None, pattern=COUNTRY_PATTERN)
    use_own_rates: bool = True
    use_calibration: bool = True
    job_id: Optional[str] = None
    customer_id: Optional[str] = None
    title: Optional[str] = None
    lang: str = Field(default="de", pattern="^(de|en|tr|es)$")
    # A Nachlass on the document, which is what `quotes.discount_pct` already
    # is: it prints as its own row under the positions, carries across to the
    # invoice when the quote is accepted, and is applied per VAT rate rather
    # than to the gross, so a mixed 20/10 document stays right. Zero is stored
    # as nothing at all — a quote with "0 % Nachlass" printed on it invites the
    # question of why it is there.
    discount_pct: float = Field(default=0, ge=0, le=100)


async def _country_for(pro_id: str) -> str:
    """The country whose rates and disposal prices apply.

    The invoicing country, not a guess from a locale: it is the field the
    business already had to get right for VAT, so it is the one that is
    actually maintained.
    """
    c = await pg.fetchval("select invoice_country from pro_profiles where id = $1", pro_id)
    return c if c in ("AT", "DE") else "AT"


async def _own_vat(pro_id: str) -> dict[str, Any]:
    """The rate this pro charges on their own account.

    Only the supplier half of the tax context is known here. The estimator runs
    before a customer is chosen, so reverse charge, intra-EU and export cannot
    be decided yet — those are resolved when the quote is created, against the
    customer. What *is* decidable is the part that matters for the number on
    the card: a Kleinunternehmer charges nothing, and everybody else charges
    their country's standard rate.

    It is returned rather than assumed because assuming 20 % is wrong for a
    large share of exactly this app's users. `final` says whether the customer
    could still change it, so the screen can be honest about that.
    """
    row = await pg.fetchrow(
        "select invoice_country, is_kleinunternehmer from pro_profiles where id = $1", pro_id)
    country = (row or {}).get("invoice_country")
    country = country if country in ("AT", "DE") else "AT"
    klein = bool((row or {}).get("is_kleinunternehmer"))
    treatment = "kleinunternehmer" if klein else "standard"
    return {
        "rate": tax_rules.vat_rate(treatment, country),
        "treatment": treatment,
        "country": country,
        # A Kleinunternehmer charges nothing to anybody; for everyone else the
        # customer can still move the line to reverse charge or intra-EU.
        "final": klein,
    }


async def _rates_for(pro_id: str) -> dict[str, float]:
    rows = await pg.fetch("select key, amount from pro_rates where pro_id = $1", pro_id)
    return {r["key"]: float(r["amount"]) for r in rows}


async def _calibration_for(pro_id: str, job_key: str, use: bool) -> Optional[dict]:
    """The speed correction this business's own finished jobs have earned.

    Absent until there are enough of them, which is deliberate: a factor built
    from two jobs would move prices on the strength of an anecdote, and the
    pro would have no way to tell it had happened.
    """
    if not use:
        return None
    job = estimator.get_job(job_key)
    if not job:
        return None
    return calib.pick(await estimates_repo.calibrations(pro_id),
                      job_key=job_key, trade=job["trade"])


async def _estimate(pro_id: str, body: "EstimateIn", *, tier: Optional[str] = None) -> dict:
    country = body.country or await _country_for(pro_id)
    rates = await _rates_for(pro_id) if body.use_own_rates else {}
    cal = await _calibration_for(pro_id, body.job_key, body.use_calibration)
    kw = {"country": country, "tier": tier or body.tier, "rates": rates,
          "calibration": cal}
    if body.hourly_rate:
        kw["hourly"] = (body.hourly_rate, body.hourly_rate)
    # In `kw`, not passed separately, so the breakdown below runs with the same
    # corrections. It reruns the estimator to build the tally, and a tally that
    # did not carry the pro's own quantities would stop adding up to the figure
    # in the header — the one property that makes a breakdown worth printing.
    if body.qty_overrides:
        kw["qty_overrides"] = body.qty_overrides
    result = estimator.estimate(body.job_key, body.answers, **kw)
    if cal:
        result["calibration_note"] = calib.explain(cal)

    # How it adds up, and what the other options would cost. Computed by
    # running the estimator again rather than by re-deriving its arithmetic —
    # a breakdown that models the pricing separately drifts from it. Eight
    # extra runs at 0.044 ms each.
    try:
        survey = estimator.survey(body.job_key)
        result["breakdown"] = estimate_breakdown.build(
            body.job_key, body.answers, result.get("answers_applied") or [],
            survey.get("form") or [], **kw)
    except Exception:
        # A missing breakdown must never cost the pro their estimate.
        logger.exception("breakdown failed for %s", body.job_key)
        result["breakdown"] = None
    return result


@router.get("/catalogue")
async def get_catalogue(lang: str = Query(default="de", pattern="^(de|en|tr|es)$"),
                        user: dict = Depends(get_current_user)):
    """Shape of the catalogue — groups, trades, the shared answer vocabularies.

    Enough to build a picker without shipping 94 job types and 119 notes to a
    phone that only needs one of them.

    `lang` is not optional in practice. Without it this route answered in German
    whatever the interface was set to, and the trade grid — the estimator's
    first screen — read *Maler · Fliesen · Sanitär* under an English heading.
    """
    pro_id = await require_pro_id(user)
    out = estimator.meta(lang)
    out["vat"] = await _own_vat(pro_id)
    return out


@router.get("/jobs")
async def list_jobs(trade: Optional[str] = None, group: Optional[str] = None,
                    q: Optional[str] = Query(default=None, description="Search label or key"),
                    lang: str = Query(default="de", pattern="^(de|en|tr|es)$"),
                    user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    # The band is a price and prices differ by country, so it cannot be added
    # to this list without knowing which one — the same invoicing country the
    # estimate itself is computed against, not a guess from a locale.
    country = await _country_for(pro_id)
    found = estimator.jobs(trade=trade, group=group)
    if q:
        # Searched against both languages: a Turkish-speaking pro types what
        # the screen showed them, and the screen showed them the translation.
        needle = q.strip().lower()
        found = [j for j in found
                 if needle in j["label_de"].lower() or needle in j["key"].lower()
                 or needle in catalogue_i18n.translate(j["label_de"], lang).lower()]
    rows = [{
        "key": j["key"], "trade": j["trade"], "label_de": j["label_de"],
        "label": catalogue_i18n.translate(j["label_de"], lang),
        "unit": j["unit"], "group": j["group"], "segment": j["segment"],
        "typical_size": j["typical_size"], "confidence": j["confidence"],
        "site_visit_required": j["site_visit_required"],
        "quote_mode": j["quote_mode"],
        "emergency_capable": j["emergency_capable"],
        "question_count": len(j["guided_form"]),
        # What the trade charges for this, per unit or as a total. The list
        # showed `typical_size` and nothing else, so a row read "25–90 m2" —
        # a size where a pro scanning for work worth doing expects a price.
        "market_band": list(j["market_band_at"] if country == "AT" else j["market_band_de"]),
        "band_basis": j["band_basis"],
    } for j in found]

    # How to chunk the list, when there is enough of it to be worth chunking.
    # `group` cannot do this — every Maler template carries the same group,
    # "Maler & Tapezierer", so grouping by it yields one heading over all 19.
    # Absent for a search (the result set is already the answer) and for the
    # seventeen trades with fewer than ten templates.
    sections = None
    if trade and not q:
        sections = catalogue_ui.sections_for(trade, [r["key"] for r in rows])
    return {"jobs": rows, "total": len(rows), "sections": sections}


@router.get("/jobs/{job_key}")
async def job_survey(job_key: str, lang: str = Query(default="de", pattern="^(de|en|tr|es)$"),
                     user: dict = Depends(get_current_user)):
    """The guided form for one job, ready to render.

    Each question gains a help line and a `price_effect`. There was a time when
    five questions looked like five levers and two of them were; most of the
    form now reaches the total, and `price_effect` is derived from what each
    question actually does to it rather than from how it is declared, so the
    label cannot go stale the next time a question is priced or unpriced.
    """
    await require_pro_id(user)
    try:
        out = dict(estimator.survey(job_key))
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    out["form"] = [catalogue_ui.decorate_question(q, lang) for q in out.get("form") or []]
    # The questions were translated and the heading above them was not: the
    # form asked "Alanın durumu" under the title "Rasen mähen (pro Einsatz)".
    # Same for the notes the job always carries, which are the first thing a
    # pro reads on an unfamiliar template.
    out["job"] = {**out["job"],
                  "label": catalogue_i18n.translate(out["job"]["label_de"], lang)}
    out["always_notes"] = [{**n, "text": catalogue_i18n.translate(n["de"], lang)}
                           for n in out.get("always_notes") or []]
    return out


LANG_QUERY = Query(default="de", pattern="^(de|en|tr|es)$")


@router.post("")
async def compute(body: EstimateIn, lang: str = LANG_QUERY,
                  user: dict = Depends(get_current_user)):
    """Answers in, estimate out. Creates nothing.

    Deliberately does not store the estimate: the screen recalculates on every
    keystroke, and saving here would write a row per digit typed. Storing is an
    explicit act — /save, or creating a quote.

    `lang` renders the text and nothing else. The arithmetic never sees it: the
    same answers give the same total in all four languages, which is the whole
    reason translation happens here and not in the estimator.
    """
    pro_id = await require_pro_id(user)
    try:
        return catalogue_ui.localise_estimate(await _estimate(pro_id, body), lang)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/compare")
async def compare_tiers(body: EstimateIn, lang: str = LANG_QUERY,
                        user: dict = Depends(get_current_user)):
    """The same job at all three tiers, from one set of answers."""
    pro_id = await require_pro_id(user)
    try:
        return {"tiers": {
            t: catalogue_ui.localise_estimate(await _estimate(pro_id, body, tier=t), lang)
            for t in ("basic", "standard", "premium")}}
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/save", status_code=201)
async def save_estimate(body: SaveEstimateIn, lang: str = LANG_QUERY,
                        user: dict = Depends(get_current_user)):
    """Keep an estimate without turning it into a quote.

    Worth its own endpoint because a job that was calculated and not quoted is
    real evidence. Learning only from work that was won would bias the model
    toward the jobs that were cheap enough to win.

    What is stored is the German estimate, whatever `lang` says. The stored row
    is evidence about how this business prices — it is read back by the
    calibration, compared against other rows and exported — and a table whose
    rows are in whichever language the pro happened to have selected that
    afternoon is a table you cannot group by. The response is localised; the
    record is not.
    """
    pro_id = await require_pro_id(user)
    try:
        result = await _estimate(pro_id, body)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    row = await estimates_repo.save(
        pro_id, result, job_id=body.job_id,
        calibration_applied=(result.get("calibration") or {}).get("hours_factor"))
    return {"estimate_id": str(row["id"]),
            "estimate": catalogue_ui.localise_estimate(result, lang)}


@router.get("/accuracy")
async def accuracy(user: dict = Depends(get_current_user)):
    """Predicted against measured, per job, plus what an hour actually earned.

    The last number is the one almost no small business computes for itself:
    quoted labour divided by the hours the work really took. It is usually
    well below the rate they believe they charge, and the gap is the argument
    for the whole product.
    """
    pro_id = await require_pro_id(user)
    data = await estimates_repo.accuracy(pro_id)
    data["calibrations"] = list((await estimates_repo.calibrations(pro_id)).values())
    data["min_samples"] = calib.MIN_SAMPLES
    return data


@router.post("/calibrate")
async def calibrate(user: dict = Depends(get_current_user)):
    """Rebuild every calibration for this business from its finished jobs.

    Rebuilt from scratch rather than updated incrementally, so correcting one
    bad timer entry actually fixes the number instead of leaving it baked in.
    """
    pro_id = await require_pro_id(user)
    return await estimates_repo.recompute(pro_id)


@router.post("/quote", status_code=201)
async def estimate_to_quote(body: EstimateToQuoteIn,
                            user: dict = Depends(get_current_user)):
    """Turn an estimate into a real quote on a job.

    The estimate's notes become the quote's assumptions, in full. They are the
    difference between an estimate and a fixed-price trap when the substrate
    turns out to be rotten, and a quote that dropped them would be worse than
    one built by hand.

    They are also the reason `body.lang` reaches the stored rows rather than
    only the response. An assumption the customer cannot read is not an
    assumption they agreed to: "Gerüst ist bauseits beizustellen" in front of a
    customer who reads only English says nothing about who pays for the
    scaffolding. So when a language is asked for, the positions and the
    assumptions are written in it — the quote is the document, and the document
    has one language.
    """
    pro_id = await require_pro_id(user)
    tiers = ("basic", "standard", "premium") if body.all_tiers else (body.tier,)
    try:
        results = {t: catalogue_ui.localise_estimate(
            await _estimate(pro_id, body, tier=t), body.lang) for t in tiers}
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc

    ref = results[tiers[-1]]
    # The job title too. `label_de` is still on the payload, so falling back to
    # it keeps a German quote byte-identical to what this endpoint built before.
    job_title = ref["job"].get("label") or ref["job"]["label_de"]

    # No job named? Make one, from what the calculation already knows. It is a
    # lead until the quote is sent, which is exactly what it is.
    job_id = body.job_id
    created_job = None
    if not job_id:
        created_job = await jobs_repo.create(pro_id, {
            "title": body.title or job_title,
            "category": ref["job"]["trade"],
            "customer_id": body.customer_id,
            "mode": "simple",
            "source": "manual",
        })
        job_id = str(created_job["id"])
    fields = {
        "title": body.title or job_title,
        "assumptions": ref["assumptions"] or None,
        # Confidence travels with the document. A quote built from a `low`
        # entry should not look identical to one built from a corroborated
        # band once it is sitting in a list a week later. The column is
        # numeric, so the catalogue's three words map onto it.
        "ai_confidence": CONFIDENCE_SCORE.get(ref["job"]["confidence"]),
        # str(): the catalogue stamps its version as an integer, and
        # concatenating it raised TypeError on every single call — this
        # endpoint had never once succeeded.
        "ai_sources": [f"estimation_catalogue/{estimator.catalogue()['version']}",
                       ref["job"]["key"]],
    }

    try:
        if body.all_tiers:
            created = await quotes_repo.create_tiers(
                pro_id, job_id,
                {t: results[t]["lines"] for t in tiers}, **fields)
        else:
            created = [await quotes_repo.create(
                pro_id, job_id, lines=ref["lines"], tier=body.tier, **fields)]
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    # Freeze what was predicted, against the tier that was actually quoted.
    # Without this there is nothing to compare the measured hours against
    # later: the catalogue moves, the pro's rates move, and "what did we say
    # in March" stops being answerable. Storing it is the entire point of the
    # loop, so a failure here must not lose the quote the pro just created —
    # they can recalculate an estimate, they cannot recover a lost document.
    quoted = results[body.tier] if body.tier in results else ref
    estimate_id = None
    try:
        row = await estimates_repo.save(
            pro_id, quoted, job_id=job_id, quote_id=str(created[0]["id"]),
            calibration_applied=(quoted.get("calibration") or {}).get("hours_factor"))
        estimate_id = str(row["id"])
    except Exception as exc:  # noqa: BLE001 — the quote is the deliverable
        logger.error("estimate snapshot not stored for quote %s: %s",
                     created[0]["id"], exc)

    return {"quotes": created, "estimate": ref, "estimate_id": estimate_id,
            "job_id": job_id, "job_created": created_job is not None}


@router.post("/quote/multi", status_code=201)
async def multi_position_quote(body: MultiQuoteIn,
                               user: dict = Depends(get_current_user)):
    """Several priced positions, one quote.

    Each position is estimated on its own — same arithmetic, same catalogue,
    same guardrails as the single-position endpoint, because it is literally
    the same `estimator.estimate` call. Nothing here reprices anything: this
    concatenates lines and joins assumptions.

    Two decisions worth stating, because both could reasonably have gone the
    other way:

    **The assumptions are merged and deduplicated.** Six positions on one
    bathroom carry the same "Möbel werden bauseits ausgeräumt" six times, and
    a quote that says it six times reads as a document nobody proofread. First
    occurrence wins so the order still follows the positions.

    **Confidence is the lowest of the positions, not the average.** A quote
    that is 90 % solid and 10 % guesswork is a quote with guesswork in it, and
    averaging would hide exactly the position that needs the site visit.
    """
    pro_id = await require_pro_id(user)
    if not body.positions:
        raise HTTPException(400, "at least one position is required")

    country = body.country or await _country_for(pro_id)
    rates = await _rates_for(pro_id) if body.use_own_rates else {}

    results = []
    for pos in body.positions:
        cal = await _calibration_for(pro_id, pos.job_key, body.use_calibration)
        kw = {"country": country, "tier": pos.tier, "rates": rates, "calibration": cal}
        if pos.hourly_rate:
            kw["hourly"] = (pos.hourly_rate, pos.hourly_rate)
        if pos.qty_overrides:
            kw["qty_overrides"] = pos.qty_overrides
        try:
            results.append(estimator.estimate(pos.job_key, pos.answers, **kw))
        except LookupError as exc:
            raise HTTPException(404, f"{pos.job_key}: {exc}") from exc

    localised = [catalogue_ui.localise_estimate(r, body.lang) for r in results]

    lines = []
    for r in localised:
        lines.extend(r["lines"])
    # `position` is 1..n within each estimate, so concatenating produces six
    # lines numbered 1 and the quote renders them in whatever order the
    # database returns. Renumbered across the whole document.
    for i, ln in enumerate(lines, start=1):
        ln["position"] = i

    seen: set[str] = set()
    assumptions = []
    for r in localised:
        for note in (r["assumptions"] or "").split("\n"):
            if note and note not in seen:
                seen.add(note)
                assumptions.append(note)

    ref = localised[0]
    title = body.title or (ref["job"].get("label") or ref["job"]["label_de"])
    if len(localised) > 1:
        title = body.title or f"{title} + {len(localised) - 1}"

    job_id = body.job_id
    created_job = None
    if not job_id:
        created_job = await jobs_repo.create(pro_id, {
            "title": title,
            "category": ref["job"]["trade"],
            "customer_id": body.customer_id,
            "mode": "simple",
            "source": "manual",
        })
        job_id = str(created_job["id"])

    worst = min((CONFIDENCE_SCORE.get(r["job"]["confidence"], 0.35) for r in localised),
                default=0.35)
    try:
        created = [await quotes_repo.create(
            pro_id, job_id, lines=lines, tier=body.positions[0].tier,
            title=title,
            assumptions="\n".join(assumptions) or None,
            ai_confidence=worst,
            discount_pct=body.discount_pct or None,
            ai_sources=[f"estimation_catalogue/{estimator.catalogue()['version']}"]
                       + [r["job"]["key"] for r in localised])]
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    # One snapshot per position, all pointing at the same quote. The accuracy
    # loop compares predicted against measured *per job type*; storing the
    # merged document would make six job types indistinguishable and teach the
    # calibration nothing.
    estimate_ids = []
    for r in results:
        try:
            row = await estimates_repo.save(
                pro_id, r, job_id=job_id, quote_id=str(created[0]["id"]),
                calibration_applied=(r.get("calibration") or {}).get("hours_factor"))
            estimate_ids.append(str(row["id"]))
        except Exception as exc:  # noqa: BLE001 — the quote is the deliverable
            logger.error("estimate snapshot not stored for quote %s (%s): %s",
                         created[0]["id"], r["job"]["key"], exc)

    total = [round(sum(r["total_net"][0] for r in localised), 2),
             round(sum(r["total_net"][1] for r in localised), 2)]
    return {"quotes": created, "positions": localised, "total_net": total,
            "estimate_ids": estimate_ids, "job_id": job_id,
            "job_created": created_job is not None}
