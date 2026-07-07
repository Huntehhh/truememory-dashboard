import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Pill button — inks-on-cream in light, cream-on-ink in dark; ghost is text-only.
 * Radius sits at the pill token (9999px) so it reads consistent with nav items and badges.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium tracking-tight transition-all',
    'rounded-pill select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-1',
    'disabled:pointer-events-none disabled:opacity-40',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-ink text-bg-warm hover:opacity-90 active:opacity-80 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]',
        ghost:
          'text-ink hover:bg-[color:var(--surface-strong)]/60 active:bg-[color:var(--surface-strong)]',
        outline:
          'border border-[color:var(--line-strong)] text-ink hover:bg-[color:var(--surface)]',
        subtle:
          'bg-[color:var(--surface)] text-ink hover:bg-[color:var(--surface-strong)]',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
