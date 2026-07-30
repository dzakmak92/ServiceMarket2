"""Smart estimation endpoints.

The catalogue (94 job types across 20 trades, DE and AT) becomes usable here:
browse it, fetch a job's guided form, answer four or five questions, get hours,
material, debris, disposal and a set of quote positions back.

Two things this deliberately is not.

It is **not a price oracle.** Every estimate carries its market band, its
confidence, and whether the job needs a site visit before anyone quotes it
fixed. 34 of the 94 job types are marked `regie` precisely because a remote
estimate on them is a guess; the endpoint returns a number for those too, but
it says so, and the UI is expected to.

It is **not a model call.** No LLM, no photos, no network. The same answers
give the same estimate on every request, which is what makes it safe to put in
front of a customer and what makes a wrong number diagnosable.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user
from db import pg
from repositories import quotes as quotes_repo
from routes._pro import require_pro_id
from services import estimator

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


class EstimateToQuoteIn(EstimateIn):
    job_id: str
    title: Optional[str] = None
    # Three tiers in one call. The doc's escape from pure price comparison:
    # a customer choosing between options is not a customer choosing the
    # cheapest of eight quotes.
    all_tiers: bool = False


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
                    user: dict = Depends(get_current_user)):
    await require_pro_id(user)
    found = estimator.jobs(trade=trade, group=group)
    if q:
        needle = q.strip().lower()
        found = [j for j in found
                 if needle in j["label_de"].lower() or needle in j["key"].lower()]
    return {
        "jobs": [{
            "key": j["key"], "trade": j["trade"], "label_de": j["label_de"],
            "unit": j["unit"], "group": j["group"], "segment": j["segment"],
            "typical_size": j["typical_size"], "confidence": j["confidence"],
            "site_visit_required": j["site_visit_required"],
            "quote_mode": j["quote_mode"],
            "emergency_capable": j["emergency_capable"],
            "question_count": len(j["guided_form"]),
        } for j in found],
        "total": len(found),
    }


@router.get("/jobs/{job_key}")
async def job_survey(job_key: str, user: dict = Depends(get_current_user)):
    """The guided form for one job, ready to render."""
    await require_pro_id(user)
    try:
        return estimator.survey(job_key)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("")
async def compute(body: EstimateIn, user: dict = Depends(get_current_user)):
    """Answers in, estimate out. Creates nothing."""
    pro_id = await require_pro_id(user)
    country = body.country or await _country_for(pro_id)
    rates = await _rates_for(pro_id) if body.use_own_rates else {}
    try:
        return estimator.estimate(body.job_key, body.answers, country=country,
                                  tier=body.tier, rates=rates)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/compare")
async def compare_tiers(body: EstimateIn, user: dict = Depends(get_current_user)):
    """The same job at all three tiers, from one set of answers."""
    pro_id = await require_pro_id(user)
    country = body.country or await _country_for(pro_id)
    rates = await _rates_for(pro_id) if body.use_own_rates else {}
    try:
        return {"tiers": {
            tier: estimator.estimate(body.job_key, body.answers, country=country,
                                     tier=tier, rates=rates)
            for tier in ("basic", "standard", "premium")
        }}
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/quote", status_code=201)
async def estimate_to_quote(body: EstimateToQuoteIn,
                            user: dict = Depends(get_current_user)):
    """Turn an estimate into a real quote on a job.

    The estimate's notes become the quote's assumptions, in full. They are the
    difference between an estimate and a fixed-price trap when the substrate
    turns out to be rotten, and a quote that dropped them would be worse than
    one built by hand.
    """
    pro_id = await require_pro_id(user)
    country = body.country or await _country_for(pro_id)
    rates = await _rates_for(pro_id) if body.use_own_rates else {}

    tiers = ("basic", "standard", "premium") if body.all_tiers else (body.tier,)
    try:
        results = {t: estimator.estimate(body.job_key, body.answers, country=country,
                                         tier=t, rates=rates) for t in tiers}
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc

    ref = results[tiers[-1]]
    fields = {
        "title": body.title or ref["job"]["label_de"],
        "assumptions": ref["assumptions"] or None,
        # Confidence travels with the document. A quote built from a `low`
        # entry should not look identical to one built from a corroborated
        # band once it is sitting in a list a week later. The column is
        # numeric, so the catalogue's three words map onto it.
        "ai_confidence": CONFIDENCE_SCORE.get(ref["job"]["confidence"]),
        "ai_sources": ["estimation_catalogue/" + estimator.catalogue()["version"],
                       ref["job"]["key"]],
    }

    try:
        if body.all_tiers:
            created = await quotes_repo.create_tiers(
                pro_id, body.job_id,
                {t: results[t]["lines"] for t in tiers}, **fields)
        else:
            created = [await quotes_repo.create(
                pro_id, body.job_id, lines=ref["lines"], tier=body.tier, **fields)]
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    return {"quotes": created, "estimate": ref}
