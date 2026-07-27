from bson import ObjectId
from datetime import datetime


def serialize_doc(doc: dict) -> dict:
    if not doc:
        return None
    result = {}
    for k, v in doc.items():
        if k == "_id":
            sid = str(v)
            result["id"] = sid
            result["_id"] = sid
        elif isinstance(v, ObjectId):
            result[k] = str(v)
        elif isinstance(v, datetime):
            result[k] = v.isoformat()
        elif isinstance(v, list):
            result[k] = [
                serialize_doc(i) if isinstance(i, dict)
                else (str(i) if isinstance(i, ObjectId) else i)
                for i in v
            ]
        elif isinstance(v, dict):
            result[k] = serialize_doc(v)
        else:
            result[k] = v
    return result


def paginate(items: list, page: int = 1, per_page: int = 20) -> dict:
    total = len(items)
    start = (page - 1) * per_page
    end = start + per_page
    return {
        "items": items[start:end],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page
    }
