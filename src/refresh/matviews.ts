/**
 * Materialized-view refresher for the TrueMemory dashboard Postgres.
 *
 * Two modes:
 *   - CLI: `node dist/refresh/matviews.js --once` — single pass, exit on done.
 *   - Loop: `node dist/refresh/matviews.js` — refresh every MATVIEW_REFRESH_MS
 *     (default 30s) forever. Logs per-view duration. One failed view does not
 *     skip the rest.
 *
 * Also exported as a library so the mirror can call `refreshMatviews(pg)` after
 * a successful mirror batch — refreshes only fire when there's new data.
 *
 * Concurrency choices per view:
 *   - Single-row buckets (kpi / operations) have a constant `bucket` unique
 *     index, so REFRESH CONCURRENTLY is valid and keeps readers live.
 *   - First refresh of a WITH NO DATA matview cannot be CONCURRENTLY — the
 *     loop falls back to plain REFRESH automatically (see catch below).
 */
import { Client } from 'pg';

/** Each entry says how to refresh one matview. */
type MatviewSpec = {
  name: string;
  concurrent: boolean;
};

const MATVIEWS: readonly MatviewSpec[] = [
  { name: 'mv_memory_kpi', concurrent: true },
  { name: 'mv_memory_by_category_30d', concurrent: true },
  { name: 'mv_memory_operations', concurrent: true },
];

/**
 * Refresh every matview. Errors on individual views are logged but never
 * thrown — so a fire-and-forget caller never crashes the parent.
 * Returns a per-view result list for callers that want to surface stats.
 */
export async function refreshMatviews(
  pg: Client,
): Promise<Array<{ name: string; ok: boolean; durationMs: number; error?: string }>> {
  // Transaction-free advisory lock to prevent concurrent refreshes when both
  // the mirror (fire-and-forget after a batch) and the standalone refresher
  // loop call this simultaneously. pg_try_advisory_lock returns false if
  // another session holds it — we skip gracefully and let the other do the work.
  const lockKey = 1_946_872_991; // hashtext('refresh-matviews') — fixed 32-bit value
  const lockRes = await pg.query<{ acquired: boolean }>(
    'SELECT pg_try_advisory_lock($1) AS acquired',
    [lockKey],
  );
  const acquired = lockRes.rows[0]?.acquired ?? false;
  if (!acquired) {
    return [];
  }
  let results: Array<{ name: string; ok: boolean; durationMs: number; error?: string }> = [];
  try {
    results = await _refreshMatviewsInner(pg);
  } finally {
    await pg.query('SELECT pg_advisory_unlock($1)', [lockKey]);
  }
  return results;
}

async function _refreshMatviewsInner(
  pg: Client,
): Promise<Array<{ name: string; ok: boolean; durationMs: number; error?: string }>> {
  const results: Array<{ name: string; ok: boolean; durationMs: number; error?: string }> = [];
  for (const mv of MATVIEWS) {
    const t0 = Date.now();
    try {
      const sql = mv.concurrent
        ? `REFRESH MATERIALIZED VIEW CONCURRENTLY ${mv.name}`
        : `REFRESH MATERIALIZED VIEW ${mv.name}`;
      await pg.query(sql);
      results.push({ name: mv.name, ok: true, durationMs: Date.now() - t0 });
    } catch (err) {
      // First-refresh of a WITH NO DATA matview cannot be CONCURRENTLY —
      // fall back to plain REFRESH automatically. Postgres error code 55000.
      const msg = err instanceof Error ? err.message : String(err);
      const isNotPopulated =
        /cannot refresh materialized view .* concurrently/i.test(msg) ||
        /CONCURRENTLY cannot be used when the materialized view is not populated/i.test(msg);
      if (mv.concurrent && isNotPopulated) {
        try {
          await pg.query(`REFRESH MATERIALIZED VIEW ${mv.name}`);
          results.push({ name: mv.name, ok: true, durationMs: Date.now() - t0 });
          continue;
        } catch (err2) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          results.push({ name: mv.name, ok: false, durationMs: Date.now() - t0, error: msg2 });
          continue;
        }
      }
      results.push({ name: mv.name, ok: false, durationMs: Date.now() - t0, error: msg });
    }
  }
  return results;
}

/** Stand-alone CLI entrypoint. Only runs when invoked directly. */
async function main(): Promise<void> {
  const PG_HOST = process.env.CLAUDE_USAGE_PG_HOST ?? '127.0.0.1';
  const PG_PORT = Number.parseInt(process.env.CLAUDE_USAGE_PG_PORT ?? '5433', 10);
  const PG_DATABASE = process.env.CLAUDE_USAGE_PG_DATABASE ?? 'claude_usage';
  const PG_USER = process.env.CLAUDE_USAGE_PG_USER ?? 'claude_usage';
  const PG_PASSWORD = process.env.CLAUDE_USAGE_PG_PASSWORD ?? '';
  const REFRESH_MS = Number.parseInt(process.env.MATVIEW_REFRESH_MS ?? '30000', 10);
  const RUN_ONCE = process.argv.includes('--once');

  if (!PG_PASSWORD) {
    console.error('[refresh] CLAUDE_USAGE_PG_PASSWORD env var is required (writer role)');
    process.exit(1);
  }

  const pg = new Client({
    host: PG_HOST,
    port: PG_PORT,
    database: PG_DATABASE,
    user: PG_USER,
    password: PG_PASSWORD,
  });
  await pg.connect();
  console.log(`[refresh] connected to postgres ${PG_HOST}:${PG_PORT}/${PG_DATABASE}`);

  const runOnce = async (): Promise<void> => {
    const t0 = Date.now();
    const results = await refreshMatviews(pg);
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    const totalMs = Date.now() - t0;
    console.log(`[refresh] cycle done in ${totalMs}ms — ok=${okCount} fail=${failCount}`);
    for (const r of results) {
      const tag = r.ok ? 'ok' : 'FAIL';
      const err = r.error ? ` :: ${r.error}` : '';
      console.log(`[refresh]   ${tag.padEnd(4)} ${r.name.padEnd(32)} ${String(r.durationMs).padStart(5)}ms${err}`);
    }
  };

  let running = true;
  const shutdown = async (sig: string): Promise<void> => {
    console.log(`[refresh] received ${sig}, draining...`);
    running = false;
    await pg.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  if (RUN_ONCE) {
    await runOnce();
    await pg.end();
    return;
  }

  while (running) {
    try {
      await runOnce();
    } catch (err) {
      console.error('[refresh] cycle threw:', err);
    }
    await new Promise((res) => setTimeout(res, REFRESH_MS));
  }
}

// Only run main() when invoked as a script — not on `import`.
const isMain = (() => {
  try {
    const here = new URL(import.meta.url).pathname.replace(/^\/+([A-Za-z]:)/, '$1');
    return process.argv[1] !== undefined && (process.argv[1] === here || process.argv[1].endsWith('matviews.js'));
  } catch {
    return false;
  }
})();

if (isMain) {
  void main();
}
