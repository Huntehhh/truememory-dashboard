/**
 * Entities feed — SQLite `entity_profiles` read-through.
 *
 * The table is a small (~10 rows) reference set of who-said-what personas
 * TrueMemory has clustered. Four columns are JSON-encoded text (traits,
 * communication_style, topics, relationships) and we parse them defensively:
 * on parse success we return the parsed value, on parse failure we return
 * the raw string so the payload never silently drops data. Empty / null →
 * null. Table absent → [] (older installs may not have run the migration).
 *
 * SQLite-only endpoint — no PgRunner needed. See ./types.ts for the exported
 * EntityProfileRow shape.
 */
import type { EntityProfileRow } from './types.js';
import { openSourceDbRO } from './sqlite-ro.js';

/**
 * Try to parse a JSON string. On parse failure, hand back the original
 * string so downstream consumers can still see what was there. An empty
 * or null column returns JS null.
 */
function parseJsonDefensively(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Non-JSON text — surface it as-is rather than losing the data.
    return raw;
  }
}

function tableExists(db: import('better-sqlite3').Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

export async function getMemoryEntities(): Promise<EntityProfileRow[]> {
  const db = openSourceDbRO();
  try {
    // Older installs may lack the entity_profiles table entirely. Empty list
    // beats a 500 for a dashboard endpoint the frontend polls.
    if (!tableExists(db, 'entity_profiles')) return [];

    const rows = db
      .prepare(
        `SELECT entity, message_count, traits, communication_style, topics,
                relationships, updated_at
           FROM entity_profiles
          ORDER BY COALESCE(message_count, 0) DESC, entity ASC`,
      )
      .all() as Array<{
      entity: string;
      message_count: number | null;
      traits: string | null;
      communication_style: string | null;
      topics: string | null;
      relationships: string | null;
      updated_at: string | null;
    }>;

    return rows.map((r) => ({
      entity: String(r.entity ?? ''),
      message_count: r.message_count,
      traits: parseJsonDefensively(r.traits),
      communication_style: parseJsonDefensively(r.communication_style),
      topics: parseJsonDefensively(r.topics),
      relationships: parseJsonDefensively(r.relationships),
      updated_at: r.updated_at,
    }));
  } finally {
    db.close();
  }
}
