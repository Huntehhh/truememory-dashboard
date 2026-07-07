import { StatBadge } from '@/components/glass/StatBadge'

/**
 * Status endpoint response shape — matches `/api/meta/status`.
 * Kept exported so downstream features can import the type once the endpoint is wired.
 */
export interface StatusPayload {
  mirror: {
    lag_s: number
  }
  matviews: {
    age_s: number
  }
  sidecar: {
    ok: boolean
  }
}

/**
 * Placeholder StatusBar — mirrors the future `/api/meta/status` fields as
 * greyed-out chips. Phase 2 wires the actual fetch + freshness color.
 */
export function StatusBar(): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5" aria-label="Backend status (placeholder)">
      <StatBadge tone="neutral" title="Mirror lag (placeholder)">
        mirror —
      </StatBadge>
      <StatBadge tone="neutral" title="Matview freshness (placeholder)">
        views —
      </StatBadge>
      <StatBadge tone="neutral" title="Sidecar reachability (placeholder)">
        sidecar —
      </StatBadge>
    </div>
  )
}
