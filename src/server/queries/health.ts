/**
 * Health detail — three orthogonal signals about TrueMemory's live state:
 *
 *   1. Per-tier embed coverage from SQLite `vector_cache_registry`
 *      (tier_group, model_name, embedding_dim, vector_count, last_embedded_id,
 *      last_updated), joined against the live `messages` row count for a
 *      coverage %. Active tier = highest vector_count (ties → first row seen).
 *   2. `rebuild_status` full rows — live re-embed progress, usually empty.
 *   3. Filesystem probes for ~/.truememory/{model_server.status,
 *      model_server.port, backlog/, extracted/}. Missing files degrade
 *      gracefully — null / false, never a 500.
 *
 * SQLite + filesystem only — no PgRunner needed. See ./types.ts for
 * MemoryHealthDetail / HealthTier / RebuildStatusRow / ModelServerFsStatus.
 */
import type {
  HealthTier,
  MemoryHealthDetail,
  ModelServerFsStatus,
  RebuildStatusRow,
} from './types.js';
import { openSourceDbRO, memoriesDbPath } from './sqlite-ro.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Truncated content snippet cap for model_server.status. Small enough to keep
// the payload light, large enough to see a decoded JSON status blob if the
// upstream writer ever grows past a single word.
const STATUS_SNIPPET_MAX = 512;

function truememoryHomeDir(): string {
  // Derive from the same discipline sqlite-ro uses: TRUEMEMORY_DB_PATH may
  // point at an alternate memories.db, in which case the enclosing directory
  // is the truememory home. Otherwise default to ~/.truememory.
  const dbPath = memoriesDbPath();
  const dir = path.dirname(dbPath);
  if (dir && dir !== '.' && dir !== '/') return dir;
  return path.join(os.homedir(), '.truememory');
}

