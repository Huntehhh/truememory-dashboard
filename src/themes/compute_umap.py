"""compute_umap.py - UMAP+HDBSCAN themes scheduler for the MEMORY dashboard.

Reads ~/.truememory/memories.db READ-ONLY (URI form per
read-only-discipline), extracts float32 embeddings out of the sqlite-vec
storage tables (the vec0 virtual table itself requires the extension; we read
the underlying chunk + rowid tables directly), fits UMAP-2D + HDBSCAN, then
writes one row per memory into the dashboard Postgres tm_themes_cache.

Run via:
    python src/themes/compute_umap.py --once

The wrapper at scripts/run-themes-loop.ps1 invokes this on a 1-hour cadence.
This is OPTIONAL — only the Themes (UMAP) page needs it; the rest of the
dashboard works without it. Requires: numpy, psycopg, umap-learn, scikit-learn.

Constraints:
- memories.db is opened with mode=ro AND immutable=1 to avoid WAL state mismatch.
- Postgres password is read from CLAUDE_USAGE_PG_PASSWORD (env), falling back to
  a local .env file (see PG_PASSWORD_ENV_FILE below).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import struct
import sys
import time
from pathlib import Path
from typing import Iterable

import numpy as np
import psycopg
import umap
from sklearn.cluster import HDBSCAN

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

TM_HOME = Path(os.path.expanduser("~/.truememory"))
MEMORIES_DB = Path(os.environ.get("TRUEMEMORY_DB_PATH", TM_HOME / "memories.db"))
TM_CONFIG = Path(os.environ.get("TRUEMEMORY_CONFIG_PATH", TM_HOME / "config.json"))


def detect_active_tier() -> str:
    """Read the active embedding tier from ~/.truememory/config.json.

    TrueMemory's vec0 storage tables are tier-suffixed: edge tier writes to
    vec_messages_edge_*, base writes to vec_messages_base_*, etc. The legacy
    suffix-free vec_messages_* tables only exist on pre-v0.4 databases.

    Falls back to 'edge' (the default tier per the CLI) if the config file
    is missing or unreadable.
    """
    try:
        with TM_CONFIG.open("r", encoding="utf-8") as f:
            cfg = json.load(f)
        return str(cfg.get("tier", "edge")).strip().lower() or "edge"
    except (OSError, json.JSONDecodeError):
        return "edge"


# Allow explicit override via env var; otherwise auto-detect from config.
ACTIVE_TIER = os.environ.get("TRUEMEMORY_TIER") or detect_active_tier()


def vec_table(suffix: str) -> str:
    """Build a tier-aware vec0 storage table name.

    suffix is one of: 'rowids', 'vector_chunks00', 'chunks', 'info'.
    Tries the tier-suffixed name first (v0.4+), falls back to the legacy
    suffix-free name (pre-v0.4) if the tier-suffixed one doesn't exist.
    """
    return f"vec_messages_{ACTIVE_TIER}_{suffix}"

# Fallback password source: a local .env file (repo root by default).
# Preferred path is the CLAUDE_USAGE_PG_PASSWORD env var; this file is only
# read if that var is unset.
PG_PASSWORD_ENV_FILE = Path(
    os.environ.get(
        "PG_PASSWORD_ENV_FILE",
        str(Path(__file__).resolve().parents[2] / ".env"),
    )
)

PG_HOST = os.environ.get("CLAUDE_USAGE_PG_HOST", "127.0.0.1")
PG_PORT = int(os.environ.get("CLAUDE_USAGE_PG_PORT", "5433"))
PG_DATABASE = os.environ.get("CLAUDE_USAGE_PG_DATABASE", "claude_usage")
PG_USER = os.environ.get("CLAUDE_USAGE_PG_USER", "claude_usage")

# UMAP / HDBSCAN knobs (tunable later)
UMAP_N_NEIGHBORS = int(os.environ.get("TM_THEMES_UMAP_N_NEIGHBORS", "15"))
UMAP_MIN_DIST = float(os.environ.get("TM_THEMES_UMAP_MIN_DIST", "0.1"))
UMAP_RANDOM_STATE = int(os.environ.get("TM_THEMES_UMAP_SEED", "42"))
HDBSCAN_MIN_CLUSTER_SIZE = int(os.environ.get("TM_THEMES_HDBSCAN_MIN_CLUSTER", "8"))
HDBSCAN_MIN_SAMPLES = int(os.environ.get("TM_THEMES_HDBSCAN_MIN_SAMPLES", "3"))


def log(msg: str) -> None:
    """Print to stdout with a [themes] prefix - matches loop wrapper's log
    capture format."""
    sys.stdout.write(f"[themes] {msg}\n")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Postgres password discovery
# ---------------------------------------------------------------------------


def load_pg_password() -> str:
    """Prefer the CLAUDE_USAGE_PG_PASSWORD env var; fall back to a local .env."""
    env_pwd = os.environ.get("CLAUDE_USAGE_PG_PASSWORD")
    if env_pwd:
        return env_pwd
    if not PG_PASSWORD_ENV_FILE.exists():
        raise SystemExit(
            "FATAL: CLAUDE_USAGE_PG_PASSWORD not set and no .env found at "
            f"{PG_PASSWORD_ENV_FILE}"
        )
    pattern = re.compile(r"^CLAUDE_USAGE_PG_PASSWORD=(.*)$")
    for line in PG_PASSWORD_ENV_FILE.read_text(encoding="utf-8").splitlines():
        m = pattern.match(line.strip())
        if m:
            return m.group(1)
    raise SystemExit(
        f"FATAL: CLAUDE_USAGE_PG_PASSWORD not present in {PG_PASSWORD_ENV_FILE}"
    )


# ---------------------------------------------------------------------------
# Read embeddings from memories.db
# ---------------------------------------------------------------------------


def open_memories_db_readonly() -> sqlite3.Connection:
    """Open memories.db with the strictest read-only posture.

    URI form `?mode=ro&immutable=1` tells SQLite (a) refuse writes, (b) assume
    no other writer will mutate the file and skip locking. The live MCP server
    holds a writer connection - immutable=1 is correct since we accept eventual
    consistency at the 1-hour cadence in exchange for never touching the WAL.
    """
    if not MEMORIES_DB.exists():
        raise SystemExit(f"FATAL: memories.db not found at {MEMORIES_DB}")
    uri = f"file:{MEMORIES_DB.as_posix()}?mode=ro&immutable=1"
    conn = sqlite3.connect(uri, uri=True, timeout=5.0)
    # Explicit query_only just in case future code paths run mutating SQL.
    conn.execute("PRAGMA query_only = ON")
    return conn


def _resolve_vec_table_pair(conn: sqlite3.Connection) -> tuple[str, str]:
    """Return (rowids_table, vector_chunks_table), preferring the tier-suffixed
    pair (v0.4+) and falling back to the legacy suffix-free pair if the
    tier-suffixed pair isn't populated.
    """
    candidates = [
        (f"vec_messages_{ACTIVE_TIER}_rowids", f"vec_messages_{ACTIVE_TIER}_vector_chunks00"),
        ("vec_messages_rowids", "vec_messages_vector_chunks00"),
    ]
    for rowids, chunks in candidates:
        try:
            n = conn.execute(f"SELECT COUNT(*) FROM {rowids}").fetchone()[0]
        except sqlite3.OperationalError:
            continue
        if n > 0:
            log(f"using vec0 storage pair: {rowids} ({n} rows) + {chunks}")
            return rowids, chunks
    raise SystemExit(
        "FATAL: no populated vec_messages_* rowids table found "
        f"(checked {[c[0] for c in candidates]})"
    )


def discover_tiers(conn: sqlite3.Connection) -> list[tuple[str, str, str]]:
    """Return [(tier_label, rowids_table, chunks_table)] for every populated
    vec_messages_* table set in the DB. Lets the scheduler compute side-by-side
    UMAP layouts for the active tier AND any orphan tier tables left over from
    previous upgrade-tier runs - so the dashboard can A/B them.

    Includes:
      - The active tier (resolved via _resolve_vec_table_pair, may be
        suffix-free if the active tier is the legacy pro tier).
      - Any vec_messages_<tier>_rowids that isn't the separation table
        (vec_messages_sep_*) and isn't the same pair already counted as
        active.
    """
    found: list[tuple[str, str, str]] = []
    active_rowids, active_chunks = _resolve_vec_table_pair(conn)
    found.append((ACTIVE_TIER, active_rowids, active_chunks))

    # Scan for other tier-suffixed primary vec tables.
    other_rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name LIKE 'vec_messages_%_rowids' "
        "AND name NOT LIKE 'vec_messages_sep_%' "
        "ORDER BY name"
    ).fetchall()
    seen_rowids = {active_rowids}
    for (tbl,) in other_rows:
        if tbl in seen_rowids:
            continue
        m = re.match(r"^vec_messages_(.+)_rowids$", tbl)
        if not m:
            continue
        tier = m.group(1)
        chunks_tbl = f"vec_messages_{tier}_vector_chunks00"
        try:
            n = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        except sqlite3.OperationalError:
            continue
        if n == 0:
            continue
        # Verify chunks table exists too.
        try:
            conn.execute(f"SELECT 1 FROM {chunks_tbl} LIMIT 1").fetchone()
        except sqlite3.OperationalError:
            continue
        log(f"also found tier '{tier}': {tbl} ({n} rows) + {chunks_tbl}")
        found.append((tier, tbl, chunks_tbl))
        seen_rowids.add(tbl)
    return found


# Content patterns from TrueMemory's own test suite — these synthetic messages
# get embedded along with real user memories but they're just stress-test
# fixtures (concurrent_store_test_fact A/B/C, gather_store A/B/C with xxx/yyy/zzz
# padding). Excluding them from the UMAP cleans up an upper-left noise cluster
# that has no semantic relationship to real corpus content. SQL LIKE patterns;
# add more as upstream test suite grows.
TEST_FIXTURE_LIKE_PATTERNS = (
    "concurrent store test fact %",
    "gather store A %",
    "gather store B %",
    "gather store C %",
)


def _excluded_test_fixture_ids(conn: sqlite3.Connection) -> set[int]:
    """Return message IDs whose content matches a TrueMemory test-fixture pattern.
    Filtered out of every tier's UMAP so the scatter shows real memories only."""
    excluded: set[int] = set()
    for pattern in TEST_FIXTURE_LIKE_PATTERNS:
        for (mid,) in conn.execute(
            "SELECT id FROM messages WHERE content LIKE ?",
            (pattern,),
        ):
            excluded.add(int(mid))
    return excluded


