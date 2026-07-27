"""Global platform feature flags (single doc: platform_settings/{_id:'default'}).

Currently controls whether the Explorer 3-month intro plan is offered to NEW
tradespeople. When disabled, new pros skip the Explorer offer and choose Standard
or Pro directly. Pros already ON an active Explorer plan keep it until it expires.
"""
from database import db

_DOC_ID = "default"


async def get_settings() -> dict:
    doc = await db.platform_settings.find_one({"_id": _DOC_ID})
    return doc or {}


async def explorer_enabled() -> bool:
    doc = await db.platform_settings.find_one({"_id": _DOC_ID})
    if not doc:
        return True  # default: Explorer offer is live
    return bool(doc.get("explorer_enabled", True))


async def set_explorer_enabled(value: bool) -> None:
    await db.platform_settings.update_one(
        {"_id": _DOC_ID},
        {"$set": {"explorer_enabled": bool(value)}},
        upsert=True,
    )
