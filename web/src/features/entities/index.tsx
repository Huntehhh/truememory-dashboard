import { AccentWord } from '@/components/glass/AccentWord'
import { GlassCard } from '@/components/glass/GlassCard'
import { PageHeader } from '@/components/glass/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityCard } from './EntityCard'
import { useEntities } from './hooks'

/**
 * Entities — grid of profile cards for every person / project / concept the
 * memory store has clustered from every mention across every session.
 *
 * Rows arrive pre-sorted by message_count DESC, entity ASC — the top card is
 * the most-mentioned name and gets an <AccentWord gold> flourish. Every JSON
 * column is rendered defensively inside <EntityCard/>; see that file for the
 * per-section shape checks.
 */

export default function EntitiesPage(): React.ReactElement {
  const q = useEntities()
  const rows = q.data?.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Understand"
        title={
          <>
            People, <AccentWord gold>witnessed.</AccentWord>
          </>
        }
        subtitle="Who TrueMemory has clustered from every mention across every session — traits, topics, style, and relationships, built continuously from what the store already knows."
      />

      {q.isError ? (
        <GlassCard variant="tinted" accent="tan" padding="md">
          <p className="text-sm text-ink">Couldn't load entity profiles.</p>
          <p className="mt-1 text-xs text-ink-muted">
            {q.error instanceof Error
              ? q.error.message
              : 'The API returned an error — retry once the server is reachable.'}
          </p>
        </GlassCard>
      ) : q.isLoading || !q.data ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <GlassCard variant="default" padding="lg">
          <p className="text-sm text-ink">No entity profiles yet.</p>
          <p className="mt-1 text-xs text-ink-muted">
            Profiles get built as TrueMemory clusters mentions across sessions.
            Once a name recurs enough, it lands here.
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((row, i) => (
            <EntityCard key={i} row={row} featured={i === 0} />
          ))}
        </div>
      )}
    </div>
  )
}