def read_embeddings_for_pair(
    conn: sqlite3.Connection,
    rowids_table: str,
    chunks_table: str,
    excluded_ids: set[int] | None = None,
) -> tuple[list[int], np.ndarray]:
    """Same as read_embeddings() but for a specific (rowids, chunks) pair
    rather than the auto-resolved active tier. Used by the multi-tier scheduler
    loop that iterates discover_tiers().

    `excluded_ids` (optional) — message IDs to skip during the embedding read.
    Used to drop TrueMemory stress-test fixtures from the UMAP."""
    dim = detect_embedding_dim(conn, chunks_table)

    if excluded_ids:
        # Inline the exclusion via NOT IN since the list is small (~tens, not
        # thousands) and SQLite's parameter limit isn't a concern at this scale.
        placeholders = ",".join("?" for _ in excluded_ids)
        rowids = conn.execute(
            f"SELECT rowid, chunk_id, chunk_offset FROM {rowids_table} "
            f"WHERE rowid NOT IN ({placeholders}) ORDER BY rowid",
            tuple(excluded_ids),
        ).fetchall()
    else:
        rowids = conn.execute(
            f"SELECT rowid, chunk_id, chunk_offset FROM {rowids_table} ORDER BY rowid"
        ).fetchall()
    if not rowids:
        return [], np.zeros((0, dim), dtype=np.float32)

    by_chunk: dict[int, list[tuple[int, int]]] = {}
    for rowid, chunk_id, offset in rowids:
        by_chunk.setdefault(chunk_id, []).append((rowid, offset))

    ids: list[int] = []
    vec_list: list[np.ndarray] = []
    slot_bytes = dim * 4

    for chunk_id, entries in by_chunk.items():
        blob_row = conn.execute(
            f"SELECT vectors FROM {chunks_table} WHERE rowid = ?",
            (chunk_id,),
        ).fetchone()
        if not blob_row or not blob_row[0]:
            continue
        blob: bytes = blob_row[0]
        for rowid, offset in entries:
            start = offset * slot_bytes
            end = start + slot_bytes
            if end > len(blob):
                continue
            vec = np.frombuffer(blob[start:end], dtype=np.float32)
            if vec.shape[0] != dim:
                continue
            ids.append(int(rowid))
            vec_list.append(vec)

    if not vec_list:
        return [], np.zeros((0, dim), dtype=np.float32)
    arr = np.stack(vec_list).astype(np.float32, copy=False)
    return ids, arr


