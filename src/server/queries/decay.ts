/**
 * Decay panels — 4-panel grid for the Aging tab (04-aging.html).
 * See ./types.ts for MemoryDecayPanels + DecayHistBucket + DecayScatterPoint.
 */
import type { MemoryDecayPanels, PgRunner } from './types.js';
import { intOrNull, num } from './types.js';

export async function getMemoryDecayPanels(client: PgRunner): Promise<MemoryDecayPanels> {
  // decay_histogram — 12 even bins on [0,1] of synthetic_decay.
  // synthetic_decay = 1 - exp(-days_since_retrieval / 14), clamped [0,1].
  // days_since_retrieval derived from last_retrieved_at falling back to created_at.
  const decayHistSql = `
    WITH decay_vals AS (
      SELECT
        GREATEST(0.0, LEAST(1.0,
          1.0 - EXP(
            -EXTRACT(EPOCH FROM (
              NOW() - COALESCE(last_retrieved_at, created_at)
            )) / 86400.0 / 14.0
          )
        )) AS synthetic_decay
      FROM tm_memories
      WHERE COALESCE(last_retrieved_at, created_at) IS NOT NULL
    ),
    bucketed AS (
      SELECT width_bucket(synthetic_decay, 0.0, 1.0, 12) AS bin
      FROM decay_vals
    )
    SELECT
      bin,
      -- midpoint of each bin: bin_index maps to (bin - 0.5) / 12
      ROUND(CAST((bin - 0.5) / 12.0 AS numeric), 3) AS bucket,
      COUNT(*) AS count
    FROM bucketed
    WHERE bin BETWEEN 1 AND 12
    GROUP BY bin, bucket
    ORDER BY bin
  `;

  // salience_histogram — 12 bins on [0,1] of tm_memories.salience (NULL → skip,
  // they don't map to a valid bin and width_bucket rejects out-of-range).
  const salienceHistSql = `
    WITH bucketed AS (
      SELECT width_bucket(LEAST(salience::numeric, 0.9999), 0.0, 1.0, 12) AS bin
      FROM tm_memories
      WHERE salience IS NOT NULL
        AND salience >= 0 AND salience <= 1
    )
    SELECT
      bin,
      ROUND(CAST((bin - 0.5) / 12.0 AS numeric), 3) AS bucket,
      COUNT(*) AS count
    FROM bucketed
    WHERE bin BETWEEN 1 AND 12
    GROUP BY bin, bucket
    ORDER BY bin
  `;

  // surprise_histogram — from tm_telemetry rows with signal='surprise' or
  // 'gate_decision' AND value_num IS NOT NULL. Clamped [0,1] then binned.
  // Returns empty array when telemetry has no such rows — frontend handles gracefully.
  const surpriseHistSql = `
    WITH surprise_vals AS (
      SELECT GREATEST(0.0, LEAST(1.0, value_num::float)) AS sv
      FROM tm_telemetry
      WHERE signal IN ('surprise', 'gate_decision')
        AND value_num IS NOT NULL
    ),
    bucketed AS (
      SELECT width_bucket(LEAST(sv::numeric, 0.9999), 0.0, 1.0, 12) AS bin
      FROM surprise_vals
      WHERE sv BETWEEN 0 AND 1
    )
    SELECT
      bin,
      ROUND(CAST((bin - 0.5) / 12.0 AS numeric), 3) AS bucket,
      COUNT(*) AS count
    FROM bucketed
    WHERE bin BETWEEN 1 AND 12
    GROUP BY bin, bucket
    ORDER BY bin
  `;

  // decay_age_scatter — up to 500 sampled rows.
  // is_outlier: decay >= 0.85 AND age_days >= 30.
  // age_days: days since created_at.
  const scatterSql = `
    SELECT
      id,
      ROUND(
        EXTRACT(EPOCH FROM (NOW() - COALESCE(last_retrieved_at, created_at))) / 86400.0
      )::int AS age_days,
      ROUND(GREATEST(0.0, LEAST(1.0,
        1.0 - EXP(
          -EXTRACT(EPOCH FROM (
            NOW() - COALESCE(last_retrieved_at, created_at)
          )) / 86400.0 / 14.0
        )
      ))::numeric, 4) AS decay
    FROM tm_memories
    WHERE COALESCE(last_retrieved_at, created_at) IS NOT NULL
    ORDER BY random()
    LIMIT 500
  `;

  const [decayHist, salienceHist, surpriseHist, scatter] = await Promise.all([
    client.query(decayHistSql),
    client.query(salienceHistSql),
    client.query(surpriseHistSql),
    client.query(scatterSql),
  ]);

  return {
    decay_histogram: decayHist.rows.map((r) => ({
      bucket: num(r.bucket),
      count: intOrNull(r.count) ?? 0,
    })),
    salience_histogram: salienceHist.rows.map((r) => ({
      bucket: num(r.bucket),
      count: intOrNull(r.count) ?? 0,
    })),
    surprise_histogram: surpriseHist.rows.map((r) => ({
      bucket: num(r.bucket),
      count: intOrNull(r.count) ?? 0,
    })),
    decay_age_scatter: scatter.rows.map((r) => {
      const decay = num(r.decay);
      const age_days = intOrNull(r.age_days) ?? 0;
      return {
        id: intOrNull(r.id) ?? 0,
        age_days,
        decay,
        is_outlier: decay >= 0.85 && age_days >= 30,
      };
    }),
  };
}
