# TrueMemory Observatory Sidecar

FastAPI service that imports the real `truememory` package and exposes:

- Stage-by-stage retrieval simulation (`/simulate`)
- Live injection + store event stream over SSE (`/events`)
- Two-phase curation write-ops (`/curation/*`, `/directives`)
- Instant health probe (`/health`)

The dashboard's Express server proxies `/api/sim/*` here; nothing else on
the box speaks to this port directly.

## Layout

```
sidecar/
  tm_sidecar/
    __init__.py        Package marker.
    config.py          One source of truth for TM home, DB path, port.
    engine_holder.py   Lazy Memory() singleton + threading.Lock + idle unload.
    app.py             FastAPI factory (lifespan does NOT load models).
    simulate.py        POST /simulate — six-stage decomposition.
    events.py          GET /events — SSE from injections.log + stores.log.
    curation.py        POST /curation/preview-forget|forget|recategorize.
    directives.py      GET/POST/DELETE /directives + preview-delete.
  requirements.txt     Just fastapi/uvicorn/sse-starlette; truememory is editable elsewhere.
  README.md            This file.
```

## Environment

| Variable | Default | Notes |
|---|---|---|
| `TRUEMEMORY_HOME` | `~/.truememory` | Root of TrueMemory data (logs, config). |
| `TRUEMEMORY_DB_PATH` | `<HOME>/memories.db` | SQLite DB path (WAL — safe to read while writers are active). |
| `TM_SIDECAR_HOST` | `127.0.0.1` | Loopback only. Do not expose to the LAN. |
| `TM_SIDECAR_PORT` | `8504` | Matches `TM_SIDECAR_PORT` in the dashboard server. |
| `TM_SIDECAR_IDLE_UNLOAD_SECONDS` | `600` | Idle time before the cross-encoder reranker is released. `0` disables. |
| `TM_SIDECAR_PYTHON` | `S:\LIBRARIES\Python313\python.exe` | Path to the signed interpreter used by the loop script. |

## Launch (Windows, ASR-safe)

```powershell
& "S:\LIBRARIES\Python313\python.exe" -m uvicorn `
    tm_sidecar.app:app `
    --host 127.0.0.1 `
    --port 8504 `
    --app-dir "S:\HApps\truememory-dashboard\sidecar"
```

`python.exe` is Authenticode-signed (PSF); `uvicorn.exe` is a per-install
trampoline that trips ASR rule `01443614`. Always invoke via `-m uvicorn`.

Under the startup orchestrator use `scripts\start-sidecar.vbs`, which
spawns `run-sidecar-loop.ps1` hidden with restart-on-crash.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | `/health` | Cheap probe: `{ok, tm_version, db_path, engine_loaded, uptime_s}`. No engine touch. |
| POST | `/simulate` | See below. |
| GET  | `/events` | SSE: `event: hello` on connect, `event: injection` / `event: store` on log tail, `event: ping` every 15s. |
| POST | `/curation/preview-forget` | `{memory_id}` → `{memory, neighbors[5], confirm_token, expires_in_seconds}`. |
| POST | `/curation/preview-recategorize` | Same shape but issues a token bound to `recategorize`. |
| POST | `/curation/forget` | `{memory_id, confirm_token}` → `{ok, audit_id}`. Appends `logs/curation-audit.jsonl`. |
| POST | `/curation/recategorize` | `{memory_id, category, confirm_token}` → `{ok, audit_id, memory}`. |
| GET  | `/directives?user_id=` | List all directives (rows with `directive=1`). |
| POST | `/directives` | `{content, user_id?}` → engine `add(..., directive=True)`. |
| GET  | `/directives/preview-delete/{id}` | Validate that `id` is a directive; issue a delete token. |
| DELETE | `/directives/{id}` | `{confirm_token}` → engine `delete(id)`. |

### /simulate request

```json
{
  "query": "what are Hunter's package manager preferences",
  "limit": 10,
  "skip":  { "reranker": true, "salience_guard": false, "surprise_boost": false },
  "hook":  { "budget_chars": 8192, "max_items": null }
}
```

Response shape:

```jsonc
{
  "query": "...",
  "hook_gate": {
    "would_fire": true,
    "reasons": ["length_ok (57)", "recall_pattern_matched"],
    "search_intensity": "standard",
    "cadence_note": "standard: fires on recall-intent detection only"
  },
  "stages": [
    { "name": "fts",            "candidates": [ { "id":..., "content_preview":..., "score":..., "score_space": "bm25_rank", "extra":{...} } ] },
    { "name": "vector",         "available": true, "candidates": [ ... "score_space":"cosine" ... ] },
    { "name": "rrf_fusion",     "candidates": [ ... "score_space":"rrf", "extra":{ "rrf_score":..., "fts_rank":..., "vec_rank":..., "source":"fts+vec" } ... ] },
    { "name": "salience_guard", "min_salience": 0.05, "kept_count": 7,
      "candidates": [ ... "score_space":"blended", "extra":{ "salience":..., "passed":..., "margin":..., "entity_boost":... } ... ] },
    { "name": "surprise_boost", "candidates": [ ... "score_space":"blended", "extra":{ "score_before":..., "score_after":..., "delta":..., "surprise":... } ... ] },
    { "name": "reranker",       "skipped": true,  "candidates": [ ... "SKIPPED": true, "rank_before":..., "rank_after": null ... ] }
  ],
  "authoritative": { "count": 10, "results": [ ... ] },
  "divergence": false,
  "injection_preview": {
    "text": "- ...\n- ...",
    "chars_used": 1234,
    "budget": 8192,
    "per_memory_chars": 500,
    "included_ids": [...],
    "truncated_ids": [...],
    "dropped_ids": [...]
  }
}
```

Score spaces:

- `bm25_rank` — FTS5 BM25, `search_fts` post-normalized to 0–1 relative-to-top-hit.
- `cosine` — absolute cosine similarity in `[0, 1]` from `search_vectors_raw`.
- `rrf` — Reciprocal Rank Fusion score `Σ 1/(60+rank)`.
- `blended` — RRF baseline with salience filter or L5 boost applied.
- `rerank` — cross-encoder rerank output (`rerank_with_modality_fusion` fusion).

Never compare across spaces — that's the whole point of the tag.

## Curation two-phase discipline

1. UI calls `/curation/preview-forget` (or `preview-recategorize`) → gets a
   `confirm_token` valid for 60 seconds.
2. UI calls `/curation/forget` (or `recategorize`) with the same token.
3. Sidecar HMAC-validates the token, executes the engine op, appends a
   before-snapshot to `logs/curation-audit.jsonl`.

Tokens rotate on every sidecar restart (per-boot secret). No undo endpoint
exists; recovery is manual via the audit log's `before_snapshot`.