def detect_embedding_dim(conn: sqlite3.Connection, chunks_table: str) -> int:
    """Inspect the chunk-storage table to derive the embedding dimensionality.

    vec0 stores 1024 slots per chunk, each slot holding `dim` float32s. So:
        slot_bytes = LEN(vectors) / 1024
        dim        = slot_bytes / 4
    """
    row = conn.execute(
        f"SELECT vectors FROM {chunks_table} LIMIT 1"
    ).fetchone()
    if not row or not row[0]:
        raise SystemExit(f"FATAL: no vector chunks found in {chunks_table}")
    blob_len = len(row[0])
    slot_bytes = blob_len // 1024  # vec0 default chunk size is 1024 slots
    if slot_bytes % 4 != 0:
        raise SystemExit(
            f"FATAL: vec_messages chunk has unexpected size ({blob_len} bytes) - "
            f"not divisible by (1024 slots * 4 bytes)"
        )
    return slot_bytes // 4


def read_embeddings(conn: sqlite3.Connection) -> tuple[list[int], np.ndarray]:
    """Pull (memory_id, embedding) pairs from the sqlite-vec storage tables.

    The vec0 virtual table `vec_messages` can't be queried without the extension
    loaded, but its underlying physical tables can:
        - vec_messages_rowids: maps (rowid -> chunk_id, chunk_offset)
        - vec_messages_vector_chunks00: holds the actual float32 blobs

    rowid in vec_messages_rowids IS the messages.id by convention (the MCP
    server inserts with explicit rowid = message.id when generating embeddings).
    Verified by inspection on memories.db rev 0.1.9.

    Returns (ids, vecs) where vecs.shape == (N, dim) float32. Memories without
    embeddings are silently skipped.
    """
    rowids_table, chunks_table = _resolve_vec_table_pair(conn)
    dim = detect_embedding_dim(conn, chunks_table)
    log(f"detected embedding dim = {dim} (tier='{ACTIVE_TIER}')")

    # Pull all rowid-to-chunk mappings
    rowids = conn.execute(
        f"SELECT rowid, chunk_id, chunk_offset FROM {rowids_table} ORDER BY rowid"
    ).fetchall()
    if not rowids:
        log(f"{rowids_table} is empty - no embeddings to project")
        return [], np.zeros((0, dim), dtype=np.float32)

    # Group lookups by chunk_id so we only fetch each chunk blob once
    by_chunk: dict[int, list[tuple[int, int]]] = {}
    for rowid, chunk_id, offset in rowids:
        by_chunk.setdefault(chunk_id, []).append((rowid, offset))

    ids: list[int] = []
    vec_list: list[np.ndarray] = []
    slot_bytes = dim * 4

    for chunk_id, entries in by_chunk.items():
        blob_row = conn.execute(
            f"SELECT vectors FROM {chunks_table} WHERE rowid = ?",
            (chunk_id,),
        ).fetchone()
        if not blob_row or not blob_row[0]:
            log(f"WARN: chunk {chunk_id} missing or empty - skipping {len(entries)} vectors")
            continue
        blob: bytes = blob_row[0]
        for rowid, offset in entries:
            start = offset * slot_bytes
            end = start + slot_bytes
            if end > len(blob):
                log(f"WARN: chunk {chunk_id} too small for offset {offset}")
                continue
            vec = np.frombuffer(blob[start:end], dtype=np.float32)
            if vec.shape[0] != dim:
                log(f"WARN: unexpected vec shape {vec.shape} at rowid {rowid}")
                continue
            ids.append(int(rowid))
            vec_list.append(vec)

    if not vec_list:
        return [], np.zeros((0, dim), dtype=np.float32)
    arr = np.stack(vec_list).astype(np.float32, copy=False)
    return ids, arr


