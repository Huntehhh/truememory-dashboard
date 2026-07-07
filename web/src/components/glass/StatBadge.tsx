import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * StatBadge — a small pill for numeric callouts, status flags, and inline stats.
 * DM Mono, small-caps eyebrow feel. Accent variants tint the fill lightly and
 * keep the border hairline; use `severity` for red/amber/green health signals.
 */
const statBadgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5',
    'font-mono text-[10px] font-medium uppercase tracking-widest',
    'border',
  ].join(' '),
  {
    variants: {
      tone: {
        neutral:
          'bg-[color:var(--surface)] border-[color:var(--glass-border)] text-ink-muted',
        navy:
          'bg-[color:color-mix(in_oklab,var(--navy)_8%,var(--surface))] border-[color:color-mix(in_oklab,var(--navy)_28%,transparent)] text-[color:var(--navy)]',
        gold:
          'bg-[color:color-mix(in_oklab,var(--gold)_10%,var(--surface))] border-[color:color-mix(in_oklab,var(--gold)_30%,transparent)] text-[color:var(--gold)]',
        sage:
          'bg-[color:color-mix(in_oklab,var(--sage)_10%,var(--surface))] border-[color:color-mix(in_oklab,var(--sage)_28%,transparent)] text-[color:var(--sage)]',
        red:
          'bg-[color:color-mix(in_oklab,var(--sev-red)_10%,var(--surface))] border-[color:color-mix(in_oklab,var(--sev-red)_28%,transparent)] text-[color:var(--sev-red)]',
        amber:
          'bg-[color:color-mix(in_oklab,var(--sev-amber)_10%,var(--surface))] border-[color:color-mix(in_oklab,var(--sev-amber)_28%,transparent)] text-[color:var(--sev-amber)]',
        green:
          'bg-[color:color-mix(in_oklab,var(--sev-green)_10%,var(--surface))] border-[color:color-mix(in_oklab,var(--sev-green)_28%,transparent)] text-[color:var(--sev-green)]',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
)

export interface StatBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statBadgeVariants> {}

export function StatBadge({
  className,
  tone,
  ...props
}: StatBadgeProps): React.ReactElement {
  return (
    <span className={cn(statBadgeVariants({ tone }), className)} {...props} />
  )
}
