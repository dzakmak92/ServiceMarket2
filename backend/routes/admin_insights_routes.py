"""Admin Insights — AI summary + categorisation of user feedback and reviews.

Aggregates recent platform feedback (feedback / feature / issue) and homeowner
reviews, then uses an LLM (gpt-5-mini via the Emergent universal key) to produce
a structured, categorised OVERVIEW for the admin: what users are missing, what's
broken, and nice-to-haves — purely summarised/interpreted (no prompt generation).

The latest analysis is cached in `db.admin_insights` so the admin sees it instantly
and can refresh on demand.
"""
from __future__ import annotations
import os
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import require_admin
from database import db

router = APIRouter(prefix="/admin/insights")

MODEL_PROVIDER = "openai"
MODEL_NAME = "gpt-5-mini"
_LATEST_ID = "latest"


def _serialise(doc: dict) -> dict:
    if not doc:
        return doc
    d = dict(doc)
    d.pop("_id", None)
    return d


async def _gather_inputs(max_each: int = 150) -> dict:
    feedback, reviews = [], []
    async for f in db.feedback.find({}).sort("created_at", -1).limit(max_each):
        feedback.append({
            "kind": f.get("kind"), "subject": f.get("subject", ""),
            "message": f.get("message", ""), "rating": f.get("rating"),
            "role": f.get("user_role", ""),
        })
    async for r in db.reviews.find({"is_hidden": {"$ne": True}}).sort("created_at", -1).limit(max_each):
        txt = (r.get("text") or "").strip()
        if txt or r.get("rating") is not None:
            reviews.append({"rating": r.get("rating"), "text": txt})
    return {"feedback": feedback, "reviews": reviews}


def _build_prompt(data: dict) -> str:
    fb_lines = []
    for f in data["feedback"]:
        rt = f"{f['rating']}★ " if f.get("rating") else ""
        fb_lines.append(f"- [{f.get('kind','feedback')}|{f.get('role','')}] {rt}{f.get('subject','')}: {f.get('message','')}")
    rv_lines = []
    for r in data["reviews"]:
        rt = f"{r['rating']}★ " if r.get("rating") is not None else ""
        rv_lines.append(f"- {rt}{r.get('text','')}")
    fb_block = "\n".join(fb_lines) or "(no feedback)"
    rv_block = "\n".join(rv_lines) or "(no reviews)"
    return (
        "You are a product analyst for a tradesperson marketplace (myhammer.de-style). "
        "Analyse the user FEEDBACK and REVIEWS below. Summarise and categorise them into a "
        "concise, actionable overview for the admin. Do NOT invent items that are not supported "
        "by the inputs. Estimate 'mentions' as how many distinct entries support each item.\n\n"
        "Return STRICT JSON only (no markdown), with this exact shape:\n"
        "{\n"
        '  "overview": "2-4 sentence executive summary of what users are saying",\n'
        '  "sentiment": {"positive": <int %>, "neutral": <int %>, "negative": <int %>},\n'
        '  "categories": {\n'
        '    "missing_features": [{"title": "", "detail": "", "mentions": <int>}],\n'
        '    "problems": [{"title": "", "detail": "", "mentions": <int>}],\n'
        '    "nice_to_have": [{"title": "", "detail": "", "mentions": <int>}],\n'
        '    "praise": [{"title": "", "detail": "", "mentions": <int>}]\n'
        "  },\n"
        '  "top_themes": ["short theme", "short theme"]\n'
        "}\n"
        "Order each list by mentions desc. Keep titles under 8 words and details under 25 words.\n\n"
        f"=== FEEDBACK ({len(data['feedback'])}) ===\n{fb_block}\n\n"
        f"=== REVIEWS ({len(data['reviews'])}) ===\n{rv_block}\n"
    )


def _parse_json(raw: str) -> dict:
    s = (raw or "").strip()
    if s.startswith("```"):
        s = s.split("```", 2)[1] if "```" in s[3:] else s.strip("`")
        if s.lstrip().lower().startswith("json"):
            s = s.lstrip()[4:]
    start, end = s.find("{"), s.rfind("}")
    if start != -1 and end != -1:
        s = s[start:end + 1]
    return json.loads(s)


@router.get("")
async def get_latest_insights(admin: dict = Depends(require_admin)):
    doc = await db.admin_insights.find_one({"_id": _LATEST_ID})
    fb_count = await db.feedback.count_documents({})
    rv_count = await db.reviews.count_documents({"is_hidden": {"$ne": True}})
    return {"analysis": _serialise(doc), "current_feedback_count": fb_count, "current_review_count": rv_count}


@router.post("/analyze")
async def analyze_insights(admin: dict = Depends(require_admin)):
    data = await _gather_inputs()
    if not data["feedback"] and not data["reviews"]:
        raise HTTPException(status_code=400, detail="No feedback or reviews to analyse yet.")

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=api_key,
            session_id=f"admin-insights-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            system_message="You are a precise product analyst. You only output valid JSON.",
        ).with_model(MODEL_PROVIDER, MODEL_NAME)
        raw = await chat.send_message(UserMessage(text=_build_prompt(data)))
        parsed = _parse_json(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="The analysis could not be parsed. Please try again.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Analysis failed: {str(e)[:200]}")

    doc = {
        "_id": _LATEST_ID,
        **parsed,
        "feedback_analysed": len(data["feedback"]),
        "reviews_analysed": len(data["reviews"]),
        "model": f"{MODEL_PROVIDER}/{MODEL_NAME}",
        "generated_at": datetime.now(timezone.utc),
        "generated_by": admin.get("email"),
    }
    await db.admin_insights.replace_one({"_id": _LATEST_ID}, doc, upsert=True)
    return _serialise(doc)
