import * as React from 'react'
import { AccentWord } from '@/components/glass/AccentWord'
import { PageHeader } from '@/components/glass/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReviewQueueTab } from './ReviewQueueTab'
import { DirectivesTab } from './DirectivesTab'
import { Toaster } from './Toaster'
import { ToastProvider } from './ToastContext'

/**
 * Curation Studio — the operate-side surface for pruning the memory store.
 *
 * Two tabs:
 *   • Review Queue — client-side junk heuristics over /api/memory/feed,
 *                    with two-phase forget + re-categorize confirms.
 *   • Directives   — the standing-instruction list, add composer, and
 *                    two-phase delete confirms.
 *
 * Every write goes through the sidecar's confirm-token flow so a mis-click
 * can never destroy a memory in one step. Every action is audit-logged on
 * the sidecar side (~/.truememory/logs/curation-audit.jsonl) — nothing this
 * page does is silently irreversible.
 */

type TabValue = 'review' | 'directives'

export default function CurationPage(): React.ReactElement {
  const [tab, setTab] = React.useState<TabValue>('review')

  return (
    <ToastProvider>
      <div className="flex flex-col gap-4">
        <PageHeader
          eyebrow="Operate"
          title={
            <>
              Curation <AccentWord gold>studio.</AccentWord>
            </>
          }
          subtitle="Review flagged memories, prune stale directives, and re-categorize misfiled writes. Every destructive action is two-phase — preview shows exactly what dies (plus its closest neighbors) before a short-lived token authorizes the change."
        />

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabValue)}
          className="flex flex-col gap-4"
        >
          <TabsList aria-label="Curation tabs">
            <TabsTrigger value="review">Review queue</TabsTrigger>
            <TabsTrigger value="directives">Directives</TabsTrigger>
          </TabsList>
          <TabsContent value="review">
            <ReviewQueueTab />
          </TabsContent>
          <TabsContent value="directives">
            <DirectivesTab />
          </TabsContent>
        </Tabs>

        <Toaster />
      </div>
    </ToastProvider>
  )
}
