"""Supabase Storage — replaces GridFS.

Five private buckets. Nothing is world-readable, and that is deliberate: job
photos show the inside of people's homes, licence uploads are identity
documents, and receipts are financial records. Under DSGVO a guessable public
URL to a customer's kitchen is a breach waiting to be reported.

Access is always a short-lived signed URL, minted by the backend only after
it has checked that the caller owns the row the object hangs off.

Object keys are `{pro_id}/{job_id}/{uuid}.{ext}`. Prefixing by pro means a
future storage RLS policy can scope on the path, and it makes an account
deletion a prefix delete rather than a hunt.

Requires in backend/.env:
    SUPABASE_URL=https://mctkeujyujhafhbyokvs.supabase.co
    SUPABASE_SERVICE_KEY=<service_role key>

The service key bypasses RLS, so it must never reach the browser. It is used
here only from the server.
"""
from __future__ import annotations

import logging
import mimetypes
import os
import uuid
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

BUCKET_JOB_PHOTOS = "job-photos"
BUCKET_DOCUMENTS = "documents"
BUCKET_RECEIPTS = "receipts"
BUCKET_LOGOS = "logos"
BUCKET_SIGNATURES = "signatures"

# Kept in step with the bucket definitions in migration 008.
LIMITS: dict[str, int] = {
    BUCKET_JOB_PHOTOS: 15 * 1024 * 1024,
    BUCKET_DOCUMENTS: 20 * 1024 * 1024,
    BUCKET_RECEIPTS: 10 * 1024 * 1024,
    BUCKET_LOGOS: 2 * 1024 * 1024,
    BUCKET_SIGNATURES: 1 * 1024 * 1024,
}

ALLOWED: dict[str, set[str]] = {
    BUCKET_JOB_PHOTOS: {"image/jpeg", "image/png", "image/webp", "image/heic"},
    BUCKET_DOCUMENTS: {"image/jpeg", "image/png", "image/webp", "application/pdf"},
    BUCKET_RECEIPTS: {"image/jpeg", "image/png", "image/webp", "application/pdf"},
    BUCKET_LOGOS: {"image/jpeg", "image/png", "image/webp", "image/svg+xml"},
    BUCKET_SIGNATURES: {"image/png", "image/svg+xml"},
}

DEFAULT_SIGNED_TTL = 3600  # 1 hour


class StorageError(RuntimeError):
    pass


def _base() -> str:
    url = os.environ.get("SUPABASE_URL")
    if not url:
        raise StorageError("SUPABASE_URL is not set")
    return url.rstrip("/")


def _key() -> str:
    k = os.environ.get("SUPABASE_SERVICE_KEY")
    if not k:
        raise StorageError("SUPABASE_SERVICE_KEY is not set")
    return k


def _headers(extra: Optional[dict] = None) -> dict:
    h = {"Authorization": f"Bearer {_key()}", "apikey": _key()}
    if extra:
        h.update(extra)
    return h


def is_configured() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"))


def build_key(pro_id: str, filename: str, *, job_id: Optional[str] = None) -> str:
    ext = os.path.splitext(filename or "")[1].lower()[:10]
    mid = f"{job_id}/" if job_id else ""
    return f"{pro_id}/{mid}{uuid.uuid4().hex}{ext}"


def guess_type(filename: str, fallback: str = "application/octet-stream") -> str:
    return mimetypes.guess_type(filename or "")[0] or fallback


def validate(bucket: str, content_type: str, size: int) -> None:
    """Refuse before uploading rather than after.

    The bucket enforces this too, but a clear 400 beats a storage-layer error
    the tradesperson cannot act on.
    """
    allowed = ALLOWED.get(bucket)
    if allowed and content_type not in allowed:
        raise StorageError(
            f"{content_type} is not accepted here. Allowed: {', '.join(sorted(allowed))}")
    limit = LIMITS.get(bucket)
    if limit and size > limit:
        raise StorageError(
            f"File is {size / 1e6:.1f} MB; the limit for this bucket is {limit / 1e6:.0f} MB.")


async def upload(bucket: str, key: str, data: bytes, *,
                 content_type: str = "application/octet-stream",
                 upsert: bool = False) -> str:
    validate(bucket, content_type, len(data))
    url = f"{_base()}/storage/v1/object/{bucket}/{key}"
    headers = _headers({"Content-Type": content_type})
    if upsert:
        headers["x-upsert"] = "true"
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(url, content=data, headers=headers)
    if r.status_code >= 300:
        raise StorageError(f"upload failed ({r.status_code}): {r.text[:200]}")
    return f"{bucket}/{key}"


async def download(bucket: str, key: str) -> bytes:
    url = f"{_base()}/storage/v1/object/{bucket}/{key}"
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.get(url, headers=_headers())
    if r.status_code >= 300:
        raise StorageError(f"download failed ({r.status_code})")
    return r.content


async def signed_url(bucket: str, key: str, ttl: int = DEFAULT_SIGNED_TTL) -> str:
    """A time-limited URL the browser can fetch directly.

    Short-lived on purpose: the link ends up in a customer's inbox or a
    tradesperson's WhatsApp, and neither is a place a permanent URL to
    someone's home should live.
    """
    url = f"{_base()}/storage/v1/object/sign/{bucket}/{key}"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(url, json={"expiresIn": ttl},
                         headers=_headers({"Content-Type": "application/json"}))
    if r.status_code >= 300:
        raise StorageError(f"sign failed ({r.status_code}): {r.text[:200]}")
    return f"{_base()}/storage/v1{r.json()['signedURL']}"


async def delete(bucket: str, key: str) -> bool:
    url = f"{_base()}/storage/v1/object/{bucket}/{key}"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.delete(url, headers=_headers())
    return r.status_code < 300


async def delete_prefix(bucket: str, prefix: str) -> int:
    """Delete everything under a prefix — used when a pro's account is erased.

    GDPR right-to-erasure has to reach the object store, not just the rows.
    Because keys start with `{pro_id}/`, this is one call rather than a
    reconciliation job.
    """
    list_url = f"{_base()}/storage/v1/object/list/{bucket}"
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(list_url, json={"prefix": prefix, "limit": 1000},
                         headers=_headers({"Content-Type": "application/json"}))
        if r.status_code >= 300:
            return 0
        names = [f"{prefix}/{o['name']}" if not o["name"].startswith(prefix) else o["name"]
                 for o in r.json()]
        if not names:
            return 0
        d = await c.request("DELETE", f"{_base()}/storage/v1/object/{bucket}",
                            json={"prefixes": names},
                            headers=_headers({"Content-Type": "application/json"}))
    return len(names) if d.status_code < 300 else 0


def parse_ref(storage_ref: str) -> tuple[str, str]:
    """`bucket/key/with/slashes` → (bucket, key)."""
    if "/" not in (storage_ref or ""):
        raise StorageError(f"malformed storage ref: {storage_ref!r}")
    bucket, key = storage_ref.split("/", 1)
    return bucket, key


async def signed_url_for(storage_ref: str, ttl: int = DEFAULT_SIGNED_TTL) -> str:
    return await signed_url(*parse_ref(storage_ref), ttl=ttl)
