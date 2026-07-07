/**
 * Fact timeline — SQLite `fact_timeline` grouped into supersession chains.
 *
 * Chain semantics: if X.superseded_by = Y, then Y is a NEWER version of X
 * (X was replaced by Y). Walking forward via superseded_by therefore
 * yields the chain oldest → newest. Chain "head" = a row that is not
 * referenced as any other row's superseded_by (nothing older points to it
 * via supersession, so it's the oldest in its chain). The chain tip
 * (newest) is flagged `active: true`.
 *
 * Rows are also cross-checked against the walk: any row not touched by a
 * forward walk from some head (dangling superseded_by pointing at a missing
 * row, or a cycle) is surfaced as a singleton chain — we never silently drop
 * a row. Table absent → { chains: [] }.
 *
 * SQLite-only endpoint — no PgRunner needed. See ./types.ts for
 * MemoryTimeline / FactTimelineChain / FactTimelineRow.
 */
import type { FactTimelineChain, FactTimelineRow, MemoryTimeline } from './types.js';
import { openSourceDbRO } from './sqlite-ro.js';

type RawTimelineRow = {
  id: number;
  subject: string;
  fact: string;
  source_message_id: number | null;
  timestamp: string | null;
  superseded_by: number | null;
  entity_scope: string | null;
  valid_from: string | null;
  valid_to: string | null;
  status: string | null;
};

function tableExists(db: import('better-sqlite3').Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

function toChainRow(r: RawTimelineRow, active: boolean): FactTimelineRow {
  return {
    id: r.id,
    subject: String(r.subject ?? ''),
    fact: String(r.fact ?? ''),
    source_message_id: r.source_message_id,
    timestamp: r.timestamp,
    superseded_by: r.superseded_by,
    entity_scope: r.entity_scope,
    valid_from: r.valid_from,
    valid_to: r.valid_to,
    status: r.status,
    active,
  };
}

export async function getMemoryTimeline(): Promise<MemoryTimeline> {
  const db = openSourceDbRO();
  try {
    if (!tableExists(db, 'fact_timeline')) return { chains: [] };

    const rows = db
      .prepare(
        `SELECT id, subject, fact, source_message_id, timestamp, superseded_by,
                entity_scope, valid_from, valid_to, status
           FROM fact_timeline
          ORDER BY COALESCE(timestamp, ''), id`,
      )
      .all() as RawTimelineRow[];

    // Index by id, and mark every id that appears as someone's superseded_by
    // (i.e., is referenced as a "successor" — a newer version of some older
    // row). Any row NOT in that set is a chain head (oldest of its chain).
    const byId = new Map<number, RawTimelineRow>();
    const referencedAsSuccessor = new Set<number>();
    for (const r of rows) {
      byId.set(r.id, r);
      if (r.superseded_by !== null && r.superseded_by !== undefined) {
        referencedAsSuccessor.add(r.superseded_by);
      }
    }

    const chains: FactTimelineChain[] = [];
    const consumed = new Set<number>();

    // Walk each head forward via superseded_by. Guard against cycles by
    // capping the walk at rows.length steps and by breaking on revisit.
    for (const head of rows) {
      if (referencedAsSuccessor.has(head.id)) continue; // not a head
      if (consumed.has(head.id)) continue;

      const chain: FactTimelineRow[] = [];
      let cur: RawTimelineRow | undefined = head;
      let guard = rows.length + 1;

      while (cur && guard-- > 0) {
        if (consumed.has(cur.id)) break;
        consumed.add(cur.id);
        chain.push(toChainRow(cur, false));
        const nextId = cur.superseded_by;
        if (nextId === null || nextId === undefined) break;
        const next = byId.get(nextId);
        if (!next) break; // dangling pointer — end of chain
        cur = next;
      }

      if (chain.length > 0) {
        // Mark the tip (newest) as active. If a cycle broke the walk mid-way
        // the tip is still the last row we visited, which is the honest answer.
        const tip = chain[chain.length - 1];
        if (tip) tip.active = true;
        chains.push({ subject: chain[0]?.subject ?? String(head.subject ?? ''), chain });
      }
    }

    // Rows not consumed by any head-walk (e.g. inside a cycle, or their head
    // was already merged into another chain via a dangling pointer). Surface
    // each as a singleton chain so no data is dropped.
    for (const r of rows) {
      if (consumed.has(r.id)) continue;
      consumed.add(r.id);
      chains.push({
        subject: String(r.subject ?? ''),
        chain: [toChainRow(r, r.superseded_by === null || r.superseded_by === undefined)],
      });
    }

    return { chains };
  } finally {
    db.close();
  }
}
