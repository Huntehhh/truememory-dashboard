/**
 * Express router for /api/meta/* — dashboard health / freshness endpoint.
 *
 * A single GET /status returns one aggregate JSON blob so the SPA can render
 * the "everything OK?" strip with one round-trip:
 *
 *   {
 *     data: {
 *       mirror:   { last_sync_at, lag_s, sources: { <name>: {last_synced_at, age_s, rows_mirrored} } },
 *       matviews: { age_s },
 *       sidecar:  { ok, detail? },
 *       server:   { uptime_s, version }
 *     }
 *   }
 *
 * All three probes run under Promise.allSettled — a Postgres blip or a downed
 * sidecar never fails the whole endpoint. The one hard cap is a 1s abort on the
 * sidecar HTTP health check so a dead process can't stretch the response.
 *
 * Conventions match createMemoryRouter:
 *   - GET only
 *   - Cache-Control: no-store
 *   - { data } envelope
 *   - 500 + { error } on unrecoverable failure via fail()
 */
import express, { type Request, type Response, type Router } from 'express';
import type { Client, Pool } from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { noStore, fail } from './route-helpers.js';

// M4-style PgRunner: accept either a Pool or a bare Client (shared with
// createMemoryRouter — see memory-routes.ts for the same shape).
type PgRunner = Pick<Client, 'query'> | Pool;

const SIDECAR_HEALTH_TIMEOUT_MS = 1_000;

export type MetaOptions = {
  /** Base URL of the simulator sidecar, e.g. http://127.0.0.1:8504. */
  sidecarBaseUrl: string;
  /** Absolute path to the repo root (for reading package.json version). */
  projectRoot: string;
};

type MirrorSource = {
  last_synced_at: string;
  age_s: number;
  rows_mirrored: number;
};

type MirrorSummary = {
  last_sync_at: string | null;
  lag_s: number | null;
  sources: Record<string, MirrorSource>;
};

type MatviewSummary = {
  age_s: number | null;
};

type SidecarSummary = {
  ok: boolean;
  detail?: string;
};

type ServerSummary = {
  uptime_s: number;
  version: string;
};

/** Cache the version at boot — package.json doesn't change under a running server. */
function loadVersion(projectRoot: string): string {
  try {
    const raw = readFileSync(path.join(projectRoot, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Per-source freshness from tm_mirror_state. The mirror writes one row per
 * source table ('messages', 'telemetry', 'mcp-debug.log', 'injections.log');
 * we return each source's age plus a top-level lag_s = the STALEST source's
 * age so the frontend can say "the mirror as a whole is at least this fresh."
 */
async function fetchMirror(pg: PgRunner): Promise<MirrorSummary> {
  const r = await pg.query<{
    source_table: string;
    last_synced_at: Date;
    rows_mirrored: string;
  }>(
    `SELECT source_table, last_synced_at, rows_mirrored
       FROM tm_mirror_state`,
  );

  const now = Date.now();
  const sources: Record<string, MirrorSource> = {};
  let stalest: { iso: string; age_s: number } | null = null;

  for (const row of r.rows) {
    // pg returns TIMESTAMPTZ as a Date object by default. Fall back defensively
    // in case a downstream type-parser override switches to string.
    const dt =
      row.last_synced_at instanceof Date
        ? row.last_synced_at
        : new Date(row.last_synced_at as unknown as string);
    const iso = dt.toISOString();
    const ms = dt.getTime();
    const age_s = Number.isFinite(ms) ? (now - ms) / 1000 : 0;

    sources[row.source_table] = {
      last_synced_at: iso,
      age_s,
      rows_mirrored: Number.parseInt(row.rows_mirrored, 10) || 0,
    };

    if (!stalest || age_s > stalest.age_s) {
      stalest = { iso, age_s };
    }
  }

  return {
    last_sync_at: stalest ? stalest.iso : null,
    lag_s: stalest ? stalest.age_s : null,
    sources,
  };
}

/**
 * "Age" of the matview layer. Postgres has no native "last REFRESHed at"
 * bookkeeping and the schema explicitly avoids adding a bookkeeping table
 * (per the task brief). The cheapest available signal is pg_stat_all_tables —
 * autovacuum eventually analyzes/vacuums after a REFRESH, and the newest of
 * those four timestamps is a lower bound on refresh recency. Returns null when
 * no timestamp exists yet (matview never populated / stats never ticked).
 */
async function fetchMatviews(pg: PgRunner): Promise<MatviewSummary> {
  const r = await pg.query<{ age_s: string | null }>(
    `SELECT EXTRACT(EPOCH FROM (NOW() - GREATEST(
              last_analyze,
              last_autoanalyze,
              last_vacuum,
              last_autovacuum
            )))::text AS age_s
       FROM pg_stat_all_tables
      WHERE relname = 'mv_memory_kpi'
      LIMIT 1`,
  );
  const first = r.rows[0];
  if (!first || first.age_s === null) return { age_s: null };
  const n = Number.parseFloat(first.age_s);
  return { age_s: Number.isFinite(n) ? n : null };
}

/**
 * 1-second-capped HEAD-of-life check on the simulator sidecar. Any failure
 * (network refuse, timeout, non-2xx) reduces to ok:false — a running dashboard
 * with a not-yet-started sidecar is the expected steady state today.
 */
async function fetchSidecar(baseUrl: string): Promise<SidecarSummary> {
  const trimmed = baseUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(`${trimmed}/health`, {
      signal: AbortSignal.timeout(SIDECAR_HEALTH_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    return { ok: false, detail: `status ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : '';
    // AbortSignal.timeout throws a TimeoutError (DOMException); connect refuse
    // shows up as an fetch TypeError with cause ECONNREFUSED. Both boil down to
    // "sidecar unreachable" from the dashboard's point of view.
    const detail = /timeout|abort/i.test(name) || /timeout|abort/i.test(msg) ? 'timeout' : 'down';
    return { ok: false, detail };
  }
}

export function createMetaRouter(pg: PgRunner, opts: MetaOptions): Router {
  const bootAt = Date.now();
  const version = loadVersion(opts.projectRoot);
  const router = express.Router();

  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const [mirrorR, matviewsR, sidecarR] = await Promise.allSettled([
        fetchMirror(pg),
        fetchMatviews(pg),
        fetchSidecar(opts.sidecarBaseUrl),
      ]);

      const mirror: MirrorSummary =
        mirrorR.status === 'fulfilled'
          ? mirrorR.value
          : { last_sync_at: null, lag_s: null, sources: {} };

      const matviews: MatviewSummary =
        matviewsR.status === 'fulfilled' ? matviewsR.value : { age_s: null };

      const sidecar: SidecarSummary =
        sidecarR.status === 'fulfilled'
          ? sidecarR.value
          : { ok: false, detail: 'probe failed' };

      const server: ServerSummary = {
        uptime_s: Math.floor((Date.now() - bootAt) / 1000),
        version,
      };

      noStore(res);
      res.json({
        data: { mirror, matviews, sidecar, server },
      });
    } catch (err) {
      // Only hit if Promise.allSettled itself throws (essentially unreachable);
      // the individual probe failures are handled above. fail() sends a clean
      // 500 without a stack trace, same as the other routers.
      fail(res, err);
    }
  });

  return router;
}
