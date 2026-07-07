/**
 * Open Loops tab — reads tm_open_loops (Postgres) surface for the dashboard.
 * See ./types.ts for OpenLoopCard + OpenLoopsResp.
 */
import type { OpenLoopsResp, PgRunner } from './types.js';
import { intOrNull, tsToIso } from './types.js';

// Gap 3: open loops now live in tm_open_loops (Postgres) instead of a static
// array. The dashboard frontend contract is unchanged: { loops: [...] } where
// each card has { id, tag, title, body, activation, lane, ... }.
// "tag" is aliased from the id column since render-memory.js reads l.tag.
export async function getMemoryOpenLoops(client: PgRunner): Promise<OpenLoopsResp> {
  const sql = `
    SELECT
      id,
      id                    AS tag,
      title,
      body,
      severity,
      lane,
      last_fired_at,
      activation_count,
      -- activation text stored in body; split convention: body ends with
      -- a paragraph starting "to activate:" — pass it through as-is so the
      -- frontend's existing l.activation rendering still works.
      -- We store activation separately in the table; expose it directly.
      COALESCE(activation_text, '') AS activation
    FROM tm_open_loops
    ORDER BY
      CASE severity WHEN 'crit' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
      id
  `;
  const res = await client.query(sql);
  return {
    loops: res.rows.map((r) => ({
      id: String(r.id),
      tag: String(r.tag),
      title: String(r.title),
      body: String(r.body),
      activation: String(r.activation),
      severity: String(r.severity),
      lane: String(r.lane),
      last_fired_at: tsToIso(r.last_fired_at),
      activation_count: intOrNull(r.activation_count) ?? 0,
    })),
  };
}