function tableExists(db: import('better-sqlite3').Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

function epochSecondsToIso(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return new Date(v * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// SQLite half — vector_cache_registry + rebuild_status + messages count.
// Wrapped in a single try so any per-table failure (missing column on an old
// install, etc.) degrades to empty arrays without taking down the endpoint.
// ---------------------------------------------------------------------------

function readSqliteHealth(): {
  tiers: HealthTier[];
  rebuild_status: RebuildStatusRow[];
} {
  let tiers: HealthTier[] = [];
  let rebuildStatus: RebuildStatusRow[] = [];

  try {
    const db = openSourceDbRO();
    try {
      const totalRow = db
        .prepare('SELECT COUNT(*) AS n FROM messages')
        .get() as { n: number } | undefined;
      const totalMessages = totalRow?.n ?? 0;

      if (tableExists(db, 'vector_cache_registry')) {
        const rows = db
          .prepare(
            `SELECT tier_group, model_name, embedding_dim, vector_count,
                    last_embedded_id, last_updated
               FROM vector_cache_registry`,
          )
          .all() as Array<{
          tier_group: string | null;
          model_name: string | null;
          embedding_dim: number | null;
          vector_count: number | null;
          last_embedded_id: number | null;
          last_updated: number | null;
        }>;

        // Active tier = highest vector_count. Ties resolve to the first row
        // (SQLite's implementation-defined order); acceptable for the two-row
        // registry we ship with today.
        let activeIdx = -1;
        let maxVectors = -1;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (!r) continue;
          const c = r.vector_count ?? 0;
          if (c > maxVectors) {
            maxVectors = c;
            activeIdx = i;
          }
        }

        tiers = rows.map((r, i) => {
          const vectors = r.vector_count ?? 0;
          // coverage_pct = vectors / total * 100, capped at 100 in case a
          // stale registry over-reports briefly. NULL when the corpus is
          // empty (avoid a divide-by-zero surprise on a cold DB).
          const coverage =
            totalMessages > 0 ? Math.min(100, (vectors / totalMessages) * 100) : null;
          return {
            tier: String(r.tier_group ?? ''),
            model: r.model_name,
            vectors,
            total_messages: totalMessages,
            coverage_pct: coverage,
            active: i === activeIdx && activeIdx !== -1,
            embedding_dim: r.embedding_dim,
            last_embedded_id: r.last_embedded_id,
            last_updated: epochSecondsToIso(r.last_updated),
          };
        });
      }

      if (tableExists(db, 'rebuild_status')) {
        const rows = db
          .prepare(
            `SELECT id, tier_group, target_tier, status, action,
                    total_messages, processed_messages, progress_pct,
                    eta_seconds, batch_size, throughput_ips, ram_pct, pressure,
                    error, started_at, completed_at, backup_path, last_heartbeat
               FROM rebuild_status
              ORDER BY started_at DESC, id DESC`,
          )
          .all() as Array<{
          id: number;
          tier_group: string;
          target_tier: string;
          status: string;
          action: string | null;
          total_messages: number | null;
          processed_messages: number | null;
          progress_pct: number | null;
          eta_seconds: number | null;
          batch_size: number | null;
          throughput_ips: number | null;
          ram_pct: number | null;
          pressure: number | null;
          error: string | null;
          started_at: number | null;
          completed_at: number | null;
          backup_path: string | null;
          last_heartbeat: number | null;
        }>;

        rebuildStatus = rows.map((r) => ({
          id: r.id,
          tier_group: r.tier_group,
          target_tier: r.target_tier,
          status: r.status,
          action: r.action,
          total_messages: r.total_messages,
          processed_messages: r.processed_messages,
          progress_pct: r.progress_pct,
          eta_seconds: r.eta_seconds,
          batch_size: r.batch_size,
          throughput_ips: r.throughput_ips,
          ram_pct: r.ram_pct,
          pressure: r.pressure,
          error: r.error,
          started_at: epochSecondsToIso(r.started_at),
          completed_at: epochSecondsToIso(r.completed_at),
          backup_path: r.backup_path,
          last_heartbeat: epochSecondsToIso(r.last_heartbeat),
        }));
      }
    } finally {
      db.close();
    }
  } catch {
    // SQLite unavailable — keep the endpoint alive with empty arrays instead
    // of surfacing a 500 for what's supposed to be a health check.
    tiers = [];
    rebuildStatus = [];
  }

  return { tiers, rebuild_status: rebuildStatus };
}

// ---------------------------------------------------------------------------
// Filesystem half — model_server.status + .port + backlog/ + extracted/.
// ---------------------------------------------------------------------------

async function readModelServerFs(tmHome: string): Promise<ModelServerFsStatus> {
  const status: ModelServerFsStatus = {
    status_file_exists: false,
    status_content: null,
    port_file_exists: false,
    port: null,
  };

  const statusPath = path.join(tmHome, 'model_server.status');
  try {
    const buf = await fs.readFile(statusPath, 'utf8');
    status.status_file_exists = true;
    const trimmed = buf.trim();
    // Snippet only — some writers dump verbose JSON; trim to a bounded window.
    status.status_content =
      trimmed.length > STATUS_SNIPPET_MAX ? trimmed.slice(0, STATUS_SNIPPET_MAX) : trimmed;
  } catch {
    // Missing / unreadable — leave defaults.
  }

  const portPath = path.join(tmHome, 'model_server.port');
  try {
    const buf = await fs.readFile(portPath, 'utf8');
    status.port_file_exists = true;
    const n = Number.parseInt(buf.trim(), 10);
    if (Number.isFinite(n) && n > 0 && n < 65536) {
      status.port = n;
    }
  } catch {
    // Missing / unreadable — leave defaults.
  }

  return status;
}

async function countFilesInDir(dir: string): Promise<number | null> {
  try {
    const entries = await fs.readdir(dir);
    return entries.length;
  } catch {
    // Directory missing / unreadable — null signals "unknown" without a 500.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export async function getMemoryHealthDetail(): Promise<MemoryHealthDetail> {
  const tmHome = truememoryHomeDir();

  // Run the SQLite side synchronously (better-sqlite3 is sync) and the FS side
  // as a parallel batch — three independent async reads with no shared state.
  const sqlite = readSqliteHealth();
  const [modelServer, backlogCount, extractedCount] = await Promise.all([
    readModelServerFs(tmHome),
    countFilesInDir(path.join(tmHome, 'backlog')),
    countFilesInDir(path.join(tmHome, 'extracted')),
  ]);

  return {
    tiers: sqlite.tiers,
    rebuild_status: sqlite.rebuild_status,
    model_server: modelServer,
    backlog_count: backlogCount,
    extracted_count: extractedCount,
  };
}
