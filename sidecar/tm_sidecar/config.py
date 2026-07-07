"""Sidecar configuration seam.

Single source of truth for every path/port/knob the sidecar needs. Nothing
else in the package hard-codes a user path — everything reads through here so
env-var overrides work cleanly.

Environment variables consulted:
    TRUEMEMORY_HOME      Override the TrueMemory home dir (default: ~/.truememory)
    TRUEMEMORY_DB_PATH   Override the SQLite DB path       (default: <HOME>/memories.db)
    TM_SIDECAR_PORT      HTTP port for uvicorn              (default: 8504)
    TM_SIDECAR_HOST      HTTP host                          (default: 127.0.0.1)
    TM_SIDECAR_IDLE_UNLOAD_SECONDS
                         Seconds of engine idleness before the reranker is
                         released                            (default: 600)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env_int(key: str, default: int) -> int:
    """Read an int env var, falling back on default if unset or malformed."""
    raw = os.environ.get(key)
    if not raw:
        return default
    try:
        return int(raw.strip())
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class SidecarConfig:
    """Resolved paths + tunables. Constructed once at import time."""

    tm_home: Path
    db_path: Path
    injections_log: Path
    stores_log: Path
    logs_dir: Path
    curation_audit_log: Path
    host: str
    port: int
    idle_unload_seconds: int


def _resolve() -> SidecarConfig:
    tm_home_env = os.environ.get("TRUEMEMORY_HOME")
    tm_home = Path(tm_home_env).expanduser() if tm_home_env else Path.home() / ".truememory"

    db_path_env = os.environ.get("TRUEMEMORY_DB_PATH")
    db_path = Path(db_path_env).expanduser() if db_path_env else tm_home / "memories.db"

    logs_dir = tm_home / "logs"

    return SidecarConfig(
        tm_home=tm_home,
        db_path=db_path,
        injections_log=tm_home / "injections.log",
        stores_log=tm_home / "stores.log",
        logs_dir=logs_dir,
        curation_audit_log=logs_dir / "curation-audit.jsonl",
        host=os.environ.get("TM_SIDECAR_HOST", "127.0.0.1"),
        port=_env_int("TM_SIDECAR_PORT", 8504),
        idle_unload_seconds=_env_int("TM_SIDECAR_IDLE_UNLOAD_SECONDS", 600),
    )


CONFIG: SidecarConfig = _resolve()
