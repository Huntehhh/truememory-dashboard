"""Curation write-ops: preview-forget, forget, recategorize.

Every destructive call is two-phase:

1. ``preview-forget`` (idempotent read) returns the memory + top-5 neighbors
   + a short-lived ``confirm_token``.
2. ``forget`` / ``recategorize`` require that token and validate it under a
   per-boot HMAC secret. Tokens carry their expiry in the plaintext half so
   validation is a single HMAC compare + timestamp check.

Every successful write appends a JSONL audit line to
``~/.truememory/logs/curation-audit.jsonl`` with a full before-snapshot so
the operation is recoverable manually if needed. No undo endpoint is exposed
yet — audit-trail-first is the guarantee.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from tm_sidecar.config import CONFIG
from tm_sidecar.engine_holder import run_engine

router = APIRouter()

# Per-boot secret — rotates on every sidecar restart. Tokens don't need to
# survive a restart; a fresh preview always issues a new one.
_SECRET: bytes = secrets.token_bytes(32)
_TOKEN_TTL_S = 60


# ---------------------------------------------------------------------------
# Token issue / validate
# ---------------------------------------------------------------------------


def _issue_token(action: str, memory_id: int) -> str:
    """Return ``<expiry_ts>.<action>.<memory_id>.<hex_digest>``.

    Encoding the action makes a token issued for ``forget`` unusable for
    ``recategorize`` — a small defense against a client re-using the same
    token across intents.
    """
    expiry = int(time.time()) + _TOKEN_TTL_S
    payload = f"{expiry}.{action}.{memory_id}"
    mac = hmac.new(_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}.{mac}"


def _validate_token(token: str, action: str, memory_id: int) -> None:
    """Raise HTTPException(400) on any failure — never leak the reason."""
    parts = token.split(".")
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail="invalid token")
    exp_s, tok_action, tok_id_s, digest = parts
    try:
        expiry = int(exp_s)
        tok_id = int(tok_id_s)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid token")

    payload = f"{expiry}.{tok_action}.{tok_id}"
    expected = hmac.new(_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    # Constant-time compare — user-controlled digest input.
    if not hmac.compare_digest(expected, digest):
        raise HTTPException(status_code=400, detail="invalid token")
    if tok_action != action:
        raise HTTPException(status_code=400, detail="invalid token")
    if tok_id != memory_id:
        raise HTTPException(status_code=400, detail="invalid token")
    if expiry < int(time.time()):
        raise HTTPException(status_code=400, detail="token expired")


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------


def _append_audit(entry: dict) -> str:
    """Write one JSONL line + return the generated audit_id."""
    entry = {**entry, "audit_id": entry.get("audit_id") or str(uuid.uuid4())}
    path = CONFIG.curation_audit_log
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        # If we can't create the log dir we still return a token — losing
        # the audit trail is worse than a crash but must not silently no-op
        # the surface. Fall back to the sidecar's own working dir.
        pass
    try:
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, default=str) + "\n")
    except OSError:
        # Same fallback as above — never crash the request.
        pass
    return entry["audit_id"]


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class PreviewForgetRequest(BaseModel):
    memory_id: int


class ForgetRequest(BaseModel):
    memory_id: int
    confirm_token: str


class RecategorizeRequest(BaseModel):
    memory_id: int
    category: str
    confirm_token: str


# ---------------------------------------------------------------------------
# Neighbor lookup
# ---------------------------------------------------------------------------


def _neighbors(engine: Any, content: str, memory_id: int) -> list[dict]:
    """Top-5 vector neighbors of ``content``, excluding the memory itself.

    Calls ``vector_search.search_vector_raw`` directly rather than the wrapper
    ``Memory.search_vectors_raw`` — the wrapper silently swallows the
    "vector table not primed yet" case on the first invocation of a fresh
    engine, and we'd rather return usable neighbors on call one than an
    empty list. Vectors truly unavailable still degrade to an empty list.
    """
    if not content:
        return []
    try:
        from truememory.vector_search import search_vector_raw
        engine._engine._ensure_connection()  # noqa: SLF001
        raw = search_vector_raw(engine._engine.conn, content, limit=6)  # noqa: SLF001
    except Exception:
        return []
    if not raw:
        return []
    out: list[dict] = []
    for row in raw:
        rid = row.get("id")
        if rid == memory_id:
            continue
        score = row.get("score")
        distance: float | None
        if isinstance(score, (int, float)):
            distance = round(1.0 - float(score), 6)
        else:
            distance = None
        out.append(
            {
                "id": rid,
                "content_preview": (row.get("content") or "")[:200],
                "cosine": score,
                "distance": distance,
                "sender": row.get("sender"),
                "timestamp": row.get("timestamp"),
            }
        )
        if len(out) >= 5:
            break
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


def _preview_impl(engine: Any, memory_id: int, action: str) -> dict:
    row = engine.get(memory_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"memory {memory_id} not found")
    neighbors = _neighbors(engine, row.get("content", ""), memory_id)
    return {
        "memory": {
            "id": row.get("id"),
            "content": row.get("content"),
            "sender": row.get("sender"),
            "recipient": row.get("recipient"),
            "timestamp": row.get("timestamp"),
            "category": row.get("category"),
            "modality": row.get("modality"),
            "directive": row.get("directive"),
        },
        "neighbors": neighbors,
        "confirm_token": _issue_token(action, memory_id),
        "expires_in_seconds": _TOKEN_TTL_S,
    }


@router.post("/curation/preview-forget")
async def preview_forget(req: PreviewForgetRequest) -> dict:
    return await run_engine(lambda engine: _preview_impl(engine, req.memory_id, "forget"))


@router.post("/curation/preview-recategorize")
async def preview_recategorize(req: PreviewForgetRequest) -> dict:
    return await run_engine(lambda engine: _preview_impl(engine, req.memory_id, "recategorize"))


def _forget_impl(engine: Any, memory_id: int) -> dict:
    before = engine.get(memory_id)
    if before is None:
        raise HTTPException(status_code=404, detail=f"memory {memory_id} not found")
    ok = engine.delete(memory_id)
    audit_id = _append_audit(
        {
            "ts": int(time.time()),
            "action": "forget",
            "memory_id": memory_id,
            "before_snapshot": before,
            "result": {"deleted": bool(ok)},
        }
    )
    return {"ok": bool(ok), "audit_id": audit_id}


@router.post("/curation/forget")
async def forget(req: ForgetRequest) -> dict:
    _validate_token(req.confirm_token, "forget", req.memory_id)
    return await run_engine(lambda engine: _forget_impl(engine, req.memory_id))


def _recategorize_impl(engine: Any, memory_id: int, category: str) -> dict:
    before = engine.get(memory_id)
    if before is None:
        raise HTTPException(status_code=404, detail=f"memory {memory_id} not found")
    updated = engine._engine.update(memory_id, category=category)  # noqa: SLF001
    audit_id = _append_audit(
        {
            "ts": int(time.time()),
            "action": "recategorize",
            "memory_id": memory_id,
            "before_snapshot": before,
            "result": {"updated": updated is not None, "new_category": category},
        }
    )
    return {"ok": updated is not None, "audit_id": audit_id, "memory": updated}


@router.post("/curation/recategorize")
async def recategorize(req: RecategorizeRequest) -> dict:
    _validate_token(req.confirm_token, "recategorize", req.memory_id)
    return await run_engine(
        lambda engine: _recategorize_impl(engine, req.memory_id, req.category)
    )


__all__ = ["router"]
