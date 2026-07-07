/**
 * API-tolerant types for the Gate page.
 *
 * Mirrored against live payloads on 2026-07-07:
 *   GET /api/memory/gate       — rich gate summary (7-day window)
 *   GET /api/memory/open-loops — signals with schema-but-no-runtime-data
 *
 * The gate endpoint currently returns zeros ({ pass_rate:0, pass_count:0,
 * reject_count:0, reject_reasons:[], session_pass_rates:[] }) because stock
 * TrueMemory doesn't emit `gate_decision` telemetry. The page's empty state
 * says what would light it up rather than showing a bogus 0% pass rate.
 *
 * open-loops returns 4 loops today (Supersession / Episodes / Landmarks /
 * Native surprise) — all `severity: 'warn' | 'info'`, `activation_count: 0`.
 */

/** GET /api/memory/gate — GateRich shape. */
export interface GateRejectReason {
  reason_code: string
  count: number
  /** Fraction of total rejects (0..1). */
  pct: number
  /** Human-readable explanation from a static server-side table; may be ''. */
  interpretation: string
}

export interface GatePayload {
  pass_rate: number
  pass_count: number
  reject_count: number
  reject_reasons: GateRejectReason[]
  session_pass_rates: number[]
}

export interface GateEnvelope {
  data: GatePayload
}

/** GET /api/memory/open-loops — signals that exist in schema but never fire. */
export interface OpenLoop {
  id: string
  tag: string
  title: string
  body: string
  activation: string
  /** Server emits 'crit' | 'warn' | 'info' but the type is intentionally
   *  broad — future severities land as strings without a client crash. */
  severity: string
  lane: string
  last_fired_at: string | null
  activation_count: number
}

export interface OpenLoopsPayload {
  loops: OpenLoop[]
}

export interface OpenLoopsEnvelope {
  data: OpenLoopsPayload
}
