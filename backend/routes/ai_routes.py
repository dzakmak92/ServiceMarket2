from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user
from models import AIClassifyRequest
from rate_limit import check_rate_limit
import os
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai")

# Keep in sync with seed categories
KNOWN_CATEGORIES = [
    "plumbing", "electrical", "painting", "home_cleaning", "handyman",
    "gardening", "carpentry", "hvac", "moving", "pest_control",
    "locksmith", "appliance_repair", "tiling", "flooring"
]

SYSTEM_PROMPT = (
    "You are a category classifier for a home-service marketplace. "
    "Given a homeowner's free-text job description, identify exactly ONE category "
    "from the allowed list. The description may be in English, German, Turkish or Spanish.\n\n"
    f"Allowed categories (use the exact slug): {', '.join(KNOWN_CATEGORIES)}\n\n"
    "Respond ONLY with a strict JSON object:\n"
    '{"category": "<slug>", "confidence": <0..1>, "reason": "<short reason>"}\n'
    "If nothing fits, use 'handyman' as a safe fallback."
)


@router.post("/classify-job")
async def classify_job(data: AIClassifyRequest, user: dict = Depends(get_current_user)):
    if user["role"] != "homeowner":
        raise HTTPException(status_code=403, detail="Only homeowners can classify")

    # Rate-limit: 20 calls/hour per user — generous enough for normal typing/debounce,
    # tight enough to keep LLM cost predictable.
    check_rate_limit(f"ai_classify:{user['_id']}", limit=20, window_seconds=3600)

    text = (data.title or "").strip()
    if data.description:
        text = f"{text}\n\n{data.description}".strip()
    if len(text) < 8:
        raise HTTPException(status_code=400, detail="Description too short")

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        chat = (
            LlmChat(
                api_key=api_key,
                session_id=f"classify-{user['_id']}",
                system_message=SYSTEM_PROMPT,
            )
            .with_model("anthropic", "claude-haiku-4-5-20251001")
        )
        reply = await chat.send_message(UserMessage(text=text))

        # Parse JSON out of the reply (strip code fences if present)
        clean = reply.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
            clean = clean.strip()
        parsed = json.loads(clean)
        cat = parsed.get("category", "handyman")
        if cat not in KNOWN_CATEGORIES:
            cat = "handyman"
        return {
            "category": cat,
            "confidence": float(parsed.get("confidence", 0.6)),
            "reason": parsed.get("reason", ""),
        }
    except json.JSONDecodeError:
        logger.exception("AI returned non-JSON")
        return {"category": "handyman", "confidence": 0.3, "reason": "fallback"}
    except Exception as e:
        logger.exception("AI classify failed")
        raise HTTPException(status_code=500, detail=f"Classification failed: {e}")
