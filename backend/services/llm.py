"""Provider-agnostic LLM access.

Every candidate — Mistral, Google, Groq, OpenRouter, Scaleway, Nebius, a
self-hosted vLLM serving Qwen3-VL — speaks the OpenAI chat-completions shape.
So the app talks that shape and the provider is a base URL plus a key. Swapping
is an environment change, not a code change, which matters because the choice
here is a data-protection decision as much as a technical one and it will be
revisited.

Configuration:

    LLM_BASE_URL   e.g. https://api.mistral.ai/v1
    LLM_API_KEY    provider key
    LLM_MODEL      e.g. pixtral-12b-2409, qwen2.5-vl-72b-instruct
    LLM_VISION     "1" to permit sending images at all
    LLM_PROVIDER   free-text label, recorded in the audit trail

Two deliberate refusals:

  · Absent configuration is not an error. is_configured() is false, callers
    degrade, and the app runs exactly as it does today. An AI feature that
    breaks invoicing when a key expires is worse than no AI feature.
  · Images are gated behind LLM_VISION independently of the key. A job photo
    is the inside of somebody's home — personal data under DSGVO — and the
    difference between "we can call a model" and "we may send it a customer's
    bathroom" is a decision someone must make on purpose. Setting a key must
    not silently enable it.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 45.0
MAX_IMAGE_BYTES = 4 * 1024 * 1024


class LLMError(RuntimeError):
    """The provider was reached and could not answer usefully."""


class LLMNotConfigured(LLMError):
    """No provider is set up. Callers should degrade, not fail."""


def base_url() -> str:
    return (os.environ.get("LLM_BASE_URL") or "").rstrip("/")


def model() -> str:
    return os.environ.get("LLM_MODEL") or ""


def provider_label() -> str:
    """Named in the audit trail and, per the plan, disclosed to the customer.

    A sub-processor that sees photos of their home is something they are
    entitled to be told about.
    """
    if os.environ.get("LLM_PROVIDER"):
        return os.environ["LLM_PROVIDER"]
    host = base_url().split("//")[-1].split("/")[0]
    return host or "unconfigured"


def is_configured() -> bool:
    return bool(base_url() and os.environ.get("LLM_API_KEY") and model())


def vision_enabled() -> bool:
    """Images require their own switch, not merely a working key."""
    return is_configured() and os.environ.get("LLM_VISION", "").strip() in ("1", "true", "yes")


def _image_part(data: bytes, content_type: str = "image/jpeg") -> dict:
    if len(data) > MAX_IMAGE_BYTES:
        raise LLMError(
            f"Image is {len(data) / 1e6:.1f} MB; the limit is "
            f"{MAX_IMAGE_BYTES / 1e6:.0f} MB. Resize before sending.")
    b64 = base64.b64encode(data).decode()
    return {"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{b64}"}}


async def complete(
    prompt: str,
    *,
    system: Optional[str] = None,
    images: Optional[list[tuple[bytes, str]]] = None,
    temperature: float = 0.1,
    max_tokens: int = 1200,
    timeout: float = DEFAULT_TIMEOUT,
) -> str:
    """One chat completion. Returns the assistant's text.

    temperature defaults low: this is used for extraction and structuring,
    where a creative answer is a wrong answer.
    """
    if not is_configured():
        raise LLMNotConfigured(
            "No LLM provider configured. Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL.")
    if images and not vision_enabled():
        raise LLMError(
            "Images are not permitted: LLM_VISION is not enabled. A job photo is "
            "personal data, and sending it needs a deliberate decision and a "
            "processor agreement, not just an API key.")

    import httpx

    content: Any = prompt
    if images:
        content = [{"type": "text", "text": prompt}]
        content += [_image_part(blob, ctype) for blob, ctype in images]

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": content})

    payload = {
        "model": model(),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{base_url()}/chat/completions",
            headers={"Authorization": f"Bearer {os.environ['LLM_API_KEY']}",
                     "Content-Type": "application/json"},
            json=payload,
        )
    if resp.status_code >= 400:
        # The body can echo the prompt, which may contain customer detail, so
        # only the status and the provider go to the log.
        logger.error("LLM %s returned %s", provider_label(), resp.status_code)
        raise LLMError(f"{provider_label()} returned {resp.status_code}")

    try:
        return resp.json()["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, ValueError) as exc:
        raise LLMError(f"Unexpected response shape from {provider_label()}") from exc


def parse_json(text: str) -> Any:
    """Pull JSON out of a model reply.

    Models wrap JSON in prose and fences however firmly they are told not to.
    Failing the whole extraction because of a ```json fence would make the
    feature look broken when the content is fine.
    """
    s = (text or "").strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[-1]
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3]
    s = s.strip()
    try:
        return json.loads(s)
    except ValueError:
        # Fall back to the outermost braces or brackets.
        for opener, closer in (("{", "}"), ("[", "]")):
            i, j = s.find(opener), s.rfind(closer)
            if i != -1 and j > i:
                try:
                    return json.loads(s[i:j + 1])
                except ValueError:
                    continue
        raise LLMError("Model reply was not JSON")
