import { Skeleton } from '@/components/ui/skeleton'

/**
 * Suspense fallback for lazy-loaded feature routes.
 * A couple of glassy shimmer blocks so the layout doesn't jump on route change.
 */
export function RouteFallback(): React.ReactElement {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}
