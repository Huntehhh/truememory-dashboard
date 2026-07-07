"""POST /simulate — stage-by-stage retrieval decomposition.

Reproduces the six-stage engine.search() pipeline as inspectable output:

    fts  →  vector  →  rrf_fusion  →  salience_guard  →  surprise_boost  →  reranker

Every candidate carries a ``score_space`` tag so downstream renderers never
compare apples to oranges (BM25 rank ≠ cosine similarity ≠ RRF ≠ rerank).

The authoritative row is a real ``Memory.search()`` call with the requested
skip flags — the stage view is a decomposition for insight, not an
alternative pipeline. Divergence between the stage-final ids and the
authoritative ids is surfaced as ``divergence: true`` so the UI can flag it.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from tm_sidecar.engine_holder import run_engine

router = APIRouter()

# ---------------------------------------------------------------------------
# Recall-gate reasons — mirror truememory.ingest.hooks.user_prompt_submit.
# ---------------------------------------------------------------------------
# These constants are re-derived from the hook module so a source change
# there ripples in via version bump, not via a stale local copy.

from truememory.ingest.hooks import user_prompt_submit as _hook  # noqa: E402

_CODE_RE: re.Pattern[str] = _hook._CODE_RE
_RECALL_RE: re.Pattern[str] = _hook._RECALL_RE
_detect_recall = _hook._detect_recall


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class _Skip(BaseModel):
    reranker: bool = True
    salience_guard: bool = False
    surprise_boost: bool = False


class _Hook(BaseModel):
    budget_chars: int | None = None
    max_items: int | None = None


class SimulateRequest(BaseModel):
    query: str
    limit: int = 10
    skip: _Skip = Field(default_factory=_Skip)
    hook: _Hook | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PREVIEW_CHARS = 300
_DEFAULT_BUDGET_CHARS = 8192
_DEFAULT_MEMORY_CHARS = 500


def _preview(content: str) -> str:
    """First 300 chars for stage output — long memories would blow the payload."""
    if not isinstance(content, str):
        return ""
    return content[:_PREVIEW_CHARS]


def _project_row(row: dict, score_space: str, extras: dict | None = None) -> dict:
    """Compact per-candidate projection used by every stage."""
    out = {
        "id": row.get("id"),
        "content_preview": _preview(row.get("content", "")),
        "score": row.get("score"),
        "score_space": score_space,
    }
    if extras:
        out["extra"] = extras
    return out


def _hook_gate(query: str) -> dict:
    """Reproduce ``user_prompt_submit._detect_recall`` with human-readable reasons.

    Returns the same bool the real hook returns, plus the individual gates that
    fired so the UI can explain "why". Cadence is a note only — proactive
    recall depends on the running config's ``search_intensity`` which we
    surface from the on-disk config file when available.
    """
    reasons: list[str] = []
    length = len(query)
    if length < 10:
        reasons.append(f"length_too_short ({length} < 10)")
    elif length > 500:
        reasons.append(f"length_too_long ({length} > 500)")
    else:
        reasons.append(f"length_ok ({length})")

    code_hit = bool(_CODE_RE.search(query))
    if code_hit:
        reasons.append("code_heavy")

    recall_hit = bool(_RECALL_RE.search(query))
    reasons.append("recall_pattern_matched" if recall_hit else "no_recall_pattern")

    would_fire = _detect_recall(query)

    # Best-effort intensity read — mirrors _hook._get_intensity_config().
    try:
        search_intensity, _ = _hook._get_intensity_config()
    except Exception:  # pragma: no cover
        search_intensity = "standard"

    if search_intensity == "standard":
        cadence_note = "standard: fires on recall-intent detection only"
    elif search_intensity == "enhanced":
        cadence_note = "enhanced: every 5th prompt + recall-intent fallback"
    else:
        cadence_note = "max: every prompt gets a memory search"

    return {
        "would_fire": would_fire,
        "reasons": reasons,
        "search_intensity": search_intensity,
        "cadence_note": cadence_note,
    }


def _run_stages(engine: Any, req: SimulateRequest) -> dict:
    """Compute all six stages + authoritative + injection_preview.

    Runs entirely under the engine holder lock (invoked via ``run_engine``).
    """
    from truememory.fts_search import search_fts
    from truememory.hybrid import reciprocal_rank_fusion
    from truememory.salience import apply_salience_guard

    # Force lazy SQLite connect + capability sniff. Every public engine
    # method (search / get / update / delete) opens on demand, but here we
    # touch conn directly for the FTS stage so we prime it explicitly.
    engine._engine._ensure_connection()  # noqa: SLF001
    conn = engine._engine.conn  # noqa: SLF001 — internal by design in the sidecar
    query = req.query
    limit = req.limit

    # 1. FTS ---------------------------------------------------------------
    fts_pool = 200
    fts_results = search_fts(conn, query, limit=fts_pool)
    fts_stage = {
        "name": "fts",
        "candidate_count": len(fts_results),
        "candidates": [
            _project_row(
                r,
                score_space="bm25_rank",
                extras={"raw_score": r.get("raw_score")},
            )
            for r in fts_results[:limit]
        ],
    }

    # 2. Vector (raw cosine) ----------------------------------------------
    # Memory.search_vectors_raw swallows every exception and returns None,
    # which is genuinely useful in production but useless for stage debugging.
    # Call the underlying vector_search.search_vector_raw directly so we can
    # surface the actual failure reason ("vector table missing", "model
    # server timeout", etc.) alongside the sidecar's `available` flag.
    vec_results: list[dict] = []
    vec_available = True
    vec_error: str | None = None
    try:
        from truememory.vector_search import search_vector_raw
        raw = search_vector_raw(conn, query, limit=fts_pool)
        if raw is None:
            vec_available = False
        else:
            vec_results = list(raw)
    except Exception as exc:
        vec_available = False
        vec_error = f"{exc.__class__.__name__}: {exc}"

    vector_stage = {
        "name": "vector",
        "available": vec_available,
        "error": vec_error,
        "candidate_count": len(vec_results),
        "candidates": [
            _project_row(r, score_space="cosine")
            for r in vec_results[:limit]
        ],
    }

    # 3. RRF fusion --------------------------------------------------------
    # Build rank maps so each fused candidate carries provenance the same
    # way ``hybrid.search_hybrid`` does. Do NOT rerun search_hybrid — that
    # would re-embed the query on the model server. Fuse locally.
    fts_ranks = {str(r["id"]): i + 1 for i, r in enumerate(fts_results) if r.get("id") is not None}
    vec_ranks = {str(r["id"]): i + 1 for i, r in enumerate(vec_results) if r.get("id") is not None}
    fused = reciprocal_rank_fusion([fts_results, vec_results])
    for f in fused:
        key = str(f.get("id", ""))
        f["fts_rank"] = fts_ranks.get(key)
        f["vec_rank"] = vec_ranks.get(key)
        srcs = []
        if f["fts_rank"] is not None:
            srcs.append("fts")
        if f["vec_rank"] is not None:
            srcs.append("vec")
        f["source"] = "+".join(srcs) if srcs else "unknown"

    rrf_stage = {
        "name": "rrf_fusion",
        "candidate_count": len(fused),
        "candidates": [
            _project_row(
                r,
                score_space="rrf",
                extras={
                    "rrf_score": r.get("rrf_score"),
                    "fts_rank": r.get("fts_rank"),
                    "vec_rank": r.get("vec_rank"),
                    "source": r.get("source"),
                },
            )
            for r in fused[:limit]
        ],
    }

    # 4. Salience guard ----------------------------------------------------
    # Mirror engine.search()'s threshold pick (spotlight=0.05, diffuse=0.02).
    # We don't rerun query classification — take the spotlight default which
    # is what the majority of production queries fall into.
    min_sal = 0.05
    pre_salience = [dict(r) for r in fused[:limit * 3]]
    if req.skip.salience_guard:
        salience_stage = {
            "name": "salience_guard",
            "skipped": True,
            "min_salience": min_sal,
            "candidates": [
                _project_row(r, score_space="rrf", extras={"skipped": True})
                for r in pre_salience[:limit]
            ],
        }
        after_salience = pre_salience
    else:
        after_salience = apply_salience_guard(
            pre_salience, query, conn=conn, min_salience=min_sal,
        )
        kept_ids = {r.get("id") for r in after_salience}
        candidates = []
        for r in pre_salience[:limit]:
            sal = r.get("salience")
            candidates.append(
                _project_row(
                    r,
                    score_space="blended",
                    extras={
                        "salience": sal,
                        "min_salience": min_sal,
                        "margin": (sal - min_sal) if isinstance(sal, (int, float)) else None,
                        "passed": r.get("id") in kept_ids,
                        "entity_boost": r.get("entity_boost"),
                    },
                )
            )
        salience_stage = {
            "name": "salience_guard",
            "skipped": False,
            "min_salience": min_sal,
            "kept_count": len(after_salience),
            "candidates": candidates,
        }

    # 5. Surprise boost ----------------------------------------------------
    if req.skip.surprise_boost:
        after_surprise = [dict(r) for r in after_salience]
        surprise_stage = {
            "name": "surprise_boost",
            "skipped": True,
            "candidates": [
                _project_row(r, score_space="blended", extras={"skipped": True})
                for r in after_surprise[:limit]
            ],
        }
    else:
        pre_scores = {
            r.get("id"): r.get("score")
            for r in after_salience
            if r.get("id") is not None
        }
        try:
            after_surprise = engine._engine._apply_surprise_boost(  # noqa: SLF001
                [dict(r) for r in after_salience]
            )
        except Exception:
            after_surprise = [dict(r) for r in after_salience]
        candidates = []
        for r in after_surprise[:limit]:
            rid = r.get("id")
            before = pre_scores.get(rid)
            after = r.get("score")
            if isinstance(before, (int, float)) and isinstance(after, (int, float)):
                delta = round(after - before, 8)
            else:
                delta = None
            candidates.append(
                _project_row(
                    r,
                    score_space="blended",
                    extras={
                        "score_before": before,
                        "score_after": after,
                        "delta": delta,
                        "surprise": r.get("surprise"),
                    },
                )
            )
        surprise_stage = {
            "name": "surprise_boost",
            "skipped": False,
            "candidates": candidates,
        }

    # 6. Reranker (via ablation flag on the real search) -------------------
    # The reranker's rank_before / rank_after view is only meaningful when
    # compared to the pre-rerank ordering — which is exactly what
    # ``after_surprise`` is. Compute rank_before from that list and, when
    # not skipping, run a fresh search() with reranker enabled for the
    # authoritative ordering.
    rank_before = {
        r.get("id"): i + 1
        for i, r in enumerate(after_surprise)
        if r.get("id") is not None
    }
    if req.skip.reranker:
        reranker_stage = {
            "name": "reranker",
            "skipped": True,
            "candidates": [
                {
                    "id": r.get("id"),
                    "content_preview": _preview(r.get("content", "")),
                    "score_space": "rerank",
                    "SKIPPED": True,
                    "rank_before": rank_before.get(r.get("id")),
                    "rank_after": None,
                }
                for r in after_surprise[:limit]
            ],
        }
    else:
        reranked = engine.search(query, limit=limit, _skip_reranker=False)
        rank_after = {
            r.get("id"): i + 1
            for i, r in enumerate(reranked)
            if r.get("id") is not None
        }
        reranker_stage = {
            "name": "reranker",
            "skipped": False,
            "candidates": [
                _project_row(
                    r,
                    score_space="rerank",
                    extras={
                        "rank_before": rank_before.get(r.get("id")),
                        "rank_after": rank_after.get(r.get("id")),
                    },
                )
                for r in reranked[:limit]
            ],
        }

    # ── Authoritative ────────────────────────────────────────────────────
    authoritative = engine.search(
        query, limit=limit, _skip_reranker=req.skip.reranker,
    )
    auth_ids = [r.get("id") for r in authoritative]

    # Final stage ids depend on whether reranker ran.
    if req.skip.reranker:
        final_ids = [r.get("id") for r in after_surprise[:limit]]
    else:
        final_ids = [c["id"] for c in reranker_stage["candidates"]]

    divergence = auth_ids != final_ids

    # ── Injection preview ────────────────────────────────────────────────
    injection_preview = _build_injection_preview(
        authoritative, hook=req.hook,
    )

    return {
        "query": query,
        "hook_gate": _hook_gate(query),
        "stages": [
            fts_stage,
            vector_stage,
            rrf_stage,
            salience_stage,
            surprise_stage,
            reranker_stage,
        ],
        "authoritative": {
            "count": len(authoritative),
            "results": [
                {
                    "id": r.get("id"),
                    "content_preview": _preview(r.get("content", "")),
                    "score": r.get("score"),
                    "source": r.get("source"),
                    "category": r.get("category"),
                    "sender": r.get("sender"),
                    "timestamp": r.get("timestamp"),
                }
                for r in authoritative
            ],
        },
        "divergence": divergence,
        "injection_preview": injection_preview,
    }


def _build_injection_preview(results: list[dict], hook: _Hook | None) -> dict:
    """Assemble a session-start-style injection preview under budget.

    Mirrors ``session_start._truncate_memory`` + ``_apply_budget`` — but keeps
    the wire shape ID/text focused for the UI (no wrapper XML). Callers pass
    optional ``budget_chars`` / ``max_items`` to override the defaults.
    """
    budget = _DEFAULT_BUDGET_CHARS if hook is None or hook.budget_chars is None else int(hook.budget_chars)
    per_memory = _DEFAULT_MEMORY_CHARS
    max_items = None if hook is None else hook.max_items

    included: list[dict] = []
    truncated: list[int] = []
    dropped: list[int] = []
    total = 0

    # First pass — build candidate lines with per-memory truncation.
    lines: list[tuple[int | None, str, float]] = []
    for r in results:
        content = (r.get("content") or "").strip()
        if not content:
            continue
        if len(content) > per_memory:
            content = content[:per_memory].rstrip() + f" [truncated, id={r.get('id', '?')} — use truememory_get]"
            truncated.append(r.get("id"))
        formatted = f"- {content}"
        lines.append((r.get("id"), formatted, r.get("score", 0.0) or 0.0))

    # Optional hard cap on count.
    if isinstance(max_items, int) and max_items >= 0:
        # Keep highest-score first before capping.
        lines.sort(key=lambda t: (-t[2], str(t[0])))
        lines = lines[:max_items]

    # Second pass — enforce budget (drop lowest-score first).
    lines_sorted = sorted(lines, key=lambda t: t[2])
    dropped_ids: set[int | None] = set()
    running = sum(len(l) for _, l, _ in lines)
    for rid, text, _ in lines_sorted:
        if running <= budget:
            break
        running -= len(text)
        dropped_ids.add(rid)

    kept_lines: list[str] = []
    for rid, text, _ in lines:
        if rid in dropped_ids:
            dropped.append(rid)
            continue
        included.append({"id": rid, "text": text})
        kept_lines.append(text)
        total += len(text)

    return {
        "text": "\n".join(kept_lines),
        "chars_used": total,
        "budget": budget,
        "per_memory_chars": per_memory,
        "included_ids": [x["id"] for x in included],
        "truncated_ids": truncated,
        "dropped_ids": dropped,
    }


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post("/simulate")
async def simulate(req: SimulateRequest) -> dict:
    return await run_engine(lambda engine: _run_stages(engine, req))
