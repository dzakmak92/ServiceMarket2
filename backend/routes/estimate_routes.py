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


async def _country_for(pro_id: str) -> str:
    """The country whose rates and disposal prices apply.

    The invoicing country, not a guess from a locale: it is the field the
    business already had to get right for VAT, so it is the one that is
    actually maintained.
    """
    c = await pg.fetchval("select invoice_country from pro_profiles where id = $1", pro_id)
    return c if c in ("AT", "DE") else "AT"


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
async def get_catalogue(user: dict = Depends(get_current_user)):
    """Shape of the catalogue — groups, trades, the shared answer vocabularies.

    Enough to build a picker without shipping 94 job types and 119 notes to a
    phone that only needs one of them.
    """
    await require_pro_id(user)
    return estimator.meta()


@router.get("/jobs")
async def list_jobs(trade: Optional[str] = None, group: Optional[str] = None,
                    q: Optional[str] = Query(default=None, description="Search label or key"),
                    lang: str = Query(default="de", pattern="^(de|en|tr|es)$"),
                    user: dict = Depends(get_current_user)):
    await require_pro_id(user)
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
