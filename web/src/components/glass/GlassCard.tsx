import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * GlassCard — the base surface for every panel, KPI tile, feed row group,
 * and dialog interior. The three variants keep the visual system tight:
 *
 * - `default`  — translucent glass on ambient mesh (most content).
 * - `tinted`   — glass with a subtle accent wash + hairline border.
 *                Pick accent via prop (navy / gold / sage / tan).
 * - `strong`   — opaque, elevated glass for modals, dropdown menus,
 *                anything that must stay readable over noisy backgrounds.
 */

const glassCardVariants = cva(
  [
    'relative rounded-card border transition-colors',
    'backdrop-blur-[var(--blur-card)]',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-[color:var(--surface)] border-[color:var(--glass-border)] shadow-card',
        tinted:
          'bg-[color:var(--surface)] border-[color:var(--glass-border)] shadow-card',
        strong:
          'bg-[color:var(--surface-strong)] border-[color:var(--glass-border)] shadow-card',
      },
      padding: {
        none: 'p-0',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
    },
  },
)

export type GlassAccent = 'navy' | 'gold' | 'sage' | 'tan'

const ACCENT_STYLE: Record<GlassAccent, React.CSSProperties> = {
  navy: {
    backgroundColor: 'color-mix(in oklab, var(--navy) 6%, var(--surface))',
    borderColor: 'color-mix(in oklab, var(--navy) 24%, transparent)',
  },
  gold: {
    backgroundColor: 'color-mix(in oklab, var(--gold) 6%, var(--surface))',
    borderColor: 'color-mix(in oklab, var(--gold) 24%, transparent)',
  },
  sage: {
    backgroundColor: 'color-mix(in oklab, var(--sage) 6%, var(--surface))',
    borderColor: 'color-mix(in oklab, var(--sage) 24%, transparent)',
  },
  tan: {
    backgroundColor: 'color-mix(in oklab, var(--tan) 6%, var(--surface))',
    borderColor: 'color-mix(in oklab, var(--tan) 24%, transparent)',
  },
}

export interface GlassCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'>,
    VariantProps<typeof glassCardVariants> {
  /** Only meaningful for `variant="tinted"`. */
  accent?: GlassAccent
  as?: React.ElementType
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      className,
      variant,
      padding,
      accent = 'navy',
      as,
      style,
      ...props
    },
    ref,
  ) => {
    const Component = (as ?? 'div') as React.ElementType
    const tintedStyle =
      variant === 'tinted' ? { ...ACCENT_STYLE[accent], ...style } : style
    return (
      <Component
        ref={ref}
        style={tintedStyle}
        className={cn(glassCardVariants({ variant, padding }), className)}
        {...props}
      />
    )
  },
)
GlassCard.displayName = 'GlassCard'

export { glassCardVariants }
