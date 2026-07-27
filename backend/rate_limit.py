"""Lightweight in-memory sliding-window rate limiter.

Not for multi-instance deployment — fine for single-pod MVP and avoids a Redis dep.
For a deployed multi-worker setup, swap the in-memory dict for Redis.
"""

import time
from collections import defaultdict, deque
from fastapi import HTTPException

# bucket: key (e.g. "ai_classify:<user_id>") -> deque[timestamps]
_BUCKETS = defaultdict(deque)


def check_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    """Raise 429 if `key` has exceeded `limit` calls within `window_seconds`.

    Internally maintains a deque of monotonic timestamps and evicts those
    older than the window before counting.
    """
    now = time.monotonic()
    q = _BUCKETS[key]
    cutoff = now - window_seconds
    while q and q[0] < cutoff:
        q.popleft()
    if len(q) >= limit:
        retry_in = int(window_seconds - (now - q[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Try again in ~{retry_in}s.",
            headers={"Retry-After": str(retry_in)},
        )
    q.append(now)
