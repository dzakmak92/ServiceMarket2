"""Uploads and signed downloads (Supabase Storage).

Every object is private. A download is a short-lived signed URL minted only
after the caller's ownership of the parent row has been checked — the object
key alone is never a credential.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from auth import get_current_user
from db import pg
from repositories import pm as pm_repo
from routes._pro import require_pro_id
from services import storage

router = APIRouter(prefix="/uploads", tags=["uploads"])

KIND_BUCKET = {
    "job_photo": storage.BUCKET_JOB_PHOTOS,
    "document": storage.BUCKET_DOCUMENTS,
    "receipt": storage.BUCKET_RECEIPTS,
    "logo": storage.BUCKET_LOGOS,
    "signature": storage.BUCKET_SIGNATURES,
}


# Two paths, one handler. /uploads is canonical and what this app now calls;
# /uploads/file is what every client called before the Postgres port, and a
# browser still holding the old bundle would otherwise upload into a 404.
#
# This is not the same thing as accepting two names for a field. A route alias
# is explicit and cannot be half-right: both paths run the same code. A
# silently-dropped field, as on the Kanban board, looks like it worked and did
# nothing. Aliases are safe; ambiguous payloads are not.
@router.post("", status_code=201)
@router.post("/file", status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    kind: str = Form(default="document"),
    job_id: Optional[str] = Form(default=None),
    caption: Optional[str] = Form(default=None),
    customer_visible: bool = Form(default=False),
    user: dict = Depends(get_current_user),
):
    """Upload and, when a job is named, attach it as a job document."""
    if not storage.is_configured():
        raise HTTPException(503, "Storage is not configured on this server.")
    bucket = KIND_BUCKET.get(kind)
    if not bucket:
        raise HTTPException(400, f"kind must be one of: {', '.join(KIND_BUCKET)}")

    pro_id = await require_pro_id(user)
    if job_id and not await pg.fetchval(
            "select 1 from jobs where id = $1 and pro_id = $2 and deleted_at is null",
            job_id, pro_id):
        raise HTTPException(404, "Job not found")

    body = await file.read()
    if not body:
        raise HTTPException(400, "Empty file")

    content_type = file.content_type or storage.guess_type(file.filename or "")
    key = storage.build_key(pro_id, file.filename or "upload", job_id=job_id)
    try:
        ref = await storage.upload(bucket, key, body, content_type=content_type)
    except storage.StorageError as e:
        raise HTTPException(400, str(e))

    out = {"storage_ref": ref, "filename": file.filename,
           "content_type": content_type, "size_bytes": len(body)}

    # A signed URL for the thumbnail the caller is about to render. Ephemeral
    # by design and returned as a convenience only: `storage_ref` is what gets
    # stored. A row holding a signed URL is a row that renders a broken image
    # an hour later, which is exactly what happened when photos were kept as
    # "/api/uploads/<id>" strings against a GridFS that no longer exists.
    try:
        out["url"] = await storage.signed_url(bucket, key)
    except storage.StorageError:
        out["url"] = None

    if job_id:
        doc_kind = {"job_photo": "photo", "receipt": "receipt",
                    "signature": "signature"}.get(kind, "other")
        out["document"] = await pm_repo.add_document(pro_id, job_id, {
            "kind": doc_kind, "storage_ref": ref, "filename": file.filename,
            "content_type": content_type, "size_bytes": len(body),
            "caption": caption, "customer_visible": customer_visible,
        })
    return out


@router.get("/signed")
async def get_signed_url(storage_ref: str, ttl: int = 3600,
                         user: dict = Depends(get_current_user)):
    """Mint a download URL, but only for an object this pro owns.

    Ownership is decided by the key prefix, which always begins with the
    owning pro's id — so a guessed ref belonging to someone else is refused
    rather than served.
    """
    if not storage.is_configured():
        raise HTTPException(503, "Storage is not configured on this server.")
    pro_id = await require_pro_id(user)
    try:
        bucket, key = storage.parse_ref(storage_ref)
    except storage.StorageError as e:
        raise HTTPException(400, str(e))
    if not key.startswith(f"{pro_id}/"):
        raise HTTPException(403, "Not your file")
    try:
        return {"url": await storage.signed_url(bucket, key, min(ttl, 86400))}
    except storage.StorageError as e:
        raise HTTPException(502, str(e))


@router.delete("")
async def delete_file(storage_ref: str, user: dict = Depends(get_current_user)):
    pro_id = await require_pro_id(user)
    bucket, key = storage.parse_ref(storage_ref)
    if not key.startswith(f"{pro_id}/"):
        raise HTTPException(403, "Not your file")
    await pg.execute("delete from job_documents where storage_ref = $1", storage_ref)
    return {"deleted": await storage.delete(bucket, key)}


# ── Customer portal ────────────────────────────────────────────────────
portal_router = APIRouter(prefix="/portal", tags=["customer-portal"])


@portal_router.get("/{share_token}/documents")
async def portal_documents(share_token: str, ttl: int = 3600):
    """Only documents explicitly marked customer-visible.

    Before/after photos are the tradesperson's dispute shield, but a job also
    accumulates receipts and internal notes the customer has no business
    seeing. Default-hidden, opt-in visible.
    """
    rows = await pg.fetch(
        """
        select d.id, d.kind, d.storage_ref, d.filename, d.caption, d.created_at
          from job_documents d join jobs j on j.id = d.job_id
         where j.share_token = $1 and j.deleted_at is null and d.customer_visible
         order by d.created_at
        """, share_token)
    out = []
    for r in rows:
        try:
            r["url"] = await storage.signed_url_for(r["storage_ref"], min(ttl, 86400))
        except storage.StorageError:
            r["url"] = None
        r.pop("storage_ref", None)     # never hand the raw key to the browser
        out.append(r)
    return {"documents": out}