def read_message_metadata(conn: sqlite3.Connection, ids: Iterable[int]) -> dict[int, dict]:
    """Pull category + content for the given memory ids.

    Used to derive cluster_name (majority category per HDBSCAN cluster).
    """
    id_list = list(ids)
    if not id_list:
        return {}
    out: dict[int, dict] = {}
    # SQLite parameter limit defaults to 999; chunk to be safe.
    CHUNK = 500
    for i in range(0, len(id_list), CHUNK):
        sub = id_list[i : i + CHUNK]
        placeholders = ",".join("?" for _ in sub)
        rows = conn.execute(
            f"SELECT id, category FROM messages WHERE id IN ({placeholders})",
            sub,
        ).fetchall()
        for mid, cat in rows:
            out[int(mid)] = {"category": (cat or "").strip() or None}
    return out


# ---------------------------------------------------------------------------
# UMAP + HDBSCAN
# ---------------------------------------------------------------------------


def compute_layout(vecs: np.ndarray) -> np.ndarray:
    """Project N-dim embeddings to 2D via UMAP.

    Tuning notes:
    - n_neighbors=15 is the UMAP default; good for ~hundreds to ~thousands of
      points. Lower preserves local structure (tight clusters), higher
      preserves global structure (spread).
    - min_dist=0.1 keeps clusters tight.
    - random_state=42 makes runs reproducible (UMAP is stochastic otherwise).
    - n_components=2 - we only render a 2D scatter.
    """
    if len(vecs) < 2:
        # UMAP can't fit on N<2; treat as a degenerate layout at origin.
        return np.zeros((len(vecs), 2), dtype=np.float32)
    # n_neighbors must be < n_samples - guard tiny corpora.
    n_neighbors = min(UMAP_N_NEIGHBORS, len(vecs) - 1)
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=UMAP_MIN_DIST,
        random_state=UMAP_RANDOM_STATE,
        metric="cosine",  # voyage embeddings are unit-normalized
    )
    return reducer.fit_transform(vecs).astype(np.float32, copy=False)


