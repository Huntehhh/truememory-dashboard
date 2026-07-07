import { useQuery } from '@tanstack/react-query'
import { StatBadge } from '@/components/glass/StatBadge'
import { MetricTip } from '@/components/glass/MetricTip'
import { fetchJson } from '@/lib/api'
import { keys } from '@/lib/queryClient'
import { cn } from '@/lib/utils'

/**
 * `/api/meta/status` response — mirrors src/server/meta-routes.ts.
 * Kept exported so other features can reuse the type when the endpoint lands.
 * NOTE: as of 2026-07-07 the live 8503 server does NOT ship this route yet;
 * StatBar degrades to muted em-dashes on the 404. See fetchStatus() below.
 */
export interface StatusPayload {
  mirror: {
    last_sync_at: string | null
    lag_s: number | null
    sources: Record<
      string,
      { last_synced_at: string; age_s: number; rows_mirrored: number }
    >
  }
  matviews: {
    age_s: number | null
  }
  sidecar: {
    ok: boolean
    detail?: string
  }
  server: {
    uptime_s: number
    version: string
  }
}

interface StatusEnvelope {
  data: StatusPayload
}

/** ≥ this many seconds of lag counts as stale — matches the mirror poll cycle. */
const FRESH_SECS = 6 * 60

async function fetchStatus(): Promise<StatusPayload> {
  const r = await fetchJson<StatusEnvelope>('/api/meta/status')
  return r.data
}

/** `42s` / `4m` / `2h` / `1d` — em-dash on null/NaN. Compact enough for a chip. */
function fmtAge(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return '—'
  const n = Math.max(0, Math.floor(s))
  if (n < 60) return `${n}s`
  if (n < 3600) return `${Math.floor(n / 60)}m`
  if (n < 86400) return `${Math.floor(n / 3600)}h`
  return `${Math.floor(n / 86400)}d`
}

/**
 * TopBar backend-status strip — three compact chips (mirror / matviews /
 * sidecar) sourced from `/api/meta/status`. Every read is a graceful degrade:
 * retry:0 so a 404 doesn't storm the network, refetchInterval 60s so a route
 * that comes online later self-heals, refetchOnWindowFocus:false so refocus
 * doesn't kick off a redundant probe. On error every chip renders as a muted
 * em-dash with the "unavailable" title — no console spam because ApiError is
 * caught by React Query and stashed as `q.error`.
 */
export function StatusBar(): React.ReactElement {
  const q = useQuery({
    queryKey: keys.meta.status(),
    queryFn: fetchStatus,
    retry: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })

  const degraded = q.isError || !q.data
  const data = q.data

  const mirrorFresh =
    !degraded &&
    data !== undefined &&
    data.mirror.lag_s !== null &&
    data.mirror.lag_s < FRESH_SECS
  const matviewsFresh =
    !degraded &&
    data !== undefined &&
    data.matviews.age_s !== null &&
    data.matviews.age_s < FRESH_SECS
  const sidecarOk = !degraded && data !== undefined && data.sidecar.ok

  const mirrorLabel = degraded || !data ? '—' : fmtAge(data.mirror.lag_s)
  const matviewsLabel = degraded || !data ? '—' : fmtAge(data.matviews.age_s)
  const sidecarLabel = degraded ? '—' : sidecarOk ? 'ok' : 'offline'

  const mirrorTone: 'neutral' | 'sage' | 'amber' = degraded
    ? 'neutral'
    : mirrorFresh
      ? 'sage'
      : 'amber'
  const matviewsTone: 'neutral' | 'sage' | 'amber' = degraded
    ? 'neutral'
    : matviewsFresh
      ? 'sage'
      : 'amber'
  const sidecarTone: 'neutral' | 'sage' = degraded
    ? 'neutral'
    : sidecarOk
      ? 'sage'
      : 'neutral'

  const chipTitle = degraded ? 'status endpoint unavailable' : undefined

  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={degraded ? 'Backend status (unavailable)' : 'Backend status'}
    >
      <MetricTip
        id="status.mirrorLag"
        className="[&>svg]:hidden"
        label={
          <StatBadge tone={mirrorTone} title={chipTitle}>
            <Dot tone={mirrorTone} />
            <span>mirror {mirrorLabel}</span>
          </StatBadge>
        }
      />
      <MetricTip
        id="status.matviews"
        className="[&>svg]:hidden"
        label={
          <StatBadge tone={matviewsTone} title={chipTitle}>
            <Dot tone={matviewsTone} />
            <span>views {matviewsLabel}</span>
          </StatBadge>
        }
      />
      <MetricTip
        id="status.sidecar"
        className="[&>svg]:hidden"
        label={
          <StatBadge tone={sidecarTone} title={chipTitle}>
            <Dot tone={sidecarTone} />
            <span>sidecar {sidecarLabel}</span>
          </StatBadge>
        }
      />
    </div>
  )
}

/**
 * Tiny state dot pairing with each chip. Sits inside the StatBadge before the
 * text so the chip reads as one visual unit (dot + label) rather than a
 * plain text pill.
 */
function Dot({
  tone,
}: {
  tone: 'neutral' | 'sage' | 'amber'
}): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 rounded-full',
        tone === 'sage' && 'bg-[color:var(--sage)]',
        tone === 'amber' && 'bg-[color:var(--sev-amber)]',
        tone === 'neutral' && 'bg-[color:var(--line-strong)]',
      )}
      aria-hidden
    />
  )
}
