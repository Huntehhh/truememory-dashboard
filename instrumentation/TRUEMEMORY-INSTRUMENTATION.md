# TrueMemory Instrumentation — Data Contract for the Dashboard

This dashboard is **read-only**. It never modifies TrueMemory. It observes
TrueMemory through three artifacts the engine produces locally:

| Source artifact | Mirrored to (Postgres) | Powers which pages |
|---|---|---|
| SQLite `messages` table in `memories.db` | `tm_memories` | overview, feed, by-category, aging, themes |
| SQLite `telemetry` table in `memories.db` | `tm_telemetry` | overview (gate pass rate, retrievals), encoding-gate |
| `~/.truememory/logs/mcp-debug.log` (line-parsed) | `tm_log_events` | operations, parts of open-loops |

The mirror (`src/mirror/truememory.ts`) reads all three on a 5-minute poll and
upserts into Postgres. **No TrueMemory code is required for the mirror to run** —
it only needs read access to the files.

## What works on a stock TrueMemory vs. what needs instrumentation

### Works out of the box
`messages` and `telemetry` are core TrueMemory tables. Any reasonably current
TrueMemory build populates them, so these pages light up with zero extra work:
**overview, feed, by-category, aging, themes**.

> Themes also needs the optional Python UMAP loop (`scripts/run-themes-loop.ps1`)
> to populate `tm_themes_cache`. See the repo README.

### Needs diagnostic logging enabled
The **operations**, **encoding-gate**, and **open-loops** pages read richer
signals that a stock TrueMemory does not emit by default:

- **`tm_log_events`** comes from parsing `mcp-debug.log`. That file is only
  produced if TrueMemory writes structured diagnostic lines (search/reranker/
  llm_call/store durations, backlog drainer ticks, errors). The dashboard
  expects these `event_type` values: `search`, `reranker`, `reranker_done`,
  `llm_call`, `store`, `m.add()`, `parallel_search`, `_backlog_drainer`, plus a
  `level` field (`info`/`error`) and a `duration_ms` field where applicable.
- **Gate signals** in `tm_telemetry`: `signal IN ('gate_decision','gate_eval')`
  with `value_text = 'pass' | 'reject'`, and `signal = 'memory_returned'` for
  retrieval counts.

If those signals are absent, the affected panels render empty (graceful
degradation) — nothing breaks.

## The watcher files in this folder

Two **additive, self-contained** Python modules are included as reference. They
write flat files only and never touch TrueMemory's database or core logic:

- **`_injection_log.py`** — records what each TrueMemory hook injected into
  Claude's context. Writes `~/.truememory/last-injection.json` (latest) and
  `~/.truememory/injections.log` (rolling JSONL, 5 MB rotation). Designed to
  never raise. Useful for an "injection visibility" panel; not currently wired
  into the dashboard's Postgres mirror.
- **`_session_dedup.py`** — tracks which memory IDs were already injected in a
  session to prevent re-injection on turn-based recall. Writes
  `~/.truememory/turn_injected/<session>.json`. Side-effect state, not telemetry.

These are dropped here as a starting point because they are the cleanly
separable part of the instrumentation. They import nothing from TrueMemory
internals — you can call `write_injection(...)` from any hook.

## Honest note on the `mcp-debug.log` signal

In the original author's setup, the structured `mcp-debug.log` lines were
produced by a small `_dlog()` diagnostic logger **woven into TrueMemory's
`mcp_server.py`**, on a branch that also carried unrelated behavioral changes
(async MCP handlers, an embedding-lock fix, a search timeout). In other words,
the `tm_log_events`-powering instrumentation was *not* a clean standalone patch
— it lived inside the engine.

**Recommended path for the TrueMemory maintainer:** rather than ship a fragile
overlay, fold a first-class diagnostic-logging module into TrueMemory that emits
the `event_type`/`duration_ms`/`level` lines above (to `mcp-debug.log` or, better,
straight to a structured sink). Since you own the engine, this is a few clean
log calls at the search/rerank/store boundaries — no overlay, no patching. The
dashboard will consume it as-is via the mirror's log parser.

## Contract summary (what the engine must emit for full coverage)

```
memories.db:
  messages   table  -> id, content/text, category, salience, created_at, embeddings
  telemetry  table  -> ts, signal, value_text   (gate_decision|gate_eval|memory_returned)

mcp-debug.log (one structured line per event):
  ts, level(info|error), event_type, message, duration_ms?, pid?, tid?
  event_type in: search | reranker | reranker_done | llm_call | store |
                 m.add() | parallel_search | _backlog_drainer
```

Match those and every page populates. Miss the log signals and you still get
the five core pages — the dashboard is built to degrade, not crash.