def cluster_labels(coords: np.ndarray) -> np.ndarray:
    """Fit HDBSCAN on the 2D coords and return integer labels.

    Returns -1 for noise points (HDBSCAN convention).
    """
    if len(coords) < HDBSCAN_MIN_CLUSTER_SIZE:
        # Not enough points to form any cluster - everything is noise.
        return np.full(len(coords), -1, dtype=np.int32)
    clusterer = HDBSCAN(
        min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE,
        min_samples=HDBSCAN_MIN_SAMPLES,
    )
    labels = clusterer.fit_predict(coords)
    return labels.astype(np.int32, copy=False)


def derive_cluster_names(
    labels: np.ndarray,
    ids: list[int],
    meta: dict[int, dict],
) -> dict[int, str]:
    """For each non-noise cluster, pick the most common non-NULL category.

    Returns {cluster_label: cluster_name}. Noise (label=-1) gets "(noise)".
    Clusters whose members are all NULL-category get "(unlabeled)".
    """
    out: dict[int, str] = {-1: "(noise)"}
    unique_clusters = set(int(l) for l in labels if l != -1)
    for cluster in unique_clusters:
        cats: list[str] = []
        for i, lbl in enumerate(labels):
            if int(lbl) == cluster:
                cat = meta.get(ids[i], {}).get("category")
                if cat:
                    cats.append(cat)
        if not cats:
            out[cluster] = "(unlabeled)"
        else:
            # Most common category
            from collections import Counter

            most_common, _ = Counter(cats).most_common(1)[0]
            out[cluster] = most_common
    return out


# ---------------------------------------------------------------------------
# Write to Postgres
# ---------------------------------------------------------------------------


