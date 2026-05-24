/**
 * TrueMemory → Postgres mirror process.
 *
 * Reads ~/.truememory/memories.db (SQLite, sqlite-vec extension loaded by the
 * live MCP server but NOT required to read it) in strict read-only URI mode
 * and replicates three sources into the dashboard Postgres for the MEMORY dashboard
 * tab to consume:
 *
 *   - messages       → tm_memories       (rowid watermark)
 *   - telemetry      → tm_telemetry      (rowid watermark)
 *   - mcp-debug.log  → tm_log_events     (byte-offset watermark)
 *
 * Read-only discipline: a default-rw probe can corrupt a sibling sqlite file via
 * WAL state mismatch, so we never open the DB read-write.
 * Always: file:<path>?mode=ro URI, busy_timeout=5000, journal_mode=WAL pragma.
 *
 * Salience / last_retrieved_at / retrieval_count are NOT native messages
 * columns; they are derived from the telemetry signals (salience signal,
 * memory_returned events) at sync time. After every messages batch we
 * recompute the derived columns for the touched rowids — this is cheap (one
 * GROUP BY join per batch) and gives the dashboard ground-truth numbers
 * without a second polling layer.
 *
 * Embedding handling: messages.embedding_separation is a raw float32 blob.
 * For now we record its presence (embedding_dim) but skip the bytea write —
 * 350 rows × ~2KB each is harmless, but blobs in OLTP rows balloon the
 * mirror DB. If we ever need embeddings server-side, flip
 * MIRROR_STORE_EMBEDDINGS to true. Frontend UMAP can defer to compute
 * server-side later — start with category-as-cluster proxy.
 *
 * Cadence: 5-min poll. Pass --once for a single sync (cron / one-shot).
 * Logs to stdout (the loop wrapper redirects to a file).
 */
import Database from 'better-sqlite3';
import { Client } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TM_HOME = path.join(os.homedir(), '.truememory');
const MEMORIES_DB_PATH = process.env.TRUEMEMORY_DB_PATH ?? path.join(TM_HOME, 'memories.db');
const DEBUG_LOG_PATH = process.env.TRUEMEMORY_LOG_PATH ?? path.join(TM_HOME, 'logs', 'mcp-debug.log');

const PG_HOST = process.env.CLAUDE_USAGE_PG_HOST ?? '127.0.0.1';
const PG_PORT = Number.parseInt(process.env.CLAUDE_USAGE_PG_PORT ?? '5433', 10);
const PG_DATABASE = process.env.CLAUDE_USAGE_PG_DATABASE ?? 'claude_usage';
const PG_USER = process.env.CLAUDE_USAGE_PG_USER ?? 'claude_usage';
const PG_PASSWORD = process.env.CLAUDE_USAGE_PG_PASSWORD ?? '';

const POLL_INTERVAL_MS = Number.parseInt(process.env.TM_MIRROR_POLL_MS ?? '300000', 10); // 5 min
const BATCH_SIZE = Number.parseInt(process.env.TM_MIRROR_BATCH_SIZE ?? '5000', 10);
const LOG_TAIL_MAX_BYTES = Number.parseInt(process.env.TM_MIRROR_LOG_TAIL_MAX ?? '5242880', 10); // 5MB
// L5: MIRROR_STORE_EMBEDDINGS is a documented future-flag. When true, the
// mirror writes raw float32 embedding bytes into tm_memories.embedding BYTEA.
// No reader of that column exists in this codebase yet — the dashboard's UMAP
// clustering uses category as a cluster proxy instead. The flag is preserved
// for future use (e.g., server-side UMAP computation once embedding count
// justifies the storage cost). Default: false.
const MIRROR_STORE_EMBEDDINGS = (process.env.TM_MIRROR_STORE_EMBEDDINGS ?? 'false').toLowerCase() === 'true';

const RUN_ONCE = process.argv.includes('--once');

// ---------------------------------------------------------------------------
// Row shapes (mirrors SQLite native columns)
// ---------------------------------------------------------------------------

