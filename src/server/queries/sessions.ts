/**
 * Sessions feed — SQLite `episodes` + `landmark_events` merged into a single
 * chronological payload.
 *
 * Both sub-lists are returned newest-first (episodes by start_time DESC,
 * landmarks by timestamp DESC). ?limit clamps EACH list independently — an
 * un-bounded landmark table (~50+ rows) shouldn't force the frontend to
 * paginate episodes (~24 rows) too. Missing `limit` returns every row from
 * both tables.
 *
 * related_entities on landmark rows is JSON-in-text (`["hunter", "Amazon"]`);
 * we parse defensively — success → array, failure → raw string, empty → null.
 * Either table absent → that half is [].
 *
 * SQLite-only endpoint — no PgRunner needed. See ./types.ts for MemorySessions
 * / EpisodeRow / LandmarkEventRow.
 */
import type { EpisodeRow, LandmarkEventRow, MemorySessions } from './types.js';
import { openSourceDbRO } from './sqlite-ro.js';

function tableExists(db: import('better-sqlite3').Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

function parseJsonDefensively(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

export async function getMemorySessions(limit?: number): Promise<MemorySessions> {
  const db = openSourceDbRO();
  try {
    let episodes: EpisodeRow[] = [];
    if (tableExists(db, 'episodes')) {
      // ORDER by start_time DESC, then id DESC as a stable tiebreaker for
      // rows sharing a timestamp (or a NULL start_time, which sorts last).
      const baseSql = `SELECT id, start_time, end_time, message_count, summary
                         FROM episodes
                        ORDER BY start_time DESC, id DESC`;
      const rawRows = (limit !== undefined
        ? db.prepare(`${baseSql} LIMIT ?`).all(limit)
        : db.prepare(baseSql).all()) as Array<{
        id: number;
        start_time: string | null;
        end_time: string | null;
        message_count: number | null;
        summary: string | null;
      }>;
      episodes = rawRows.map((r) => ({
        id: r.id,
        start_time: r.start_time,
        end_time: r.end_time,
        message_count: r.message_count,
        // Column stores '' for the empty case in TrueMemory — surface a null
        // instead so the frontend can render "no summary" cleanly.
        summary: r.summary === null || r.summary === '' ? null : r.summary,
      }));
    }

    let landmarks: LandmarkEventRow[] = [];
    if (tableExists(db, 'landmark_events')) {
      const baseSql = `SELECT id, event_name, timestamp, event_type,
                              related_entities, source_message_id
                         FROM landmark_events
                        ORDER BY timestamp DESC, id DESC`;
      const rawRows = (limit !== undefined
        ? db.prepare(`${baseSql} LIMIT ?`).all(limit)
        : db.prepare(baseSql).all()) as Array<{
        id: number;
        event_name: string;
        timestamp: string | null;
        event_type: string | null;
        related_entities: string | null;
        source_message_id: number | null;
      }>;
      landmarks = rawRows.map((r) => ({
        id: r.id,
        event_name: String(r.event_name ?? ''),
        timestamp: r.timestamp,
        event_type: r.event_type,
        related_entities: parseJsonDefensively(r.related_entities),
        source_message_id: r.source_message_id,
      }));
    }

    return { episodes, landmarks };
  } finally {
    db.close();
  }
}