def write_cache_for_tier(
    pg: psycopg.Connection,
    tier: str,
    ids: list[int],
    coords: np.ndarray,
    labels: np.ndarray,
    cluster_names: dict[int, str],
) -> int:
    """Replace the cache rows for a single tier (composite PK is
    (memory_id, tier) per migration 08). Does NOT touch other tiers' rows.
    Atomic per-tier replace under one transaction."""
    if not ids:
        with pg.cursor() as cur:
            cur.execute("DELETE FROM tm_themes_cache WHERE tier = %s", (tier,))
            pg.commit()
        return 0

    with pg.cursor() as cur:
        cur.execute("SELECT id FROM tm_memories WHERE id = ANY(%s)", (ids,))
        mirrored = {int(r[0]) for r in cur.fetchall()}
    skipped = [i for i in ids if i not in mirrored]
    if skipped:
        log(f"  [{tier}] skipping {len(skipped)} memories not yet mirrored")

    rows_to_insert: list[tuple[int, float, float, int, str | None, str]] = []
    for i, mid in enumerate(ids):
        if mid not in mirrored:
            continue
        lbl = int(labels[i])
        name = cluster_names.get(lbl)
        rows_to_insert.append(
            (int(mid), float(coords[i, 0]), float(coords[i, 1]), lbl, name, tier)
        )

    with pg.cursor() as cur:
        cur.execute("DELETE FROM tm_themes_cache WHERE tier = %s", (tier,))
        if rows_to_insert:
            cur.executemany(
                """INSERT INTO tm_themes_cache
                       (memory_id, x, y, cluster_label, cluster_name, computed_at, tier)
                   VALUES (%s, %s, %s, %s, %s, NOW(), %s)""",
                rows_to_insert,
            )
        pg.commit()
    return len(rows_to_insert)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run_once() -> int:
    """Compute UMAP+HDBSCAN for every populated tier and write to tm_themes_cache
    tagged with the tier name. Lets the dashboard A/B layouts side-by-side."""
    started = time.time()
    sqlite_conn = open_memories_db_readonly()
    total_written = 0
    try:
        total_messages = sqlite_conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        tiers = discover_tiers(sqlite_conn)
        excluded_ids = _excluded_test_fixture_ids(sqlite_conn)
        log(f"corpus: {total_messages} messages, {len(tiers)} tier(s) to compute: "
            f"{[t[0] for t in tiers]} (excluding {len(excluded_ids)} test-fixture ids)")

        pg_password = load_pg_password()
        with psycopg.connect(
            host=PG_HOST,
            port=PG_PORT,
            dbname=PG_DATABASE,
            user=PG_USER,
            password=pg_password,
        ) as pg:
            for tier, rowids_tbl, chunks_tbl in tiers:
                t_start = time.time()
                ids, vecs = read_embeddings_for_pair(
                    sqlite_conn, rowids_tbl, chunks_tbl, excluded_ids=excluded_ids
                )
                if len(ids) == 0:
                    log(f"  [{tier}] empty - clearing cache for this tier")
                    write_cache_for_tier(pg, tier, [], np.zeros((0, 2), dtype=np.float32), np.array([]), {})
                    continue

                coords = compute_layout(vecs)
                labels = cluster_labels(coords)
                meta = read_message_metadata(sqlite_conn, ids)
                cluster_names = derive_cluster_names(labels, ids, meta)
                n_clusters = len([c for c in cluster_names if c != -1])
                noise = int((labels == -1).sum())
                written = write_cache_for_tier(pg, tier, ids, coords, labels, cluster_names)
                total_written += written
                log(
                    f"  [{tier}] {len(ids)} embeddings, "
                    f"{n_clusters} clusters + {noise} noise, "
                    f"wrote {written} rows in {time.time() - t_start:.1f}s"
                )
        elapsed = time.time() - started
        log(f"done: wrote {total_written} rows across {len(tiers)} tier(s) in {elapsed:.1f}s")
        return total_written
    finally:
        sqlite_conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute UMAP themes cache for TrueMemory dashboard")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single recompute and exit. Default behavior is also one-shot; "
        "the wrapper loop in scripts/run-themes-loop.ps1 handles the interval.",
    )
    parser.parse_args()
    try:
        run_once()
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