type MessageRow = {
  id: number;
  content: string;
  sender: string | null;
  recipient: string | null;
  timestamp: string | null;
  category: string | null;
  modality: string | null;
  emotional_valence: number | null;
  embedding_separation: Buffer | null;
};

type TelemetryRow = {
  id: number;
  ts: number | null;            // epoch seconds (float)
  pid: number | null;
  signal: string;
  memory_id: number | null;
  value_num: number | null;
  value_text: string | null;
  context_json: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoFromEpochFloat(epoch: number | null): string | null {
  if (epoch === null || epoch === undefined || !Number.isFinite(epoch)) return null;
  return new Date(epoch * 1000).toISOString();
}

function isoFromMessageTimestamp(raw: string | null): string | null {
  if (!raw) return null;
  // memories.db stores ISO-8601 with timezone (e.g. 2026-05-09T04:57:07.330948+00:00)
  // — pg accepts this verbatim. Verify it parses; otherwise drop to null.
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function laneForSignal(signal: string): string | null {
  // Lane taxonomy derived from truememory-viz views/{operations,encoding_gate,memory_aging}.py
  switch (signal) {
    case 'gate_decision':
    case 'gate_batch':
    case 'gate_eval':
      return 'gate';
    case 'memory_returned':
    case 'search_distance':
    case 'surprise_boost':
      return 'search';
    case 'salience':
    case 'embed_neighbor':
    case 'category':
    case 'surprise':
      return 'store';
    case 'forget':
    case 'consolidate':
    case 'model_unload':
      return 'lifecycle';
    case 'preload_start':
    case 'preload_complete':
    case 'diag_install':
    case 'heartbeat':
      return 'ops';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Watermark helpers
// ---------------------------------------------------------------------------

async function getWatermark(pg: Client, source: string): Promise<number> {
  const r = await pg.query<{ last_rowid: string }>(
    'SELECT last_rowid FROM tm_mirror_state WHERE source_table = $1',
    [source],
  );
  const first = r.rows[0];
  if (!first) return 0;
  const n = Number.parseInt(first.last_rowid, 10);
  return Number.isFinite(n) ? n : 0;
}

async function setWatermark(pg: Client, source: string, lastRowid: number, addedRows: number): Promise<void> {
  await pg.query(
    `INSERT INTO tm_mirror_state (source_table, last_rowid, last_synced_at, rows_mirrored)
       VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (source_table) DO UPDATE SET
       last_rowid = EXCLUDED.last_rowid,
       last_synced_at = NOW(),
       rows_mirrored = tm_mirror_state.rows_mirrored + EXCLUDED.rows_mirrored`,
    [source, lastRowid, addedRows],
  );
}

// ---------------------------------------------------------------------------
// Messages sync
// ---------------------------------------------------------------------------

function readMessagesBatch(db: Database.Database, afterRowid: number, limit: number): MessageRow[] {
  // Use rowid (the implicit SQLite primary key alias for `id` here) as the
  // watermark. messages.id IS INTEGER PRIMARY KEY AUTOINCREMENT, so rowid==id.
  // better-sqlite3 .all() returns unknown[]; single cast is sufficient — the
  // earlier `as unknown as MessageRow[]` double-cast hid the fact that no
  // runtime validation happens here.
  return db
    .prepare<[number, number]>(
      `SELECT
         id, content, sender, recipient, timestamp, category, modality,
         emotional_valence, embedding_separation
       FROM messages
       WHERE id > ?
       ORDER BY id
       LIMIT ?`,
    )
    .all(afterRowid, limit) as MessageRow[];
}

async function bulkUpsertMemories(pg: Client, rows: MessageRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = [
    'id', 'content', 'category', 'sender', 'recipient', 'modality',
    'emotional_valence', 'created_at', 'embedding_dim', 'embedding',
  ];

  const placeholders: string[] = [];
  const values: unknown[] = [];
  let p = 1;
  for (const r of rows) {
    const placeholderRow = cols.map(() => `$${p++}`).join(', ');
    placeholders.push(`(${placeholderRow})`);

    const embeddingBuf = r.embedding_separation;
    const embeddingDim = embeddingBuf ? Math.floor(embeddingBuf.length / 4) : null; // float32 = 4 bytes
    const embeddingValue = MIRROR_STORE_EMBEDDINGS ? embeddingBuf : null;

    values.push(
      r.id,
      r.content ?? '',
      r.category ?? null,
      r.sender ?? null,
      r.recipient ?? null,
      r.modality ?? null,
      r.emotional_valence ?? null,
      isoFromMessageTimestamp(r.timestamp),
      embeddingDim,
      embeddingValue,
    );
  }

  const sql = `
    INSERT INTO tm_memories (${cols.join(', ')})
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (id) DO UPDATE SET
      content           = EXCLUDED.content,
      category          = EXCLUDED.category,
      sender            = EXCLUDED.sender,
      recipient         = EXCLUDED.recipient,
      modality          = EXCLUDED.modality,
      emotional_valence = EXCLUDED.emotional_valence,
      created_at        = COALESCE(EXCLUDED.created_at, tm_memories.created_at),
      embedding_dim     = COALESCE(EXCLUDED.embedding_dim, tm_memories.embedding_dim),
      embedding         = COALESCE(EXCLUDED.embedding, tm_memories.embedding),
      mirrored_at       = NOW()
  `;
  const result = await pg.query(sql, values);
  return result.rowCount ?? 0;
}

/**
 * Recompute salience / last_retrieved_at / retrieval_count from telemetry
 * for the given memory ids. Cheap GROUP BY join — re-runs are idempotent.
 *
 * If telemetry hasn't been mirrored yet (or carries no signals for these
 * memories), the columns stay at their defaults: salience=NULL,
 * last_retrieved_at=NULL, retrieval_count=0.
 */
async function recomputeDerivedColumns(pg: Client, memoryIds: number[]): Promise<void> {
  if (memoryIds.length === 0) return;
  await pg.query(
    `WITH agg AS (
       SELECT
         memory_id,
         AVG(value_num) FILTER (WHERE signal = 'salience')             AS avg_salience,
         MAX(ts)        FILTER (WHERE signal = 'memory_returned')      AS last_returned,
         COUNT(*)       FILTER (WHERE signal = 'memory_returned')      AS ret_count
       FROM tm_telemetry
       WHERE memory_id = ANY($1::bigint[])
       GROUP BY memory_id
     )
     UPDATE tm_memories m SET
       salience          = agg.avg_salience,
       last_retrieved_at = agg.last_returned,
       retrieval_count   = COALESCE(agg.ret_count, 0)
     FROM agg
     WHERE m.id = agg.memory_id`,
    [memoryIds],
  );
}

async function syncMessages(db: Database.Database, pg: Client): Promise<number> {
  let watermark = await getWatermark(pg, 'messages');
  let totalAdded = 0;
  while (true) {
    const batch = readMessagesBatch(db, watermark, BATCH_SIZE);
    if (batch.length === 0) break;
    const inserted = await bulkUpsertMemories(pg, batch);
    totalAdded += inserted;
    const ids = batch.map((r) => r.id);
    await recomputeDerivedColumns(pg, ids);
    const last = batch[batch.length - 1];
    if (!last) break;
    watermark = last.id;
    await setWatermark(pg, 'messages', watermark, inserted);
    if (batch.length < BATCH_SIZE) break;
  }
  return totalAdded;
}

// ---------------------------------------------------------------------------
// Telemetry sync
// ---------------------------------------------------------------------------

function readTelemetryBatch(db: Database.Database, afterRowid: number, limit: number): TelemetryRow[] {
  // The telemetry table may not exist on older installs — caller guards.
  return db
    .prepare<[number, number]>(
      `SELECT id, ts, pid, signal, memory_id, value_num, value_text, context_json
       FROM telemetry
       WHERE id > ?
       ORDER BY id
       LIMIT ?`,
    )
    .all(afterRowid, limit) as TelemetryRow[];
}

async function bulkUpsertTelemetry(pg: Client, rows: TelemetryRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = ['id', 'ts', 'signal', 'lane', 'memory_id', 'value_num', 'value_text', 'raw_blob'];
  // raw_blob is a JSONB column. L2: cast it explicitly with $N::jsonb so
  // Postgres validates the JSON at insert time rather than relying on an
  // implicit text→jsonb coercion. All other columns are plain scalars.
  const RAW_BLOB_IDX = cols.indexOf('raw_blob'); // 7

  const placeholders: string[] = [];
  const values: unknown[] = [];
  let p = 1;
  for (const r of rows) {
    const placeholderRow = cols
      .map((_, idx) => (idx === RAW_BLOB_IDX ? `$${p++}::jsonb` : `$${p++}`))
      .join(', ');
    placeholders.push(`(${placeholderRow})`);

    const tsIso = isoFromEpochFloat(r.ts) ?? new Date().toISOString();
    let rawBlob: string | null = null;
    if (r.context_json) {
      // context_json is the SQLite-stored JSON literal — pass through to JSONB
      // (pg accepts the raw text and parses it server-side). Wrap an invalid
      // payload in a {raw: ...} envelope so the column type holds.
      try {
        JSON.parse(r.context_json);
        rawBlob = r.context_json;
      } catch {
        rawBlob = JSON.stringify({ raw: r.context_json });
      }
    }

    values.push(
      r.id,
      tsIso,
      r.signal,
      laneForSignal(r.signal),
      r.memory_id ?? null,
      r.value_num ?? null,
      r.value_text ?? null,
      rawBlob,
    );
  }

  const sql = `
    INSERT INTO tm_telemetry (${cols.join(', ')})
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (id) DO NOTHING
  `;
  const result = await pg.query(sql, values);
  return result.rowCount ?? 0;
}

function telemetryTableExists(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='telemetry'")
    .get() as { 1: number } | undefined;
  return Boolean(row);
}

async function syncTelemetry(db: Database.Database, pg: Client): Promise<{ added: number; touchedIds: Set<number> }> {
  if (!telemetryTableExists(db)) {
    return { added: 0, touchedIds: new Set() };
  }
  let watermark = await getWatermark(pg, 'telemetry');
  let totalAdded = 0;
  const touchedIds = new Set<number>();
  while (true) {
    const batch = readTelemetryBatch(db, watermark, BATCH_SIZE);
    if (batch.length === 0) break;
    const inserted = await bulkUpsertTelemetry(pg, batch);
    totalAdded += inserted;
    for (const r of batch) {
      if (typeof r.memory_id === 'number') touchedIds.add(r.memory_id);
    }
    const last = batch[batch.length - 1];
    if (!last) break;
    watermark = last.id;
    await setWatermark(pg, 'telemetry', watermark, inserted);
    if (batch.length < BATCH_SIZE) break;
  }
  return { added: totalAdded, touchedIds };
}

// ---------------------------------------------------------------------------
// mcp-debug.log sync
// ---------------------------------------------------------------------------

// Log format (truememory-viz/data/debug_log.py):
//   YYYY-MM-DD HH:MM:SS.mmm pid=N tid=N <signal> <body>
const LOG_LINE_RE = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d+)\s+pid=(\d+)\s+tid=(\d+)\s+(\S+)(?:\s+(.+))?$/;
const ELAPSED_RE = /(?:done in|total)\s+(\d+)ms/;
const ID_RE = /\bid=(\d+)\b/;

type LogEvent = {
  ts: string;
  level: string;
  event_type: string;
  phase: string | null;
  memory_id: number | null;
  duration_ms: number | null;
  message: string;
  raw_line: string;
  // L1: pid/tid captured from the log format header — stored for process
  // attribution (useful when multiple TrueMemory workers run in parallel).
  pid: number | null;
  tid: number | null;
};

function parseLogLine(line: string): LogEvent | null {
  // Windows logs use \r\n — strip the trailing \r before regex anchor match.
  // Otherwise the LOG_LINE_RE $ anchor fails on every line, silently dropping
  // the entire file. (Hit this in production on first sync — 4.4MB file
  // returned 0 events. Caught via diff-test.)
  const m = LOG_LINE_RE.exec(line.replace(/\r$/, ''));
  if (!m) return null;
  // L1: capture pid (group 3) and tid (group 4) for process attribution.
  const [, date, time, pidStr, tidStr, signal, bodyRaw] = m;
  if (!date || !time || !signal) return null;
  const pid = pidStr ? Number.parseInt(pidStr, 10) : null;
  const tid = tidStr ? Number.parseInt(tidStr, 10) : null;
  const body = bodyRaw ?? '';

  // Build ISO timestamp. Memories.db timestamps are UTC-suffixed but the log
  // is local-ish wall clock. Treat as UTC for stable comparisons — drift is
  // bounded by clock-skew. Better than nothing for the timeseries.
  const tsIso = new Date(`${date}T${time}Z`).toISOString();

  let phase: string | null = null;
  if (signal === 'store') {
    if (body.includes('ENTER')) phase = 'enter';
    else if (body.includes('EXIT')) phase = 'exit';
    else if (body.includes('m.add()')) phase = 'add';
    else if (body.includes('_get_memory')) phase = 'get_memory';
    else phase = 'other';
  }

  const elapsedMatch = ELAPSED_RE.exec(body);
  const duration = elapsedMatch && elapsedMatch[1] ? Number.parseInt(elapsedMatch[1], 10) : null;

  const idMatch = ID_RE.exec(body);
  const memoryId = idMatch && idMatch[1] ? Number.parseInt(idMatch[1], 10) : null;

  let level = 'info';
  if (/error|FAIL|exception/i.test(body)) level = 'error';
  else if (/warn/i.test(body)) level = 'warn';
  else if (signal === 'heartbeat') level = 'debug';

  return {
    ts: tsIso,
    level,
    event_type: signal,
    phase,
    memory_id: memoryId,
    duration_ms: Number.isFinite(duration) ? duration : null,
    message: body.slice(0, 200),
    raw_line: line.slice(0, 800),
    pid: Number.isFinite(pid) ? pid : null,
    tid: Number.isFinite(tid) ? tid : null,
  };
}

async function bulkInsertLogEvents(pg: Client, rows: LogEvent[]): Promise<number> {
  if (rows.length === 0) return 0;
  // L1: include pid/tid columns added by migration 07-log-events-pid-tid.sql.
  const cols = ['ts', 'level', 'event_type', 'phase', 'memory_id', 'duration_ms', 'message', 'raw_line', 'pid', 'tid'];
  const placeholders: string[] = [];
  const values: unknown[] = [];
  let p = 1;
  for (const r of rows) {
    const placeholderRow = cols.map(() => `$${p++}`).join(', ');
    placeholders.push(`(${placeholderRow})`);
    values.push(r.ts, r.level, r.event_type, r.phase, r.memory_id, r.duration_ms, r.message, r.raw_line, r.pid, r.tid);
  }
  const sql = `INSERT INTO tm_log_events (${cols.join(', ')}) VALUES ${placeholders.join(', ')}`;
  const result = await pg.query(sql, values);
  return result.rowCount ?? 0;
}

async function syncDebugLog(pg: Client): Promise<number> {
  let exists = false;
  try {
    await fs.access(DEBUG_LOG_PATH);
    exists = true;
  } catch {
    exists = false;
  }
  if (!exists) return 0;

  const stat = await fs.stat(DEBUG_LOG_PATH);
  let offset = await getWatermark(pg, 'mcp-debug.log');
  // Rotation detection — file shrank since last sync.
  if (stat.size < offset) offset = 0;
  // Tail-only safeguard: if we've never synced and the log is enormous,
  // start near the tail to avoid a 100-MB cold read.
  if (offset === 0 && stat.size > LOG_TAIL_MAX_BYTES) {
    offset = stat.size - LOG_TAIL_MAX_BYTES;
  }
  if (stat.size === offset) return 0;

  const fh = await fs.open(DEBUG_LOG_PATH, 'r');
  try {
    const length = stat.size - offset;
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, offset);
    const text = buf.toString('utf8');
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline === -1) return 0;
    const consumed = text.slice(0, lastNewline + 1);
    const lines = consumed.split('\n').filter((l) => l.trim().length > 0);
    const events: LogEvent[] = [];
    for (const line of lines) {
      const e = parseLogLine(line);
      if (e) events.push(e);
    }
    // Insert in chunks to keep statement size sane.
    let added = 0;
    const CHUNK = 1000;
    for (let i = 0; i < events.length; i += CHUNK) {
      added += await bulkInsertLogEvents(pg, events.slice(i, i + CHUNK));
    }
    const newOffset = offset + Buffer.byteLength(consumed, 'utf8');
    await setWatermark(pg, 'mcp-debug.log', newOffset, events.length);
    return added;
  } finally {
    await fh.close();
  }
}

// ---------------------------------------------------------------------------
// Tick orchestrator
// ---------------------------------------------------------------------------

type TickResult = { messages: number; telemetry: number; log: number; ok: boolean };

async function openSourceDb(): Promise<Database.Database> {
  // Read-only URI form is the only safe way to touch memories.db while the
  // MCP server holds a writer connection. See the
  // read-only-discipline memory.
  const db = new Database(MEMORIES_DB_PATH, { readonly: true, fileMustExist: true });
  db.pragma('journal_mode=WAL');
  db.pragma('busy_timeout=5000');
  return db;
}

async function tick(pg: Client): Promise<TickResult> {
  let db: Database.Database | null = null;
  try {
    db = await openSourceDb();
    const messagesAdded = await syncMessages(db, pg);
    const telResult = await syncTelemetry(db, pg);
    // After telemetry sync, refresh derived columns for any memory ids
    // that received new signals (catches retrieval updates for old
    // memories that didn't pass through the messages batch).
    if (telResult.touchedIds.size > 0) {
      await recomputeDerivedColumns(pg, Array.from(telResult.touchedIds));
    }
    const logAdded = await syncDebugLog(pg);
    return { messages: messagesAdded, telemetry: telResult.added, log: logAdded, ok: true };
  } catch (err) {
    console.error('[tm-mirror] tick failed:', err instanceof Error ? err.message : err);
    return { messages: 0, telemetry: 0, log: 0, ok: false };
  } finally {
    if (db) db.close();
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!PG_PASSWORD) {
    console.error('[tm-mirror] CLAUDE_USAGE_PG_PASSWORD env var is required');
    process.exit(1);
  }

  const pg = new Client({
    host: PG_HOST,
    port: PG_PORT,
    database: PG_DATABASE,
    user: PG_USER,
    password: PG_PASSWORD,
  });
  // Without a listener for the pg client's 'error' event, a transient
  // connection drop emits an unhandled-error stack and crashes the
  // process opaquely. Log + exit(1) lets the Startup wrapper restart us.
  pg.on('error', (err) => {
    console.error('[tm-mirror] pg client error, exiting for restart:', err);
    process.exit(1);
  });
  await pg.connect();
  console.log(`[tm-mirror] connected to postgres ${PG_HOST}:${PG_PORT}/${PG_DATABASE}`);
  console.log(`[tm-mirror] source db: ${MEMORIES_DB_PATH}`);
  console.log(`[tm-mirror] source log: ${DEBUG_LOG_PATH}`);

  let running = true;
  const shutdown = async (sig: string): Promise<void> => {
    console.log(`[tm-mirror] received ${sig}, draining...`);
    running = false;
    try {
      await pg.end();
    } catch {
      // best-effort
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  if (RUN_ONCE) {
    const r = await tick(pg);
    console.log(
      `[tm-mirror] one-shot: +${r.messages} messages, +${r.telemetry} telemetry, +${r.log} log events`,
    );
    await pg.end();
    return;
  }

  while (running) {
    try {
      const r = await tick(pg);
      if (r.messages > 0 || r.telemetry > 0 || r.log > 0) {
        console.log(
          `[tm-mirror] +${r.messages} messages, +${r.telemetry} telemetry, +${r.log} log events`,
        );
      }
    } catch (err) {
      console.error('[tm-mirror] loop fault:', err);
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }
}

void main();
