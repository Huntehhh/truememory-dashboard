"""Directive CRUD — list, add, delete via two-phase confirm token.

Mirrors the ``truememory_directives`` MCP tool's read SQL (directive=1 in the
messages table) and routes writes through the real ``Memory`` API so recall-
cache invalidation + dedup semantics apply.
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from tm_sidecar.curation import _append_audit, _issue_token, _validate_token
from tm_sidecar.engine_holder import run_engine

router = APIRouter()


class DirectiveCreate(BaseModel):
    content: str
    user_id: str = ""


class DirectiveDelete(BaseModel):
    confirm_token: str


def _list_impl(engine: Any, user_id: str) -> dict:
    engine._engine._ensure_connection()  # noqa: SLF001
    query = "SELECT id, content, sender, timestamp, category FROM messages WHERE directive = 1"
    params: list = []
    if user_id:
        query += " AND (sender = ? OR sender = '')"
        params.append(user_id)
    query += " ORDER BY id"
    rows = engine._engine.conn.execute(query, params).fetchall()  # noqa: SLF001
    return {
        "directives": [
            {
                "id": row[0],
                "content": row[1],
                "user_id": row[2],
                "created_at": row[3],
                "category": row[4],
            }
            for row in rows
        ],
        "count": len(rows),
    }


@router.get("/directives")
async def list_directives(user_id: str = "") -> dict:
    return await run_engine(lambda engine: _list_impl(engine, user_id))


def _create_impl(engine: Any, req: DirectiveCreate) -> dict:
    result = engine.add(
        content=req.content,
        user_id=req.user_id or None,
        directive=True,
    )
    _append_audit(
        {
            "ts": int(time.time()),
            "action": "directive_add",
            "memory_id": result.get("id"),
            "before_snapshot": None,
            "result": result,
        }
    )
    return result


@router.post("/directives")
async def create_directive(req: DirectiveCreate) -> dict:
    if not req.content or not req.content.strip():
        raise HTTPException(status_code=400, detail="content required")
    return await run_engine(lambda engine: _create_impl(engine, req))


@router.get("/directives/preview-delete/{memory_id}")
async def preview_delete_directive(memory_id: int) -> dict:
    """Issue a delete-confirm token for a directive.

    Kept read-only + engine-touching so we validate that the id is actually
    a directive before handing back a token.
    """
    def _run(engine: Any) -> dict:
        row = engine.get(memory_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"directive {memory_id} not found")
        if not row.get("directive"):
            raise HTTPException(
                status_code=400,
                detail=f"memory {memory_id} is not a directive",
            )
        return {
            "directive": row,
            "confirm_token": _issue_token("directive_delete", memory_id),
            "expires_in_seconds": 60,
        }

    return await run_engine(_run)


def _delete_impl(engine: Any, memory_id: int) -> dict:
    before = engine.get(memory_id)
    if before is None:
        raise HTTPException(status_code=404, detail=f"directive {memory_id} not found")
    ok = engine.delete(memory_id)
    _append_audit(
        {
            "ts": int(time.time()),
            "action": "directive_delete",
            "memory_id": memory_id,
            "before_snapshot": before,
            "result": {"deleted": bool(ok)},
        }
    )
    return {"ok": bool(ok)}


@router.delete("/directives/{memory_id}")
async def delete_directive(memory_id: int, req: DirectiveDelete) -> dict:
    _validate_token(req.confirm_token, "directive_delete", memory_id)
    return await run_engine(lambda engine: _delete_impl(engine, memory_id))
