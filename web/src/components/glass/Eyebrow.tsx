import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Eyebrow — the small, muted, DM Mono uppercase label that sits above every
 * section title. Consistent across the app so the visual rhythm reads as one system.
 */
export interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {}

export function Eyebrow({
  className,
  ...props
}: EyebrowProps): React.ReactElement {
  return (
    <span
      className={cn(
        'block font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted',
        className,
      )}
      {...props}
    />
  )
}
