import * as React from 'react'
import { Eyebrow } from './Eyebrow'
import { cn } from '@/lib/utils'

/**
 * PageHeader — every page top opens with:
 *   Eyebrow (nav group)
 *   H1 (title, may include an <AccentWord /> child)
 *   optional subtitle slot
 *   optional right-side actions slot
 */
export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
  ...props
}: PageHeaderProps): React.ReactElement {
  return (
    <header
      className={cn('flex flex-col gap-3 pb-6 md:flex-row md:items-end md:justify-between', className)}
      {...props}
    >
      <div className="flex flex-col gap-1.5">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}
