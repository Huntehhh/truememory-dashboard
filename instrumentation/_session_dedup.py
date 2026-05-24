"""Per-session injected-memory tracking for turn-based recall.

When ``user_prompt_submit`` injects memories into Claude's context, it
records the memory IDs here so subsequent turns in the same session
don't re-inject the same facts. Each session gets its own JSON file
under ``~/.truememory/turn_injected/``.

Schema (one file per session)::

    {
      "session_id":         "abc-123",
      "session_started_at": "2026-05-23T17:00:00+00:00",
      "last_turn_at":       "2026-05-23T17:30:00+00:00",
      "turns":              5,
      "injected_ids":       [12, 34, 56, ...]
    }

``session_start.py`` seeds the file with its initial ``MEMORY_LIMIT``
memory IDs so the very first ``user_prompt_submit`` doesn't reduplicate
the session-start blanket recall.

Best-effort everywhere — never raises. Visibility/dedup failures
must never block a hook's primary job.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

DEDUP_DIR = Path(os.environ.get(
    "TRUEMEMORY_TURN_INJECTED_DIR",
    str(Path.home() / ".truememory" / "turn_injected"),
))
RETENTION_DAYS = int(os.environ.get("TRUEMEMORY_TURN_INJECTED_RETENTION_DAYS", "7"))
MAX_TRACKED_IDS = int(os.environ.get("TRUEMEMORY_TURN_INJECTED_MAX_IDS", "500"))


def _safe_id(session_id: str) -> str:
    safe = "".join(c for c in (session_id or "") if c.isalnum() or c in "-_")[:64]
    return safe or "unknown"


def _path_for(session_id: str) -> Path:
    return DEDUP_DIR / f"{_safe_id(session_id)}.json"


def load(session_id: str) -> dict:
    """Return the session's dedup record, or a fresh empty one."""
    path = _path_for(session_id)
    if not path.exists():
        return _empty_record(session_id)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _empty_record(session_id)
        ids = data.get("injected_ids", [])
        if not isinstance(ids, list):
            ids = []
        return {
            "session_id":         data.get("session_id", session_id),
            "session_started_at": data.get("session_started_at"),
            "last_turn_at":       data.get("last_turn_at"),
            "turns":              int(data.get("turns", 0) or 0),
            "injected_ids":       [i for i in ids if i is not None],
        }
    except (OSError, ValueError):
        return _empty_record(session_id)


def _empty_record(session_id: str) -> dict:
    return {
        "session_id":         session_id,
        "session_started_at": _now_iso(),
        "last_turn_at":       None,
        "turns":              0,
        "injected_ids":       [],
    }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def already_injected(session_id: str) -> set:
    """Cheap helper — returns the set of memory IDs already injected this session."""
    return set(load(session_id).get("injected_ids", []))


def record_injection(session_id: str, new_ids: Iterable) -> None:
    """Append ``new_ids`` to the session's injected set and bump turn counter.

    The on-disk list is capped at ``MAX_TRACKED_IDS`` (FIFO eviction) so a
    very long session can't grow the file unboundedly. Once an ID is
    evicted it becomes eligible for re-injection — acceptable, since the
    session is by then long enough that the user has likely lost track of
    what was already shown.
    """
    try:
        DEDUP_DIR.mkdir(parents=True, exist_ok=True)
        record = load(session_id)
        existing = list(record.get("injected_ids", []))
        seen = set(existing)
        for mid in new_ids:
            if mid is None or mid in seen:
                continue
            existing.append(mid)
            seen.add(mid)
        if len(existing) > MAX_TRACKED_IDS:
            existing = existing[-MAX_TRACKED_IDS:]
        record["injected_ids"] = existing
        record["last_turn_at"] = _now_iso()
        record["turns"] = int(record.get("turns", 0) or 0) + 1
        _write(session_id, record)
        # NOTE: no _prune_old() here — it scans the whole dedup dir, which
        # would put an O(N) stat loop on the per-prompt critical path.
        # Pruning happens once per session in seed_session() instead.
    except OSError:
        pass


def seed_session(session_id: str, initial_ids: Iterable) -> None:
    """Initialize the session's dedup file with the session-start memory IDs.

    Called from ``session_start.py`` so the first ``user_prompt_submit``
    knows which memories the blanket-recall already showed and skips them.
    Idempotent — if the file already exists with more turns recorded, the
    initial IDs are merged in rather than overwriting.
    """
    try:
        DEDUP_DIR.mkdir(parents=True, exist_ok=True)
        record = load(session_id)
        # Merge so we don't clobber a session that's already had turns
        # (e.g., SessionStart fires twice in some Claude Code flows).
        existing = list(record.get("injected_ids", []))
        seen = set(existing)
        for mid in initial_ids:
            if mid is None or mid in seen:
                continue
            existing.append(mid)
            seen.add(mid)
        if len(existing) > MAX_TRACKED_IDS:
            existing = existing[-MAX_TRACKED_IDS:]
        record["injected_ids"] = existing
        record.setdefault("session_started_at", _now_iso())
        _write(session_id, record)
        _prune_old()
    except OSError:
        pass


def session_started_at(session_id: str) -> str | None:
    """ISO timestamp of when this session was first seeded, or None."""
    return load(session_id).get("session_started_at")


def _write(session_id: str, record: dict) -> None:
    path = _path_for(session_id)
    # PID-suffix the tmp file: two overlapping hooks for the same session
    # (rare, but possible during sub-agent fan-out) must not corrupt the
    # file. Last writer's rename wins cleanly.
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(record, indent=2), encoding="utf-8")
    tmp.replace(path)


def _prune_old() -> None:
    """Delete dedup files older than ``RETENTION_DAYS``."""
    if not DEDUP_DIR.exists():
        return
    cutoff = time.time() - (RETENTION_DAYS * 86400)
    for path in DEDUP_DIR.iterdir():
        try:
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            continue
