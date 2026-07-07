import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { PageHeader } from '@/components/glass/PageHeader'
import { StatBadge } from '@/components/glass/StatBadge'

/**
 * Placeholder page body used for every feature that hasn't landed yet.
 * Deliberately austere — a titled GlassCard w/ a phase chip and a nod at the
 * icon. Real page content replaces this per-feature in later phases.
 */
export interface ComingSoonProps {
  eyebrow?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  phase?: string
  icon?: LucideIcon
}

export function ComingSoon({
  eyebrow,
  title,
  subtitle,
  phase,
  icon: Icon,
}: ComingSoonProps): React.ReactElement {
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        actions={phase ? <StatBadge tone="gold">{phase}</StatBadge> : null}
      />
      <GlassCard variant="default" padding="lg" className="mt-2">
        <div className="flex items-start gap-4">
          {Icon ? (
            <div className="mt-0.5 rounded-pill border border-[color:var(--glass-border)] bg-[color:var(--surface-strong)] p-2 text-ink-muted">
              <Icon className="h-4 w-4" aria-hidden />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ink">
              This surface is stubbed.
            </p>
            <p className="max-w-xl text-sm text-ink-muted">
              The frontend foundation is in place — layout, tokens, primitives,
              and the API seam are ready. The feature-specific content lands
              {phase ? ` in ${phase}` : ' later'}.
            </p>
          </div>
        </div>
      </GlassCard>
    </>
  )
}
