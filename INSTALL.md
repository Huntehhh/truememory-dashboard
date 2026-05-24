# Installation Guide

## Prerequisites

| Requirement | Notes |
|---|---|
| Docker (Desktop or Engine) | Any recent version |
| Node.js 18+ | Built and tested on 24 |
| TrueMemory (running, populated) | `~/.truememory/memories.db` must exist |
| Python 3.13 + `numpy psycopg umap-learn scikit-learn` | Optional — Themes page only |

---

## Step 1 — Configure environment

```sh
cp .env.example .env
```

Open `.env` and set the two required variables:

```
CLAUDE_USAGE_PG_PASSWORD=<choose a strong password for the writer role>
CLAUDE_USAGE_PG_RO_PASSWORD=<choose a separate strong password for the read-only role>
```

Everything else in `.env` has working defaults. Check `TRUEMEMORY_DB_PATH` if your TrueMemory database is not at the default location (`~/.truememory/memories.db`).

---

## Step 2 — Start Postgres and initialize the schema

```sh
docker compose up -d
```

This starts a single container (`truememory-dashboard-pg`, `postgres:17.2-alpine`, published on `127.0.0.1:5433`). On first run, Docker executes every SQL file in `sql/init/` alphabetically. Those files create all `tm_*` tables, indexes, materialized views, and the read-only role. The database starts empty — no sample data ships with the repo. Your own TrueMemory data will populate it once the mirror is running.

Verify the container is healthy:

```sh
docker compose ps
```

---

## Step 3 — Rotate the read-only role password

The read-only role (`claude_usage_ro`) is created by the init SQL with a bootstrap password. You must update it to match the value you set in `.env`. Run this once after the first `docker compose up`:

```sh
docker exec truememory-dashboard-pg psql \
  -U claude_usage \
  -d claude_usage \
  -c "ALTER ROLE claude_usage_ro WITH PASSWORD '<your CLAUDE_USAGE_PG_RO_PASSWORD>';"
```

Replace `<your CLAUDE_USAGE_PG_RO_PASSWORD>` with the exact value from your `.env`. The Express server connects as this role; if the passwords do not match you will see 500 errors on every API route.

---

## Step 4 — Install dependencies and build

```sh
npm install
npm run build
```

This compiles the TypeScript source in `src/` to `dist/`.

---

## Step 5 — Start the processes

You need three core processes running simultaneously. Start each in its own terminal, or use the restart-on-crash loop wrappers in `scripts/` (Windows PowerShell only).

### Option A — npm scripts (cross-platform)

Terminal 1 — mirror (SQLite → Postgres sync, polls every 5 minutes):
```sh
npm run mirror
```

Terminal 2 — materialized view refresher (refreshes every 30 seconds):
```sh
npm run refresh-matviews
```

Terminal 3 — Express server:
```sh
npm run server
```

Optional — Themes (UMAP) page:
```sh
# Requires Python 3.13 + numpy, psycopg, umap-learn, scikit-learn
# Run under your preferred process manager
```

### Option B — PowerShell loop wrappers (Windows)

Each wrapper restarts its process on crash and writes to a local log file:

```powershell
# Each in its own PowerShell window
.\scripts\run-mirror-loop.ps1
.\scripts\run-refresh-loop.ps1
.\scripts\run-server-loop.ps1
.\scripts\run-themes-loop.ps1   # optional, Themes page only
```

### macOS / Linux process management

The `scripts/*.ps1` wrappers are Windows-only. On macOS or Linux, run the npm scripts under a process supervisor:

- **pm2:** `pm2 start "npm run mirror" --name tm-mirror` (repeat for refresh-matviews and server)
- **systemd:** write a unit file that calls `npm run <script>` from the repo directory
- **launchd:** use a `plist` pointing at `npm run <script>`

---

## Step 6 — Open the dashboard

```
http://127.0.0.1:8503/
```

The server redirects `/` to `/dashboard/memory/00-index.html`. From there all 10 pages are reachable.

---

## Available npm scripts

| Script | Description |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run mirror` | Start continuous mirror (5-min poll) |
| `npm run mirror:once` | Run a single mirror pass and exit |
| `npm run refresh-matviews` | Start continuous matview refresher (30-s interval) |
| `npm run refresh-matviews:once` | Refresh matviews once and exit |
| `npm run server` | Start the Express API server |

---

## Troubleshooting

### Dashboard pages are empty

**Most likely cause:** the mirror has not completed a pass yet, or `TRUEMEMORY_DB_PATH` points to the wrong file.

1. Check that `npm run mirror` (or `run-mirror-loop.ps1`) is running and has not exited with an error.
2. Run a single manual pass to see the output directly: `npm run mirror:once`
3. Confirm `TRUEMEMORY_DB_PATH` in `.env` resolves to a file that exists and is readable. The default `~/.truememory/memories.db` expands relative to the process home directory; set an absolute path if in doubt.
4. After a successful mirror pass, trigger a matview refresh: `npm run refresh-matviews:once`, then reload the page.

### 500 errors on every API route

**Most likely cause:** the read-only role password was not rotated in Step 3, or does not match `CLAUDE_USAGE_PG_RO_PASSWORD` in `.env`.

1. Re-run the `ALTER ROLE` command from Step 3 with the correct password.
2. Restart the Express server (`npm run server`).
3. If errors persist, confirm the server can reach Postgres: check `CLAUDE_USAGE_PG_HOST` and `CLAUDE_USAGE_PG_PORT` in `.env` match what `docker compose ps` reports.

### Operations, Encoding Gate, or Open Loops pages are empty

These pages consume diagnostic events that TrueMemory must be configured to emit. A stock TrueMemory install does not emit them by default. See `instrumentation/TRUEMEMORY-INSTRUMENTATION.md` for the data contract and how to enable instrumentation on the TrueMemory side.

### Themes (UMAP) page is blank

The UMAP computation requires Python 3.13 with `numpy`, `psycopg`, `umap-learn`, and `scikit-learn` installed. Confirm the Python deps are available and that `run-themes-loop.ps1` (or your equivalent process) is running and not erroring on import.

### Docker container fails to start

1. Check for port conflicts: `127.0.0.1:5433` must be free. If another Postgres is already bound there, change `CLAUDE_USAGE_PG_PORT` in `.env` and update the `docker-compose.yml` port mapping to match.
2. Run `docker compose logs truememory-dashboard-pg` to see the container's startup output.

### Schema init did not run

The `sql/init/` scripts run only on the first `docker compose up` against an empty data volume. If you need to re-initialize (e.g., after a schema change):

```sh
docker compose down -v        # removes the named volume — all data is lost
docker compose up -d          # re-creates volume and re-runs init scripts
```

Then repeat Steps 3–5.
