import * as React from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-[color:var(--line)]',
        className,
      )}
      {...props}
    />
  )
}
