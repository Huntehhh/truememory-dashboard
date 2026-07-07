/**
 * Injections feed — tm_injections read-through for the injection log page.
 * See ./types.ts for MemoryInjectionRow.
 */
import type { MemoryInjectionRow, PgRunner } from './types.js';
import { intOrNull, tsToIso } from './types.js';

export async function getMemoryInjections(
  client: PgRunner,
  limit: number,
): Promise<MemoryInjectionRow[]> {
  const sql = `
    SELECT id, ts, hook, session_id, action, memory_count, char_count,
           query, preview, full_content, extra
      FROM tm_injections
     ORDER BY ts DESC, id DESC
     LIMIT $1::int
  `;
  const res = await client.query(sql, [limit]);
  return res.rows.map((r) => {
    // node-postgres parses JSONB into a JS value automatically. Guard against
    // arrays / primitives showing up in the column so the type stays honest.
    let extra: Record<string, unknown> | null = null;
    const raw = r.extra;
    if (raw !== null && raw !== undefined && typeof raw === 'object' && !Array.isArray(raw)) {
      extra = raw as Record<string, unknown>;
    }
    return {
      id: intOrNull(r.id) ?? 0,
      ts: tsToIso(r.ts),
      hook: String(r.hook ?? ''),
      session_id: r.session_id == null ? null : String(r.session_id),
      action: r.action == null ? null : String(r.action),
      memory_count: intOrNull(r.memory_count),
      char_count: intOrNull(r.char_count),
      query: r.query == null ? null : String(r.query),
      preview: r.preview == null ? null : String(r.preview),
      full_content: r.full_content == null ? null : String(r.full_content),
      extra,
    };
  });
}
