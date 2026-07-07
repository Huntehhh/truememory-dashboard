/**
 * Activity heatmap — daily count of memory_returned events from tm_telemetry.
 * See ./types.ts for MemoryActivityRow.
 */
import type { MemoryActivityRow, PgRunner } from './types.js';
import { intOrNull } from './types.js';

export async function getMemoryActivity(client: PgRunner, days: number): Promise<MemoryActivityRow[]> {
  const sql = `
    SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS count
    FROM tm_telemetry
    WHERE signal = 'memory_returned'
      AND ts >= NOW() - ($1::int || ' days')::interval
    GROUP BY day
    ORDER BY day
  `;
  const res = await client.query<{ day: string; count: number }>(sql, [days]);
  return res.rows.map((r) => ({ day: r.day, count: intOrNull(r.count) ?? 0 }));
}
