/**
 * SQLite read-only helpers + in-process neighbor cache.
 *
 * All SQLite-touching code for the /api/memory/* endpoints lives here so
 * sibling query modules only depend on the exported functions below.
 * The cache module state (neighborCache, neighborCacheLoadPromise) is kept
 * at module scope — same singleton semantics as the pre-split file.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// SQLite read-only helper
// ---------------------------------------------------------------------------
// Matches the mirror's read-only discipline (readonly:true + fileMustExist:true
// + WAL + busy_timeout). Open-close on every call — SQLite open is sub-ms and
// keeping a long-lived connection would fight with the mirror's writer.

export function memoriesDbPath(): string {
  return process.env.TRUEMEMORY_DB_PATH ?? path.join(os.homedir(), '.truememory', 'memories.db');
}

export function openSourceDbRO(): Database.Database {
  const p = memoriesDbPath();
  const db = new Database(p, { readonly: true, fileMustExist: true });
  db.pragma('journal_mode=WAL');
  db.pragma('busy_timeout=5000');
  return db;
}

// ---------------------------------------------------------------------------
// Neighbor cache (module-level, 15-min TTL)
// ---------------------------------------------------------------------------
// The embedding matrix is small (~350 × 256 floats = ~360KB) so keeping it
// in-process is basically free. Cache invalidation: age > 15 min. Concurrent
// callers share a single in-flight reload via cacheLoadPromise.

export type NeighborCache = {
  ids: number[];             // memory ids, indexed by row in vecs
  idToRow: Map<number, number>; // memory id -> row index into vecs
  vecs: Float32Array;        // N * dim, row-major, L2-normalized
  dim: number;
  activeTable: string;
  loadedAt: number;
};

const NEIGHBOR_CACHE_TTL_MS = 15 * 60 * 1000;
let neighborCache: NeighborCache | null = null;
let neighborCacheLoadPromise: Promise<NeighborCache> | null = null;

function pickWinningVecTable(db: Database.Database): { vec_table: string; embedding_dim: number } | null {
  // vector_cache_registry.vector_count is the count of embeddings emitted for
  // each tier. Highest count wins — that's the actively-embedded tier.
  const row = db
    .prepare(
      `SELECT vec_table, embedding_dim, vector_count
         FROM vector_cache_registry
        ORDER BY vector_count DESC
        LIMIT 1`,
    )
    .get() as { vec_table: string | null; embedding_dim: number | null; vector_count: number | null } | undefined;
  if (!row || !row.vec_table || !row.embedding_dim || !row.vector_count) return null;
  return { vec_table: row.vec_table, embedding_dim: row.embedding_dim };
}

export async function buildNeighborCache(): Promise<NeighborCache> {
  const db = openSourceDbRO();
  try {
    const winner = pickWinningVecTable(db);
    if (!winner) {
      // No embeddings — empty cache (still valid, prevents thrashing).
      return {
        ids: [],
        idToRow: new Map(),
        vecs: new Float32Array(0),
        dim: 0,
        activeTable: '',
        loadedAt: Date.now(),
      };
    }
    const { vec_table, embedding_dim } = winner;
    const rowidsTable = `${vec_table}_rowids`;
    const chunksTable = `${vec_table}_vector_chunks00`;
    const slotBytes = embedding_dim * 4;

    const rowidRows = db
      .prepare(`SELECT rowid, chunk_id, chunk_offset FROM ${rowidsTable} ORDER BY rowid`)
      .all() as Array<{ rowid: number; chunk_id: number; chunk_offset: number }>;

    if (rowidRows.length === 0) {
      return {
        ids: [],
        idToRow: new Map(),
        vecs: new Float32Array(0),
        dim: embedding_dim,
        activeTable: vec_table,
        loadedAt: Date.now(),
      };
    }

    // Group by chunk_id so each chunk blob is fetched once.
    const byChunk = new Map<number, Array<{ rowid: number; offset: number }>>();
    for (const r of rowidRows) {
      let list = byChunk.get(r.chunk_id);
      if (!list) {
        list = [];
        byChunk.set(r.chunk_id, list);
      }
      list.push({ rowid: r.rowid, offset: r.chunk_offset });
    }

    const ids: number[] = [];
    const vecFlat = new Float32Array(rowidRows.length * embedding_dim);
    let writeRow = 0;

    const chunkStmt = db.prepare(`SELECT vectors FROM ${chunksTable} WHERE rowid = ?`);
    for (const [chunkId, entries] of byChunk) {
      const blobRow = chunkStmt.get(chunkId) as { vectors: Buffer | null } | undefined;
      if (!blobRow || !blobRow.vectors) continue;
      const blob = blobRow.vectors;
      for (const e of entries) {
        const start = e.offset * slotBytes;
        const end = start + slotBytes;
        if (end > blob.length) continue;
        // Copy the float32 slice into the pre-allocated flat buffer, and
        // L2-normalize as we go so runtime queries can use a plain dot.
        const view = new Float32Array(blob.buffer, blob.byteOffset + start, embedding_dim);
        let norm = 0;
        for (let j = 0; j < embedding_dim; j++) {
          const v = view[j] ?? 0;
          norm += v * v;
        }
        const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0;
        const base = writeRow * embedding_dim;
        for (let j = 0; j < embedding_dim; j++) {
          const v = view[j] ?? 0;
          vecFlat[base + j] = v * inv;
        }
        ids.push(e.rowid);
        writeRow++;
      }
    }

    // Trim vecFlat if any rows were skipped (e.g. offset out of range).
    let finalVecs: Float32Array;
    if (writeRow === rowidRows.length) {
      finalVecs = vecFlat;
    } else {
      finalVecs = new Float32Array(writeRow * embedding_dim);
      finalVecs.set(vecFlat.subarray(0, writeRow * embedding_dim));
    }

    const idToRow = new Map<number, number>();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === undefined) continue;
      idToRow.set(id, i);
    }

    return {
      ids,
      idToRow,
      vecs: finalVecs,
      dim: embedding_dim,
      activeTable: vec_table,
      loadedAt: Date.now(),
    };
  } finally {
    db.close();
  }
}

export async function getNeighborCache(): Promise<NeighborCache> {
  const now = Date.now();
  if (neighborCache && now - neighborCache.loadedAt < NEIGHBOR_CACHE_TTL_MS) {
    return neighborCache;
  }
  if (neighborCacheLoadPromise) return neighborCacheLoadPromise;
  neighborCacheLoadPromise = (async () => {
    try {
      const built = await buildNeighborCache();
      neighborCache = built;
      return built;
    } finally {
      neighborCacheLoadPromise = null;
    }
  })();
  return neighborCacheLoadPromise;
}

export function topKNeighbors(
  cache: NeighborCache,
  queryId: number,
  k: number,
): Array<{ id: number; distance: number }> {
  const dim = cache.dim;
  if (dim === 0 || cache.ids.length === 0) return [];
  const row = cache.idToRow.get(queryId);
  if (row === undefined) return [];
  const base = row * dim;

  // Score every row (vectors are L2-normalized so dot == cosine similarity).
  // 350 × 256 = 89,600 float mults — sub-millisecond in V8.
  const scores: Array<{ id: number; sim: number }> = [];
  const n = cache.ids.length;
  for (let i = 0; i < n; i++) {
    if (i === row) continue;
    const other = i * dim;
    let s = 0;
    for (let j = 0; j < dim; j++) {
      s += (cache.vecs[base + j] ?? 0) * (cache.vecs[other + j] ?? 0);
    }
    const otherId = cache.ids[i];
    if (otherId === undefined) continue;
    scores.push({ id: otherId, sim: s });
  }
  scores.sort((a, b) => b.sim - a.sim);
  return scores.slice(0, k).map((s) => ({
    id: s.id,
    // Clamp to [0, 2] then round for JSON cleanliness — cosine distance is
    // 1 - sim, sim ∈ [-1, 1], so distance ∈ [0, 2].
    distance: Math.max(0, Math.min(2, 1 - s.sim)),
  }));
}
