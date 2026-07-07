import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * AccentWord — a single-word emphasis span (Libre Baskerville italic).
 * Use sparingly: one word inside a heading, brand mark, or callout.
 * Toggle `gold` to color it with the gold accent for the strongest emphasis.
 */
export interface AccentWordProps extends React.HTMLAttributes<HTMLSpanElement> {
  gold?: boolean
}

export function AccentWord({
  className,
  gold = false,
  ...props
}: AccentWordProps): React.ReactElement {
  return (
    <span
      className={cn(
        'font-serif italic tracking-tight',
        gold ? 'text-[color:var(--gold)]' : 'text-ink',
        className,
      )}
      {...props}
    />
  )
}
