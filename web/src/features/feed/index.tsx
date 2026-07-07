import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { PageHeader } from '@/components/glass/PageHeader'
import { AccentWord } from '@/components/glass/AccentWord'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryChips } from './CategoryChips'
import { LimitSelector } from './LimitSelector'
import { MemoryRow } from './MemoryRow'
import { useFeed, useFeedCategories } from './hooks'
import type { FeedLimit } from './types'

/**
 * Memory Feed — chronological stream with category filters + row limit.
 * Rows are read-only; a click on the body opens the Memory Inspector.
 */

export default function FeedPage(): React.ReactElement {
  const [limit, setLimit] = React.useState<FeedLimit>(200)
  const [category, setCategory] = React.useState<string | null>(null)

  const categories = useFeedCategories()
  const feed = useFeed(limit, category)

  const rows = feed.data?.data ?? []
  const shownCount = rows.length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Pulse"
        title={
          <>
            Memory <AccentWord gold>feed.</AccentWord>
          </>
        }
        subtitle="Chronological stream of writes across every session. Filter by category, expand a row to see it in full, click through to inspect."
      />

      <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Eyebrow>Filter</Eyebrow>
            <CategoryChips
              categories={categories.data?.data}
              active={category}
              onSelect={setCategory}
              isLoading={categories.isLoading}
            />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Eyebrow>Rows</Eyebrow>
            <LimitSelector value={limit} onChange={setLimit} />
          </div>
        </div>
        <FeedStatus
          category={category}
          shownCount={shownCount}
          totalCount={feed.data?.limit}
          isLoading={feed.isLoading}
          isFetching={feed.isFetching}
        />
      </GlassCard>

      {feed.isError ? (
        <GlassCard variant="tinted" accent="tan" padding="md">
          <p className="text-sm text-ink">Couldn't load the feed.</p>
          <p className="mt-1 text-xs text-ink-muted">
            {feed.error instanceof Error
              ? feed.error.message
              : 'The API returned an error — retry once the server is reachable.'}
          </p>
        </GlassCard>
      ) : feed.isLoading || !feed.data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <GlassCard variant="default" padding="lg">
          <p className="text-sm text-ink">No memories match this filter.</p>
          <p className="mt-1 text-xs text-ink-muted">
            Try clearing the category filter or raise the row limit.
          </p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <MemoryRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}

interface FeedStatusProps {
  category: string | null
  shownCount: number
  totalCount: number | undefined
  isLoading: boolean
  isFetching: boolean
}

function FeedStatus({
  category,
  shownCount,
  totalCount,
  isLoading,
  isFetching,
}: FeedStatusProps): React.ReactElement {
  const status = isLoading
    ? 'Loading…'
    : isFetching
      ? 'Refreshing…'
      : totalCount != null
        ? `Showing ${shownCount.toLocaleString()} of last ${totalCount.toLocaleString()}${category ? ` in ${category}` : ''}`
        : ''

  return (
    <p className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
      {status}
    </p>
  )
}
