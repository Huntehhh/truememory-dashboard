/**
 * Single-memory inspect endpoint — memory + entity/causal/timeline/landmark/
 * cluster connections + top-10 vector neighbors + optional raw embedding.
 * See ./types.ts for MemoryInspectResult and ./sqlite-ro.ts for the neighbor
 * cache helpers.
 */
import type { MemoryInspectResult, PgRunner } from './types.js';
import { intOrNull, numOrNull, tsToIso } from './types.js';
import { getNeighborCache, openSourceDbRO, topKNeighbors } from './sqlite-ro.js';

export async function getMemoryInspect(
  client: PgRunner,
  id: number,
  options: { includeVector: boolean },
): Promise<MemoryInspectResult> {
  // ---- 1. Memory (Postgres, cheap) ----
  const memRes = await client.query(
    `SELECT id, content, NULLIF(category, '') AS category,
            NULLIF(sender, '') AS sender, NULLIF(recipient, '') AS recipient,
            modality, emotional_valence, created_at, salience,
            last_retrieved_at, retrieval_count, embedding_dim
       FROM tm_memories
      WHERE id = $1`,
    [id],
  );
  const memRow = memRes.rows[0];
  if (!memRow) {
    return {
      memory: null,
      connections: {
        entities: [],
        causal_edges: [],
        fact_timeline: [],
        landmark_events: [],
        cluster: null,
      },
      neighbors: [],
      vector: null,
    };
  }
  const memory = {
    id: intOrNull(memRow.id) ?? id,
    content: String(memRow.content ?? ''),
    category: memRow.category == null ? null : String(memRow.category),
    sender: memRow.sender == null ? null : String(memRow.sender),
    recipient: memRow.recipient == null ? null : String(memRow.recipient),
    modality: memRow.modality == null ? null : String(memRow.modality),
    emotional_valence: numOrNull(memRow.emotional_valence),
    created_at: tsToIso(memRow.created_at),
    salience: numOrNull(memRow.salience),
    last_retrieved_at: tsToIso(memRow.last_retrieved_at),
    retrieval_count: intOrNull(memRow.retrieval_count) ?? 0,
    embedding_dim: intOrNull(memRow.embedding_dim),
  };

  // ---- 2. Connections (SQLite read-only, single open) ----
  const db = openSourceDbRO();
  let causalOtherIdsToLookup: number[] = [];
  let entities: MemoryInspectResult['connections']['entities'] = [];
  let causalRaw: Array<{
    id: number;
    cause_msg_id: number;
    effect_msg_id: number;
    relationship: string | null;
    confidence: number | null;
  }> = [];
  let factTimelineRaw: Array<{
    id: number;
    subject: string;
    fact: string;
    timestamp: string | null;
    superseded_by: number | null;
    entity_scope: string | null;
    valid_from: string | null;
    valid_to: string | null;
    status: string | null;
  }> = [];
  let landmarkRaw: Array<{
    id: number;
    event_name: string;
    timestamp: string | null;
    event_type: string | null;
    related_entities: string | null;
  }> = [];
  let clusterRow:
    | {
        cluster_id: number;
        noise: number;
        message_count: number | null;
        summary: string | null;
        session_range: string | null;
      }
    | undefined;
  try {
    // Entities — matched on sender name (LOWER + trim). Empty sender = skip.
    const senderKey = memory.sender ? memory.sender.trim().toLowerCase() : '';
    if (senderKey.length > 0) {
      entities = (db
        .prepare(
          `SELECT entity, message_count, traits, communication_style, topics,
                  relationships, updated_at
             FROM entity_profiles
            WHERE LOWER(TRIM(entity)) = ?
            LIMIT 5`,
        )
        .all(senderKey) as Array<{
        entity: string;
        message_count: number | null;
        traits: string | null;
        communication_style: string | null;
        topics: string | null;
        relationships: string | null;
        updated_at: string | null;
      }>).map((r) => ({
        entity: r.entity,
        message_count: r.message_count,
        traits: r.traits,
        communication_style: r.communication_style,
        topics: r.topics,
        relationships: r.relationships,
        updated_at: r.updated_at,
      }));
    }

    // Causal edges (either direction)
    causalRaw = db
      .prepare(
        `SELECT id, cause_msg_id, effect_msg_id, relationship, confidence
           FROM causal_edges
          WHERE cause_msg_id = ? OR effect_msg_id = ?
          LIMIT 20`,
      )
      .all(id, id) as typeof causalRaw;

    causalOtherIdsToLookup = causalRaw.map((r) =>
      r.cause_msg_id === id ? r.effect_msg_id : r.cause_msg_id,
    );

    // Fact timeline entries where this memory is the source.
    factTimelineRaw = db
      .prepare(
        `SELECT id, subject, fact, timestamp, superseded_by, entity_scope,
                valid_from, valid_to, status
           FROM fact_timeline
          WHERE source_message_id = ?
          LIMIT 20`,
      )
      .all(id) as typeof factTimelineRaw;

    // Landmark events tagged with this memory as source.
    landmarkRaw = db
      .prepare(
        `SELECT id, event_name, timestamp, event_type, related_entities
           FROM landmark_events
          WHERE source_message_id = ?
          LIMIT 20`,
      )
      .all(id) as typeof landmarkRaw;

    // Cluster membership + centroid metadata.
    clusterRow = db
      .prepare(
        `SELECT mc.cluster_id, mc.noise,
                cc.message_count, cc.summary, cc.session_range
           FROM message_clusters mc
           LEFT JOIN cluster_centroids cc ON cc.cluster_id = mc.cluster_id
          WHERE mc.message_id = ?
          LIMIT 1`,
      )
      .get(id) as typeof clusterRow;
  } finally {
    db.close();
  }

  // Batch-look-up previews for the causal edges' "other" ids.
  const causalPreviews = new Map<number, string>();
  if (causalOtherIdsToLookup.length > 0) {
    // Filter out this memory's own id (defensive — should never happen).
    const otherIds = Array.from(new Set(causalOtherIdsToLookup.filter((x) => x !== id)));
    if (otherIds.length > 0) {
      const previewRes = await client.query(
        `SELECT id, SUBSTR(content, 1, 100) AS preview
           FROM tm_memories
          WHERE id = ANY($1::bigint[])`,
        [otherIds],
      );
      for (const r of previewRes.rows) {
        const idNum = intOrNull(r.id);
        if (idNum === null) continue;
        causalPreviews.set(idNum, String(r.preview ?? ''));
      }
    }
  }

  const causalEdges: MemoryInspectResult['connections']['causal_edges'] = causalRaw.map((r) => {
    const direction: 'cause_of' | 'effect_of' = r.cause_msg_id === id ? 'cause_of' : 'effect_of';
    const otherId = direction === 'cause_of' ? r.effect_msg_id : r.cause_msg_id;
    return {
      id: r.id,
      direction,
      other_id: otherId,
      other_preview: causalPreviews.get(otherId) ?? '',
      relationship: r.relationship,
      confidence: numOrNull(r.confidence),
    };
  });

  const factTimeline: MemoryInspectResult['connections']['fact_timeline'] = factTimelineRaw.map(
    (r) => ({
      id: r.id,
      subject: r.subject,
      fact: r.fact,
      timestamp: r.timestamp,
      superseded_by: intOrNull(r.superseded_by),
      entity_scope: r.entity_scope,
      valid_from: r.valid_from,
      valid_to: r.valid_to,
      status: r.status,
    }),
  );

  const landmarks: MemoryInspectResult['connections']['landmark_events'] = landmarkRaw.map((r) => ({
    id: r.id,
    event_name: r.event_name,
    timestamp: r.timestamp,
    event_type: r.event_type,
    related_entities: r.related_entities,
  }));

  let cluster: MemoryInspectResult['connections']['cluster'] = null;
  if (clusterRow) {
    const memberCount = clusterRow.message_count ?? 0;
    // Spec: cluster_size = message_count - 1 (other members, excluding this).
    // Clamp at 0 to guard cluster_centroids being empty (LEFT JOIN → null).
    const clusterSize = Math.max(0, memberCount - 1);
    cluster = {
      cluster_id: clusterRow.cluster_id,
      noise: Boolean(clusterRow.noise),
      cluster_size: clusterSize,
      summary: clusterRow.summary,
      session_range: clusterRow.session_range,
    };
  }

  // ---- 3. Neighbors (in-process cache) ----
  const cache = await getNeighborCache();
  // The mirror derives tm_memories.embedding_dim from messages.embedding_separation
  // (the SEP-tier blob), which is often NULL for memories that DO have a real
  // basepro/edge embedding stored elsewhere in the vec_messages_* tables. When
  // the cache confirms the embedding exists, surface its dim so the frontend
  // knows to show the raw-vector loader button.
  if (memory.embedding_dim == null && cache.idToRow.has(id) && cache.dim > 0) {
    memory.embedding_dim = cache.dim;
  }
  const topIds = topKNeighbors(cache, id, 10);
  let neighbors: MemoryInspectResult['neighbors'] = [];
  if (topIds.length > 0) {
    const neighborIds = topIds.map((n) => n.id);
    const neighborRes = await client.query(
      `SELECT id, SUBSTR(content, 1, 100) AS preview, NULLIF(category, '') AS category
         FROM tm_memories
        WHERE id = ANY($1::bigint[])`,
      [neighborIds],
    );
    const previewMap = new Map<number, { preview: string; category: string | null }>();
    for (const r of neighborRes.rows) {
      const idNum = intOrNull(r.id);
      if (idNum === null) continue;
      previewMap.set(idNum, {
        preview: String(r.preview ?? ''),
        category: r.category == null ? null : String(r.category),
      });
    }
    neighbors = topIds.map((n) => {
      const meta = previewMap.get(n.id);
      return {
        id: n.id,
        distance: n.distance,
        preview: meta?.preview ?? '',
        category: meta?.category ?? null,
      };
    });
  }

  // ---- 4. Optional raw vector ----
  let vector: number[] | null = null;
  if (options.includeVector) {
    const row = cache.idToRow.get(id);
    if (row !== undefined && cache.dim > 0) {
      const base = row * cache.dim;
      const out = new Array<number>(cache.dim);
      for (let j = 0; j < cache.dim; j++) {
        out[j] = cache.vecs[base + j] ?? 0;
      }
      vector = out;
    }
  }

  return {
    memory,
    connections: {
      entities,
      causal_edges: causalEdges,
      fact_timeline: factTimeline,
      landmark_events: landmarks,
      cluster,
    },
    neighbors,
    vector,
  };
}
