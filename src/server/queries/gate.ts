/**
 * Encoding-gate endpoints — pass/reject summaries and rich session breakdown.
 * See ./types.ts for MemoryEncodingGate + GateRich.
 */
import type { GateRich, MemoryEncodingGate, PgRunner } from './types.js';
import { intOrNull, num, numOrNull } from './types.js';

export async function getMemoryEncodingGate(client: PgRunner): Promise<MemoryEncodingGate> {
  // Pass/reject rate from tm_telemetry.signal='gate_decision'.
  // reject_reasons groups by value_text where verdict != 'pass'.
  const summarySql = `
    SELECT
      SUM(CASE WHEN value_text = 'pass'   THEN 1 ELSE 0 END)::numeric AS pass_count,
      SUM(CASE WHEN value_text = 'reject' THEN 1 ELSE 0 END)::numeric AS reject_count,
      COUNT(*)::numeric                                               AS total
    FROM tm_telemetry
    WHERE signal IN ('gate_decision','gate_eval')
      AND ts >= NOW() - INTERVAL '30 days'
  `;
  const reasonsSql = `
    SELECT
      COALESCE(NULLIF(value_text, ''), '(unknown)') AS reason,
      COUNT(*)::int                                  AS count
    FROM tm_telemetry
    WHERE signal IN ('gate_decision','gate_eval')
      AND value_text IS NOT NULL
      AND value_text <> 'pass'
      AND ts >= NOW() - INTERVAL '30 days'
    GROUP BY reason
    ORDER BY count DESC
    LIMIT 10
  `;
  const [summary, reasons] = await Promise.all([client.query(summarySql), client.query(reasonsSql)]);
  const sRow = summary.rows[0] ?? {};
  const total = num(sRow.total);
  const passRate = total > 0 ? num(sRow.pass_count) / total : null;
  const rejectRate = total > 0 ? num(sRow.reject_count) / total : null;
  return {
    pass_rate: passRate,
    reject_rate: rejectRate,
    reject_reasons: reasons.rows.map((r) => ({
      reason: String(r.reason),
      count: intOrNull(r.count) ?? 0,
    })),
  };
}

const REASON_INTERPRETATIONS: Record<string, string> = {
  novelty_too_low: 'Too similar to existing memories.',
  salience_floor: 'Salience composite below threshold.',
  pred_error_low: 'Predicted-error signal too small to be surprising.',
  combined_below_threshold: 'Composite gate score did not clear minimum.',
  duplicate: 'Exact-match content already stored.',
};

export async function getMemoryGateRich(client: PgRunner): Promise<GateRich> {
  const summarySql = `
    SELECT
      COUNT(*) FILTER (WHERE value_text = 'pass') AS pass_count,
      COUNT(*) FILTER (WHERE value_text IS NOT NULL AND value_text <> 'pass') AS reject_count
    FROM tm_telemetry
    WHERE signal IN ('gate_decision', 'encoding_gate', 'gate_result')
      AND ts >= NOW() - INTERVAL '7 days'
  `;
  const reasonsSql = `
    SELECT COALESCE(value_text, 'unknown') AS reason_code, COUNT(*) AS count
    FROM tm_telemetry
    WHERE signal IN ('gate_decision', 'encoding_gate', 'gate_result')
      AND value_text IS NOT NULL AND value_text <> 'pass'
      AND ts >= NOW() - INTERVAL '7 days'
    GROUP BY value_text
    ORDER BY count DESC
    LIMIT 10
  `;
  const sessionSql = `
    SELECT raw_blob->>'session_id' AS session_id,
           SUM(CASE WHEN value_text = 'pass' THEN 1 ELSE 0 END)::float
             / NULLIF(COUNT(*), 0) AS pass_rate
    FROM tm_telemetry
    WHERE signal IN ('gate_decision', 'encoding_gate', 'gate_result')
      AND ts >= NOW() - INTERVAL '7 days'
      AND raw_blob ? 'session_id'
    GROUP BY raw_blob->>'session_id'
    ORDER BY MIN(ts) DESC
    LIMIT 30
  `;
  const [summary, reasons, sessions] = await Promise.all([
    client.query(summarySql),
    client.query(reasonsSql),
    client.query(sessionSql),
  ]);
  const sRow = summary.rows[0] ?? {};
  const passCount = num(sRow.pass_count);
  const rejectCount = num(sRow.reject_count);
  const total = passCount + rejectCount;
  const passRate = total > 0 ? passCount / total : 0;
  return {
    pass_rate: passRate,
    pass_count: passCount,
    reject_count: rejectCount,
    reject_reasons: reasons.rows.map((r) => {
      const code = String(r.reason_code);
      const count = num(r.count);
      return {
        reason_code: code,
        count,
        pct: rejectCount > 0 ? count / rejectCount : 0,
        interpretation: REASON_INTERPRETATIONS[code] ?? '',
      };
    }),
    session_pass_rates: sessions.rows.map((r) => numOrNull(r.pass_rate) ?? 0),
  };
}
