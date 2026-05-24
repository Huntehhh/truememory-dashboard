# TrueMemory Dashboard

A read-only observability dashboard for [TrueMemory](https://github.com/truememory/truememory). It mirrors your local TrueMemory SQLite store into Postgres, refreshes materialized views every 30 seconds, and serves 10 static HTML pages that let you see the health, aging, and behavioral patterns of your memory store at a glance.

<!-- screenshot: dashboard/memory/04-aging.html -->

---

## Features

- **Overview** — total memory counts, recent ingestion rate, store health at a glance
- **Feed** — chronological stream of all stored memories with full text
- **By Category** — memories grouped by semantic category; spot imbalances
- **Aging** — memory decay curves; see what's due for reinforcement
- **Themes (UMAP)** — 2D projection of memory embeddings; requires optional Python deps
- **Operations** — ingestion pipeline events (mirror, encode, store); requires instrumentation
- **Encoding Gate** — gate pass/fail telemetry; requires instrumentation
- **Open Loops** — unresolved context threads flagged during ingestion; requires instrumentation
- **Lifecycle** — end-to-end trace of a memory from capture to storage
- **Index** — entry page; navigates to all of the above

The first five pages work against a stock TrueMemory install. The operations, encoding-gate, and open-loops pages depend on TrueMemory emitting diagnostic events — see `instrumentation/TRUEMEMORY-INSTRUMENTATION.md` for the data contract and how to enable it.

---

## Architecture

```
~/.truememory/memories.db  (SQLite)
~/.truememory/logs/mcp-debug.log
         │
         ▼  5-min poll
   mirror  (Node, src/mirror/truememory.ts)
         │
         ▼
   Postgres  tm_* tables  (127.0.0.1:5433, Docker)
         │
         ▼  every 30 s
   materialized views
         │
         ▼
   Express server  (read-only PG role, src/server/)
         │
         ▼
   dashboard HTML  (dashboard/memory/, fetches /api/memory/* same-origin)
```

The Postgres container is the only Docker service. The mirror, matview refresher, and Express server are Node processes you run locally.

---

## Quick Start

See **[INSTALL.md](INSTALL.md)** for the full step-by-step setup with troubleshooting. The short version:

```sh
cp .env.example .env        # set CLAUDE_USAGE_PG_PASSWORD and CLAUDE_USAGE_PG_RO_PASSWORD
docker compose up -d        # start Postgres, initialize schema
# rotate the RO role password (one-time — see INSTALL.md step 3)
npm install && npm run build
npm run mirror &            # start mirror
npm run refresh-matviews &  # start matview refresher
npm run server              # start Express server
# open http://127.0.0.1:8503/
```

---

## Project Layout

```
src/
  mirror/         # SQLite → Postgres sync (truememory.ts)
  server/         # Express API server (read-only PG role)
dashboard/
  memory/         # 10 static HTML pages (00-index … 09-lifecycle)
sql/
  init/           # SQL files that initialize the schema on first compose up
scripts/
  run-mirror-loop.ps1         # Windows: restart-on-crash wrapper for mirror
  run-refresh-loop.ps1        # Windows: restart-on-crash wrapper for matview refresher
  run-server-loop.ps1         # Windows: restart-on-crash wrapper for server
  run-themes-loop.ps1         # Windows: restart-on-crash wrapper for UMAP themes
instrumentation/
  TRUEMEMORY-INSTRUMENTATION.md  # data contract for operations/gate/open-loops pages
docker-compose.yml            # single service: truememory-dashboard-pg (postgres:17.2-alpine)
.env.example                  # template for all required and optional env vars
```

---

## Configuration

All configuration is via `.env`. Copy `.env.example` and fill in the two required passwords; everything else has working defaults.

| Variable | Default | Description |
|---|---|---|
| `CLAUDE_USAGE_PG_PASSWORD` | — | **Required.** Postgres writer role password |
| `CLAUDE_USAGE_PG_RO_PASSWORD` | — | **Required.** Read-only role password (used by server) |
| `CLAUDE_USAGE_PG_HOST` | `127.0.0.1` | Postgres host |
| `CLAUDE_USAGE_PG_PORT` | `5433` | Postgres port |
| `CLAUDE_USAGE_PG_DATABASE` | `claude_usage` | Database name |
| `CLAUDE_USAGE_PG_USER` | `claude_usage` | Writer role username |
| `CLAUDE_USAGE_PG_RO_USER` | `claude_usage_ro` | Read-only role username |
| `CLAUDE_USAGE_SERVER_PORT` | `8503` | Port the Express server listens on |
| `TRUEMEMORY_DB_PATH` | `~/.truememory/memories.db` | Absolute path to TrueMemory SQLite file |
| `TRUEMEMORY_LOG_PATH` | `~/.truememory/logs/mcp-debug.log` | Absolute path to TrueMemory debug log |
| `MATVIEW_REFRESH_MS` | `30000` | Materialized view refresh interval (ms) |
| `TM_MIRROR_POLL_MS` | `300000` | SQLite poll interval (ms) |

Full list with descriptions is in `.env.example`.

---

## Prerequisites

- **Docker** (Desktop or Engine)
- **Node.js 18+** (built and tested on 24)
- A running **TrueMemory** install with a populated `~/.truememory/memories.db`
- **Optional — Themes page only:** Python 3.13 with `numpy`, `psycopg`, `umap-learn`, `scikit-learn`

---

## Notes

**Naming:** The Postgres database, roles, and `CLAUDE_USAGE_PG_*` env vars carry the `claude_usage*` prefix for historical reasons — this dashboard was extracted from a broader usage tracker. They are plain identifiers and have no functional significance. Renaming them is a tracked follow-up; it is not required to run the dashboard.

**Instrumentation dependency:** The operations, encoding-gate, and open-loops pages consume diagnostic events emitted by TrueMemory to `mcp-debug.log`. Without those events the pages will render empty. See `instrumentation/TRUEMEMORY-INSTRUMENTATION.md` for the data contract and how to enable emission on the TrueMemory side.

---

## License

License: TBD — see repository owner.
