"""GET /events — SSE stream of live injection + store events.

Watches two append-only JSONL files:

    ~/.truememory/injections.log   → event: injection
    ~/.truememory/stores.log       → event: store

Simple stat-poll every 1s, tail-reading new bytes since the watermark. Log
rotation is handled by resetting the offset when the file shrinks. A
heartbeat comment is emitted every 15s so the client's connection stays
open under aggressive proxy idle-timeouts.

Notes:

* The Express proxy on the parent dashboard hosts SSE with Nagle disabled,
  so single event frames flush immediately.
* sse-starlette's EventSourceResponse handles ping/keepalive framing, but
  we ship our own so the payload structure stays predictable.
* File reads are performed synchronously in the async generator — the files
  are small tails on a local NVMe (see ``rules/pc-specs.md``: SN850X ~7 GB/s
  seq read), so a per-1s open+read of a few hundred bytes is negligible.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncIterator

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from tm_sidecar.config import CONFIG

router = APIRouter()


@dataclass
class _Watermark:
    path: Path
    offset: int = 0
    event_name: str = "message"
    # Track known size so we can detect rotation (size shrank vs offset).
    last_size: int = 0
    parse_errors: int = 0
    # Buffer for a partial trailing line across polls (e.g., writer flushed
    # mid-line). Prepended to the next read.
    partial: str = ""


@dataclass
class _StreamState:
    watermarks: list[_Watermark] = field(default_factory=list)
    connected_at: float = field(default_factory=time.time)
    last_heartbeat: float = field(default_factory=time.time)


_POLL_INTERVAL_S = 1.0
_HEARTBEAT_INTERVAL_S = 15.0
_MAX_READ_BYTES = 1_048_576  # cap one-shot reads at 1 MB


def _initial_offset(path: Path) -> int:
    """Watermark starts at end-of-file at connect time — no backlog dump."""
    try:
        return path.stat().st_size
    except FileNotFoundError:
        return 0
    except OSError:
        return 0


def _read_new_lines(wm: _Watermark) -> list[dict]:
    """Read appended bytes since ``wm.offset`` and parse them as JSONL.

    Handles rotation (size < offset ⇒ reset to 0 and re-read from the top)
    and partial-line writes (buffer the trailing chunk until the next poll).
    Malformed JSON lines are counted and skipped so a bad write doesn't
    starve the stream.
    """
    try:
        size = wm.path.stat().st_size
    except FileNotFoundError:
        wm.last_size = 0
        wm.offset = 0
        return []
    except OSError:
        return []

    # Rotation: size shrank below our watermark ⇒ start over at 0.
    if size < wm.offset:
        wm.offset = 0
        wm.partial = ""

    if size <= wm.offset:
        wm.last_size = size
        return []

    to_read = min(size - wm.offset, _MAX_READ_BYTES)

    events: list[dict] = []
    try:
        with wm.path.open("rb") as fh:
            fh.seek(wm.offset)
            chunk = fh.read(to_read)
    except OSError:
        return []

    if not chunk:
        return []

    text = wm.partial + chunk.decode("utf-8", errors="replace")
    wm.offset += len(chunk)
    wm.last_size = size

    # Split on newline; keep trailing (possibly incomplete) fragment for next poll.
    parts = text.split("\n")
    wm.partial = parts.pop()
    for line in parts:
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            wm.parse_errors += 1
            continue
    return events


async def _event_stream(request: Request) -> AsyncIterator[dict]:
    state = _StreamState(
        watermarks=[
            _Watermark(
                path=CONFIG.injections_log,
                offset=_initial_offset(CONFIG.injections_log),
                event_name="injection",
            ),
            _Watermark(
                path=CONFIG.stores_log,
                offset=_initial_offset(CONFIG.stores_log),
                event_name="store",
            ),
        ],
    )

    # Kick off with a small hello so the client knows the stream is live.
    yield {
        "event": "hello",
        "data": json.dumps(
            {
                "injections_log": str(CONFIG.injections_log),
                "stores_log": str(CONFIG.stores_log),
                "connected_at": state.connected_at,
            }
        ),
    }

    while True:
        if await request.is_disconnected():
            return

        emitted_any = False
        for wm in state.watermarks:
            for event in _read_new_lines(wm):
                yield {
                    "event": wm.event_name,
                    "data": json.dumps(event, default=str),
                }
                emitted_any = True

        now = time.time()
        if now - state.last_heartbeat >= _HEARTBEAT_INTERVAL_S:
            state.last_heartbeat = now
            # sse-starlette emits standalone comment lines for keepalive when
            # ``data`` is None; use "ping" event with an empty payload for a
            # small, self-documenting frame that shows in browser devtools.
            yield {
                "event": "ping",
                "data": json.dumps({"ts": now}),
            }
        elif not emitted_any:
            # Yield control so cancellations propagate promptly.
            pass

        await asyncio.sleep(_POLL_INTERVAL_S)


@router.get("/events")
async def events(request: Request) -> EventSourceResponse:
    # ``ping=None`` disables sse-starlette's built-in keepalive comment stream
    # so our explicit ``event: ping`` frames are the only heartbeat on the wire.
    # Passing ``ping=0`` in v3.x floods the socket with comments (interval is
    # in seconds, and 0 loops immediately) — verified 2026-07-07.
    return EventSourceResponse(_event_stream(request), ping=None)
